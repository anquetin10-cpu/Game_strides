// App STRIDES côté pro : accueil, demandes reçues et écran « Demande reçue », reproduits d'après l'app réelle
// (mêmes libellés, mêmes composants : Badge, Card, BottomSheet, Toast, confirmation en deux touchers).
import { h, tap } from './dom.js';
import { ion } from './ionicons.js';
import { formatMoney, dec } from '../core/math.js';

// Métiers de l'app (couleur et pictogramme Ionicons) et correspondance avec les catégories du jeu.
const JOBS = {
  groomConcours: { label: 'Groom concours', color: '#B8953A', icon: 'trophy' },
  groomMaison: { label: 'Groom maison', color: '#ACA8A0', icon: 'home' },
  palefrenier: { label: 'Palefrenier / garçon de cour', color: '#5A6E7A', icon: 'leaf' },
  cavalierMaison: { label: 'Cavalier maison', color: '#8F3A4A', icon: 'flag' },
  cavalierEntrainement: { label: 'Cavalier d’entraînement', color: '#A14A38', icon: 'flash' },
  chauffeur: { label: 'Chauffeur', color: '#5A7A8F', icon: 'car' },
};
const JOB_OF = {
  'Prise en main': 'palefrenier', Groom: 'groomMaison', Coursier: 'chauffeur', Urgence: 'groomMaison', Cavalier: 'cavalierEntrainement',
  Transport: 'chauffeur', Cross: 'cavalierMaison', Recherche: 'groomMaison', Course: 'cavalierEntrainement', CSO: 'groomConcours', 'Grand Prix': 'cavalierMaison',
};
export const jobOf = (o) => JOBS[JOB_OF[o.category]] || JOBS.groomMaison;
// Demandes qui relèvent de la vraie application (missions de professionnels du cheval). Concours (app Activités) et
// Guide local (pensions, santé) sont des fonctions du jeu, présentées hors de Strides.
export const isStridesOffer = (o) => o.vertical === 'JOBS' || o.vertical === 'TRANSPORT';
const homeOf = (o) => (isStridesOffer(o) ? ['strides', { tab: 'missions' }] : o.vertical === 'EVENEMENTS' ? ['activities', {}] : ['guide', {}]);

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const shortDate = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const longDate = (d) => `${shortDate(d)} ${d.getFullYear()}`;
const tomorrow = () => new Date(Date.now() + 86400000);
// Nombre d'avis stable pour un client donné (le jeu ne le stocke pas).
const reviewsOf = (c) => 6 + ([...(c?.name || '')].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 40);
const initialsOf = (c) => c?.initials || (c?.name || 'Client').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

// Badge (statut) : variantes new, pending, verified, inactive, top, danger.
export const badge = (text, v) => h(`span.badge-st.v-${v}`, { text });

export function stars(rating) {
  const row = h('span.st-stars');
  for (let i = 1; i <= 5; i++) row.insertAdjacentHTML('beforeend', ion(rating - i + 1 >= 0.8 ? 'star' : rating - i + 1 > 0 ? 'star-half' : 'star-outline'));
  return row;
}

function statusOf(o) {
  if (o.locked) return ['VERROUILLÉE', 'inactive'];
  if (o.resume) return ['À REPRENDRE', 'top'];
  if (o.counter) return ['EN NÉGOCIATION', 'new'];
  if (o.counterAccepted) return ['PROPOSITION ACCEPTÉE', 'verified'];
  return ['EN ATTENTE', 'pending'];
}

