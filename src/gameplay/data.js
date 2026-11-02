// Données de jeu : chevaux, boutique, annuaire, écuries, PNJ.
import { POI } from '../world/layout.js';
import { t } from '../core/i18n.js';

// Chevaux de concours : price = location pour la saison (pratique courante pour monter un cheval de propriétaire sans
// l'acheter), value = valeur marchande estimée d'un cheval de ce niveau.
export const HORSES = {
  comete: { id: 'comete', name: 'Comète', coat: 'bay', blaze: true, socks: [false, false, true, false], speed: 1.0, jump: 1.0, stamina: 1.0, price: 0, breed: 'Selle Français', age: 9, desc: t('Jument baie, fiable et courageuse. Ta partenaire depuis toujours.') },
  ulysse: { id: 'ulysse', name: 'Ulysse', coat: 'grey', blaze: false, socks: [false, false, false, false], speed: 0.98, jump: 1.15, stamina: 1.12, price: 1800, value: 25000, breed: 'Selle Français', age: 11, desc: t('Hongre gris, très respectueux sur les barres.') },
  onyx: { id: 'onyx', name: 'Onyx', coat: 'black', blaze: false, socks: [true, false, false, false], speed: 1.13, jump: 1.06, stamina: 1.0, price: 3200, value: 45000, breed: 'KWPN', age: 8, desc: t('Étalon noir explosif. Une fusée sur le plat.') },
  saphir: { id: 'saphir', name: 'Saphir', coat: 'chestnut', blaze: true, socks: [true, true, true, true], speed: 1.1, jump: 1.24, stamina: 1.2, price: 5500, value: 150000, breed: 'Holsteiner', age: 10, desc: t('Jument alezane, gagnante en Grand Prix. La crème.') },
};

