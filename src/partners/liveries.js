// Habillage des carrosseries STX (camion Scania, van Renault Master) : grands emplacements latéraux du logo du
// constructeur, un par flanc. Le rendu (décor projeté sur la carrosserie réelle) est dans src/entities/livery.js.
//
// Règle (voir partners.js) : le logo STX n'est dessiné que si BRANDS.stx.status vaut 'authorized' ET que le fichier
// officiel est fourni (BRANDS.stx.assets.sideLogo). Sinon chaque emplacement porte l'habillage neutre ci-dessous
// (un double filet graphite, sans texte ni forme de marque) : jamais un logo redessiné ou inventé. Les lettrages
// « STX » d'origine des modèles fournis (capucine, flancs du Master) ne sont pas concernés et restent intacts.
//
// Pour activer le logo officiel (aucune autre modification du code) :
//   1. déposer le fichier officiel dans src/assets/partners/stx/ (PNG à fond transparent, 2 048 px de large ou plus,
//      ou SVG avec ses attributs width/height) ;
//   2. dans partners.js : l'importer (import stxSideLogo from '../assets/partners/stx/<fichier>';), le référencer dans
//      BRANDS.stx.assets.sideLogo, passer BRANDS.stx.status à 'authorized' et renseigner BRANDS.stx.authorization
//      (qui a autorisé, quand, pour quels usages).
// Le logo est alors posé sur les quatre emplacements, à ses proportions (jamais déformé : il est inscrit dans
// l'emplacement, hauteur visée `height`, largeur au plus `maxWidth`), centré dans la zone utile.
//
// Repère des emplacements : celui du véhicule dans le jeu (comme STX_DIM et MASTER_DIM), en mètres : x vers la gauche
// du véhicule, y vers le haut depuis le sol, z vers l'avant ; flanc 'left' = côté x > 0, 'right' = côté x < 0. Le
// modèle glTF a l'axe x et l'axe z inversés (x_glb = -x, z_glb = -z) : la conversion est faite au rendu.
//   mesh     : maillage(s) de carrosserie fixe sur lesquels le décor est projeté (jamais une pièce mobile) ;
//   plane    : |x| de la face extérieure du panneau (plane : vérifié sur la géométrie au chargement, écart en mm) ;
//   panel    : zone libre du panneau [z0, z1] × [y0, y1], bornée par les ouvertures et équipements cités dans `bounds` ;
//   margin   : garde intérieure (m) entre ces bords et le décor ;
//   height   : hauteur visée du logo ; maxWidth : largeur maximale ;
//   keepOut  : maillages à ne jamais recouvrir (ouvertures, pièces mobiles, charnières, feux, vitrages, poignées),
//              contrôlés par le test tests/e2e/stx-livery.mjs (triangle par triangle, dans le repère du véhicule).
import { BRANDS, brandAuthorized } from './partners.js';

