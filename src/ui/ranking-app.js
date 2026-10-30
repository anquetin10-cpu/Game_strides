// Application « Classements » du téléphone : meilleurs chronos et performances des joueurs, par épreuve (défi du
// Pôle, concours, entraînements chronométrés), mise à jour en direct ; mon rang ; pseudonyme. Hors ligne : records
// personnels de cet appareil et explication.
import { h, tap } from './dom.js';
import { icon } from './icons.js';
import { formatTime, dec } from '../core/math.js';
import { BOARDS, boardById } from '../core/online.js';
import { challengeStore, cleanPseudo, bestOf } from '../gameplay/challenge.js';
import { t, T } from '../core/i18n.js';

function head(phone, title, sub) {
  const back = h('button.back', { html: icon('back'), 'aria-label': t('Retour') });
  tap(back, () => phone.show('home'));
  return h('div.app-head', {}, back, h('div', {}, h('h3', { text: title }), sub ? h('div.sub', { text: sub }) : null));
}

// « 4 pts · 45,32 s » (barème A) ou « 1:12,40 » (chrono).
export function perfText(board, e) {
  if (!e) return '—';
  return board.kind === 'cso' ? (e.pen > 1 ? T`${e.pen} pts · ${dec(e.time, 2)} s` : T`${e.pen} pt · ${dec(e.time, 2)} s`) : formatTime(e.time);
}

// Meilleure performance de cet appareil (sauvegarde locale), quand on n'est pas connecté.
function localBest(g, board) {
  const d = g.save.data;
  if (board.id.startsWith('defi-')) {
    const b = bestOf(d, board.id);
    return b ? { pen: b.penalties, time: b.time } : null;
  }
  const off = g.online.myBest(board.id);
  if (off) return off;
  const t = d.bestTimes?.[board.id];
  return t ? { pen: 0, time: t } : null;
}

const STATUS = {
  online: t('En ligne · classement partagé avec les autres joueurs de cette page'),
  readonly: t('Lecture seule · tu vois le classement ; tes résultats ne peuvent pas y être inscrits depuis ce compte'),
  connecting: t('Connexion au classement…'),
  local: t('Hors ligne · records de cet appareil'),
};

export function renderRanking(phone, opts = {}) {
  const g = phone.game;
  const on = g.online;
  if (opts.board) phone.rankBoard = opts.board;
  const board = boardById(phone.rankBoard) || BOARDS[0];
  phone.rankBoard = board.id;
  const main = h('div.app-main');
  main.appendChild(head(phone, t('Classements'), STATUS[on.state] || STATUS.local));
  const body = h('div.app-body.scrollable', { 'data-id': 'ranking' });
  // Épreuves.
  const chips = h('div.rank-chips');
  for (const b of BOARDS) {
    const c = h(`button.chip-btn${b.id === board.id ? '.on' : ''}`, { text: b.title, 'data-board': b.id });
    tap(c, () => phone.show('ranking', { board: b.id }));
    chips.appendChild(c);
  }
  body.appendChild(chips);
  // Épreuve choisie visible dans la bande défilante.
  requestAnimationFrame(() => chips.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  body.appendChild(h('div.rank-sub', { text: board.sub }));
  if (on.online) {
    const list = on.board(board.id);
    const meIdx = list.findIndex((e) => e.id === on.uid);
    if (!list.length) body.appendChild(h('p.rank-empty', { text: t('Aucun résultat pour l’instant : sois le premier à inscrire ton chrono !') }));
    const row = (e) =>
      h(`div.rank-row${e.id === on.uid ? '.me' : ''}`, { 'data-rank': String(e.rank) },
        h('span.rk', { text: e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : String(e.rank) }),
        h('span.who', {}, h('b', { text: e.id === on.uid ? T`${e.pseudo} (toi)` : e.pseudo }), e.horse ? h('small', { text: e.horse }) : null),
        h('span.perf', { text: perfText(board, e) }));
    for (const e of list.slice(0, 20)) body.appendChild(row(e));
    if (meIdx >= 20) {
      body.appendChild(h('div.rank-gap', { text: '…' }));
      body.appendChild(row(list[meIdx]));
    }
    if (meIdx < 0) {
      const mine = localBest(g, board);
      body.appendChild(h('p.rank-note', { text: mine ? T`Ton meilleur résultat sur cet appareil : ${perfText(board, mine)}. Refais l’épreuve pour l’inscrire au classement.` : t('Tu n’as pas encore de résultat sur cette épreuve.') }));
    }
  } else {
    const mine = localBest(g, board);
    body.appendChild(h('div.rank-row.me', {}, h('span.rk', { text: '—' }), h('span.who', {}, h('b', { text: t('Ton record') })), h('span.perf', { text: perfText(board, mine) })));
    body.appendChild(h('p.rank-note', { text: on.state === 'connecting' ? t('Connexion en cours…') : t('Le classement en ligne fonctionne dans le jeu publié sur claude.ai, connecté à ton compte : tes chronos y sont comparés à ceux des autres joueurs.') }));
  }
  // Pseudonyme affiché dans le classement.
  if (on.state === 'online') {
    const store = challengeStore(g.save.data);
    const input = h('input.rc-input', { value: store.pseudo || '', maxlength: '20', autocomplete: 'off', placeholder: g.save.data.playerName || t('Pseudonyme'), 'aria-label': t('Pseudonyme du classement'), 'data-id': 'rank-pseudo' });
    const save = h('button.btn.small', { text: t('Valider'), 'data-id': 'rank-pseudo-save' });
    tap(save, () => {
      const p = cleanPseudo(input.value);
      if (p === store.pseudo) return;
      store.pseudo = p;
      g.saveSoon();
      on.renamed();
      g.hud.toast(p ? T`Pseudonyme : ${p}` : t('Pseudonyme retiré'), 'money');
    });
    body.appendChild(h('div.section-t', { text: t('Ton pseudonyme'), style: { marginTop: '14px' } }));
    body.appendChild(h('div.rank-pseudo', {}, input, save));
  }
  body.appendChild(h('p.rank-note', { text: t('Seuls ton pseudonyme, ton cheval et tes meilleurs résultats sont visibles des autres joueurs. Chaque épreuve garde ton meilleur résultat.') }));
  main.appendChild(body);
  return h('div.app', {}, main);
}