// Catalogue des commerces de Deauville City (Sellerie du Port, boutique d'équitation), le même dans les boutiques et
// dans l'application du téléphone : mêmes articles, mêmes prix, mêmes règles d'achat (voir commerce.js).
// - cat : rayon (SHOP_CATS) ; shop : commerce qui le vend ;
// - desc : effet réellement appliqué (résumé), about : description de l'article ;
// - kind 'consumable' : achats cumulables (quantité), utilisés depuis l'application Profil ; sinon article unique ;
// - slot : équipement porté (un article par emplacement, choisi avec « Équiper ») ; effect : bonus du cheval pris en
//   compte seulement s'il est équipé (ou, pour un article sans emplacement, dès l'achat) ;
// - pad/trim : couleurs du tapis de selle ; boots : couleur des guêtres ; bonnet : { color, trim } du bonnet du cheval ;
// - wear : champs de tenue du personnage (top, sleeve, collar : haut ; jacket : veste de concours ; pants : pantalon ;
//   gloves : gants ; cap : casquette ; helmet : casque ; boots : bottes) ; concours : pantalon admis en concours
//   (blanc ou clair ; sinon pantalon blanc réglementaire en concours, voir player.js) ;
// - use : soins appliqués au cheval monté par un consommable (énergie, hydratation, propreté, pieds).
// Noms de produits génériques et prix fictifs : aucun nom de collection, de modèle ni de slogan d'une marque réelle.
export const SHOP_CATS = {
  selles: t('Selles'),
  briderie: t('Briderie'),
  tapis: t('Tapis & textiles'),
  protections: t('Protections & ferrure'),
  soins: t('Pansage & soins'),
  cavalier: t('Équipement du cavalier'),
  // Boutique d'équitation.
  vestes: t('Vestes de concours & softshells'),
  hauts: t('Polos & hauts'),
  pantalons: t('Pantalons d’équitation'),
  accessoires: t('Gants & casquettes'),
  casques: t('Bottes & casques'),
  cheval: t('Équipement du cheval'),
};
export const SHOP = [
  { id: 'selle', shop: 'sellerie', cat: 'selles', slot: 'selle', name: t('Selle mixte carbone'), desc: t('Puissance de saut +12 %'), about: t('Arçon carbone, siège semi-creux, quartiers mi-longs : polyvalente, du travail sur le plat au parcours.'), price: 380, effect: { jump: 0.12 } },
  { id: 'selle_pro', shop: 'sellerie', cat: 'selles', slot: 'selle', name: t('Selle CSO Pro'), desc: t('Puissance de saut +24 % (remplace la selle mixte)'), about: t('Selle d’obstacle en cuir pleine fleur, quartiers avancés et taquets : la position du cavalier reste stable à l’abord.'), price: 900, requires: 'selle', effect: { jump: 0.24 } },
  { id: 'bridon', shop: 'sellerie', cat: 'briderie', slot: 'bridon', name: t('Bridon anatomique'), desc: t('Endurance +6 %'), about: t('Têtière rembourrée qui libère la nuque, muserolle française, rênes caoutchoutées.'), price: 165, effect: { stamina: 0.06 } },
  { id: 'tapis_marine', shop: 'sellerie', cat: 'tapis', slot: 'tapis', name: t('Tapis bleu marine'), desc: t('Cosmétique : tapis marine, liseré blanc'), about: t('Tapis de dressage-obstacle en coton matelassé, passants de sangle.'), price: 55, pad: '#1f2b45', trim: '#f2f1ec', effect: {} },
  { id: 'tapis_bordeaux', shop: 'sellerie', cat: 'tapis', slot: 'tapis', name: t('Tapis bordeaux'), desc: t('Cosmétique : tapis bordeaux, liseré or'), about: t('Coton matelassé, liseré doré, doublure respirante.'), price: 59, pad: '#5e1f2b', trim: '#c8a96e', effect: {} },
  { id: 'tapis_blanc', shop: 'sellerie', cat: 'tapis', slot: 'tapis', name: t('Tapis de concours blanc'), desc: t('Cosmétique : tapis blanc, liseré noir'), about: t('Le tapis des épreuves officielles, satin et coton.'), price: 62, pad: '#eeede8', trim: '#1b1c1f', effect: {} },
  { id: 'guetres', shop: 'sellerie', cat: 'protections', slot: 'guetres', name: t('Guêtres de protection'), desc: t('Tolérance sur les barres +8 %'), about: t('Guêtres ouvertes à coque, fermetures élastiques : protègent les tendons sans gêner le saut.'), price: 300, effect: { clearance: 0.08 } },
  { id: 'cloches', shop: 'sellerie', cat: 'protections', slot: 'cloches', name: t('Cloches en caoutchouc'), desc: t('Tolérance sur les barres +3 %'), about: t('Protègent les talons des atteintes des postérieurs.'), price: 45, effect: { clearance: 0.03 } },
  { id: 'fers', shop: 'sellerie', cat: 'protections', name: t('Fers aluminium'), desc: t('Vitesse +6 %'), about: t('Fers légers posés par la Forge Lemaire : moins de poids au bout des membres.'), price: 250, effect: { speed: 0.06 } },
  { id: 'complement', shop: 'sellerie', cat: 'soins', name: t('Complément endurance'), desc: t('Endurance +35 %'), about: t('Cure de vitamines E et sélénium, électrolytes : pour toute la saison.'), price: 220, effect: { stamina: 0.35 } },
  { id: 'shampoing', shop: 'sellerie', cat: 'soins', kind: 'consumable', name: t('Shampoing doux'), desc: t('Propreté +45 (cheval monté ou à côté de toi)'), about: t('Flacon de 500 ml au pH neutre.'), price: 12, use: { clean: 45 }, effect: {} },
  { id: 'graisse', shop: 'sellerie', cat: 'soins', kind: 'consumable', name: t('Graisse à sabots'), desc: t('Pieds +35'), about: t('Graisse au laurier : nourrit la corne et la sole.'), price: 14, use: { hooves: 35 }, effect: {} },
  { id: 'electrolytes', shop: 'sellerie', cat: 'soins', kind: 'consumable', name: t('Électrolytes'), desc: t('Hydratation +35'), about: t('Sachet à diluer dans l’eau après l’effort.'), price: 9, use: { hydration: 35 }, effect: {} },
  { id: 'friandises', shop: 'sellerie', cat: 'soins', kind: 'consumable', name: t('Friandises à la pomme'), desc: t('Énergie +8'), about: t('Biscuits à la pomme et à la carotte (sachet).'), price: 6, use: { energy: 8 }, effect: {} },
  { id: 'veste', shop: 'sellerie', cat: 'cavalier', name: t('Veste de concours'), desc: t('Cosmétique : veste bleu marine portée en concours'), about: t('Veste softshell à col blanc, coupe ajustée.'), price: 150, effect: { outfit: 'competition' } },
  { id: 'casque', shop: 'sellerie', cat: 'cavalier', slot: 'casque', name: t('Casque bleu nuit'), desc: t('Cosmétique : casque porté à cheval'), about: t('Casque ventilé aux normes VG1, visière courte.'), price: 290, wear: { helmet: '#1f2b45' }, effect: {} },
  { id: 'bottes', shop: 'sellerie', cat: 'cavalier', slot: 'bottes', name: t('Bottes en cuir noir'), desc: t('Cosmétique : bottes hautes noires'), about: t('Bottes d’équitation en cuir de veau, zip arrière.'), price: 240, wear: { boots: '#121214' }, effect: {} },
  // Boutique d'équitation (ancienne Maison Lucette : ses articles restent en rayon, mêmes identifiants pour les
  // sauvegardes). Tenues portées à pied, au volant et à cheval ; la veste de concours, le pantalon et les gants équipés
  // le sont aussi en concours (voir player.js).
  { id: 'veste_concours_marine', shop: 'boutique', cat: 'vestes', slot: 'veste', name: t('Veste de concours marine'), desc: t('Cosmétique : veste portée en concours, et partout tant qu’elle est équipée'), about: t('Tissu technique extensible et respirant, col blanc amovible, coupe cintrée.'), price: 189, wear: { jacket: '#1f2b45' }, effect: {} },
  { id: 'veste_concours_noire', shop: 'boutique', cat: 'vestes', slot: 'veste', name: t('Veste de concours noire'), desc: t('Cosmétique : veste portée en concours, et partout tant qu’elle est équipée'), about: t('Tissu technique extensible et respirant, col blanc amovible, coupe cintrée.'), price: 189, wear: { jacket: '#17181b' }, effect: {} },
  { id: 'veste_concours_bordeaux', shop: 'boutique', cat: 'vestes', slot: 'veste', name: t('Veste de concours bordeaux'), desc: t('Cosmétique : veste portée en concours, et partout tant qu’elle est équipée'), about: t('Tissu technique extensible, doublure en maille, boutons en métal sombre.'), price: 199, wear: { jacket: '#5e1f2b' }, effect: {} },
  { id: 'softshell_noire', shop: 'boutique', cat: 'vestes', slot: 'haut', name: t('Softshell noire'), desc: t('Cosmétique : haut de la tenue de tous les jours'), about: t('Veste softshell coupe-vent et déperlante, doublure polaire légère, poches zippées.'), price: 119, wear: { top: '#1b1c1f', sleeve: '#1b1c1f', collar: '#1b1c1f' }, effect: {} },
  { id: 'softshell_marine', shop: 'boutique', cat: 'vestes', slot: 'haut', name: t('Softshell marine'), desc: t('Cosmétique : haut de la tenue de tous les jours'), about: t('Veste softshell coupe-vent et déperlante, doublure polaire légère, poches zippées.'), price: 119, wear: { top: '#24324a', sleeve: '#24324a', collar: '#24324a' }, effect: {} },
  { id: 'polo_tech_blanc', shop: 'boutique', cat: 'hauts', slot: 'haut', name: t('Polo technique blanc'), desc: t('Cosmétique : haut de la tenue de tous les jours'), about: t('Maille technique respirante, col boutonné : à l’entraînement comme sous la veste de concours.'), price: 59, wear: { top: '#f4f3ef', sleeve: '#f4f3ef', collar: '#f4f3ef' }, effect: {} },
  { id: 'polo_tech_marine', shop: 'boutique', cat: 'hauts', slot: 'haut', name: t('Polo technique marine'), desc: t('Cosmétique : haut de la tenue de tous les jours'), about: t('Maille technique respirante, col blanc contrasté, manches courtes.'), price: 59, wear: { top: '#1f2b45', sleeve: '#1f2b45', collar: '#f2f1ec' }, effect: {} },
  { id: 'pantalon_beige', shop: 'boutique', cat: 'pantalons', slot: 'bas', concours: true, name: t('Pantalon d’équitation beige'), desc: t('Cosmétique : porté tous les jours et en concours'), about: t('Tissu stretch, fond de peau en silicone, taille haute : tenue en selle et liberté de mouvement.'), price: 129, wear: { pants: '#d9c7a0' }, effect: {} },
  { id: 'pantalon_blanc', shop: 'boutique', cat: 'pantalons', slot: 'bas', concours: true, name: t('Pantalon d’équitation blanc'), desc: t('Cosmétique : porté tous les jours et en concours'), about: t('Le blanc des épreuves officielles : tissu stretch épais, non transparent, fond de peau en silicone.'), price: 129, wear: { pants: '#f4f3ef' }, effect: {} },
  { id: 'pantalon_marine', shop: 'boutique', cat: 'pantalons', slot: 'bas', name: t('Pantalon d’équitation marine'), desc: t('Cosmétique : porté tous les jours (en concours : pantalon blanc réglementaire)'), about: t('Tissu stretch, fond de peau en silicone, passants larges pour la ceinture.'), price: 119, wear: { pants: '#1f2b45' }, effect: {} },
  { id: 'pantalon_noir', shop: 'boutique', cat: 'pantalons', slot: 'bas', name: t('Pantalon d’équitation noir'), desc: t('Cosmétique : porté tous les jours (en concours : pantalon blanc réglementaire)'), about: t('Tissu stretch, fond de peau en silicone, passants larges pour la ceinture.'), price: 119, wear: { pants: '#1b1c1f' }, effect: {} },
  { id: 'gants_noirs', shop: 'boutique', cat: 'accessoires', slot: 'gants', name: t('Gants d’équitation noirs'), desc: t('Cosmétique : gants portés à pied, à cheval et en concours'), about: t('Paume en synthétique adhérent, dos en maille aérée, fermeture auto-agrippante.'), price: 35, wear: { gloves: '#17181b' }, effect: {} },
  { id: 'gants_blancs', shop: 'boutique', cat: 'accessoires', slot: 'gants', name: t('Gants d’équitation blancs'), desc: t('Cosmétique : gants portés à pied, à cheval et en concours'), about: t('Les gants clairs des épreuves : paume adhérente, poignet élastique.'), price: 35, wear: { gloves: '#ecebe6' }, effect: {} },
  { id: 'casquette_blanche', shop: 'boutique', cat: 'accessoires', slot: 'tete', name: t('Casquette technique blanche'), desc: t('Cosmétique : portée à pied (le casque la remplace à cheval)'), about: t('Toile technique légère, bande anti-transpiration, réglage à l’arrière.'), price: 29, wear: { cap: '#f2f1ec' }, effect: {} },
  { id: 'casque_noir_mat', shop: 'boutique', cat: 'casques', slot: 'casque', name: t('Casque noir mat'), desc: t('Cosmétique : casque porté à cheval'), about: t('Coque ventilée, visière courte, harnais réglable, aux normes européennes.'), price: 249, wear: { helmet: '#1c1d20' }, effect: {} },
  { id: 'bottes_havane', shop: 'boutique', cat: 'casques', slot: 'bottes', name: t('Bottes en cuir havane'), desc: t('Cosmétique : bottes hautes havane'), about: t('Bottes hautes en cuir pleine fleur, zip arrière, semelle crantée.'), price: 259, wear: { boots: '#4a2c1a' }, effect: {} },
  { id: 'tapis_anthracite', shop: 'boutique', cat: 'cheval', slot: 'tapis', name: t('Tapis anthracite'), desc: t('Cosmétique : tapis anthracite, liseré écru'), about: t('Tapis de selle matelassé, doublure respirante, passants de sangle et de sanglon.'), price: 65, pad: '#3b3f45', trim: '#e9e6df', effect: {} },
  { id: 'tapis_vert', shop: 'boutique', cat: 'cheval', slot: 'tapis', name: t('Tapis vert anglais'), desc: t('Cosmétique : tapis vert anglais, liseré or'), about: t('Tapis de selle matelassé, doublure respirante, passants de sangle et de sanglon.'), price: 65, pad: '#2f4a3a', trim: '#c8a96e', effect: {} },
  { id: 'tapis_ciel', shop: 'boutique', cat: 'cheval', slot: 'tapis', name: t('Tapis bleu ciel'), desc: t('Cosmétique : tapis bleu ciel, liseré blanc'), about: t('Coton matelassé, doublure en maille 3D, liseré contrasté.'), price: 62, pad: '#7fa7c9', trim: '#f2f1ec', effect: {} },
  { id: 'bonnet_marine', shop: 'boutique', cat: 'cheval', slot: 'bonnet', name: t('Bonnet anti-mouches marine'), desc: t('Cosmétique : bonnet porté par le cheval sellé'), about: t('Coton tricoté, oreilles doublées pour atténuer les bruits, cordon de finition blanc.'), price: 45, bonnet: { color: '#1f2b45', trim: '#f2f1ec' }, effect: {} },
  { id: 'bonnet_blanc', shop: 'boutique', cat: 'cheval', slot: 'bonnet', name: t('Bonnet anti-mouches blanc'), desc: t('Cosmétique : bonnet porté par le cheval sellé'), about: t('Coton tricoté, oreilles doublées pour atténuer les bruits, cordon de finition marine.'), price: 45, bonnet: { color: '#eeede8', trim: '#1f2b45' }, effect: {} },
  { id: 'bonnet_bordeaux', shop: 'boutique', cat: 'cheval', slot: 'bonnet', name: t('Bonnet anti-mouches bordeaux'), desc: t('Cosmétique : bonnet porté par le cheval sellé'), about: t('Coton tricoté, oreilles doublées pour atténuer les bruits, cordon de finition or.'), price: 49, bonnet: { color: '#5e1f2b', trim: '#c8a96e' }, effect: {} },
  { id: 'guetres_marine', shop: 'boutique', cat: 'cheval', slot: 'guetres', name: t('Guêtres ouvertes marine'), desc: t('Tolérance sur les barres +8 % · guêtres bleu marine'), about: t('Coque rigide, doublure amortissante, fermetures élastiques : protègent les tendons à l’obstacle.'), price: 310, boots: '#1f2b45', effect: { clearance: 0.08 } },
  { id: 'guetres_blanches', shop: 'boutique', cat: 'cheval', slot: 'guetres', name: t('Guêtres ouvertes blanches'), desc: t('Tolérance sur les barres +8 % · guêtres blanches'), about: t('Coque rigide, doublure amortissante, fermetures élastiques : protègent les tendons à l’obstacle.'), price: 310, boots: '#e9e8e2', effect: { clearance: 0.08 } },
  // Articles de l'ancienne Maison Lucette, toujours en rayon (polos, pulls, casquettes).
  { id: 'polo_blanc', shop: 'boutique', cat: 'hauts', slot: 'haut', name: t('Polo piqué blanc'), desc: t('Cosmétique : haut de la tenue de tous les jours'), about: t('Coton piqué, col côtelé.'), price: 45, wear: { top: '#f2f1ec', sleeve: '#f2f1ec' }, effect: {} },
  { id: 'pull_marin', shop: 'boutique', cat: 'hauts', slot: 'haut', name: t('Pull marin'), desc: t('Cosmétique : haut de la tenue de tous les jours'), about: t('Laine bouillie bleu marine, boutonné à l’épaule.'), price: 79, wear: { top: '#1f2b45', sleeve: '#1f2b45' }, effect: {} },
  { id: 'sweat_gris', shop: 'boutique', cat: 'hauts', slot: 'haut', name: t('Sweat gris chiné'), desc: t('Cosmétique : haut de la tenue de tous les jours'), about: t('Molleton brossé, poignets côtelés.'), price: 65, wear: { top: '#8a8f96', sleeve: '#8a8f96' }, effect: {} },
  { id: 'doudoune', shop: 'boutique', cat: 'hauts', slot: 'haut', name: t('Doudoune sans manches'), desc: t('Cosmétique : doudoune bordeaux sur chemise blanche'), about: t('Garnissage léger, col montant.'), price: 129, wear: { top: '#6e2433', sleeve: '#f2f1ec', collar: '#f2f1ec' }, effect: {} },
  { id: 'veste_huilee', shop: 'boutique', cat: 'hauts', slot: 'haut', name: t('Veste huilée'), desc: t('Cosmétique : veste kaki de campagne'), about: t('Coton huilé imperméable, col velours.'), price: 159, wear: { top: '#4b4a33', sleeve: '#4b4a33', collar: '#5b4330' }, effect: {} },
  { id: 'casquette', shop: 'boutique', cat: 'accessoires', slot: 'tete', name: t('Casquette marine'), desc: t('Cosmétique : portée à pied (le casque la remplace à cheval)'), about: t('Toile de coton, visière courbe.'), price: 25, wear: { cap: '#1f2b45' }, effect: {} },
  { id: 'casquette_beige', shop: 'boutique', cat: 'accessoires', slot: 'tete', name: t('Casquette beige'), desc: t('Cosmétique : portée à pied (le casque la remplace à cheval)'), about: t('Toile de coton délavée.'), price: 25, wear: { cap: '#c8b48e' }, effect: {} },
];
// Emplacements d'équipement (nom affiché).
export const SLOTS = { selle: t('Selle'), bridon: t('Bridon'), tapis: t('Tapis'), guetres: t('Guêtres'), cloches: t('Cloches'), bonnet: t('Bonnet'), casque: t('Casque'), bottes: t('Bottes'), haut: t('Haut'), veste: t('Veste de concours'), bas: t('Pantalon'), gants: t('Gants'), tete: t('Couvre-chef') };
// Emplacements portés par le personnage (tenue) et par le cheval (équipement visible).
export const WEAR_SLOTS = ['haut', 'veste', 'bas', 'gants', 'tete', 'casque', 'bottes'];
export const HORSE_LOOK_SLOTS = ['tapis', 'guetres', 'bonnet'];
// Carte du café-boulangerie Le Galop (consommé sur place ou à emporter : pas d'inventaire).
export const CAFE_MENU = [
  { id: 'cafe', name: t('Café'), price: 1.8 },
  { id: 'creme', name: t('Café crème'), price: 3.2 },
  { id: 'croissant', name: t('Croissant au beurre'), price: 1.3 },
  { id: 'teurgoule', name: t('Part de teurgoule'), price: 3.5 },
];

