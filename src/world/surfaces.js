// Matériaux réalistes des bâtiments sans textures dédiées : le type de surface est déduit de la couleur peinte
// (palette des constructeurs) et de l'orientation de la face, puis le motif (ardoises, tuiles, briques, bardage,
// enduit, pierre, métal, verre) est calculé dans le shader, en coordonnées du monde, avec son relief et sa rugosité.
import * as THREE from 'three';
import { addCloudShadows } from './sky.js';

const SURFACE_CHUNK = /* glsl */ `
uniform sampler2D surfDetail;
uniform sampler2D surfHeight;
uniform vec4 surfHm;
varying vec3 vSurfPos;
varying vec3 vSurfNrm;
float sfH = 0.0;
float sfRough = 0.9;
float sfMetal = 0.0;
float sfHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
// Poids de la variation propre à chaque élément de taille s (ardoise, planche, brique) : elle revient à sa
// moyenne quand l'élément devient plus petit que le pixel (lointain, surfaces courbes où le repère tourne),
// sinon chaque pixel tire une teinte au hasard (bruit « sel et poivre » qui scintille).
float sfIdW( float s, float pxw ) { return 1.0 - smoothstep( s, 2.0 * s, pxw ); }
vec3 sfBump( vec3 surfPos, vec3 surfNorm, float h ) {
  vec3 sx = dFdx( surfPos ), sy = dFdy( surfPos );
  vec3 r1 = cross( sy, surfNorm ), r2 = cross( surfNorm, sx );
  float det = dot( sx, r1 );
  vec3 grad = sign( det ) * ( dFdx( h ) * r1 + dFdy( h ) * r2 );
  return normalize( abs( det ) * surfNorm - grad );
}
// Rangées de tuiles/ardoises (u le long du faîtage, v dans la pente) : relief, teinte par élément.
float sfRows( vec2 uv, vec2 size, out float id ) {
  float row = floor( uv.y / size.y );
  float u = uv.x / size.x + row * 0.5;
  vec2 cell = vec2( floor( u ), row );
  id = sfHash( cell );
  float fu = fract( u ), fv = fract( uv.y / size.y );
  float edge = smoothstep( 0.0, 0.06, fu ) * smoothstep( 1.0, 0.94, fu );
  return ( 0.35 + 0.65 * fv ) * edge;
}
`;

