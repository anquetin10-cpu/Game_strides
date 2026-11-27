// À passer par node --import : enregistre hooks.mjs et pose un DOM factice minimal (proxy récursif) pour que les modules
// d'interface du web s'importent sans navigateur. Seules les données et les règles pures sont lues ensuite.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
const stub = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : k === 'lang' ? 'fr' : stub()),
  apply: () => stub(), construct: () => stub(), set: () => true,
});
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = stub();
globalThis.location = { search: '', href: 'http://localhost/', origin: 'http://localhost', pathname: '/' };
globalThis.addEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.Image = class {};