// Carte de demande (liste « Demandes reçues » / accueil).
export function requestCard(phone, o) {
  const c = o.client || { name: 'Client' };
  const job = jobOf(o);
  const [st, v] = !o.opened && !o.resume && !o.locked && !o.counter && !o.counterAccepted ? ['NOUVEAU', 'new'] : statusOf(o);
  const card = h('button.req-card', { 'data-offer': o.id },
    h('div.req-row', {},
      h('div.st-av', { text: initialsOf(c) }),
      h('div.req-col', {},
        badge(st, v),
        h('div.req-name', { text: c.name }),
        h('div.req-cap', { text: `${job.label} · ${o.title}` }),
        h('div.req-cap', { text: `${shortDate(new Date())} · ${o.placeName || ''}` }))),
    h('div.req-foot', {},
      h('span.req-delay', { text: o.locked || (o.story ? 'Délai de réponse · 24h restantes' : 'Délai de réponse · expire bientôt') }),
      h('span.req-amount', { text: o.pay ? `~${o.pay} €` : o.payLabel || '—' })));
  tap(card, () => phone.show('request', { id: o.id }));
  return card;
}

// Accueil pro : salutation, prochaine mission, demandes entrantes, revenus.
export function renderProHome(phone) {
  const g = phone.game;
  const d = g.save.data;
  const body = h('div.app-body.scrollable.st-home');
  const now = new Date();
  body.append(
    h('div.st-eyebrow', { text: `Bonjour, ${d.playerName}` }),
    h('div.st-h1', { text: 'Votre activité\ncette semaine.' }),
    h('div.st-small', { text: `${DAYS[now.getDay()][0].toUpperCase()}${DAYS[now.getDay()].slice(1)} ${longDate(now)} · Deauville City` })
  );
  const m = g.missions.active;
  if (m) {
    const gps = h('button.btn.small', { text: 'Itinéraire' });
    tap(gps, () => {
      g.missions.refreshWaypoint();
      phone.close();
    });
    const ab = h('button.btn.small.ghost', { text: 'Abandonner' });
    tap(ab, () => {
      g.missions.abandon();
      phone.refresh();
    });
    body.append(
      h('div.st-eyebrow.sec', { text: 'Prochaine mission' }),
      h('div.st-card.next', {},
        h('div.req-row', {}, h('div.req-col', {}, badge('EN COURS', 'top'), h('div.st-h2', { text: jobOf(m.offer).label }), h('div.req-cap', { text: m.offer.title }))),
        h('div.st-small', { text: g.missions.objectiveText() || '' }),
        h('div.req-foot', {}, h('span.acts', {}, gps, ab), h('span.req-amount', { text: m.offer.pay ? `~${m.offer.pay} €` : '—' }))));
  }
  const offers = g.missions.offers.filter(isStridesOffer);
  body.appendChild(h('div.st-eyebrow.sec', { text: `Demandes entrantes · ${offers.filter((o) => !o.locked).length}` }));
  if (offers.length) body.appendChild(h('div.req-list', {}, ...offers.map((o) => requestCard(phone, o))));
  else body.appendChild(h('div.st-card.empty-st', {}, h('div.st-body', { text: 'Aucune demande en attente.' }), h('div.req-cap', { text: 'Les demandes de vos clients arriveront ici.' })));
  body.append(
    h('div.st-eyebrow.sec', { text: 'Revenus' }),
    h('div.st-card.revenue', {}, h('div.req-row', {}, h('div.req-col', {}, h('div.st-body', { text: 'Revenus via Strides' }), h('div.req-cap', { text: `${d.stats.jobs} mission${d.stats.jobs > 1 ? 's' : ''} réalisée${d.stats.jobs > 1 ? 's' : ''} · montants fictifs` })), h('span.req-amount', { text: formatMoney(d.stats.earned) }))),
    phone.promo()
  );
  return [phone._head('Demandes reçues', 'Missions proposées par les écuries et cavaliers'), body];
}

// Toast de l'app (bas d'écran, 3,5 s) : success / error / info.
export function appToast(phone, title, sub, variant = 'success') {
  const wrap = phone.screen.parentElement.querySelector('.app-toasts') || phone.screen.parentElement.appendChild(h('div.app-toasts'));
  const icn = { success: 'checkmark', error: 'close', info: 'chatbubble-ellipses-outline' }[variant];
  const t = h(`div.app-toast.v-${variant}`, {}, h('span.ic', { html: ion(icn) }), h('div', {}, h('div.t', { text: title }), sub ? h('div.s', { text: sub }) : null));
  wrap.replaceChildren(t);
  setTimeout(() => t.remove(), 3500);
}

