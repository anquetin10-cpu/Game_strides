// Voitures réalistes (réglage « Modèles 3D ») : la caisse classique d'un véhicule conduisible est remplacée à
// l'affichage par un modèle réaliste préparé par scripts/real/build-cars.mjs (sans logo ni plaque). Le véhicule garde
// sa physique, ses collisions et sa suspension (le modèle est porté par la caisse classique) ; les roues du modèle
// tournent et braquent comme celles du jeu, la peinture prend la couleur du véhicule.
import * as THREE from 'three';

// Type de véhicule du jeu → modèle réaliste.
export const CAR_MODELS = { duster: 'car_defender', clio: 'car_punto' };

export class RealCar {
  constructor(vehicle, root) {
    this.v = vehicle;
    this.root = root;
    this.mats = [];
    const car = root.children[0] || root;
    const ex = car.userData || {};
    // Taille : même empattement que le véhicule du jeu (roues sous les passages de roue de sa collision).
    this.scale = ex.wb ? vehicle.spec.wb / ex.wb : 1;
    root.scale.setScalar(this.scale);
    this.realR = (ex.r || vehicle.spec.r) * this.scale;
    this.wheels = [];
    root.traverse((o) => {
      if (/^wheel\d/.test(o.name) && o.userData.side) {
        o.rotation.order = 'YXZ';
        this.wheels.push(o);
      }
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      let m = o.material;
      if (m.userData?.paint || m.transmission > 0) {
        m = o.material = m.clone();
        this.mats.push(m);
      }
      // Peinture : couleur du véhicule.
      if (m.userData?.paint) m.color.set(vehicle.color);
      // Vitres : verre teinté transparent (la transmission physique coûte un second rendu de la scène).
      if (m.transmission > 0) {
        m.transmission = 0;
        m.transparent = true;
        m.opacity = 0.62;
        m.depthWrite = false;
        m.color.set('#141a1c');
        m.roughness = 0.05;
        o.renderOrder = 3;
      }
    });
    vehicle.body.add(root);
    this.setActive(true);
  }

  setActive(on) {
    this.root.visible = on;
    // Caisse et vitres classiques retirées de l'affichage, roues de la circulation masquées pour ce véhicule.
    for (const c of this.v.body.children) if (c !== this.root) c.layers.set(on ? 31 : 0);
    this.v.realWheels = on;
  }

  update() {
    const v = this.v;
    if (!v.mesh.visible) return;
    // Rotation des roues : même distance parcourue que les roues du jeu (rayon du modèle différent).
    const spin = (v.spin * v.spec.r) / this.realR;
    for (const w of this.wheels) {
      w.rotation.x = spin;
      w.rotation.y = w.userData.front ? (w.userData.side > 0 ? v.steerL : v.steerR) || 0 : 0;
    }
  }

  dispose() {
    this.setActive(false);
    this.root.parent?.remove(this.root);
    for (const m of this.mats) m.dispose();
  }
}
