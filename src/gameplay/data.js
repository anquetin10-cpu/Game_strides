// Données de jeu : chevaux, boutique, annuaire, écuries, PNJ.
import { POI } from '../world/layout.js';

// Chevaux de concours : price = location pour la saison (pratique courante pour monter un cheval de propriétaire sans
// l'acheter), value = valeur marchande estimée d'un cheval de ce niveau.
export const HORSES = {
  comete: { id: 'comete', name: 'Comète', coat: 'bay', blaze: true, socks: [false, false, true, false], speed: 1.0, jump: 1.0, stamina: 1.0, price: 0, breed: 'Selle Français', age: 9, desc: 'Jument baie, fiable et courageuse. Ta partenaire depuis toujours.' },
  ulysse: { id: 'ulysse', name: 'Ulysse', coat: 'grey', blaze: false, socks: [false, false, false, false], speed: 0.98, jump: 1.15, stamina: 1.12, price: 1800, value: 25000, breed: 'Selle Français', age: 11, desc: 'Hongre gris, très respectueux sur les barres.' },
  onyx: { id: 'onyx', name: 'Onyx', coat: 'black', blaze: false, socks: [true, false, false, false], speed: 1.13, jump: 1.06, stamina: 1.0, price: 3200, value: 45000, breed: 'KWPN', age: 8, desc: 'Étalon noir explosif. Une fusée sur le plat.' },
  saphir: { id: 'saphir', name: 'Saphir', coat: 'chestnut', blaze: true, socks: [true, true, true, true], speed: 1.1, jump: 1.24, stamina: 1.2, price: 5500, value: 150000, breed: 'Holsteiner', age: 10, desc: 'Jument alezane, gagnante en Grand Prix. La crème.' },
};