const SURFACE_MAIN = /* glsl */ `
{
  vec3 c = pow( max( vColor.rgb, vec3( 0.0 ) ), vec3( 1.0 / 2.2 ) );
  float mx = max( c.r, max( c.g, c.b ) ), mn = min( c.r, min( c.g, c.b ) );
  float sat = ( mx - mn ) / ( mx + 1e-4 );
  vec3 n = normalize( vSurfNrm );
  float ny = abs( n.y );
  vec3 p = vSurfPos;
  // Repère de la face : u horizontal le long de la face, v vers le haut (ou dans la pente).
  vec3 t = normalize( abs( n.y ) > 0.97 ? vec3( 1.0, 0.0, 0.0 ) : cross( vec3( 0.0, 1.0, 0.0 ), n ) );
  vec3 b = cross( n, t );
  vec2 uv = vec2( dot( p, t ), dot( p, b ) );
  float dist = length( vViewPosition );
  float pxw = length( fwidth( uv ) );
  float detW = 1.0 - smoothstep( 0.012, 0.06, pxw );
  vec4 dA = texture2D( surfDetail, uv * 0.9 );
  vec4 dB = texture2D( surfDetail, uv * 0.13 + 0.37 );
  float tint = 1.0;
  bool sloped = ny > 0.25 && ny < 0.97;
  bool vertical = ny < 0.25;
  bool warm = c.r > c.b * 1.12;
  if ( c.g < 0.04 && c.r > 0.25 && c.b > 0.7 ) {
    // Colombage du Pays d'Auge (repère magenta) : poteaux serrés d'environ 17 cm tous les 46 cm,
    // hourdis enduit (crème, blanc, ocre) ou briques en épi ; ou pièce de bois pleine (sablières, poteaux).
    float code = floor( ( 1.0 - c.r ) * 10.0 + 0.5 );
    float woodI = floor( ( 1.0 - c.b ) * 10.0 + 0.5 );
    // Chêne grisé par les intempéries, ou bois peints (vert-de-gris, sang-de-bœuf).
    vec3 woodC = woodI < 0.5 ? vec3( 0.105, 0.07, 0.045 ) : ( woodI < 1.5 ? vec3( 0.085, 0.11, 0.09 ) : vec3( 0.17, 0.04, 0.03 ) );
    vec4 gr = texture2D( surfDetail, vertical ? vec2( uv.x * 2.2, uv.y * 0.22 ) : vec2( uv.x * 0.22, uv.y * 2.2 ) );
    float stId = mix( 0.5, sfHash( vec2( floor( uv.x / 0.46 + 0.5 ), floor( uv.y / 3.0 ) ) ), sfIdW( 0.46, pxw ) );
    vec3 woodTex = woodC * mix( 0.75, 1.25, gr.r ) * mix( 0.9, 1.1, dB.g ) * mix( 0.8, 1.25, stId );
    if ( code > 4.5 || !vertical ) {
      diffuseColor.rgb = woodTex;
      sfH = gr.r * 0.4 * detW;
      sfRough = 0.88;
    } else {
      // Pays d'Auge : poteaux serrés ; néo-normand (grandes villas, hôtels) : poteaux espacés, grands panneaux enduits.
      float P = code > 3.5 ? 1.05 : 0.46;
      float si = floor( uv.x / P + 0.5 );
      float sid = mix( 0.5, sfHash( vec2( si, 7.13 ) ), sfIdW( P, pxw ) );
      float W = 0.15 + sid * 0.05;
      float dS = abs( fract( uv.x / P + 0.5 ) - 0.5 ) * P;
      float aa = max( pxw * 0.6, 0.003 );
      float stud = 1.0 - smoothstep( W * 0.5 - aa, W * 0.5 + aa, dS );
      vec3 fillC;
      float fillH;
      if ( code > 2.5 && code < 3.5 ) {
        // Briques posées en épi (chevrons alternés par rang).
        float band = floor( uv.y / 0.15 );
        float dir = mod( band, 2.0 ) * 2.0 - 1.0;
        float sq = ( uv.x + dir * uv.y ) / 0.085;
        float bid = mix( 0.5, sfHash( vec2( floor( sq ), band ) ), sfIdW( 0.085, pxw ) );
        float jt = 1.0 - smoothstep( 0.0, 0.12, fract( sq ) ) * smoothstep( 1.0, 0.88, fract( sq ) ) * smoothstep( 0.0, 0.08, fract( uv.y / 0.15 ) );
        fillC = mix( vec3( 0.36, 0.12, 0.06 ) * mix( 0.75, 1.2, bid ), vec3( 0.6, 0.55, 0.47 ), jt * detW );
        fillH = ( 1.0 - jt ) * 0.5;
      } else {
        fillC = code < 0.5 || code > 3.5 ? vec3( 0.76, 0.68, 0.53 ) : ( code < 1.5 ? vec3( 0.78, 0.76, 0.7 ) : vec3( 0.66, 0.46, 0.26 ) );
        fillC *= mix( 0.92, 1.04, dA.r ) * mix( 0.9, 1.03, dB.r ) * mix( 1.0, 0.86, dB.a * 0.7 );
        fillH = dA.r * 0.3 + dA.g * 0.1;
      }
      // Au loin, les poteaux se fondent en une teinte moyenne (pas de moiré).
      float lod = smoothstep( 0.05, 0.14, pxw );
      vec3 col = mix( fillC, woodTex, stud );
      vec3 avg = mix( fillC, woodC, W / P );
      diffuseColor.rgb = mix( col, avg, lod );
      sfH = mix( fillH, 0.9 + gr.r * 0.3, stud ) * detW;
      sfRough = mix( 0.93, 0.88, stud );
    }
  } else if ( warm && c.g > c.r * 1.15 ) {
    // Végétation restée dans le décor statique (feuillage des jardinières, pelouses, gazon des falaises) :
    // vert-jaune, que les peintures vertes (bleutées) n'atteignent pas ; feuillage moucheté, sans tuiles ni planches.
    sfH = ( dA.r * 0.4 + dA.g * 0.2 ) * detW;
    tint = mix( 0.86, 1.1, dA.r ) * mix( 0.88, 1.06, dB.g );
    sfRough = 0.95;
  } else if ( sloped && mx < 0.5 && !warm ) {
    // Ardoise : petites plaques rectangulaires, bords marqués, légère brillance.
    float id;
    float h = sfRows( uv, vec2( 0.32, 0.2 ), id );
    id = mix( 0.5, id, sfIdW( 0.2, pxw ) );
    sfH = h * 0.6 * detW;
    tint = mix( 0.82, 1.12, id ) * mix( 0.92, 1.05, dA.r );
    sfRough = mix( 0.55, 0.75, id );
  } else if ( sloped && warm && sat > 0.2 ) {
    // Tuiles mécaniques en terre cuite : ondulations et rangs.
    float id;
    float h = sfRows( uv, vec2( 0.24, 0.32 ), id );
    id = mix( 0.5, id, sfIdW( 0.24, pxw ) );
    float wave = 0.5 + 0.5 * sin( uv.x / 0.24 * 6.2831 );
    sfH = ( h * 0.5 + wave * 0.5 ) * 0.8 * detW;
    tint = mix( 0.82, 1.1, id ) * mix( 0.9, 1.05, dA.r ) * mix( 0.85, 1.0, dB.g );
    sfRough = 0.8;
  } else if ( vertical && warm && sat > 0.3 && mx > 0.5 && mx < 0.85 && c.g < c.r * 0.75 ) {
    // Brique : appareil en panneresses, joints creux et clairs.
    float row = floor( uv.y / 0.075 );
    float u = uv.x / 0.225 + row * 0.5;
    float id = mix( 0.5, sfHash( vec2( floor( u ), row ) ), sfIdW( 0.075, pxw ) );
    float fu = fract( u ), fv = fract( uv.y / 0.075 );
    float joint = 1.0 - smoothstep( 0.0, 0.05, fu ) * smoothstep( 1.0, 0.95, fu ) * smoothstep( 0.0, 0.14, fv ) * smoothstep( 1.0, 0.86, fv );
    sfH = ( 1.0 - joint ) * 0.8 * detW;
    tint = mix( mix( 0.78, 1.12, id ) * mix( 0.9, 1.05, dA.r ), 1.45, joint * detW );
    sfRough = 0.9;
  } else if ( warm && sat > 0.3 && mx >= 0.72 && c.g > c.r * 0.78 && c.b < c.g * 0.75 ) {
    // Paille / foin pressé : brins orientés, mèches plus claires et plus sombres.
    vec4 g1 = texture2D( surfDetail, vec2( uv.x * 9.0, uv.y * 0.8 ) );
    vec4 g2 = texture2D( surfDetail, vec2( uv.x * 0.9 + 0.3, uv.y * 7.0 ) );
    float fib = mix( g1.r, g2.r, 0.35 );
    sfH = fib * 0.6 * detW;
    tint = mix( 0.72, 1.18, fib ) * mix( 0.9, 1.06, dB.g );
    sfRough = 0.95;
  } else if ( warm && sat > 0.25 && mx < 0.72 ) {
    // Bois : bardage vertical (façades), platelage (lames posées en travers, joints décalés) ou poutres.
    float board = vertical ? fract( uv.x / 0.16 ) : fract( uv.x / 0.19 );
    float gap = 1.0 - smoothstep( 0.0, 0.05, board ) * smoothstep( 1.0, 0.95, board );
    if ( !vertical ) {
      float jd = ( 0.5 - abs( fract( uv.y / 2.1 + sfHash( vec2( floor( uv.x / 0.19 ), 1.7 ) ) ) - 0.5 ) ) * 2.1;
      gap = max( gap, 1.0 - smoothstep( 0.004, 0.01, jd ) );
    }
    vec4 g = texture2D( surfDetail, vec2( vertical ? uv.x * 3.0 : uv.x * 0.3, vertical ? uv.y * 0.25 : uv.y * 3.0 ) );
    float grain = g.r;
    float id = mix( 0.5, sfHash( vec2( floor( uv.x / ( vertical ? 0.16 : 0.19 ) ), 3.0 ) ), sfIdW( 0.16, pxw ) );
    sfH = ( ( 1.0 - gap ) * 0.5 + grain * 0.25 ) * detW;
    tint = mix( 0.8, 1.15, grain ) * mix( 0.88, 1.08, id ) * mix( 1.0, 0.55, gap * detW );
    sfRough = 0.82;
  } else if ( vertical && mx < 0.28 && sat < 0.2 ) {
    // Bardage peint sombre (écuries) : lames verticales larges.
    float board = fract( uv.x / 0.19 );
    float gap = 1.0 - smoothstep( 0.0, 0.04, board ) * smoothstep( 1.0, 0.96, board );
    sfH = ( 1.0 - gap ) * 0.5 * detW + dA.r * 0.1;
    tint = mix( 0.9, 1.1, dB.r ) * mix( 1.0, 0.6, gap * detW );
    sfRough = 0.6;
  } else if ( mx > 0.8 && sat < 0.2 ) {
    // Enduit / peinture claire : grain fin, salissures douces en bas, coulures.
    sfH = ( dA.r * 0.35 + dA.g * 0.15 ) * detW;
    tint = mix( 0.9, 1.04, dB.r ) * mix( 0.96, 1.02, dA.r ) * mix( 1.0, 0.9, dB.a * 0.6 );
    sfRough = 0.9;
  } else if ( sat < 0.15 && mx > 0.45 && mx <= 0.8 ) {
    // Pierre de taille / béton : blocs et grain.
    vec4 s = texture2D( surfDetail, uv * 0.35 );
    float blk = smoothstep( 0.04, 0.12, s.b );
    sfH = ( blk * 0.6 + dA.r * 0.3 ) * detW;
    tint = mix( 0.82, 1.08, s.g ) * mix( 0.88, 1.0, blk );
    // Vieillissement : coulures sombres sous les arêtes (faces verticales), patine marbrée, taches de lichen
    // gris-vert sur les pierres exposées.
    float streak = texture2D( surfDetail, vec2( uv.x * 2.6, uv.y * 0.11 ) + 0.21 ).r;
    tint *= mix( 1.0, 0.78, smoothstep( 0.55, 0.85, streak ) * ( 1.0 - ny ) );
    tint *= mix( 0.84, 1.04, dB.g ) * mix( 0.93, 1.03, dA.g );
    float lichen = smoothstep( 0.66, 0.74, dB.b * 0.7 + dA.r * 0.3 ) * detW;
    diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.78, 0.82, 0.66 ), lichen * 0.7 );
    sfRough = 0.92;
  } else if ( mx < 0.2 && sat < 0.2 ) {
    // Métal peint sombre, menuiseries : satiné.
    sfH = dA.r * 0.05;
    sfRough = 0.45;
    sfMetal = 0.0;
  }
  diffuseColor.rgb *= mix( 1.0, tint, 0.4 + 0.6 * ( 1.0 - smoothstep( 40.0, 160.0, dist ) ) );
  // Pluie : matériaux un peu plus sombres, toitures luisantes.
  diffuseColor.rgb *= 1.0 - csWet * 0.14;
  sfRough = mix( sfRough, sloped ? 0.22 : 0.55, csWet * 0.7 );
  // Occultation au contact du sol : les faces verticales s'assombrissent près du terrain.
  vec2 hg = ( p.xz - surfHm.xy ) / surfHm.z;
  vec2 huv = ( hg * surfHm.w + 0.5 ) / ( surfHm.w + 1.0 );
  float ground = texture2D( surfHeight, vec2( huv.x, 1.0 - huv.y ) ).r;
  float hag = p.y - ground;
  diffuseColor.rgb *= mix( 1.0, mix( 0.55, 1.0, smoothstep( 0.0, 1.3, hag ) ), 1.0 - ny * 0.8 );
}
`;

