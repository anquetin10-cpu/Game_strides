// Transition du sommeil nocturne avec ses emplacements publicitaires (voir src/partners/campaigns.js) :
//   tombée de la nuit sur le personnage couché → publicité 1 → publicité 2 → lever du jour.
// - L'écran est une « .overlay » : la simulation est suspendue (heure, besoins du cheval, missions), les commandes
//   du personnage aussi ; la nuit elle-même (heure, énergie, sauvegarde) est appliquée par le système de repos.
// - Chaque publicité porte une mention « Publicité » (ou « Partenaire » pour l'habillage neutre) et un bouton
//   « Passer » (après NIGHT_SLOT.skipAfter s) ; la destination externe ne s'ouvre que si le joueur la touche.
// - Un média qui manque ou échoue : la publicité est remplacée par l'habillage neutre (ou sautée), jamais d'écran noir
//   prolongé ; le sommeil continue normalement dans tous les cas.
// - Temps : horloge réelle (images de l'écran), bornée à 0,5 s par image ; onglet en arrière-plan : la séquence
//   s'arrête et reprend, sans rattrapage (un appareil lent ne la ralentit pas pour autant).
import { h, tap } from './dom.js';
import { t, T } from '../core/i18n.js';
import { BRANDS, brandName } from '../partners/partners.js';
import { NIGHT_SLOT, slotProgram } from '../partners/campaigns.js';

// ---------- Préchargement des médias ----------
const cache = new Map();
export function preloadImage(src) {
  if (!src) return Promise.resolve(null);
  if (cache.has(src)) return cache.get(src);
  const p = new Promise((res) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
  cache.set(src, p);
  return p;
}
// Vidéo (muette, lue en ligne) : prête quand assez de données sont chargées pour démarrer ; null en cas d'échec.
export function preloadVideo(src) {
  if (!src) return Promise.resolve(null);
  if (cache.has(src)) return cache.get(src);
  const p = new Promise((res) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.oncanplaythrough = v.onloadeddata = () => res(v);
    v.onerror = () => res(null);
    v.src = src;
    v.load?.();
  });
  cache.set(src, p);
  return p;
}
const isVideo = (c) => c?.type === 'video';
const preloadOf = (c, src) => (isVideo(c) && src === c.src ? preloadVideo(src) : preloadImage(src));

// Médias de l'emplacement de nuit (logo et capture officiels Strides, visuels des campagnes autorisées).
export function preloadNightMedia(now = Date.now()) {
  const list = [BRANDS.strides.assets.logoFull, BRANDS.strides.assets.appHome].map((s) => preloadImage(s));
  for (const e of slotProgram('night', now)) {
    const c = e.campaign?.creative;
    if (!e.neutral && c) for (const s of [c.src, c.poster, c.logo]) if (s) list.push(preloadOf(c, s));
  }
  return Promise.all(list);
}

// ---------- Créas ----------
// Habillage neutre de l'emplacement (annonceur non encore autorisé) : la boutique équestre du jeu, sans marque.
function neutralCreative(entry) {
  const name = t(brandName(entry.advertiser) || 'Sellerie & Mode Équestre');
  const sub = t(BRANDS[entry.advertiser]?.neutral?.sub || 'Tenues d’équitation · Équipement du cheval');
  return {
    label: t('Partenaire'),
    el: h('div.ad.ad-neutral', {},
      h('div.ad-n-art', {}, h('i.ad-n-line'), h('i.ad-n-line.b'), h('i.ad-n-line.c')),
      h('div.ad-n-text', {},
        h('div.ad-kicker', { text: t('Deauville City') }),
        h('div.ad-n-name', { text: name }),
        h('div.ad-n-sub', { text: sub }),
        h('div.ad-n-hint', { text: t('Boutique du jeu, en ville : essayer, acheter, s’équiper.') }))),
  };
}

// Publicité image ou vidéo (campagne autorisée) : visuel plein cadre sans déformation (cadrage réglable), logo
// autorisé, texte court validé avec la marque, destination facultative. Vidéo : muette, lue en ligne pendant la
// publicité seulement (image d'attente : poster).
function imageCreative(entry, media) {
  const c = entry.campaign.creative;
  const img = media.get(c.src);
  if (!img) return null;
  const logo = c.logo ? media.get(c.logo) : null;
  let pic, video = null;
  if (isVideo(c)) {
    video = document.createElement('video');
    video.className = 'ad-img-pic';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'auto';
    if (c.poster) video.poster = c.poster;
    video.src = c.src;
    pic = video;
  } else pic = h('img.ad-img-pic', { src: c.src, alt: '' });
  if (c.focus) pic.style.objectPosition = c.focus;
  return {
    label: t('Publicité'),
    url: entry.campaign.url,
    onShow: video ? () => video.play?.()?.catch?.(() => {}) : null,
    onHide: video ? () => video.pause?.() : null,
    el: h('div.ad.ad-image', {}, pic,
      h('div.ad-img-shade'),
      h('div.ad-img-text', {},
        logo ? h('img.ad-img-logo', { src: c.logo, alt: BRANDS[entry.advertiser]?.name || '' }) : null,
        c.headline ? h('div.ad-img-h', { text: c.headline }) : null,
        c.line ? h('div.ad-img-l', { text: c.line }) : null)),
  };
}

