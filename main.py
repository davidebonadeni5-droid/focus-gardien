"""Focus Gardien : point d'entrée de l'application Windows.

- Fenêtre principale (tableau de bord, stats, apps, devoirs, réglages) en HTML via pywebview (WebView2).
- Fenêtre d'interrogatoire au premier plan quand une app surveillée s'ouvre.
- Petites notifications en bas à droite.
- Icône près de l'horloge (pystray), démarrage avec Windows, mot de passe pour quitter.
- Mini Gardien : un petit personnage qui se promène en bas de l'écran et dit des petites phrases.

Lancer depuis le code :  pip install -r requirements.txt  puis  python main.py
Options :  --tray      démarre caché près de l'horloge
           --selftest  vérifie que tout se charge (CI)
           --fumee F   lance la vraie interface, vérifie qu'elle s'affiche, écrit le résultat dans F et quitte (CI)
"""

import json
import os
import sys
import threading
import time
from pathlib import Path

import dadotest
import gardien as g
import maj
from promenade import Promenade

NOM = "Focus Gardien"
BASE = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
UI = BASE / "ui" / "index.html"


def url():
    # Toutes les fenêtres chargent la même page, sans « ?vue=… » : sous Windows, .NET abîme le « ? »
    # d'une adresse file:// et la page ne se charge pas. Chaque fenêtre demande sa vue avec api.params().
    return UI.as_uri()


# ---------- Windows : démarrage automatique et instance unique ----------
CLE_RUN = r"Software\Microsoft\Windows\CurrentVersion\Run"


def commande_demarrage():
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}" --tray'
    return f'"{sys.executable}" "{Path(__file__).resolve()}" --tray'


def regler_demarrage(actif):
    if os.name != "nt":
        return
    import winreg

    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, CLE_RUN, 0, winreg.KEY_SET_VALUE) as cle:
        if actif:
            winreg.SetValueEx(cle, NOM, 0, winreg.REG_SZ, commande_demarrage())
        else:
            try:
                winreg.DeleteValue(cle, NOM)
            except FileNotFoundError:
                pass


def deja_lance(attendre=False):
    """Une seule copie à la fois. Après une mise à jour, on attend que l'ancienne version se ferme."""
    if os.name != "nt":
        return False
    import ctypes

    k32 = ctypes.windll.kernel32
    fin = time.time() + (20 if attendre else 0)
    while True:
        poignee = k32.CreateMutexW(None, False, "FocusGardien.Unique")
        if k32.GetLastError() != 183:  # ERROR_ALREADY_EXISTS
            return False
        k32.CloseHandle(poignee)
        if time.time() > fin:
            break
        time.sleep(0.5)
    ctypes.windll.user32.MessageBoxW(None, "Focus Gardien est déjà ouvert : regarde près de l'horloge 🛡️", NOM, 0x40)
    return True


def rendre_transparent(fen):
    """pywebview rend la page transparente, mais pas la fenêtre Windows derrière (elle reste grise).
    On donne à la fenêtre une « couleur de transparence » : Windows ne dessine pas ces pixels-là."""
    if os.name != "nt":
        return
    try:
        from System import Action
        from System.Drawing import Color

        forme = fen.native
        # presque noir : les bords lissés du dessin se fondent dans son contour sombre (pas de liseré vert)
        cle = Color.FromArgb(255, 1, 1, 1)

        def faire():
            forme.BackColor = cle
            forme.TransparencyKey = cle

        forme.Invoke(Action(faire))
    except Exception as e:
        print("Transparence impossible :", e, file=sys.stderr)


def zone_de_travail():
    """(gauche, haut, droite, bas) de l'écran sans la barre des tâches."""
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes

        r = wintypes.RECT()
        if ctypes.windll.user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(r), 0):  # SPI_GETWORKAREA
            return r.left, r.top, r.right, r.bottom
    return 0, 0, 1280, 720


