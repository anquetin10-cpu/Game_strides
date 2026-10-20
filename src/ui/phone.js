// Téléphone du joueur : écran d'accueil + applications (Strides, Carte, Messages, Écurie, Trophées, Réglages, Photo).
import { h, tap, esc } from './dom.js';
import { icon } from './icons.js';
import { drawFullMap } from './minimap.js';
import { formatMoney, formatTime, clamp } from '../core/math.js';
import { HORSES, SHOP, PROS, STABLES } from '../gameplay/data.js';
import { CONFIG } from '../config.js';
import { levelFor } from '../core/save.js';
import { WORLD } from '../world/layout.js';

const VERTICAL_LABEL = { JOBS: 'Jobs', TRANSPORT: 'Transport', EVENEMENTS: 'Événements', ANNUAIRE: 'Annuaire', ECURIES: 'Écuries' };

export class Phone {
  constructor(game, root) {
    this.game = game;
    this.layer = h('div.phone-layer');
    this.screen = h('div.phone-content');
    this.clockEl = h('span.tab-num', { text: '9:41' });
    const closeBtn = h('button.phone-close', { html: icon('close'), 'aria-label': 'Fermer' });
    tap(closeBtn, () => this.close());
    const homeBtn = h('button.home-btn', { 'aria-label': 'Accueil' });
    tap(homeBtn, () => this.show('home'));
    this.phone = h('div.phone', {}, h('div.phone-screen', {}, h('div.status-bar', {}, this.clockEl, h('span.r', {}, h('span', { text: '5G' }), h('span.bat', {}, h('i')))), this.screen, homeBtn), closeBtn);
    this.layer.appendChild(this.phone);
    root.appendChild(this.layer);
    tap(this.layer, (e) => {
      if (e.target === this.layer) this.close();
    });
    this.isOpen = false;
    this.app = 'home';
    this.tab = 'missions';
    this.mapView = null;
  }

