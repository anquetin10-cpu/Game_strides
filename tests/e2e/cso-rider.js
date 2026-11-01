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
      // Abord dessiné (de l'entrée de piste à la ligne de départ) quand le parcours en a un, sinon droit sur la ligne.
      const pts = via.length ? [{ x: h.pos.x, z: h.pos.z }, ...via] : [{ x: h.pos.x, z: h.pos.z }, { x: start.x - n.x * pre, z: start.z - n.z * pre }, { x: start.x - n.x * 2, z: start.z - n.z * 2 }];
      const dense = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const m = Math.max(1, Math.round(Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z) / 0.5));
        for (let j = 0; j < m; j++) dense.push({ x: pts[i].x + ((pts[i + 1].x - pts[i].x) * j) / m, z: pts[i].z + ((pts[i + 1].z - pts[i].z) * j) / m });
      }
      R.path = dense.concat(line);
      R.k = 0;
      R.pressed = new Set();
      R.log = [];
      R.refusals = 0;
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
      // Après un refus : volte comme un cavalier — demi-tour sur place, du champ au trot dans l'axe, demi-tour, puis
      // on représente l'obstacle dans son axe.
      if (st.refusals > (R.refusals || 0)) {
        R.refusals = st.refusals;
        R.volte = { o: g.course?.next, stage: 0, x0: 0, z0: 0 };
      }
      if (R.volte && R.volte.o) {
        const V = R.volte, o = V.o;
        const away = Math.atan2(-o.n.x, -o.n.z), back = Math.atan2(o.n.x, o.n.z);
        const steerTo = (hd) => Math.max(-1, Math.min(1, -wrap(hd - h.heading) * 3));
        const cad = p.csoCadence ?? 0;
        if (V.stage === 0) {
          // Demi-tour sur les hanches, cadence à zéro.
          if (Math.abs(wrap(away - h.heading)) < 0.25 && !(h._rearT > 0)) { V.stage = 1; V.x0 = h.pos.x; V.z0 = h.pos.z; }
          return { x: steerTo(away), y: cad > 0.1 ? -1 : 0, jump: false, done: false, label: o.label };
        }
        if (V.stage === 1) {
          // Du champ au trot, dans l'axe.
          if (Math.hypot(h.pos.x - V.x0, h.pos.z - V.z0) > 16) V.stage = 2;
          return { x: steerTo(away), y: cad < 4.5 ? 1 : cad > 4.8 ? -1 : 0, jump: false, done: false, label: o.label };
        }
        // Demi-volte au trot pour revenir face à l'obstacle, puis reprise du tracé dans l'axe.
        if (Math.abs(wrap(back - h.heading)) > 0.3) return { x: 1, y: 0, jump: false, done: false, label: o.label };
        const line = window.__setup.line;
        let j = line.findIndex((q) => (q.x - o.x) ** 2 + (q.z - o.z) ** 2 < 1);
        if (j < 0) j = 0;
        const dense = [];
        const a = { x: h.pos.x, z: h.pos.z }, b = { x: o.x - o.n.x * 3, z: o.z - o.n.z * 3 };
        const m = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
        for (let q = 0; q < m; q++) dense.push({ x: a.x + ((b.x - a.x) * q) / m, z: a.z + ((b.z - a.z) * q) / m });
        R.path = dense.concat(line.slice(j));
        R.k = 0;
        R.volte = null;
        // (le cavalier corrige son appel après le refus)
        R.lead = 0;
      }
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
        const u = (rx - o.x) * o.t.x + (rz - o.z) * o.t.z; // décalage latéral
        const facing = fx * o.n.x + fz * o.n.z > 0.7 && Math.abs(u) < o.w / 2 + 0.6; // face à l'obstacle, entre les chandeliers
        const ideal = 0.5 * v * 0.69 + R.lead;
        const key = `${o.label}#${st.refusals}`;
        if (!R.pressed.has(key) && facing && d > 0 && d <= ideal) {
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
