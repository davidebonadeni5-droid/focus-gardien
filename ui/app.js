// Focus Gardien : interface. Trois vues dans la même page :
//   ?vue=main   tableau de bord (fenêtre principale)
//   ?vue=quiz   interrogatoire quand une app surveillée s'ouvre
//   ?vue=toast  petite notification en bas à droite
//   ?vue=compagnon  le mini Gardien qui se promène en bas de l'écran
// Le Python est joignable via window.pywebview.api. Ouverte dans un navigateur, la page tourne en démo.

// La vue vient de l'adresse (démo dans un navigateur) ou de Python (api.params()) dans l'application.
let P = new URLSearchParams(location.search);
let VUE = P.get("vue") || "main";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ---------- ciel : aurore lente (comme dadotest.ch) ----------
(() => {
  const c = $("#sky"), x = c.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const blobs = [
    { col: [15, 92, 77], r: .55, ax: .18, ay: .22, sp: .00011, ph: 0 },
    { col: [18, 50, 74], r: .6, ax: .82, ay: .18, sp: .00009, ph: 2 },
    { col: [224, 87, 43], r: .42, ax: .78, ay: .92, sp: .00013, ph: 4 },
    { col: [245, 165, 36], r: .22, ax: .3, ay: .95, sp: .00017, ph: 1 },
  ];
  let w = 0, h = 0, last = 0;
  const size = () => { w = c.width = Math.round(innerWidth / 2); h = c.height = Math.round(innerHeight / 2); };
  const draw = (t) => {
    x.fillStyle = "#071512"; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = "lighter";
    const m = Math.max(w, h);
    for (const b of blobs) {
      const cx = (b.ax + Math.sin(t * b.sp + b.ph) * .08) * w, cy = (b.ay + Math.cos(t * b.sp * 1.3 + b.ph) * .07) * h;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, b.r * m);
      g.addColorStop(0, `rgba(${b.col},.55)`); g.addColorStop(1, `rgba(${b.col},0)`);
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }
    x.globalCompositeOperation = "source-over";
  };
  size(); draw(0);
  addEventListener("resize", () => { size(); draw(performance.now()); });
  window.animerCiel = () => {
    if (still || VUE === "toast" || VUE === "compagnon" || getComputedStyle(c).display === "none") return;
    const loop = (t) => { if (t - last > 50 && !document.hidden) { draw(t); last = t; } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  };
})();

// ---------- sons (synthétisés, aucun fichier) ----------
let sonsActifs = true;
const sfx = (() => {
  let ctx;
  const note = (f, t0, d, type = "sine", vol = .14) => {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + t0;
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + d + .02);
  };
  const play = (fn) => () => { if (!sonsActifs) return; try { fn(); } catch { /* pas de son, pas grave */ } };
  return {
    clic: play(() => note(880, 0, .06, "triangle", .06)),
    alerte: play(() => { note(660, 0, .12, "square", .07); note(880, .14, .12, "square", .07); note(660, .28, .18, "square", .07); }),
    ok: play(() => { note(660, 0, .12); note(990, .1, .22); }),
    non: play(() => { note(196, 0, .25, "sawtooth", .08); note(147, .22, .35, "sawtooth", .08); }),
    fanfare: play(() => [523, 659, 784, 1047].forEach((f, i) => note(f, i * .09, i === 3 ? .5 : .14, "triangle", .12))),
    tic: play(() => note(1200, 0, .03, "square", .03)),
  };
})();

// ---------- confettis ----------
function confettis(n = 160) {
  if (!sonsActifs || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = $("#confetti"), x = c.getContext("2d");
  c.width = innerWidth; c.height = innerHeight;
  const cols = ["#F5A524", "#E0572B", "#3FB68B", "#F3EFE6", "#5FD39A"];
  const ps = Array.from({ length: n }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * 120, y: innerHeight * .55,
    vx: (Math.random() - .5) * 14, vy: -Math.random() * 16 - 6, r: Math.random() * 6 + 4,
    a: Math.random() * 6, va: (Math.random() - .5) * .4, c: pick(cols), life: 0,
  }));
  const step = () => {
    x.clearRect(0, 0, c.width, c.height);
    let alive = 0;
    for (const p of ps) {
      p.life++; p.vy += .42; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      if (p.y < c.height + 20) alive++;
      x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.globalAlpha = Math.max(0, 1 - p.life / 140);
      x.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); x.restore();
    }
    if (alive && ps[0].life < 160) requestAnimationFrame(step); else x.clearRect(0, 0, c.width, c.height);
  };
  step();
}

// ---------- accès au Python (ou démo dans un navigateur) ----------
function demo() {
  const jours = [];
  const today = new Date();
  const seed = [35, 50, 0, 75, 100, 25, 60, 90, 50, 0, 75, 125, 100, 50];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const m = seed[13 - i];
    jours.push({ date: d.toISOString().slice(0, 10), minutes: m, pomodoros: Math.round(m / 25), resiste: Math.round(m / 18 + (i % 3)), accorde: i % 2 });
  }
  const st = {
    pomo: P.get("pause") === "1" ? { phase: "pause", fin: Date.now() + 222000 } : null,
    apps: [["steam", "Steam"], ["epicgameslauncher", "Epic Games"], ["robloxplayer", "Roblox"], ["minecraft", "Minecraft"], ["valorant", "Valorant"], ["discord", "Discord"]]
      .map(([cle, nom], i) => ({ cle, nom, actif: i !== 5 })),
    dossiers_jeux: true,
    vocabulaire: [["le chien (allemand)", "der Hund"], ["apprendre (anglais)", "to learn"]],
    reglages: { sons: true, demarrage: true, travail: 25, pause: 5, compagnon: true },
    mdp: true, premier_lancement: P.get("bienvenue") === "1", pass: {}, focus: P.get("focus") === "1", version: "12",
    compte: { nom: "david", connecte: P.get("login") !== "1", erreur: null },
    peut_jouer: true,
    notes: [{ id: "n1", texte: "Acheter un cahier", fait: false }, { id: "n2", texte: "Rendre le livre à Léo", fait: true }],
    scores: { tour: 42 },
    planning: {
      devoirs: [
        { id: "t3", titre: "Rédaction : mon héros", jours: -1, nom: "Français", couleur: "#E0572B" },
        { id: "t2", titre: "Vocabulaire chapitre 3", jours: 0, nom: "Allemand", couleur: "#2E9467" },
        { id: "t1", titre: "Exercices p. 42 à 44", jours: 1, nom: "Maths", couleur: "#2A5A84" },
        { id: "t4", titre: "Fiche de lecture", jours: 5, nom: "Français", couleur: "#E0572B" }],
      tests: [{ id: "e1", titre: "Test fonctions", jours: 2, nom: "Maths", couleur: "#2A5A84" },
        { id: "e2", titre: "Dictée", jours: 9, nom: "Français", couleur: "#E0572B" }],
      cartes: 24, cartes_dues: 7, quand: Math.round(Date.now() / 1000) - 180 },
  };
  const stats = () => ({ jours, aujourdhui: jours[13], serie: 5,
    total: { minutes: 1840, resiste: 96, pomodoros: 71, accorde: 23 } });
  let rep = "";
  return {
    etat: async () => ({ ...st, stats: stats(),
      pomo: st.pomo && { ...st.pomo, reste: Math.max(0, Math.round((st.pomo.fin - Date.now()) / 1000)),
        progres: 1 - (st.pomo.fin - Date.now()) / (st.reglages.travail * 60000) } }),
    demarrer_pomodoro: async () => { st.peut_jouer = false; st.pomo = { phase: "travail", fin: Date.now() + st.reglages.travail * 60000 - 7 * 60000 - 32000 }; },
    arreter_pomodoro: async () => { st.pomo = null; st.peut_jouer = !st.focus; },
    mode_focus: async (v) => { st.focus = v; st.peut_jouer = !v && !(st.pomo && st.pomo.phase === "travail"); },
    basculer_app: async (cle, v) => { st.apps.find((a) => a.cle === cle).actif = v; },
    supprimer_app: async (cle) => { st.apps = st.apps.filter((a) => a.cle !== cle); },
    ajouter_app: async (cle) => { st.apps.push({ cle, nom: cle[0].toUpperCase() + cle.slice(1), actif: true }); return true; },
    programmes_ouverts: async () => ["chrome", "discord", "spotify", "whatsapp", "code", "notepad"],
    dossiers_jeux: async (v) => { st.dossiers_jeux = v; },
    sauver_vocabulaire: async (v) => { st.vocabulaire = v; },
    reglage: async (k, v) => { st.reglages[k] = v; return true; },
    fin_premier_lancement: async () => { st.premier_lancement = false; },
    quitter: async (pw) => pw === "1234",
    cacher: async () => {},
    devoir: async () => P.get("carte") === "1" ? { type: "carte", q: "Que veut dire « der Hund » ?", note: "Allemand · chapitre 3" } : (rep = "56", { type: "calcul", q: "7 × 8 = ?" }),
    reponse_carte: async () => "le chien",
    repondre_carte: async () => {},
    contexte: async () => P.get("contexte") === "1" ? { devoir: { id: "t1", titre: "Exercices p. 42 à 44", jours: 1, nom: "Maths" }, test: { titre: "Test fonctions", jours: 2, nom: "Maths" } } : { devoir: null, test: null },
    connecter: async (n, pw) => pw === "1234" ? (st.compte.connecte = true, { ok: true }) : { ok: false, erreur: "Nom d'utilisateur ou mot de passe incorrect." },
    deconnecter: async () => { st.compte.connecte = false; },
    synchroniser: async () => true,
    cocher_devoir: async (id) => { st.planning.devoirs = st.planning.devoirs.filter((d) => d.id !== id); return true; },
    repondre_devoir: async (t) => ({ ok: String(t).trim() === rep, bonne: rep }),
    fin: async () => {},
    fermer: async () => {},
    ouvrir: async () => {},
    attraper: async () => {},
    ouvrir_memo: async () => {}, ouvrir_jeu: async () => true,
    note_ajouter: async (t) => { st.notes.unshift({ id: String(Date.now()), texte: t, fait: false }); },
    note_basculer: async (id) => { const n = st.notes.find((x) => x.id === id); if (n) n.fait = !n.fait; },
    note_supprimer: async (id) => { st.notes = st.notes.filter((x) => x.id !== id); },
    score: async (jeu, pts) => (st.scores[jeu] = Math.max(st.scores[jeu] || 0, pts)),
    annonce_vue: async () => {},
    params: async () => Object.fromEntries(P),
  };
}