  open(app = 'home', opts = {}) {
    const g = this.game;
    if (g.state !== 'play') return;
    this.isOpen = true;
    g.input.setEnabled(false);
    this.layer.classList.add('open');
    this.show(app, opts);
    g.audio.click();
    g.bus.emit('phone:open', app);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.layer.classList.remove('open');
    this.game.input.setEnabled(true);
    this.game.bus.emit('phone:close');
    this.game.audio.click();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  refresh() {
    if (this.isOpen) this.show(this.app, { keepScroll: true, tab: this.tab, detail: this.detail });
  }

  updateClock(text) {
    this.clockEl.textContent = text;
    if (this.app === 'home' && this.isOpen) {
      const c = this.screen.querySelector('.clock');
      if (c) c.textContent = text;
    }
  }

  show(app, opts = {}) {
    const prevBody = this.screen.querySelector('.app-body');
    const scroll = opts.keepScroll && prevBody ? prevBody.scrollTop : 0;
    this.app = app;
    this.screen.innerHTML = '';
    const fn = {
      home: () => this.renderHome(),
      strides: () => this.renderStrides(opts),
      map: () => this.renderMap(opts),
      messages: () => this.renderMessages(opts),
      stable: () => this.renderStable(),
      trophies: () => this.renderTrophies(),
      settings: () => this.renderSettings(),
      shop: () => this.renderShop(),
    }[app];
    this.screen.appendChild(fn ? fn() : this.renderHome());
    if (scroll) {
      const b = this.screen.querySelector('.app-body');
      if (b) b.scrollTop = scroll;
    }
  }

  // ---------- Accueil ----------
  renderHome() {
    const g = this.game;
    const offers = g.missions.offers.filter((o) => o.isNew).length;
    const unread = g.save.data.messages.filter((m) => !m.read).length;
    const appIcon = (id, label, ic, cls = '', badge = 0) => {
      const el = h('button.app-icon', { 'data-app': id }, h(`div.ic${cls ? `.${cls}` : ''}`, { html: icon(ic) }, badge ? h('span.badge', { text: String(badge) }) : null), h('span', { text: label }));
      tap(el, () => this.show(id));
      return el;
    };
    const photo = h('button.app-icon', {}, h('div.ic', { html: icon('camera') }), h('span', { text: 'Photo' }));
    tap(photo, () => {
      this.close();
      g.photoMode(true);
    });
    const m = g.missions;
    const avail = m.offers.filter((o) => !o.locked).length;
    const rating = g.rating();
    const widget = h('button.widget', { 'data-app': 'strides-widget' },
      h('div.w-head', {}, h('span', { html: icon('strides') }), h('span', { text: 'STRIDES' })),
      h('div.w-main', { text: m.active ? m.active.offer.title : `${avail} mission${avail > 1 ? 's' : ''} dispo` }),
      h('div.w-sub', { text: m.active ? m.objectiveText() : `${g.levelInfo().title}${rating ? ` · ★ ${rating.toFixed(1)}` : ''} · ${g.save.data.stats.jobs} mission${g.save.data.stats.jobs > 1 ? 's' : ''} réalisée${g.save.data.stats.jobs > 1 ? 's' : ''}` }));
    tap(widget, () => this.show('strides'));
    return h(
      'div.home-screen',
      {},
      h('div.home-top', {}, h('div', {}, h('div.clock.tab-num', { text: g.clockText() }), h('div.date', { text: `Deauvelle · ${g.weatherText()}` })), widget),
      h(
        'div.apps',
        {},
        appIcon('strides', 'Strides', 'strides', 'strides', offers),
        appIcon('map', 'Carte', 'map'),
        appIcon('messages', 'Messages', 'message', '', unread),
        appIcon('stable', 'Mes chevaux', 'horse'),
        appIcon('trophies', 'Trophées', 'trophy'),
        photo,
        appIcon('settings', 'Réglages', 'settings')
      )
    );
  }

  // ---------- Application Strides ----------
  renderStrides(opts = {}) {
    const g = this.game;
    if (opts.tab) this.tab = opts.tab;
    this.detail = opts.detail || null;
    const tabs = [
      ['missions', 'Missions', 'briefcase'],
      ['ecuries', 'Écuries', 'stable'],
      ['transport', 'Transport', 'truck'],
      ['evenements', 'Événements', 'event'],
      ['annuaire', 'Annuaire', 'directory'],
      ['profil', 'Profil', 'user'],
    ];
    const rail = h('div.app-rail', {}, h('div.logo', { html: icon('strides') }));
    const counts = this._tabCounts();
    for (const [id, label, ic] of tabs) {
      const b = h(`button.rail-btn${this.tab === id ? '.on' : ''}`, { 'data-tab': id }, h('div', { html: icon(ic) }), h('span', { text: label }), counts[id] ? h('i.dot') : null);
      tap(b, () => this.show('strides', { tab: id }));
      rail.appendChild(b);
    }
    const main = h('div.app-main');
    const render = {
      missions: () => this._tabOffers('JOBS', 'Missions', 'Jobs & services près de vous'),
      transport: () => this._tabTransport(),
      evenements: () => this._tabEvents(),
      ecuries: () => this._tabStables(),
      annuaire: () => this._tabPros(),
      profil: () => this._tabProfile(),
    }[this.tab];
    main.append(...render());
    // Marquer les offres de l'onglet comme vues.
    for (const o of g.missions.offers) if (this._offerTab(o) === this.tab) o.isNew = false;
    g.missions.updateBadge();
    return h('div.app', {}, rail, main);
  }

  _offerTab(o) {
    return { JOBS: 'missions', TRANSPORT: 'transport', EVENEMENTS: 'evenements', ANNUAIRE: 'annuaire', ECURIES: 'ecuries' }[o.vertical] || 'missions';
  }
  _tabCounts() {
    const c = {};
    for (const o of this.game.missions.offers) if (o.isNew) c[this._offerTab(o)] = (c[this._offerTab(o)] || 0) + 1;
    return c;
  }

  _head(title, sub, right) {
    return h('div.app-head', {}, h('div', {}, h('h3', { text: title }), sub ? h('div.sub', { text: sub }) : null), right ? h('div.right', {}, right) : null);
  }

  _activeCard() {
    const g = this.game;
    const m = g.missions.active;
    if (!m) return null;
    const ab = h('button.btn.small.ghost', { text: 'Abandonner' });
    tap(ab, () => {
      g.missions.abandon();
      this.refresh();
    });
    const gps = h('button.btn.small', { text: 'GPS' });
    tap(gps, () => {
      g.missions.refreshWaypoint();
      this.close();
    });
    return h('div.mcard.active', {},
      h('div.top', {}, h('span.chip.ok', { text: 'EN COURS' }), h('span.pay', { text: formatMoney(m.offer.pay) })),
      h('div.title', { text: m.offer.title }),
      h('div.meta', { text: g.missions.objectiveText() || '' }),
      h('div.acts', {}, gps, ab));
  }

  offerCard(o) {
    const g = this.game;
    const d = g.distanceTo(o.place);
    const client = o.client;
    const card = h(`div.mcard`, { 'data-offer': o.id },
      h('div.top', {}, h(`span.chip${o.story ? '.story' : ''}`, { text: `${VERTICAL_LABEL[o.vertical] || o.vertical} · ${o.category}` }), h('span.pay', { text: o.pay ? formatMoney(o.pay) : o.payLabel || '—' })),
      h('div.title', { text: o.title }),
      h('div.meta', { text: `${o.placeName} · ${(d / 1000).toFixed(1)} km${o.duration ? ` · ${o.duration}` : ''}` }),
      o.desc ? h('div.meta', { text: o.desc }) : null,
      client ? h('div.client', {}, h('div.av', { text: client.initials }), h('span', { text: client.name }), h('span.rating', { text: `★ ${client.rating.toFixed(1)}` }), client.verified ? h('span.verified', { html: `${icon('check')}Vérifié` }) : null) : null);
    const acts = h('div.acts');
    const refuse = h('button.btn', { text: 'Refuser', 'data-act': 'refuse' });
    const accept = h('button.btn.primary', { text: 'Accepter', 'data-act': 'accept' });
    tap(refuse, () => {
      g.missions.refuse(o.id);
      this.refresh();
    });
    tap(accept, () => {
      if (g.missions.accept(o.id)) this.close();
      else this.refresh();
    });
    if (o.locked) {
      acts.appendChild(h('div.meta', { text: o.locked }));
    } else acts.append(refuse, accept);
    card.appendChild(acts);
    return card;
  }

  _tabOffers(vertical, title, sub) {
    const g = this.game;
    const offers = g.missions.offers.filter((o) => o.vertical === vertical);
    const body = h('div.app-body.scrollable');
    const active = this._activeCard();
    if (active) body.append(h('div.section-t', { text: 'Mission en cours' }), h('div.cards', {}, active));
    body.appendChild(h('div.section-t', { text: `${offers.length} proposition${offers.length > 1 ? 's' : ''}` }));
    if (offers.length) body.appendChild(h('div.cards', {}, ...offers.map((o) => this.offerCard(o))));
    else body.appendChild(h('div.empty', { text: 'Aucune mission pour le moment. Les nouvelles offres arrivent en notification — reste connecté.' }));
    return [this._head(title, sub), body];
  }

  _tabTransport() {
    const g = this.game;
    const offers = g.missions.offers.filter((o) => o.vertical === 'TRANSPORT');
    const body = h('div.app-body.scrollable');
    const active = this._activeCard();
    if (active && g.missions.active.offer.vertical === 'TRANSPORT') body.append(h('div.section-t', { text: 'Mission en cours' }), h('div.cards', {}, active));
    body.appendChild(h('div.section-t', { text: 'Missions de transport' }));
    if (offers.length) body.appendChild(h('div.cards', {}, ...offers.map((o) => this.offerCard(o))));
    else body.appendChild(h('div.empty', { text: g.save.data.completed.includes('transport') || g.levelInfo().level >= 2 ? 'Pas de transport à effectuer pour l’instant.' : 'Débloqué au statut Cavalier.' }));
    // Réserver un transport = voyage rapide.
    body.appendChild(h('div.section-t', { text: 'Réserver un transporteur' }));
    const dests = STABLES.map((s) => s).concat([{ id: 'town', name: 'Deauvelle — centre', place: { x: 20, z: -240 } }, { id: 'beach', name: 'Plage de Deauvelle', place: { x: 60, z: -385 } }]);
    const list = h('div.cards');
    for (const s of dests) {
      const d = g.distanceTo(s.place);
      const price = Math.round(15 + d / 25);
      const btn = h('button.btn.small.primary', { text: `Réserver · ${price} €` });
      tap(btn, () => {
        if (g.missions.active) return g.hud.toast('Termine ta mission en cours d’abord.');
        if (g.player.mode === 'drive') return g.hud.toast('Sors du camion d’abord.');
        if (g.save.data.money < price) return g.hud.toast('Solde insuffisant.');
        this.close();
        g.fastTravel(s.place, price, s.name);
      });
      list.appendChild(h('div.mcard', {}, h('div.top', {}, h('span.chip', { text: 'Normandie Horse Transport' }), h('span.verified', { html: `${icon('check')}Vérifié` })), h('div.title', { text: s.name }), h('div.meta', { text: `${(d / 1000).toFixed(1)} km · toi + ton cheval · suivi en temps réel` }), h('div.acts', {}, btn)));
    }
    body.appendChild(list);
    return [this._head('Transport', 'Transporteurs vérifiés · suivi en direct'), body];
  }

  _tabEvents() {
    const g = this.game;
    const offers = g.missions.offers.filter((o) => o.vertical === 'EVENEMENTS');
    const body = h('div.app-body.scrollable');
    const active = this._activeCard();
    if (active && g.missions.active.offer.vertical === 'EVENEMENTS') body.append(h('div.section-t', { text: 'En cours' }), h('div.cards', {}, active));
    body.appendChild(h('div.section-t', { text: 'Compétitions' }));
    if (offers.length) body.appendChild(h('div.cards', {}, ...offers.map((o) => this.offerCard(o))));
    else body.appendChild(h('div.empty', { text: 'Les engagements s’ouvrent avec ta réputation. Continue tes missions !' }));
    // Entraînements libres.
    body.appendChild(h('div.section-t', { text: 'Entraînements libres (chrono)' }));
    const tr = h('div.cards');
    for (const a of g.activities.list()) {
      const best = g.save.data.bestTimes[a.id];
      const btn = h('button.btn.small.primary', { text: 'Itinéraire' });
      tap(btn, () => {
        g.gps.set(a.start, a.name);
        this.close();
      });
      tr.appendChild(h('div.mcard', {}, h('div.top', {}, h('span.chip', { text: a.kind }), h('span.pay', { text: best ? formatTime(best) : '—' })), h('div.title', { text: a.name }), h('div.meta', { text: a.desc }), h('div.acts', {}, btn)));
    }
    body.appendChild(tr);
    // Vente de chevaux.
    body.appendChild(h('div.section-t', { text: 'Vente Élite · chevaux disponibles' }));
    const sale = h('div.cards');
    for (const hd of Object.values(HORSES)) {
      if (!hd.price) continue;
      const owned = g.save.data.horses.includes(hd.id);
      const btn = h(`button.btn.small${owned ? '' : '.primary'}`, { text: owned ? 'Acquis' : `Acheter · ${formatMoney(hd.price)}` });
      if (!owned)
        tap(btn, () => {
          if (g.buyHorse(hd.id)) this.refresh();
        });
      sale.appendChild(h('div.mcard', {}, h('div.top', {}, h('span.chip', { text: `${hd.breed} · ${hd.age} ans` }), h('span.pay', { text: formatMoney(hd.price) })), h('div.title', { text: hd.name }), h('div.meta', { text: hd.desc }), this._horseBars(hd), h('div.acts', {}, btn)));
    }
    body.appendChild(sale);
    return [this._head('Événements', 'Concours · Courses · Ventes'), body];
  }

  _tabStables() {
    const g = this.game;
    const offers = g.missions.offers.filter((o) => o.vertical === 'ECURIES');
    const body = h('div.app-body.scrollable');
    if (offers.length) body.append(h('div.section-t', { text: 'Demandes' }), h('div.cards', {}, ...offers.map((o) => this.offerCard(o))));
    const pick = g.missions.stablePicker;
    body.appendChild(h('div.section-t', { text: pick ? pick.prompt : 'Écuries à proximité' }));
    const list = h('div.cards');
    for (const s of STABLES) {
      const d = g.distanceTo(s.place);
      const gps = h('button.btn.small', { text: 'Itinéraire' });
      tap(gps, () => {
        g.gps.set(s.place, s.name);
        this.close();
      });
      const acts = h('div.acts', {}, gps);
      if (pick) {
        const choose = h('button.btn.small.primary', { text: 'Choisir', 'data-stable': s.id });
        tap(choose, () => {
          pick.onPick(s);
          this.refresh();
        });
        acts.appendChild(choose);
      }
      list.appendChild(h('div.mcard', {},
        h('div.top', {}, h('span.chip', { text: `${s.price} € / mois` }), h('span.client', {}, h('span.rating', { text: `★ ${s.rating.toFixed(1)}` }))),
        h('div.title', { text: s.name }),
        h('div.meta', { text: `${(d / 1000).toFixed(1)} km · ${s.desc}` }),
        h('div.meta', { text: s.services.join(' · ') }),
        acts));
    }
    body.appendChild(list);
    return [this._head('Écuries', 'Pensions et structures vérifiées'), body];
  }

  _tabPros() {
    const g = this.game;
    const offers = g.missions.offers.filter((o) => o.vertical === 'ANNUAIRE');
    const body = h('div.app-body.scrollable');
    if (offers.length) body.append(h('div.section-t', { text: 'Demandes' }), h('div.cards', {}, ...offers.map((o) => this.offerCard(o))));
    body.appendChild(h('div.section-t', { text: 'Professionnels vérifiés près de vous' }));
    const list = h('div.cards');
    for (const p of PROS) {
      const d = g.distanceTo(p.place);
      const call = h('button.btn.small.primary', { text: 'Contacter', 'data-pro': p.id });
      tap(call, () => {
        this.close();
        g.contactPro(p);
      });
      const gps = h('button.btn.small', { text: 'Itinéraire' });
      tap(gps, () => {
        g.gps.set(p.place, p.name);
        this.close();
      });
      list.appendChild(h('div.mcard', {},
        h('div.top', {}, h('span.chip', { text: p.job }), h('span.verified', { html: `${icon('check')}Vérifié` })),
        h('div.client', {}, h('div.av', { text: p.initials }), h('span', { text: p.name }), h('span.rating', { text: `★ ${p.rating.toFixed(1)}` }), h('span.meta', { text: `(${p.reviews} avis)` })),
        h('div.meta', { text: `${(d / 1000).toFixed(1)} km · ${p.avail}` }),
        h('div.acts', {}, gps, call)));
    }
    body.appendChild(list);
    return [this._head('Annuaire', 'Maréchaux, vétérinaires, ostéos, transporteurs…'), body];
  }

  _tabProfile() {
    const g = this.game;
    const d = g.save.data;
    const lv = levelFor(d.xp);
    const rating = g.rating();
    const body = h('div.app-body.scrollable');
    const initials = d.playerName.slice(0, 2).toUpperCase();
    body.append(
      h('div.profile-head', {}, h('div.av', { text: initials }), h('div', {}, h('div.n', { text: d.playerName }), h('div.l', { text: `${lv.title} · ${rating ? `★ ${rating.toFixed(2)} (${d.ratings.length} avis)` : 'Pas encore d’avis'}` }), lv.level >= 3 ? h('span.verified', { html: `${icon('check')}Profil vérifié`, style: { marginTop: '6px' } }) : null)),
      h('div', { style: { marginTop: '14px' } },
        h('div.kv', {}, h('span', { text: 'Missions réalisées' }), h('b', { text: String(d.stats.jobs) })),
        h('div.kv', {}, h('span', { text: 'Revenus via Strides' }), h('b', { text: formatMoney(d.stats.earned) })),
        h('div.kv', {}, h('span', { text: 'Réputation' }), h('b', { text: `${d.xp} XP${lv.next ? ` / ${lv.next.xp}` : ''}` })),
        h('div.kv', {}, h('span', { text: 'Statut suivant' }), h('b', { text: lv.next ? lv.next.title : 'Statut maximum' }))
      )
    );
    body.appendChild(this.promo());
    return [this._head('Profil', 'Ton profil professionnel Strides'), body];
  }

  promo() {
    const btn = h('button.btn', { text: CONFIG.downloadUrl ? 'Télécharger' : 'Découvrir', 'data-cta': 'download' });
    tap(btn, () => this.game.openDownload('phone'));
    return h('div.promo', {}, h('div', { style: { flex: 1 } }, h('div.t', { text: 'Cette app existe pour de vrai.' }), h('div.s', { text: 'Jobs, écuries, transport, événements, annuaire : STRIDES réunit les pros du cheval.' })), btn);
  }

  // ---------- Carte ----------
  renderMap() {
    const g = this.game;
    const wrap = h('div.map-app');
    const cv = h('canvas');
    wrap.appendChild(cv);
    const back = h('button.back', { html: icon('back'), style: { position: 'absolute', left: '12px', top: '10px', width: '34px', height: '34px', borderRadius: '10px', background: 'rgba(18,19,22,.8)', display: 'grid', placeItems: 'center' } });
    tap(back, () => this.show('home'));
    wrap.appendChild(back);
    wrap.appendChild(h('div.map-tip', { text: 'Touchez la carte pour placer un repère GPS' }));
    wrap.appendChild(h('div.map-legend', {}, ...[['Mission', 'mission'], ['Écurie', 'stable'], ['Boutique', 'shop'], ['Événement', 'event']].map(([l]) => h('span', {}, h('i'), l))));
    requestAnimationFrame(() => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      const f = g.player.focus.pos;
      const fit = Math.min(cv.width, cv.height) / WORLD.size;
      this.mapView = this.mapView || { x: f.x * 0.3, z: f.z * 0.3, scale: fit * 1.25 };
      this.mapView.dpr = dpr;
      this.mapView.labels = true;
      let api = drawFullMap(cv, g, this.mapView);
      const redraw = () => (api = drawFullMap(cv, g, this.mapView));
      // Glisser pour déplacer, pincer/molette pour zoomer, toucher pour un repère.
      const pts = new Map();
      let moved = 0;
      let pinch = null;
      cv.addEventListener('pointerdown', (e) => {
        cv.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        moved = 0;
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: this.mapView.scale };
        }
      });
      cv.addEventListener('pointermove', (e) => {
        const p = pts.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX;
        p.y = e.clientY;
        if (pts.size === 2 && pinch) {
          const [a, b] = [...pts.values()];
          this.mapView.scale = clamp((pinch.s * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, fit * 0.9, fit * 8);
          moved += 10;
        } else {
          moved += Math.abs(dx) + Math.abs(dy);
          this.mapView.x -= (dx * dpr) / this.mapView.scale;
          this.mapView.z -= (dy * dpr) / this.mapView.scale;
        }
        redraw();
      });
      const up = (e) => {
        if (pts.has(e.pointerId) && moved < 8 && pts.size === 1) {
          const r2 = cv.getBoundingClientRect();
          const w = api.toWorld((e.clientX - r2.left) * dpr, (e.clientY - r2.top) * dpr);
          g.gps.set(w, 'Repère');
          g.hud.toast('Repère GPS placé');
          redraw();
        }
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch = null;
      };
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);
      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.mapView.scale = clamp(this.mapView.scale * (e.deltaY < 0 ? 1.15 : 0.87), fit * 0.9, fit * 8);
        redraw();
      }, { passive: false });
    });
    return wrap;
  }

  // ---------- Messages ----------
  renderMessages(opts = {}) {
    const g = this.game;
    const msgs = g.save.data.messages;
    const convs = new Map();
    for (const m of msgs) {
      if (!convs.has(m.from)) convs.set(m.from, []);
      convs.get(m.from).push(m);
    }
    const main = h('div.app-main');
    if (opts.conv && convs.has(opts.conv)) {
      const list = convs.get(opts.conv);
      list.forEach((m) => (m.read = true));
      g.saveSoon();
      const back = h('button.back', { html: icon('back') });
      tap(back, () => this.show('messages'));
      main.append(h('div.app-head', {}, back, h('div', {}, h('h3', { text: opts.conv }), h('div.sub', { text: 'via Strides' }))));
      const body = h('div.app-body.scrollable', {}, h('div.bubbles', {}, ...list.map((m) => h(`div.bubble${m.me ? '.me' : ''}`, { text: m.text }))));
      main.appendChild(body);
      requestAnimationFrame(() => (body.scrollTop = body.scrollHeight));
    } else {
      main.appendChild(this._head('Messages', `${convs.size} conversation${convs.size > 1 ? 's' : ''}`));
      const body = h('div.app-body.scrollable.msg-list');
      if (!convs.size) body.appendChild(h('div.empty', { text: 'Aucun message.' }));
      for (const [from, list] of [...convs.entries()].reverse()) {
        const last = list[list.length - 1];
        const unread = list.some((m) => !m.read);
        const row = h('button.conv', {}, h('div.av', { text: last.initials || from.slice(0, 2).toUpperCase() }), h('div', {}, h('div.n', { text: `${from}${unread ? ' •' : ''}` }), h('div.p', { text: last.text })));
        tap(row, () => this.show('messages', { conv: from }));
        body.appendChild(row);
      }
      main.appendChild(body);
    }
    const app = h('div.app', {}, main);
    return app;
  }

  // ---------- Mes chevaux ----------
  _horseBars(hd) {
    const row = (k, v) => h('div.bar-row', {}, h('span', { text: k }), h('div.bar', {}, h('i', { style: { width: `${clamp((v - 0.8) / 0.5, 0.05, 1) * 100}%` } })), h('span', { text: `${Math.round(v * 100)}` }));
    return h('div.bars', {}, row('Vitesse', hd.speed), row('Saut', hd.jump), row('Endurance', hd.stamina));
  }

  renderStable() {
    const g = this.game;
    const d = g.save.data;
    const main = h('div.app-main');
    main.appendChild(this._head('Mes chevaux', `${d.horses.length} cheval${d.horses.length > 1 ? 'aux' : ''} · équipement`));
    const body = h('div.app-body.scrollable');
    const cards = h('div.cards');
    const swatch = { bay: '#7a4a2b', grey: '#c9c6c0', black: '#24221f', chestnut: '#9a5a32', palomino: '#d2a965' };
    for (const id of d.horses) {
      const hd = HORSES[id];
      const active = d.activeHorse === id;
      const btn = h(`button.btn.small${active ? '' : '.primary'}`, { text: active ? 'Monture actuelle' : 'Seller ce cheval' });
      if (!active)
        tap(btn, () => {
          g.setActiveHorse(id);
          this.refresh();
        });
      cards.appendChild(h(`div.mcard${active ? '.active' : ''}`, {}, h('div.horse-card', {}, h('div.sw', { style: { background: swatch[hd.coat] || '#888' } }), h('div', {}, h('div.title', { text: hd.name }), h('div.meta', { text: `${hd.breed} · ${hd.age} ans` }))), this._horseBars(hd), h('div.acts', {}, btn)));
    }
    body.appendChild(cards);
    body.appendChild(h('div.section-t', { text: 'Équipement', style: { marginTop: '14px' } }));
    const owned = SHOP.filter((s) => d.upgrades.includes(s.id));
    if (!owned.length) body.appendChild(h('div.empty', { text: 'Aucun équipement. Passe à la Sellerie du Port, à Deauvelle.' }));
    for (const s of owned) body.appendChild(h('div.kv', {}, h('span', { text: s.name }), h('b', { text: s.desc })));
    const sale = h('button.btn.small.primary', { text: 'Vente Élite : voir les chevaux', style: { marginTop: '12px', marginRight: '8px' } });
    tap(sale, () => this.show('strides', { tab: 'evenements' }));
    body.appendChild(sale);
    const call = h('button.btn.small', { text: 'Siffler mon cheval', style: { marginTop: '12px' } });
    tap(call, () => {
      this.close();
      if (!g.player.whistle()) g.hud.toast('Descends de cheval ou du camion pour siffler.');
    });
    body.appendChild(call);
    main.appendChild(body);
    return h('div.app', {}, main);
  }

  // ---------- Trophées ----------
  renderTrophies() {
    const g = this.game;
    const d = g.save.data;
    const main = h('div.app-main');
    main.appendChild(this._head('Trophées', 'Ta carrière à Deauvelle'));
    const body = h('div.app-body.scrollable');
    const stat = (k, v) => h('div.stat', {}, h('div.k', { text: k }), h('div.v', { text: v }));
    body.appendChild(h('div.result-grid', {}, stat('Fers d’or', `${d.horseshoes.length}/${g.collectibles.total}`), stat('Missions', String(d.stats.jobs)), stat('Gains', formatMoney(d.stats.earned)), stat('Sauts', String(d.stats.jumps)), stat('Distance', `${(d.stats.distance / 1000).toFixed(1)} km`), stat('Note', g.rating() ? `★ ${g.rating().toFixed(1)}` : '—')));
    body.appendChild(h('div.section-t', { text: 'Meilleurs chronos', style: { marginTop: '14px' } }));
    for (const a of g.activities.list()) body.appendChild(h('div.kv', {}, h('span', { text: a.name }), h('b', { text: d.bestTimes[a.id] ? formatTime(d.bestTimes[a.id]) : '—' })));
    body.appendChild(h('div.section-t', { text: 'Histoire', style: { marginTop: '14px' } }));
    for (const s of g.missions.storyList()) body.appendChild(h('div.kv', {}, h('span', { text: s.title }), h('b', { text: d.completed.includes(s.id) ? '✓' : '—' })));
    main.appendChild(body);
    return h('div.app', {}, main);
  }

  // ---------- Réglages ----------
  renderSettings() {
    const g = this.game;
    const st = g.save.data.settings;
    const main = h('div.app-main');
    main.appendChild(this._head('Réglages', ''));
    const body = h('div.app-body.scrollable');
    const toggle = (label, key, onChange) => {
      const t = h(`button.toggle${st[key] ? '.on' : ''}`, { 'aria-label': label });
      tap(t, () => {
        st[key] = !st[key];
        t.classList.toggle('on', st[key]);
        onChange?.(st[key]);
        g.saveSoon();
      });
      return h('div.set-row', {}, h('span', { text: label }), t);
    };
    body.appendChild(toggle('Son', 'sound', (v) => g.audio.setEnabled(v)));
    const seg = (label, key, options, onChange) => {
      const s = h('div.seg');
      for (const [v, l] of options) {
        const b = h(`button${st[key] === v ? '.on' : ''}`, { text: l });
        tap(b, () => {
          st[key] = v;
          [...s.children].forEach((c) => c.classList.remove('on'));
          b.classList.add('on');
          onChange?.(v);
          g.saveSoon();
        });
        s.appendChild(b);
      }
      return h('div.set-row', {}, h('span', { text: label }), s);
    };
    body.appendChild(seg('Qualité graphique', 'quality', [['auto', 'Auto'], ['high', 'Haute'], ['low', 'Économie']], (v) => g.applyQuality(v)));
    body.appendChild(seg('Sensibilité caméra', 'camSens', [[0.7, 'Douce'], [1, 'Normale'], [1.4, 'Rapide']], (v) => (g.cam.sens = v)));
    const reset = h('button.btn.small.ghost', { text: 'Recommencer la partie' });
    tap(reset, () => {
      if (confirm('Effacer ta progression et recommencer ?')) g.resetGame();
    });
    body.appendChild(h('div.set-row', {}, h('span', { text: 'Progression' }), reset));
    body.appendChild(this.promo());
    body.appendChild(h('div.irl', { html: 'STRIDES Grand Tour — jeu de démonstration. Univers, lieux et personnages fictifs.' }));
    main.appendChild(body);
    return h('div.app', {}, main);
  }

  // ---------- Boutique (Sellerie) ----------
  renderShop() {
    const g = this.game;
    const d = g.save.data;
    const main = h('div.app-main');
    main.appendChild(this._head('Sellerie du Port', `Solde : ${formatMoney(d.money)}`));
    const body = h('div.app-body.scrollable');
    for (const s of SHOP) {
      const owned = d.upgrades.includes(s.id);
      const locked = s.requires && !d.upgrades.includes(s.requires);
      const btn = h(`button.btn${owned ? '' : '.primary'}`, { text: owned ? 'Acquis' : locked ? 'Verrouillé' : formatMoney(s.price), 'data-item': s.id });
      if (!owned && !locked)
        tap(btn, () => {
          if (g.buyUpgrade(s.id)) this.refresh();
        });
      body.appendChild(h('div.shop-item', {}, h('div', { style: { flex: 1 } }, h('div.n', { text: s.name }), h('div.d', { text: `${s.desc}${locked ? ' · nécessite la selle mixte' : ''}` })), btn));
    }
    body.appendChild(h('div.irl', { html: `<b>Sur Strides</b>, retrouvez les selliers et les pros de l’équipement près de chez vous, avec avis vérifiés.` }));
    main.appendChild(body);
    return h('div.app', {}, main);
  }
}

export { esc };