// Intérieurs des bâtiments où l'on entre (écuries, club-house) : sous le toit, la lumière du ciel n'arrive que par les
// portes et les fenêtres. L'éclairage indirect y est réduit et réchauffé (bois, litière), le reflet du ciel atténué.
export const INDOOR_UNIFORMS = {
  indoorN: { value: 0 },
  indoorR: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) }, // x, z, demi-longueur, demi-largeur
  indoorP: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) }, // cos, sin, y du plancher, h (murs)
  indoorQ: { value: Array.from({ length: 12 }, () => new THREE.Vector2()) }, // rise (faîtage)
};
export function addIndoor(cl) {
  const n = INDOOR_UNIFORMS.indoorN.value;
  if (n >= 12) return;
  INDOOR_UNIFORMS.indoorR.value[n].set(cl.x, cl.z, cl.hw, cl.hd);
  INDOOR_UNIFORMS.indoorP.value[n].set(Math.cos(cl.rot || 0), Math.sin(cl.rot || 0), cl.y, cl.h);
  INDOOR_UNIFORMS.indoorQ.value[n].set(cl.rise || 0, 0);
  INDOOR_UNIFORMS.indoorN.value = n + 1;
}
const INDOOR_CHUNK = /* glsl */ `
uniform int indoorN;
uniform vec4 indoorR[12];
uniform vec4 indoorP[12];
uniform vec2 indoorQ[12];
float sfIndoor( vec3 p ) {
  float k = 0.0;
  for ( int i = 0; i < 12; i++ ) {
    if ( i >= indoorN ) break;
    vec2 d = p.xz - indoorR[i].xy;
    vec4 P = indoorP[i];
    vec2 l = vec2( d.x * P.x - d.y * P.y, d.x * P.y + d.y * P.x );
    vec2 q = abs( l ) - indoorR[i].zw;
    if ( max( q.x, q.y ) > 0.02 ) continue;
    float roof = P.z + P.w + indoorQ[i].x * max( 0.0, 1.0 - abs( l.y ) / indoorR[i].w ) + 0.15;
    if ( p.y > roof || p.y < P.z - 0.6 ) continue;
    // Fondu de 1,5 m vers les pignons (portes ouvertes) : la lumière du jour entre par les extrémités de l'allée.
    k = max( k, smoothstep( 0.0, 1.5, -q.x ) * 0.85 + 0.15 );
  }
  return k;
}
`;

