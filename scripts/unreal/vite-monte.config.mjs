// Serveur Vite d'une copie de travail dont node_modules est un lien vers un autre dépôt (essai de monte, voie A).
// Configuration du dépôt (vite.config.js), avec le cache de Vite dans .tmp/monte/vite-cache au lieu de
// node_modules/.vite : le hachage de pré-optimisation dépend de la racine, et un second serveur sur le même
// node_modules/.vite réécrirait le dossier deps du serveur de l'autre dépôt.
// Usage, depuis la racine de la copie : npx vite --config scripts/unreal/vite-monte.config.mjs --host 127.0.0.1 --port 5176 --strictPort
import { defineConfig, mergeConfig } from 'vite';
import base from '../../vite.config.js';

export default defineConfig((env) => mergeConfig(base(env), { cacheDir: '.tmp/monte/vite-cache' }));
