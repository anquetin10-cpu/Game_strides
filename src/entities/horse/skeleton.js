// Squelette du cheval de sport (Selle Français, 1,65 m au garrot), pose de repos « carrée ».
// Coordonnées en mètres réels : x vers la gauche du cheval, y vers le haut, z vers l'avant ; origine au sol sous la selle.
// Partagé par le générateur hors ligne (scripts/horse) et par le jeu : l'ordre des os est celui des poids de peau.
// Toutes les rotations de repos sont nulles : rotation.x d'un os = flexion dans le plan sagittal.

// Le jeu applique mesh.scale = 0,94 : le modèle est construit à 1/0,94 pour garder 1,65 m une fois réduit.
export const MODEL_SCALE = 1 / 0.94;

const mirror = (p) => [-p[0], p[1], p[2]];

// [nom, parent, position de repos]
const DEF = [
  ['root', null, [0, 0, 0]],
  ['body', 'root', [0, 1.222, 0]], // thorax (sous la selle)
  ['breath', 'body', [0, 1.16, 0.08]], // respiration (feuille)
  ['loin', 'body', [0, 1.43, -0.27]], // vertèbres lombaires
  ['pelvis', 'loin', [0, 1.47, -0.5]], // lombo-sacrée → bassin
  ['tail', 'pelvis', [0, 1.5, -0.9]],
  ['tail2', 'tail', [0, 1.4, -0.965]],
  ['tail3', 'tail2', [0, 1.27, -0.995]],
  ['tail4', 'tail3', [0, 1.12, -1.005]],
  ['tail5', 'tail4', [0, 0.93, -1.005]],
  ['tail6', 'tail5', [0, 0.72, -0.995]],
  ['neck', 'body', [0, 1.32, 0.62]], // jonction cervico-thoracique
  ['neck2', 'neck', [0, 1.55, 0.86]],
  ['neck3', 'neck2', [0, 1.8, 1.06]],
  ['head', 'neck3', [0, 1.97, 1.18]], // nuque (articulation atlanto-occipitale)
  ['earL', 'head', [0.052, 1.992, 1.228]],
  ['earR', 'head', [-0.052, 1.992, 1.228]],
  ['jaw', 'head', [0, 1.83, 1.2]],
  ['maneA', 'neck2', [0, 1.72, 0.74]], // ressorts de crinière
  ['maneB', 'neck3', [0, 1.92, 0.96]],
  // Antérieurs : omoplate, humérus, avant-bras, canon, paturon, sabot.
  ['flSc', 'body', [0.17, 1.46, 0.5]],
  ['flHu', 'flSc', [0.19, 1.15, 0.73]],
  ['flU', 'flHu', [0.19, 0.9, 0.56]],
  ['flL', 'flU', [0.165, 0.48, 0.57]],
  ['flP', 'flL', [0.15, 0.19, 0.575]],
  ['flH', 'flP', [0.145, 0.06, 0.655]],
  // Postérieurs : fémur (hanche), tibia (grasset), canon (jarret), paturon, sabot.
  ['hlU', 'pelvis', [0.2, 1.22, -0.7]],
  ['hlL', 'hlU', [0.225, 0.86, -0.53]],
  ['hlC', 'hlL', [0.175, 0.5, -0.76]],
  ['hlP', 'hlC', [0.155, 0.19, -0.755]],
  ['hlH', 'hlP', [0.15, 0.06, -0.69]],
  // Ancres (non pondérées) : selle, anneau du licol, mains du cavalier, étrivières.
  ['saddle', 'body', [0, 1.62, 0.1]],
  ['leadAnchor', 'head', [0, 1.555, 1.265]],
  ['reinL', 'body', [0.07, 1.86, 0.5]],
  ['reinR', 'body', [-0.07, 1.86, 0.5]],
  ['stirL', 'body', [0.27, 0.98, 0.25]], // étrier (bas de l'étrivière)
  ['stirR', 'body', [-0.27, 0.98, 0.25]],
];

function build() {
  const out = [];
  for (const [n, p, pos] of DEF) {
    out.push({ name: n, parent: p, pos });
    // Membre gauche → membre droit en miroir.
    if (/^[fh]l[A-Z]/.test(n)) {
      const rn = n[0] + 'r' + n.slice(2);
      const rp = /^[fh]l[A-Z]/.test(p) ? p[0] + 'r' + p.slice(2) : p;
      out.push({ name: rn, parent: rp, pos: mirror(pos) });
    }
  }
  return out;
}

export const BONES = build();
export const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b.name, i]));
// Os des quatre membres (ordre : AG, AD, PG, PD).
export const LEGS = [
  ['flSc', 'flHu', 'flU', 'flL', 'flP', 'flH'],
  ['frSc', 'frHu', 'frU', 'frL', 'frP', 'frH'],
  ['hlU', 'hlL', 'hlC', 'hlP', 'hlH'],
  ['hrU', 'hrL', 'hrC', 'hrP', 'hrH'],
];
export const bonePos = (name) => BONES[BONE_INDEX[name]].pos;
