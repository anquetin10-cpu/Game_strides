// Boutique d'équitation de Deauville City (commerce « boutique ») : habillage de marque, prêt pour un partenaire.
//
// Le nom, l'enseigne, le logo et les visuels viennent de la marque STORE_BRAND de src/partners/partners.js, selon la
// règle du projet (une marque tierce n'apparaît que si son statut est « authorized » ET que la ressource officielle
// est fournie) :
// - marque non autorisée (statut 'pending' ou 'disabled') : habillage neutre BRANDS[STORE_BRAND].neutral (nom et
//   sous-titre) en lettres peintes, pictogramme générique (fer à cheval) sur l'enseigne drapeau, lettrage neutre sur
//   les vitrines : aucun nom, logo, visuel ni slogan de la marque ;
// - marque autorisée : nom officiel (BRANDS[id].name) ; chaque ressource officielle fournie est affichée telle quelle,
//   à ses proportions (jamais déformée, recolorée ni redessinée), voir storeBrand.js :
//     assets.logo       → bandeau de la devanture, enseigne drapeau, vitrines, porte, panneau derrière le comptoir ;
//     assets.storefront → caisson lumineux du magasin (visuel de vitrine officiel) ;
//   une ressource absente laisse son emplacement en version texte (nom officiel), jamais un logo inventé.
// Module sans dépendance graphique (sites.js, minimap, téléphone, tests).
import { BRANDS, brandAuthorized, brandName } from '../partners/partners.js';
import { t } from '../core/i18n.js';

// Marque de la boutique (partners.js).
export const STORE_BRAND = 'kingsland';

// Habillage courant : { brand, official, name, sub, logo, storefront } (logo / storefront : ressource officielle
// autorisée et fournie, sinon null). brands : configuration des marques (tests).
export function storeSkin(id = STORE_BRAND, brands = BRANDS) {
  const b = brands[id] || {};
  const ok = brands === BRANDS ? brandAuthorized(id) : b.status === 'authorized';
  const asset = (k) => (ok && b.assets?.[k] ? b.assets[k] : null);
  return {
    brand: id,
    official: ok,
    name: brands === BRANDS ? brandName(id) : ok ? b.name : b.neutral?.name ?? '',
    // Sous-titre descriptif du métier (jamais un slogan de la marque).
    sub: t(b.neutral?.sub || ''),
    logo: asset('logo'),
    storefront: asset('storefront'),
  };
}