// Publicité Strides (créa originale) : un besoin équestre, l'application réelle, les promesses réelles du site
// officiel, le logo officiel, une invitation discrète (ouverte seulement si le joueur touche le bouton).
function stridesCreative(entry, media) {
  const S = BRANDS.strides.assets;
  if (!media.get(S.logoFull) || !media.get(S.appHome)) return null;
  const c = entry.campaign.creative;
  return {
    label: t('Publicité'),
    url: entry.campaign.url,
    cta: t('Découvrir Strides'),
    el: h('div.ad.ad-strides', {},
      h('div.as-need', {},
        h('div.as-q', { text: t('Votre groom annule à la dernière minute ?') }),
        h('div.as-q.b', { text: t('Besoin d’un chauffeur pour partir en concours ?') })),
      h('div.as-phone', {}, h('div.as-notch'), h('div.as-screen', {}, h('img', { src: S.appHome, alt: t('Application Strides : accueil') }))),
      h('div.as-main', {},
        h('div.as-h', { text: t(c.headline) }),
        h('div.as-steps', {},
          h('span', { text: t('Profils vérifiés') }), h('span', { text: t('Paiement sécurisé') }), h('span', { text: t('Sans abonnement') })),
        h('div.as-brand', {}, h('img.as-logo', { src: S.logoFull, alt: 'STRIDES' }), h('span.as-url', { text: 'strides-app.com' }))),
      h('div.as-fine', { text: t('Publicité pour la plateforme réelle Strides. Dans Equestrian Tour, missions, profils et paiements sont fictifs.') })),
  };
}

function creativeFor(entry, media) {
  if (!entry.neutral && entry.campaign) {
    const type = entry.campaign.creative?.type;
    const c = type === 'strides-story' ? stridesCreative(entry, media) : type === 'image' || type === 'video' ? imageCreative(entry, media) : null;
    if (c) return { ...c, id: entry.campaign.id, advertiser: entry.advertiser, duration: Number(entry.campaign.duration) > 0 ? Number(entry.campaign.duration) : 4.5, neutral: false };
  }
  // Annonceur non autorisé, ou média indisponible : habillage neutre (seulement si un annonceur est prévu).
  if (!entry.advertiser || entry.advertiser === 'strides') return null;
  return { ...neutralCreative(entry), id: `${entry.campaign?.id || 'neutre'}:neutre`, advertiser: entry.advertiser, duration: Number(entry.campaign?.duration) > 0 ? Number(entry.campaign.duration) : 4.5, neutral: true };
}

// Médias d'un programme : chacun attendu au plus `ms` (un média lent ou en échec ne retire que sa propre publicité).
async function resolveMedia(program, ms) {
  const jobs = [BRANDS.strides.assets.logoFull, BRANDS.strides.assets.appHome].map((s) => [s, () => preloadImage(s)]);
  for (const e of program) {
    const c = e.campaign?.creative;
    if (!e.neutral && c) for (const s of [c.src, c.poster, c.logo]) if (s) jobs.push([s, () => preloadOf(c, s)]);
  }
  const timeout = () => new Promise((r) => setTimeout(() => r(null), ms));
  const got = await Promise.all(jobs.map(async ([s, load]) => [s, await Promise.race([load(), timeout()])]));
  return new Map(got.filter(([, m]) => m));
}

// Programme de la nuit sans affichage (chemin instantané des tests : mêmes campagnes, médias supposés présents).
export function nightProgramIds(now = Date.now()) {
  const assumed = new Map([[BRANDS.strides.assets.logoFull, true], [BRANDS.strides.assets.appHome, true]]);
  for (const e of slotProgram('night', now)) if (!e.neutral) for (const k of [e.campaign?.creative?.src, e.campaign?.creative?.logo]) if (k) assumed.set(k, true);
  return slotProgram('night', now).map((e) => creativeFor(e, assumed)).filter(Boolean).map((c) => ({ id: c.id, advertiser: c.advertiser, neutral: c.neutral, seconds: 0, skipped: true }));
}

// Écran du téléphone tenu en portrait (le jeu est suspendu et l'écran « Tourne ton téléphone » s'affiche).
const portrait = () => typeof matchMedia === 'function' && matchMedia('(orientation: portrait) and (pointer: coarse)').matches;

