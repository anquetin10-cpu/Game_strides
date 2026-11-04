// Modèles glTF dont les données sont intégrées à la page (version en un seul fichier : .glb des véhicules en data:,
// copies glTF JSON des modèles réalistes dont tampons et images sont en base64, scripts/real/to-json.mjs).
// Certaines visionneuses (page claude.ai sur iPhone) refusent de lire une adresse data: ou blob: par fetch : le
// GLTFLoader échoue alors (« Failed to load buffer "data:…" ») et le jeu retombe sur ses modèles classiques. Ici ces
// données sont décodées dans le jeu, sans aucune requête : base64 → octets, images → createImageBitmap(Blob).
// Lorsque le GLTFLoader charge ses images par une <img> (anciens Safari, Chrome et Firefox sur iPhone : aucun fetch),
// son chemin habituel est gardé pour les images. Hors version en un seul fichier, rien ne change.
import * as THREE from 'three';

export const INLINE = import.meta.env?.MODE === 'single';

// Octets d'une adresse data:…;base64,…
export function dataBytes(uri) {
  const s = uri.slice(uri.indexOf(',') + 1);
  if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(s);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
// Seules les adresses data: en base64 sont décodées ici ; les autres suivent le chemin du GLTFLoader.
const isB64 = (u) => typeof u === 'string' && /^data:[^,]*;base64,/i.test(u);
// Décodage différé : une donnée invalide rejette la promesse (texture absente, comme dans le GLTFLoader) au lieu
// d'interrompre tout le chargement.
const bytesOf = (uri) => Promise.resolve().then(() => dataBytes(uri));
// Options du ImageBitmapLoader de three.
const BITMAP = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' };

// Prise en charge du WebP. Avec createImageBitmap : décodage d'une image de 1 px, sans adresse. Sinon : test du
// GLTFLoader (une <img> en data:, sans fetch).
const WEBP_1PX = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
const webpP = {};
function webpSupported(bitmap) {
  webpP[bitmap] ??= bitmap
    ? bytesOf(WEBP_1PX)
        .then((b) => createImageBitmap(new Blob([b], { type: 'image/webp' }), BITMAP))
        .then((im) => im.height === 1, () => false)
    : new Promise((resolve) => {
        const image = new Image();
        image.src = WEBP_1PX;
        image.onload = image.onerror = () => resolve(image.height === 1);
      });
  return webpP[bitmap];
}

// Greffons du GLTFLoader : tampons base64 lus sans requête ; images (base64 ou intégrées au .glb) décodées par
// createImageBitmap(Blob) lorsque le GLTFLoader passerait par fetch (ImageBitmapLoader).
const prepared = new WeakSet();
export function inlineData(loader) {
  if (!INLINE || prepared.has(loader)) return loader;
  prepared.add(loader);
  loader.register((parser) => {
    const loadBuffer = parser.loadBuffer;
    const loadImageSource = parser.loadImageSource;
    parser.loadBuffer = function (index) {
      const uri = this.json.buffers[index]?.uri;
      return isB64(uri) ? bytesOf(uri).then((b) => b.buffer) : loadBuffer.call(this, index);
    };
    parser.loadImageSource = function (index, imageLoader) {
      const def = this.json.images[index];
      // Chemin habituel : autres chargeurs (KTX2…), chargement par <img> (TextureLoader), images externes.
      const own = imageLoader === this.textureLoader && imageLoader.isImageBitmapLoader === true && (def.bufferView !== undefined || isB64(def.uri));
      if (!own) return loadImageSource.call(this, index, imageLoader);
      if (this.sourceCache[index] !== undefined) return this.sourceCache[index].then((t) => t.clone());
      const mime = def.mimeType || (def.bufferView === undefined ? def.uri.slice(5, def.uri.search(/[;,]/)) : 'image/png');
      const bytes = def.bufferView !== undefined ? this.getDependency('bufferView', def.bufferView) : bytesOf(def.uri);
      const promise = bytes
        .then((b) => createImageBitmap(new Blob([b], { type: mime }), BITMAP))
        .then((image) => {
          const texture = new THREE.Texture(image);
          texture.needsUpdate = true;
          if (def.extras && typeof def.extras === 'object') Object.assign(texture.userData, def.extras);
          texture.userData.mimeType = mime;
          return texture;
        })
        .catch((e) => {
          console.error(`THREE.GLTFLoader: Couldn't load texture ${index} (${mime})`, e);
          throw e;
        });
      this.sourceCache[index] = promise;
      return promise;
    };
    return { name: 'strides_inline_data' };
  });
  // Remplace le greffon WebP du GLTFLoader (même nom) : même logique, test de prise en charge sans fetch.
  loader.register((parser) => ({
    name: 'EXT_texture_webp',
    loadTexture(textureIndex) {
      const json = parser.json;
      const ext = json.textures[textureIndex].extensions?.EXT_texture_webp;
      if (!ext) return null;
      const source = json.images[ext.source];
      const handler = source.uri ? parser.options.manager.getHandler(source.uri) : null;
      const imageLoader = handler || parser.textureLoader;
      return webpSupported(parser.textureLoader.isImageBitmapLoader === true).then((ok) => {
        if (ok) return parser.loadTextureImage(textureIndex, ext.source, imageLoader);
        if ((json.extensionsRequired || []).includes('EXT_texture_webp')) throw new Error('THREE.GLTFLoader: WebP required by asset but unsupported.');
        return parser.loadTexture(textureIndex);
      });
    },
  }));
  return loader;
}

// Chargement d'un modèle : un .glb intégré en data: (base64) est décodé puis analysé directement, sans fetch.
export function loadGLTF(loader, url) {
  inlineData(loader);
  if (INLINE && isB64(url)) return bytesOf(url).then((b) => loader.parseAsync(b.buffer, ''));
  return loader.loadAsync(url);
}
