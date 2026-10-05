"""Déplacements du mini Gardien sur l'écran : marcher, grimper les bords, marcher au plafond,
tomber et rebondir, se faire attraper et lancer à la souris.

Pur calcul (aucune fenêtre ici) : main.py appelle `pas()` toutes les 30 ms et place la fenêtre
avec `position_fenetre()`. Coordonnées en pixels écran ; (cx, cy) = centre du personnage.
"""

import math
import random

DEMI = 55  # demi-taille du personnage (pieds à DEMI px du centre)
VITESSE = 2.2  # px par pas en marchant / grimpant
GRAVITE = 1.1
REBOND = 0.45

PARACHUTE_VY = 3.4  # px par pas : descente douce mais pas trop longue
# grappin : lancer (pas), vitesse de montée à la corde (px par pas), rétablissement sur le bord (pas)
GRAPPIN_LANCER, GRAPPIN_V, GRAPPIN_REPRISE = 16, 4.0, 12
GRAPPIN_MARGE = 150  # px de fenêtre au-dessus du bord (crochet + tête quand il se hisse)
# modes : "sol", "mur_g", "mur_d", "plafond", "chute", "parachute", "attrape", "dort",
#         "vers_grappin" (marche sous une fenêtre), "grappin" (lance et monte), "fenetre" (marche sur le haut d'une fenêtre)