// ---------- Séquence ----------
// playNight(game, { ads, onDusk, onDawn }) → Promise<{ shown: [{ id, advertiser, neutral, seconds, skipped }] }>
// ads=false : simple nuit sans publicité. onDusk() : appelé quand l'écran est noir (appliquer la nuit).
// onDawn() : appelé au début du lever du jour.
export async function playNight(game, { ads = true, onDusk, onDawn, now = Date.now() } = {}) {
  const shown = [];
  const S = NIGHT_SLOT;
  // L'écran de nuit est posé tout de suite (simulation suspendue dès la première image), avant l'attente des médias.
  const sky = h('div.night-sky', {}, h('i.moon'), ...Array.from({ length: 14 }, (_, i) => h('i.star', { style: { left: `${(i * 37) % 100}%`, top: `${(i * 23) % 60}%`, animationDelay: `${(i % 5) * 0.3}s` } })));
  const stage = h('div.night-stage');
  const tagEl = h('div.ad-tag');
  const countEl = h('div.ad-count');
  const bar = h('i');
  const skip = h('button.ad-skip', { 'data-id': 'ad-skip', text: t('Passer') });
  const cta = h('button.ad-cta', { 'data-id': 'ad-cta' });
  // Cadre de la publicité : la créa, la mention et le compteur en haut, la progression en bas ; dessous, « Passer » à
  // droite (place réservée, même invisible) et l'éventuelle destination à gauche (jamais sous le doigt de « Passer »).
  const chrome = h('div.ad-frame.hidden', {}, stage, h('div.ad-top', {}, tagEl, countEl), h('div.ad-progress', {}, bar), h('div.ad-actions', {}, cta, skip));
  const ov = h('div.overlay.night-seq', { 'data-phase': 'dusk' }, sky, chrome);
  document.body.appendChild(ov);
  game.input?.releaseAll?.();
  try {
    // Médias : déjà préchargés en général (entrée dans la maison) ; chacun attendu au plus 1,2 s ici.
    const program = ads ? slotProgram('night', now) : [];
    const media = ads ? await resolveMedia(program, 1200) : new Map();
    const list = program.map((e) => creativeFor(e, media)).filter(Boolean);

    let cur = null, curAt = 0, skipNow = false, last = performance.now();
    tap(skip, () => {
      if (!skip.classList.contains('invisible')) skipNow = true;
    });
    tap(cta, () => {
      // Destination externe : seulement sur demande du joueur (et pas dans la première demi-seconde de la publicité),
      // dans un nouvel onglet ; la séquence continue.
      if (cur?.url && performance.now() - curAt > 600) try { window.open(cur.url, '_blank', 'noopener'); } catch {}
    });
    // Attente pilotée par les images de l'écran (bornée), interruptible par « Passer ». Onglet caché ou téléphone en
    // portrait : la séquence s'arrête et reprend ensuite, sans rattrapage.
    const run = (secs, onTick) => new Promise((res) => {
      let acc = 0;
      const step = () => {
        const tNow = performance.now();
        const dt = document.hidden || portrait() ? 0 : Math.min(0.5, (tNow - last) / 1000);
        last = tNow;
        acc += dt;
        onTick?.(acc);
        if (acc >= secs || (cur && skipNow)) return res(acc);
        requestAnimationFrame(step);
      };
      last = performance.now();
      requestAnimationFrame(step);
    });

    // 1. Tombée de la nuit sur le personnage couché.
    await run(S.dusk * 0.5);
    ov.dataset.phase = 'night';
    await run(S.dusk * 0.5);
    try {
      onDusk?.();
    } catch (e) {
      console.warn('[nuit] application de la nuit', e);
    }
    // Écran entièrement couvert : la scène 3D n'est plus dessinée (batterie), jusqu'au lever du jour.
    game.renderHold = true;
    // 2. Publicités.
    for (let i = 0; i < list.length; i++) {
      cur = list[i];
      curAt = performance.now();
      skipNow = false;
      stage.replaceChildren(cur.el);
      cur.onShow?.();
      tagEl.textContent = cur.label;
      countEl.textContent = list.length > 1 ? `${i + 1}/${list.length}` : '';
      cta.textContent = cur.cta || t('En savoir plus');
      cta.classList.toggle('hidden', !cur.url);
      skip.classList.add('invisible');
      chrome.classList.remove('hidden');
      ov.dataset.phase = `ad-${i + 1}`;
      ov.dataset.ad = cur.id;
      bar.style.width = '0%';
      const secs = await run(cur.duration, (acc) => {
        bar.style.width = `${Math.min(100, (acc / cur.duration) * 100)}%`;
        if (acc >= S.skipAfter) skip.classList.remove('invisible');
      });
      cur.onHide?.();
      // « Passée » : seulement si « Passer » l'a vraiment écourtée.
      shown.push({ id: cur.id, advertiser: cur.advertiser, neutral: cur.neutral, seconds: +secs.toFixed(2), skipped: skipNow && secs < cur.duration });
    }
    cur = null;
    chrome.classList.add('hidden');
    stage.replaceChildren();
    // 3. Lever du jour.
    game.renderHold = false;
    try {
      onDawn?.();
    } catch (e) {
      console.warn('[nuit] lever du jour', e);
    }
    ov.dataset.phase = 'dawn';
    await run(S.dawn * 0.6);
    ov.dataset.phase = 'day';
    await run(S.dawn * 0.4);
  } finally {
    game.renderHold = false;
    ov.remove();
  }
  return { shown };
}
