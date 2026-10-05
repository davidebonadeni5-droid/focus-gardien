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

import dadotest

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
        compte = self.donnees["dadotest"]
        self.compte = dadotest.Compte(compte.get("nom", ""), dadotest.deproteger(compte.get("cookie", "")) if compte.get("cookie") else "")
        self.erreur_synchro = None

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
        d.setdefault("dadotest", {"nom": "", "cookie": ""})  # cookie chiffré par Windows
        d.setdefault("notes", [])  # pense-bête : [{"id", "texte", "fait"}]
        d.setdefault("scores", {})  # meilleur score par jeu
        d.setdefault("cache_dadotest", {"plan": None, "deck": [], "quand": 0})
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

    def definir_mot_de_passe(self, nouveau, ancien="", forcer=False):
        if not forcer and self.a_mot_de_passe() and not self.verifier_mot_de_passe(ancien):
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

    # ---------- pense-bête et jeux ----------
    def note_ajouter(self, texte):
        texte = str(texte).strip()[:140]
        if texte:
            self.donnees["notes"].insert(0, {"id": secrets.token_hex(4), "texte": texte, "fait": False})
            del self.donnees["notes"][50:]
            self.sauver()

    def note_basculer(self, ident):
        for n in self.donnees["notes"]:
            if n["id"] == ident:
                n["fait"] = not n["fait"]
        self.sauver()

    def note_supprimer(self, ident):
        self.donnees["notes"] = [n for n in self.donnees["notes"] if n["id"] != ident]
        self.sauver()

    def enregistrer_score(self, jeu, points):
        """Renvoie le meilleur score (après celui-ci)."""
        points = max(0, int(points))
        meilleur = max(points, int(self.donnees["scores"].get(jeu, 0)))
        self.donnees["scores"][jeu] = meilleur
        self.sauver()
        return meilleur

    @property
    def en_travail(self):
        return bool(self.pomo and self.pomo["phase"] == "travail")

    @property
    def peut_jouer(self):
        """Les jeux sont permis partout… sauf quand on travaille (Pomodoro de travail ou mode focus allumé)."""
        return not self.en_travail and not self.focus_actif

    @property
    def en_pause(self):
        return bool(self.pomo and self.pomo["phase"] == "pause")

    # ---------- compte Dadotest ----------
    def _garder_cookie(self):
        self.donnees["dadotest"] = {"nom": self.compte.nom,
                                    "cookie": dadotest.proteger(self.compte.cookie) if self.compte.cookie else ""}
        self.sauver()

    def connecter(self, nom, mot_de_passe):
        """Connexion Dadotest. Le mot de passe sert aussi (en local) à quitter le Gardien. Lève ErreurConnexion."""
        self.compte.connecter(nom.strip(), mot_de_passe)
        self.definir_mot_de_passe(mot_de_passe, forcer=True)  # on ne garde qu'une empreinte, jamais le mot de passe
        self.erreur_synchro = None
        self._garder_cookie()
        self.synchroniser()

    def deconnecter(self):
        self.compte.deconnecter()
        self.donnees["cache_dadotest"] = {"plan": None, "deck": [], "quand": 0}
        self._garder_cookie()

    def synchroniser(self):
        """Récupère devoirs, tests et cartes. Garde une copie pour quand il n'y a pas internet."""
        if not self.compte.connecte:
            return False
        cache = self.donnees["cache_dadotest"]
        try:
            cache["plan"] = self.compte.planning()
            try:
                cache["deck"] = self.compte.revision().get("deck", [])
            except dadotest.ErreurConnexion:
                cache["deck"] = []  # compte sans accès aux notes : pas de cartes
            cache["quand"] = time.time()
            self.erreur_synchro = None
            return True
        except dadotest.NonConnecte:
            self.erreur_synchro = "Session Dadotest expirée : reconnecte-toi."
            return False
        except (dadotest.ErreurConnexion, OSError, ValueError) as e:
            self.erreur_synchro = str(e) or "dadotest.ch ne répond pas."
            return False
        finally:
            self._garder_cookie()  # le site a pu renouveler la session

    def cocher_devoir(self, ident, fait):
        plan = self.donnees["cache_dadotest"].get("plan") or {}
        for t in plan.get("tasks", []):
            if t.get("id") == ident:
                t["done"] = bool(fait)
        self.sauver()
        try:
            self.compte.cocher_devoir(ident, fait)
            return True
        except (dadotest.NonConnecte, dadotest.ErreurConnexion, OSError) as e:
            self.erreur_synchro = str(e) or "Impossible d'envoyer à dadotest.ch."
            return False
        finally:
            self._garder_cookie()

    def repondre_carte(self, cle, juste):
        for c in self.donnees["cache_dadotest"].get("deck", []):
            if c.get("key") == cle:
                c["isDue"] = False
        try:
            self.compte.repondre_carte(cle, juste)
        except (dadotest.NonConnecte, dadotest.ErreurConnexion, OSError):
            pass  # pas grave : la carte reviendra
        self._garder_cookie()

    def planning(self):
        """Devoirs à faire, tests à venir et cartes à réviser, prêts à afficher."""
        cache = self.donnees["cache_dadotest"]
        plan = cache.get("plan") or {}
        matieres = {m.get("id"): m for m in plan.get("subjects", [])}
        auj = dt.date.today()

        def jours(date):
            try:
                return (dt.date.fromisoformat(date) - auj).days
            except (TypeError, ValueError):
                return None

        def matiere(ident):
            m = matieres.get(ident) or {}
            return {"nom": m.get("name", ""), "couleur": m.get("color", "#9A988F")}

        devoirs = []
        for t in plan.get("tasks", []):
            if t.get("done"):
                continue
            j = jours(t.get("due"))
            devoirs.append({"id": t.get("id"), "titre": t.get("title", "Devoir"), "jours": j, **matiere(t.get("subj"))})
        devoirs.sort(key=lambda x: (x["jours"] is None, x["jours"] if x["jours"] is not None else 0))
        tests = []
        for e in plan.get("tests", []):
            j = jours(e.get("date"))
            if j is not None and j >= 0:
                tests.append({"id": e.get("id"), "titre": e.get("title", "Test"), "jours": j, "sujets": e.get("topics", ""),
                              **matiere(e.get("subj"))})
        tests.sort(key=lambda x: x["jours"])
        deck = cache.get("deck") or []
        return {"devoirs": devoirs, "tests": tests, "cartes": len(deck), "cartes_dues": sum(1 for c in deck if c.get("isDue")),
                "quand": int(cache.get("quand") or 0)}

    def carte_au_hasard(self):
        """Une carte de révision (en priorité une qui est à revoir aujourd'hui), ou None."""
        deck = [c for c in self.donnees["cache_dadotest"].get("deck", []) if c.get("q") and c.get("a")]
        if not deck:
            return None
        dues = [c for c in deck if c.get("isDue")]
        return random.choice(dues or deck)

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
            "compte": {"nom": self.compte.nom, "connecte": self.compte.connecte, "erreur": self.erreur_synchro},
            "planning": self.planning(),
            "notes": self.donnees["notes"],
            "peut_jouer": self.peut_jouer,
            "scores": self.donnees["scores"],
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
