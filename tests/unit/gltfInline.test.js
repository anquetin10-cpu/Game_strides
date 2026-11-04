// Modèles intégrés à la page (version en un seul fichier) : tampons et images base64 décodés sans aucune requête
// (la visionneuse claude.ai sur iPhone refuse fetch sur une adresse data:).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const b64 = (u8) => Buffer.from(u8).toString('base64');
const positions = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);

// glTF minimal : un triangle texturé (texture PNG, et WebP par EXT_texture_webp si demandé).
function triangle({ image, webp } = {}) {
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    buffers: [{ byteLength: 36 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }],
    images: [image],
  };
  if (webp) {
    json.images.push(webp);
    json.textures[0].extensions = { EXT_texture_webp: { source: 1 } };
    json.extensionsUsed = json.extensionsRequired = ['EXT_texture_webp'];
  }
  return json;
}
// Conteneur .glb : JSON + un tampon binaire (géométrie puis image PNG).
function glb() {
  const png = Buffer.from(PNG_1PX, 'base64');
  const json = triangle({ image: { bufferView: 1, mimeType: 'image/png' } });
  json.bufferViews.push({ buffer: 0, byteOffset: 36, byteLength: png.length });
  const bin = Buffer.concat([Buffer.from(positions), png, Buffer.alloc((4 - ((36 + png.length) % 4)) % 4)]);
  json.buffers[0].byteLength = bin.length;
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12);
  head.write('glTF', 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const chunk = (data, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.write(type, 4);
    return Buffer.concat([h, data]);
  };
  return Buffer.concat([head, chunk(js, 'JSON'), chunk(bin, 'BIN\0')]);
}

