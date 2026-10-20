// Configuration globale du jeu. Modifier ici les liens marketing et le réglage gameplay.
export const CONFIG = {
  brand: 'STRIDES',
  title: 'GRAND TOUR',
  // Lien vers la vraie application Strides (App Store / site). Laisser vide pour afficher
  // un message « bientôt disponible » à la place du lien.
  downloadUrl: '',
  saveKey: 'strides-grand-tour-v1',
  // Durée d'une journée de jeu en secondes réelles.
  dayLength: 1200,
  startHour: 9,
};

// Statuts de progression (niveau de réputation Strides).
export const LEVELS = [
  { xp: 0, title: 'Groom', short: 'GROOM' },
  { xp: 300, title: 'Cavalier', short: 'CAVALIER' },
  { xp: 900, title: 'Pro vérifié', short: 'PRO' },
  { xp: 1800, title: 'International', short: 'INTER' },
  { xp: 3200, title: 'Légende 5★', short: 'LÉGENDE' },
];

// Réglages du cheval (valeurs de base, multipliées par les stats du cheval et les équipements).
export const HORSE = {
  gaits: [
    { name: 'ARRÊT', short: 'N', speed: 0 },
    { name: 'PAS', short: '1', speed: 1.9 },
    { name: 'TROT', short: '2', speed: 4.6 },
    { name: 'GALOP', short: '3', speed: 9.5 },
    { name: 'GRAND GALOP', short: '4', speed: 16 },
  ],
  jumpPeak: 1.35,
  jumpDuration: 0.8,
  minJumpSpeed: 3.2,
  stamina: 100,
  gallopDrain: 7,
  staminaRegen: 9,
};