// Feuille du bas (BottomSheet) dans l'écran du téléphone.
function openSheet(phone, children, footer) {
  const layer = h('div.sheet-layer');
  const sheet = h('div.sheet', {}, h('div.handle'), h('div.sheet-body.scrollable', {}, ...children), footer ? h('div.sheet-foot', {}, footer) : null);
  layer.appendChild(sheet);
  tap(layer, (e) => {
    if (e.target === layer) close();
  });
  const close = () => {
    layer.classList.add('out');
    phone._reqBusy = false;
    setTimeout(() => layer.remove(), 200);
  };
  phone._reqBusy = true;
  phone.screen.appendChild(layer);
  return close;
}

// Pastilles de message (pas de clavier en jeu) + champ multiligne et compteur « n / 1000 ».
function messageField(label, placeholder, choices) {
  let value = '';
  const area = h('div.st-textarea.ph', { text: placeholder });
  const count = h('div.st-counter', { text: '0 / 1000' });
  const chips = h('div.st-tags');
  for (const c of choices) {
    const b = h('button.tag-st', {}, h('span.ck', { html: ion('checkmark') }), h('span', { text: c }));
    tap(b, () => {
      const on = !b.classList.contains('on');
      [...chips.children].forEach((x) => x.classList.remove('on'));
      b.classList.toggle('on', on);
      value = on ? c : '';
      area.textContent = value || placeholder;
      area.classList.toggle('ph', !value);
      count.textContent = `${value.length} / 1000`;
    });
    chips.appendChild(b);
  }
  return { el: h('div.st-field', {}, h('div.st-label', { text: label }), chips, area, count), value: () => value };
}