// Aménagements de l'écurie (application « Mon écurie ») : achetés avec les gains, visibles au Val, persistants.
export const STABLE_UPGRADES = [
  { id: 'aire', name: t('Aire de pansage couverte'), desc: t('Préparation regroupée plus rapide (6 s → 4 s), pansage à l’abri.'), price: 350, requires: 'chapter1Done', lockedText: t('Camille la proposera après ton premier concours en équipe.') },
];

export const SKILL_LABEL = { preparation: t('Préparation'), equitation: t('Équitation'), transport: t('Transport'), organisation: t('Organisation') };

export const PROS = [
  { id: 'lemaire', name: 'Hugo Lemaire', job: t('Maréchal-ferrant'), rating: 4.9, reviews: 212, place: POI.forge, avail: t('Disponible aujourd’hui'), verified: true, initials: 'HL' },
  { id: 'clinique', name: 'Dr Inès Vasseur', job: t('Vétérinaire équin'), rating: 4.8, reviews: 168, place: POI.vet, avail: t('Urgences 24/7'), verified: true, initials: 'IV' },
  { id: 'kahn', name: 'Sarah Kahn', job: t('Ostéopathe équin'), rating: 4.9, reviews: 97, place: POI.haras, avail: t('Demain 9 h'), verified: true, initials: 'SK' },
  { id: 'morel', name: 'Paul Morel', job: t('Dentiste équin'), rating: 4.7, reviews: 64, place: POI.dunes, avail: t('Jeudi'), verified: true, initials: 'PM' },
  { id: 'sellerie', name: 'Sellerie du Port', job: t('Sellier · Équipement'), rating: 4.8, reviews: 341, place: POI.sellerie, avail: t('Ouvert · 9 h – 19 h'), verified: true, initials: 'SP' },
  { id: 'nht', name: 'Normandie Horse Transport', job: t('Transporteur agréé'), rating: 4.9, reviews: 288, place: POI.home, avail: t('Véhicule 6 places'), verified: true, initials: 'NH' },
];

