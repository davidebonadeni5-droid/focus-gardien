"""Cerveau de Focus Gardien : réglages, statistiques, détection des apps, Pomodoro.

Aucune interface ici. main.py branche ce module sur les fenêtres (pywebview) et l'icône près de l'horloge.
Les données sont dans %APPDATA%\\FocusGardien\\donnees.json (ou ~/.focus-gardien ailleurs).
"""

import datetime as dt
import hashlib
import json
import os
import random
import secrets
import sys
import threading
import time
from pathlib import Path

import psutil

if os.environ.get("FOCUS_GARDIEN_DONNEES"):  # pour les tests
    DOSSIER_DONNEES = Path(os.environ["FOCUS_GARDIEN_DONNEES"])
elif os.name == "nt":
    DOSSIER_DONNEES = Path(os.environ.get("APPDATA", Path.home())) / "FocusGardien"
else:
    DOSSIER_DONNEES = Path.home() / ".focus-gardien"
FICHIER = DOSSIER_DONNEES / "donnees.json"

JEUX_CONNUS = [
    ("steam", "Steam"),
    ("epicgameslauncher", "Epic Games"),
    ("robloxplayer", "Roblox"),
    ("minecraft", "Minecraft"),
    ("riotclient", "Riot Client"),
    ("leagueclient", "League of Legends"),
    ("valorant", "Valorant"),
    ("fortniteclient", "Fortnite"),
    ("battle.net", "Battle.net"),
    ("eadesktop", "EA app"),
    ("upc", "Ubisoft Connect"),
]
# Tout programme lancé depuis ces dossiers compte comme un jeu.
DOSSIERS_JEUX = ["steamapps", "epic games", "riot games", "roblox", "ubisoft game launcher"]
# Jamais proposés dans « programmes ouverts », jamais touchés.
SYSTEME = {"system", "idle", "registry", "svchost", "csrss", "wininit", "winlogon", "services", "lsass",
           "smss", "dwm", "fontdrvhost", "sihost", "taskhostw", "ctfmon", "conhost", "runtimebroker",
           "searchhost", "startmenuexperiencehost", "explorer", "python", "pythonw", "py", "focusgardien",
           "msedgewebview2", "shellexperiencehost", "textinputhost", "securityhealthsystray", "applicationframehost",
           "systemsettings", "lockapp", "widgets", "searchapp", "memory compression", "secure system"}

VOCABULAIRE_DEPART = [
    ["le chien (allemand)", "der Hund"],
    ["la maison (allemand)", "das Haus"],
    ["l'école (allemand)", "die Schule"],
    ["apprendre (anglais)", "to learn"],
    ["les devoirs (anglais)", "homework"],
    ["le livre (italien)", "il libro"],
]
ARTICLES = {"der", "die", "das", "the", "to", "il", "lo", "la", "le", "les", "un", "une", "a", "an"}


def nom_court(nom):
    nom = (nom or "").lower()
    return nom[:-4] if nom.endswith(".exe") else nom


def normaliser(texte):
    """Minuscules, espaces propres, sans article au début : « Der Hund » = « hund »."""
    mots = str(texte).lower().replace("’", "'").split()
    if len(mots) > 1 and mots[0] in ARTICLES:
        mots = mots[1:]
    return " ".join(mots)


def aujourdhui():
    return dt.date.today().isoformat()


def hacher(mot_de_passe, sel):
    return hashlib.pbkdf2_hmac("sha256", mot_de_passe.encode("utf-8"), bytes.fromhex(sel), 120_000).hex()


