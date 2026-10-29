// Commerces visitables de Deauville City : Sellerie du Port, café-boulangerie Le Galop, Maison Lucette.
// - Entrée à pied par la porte (action « Entrer ») ; à cheval, le joueur met pied à terre et attache son cheval à la
//   barre la plus proche ; en voiture ou en camion, il faut d'abord se garer. Une transition courte (fondu) place le
//   personnage à l'intérieur, devant la porte ; « Sortir » le ramène sur le trottoir, face à la rue.
// - L'intérieur est construit à l'approche (moins de LOAD_R mètres) et libéré au loin (plus de UNLOAD_R), avec le
//   personnel et les clients ; un échec de chargement laisse le joueur dehors (il peut réessayer).
// - Rayons : « Voir » ouvre la fiche des articles (prix, description, effet réel, possession, restriction) avec
//   Acheter / Équiper / Utiliser / Essayer ; le comptoir fait parler le vendeur (ou passer commande au café).
// - Pendant la visite : sifflet sans effet (le cheval reste attaché dehors), caméra intérieure (camera.js),
//   ambiance sonore propre au commerce. La sauvegarde enregistre la porte et le commerce : à la reprise, le joueur
//   est replacé dans la boutique, ou devant sa porte si l'intérieur ne peut pas être reconstruit.
import { SHOPS3D } from '../world/sites.js';
import { shopLayout, shopAnchor } from '../world/shopInteriors.js';
import { SHOP, SHOP_CATS, SLOTS, CAFE_MENU } from './data.js';
import { DOUBLE_TAP_MS } from './commerce.js';
import { h, tap } from '../ui/dom.js';
import { formatMoney } from '../core/math.js';

