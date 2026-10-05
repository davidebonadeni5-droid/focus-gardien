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
    pomo: null,
    apps: [["steam", "Steam"], ["epicgameslauncher", "Epic Games"], ["robloxplayer", "Roblox"], ["minecraft", "Minecraft"], ["valorant", "Valorant"], ["discord", "Discord"]]
      .map(([cle, nom], i) => ({ cle, nom, actif: i !== 5 })),
    dossiers_jeux: true,
    vocabulaire: [["le chien (allemand)", "der Hund"], ["apprendre (anglais)", "to learn"]],
    reglages: { sons: true, demarrage: true, travail: 25, pause: 5, compagnon: true },
    mdp: true, premier_lancement: P.get("bienvenue") === "1", pass: {}, focus: P.get("focus") === "1", version: "12",
  };
  const stats = () => ({ jours, aujourdhui: jours[13], serie: 5,
    total: { minutes: 1840, resiste: 96, pomodoros: 71, accorde: 23 } });
  let rep = "";
  return {
    etat: async () => ({ ...st, stats: stats(),
      pomo: st.pomo && { ...st.pomo, reste: Math.max(0, Math.round((st.pomo.fin - Date.now()) / 1000)),
        progres: 1 - (st.pomo.fin - Date.now()) / (st.reglages.travail * 60000) } }),
    demarrer_pomodoro: async () => { st.pomo = { phase: "travail", fin: Date.now() + st.reglages.travail * 60000 - 7 * 60000 - 32000 }; },
    arreter_pomodoro: async () => { st.pomo = null; },
    mode_focus: async (v) => { st.focus = v; },
    basculer_app: async (cle, v) => { st.apps.find((a) => a.cle === cle).actif = v; },
    supprimer_app: async (cle) => { st.apps = st.apps.filter((a) => a.cle !== cle); },
    ajouter_app: async (cle) => { st.apps.push({ cle, nom: cle[0].toUpperCase() + cle.slice(1), actif: true }); return true; },
    programmes_ouverts: async () => ["chrome", "discord", "spotify", "whatsapp", "code", "notepad"],
    dossiers_jeux: async (v) => { st.dossiers_jeux = v; },
    sauver_vocabulaire: async (v) => { st.vocabulaire = v; },
    reglage: async (k, v) => { st.reglages[k] = v; return true; },
    definir_mdp: async (n) => n.length >= 4,
    fin_premier_lancement: async () => { st.premier_lancement = false; },
    quitter: async (pw) => pw === "1234",
    cacher: async () => {},
    devoir: async () => { rep = "56"; return "7 × 8 = ?"; },
    repondre_devoir: async (t) => ({ ok: String(t).trim() === rep, bonne: rep }),
    fin: async () => {},
    fermer: async () => {},
    ouvrir: async () => {},
    attraper: async () => {},
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
  $("#mdpOldF").hidden = !etat.mdp;
  $("#version").textContent = etat.version ? `Focus Gardien · version ${etat.version}` : "";
  $("#mdpInfo").textContent = etat.mdp ? "Il faut ce mot de passe pour quitter le Gardien." : "Aucun mot de passe : n'importe qui peut me fermer. Choisis-en un !";
}