// Écran « Demande reçue » (plein écran, comme un écran poussé dans l'app).
export function renderRequest(phone, opts = {}) {
  const g = phone.game;
  const o = g.missions.offers.find((x) => x.id === opts.id);
  phone.requestId = opts.id;
  phone._reqBusy = false;
  const back = h('button.st-back', { html: ion('chevron-back'), 'aria-label': 'Retour' });
  const home = o ? homeOf(o) : ['strides', { tab: 'missions' }];
  tap(back, () => phone.show(...home));
  const top = h('div.st-topbar', {}, back, h('div.st-h2', { text: !o || isStridesOffer(o) ? 'Demande reçue' : o.vertical === 'EVENEMENTS' ? 'Engagement' : 'Demande' }), h('span.st-spacer'));
  const main = h('div.app-main.st-request');
  main.appendChild(top);
  if (!o) {
    const ret = h('button.btn.small', { text: 'Retour' });
    tap(ret, () => phone.show(...home));
    main.appendChild(h('div.app-body.scrollable', {}, h('div.st-frame', {}, h('div.st-body', { text: 'Demande introuvable.' }), h('div', { style: { marginTop: '12px' } }, ret))));
    return h('div.app.full', {}, main);
  }
  o.isNew = false;
  o.opened = true;
  g.missions.updateBadge();
  const c = o.client || { name: 'Client', rating: 0 };
  const job = jobOf(o);
  const [st, v] = statusOf(o);
  const d = g.distanceTo(o.place);
  const km = dec(d / 1000);
  const received = o.receivedClock || g.clockText();
  const frame = h('div.st-frame');
  // En-tête : client, métier, note, statut.
  frame.appendChild(h('div.st-card.req-head', {},
    h('div.req-row', {},
      h('div.req-col', {},
        badge(st, v),
        h('div.st-h2', { text: c.name }),
        h('div.req-key', { text: `${o.pay ? `~${o.pay} €` : o.payLabel || '—'} · ${km} km` }),
        h('div.req-cap', { text: `${job.label} · ${shortDate(new Date())}` }),
        h('div.st-rating', {}, c.rating ? stars(c.rating) : null, h('span', { text: c.rating ? `${dec(c.rating)} · ${reviewsOf(c)} avis` : 'Nouveau client' })),
        h('div.st-link', { text: 'Voir le profil client →' }))),
    h('div.req-cap.mt8', { text: `Reçue le ${longDate(new Date())} à ${received}.` }),
    o.locked ? null : h('div.req-cap', { text: `Expire le ${longDate(tomorrow())} à ${received}.` })));
  // Créneaux, détails, note du client.
  const hour = g.hour();
  frame.append(
    h('div.st-section', { text: 'Créneaux demandés' }),
    h('div.st-card.slots', {}, h('div.slot', {}, h('span.st-body', { text: shortDate(new Date()) }), h('span.req-cap', { text: hour < 13 ? 'Matin' : 'Après-midi' }))),
    h('div.st-section', { text: 'Détails' }),
    h('div.st-card.kvs', {},
      kv('Mission', o.title),
      kv('Lieu', o.placeName || '—'),
      o.vertical === 'TRANSPORT' ? kv('Véhicule', 'Camion · permis C') : null,
      o.vertical === 'EVENEMENTS' ? kv('Niveau', o.category) : null,
      kv('Durée estimée', o.duration || '—'))
  );
  if (o.desc) frame.append(h('div.st-section', { text: 'Note du client' }), h('div.st-card', {}, h('div.st-body', { text: o.desc })));
  if (o.counter) {
    frame.append(h('div.st-section', { text: 'Votre contre-proposition' }),
      h('div.st-card.counter', {},
        kvB('Mission', `${o.counter.amount} €`),
        h('div.kv-total', {}, h('span.st-body.b', { text: 'Total proposé' }), h('span.st-amount', { text: `${o.counter.amount} €` })),
        o.counter.note ? h('div.st-body.mt8', { text: `« ${o.counter.note} »` }) : null,
        h('div.req-cap.mt8', { text: 'En attente de la réponse du client. Vous pouvez la remplacer par une nouvelle proposition.' })));
  }
  if (o.counterAccepted) frame.appendChild(h('div.st-card.ok-card.mtS', {}, h('span.ic', { html: ion('checkmark-circle') }), h('div', {}, h('div.st-body.b', { text: 'Le client a accepté votre contre-proposition' }), h('div.req-cap', { text: `Nouveau montant : ${o.pay} €. Acceptez la mission pour réserver les créneaux.` }))));
  frame.append(
    h('div.st-section', { text: 'Montant' }),
    h('div.st-card.amount-card', {}, h('span.st-body', { text: 'Total estimé' }), h('span.st-amount', { text: o.pay ? `~${o.pay} €` : o.payLabel || '—' })));
  if (!isStridesOffer(o)) frame.appendChild(h('div.req-cap.mt8', { text: o.vertical === 'EVENEMENTS' ? 'Compétition fictive du jeu : les engagements ne passent pas par Strides.' : 'Demande fictive du jeu (Guide local), hors Strides.' }));
  else frame.append(
    h('div.st-card.conditions', {},
      h('div.st-eyebrow', { text: 'Conditions du prestataire' }),
      cond('navigate-outline', 'Distance de la mission', 'À vol d’oiseau depuis votre position', `~${km} km`),
      cond('location-outline', 'Rayon d’intervention', 'Frais de déplacement inclus', '15 km'),
      cond('checkmark-circle', 'Frais de déplacement', '', 'Inclus', 'ok'),
      cond('card-outline', 'Paiement', 'Fonds sécurisés en séquestre, versés à la fin de la mission', 'Garanti', 'ok'),
      cond('cash-outline', 'TVA', 'Art. 293 B du CGI — franchise en base', 'Non applicable'))
  );
  // Comme dans l'app : « Accepter la mission » (fixe en bas), puis contre-proposition et refus en fin de contenu.
  // Sur écran bas (zone de lecture d'une centaine de pixels), ils viennent juste après l'en-tête.
  const act = actions(phone, o);
  if (act.more) frame.insertBefore(act.more, matchMedia('(max-height: 360px)').matches ? frame.children[1] : null);
  main.appendChild(h('div.app-body.scrollable', {}, frame));
  main.appendChild(act.bar);
  return h('div.app.full', {}, main);
}

