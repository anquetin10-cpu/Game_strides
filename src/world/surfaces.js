// Matériaux réalistes des bâtiments sans textures dédiées : le type de surface est déduit de la couleur peinte
// (palette des constructeurs) et de l'orientation de la face, puis le motif (ardoises, tuiles, briques, bardage,
// enduit, pierre, métal, verre) est calculé dans le shader, en coordonnées du monde, avec son relief et sa rugosité.
import * as THREE from 'three';

const SURFACE_CHUNK = /* glsl */ `
uniform sampler2D surfDetail;
varying vec3 vSurfPos;
varying vec3 vSurfNrm;
float sfH = 0.0;
float sfRough = 0.9;
float sfMetal = 0.0;
float sfHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
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
  vec3 t = normalize( abs( n.y ) > 0.999 ? vec3( 1.0, 0.0, 0.0 ) : cross( vec3( 0.0, 1.0, 0.0 ), n ) );
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
  if ( sloped && mx < 0.5 && !warm ) {
    // Ardoise : petites plaques rectangulaires, bords marqués, légère brillance.
    float id;
    float h = sfRows( uv, vec2( 0.32, 0.2 ), id );
    sfH = h * 0.6 * detW;
    tint = mix( 0.82, 1.12, id ) * mix( 0.92, 1.05, dA.r );
    sfRough = mix( 0.55, 0.75, id );
  } else if ( sloped && warm && sat > 0.2 ) {
    // Tuiles mécaniques en terre cuite : ondulations et rangs.
    float id;
    float h = sfRows( uv, vec2( 0.24, 0.32 ), id );
    float wave = 0.5 + 0.5 * sin( uv.x / 0.24 * 6.2831 );
    sfH = ( h * 0.5 + wave * 0.5 ) * 0.8 * detW;
    tint = mix( 0.82, 1.1, id ) * mix( 0.9, 1.05, dA.r ) * mix( 0.85, 1.0, dB.g );
    sfRough = 0.8;
  } else if ( vertical && warm && sat > 0.3 && mx > 0.5 && mx < 0.85 && c.g < c.r * 0.75 ) {
    // Brique : appareil en panneresses, joints creux et clairs.
    float row = floor( uv.y / 0.075 );
    float u = uv.x / 0.225 + row * 0.5;
    float id = sfHash( vec2( floor( u ), row ) );
    float fu = fract( u ), fv = fract( uv.y / 0.075 );
    float joint = 1.0 - smoothstep( 0.0, 0.05, fu ) * smoothstep( 1.0, 0.95, fu ) * smoothstep( 0.0, 0.14, fv ) * smoothstep( 1.0, 0.86, fv );
    sfH = ( 1.0 - joint ) * 0.8 * detW;
    tint = mix( mix( 0.78, 1.12, id ) * mix( 0.9, 1.05, dA.r ), 1.45, joint * detW );
    sfRough = 0.9;
  } else if ( warm && sat > 0.25 && mx < 0.72 ) {
    // Bois : bardage vertical (façades) ou poutres, fil du bois et nœuds.
    float board = vertical ? fract( uv.x / 0.16 ) : 0.5;
    float gap = vertical ? 1.0 - smoothstep( 0.0, 0.05, board ) * smoothstep( 1.0, 0.95, board ) : 0.0;
    vec4 g = texture2D( surfDetail, vec2( vertical ? uv.x * 3.0 : uv.x * 0.3, vertical ? uv.y * 0.25 : uv.y * 3.0 ) );
    float grain = g.r;
    float id = sfHash( vec2( floor( uv.x / 0.16 ), 3.0 ) );
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
    sfRough = 0.92;
  } else if ( mx < 0.2 && sat < 0.2 ) {
    // Métal peint sombre, menuiseries : satiné.
    sfH = dA.r * 0.05;
    sfRough = 0.45;
    sfMetal = 0.0;
  }
  diffuseColor.rgb *= mix( 1.0, tint, 0.4 + 0.6 * ( 1.0 - smoothstep( 40.0, 160.0, dist ) ) );
}
`;

// Applique le shader de surfaces à un matériau standard à couleurs de sommet (bâtiments, mobilier, décors).
export function applySurfaces(material, detailTexture) {
  material.vertexColors = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.surfDetail = { value: detailTexture };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfPos;\nvarying vec3 vSurfNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvSurfNrm = mat3( modelMatrix ) * objectNormal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SURFACE_CHUNK}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${SURFACE_MAIN}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = sfRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = sfMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = sfBump( -vViewPosition, normal, sfH * 0.012 );');
  };
  material.customProgramCacheKey = () => 'st-surfaces';
  return material;
}
