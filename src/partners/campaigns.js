// Campagnes publicitaires d'Equestrian Tour (configurables sans toucher au moteur du jeu).
//
// Chaque campagne définit : identifiant, annonceur (marque de partners.js), emplacement (slot) et ordre d'affichage,
// créa (image ou vidéo, logo autorisé, message), durée, destination externe facultative (ouverte uniquement à la
// demande du joueur), dates de début et de fin, statut d'autorisation, limitation de fréquence.
//
// Emplacement « night » : la transition du sommeil nocturne (« Dormir jusqu'au matin » au lit de la maison), au plus
// une séquence par nuit de jeu. Deux places : 1 (Kingsland), 2 (Strides). Une campagne non autorisée, expirée ou dont
// le média manque laisse place à l'habillage neutre de l'emplacement (ou est sautée), et le sommeil continue
// normalement : la récupération et la progression ne dépendent jamais d'une publicité.
import { BRANDS } from './partners.js';

// Réglages de l'emplacement de nuit (durées en secondes, ajustables pour les tests d'expérience).
export const NIGHT_SLOT = {
  enabled: true,
  // Pose sur le lit et tombée de la nuit avant la première publicité.
  dusk: 1.6,
  // Lever du jour après la dernière publicité.
  dawn: 1.8,
  // « Passer » apparaît après ce délai (0 : tout de suite) ; il passe à la suivante (dernière : au matin).
  skipAfter: 1.0,
  // Une séquence par nuit de jeu au plus (voir save.data.ads.lastNight).
  perNight: 1,
  // Nombre de places.
  places: 2,
};

export const CAMPAIGNS = [
  {
    id: 'kingsland-aw26-nuit',
    advertiser: 'kingsland',
    slot: 'night',
    order: 1,
    duration: 4.5,
    start: '2026-09-01',
    end: '2027-03-31',
    // Autorisation de la campagne (en plus de celle de la marque) : visuels de la collection automne-hiver 2026.
    status: 'pending',
    creative: {
      // 'image' (photographie) ou 'video' (film muet, lu en ligne ; poster : image d'attente).
      type: 'image',
      // Photographie (ou film) de campagne officielle (format paysage, sans déformation des produits) : à fournir.
      src: null,
      logo: null,
      // Texte court (lisible sur iPhone), validé avec la marque : pas de promotion ni de partenariat inventés.
      headline: null,
      line: null,
    },
    url: null,
    frequency: { perNight: 1 },
    references: BRANDS.kingsland.references,
  },
  {
    id: 'strides-nuit-v1',
    advertiser: 'strides',
    slot: 'night',
    order: 2,
    duration: 4.5,
    start: '2026-11-01',
    end: null,
    status: 'authorized',
    creative: {
      // Créa originale animée (voir src/ui/nightAds.js) : besoin équestre → application réelle → promesses réelles du
      // site officiel → logo officiel → invitation discrète. Textes repris de get.strides-app.com (21 octobre 2026).
      type: 'strides-story',
      // Accroche : formulée par le porteur du projet dans sa demande (2 novembre 2026).
      headline: 'Ton prochain job dans le monde du cheval commence ici.',
      // Provenance des autres textes (copie de get.strides-app.com du 21 octobre 2026, citée mot pour mot) :
      //   - « Votre groom annule à la dernière minute ? », « Besoin d'un chauffeur pour partir en concours ? »
      //     (section « Le bon réflexe — La solution aux urgences du quotidien ») ;
      //   - « Profils vérifiés · Paiement sécurisé · Sans abonnement » (bandeau sous le titre principal).
      // Visuels : logo officiel et capture authentique de l'application (BRANDS.strides.assets).
      copySource: 'https://get.strides-app.com/ (21 octobre 2026)',
    },
    url: 'https://strides-app.com/',
    frequency: { perNight: 1 },
  },
];

const day = (s) => (s ? Date.parse(`${s}T00:00:00Z`) : null);

// Une campagne peut-elle être diffusée (statuts de la campagne et de la marque, dates, média présent) ?
export function campaignLive(c, now = Date.now()) {
  if (!c || c.status !== 'authorized' || BRANDS[c.advertiser]?.status !== 'authorized') return false;
  const a = day(c.start), b = day(c.end);
  if (a !== null && now < a) return false;
  if (b !== null && now > b + 86400000) return false;
  if ((c.creative?.type === 'image' || c.creative?.type === 'video') && !c.creative.src) return false;
  return true;
}

// Programme d'un emplacement : une entrée par place (1, 2…), la campagne diffusable ou l'habillage neutre.
// { place, campaign, neutral: bool, advertiser }
export function slotProgram(slot = 'night', now = Date.now(), places = NIGHT_SLOT.places) {
  const out = [];
  for (let place = 1; place <= places; place++) {
    const cands = CAMPAIGNS.filter((c) => c.slot === slot && c.order === place);
    const live = cands.find((c) => campaignLive(c, now));
    if (live) out.push({ place, campaign: live, neutral: false, advertiser: live.advertiser });
    else out.push({ place, campaign: cands[0] || null, neutral: true, advertiser: cands[0]?.advertiser || null });
  }
  return out;
}