// Catalogue des commerces de Deauville City (Sellerie du Port, Maison Lucette), le même dans les boutiques et dans
// l'application du téléphone : mêmes articles, mêmes prix, mêmes règles d'achat (voir commerce.js).
// - cat : rayon (SHOP_CATS) ; shop : commerce qui le vend ;
// - desc : effet réellement appliqué (résumé), about : description de l'article ;
// - kind 'consumable' : achats cumulables (quantité), utilisés depuis l'application Profil ; sinon article unique ;
// - slot : équipement porté (un article par emplacement, choisi avec « Équiper ») ; effect : bonus du cheval pris en
//   compte seulement s'il est équipé (ou, pour un article sans emplacement, dès l'achat) ;
// - pad/trim : couleurs du tapis de selle ; wear : champs de tenue du personnage (tenues, casque, bottes) ;
// - use : soins appliqués au cheval monté par un consommable (énergie, hydratation, propreté, pieds).
export const SHOP_CATS = {
  selles: 'Selles',
  briderie: 'Briderie',
  tapis: 'Tapis & textiles',
  protections: 'Protections & ferrure',
  soins: 'Pansage & soins',
  cavalier: 'Équipement du cavalier',
  hauts: 'Hauts & vestes',
  accessoires: 'Accessoires',
};
export const SHOP = [
  { id: 'selle', shop: 'sellerie', cat: 'selles', slot: 'selle', name: 'Selle mixte carbone', desc: 'Puissance de saut +12 %', about: 'Arçon carbone, siège semi-creux, quartiers mi-longs : polyvalente, du travail sur le plat au parcours.', price: 380, effect: { jump: 0.12 } },
  { id: 'selle_pro', shop: 'sellerie', cat: 'selles', slot: 'selle', name: 'Selle CSO Pro', desc: 'Puissance de saut +24 % (remplace la selle mixte)', about: 'Selle d’obstacle en cuir pleine fleur, quartiers avancés et taquets : la position du cavalier reste stable à l’abord.', price: 900, requires: 'selle', effect: { jump: 0.24 } },
  { id: 'bridon', shop: 'sellerie', cat: 'briderie', slot: 'bridon', name: 'Bridon anatomique', desc: 'Endurance +6 %', about: 'Têtière rembourrée qui libère la nuque, muserolle française, rênes caoutchoutées.', price: 165, effect: { stamina: 0.06 } },
  { id: 'tapis_marine', shop: 'sellerie', cat: 'tapis', slot: 'tapis', name: 'Tapis bleu marine', desc: 'Cosmétique : tapis marine, liseré blanc', about: 'Tapis de dressage-obstacle en coton matelassé, passants de sangle.', price: 55, pad: '#1f2b45', trim: '#f2f1ec', effect: {} },
  { id: 'tapis_bordeaux', shop: 'sellerie', cat: 'tapis', slot: 'tapis', name: 'Tapis bordeaux', desc: 'Cosmétique : tapis bordeaux, liseré or', about: 'Coton matelassé, liseré doré, doublure respirante.', price: 59, pad: '#5e1f2b', trim: '#c8a96e', effect: {} },
  { id: 'tapis_blanc', shop: 'sellerie', cat: 'tapis', slot: 'tapis', name: 'Tapis de concours blanc', desc: 'Cosmétique : tapis blanc, liseré noir', about: 'Le tapis des épreuves officielles, satin et coton.', price: 62, pad: '#eeede8', trim: '#1b1c1f', effect: {} },
  { id: 'guetres', shop: 'sellerie', cat: 'protections', slot: 'guetres', name: 'Guêtres de protection', desc: 'Tolérance sur les barres +8 %', about: 'Guêtres ouvertes à coque, fermetures élastiques : protègent les tendons sans gêner le saut.', price: 300, effect: { clearance: 0.08 } },
  { id: 'cloches', shop: 'sellerie', cat: 'protections', slot: 'cloches', name: 'Cloches en caoutchouc', desc: 'Tolérance sur les barres +3 %', about: 'Protègent les talons des atteintes des postérieurs.', price: 45, effect: { clearance: 0.03 } },
  { id: 'fers', shop: 'sellerie', cat: 'protections', name: 'Fers aluminium', desc: 'Vitesse +6 %', about: 'Fers légers posés par la Forge Lemaire : moins de poids au bout des membres.', price: 250, effect: { speed: 0.06 } },
  { id: 'complement', shop: 'sellerie', cat: 'soins', name: 'Complément endurance', desc: 'Endurance +35 %', about: 'Cure de vitamines E et sélénium, électrolytes : pour toute la saison.', price: 220, effect: { stamina: 0.35 } },
  { id: 'shampoing', shop: 'sellerie', cat: 'soins', kind: 'consumable', name: 'Shampoing doux', desc: 'Propreté +45 (cheval monté ou à côté de toi)', about: 'Flacon de 500 ml au pH neutre.', price: 12, use: { clean: 45 }, effect: {} },
  { id: 'graisse', shop: 'sellerie', cat: 'soins', kind: 'consumable', name: 'Graisse à sabots', desc: 'Pieds +35', about: 'Graisse au laurier : nourrit la corne et la sole.', price: 14, use: { hooves: 35 }, effect: {} },
  { id: 'electrolytes', shop: 'sellerie', cat: 'soins', kind: 'consumable', name: 'Électrolytes', desc: 'Hydratation +35', about: 'Sachet à diluer dans l’eau après l’effort.', price: 9, use: { hydration: 35 }, effect: {} },
  { id: 'friandises', shop: 'sellerie', cat: 'soins', kind: 'consumable', name: 'Friandises à la pomme', desc: 'Énergie +8', about: 'Biscuits à la pomme et à la carotte (sachet).', price: 6, use: { energy: 8 }, effect: {} },
  { id: 'veste', shop: 'sellerie', cat: 'cavalier', name: 'Veste de concours', desc: 'Cosmétique : veste bleu marine portée en concours', about: 'Veste softshell à col blanc, coupe ajustée.', price: 150, effect: { outfit: 'competition' } },
  { id: 'casque', shop: 'sellerie', cat: 'cavalier', slot: 'casque', name: 'Casque bleu nuit', desc: 'Cosmétique : casque porté à cheval', about: 'Casque ventilé aux normes VG1, visière courte.', price: 290, wear: { helmet: '#1f2b45' }, effect: {} },
  { id: 'bottes', shop: 'sellerie', cat: 'cavalier', slot: 'bottes', name: 'Bottes en cuir noir', desc: 'Cosmétique : bottes hautes noires', about: 'Bottes d’équitation en cuir de veau, zip arrière.', price: 240, wear: { boots: '#121214' }, effect: {} },
  // Maison Lucette (prêt-à-porter) : tenues portées à pied, au volant et à cheval hors concours.
  { id: 'polo_blanc', shop: 'boutique', cat: 'hauts', slot: 'haut', name: 'Polo piqué blanc', desc: 'Cosmétique : haut de la tenue de tous les jours', about: 'Coton piqué, col côtelé.', price: 45, wear: { top: '#f2f1ec', sleeve: '#f2f1ec' }, effect: {} },
  { id: 'pull_marin', shop: 'boutique', cat: 'hauts', slot: 'haut', name: 'Pull marin', desc: 'Cosmétique : haut de la tenue de tous les jours', about: 'Laine bouillie bleu marine, boutonné à l’épaule.', price: 79, wear: { top: '#1f2b45', sleeve: '#1f2b45' }, effect: {} },
  { id: 'sweat_gris', shop: 'boutique', cat: 'hauts', slot: 'haut', name: 'Sweat gris chiné', desc: 'Cosmétique : haut de la tenue de tous les jours', about: 'Molleton brossé, poignets côtelés.', price: 65, wear: { top: '#8a8f96', sleeve: '#8a8f96' }, effect: {} },
  { id: 'doudoune', shop: 'boutique', cat: 'hauts', slot: 'haut', name: 'Doudoune sans manches', desc: 'Cosmétique : doudoune bordeaux sur chemise blanche', about: 'Garnissage léger, col montant.', price: 129, wear: { top: '#6e2433', sleeve: '#f2f1ec', collar: '#f2f1ec' }, effect: {} },
  { id: 'veste_huilee', shop: 'boutique', cat: 'hauts', slot: 'haut', name: 'Veste huilée', desc: 'Cosmétique : veste kaki de campagne', about: 'Coton huilé imperméable, col velours.', price: 159, wear: { top: '#4b4a33', sleeve: '#4b4a33', collar: '#5b4330' }, effect: {} },
  { id: 'casquette', shop: 'boutique', cat: 'accessoires', slot: 'tete', name: 'Casquette marine', desc: 'Cosmétique : portée à pied (le casque la remplace à cheval)', about: 'Toile de coton, visière courbe.', price: 25, wear: { cap: '#1f2b45' }, effect: {} },
  { id: 'casquette_beige', shop: 'boutique', cat: 'accessoires', slot: 'tete', name: 'Casquette beige', desc: 'Cosmétique : portée à pied (le casque la remplace à cheval)', about: 'Toile de coton délavée.', price: 25, wear: { cap: '#c8b48e' }, effect: {} },
];
// Emplacements d'équipement (nom affiché).
export const SLOTS = { selle: 'Selle', bridon: 'Bridon', tapis: 'Tapis', guetres: 'Guêtres', cloches: 'Cloches', casque: 'Casque', bottes: 'Bottes', haut: 'Haut', tete: 'Couvre-chef' };
// Carte du café-boulangerie Le Galop (consommé sur place ou à emporter : pas d'inventaire).
export const CAFE_MENU = [
  { id: 'cafe', name: 'Café', price: 1.8 },
  { id: 'creme', name: 'Café crème', price: 3.2 },
  { id: 'croissant', name: 'Croissant au beurre', price: 1.3 },
  { id: 'teurgoule', name: 'Part de teurgoule', price: 3.5 },
];

