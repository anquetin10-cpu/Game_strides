// Vérification : pièces portant des marques dans les modèles chargés par le jeu (camion, Defender).
import { open } from '../lib.mjs';
const s = await open({ hour: 15, characters: null });
console.log(await s.ev(() => {
  const out = [];
  window.__game.scene.traverse((o) => { if (/Scania_lettering|STX_capucine|DEFENDER_|Badge_110/.test(o.name)) out.push(`${o.name}${o.isMesh ? '' : ' (groupe)'}`); });
  return out;
}));
await s.close();