const api = new Proxy({}, {
  get: (_, nom) => async (...args) => {
    const b = await backend;
    return b[nom](...args);
  },
});
const backend = new Promise((ok) => {
  if (window.pywebview?.api) return ok(window.pywebview.api);
  addEventListener("pywebviewready", () => ok(window.pywebview.api));
  setTimeout(() => { if (!window.pywebview) ok(demo()); }, 700);
});

// ---------- textes ----------
const STYLES = {
  moqueur: { cls: "", emoji: "😏",
    ouverture: [
      "Oh, {app} ? Quelle surprise. Personne ne l'avait vu venir. Surtout pas tes devoirs.",
      "{app}, encore ? Vous deux, il faudrait penser à officialiser.",
      "Tu ouvres {app} pour « juste 2 minutes » ? Mon algorithme dit 47 minutes. Minimum.",
      "Je suis le videur de {app}. Ton nom n'est pas sur la liste… mais on peut discuter.",
      "Un pigeon voyageur aurait déjà fini tes devoirs. Juste pour info." ],
    refus: [
      "Verdict : NON. {app} sera encore là ce soir, promis. Tes devoirs, eux, ne se font pas tout seuls.",
      "Refusé ! Même mon grille-pain est plus concentré que toi en ce moment." ],
    accord: [ "Bon, ça passe. {min} minutes de {app}. Je note tout dans mon petit carnet.",
      "OK, tu as gagné. {min} minutes. Je compte. Je compte vraiment." ],
    bloque: "Pomodoro en cours. {app} attendra, il a l'habitude d'être ignoré." },
  coach: { cls: "coach", emoji: "📣",
    ouverture: [
      "HÉ ! {app} ?! UN CHAMPION NE LÂCHE PAS SON ENTRAÎNEMENT ! Réponds à mes questions, et vite !",
      "ALLEZ ALLEZ ALLEZ ! Avant {app}, on fait un petit échauffement du cerveau !",
      "Tu crois que les champions ouvrent {app} en plein entraînement ? PROUVE-MOI QUE TU LE MÉRITES !" ],
    refus: [ "NON ! Retourne sur le terrain ! 10 minutes de travail, et pas une plainte !",
      "Refusé, champion ! La victoire se gagne MAINTENANT, pas sur {app} !" ],
    accord: [ "BIEN JOUÉ ! {min} minutes de récup' sur {app}. Après, RETOUR AU TERRAIN !",
      "Pause méritée ! {min} minutes, et je veux te revoir transpirer sur tes devoirs après !" ],
    bloque: "ON NE S'ARRÊTE PAS EN PLEIN SPRINT ! {app} fermé. ALLEZ !" },
  robot: { cls: "robot", emoji: "🤖",
    ouverture: [
      "ALERTE. DISTRACTION DÉTECTÉE : {app}. NIVEAU DE DANGER : 9000. INTERROGATOIRE ENCLENCHÉ.",
      "BIP BOUP. PROTOCOLE ANTI-{app} ACTIVÉ. VEUILLEZ RÉPONDRE AUX QUESTIONS, HUMAIN.",
      "ERREUR 404 : CONCENTRATION INTROUVABLE. ANALYSE DE L'HUMAIN EN COURS…" ],
    refus: [ "ACCÈS REFUSÉ. {app} A ÉTÉ DÉSINTÉGRÉ. LE MONDE EST SAUVÉ. RETOURNEZ TRAVAILLER, HUMAIN.",
      "CALCUL TERMINÉ. PROBABILITÉ QUE CE SOIT UNE BONNE IDÉE : 0,0003 %. REFUSÉ." ],
    accord: [ "ACCÈS ACCORDÉ POUR {min} MINUTES. MINUTEUR ACTIVÉ. JE VOUS SURVEILLE. BIP.",
      "AUTORISATION TEMPORAIRE : {min} MINUTES. AU-DELÀ, AUTODESTRUCTION DE {app}." ],
    bloque: "MODE POMODORO ACTIF. {app} NEUTRALISÉ. BIP." },
  drame: { cls: "drame", emoji: "🎭",
    ouverture: [
      "Non… pas toi… pas encore {app}… Après tout ce qu'on a vécu ensemble, tes devoirs et moi…",
      "Et c'est ainsi, par un jour ordinaire, que le héros fut tenté par {app}. Va-t-il résister ?",
      "Shakespeare l'avait dit : « Ouvrir {app} ou ne pas l'ouvrir, telle est la question. »" ],
    refus: [ "Le destin a parlé : {app} repart dans l'ombre. Tes devoirs pleurent de joie.",
      "Hélas ! Le héros doit retourner à sa quête. {app} attendra, triste et seul." ],
    accord: [ "Le héros a prouvé sa valeur. {min} minutes de {app} lui sont accordées… pour l'instant.",
      "Qu'il en soit ainsi. {min} minutes. Mais souviens-toi : le temps est un voleur." ],
    bloque: "En plein Pomodoro ?! Quelle trahison ! {app} est banni." },
};
const QUESTIONS = [
  ["Pourquoi tu ouvres {app} ?", [["J'ai un vrai truc précis à faire", 2], ["Je m'ennuie", -2], ["Pour fuir mon travail", -3], ["Aucune idée, ma souris l'a fait toute seule", -1]]],
  ["C'est urgent, genre vraiment urgent ?", [["Oui, quelqu'un m'attend", 2], ["Ça peut attendre 25 minutes", -2], ["Urgent pour mon ennui", -2]]],
  ["Tu as fini ce que tu devais faire aujourd'hui ?", [["Oui, tout fini 😎", 3], ["À moitié", -1], ["J'ai pas commencé…", -3]]],
  ["Combien de temps tu comptes y rester ?", [["2 minutes, chrono en main", 1], ["10 minutes", 0], ["« Juste une partie »", -2], ["Jusqu'à ce que le soleil se couche", -3]]],
  ["Si ton toi du futur te regarde là, il dit quoi ?", [["« Bien joué, tu le mérites »", 2], ["« Mouais… »", -1], ["« Ferme ça, malheureux »", -3]]],
  ["Tu as bu de l'eau récemment ?", [["Oui, je suis une plante bien arrosée", 1], ["Non… je vais y aller", 0]]],
  ["Note ton niveau de fatigue :", [["Frais comme un gardon", -1], ["Un peu crevé, une pause me ferait du bien", 2], ["Zombie", 0]]],
];

