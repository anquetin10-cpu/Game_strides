// Données de jeu : chevaux, boutique, annuaire, écuries, PNJ.
import { POI } from '../world/layout.js';

export const HORSES = {
  comete: { id: 'comete', name: 'Comète', coat: 'bay', blaze: true, socks: [false, false, true, false], speed: 1.0, jump: 1.0, stamina: 1.0, price: 0, breed: 'Selle Français', age: 9, desc: 'Jument baie, fiable et courageuse. Ta partenaire depuis toujours.' },
  ulysse: { id: 'ulysse', name: 'Ulysse', coat: 'grey', blaze: false, socks: [false, false, false, false], speed: 0.98, jump: 1.15, stamina: 1.12, price: 1800, breed: 'Selle Français', age: 11, desc: 'Hongre gris, très respectueux sur les barres.' },
  onyx: { id: 'onyx', name: 'Onyx', coat: 'black', blaze: false, socks: [true, false, false, false], speed: 1.13, jump: 1.06, stamina: 1.0, price: 3200, breed: 'KWPN', age: 8, desc: 'Étalon noir explosif. Une fusée sur le plat.' },
  saphir: { id: 'saphir', name: 'Saphir', coat: 'chestnut', blaze: true, socks: [true, true, true, true], speed: 1.1, jump: 1.24, stamina: 1.2, price: 5500, breed: 'Holsteiner', age: 10, desc: 'Jument alezane, gagnante en Grand Prix. La crème.' },
};

export const SHOP = [
  { id: 'fers', name: 'Fers aluminium', desc: 'Vitesse +6 %', price: 250, effect: { speed: 0.06 } },
  { id: 'complement', name: 'Complément endurance', desc: 'Endurance +35 %', price: 220, effect: { stamina: 0.35 } },
  { id: 'selle', name: 'Selle mixte carbone', desc: 'Puissance de saut +12 %', price: 380, effect: { jump: 0.12 } },
  { id: 'guetres', name: 'Guêtres de protection', desc: 'Tolérance sur les barres', price: 300, effect: { clearance: 0.08 } },
  { id: 'selle_pro', name: 'Selle CSO Pro', desc: 'Puissance de saut +12 %', price: 900, requires: 'selle', effect: { jump: 0.12 } },
  { id: 'veste', name: 'Veste de concours', desc: 'Style de champion (cosmétique)', price: 150, effect: { outfit: 'competition' } },
];

export const PROS = [
  { id: 'lemaire', name: 'Hugo Lemaire', job: 'Maréchal-ferrant', rating: 4.9, reviews: 212, place: POI.forge, avail: 'Disponible aujourd’hui', verified: true, initials: 'HL' },
  { id: 'clinique', name: 'Dr Inès Vasseur', job: 'Vétérinaire équin', rating: 4.8, reviews: 168, place: POI.vet, avail: 'Urgences 24/7', verified: true, initials: 'IV' },
  { id: 'kahn', name: 'Sarah Kahn', job: 'Ostéopathe équin', rating: 4.9, reviews: 97, place: POI.haras, avail: 'Demain 9 h', verified: true, initials: 'SK' },
  { id: 'morel', name: 'Paul Morel', job: 'Dentiste équin', rating: 4.7, reviews: 64, place: POI.dunes, avail: 'Jeudi', verified: true, initials: 'PM' },
  { id: 'sellerie', name: 'Sellerie du Port', job: 'Sellier · Équipement', rating: 4.8, reviews: 341, place: POI.sellerie, avail: 'Ouvert · 9 h – 19 h', verified: true, initials: 'SP' },
  { id: 'nht', name: 'Normandie Horse Transport', job: 'Transporteur agréé', rating: 4.9, reviews: 288, place: POI.home, avail: 'Véhicule 6 places', verified: true, initials: 'NH' },
];

export const STABLES = [
  { id: 'home', name: 'Écurie du Val', place: POI.home, rating: 4.7, price: 420, services: ['Box + paddock', 'Carrière', 'Foin à volonté'], tags: ['paddock', 'carriere'], desc: 'Structure familiale, au calme, à 5 min de Deauvelle.' },
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