const kv = (k, val) => h('div.kv-st', {}, h('span.req-cap', { text: k }), h('span.st-body', { text: val }));
const kvB = (k, val) => h('div.kv-st', {}, h('span.st-body.b', { text: k }), h('span.st-body', { text: val }));
function cond(icn, label, hint, value, tone = '') {
  return h(`div.cond${tone ? `.${tone}` : ''}`, {}, h('span.ic', { html: ion(icn) }), h('div.cond-l', {}, h('div.st-body', { text: label }), hint ? h('div.req-cap', { text: hint }) : null), h('span.cond-v', { text: value }));
}

// Barre d'actions toujours visible : Refuser · contre-proposition · Accepter la mission (deux touchers).
function actions(phone, o) {
  const g = phone.game;
  const bar = h('div.st-actions');
  if (o.locked) {
    bar.appendChild(h('div.req-cap.center', { text: o.locked }));
    return { bar };
  }
  const hint = h('div.confirm-hint.hidden');
  const accept = h(`button.btn.large${o.counter ? '' : '.primary'}`, { text: o.counter ? `Accepter à ${o.pay} €` : 'Accepter la mission', 'data-id': 'accept-request' });
  const counter = h('button.btn.large', { text: o.counter ? 'Modifier la contre-proposition' : 'Message et contre-proposition', 'data-id': 'counter-request' });
  const refuse = h('button.btn.large', { text: 'Refuser', 'data-id': 'refuse-request' });
  // Pas de contre-proposition sur une demande sans tarif (ex. ferrure réglée au maréchal).
  const more = h('div.st-more', {}, o.pay ? counter : null, refuse);
  let confirming = false;
  let armedAt = 0;
  let timer = 0;
  const reset = () => {
    clearTimeout(timer);
    // Écran remplacé entre-temps (feuille, autre demande) : ne rien toucher.
    if (!bar.isConnected) return;
    confirming = false;
    phone._reqBusy = false;
    accept.textContent = o.counter ? `Accepter à ${o.pay} €` : 'Accepter la mission';
    hint.classList.add('hidden');
  };
  tap(accept, () => {
    if (!confirming) {
      confirming = true;
      armedAt = performance.now();
      phone._reqBusy = true;
      accept.textContent = o.counter ? `Confirmer à ${o.pay} € ?` : 'Confirmer l’acceptation ?';
      hint.textContent = o.counter ? 'Touchez à nouveau pour confirmer — vous renoncez à votre contre-proposition.' : 'Touchez à nouveau pour confirmer — le client sera informé.';
      // Sur écran bas, l'aide n'est affichée que pour l'avertissement (contre-proposition abandonnée).
      hint.classList.toggle('warn', !!o.counter);
      hint.classList.remove('hidden');
      g.audio.click();
      clearTimeout(timer);
      timer = setTimeout(reset, 5000);
      return;
    }
    // Double toucher trop rapide (< 350 ms) : ce n'est pas une confirmation volontaire.
    if (performance.now() - armedAt < 350) return;
    clearTimeout(timer);
    if (g.missions.active) {
      reset();
      return appToast(phone, 'Mission en cours', 'Terminez ou abandonnez votre mission en cours d’abord.', 'error');
    }
    // Acceptée : toast de l'app, créneaux réservés, puis on range le téléphone et la mission démarre.
    o.counter = null;
    o.pinned = true;
    more.remove();
    bar.replaceChildren(h('div.req-cap.center.done', { text: 'Demande acceptée — les créneaux sont réservés dans votre agenda.' }));
    appToast(phone, 'Demande acceptée', 'Les créneaux sont réservés dans votre agenda.');
    g.audio.success?.();
    setTimeout(() => {
      phone._reqBusy = false;
      phone.close();
      if (g.missions.offers.includes(o)) g.missions.accept(o.id);
      else g.hud.toast('Cette demande n’est plus disponible.');
    }, 1300);
  });
  // Ouvrir une feuille annule la confirmation en attente (sinon son minuteur libérerait l'écran sous la feuille).
  tap(refuse, () => {
    if (confirming) reset();
    openRefuse(phone, o);
  });
  tap(counter, () => {
    if (confirming) reset();
    openCounter(phone, o);
  });
  bar.append(hint, h('div.st-actions-row', {}, accept));
  return { bar, more };
}

