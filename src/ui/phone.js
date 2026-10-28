// Téléphone du joueur : écran d'accueil + applications (Strides, Carte, Messages, Mes chevaux, Mon écurie, Guide local,
// Trophées, Météo, Photo, Réglages). Seule l'app Strides reprend la vraie application ; les autres sont des fonctions du jeu.
import { h, tap, esc } from './dom.js';
import { icon } from './icons.js';
import { drawBlip, drawFullMap } from './minimap.js';
import { formatMoney, formatTime, clamp, dec } from '../core/math.js';
import { HORSES, SHOP, PROS, STABLES, STABLE_UPGRADES, SKILL_LABEL } from '../gameplay/data.js';
import { CONFIG } from '../config.js';
import { levelFor } from '../core/save.js';
import { WORLD } from '../world/layout.js';
import { conditionText, temperature, wind, rainTarget, coverAt, tideLevel, tideEvents, tideCoef, hhmm, realTideHeight } from '../world/weather.js';
import { sunTimes } from '../world/sun.js';
import { ion } from './ionicons.js';
import { renderProHome, renderRequest, requestCard, appToast, isStridesOffer } from './requests.js';
import { renderActivities } from './activities-app.js';
import { renderRanking } from './ranking-app.js';

export class Phone {
  constructor(game, root) {
    this.game = game;
    // Classements en direct : l'app ouverte se met à jour quand un joueur inscrit un résultat (au plus 2 fois/s).
    game.online?.listeners.push(() => {
      if (!this.isOpen || (this.app !== 'ranking' && this.app !== 'settings') || this._rankT) return;
      this._rankT = setTimeout(() => {
        this._rankT = null;
        if (this.isOpen && (this.app === 'ranking' || this.app === 'settings') && !this.screen.querySelector('input:focus')) this.show(this.app, { keepScroll: true });
      }, 500);
    });
    this.layer = h('div.phone-layer');
    this.screen = h('div.phone-content');
    this.clockEl = h('span.tab-num', { text: '9:41' });
    const closeBtn = h('button.phone-close', { html: icon('close'), 'aria-label': 'Fermer' });
    tap(closeBtn, () => this.close());
    const homeBtn = h('button.home-btn', { 'aria-label': 'Accueil' });
    // Barre d'accueil : on la balaie vers le haut, comme sur iOS (un toucher un peu bas sous « Accepter » ne quitte pas l'app).
    let swipeY = null;
    homeBtn.addEventListener('pointerdown', (e) => {
      swipeY = e.clientY;
      homeBtn.setPointerCapture?.(e.pointerId);
      e.stopPropagation();
    });
    homeBtn.addEventListener('pointerup', (e) => {
      if (swipeY !== null && swipeY - e.clientY > 16) this.show('home');
      swipeY = null;
    });
    homeBtn.addEventListener('pointercancel', () => (swipeY = null));
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
    document.body.classList.add('phone-open');
    g.input.setEnabled(false);
    this.layer.classList.add('open');
    this.show(app, opts);
    g.audio.click();
    g.bus.emit('phone:open', app);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    document.body.classList.remove('phone-open');
    this.layer.classList.remove('open');
    // Les toasts de l'app appartiennent à la session ouverte : on ne les retrouve pas à la réouverture.
    this.phone.querySelector('.app-toasts')?.replaceChildren();
    this.game.input.setEnabled(true);
    this.game.bus.emit('phone:close');
    this.game.audio.click();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  refresh() {
    // Pas de rendu pendant une confirmation ou une feuille ouverte sur l'écran « Demande reçue ».
    if (!this.isOpen || (this.app === 'request' && this._reqBusy)) return;
    // Carte ouverte : simple redessin (le geste en cours et l'astuce fermée sont conservés).
    if (this.app === 'map') this.redrawMap?.();
    else this.show(this.app, { keepScroll: true, tab: this.tab, detail: this.detail, id: this.requestId });
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
    const railScroll = this.screen.querySelector('.app-rail')?.scrollTop || 0;
    this.app = app;
    this.screen.innerHTML = '';
    const fn = {
      home: () => this.renderHome(),
      strides: () => this.renderStrides(opts),
      request: () => renderRequest(this, opts),
      map: () => this.renderMap(opts),
      messages: () => this.renderMessages(opts),
      stable: () => this.renderStable(),
      trophies: () => this.renderTrophies(),
      settings: () => this.renderSettings(),
      shop: () => this.renderShop(),
      ecurie: () => this.renderEcurie(),
      guide: () => this.renderGuide(opts),
      weather: () => this.renderWeather(),
      activities: () => renderActivities(this, opts),
      ranking: () => renderRanking(this, opts),
    }[app];
    this.screen.appendChild(fn ? fn() : this.renderHome());
    if (scroll) {
      const b = this.screen.querySelector('.app-body');
      if (b) b.scrollTop = scroll;
    }
    // Rail Strides défilant (écrans courts) : garder sa position et l'onglet actif en vue.
    const rail = this.screen.querySelector('.app-rail');
    const on = rail && rail.querySelector('.rail-btn.on');
    if (on) {
      const top = on.offsetTop - rail.offsetTop;
      rail.scrollTop = Math.min(Math.max(railScroll, top + on.offsetHeight - rail.clientHeight + 6), top - 6);
    }
  }

  // ---------- Accueil ----------
  renderHome() {
    const g = this.game;
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
      h('div.w-sub', { text: m.active ? m.objectiveText() : `${g.levelInfo().title}${rating ? ` · ★ ${dec(rating)}` : ''} · ${g.save.data.stats.jobs} mission${g.save.data.stats.jobs > 1 ? 's' : ''} réalisée${g.save.data.stats.jobs > 1 ? 's' : ''}` }));
    tap(widget, () => this.show('strides'));
    return h(
      'div.home-screen.scrollable',
      {},
      h('div.home-top', {}, h('div', {}, h('div.clock.tab-num', { text: g.clockText() }), h('div.date', { text: `Deauvelle · ${g.weatherText()}` })), widget),
      h(
        'div.apps',
        {},
        appIcon('strides', 'Strides', 'strides', 'strides', g.missions.offers.filter((o) => o.isNew && isStridesOffer(o)).length),
        appIcon('map', 'Carte', 'map'),
        appIcon('messages', 'Messages', 'message', '', unread),
        appIcon('stable', 'Mes chevaux', 'horse'),
        appIcon('ecurie', 'Mon écurie', 'home'),
        appIcon('activities', 'Activités', 'event', '', g.missions.offers.filter((o) => o.isNew && o.vertical === 'EVENEMENTS').length),
        appIcon('guide', 'Guide local', 'directory', '', g.missions.offers.filter((o) => o.isNew && (o.vertical === 'ANNUAIRE' || o.vertical === 'ECURIES')).length),
        appIcon('ranking', 'Classements', 'podium'),
        appIcon('trophies', 'Trophées', 'trophy'),
        appIcon('weather', 'Météo', 'weather'),
        photo,
        appIcon('settings', 'Réglages', 'settings')
      )
    );
  }