class Gardien:
    def __init__(self, fichier=FICHIER):
        self.fichier = Path(fichier)
        self.verrou = threading.RLock()
        self.donnees = self._charger()
        self.pass_jusqua = {}  # cle -> heure de fin du laissez-passer
        self.prevenus = set()  # apps dont on a annoncé la fin du laissez-passer
        self.ignores = set()  # pid protégés (AccessDenied)
        self.en_cours = None  # {"cle", "nom", "pids"} : app en pause pendant l'interrogatoire
        self.pomo = None  # {"phase": "travail"|"pause", "fin": t, "debut": t}
        self.version = "dev"
        self.annonce = None  # message à faire dire au mini Gardien une fois (ex. après une mise à jour)
        self.focus_actif = False  # le mode focus s'active à la main ; sans lui (et sans Pomodoro) rien n'est bloqué
        self.evenements = []  # messages à afficher (toasts) : main.py les vide
        self.arret = threading.Event()

    # ---------- données ----------
    def _charger(self):
        try:
            d = json.loads(self.fichier.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            d = {}
        d.setdefault("apps", [{"cle": c, "nom": n, "actif": True} for c, n in JEUX_CONNUS])
        d.setdefault("dossiers_jeux", True)
        d.setdefault("vocabulaire", VOCABULAIRE_DEPART)
        d.setdefault("jours", {})  # "2026-10-05": {"resiste", "accorde", "pomodoros", "minutes"}
        d.setdefault("reglages", {})
        for k, v in {"sons": True, "demarrage": True, "travail": 25, "pause": 5, "compagnon": True}.items():
            d["reglages"].setdefault(k, v)
        d.setdefault("mdp", None)  # {"sel", "hash"}
        d.setdefault("premier_lancement", True)
        return d

    def sauver(self):
        with self.verrou:
            try:
                self.fichier.parent.mkdir(parents=True, exist_ok=True)
                tmp = self.fichier.with_suffix(".tmp")
                tmp.write_text(json.dumps(self.donnees, ensure_ascii=False, indent=1), encoding="utf-8")
                tmp.replace(self.fichier)
            except OSError:
                pass

    def compter(self, cle, n=1):
        with self.verrou:
            jour = self.donnees["jours"].setdefault(aujourdhui(), {"resiste": 0, "accorde": 0, "pomodoros": 0, "minutes": 0})
            jour[cle] = jour.get(cle, 0) + n
            self.sauver()

    # ---------- statistiques ----------
    def stats(self, nb_jours=14):
        jours = self.donnees["jours"]
        vide = {"resiste": 0, "accorde": 0, "pomodoros": 0, "minutes": 0}
        auj = dt.date.today()
        serie_jours = []
        for i in range(nb_jours - 1, -1, -1):
            d = (auj - dt.timedelta(days=i)).isoformat()
            serie_jours.append({"date": d, **vide, **jours.get(d, {})})

        def actif(d):
            j = jours.get(d, {})
            return j.get("pomodoros", 0) > 0 or j.get("resiste", 0) > 0

        serie = 0
        jour = auj if actif(auj.isoformat()) else auj - dt.timedelta(days=1)
        while actif(jour.isoformat()):
            serie += 1
            jour -= dt.timedelta(days=1)

        total = {k: sum(j.get(k, 0) for j in jours.values()) for k in vide}
        return {"jours": serie_jours, "aujourdhui": serie_jours[-1], "total": total, "serie": serie}

    # ---------- mot de passe ----------
    def a_mot_de_passe(self):
        return bool(self.donnees.get("mdp"))

    def definir_mot_de_passe(self, nouveau, ancien=""):
        if self.a_mot_de_passe() and not self.verifier_mot_de_passe(ancien):
            return False
        if len(nouveau) < 4:
            return False
        sel = secrets.token_hex(16)
        self.donnees["mdp"] = {"sel": sel, "hash": hacher(nouveau, sel)}
        self.sauver()
        return True

    def verifier_mot_de_passe(self, essai):
        mdp = self.donnees.get("mdp")
        if not mdp:
            return True
        return secrets.compare_digest(hacher(essai or "", mdp["sel"]), mdp["hash"])

    # ---------- apps surveillées ----------
    def identifier(self, info):
        nom = nom_court(info.get("name"))
        if not nom or nom in SYSTEME:
            return None
        for app in self.donnees["apps"]:
            if app["actif"] and app["cle"] and app["cle"] in nom:
                return app["cle"], app["nom"]
        if self.donnees["dossiers_jeux"]:
            chemin = (info.get("exe") or "").lower().replace("/", "\\")
            if any(d in chemin for d in DOSSIERS_JEUX):
                return "jeu:" + nom, nom.capitalize()
        return None

    def apps_ouvertes(self):
        """{cle: (nom affiché, [processus])}."""
        ouvertes = {}
        for p in psutil.process_iter(["name", "exe"]):
            if p.pid in self.ignores or p.pid == os.getpid():
                continue
            try:
                trouve = self.identifier(p.info)
            except Exception:
                continue
            if trouve:
                cle, nom = trouve
                ouvertes.setdefault(cle, (nom, []))[1].append(p)
        return ouvertes

    def programmes_ouverts(self):
        noms = {nom_court(p.info["name"]) for p in psutil.process_iter(["name"])}
        deja = {a["cle"] for a in self.donnees["apps"]}
        return sorted(n for n in noms - SYSTEME - deja if n and not n.startswith("system"))

    def ajouter_app(self, cle, nom=""):
        cle = nom_court(cle).strip()
        if not cle or any(a["cle"] == cle for a in self.donnees["apps"]):
            return False
        self.donnees["apps"].append({"cle": cle, "nom": (nom or cle).strip().capitalize(), "actif": True})
        self.sauver()
        return True

    def agir(self, procs, action):
        ok = False
        for p in procs:
            try:
                getattr(p, action)()
                ok = True
            except psutil.AccessDenied:
                self.ignores.add(p.pid)
            except psutil.NoSuchProcess:
                pass
        return ok

    def _procs_par_pids(self, pids):
        out = []
        for pid in pids:
            try:
                out.append(psutil.Process(pid))
            except psutil.NoSuchProcess:
                pass
        return out

    # ---------- mode focus ----------
    def regler_focus(self, actif):
        with self.verrou:
            self.focus_actif = bool(actif)
            if not actif:
                self.pass_jusqua.clear()
                self.prevenus.clear()

    # ---------- Pomodoro ----------
    def demarrer_pomodoro(self):
        with self.verrou:
            r = self.donnees["reglages"]
            maintenant = time.time()
            self.pomo = {"phase": "travail", "debut": maintenant, "fin": maintenant + r["travail"] * 60}
            self.pass_jusqua.clear()

    def arreter_pomodoro(self):
        with self.verrou:
            if self.pomo and self.pomo["phase"] == "travail":
                minutes = int((time.time() - self.pomo["debut"]) // 60)
                if minutes:
                    self.compter("minutes", minutes)
            self.pomo = None

    def _tic_pomodoro(self, maintenant):
        if not self.pomo or maintenant < self.pomo["fin"]:
            return
        r = self.donnees["reglages"]
        if self.pomo["phase"] == "travail":
            self.compter("pomodoros")
            self.compter("minutes", r["travail"])
            self.pomo = {"phase": "pause", "debut": maintenant, "fin": maintenant + r["pause"] * 60}
            self.evenements.append({"type": "pause", "titre": "Pause ! ☕",
                                    "texte": f"{r['travail']} minutes de travail, bravo ! {r['pause']} minutes de pause : tes apps sont libres."})
        else:
            self.pomo = {"phase": "travail", "debut": maintenant, "fin": maintenant + r["travail"] * 60}
            self.evenements.append({"type": "travail", "titre": "Retour au travail 💪",
                                    "texte": f"La pause est finie. On repart pour {r['travail']} minutes !"})

    # ---------- état pour l'interface ----------
    def etat(self):
        maintenant = time.time()
        pomo = None
        if self.pomo:
            total = (self.pomo["fin"] - self.pomo["debut"]) or 1
            pomo = {"phase": self.pomo["phase"], "reste": max(0, int(self.pomo["fin"] - maintenant)),
                    "progres": min(1, (maintenant - self.pomo["debut"]) / total)}
        return {
            "pomo": pomo,
            "stats": self.stats(),
            "apps": self.donnees["apps"],
            "dossiers_jeux": self.donnees["dossiers_jeux"],
            "vocabulaire": self.donnees["vocabulaire"],
            "reglages": self.donnees["reglages"],
            "mdp": self.a_mot_de_passe(),
            "premier_lancement": self.donnees["premier_lancement"],
            "pass": {c: int(f - maintenant) for c, f in self.pass_jusqua.items() if f > maintenant},
            "interrogatoire": self.en_cours["nom"] if self.en_cours else None,
            "focus": self.focus_actif,
            "version": self.version,
            "annonce": self.annonce,
        }

    # ---------- interrogatoire ----------
    def fin_interrogatoire(self, minutes):
        """Appelé par l'interface : 0 = refusé (on ferme l'app), sinon laissez-passer."""
        with self.verrou:
            cours = self.en_cours
            self.en_cours = None
            if not cours:
                return
            procs = self._procs_par_pids(cours["pids"])
            # l'app a peut-être lancé d'autres processus entre-temps
            procs += self.apps_ouvertes().get(cours["cle"], (None, []))[1]
            if minutes:
                self.agir(procs, "resume")
                self.pass_jusqua[cours["cle"]] = time.time() + int(minutes) * 60
                self.compter("accorde")
            else:
                self.agir(procs, "kill")
                self.compter("resiste")

    # ---------- boucle de surveillance ----------
    def verifier(self, ouvrir_interrogatoire):
        """Un passage. ouvrir_interrogatoire(nom) affiche les questions."""
        with self.verrou:
            maintenant = time.time()
            self._tic_pomodoro(maintenant)
            ouvertes = self.apps_ouvertes()

            for cle in list(self.pass_jusqua):
                if cle not in ouvertes:
                    del self.pass_jusqua[cle]

            phase = self.pomo["phase"] if self.pomo else None
            if phase is None and not self.focus_actif:
                return  # mode focus éteint : les apps sont libres
            for cle, (nom, procs) in ouvertes.items():
                if self.en_cours and cle == self.en_cours["cle"]:
                    continue
                if phase == "pause":
                    continue
                if phase == "travail":
                    if self.agir(procs, "kill"):
                        self.compter("resiste")
                        self.evenements.append({"type": "bloque", "app": nom,
                                                "reste": int(self.pomo["fin"] - maintenant)})
                    continue
                fin = self.pass_jusqua.get(cle)
                if fin is not None:
                    if maintenant < fin:
                        continue
                    if maintenant < fin + 30:
                        if cle not in self.prevenus:
                            self.prevenus.add(cle)
                            self.evenements.append({"type": "fin", "app": nom})
                        continue
                    self.prevenus.discard(cle)
                    del self.pass_jusqua[cle]
                    self.agir(procs, "kill")
                    continue
                if self.en_cours:
                    continue
                if not self.agir(procs, "suspend"):
                    continue
                self.en_cours = {"cle": cle, "nom": nom, "pids": [p.pid for p in procs]}
                ouvrir_interrogatoire(nom)

    def boucle(self, ouvrir_interrogatoire, intervalle=1.5):
        while not self.arret.is_set():
            try:
                self.verifier(ouvrir_interrogatoire)
            except Exception as e:  # la surveillance ne doit jamais s'arrêter
                print("Erreur de surveillance :", e, file=sys.stderr)
            self.arret.wait(intervalle)

    def tout_relacher(self):
        """Avant de quitter : aucune app ne doit rester en pause."""
        with self.verrou:
            if self.en_cours:
                self.agir(self._procs_par_pids(self.en_cours["pids"]), "resume")
                self.en_cours = None
            self.arreter_pomodoro()


def question_devoir(vocabulaire):
    """(question, réponse). Maths le plus souvent, vocabulaire sinon."""
    if vocabulaire and random.random() < 0.4:
        mot, rep = random.choice(vocabulaire)
        return f"Traduis : {mot}", rep
    genre = random.choice(["fois", "plus", "moins", "divise"])
    r = random.randint
    if genre == "fois":
        a, b = r(3, 12), r(3, 12)
        return f"{a} × {b} = ?", str(a * b)
    if genre == "plus":
        a, b = r(15, 99), r(15, 99)
        return f"{a} + {b} = ?", str(a + b)
    if genre == "moins":
        a, b = r(50, 150), r(10, 49)
        return f"{a} − {b} = ?", str(a - b)
    b, q = r(2, 12), r(2, 12)
    return f"{b * q} ÷ {b} = ?", str(q)