function openRefuse(phone, o) {
  const g = phone.game;
  const msg = messageField('Message au client · optionnel', 'Ex. déjà réservé sur ces dates, mission trop loin…', ['Déjà réservé sur ces dates', 'Mission trop loin', 'Tarif trop bas']);
  const cancel = h('button.btn', { text: 'Annuler' });
  const ok = h('button.btn.primary', { text: 'Refuser la demande', 'data-id': 'confirm-refuse' });
  const close = openSheet(phone, [
    h('div.st-h2', { text: 'Refuser la demande' }),
    h('div.req-cap.mt4', { text: "Le client sera informé. Vous pouvez lui expliquer pourquoi — c'est facultatif." }),
    msg.el,
  ], h('div.sheet-actions', {}, cancel, ok));
  tap(cancel, close);
  tap(ok, () => {
    close();
    g.missions.refuse(o.id, { quiet: true });
    phone.show(...homeOf(o));
    appToast(phone, 'Demande refusée', 'Le client en sera informé.');
  });
}

function openCounter(phone, o) {
  const g = phone.game;
  const base = o.pay || 50;
  // Part du montant demandé : un envoi sans rien régler donne « Rien à proposer » au lieu d'une hausse invisible.
  let amount = o.counter?.amount || base;
  const val = h('span.st-amount', { text: `${amount} €` });
  const minus = h('button.btn.step', { html: ion('remove'), 'aria-label': 'Moins' });
  const plus = h('button.btn.step', { html: ion('add'), 'aria-label': 'Plus' });
  const set = (a) => {
    amount = Math.max(5, Math.min(base * 2, a));
    val.textContent = `${amount} €`;
  };
  tap(minus, () => set(amount - 5));
  tap(plus, () => set(amount + 5));
  const msg = messageField('Message au client', 'Précisions, conditions…', ['Disponible plus tôt si besoin', 'Matériel fourni', 'Tarif week-end']);
  const cancel = h('button.btn', { text: 'Annuler' });
  const send = h('button.btn.primary', { text: 'Envoyer', 'data-id': 'send-counter' });
  const close = openSheet(phone, [
    h('div.st-h2', { text: o.counter ? 'Modifier la contre-proposition' : 'Contre-proposition' }),
    h('div.req-cap.mt4', { text: o.counter ? 'Votre proposition en cours est reprise ci-dessous. La nouvelle la remplacera, et le client sera informé.' : 'Ajustez le montant, ou ajoutez simplement un message. Le client devra accepter pour que la mission soit créée.' }),
    h('div.st-field', {}, h('div.st-label', { text: 'Montant de la mission (€)' }), h('div.stepper', {}, minus, val, plus), h('div.req-cap', { text: `${base} € = le montant demandé par le client, déplacement inclus.` })),
    msg.el,
  ], h('div.sheet-actions', {}, cancel, send));
  tap(cancel, close);
  tap(send, () => {
    if (amount === base && !msg.value()) return appToast(phone, 'Rien à proposer', 'Modifiez un montant ou ajoutez un message.', 'error');
    o.counter = { amount, note: msg.value(), at: g.time };
    o.counterAccepted = false;
    // Demande en négociation : elle ne doit pas expirer pendant que le client répond.
    o.pinned = true;
    close();
    phone.show('request', { id: o.id });
    appToast(phone, 'Contre-proposition envoyée', 'Le client doit maintenant l’accepter.');
  });
}
