// Essai de la bibliothèque : vue aérienne de la plage vers Deauville City (aperçu).
import { open } from '../lib.mjs';
const s = await open({ hour: 18.3 });
await s.ev(() => { window.__cine.lockHour = 18.3; });
await s.shoot('_essai', 48, (i, n) => {
  const C = window.__cine, t = C.ease(i / (n - 1));
  C.advance();
  C.cam(C.mix3([140, 60, -560], [60, 34, -440], t), [20, 6, -266], 48);
});
await s.close();