// Aménagements de l'écurie (application « Mon écurie ») : achetés avec les gains, visibles au Val, persistants.
export const STABLE_UPGRADES = [
  { id: 'aire', name: 'Aire de pansage couverte', desc: 'Préparation regroupée plus rapide (6 s → 4 s), pansage à l’abri.', price: 350, requires: 'chapter1Done', lockedText: 'Camille la proposera après ton premier concours en équipe.' },
];

export const SKILL_LABEL = { preparation: 'Préparation', equitation: 'Équitation', transport: 'Transport', organisation: 'Organisation' };

export const PROS = [
  { id: 'lemaire', name: 'Hugo Lemaire', job: 'Maréchal-ferrant', rating: 4.9, reviews: 212, place: POI.forge, avail: 'Disponible aujourd’hui', verified: true, initials: 'HL' },
  { id: 'clinique', name: 'Dr Inès Vasseur', job: 'Vétérinaire équin', rating: 4.8, reviews: 168, place: POI.vet, avail: 'Urgences 24/7', verified: true, initials: 'IV' },
  { id: 'kahn', name: 'Sarah Kahn', job: 'Ostéopathe équin', rating: 4.9, reviews: 97, place: POI.haras, avail: 'Demain 9 h', verified: true, initials: 'SK' },
  { id: 'morel', name: 'Paul Morel', job: 'Dentiste équin', rating: 4.7, reviews: 64, place: POI.dunes, avail: 'Jeudi', verified: true, initials: 'PM' },
  { id: 'sellerie', name: 'Sellerie du Port', job: 'Sellier · Équipement', rating: 4.8, reviews: 341, place: POI.sellerie, avail: 'Ouvert · 9 h – 19 h', verified: true, initials: 'SP' },
  { id: 'nht', name: 'Normandie Horse Transport', job: 'Transporteur agréé', rating: 4.9, reviews: 288, place: POI.home, avail: 'Véhicule 6 places', verified: true, initials: 'NH' },
];

