// Focus Gardien : les 3 jeux de la pause (fenêtre ?vue=jeu). La partie s'arrête toute seule
// à la fin de la pause du Pomodoro. Meilleurs scores gardés par api.score().
//   tour    : saute de plateforme en plateforme, ← → pour bouger, espace = jetpack
//   course  : il court tout seul, espace / ↑ pour sauter (double saut au jetpack)
//   etoiles : en parachute, ← → pour attraper les étoiles et éviter les orages

const JEUX = {
  tour: { nom: "La tour", emoji: "🗼", desc: "Saute de plateforme en plateforme. ← → pour bouger, espace pour le jetpack.", unite: "m" },
  course: { nom: "La course", emoji: "🏃", desc: "Il court tout seul : espace pour sauter par-dessus les livres et les manettes.", unite: "m" },
  etoiles: { nom: "Les étoiles", emoji: "⭐", desc: "En parachute : ← → pour attraper les étoiles, évite les orages.", unite: "⭐" },
};
const LW = 480, LH = 560;

// sprites du mini Gardien, fabriqués à partir du même dessin que sur l'écran
function sprite(variante) {
  const doc = new DOMParser().parseFromString(BONHOMME, "image/svg+xml");
  const svg = doc.documentElement;
  const enlever = (sel) => svg.querySelectorAll(sel).forEach((n) => n.remove());
  enlever(".ombre");
  if (variante === "normal") enlever(".jet, .para, .haut");
  if (variante === "jet") enlever(".para, .haut");
  if (variante === "saut") enlever(".jet, .para, .bras");
  if (variante === "para") { enlever(".jet, .bras"); svg.setAttribute("viewBox", "0 -100 100 210"); }
  svg.setAttribute("width", "100");
  svg.setAttribute("height", variante === "para" ? "210" : "110");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  return img;
}