def souris():
    """(position du curseur, bouton gauche enfoncé ?)"""
    if os.name != "nt":
        return None, False
    import ctypes
    from ctypes import wintypes

    pt = wintypes.POINT()
    ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
    enfonce = bool(ctypes.windll.user32.GetAsyncKeyState(0x01) & 0x8000)  # VK_LBUTTON
    return (pt.x, pt.y), enfonce


# ---------- API appelée depuis le JavaScript ----------
class Api:
    """Méthodes publiques = window.pywebview.api.* côté JS. Les attributs privés ne sont pas exposés."""

    def __init__(self, appli, role, **params):
        self._appli = appli
        self._role = role
        self._carte = None
        self._params = {"vue": role, **{k: str(v) for k, v in params.items()}}
        self._devoir = None
        self._fenetre = None

    # communs
    def params(self):
        return self._params

    def etat(self):
        return self._appli.gardien.etat()

    def fermer(self):
        if self._fenetre:
            self._fenetre.destroy()

    # fenêtre principale
    def demarrer_pomodoro(self):
        self._appli.gardien.demarrer_pomodoro()
        self._appli.maj_menu()

    def arreter_pomodoro(self):
        self._appli.gardien.arreter_pomodoro()
        self._appli.maj_menu()

    def mode_focus(self, actif):
        self._appli.gardien.regler_focus(actif)
        self._appli.maj_menu()

    def basculer_app(self, cle, actif):
        for app in self._appli.gardien.donnees["apps"]:
            if app["cle"] == cle:
                app["actif"] = bool(actif)
        self._appli.gardien.sauver()

    def supprimer_app(self, cle):
        d = self._appli.gardien.donnees
        d["apps"] = [a for a in d["apps"] if a["cle"] != cle]
        self._appli.gardien.sauver()

    def ajouter_app(self, cle, nom=""):
        return self._appli.gardien.ajouter_app(cle, nom)

    def programmes_ouverts(self):
        return self._appli.gardien.programmes_ouverts()

    def dossiers_jeux(self, actif):
        self._appli.gardien.donnees["dossiers_jeux"] = bool(actif)
        self._appli.gardien.sauver()

    def sauver_vocabulaire(self, vocab):
        self._appli.gardien.donnees["vocabulaire"] = [[str(q), str(r)] for q, r in vocab if str(q).strip() and str(r).strip()]
        self._appli.gardien.sauver()

    def reglage(self, nom, valeur):
        r = self._appli.gardien.donnees["reglages"]
        if nom in ("travail", "pause"):
            valeur = max(1, min(120, int(valeur)))
        r[nom] = valeur
        self._appli.gardien.sauver()
        if nom == "demarrage":
            try:
                regler_demarrage(bool(valeur))
            except OSError:
                return False
        if nom == "compagnon":
            self._appli.afficher_compagnon(bool(valeur))
        return True

    def ouvrir(self):
        self._appli.montrer()

    # pense-bête (clic sur le mini Gardien) et jeux de la pause
    def ouvrir_memo(self):
        self._appli.ouvrir_memo()

    def note_ajouter(self, texte):
        self._appli.gardien.note_ajouter(texte)

    def note_basculer(self, ident):
        self._appli.gardien.note_basculer(ident)

    def note_supprimer(self, ident):
        self._appli.gardien.note_supprimer(ident)

    def ouvrir_jeu(self):
        return self._appli.ouvrir_jeu()

    def score(self, jeu, points):
        return self._appli.gardien.enregistrer_score(str(jeu)[:20], points)

    def annonce_vue(self):
        self._appli.gardien.annonce = None

    def attraper(self):
        """Le mini Gardien vient d'être attrapé à la souris."""
        appli = self._appli
        if appli.promenade:
            pos, _ = souris()
            appli.promenade.attraper(pos or (appli.promenade.cx, appli.promenade.cy))

    def fin_premier_lancement(self):
        self._appli.gardien.donnees["premier_lancement"] = False
        self._appli.gardien.sauver()
        try:
            regler_demarrage(self._appli.gardien.donnees["reglages"]["demarrage"])
        except OSError:
            pass

    def quitter(self, mdp=""):
        if not self._appli.gardien.verifier_mot_de_passe(mdp):
            return False
        threading.Thread(target=self._appli.quitter, daemon=True).start()
        return True

    def cacher(self):
        self._appli.principale.hide()

    # compte Dadotest
    def connecter(self, nom, mot_de_passe):
        gd = self._appli.gardien
        try:
            gd.connecter(nom, mot_de_passe)
        except dadotest.ErreurConnexion as e:
            return {"ok": False, "erreur": str(e)}
        if gd.donnees["premier_lancement"]:
            self.fin_premier_lancement()
        return {"ok": True}

    def deconnecter(self):
        self._appli.gardien.deconnecter()

    def synchroniser(self):
        return self._appli.gardien.synchroniser()

    def cocher_devoir(self, ident, fait):
        return self._appli.gardien.cocher_devoir(ident, fait)

    # interrogatoire
    def contexte(self):
        """Devoir pour aujourd'hui/demain pas encore fait, et test dans les 2 jours : le quiz en parle."""
        p = self._appli.gardien.planning()
        devoir = next((d for d in p["devoirs"] if d["jours"] is not None and d["jours"] <= 1), None)
        test = next((t for t in p["tests"] if t["jours"] <= 2), None)
        return {"devoir": devoir, "test": test}

    def devoir(self):
        carte = self._appli.gardien.carte_au_hasard()
        if carte:
            self._carte = carte
            return {"type": "carte", "q": carte["q"], "note": carte.get("note") or carte.get("course") or ""}
        q, rep = g.question_devoir(self._appli.gardien.donnees["vocabulaire"])
        self._devoir = rep
        return {"type": "calcul", "q": q}

    def reponse_carte(self):
        return (self._carte or {}).get("a", "")

    def repondre_carte(self, juste):
        carte, self._carte = self._carte, None
        if carte:
            threading.Thread(target=self._appli.gardien.repondre_carte, args=(carte["key"], bool(juste)), daemon=True).start()

    def repondre_devoir(self, texte):
        ok = self._devoir is not None and g.normaliser(texte) == g.normaliser(self._devoir)
        return {"ok": ok, "bonne": self._devoir}

    def fin(self, minutes):
        self._appli.gardien.fin_interrogatoire(int(minutes or 0))
        self._appli.quiz = None
        if self._fenetre:
            self._fenetre.destroy()


