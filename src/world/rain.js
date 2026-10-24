// Pluie : traînées de gouttes autour de la caméra (calculées dans le shader, aucun coût CPU par goutte).
import * as THREE from 'three';

const vert = /* glsl */ `
uniform float time;
uniform float intensity;
uniform vec3 camPos;
uniform vec2 wind;
attribute float seed;
attribute float tip;
varying float vA;
const float BOX = 46.0;
const float HGT = 26.0;
void main() {
  // Position de base pseudo-aléatoire dans une boîte qui suit la caméra (enroulement modulo).
  vec3 b = position;
  float speed = 9.0 + seed * 3.0;
  float y = mod( b.y - time * speed, HGT );
  vec3 p = vec3( b.x, y, b.z );
  vec3 c = camPos + vec3( -BOX * 0.5, -8.0, -BOX * 0.5 );
  p.xz = mod( p.xz - camPos.xz + BOX * 0.5, BOX ) + c.xz;
  p.y += c.y;
  // Traînée : l'extrémité est décalée selon la vitesse de chute et le vent.
  p += tip * vec3( wind.x * 0.06, 0.55 + seed * 0.25, wind.y * 0.06 );
  float keep = step( seed, intensity );
  vA = keep * ( 0.18 + 0.2 * ( 1.0 - tip ) ) * ( 1.0 - smoothstep( 14.0, 23.0, distance( p.xz, camPos.xz ) ) );
  gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
}`;
const frag = /* glsl */ `
uniform vec3 tint;
varying float vA;
void main() {
  if ( vA < 0.003 ) discard;
  gl_FragColor = vec4( tint, vA );
  #include <colorspace_fragment>
}`;

export class Rain {
  constructor(scene, count = 3000) {
    const pos = new Float32Array(count * 6);
    const seed = new Float32Array(count * 2);
    const tip = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * 46, y = Math.random() * 26, z = Math.random() * 46, s = Math.random();
      pos.set([x, y, z, x, y, z], i * 6);
      seed[i * 2] = seed[i * 2 + 1] = s;
      tip[i * 2] = 0;
      tip[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('tip', new THREE.BufferAttribute(tip, 1));
    this.uniforms = {
      time: { value: 0 }, intensity: { value: 0 }, camPos: { value: new THREE.Vector3() },
      wind: { value: new THREE.Vector2(2, 1) }, tint: { value: new THREE.Color(0.75, 0.78, 0.82) },
    };
    this.lines = new THREE.LineSegments(g, new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms, transparent: true, depthWrite: false }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 3;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  update(dt, camera, intensity, light = 1) {
    const U = this.uniforms;
    U.time.value += dt;
    U.intensity.value = intensity;
    U.camPos.value.copy(camera.position);
    U.tint.value.setRGB(0.55 * light + 0.04, 0.58 * light + 0.04, 0.62 * light + 0.05);
    this.lines.visible = intensity > 0.01;
  }
}