window.initJeu = async function () {
  document.body.classList.add("jeu");
  const st = $("#stage"); st.hidden = false;
  st.innerHTML = `<div class="jeu-c">
    <div class="jeu-t"><b>Pause jeux 🎮</b><span class="etat on" id="jPause"><i></i><span>Pause</span></span></div>
    <div id="jMenu" class="jeu-menu"></div>
    <div id="jZone" class="jeu-zone" hidden><canvas id="jCan" width="${LW}" height="${LH}"></canvas>
      <div class="jeu-hud"><span id="jScore">0</span><span id="jInfo"></span></div>
      <div class="jeu-fin" id="jFin" hidden></div></div></div>`;
  const can = $("#jCan"), x = can.getContext("2d");
  const img = { normal: sprite("normal"), jet: sprite("jet"), saut: sprite("saut"), para: sprite("para") };
  let etatApp = null, jeu = null, finie = false;
  try { sonsActifs = (await api.etat()).reglages.sons; } catch { /* démo */ }

  // ---------- clavier ----------
  const touches = {};
  addEventListener("keydown", (e) => {
    touches[e.key] = true;
    if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
    if (jeu && jeu.touche) jeu.touche(e.key);
  });
  addEventListener("keyup", (e) => { touches[e.key] = false; });
  const gauche = () => touches.ArrowLeft || touches.a || touches.q;
  const droite = () => touches.ArrowRight || touches.d;
  const espace = () => touches[" "] || touches.ArrowUp || touches.w || touches.z;

  // ---------- menu ----------
  const menu = () => {
    jeu = null;
    $("#jZone").hidden = true;
    const scores = (etatApp && etatApp.scores) || {};
    $("#jMenu").hidden = false;
    $("#jMenu").innerHTML = `<p class="note" style="margin:0 0 12px">Choisis ton jeu. La partie s'arrête à la fin de la pause.</p>` +
      Object.entries(JEUX).map(([cle, j]) => `<button class="jeu-carte" data-j="${cle}"><span class="e">${j.emoji}</span>
        <span class="nm"><b>${j.nom}</b><small>${j.desc}</small></span><span class="rec">Record<br><b>${scores[cle] || 0} ${j.unite}</b></span></button>`).join("");
    $$("#jMenu [data-j]").forEach((b) => b.onclick = () => { sfx.clic(); lancer(b.dataset.j); });
  };

  // ---------- boucle ----------
  let derniere = 0, accu = 0;
  const boucle = (t) => {
    if (jeu && !jeu.fini && !finie) {
      accu += Math.min(100, t - (derniere || t));
      while (accu >= 1000 / 60) { jeu.pas(); accu -= 1000 / 60; if (jeu.fini) break; }
      jeu.dessin();
      $("#jScore").textContent = `${Math.floor(jeu.score)} ${JEUX[jeu.cle].unite}`;
      $("#jInfo").textContent = jeu.info ? jeu.info() : "";
      if (jeu.fini) perdu();
    }
    derniere = t;
    requestAnimationFrame(boucle);
  };
  requestAnimationFrame(boucle);

  const lancer = (cle) => {
    $("#jMenu").hidden = true; $("#jZone").hidden = false; $("#jFin").hidden = true;
    jeu = { tour: tour, course: course, etoiles: etoiles }[cle]();
    jeu.cle = cle;
    can.focus();
  };
  const perdu = async () => {
    const cle = jeu.cle, pts = Math.floor(jeu.score);
    sfx.non();
    let rec = pts;
    try { rec = await api.score(cle, pts); } catch { /* démo */ }
    const nouveau = pts > 0 && pts >= rec;
    if (nouveau) { sfx.fanfare(); confettis(120); }
    $("#jFin").hidden = false;
    $("#jFin").innerHTML = `<div class="q-badge">${nouveau ? "🏆" : "💥"}</div><h2 class="q-title" style="font-size:30px">${nouveau ? "Nouveau record !" : "Perdu !"}</h2>
      <p class="q-joke">${pts} ${JEUX[cle].unite} · record ${rec} ${JEUX[cle].unite}</p>
      <div class="row" style="justify-content:center"><button class="btn primary" id="jRe">Rejouer</button><button class="btn" id="jMe">Autre jeu</button></div>`;
    $("#jRe").onclick = () => { sfx.clic(); lancer(cle); };
    $("#jMe").onclick = () => { sfx.clic(); rafraichirEtat().then(menu); };
  };

  // ---------- fin de la pause ----------
  const rafraichirEtat = async () => {
    try { etatApp = await api.etat(); } catch { return; }
    const p = etatApp.pomo;
    if (!p || p.phase !== "pause") return finPause();
    $("#jPause span").textContent = `Pause · ${mmss(p.reste)}`;
  };
  const finPause = () => {
    if (finie) return;
    finie = true;
    if (jeu && !jeu.fini && jeu.score > 0) api.score(jeu.cle, Math.floor(jeu.score)).catch(() => {});
    sfx.alerte();
    st.innerHTML = `<div class="jeu-c" style="display:grid;place-items:center;text-align:center"><div><div class="q-badge">💪</div>
      <h2 class="q-title">La pause est finie !</h2><p class="q-joke">Retour au travail. Les jeux t'attendent à la prochaine pause.</p></div></div>`;
    setTimeout(() => api.fermer(), 4000);
  };
  await rafraichirEtat();
  if (!finie) menu();
  setInterval(rafraichirEtat, 1000);

  // =============== jeu 1 : la tour ===============
  function tour() {
    const g = { score: 0, fini: false, camY: 0, carbu: 100, jetOn: false, plat: [], hautMax: 0 };
    const p = { x: LW / 2, y: LH - 110, vx: 0, vy: -10, w: 46, h: 50 };
    const ajouter = (y) => {
      const haut = Math.max(0, -y / 10);
      const w = Math.max(56, 96 - haut / 25);
      const type = haut > 600 && Math.random() < 0.18 ? "fragile" : haut > 250 && Math.random() < 0.3 ? "bouge" : "livre";
      g.plat.push({ x: 20 + Math.random() * (LW - 40 - w), y, w, type, vx: type === "bouge" ? (Math.random() < 0.5 ? -1.4 : 1.4) : 0, casse: false,
        c: ["#E0572B", "#2E9467", "#2A5A84", "#D9890B", "#8A4FBF"][Math.floor(Math.random() * 5)] });
    };
    g.plat.push({ x: 0, y: LH - 40, w: LW, type: "sol", vx: 0, c: "#3A2408" });
    let y = LH - 140;
    while (y > -LH) { ajouter(y); y -= 70 + Math.random() * 40; }
    g.pas = () => {
      p.vx = gauche() ? -5 : droite() ? 5 : p.vx * 0.8;
      g.jetOn = espace() && g.carbu > 0;
      if (g.jetOn) { p.vy = Math.max(-11, p.vy - 0.95); g.carbu -= 1.3; } else g.carbu = Math.min(100, g.carbu + 0.22);
      p.vy += 0.42;
      p.x += p.vx; p.y += p.vy;
      if (p.x < -20) p.x = LW + 20; if (p.x > LW + 20) p.x = -20;  // on passe d'un bord à l'autre
      for (const q of g.plat) {
        if (q.vx) { q.x += q.vx; if (q.x < 0 || q.x + q.w > LW) q.vx = -q.vx; }
        if (!q.casse && p.vy > 0 && p.y + p.h / 2 >= q.y && p.y + p.h / 2 - p.vy <= q.y + 4 && p.x > q.x - 14 && p.x < q.x + q.w + 14) {
          p.vy = -12.6; sfx.tic();
          if (q.type === "fragile") q.casse = true;
        }
      }
      if (p.y < g.camY + LH * 0.4) g.camY = p.y - LH * 0.4;
      g.hautMax = Math.max(g.hautMax, (LH - 110 - p.y) / 10);
      g.score = g.hautMax;
      let plusHaut = Math.min(...g.plat.map((q) => q.y));
      while (plusHaut > g.camY - 120) { plusHaut -= 70 + Math.random() * 45 + Math.min(60, g.hautMax / 30); ajouter(plusHaut); }
      g.plat = g.plat.filter((q) => q.y < g.camY + LH + 60);
      if (p.y > g.camY + LH + 40) g.fini = true;
    };
    g.info = () => `jetpack ${Math.round(g.carbu)}%`;
    g.dessin = () => {
      const fond = x.createLinearGradient(0, 0, 0, LH);
      fond.addColorStop(0, "#DDEBF7"); fond.addColorStop(1, "#F6F4EF");
      x.fillStyle = fond; x.fillRect(0, 0, LW, LH);
      x.save(); x.translate(0, -g.camY);
      x.fillStyle = "rgba(26,26,24,.05)";  // briques de la tour
      for (let by = Math.floor(g.camY / 40) * 40; by < g.camY + LH; by += 40) for (let bx = (by / 40) % 2 ? 0 : 30; bx < LW; bx += 60) x.fillRect(bx, by, 56, 36);
      for (const q of g.plat) {
        if (q.casse) continue;
        x.fillStyle = q.type === "sol" ? "#5B4126" : q.c;
        x.globalAlpha = q.type === "fragile" ? 0.55 : 1;
        x.beginPath(); x.roundRect(q.x, q.y, q.w, 12, 4); x.fill();
        x.fillStyle = "rgba(255,255,255,.55)"; x.fillRect(q.x + 4, q.y + 3, q.w - 8, 2);  // pages du livre
        x.globalAlpha = 1;
      }
      const s = g.jetOn ? img.jet : p.vy < 0 ? img.saut : img.normal;
      x.drawImage(s, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h * 1.1);
      x.restore();
      x.fillStyle = "rgba(26,26,24,.12)"; x.fillRect(12, LH - 18, 120, 6);
      x.fillStyle = "#D9890B"; x.fillRect(12, LH - 18, 1.2 * g.carbu, 6);
    };
    return g;
  }

  // =============== jeu 2 : la course ===============
  function course() {
    const SOL = LH - 70;
    const g = { score: 0, fini: false, v: 6, obs: [], etoiles: [], prochain: 300, nuages: [0, 1, 2, 3].map((i) => ({ x: i * 140, y: 60 + i * 37 % 120 })) };
    const p = { x: 90, y: SOL, vy: 0, w: 50, h: 55, sauts: 0, jet: 0 };
    g.touche = (k) => {
      if ([" ", "ArrowUp", "w", "z"].includes(k) && p.sauts < 2) {
        p.vy = p.sauts === 0 ? -14 : -12; if (p.sauts === 1) p.jet = 14;
        p.sauts++; sfx.tic();
      }
    };
    g.pas = () => {
      g.v += 0.0028; g.score += g.v / 10;
      p.vy += 0.8; p.y += p.vy; if (p.jet > 0) p.jet--;
      if (p.y >= SOL) { p.y = SOL; p.vy = 0; p.sauts = 0; }
      g.prochain -= g.v;
      if (g.prochain <= 0) {
        const types = [{ e: "📚", w: 36, h: 40 }, { e: "🎮", w: 40, h: 30 }, { e: "📱", w: 26, h: 42 }, { e: "📚📚", w: 66, h: 40 }];
        const o = types[Math.floor(Math.random() * types.length)];
        g.obs.push({ ...o, x: LW + 20 });
        if (Math.random() < 0.5) g.etoiles.push({ x: LW + 140, y: SOL - 120 - Math.random() * 60, pris: false });
        g.prochain = 240 + Math.random() * 260 + g.v * 10;
      }
      for (const o of g.obs) o.x -= g.v;
      for (const s of g.etoiles) s.x -= g.v;
      g.obs = g.obs.filter((o) => o.x > -80);
      g.etoiles = g.etoiles.filter((s) => s.x > -40);
      for (const n of g.nuages) { n.x -= g.v * 0.2; if (n.x < -80) n.x = LW + 40; }
      for (const o of g.obs) if (p.x + 16 > o.x && p.x - 16 < o.x + o.w && p.y > SOL - o.h + 6) g.fini = true;
      for (const s of g.etoiles) if (!s.pris && Math.abs(s.x - p.x) < 28 && Math.abs(s.y - (p.y - 25)) < 34) { s.pris = true; g.score += 10; sfx.ok(); }
    };
    g.info = () => "espace = sauter (2× pour le jetpack)";
    g.dessin = () => {
      x.fillStyle = "#EAF3FB"; x.fillRect(0, 0, LW, LH);
      x.font = "38px 'Segoe UI Emoji', sans-serif"; x.globalAlpha = 0.7;
      for (const n of g.nuages) x.fillText("☁️", n.x, n.y);
      x.globalAlpha = 1;
      x.fillStyle = "#C9B79C"; x.fillRect(0, SOL + 26, LW, LH - SOL);
      x.fillStyle = "#8C6F4A"; x.fillRect(0, SOL + 26, LW, 4);
      x.textBaseline = "bottom";
      for (const o of g.obs) { x.font = `${o.h}px 'Segoe UI Emoji', sans-serif`; x.fillText(o.e, o.x, SOL + 28); }
      x.font = "26px 'Segoe UI Emoji', sans-serif";
      for (const s of g.etoiles) if (!s.pris) x.fillText("⭐", s.x - 13, s.y + 13);
      x.textBaseline = "alphabetic";
      const s = p.jet > 0 ? img.jet : p.y < SOL ? img.saut : img.normal;
      x.drawImage(s, p.x - p.w / 2, p.y - p.h + 28, p.w, p.h);
    };
    return g;
  }

  // =============== jeu 3 : les étoiles ===============
  function etoiles() {
    const g = { score: 0, fini: false, v: 2.6, vies: 3, objets: [], prochain: 0, choc: 0, t: 0 };
    const p = { x: LW / 2, y: 170, vx: 0 };
    g.pas = () => {
      g.t++; g.v += 0.0015;
      p.vx += gauche() ? -0.55 : droite() ? 0.55 : 0; p.vx *= 0.92;
      p.x = Math.max(30, Math.min(LW - 30, p.x + p.vx));
      if (--g.prochain <= 0) {
        const orage = Math.random() < Math.min(0.45, 0.22 + g.t / 9000);
        g.objets.push({ x: 30 + Math.random() * (LW - 60), y: LH + 30, orage, pris: false });
        g.prochain = 26 + Math.random() * 30;
      }
      for (const o of g.objets) o.y -= g.v;
      g.objets = g.objets.filter((o) => o.y > -40 && !o.pris);
      for (const o of g.objets) {
        if (Math.abs(o.x - p.x) < 30 && Math.abs(o.y - (p.y + 30)) < 30) {
          o.pris = true;
          if (o.orage) { g.vies--; g.choc = 30; sfx.non(); if (g.vies <= 0) g.fini = true; } else { g.score++; sfx.ok(); }
        }
      }
      if (g.choc > 0) g.choc--;
    };
    g.info = () => "❤️".repeat(Math.max(0, g.vies));
    g.dessin = () => {
      const fond = x.createLinearGradient(0, 0, 0, LH);
      fond.addColorStop(0, "#BFD9F2"); fond.addColorStop(1, "#F6E7C8");
      x.fillStyle = fond; x.fillRect(0, 0, LW, LH);
      x.textBaseline = "middle"; x.textAlign = "center";
      for (const o of g.objets) { x.font = `${o.orage ? 40 : 30}px 'Segoe UI Emoji', sans-serif`; x.fillText(o.orage ? "⛈️" : "⭐", o.x, o.y); }
      x.textBaseline = "alphabetic"; x.textAlign = "start";
      x.save();
      x.translate(p.x, p.y);
      x.rotate(-p.vx * 0.05 + Math.sin(g.t / 20) * 0.06);
      if (g.choc > 0 && g.choc % 6 < 3) x.globalAlpha = 0.4;
      x.drawImage(img.para, -32, -78, 64, 134);
      x.restore();
    };
    return g;
  }
};