export const STABLES = [
  { id: 'home', name: 'Écurie du Val', place: POI.home, rating: 4.7, price: 420, services: [t('Box + paddock'), t('Carrière'), t('Foin à volonté')], tags: ['paddock', 'carriere'], desc: t('Structure familiale, au calme, à 5 min de Deauville City.') },
  { id: 'haras', name: 'Haras de la Pommeraie', place: POI.haras, rating: 4.9, price: 690, services: [t('Box + paddock'), t('Étalons'), t('Soins vétérinaires')], tags: ['paddock', 'soins'], desc: t('Haras historique, élevage et pension haut de gamme.') },
  { id: 'dunes', name: 'Écurie des Dunes', place: POI.dunes, rating: 4.8, price: 480, services: [t('Box + paddock'), t('Accès plage'), t('Marcheur')], tags: ['paddock', 'plage'], desc: t('Pension en bord de mer, idéale pour le travail en extérieur.') },
  { id: 'gatien', name: 'Domaine de Saint-Gatien', place: POI.gatien, rating: 4.6, price: 450, services: [t('Box'), t('Parcours de cross'), t('Balades en forêt')], tags: ['cross', 'foret'], desc: t('Au cœur de la forêt, parcours de cross permanent.') },
  { id: 'pole', name: 'Pôle International', place: POI.pole, rating: 4.9, price: 890, services: [t('Box'), t('Carrière internationale'), t('Coaching')], tags: ['carriere', 'coaching'], desc: t('Boxes de concours et coaching haut niveau.') },
];