// Applique le shader de surfaces à un matériau standard à couleurs de sommet (bâtiments, mobilier, décors).
// getTerrain : fonction renvoyant le terrain (résolu à la compilation, une fois le monde construit).
export function applySurfaces(material, detailTexture, getTerrain = null) {
  material.vertexColors = true;
  material.onBeforeCompile = (shader) => {
    const terrain = getTerrain?.();
    shader.uniforms.surfDetail = { value: detailTexture };
    shader.uniforms.surfHeight = { value: terrain ? terrain.heightTexture() : null };
    shader.uniforms.surfHm = { value: terrain ? terrain.hmParams : new THREE.Vector4(-1e6, -1e6, 1, 1) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfPos;\nvarying vec3 vSurfNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvSurfNrm = mat3( modelMatrix ) * objectNormal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SURFACE_CHUNK}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${SURFACE_MAIN}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = sfRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = sfMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = sfBump( -vViewPosition, normal, sfH * 0.012 );')
      .replace('#include <common>', `#include <common>\n${INDOOR_CHUNK}`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
  {
    float ins = sfIndoor( vSurfPos );
    vec3 warm = mix( vec3( 1.0 ), vec3( 0.72, 0.66, 0.56 ), ins );
    irradiance *= warm;
    iblIrradiance *= warm;
    radiance *= 1.0 - ins * 0.7;
  }`);
    Object.assign(shader.uniforms, INDOOR_UNIFORMS);
    addCloudShadows(shader, 'vSurfPos');
  };
  material.customProgramCacheKey = () => 'st-surfaces';
  return material;
}

// Chaussée : enrobé à granulats, traces de roues lustrées, réparations, fissures, rives usées,
// marquage français (axe discontinu 3 m / 10 m, lignes de rive) légèrement en relief.
export function applyRoadShader(material, detailTexture) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.surfDetail = { value: detailTexture };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 roadUV;\nvarying vec3 vRoad;\nvarying vec3 vRoadW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = roadUV;\nvRoadW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D surfDetail;
varying vec3 vRoad;
varying vec3 vRoadW;
float rdH = 0.0;
float rdRough = 0.85;
float rdPud = 0.0;
vec3 rdBump( vec3 surfPos, vec3 surfNorm, float h ) {
  vec3 sx = dFdx( surfPos ), sy = dFdy( surfPos );
  vec3 r1 = cross( sy, surfNorm ), r2 = cross( surfNorm, sx );
  float det = dot( sx, r1 );
  vec3 grad = sign( det ) * ( dFdx( h ) * r1 + dFdy( h ) * r2 );
  return normalize( abs( det ) * surfNorm - grad );
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float w = vRoad.z;
  float x = vRoad.x - w * 0.5;
  float y = vRoad.y;
  vec2 p = vRoadW.xz;
  float pxw = length( fwidth( p ) );
  float fineW = 1.0 - smoothstep( 0.008, 0.04, pxw );
  vec4 dF = texture2D( surfDetail, p * 1.7 );
  vec4 dM = texture2D( surfDetail, p * 0.19 + 0.3 );
  vec4 dL = texture2D( surfDetail, p * 0.031 + 0.7 );
  vec3 col = vec3( 0.042, 0.043, 0.046 ) * mix( 0.85, 1.2, dM.g ) * mix( 0.9, 1.12, dL.r );
  float agg = smoothstep( 0.22, 0.04, dF.b ) * fineW;
  col *= 1.0 + agg * 0.9 + ( dF.r - 0.5 ) * 0.3 * fineW;
  // Traces de roues (deux par voie), plus sombres et lustrées.
  float lane = abs( abs( x ) - w * 0.25 );
  float track = smoothstep( 0.45, 0.1, abs( lane - 0.85 ) ) * step( 5.0, w );
  col *= 1.0 - track * 0.18;
  rdRough = mix( 0.88, 0.74, track );
  // Réparations (plaques plus sombres) et fissures fines.
  float patchM = smoothstep( 0.62, 0.66, dL.g ) * smoothstep( 0.3, 0.5, dM.r );
  col *= 1.0 - patchM * 0.3;
  float crack = ( 1.0 - smoothstep( 0.0, 0.012, abs( dM.r - 0.5 ) ) ) * smoothstep( 0.55, 0.7, dL.b ) * fineW;
  col *= 1.0 - crack * 0.6;
  // Rives usées : l'enrobé s'effrite vers l'accotement.
  float edge = smoothstep( w * 0.5 - 0.35, w * 0.5 - 0.02, abs( x ) + ( dF.r - 0.5 ) * 0.25 );
  col = mix( col, vec3( 0.11, 0.1, 0.085 ) * mix( 0.8, 1.2, dF.g ), edge );
  // Marquage blanc rétroréfléchissant (usé par endroits).
  float wear = smoothstep( 0.25, 0.6, dM.a * 0.5 + dF.g * 0.5 );
  float center = step( 6.0, w ) * ( 1.0 - smoothstep( 0.055, 0.075, abs( x ) ) ) * step( fract( y / 13.0 ), 3.0 / 13.0 );
  float rive = step( 6.0, w ) * ( 1.0 - smoothstep( 0.06, 0.08, abs( abs( x ) - ( w * 0.5 - 0.3 ) ) ) ) * step( fract( y / 6.5 ), 3.0 / 6.5 );
  float mark = max( center, rive ) * mix( 0.55, 1.0, wear );
  col = mix( col, vec3( 0.62, 0.62, 0.6 ), mark );
  rdRough = mix( rdRough, 0.55, mark );
  rdH = ( agg * 0.5 + dF.r * 0.2 * fineW + mark * 1.5 - crack * 0.8 - edge * dF.b * 0.6 );
  // Chaussée mouillée : plus sombre, brillante, flaques dans les traces de roues.
  rdPud = smoothstep( 0.58, 0.66, dL.g * 0.6 + track * 0.5 ) * smoothstep( 0.3, 0.9, csWet );
  col *= 1.0 - csWet * 0.42;
  rdRough = mix( rdRough, 0.22, csWet );
  rdRough = mix( rdRough, 0.04, rdPud );
  diffuseColor.rgb = col;
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = rdRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize( mix( rdBump( -vViewPosition, normal, rdH * 0.004 ), normal, rdPud ) );');
    // Position réelle (avec l'altitude) : ombre des nuages alignée sur celle du terrain des accotements.
    addCloudShadows(shader, 'vRoadW');
  };
  material.customProgramCacheKey = () => 'st-road';
  return material;
}

// ---------- Pièces derrière les vitres (« interior mapping ») ----------
// Chaque fenêtre ouvre sur une pièce simulée par lancer de rayon dans une boîte (murs, sol, plafond, mobilier),
// couleurs propres à chaque fenêtre, rideaux, éclairage le soir ; les ouvertures de box montrent la stalle.
export const INTERIOR_UNIFORMS = { inDay: { value: 1 }, inNight: { value: 0 } };

const INTERIOR_CHUNK = /* glsl */ `
uniform float inDay;
uniform float inNight;
varying vec4 vWin;
varying vec3 vWPos;
varying vec3 vWNrm;
float inHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
vec3 inRoom = vec3( 0.0 );
float inStall = 0.0;
`;

const INTERIOR_MAIN = /* glsl */ `
if ( abs( vWin.z ) > 0.01 ) {
  vec3 n = normalize( vWNrm );
  if ( abs( n.y ) < 0.5 ) {
    vec3 t = normalize( cross( vec3( 0.0, 1.0, 0.0 ), n ) );
    vec3 V = normalize( vWPos - cameraPosition );
    vec3 d = vec3( dot( V, t ), V.y, max( -dot( V, n ), 0.02 ) );
    float W = abs( vWin.z ), H = abs( vWin.w );
    bool stall = vWin.z < 0.0;
    // Vitrine de commerce (hauteur négative) : boutique toujours éclairée, étagères garnies au fond.
    bool shop = vWin.w < 0.0;
    // Grandes baies (bureaux) : découpées en pièces de 4 m × 3,4 m.
    vec2 cellSz = W > 3.5 ? vec2( 4.0, 3.4 ) : vec2( W + 1.6, H + 1.5 );
    vec2 p = vWin.xy;
    vec2 cid = floor( ( p + cellSz * 0.5 ) / cellSz );
    vec2 lp = p - cid * cellSz;
    float floorY = -cellSz.y * 0.5 + ( W > 3.5 ? 0.0 : 0.15 ), ceilY = cellSz.y * 0.5;
    float depth = stall ? 3.2 : 3.6;
    float tu = ( ( d.x > 0.0 ? cellSz.x * 0.5 : -cellSz.x * 0.5 ) - lp.x ) / d.x;
    float tv = ( ( d.y > 0.0 ? ceilY : floorY ) - lp.y ) / d.y;
    float td = depth / d.z;
    float tm = min( min( tu, tv ), td );
    vec3 hit = vec3( lp, 0.0 ) + d * tm;
    // Pièce tirée au hasard d'après le centre de la vitre (le même pour tous ses pixels, même quand la vitre
    // chevauche plusieurs cases) ; grille de 2,7 m décalée : aucun centre de fenêtre ne tombe pile sur une limite.
    vec3 wc = vWPos - t * vWin.x - vec3( 0.0, vWin.y, 0.0 );
    float id = inHash( floor( wc * 0.37 + 0.123 ) + vec3( cid, 0.0 ) );
    vec3 wall = mix( vec3( 0.75, 0.7, 0.6 ), vec3( 0.55, 0.62, 0.66 ), step( 0.6, id ) ) * mix( 0.8, 1.05, fract( id * 7.0 ) );
    vec3 col;
    if ( stall ) {
      // Box : planches sombres, litière de paille, fenêtre arrière claire.
      float boards = 0.85 + 0.15 * step( 0.5, fract( ( tm == tu ? hit.y : hit.x ) * 5.0 ) );
      col = tm == tv && d.y < 0.0 ? vec3( 0.55, 0.45, 0.25 ) : vec3( 0.18, 0.13, 0.09 ) * boards;
      if ( tm == td && abs( hit.x ) < 0.35 && hit.y > 0.5 && hit.y < 0.95 ) col = vec3( 1.2, 1.15, 1.0 );
    } else if ( shop && ( tm == td || tm == tu ) ) {
      // Murs de la boutique (fond et côtés) : étagères (planches claires) chargées d'articles de couleurs variées.
      float hx = tm == td ? hit.x : hit.z;
      float shelfY = fract( ( hit.y - floorY ) / 0.55 );
      float item = inHash( vec3( floor( hx / 0.28 ), floor( ( hit.y - floorY ) / 0.55 ), id * 31.0 + ( tm == td ? 0.0 : 7.0 ) ) );
      vec3 goods = mix( vec3( 0.75, 0.55, 0.35 ), mix( vec3( 0.25, 0.32, 0.5 ), vec3( 0.6, 0.2, 0.22 ), step( 0.5, item ) ), step( 0.33, item ) );
      col = hit.y > ceilY - 0.5 ? wall : shelfY < 0.08 ? vec3( 0.62, 0.5, 0.36 ) : ( shelfY < 0.6 && fract( hx / 0.28 ) > 0.12 ? goods : wall * 0.85 );
    } else if ( tm == td ) {
      col = wall;
      // Mobilier bas (canapé, buffet) et cadre au mur.
      if ( hit.y < floorY + 0.8 && abs( hit.x - ( id - 0.5 ) ) < 0.7 ) col = mix( vec3( 0.25, 0.2, 0.18 ), vec3( 0.35, 0.3, 0.45 ), fract( id * 13.0 ) );
      else if ( abs( hit.x + ( id - 0.5 ) * 0.6 ) < 0.3 && abs( hit.y - 0.3 ) < 0.22 ) col = vec3( 0.2, 0.25, 0.3 );
    } else if ( tm == tu ) {
      col = wall * 0.8;
    } else if ( d.y < 0.0 ) {
      col = vec3( 0.32, 0.22, 0.14 ) * ( 0.85 + 0.15 * step( 0.5, fract( hit.z * 6.0 ) ) );
    } else {
      col = vec3( 0.85 );
    }
    // Pénombre selon la profondeur ; rideaux sur une partie des fenêtres.
    col *= exp( -tm * 0.18 );
    if ( !stall && !shop && id > 0.7 && abs( p.x ) > W * 0.18 ) col = mix( vec3( 0.82, 0.78, 0.7 ), vec3( 0.55, 0.6, 0.65 ), fract( id * 5.0 ) ) * 0.9;
    // Éclairage : lumière du jour diffuse, pièces allumées le soir (une sur deux).
    float lit = shop ? 1.3 : step( 0.5, fract( id * 3.7 ) );
    inRoom = col * ( inDay * ( shop ? 0.75 : 0.55 ) + inNight * ( stall ? 0.35 : lit * 1.6 ) * vec3( 1.0, 0.82, 0.6 ) );
    inStall = stall ? 1.0 : 0.0;
    diffuseColor.rgb *= 0.12;
  }
}
`;

export function applyInteriors(material) {
  material.vertexColors = true;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, INTERIOR_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 win;\nvarying vec4 vWin;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWin = win;\nvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvWNrm = mat3( modelMatrix ) * objectNormal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${INTERIOR_CHUNK}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${INTERIOR_MAIN}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 1.0, inStall );')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += inRoom;');
  };
  material.customProgramCacheKey = () => 'st-interiors';
  return material;
}

// Trottoirs de la ville : dessus en dalles de calcaire (même texture que les sols pavés du terrain, en coordonnées du
// monde, avec leur relief), bordures de granit gris sur les faces latérales.
export function applyPavement(material, slab) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.paveSlab = { value: slab };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPvPos;\nvarying vec3 vPvNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPvPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvPvNrm = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D paveSlab;
varying vec3 vPvPos;
varying vec3 vPvNrm;
float pvH = 0.0;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  float top = smoothstep( 0.7, 0.9, vPvNrm.y );
  vec4 pv = texture2D( paveSlab, vPvPos.xz / 2.4 );
  diffuseColor.rgb *= mix( vec3( 0.74, 0.75, 0.77 ), pv.rgb * 1.25, top );
  pvH = pv.a * top;
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( 0.85, 0.72, pvH );')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 sp = -vViewPosition;
  vec3 sx = dFdx( sp ), sy = dFdy( sp );
  vec3 r1 = cross( sy, normal ), r2 = cross( normal, sx );
  float det = dot( sx, r1 );
  float hh = pvH * 0.012;
  vec3 grad = sign( det ) * ( dFdx( hh ) * r1 + dFdy( hh ) * r2 );
  normal = normalize( abs( det ) * normal - grad );
}`);
    addCloudShadows(shader, 'vPvPos');
  };
  material.customProgramCacheKey = () => 'pavement';
  return material;
}

