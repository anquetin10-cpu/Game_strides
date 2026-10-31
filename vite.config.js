import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { execSync } from 'node:child_process';

// Identifiant de la version construite (commit, modifications locales éventuelles, date) : affiché dans le menu pause.
const git = (c) => {
  try {
    return execSync(`git ${c}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};
const BUILD_ID = `${git('rev-parse --short HEAD') || 'local'}${git('status --porcelain --untracked-files=no') ? '+modifs' : ''} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: mode === 'single' ? 100000000 : 4096,
  },
  server: { host: true },
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
}));
