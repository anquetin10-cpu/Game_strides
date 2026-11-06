// Repris de Jumping League Sim (dépôt anquetin10-cpu/PGL_Game-, branche claude/pjl-jumping-game, commit afa56f9c,
// fichier src/render/horse/coat.ts), converti de TypeScript en JavaScript (types retirés, logique inchangée sauf
// mention « Equestrian Tour »). Modèle de cheval : « Realistic Animated Horse » par WildMesh 3D, CC BY 4.0
// (voir public/real/LICENSES.md).
import * as THREE from 'three';
/** Coat colour palette (sRGB hex) — body, points (lower legs), mane/tail. */
const PALETTE = {
    bay: { body: '#7c3d1c', points: '#151110', pointsAmt: 1, hair: '#141110', detail: 1.15 },
    darkbay: { body: '#4b2615', points: '#110d0c', pointsAmt: 1, hair: '#0f0c0b', detail: 1.1 },
    brown: { body: '#3b2318', points: '#110d0c', pointsAmt: 1, hair: '#100d0c', detail: 1.05 },
    chestnut: { body: '#9c4d1f', points: '#8a4019', pointsAmt: 0.35, hair: '#8f4a1c', detail: 1.15 },
    liverchestnut: { body: '#5a2b16', points: '#4a2412', pointsAmt: 0.3, hair: '#3f1f10', detail: 1.1 },
    grey: { body: '#cfcbc4', points: '#8d8a86', pointsAmt: 0.45, hair: '#dedad3', detail: 1.0 },
    dapplegrey: { body: '#b3b0ab', points: '#5d5b58', pointsAmt: 0.65, hair: '#c9c5bd', detail: 1.0 },
    black: { body: '#1b1715', points: '#121010', pointsAmt: 1, hair: '#0d0b0b', detail: 1.2 },
    palomino: { body: '#caa063', points: '#b98d52', pointsAmt: 0.3, hair: '#efe6cf', detail: 1.1 },
};
const BLAZE = {
    // [enabled, along start, along end, half-width (0..1 of 12 cm)]
    none: [0, 0, 0, 0],
    star: [1, 0.12, 0.3, 0.32],
    stripe: [1, 0.2, 0.85, 0.16],
    blaze: [1, 0.12, 1.05, 0.34],
    bald: [1, 0.05, 1.1, 0.75],
};
export function coatColours(c) {
    return PALETTE[c] ?? PALETTE.bay;
}
/** Body material: the original grey coat texture is used as a detail map and recoloured per horse. */
export function makeCoatMaterial(base, coat) {
    const m = base.clone();
    const pal = coatColours(coat.colour);
    const uniforms = {
        uCoat: { value: new THREE.Color(pal.body) },
        uPoints: { value: new THREE.Color(pal.points) },
        uPointsAmt: { value: pal.pointsAmt },
        uDetail: { value: pal.detail },
        uSocks: { value: new THREE.Vector4(...(coat.socks ?? [0, 0, 0, 0])) },
        uBlaze: { value: new THREE.Vector4(...BLAZE[coat.blaze ?? 'none']) },
        uDapples: { value: coat.dapples ?? (coat.colour === 'dapplegrey' ? 1 : 0) },
        uWet: { value: 0 },
    };
    m.userData.coatUniforms = uniforms;
    m.roughness = coat.colour === 'grey' || coat.colour === 'dapplegrey' ? 0.6 : 0.48;
    m.metalness = 0;
    m.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nattribute vec4 coatMask;\nattribute float coatRegion;\nvarying vec4 vCoatMask;\nflat varying float vRegion;\nvarying vec3 vBindPos;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoatMask = coatMask;\nvRegion = coatRegion;\nvBindPos = position;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
uniform vec3 uCoat; uniform vec3 uPoints; uniform float uPointsAmt; uniform float uDetail;
uniform vec4 uSocks; uniform vec4 uBlaze; uniform float uDapples; uniform float uWet;
varying vec4 vCoatMask; flat varying float vRegion; varying vec3 vBindPos;
float hash3(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
 return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z); }`)
            .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec4 texel = texture2D( map, vMapUv );
  float L = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
  // hooves: bottom of each leg (geometric mask), keep the original dark horn colour
  float isLeg = (vRegion > 0.5 && vRegion < 4.5) ? 1.0 : 0.0;
  float hoof = isLeg * (1.0 - smoothstep(0.035, 0.075, vCoatMask.y));
  float detail = clamp(pow(L / 0.72, uDetail), 0.35, 1.35);
  vec3 col = uCoat;
  // dapples (grey coats)
  if (uDapples > 0.0) {
    float n = vnoise(vBindPos * 0.09) * 0.6 + vnoise(vBindPos * 0.21) * 0.4;
    float d = smoothstep(0.52, 0.62, n);
    col = mix(col * 0.82, col * 1.12, d * uDapples);
  }
  // black points on the lower legs
  float pts = vCoatMask.x * uPointsAmt;
  col = mix(col, uPoints, smoothstep(0.25, 0.85, pts));
  // white socks: per-leg height threshold
  float sock = 0.0;
  if (isLeg > 0.5) {
    float h = vRegion < 1.5 ? uSocks.x : vRegion < 2.5 ? uSocks.y : vRegion < 3.5 ? uSocks.z : uSocks.w;
    float edge = 0.04 + 0.03 * vnoise(vBindPos * 0.7);
    sock = (h > 0.0) ? 1.0 - smoothstep(h - edge, h + edge, vCoatMask.y) : 0.0;
  }
  // blaze / star on the face
  float blaze = 0.0;
  if (uBlaze.x > 0.5 && vRegion > 4.5) {
    float along = vCoatMask.y;
    float halfW = uBlaze.w * (0.85 + 0.3 * vnoise(vBindPos * 0.5));
    float inLen = smoothstep(uBlaze.y - 0.03, uBlaze.y + 0.03, along) * (1.0 - smoothstep(uBlaze.z - 0.03, uBlaze.z + 0.03, along));
    blaze = inLen * (1.0 - smoothstep(halfW - 0.08, halfW + 0.04, vCoatMask.w)) * smoothstep(0.15, 0.4, vCoatMask.z);
  }
  vec3 white = vec3(0.93, 0.92, 0.9);
  col = mix(col, white, max(sock, blaze));
  vec3 recol = col * detail;
  vec3 horn = vec3(0.09, 0.08, 0.075) * (0.7 + 0.6 * L);
  diffuseColor.rgb = mix(recol, horn, hoof);
#endif`)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.32, uWet);`)
            // satin sheen of a groomed coat: a soft, coat-tinted glow at grazing angles (fibres catching light)
            .replace('#include <opaque_fragment>', `{
    float fres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition) * -1.0)), 3.5);
    outgoingLight += (diffuseColor.rgb * 0.6 + vec3(0.12)) * fres * 0.22;
  }
  #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'horse-coat-v3';
    return m;
}
/** Mane & tail: hair cards recoloured from the light hair texture. */
export function makeHairMaterial(base, coat) {
    const m = base.clone();
    const pal = coatColours(coat.colour);
    const uHair = { value: new THREE.Color(pal.hair) };
    m.userData.hairUniform = uHair;
    m.alphaTest = 0.35;
    m.transparent = false;
    m.side = THREE.DoubleSide;
    m.roughness = 0.62;
    m.onBeforeCompile = (shader) => {
        shader.uniforms.uHair = uHair;
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 uHair;')
            .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec4 texel = texture2D( map, vMapUv );
  float L = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = uHair * clamp(L / 0.7, 0.45, 1.4);
  diffuseColor.a *= texel.a;
#endif`);
    };
    m.customProgramCacheKey = () => 'horse-hair-v1';
    return m;
}