class Promenade:
    def __init__(self, zone, hasard=None):
        """zone = (gauche, haut, droite, bas) de l'espace de travail (sans la barre des tâches)."""
        self.zone = zone
        self.r = hasard or random.Random()
        g, h, d, b = zone
        self.cx, self.cy = d - 220, b - DEMI
        self.mode, self.sens = "sol", -1  # sens : -1 gauche/haut, +1 droite/bas
        self.vx = self.vy = 0.0
        self.pause = 60  # pas restants à l'arrêt
        self.avant_attrape = None
        self.bouge_pendant_attrape = 0.0
        self.dernier_curseur = None
        self.oubli = False  # il a « oublié » son parachute : chute libre jusqu'en bas
        self.t = 0
        self.atterri = False  # vient de se poser en parachute (pour la petite pose de l'interface)
        self.dodo = False  # mode focus : il va dormir dans le coin en bas à droite et ne bouge plus
        self.plateformes = []  # hauts de fenêtres visibles : [(gauche, droite, y)], mis à jour par main.py
        self.plat = None  # plateforme visée ou sous ses pieds
        self.cible_x = None
        self.grappin = None  # {"ty", "pieds", "t", "total"}

    # ---------- utilitaires ----------
    def _poser(self, mode, sens=None):
        self.mode = mode
        if sens is not None:
            self.sens = sens
        g, h, d, b = self.zone
        if mode == "sol":
            self.cy = b - DEMI
        elif mode == "plafond":
            self.cy = h + DEMI
        elif mode == "mur_g":
            self.cx = g + DEMI
        elif mode == "mur_d":
            self.cx = d - DEMI

    @property
    def en_mouvement(self):
        if self.mode == "grappin":
            return False  # fenêtre fixe : l'interface anime le lancer et la montée
        return self.mode in ("chute", "parachute", "attrape") or self.pause <= 0

    def plateforme_sous(self, plat, x=None):
        """La plateforme existe-t-elle encore (fenêtre pas fermée, pas déplacée) ? Renvoie sa version à jour."""
        if not plat:
            return None
        x = self.cx if x is None else x
        for p in self.plateformes:
            if abs(p[2] - plat[2]) <= 6 and p[0] - 4 <= x <= p[1] + 4:
                return p
        return None

    def hauteur_fenetre(self, hauteur):
        """Pendant le grappin, la fenêtre va du crochet jusqu'à ses pieds."""
        if self.mode == "grappin" and self.grappin:
            return int(self.grappin["pieds"] - (self.grappin["ty"] - GRAPPIN_MARGE))
        return hauteur

    def _sauter_de_la_fenetre(self, sens=0):
        g, h, d, b = self.zone
        haut = b - self.cy
        self.oubli = haut < 260  # pas haut : simple saut, sinon parachute
        self.mode = "chute" if self.oubli else "parachute"
        self.vx, self.vy = 3.0 * sens, (-6.0 if self.oubli else 0.0)
        self.plat = None

    # ---------- un pas ----------
    def pas(self, curseur=None, bouton=False):
        """Avance d'un pas. Renvoie True si le mode ou le sens a changé (l'interface doit se mettre à jour)."""
        avant = (self.mode, self.sens, self.pause > 0)
        self.atterri = False
        if self.mode == "dort" and not self.dodo:  # fin du focus : il se réveille
            self.mode, self.pause = "sol", 30
        if self.dodo and self.mode != "attrape":
            if self.mode in ("vers_grappin", "grappin"):
                self.mode, self.grappin, self.plat = "sol", None, None
                self.cy = self.zone[3] - DEMI
            if self.mode == "fenetre":
                self._sauter_de_la_fenetre()
            if self.mode in ("mur_g", "mur_d", "plafond"):
                self.mode, self.vx, self.vy, self.oubli = "parachute", 0.0, 0.0, False  # il redescend
            elif self.mode == "sol":
                return self._aller_dormir() or avant != (self.mode, self.sens, self.pause > 0)
            elif self.mode == "dort":
                return False
        if self.mode == "attrape":
            self._attrape(curseur, bouton)
        elif self.mode == "chute":
            self._chute()
        elif self.mode == "parachute":
            self._parachute()
        elif self.mode == "vers_grappin":
            self._vers_grappin()
        elif self.mode == "grappin":
            self._grappin()
        elif self.mode == "fenetre":
            self._sur_fenetre()
        else:
            self._marche()
        return avant != (self.mode, self.sens, self.pause > 0)

    def _aller_dormir(self):
        """Marche jusqu'au coin en bas à droite, puis s'endort."""
        g, h, d, b = self.zone
        cible = d - DEMI - 20
        self.pause = 0
        if abs(self.cx - cible) <= VITESSE * 1.6:
            self.cx, self.mode = cible, "dort"
            return True
        sens = 1 if cible > self.cx else -1
        change = sens != self.sens
        self.sens = sens
        self.cx += VITESSE * 1.6 * sens
        return change

    def attraper(self, curseur):
        """La souris vient de cliquer sur le personnage."""
        if self.mode != "attrape":
            self.avant_attrape = (self.mode, self.sens, self.cx, self.cy)
        self.mode = "attrape"
        self.dernier_curseur = curseur
        self.bouge_pendant_attrape = 0.0
        self.vx = self.vy = 0.0

    def _attrape(self, curseur, bouton):
        if curseur is not None:
            if self.dernier_curseur is not None:
                dx, dy = curseur[0] - self.dernier_curseur[0], curseur[1] - self.dernier_curseur[1]
                self.vx, self.vy = 0.6 * self.vx + 0.4 * dx, 0.6 * self.vy + 0.4 * dy
                self.bouge_pendant_attrape += abs(dx) + abs(dy)
            self.dernier_curseur = curseur
            self.cx, self.cy = curseur
        if not bouton:
            if self.bouge_pendant_attrape < 8 and self.avant_attrape:
                # simple clic : il reste où il était
                self.mode, self.sens, self.cx, self.cy = self.avant_attrape
            else:
                self.mode, self.oubli = "chute", False
                self.vx = max(-35, min(35, self.vx))
                self.vy = max(-35, min(35, self.vy))
            self.avant_attrape = None

    def _chute(self):
        g, h, d, b = self.zone
        # lancé (ou tombé) haut : il ouvre son parachute en redescendant
        if not self.oubli and self.vy > 2 and self.cy < h + (b - h) * 0.55:
            self.mode, self.vx = "parachute", self.vx * 0.3
            return
        self.vy += GRAVITE
        self.vx *= 0.99
        self.cx += self.vx
        self.cy += self.vy
        if self.cx < g + DEMI:
            self.cx, self.vx = g + DEMI, -self.vx * REBOND
        if self.cx > d - DEMI:
            self.cx, self.vx = d - DEMI, -self.vx * REBOND
        if self.cy < h + DEMI:
            self.cy, self.vy = h + DEMI, -self.vy * REBOND
        if self.cy >= b - DEMI:
            self.cy = b - DEMI
            if abs(self.vy) > 5:
                self.vy = -self.vy * REBOND
                self.vx *= 0.7
            else:
                self.vx = self.vy = 0.0
                self._poser("sol", self.r.choice([-1, 1]))
                self.pause = 40
                self.oubli = False

    def _parachute(self):
        """Descente douce en se balançant, puis atterrissage et petite pose."""
        g, h, d, b = self.zone
        self.t += 1
        self.vy = PARACHUTE_VY
        self.cx += math.sin(self.t / 12) * 1.6 + self.vx
        self.vx *= 0.96
        self.cy += self.vy
        self.cx = max(g + DEMI, min(d - DEMI, self.cx))
        if self.cy >= b - DEMI:
            self.vx = self.vy = 0.0
            self._poser("sol", self.r.choice([-1, 1]))
            self.pause = 70
            self.atterri = True

    # ---------- grappin et fenêtres ----------
    def _choisir_fenetre(self):
        """Au sol : choisit le haut d'une fenêtre ouverte pour y lancer son grappin."""
        g, h, d, b = self.zone
        possibles = [p for p in self.plateformes
                     if p[1] - p[0] >= 2 * DEMI + 30 and p[2] >= h + GRAPPIN_MARGE + 20 and b - p[2] >= 160]
        if not possibles:
            return False
        p = self.r.choice(possibles)
        self.plat = p
        self.cible_x = max(p[0] + DEMI + 10, min(p[1] - DEMI - 10, self.cx))
        self.mode = "vers_grappin"
        self.sens = 1 if self.cible_x > self.cx else -1
        return True

    def _vers_grappin(self):
        p = self.plateforme_sous(self.plat, self.cible_x)
        if not p:  # la fenêtre a disparu : tant pis
            self.mode, self.plat = "sol", None
            return
        self.plat = p
        if abs(self.cx - self.cible_x) <= VITESSE * 1.4:
            self.cx = self.cible_x
            pieds = self.cy + DEMI
            monte = max(0.0, (pieds - (p[2] + 100)) / GRAPPIN_V)
            self.grappin = {"ty": p[2], "pieds": pieds, "t": 0,
                            "total": int(GRAPPIN_LANCER + monte + GRAPPIN_REPRISE), "monte": int(monte)}
            self.mode = "grappin"
            return
        self.sens = 1 if self.cible_x > self.cx else -1
        self.cx += VITESSE * 1.4 * self.sens

    def _grappin(self):
        gr = self.grappin
        gr["t"] += 1
        if not self.plateforme_sous(self.plat):  # fenêtre fermée ou déplacée : la corde lâche
            monte = max(0, min(gr["monte"], gr["t"] - GRAPPIN_LANCER))
            self.cy = gr["pieds"] - DEMI - monte * GRAPPIN_V
            self.mode, self.grappin, self.oubli, self.vx, self.vy = "chute", None, True, 0.0, 0.0
            return
        if gr["t"] >= gr["total"]:
            self.cy = gr["ty"] - DEMI
            self.mode, self.grappin, self.pause = "fenetre", None, 25
            self.sens = self.r.choice([-1, 1])

    def _sur_fenetre(self):
        p = self.plateforme_sous(self.plat)
        if not p:  # on a fermé ou bougé sa fenêtre
            self._sauter_de_la_fenetre()
            return
        self.plat, self.cy = p, p[2] - DEMI
        if self.pause > 0:
            self.pause -= 1
            return
        if self.r.random() < 0.004:
            self.pause = self.r.randint(50, 200)
            return
        if self.r.random() < 0.0015:
            self._sauter_de_la_fenetre(self.sens)
            return
        self.cx += VITESSE * self.sens
        if self.cx <= p[0] + DEMI or self.cx >= p[1] - DEMI:
            self.cx = max(p[0] + DEMI, min(p[1] - DEMI, self.cx))
            if self.r.random() < 0.55:
                self.sens = -self.sens  # demi-tour
            else:
                self._sauter_de_la_fenetre(self.sens)

    def _marche(self):
        g, h, d, b = self.zone
        if self.pause > 0:
            self.pause -= 1
            return
        if self.mode == "sol" and self.plateformes and self.r.random() < 0.0025 and self._choisir_fenetre():
            return
        # de temps en temps : petite pause, ou lâcher prise (mur / plafond)
        if self.r.random() < 0.004:
            self.pause = self.r.randint(60, 250)
            return
        if self.mode in ("mur_g", "mur_d", "plafond") and self.r.random() < 0.0012:
            # il lâche prise : parachute la plupart du temps… sauf quand il l'oublie
            self.oubli = self.r.random() < 0.15
            self.mode, self.vx, self.vy = ("chute" if self.oubli else "parachute"), 0.0, 0.0
            return
        if self.mode == "plafond" and self.r.random() < 0.003:
            self.mode, self.vx, self.vy, self.oubli = "parachute", 0.0, 0.0, False  # il saute du plafond
            return

        if self.mode == "sol":
            self.cx += VITESSE * self.sens
            if self.cx <= g + DEMI:
                self.cx = g + DEMI
                self._coin("mur_g", 1)
            elif self.cx >= d - DEMI:
                self.cx = d - DEMI
                self._coin("mur_d", -1)
        elif self.mode == "plafond":
            self.cx += VITESSE * self.sens
            if self.cx <= g + DEMI:
                self._poser("mur_g", 1)  # redescend le mur gauche
            elif self.cx >= d - DEMI:
                self._poser("mur_d", 1)
        else:  # murs : sens -1 = monte, +1 = descend
            self.cy += VITESSE * self.sens
            if self.cy <= h + DEMI:
                self.cy = h + DEMI
                if self.r.random() < 0.65:
                    self._poser("plafond", 1 if self.mode == "mur_g" else -1)
                else:
                    self.sens = 1
            elif self.cy >= b - DEMI:
                self.cy = b - DEMI
                self._poser("sol", 1 if self.mode == "mur_g" else -1)

    def _coin(self, mur, sens_retour):
        """Arrivé au bord en marchant : il grimpe (souvent) ou fait demi-tour."""
        if self.r.random() < 0.6:
            self._poser(mur, -1)
        else:
            self.sens = sens_retour

    # ---------- placement de la fenêtre ----------
    def position_fenetre(self, largeur, hauteur):
        """Coin haut-gauche de la fenêtre pour que le personnage touche le bon bord de l'écran."""
        g, h, d, b = self.zone
        if self.mode in ("sol", "dort", "vers_grappin"):
            return self.cx - largeur / 2, b - hauteur
        if self.mode == "fenetre" and self.plat:  # pieds sur le haut de la fenêtre
            return self.cx - largeur / 2, self.plat[2] - hauteur
        if self.mode == "grappin" and self.grappin:  # fenêtre haute : du crochet jusqu'à ses pieds
            return self.cx - largeur / 2, self.grappin["ty"] - GRAPPIN_MARGE
        if self.mode == "plafond":
            return self.cx - largeur / 2, h
        if self.mode == "mur_g":  # jetpack le long du bord gauche
            return g, self.cy - hauteur / 2
        if self.mode == "mur_d":
            return d - largeur, self.cy - hauteur / 2
        if self.mode == "parachute":  # personnage en bas de la fenêtre, la voile au-dessus
            return self.cx - largeur / 2, self.cy - (hauteur - 85)
        return self.cx - largeur / 2, self.cy - hauteur / 2
