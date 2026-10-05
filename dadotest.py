"""Connexion au compte Dadotest (dadotest.ch) : devoirs, tests et cartes de révision.

Le site fonctionne avec un cookie de session (formulaire /login). On se connecte une fois avec le nom
et le mot de passe Dadotest, on garde le cookie (chiffré par Windows, comme le fait un navigateur),
et on lit /api/plan et /api/srs. Le site renouvelle lui-même le cookie : on garde toujours le dernier.
"""

import base64
import json
import os
import urllib.error
import urllib.parse
import urllib.request

SITE = os.environ.get("FOCUS_GARDIEN_SITE", "https://dadotest.ch")
COOKIE = "dadotest_session"


class NonConnecte(Exception):
    """La session a expiré ou n'existe pas : il faut se reconnecter."""


class ErreurConnexion(Exception):
    """Mauvais mot de passe, trop d'essais, compte bloqué… Le message est fait pour être affiché."""


# ---------- garder le cookie à l'abri ----------
def proteger(texte):
    """Chiffre avec DPAPI (lié à ta session Windows). Ailleurs (développement) : simple base64."""
    brut = texte.encode("utf-8")
    if os.name == "nt":
        brut = _dpapi(brut, chiffrer=True)
    return base64.b64encode(brut).decode("ascii")


def deproteger(texte):
    try:
        brut = base64.b64decode(texte)
        if os.name == "nt":
            brut = _dpapi(brut, chiffrer=False)
        return brut.decode("utf-8")
    except Exception:
        return ""


def _dpapi(donnees, chiffrer):
    import ctypes
    from ctypes import wintypes

    class BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    entree = BLOB(len(donnees), ctypes.cast(ctypes.create_string_buffer(donnees, len(donnees)), ctypes.POINTER(ctypes.c_char)))
    sortie = BLOB()
    crypt32 = ctypes.windll.crypt32
    fonction = crypt32.CryptProtectData if chiffrer else crypt32.CryptUnprotectData
    if not fonction(ctypes.byref(entree), None, None, None, None, 0x01, ctypes.byref(sortie)):  # UI_FORBIDDEN
        raise OSError("DPAPI a échoué")
    try:
        return ctypes.string_at(sortie.pbData, sortie.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(sortie.pbData)


# ---------- requêtes ----------
class _PasDeRedirection(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None  # on veut voir le 302 (connexion réussie, ou renvoi vers /login)


_ouvreur = urllib.request.build_opener(_PasDeRedirection)


def _cookie_dans(entetes):
    for valeur in entetes.get_all("Set-Cookie") or []:
        nom, _, reste = valeur.partition("=")
        if nom.strip() == COOKIE:
            return reste.split(";", 1)[0]  # renvoyé tel quel au site, sans le décoder
    return None


class Compte:
    def __init__(self, nom="", cookie=""):
        self.nom = nom
        self.cookie = cookie  # valeur du cookie de session, en clair, seulement en mémoire

    @property
    def connecte(self):
        return bool(self.cookie)

    def connecter(self, nom, mot_de_passe, timeout=15):
        corps = urllib.parse.urlencode({"username": nom, "password": mot_de_passe}).encode()
        req = urllib.request.Request(f"{SITE}/login", data=corps, method="POST", headers={
            "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "FocusGardien"})
        try:
            with _ouvreur.open(req, timeout=timeout) as r:
                statut, entetes = r.status, r.headers
        except urllib.error.HTTPError as e:
            statut, entetes = e.code, e.headers
        except OSError:
            raise ErreurConnexion("Pas de connexion à dadotest.ch. Vérifie internet et réessaie.")
        cookie = _cookie_dans(entetes)
        if statut in (301, 302, 303) and cookie:
            self.nom, self.cookie = nom, cookie
            return
        raise ErreurConnexion({
            401: "Nom d'utilisateur ou mot de passe incorrect.",
            403: "Ce compte Dadotest ne peut pas se connecter pour l'instant.",
            429: "Trop de tentatives. Réessaie dans 15 minutes.",
        }.get(statut, f"Connexion refusée par dadotest.ch (code {statut})."))

    def deconnecter(self):
        self.cookie = ""

    def _appel(self, chemin, methode="GET", corps=None, timeout=15):
        if not self.cookie:
            raise NonConnecte()
        entetes = {"Cookie": f"{COOKIE}={self.cookie}", "Accept": "application/json",
                   "User-Agent": "FocusGardien"}
        data = None
        if corps is not None:
            data = json.dumps(corps).encode()
            entetes["Content-Type"] = "application/json"
        req = urllib.request.Request(f"{SITE}{chemin}", data=data, method=methode, headers=entetes)
        try:
            with _ouvreur.open(req, timeout=timeout) as r:
                statut, entetes_r, texte = r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            statut, entetes_r, texte = e.code, e.headers, e.read()
        nouveau = _cookie_dans(entetes_r)
        if nouveau is not None:
            if not nouveau:  # le site a effacé la session
                self.cookie = ""
                raise NonConnecte()
            self.cookie = nouveau  # le site a renouvelé la session
        if statut in (301, 302, 303, 401):
            self.cookie = ""
            raise NonConnecte()
        try:
            donnees = json.loads(texte)
        except ValueError:
            raise NonConnecte()  # une page HTML (connexion) au lieu de JSON
        if statut >= 400:
            raise ErreurConnexion(donnees.get("error") or f"Erreur {statut}")
        return donnees

    # ---------- ce que l'app utilise ----------
    def planning(self):
        return self._appel("/api/plan")

    def revision(self):
        return self._appel("/api/srs")

    def cocher_devoir(self, ident, fait):
        return self._appel("/api/plan/toggle", "POST", {"kind": "task", "id": ident, "done": bool(fait)})

    def repondre_carte(self, cle, juste):
        return self._appel("/api/srs", "POST", {"key": cle, "ok": bool(juste)})
