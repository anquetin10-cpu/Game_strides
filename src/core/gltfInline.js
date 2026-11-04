// Modèles glTF dont les données sont intégrées à la page (version en un seul fichier : .glb des véhicules en data:,
// copies glTF JSON des modèles réalistes dont tampons et images sont en base64, scripts/real/to-json.mjs).
// Certaines visionneuses (page claude.ai sur iPhone) refusent de lire une adresse data: ou blob: par fetch : le
// GLTFLoader échoue alors (« Failed to load buffer "data:…" ») et le jeu retombe sur ses modèles classiques. Ici ces
// données sont décodées dans le jeu, sans aucune requête : base64 → octets, images → createImageBitmap(Blob).
// Hors version en un seul fichier, rien ne change (chargement habituel du GLTFLoader).
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
const isData = (u) => typeof u === 'string' && u.startsWith('data:');
const dataMime = (u) => u.slice(5, u.search(/[;,]/));

// Image décodée sans adresse : createImageBitmap, avec les options du ImageBitmapLoader de three, lorsque le
// GLTFLoader l'utilise lui-même ; sinon (anciens Safari et Firefox) image classique, comme son TextureLoader.
function decodeImage(blob, bitmap) {
  if (bitmap) return createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  return img.decode().then(
    () => (URL.revokeObjectURL(url), img),
    (e) => {
      URL.revokeObjectURL(url);
      throw e;
    },
  );
}

// Prise en charge du WebP vérifiée sans adresse data: (le GLTFLoader utilise une <img> en data:).
const WEBP_1PX = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
let webpP = null;
function webpSupported(bitmap) {
  webpP ??= decodeImage(new Blob([dataBytes(WEBP_1PX)], { type: 'image/webp' }), bitmap).then(
    (im) => im.height === 1,
    () => false,
  );
  return webpP;
}

// Greffons du GLTFLoader : tampons data: et images (data: ou intégrées au .glb) lus sans requête.
const prepared = new WeakSet();
export function inlineData(loader) {
  if (!INLINE || prepared.has(loader)) return loader;
  prepared.add(loader);
  loader.register((parser) => {
    const loadBuffer = parser.loadBuffer;
    const loadImageSource = parser.loadImageSource;
    parser.loadBuffer = function (index) {
      const uri = this.json.buffers[index]?.uri;
      return isData(uri) ? Promise.resolve(dataBytes(uri).buffer) : loadBuffer.call(this, index);
    };
    parser.loadImageSource = function (index, imageLoader) {
      const def = this.json.images[index];
      // Autres chargeurs (KTX2…) et images externes : chemin habituel.
      if (imageLoader !== this.textureLoader || (def.bufferView === undefined && !isData(def.uri))) return loadImageSource.call(this, index, imageLoader);
      if (this.sourceCache[index] !== undefined) return this.sourceCache[index].then((t) => t.clone());
      const mime = def.mimeType || (isData(def.uri) ? dataMime(def.uri) : 'image/png');
      const bytes = def.bufferView !== undefined ? this.getDependency('bufferView', def.bufferView) : Promise.resolve(dataBytes(def.uri));
      const bitmap = this.textureLoader.isImageBitmapLoader === true;
      const promise = bytes
        .then((b) => decodeImage(new Blob([b], { type: mime }), bitmap))
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
  // Remplace le greffon WebP du GLTFLoader (même nom), dont le test de prise en charge passe par une <img> en data:.
  loader.register((parser) => ({
    name: 'EXT_texture_webp',
    loadTexture(textureIndex) {
      const json = parser.json;
      const ext = json.textures[textureIndex].extensions?.EXT_texture_webp;
      if (!ext) return null;
      return webpSupported(parser.textureLoader.isImageBitmapLoader === true).then((ok) => {
        if (ok) return parser.loadTextureImage(textureIndex, ext.source, parser.textureLoader);
        if ((json.extensionsRequired || []).includes('EXT_texture_webp')) throw new Error('THREE.GLTFLoader: WebP required by asset but unsupported.');
        return parser.loadTexture(textureIndex);
      });
    },
  }));
  return loader;
}

// Chargement d'un modèle : un .glb intégré en data: est décodé puis analysé directement, sans fetch.
export function loadGLTF(loader, url) {
  inlineData(loader);
  if (INLINE && isData(url)) return loader.parseAsync(dataBytes(url).buffer, '');
  return loader.loadAsync(url);
}