# ---------- application ----------
class Appli:
    def __init__(self, cache, fumee=None):
        import webview

        self.webview = webview
        self.gardien = g.Gardien()
        self.gardien.version = maj.version_actuelle()
        self.cache = cache
        self.quiz = None
        self.en_sortie = False
        self.icone = None
        self.fumee = fumee
        self.compagnon = None
        self.compagnon_visible = False
        self.promenade = None
        self.memo = None
        self.jeu = None

        api = Api(self, "main")
        self.principale = webview.create_window(
            NOM, url(), js_api=api, width=1080, height=720, min_size=(860, 600),
            background_color="#071512", hidden=cache and not self.gardien.donnees["premier_lancement"])
        api._fenetre = self.principale
        self.principale.events.closing += self._fermeture_principale

    def _fermeture_principale(self):
        if self.en_sortie:
            return True
        self.principale.hide()  # fermer = se cacher près de l'horloge
        return False

    # --- fenêtres secondaires ---
    def ouvrir_interrogatoire(self, nom):
        api = Api(self, "quiz", app=nom)
        fen = self.webview.create_window(
            f"{NOM} — {nom}", url(), js_api=api, width=600, height=680,
            resizable=False, on_top=True, background_color="#071512")
        api._fenetre = fen
        self.quiz = fen

        def fermeture():
            # fermer la fenêtre sans répondre = refus
            if self.gardien.en_cours:
                self.gardien.fin_interrogatoire(0)
            self.quiz = None
            return True

        fen.events.closing += fermeture

    def notifier(self, evt):
        api = Api(self, "toast", data=json.dumps(evt, ensure_ascii=False))
        largeur, hauteur = 400, 168
        x = y = None
        try:
            ecran = self.webview.screens[0]
            x, y = ecran.width - largeur - 24, ecran.height - hauteur - 72
        except Exception:
            pass
        fen = self.webview.create_window(
            NOM, url(), js_api=api, width=largeur, height=hauteur,
            x=x, y=y, frameless=True, on_top=True, resizable=False, focus=False, background_color="#071512")
        api._fenetre = fen

    def ouvrir_memo(self):
        """Petite fenêtre « pense-bête » juste au-dessus du mini Gardien (se ferme quand on clique ailleurs)."""
        if self.memo:
            try:
                self.memo.destroy()
            except Exception:
                pass
            self.memo = None
            return
        largeur, hauteur = 380, 620
        g_, h_, d_, b_ = zone_de_travail()
        x, y = d_ - largeur - 20, b_ - hauteur - 20
        if self.compagnon and self.promenade:
            x = self.promenade.cx - largeur / 2
            y = self.promenade.cy - 70 - hauteur
        x = max(g_ + 8, min(d_ - largeur - 8, x))
        y = max(h_ + 8, min(b_ - hauteur - 8, y))
        api = Api(self, "memo")
        fen = self.webview.create_window(NOM, url(), js_api=api, width=largeur, height=hauteur, x=int(x), y=int(y),
                                         frameless=True, on_top=True, resizable=False, background_color="#F6F4EF")
        api._fenetre = fen
        self.memo = fen

        def ferme():
            self.memo = None
            return True

        fen.events.closing += ferme

    def ouvrir_jeu(self):
        """Fenêtre de jeux : jamais pendant le travail (Pomodoro de travail ou mode focus)."""
        if not self.gardien.peut_jouer:
            return False
        if self.jeu:
            try:
                self.jeu.show()
                self.jeu.restore()
            except Exception:
                pass
            return True
        api = Api(self, "jeu")
        fen = self.webview.create_window(f"{NOM} — Pause jeux", url(), js_api=api, width=520, height=700,
                                         resizable=False, background_color="#F6F4EF")
        api._fenetre = fen
        self.jeu = fen

        def ferme():
            self.jeu = None
            return True

        fen.events.closing += ferme
        return True

    def montrer(self):
        self.principale.show()
        self.principale.restore()

    # --- mini Gardien qui se promène en bas de l'écran ---
    LARGEUR_C, HAUTEUR_C = 300, 300

    def creer_compagnon(self):
        api = Api(self, "compagnon")
        g_, h_, d_, b_ = zone_de_travail()
        x, y = d_ - 220 - self.LARGEUR_C // 2, b_ - self.HAUTEUR_C  # même départ que Promenade
        self.compagnon = self.webview.create_window(
            "Mini Gardien", url(), js_api=api, width=self.LARGEUR_C, height=self.HAUTEUR_C, x=x, y=y,
            frameless=True, easy_drag=False, on_top=True, transparent=True, resizable=False, focus=False,
            shadow=False, background_color="#071512")
        api._fenetre = self.compagnon
        self.compagnon_visible = True
        self.compagnon.events.closing += lambda: self.en_sortie
        self.compagnon.events.shown += lambda: rendre_transparent(self.compagnon)

    def afficher_compagnon(self, oui):
        if oui and not self.compagnon:
            self.creer_compagnon()
        elif self.compagnon:
            (self.compagnon.show if oui else self.compagnon.hide)()
        self.compagnon_visible = oui

    def promener(self):
        """Fait vivre le mini Gardien : il marche, grimpe les bords, marche au plafond, tombe, se fait lancer."""
        self.promenade = Promenade(zone_de_travail())
        prochaine_zone = 0
        taille = None  # taille réelle de la fenêtre (peut être agrandie par la mise à l'échelle Windows)
        while not self.gardien.arret.is_set():
            fen = self.compagnon
            if not fen or not self.compagnon_visible or self.fumee:
                time.sleep(0.5)
                continue
            try:
                p = self.promenade
                if time.time() > prochaine_zone:  # l'écran a pu changer (barre des tâches, résolution)
                    p.zone = zone_de_travail()
                    prochaine_zone = time.time() + 10
                p.dodo = self.gardien.focus_actif or self.gardien.en_travail  # en focus, il dort dans le coin
                curseur, bouton = souris() if p.mode == "attrape" else (None, False)
                if taille is None:
                    taille = (fen.width or self.LARGEUR_C, fen.height or self.HAUTEUR_C)
                if p.pas(curseur, bouton):
                    fen.evaluate_js(f"window.compagnon && compagnon.pose('{p.mode}', {p.sens}, "
                                    f"{'true' if p.pause > 0 else 'false'}, {'true' if p.atterri else 'false'})")
                if p.en_mouvement:
                    x, y = p.position_fenetre(*taille)
                    fen.move(int(x), int(y))
            except Exception:
                pass
            time.sleep(0.03)

    # --- icône près de l'horloge ---
    def lancer_icone(self):
        try:
            import pystray
            from PIL import Image
        except ImportError:
            return
        image = Image.open(BASE / "icone.png")

        def pomo_texte(_):
            return "Arrêter le Pomodoro" if self.gardien.pomo else "Démarrer un Pomodoro 🍅"

        def pomo(_icon, _item):
            if self.gardien.pomo:
                self.gardien.arreter_pomodoro()
            else:
                self.gardien.demarrer_pomodoro()

        def quitter(_icon, _item):
            self.montrer()
            self.principale.evaluate_js("window.demanderQuitter && demanderQuitter()")

        def focus(_icon, _item):
            self.gardien.regler_focus(not self.gardien.focus_actif)

        menu = pystray.Menu(
            pystray.MenuItem("Ouvrir Focus Gardien", lambda *_: self.montrer(), default=True),
            pystray.MenuItem("Mode focus", focus, checked=lambda _: self.gardien.focus_actif),
            pystray.MenuItem(pomo_texte, pomo),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Quitter…", quitter),
        )
        self.icone = pystray.Icon("FocusGardien", image, NOM, menu)
        self.icone.run_detached()

    def maj_menu(self):
        if self.icone:
            try:
                self.icone.update_menu()
            except Exception:
                pass

    # --- synchro Dadotest ---
    def synchro_dadotest(self):
        while not self.gardien.arret.is_set():
            self.gardien.synchroniser()
            self.gardien.arret.wait(600)

    # --- mises à jour automatiques ---
    def surveiller_maj(self):
        if "--apres-maj" in sys.argv:
            self.gardien.annonce = f"Nouvelle version installée ! 🎉 (version {self.gardien.version})"
            for _ in range(20):  # l'ancien exe peut rester verrouillé quelques secondes
                maj.nettoyer()
                time.sleep(1)
        if self.gardien.arret.wait(20):
            return
        while not self.gardien.arret.is_set():
            occupe = self.gardien.en_cours or (self.gardien.pomo and self.gardien.pomo["phase"] == "travail")
            if not occupe:
                trouve = maj.nouvelle_version()
                if trouve and maj.installer(trouve[1]):
                    self.quitter()
                    return
            self.gardien.arret.wait(6 * 3600 if not occupe else 600)

    # --- test de fumée (CI) ---
    def tester(self):
        lire = ("JSON.stringify({url: location.href, etat: document.readyState, pywebview: !!window.pywebview,"
                " vue: document.body.className,"
                " shell: !!(document.getElementById('shell') && !document.getElementById('shell').hidden),"
                " titre: ((document.querySelector('#stage:not([hidden]) .q-title') || document.querySelector('#hello') || {}).textContent || '').trim(),"
                " compagnon: !!document.querySelector('.bonhomme')})")

        def attendre(fen, condition, secondes=20):
            """Relit la page jusqu'à ce que la condition soit vraie (le chargement peut prendre du temps)."""
            dernier = None
            fin = time.time() + secondes
            while time.time() < fin:
                try:
                    dernier = json.loads(fen.evaluate_js(lire))
                    if condition(dernier):
                        return dernier
                except Exception as e:
                    dernier = {"erreur": repr(e)}
                time.sleep(1)
            return dernier

        res = {}
        try:
            res["principale"] = attendre(self.principale, lambda r: r.get("shell") and r.get("pywebview"))
            self.ouvrir_interrogatoire("Test")
            res["quiz"] = attendre(self.quiz, lambda r: r.get("vue") == "quiz" and r.get("titre")) if self.quiz else None
            if self.compagnon:
                res["compagnon"] = attendre(self.compagnon, lambda r: r.get("compagnon"))
                res["compagnon_pos"] = [self.compagnon.x, self.compagnon.y]
            res["ok"] = bool(res["principale"] and res["principale"].get("shell") and res["principale"].get("pywebview")
                             and res["quiz"] and res["quiz"].get("vue") == "quiz" and res["quiz"].get("titre"))
            Path(self.fumee).with_suffix(".pret").write_text("1")  # la CI peut faire la capture d'écran
            time.sleep(12)
        except Exception as e:
            res["erreur"] = repr(e)
            res["ok"] = False
        Path(self.fumee).write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
        self.quitter()

    # --- boucles ---
    def surveiller(self):
        self.lancer_icone()
        if self.gardien.donnees["reglages"]["compagnon"]:
            self.creer_compagnon()
        threading.Thread(target=self.promener, daemon=True).start()
        if self.fumee:
            threading.Thread(target=self.tester, daemon=True).start()
        else:
            threading.Thread(target=self.surveiller_maj, daemon=True).start()
        threading.Thread(target=self.synchro_dadotest, daemon=True).start()

        def notifications():
            while not self.gardien.arret.is_set():
                while self.gardien.evenements:
                    self.notifier(self.gardien.evenements.pop(0))
                    self.maj_menu()
                time.sleep(0.5)

        threading.Thread(target=notifications, daemon=True).start()
        self.gardien.boucle(self.ouvrir_interrogatoire)

    def quitter(self):
        self.en_sortie = True
        self.gardien.arret.set()
        self.gardien.tout_relacher()
        if self.icone:
            self.icone.stop()
        for fen in list(self.webview.windows):
            try:
                fen.destroy()
            except Exception:
                pass

    def lancer(self):
        self.webview.start(self.surveiller, private_mode=False, storage_path=str(g.DOSSIER_DONNEES / "webview"))