// Module chargé dans le mode demandé (« single » : version en un seul fichier).
async function load(mode) {
  vi.stubEnv('MODE', mode);
  vi.resetModules();
  return import('../../src/core/gltfInline.js');
}
// Navigateur simulé : fetch interdit (comme sur la page iPhone), createImageBitmap décode en 1 × 1.
function browser() {
  const fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch (adresse refusée)')));
  const bitmap = vi.fn(async (blob) => ({ width: 1, height: 1, type: blob.type, size: blob.size, close() {} }));
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('createImageBitmap', bitmap);
  vi.stubGlobal('self', globalThis); // chemin d'origine du GLTFLoader (self.URL)
  return { fetch, bitmap };
}
const mapOf = (gltf) => {
  let map = null;
  gltf.scene.traverse((o) => o.material?.map && (map = o.material.map));
  return map;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Modèles glTF intégrés (version en un seul fichier)', () => {
  it('décode le base64 (avec et sans Uint8Array.fromBase64)', async () => {
    const { dataBytes } = await load('single');
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128]);
    expect([...dataBytes(`data:application/octet-stream;base64,${b64(bytes)}`)]).toEqual([...bytes]);
    const had = Object.getOwnPropertyDescriptor(Uint8Array, 'fromBase64');
    Uint8Array.fromBase64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
    try {
      expect([...dataBytes(`data:;base64,${b64(bytes)}`)]).toEqual([...bytes]);
    } finally {
      if (had) Object.defineProperty(Uint8Array, 'fromBase64', had);
      else delete Uint8Array.fromBase64;
    }
  });

  it('glTF JSON : tampon et image data: lus sans fetch', async () => {
    const { inlineData } = await load('single');
    const { fetch, bitmap } = browser();
    const json = triangle({ image: { uri: `data:image/png;base64,${PNG_1PX}` } });
    json.buffers[0].uri = `data:application/octet-stream;base64,${b64(positions)}`;
    const gltf = await inlineData(new GLTFLoader()).parseAsync(JSON.stringify(json), '');
    let pos = null;
    gltf.scene.traverse((o) => o.geometry && (pos = o.geometry.attributes.position));
    expect(pos.count).toBe(3);
    expect(pos.getX(1)).toBe(1);
    expect(mapOf(gltf).image.width).toBe(1);
    expect(mapOf(gltf).userData.mimeType).toBe('image/png');
    expect(bitmap.mock.calls[0][0].type).toBe('image/png');
    expect(bitmap.mock.calls[0][1]).toEqual({ premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('.glb en data: : analysé directement, image intégrée décodée sans adresse blob:', async () => {
    const { loadGLTF } = await load('single');
    const { fetch, bitmap } = browser();
    const gltf = await loadGLTF(new GLTFLoader(), `data:model/gltf-binary;base64,${glb().toString('base64')}`);
    expect(mapOf(gltf).image.width).toBe(1);
    expect(bitmap).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('WebP : prise en charge testée sans <img> en data:, texture WebP chargée', async () => {
    const { inlineData } = await load('single');
    const { fetch, bitmap } = browser();
    const json = triangle({ image: { uri: `data:image/png;base64,${PNG_1PX}` }, webp: { uri: `data:image/webp;base64,${PNG_1PX}` } });
    json.buffers[0].uri = `data:application/octet-stream;base64,${b64(positions)}`;
    const gltf = await inlineData(new GLTFLoader()).parseAsync(JSON.stringify(json), '');
    expect(mapOf(gltf).userData.mimeType).toBe('image/webp');
    expect(bitmap.mock.calls.map((c) => c[0].type)).toEqual(['image/webp', 'image/webp']); // test 1 px, puis la texture
    expect(fetch).not.toHaveBeenCalled();
  });

  it('image data: non base64 : texture absente, modèle chargé (comme le GLTFLoader)', async () => {
    const { inlineData } = await load('single');
    const { bitmap } = browser();
    const json = triangle({ image: { uri: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22/%3E' } });
    json.buffers[0].uri = `data:application/octet-stream;base64,${b64(positions)}`;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const gltf = await inlineData(new GLTFLoader()).parseAsync(JSON.stringify(json), '');
    err.mockRestore();
    let mesh = null;
    gltf.scene.traverse((o) => o.isMesh && (mesh = o));
    expect(mesh.geometry.attributes.position.count).toBe(3);
    expect(mesh.material.map).toBeNull();
    expect(bitmap).not.toHaveBeenCalled();
  });

  it('une image pour deux échantillonneurs : décodée une fois, deux textures', async () => {
    const { inlineData } = await load('single');
    const { bitmap } = browser();
    const json = triangle({ image: { uri: `data:image/png;base64,${PNG_1PX}` } });
    json.buffers[0].uri = `data:application/octet-stream;base64,${b64(positions)}`;
    json.samplers = [{ wrapS: 33071 }, { wrapS: 10497 }];
    json.textures = [{ source: 0, sampler: 0 }, { source: 0, sampler: 1 }];
    json.materials[0].emissiveTexture = { index: 1 };
    const gltf = await inlineData(new GLTFLoader()).parseAsync(JSON.stringify(json), '');
    let m = null;
    gltf.scene.traverse((o) => o.isMesh && (m = o.material));
    expect(bitmap).toHaveBeenCalledTimes(1);
    expect(m.map).not.toBe(m.emissiveMap);
    expect([m.map.wrapS, m.emissiveMap.wrapS]).toEqual([1001, 1000]); // ClampToEdgeWrapping, RepeatWrapping
  });

  it('navigateur sans createImageBitmap (TextureLoader : <img>, aucun fetch) : images par le chemin du GLTFLoader', async () => {
    const { inlineData, loadGLTF } = await load('single');
    const fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch (adresse refusée)')));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('createImageBitmap', undefined);
    vi.stubGlobal('self', globalThis);
    const srcs = [];
    class Img {
      constructor() {
        this.on = {};
        this.width = this.height = 0;
      }
      addEventListener(t, f) {
        this.on[t] = f;
      }
      removeEventListener() {}
      set src(v) {
        this._src = v;
        srcs.push(v.slice(0, 15));
        setTimeout(() => {
          this.width = this.height = 1;
          (this.onload || this.on.load)?.call(this);
        }, 0);
      }
      get src() {
        return this._src;
      }
    }
    vi.stubGlobal('Image', Img);
    vi.stubGlobal('document', { createElementNS: () => new Img() });
    const json = triangle({ image: { uri: `data:image/png;base64,${PNG_1PX}` }, webp: { uri: `data:image/webp;base64,${PNG_1PX}` } });
    json.buffers[0].uri = `data:application/octet-stream;base64,${b64(positions)}`;
    const gltf = await inlineData(new GLTFLoader()).parseAsync(JSON.stringify(json), '');
    expect(mapOf(gltf).image).toBeInstanceOf(Img);
    expect(mapOf(gltf).userData.mimeType).toBe('image/webp');
    expect(srcs).toEqual(['data:image/webp', 'data:image/webp']); // test WebP du GLTFLoader, puis la texture
    const glbGltf = await loadGLTF(new GLTFLoader(), `data:model/gltf-binary;base64,${glb().toString('base64')}`);
    expect(mapOf(glbGltf).image.src.startsWith('blob:')).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('hors version en un seul fichier : chargeur inchangé, chargement habituel', async () => {
    const { inlineData, loadGLTF, INLINE } = await load('production');
    const l = new GLTFLoader();
    const n = l.pluginCallbacks.length;
    expect(INLINE).toBe(false);
    expect(inlineData(l)).toBe(l);
    expect(l.pluginCallbacks.length).toBe(n);
    const loadAsync = vi.spyOn(l, 'loadAsync').mockResolvedValue('ok');
    const url = `data:model/gltf-binary;base64,${glb().toString('base64')}`;
    expect(await loadGLTF(l, url)).toBe('ok');
    expect(loadAsync).toHaveBeenCalledWith(url);
  });
});
