// « Cavalier » de test pour les épreuves de CSO, injecté dans la page. Il ne joue qu'avec ce qu'un joueur voit et les
// commandes normales : il suit des yeux le tracé au sol (repères) jusqu'à l'obstacle suivant, règle sa cadence au
// joystick avant/arrière (indicateur de cadence), dirige au joystick gauche/droite, et appuie UNE fois sur SAUT par
// obstacle, quand il juge la distance d'appel bonne (par la géométrie : distance de l'épaule du cheval à l'obstacle).
// Il ne lit ni le planificateur de saut du jeu, ni l'aide à l'appel, et ne déplace jamais le cheval.
// decide() renvoie { x, y, jump, done, label } : x, y = joystick (−1..1), jump = appuyer sur SAUT maintenant.
(function () {
  const g = window.__game;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const R = {
    path: null, // ligne suivie : approche jusqu'au départ, puis tracé du parcours (points {x, z})
    k: 0,
    cadence: 6.2, // cadence visée (m/s)
    lead: 0, // avance (+) ou retard (−) de l'appel (m) : pour les essais d'appel trop tôt / trop tard
    pressed: new Set(),
    log: [],
    // Ligne : du cheval à un point `pre` mètres avant la ligne de départ (dans son axe), puis le tracé.
    init({ line, start, pre = 10, via = [] }) {
      const h = g.player.horse;
      const n = { x: Math.sin(start.rot), z: Math.cos(start.rot) };
      const pts = [{ x: h.pos.x, z: h.pos.z }, ...via, { x: start.x - n.x * pre, z: start.z - n.z * pre }, { x: start.x - n.x * 2, z: start.z - n.z * 2 }];
      const dense = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const m = Math.max(1, Math.round(Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z) / 0.5));
        for (let j = 0; j < m; j++) dense.push({ x: pts[i].x + ((pts[i + 1].x - pts[i].x) * j) / m, z: pts[i].z + ((pts[i + 1].z - pts[i].z) * j) / m });
      }
      R.path = dense.concat(line);
      R.k = 0;
      R.pressed = new Set();
      R.log = [];
    },
    decide() {
      const p = g.player, h = p.horse;
      const run = g.missions.active;
      const st = run?.data?.course;
      if (!st || st.finished || st.eliminated || p.mode !== 'ride') return { x: 0, y: 0, jump: false, done: true };
      // Point du tracé le plus proche (fenêtre glissante vers l'avant), puis point visé devant (poursuite).
      let best = R.k, bd = 1e9;
      for (let i = R.k; i < Math.min(R.path.length, R.k + 80); i++) {
        const d = (R.path[i].x - h.pos.x) ** 2 + (R.path[i].z - h.pos.z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      R.k = best;
      const v = Math.max(h.speed, 1);
      const Ld = 5 + v * 0.55;
      const ahead = Math.round(Ld / 0.5);
      const tp = R.path[Math.min(R.path.length - 1, R.k + ahead)];
      const err = wrap(Math.atan2(tp.x - h.pos.x, tp.z - h.pos.z) - h.heading);
      // Courbure de poursuite → vitesse de rotation voulue → position du joystick (inverse de la courbe de direction).
      const C = window.__CSO_RIDE;
      const wWant = (2 * v * Math.sin(err)) / Ld;
      const wMax = v >= 1 ? v / (C.radius0 + C.radiusK * v) : C.pivot;
      const u = Math.min(1, Math.abs(wWant) / wMax);
      const x = u < 1e-3 ? 0 : -Math.sign(wWant) * (C.steerDead + Math.pow(u, 1 / C.expo) * (1 - C.steerDead));
      // Cadence : joystick vers l'avant tant qu'elle est sous la cadence visée, vers l'arrière au-dessus.
      const cad = p.csoCadence ?? 0;
      const y = cad < R.cadence - 0.08 ? 1 : cad > R.cadence + 0.25 ? -1 : 0;
      // Appel : une fois par obstacle, à la distance d'appel jugée bonne (demi-longueur de saut à cette vitesse).
      let jump = false;
      const o = g.course?.next;
      if (o && st.started && h.jumpT < 0) {
        const fx = Math.sin(h.heading), fz = Math.cos(h.heading);
        const rx = h.pos.x + fx * 0.4, rz = h.pos.z + fz * 0.4;
        const d = -((rx - o.x) * o.n.x + (rz - o.z) * o.n.z); // distance avant le centre de l'obstacle, le long de son axe
        const ideal = 0.5 * v * 0.69 + R.lead;
        const key = `${o.label}#${st.refusals}`;
        if (!R.pressed.has(key) && d > 0 && d <= ideal) {
          R.pressed.add(key);
          jump = true;
          R.log.push({ label: o.label, d: +d.toFixed(2), v: +v.toFixed(2), x: +x.toFixed(2) });
        }
      }
      return { x: Math.max(-1, Math.min(1, x)), y, jump, done: false, label: o?.label || '' };
    },
  };
  window.__rider = R;
})();
