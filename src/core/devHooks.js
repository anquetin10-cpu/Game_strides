// Accès de test (window.__game, ?autostart, ?debug, ?real, ?classic, ?truck, ?defender, ?metrics) : présents en
// développement (vite) et dans le build de test (vite build --mode e2e → dist-e2e), absents de la version publiée.
// Restent pour les joueurs : ?secours (mode secours) et ?lang.
export const HOOKS = !!(import.meta.env.DEV || import.meta.env.MODE === 'e2e');