  // ---------- Application Strides ----------
  // Uniquement ce que propose la vraie application : missions reçues (prestataire), recrutement d'un professionnel
  // (client) et profil. Pensions, santé, concours et ventes sont des fonctions du jeu, rangées dans d'autres apps.
  renderStrides(opts = {}) {
    const g = this.game;
    if (opts.tab) this.tab = opts.tab;
    if (!['missions', 'recruter', 'profil'].includes(this.tab)) this.tab = 'missions';
    this.detail = opts.detail || null;
    const tabs = [
      ['missions', 'Demandes', 'document-text-outline'],
      ['recruter', 'Recruter', 'people-outline'],
      ['profil', 'Profil', 'person-outline'],
    ];
    const rail = h('div.app-rail.scrollable', {}, h('div.logo', { html: icon('strides') }));
    const counts = this._tabCounts();
    for (const [id, label, ic] of tabs) {
      const b = h(`button.rail-btn${this.tab === id ? '.on' : ''}`, { 'data-tab': id }, h('div', { html: ion(ic) }), h('span', { text: label }), counts[id] ? h('i.dot') : null);
      tap(b, () => this.show('strides', { tab: id }));
      rail.appendChild(b);
    }
    const main = h('div.app-main');
    const render = {
      missions: () => renderProHome(this),
      recruter: () => this._tabRecruit(),
      profil: () => this._tabProfile(),
    }[this.tab];
    main.append(...render());
    for (const o of g.missions.offers) if (this.tab === 'missions' && isStridesOffer(o)) o.isNew = false;
    g.missions.updateBadge();
    const app = h('div.app', {}, rail, main);
    // Première ouverture : mention fictive, à valider une fois (mémorisée dans la sauvegarde).
    if (!g.save.data.flags.stridesNotice) requestAnimationFrame(() => this._stridesNotice());
    return app;
  }

  _stridesNotice() {
    const g = this.game;
    if (this.app !== 'strides' || this.screen.querySelector('.notice-sheet')) return;
    const ok = h('button.btn.primary', { text: 'J’ai compris', 'data-id': 'notice-ok' });
    const layer = h('div.sheet-layer.notice-sheet', {}, h('div.sheet', {}, h('div.handle'),
      h('div.sheet-body.scrollable', {},
        h('div.st-h2', { text: 'Strides · version jeu' }),
        h('div.st-body.mt4', { text: 'Missions, profils et sommes fictifs. Rien n’est envoyé, aucun paiement réel.' }),
        h('div.req-cap.mt8', { text: 'Deux usages, comme dans la vraie application : recevoir des missions et recruter un professionnel.' })),
      h('div.sheet-foot', {}, ok)));
    tap(ok, () => {
      g.save.data.flags.stridesNotice = true;
      g.saveSoon();
      layer.remove();
    });
    this.screen.appendChild(layer);
  }

  _tabCounts() {
    const offers = this.game.missions.offers.filter((o) => o.isNew && isStridesOffer(o));
    return { missions: offers.length, recruter: this.game.missions.hirePicker ? 1 : 0 };
  }

