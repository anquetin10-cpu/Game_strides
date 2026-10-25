// Zones de matière du maillage (attribut par sommet) : chaque tenue associe une zone à un emplacement de palette.
export const Z = {
  SKIN: 0, LIPS: 1, SCLERA: 2, IRIS: 3, PUPIL: 4, BROW: 5, SCALP: 6, BEARD: 7,
  NECK: 8, COLLAR: 9, SHIRT: 10, TOP: 11, TOP_LOW: 12, BELT: 13, HIPS: 14, SEAT: 15, LOGO: 16,
  SLEEVE_UP: 17, SLEEVE_LOW: 18, HAND: 19,
  THIGH: 20, KNEE: 21, CALF: 22, FOOT: 23, SOLE: 24,
  SKIRT: 25, LEG_BARE: 26,
  HAIR: 27, HAIR_TIE: 28, HELMET: 29, HELMET_PEAK: 30, HELMET_TRIM: 31, CAP: 32, CAP_BRIM: 33,
  EYE_LOD: 34, CUFF: 35, LAPEL: 36,
};
export const ZONE_COUNT = 40;

// Emplacements de palette (couleur + matière) par personne.
export const S = {
  SKIN: 0, LIPS: 1, SCLERA: 2, IRIS: 3, PUPIL: 4, BROW: 5, HAIR: 6,
  TOP: 7, TOP2: 8, LOGO: 9, PANTS: 10, BELT: 11, SHOES: 12, SOLE: 13, GLOVES: 14,
  HELMET: 15, HELMET2: 16, HAT: 17, EYE_LOD: 18, BEARD: 19, TIE: 20,
};
export const SLOT_COUNT = 21;

// Fusion des zones pour les niveaux de détail lointains (moins de coutures).
export const LOD_MERGE = {
  1: { [Z.SCLERA]: Z.EYE_LOD, [Z.IRIS]: Z.EYE_LOD, [Z.PUPIL]: Z.EYE_LOD, [Z.LOGO]: Z.TOP, [Z.LIPS]: Z.SKIN, [Z.CUFF]: Z.SLEEVE_LOW, [Z.LAPEL]: Z.TOP },
  2: {
    [Z.SCLERA]: Z.SKIN, [Z.IRIS]: Z.SKIN, [Z.PUPIL]: Z.SKIN, [Z.EYE_LOD]: Z.SKIN, [Z.LIPS]: Z.SKIN, [Z.BROW]: Z.SKIN, [Z.LOGO]: Z.TOP,
    [Z.CUFF]: Z.SLEEVE_LOW, [Z.LAPEL]: Z.TOP, [Z.HAIR_TIE]: Z.HAIR, [Z.HELMET_TRIM]: Z.HELMET, [Z.SOLE]: Z.FOOT, [Z.BELT]: Z.HIPS,
  },
};
