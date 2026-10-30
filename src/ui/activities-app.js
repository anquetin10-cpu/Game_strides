// Application « Activités » du téléphone : défis à conditions fixes (record, dernier résultat, carte de résultat),
// concours et courses (offres d'événements du jeu), entraînements libres chronométrés. Contenu propre au jeu :
// la vraie application Strides ne gère ni concours ni engagements.
import { h, tap } from './dom.js';
import { icon } from './icons.js';
import { formatMoney, formatTime } from '../core/math.js';
import { requestCard } from './requests.js';
import { bestOf, challengeStore, resultLine, fmtHeight, fmtHour } from '../gameplay/challenge.js';
import { t, T } from '../core/i18n.js';

function head(phone, title, sub) {
  const back = h('button.back', { html: icon('back'), 'aria-label': t('Retour') });
  tap(back, () => phone.show('home'));
  return h('div.app-head', {}, back, h('div', {}, h('h3', { text: title }), sub ? h('div.sub', { text: sub }) : null));
}

// Mission d'événement en cours (concours, course, défi) : itinéraire et abandon.
function activeCard(phone) {
  const g = phone.game;
  const m = g.missions.active;
  if (!m || m.offer.vertical !== 'EVENEMENTS') return null;
  const ab = h('button.btn.small.ghost', { text: t('Abandonner'), 'data-id': 'activity-abandon' });
  tap(ab, () => {
    g.missions.abandon();
    phone.refresh();
  });
  const gps = h('button.btn.small', { text: 'GPS' });
  tap(gps, () => {
    g.missions.refreshWaypoint();
    phone.close();
  });
  return h('div.mcard.active', {},
    h('div.top', {}, h('span.chip.ok', { text: t('EN COURS') }), h('span.pay', { text: m.offer.pay ? formatMoney(m.offer.pay) : m.def.challenge ? t('Défi') : '' })),
    h('div.title', { text: m.offer.title }),
    h('div.meta', { text: g.missions.objectiveText() || '' }),
    h('div.acts', {}, gps, ab));
}

function challengeCard(phone, cfg) {
  const g = phone.game;
  const d = g.save.data;
  const store = challengeStore(d);
  const rec = store.records[cfg.id];
  const best = bestOf(d, cfg.id);
  const last = rec?.last || null;
  const running = g.missions.active?.def.challenge === cfg.id;
  const acts = h('div.acts.ch-acts');
  if (last && !running) {
    const card = h('button.btn.small', { text: t('Carte de résultat'), 'data-id': 'challenge-last-card' });
    tap(card, () => {
      phone.close();
      g.challenge.ui.share(cfg, last);
    });
    acts.appendChild(card);
  }
  if (!running) {
    const go = h('button.btn.small.primary', { text: t('Règles et départ'), 'data-id': 'challenge-open' });
    tap(go, () => {
      phone.close();
      g.challenge.ui.intro(cfg, 'phone');
    });
    acts.appendChild(go);
  }
  return h(`div.mcard${running ? '.active' : ''}`, { 'data-challenge': cfg.id },
    h('div.top', {}, h('span.chip.story', { text: T`Défi · v${cfg.version}` }), h('span.ch-best', { text: best ? T`Record : ${resultLine(best)}` : t('Pas encore de record') })),
    h('div.title', { text: cfg.name }),
    h('div.meta', { text: T`${cfg.place} · ${cfg.obstacles.length} obstacles · ${fmtHeight(cfg.height)} · ${cfg.horse.name} fourni · ${cfg.weather.label.toLowerCase()}, ${fmtHour(cfg.weather.hour)} · ${cfg.timeAllowed} s accordées` }),
    h('div.meta', { text: last ? (rec.attempts > 1 ? T`Dernier résultat : ${resultLine(last)} · ${rec.attempts} tentatives` : T`Dernier résultat : ${resultLine(last)} · ${rec.attempts} tentative`) : T`Aucune tentative pour l’instant. ${cfg.where || t('Aussi accessible au panneau d’entrée du Pôle.')}` }),
    acts.childNodes.length ? acts : null);
}

export function renderActivities(phone) {
  const g = phone.game;
  const d = g.save.data;
  const main = h('div.app-main');
  main.appendChild(head(phone, t('Activités'), t('Défis · concours · chronos')));
  const body = h('div.app-body.scrollable');
  const active = activeCard(phone);
  if (active) body.append(h('div.section-t', { text: t('En cours') }), h('div.cards', {}, active));
  // Défis à conditions fixes.
  body.appendChild(h('div.section-t', { text: t('Défis à conditions fixes') }));
  body.appendChild(h('div.cards', {}, ...g.challenge.list().map((cfg) => challengeCard(phone, cfg))));
  // Concours et courses (offres d'événements du jeu).
  const offers = g.missions.offers.filter((o) => o.vertical === 'EVENEMENTS');
  body.appendChild(h('div.section-t', { text: t('Concours et courses'), style: { marginTop: '14px' } }));
  if (offers.length) body.appendChild(h('div.req-list', {}, ...offers.map((o) => requestCard(phone, o))));
  else body.appendChild(h('div.empty', { text: t('Les engagements s’ouvrent avec ta réputation. Continue tes missions !') }));
  // Entraînements libres.
  body.appendChild(h('div.section-t', { text: t('Entraînements libres (chrono)'), style: { marginTop: '14px' } }));
  const tr = h('div.cards');
  for (const a of g.activities.list()) {
    const best = d.bestTimes[a.id];
    const btn = h('button.btn.small.primary', { text: t('Itinéraire'), 'data-activity': a.id });
    tap(btn, () => {
      g.gps.set(a.start, a.name);
      phone.close();
    });
    tr.appendChild(h('div.mcard', {}, h('div.top', {}, h('span.chip', { text: t(a.kind) }), h('span.pay', { text: best ? formatTime(best) : '—' })), h('div.title', { text: a.name }), h('div.meta', { text: a.desc }), h('div.acts', {}, btn)));
  }
  body.appendChild(tr);
  main.appendChild(body);
  // Offres d'événements vues.
  for (const o of offers) o.isNew = false;
  g.missions.updateBadge();
  return h('div.app', {}, main);
}