export const STABLES = [
  { id: 'home', name: 'Écurie du Val', place: POI.home, rating: 4.7, price: 420, services: ['Box + paddock', 'Carrière', 'Foin à volonté'], tags: ['paddock', 'carriere'], desc: 'Structure familiale, au calme, à 5 min de Deauville City.' },
  { id: 'haras', name: 'Haras de la Pommeraie', place: POI.haras, rating: 4.9, price: 690, services: ['Box + paddock', 'Étalons', 'Soins vétérinaires'], tags: ['paddock', 'soins'], desc: 'Haras historique, élevage et pension haut de gamme.' },
  { id: 'dunes', name: 'Écurie des Dunes', place: POI.dunes, rating: 4.8, price: 480, services: ['Box + paddock', 'Accès plage', 'Marcheur'], tags: ['paddock', 'plage'], desc: 'Pension en bord de mer, idéale pour le travail en extérieur.' },
  { id: 'gatien', name: 'Domaine de Saint-Gatien', place: POI.gatien, rating: 4.6, price: 450, services: ['Box', 'Parcours de cross', 'Balades en forêt'], tags: ['cross', 'foret'], desc: 'Au cœur de la forêt, parcours de cross permanent.' },
  { id: 'pole', name: 'Pôle International', place: POI.pole, rating: 4.9, price: 890, services: ['Box', 'Carrière internationale', 'Coaching'], tags: ['carriere', 'coaching'], desc: 'Boxes de concours et coaching haut niveau.' },
];

export const FIRST_NAMES = ['Camille', 'Léa', 'Hugo', 'Louis', 'Chloé', 'Manon', 'Jules', 'Inès', 'Paul', 'Emma', 'Lucas', 'Zoé', 'Arthur', 'Margaux', 'Victor', 'Alice', 'Théo', 'Julie', 'Nathan', 'Clara'];
export const LAST_NAMES = ['Martin', 'Bernard', 'Duval', 'Lefèvre', 'Moreau', 'Leroy', 'Roux', 'Fournier', 'Girard', 'Lambert', 'Bonnet', 'Mercier', 'Blanc', 'Guérin', 'Faure', 'Marchand'];

// Répliques des passants (PNJ) — témoignages Strides façon GTA.
export const CHATTER = [
  'J’ai trouvé un groom en dix minutes sur Strides. Dix minutes !',
  'Mon transporteur ? Réservé sur Strides. Suivi en direct, zéro stress.',
  'Tu as vu le Grand Prix du Pôle ? Les inscriptions étaient sur l’app.',
  'Le maréchal est passé ce matin. Profil vérifié, avis au top.',
  'Je cherchais une pension avec paddock… Strides m’a sorti trois écuries en 2 secondes.',
  'Mon cheval voyage mieux que moi. Merci Strides Transport.',
  'Si tu veux des missions, active tes notifications Strides.',
  'Ici, tout le monde est sur Strides. Même le boulanger a un cheval.',
  'Belle journée pour un galop sur la plage !',
  'Paraît qu’un étalon s’échappe régulièrement au haras…',
];
