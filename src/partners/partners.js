// Marques présentes dans Equestrian Tour : identité, statut d'autorisation, ressources officielles.
//
// Règle : une marque tierce n'apparaît (nom, logo, visuels) que si son statut est « authorized » ET que la ressource
// officielle correspondante est fournie ; sinon le jeu affiche l'habillage neutre de l'emplacement (jamais un logo
// redessiné ou inventé). Pour activer une marque : déposer ses fichiers officiels dans src/assets/partners/<id>/,
// les référencer ci-dessous (import), passer status à 'authorized' et renseigner l'autorisation (qui, quand, quoi).
//
// Les statuts :
//   'authorized' : utilisation autorisée (ressources officielles fournies, autorisation tracée) ;
//   'pending'    : autorisation en attente : emplacement prêt, habillage neutre affiché ;
//   'disabled'   : marque retirée : habillage neutre.
import stridesLogoFull from '../assets/partners/strides/strides-logo-full.png';
import stridesMark from '../assets/partners/strides/strides-mark.png';
import stridesAppHome from '../assets/partners/strides/app-accueil-capture.png';

export const BRANDS = {
  // Strides : la plateforme réelle (application de missions et de recrutement des professionnels du cheval), intégrée
  // au téléphone du personnage. Le jeu est Equestrian Tour ; Strides n'en est pas l'éditeur à l'écran.
  strides: {
    id: 'strides',
    name: 'Strides',
    kind: 'platform',
    status: 'authorized',
    authorization: {
      by: 'Porteur du projet (demande du 2 novembre 2026 : intégrer le logo officiel Strides et une publicité Strides)',
      scope: 'logo officiel, captures de l’application, textes du site officiel',
    },
    assets: {
      // Fichier officiel, tel quel : https://strides-app.com/assets/assets/images/logo-full.7c83b30d34ccfa4c8b8bc0939fc32ffc.png
      // (récupéré le 21 octobre 2026). Noir sur transparent, 1247 × 355.
      logoFull: stridesLogoFull,
      // Monogramme (S à tête de cheval) : découpe du même fichier à la première colonne vide (x = 248), sans retouche.
      mark: stridesMark,
      // Capture authentique de l'application web réelle (strides-app.com, accueil, 390 px, 21 octobre 2026).
      appHome: stridesAppHome,
    },
    url: 'https://strides-app.com/',
    stores: {
      appStore: 'https://apps.apple.com/fr/app/strides/id6793963102',
      googlePlay: 'https://play.google.com/store/apps/details?id=com.stridesapp',
    },
  },
  // Kingsland : marque de vêtements et d'équipement équestres. Aucune ressource officielle autorisée pour l'instant :
  // la boutique de Deauville City et l'emplacement publicitaire de nuit sont prêts, avec un habillage neutre.
  kingsland: {
    id: 'kingsland',
    name: 'Kingsland',
    kind: 'advertiser',
    status: 'pending',
    authorization: null,
    assets: { logo: null, campaignImage: null, storefront: null },
    // Références fournies par la demande (campagnes officielles) : à utiliser une fois l'autorisation obtenue.
    references: [
      'https://kingslandequestrian.com/pages/autumn-winter-collection-2026',
      'https://kingslandequestrian.com/pages/spring-summer-2026',
    ],
    url: null,
    // Habillage neutre (boutique et publicité) tant que la marque n'est pas autorisée.
    neutral: { name: 'Sellerie & Mode Équestre', sub: 'Tenues d’équitation · Équipement du cheval' },
  },
  // STX : constructeur des camions et vans de chevaux du jeu (modèles 3D fournis). Le logo officiel n'est pas fourni :
  // les grands emplacements latéraux des carrosseries (src/partners/liveries.js : Scania et Master, deux flancs)
  // portent l'habillage neutre (les lettrages « STX » des modèles fournis sont conservés tels quels).
  // Activation : fichier officiel dans src/assets/partners/stx/ (PNG transparent ≥ 2 048 px de large, ou SVG avec
  // width/height), importé ici dans assets.sideLogo, status 'authorized', authorization renseignée ({ by, scope }).
  stx: {
    id: 'stx',
    name: 'STX',
    kind: 'advertiser',
    status: 'pending',
    authorization: null,
    // sideLogo : grand logo latéral des carrosseries (inscrit à ses proportions dans chaque emplacement).
    assets: { sideLogo: null },
    references: [],
    url: null,
    neutral: { name: '' },
  },
};

// Une marque est-elle affichable (statut autorisé et, si demandé, la ressource officielle fournie) ?
export function brandAuthorized(id, asset = null) {
  const b = BRANDS[id];
  if (!b || b.status !== 'authorized') return false;
  return asset ? !!b.assets?.[asset] : true;
}

// Nom à afficher pour une marque (habillage neutre tant qu'elle n'est pas autorisée).
export function brandName(id) {
  const b = BRANDS[id];
  if (!b) return '';
  return brandAuthorized(id) ? b.name : b.neutral?.name ?? '';
}