export const STX_LIVERY = {
  brand: 'stx',
  asset: 'sideLogo',
  // Habillage neutre de l'emplacement tant que la marque n'est pas autorisée : double filet graphite (bande de 7,5 cm,
  // jour de 2 cm, filet de 1,2 cm), métallisé comme la peinture, sur toute la largeur utile, au tiers inférieur de la
  // zone. Aucun texte, aucune forme de marque. kind: 'none' : emplacements laissés vides.
  neutral: { kind: 'band', stripe: 0.075, gap: 0.02, line: 0.012, at: 0.3, color: '#3a3f46' },
  vehicles: {
    // Camion STX Scania (src/assets/vehicles/STX_Scania_DETAILLE.glb), face extérieure des panneaux à |x| = 1,28 m.
    STX_Scania_DETAILLE: [
      {
        id: 'scania-gauche',
        side: 'left',
        mesh: ['exterior__Silver_panels'],
        plane: 1.28,
        // Box chevaux sous les trois fenêtres : de l'encadrement arrière (z = -5,94) au cadre de l'habitation
        // (z = 1,30), du haut des passages de roue (y = 1,25) au joint des fenêtres (y = 2,786).
        panel: { z: [-5.94, 1.3], y: [1.25, 2.786] },
        bounds: 'encadrement arrière, cadre de l’habitation, joints des fenêtres, passages de roue',
        margin: 0.15,
        height: 1.0,
        maxWidth: 4.8,
        keepOut: ['exterior__Glass', 'exterior__Glass_dark', 'exterior__Gasket', 'exterior__Light_lens', 'exterior__Amber', 'exterior__Silver_edge', 'exterior__Brushed_steel', 'rear_ramp', 'cab_door_L'],
      },
      {
        id: 'scania-droite',
        side: 'right',
        mesh: ['exterior__Silver_panels'],
        plane: 1.28,
        // Habitation (le box de ce côté est occupé par les portes et trappes) : des charnières de la porte
        // d'habitation (z = 0,52 ; bord de zone à 0,60) à la cabine (z = 4,10), de la lisse basse (y = 1,168) au joint
        // de la fenêtre (y = 2,786).
        panel: { z: [0.6, 4.1], y: [1.168, 2.786] },
        bounds: 'charnières de la porte d’habitation, cabine, lisse basse, joint de la fenêtre',
        margin: 0.15,
        height: 1.0,
        maxWidth: 2.9,
        keepOut: ['exterior__Glass', 'exterior__Glass_dark', 'exterior__Gasket', 'exterior__Light_lens', 'exterior__Amber', 'exterior__Silver_edge', 'exterior__Brushed_steel', 'exterior__Chrome', 'living_door'],
      },
    ],
    // Van STX Renault Master (src/assets/vehicles/STX_Renault_Master_STALLE5.glb), flancs du box à |x| = 1,1645 m.
    STX_Renault_Master_STALLE5: [
      {
        id: 'master-gauche',
        side: 'left',
        mesh: ['exterior__Body_Paint'],
        plane: 1.1645,
        // Sous les deux fenêtres du box : de la poignée arrière (z = -2,73) au joint de la porte de service
        // (z = 0,56), du haut de l'élargisseur d'aile (y = 0,865) au joint des fenêtres (y = 1,995).
        panel: { z: [-2.73, 0.55], y: [0.865, 1.995] },
        bounds: 'poignée arrière, porte de service, élargisseur d’aile arrière, joints des fenêtres',
        margin: 0.1,
        height: 0.62,
        maxWidth: 2.6,
        keepOut: ['exterior__Glass', 'exterior__Glass_dark', 'exterior__Gasket', 'exterior__Dark_metal', 'exterior__Chrome', 'exterior__Amber', 'exterior__Black_plastic', 'exterior__STX_side_-1', 'rear_door', 'cab_door_L'],
      },
      {
        id: 'master-droite',
        side: 'right',
        mesh: ['exterior__Body_Paint'],
        plane: 1.1645,
        // Derrière le pont latéral (pièce mobile, exclue) : de la poignée arrière (z = -2,73) au joint du pont
        // (z = -1,38 ; bord de zone à -1,40), du haut de l'élargisseur d'aile (y = 0,865) au joint de la fenêtre
        // arrière (y = 1,956).
        panel: { z: [-2.73, -1.4], y: [0.865, 1.956] },
        bounds: 'poignée arrière, joint du pont latéral, élargisseur d’aile arrière, joint de la fenêtre arrière',
        margin: 0.1,
        height: 0.62,
        maxWidth: 1.1,
        keepOut: ['exterior__Glass', 'exterior__Glass_dark', 'exterior__Gasket', 'exterior__Chrome', 'exterior__Amber', 'exterior__Black_plastic', 'exterior__STX_side_1', 'side_ramp', 'upper_flap_front', 'upper_flap_rear', 'rear_door'],
      },
    ],
  },
};

// Zone utile d'un emplacement (zone libre moins la garde) : { z0, z1, y0, y1, w, h }.
export function slotArea(slot) {
  const m = slot.margin || 0;
  const z0 = slot.panel.z[0] + m, z1 = slot.panel.z[1] - m;
  const y0 = slot.panel.y[0] + m, y1 = slot.panel.y[1] - m;
  return { z0, z1, y0, y1, w: z1 - z0, h: y1 - y0 };
}

// Rectangle d'un visuel de proportions `aspect` (largeur / hauteur) inscrit dans l'emplacement, sans déformation :
// hauteur visée, bornée par la hauteur utile, la largeur maximale et la largeur utile ; centré. { zc, yc, w, h }.
export function fitContent(slot, aspect) {
  if (!(aspect > 0) || !Number.isFinite(aspect)) return null;
  const a = slotArea(slot);
  const maxW = Math.min(slot.maxWidth ?? a.w, a.w);
  const h = Math.min(slot.height ?? a.h, a.h, maxW / aspect);
  if (!(h > 0)) return null;
  return { zc: (a.z0 + a.z1) / 2, yc: (a.y0 + a.y1) / 2, w: h * aspect, h };
}

// Rectangle de l'habillage neutre (filet sur toute la largeur utile, hauteur fixe) : { zc, yc, w, h } ; null pour
// l'habillage vide (neutral.kind = 'none' : aucun décor tant que la marque n'est pas autorisée).
export function neutralRect(slot, n = STX_LIVERY.neutral) {
  if (!n || n.kind !== 'band') return null;
  const a = slotArea(slot);
  const h = n.stripe + n.gap + n.line;
  return { zc: (a.z0 + a.z1) / 2, yc: a.y0 + (a.h - h) * n.at + h / 2, w: a.w, h };
}

// Contenu des emplacements selon la configuration des marques : logo officiel (autorisé et fourni) ou habillage neutre.
export function stxSideContent(brands = BRANDS) {
  const b = brands[STX_LIVERY.brand];
  const ok = brands === BRANDS ? brandAuthorized(STX_LIVERY.brand, STX_LIVERY.asset) : b?.status === 'authorized' && !!b.assets?.[STX_LIVERY.asset];
  return ok ? { kind: 'official', src: b.assets[STX_LIVERY.asset] } : { kind: 'neutral' };
}