def selftest():
    """Vérifie que tout le paquet se charge et que la logique tourne (utilisé par la CI)."""
    import tempfile

    import psutil  # noqa: F401
    import pystray  # noqa: F401
    import webview  # noqa: F401
    from PIL import Image

    assert UI.exists(), UI
    assert maj.version_actuelle()
    Image.open(BASE / "icone.png").load()
    with tempfile.TemporaryDirectory() as tmp:
        gd = g.Gardien(Path(tmp) / "d.json")
        gd.verifier(lambda nom: None)
        gd.demarrer_pomodoro()
        gd.arreter_pomodoro()
        assert gd.definir_mot_de_passe("1234") and gd.verifier_mot_de_passe("1234") and not gd.verifier_mot_de_passe("x")
        assert gd.stats()["serie"] == 0
    print("selftest ok")


def argument(nom):
    if nom in sys.argv and sys.argv.index(nom) + 1 < len(sys.argv):
        return sys.argv[sys.argv.index(nom) + 1]
    return None


def main():
    if "--selftest" in sys.argv:
        # en mode fenêtré il n'y a pas de console : on écrit le résultat dans un fichier
        sortie = argument("--selftest")
        try:
            selftest()
            resultat, code = "ok", 0
        except Exception as e:
            resultat, code = f"ERREUR {e!r}", 1
        if sortie:
            Path(sortie).write_text(resultat, encoding="utf-8")
        sys.exit(code)
    fumee = argument("--fumee")
    if not fumee and deja_lance(attendre="--apres-maj" in sys.argv):
        return
    Appli(cache="--tray" in sys.argv, fumee=fumee).lancer()


if __name__ == "__main__":
    main()