export const FIRST_NAMES = ['Camille', 'Léa', 'Hugo', 'Louis', 'Chloé', 'Manon', 'Jules', 'Inès', 'Paul', 'Emma', 'Lucas', 'Zoé', 'Arthur', 'Margaux', 'Victor', 'Alice', 'Théo', 'Julie', 'Nathan', 'Clara'];
export const LAST_NAMES = ['Martin', 'Bernard', 'Duval', 'Lefèvre', 'Moreau', 'Leroy', 'Roux', 'Fournier', 'Girard', 'Lambert', 'Bonnet', 'Mercier', 'Blanc', 'Guérin', 'Faure', 'Marchand'];

// Répliques des passants (PNJ) — témoignages Strides façon GTA.
export const CHATTER = [
  t('J’ai trouvé un groom en dix minutes sur Strides. Dix minutes !'),
  t('Mon chauffeur pour le concours ? Trouvé sur Strides, aller-retour.'),
  t('Tu as vu le Grand Prix du Pôle ? Quel parcours !'),
  t('Le maréchal est passé ce matin. Profil vérifié, avis au top.'),
  t('Ma groom était malade : j’ai trouvé un renfort sur Strides, profil vérifié.'),
  t('Mon cheval voyage mieux que moi. Merci au chauffeur !'),
  t('Si tu veux des missions, active tes notifications Strides.'),
  t('Ici, tout le monde est sur Strides. Même le boulanger a un cheval.'),
  t('Belle journée pour un galop sur la plage !'),
  t('Paraît qu’un étalon s’échappe régulièrement au haras…'),
];