// Éclairage des intérieurs de commerces (suspensions, rails de spots) : jusqu'à 6 points lumineux chauds ajoutés
// au seul matériau de l'intérieur, sans lumière de scène supplémentaire (pas de recompilation de tous les matériaux
// du monde ni de coût par pixel ailleurs). U = { shopL : vec4 (x, y, z monde, intensité), shopLN, shopLC }.
export function shopLightUniforms(points, color = '#ffd9a8', gain = 7) {
  const shopL = Array.from({ length: 6 }, (_, i) => new THREE.Vector4(...(points[i] || [0, -1000, 0, 0])));
  return { shopL: { value: shopL }, shopLN: { value: Math.min(6, points.length) }, shopLC: { value: new THREE.Color(color).multiplyScalar(gain) } };
}
export function applyShopLight(material, U) {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey && material.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : null;
  material.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(material, sh, r);
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 shopL[6];\nuniform int shopLN;\nuniform vec3 shopLC;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      {
        vec3 vpS = -vViewPosition;
        for ( int i = 0; i < 6; i++ ) {
          if ( i >= shopLN ) break;
          vec3 L = ( viewMatrix * vec4( shopL[i].xyz, 1.0 ) ).xyz - vpS;
          float d2 = dot( L, L );
          float nl = max( dot( normal, L * inversesqrt( d2 ) ), 0.0 );
          reflectedLight.directDiffuse += BRDF_Lambert( material.diffuseColor ) * shopLC * shopL[i].w * ( 0.25 + 0.75 * nl ) * ( 10.0 / ( d2 + 3.0 ) );
        }
      }`);
  };
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|shoplight`;
  return material;
}