export const LOAD_R = 48;
export const UNLOAD_R = 80;
// Ambiance sonore de chaque commerce (brouhaha de la salle).
const MURMUR = { sellerie: 0.18, cafe: 0.7, boutique: 0.12 };
const GREET = {
  sellerie: ['Bonjour ! Bienvenue à la Sellerie du Port. Selles, briderie, tapis : tout est en rayon, et je fais les retouches à l’atelier.', 'Prends ton temps. Chaque article porte son étiquette : approche-toi d’un rayon pour voir les prix.'],
  cafe: ['Bonjour ! Qu’est-ce que je te sers ? Le pain sort du four, les croissants sont encore tièdes.'],
  boutique: ['Bonjour, bienvenue chez Maison Lucette ! Le miroir est au fond : tu peux tout essayer.'],
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Prix avec centimes quand il y en a (carte du café).
const euros = (v) => (Number.isInteger(v) ? formatMoney(v) : `${v.toFixed(2).replace('.', ',')} €`);

export class ShopManager {
  constructor(game) {
    this.game = game;
    this.current = null; // commerce où se trouve le joueur
    this.busy = false; // transition en cours (une seule à la fois)
    this.loaded = new Map(); // id → { npcs: [] }
    this.preview = null; // article essayé (boutique)
    this._fadeEl = null;
    this._cardTap = 0;
    for (const id of Object.keys(SHOPS3D)) {
      this.game.interact.add(`shop-door:${id}`, {
        label: 'Entrer', icon: 'bag', r: 2.4, priority: 2, modes: ['foot', 'ride'],
        getPos: () => this.doorOut(id),
        when: () => !this.current && !this.busy,
        action: () => this.enter(id),
      });
    }
  }

  get world() {
    return this.game.world;
  }
  spec(id) {
    return SHOPS3D[id];
  }
  layout(id) {
    return shopLayout(id);
  }
  // Repère local → monde.
  toW(id, lx, lz) {
    const s = SHOPS3D[id];
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    return { x: s.x + lx * c + lz * sn, z: s.z - lx * sn + lz * c };
  }
  doorX(id) {
    const o = SHOPS3D[id].openings.find((op) => op[2] === 'door');
    return (o[0] + o[1]) / 2;
  }
  // Devant la porte, sur le trottoir.
  doorOut(id) {
    return this.toW(id, this.doorX(id), SHOPS3D[id].d / 2 + 1.0);
  }
  anchor(id, which) {
    return shopAnchor(SHOPS3D[id], which);
  }
  inside(id, x, z, margin = 0) {
    const s = SHOPS3D[id];
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    const dx = x - s.x, dz = z - s.z;
    const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    return Math.abs(lx) < s.w / 2 + margin && Math.abs(lz) < s.d / 2 + margin;
  }

  // ---------- Chargement à la demande ----------
  update() {
    const g = this.game;
    if (!this.world?.shops) return;
    const f = g.player.focusPos;
    // Une étape par image : la géométrie d'abord, le personnel et les clients à l'image suivante.
    let budget = 1;
    for (const [id, s] of Object.entries(SHOPS3D)) {
      const st = this.loaded.get(id);
      if (st?.pending && budget-- > 0) this._spawnPeople(id);
    }
    for (const [id, s] of Object.entries(SHOPS3D)) {
      const d = Math.hypot(f.x - s.x, f.z - s.z);
      if (d < LOAD_R && !this.loaded.has(id) && budget-- > 0) this._load(id, { people: false });
      else if (d > UNLOAD_R && this.loaded.has(id) && this.current !== id) this._unload(id);
    }
    // Sécurité : le joueur a été déplacé hors du commerce (mission, téléportation) → plus à l'intérieur.
    if (this.current && !this.busy && !this.inside(this.current, g.player.human.pos.x, g.player.human.pos.z, 0.5)) this._leaveState();
  }

  _load(id, { people = true } = {}) {
    try {
      this.world.loadShopInterior(id);
    } catch (e) {
      console.warn('[shops] intérieur non chargé', id, e);
      return false;
    }
    const L = this.layout(id);
    const g = this.game;
    // Rayons, comptoir et sortie.
    for (const fx of L.fixtures) {
      const p = this.toW(id, fx.at[0], fx.at[1]);
      g.interact.add(`shop:${id}:${fx.id}`, {
        label: fx.counter ? (id === 'cafe' ? 'Commander' : 'Parler') : fx.tryOn ? 'Essayer' : fx.label, icon: fx.counter ? 'talk' : 'bag', r: 1.9, priority: 1.5, modes: ['foot'],
        x: p.x, z: p.z,
        when: () => this.current === id && !this.busy,
        action: () => (fx.counter ? this.counter(id, fx) : this.openRack(id, fx)),
      });
    }
    const ex = this.toW(id, L.exit[0], L.exit[1]);
    g.interact.add(`shop:${id}:exit`, {
      label: 'Sortir', icon: 'back', r: 1.7, priority: 2.5, modes: ['foot'], x: ex.x, z: ex.z,
      when: () => this.current === id && !this.busy,
      action: () => this.exit(),
    });
    this.loaded.set(id, { npcs: [], staff: null, pending: true });
    if (people) this._spawnPeople(id);
    return true;
  }

  // Personnel (derrière le comptoir) et clients du commerce.
  _spawnPeople(id) {
    const st = this.loaded.get(id);
    if (!st?.pending) return;
    st.pending = false;
    const g = this.game;
    const L = this.layout(id);
    const s = SHOPS3D[id];
    const spawn = (o, at, ry, name, pose) => {
      const p = this.toW(id, at[0], at[1]);
      const hm = g.spawnHuman(o, p.x, p.z, s.rot + ry, { name });
      if (pose) hm.pose = pose;
      hm.shopNpc = id;
      st.npcs.push(hm);
      return hm;
    };
    st.staff = spawn(L.staff.outfit, L.seller.at, L.seller.ry, L.staff.name);
    for (const e of L.extras || []) spawn(e.outfit, e.at, e.ry, e.name, e.pose);
  }

  _unload(id) {
    const st = this.loaded.get(id);
    if (!st) return;
    for (const n of st.npcs) this.game.despawn(n);
    const L = this.layout(id);
    for (const fx of L.fixtures) this.game.interact.remove(`shop:${id}:${fx.id}`);
    this.game.interact.remove(`shop:${id}:exit`);
    this.world.unloadShopInterior(id);
    this.loaded.delete(id);
  }

  // ---------- Entrer / sortir ----------
  _fade(on) {
    if (!this._fadeEl) {
      this._fadeEl = h('div.shop-fade');
      document.body.appendChild(this._fadeEl);
    }
    this._fadeEl.classList.toggle('on', on);
  }

  // Cheval laissé dehors : attaché à la barre du commerce s'il était monté ou tout près, sinon là où il est.
  _tieHorse(id, wasRiding) {
    const g = this.game;
    const hs = g.mainHorse;
    // Cheval dans le camion ou au box : on n'y touche pas.
    if (!hs || hs.hiddenInTruck || hs.inBox || hs.frozen) return;
    hs.ai = null;
    hs.control.mag = 0;
    const s = SHOPS3D[id];
    const near = Math.hypot(hs.pos.x - g.player.human.pos.x, hs.pos.z - g.player.human.pos.z) < 25;
    if (wasRiding || near) {
      const [tx, tz, th] = s.tie;
      hs.setPosition(tx, tz, th);
      hs.tiedAt = id;
    }
  }

  async enter(id, { instant = false } = {}) {
    const g = this.game;
    const p = g.player;
    if (this.busy || this.current || p.mode === 'drive' || p.locked) return false;
    this.busy = true;
    if (!instant) {
      this._fade(true);
      await wait(240);
    }
    let ok = false;
    try {
      const wasRiding = p.mode === 'ride';
      if (wasRiding) p.dismount(true);
      // Cheval mené en main : on lâche la longe, il est attaché à la barre avant d'entrer.
      const led = p.transport?.led?.horse === g.mainHorse;
      if (led) p.transport.release(true);
      if (!this.loaded.has(id) && !this._load(id)) throw new Error('chargement');
      this._spawnPeople(id);
      this._tieHorse(id, wasRiding || led);
      const L = this.layout(id);
      const sp = this.toW(id, L.spawn[0], L.spawn[1]);
      const s = SHOPS3D[id];
      p.human.setPosition(sp.x, sp.z, s.rot + Math.PI);
      p.focusPos = p.human.pos;
      this.current = id;
      g.indoor = { id, spec: s };
      g.save.data.indoorShop = id;
      g.cam.snap(p.human.pos, s.rot + Math.PI);
      g.audio.shopDoor();
      g.hud.toast(`${s.name} — ${s.sub}`, 'bag');
      g.bus?.emit('shop:enter', { id });
      g.saveSoon();
      ok = true;
    } catch (e) {
      console.warn('[shops] entrée impossible', id, e);
      g.hud.toast('La boutique ne peut pas ouvrir pour le moment. Réessaie dans un instant.');
    }
    if (!instant) {
      await wait(60);
      this._fade(false);
    }
    this.busy = false;
    return ok;
  }

  async exit({ instant = false } = {}) {
    const g = this.game;
    const id = this.current;
    if (!id || this.busy) return false;
    this.busy = true;
    if (!instant) {
      this._fade(true);
      await wait(240);
    }
    this._clearPreview();
    const s = SHOPS3D[id];
    const out = this.doorOut(id);
    g.player.human.setPosition(out.x, out.z, s.rot);
    g.colliders.resolve(g.player.human.pos, 0.5, -Infinity);
    this._leaveState();
    g.cam.snap(g.player.human.pos, s.rot);
    g.audio.shopDoor();
    g.bus?.emit('shop:exit', { id });
    g.saveSoon();
    if (!instant) {
      await wait(60);
      this._fade(false);
    }
    this.busy = false;
    return true;
  }

  _leaveState() {
    const g = this.game;
    this._clearPreview();
    this._greeted = null; // le vendeur salue à chaque visite
    this.current = null;
    g.indoor = null;
    g.save.data.indoorShop = null;
    if (g.mainHorse) g.mainHorse.tiedAt = null;
  }

  // Reprise d'une sauvegarde faite dans un commerce : le joueur est devant la porte (position enregistrée) et rentre.
  async resume() {
    const id = this.game.save.data.indoorShop;
    if (!id || !SHOPS3D[id]) return;
    const ok = await this.enter(id, { instant: true });
    if (!ok) this.game.save.data.indoorShop = null;
  }

  // Position à enregistrer quand le joueur est dans un commerce : devant la porte, face à la rue.
  savedPos() {
    if (!this.current) return null;
    const p = this.doorOut(this.current);
    return { x: p.x, z: p.z, heading: SHOPS3D[this.current].rot };
  }

  // Brouhaha de la salle (0 dehors).
  murmur() {
    return this.current ? MURMUR[this.current] : 0;
  }

  // ---------- Fiches produits ----------
  _guard() {
    // Un double appui sur un même bouton (fiche qui se redessine sous le doigt) ne déclenche qu'une action.
    const now = performance.now();
    if (now - this._cardTap < 250) return false;
    this._cardTap = now;
    return true;
  }

  _row(it, rerender, { tryOn = false } = {}) {
    const g = this.game;
    const c = g.commerce;
    const st = c.status(it.id);
    const consumable = it.kind === 'consumable';
    const owned = !consumable && c.owned(it.id);
    const lines = [];
    if (consumable) lines.push(`En stock : ${c.qty(it.id)}`);
    else if (owned) lines.push(it.slot ? (c.isActive(it.id) ? `Possédé · équipé (${SLOTS[it.slot]})` : 'Possédé · non équipé') : 'Possédé');
    const restr = c.restriction(it.id);
    if (restr && !owned) lines.push(restr);
    if (this.preview === it.id) lines.push('Essayé en ce moment');
    const acts = h('div.shop-acts');
    const btn = (label, cls, fn, disabled = false) => {
      const b = h(`button.btn${cls}`, { text: label, 'data-act': label, 'data-item': it.id });
      if (disabled) b.disabled = true;
      tap(b, () => {
        if (b.disabled || !this._guard()) return;
        b.disabled = true;
        fn();
        rerender();
      });
      acts.appendChild(b);
    };
    if (!owned) btn(consumable && c.qty(it.id) ? `Racheter · ${formatMoney(it.price)}` : `Acheter · ${formatMoney(it.price)}`, '.primary', () => c.purchase(it.id), st === 'locked' || st === 'poor');
    if (owned && it.slot) {
      if (c.isActive(it.id)) btn('Retirer', '.ghost', () => c.equip(null, it.slot));
      else btn('Équiper', '.primary', () => c.equip(it.id));
    }
    if (consumable && c.qty(it.id) > 0) btn('Utiliser', '', () => c.use(it.id));
    if (tryOn && it.wear && !(owned && c.isActive(it.id))) btn(this.preview === it.id ? 'Enlever' : 'Essayer', '.ghost', () => this.tryOn(this.preview === it.id ? null : it.id));
    return h('div.shop-row', { 'data-item': it.id },
      h('div.shop-info', {},
        h('div.shop-top', {}, h('span.n', { text: it.name }), h('span.p', { text: formatMoney(it.price) })),
        h('div.d', { text: it.about || '' }),
        h('div.e', { text: it.desc }),
        lines.length ? h('div.s', { text: lines.join(' · ') }) : null),
      acts);
  }

  // Fiche d'un rayon : les articles du catalogue de ses catégories, vendus dans ce commerce.
  openRack(id, fx, items = null) {
    const g = this.game;
    const s = SHOPS3D[id];
    const list = items || SHOP.filter((it) => it.shop === id && fx.cats.includes(it.cat));
    const box = h('div.shop-list');
    const bal = h('div.shop-bal');
    const render = () => {
      bal.textContent = `Solde : ${formatMoney(g.save.data.money)}`;
      box.replaceChildren(...list.map((it) => this._row(it, render, { tryOn: !!fx.tryOn || id === 'boutique' })));
    };
    render();
    g.screens.card({
      kicker: s.name,
      title: fx.cats ? fx.cats.map((k) => SHOP_CATS[k]).join(' · ') : fx.label,
      extra: [bal, box, h('div.irl', { text: 'Boutique fictive du jeu : rien n’est vendu sur Strides.' })],
      buttons: [{ label: 'Fermer', primary: true, id: 'shop-close', run: () => this._clearPreview() }],
    });
  }

  // Comptoir : le vendeur salue (une fois par visite), puis tout le catalogue du commerce (ou la carte du café).
  counter(id, fx) {
    const g = this.game;
    const L = this.layout(id);
    const st = this.loaded.get(id);
    if (st?.staff) st.staff.pose = 'wave';
    const after = () => {
      if (st?.staff) st.staff.pose = 'stand';
      if (id === 'cafe') this.openCafe(fx);
      else this.openRack(id, { label: 'Comptoir', cats: Object.keys(SHOP_CATS) }, SHOP.filter((it) => it.shop === id));
    };
    if (this._greeted === id) return after();
    this._greeted = id;
    g.player.locked = true;
    g.hud.dialog(GREET[id].map((text) => ({ who: `${L.staff.name} · ${L.staff.role}`, initials: L.staff.initials, text })), () => {
      g.player.locked = false;
      after();
    });
  }

  // Café : commande sur place (une consommation = un débit, double appui ignoré).
  openCafe() {
    const g = this.game;
    const box = h('div.shop-list');
    const bal = h('div.shop-bal');
    let last = { id: null, t: 0 };
    const render = () => {
      bal.textContent = `Solde : ${formatMoney(g.save.data.money)}`;
      box.replaceChildren(...CAFE_MENU.map((m) => {
        const b = h('button.btn.primary', { text: `Commander · ${euros(m.price)}`, 'data-item': m.id });
        if (g.save.data.money < m.price) b.disabled = true;
        tap(b, () => {
          const now = performance.now();
          if (b.disabled || (last.id === m.id && now - last.t < DOUBLE_TAP_MS)) return;
          last = { id: m.id, t: now };
          const d = g.save.data;
          if (d.money < m.price) return g.hud.toast('Solde insuffisant.');
          d.money = Math.round((d.money - m.price) * 100) / 100;
          d.stats.cafe = (d.stats.cafe || 0) + 1;
          g.saveNow();
          g.updateWallet();
          if (m.id === 'cafe' || m.id === 'creme') g.audio.coffee();
          g.audio.register();
          g.hud.toast(`Paul te sert : ${m.name.toLowerCase()}. Bonne dégustation !`, 'check');
          render();
        });
        return h('div.shop-row', { 'data-item': m.id }, h('div.shop-info', {}, h('div.shop-top', {}, h('span.n', { text: m.name }), h('span.p', { text: euros(m.price) }))), h('div.shop-acts', {}, b));
      }));
    };
    render();
    g.screens.card({
      kicker: 'Le Galop · Café-boulangerie',
      title: 'La carte',
      extra: [bal, box, h('div.d', { text: 'Commandes pour une écurie : elles se retirent au comptoir quand une mission Strides le demande.' })],
      buttons: [{ label: 'Fermer', primary: true, id: 'shop-close' }],
    });
  }

  // Essayage (boutique) : la tenue est portée tant que la fiche est ouverte ; « Fermer » la retire.
  tryOn(itemId) {
    this.preview = itemId;
    this.game.player.previewItem = itemId;
    this.game.player._rebuild();
  }
  _clearPreview() {
    if (!this.preview) return;
    this.preview = null;
    this.game.player.previewItem = null;
    this.game.player._rebuild();
  }
}
