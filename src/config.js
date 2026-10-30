// Configuration globale du jeu. Modifier ici les liens marketing et le réglage gameplay.
import { t } from './core/i18n.js';

export const CONFIG = {
  brand: 'STRIDES',
  title: 'GRAND TOUR',
  // Destinations officielles de la vraie plateforme Strides (relevées sur la page de présentation
  // https://get.strides-app.com/ le 26 octobre 2026 ; aucun lien profond inventé) :
  // - landingUrl : présentation des deux parcours (prestataire / client) ;
  // - siteUrl : l'application web (création de compte, recherche d'un professionnel) ;
  // - downloadUrl / playUrl : fiches App Store et Google Play. Laisser downloadUrl vide masque le badge.
  landingUrl: 'https://get.strides-app.com/',
  siteUrl: 'https://strides-app.com',
  downloadUrl: 'https://apps.apple.com/fr/app/strides/id6793963102',
  playUrl: 'https://play.google.com/store/apps/details?id=com.stridesapp',
  saveKey: 'strides-grand-tour-v1',
  // Durée d'une journée de jeu en secondes réelles.
  dayLength: 1200,
  startHour: 9,
};

// Paliers de réputation (commune à tous les métiers ; remplace l'ancienne hiérarchie de statuts).
// Les seuils gardent l'économie actuelle ; `level` des missions = index du palier + 1.
export const REPUTATION = [
  { xp: 0, title: t('Premiers contrats'), short: t('DÉBUT') },
  { xp: 300, title: t('Professionnel apprécié'), short: t('APPRÉCIÉ') },
  { xp: 900, title: t('Référence locale'), short: t('RÉFÉRENCE') },
  { xp: 1800, title: t('Équipe reconnue'), short: t('RECONNU') },
  { xp: 3200, title: t('Réputation internationale'), short: t('INTERNATIONAL') },
];
export const LEVELS = REPUTATION; // alias de compatibilité

// Mesure des résultats : aucun envoi externe tant que `endpoint` est vide (adaptateur local uniquement).
export const METRICS = { endpoint: '', enabled: true };
export const BUILD = '2.0.0';

// Réglages du cheval (valeurs de base, multipliées par les stats du cheval et les équipements).
export const HORSE = {
  gaits: [
    { name: 'ARRÊT', short: 'N', speed: 0 },
    { name: 'PAS', short: '1', speed: 1.9 },
    { name: 'TROT', short: '2', speed: 4.6 },
    // Galop de travail d'un parcours de CSO : 390 m/min (les parcours se courent à 350 – 400 m/min).
    // Le joystick du cavalier règle la cadence : du galop de travail (23 km/h) au galop allongé (max : 35 km/h).
    { name: 'GALOP', short: '3', speed: 6.5, max: 9.72 },
    // Galop allongé d'un cheval de sport : ~50 km/h.
    { name: 'GRAND GALOP', short: '4', speed: 14 },
  ],
  jumpPeak: 1.35,
  jumpDuration: 0.8,
  minJumpSpeed: 3.2,
  stamina: 100,
  gallopDrain: 7,
  staminaRegen: 9,
};
