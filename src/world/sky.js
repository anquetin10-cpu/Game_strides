// Ciel physique (diffusion de Rayleigh et de Mie, modèle de Preetham), nuages procéduraux, étoiles et lune,
// lumière du soleil calculée à partir de l'atmosphère, éclairage d'ambiance (IBL) et brouillard atmosphérique.
import * as THREE from 'three';
import { sunDirection } from './sun.js';
import { clamp, lerp, smoothstep } from '../core/math.js';
import { coverAt, rainTarget, wind } from './weather.js';

// ---------- Brouillard appliqué en linéaire (avant le tone mapping) ----------
// Par défaut, three.js mélange le brouillard après le tone mapping : la couleur ne correspond alors jamais à celle
// de l'horizon. On l'applique ici sur la radiance HDR, comme une vraie perspective atmosphérique.
const FOG_LINEAR = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float stFog = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float stFog = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, stFog );
#endif
`;
if (!THREE.ShaderChunk.tonemapping_fragment.includes('stFog')) {
  THREE.ShaderChunk.tonemapping_fragment = FOG_LINEAR + THREE.ShaderChunk.tonemapping_fragment;
  THREE.ShaderChunk.fog_fragment = '';
}

// ---------- Ombres des nuages au sol ----------
// Uniformes partagés par référence (mis à jour par le ciel) et injection dans un shader de matériau standard :
// la lumière directe du soleil est atténuée là où un nuage s'interpose (même champ de bruit que le ciel).
export const CLOUD_UNIFORMS = {
  csWind: { value: new THREE.Vector2() },
  csCover: { value: 0.42 },
  csSun: { value: new THREE.Vector3(0, 1, 0) },
  csWet: { value: 0 },
  // Lampadaire le plus proche du joueur : lanterne (xyz) et intensité (w, nulle le jour), voir World.update.
  lpPos: { value: new THREE.Vector4(0, -1e3, 0, 0) },
};
export const CLOUD_SHADOW_GLSL = /* glsl */ `
uniform vec2 csWind;
uniform float csCover;
uniform vec3 csSun;
uniform float csWet;
float csHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float csNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( csHash( i ), csHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( csHash( i + vec2( 0.0, 1.0 ) ), csHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
float csCloudShadow( vec3 wp ) {
  if ( csSun.y < 0.05 ) return 1.0;
  vec2 q = ( wp.xz + csSun.xz * ( 1600.0 - wp.y ) / csSun.y ) * 0.00042 + csWind;
  // Trois octaves suffisent pour l'ombre (les détails fins du ciel n'y changent rien) ; correction d'amplitude.
  float a = 0.5, s = 0.0;
  for ( int i = 0; i < 3; i++ ) { s += a * csNoise( q ); q = mat2( 1.6, 1.2, -1.2, 1.6 ) * q; a *= 0.5; }
  s += 0.0625;
  float cov = smoothstep( 1.0 - csCover, 1.15 - csCover * 0.6, s );
  // Soleil bas : l'ombre s'estompe avec la lumière directe au lieu de disparaître d'un coup.
  return 1.0 - cov * 0.78 * smoothstep( 0.05, 0.14, csSun.y );
}`;
// Position monde du sommet (instances, lots et squelette compris), après le chunk de projection.
const CS_VERTEX = /* glsl */ `
{
  vec4 csP = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    csP = batchingMatrix * csP;
  #endif
  #ifdef USE_INSTANCING
    csP = instanceMatrix * csP;
  #endif
  vec3 csW = ( modelMatrix * csP ).xyz;
  vCsShade = csCloudShadow( csW );
  LAMP_VERTEX
}`;
// Lampadaire (chevaux et cavaliers) : diffus enveloppant depuis la lanterne la plus proche du joueur, atténué avec
// la distance, évalué par sommet (la flaque au sol est déjà dessinée, voir World._buildLampPools).
const LAMP_VERTEX = /* glsl */ `
  vec3 lpD = lpPos.xyz - csW;
  float lpD2 = dot( lpD, lpD );
  float lpN = dot( inverseTransformDirection( transformedNormal, viewMatrix ), lpD * inversesqrt( lpD2 ) );
  vLamp = lpPos.w * ( 0.3 + 0.7 * max( lpN, 0.0 ) ) * max( 1.0 - lpD2 / 90.0, 0.0 ) / ( 1.0 + lpD2 * 0.08 );`;
const LAMP_FRAGMENT = /* glsl */ `
reflectedLight.directDiffuse += vLamp * vec3( 1.0, 0.72, 0.42 ) * BRDF_Lambert( material.diffuseColor );`;
// worldPosExpr : expression GLSL de la position monde dans le fragment (sol, routes, bâtiments). Sans elle,
// l'ombre est évaluée par sommet (herbe, arbres, chevaux, personnages, véhicules) : les nuages mesurent des
// centaines de mètres, le résultat est le même et ne coûte rien par pixel.
// lamp : ajoute l'éclairage du lampadaire le plus proche (chevaux et cavaliers, évalué par sommet).
export function addCloudShadows(shader, worldPosExpr = null, lamp = false) {
  Object.assign(shader.uniforms, CLOUD_UNIFORMS);
  let shade = 'vCsShade';
  if (worldPosExpr) {
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${CLOUD_SHADOW_GLSL}`);
    shade = `csCloudShadow( ${worldPosExpr} )`;
  } else {
    const varyings = lamp ? 'varying float vCsShade;\nvarying float vLamp;' : 'varying float vCsShade;';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${CLOUD_SHADOW_GLSL}\n${lamp ? 'uniform vec4 lpPos;\n' : ''}${varyings}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${CS_VERTEX.replace('LAMP_VERTEX', lamp ? LAMP_VERTEX : '')}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${varyings}`);
  }
  // Le chunk des lumières est développé ici pour atténuer uniquement la lumière directe du soleil.
  shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );', `getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= ${shade};`) + (lamp ? LAMP_FRAGMENT : ''));
}

// ---------- Modèle de Preetham (repris du Sky de three.js, licence MIT) ----------
const skyVert = /* glsl */ `
uniform vec3 sunDirection;
uniform float rayleigh;
uniform float turbidity;
uniform float mieCoefficient;
varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;
const vec3 up = vec3( 0.0, 1.0, 0.0 );
const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );
const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );
const float cutoffAngle = 1.6110731556870734;
const float steepness = 1.5;
const float EE = 1000.0;
float sunIntensity( float zenithAngleCos ) {
  zenithAngleCos = clamp( zenithAngleCos, -1.0, 1.0 );
  return EE * max( 0.0, 1.0 - exp( -( ( cutoffAngle - acos( zenithAngleCos ) ) / steepness ) ) );
}
vec3 totalMie( float T ) {
  float c = ( 0.2 * T ) * 10E-18;
  return 0.434 * c * MieConst;
}
void main() {
  vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position.z = gl_Position.w;
  vSunDirection = normalize( sunDirection );
  vSunE = sunIntensity( dot( vSunDirection, up ) );
  vSunfade = 1.0 - clamp( 1.0 - exp( vSunDirection.y ), 0.0, 1.0 );
  float rayleighCoefficient = rayleigh - ( 1.0 * ( 1.0 - vSunfade ) );
  vBetaR = totalRayleigh * rayleighCoefficient;
  vBetaM = totalMie( turbidity ) * mieCoefficient;
}`;

const skyFrag = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;
uniform float mieDirectionalG;
uniform float time;
uniform float cloudCover;
uniform vec2 cloudWind;
uniform vec3 sunLight;
uniform vec3 ambientSky;
uniform vec3 groundColor;
uniform vec3 moonDirection;
uniform float night;
uniform float envMode;
const vec3 up = vec3( 0.0, 1.0, 0.0 );
const float pi = 3.141592653589793;
const float rayleighZenithLength = 8.4E3;
const float mieZenithLength = 1.25E3;
const float sunAngularDiameterCos = 0.99995667694;
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
const float ONE_OVER_FOURPI = 0.07957747154594767;
float rayleighPhase( float cosTheta ) { return THREE_OVER_SIXTEENPI * ( 1.0 + cosTheta * cosTheta ); }
float hgPhase( float cosTheta, float g ) {
  float g2 = g * g;
  float inverse = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
  return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
}
float hash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float vnoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash12( i ), hash12( i + vec2( 1.0, 0.0 ) ), u.x ), mix( hash12( i + vec2( 0.0, 1.0 ) ), hash12( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
float fbm( vec2 p ) {
  float a = 0.5, s = 0.0;
  for ( int i = 0; i < 5; i++ ) { s += a * vnoise( p ); p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p; a *= 0.5; }
  return s;
}
float hash13( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
vec3 scatter( vec3 direction ) {
  float zenithAngle = acos( max( 0.0, dot( up, direction ) ) );
  float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
  float sR = rayleighZenithLength * inverse;
  float sM = mieZenithLength * inverse;
  vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );
  float cosTheta = dot( direction, vSunDirection );
  float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
  vec3 betaRTheta = vBetaR * rPhase;
  float mPhase = hgPhase( cosTheta, mieDirectionalG );
  vec3 betaMTheta = vBetaM * mPhase;
  vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
  Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 0.5 ) ), clamp( pow( 1.0 - dot( up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );
  vec3 L0 = vec3( 0.1 ) * Fex;
  float sundisk = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta );
  L0 += ( vSunE * 19000.0 * Fex ) * sundisk * ( 1.0 - envMode );
  vec3 texColor = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
  return pow( texColor, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) );
}
void main() {
  vec3 dir = normalize( vWorldPosition - cameraPosition );
  vec3 d = dir;
  d.y = max( d.y, 0.0005 );
  d = normalize( d );
  vec3 col = scatter( d );
  // Nuit : bleu profond, lune et étoiles.
  vec3 nightCol = mix( vec3( 0.006, 0.010, 0.022 ), vec3( 0.0015, 0.003, 0.009 ), smoothstep( 0.0, 0.6, d.y ) );
  col = mix( col, max( col, nightCol ), night );
  if ( night > 0.0 ) {
    vec3 sp = floor( d * 300.0 );
    float s = hash13( sp );
    col += vec3( step( 0.9972, s ) * night * ( 0.25 + 0.6 * hash13( sp + 3.0 ) ) ) * ( 1.0 - envMode ) * smoothstep( 0.02, 0.2, d.y );
    float md = dot( d, moonDirection );
    col += vec3( 0.75, 0.78, 0.85 ) * ( smoothstep( 0.99965, 0.9998, md ) * 1.6 + pow( max( md, 0.0 ), 60.0 ) * 0.025 ) * night;
  }
  // Nuages : couche d'altitude (1,6 km) projetée, éclairée par le soleil, ombrée par en dessous.
  if ( dir.y > 0.0 ) {
    float t = 1600.0 / max( d.y, 0.03 );
    vec2 p = ( cameraPosition.xz + d.xz * t ) * 0.00042 + cloudWind;
    float n = fbm( p );
    float cov = smoothstep( 1.0 - cloudCover, 1.15 - cloudCover * 0.6, n );
    float n2 = fbm( p + vSunDirection.xz * 0.12 );
    float lit = clamp( 1.0 - ( n2 - n ) * 3.2, 0.0, 1.0 );
    float fwd = pow( max( dot( d, vSunDirection ), 0.0 ), 8.0 );
    vec3 cloudCol = ambientSky * ( 0.7 + 0.3 * lit ) + sunLight * ( 0.28 * lit + 0.55 * fwd * lit ) * ( 1.0 - night * 0.8 );
    cloudCol = mix( cloudCol, cloudCol * 0.55, smoothstep( 0.55, 1.0, n ) * ( 1.0 - lit ) );
    float fade = smoothstep( 0.0, 0.18, dir.y );
    col = mix( col, cloudCol, cov * fade * 0.92 );
  }
  // Sous l'horizon : brume claire puis sol (pour l'éclairage d'ambiance, le sol renvoie sa propre teinte).
  float below = smoothstep( 0.0, -0.08, dir.y );
  col = mix( col, mix( col * 0.92, groundColor, envMode ), below );
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Version JS du même modèle (sans nuages) : couleur du brouillard (horizon) et lumière transmise du soleil.
const TR = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
function preetham(dir, sun, P, out) {
  const sunE = 1000 * Math.max(0, 1 - Math.exp(-((1.6110731556870734 - Math.acos(clamp(sun.y, -1, 1))) / 1.5)));
  const sunfade = 1 - clamp(1 - Math.exp(sun.y), 0, 1);
  const rc = P.rayleigh - (1 - sunfade);
  const c = 0.2 * P.turbidity * 10e-18;
  const zen = Math.acos(Math.max(0, dir.y));
  const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(93.885 - (zen * 180) / Math.PI, -1.253));
  const sR = 8.4e3 * inv, sM = 1.25e3 * inv;
  const cosT = dir.x * sun.x + dir.y * sun.y + dir.z * sun.z;
  const rPh = 0.05968310365946075 * (1 + Math.pow(cosT * 0.5 + 0.5, 2));
  const g = P.mieDirectionalG;
  const mPh = 0.07957747154594767 * ((1 - g * g) / Math.pow(1 - 2 * g * cosT + g * g, 1.5));
  const k = clamp(Math.pow(1 - sun.y, 5), 0, 1);
  for (let i = 0; i < 3; i++) {
    const bR = TR[i] * rc, bM = 0.434 * c * MIE[i] * P.mieCoefficient;
    const fex = Math.exp(-(bR * sR + bM * sM));
    const ratio = (bR * rPh + bM * mPh) / (bR + bM);
    let lin = Math.pow(sunE * ratio * (1 - fex), 1.5);
    lin *= lerp(1, Math.pow(sunE * ratio * fex, 0.5), k);
    const tex = (lin + 0.1 * fex) * 0.04 + [0, 0.0003, 0.00075][i];
    out[i] = Math.pow(tex, 1 / (1.2 + 1.2 * sunfade));
    out[3 + i] = fex;
  }
  return out;
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.params = { turbidity: 2.6, rayleigh: 1.4, mieCoefficient: 0.0045, mieDirectionalG: 0.82 };
    this.uniforms = {
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      turbidity: { value: this.params.turbidity },
      rayleigh: { value: this.params.rayleigh },
      mieCoefficient: { value: this.params.mieCoefficient },
      mieDirectionalG: { value: this.params.mieDirectionalG },
      time: { value: 0 },
      cloudCover: { value: 0.42 },
      cloudWind: { value: new THREE.Vector2() },
      sunLight: { value: new THREE.Color(1, 1, 1) },
      ambientSky: { value: new THREE.Color(0.4, 0.5, 0.7) },
      groundColor: { value: new THREE.Color(0.06, 0.07, 0.04) },
      moonDirection: { value: new THREE.Vector3(0, 1, 0) },
      night: { value: 0 },
      envMode: { value: 0 },
      // Compatibilité (eau) : couleur d'horizon.
      horizonColor: { value: new THREE.Color() },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: skyVert, fragmentShader: skyFrag, uniforms: this.uniforms,
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), this.material);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // Lumières : soleil (ou lune) directionnel + appoint d'hémisphère (surtout la nuit) ; le ciel éclaire via l'IBL.
    this.hemi = new THREE.HemisphereLight('#bcd2ff', '#3a3a2a', 0.15);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = -60; s.right = 60; s.top = 60; s.bottom = -60; s.near = 1; s.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 2.5;
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.fog = new THREE.FogExp2('#c3d9ea', 0.0016);

    // Scène dédiée à l'éclairage d'ambiance (le même ciel, sol sombre en dessous).
    this.envScene = new THREE.Scene();
    this.envMaterial = this.material.clone();
    this.envMaterial.uniforms = this.uniforms;
    this.envMaterial.defines = {};
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.envMaterial);
    this.envScene.add(envDome);
    this.envTarget = null;
    this.envSun = new THREE.Vector3(0, -2, 0);
    this.envAt = -1e9;

    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.elevation = 1;
    this.nightFactor = 0;
    this.exposure = 0.55;
    this.cover = 0.42;
    this.envCover = this.cover;
    this.day = -1;
    this.rain = 0;
    this.wet = 0;
    this._px = new Float32Array(6);
    this._acc = [0, 0, 0];
    this.clouds = this.dome; // compatibilité
  }

  // Météo du jour (déterministe) : dégagé, voilé, nuageux ou couvert, à la normande. La couverture est
  // recalculée à chaque image (fondu vers le temps du lendemain en fin de soirée, voir update).
  setDay(day) {
    if (day === this.day) return;
    this.day = day;
    this.wind = wind(day);
    // Vecteur du vent (vers où il souffle) : nord = -z, est = +x ; vitesse en m/s.
    const a = (this.wind.deg * Math.PI) / 180, ms = this.wind.kmh / 3.6;
    this.windVec = new THREE.Vector2(-Math.sin(a) * ms, Math.cos(a) * ms);
  }

  // Couverture nuageuse du moment : ciel, voile atmosphérique, ombres des nuages et éclairage d'ambiance.
  _setCover(cover) {
    if (Math.abs(cover - this.cover) > 0.05) {
      // Changement brusque (premier jour, saut dans le temps) : éclairage d'ambiance refait tout de suite.
      this.envDirty = true;
      this.envAt = -1e9;
    }
    this.cover = cover;
    this.params.turbidity = 2.2 + cover * 1.6;
    this.uniforms.turbidity.value = this.params.turbidity;
    this.uniforms.cloudCover.value = cover;
    this.envDirty = this.envDirty || Math.abs(cover - this.envCover) > 0.03;
  }

  setShadowSize(size, extent = 60) {
    this.sun.shadow.mapSize.set(size, size);
    const s = this.sun.shadow.camera;
    s.left = -extent; s.right = extent; s.top = extent; s.bottom = -extent;
    s.updateProjectionMatrix();
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
  }

  // hour : 0..24 ; focus : position suivie par l'ombre portée.
  update(hour, focus, dt) {
    // Course réelle du soleil à Deauville le 23 août (heure légale d'été) : lever 7 h 01 à l'est-nord-est, midi solaire
    // 14 h 03 plein sud à 52°, coucher 21 h 04 à l'ouest-nord-ouest.
    const sun = sunDirection(hour, this.sunDir);
    // Lune : à l'opposé, plus basse.
    this.moonDir.set(-sun.x, Math.max(0.25, Math.abs(sun.y) * 0.8 + 0.2), -sun.z).normalize();
    this.elevation = sun.y;
    this.nightFactor = smoothstep(0.03, -0.16, sun.y);
    const night = this.nightFactor;
    const U = this.uniforms;
    U.sunDirection.value.copy(sun);
    U.moonDirection.value.copy(this.moonDir);
    U.night.value = night;
    U.time.value += dt;
    if (this.day >= 0) this._setCover(coverAt(this.day, hour));
    // Les nuages dérivent avec le vent du jour : le bruit est lu en (position × échelle + décalage), le décalage
    // recule donc pour que les nuages avancent dans le sens du vent.
    const wv = this.windVec || { x: 3.8, y: 1.4 };
    U.cloudWind.value.x -= dt * 0.00042 * wv.x * 0.9;
    U.cloudWind.value.y -= dt * 0.00042 * wv.y * 0.9;
    CLOUD_UNIFORMS.csWind.value.copy(U.cloudWind.value);
    CLOUD_UNIFORMS.csCover.value = this.cover;
    CLOUD_UNIFORMS.csSun.value.copy(sun);
    // Averses les jours couverts ; le sol se mouille vite et sèche lentement.
    const target = rainTarget(this.day, hour);
    this.rain += (target - this.rain) * Math.min(1, dt * 0.15);
    this.wet = clamp(this.wet + (this.rain > 0.08 ? dt / 35 : -dt / 420), 0, 1);
    CLOUD_UNIFORMS.csWet.value = this.wet;

    // Couleur du ciel à l'horizon (moyenne autour de l'horizon) et lumière transmise du soleil.
    const px = this._px;
    const acc = this._acc;
    acc[0] = acc[1] = acc[2] = 0;
    const dirs = 8;
    for (let i = 0; i < dirs; i++) {
      const a = (i / dirs) * Math.PI * 2;
      preetham({ x: Math.cos(a) * 0.995, y: 0.1, z: Math.sin(a) * 0.995 }, sun, this.params, px);
      acc[0] += px[0] / dirs; acc[1] += px[1] / dirs; acc[2] += px[2] / dirs;
    }
    const nightHor = [0.004, 0.007, 0.016];
    const fogR = lerp(acc[0], nightHor[0], night), fogG = lerp(acc[1], nightHor[1], night), fogB = lerp(acc[2], nightHor[2], night);
    this.scene.fog.color.setRGB(fogR, fogG, fogB, THREE.LinearSRGBColorSpace);
    U.horizonColor.value.setRGB(fogR, fogG, fogB, THREE.LinearSRGBColorSpace);
    // Ciel au zénith → ambiance des nuages.
    preetham({ x: 0, y: 1, z: 0 }, sun, this.params, px);
    U.ambientSky.value.setRGB(lerp(px[0] * 1.25 + 0.05, 0.01, night), lerp(px[1] * 1.15 + 0.05, 0.014, night), lerp(px[2] + 0.05, 0.024, night), THREE.LinearSRGBColorSpace);
    // Luminance moyenne du ciel (zénith, 45° et horizon, nuit comprise) : entre deux cuissons de la carte
    // d'environnement, l'intensité de l'éclairage d'ambiance suit cette valeur pour que l'ambiance évolue sans
    // à-coups à l'aube et au crépuscule (voir updateEnvironment).
    const zenL = 0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2];
    const horL = 0.2126 * acc[0] + 0.7152 * acc[1] + 0.0722 * acc[2];
    let midL = 0;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      preetham({ x: Math.cos(a) * 0.71, y: 0.7, z: Math.sin(a) * 0.71 }, sun, this.params, px);
      midL += (0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]) / 4;
    }
    const dayB = 0.25 * zenL + 0.5 * midL + 0.25 * horL;
    this.envBright = lerp(dayB, Math.max(dayB, 0.008), night);
    if (this.envBake) this.scene.environmentIntensity = clamp(this.envBright / this.envBake, 0.5, 2);
    // Transmission atmosphérique vers le soleil : teinte et intensité (rougit et faiblit au coucher).
    preetham(sun.y > 0.02 ? sun : { x: sun.x, y: 0.02, z: sun.z }, sun.y > 0.02 ? sun : { x: sun.x, y: 0.02, z: sun.z }, this.params, px);
    const tr = px[3], tg = px[4], tb = px[5];
    const tmax = Math.max(tr, tg, tb, 1e-4);
    const dayK = smoothstep(-0.04, 0.12, sun.y);
    U.sunLight.value.setRGB((tr / tmax) * 1.4 * dayK + 0.02, (tg / tmax) * 1.4 * dayK + 0.02, (tb / tmax) * 1.4 * dayK + 0.03, THREE.LinearSRGBColorSpace);
    U.groundColor.value.setRGB(0.05 * (1 - night) + 0.004, 0.055 * (1 - night) + 0.005, 0.035 * (1 - night) + 0.006, THREE.LinearSRGBColorSpace);

    if (sun.y > -0.02) {
      // Soleil : couleur transmise, intensité selon la masse d'air traversée.
      this.sun.color.setRGB(tr / tmax, tg / tmax, tb / tmax, THREE.LinearSRGBColorSpace);
      // Ciel couvert : moins de soleil direct (la lumière diffuse du ciel prend le relais via l'IBL).
      const overcast = 1 - 0.6 * smoothstep(0.5, 0.85, this.cover);
      this.sun.intensity = 5.2 * smoothstep(-0.02, 0.2, sun.y) * clamp(tmax * 1.15, 0.25, 1) * overcast * (1 - 0.35 * this.rain);
      this._lightDir = sun;
    } else {
      // Lune : lumière froide et faible.
      this.sun.color.setRGB(0.55, 0.65, 0.95, THREE.LinearSRGBColorSpace);
      this.sun.intensity = 0.32 * night;
      this._lightDir = this.moonDir;
    }
    this.hemi.intensity = 0.06 + 0.32 * night;
    this.hemi.color.setRGB(0.4, 0.5, 0.8, THREE.LinearSRGBColorSpace);
    this.scene.fog.density = lerp(0.0011, 0.0022, night) + (1 - smoothstep(0.0, 0.25, sun.y)) * 0.0006 + this.rain * 0.0028;

    // Ombres centrées sur le joueur, alignées sur les texels pour éviter le scintillement.
    const dir = this._lightDir;
    const snap = 0.5;
    const fx = Math.round(focus.x / snap) * snap;
    const fz = Math.round(focus.z / snap) * snap;
    this.sun.position.set(fx + dir.x * 150, (focus.y || 0) + Math.max(dir.y, 0.12) * 150, fz + dir.z * 150);
    this.sun.target.position.set(fx, focus.y || 0, fz);
    // Soleil bas (aube, crépuscule) : le ciel change vite, cuissons plus fréquentes (toutes les 2 s au plus).
    this.envLow = Math.abs(sun.y) < 0.2;
    this.envDirty = this.envDirty || this.envSun.distanceTo(sun) > (this.envLow ? 0.008 : 0.02);
  }

  // Régénère l'éclairage d'ambiance (IBL) quand le soleil a sensiblement bougé (coûteux : rarement).
  updateEnvironment(renderer, now, force = false) {
    if (!force && (!this.envDirty || now - this.envAt < (this.envLow ? 2 : 8))) return;
    this.envAt = now;
    this.envSun.copy(this.sunDir);
    this.envCover = this.cover;
    this.envDirty = false;
    this.uniforms.envMode.value = 1;
    if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(renderer);
    const old = this.envTarget;
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
    this.uniforms.envMode.value = 0;
    this.scene.environment = this.envTarget.texture;
    // Luminance du ciel au moment de la cuisson : référence de l'intensité d'ambiance jusqu'à la suivante.
    this.envBake = this.envBright;
    this.scene.environmentIntensity = 1;
    old?.dispose();
  }

  follow(camera) {
    this.dome.position.copy(camera.position);
  }
}
