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
      h.setPosition(o.x - o.n.x * 11, o.z - o.n.z * 11, o.rot);
      g.cam.yaw = o.rot + Math.PI;
      h.speed = 9;
      h.stamina = h.maxStamina;
      let jumped = false;
      for (let i = 0; i < 200; i++) {
        h.ai = null;
        A.steer(o.n.x, o.n.z, 0.95);
        g.input.held.delete('gallop');
        if (!jumped && g.obstacles.timing(h) === 'good') {
          // Viser le centre de la fenêtre : attendre un peu.
          const f = h.forward;
          const s = (h.pos.x + f.x * 0.4 - o.x) * o.n.x + (h.pos.z + f.z * 0.4 - o.z) * o.n.z;
          const ideal = (h.speed * 0.8) / 2;
          if (-s <= ideal + 0.2) {
            g.input.pressed.add('jump');
            jumped = true;
          }
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
    solveStep(run) {
      const s = run.step;
      if (!s) return;
      if (g.hud.dialogActive) {
        g.hud.advanceDialog();
        return;
      }
      const id = run.def.id;
      const txt = run.text();
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
      if (id === 'fer' && /Annuaire/.test(txt)) {
        g.contactPro({ id: 'lemaire', name: 'Hugo Lemaire', job: 'Maréchal-ferrant', initials: 'HL', avail: '', place: { x: -140, z: -199 } });
        return;
      }
      if (id === 'pension' && /Écuries/.test(txt)) {
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