async function rafraichir() {
  etat = await api.etat();
  sonsActifs = etat.reglages.sons;
  rendreAccueil();
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
  $("#btnMdp").onclick = async () => {
    const ok = await api.definir_mdp($("#mdpNew").value, $("#mdpOld").value);
    const m = $("#mdpMsg");
    m.className = "msg " + (ok ? "ok" : "bad");
    m.textContent = ok ? "✓ Mot de passe enregistré" : etat.mdp ? "Mot de passe actuel faux (ou nouveau trop court)" : "Au moins 4 caractères";
    if (ok) { sfx.ok(); $("#mdpOld").value = $("#mdpNew").value = ""; await rafraichir(); rendreReglages(); } else sfx.non();
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

  if (etat.premier_lancement) {
    $("#mWelcome").hidden = false;
    $("#wGo").onclick = async () => {
      const pw = $("#wPw").value;
      if (pw.length < 4) { sfx.non(); $("#wMsg").textContent = "Au moins 4 caractères, champion."; return; }
      await api.definir_mdp(pw, "");
      await api.reglage("demarrage", $("#wStart").checked);
      await api.fin_premier_lancement();
      $("#mWelcome").hidden = true; sfx.fanfare(); confettis(); await rafraichir();
    };
  }
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
  const qs = shuffle(QUESTIONS).slice(0, 3);
  const N = qs.length + 1;
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
    const q = await api.devoir();
    const estMaths = /=\s*\?$/.test(q);
    carte(`<p class="q-app">Question de devoirs 📚</p>
      ${estMaths ? `<div class="q-math">${esc(q)}</div>` : `<h1 class="q-title">${esc(q)}</h1>`}
      <input class="in" id="rep" autocomplete="off" ${estMaths ? 'inputmode="numeric"' : ""} placeholder="Ta réponse" style="font-size:18px;margin-bottom:12px">
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
    if (score < 1) return refus(f(pick(style.refus)));
    const min = score >= 5 ? 15 : score >= 3 ? 10 : 5;
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
  </defs>
  <ellipse class="ombre" cx="50" cy="104" rx="24" ry="4.5" fill="rgba(0,0,0,.35)"/>
  <g class="corps">
    <rect class="jambe j1" x="34" y="82" width="10" height="17" rx="5" fill="#3A2408"/>
    <rect class="jambe j2" x="56" y="82" width="10" height="17" rx="5" fill="#3A2408"/>
    <path class="plume" d="M50 16 C 44 4, 56 0, 62 6 C 56 6, 54 10, 52 16 Z" fill="#E0572B"/>
    <path d="M50 14 L82 26 C 83 52, 74 78, 50 90 C 26 78, 17 52, 18 26 Z" fill="url(#bc)" stroke="#9A5A12" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M50 20 L76 30 C 76 40, 74 46, 72 50 L 28 50 C 26 46, 24 40, 24 30 Z" fill="#FFE2A6" opacity=".35"/>
    <g class="bras"><path d="M80 52 q 12 -4 13 -16" stroke="#9A5A12" stroke-width="6" stroke-linecap="round" fill="none"/><circle cx="93" cy="35" r="4.5" fill="#FFC556" stroke="#9A5A12" stroke-width="2"/></g>
    <path d="M20 54 q -9 6 -8 16" stroke="#9A5A12" stroke-width="6" stroke-linecap="round" fill="none"/>
    <g class="oeil"><ellipse cx="40" cy="44" rx="6.5" ry="8" fill="#fff"/><circle cx="41.5" cy="45.5" r="3.6" fill="#071512"/><circle cx="43" cy="43.5" r="1.3" fill="#fff"/></g>
    <g class="oeil"><ellipse cx="60" cy="44" rx="6.5" ry="8" fill="#fff"/><circle cx="61.5" cy="45.5" r="3.6" fill="#071512"/><circle cx="63" cy="43.5" r="1.3" fill="#fff"/></g>
    <ellipse cx="32" cy="56" rx="4" ry="2.5" fill="#E0572B" opacity=".45"/><ellipse cx="68" cy="56" rx="4" ry="2.5" fill="#E0572B" opacity=".45"/>
    <ellipse class="bouche" cx="50" cy="60" rx="5" ry="3" fill="#5A1E08"/>
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
  st.innerHTML = `<div class="bulle-pos"><div class="bulle" id="bulle"></div></div>
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
  const pose = (mode, sens = -1, arret = false) => {
    st.className = "stage pose-" + mode;
    const marche = !arret && ["sol", "plafond", "mur_g", "mur_d"].includes(mode);
    bh.classList.toggle("marche", marche);
    bh.classList.toggle("gauche", mode === "plafond" ? sens > 0 : sens < 0);
    if (mode !== posePrec) {
      if (mode === "chute") dire(pick(["Aaaaah ! 😱", "Woooo ! 🪂", "Je glisse !!"]), 2500);
      else if (mode === "attrape") dire(pick(["Hé ! Pose-moi ! 😵", "Wheee ! 🎢", "Doucement ! J'ai le vertige !"]), 3000);
      else if (posePrec === "chute" && mode === "sol") dire(pick(["Ouf… ça va 😅", "Atterrissage parfait. Enfin presque.", "Même pas mal !"]), 3500);
      else if ((mode === "mur_g" || mode === "mur_d") && Math.random() < 0.3) dire(pick(["Je grimpe ! 🧗", "Spider-Gardien !"]), 3000);
      else if (mode === "plafond" && Math.random() < 0.4) dire(pick(["La tête à l'envers, je réfléchis mieux 🙃", "Vue d'en haut : tu bosses bien !"]), 3500);
    }
    posePrec = mode;
  };
  window.compagnon = { pose, dire, mode: (marche, sens) => pose("sol", sens, !marche) };

  bh.addEventListener("mousedown", (e) => { if (e.button === 0) api.attraper(); });
  bh.addEventListener("click", () => { if (posePrec !== "chute") dire(pick(PHRASES.clic), 4000, "coucou"); });
  bh.addEventListener("dblclick", () => api.ouvrir());

  const tour = async () => {
    let e;
    try { e = await api.etat(); } catch { return; }
    sonsActifs = e.reglages.sons;
    const phase = e.pomo ? e.pomo.phase : "libre";
    const reste = e.pomo ? (e.pomo.reste >= 60 ? `${Math.ceil(e.pomo.reste / 60)} min` : `${e.pomo.reste} s`) : "";
    const res = e.stats.aujourdhui.resiste;
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
        else if (phase === "pause") dire("BRAVO ! Pause méritée 🎉", 7000, "content");
        else if (phase === "travail") dire("On y retourne, champion !", 6000);
        else dire("Pomodoro arrêté. Je reste là, hein.", 5000);
      } else if (Date.now() > prochaine && Date.now() > finBulle) {
        dire(pick(PHRASES[phase]).replace("{reste}", reste), 6000);
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
  ({ main: initMain, quiz: initQuiz, toast: initToast, compagnon: initCompagnon }[VUE] || initMain)();
})();