// ============================== vue principale ==============================
let etat = null;

function montrerPage(nom) {
  $$(".nav[data-page]").forEach((b) => {
    if (b.dataset.page === nom) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  $$(".page").forEach((p) => p.classList.toggle("on", p.id === "p-" + nom));
  if (nom === "stats") rendreStats();
  if (nom === "apps") { rendreApps(); rafraichirProgrammes(); }
  if (nom === "devoirs") $("#vocab").value = etat.vocabulaire.map(([q, r]) => `${q} = ${r}`).join("\n");
  if (nom === "reglages") rendreReglages();
}

// minuteur : gros chiffres, barre de progression, 4 points par cycle de Pomodoros
let phasePrec = null;
function minuteur(reste, prog, phase, faits) {
  const [m, s] = mmss(reste).split(":");
  $("#ringT").innerHTML = `${m}<i>:</i>${s}`;
  $("#ringPh").textContent = { libre: "pomodoro", travail: "focus", pause: "pause" }[phase];
  $("#pbar").style.width = Math.max(0, Math.min(1, prog)) * 100 + "%";
  $("#timer").className = "timer " + phase;
  const n = faits % 4;
  $("#cycle").innerHTML = [0, 1, 2, 3].map((k) => `<b class="${k < n ? "on" : ""}"></b>`).join("");
  if (phasePrec && phasePrec !== phase && phase === "pause") confettis(90);
  phasePrec = phase;
}

function rendreAccueil() {
  const p = etat.pomo, phase = p ? p.phase : "libre";
  const total = (p?.phase === "pause" ? etat.reglages.pause : etat.reglages.travail) * 60;
  const reste = p ? p.reste : total, prog = p ? p.progres : 0;
  minuteur(reste, prog, phase, etat.stats.aujourdhui.pomodoros);
  $("#btnPomo").textContent = p ? "Arrêter" : "Démarrer";
  $("#btnJeu").hidden = !etat.peut_jouer;  // toujours là, sauf quand on travaille
  $("#btnPomo").classList.toggle("primary", !p);

  // mode focus : allumé à la main, ou forcé pendant le travail d'un Pomodoro
  const bloque = etat.focus || phase === "travail";
  $("#focusSw").checked = etat.focus;
  $("#focusCard").classList.toggle("on", etat.focus);
  const actives = etat.apps.filter((x) => x.actif).length;
  $("#focusTxt").textContent = etat.focus
    ? `Allumé : je surveille ${actives} apps${etat.dossiers_jeux ? " + tes jeux" : ""}.`
    : phase === "travail" ? "Éteint, mais le Pomodoro bloque tes apps jusqu'à la pause." : "Éteint : tes apps sont libres.";
  $("#etat").classList.toggle("on", bloque);
  $("#etatT").textContent = phase === "travail" ? `Pomodoro · ${mmss(reste)}` : phase === "pause" ? `Pause · ${mmss(reste)}` : etat.focus ? "Mode focus allumé" : "Mode focus éteint";

  const a = etat.stats.aujourdhui, live = p?.phase === "travail" ? Math.floor((total - reste) / 60) : 0;
  $("#resume").innerHTML = `Aujourd'hui : <b>${a.minutes + live} min</b> concentré · <b>${a.resiste}</b> résistées · 🔥 <b>${etat.stats.serie}</b> ${etat.stats.serie > 1 ? "jours" : "jour"}`;
}

// graphique en barres, une seule série, survol avec info-bulle
function barres(el, jours, cle, couleur, unite) {
  const W = Math.max(280, el.clientWidth || 520), H = 200, L = 34, B = 26, T = 10;
  const max = Math.max(...jours.map((j) => j[cle]), 1);
  const pas = max <= 5 ? 1 : max <= 12 ? 2 : max <= 60 ? 15 : max <= 120 ? 30 : 60;
  const top = Math.ceil(max / pas) * pas;
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const bw = (W - L) / jours.length, larg = Math.min(26, bw - 6);
  const fmtJ = (d) => new Intl.DateTimeFormat("fr-CH", { weekday: "short" }).format(new Date(d + "T12:00")).replace(".", "");
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(unite)} par jour"><g class="grid">`;
  for (let v = 0; v <= top; v += pas) s += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/>`;
  s += `</g><g class="axis">`;
  for (let v = 0; v <= top; v += pas) s += `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  jours.forEach((j, i) => { if (i % 2 === 1 || i === jours.length - 1) s += `<text x="${L + bw * i + bw / 2}" y="${H - 6}" text-anchor="middle">${i === jours.length - 1 ? "auj." : fmtJ(j.date)}</text>`; });
  s += `</g>`;
  jours.forEach((j, i) => {
    const v = j[cle], x0 = L + bw * i + (bw - larg) / 2, y0 = y(v), h = H - B - y0;
    if (v > 0) {
      const r = Math.min(4, h);
      s += `<path class="bar-m" data-i="${i}" fill="${couleur}" d="M${x0},${H - B} V${y0 + r} q0,-${r} ${r},-${r} h${larg - 2 * r} q${r},0 ${r},${r} V${H - B} Z"/>`;
    }
    s += `<rect class="hit" data-i="${i}" x="${L + bw * i}" y="${T}" width="${bw}" height="${H - T - B}"/>`;
  });
  s += `</svg><div class="tip"></div>`;
  el.innerHTML = s;
  const tip = $(".tip", el);
  $$(".hit", el).forEach((r) => {
    r.addEventListener("mouseenter", () => {
      const i = +r.dataset.i, j = jours[i];
      $$(".bar-m", el).forEach((b) => b.classList.toggle("on", +b.dataset.i === i));
      const d = new Intl.DateTimeFormat("fr-CH", { weekday: "long", day: "numeric", month: "short" }).format(new Date(j.date + "T12:00"));
      tip.innerHTML = `<span class="k">${esc(d)}</span><br><b>${j[cle]}</b> ${esc(unite)}`;
      tip.style.left = Math.min(Math.max(L + bw * i + bw / 2, 80), W - 80) + "px";
      tip.style.top = y(j[cle]) + "px";
      tip.classList.add("on");
    });
    r.addEventListener("mouseleave", () => { tip.classList.remove("on"); $$(".bar-m", el).forEach((b) => b.classList.remove("on")); });
  });
}

function rendreStats() {
  const s = etat.stats;
  const h = Math.floor(s.total.minutes / 60);
  $("#sMin").innerHTML = h ? `${h}<small>h</small> ${s.total.minutes % 60}<small>min</small>` : `${s.total.minutes}<small>min</small>`;
  $("#sRes").textContent = s.total.resiste;
  $("#sPomo").textContent = s.total.pomodoros;
  $("#sSerie").innerHTML = `${s.serie}<small>${s.serie > 1 ? "jours" : "jour"}</small>`;
  barres($("#chMin"), s.jours, "minutes", "#D9890B", "minutes concentré");
  barres($("#chRes"), s.jours, "resiste", "#2E9467", "tentations résistées");
  $("#tbl").innerHTML = `<tr><th>Jour</th><th>Minutes</th><th>Pomodoros</th><th>Résistées</th><th>Pauses</th></tr>` +
    s.jours.slice().reverse().map((j) => `<tr><td>${esc(j.date)}</td><td>${j.minutes}</td><td>${j.pomodoros}</td><td>${j.resiste}</td><td>${j.accorde}</td></tr>`).join("");
}

function rendreApps() {
  const ligne = (cle, nom, sous, actif, suppr) => `
    <div class="item"><div class="nm"><b>${esc(nom)}</b><small>${esc(sous)}</small></div>
      <label class="sw"><input type="checkbox" data-cle="${esc(cle)}" ${actif ? "checked" : ""}><i></i></label>
      ${suppr ? `<button class="x" data-suppr="${esc(cle)}" title="Enlever">✕</button>` : '<span style="width:32px"></span>'}</div>`;
  $("#appList").innerHTML = ligne("__jeux", "Tous les jeux installés", "dossiers Steam, Epic, Riot, Ubisoft", etat.dossiers_jeux, false) +
    etat.apps.map((a) => ligne(a.cle, a.nom, a.cle + ".exe", a.actif, true)).join("");
  $$("#appList input").forEach((i) => i.onchange = async () => {
    sfx.clic();
    if (i.dataset.cle === "__jeux") await api.dossiers_jeux(i.checked); else await api.basculer_app(i.dataset.cle, i.checked);
    await rafraichir();
  });
  $$("#appList [data-suppr]").forEach((b) => b.onclick = async () => { sfx.clic(); await api.supprimer_app(b.dataset.suppr); await rafraichir(); rendreApps(); rafraichirProgrammes(); });
}

async function rafraichirProgrammes() {
  const noms = await api.programmes_ouverts();
  $("#running").innerHTML = noms.length ? noms.map((n) => `<button class="chip" data-n="${esc(n)}">+ ${esc(n)}</button>`).join("")
    : '<p class="note">Rien de nouveau à ajouter.</p>';
  $$("#running .chip").forEach((c) => c.onclick = async () => { sfx.ok(); await api.ajouter_app(c.dataset.n, c.dataset.n); await rafraichir(); rendreApps(); c.remove(); });
}

function rendreReglages() {
  const r = etat.reglages;
  $("#rSons").checked = r.sons; $("#rDemarrage").checked = r.demarrage; $("#rCompagnon").checked = r.compagnon;
  $("#rTravail").value = r.travail; $("#rPause").value = r.pause;
  $("#version").textContent = etat.version ? `Focus Gardien · version ${etat.version}` : "";
  $("#compteNom").textContent = etat.compte.connecte ? etat.compte.nom : "Pas connecté";
}

async function rafraichir() {
  etat = await api.etat();
  sonsActifs = etat.reglages.sons;
  rendreAccueil();
  rendrePlanning();
  // connexion Dadotest obligatoire : sans compte, l'écran de connexion reste devant
  const m = $("#mLogin");
  if (!etat.compte.connecte && m.hidden) {
    m.hidden = false;
    $("#lStartRow").hidden = !etat.premier_lancement;
    $("#lMsg").textContent = etat.compte.erreur || "";
    if (etat.compte.nom) $("#lNom").value = etat.compte.nom;
    setTimeout(() => ($("#lNom").value ? $("#lPw") : $("#lNom")).focus(), 50);
  }
}

// devoirs et tests de Dadotest (redessinés seulement quand ils changent)
let planPrec = "";
const quandTxt = (j) => j === null ? "" : j < 0 ? (j === -1 ? "hier" : `il y a ${-j} j`) : j === 0 ? "aujourd'hui" : j === 1 ? "demain" : `dans ${j} j`;
function rendrePlanning() {
  const p = etat.planning, c = etat.compte;
  const sync = !c.connecte ? "pas connecté" : c.erreur ? "⚠ " + c.erreur
    : p.quand ? `Dadotest · ${Math.max(0, Math.round((Date.now() / 1000 - p.quand) / 60))} min` : "Dadotest";
  $("#syncTxt").textContent = sync;
  $("#btnSync").classList.toggle("err", !!c.erreur);
  const cle = JSON.stringify([p.devoirs, p.tests]);
  if (cle === planPrec) return;
  planPrec = cle;
  const devoirs = p.devoirs.slice(0, 6);
  $("#devoirs").innerHTML = devoirs.length ? devoirs.map((d) => `
    <label class="devoir"><input type="checkbox" data-id="${esc(d.id)}">
      <span class="pt" style="background:${esc(d.couleur)}"></span>
      <span class="nm"><b>${esc(d.titre)}</b><small>${esc(d.nom)}</small></span>
      <span class="quand ${d.jours !== null && d.jours <= 0 ? "urgent" : d.jours === 1 ? "bientot" : ""}">${quandTxt(d.jours)}</span></label>`).join("")
    : `<p class="vide">${c.connecte ? "Rien à faire. Profite ! 🎉" : "Connecte-toi pour voir tes devoirs."}</p>`;
  $$("#devoirs input").forEach((i) => i.onchange = async () => {
    const ligne = i.closest(".devoir");
    ligne.classList.toggle("fait", i.checked);
    if (i.checked) { sfx.fanfare(); confettis(70); } else sfx.clic();
    await api.cocher_devoir(i.dataset.id, i.checked);
    setTimeout(rafraichir, 900);
  });
  $("#tests").innerHTML = p.tests.slice(0, 3).map((t) => `
    <span class="test ${t.jours <= 2 ? "proche" : ""}"><span class="j">${t.jours === 0 ? "auj." : "J-" + t.jours}</span><b>${esc(t.titre)}</b><span class="note">${esc(t.nom)}</span></span>`).join("");
}

window.demanderQuitter = () => {
  $("#quitF").hidden = !etat?.mdp;
  $("#quitPw").value = ""; $("#quitMsg").textContent = "";
  $("#mQuit").hidden = false;
  sfx.alerte();
  setTimeout(() => (etat?.mdp ? $("#quitPw") : $("#quitStay")).focus(), 50);
};

async function initMain() {
  $("#shell").hidden = false;
  await rafraichir();
  setInterval(rafraichir, 1000);
  addEventListener("resize", () => { if ($("#p-stats").classList.contains("on")) rendreStats(); });

  $$(".nav[data-page]").forEach((b) => b.onclick = () => { sfx.clic(); montrerPage(b.dataset.page); });
  $$("[data-go]").forEach((b) => b.onclick = () => { sfx.clic(); montrerPage(b.dataset.go); });
  $("#focusSw").onchange = async (e) => {
    const on = e.target.checked;
    (on ? sfx.fanfare : sfx.clic)();
    await api.mode_focus(on);
    await rafraichir();
  };
  $("#btnJeu").onclick = async () => { sfx.fanfare(); await api.ouvrir_jeu(); };
  $("#btnPomo").onclick = async () => {
    if (etat.pomo) { sfx.non(); await api.arreter_pomodoro(); } else { sfx.fanfare(); await api.demarrer_pomodoro(); }
    await rafraichir();
  };
  const ajouter = async () => {
    const n = $("#addName").value.trim();
    if (!n) return;
    sfx.ok(); await api.ajouter_app(n, n); $("#addName").value = ""; await rafraichir(); rendreApps();
  };
  $("#btnAdd").onclick = ajouter;
  $("#addName").onkeydown = (e) => { if (e.key === "Enter") ajouter(); };
  $("#btnRefresh").onclick = () => { sfx.clic(); rafraichirProgrammes(); };

  $("#btnVocab").onclick = async () => {
    const v = $("#vocab").value.split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
      .filter(([q, r]) => q && r);
    await api.sauver_vocabulaire(v); await rafraichir();
    sfx.ok(); $("#vocabMsg").className = "msg ok"; $("#vocabMsg").textContent = `✓ ${v.length} mots enregistrés`;
  };

  $("#rSons").onchange = async (e) => { await api.reglage("sons", e.target.checked); await rafraichir(); sfx.clic(); };
  $("#rCompagnon").onchange = async (e) => { sfx.clic(); await api.reglage("compagnon", e.target.checked); await rafraichir(); };
  $("#rDemarrage").onchange = async (e) => { sfx.clic(); await api.reglage("demarrage", e.target.checked); await rafraichir(); };
  $("#rTravail").onchange = async (e) => { await api.reglage("travail", +e.target.value || 25); await rafraichir(); rendreReglages(); };
  $("#rPause").onchange = async (e) => { await api.reglage("pause", +e.target.value || 5); await rafraichir(); rendreReglages(); };
  $("#btnLogout").onclick = async () => {
    if (!confirm("Te déconnecter de Dadotest ? Il faudra te reconnecter pour utiliser le Gardien.")) return;
    sfx.clic(); await api.deconnecter(); planPrec = ""; await rafraichir();
  };
  $("#btnSync").onclick = async () => { sfx.clic(); $("#syncTxt").textContent = "synchro…"; await api.synchroniser(); planPrec = ""; await rafraichir(); };
  $("#fLogin").onsubmit = async (e) => {
    e.preventDefault();
    const nom = $("#lNom").value.trim(), pw = $("#lPw").value;
    if (!nom || !pw) { sfx.non(); $("#lMsg").textContent = "Il faut ton nom et ton mot de passe Dadotest."; return; }
    $("#lGo").disabled = true; $("#lGo").textContent = "Connexion…"; $("#lMsg").textContent = "";
    if (etat.premier_lancement) await api.reglage("demarrage", $("#lStart").checked);
    const r = await api.connecter(nom, pw);
    $("#lGo").disabled = false; $("#lGo").textContent = "Se connecter";
    if (!r.ok) {
      sfx.non(); $("#lMsg").textContent = r.erreur; $("#lPw").value = "";
      const w = $("#mLogin .win"); w.classList.remove("shake"); void w.offsetWidth; w.classList.add("shake");
      return;
    }
    $("#lPw").value = ""; $("#mLogin").hidden = true; planPrec = "";
    sfx.fanfare(); confettis(); await rafraichir();
  };

  $("#btnQuit").onclick = window.demanderQuitter;
  $("#quitStay").onclick = () => { sfx.ok(); $("#mQuit").hidden = true; };
  const quitter = async () => {
    if (await api.quitter($("#quitPw").value)) return;
    sfx.non(); $("#quitMsg").textContent = "Mauvais mot de passe. Bien essayé. 😏";
    const w = $("#mQuit .win"); w.classList.remove("shake"); void w.offsetWidth; w.classList.add("shake");
  };
  $("#quitGo").onclick = quitter;
  $("#quitPw").onkeydown = (e) => { if (e.key === "Enter") quitter(); };

  if (P.get("page")) montrerPage(P.get("page"));
}

// ============================== interrogatoire ==============================
async function initQuiz() {
  document.body.classList.add("quiz");
  const st = $("#stage"); st.hidden = false;
  try { sonsActifs = (await api.etat()).reglages.sons; } catch { /* démo */ }
  const app = (P.get("app") || "cette app").slice(0, 40);
  const style = STYLES[P.get("style")] || STYLES[pick(Object.keys(STYLES))];
  const f = (t, extra = {}) => t.replace(/\{app\}/g, app).replace(/\{(\w+)\}/g, (m, k) => extra[k] ?? m);
  // contexte Dadotest : un devoir pour aujourd'hui/demain pas fini, un test dans les 2 jours
  let ctx = { devoir: null, test: null };
  try { ctx = (await api.contexte()) || ctx; } catch { /* pas de Dadotest */ }
  const qs = shuffle(QUESTIONS).slice(0, ctx.devoir ? 2 : 3);
  if (ctx.devoir) {
    const d = ctx.devoir, quand = d.jours < 0 ? "en retard" : d.jours === 0 ? "pour aujourd'hui" : "pour demain";
    qs.unshift([`Ton devoir « ${d.titre} »${d.nom ? ` (${d.nom})` : ""}, ${quand}, il est fini ?`,
      [["Oui, il est prêt ✅", 3], ["Pas encore…", -3], ["J'avais oublié qu'il existait 😬", -4]]]);
  }
  const N = qs.length + 1;
  const seuil = ctx.test ? 3 : 1;  // plus strict juste avant un test
  let score = 0, i = 0;

  const carte = (inner, etape = null) => {
    st.innerHTML = `<div class="win qcard"><div class="bar"><span></span><span></span><span></span><em>gardien.exe — ${esc(app)}</em></div>
      <div class="body">${etape !== null ? `<div class="q-step"><span>Question ${Math.min(etape + 1, N)} / ${N}</span><span>${style.emoji}</span></div>
      <div class="q-bar"><i style="width:${(etape / N) * 100}%"></i></div>` : ""}${inner}</div></div>`;
    requestAnimationFrame(() => { const b = $(".q-bar i", st); if (b) b.style.width = ((etape + 1) / N) * 100 + "%"; });
  };
  const fin = async (minutes) => { await api.fin(minutes); };
  const refus = (msg, titre = "Retour au travail 💪") => {
    sfx.fanfare(); confettis();
    carte(`<div class="q-badge">🏆</div><p class="q-app">+1 tentation résistée</p><h1 class="q-title">${titre}</h1>
      <p class="q-joke ${style.cls}">${esc(msg)}</p><div class="q-btns"><button class="btn primary block" id="ok">D'accord 💪</button></div>`);
    $("#ok").onclick = () => fin(0);
    $("#ok").focus();
  };

  const accueil = () => {
    sfx.alerte();
    carte(`<p class="q-app">${esc(app)}</p><h1 class="q-title">Hop hop hop ✋</h1>
      <p class="q-joke ${style.cls}">${esc(f(pick(style.ouverture)))}</p>
      ${ctx.test ? `<p class="q-reponse" style="font-size:14.5px">📅 ${esc(ctx.test.titre)}${ctx.test.nom ? ` (${esc(ctx.test.nom)})` : ""} ${ctx.test.jours === 0 ? "c'est aujourd'hui" : ctx.test.jours === 1 ? "c'est demain" : `dans ${ctx.test.jours} jours`} : je serai plus strict.</p>` : ""}
      <div class="q-btns"><button class="btn primary block" id="go">D'accord, interroge-moi</button>
      <button class="btn block" id="back">En fait, je retourne travailler</button></div>`);
    $("#go").onclick = () => { sfx.clic(); question(); };
    $("#back").onclick = () => refus("Tu as fui avant même l'interrogatoire. Respect. 🫡", "Légende 👑");
  };
  const question = () => {
    if (i >= qs.length) return devoir();
    const [q, reps] = qs[i];
    carte(`<h1 class="q-title">${esc(f(q))}</h1><div class="q-btns">${shuffle(reps).map(([t, p]) => `<button class="btn block" data-p="${p}">${esc(t)}</button>`).join("")}</div>`, i);
    $$("[data-p]", st).forEach((b) => b.onclick = () => { sfx.clic(); score += +b.dataset.p; i++; question(); });
  };
  const devoir = async () => {
    const d = await api.devoir();
    if (d.type === "carte") return carteRevision(d);
    carte(`<p class="q-app">Question de devoirs 📚</p><div class="q-math">${esc(d.q)}</div>
      <input class="in" id="rep" autocomplete="off" inputmode="numeric" placeholder="Ta réponse" style="font-size:18px;margin-bottom:12px">
      <div class="q-btns"><button class="btn primary block" id="val">Valider</button></div>`, qs.length);
    const input = $("#rep"); input.focus();
    const check = async () => {
      const r = await api.repondre_devoir(input.value);
      if (r.ok) { sfx.ok(); return attente(10); }
      sfx.non();
      carte(`<div class="q-badge">❌</div><h1 class="q-title">Raté !</h1>
        <p class="q-joke ${style.cls}">La bonne réponse était « ${esc(r.bonne)} ». ${esc(app)} attendra que ton cerveau soit chaud.</p>
        <div class="q-btns"><button class="btn primary block" id="ok">D'accord… 😔</button></div>`);
      $("#ok").onclick = () => fin(0);
    };
    $("#val").onclick = check;
    input.onkeydown = (e) => { if (e.key === "Enter") check(); };
  };
  // carte de révision Dadotest : on réfléchit, on retourne la carte, on dit honnêtement si on savait
  const carteRevision = (d) => {
    let n = 4;
    carte(`<p class="q-app">Carte de révision 🃏</p><h1 class="q-title">${esc(d.q)}</h1>
      ${d.note ? `<p class="q-note">${esc(d.note)}</p>` : ""}
      <p class="q-joke">Réfléchis à la réponse dans ta tête…</p>
      <div class="q-btns"><button class="btn primary block" id="voir" disabled>Voir la réponse (${n})</button></div>`, qs.length);
    const t = setInterval(() => {
      n--;
      const b = $("#voir");
      if (!b) return clearInterval(t);
      if (n > 0) b.textContent = `Voir la réponse (${n})`;
      else { clearInterval(t); b.disabled = false; b.textContent = "Voir la réponse"; }
    }, 1000);
    $("#voir").onclick = async () => {
      sfx.clic();
      const a = await api.reponse_carte();
      carte(`<p class="q-app">Carte de révision 🃏</p><h1 class="q-title">${esc(d.q)}</h1>
        <div class="q-reponse">${esc(a)}</div>
        <div class="q-btns"><button class="btn primary block" id="oui">Je savais ✅</button><button class="btn block" id="non">Je savais pas ❌</button></div>`, qs.length);
      $("#oui").onclick = async () => { sfx.ok(); await api.repondre_carte(true); attente(10); };
      $("#non").onclick = async () => {
        await api.repondre_carte(false);
        refus("Pas grave, c'est comme ça qu'on apprend. Cette carte revient demain dans ta révision Dadotest. Révise-la, et après on verra pour " + app + ".", "À réviser 📚");
      };
    };
  };
  const attente = (n) => {
    const total = n;
    carte(`<p class="q-app">${esc(app)}</p><h1 class="q-title">Délibération du jury…</h1>
      <div class="q-count"><div class="ring"><svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="54" fill="none" stroke-width="6"/>
      <circle class="prog" id="cp" cx="60" cy="60" r="54" fill="none" stroke-width="6" stroke-dasharray="339.3" stroke-dashoffset="0"/></svg>
      <div class="ctr"><div class="t" id="cn">${n}</div></div></div></div>
      <p class="q-joke" style="text-align:center">Respire… Les envies durent souvent moins de 10 secondes. Tu en as toujours envie ?</p>
      <div class="q-btns"><button class="btn block" id="back">J'ai plus envie, je retourne bosser</button></div>`);
    const t = setInterval(() => {
      n--; sfx.tic();
      if ($("#cn")) { $("#cn").textContent = n; $("#cp").style.strokeDashoffset = String(339.3 * (1 - n / total)); }
      if (n <= 0) { clearInterval(t); verdict(); }
    }, 1000);
    $("#back").onclick = () => { clearInterval(t); refus("L'envie est passée toute seule. Le Gardien est fier de toi.", "Bien joué 🏆"); };
  };
  const verdict = () => {
    if (score < seuil) return refus(ctx.test ? `${ctx.test.titre} approche : pas de ${app} maintenant. Révise, tu me remercieras.` : f(pick(style.refus)));
    let min = score >= 5 ? 15 : score >= 3 ? 10 : 5;
    if (ctx.test) min = 5;  // la veille d'un test, juste une petite pause
    sfx.ok();
    carte(`<div class="q-badge">✅</div><p class="q-app">${esc(app)}</p><h1 class="q-title">Accordé</h1>
      <p class="q-joke ${style.cls}">${esc(f(pick(style.accord), { min }))}</p>
      <div class="q-btns"><button class="btn primary block" id="go">Merci ! (${min} min)</button>
      <button class="btn block" id="back">Non, finalement je reste concentré</button></div>`);
    $("#go").onclick = () => fin(min);
    $("#back").onclick = () => refus("Tu avais le droit et tu as dit non. Légende.", "Respect 👑");
  };
  accueil();
}

// ============================== notification ==============================
async function initToast() {
  document.body.classList.add("toast");
  const st = $("#stage"); st.hidden = false;
  try { sonsActifs = (await api.etat()).reglages.sons; } catch { /* démo */ }
  let e = {};
  try { e = JSON.parse(P.get("data") || "{}"); } catch { /* vide */ }
  const style = STYLES[pick(Object.keys(STYLES))];
  const app = e.app || "l'app";
  const contenu = {
    pause: ["☕", e.titre, e.texte, 8],
    travail: ["💪", e.titre, e.texte, 8],
    bloque: ["🛡️", "Pas pendant le Pomodoro !", style.bloque.replace(/\{app\}/g, app) + (e.reste ? ` Encore ${mmss(e.reste)}.` : ""), 7],
    fin: ["⏰", "Temps écoulé !", `Ton temps sur ${app} est fini. Je le ferme dans 30 secondes. Sauvegarde !`, 30],
  }[e.type] || ["🛡️", e.titre || "Focus Gardien", e.texte || "", 7];
  const [ic, titre, texte, secs] = contenu;
  st.innerHTML = `<div class="toastc"><div class="ic">${ic}</div><div><h3>${esc(titre)}</h3><p>${esc(texte)}</p></div>
    <button class="x" id="x">✕</button><div class="time" style="animation-duration:${secs}s"></div></div>`;
  (e.type === "bloque" ? sfx.non : e.type === "pause" ? sfx.fanfare : sfx.alerte)();
  const fermer = () => api.fermer();
  $("#x").onclick = fermer;
  setTimeout(fermer, secs * 1000);
}

// ============================== mini Gardien ==============================
const BONHOMME = `
<svg viewBox="0 0 100 110" aria-hidden="true">
  <defs>
    <linearGradient id="bc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFC556"/><stop offset="1" stop-color="#E0862B"/></linearGradient>
    <linearGradient id="tank" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6E7781"/><stop offset=".45" stop-color="#C9D1D9"/><stop offset="1" stop-color="#6E7781"/></linearGradient>
  </defs>
  <ellipse class="ombre" cx="50" cy="104" rx="24" ry="4.5" fill="rgba(0,0,0,.35)"/>
  <!-- parachute (ambre et blanc), tenu à deux mains -->
  <g class="para">
    <g stroke="#7A5524" stroke-width=".9"><line x1="8" y1="-38" x2="45" y2="9"/><line x1="30" y1="-40" x2="45" y2="9"/><line x1="70" y1="-40" x2="55" y2="9"/><line x1="92" y1="-38" x2="55" y2="9"/></g>
    <path d="M6 -38 Q50 -112 94 -38 Q86 -44 78 -38 Q70 -44 62 -38 Q56 -44 50 -38 Q44 -44 38 -38 Q30 -44 22 -38 Q14 -44 6 -38Z" fill="#FFFDF8" stroke="#9A5A12" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M50 -94 C26 -92 10 -64 6 -38 Q14 -44 22 -38 C26 -60 38 -86 50 -94Z" fill="#F0A020"/>
    <path d="M50 -94 C46 -80 44 -58 38 -38 Q44 -44 50 -38 Q56 -44 62 -38 C56 -58 54 -80 50 -94Z" fill="#F0A020"/>
    <path d="M50 -94 C74 -92 90 -64 94 -38 Q86 -44 78 -38 C74 -60 62 -86 50 -94Z" fill="#F0A020"/>
  </g>
  <g class="corps">
    <!-- jetpack (murs) : deux réservoirs derrière, flammes dessous -->
    <g class="jet">
      <g class="flammes">
        <g class="fl"><path d="M17 74 Q7 96 17 120 Q27 96 17 74Z" fill="#FF6A1F" opacity=".9"/><path d="M17 75 Q10 92 17 110 Q24 92 17 75Z" fill="#FFA62B"/><path d="M17 76 Q13 88 17 99 Q21 88 17 76Z" fill="#FFF0A8"/></g>
        <g class="fl"><path d="M83 74 Q73 96 83 120 Q93 96 83 74Z" fill="#FF6A1F" opacity=".9"/><path d="M83 75 Q76 92 83 110 Q90 92 83 75Z" fill="#FFA62B"/><path d="M83 76 Q79 88 83 99 Q87 88 83 76Z" fill="#FFF0A8"/></g>
      </g>
      <rect x="10" y="36" width="14" height="36" rx="6" fill="url(#tank)" stroke="#4A525B" stroke-width="1.5"/>
      <rect x="76" y="36" width="14" height="36" rx="6" fill="url(#tank)" stroke="#4A525B" stroke-width="1.5"/>
      <rect x="13" y="70" width="8" height="6" rx="1.5" fill="#3A4047"/><rect x="79" y="70" width="8" height="6" rx="1.5" fill="#3A4047"/>
    </g>
    <!-- jambes avec pieds (chaussures) -->
    <g class="jambe jg"><rect x="37" y="80" width="9" height="15" rx="4.5" fill="#3A2408"/><ellipse cx="38.5" cy="96.5" rx="7.5" ry="4.3" fill="#24170A"/><ellipse cx="36.5" cy="95" rx="3" ry="1.4" fill="#5B4126"/></g>
    <g class="jambe jd"><rect x="54" y="80" width="9" height="15" rx="4.5" fill="#3A2408"/><ellipse cx="61.5" cy="96.5" rx="7.5" ry="4.3" fill="#24170A"/><ellipse cx="63.5" cy="95" rx="3" ry="1.4" fill="#5B4126"/></g>
    <path class="plume" d="M50 16 C 44 4, 56 0, 62 6 C 56 6, 54 10, 52 16 Z" fill="#E0572B"/>
    <path d="M50 14 L82 26 C 83 52, 74 78, 50 90 C 26 78, 17 52, 18 26 Z" fill="url(#bc)" stroke="#9A5A12" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M50 20 L76 30 C 76 40, 74 46, 72 50 L 28 50 C 26 46, 24 40, 24 30 Z" fill="#FFE2A6" opacity=".35"/>
    <g class="oeil"><ellipse cx="40" cy="44" rx="6.5" ry="8" fill="#fff"/><circle cx="41.5" cy="45.5" r="3.6" fill="#071512"/><circle cx="43" cy="43.5" r="1.3" fill="#fff"/></g>
    <g class="oeil"><ellipse cx="60" cy="44" rx="6.5" ry="8" fill="#fff"/><circle cx="61.5" cy="45.5" r="3.6" fill="#071512"/><circle cx="63" cy="43.5" r="1.3" fill="#fff"/></g>
    <ellipse cx="32" cy="56" rx="4" ry="2.5" fill="#E0572B" opacity=".45"/><ellipse cx="68" cy="56" rx="4" ry="2.5" fill="#E0572B" opacity=".45"/>
    <ellipse class="bouche" cx="50" cy="60" rx="5" ry="3" fill="#5A1E08"/>
    <!-- bras le long du corps, avec mains -->
    <g class="bras bg"><path d="M22 56 Q14 62 13 72" stroke="#9A5A12" stroke-width="5.5" stroke-linecap="round" fill="none"/><circle cx="13" cy="74" r="5.2" fill="#FFC556" stroke="#9A5A12" stroke-width="2"/></g>
    <g class="bras bd"><path d="M78 56 Q86 62 87 72" stroke="#9A5A12" stroke-width="5.5" stroke-linecap="round" fill="none"/><circle cx="87" cy="74" r="5.2" fill="#FFC556" stroke="#9A5A12" stroke-width="2"/></g>
    <!-- bras levés (parachute, chute, atterrissage) -->
    <g class="haut">
      <path d="M26 50 Q22 28 45 10" stroke="#9A5A12" stroke-width="5.5" stroke-linecap="round" fill="none"/><circle cx="45" cy="9" r="5.2" fill="#FFC556" stroke="#9A5A12" stroke-width="2"/>
      <path d="M74 50 Q78 28 55 10" stroke="#9A5A12" stroke-width="5.5" stroke-linecap="round" fill="none"/><circle cx="55" cy="9" r="5.2" fill="#FFC556" stroke="#9A5A12" stroke-width="2"/>
    </g>
  </g>
</svg>`;

const PHRASES = {
  libre: [
    "Psst… et si on lançait un Pomodoro ? 🍅", "Je m'ennuie. Toi aussi ? Allez, on bosse !",
    "J'ai vu ton sac de cours. Il pleure.", "25 minutes. C'est rien. Même moi je peux.",
    "Je monte la garde 🛡️", "Bip. Je surveille Steam. Steam a peur.",
    "Un petit exercice, et après une pause ?", "Tu savais ? Les champions boivent de l'eau 💧",
    "Je suis petit, mais je vois tout 👀", "Hé ! Ça va ? Moi je marche, c'est mon cardio." ],
  travail: [ "Concentre-toi, je surveille 👀", "Tu gères !", "Encore {reste}, tiens bon !",
    "Chut… on bosse.", "Je suis fier de toi.", "Une chose à la fois. Tu y es presque." ],
  pause: [ "Pause ! Étire-toi 🙆", "Bois de l'eau 💧", "Regarde au loin, tes yeux te disent merci.",
    "Profite, ça repart dans {reste}." ],
  resiste: [ "Et BIM ! Une tentation de moins 💪", "Légende. Pure légende.", "J'ai tout vu. Bravo ! 🏆", "Le jeu a perdu. Toi tu gagnes." ],
  clic: [ "Hé ! Ça chatouille !", "Je suis petit mais costaud 💪", "Tu me cliques au lieu de bosser ? 😏",
    "Bip boup. Je suis ton Gardien.", "Double-clique pour ouvrir mon QG.", "Arrête, je vais rougir…" ],
};

async function initCompagnon() {
  document.body.classList.add("compagnon");
  // fond vraiment transparent (sinon le thème sombre peint un fond opaque)
  document.documentElement.style.colorScheme = "normal";
  document.documentElement.style.background = "transparent";
  const st = $("#stage"); st.hidden = false;
  st.innerHTML = `<div class="zzz"><span>z</span><span>z</span><span>z</span></div><div class="bulle-pos"><div class="bulle" id="bulle"></div></div>
    <div class="perso"><div class="bonhomme" id="bh" title="Mini Gardien">${BONHOMME}</div></div>`;
  st.className = "stage pose-sol";
  const bh = $("#bh"), bulle = $("#bulle");
  let finBulle = 0, prochaine = Date.now() + 5000, avant = null;

  const dire = (texte, ms = 6000, humeur = "") => {
    bulle.textContent = texte;
    bulle.classList.add("on");
    bh.classList.add("parle");
    if (humeur) { bh.classList.remove(humeur); void bh.offsetWidth; bh.classList.add(humeur); setTimeout(() => bh.classList.remove(humeur), 3000); }
    setTimeout(() => bh.classList.remove("parle"), Math.min(ms, 1800));
    finBulle = Date.now() + ms;
    sfx.tic();
  };
  setInterval(() => { if (Date.now() > finBulle) bulle.classList.remove("on"); }, 300);

  // pose(mode, sens, arret) : appelé par Python quand le Gardien change de bord, tombe ou se fait attraper
  let posePrec = "sol";
  const pose = (mode, sens = -1, arret = false, atterri = false) => {
    st.className = "stage pose-" + mode;
    const mur = mode === "mur_g" || mode === "mur_d";
    bh.classList.toggle("marche", !arret && (mode === "sol" || mode === "plafond"));
    bh.classList.toggle("jet", mur);                       // jetpack sur les murs
    bh.classList.toggle("descend", mur && sens > 0);        // petites flammes en descendant
    bh.classList.toggle("vole", mur && !arret);
    bh.classList.toggle("para", mode === "parachute");
    bh.classList.toggle("tombe", mode === "chute" || mode === "attrape");
    bh.classList.toggle("gauche", mur ? false : mode === "plafond" ? sens > 0 : sens < 0);
    bh.classList.toggle("dodo", mode === "dort");
    if (mode === "dort") { bulle.classList.remove("on"); finBulle = 0; }
    if (atterri) {  // il replie le parachute, puis petite pose stylée
      bh.classList.add("para", "replie");
      setTimeout(() => { bh.classList.remove("para", "replie"); bh.classList.add("atterrit"); }, 550);
      setTimeout(() => bh.classList.remove("atterrit"), 2200);
    }
    if (mode !== posePrec) {
      if (mode === "chute") dire(mur || posePrec === "mur_g" || posePrec === "mur_d" ? pick(["Plus d'essence !! 😱", "Panne de jetpack !"]) : pick(["Aaaaah ! 😱", "Woooo ! 🎢", "J'ai oublié mon parachute !!"]), 2500);
      else if (mode === "parachute") dire(pick(["Hop, parachute ! 🪂", "Wiii, je plane !", "Vue magnifique d'ici !"]), 3000);
      else if (mode === "attrape") dire(pick(["Hé ! Pose-moi ! 😵", "Wheee ! 🎢", "Doucement ! J'ai le vertige !"]), 3000);
      else if (atterri) dire(pick(["Atterrissage parfait 😎", "Et… posé ! 10/10 🏅", "Parachutiste d'élite 😎"]), 3500);
      else if (posePrec === "chute" && mode === "sol") dire(pick(["Ouf… ça va 😅", "Atterrissage parfait. Enfin presque.", "Même pas mal !"]), 3500);
      else if (mur && Math.random() < 0.35) dire(pick(["Décollage ! 🚀", "Jetpack activé !", "Vroooom 🔥"]), 3000);
      else if (mode === "plafond" && Math.random() < 0.4) dire(pick(["La tête à l'envers, je réfléchis mieux 🙃", "Vue d'en haut : tu bosses bien !"]), 3500);
    }
    posePrec = mode;
  };
  window.compagnon = { pose, dire, mode: (marche, sens) => pose("sol", sens, !marche) };

  bh.addEventListener("mousedown", (e) => { if (e.button === 0) api.attraper(); });
  bh.addEventListener("click", () => { if (posePrec !== "chute" && posePrec !== "parachute") api.ouvrir_memo(); });
  bh.addEventListener("dblclick", () => api.ouvrir());

  const tour = async () => {
    let e;
    try { e = await api.etat(); } catch { return; }
    sonsActifs = e.reglages.sons;
    const phase = e.pomo ? e.pomo.phase : "libre";
    const reste = e.pomo ? (e.pomo.reste >= 60 ? `${Math.ceil(e.pomo.reste / 60)} min` : `${e.pomo.reste} s`) : "";
    const res = e.stats.aujourdhui.resiste;
    if (e.focus || phase === "travail") {  // mode focus : il dort et se tait
      avant = { phase, res, interrogatoire: e.interrogatoire };
      return;
    }
    if (e.annonce) {  // ex. « Nouvelle version installée ! »
      dire(e.annonce, 8000, "content"); confettis(80); api.annonce_vue();
      avant = { phase, res, interrogatoire: e.interrogatoire };
      return;
    }
    if (avant) {
      if (e.interrogatoire && !avant.interrogatoire) dire(`Oh oh… ${e.interrogatoire} ? Je t'ai vu 👀`, 6000);
      else if (res > avant.res) dire(pick(PHRASES.resiste), 6000, "content");
      else if (phase !== avant.phase) {
        if (phase === "travail" && avant.phase === "libre") dire("C'est parti ! Je ferme tout ce qui bouge 🛡️", 6000, "content");
        else if (phase === "pause") dire("C'est la pause ! 🎉 Clique sur moi pour jouer 🎮", 8000, "content");
        else if (phase === "travail") dire("On y retourne, champion !", 6000);
        else dire("Pomodoro arrêté. Je reste là, hein.", 5000);
      } else if (Date.now() > prochaine && Date.now() > finBulle) {
        const pl = e.planning || { devoirs: [], tests: [], cartes_dues: 0 };
        const perso = [];
        for (const d of pl.devoirs.filter((x) => x.jours !== null && x.jours <= 1).slice(0, 2))
          perso.push(d.jours < 0 ? `« ${d.titre} » est en retard… on s'y met ? 😬` : `Psst… « ${d.titre} » c'est pour ${d.jours === 0 ? "aujourd'hui" : "demain"} 📚`);
        for (const t of pl.tests.filter((x) => x.jours <= 3).slice(0, 1))
          perso.push(t.jours === 0 ? `${t.titre} aujourd'hui ! Tu vas gérer 💪` : `${t.titre} dans ${t.jours} jour${t.jours > 1 ? "s" : ""}. On révise ? 🧠`);
        if (pl.cartes_dues > 0) perso.push(`${pl.cartes_dues} carte${pl.cartes_dues > 1 ? "s" : ""} à réviser sur Dadotest 🃏`);
        dire(perso.length && phase !== "travail" && Math.random() < 0.5 ? pick(perso) : pick(PHRASES[phase]).replace("{reste}", reste), 6000);
      } else { avant = { phase, res, interrogatoire: e.interrogatoire }; return; }
      const [a, b] = { libre: [40, 80], travail: [120, 200], pause: [50, 90] }[phase];
      prochaine = Date.now() + (a + Math.random() * (b - a)) * 1000;
    } else {
      dire(pick(["Coucou ! Je suis ton mini Gardien 👋", "Me revoilà ! On travaille ?", "Salut ! Je monte la garde 🛡️"]), 6000, "coucou");
    }
    avant = { phase, res, interrogatoire: e.interrogatoire };
  };
  tour();
  setInterval(tour, 3000);
  if (P.get("pose")) pose(P.get("pose"), -1, false);
}

(async () => {
  const b = await backend;
  if (window.pywebview && b.params) {
    try { P = new URLSearchParams(await b.params()); VUE = P.get("vue") || "main"; } catch { /* vue par défaut */ }
  }
  animerCiel();
  // ============================== pense-bête ==============================
async function initMemo() {
  document.body.classList.add("memo");
  const st = $("#stage"); st.hidden = false;
  st.innerHTML = `<div class="memo-c">
    <div class="memo-t"><b>Pense-bête</b><button class="x" id="mx" title="Fermer">✕</button></div>
    <div id="mPomo"></div>
    <div class="lbl">À faire</div><div class="list" id="mDev"></div>
    <div class="tests" id="mTests"></div>
    <div class="lbl" style="margin-top:14px">Mes notes</div>
    <form id="mForm"><input class="in" id="mNote" placeholder="Ajouter une note…" autocomplete="off" maxlength="140"></form>
    <div class="list" id="mNotes"></div></div>`;
  const fermer = () => api.fermer();
  $("#mx").onclick = fermer;
  addEventListener("keydown", (e) => { if (e.key === "Escape") fermer(); });
  addEventListener("blur", () => setTimeout(() => { if (!document.hasFocus()) fermer(); }, 150));
  let e, sig = "";
  const rendre = async () => {
    try { e = await api.etat(); } catch { return; }
    sonsActifs = e.reglages.sons;
    const p = e.pomo;
    $("#mPomo").innerHTML = p ? `<div class="mp ${p.phase}"><span>${p.phase === "pause" ? "Pause" : "Focus"}</span><b>${mmss(p.reste)}</b>
      ${e.peut_jouer ? '<button class="btn primary small" id="mJeu">Jouer 🎮</button>' : ""}</div>`
      : e.peut_jouer ? '<div class="mp pause"><span>Temps libre</span><b></b><button class="btn primary small" id="mJeu">Jouer 🎮</button></div>' : "";
    const bj = $("#mJeu");
    if (bj) bj.onclick = async () => { sfx.fanfare(); await api.ouvrir_jeu(); fermer(); };
    const s2 = JSON.stringify([e.planning.devoirs, e.planning.tests, e.notes]);
    if (s2 === sig) return;
    sig = s2;
    const dev = e.planning.devoirs.slice(0, 8);
    $("#mDev").innerHTML = dev.length ? dev.map((d) => `<label class="devoir"><input type="checkbox" data-id="${esc(d.id)}">
      <span class="pt" style="background:${esc(d.couleur)}"></span><span class="nm"><b>${esc(d.titre)}</b><small>${esc(d.nom)}</small></span>
      <span class="quand ${d.jours !== null && d.jours <= 0 ? "urgent" : d.jours === 1 ? "bientot" : ""}">${quandTxt(d.jours)}</span></label>`).join("")
      : `<p class="vide">${e.compte.connecte ? "Aucun devoir. 🎉" : "Connecte-toi à Dadotest."}</p>`;
    $$("#mDev input").forEach((i) => i.onchange = async () => { i.closest(".devoir").classList.toggle("fait", i.checked); if (i.checked) sfx.ok(); await api.cocher_devoir(i.dataset.id, i.checked); setTimeout(rendre, 800); });
    $("#mTests").innerHTML = e.planning.tests.slice(0, 3).map((t) => `<span class="test ${t.jours <= 2 ? "proche" : ""}"><span class="j">${t.jours === 0 ? "auj." : "J-" + t.jours}</span><b>${esc(t.titre)}</b></span>`).join("");
    $("#mNotes").innerHTML = e.notes.length ? e.notes.map((n) => `<div class="devoir note ${n.fait ? "fait" : ""}"><input type="checkbox" data-n="${esc(n.id)}" ${n.fait ? "checked" : ""}>
      <span class="nm"><b>${esc(n.texte)}</b></span><button class="x" data-s="${esc(n.id)}" title="Supprimer">✕</button></div>`).join("")
      : '<p class="vide">Écris ici ce que tu ne veux pas oublier.</p>';
    $$("#mNotes [data-n]").forEach((i) => i.onchange = async () => { sfx.clic(); await api.note_basculer(i.dataset.n); rendre(); });
    $$("#mNotes [data-s]").forEach((b) => b.onclick = async () => { sfx.clic(); await api.note_supprimer(b.dataset.s); rendre(); });
  };
  $("#mForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const t = $("#mNote").value.trim();
    if (!t) return;
    sfx.ok(); $("#mNote").value = ""; await api.note_ajouter(t); rendre();
  };
  await rendre();
  setInterval(rendre, 1000);
  $("#mNote").focus();
}

({ main: initMain, quiz: initQuiz, toast: initToast, compagnon: initCompagnon, memo: initMemo, jeu: () => window.initJeu && initJeu() }[VUE] || initMain)();
})();
