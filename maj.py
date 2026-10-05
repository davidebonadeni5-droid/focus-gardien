"""Mises à jour automatiques de FocusGardien.exe, sans rien réinstaller.

Au démarrage puis toutes les 6 heures, l'app regarde la dernière release du dépôt public.
Si elle est plus récente : téléchargement à côté de l'exe, échange des fichiers (Windows permet de
renommer un exe en cours d'exécution), lancement de la nouvelle version, puis l'ancienne se ferme.
"""

import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

DEPOT = "davidebonadeni5-droid/focus-gardien"
NOM_EXE = "FocusGardien.exe"
BASE = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))


def version_actuelle():
    """Numéro de build écrit par la CI dans version.txt ; « dev » quand on lance depuis le code."""
    try:
        return (BASE / "version.txt").read_text(encoding="utf-8").strip() or "dev"
    except OSError:
        return "dev"


def numero(version):
    try:
        return int(str(version).lstrip("v"))
    except ValueError:
        return -1


def derniere_release(timeout=10):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{DEPOT}/releases/latest",
        headers={"Accept": "application/vnd.github+json", "User-Agent": "FocusGardien"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.load(r)
    url = next((a["browser_download_url"] for a in data.get("assets", []) if a.get("name") == NOM_EXE), None)
    return data.get("tag_name", ""), url


def nouvelle_version():
    """(version, url) si une version plus récente existe, sinon None. Jamais d'erreur levée."""
    actuelle = version_actuelle()
    if not getattr(sys, "frozen", False) or actuelle == "dev":
        return None
    try:
        tag, url = derniere_release()
    except Exception:
        return None  # pas d'internet, GitHub indisponible… on réessaiera plus tard
    if url and numero(tag) > numero(actuelle):
        return tag.lstrip("v"), url
    return None


def installer(url):
    """Télécharge la nouvelle version, échange les fichiers et lance la nouvelle. True si c'est parti."""
    exe = Path(sys.executable)
    neuf = exe.with_name("FocusGardien.nouveau")
    vieux = exe.with_name("FocusGardien.ancien.exe")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "FocusGardien"})
        with urllib.request.urlopen(req, timeout=120) as r, open(neuf, "wb") as f:
            while bloc := r.read(1 << 16):
                f.write(bloc)
        with open(neuf, "rb") as f:
            if f.read(2) != b"MZ" or neuf.stat().st_size < 1_000_000:
                raise ValueError("fichier téléchargé invalide")
        if vieux.exists():
            vieux.unlink()
        exe.rename(vieux)  # possible même pendant que l'exe tourne
        try:
            neuf.rename(exe)
        except OSError:
            vieux.rename(exe)  # on remet tout comme avant
            raise
        drapeaux = 0x00000008 | 0x00000200 if os.name == "nt" else 0  # DETACHED_PROCESS | NEW_PROCESS_GROUP
        subprocess.Popen([str(exe), "--apres-maj", *[a for a in sys.argv[1:] if a == "--tray"]],
                         creationflags=drapeaux, close_fds=True)
        return True
    except Exception as e:
        print("Mise à jour impossible :", e, file=sys.stderr)
        try:
            neuf.unlink()
        except OSError:
            pass
        return False


def nettoyer():
    """Après une mise à jour : supprime l'ancien exe (il a pu rester verrouillé quelques secondes)."""
    vieux = Path(sys.executable).with_name("FocusGardien.ancien.exe")
    try:
        if vieux.exists():
            vieux.unlink()
    except OSError:
        pass