  _head(title, sub, right) {
    // Retour à l'accueil du téléphone : la barre du bas reste une cible fine.
    const back = h('button.back', { html: icon('back'), 'aria-label': 'Retour' });
    tap(back, () => this.show('home'));
    return h('div.app-head', {}, back, h('div', {}, h('h3', { text: title }), sub ? h('div.sub', { text: sub }) : null), right ? h('div.right', {}, right) : null);
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

  // Recruter (« Je cherche un professionnel ») : besoin, profils comparables, confirmation avec débit unique.
  _tabRecruit() {
    const g = this.game;
    const d = g.save.data;
    const pick = g.missions.hirePicker;
    const body = h('div.app-body.scrollable.st-home');
    body.append(h('div.st-eyebrow', { text: 'Je cherche un professionnel' }), h('div.st-h1', { text: pick ? 'Votre besoin\ndu jour.' : 'Recruter\nun professionnel.' }));
    if (pick) {
      body.append(
        h('div.st-card', {}, h('div.st-eyebrow', { text: 'Besoin' }), h('div.st-body.mt4', { text: pick.need })),
        h('div.st-eyebrow.sec', { text: `${pick.profiles.length} profils disponibles` })
      );
      for (const p of pick.profiles) {
        const see = h('button.btn.small.primary', { text: 'Voir le profil', 'data-hire': p.id });
        tap(see, () => this._hireSheet(p));
        body.appendChild(h('div.st-card.hire-card', {},
          h('div.req-row', {}, h('div.st-av', { text: p.initials }), h('div.req-col', {},
            h('div.req-name', { text: p.name }),
            h('div.req-cap', { text: `${p.job} · ★ ${dec(p.rating)} · ${p.reviews} avis` }),
            h('div.req-cap', { text: `${p.offer} · ${p.avail}` }))),
          h('div.req-foot', {}, h('span.acts', {}, see), h('span.req-amount', { text: `${p.price} €` }))));
      }
      const solo = h('button.btn.small', { text: 'Je m’organise seul·e', 'data-hire': 'solo' });
      tap(solo, () => {
        this.close();
        pick.onSolo();
      });
      body.appendChild(h('div.st-card', {}, h('div.st-body.b', { text: 'Solution autonome' }), h('div.req-cap.mt4', { text: 'Préparation rapide, reconnaissance partielle du parcours, accueil du cheval : aucun débit.' }), h('div.mt8', {}, solo)));
      body.appendChild(h('div.req-cap.mt8', { text: `Solde : ${formatMoney(d.money)} · profils et sommes fictifs, aucun paiement réel.` }));
    } else {
      body.appendChild(h('div.st-card.empty-st', {}, h('div.st-body', { text: 'Aucun besoin en cours.' }), h('div.req-cap', { text: 'Quand l’écurie manque de bras, c’est ici que tu recrutes un groom ou un chauffeur.' })));
    }
    // Équipe déjà recrutée (prestations fictives réalisées).
    const team = Object.entries(d.hired || {}).filter(([, v]) => v && v !== 'solo');
    if (team.length) {
      body.appendChild(h('div.st-eyebrow.sec', { text: 'Prestations réalisées' }));
      for (const [k, v] of team) body.appendChild(h('div.kv', {}, h('span', { text: v === 'lea' ? 'Léa Morel · groom' : 'Inès Ferrand · groom' }), h('b', { text: k === 'm2' ? 'Renfort avant le concours' : k })));
    }
    // Chauffeur : trajet immédiat avec ton cheval (voyage rapide du jeu).
    body.appendChild(h('div.st-eyebrow.sec', { text: 'Chauffeur · trajet avec ton cheval' }));
    const dests = STABLES.map((s) => s).concat([{ id: 'town', name: 'Deauvelle — centre', place: { x: 20, z: -240 } }, { id: 'beach', name: 'Plage de Deauvelle', place: { x: 60, z: -385 } }]);
    for (const s of dests) {
      const dist = g.distanceTo(s.place);
      const price = Math.round(15 + dist / 25);
      const btn = h('button.btn.small.primary', { text: `Réserver · ${price} €` });
      tap(btn, () => {
        if (g.missions.active) return g.hud.toast('Termine ta mission en cours d’abord.');
        if (g.player.mode === 'drive') return g.hud.toast(g.player.inTruck ? 'Sors du camion d’abord.' : 'Sors du véhicule d’abord.');
        if (d.money < price) return g.hud.toast('Solde insuffisant.');
        this.close();
        g.fastTravel(s.place, price, s.name);
      });
      body.appendChild(h('div.st-card', {}, h('div.req-row', {}, h('div.req-col', {}, h('div.req-name', { text: s.name }), h('div.req-cap', { text: `${dec(dist / 1000)} km · toi + ton cheval` }))), h('div.req-foot', {}, h('span.acts', {}, btn))));
    }
    body.appendChild(this.promo('recruter', 'pro'));
    return [this._head('Recruter', 'Comparer des profils vérifiés, confirmer'), body];
  }

  // Fiche d'un profil : la confirmation (deux touchers) débite une seule fois ; quitter avant ne débite rien.
  _hireSheet(p) {
    const g = this.game;
    const pick = g.missions.hirePicker;
    if (!pick) return;
    const afford = g.save.data.money >= p.price;
    const cancel = h('button.btn', { text: 'Retour' });
    const ok = h(`button.btn${afford ? '.primary' : ''}`, { text: afford ? `Confirmer · ${p.price} €` : 'Solde insuffisant', 'data-id': 'confirm-hire' });
    const layer = h('div.sheet-layer', {}, h('div.sheet', {}, h('div.handle'),
      h('div.sheet-body.scrollable', {},
        h('div.st-h2', { text: p.name }),
        h('div.req-cap.mt4', { text: `${p.job} · ★ ${dec(p.rating)} · ${p.reviews} avis · ${p.avail}` }),
        h('div.st-body.mt8', { text: p.bio }),
        h('div.kv-st.mt8', {}, h('span.req-cap', { text: 'Prestation' }), h('span.st-body', { text: p.offer })),
        h('div.kv-st', {}, h('span.req-cap', { text: 'Montant' }), h('span.st-body', { text: `${p.price} € (débité à la confirmation)` })),
        h('div.req-cap.mt8', { text: afford ? 'Profil et somme fictifs : aucun paiement réel.' : 'Solde insuffisant : tu peux revenir en arrière et t’organiser seul·e.' })),
      h('div.sheet-foot', {}, h('div.sheet-actions', {}, cancel, ok))));
    const close = () => {
      this._reqBusy = false;
      layer.remove();
    };
    let armed = 0;
    tap(cancel, close);
    tap(ok, () => {
      if (!afford) return appToast(this, 'Solde insuffisant', 'Choisis « Je m’organise seul·e » ou un autre profil.', 'error');
      if (!armed) {
        armed = performance.now();
        ok.textContent = `Confirmer le débit de ${p.price} € ?`;
        return;
      }
      if (performance.now() - armed < 350) return;
      const res = g.hire(`hire:${pick.mission}`, p.price);
      if (res === 'error') {
        close();
        return appToast(this, 'Échec technique', 'Rien n’a été débité. Réessaie.', 'error');
      }
      if (res === 'funds') {
        close();
        return appToast(this, 'Solde insuffisant', 'Rien n’a été débité.', 'error');
      }
      close();
      appToast(this, 'Prestation confirmée', `${p.name} · ${p.price} € débités une seule fois.`);
      setTimeout(() => {
        this.close();
        pick.onConfirm(p);
      }, 900);
    });
    this._reqBusy = true;
    this.screen.appendChild(layer);
  }

  _tabProfile() {
    const g = this.game;
    const d = g.save.data;
    const lv = levelFor(d.reputation);
    const rating = g.rating();
    const body = h('div.app-body.scrollable');
    const initials = d.playerName.slice(0, 2).toUpperCase();
    body.append(
      h('div.profile-head', {}, h('div.av', { text: initials }), h('div', {}, h('div.n', { text: d.playerName }), h('div.l', { text: `${lv.title} · ${rating ? `★ ${dec(rating)} · ${d.ratings.length} avis` : 'Pas encore d’avis'}` }))),
      h('div', { style: { marginTop: '14px' } },
        h('div.kv', {}, h('span', { text: 'Missions réalisées' }), h('b', { text: String(d.stats.jobs) })),
        h('div.kv', {}, h('span', { text: 'Revenus (fictifs)' }), h('b', { text: formatMoney(d.stats.earned) })),
        h('div.kv', {}, h('span', { text: 'Réputation' }), h('b', { text: `${d.reputation} pts${lv.next ? ` / ${lv.next.xp}` : ''}` })),
        h('div.kv', {}, h('span', { text: 'Palier suivant' }), h('b', { text: lv.next ? lv.next.title : 'Palier maximum' }))
      ),
      h('div.section-t', { text: 'Compétences', style: { marginTop: '14px' } }),
      this._skillBars()
    );
    body.appendChild(this.promo());
    return [this._head('Profil', 'Ton profil professionnel (jeu)'), body];
  }

  _skillBars() {
    const sk = this.game.save.data.skills;
    return h('div.bars', {}, ...Object.entries(SKILL_LABEL).map(([k, label]) => h('div.bar-row', {}, h('span', { text: label }), h('div.bar', {}, h('i', { style: { width: `${Math.max(3, sk[k] || 0)}%` } })), h('span', { text: String(Math.floor(sk[k] || 0)) }))));
  }

  // Accès permanent et discret à la vraie application (libellé du dossier ; même page officielle).
  promo(placement = 'phone', intent = 'discover') {
    const btn = h('button.btn', { text: 'Découvrir la vraie application Strides', 'data-cta': 'download' });
    tap(btn, () => this.game.openStrides(placement, intent));
    return h('div.promo', {}, h('div', { style: { flex: 1 } }, h('div.t', { text: 'Cette app existe pour de vrai.' }), h('div.s', { text: 'Grooms, palefreniers, cavaliers, chauffeurs, enseignants : STRIDES met en relation les écuries et les pros du cheval.' })), btn);
  }

  // ---------- Mon écurie ----------
  renderEcurie() {
    const g = this.game;
    const d = g.save.data;
    const main = h('div.app-main');
    main.appendChild(this._head('Mon écurie', `Écurie du Val · solde ${formatMoney(d.money)}`));
    const body = h('div.app-body.scrollable');
    body.appendChild(h('div.section-t', { text: 'Aménagements' }));
    for (const u of STABLE_UPGRADES) {
      const owned = d.upgrades.includes(u.id);
      const locked = u.requires && !d.flags[u.requires];
      const btn = h(`button.btn.small${owned || locked ? '' : '.primary'}`, { text: owned ? 'Installée' : locked ? 'Pas encore disponible' : `Construire · ${formatMoney(u.price)}`, 'data-upgrade': u.id });
      let armed = 0;
      if (!owned)
        tap(btn, () => {
          if (locked) return g.hud.toast(u.lockedText);
          if (d.money < u.price) return g.hud.toast('Solde insuffisant.');
          if (!armed) {
            armed = performance.now();
            btn.textContent = `Confirmer · ${formatMoney(u.price)}`;
            return;
          }
          if (performance.now() - armed < 350) return;
          if (g.buyStableUpgrade(u.id)) this.refresh();
        });
      body.appendChild(h(`div.mcard${owned ? '.active' : ''}`, {}, h('div.top', {}, h('span.chip', { text: owned ? 'Au Val' : locked ? 'Après le premier concours' : 'Disponible' }), h('span.pay', { text: formatMoney(u.price) })), h('div.title', { text: u.name }), h('div.meta', { text: locked ? u.lockedText : u.desc }), h('div.acts', {}, btn)));
    }
    body.appendChild(h('div.section-t', { text: 'Équipe', style: { marginTop: '14px' } }));
    const rel = d.relations || {};
    const member = (name, role, note) => h('div.kv', {}, h('span', { text: `${name} · ${role}` }), h('b', { text: note }));
    body.appendChild(member('Camille Martin', 'responsable du Val', 'Toujours là'));
    if (rel.lea?.met) body.appendChild(member('Léa Morel', 'groom', rel.lea.missions ? `${rel.lea.missions} prestation${rel.lea.missions > 1 ? 's' : ''}` : 'Contact'));
    if (d.hired?.m2 === 'ines') body.appendChild(member('Inès Ferrand', 'groom freelance', '1 prestation'));
    body.appendChild(h('div.section-t', { text: 'Compétences', style: { marginTop: '14px' } }));
    body.appendChild(this._skillBars());
    body.appendChild(h('div.section-t', { text: 'Matériel', style: { marginTop: '14px' } }));
    const shop = h('button.btn.small.primary', { text: 'Sellerie du Port : équipement', 'data-id': 'open-shop' });
    tap(shop, () => this.show('shop'));
    body.appendChild(shop);
    main.appendChild(body);
    return h('div.app', {}, main);
  }

  // ---------- Guide local (fonction du jeu, hors Strides) ----------
  renderGuide(opts = {}) {
    const g = this.game;
    const pick = g.missions.stablePicker;
    const main = h('div.app-main');
    main.appendChild(this._head('Guide local', 'Pensions et santé · fictif, hors Strides'));
    const body = h('div.app-body.scrollable');
    const offers = g.missions.offers.filter((o) => o.vertical === 'ANNUAIRE' || o.vertical === 'ECURIES');
    if (offers.length) body.append(h('div.section-t', { text: 'Demandes' }), h('div.req-list', {}, ...offers.map((o) => requestCard(this, o))));
    for (const o of offers) o.isNew = false;
    g.missions.updateBadge();
    body.appendChild(h('div.section-t', { text: pick ? pick.prompt : 'Pensions à proximité', 'data-sec': 'pensions' }));
    const list = h('div.cards');
    for (const s of STABLES) {
      const dist = g.distanceTo(s.place);
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
        h('div.top', {}, h('span.chip', { text: `${s.price} € / mois` }), h('span.client', {}, h('span.rating', { text: `★ ${dec(s.rating)}` }))),
        h('div.title', { text: s.name }),
        h('div.meta', { text: `${dec(dist / 1000)} km · ${s.desc}` }),
        h('div.meta', { text: s.services.join(' · ') }),
        acts));
    }
    body.appendChild(list);
    body.appendChild(h('div.section-t', { text: 'Santé et soins', style: { marginTop: '14px' }, 'data-sec': 'sante' }));
    const pros = h('div.cards');
    for (const p of PROS) {
      const dist = g.distanceTo(p.place);
      const call = h('button.btn.small.primary', { text: 'Appeler', 'data-pro': p.id });
      tap(call, () => {
        this.close();
        g.contactPro(p);
      });
      const gps = h('button.btn.small', { text: 'Itinéraire' });
      tap(gps, () => {
        g.gps.set(p.place, p.name);
        this.close();
      });
      pros.appendChild(h('div.mcard', {},
        h('div.top', {}, h('span.chip', { text: p.job })),
        h('div.client', {}, h('div.av', { text: p.initials }), h('span', { text: p.name }), h('span.rating', { text: `★ ${dec(p.rating)}` })),
        h('div.meta', { text: `${dec(dist / 1000)} km · ${p.avail}` }),
        h('div.acts', {}, gps, call)));
    }
    body.appendChild(pros);
    body.appendChild(h('div.irl', { text: 'Guide fictif du jeu : pensions, vétérinaires et maréchaux ne sont pas des services de l’application Strides.' }));
    main.appendChild(body);
    if (opts.section) requestAnimationFrame(() => body.querySelector(`[data-sec="${opts.section}"]`)?.scrollIntoView());
    return h('div.app', {}, main);
  }

  // ---------- Carte ----------
  renderMap() {
    const g = this.game;
    const wrap = h('div.map-app');
    const cv = h('canvas');
    wrap.appendChild(cv);
    const back = h('button.back.st-back.map-back', { html: ion('chevron-back'), 'aria-label': 'Retour' });
    tap(back, () => this.show('home'));
    wrap.appendChild(back);
    // Astuce affichée jusqu'au premier toucher sur la carte.
    const tip = this.mapTipSeen ? null : wrap.appendChild(h('div.map-tip', { text: 'Touchez la carte pour placer un repère GPS' }));
    // Légende : le picto réel de chaque repère.
    const key = (kind) => {
      const c = h('canvas', { width: 32, height: 32 });
      drawBlip(c.getContext('2d'), 16, 16, kind, 1.6);
      return c;
    };
    wrap.appendChild(h('div.map-legend', {}, ...[['Mission', 'mission'], ['Écurie', 'stable'], ['Boutique', 'shop'], ['Événement', 'event']].map(([l, k]) => h('span', {}, key(k), l))));
    requestAnimationFrame(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // Taille de mise en page : l'animation d'ouverture du téléphone (scale .96) ne fausse plus le canvas.
      cv.width = Math.round(cv.clientWidth * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);
      const f = g.player.focus.pos;
      const fit = Math.min(cv.width, cv.height) / WORLD.size;
      this.mapView = this.mapView || { x: f.x * 0.3, z: f.z * 0.3, scale: fit * 1.25 };
      this.mapView.dpr = dpr;
      this.mapView.labels = true;
      // Retour, astuce, légende et barre d'accueil en px du canvas : aucun libellé dessous.
      const avoid = () => {
        const c = cv.getBoundingClientRect(), k = cv.width / c.width;
        return [...wrap.querySelectorAll('.back, .map-tip, .map-legend'), this.phone.querySelector('.home-btn')].map((el) => {
          const q = el.getBoundingClientRect();
          return { x0: (q.left - c.left) * k, x1: (q.right - c.left) * k, y0: (q.top - c.top) * k, y1: (q.bottom - c.top) * k };
        });
      };
      let api;
      const redraw = () => {
        this.mapView.avoid = avoid();
        api = drawFullMap(cv, g, this.mapView);
      };
      redraw();
      this.redrawMap = redraw;
      // Glisser pour déplacer, pincer/molette pour zoomer, toucher pour un repère.
      const pts = new Map();
      let moved = 0;
      let pinch = null;
      cv.addEventListener('pointerdown', (e) => {
        cv.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        moved = 0;
        this.mapTipSeen = true;
        tip?.remove();
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
          const s0 = this.mapView.scale, r = cv.getBoundingClientRect(), k = cv.width / r.width;
          this.mapView.scale = clamp((pinch.s * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, fit * 0.9, fit * 8);
          // Zoom centré entre les deux doigts : le lieu pincé reste sous les doigts.
          const mx = ((a.x + b.x) / 2 - r.left) * k - cv.width / 2, my = ((a.y + b.y) / 2 - r.top) * k - cv.height / 2;
          this.mapView.x += mx / s0 - mx / this.mapView.scale;
          this.mapView.z += my / s0 - my / this.mapView.scale;
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
          const w = api.toWorld(((e.clientX - r2.left) * cv.width) / r2.width, ((e.clientY - r2.top) * cv.height) / r2.height);
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
      main.append(h('div.app-head', {}, back, h('div', {}, h('h3', { text: opts.conv }), h('div.sub', { text: 'Messages (fictifs)' }))));
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
    // Suivi de santé de la monture actuelle (comme un carnet de suivi d'écurie).
    const c = g.mainHorse?.cond;
    if (c) {
      body.appendChild(h('div.section-t', { text: `Santé · ${g.mainHorse.name}`, style: { marginTop: '14px' } }));
      const gauge = (k, v) => h('div.bar-row', {}, h('span', { text: k }), h('div.bar', {}, h('i', { style: { width: `${Math.max(4, v)}%` } })), h('span', { text: `${Math.round(v)} %` }));
      body.appendChild(h('div.mcard', {},
        h('div.title', { text: c.status }),
        h('div.meta', { text: `Fréquence cardiaque ${Math.round(c.hr)} bpm · Température ${dec(c.temp)} °C${c.sweat > 0.3 ? ' · en sueur' : ''}` }),
        h('div.bars', {}, gauge('Énergie', c.energy), gauge('Hydratation', c.hydration), gauge('Alimentation', c.satiety), gauge('Propreté', c.clean), gauge('Pieds', c.hooves)),
        h('div.meta', { text: 'À l’écurie : panser et curer les pieds près du cheval, abreuver à l’abreuvoir, foin à la grange.' })));
    }
    body.appendChild(h('div.section-t', { text: 'Équipement', style: { marginTop: '14px' } }));
    const owned = SHOP.filter((s) => d.upgrades.includes(s.id));
    if (!owned.length) body.appendChild(h('div.empty', { text: 'Aucun équipement. Passe à la Sellerie du Port, à Deauvelle.' }));
    for (const s of owned) body.appendChild(h('div.kv', {}, h('span', { text: s.name }), h('b', { text: s.desc })));
    // Chevaux proposés en location pour la saison par leurs propriétaires : élevage local fictif (hors Strides).
    body.appendChild(h('div.section-t', { text: 'Chevaux en location · saison de concours (fictif)', style: { marginTop: '14px' } }));
    const forSale = h('div.cards');
    for (const hd of Object.values(HORSES)) {
      if (!hd.price) continue;
      const own = d.horses.includes(hd.id);
      const buy = h(`button.btn.small${own ? '' : '.primary'}`, { text: own ? 'Loué pour la saison' : `Louer la saison · ${formatMoney(hd.price)}` });
      if (!own)
        tap(buy, () => {
          if (g.buyHorse(hd.id)) this.refresh();
        });
      forSale.appendChild(h('div.mcard', {}, h('div.top', {}, h('span.chip', { text: `${hd.breed} · ${hd.age} ans` }), h('span.pay', { text: formatMoney(hd.price) })), h('div.title', { text: hd.name }), h('div.meta', { text: `${hd.desc} Valeur estimée : ${formatMoney(hd.value)}.` }), this._horseBars(hd), h('div.acts', {}, buy)));
    }
    body.appendChild(forSale);
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
    body.appendChild(h('div.result-grid', {}, stat('Fers d’or', `${d.horseshoes.length}/${g.collectibles.total}`), stat('Missions', String(d.stats.jobs)), stat('Gains', formatMoney(d.stats.earned)), stat('Sauts', String(d.stats.jumps)), stat('Distance', `${dec(d.stats.distance / 1000)} km`), stat('Note', g.rating() ? `★ ${dec(g.rating())}` : '—')));
    body.appendChild(h('div.section-t', { text: 'Meilleurs chronos', style: { marginTop: '14px' } }));
    for (const a of g.activities.list()) body.appendChild(h('div.kv', {}, h('span', { text: a.name }), h('b', { text: d.bestTimes[a.id] ? formatTime(d.bestTimes[a.id]) : '—' })));
    body.appendChild(h('div.section-t', { text: 'Histoire', style: { marginTop: '14px' } }));
    for (const s of g.missions.storyList()) body.appendChild(h('div.kv', {}, h('span', { text: s.title }), h('b', { text: d.completed.includes(s.id) ? '✓' : '—' })));
    main.appendChild(body);
    return h('div.app', {}, main);
  }

  // ---------- Météo et marées ----------
  renderWeather() {
    const g = this.game;
    const T = g.save.data.gameTime / 3600;
    const day = Math.floor(T / 24), hr = T - day * 24;
    const main = h('div.app-main');
    const w = wind(day, hr);
    const rain = rainTarget(day, hr);
    const hum = Math.round(Math.min(98, 62 + coverAt(day, hr) * 25 + rain * 20 - Math.max(0, temperature(day, hr) - 16) * 1.2));
    main.appendChild(this._head('Météo', `Deauvelle · ${conditionText(day, hr)}`));
    const body = h('div.app-body.scrollable');
    const stat = (k, v) => h('div.stat', {}, h('div.k', { text: k }), h('div.v', { text: v }));
    body.appendChild(h('div.result-grid', {}, stat('Température', `${Math.round(temperature(day, hr))} °C`), stat('Vent', `${w.dir} ${w.kmh} km/h`), stat('Humidité', `${hum} %`)));
    const sun = sunTimes();
    body.appendChild(h('div.kv', { style: { marginTop: '10px' } }, h('span', { text: 'Soleil' }), h('b', { text: `lever ${hhmm(sun.sunrise)} · coucher ${hhmm(sun.sunset)}` })));
    body.appendChild(h('div.section-t', { text: 'Prochaines heures', style: { marginTop: '14px' } }));
    for (let k = 1; k <= 6; k++) {
      const t = T + k * 2, d2 = Math.floor(t / 24), h2 = t - d2 * 24;
      body.appendChild(h('div.kv', {}, h('span', { text: `${hhmm(Math.floor(h2))} · ${conditionText(d2, h2)}` }), h('b', { text: `${Math.round(temperature(d2, h2))} °C` })));
    }
    // Marées : état courant, prochaines pleines et basses mers, conseil pour le galop sur la plage.
    const lvl = tideLevel(T);
    const rising = tideLevel(T + 0.1) > lvl;
    const ev = tideEvents(T, 26);
    body.appendChild(h('div.section-t', { text: `Marée ${rising ? 'montante' : 'descendante'} · coefficient ${tideCoef(T)} · hauteur d’eau ${dec(realTideHeight(lvl), 1)} m`, style: { marginTop: '14px' } }));
    for (const e of ev.slice(0, 4)) {
      const dd = Math.floor(e.t / 24) - day;
      body.appendChild(h('div.kv', {}, h('span', { text: `${e.type === 'PM' ? 'Pleine mer' : 'Basse mer'}${dd > 0 ? ' (demain)' : ''}` }), h('b', { text: `${hhmm(e.t)} · ${dec(realTideHeight(e.level), 2)} m` })));
    }
    const low = ev.find((e) => e.type === 'BM');
    const high = ev.find((e) => e.type === 'PM');
    // Distance de la mer aux Planches (devant le Café, x = 40) : la plage de Deauvelle découvre plus de 150 m d'estran
    // en vives-eaux.
    const fromPlanches = (lv) => Math.round(-374 - this.game.terrain.waterlineZ(40, lv));
    const note = (text) => body.appendChild(h('p', { text, style: { margin: '10px 0 0', font: '400 12px/1.4 var(--ui)', color: 'var(--muted)' } }));
    note(`La mer est en ce moment à ${fromPlanches(lvl)} m des Planches${low && high ? ` (${fromPlanches(high.level)} m à pleine mer, ${fromPlanches(low.level)} m à basse mer)` : ''}.`);
    if (low) note(`Galop sur la plage : sable découvert et ferme autour de la basse mer, de ${hhmm(low.t - 2)} à ${hhmm(low.t + 2)}.`);
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
    // Sauvegarde : automatique sur l'appareil (toutes les 12 s et à chaque étape), copiée en ligne sur claude.ai.
    {
      const on = g.online;
      const t = (ms) => new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
      const local = g.save.data.meta?.savedAt;
      body.appendChild(h('div.section-t', { text: 'Sauvegarde automatique' }));
      body.appendChild(h('div.kv', {}, h('span', { text: 'Sur cet appareil' }), h('b', { text: local ? t(local) : '—', 'data-id': 'save-local' })));
      const cloud = on.state === 'online' ? (on.lastSync ? `à jour · ${t(on.cloudSavedAt || on.lastSync)}` : 'activée') : on.state === 'readonly' ? 'non disponible pour ce compte' : on.state === 'connecting' ? 'connexion…' : 'hors ligne (jeu publié sur claude.ai)';
      body.appendChild(h('div.kv', {}, h('span', { text: 'En ligne' }), h('b', { text: cloud, 'data-id': 'save-cloud' })));
      if (on.cloudNewer) {
        const b = h('button.btn.small', { text: `Reprendre la sauvegarde en ligne (${t(on.cloudNewer.savedAt)})`, 'data-id': 'cloud-adopt' });
        tap(b, () => {
          if (on.adoptCloudSave()) location.reload();
        });
        body.appendChild(b);
      }
      body.appendChild(h('div.section-t', { text: 'Jeu', style: { marginTop: '14px' } }));
    }
    body.appendChild(toggle('Son', 'sound', (v) => g.audio.setEnabled(v)));
    body.appendChild(toggle('Musique', 'music', (v) => g.audio.setMusic(v)));
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
    // Prototype comparatif : personnage et cheval réalistes (modèles chargés à part) ou classiques.
    body.appendChild(seg('Modèles 3D', 'characters', [['classic', 'Classiques'], ['real', 'Réalistes (prototype)']], (v) => g.realism?.set(v)));
    body.appendChild(h('div.set-credit', { text: 'Modèles réalistes : cheval « Horse » de Henry S (Sketchfab), CC BY 4.0, robe et squelette adaptés ; personnages MakeHuman, CC0.' }));
    body.appendChild(seg('Écoulement du temps', 'timeScale', [['jeu', 'Jeu · 1 jour = 20 min'], ['reel', 'Réel · 24 h']]));
    body.appendChild(seg('Sensibilité caméra', 'camSens', [[0.7, 'Douce'], [1, 'Normale'], [1.4, 'Rapide']], (v) => (g.cam.sens = v)));
    // Sauvegarde : copie à conserver soi-même (texte) et restauration depuis une copie ou une copie de secours.
    body.appendChild(h('div.section-t', { text: 'Sauvegarde', style: { marginTop: '14px' } }));
    const exp = h('button.btn.small', { text: 'Copier ma sauvegarde', 'data-id': 'save-export' });
    tap(exp, () => {
      const json = g.save.exportSave();
      const done = () => g.hud.toast('Sauvegarde copiée : collez-la dans une note pour la conserver.');
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(json).then(done, () => (area.value = json));
      else area.value = json;
    });
    const area = h('textarea.save-area', { placeholder: 'Collez ici une sauvegarde copiée…', 'aria-label': 'Sauvegarde', rows: '3' });
    const imp = h('button.btn.small', { text: 'Restaurer cette sauvegarde', 'data-id': 'save-import' });
    tap(imp, () => {
      if (!area.value.trim()) return g.hud.toast('Collez d’abord une sauvegarde.');
      if (g.save.importSave(area.value.trim())) location.reload();
      else g.hud.toast('Sauvegarde illisible : rien n’a été modifié.');
    });
    body.appendChild(h('div.set-col', {}, exp, area, imp));
    for (const b of g.save.backups()) {
      const r = h('button.btn.small.ghost', { text: `Restaurer : ${b.label}` });
      tap(r, () => (g.save.restore(b.key) ? location.reload() : g.hud.toast('Copie illisible.')));
      body.appendChild(r);
    }
    const reset = h('button.btn.small.ghost', { text: 'Recommencer la partie' });
    let armed = 0;
    tap(reset, () => {
      // Confirmation en deux temps (pas de boîte de dialogue système).
      if (Date.now() - armed < 4000) return g.resetGame();
      armed = Date.now();
      reset.textContent = 'Toucher encore pour tout effacer';
      setTimeout(() => (reset.textContent = 'Recommencer la partie'), 4000);
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
    body.appendChild(h('div.irl', { text: 'Boutique fictive du jeu : l’équipement n’est pas vendu sur Strides.' }));
    main.appendChild(body);
    return h('div.app', {}, main);
  }
}

export { esc };
