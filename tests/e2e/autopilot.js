// Pilote automatique injecté dans la page : joue les missions via l'API du jeu (sans rendu, pas de temps fixe).
(function () {
  const g = window.__game;
  const DT = 1 / 30;
  const A = {
    log: [],
    stopLoop() {
      g.syncFade = true;
      g.renderer.setAnimationLoop(null);
    },
    startLoop() {
      g.last = performance.now();
      g.renderer.setAnimationLoop((t) => g.frame(t));
    },
    steer(wx, wz, mag) {
      const yaw = g.cam.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = -fz, rz = fx;
      const l = Math.hypot(wx, wz) || 1;
      const x = (wx / l) * rx + (wz / l) * rz;
      const y = (wx / l) * fx + (wz / l) * fz;
      g.input.setVirtualMove(x * mag, y * mag);
    },
    tick(n = 1) {
      for (let i = 0; i < n; i++) g.update(DT);
    },
    tap(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const o = { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerId: 99 };
      el.dispatchEvent(new PointerEvent('pointerdown', o));
      el.dispatchEvent(new PointerEvent('pointerup', o));
      return true;
    },
    closeCards() {
      let n = 0;
      // Invitation vers la vraie application : « Plus tard » (aucune ouverture de page externe pendant les tests).
      for (const b of document.querySelectorAll('.overlay [data-id="cta-later"]')) {
        A.tap(b);
        n++;
      }
      for (const b of document.querySelectorAll('.overlay .btn.primary')) {
        A.tap(b);
        n++;
      }
      return n;
    },
    pos(t) {
      return typeof t === 'function' ? t() : t;
    },
    mount() {
      const p = g.player;
      if (p.mode === 'drive') p.exitTruck();
      if (p.mode === 'ride') return;
      const h = p.horse;
      p.human.setPosition(h.pos.x + 1, h.pos.z + 1);
      p.mount();
    },
    foot() {
      const p = g.player;
      if (p.mode === 'drive') p.exitTruck();
      if (p.mode === 'ride') {
        p.horse.speed = 0;
        p.dismount();
      }
    },
    drive() {
      const p = g.player;
      if (p.mode === 'drive') return;
      A.foot();
      p.human.setPosition(p.truck.pos.x + 2, p.truck.pos.z);
      p.enterTruck();
    },
    // Place le joueur (et son cheval) près d'une cible.
    goTo(t, offset = 1.2) {
      const p = g.player;
      const ang = Math.random() * Math.PI * 2;
      const x = t.x + Math.cos(ang) * offset, z = t.z + Math.sin(ang) * offset;
      if (p.mode === 'ride') p.horse.setPosition(x, z, p.horse.heading);
      else if (p.mode === 'drive') p.truck.setPosition(x, z, p.truck.heading);
      else {
        p.human.setPosition(x, z);
        const led = p.transport?.led?.horse;
        if (led) led.setPosition(x + 1, z + 1, led.heading);
        if (p.horse && p.horse !== led && !p.horse.hiddenInTruck && !p.horse.frozen) p.horse.setPosition(x + 2.5, z + 2.5, 0);
      }
    },
    // Camion : charger / décharger un cheval par l'API du transport (séquence accélérée).
    loadHorse(h) {
      const p = g.player, t = p.truck, tp = p.transport;
      if (!h) return;
      if (tp.isAboard(h)) {
        if (!t.rampClosed) t.setRampInstant(false);
        return;
      }
      if (p.mode === 'drive') {
        t.speed = 0;
        p.exitTruck();
      }
      if (p.mode === 'ride') {
        p.horse.speed = 0;
        p.dismount();
      }
      t.setRampInstant(true);
      const rear = t.rearPoint({ x: 0, y: 0, z: 0 }, 2.6);
      p.human.setPosition(rear.x, rear.z, t.heading);
      h.setPosition(rear.x - 1, rear.z - 1, t.heading);
      if (!tp.led || tp.led.horse !== h) tp.lead(h);
      tp.load(h, { fast: true });
      t.setRampInstant(false);
    },
    unloadHorse(h) {
      const p = g.player, t = p.truck, tp = p.transport;
      if (!h || !tp.isAboard(h)) return;
      if (p.mode === 'drive') {
        t.speed = 0;
        p.exitTruck();
      }
      t.setRampInstant(true);
      const rear = t.rearPoint({ x: 0, y: 0, z: 0 }, 2.6);
      p.human.setPosition(rear.x, rear.z, t.heading);
      tp.unload(h, { fast: true });
    },
    ensureMode(mode) {
      if (mode === 'ride') A.mount();
      else if (mode === 'foot') A.foot();
      else if (mode === 'drive') A.drive();
    },
    // Saute l'obstacle o avec un vrai saut (timing optimal).
    jumpObstacle(o) {
      const p = g.player;
      const h = p.horse;
      // Deuxième élément d'une combinaison (obstacle précédent à moins de 12 m dans l'axe) : on enchaîne depuis la réception
      // du précédent, comme dans un vrai double, au lieu de reculer derrière lui.
      const prev = g.obstacles.ofCourse(o.course).find((q) => q.num === o.num - 1);
      const gapPrev = prev ? (o.x - prev.x) * o.n.x + (o.z - prev.z) * o.n.z : 99;
      const back = prev && gapPrev > 0 && gapPrev < 12 && Math.abs((o.x - prev.x) * o.n.z - (o.z - prev.z) * o.n.x) < 1 ? gapPrev - 3.4 : 11;
      h.setPosition(o.x - o.n.x * back, o.z - o.n.z * back, o.rot);
      g.cam.yaw = o.rot + Math.PI;
      // Abord au galop réel du cheval : galop de travail en CSO, galop de cross sur le cross.
      h.speed = (o.course === 'xc' ? 11 : 6.5) * h.speedMul;
      h.stamina = h.maxStamina;
      let jumped = false;
      for (let i = 0; i < 200; i++) {
        h.ai = null;
        A.steer(o.n.x, o.n.z, 0.95);
        // Cross : galop de cross (grand galop), comme sur un vrai parcours de cross ; CSO : galop de travail.
        if (o.course === 'xc') g.input.held.add('gallop'); else g.input.held.delete('gallop');
        // Appel au cœur de la bonne zone (mêmes calculs que l'aide affichée) : sommet du saut au-dessus de l'obstacle.
        const tg = g.obstacles.target(h);
        if (!jumped && tg && tg.o === o && tg.plan.zone === 'good' && tg.plan.ideal <= tg.plan.L + 0.3) {
          g.input.pressed.add('jump');
          jumped = true;
        }
        A.tick(1);
        const s2 = (h.pos.x - o.x) * o.n.x + (h.pos.z - o.z) * o.n.z;
        if (jumped && h.jumpT < 0 && s2 > 2) {
          A.releaseInput();
          return true;
        }
      }
      A.releaseInput();
      return false;
    },
    // Parcours monté pour de vrai : joystick virtuel le long de la ligne du tracé (poursuite d'un point 6 m devant),
    // appel quand l'aide affiche la bonne zone et que le sommet du saut tombe sur l'obstacle (`lead` m d'avance :
    // négatif = appel plus tôt, positif = plus tard). Renvoie le journal des événements d'obstacle.
    rideLine(line, { maxTicks = 4000, lead = 0, until = () => false, mag = 0.62, policy = null, dt = DT } = {}) {
      const h = g.player.horse;
      const ev = [];
      const offs = ['obstacle:clear', 'obstacle:fault', 'obstacle:refusal'].map((k) => g.bus.on(k, (e) => ev.push({ k, label: e.obstacle.label || String(e.obstacle.num), cause: e.cause || null, margin: e.margin })));
      let k = 0;
      try {
        for (let i = 0; i < maxTicks; i++) {
          // Point de la ligne le plus proche (fenêtre glissante), puis cible 6 m plus loin.
          let best = k, bd = 1e9;
          for (let j = k; j < Math.min(line.length, k + 60); j++) {
            const d = Math.hypot(line[j].x - h.pos.x, line[j].z - h.pos.z);
            if (d < bd) { bd = d; best = j; }
          }
          k = best;
          const tgt = line[Math.min(line.length - 1, k + 12)];
          A.steer(tgt.x - h.pos.x, tgt.z - h.pos.z, mag);
          g.input.held.delete('gallop');
          const tg = g.obstacles.target(h);
          const press = policy ? policy(tg, h) : tg && tg.plan.zone === 'good' && tg.plan.ideal <= tg.plan.L + 0.3 + lead;
          if (h.jumpT < 0 && press) g.input.pressed.add('jump');
          g.update(dt);
          if (until() || (k >= line.length - 2 && Math.hypot(line[line.length - 1].x - h.pos.x, line[line.length - 1].z - h.pos.z) < 2)) break;
        }
      } finally {
        offs.forEach((f) => f());
        A.releaseInput();
      }
      return ev;
    },
    rideTo(t, maxTicks = 3000, mag = 0.95, gallop = true) {
      const h = g.player.horse;
      for (let i = 0; i < maxTicks; i++) {
        const dx = t.x - h.pos.x, dz = t.z - h.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 3) return true;
        A.steer(dx, dz, mag);
        if (gallop && h.stamina > h.maxStamina * 0.3) g.input.held.add('gallop');
        else g.input.held.delete('gallop');
        A.tick(1);
      }
      return false;
    },
    releaseInput() {
      g.input.setVirtualMove(0, 0);
      g.input.held.clear();
    },
    // Course d'hippodrome : suivre l'ovale au galop en gérant l'endurance.
    race(run) {
      const race = run.data.race;
      const h = g.player.horse;
      const HX = 330, HZ = 230, half = 100, R = 62;
      const pointAt = (x, z, ahead) => {
        // Projection grossière puis avance sur l'ovale.
        const L = 2 * half, arc = Math.PI * R, total = 2 * L + 2 * arc;
        const lx = x - HX, lz = z - HZ;
        let s;
        if (Math.abs(lx) <= half) s = lz < 0 ? lx + half : L + arc + (half - lx);
        else if (lx > half) s = L + (Math.atan2(lz, lx - half) + Math.PI / 2) * R;
        else {
          let a = Math.atan2(lz, lx + half);
          if (a < 0) a += Math.PI * 2;
          s = 2 * L + arc + (a - Math.PI / 2) * R;
        }
        let d = (s + ahead) % total;
        if (d < L) return { x: HX - half + d, z: HZ - R };
        d -= L;
        if (d < arc) return { x: HX + half + Math.cos(-Math.PI / 2 + d / R) * R, z: HZ + Math.sin(-Math.PI / 2 + d / R) * R };
        d -= arc;
        if (d < L) return { x: HX + half - d, z: HZ + R };
        d -= L;
        return { x: HX - half + Math.cos(Math.PI / 2 + d / R) * R, z: HZ + Math.sin(Math.PI / 2 + d / R) * R };
      };
      for (let i = 0; i < 30 * 150 && g.missions.active === run && run.step?.kind === 'race'; i++) {
        const t = pointAt(h.pos.x, h.pos.z, 14);
        const dx = t.x - h.pos.x, dz = t.z - h.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        A.steer(dx / d, dz / d, 1);
        if (!h.exhausted) g.input.held.add('gallop');
        else g.input.held.delete('gallop');
        A.tick(1);
      }
      A.releaseInput();
      return race;
    },
    // Choix à faire dans les écrans de choix (identifiants data-choice, dans l'ordre de préférence).
    prefer: ['tournee', 'prudente', 'lea'],
    pickChoice() {
      const opts = [...document.querySelectorAll('.overlay .choice')];
      if (!opts.length) return false;
      const ok = opts.filter((b) => !b.classList.contains('off'));
      const want = A.prefer.map((id) => ok.find((b) => b.dataset.choice === id)).find(Boolean) || ok.find((b) => b.dataset.choice !== 'none') || ok[0];
      A.tap(want);
      return true;
    },
    solveStep(run) {
      const s = run.step;
      if (!s) return;
      if (g.hud.dialogActive) {
        g.hud.advanceDialog();
        return;
      }
      if (A.pickChoice()) return;
      // Épreuve de CSO : présentation (« Entrer en piste ») et bilan (« Continuer » / « Quitter »).
      const enter = document.querySelector('.overlay [data-id="enter"]') || document.querySelector('.overlay [data-id="cso-done"]');
      if (enter) return A.tap(enter);
      const id = run.def.id;
      const txt = run.text();
      // Chapitre 1 : recrutement (parcours client), reconnaissance à pied, monter, échauffement.
      const pick = g.missions.hirePicker;
      if (pick && /Recruter/.test(txt)) {
        const p = pick.profiles.find((x) => A.prefer.includes(x.id) && g.save.data.money >= x.price);
        if (A.prefer.includes('solo') || !p) return pick.onSolo();
        const res = g.hire(`hire:${pick.mission}`, p.price);
        A.log.push(`hire ${p.id}: ${res}`);
        return pick.onConfirm(p);
      }
      if (/^Reconnais/.test(txt)) {
        A.ensureMode('foot');
        A.goTo(A.pos(s.target), 0.5);
        return;
      }
      if (/^Monte (?!au volant|dans le camion)|pour t’échauffer/.test(txt)) return A.mount();
      if (/^Résultats officiels/.test(txt)) return A.closeCards();
      if (/^Échauffe-toi/.test(txt)) {
        A.mount();
        for (const o of g.obstacles.ofCourse('warmup')) A.jumpObstacle(o);
        return;
      }
      if (s.kind === 'goto') {
        A.ensureMode(s.mode || (g.player.mode === 'foot' ? 'foot' : g.player.mode));
        A.goTo(A.pos(s.target), 1);
        return;
      }
      if (s.kind === 'interact') {
        const mode = s.modes.includes(g.player.mode) ? g.player.mode : s.modes[0];
        A.ensureMode(mode);
        const t = A.pos(s.target);
        A.goTo(t, 1);
        A.tick(1);
        const it = g.interact.list.get(s.interactId);
        if (it && (!it.when || it.when())) it.action();
        return;
      }
      if (s.kind === 'countdown' || s.kind === 'dialog') return;
      if (s.kind === 'rings') {
        A.ensureMode('ride');
        const p = s.points[s.ringState.i];
        if (p) A.goTo({ x: p[0], z: p[1] }, 0.5);
        return;
      }
      if (s.kind === 'course') {
        A.ensureMode('ride');
        const st = run.data.course;
        const list = g.obstacles.ofCourse(s.courseId);
        if (!st.started) {
          // CSO : après la cloche, le chrono part au passage de la ligne de départ (fanions).
          const S = s.startLine;
          if (S) {
            const n = { x: Math.sin(S.rot), z: Math.cos(S.rot) };
            g.player.horse.setPosition(S.x - n.x * 5, S.z - n.z * 5, S.rot);
            g.player.horse.speed = 6;
            g.cam.yaw = S.rot + Math.PI;
            for (let i = 0; i < 30 && !st.started; i++) {
              A.steer(n.x, n.z, 0.62);
              A.tick(1);
            }
            A.releaseInput();
          } else A.tick(5);
          return;
        }
        if (st.next <= list.length) {
          const ok = A.jumpObstacle(list[st.next - 1]);
          if (!ok) A.log.push(`jump failed ${id} #${st.next}`);
        } else {
          const f = s.finish;
          if (f.rot !== undefined) {
            const n = { x: Math.sin(f.rot), z: Math.cos(f.rot) };
            g.player.horse.setPosition(f.x - n.x * 4, f.z - n.z * 4, f.rot);
            g.player.horse.speed = 8;
            for (let i = 0; i < 40 && g.missions.active === run; i++) {
              A.steer(n.x, n.z, 0.8);
              A.tick(1);
            }
            A.releaseInput();
          } else A.goTo(f, 1);
        }
        return;
      }
      if (s.kind === 'race') {
        A.race(run);
        return;
      }
      // Étapes personnalisées : heuristiques par mission.
      if (id === 'tuto' && /Monte sur/.test(txt)) return A.mount();
      if (id === 'tuto' && /vertical/.test(txt)) {
        A.mount();
        return A.jumpObstacle(g.obstacles.list.find((o) => o.id === 'home1'));
      }
      if (id === 'tuto' && /grand galop/.test(txt)) {
        A.mount();
        const h = g.player.horse;
        h.setPosition(-60, 260, 0);
        for (let i = 0; i < 160; i++) {
          A.steer(0, 1, 1);
          g.input.held.add('gallop');
          A.tick(1);
          if (run.step !== s) break;
        }
        A.releaseInput();
        return;
      }
      if (id === 'fugueur' && /Rattrape/.test(txt)) {
        A.mount();
        const t = A.pos(s.target);
        A.goTo(t, 2);
        A.tick(1);
        g.interact.list.get('catch')?.action();
        return;
      }
      if ((id === 'fugueur' || id === 'pension') && /(Ramène|Conduis)/.test(txt)) {
        const t = A.pos(s.target);
        const follower = g.horses.find((h) => h.id === (id === 'fugueur' ? 'tonnerre' : 'galant'));
        A.goTo(t, 1);
        if (follower) follower.setPosition(t.x + 3, t.z + 3, 0);
        return;
      }
      if (id === 'plage' && /Tornade|Descends/.test(txt)) {
        const t = g.horses.find((h) => h.id === 'tornade');
        if (g.player.mode === 'ride' && g.player.horse !== t) {
          g.player.horse.speed = 0;
          g.player.dismount();
          A.tick(2);
        }
        if (g.player.mode === 'foot') {
          g.player.human.setPosition(t.pos.x + 1, t.pos.z + 1);
          A.tick(2);
          if (g.player.horse === t) g.player.mount();
        }
        return;
      }
      if (s.kind === 'tdrive') {
        const t = g.player.truck;
        if (g.player.mode !== 'drive') {
          if (!t.rampClosed) t.setRampInstant(false);
          A.drive();
        }
        t.setPosition(s.to.x, s.to.z, t.heading);
        t.speed = 0;
        return;
      }
      if (s.kind === 'tload') return A.loadHorse(s.horse());
      if (s.kind === 'tunload') return A.unloadHorse(s.horse());
      if ((id === 'transport' || run.offer.vertical === 'TRANSPORT') && s.target) {
        if (/Monte dans le camion/.test(txt) || g.player.mode !== 'drive') return A.drive();
        const t = A.pos(s.target);
        g.player.truck.setPosition(t.x + 1, t.z + 1, g.player.truck.heading);
        g.player.truck.speed = 0;
        return;
      }
      if (id === 'fer' && /Guide local|Annuaire/.test(txt)) {
        g.contactPro({ id: 'lemaire', name: 'Hugo Lemaire', job: 'Maréchal-ferrant', initials: 'HL', avail: '', place: { x: -140, z: -199 } });
        return;
      }
      if (id === 'pension' && /Pensions|Écuries/.test(txt)) {
        g.missions.stablePicker?.onPick({ id: 'dunes', price: 480 });
        return;
      }
      if (id === 'pension' && /Galant/.test(txt)) {
        const t = A.pos(s.target);
        A.mount();
        A.goTo(t, 2);
        A.tick(1);
        g.interact.list.get('lead')?.action();
        return;
      }
      if (s.target) {
        A.goTo(A.pos(s.target), 1);
        // Chevaux qui suivent le joueur (sortie en main, pension) : ils l'accompagnent.
        const f = g.player.focus.pos;
        for (const hh of g.horses) if (hh.ai?.constructor?.name === 'FollowAI' && hh !== g.player.horse) hh.setPosition(f.x + 2, f.z + 2, hh.heading);
      }
    },
    // Joue un job généré.
    runJob(seq, level) {
      A.log = [];
      g.missions.offers = [];
      g.save.data.completed.includes('tuto') || g.save.data.completed.push('tuto');
      const { generateJob } = window.__jobs;
      const def = generateJob(g, seq, level);
      const offer = { id: `job:${def.id}`, def, vertical: def.vertical, category: def.category, title: def.title, pay: def.pay, xp: def.xp, place: def.place, placeName: def.placeName, client: def.client };
      g.missions.offers.push(offer);
      g.missions.accept(offer.id);
      return A.drive_(g.missions.active, 3000, def.title);
    },
    drive_(run, maxIter, title) {
      let failed = null, completed = null;
      const offFail = g.bus.on('mission:fail', () => (failed = document.querySelector('.overlay p')?.textContent || 'fail'));
      const offDone = g.bus.on('mission:complete', ({ result }) => (completed = result));
      let last = -1, same = 0;
      for (let i = 0; i < maxIter; i++) {
        if (failed || completed || g.missions.active !== run) break;
        if (run.i !== last) {
          last = run.i;
          same = 0;
          A.log.push(`${run.i}: ${run.step?.kind || 'custom'} — ${run.text()}`);
        } else if (++same > 400) break;
        A.solveStep(run);
        A.tick(2);
      }
      offFail();
      offDone();
      A.releaseInput();
      if (g.missions.active === run) g.missions.abandon();
      const res = { ok: !!completed, title, failed, stars: completed?.stars, log: A.log };
      A.closeCards();
      A.tick(2);
      return res;
    },
    // Joue une mission de l'histoire jusqu'au bout (ou échec).
    runStory(id, maxIter = 4000) {
      A.log = [];
      const STORY = g.missions.storyList();
      const def = STORY.find((d) => d.id === id);
      for (const r of def.requires || []) if (!g.save.data.completed.includes(r)) g.save.data.completed.push(r);
      // Épreuves de haut niveau (1,40 – 1,60 m) : le pilote s'équipe comme un vrai cavalier (selles de saut).
      if (['csi3', 'gp'].includes(id)) {
        for (const u of ['selle', 'selle_pro']) if (!g.save.data.upgrades.includes(u)) g.save.data.upgrades.push(u);
        g.applyUpgrades(g.mainHorse);
      }
      const lvXp = [0, 300, 900, 1800, 3200][def.level - 1];
      if (g.save.data.reputation < lvXp) g.save.data.reputation = lvXp;
      g.missions.offers = [];
      g.missions.refreshOffers(false);
      const offer = g.missions.offers.find((o) => o.id === `story:${id}`);
      if (!offer) return { ok: false, error: 'offer not available' };
      if (offer.locked) return { ok: false, error: `locked: ${offer.locked}` };
      g.missions.accept(offer.id);
      const run = g.missions.active;
      let failed = null;
      const offFail = g.bus.on('mission:fail', () => (failed = document.querySelector('.overlay p')?.textContent || 'fail'));
      let completed = null;
      const offDone = g.bus.on('mission:complete', ({ result }) => (completed = result));
      let lastStep = -1;
      let sameCount = 0;
      for (let i = 0; i < maxIter; i++) {
        if (failed || completed) break;
        if (g.missions.active !== run) break;
        if (run.i !== lastStep) {
          lastStep = run.i;
          sameCount = 0;
          A.log.push(`${run.i}: ${run.step?.kind || 'custom'} — ${run.text()}`);
        } else sameCount++;
        if (sameCount > 400) {
          offFail();
          offDone();
          g.missions.abandon();
          A.closeCards();
          return { ok: false, error: `stuck at step ${run.i}: ${run.text()}`, log: A.log };
        }
        A.solveStep(run);
        A.tick(2);
      }
      offFail();
      offDone();
      A.releaseInput();
      const res = { ok: !!completed, failed, completed: completed && { title: completed.title, pay: completed.pay, stars: completed.stars, body: completed.body, time: completed.time }, log: A.log };
      A.closeCards();
      A.tick(2);
      return res;
    },
  };
  window.__auto = A;
})();
