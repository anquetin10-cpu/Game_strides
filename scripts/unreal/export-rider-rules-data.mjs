#!/usr/bin/env node
// Paramètres des règles de monte du jeu web v3 pour le portage C++ (essai de monte, voie A, étape 4) :
// unreal/StridesGrandTour/Content/Data/rider_rules.json, lu par StridesCore (rideParamsFromJson) et comparé aux valeurs
// par défaut de StridesCore/RiderRules.h par unreal/core/tests/test_monte.cpp.
//
// Rien n'est recopié à la main :
// - RIDE est importé de src/entities/human/anim.js (le module n'importe que three ; Node seul, sans Vite) ;
// - les constantes nommées que les modules ne publient pas (anim.js : THIGH_MARGIN, POLE_OPEN, HUG_OPEN, HUG_RELAX,
//   FOOT_OPEN, FOOT_RELAX, DEFAULT_FIT ; human.js : FLANK_RELAX, FLANK_LEAD, FIST, RIDER_FIT, RIDER_SEAT ; pjlHorse.js :
//   LEG_THICK, HIND_DOWN) sont relues dans le source tel qu'il est (human.js et pjlHorse.js importent des modules du
//   navigateur : ils ne sont pas importés). Une constante introuvable ou ambiguë arrête l'export (code 1).
//
// Usage (racine du dépôt) : node scripts/unreal/export-rider-rules-data.mjs [--check]
//   --check : n'écrit rien, sort en code 1 si le fichier versionné diffère de l'export.
// Sortie déterministe : deux exports donnent les mêmes octets. Ce script remplace, pour ces constantes, la modification
// de scripts/unreal/export-data.mjs prévue au plan (étape 4) : export-data.mjs s'exécute par vite-node, qui écrit son
// cache dans node_modules (partagé avec le chantier CSO dans cette phase), et ce fichier est modifié par ce chantier.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RIDE } from '../../src/entities/human/anim.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'unreal/StridesGrandTour/Content/Data/rider_rules.json');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const ANIM = 'src/entities/human/anim.js', HUMAN = 'src/entities/human.js', PJL = 'src/entities/pjlHorse.js';

// Une seule occurrence exigée (sinon la constante lue pourrait ne pas être celle que le code utilise).
function one(file, re, what) {
  const text = read(file);
  const all = [...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))];
  if (all.length !== 1) throw new Error(`${file} : ${what} trouvé ${all.length} fois`);
  return all[0];
}
const num = (file, name) => {
  const m = one(file, new RegExp(`\\b${name} = (-?[\\d.]+)\\b`), name);
  const v = Number(m[1]);
  if (!Number.isFinite(v)) throw new Error(`${file} : ${name} n'est pas un nombre`);
  return v;
};
// Objet littéral plat de nombres : { a: 1, b: -0.5 }.
const flat = (file, name) => {
  const m = one(file, new RegExp(`\\b${name} = \\{([^{}]*)\\}`), name);
  const o = {};
  for (const kv of m[1].split(',')) {
    const [k, v] = kv.split(':').map((x) => x.trim());
    if (!k) continue;
    if (!/^[A-Za-z_]\w*$/.test(k) || !Number.isFinite(Number(v))) throw new Error(`${file} : ${name}.${k} illisible`);
    o[k] = Number(v);
  }
  return o;
};
const vec = (src, what) => {
  const p = src.split(',').map((x) => Number(x.trim()));
  if (p.length !== 3 || !p.every(Number.isFinite)) throw new Error(`${what} illisible`);
  return p;
};

// Plusieurs constantes déclarées sur une même ligne (const A = 2.4, B = 0.12;).
const numIn = (file, name) => {
  const m = one(file, new RegExp(`(?:const |, )${name} = (-?[\\d.]+)\\b`), name);
  return Number(m[1]);
};

const seat = one(HUMAN, /\bRIDER_SEAT = \{ saddle: new THREE\.Vector3\(([^)]*)\), body: new THREE\.Vector3\(([^)]*)\) \}/, 'RIDER_SEAT');
const fist = one(HUMAN, /\bconst FIST = new THREE\.Vector3\(([^)]*)\)/, 'FIST');
const data = {
  schema: 'strides.rider_rules/1',
  generator: 'scripts/unreal/export-rider-rules-data.mjs',
  source: [ANIM, HUMAN, PJL],
  units: 'unités du personnage (≈ m), s, fractions ; RIDER_FIT, RIDER_SEAT, FIST, LEG_THICK, HIND_DOWN : m',
  doc: 'paramètres des règles de monte du jeu web v3, lus par StridesCore (RiderRules.h, rideParamsFromJson) : RIDE importé d’anim.js ; constantes nommées relues dans le source (anim : riding, hugFlank, hugMemory ; human : animateRiding ; pjlHorse : profil et postérieurs reposés)',
  RIDE,
  anim: {
    THIGH_MARGIN: num(ANIM, 'THIGH_MARGIN'),
    POLE_OPEN: num(ANIM, 'POLE_OPEN'),
    HUG_OPEN: numIn(ANIM, 'HUG_OPEN'),
    HUG_RELAX: numIn(ANIM, 'HUG_RELAX'),
    FOOT_OPEN: numIn(ANIM, 'FOOT_OPEN'),
    FOOT_RELAX: numIn(ANIM, 'FOOT_RELAX'),
    DEFAULT_FIT: flat(ANIM, 'DEFAULT_FIT'),
  },
  human: {
    FLANK_RELAX: num(HUMAN, 'FLANK_RELAX'),
    FLANK_LEAD: num(HUMAN, 'FLANK_LEAD'),
    FIST: vec(fist[1], 'FIST'),
    RIDER_FIT: flat(HUMAN, 'RIDER_FIT'),
    RIDER_SEAT: { saddle: vec(seat[1], 'RIDER_SEAT.saddle'), body: vec(seat[2], 'RIDER_SEAT.body') },
  },
  pjlHorse: {
    LEG_THICK: num(PJL, 'LEG_THICK'),
    HIND_DOWN: num(PJL, 'HIND_DOWN'),
  },
};
const text = JSON.stringify(data, null, 1) + '\n';
if (process.argv.includes('--check')) {
  const same = existsSync(OUT) && readFileSync(OUT, 'utf8') === text;
  console.log(same ? 'rider_rules.json : à jour' : 'rider_rules.json : DIFFÉRENT de l’export');
  process.exit(same ? 0 : 1);
}
const changed = !existsSync(OUT) || readFileSync(OUT, 'utf8') !== text;
if (changed) writeFileSync(OUT, text);
console.log(`unreal/StridesGrandTour/Content/Data/rider_rules.json : ${changed ? 'écrit' : 'inchangé'}`);
