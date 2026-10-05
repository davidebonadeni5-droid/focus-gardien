"""Déplacements du mini Gardien sur l'écran : marcher, grimper les bords, marcher au plafond,
tomber et rebondir, se faire attraper et lancer à la souris.

Pur calcul (aucune fenêtre ici) : main.py appelle `pas()` toutes les 30 ms et place la fenêtre
avec `position_fenetre()`. Coordonnées en pixels écran ; (cx, cy) = centre du personnage.
"""

import random

DEMI = 55  # demi-taille du personnage (pieds à DEMI px du centre)
VITESSE = 2.2  # px par pas en marchant / grimpant
GRAVITE = 1.1
REBOND = 0.45

# modes : "sol", "mur_g", "mur_d", "plafond", "chute", "attrape"


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
        return self.mode in ("chute", "attrape") or self.pause <= 0

    # ---------- un pas ----------
    def pas(self, curseur=None, bouton=False):
        """Avance d'un pas. Renvoie True si le mode ou le sens a changé (l'interface doit se mettre à jour)."""
        avant = (self.mode, self.sens, self.pause > 0)
        if self.mode == "attrape":
            self._attrape(curseur, bouton)
        elif self.mode == "chute":
            self._chute()
        else:
            self._marche()
        return avant != (self.mode, self.sens, self.pause > 0)

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
                self.mode = "chute"
                self.vx = max(-35, min(35, self.vx))
                self.vy = max(-35, min(35, self.vy))
            self.avant_attrape = None

    def _chute(self):
        g, h, d, b = self.zone
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

    def _marche(self):
        g, h, d, b = self.zone
        if self.pause > 0:
            self.pause -= 1
            return
        # de temps en temps : petite pause, ou lâcher prise (mur / plafond)
        if self.r.random() < 0.004:
            self.pause = self.r.randint(60, 250)
            return
        if self.mode in ("mur_g", "mur_d", "plafond") and self.r.random() < 0.0012:
            self.mode, self.vx, self.vy = "chute", 0.0, 0.0
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
    @property
    def sur_un_mur(self):
        return self.mode in ("mur_g", "mur_d")

    def hauteur_mur(self, hauteur):
        """Sur un mur, la fenêtre est très haute : la corde part au-dessus du haut de l'écran."""
        g, h, d, b = self.zone
        return (b - h) + hauteur + 120

    def position_fenetre(self, largeur, hauteur):
        """Coin haut-gauche de la fenêtre pour que le personnage touche le bon bord de l'écran.
        Sur un mur, `hauteur` est la grande hauteur et le personnage est à 120 px du bas de la fenêtre."""
        g, h, d, b = self.zone
        if self.mode == "sol":
            return self.cx - largeur / 2, b - hauteur
        if self.mode == "plafond":
            return self.cx - largeur / 2, h
        if self.mode == "mur_g":
            return g, self.cy - (hauteur - 120)
        if self.mode == "mur_d":
            return d - largeur, self.cy - (hauteur - 120)
        return self.cx - largeur / 2, self.cy - hauteur / 2
