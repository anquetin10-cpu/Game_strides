// Fers d'or Strides cachés dans le monde (objets à collectionner façon GTA).
import * as THREE from 'three';
import { horseshoeSpriteTexture } from '../world/textures.js';
import { formatMoney } from '../core/math.js';

export const HORSESHOES = [
  [-498, -392], [-520, -417], [120, 487], [148, -370], [20, -276], [330, 230], [-515, 420], [-470, 520],
  [-470, -100], [108, -312], [330, -262], [-212, 271], [470, 455], [400, 540], [495, -270], [575, -388],
  [-12, -96], [180, 330], [-560, 150], [-160, 232],
];

export class Collectibles {
  constructor(game) {
    this.game = game;
    this.total = HORSESHOES.length;
    this.items = [];
    const geo = new THREE.TorusGeometry(0.42, 0.11, 6, 14, Math.PI * 1.45);
    geo.rotateZ(-Math.PI * 0.225 - Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: '#e7c06a', emissive: '#6b4a10', emissiveIntensity: 0.6 });
    const glowMat = new THREE.SpriteMaterial({ map: horseshoeSpriteTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 });
    HORSESHOES.forEach(([x, z], i) => {
      if (game.save.data.horseshoes.includes(i)) return;
      const g = new THREE.Group();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      g.add(m);
      const s = new THREE.Sprite(glowMat);
      s.scale.set(2.6, 2.6, 1);
      g.add(s);
      const y = Math.max(game.terrain.getHeight(x, z), game.terrain.waterDepth(x, z) > 0 ? game.terrain.getHeight(x, z) + game.terrain.waterDepth(x, z) : -99);
      g.position.set(x, y + 1.3, z);
      game.scene.add(g);
      this.items.push({ i, x, z, g, m });
    });
  }

  update(dt) {
    const g = this.game;
    const f = g.player.focus.pos;
    const t = g.time;
    for (let k = this.items.length - 1; k >= 0; k--) {
      const it = this.items[k];
      const d = Math.hypot(f.x - it.x, f.z - it.z);
      it.g.visible = d < 220;
      if (!it.g.visible) continue;
      it.m.rotation.y = t * 2;
      it.g.position.y += Math.sin(t * 2 + it.i) * 0.002;
      if (d < 2.6) {
        g.scene.remove(it.g);
        this.items.splice(k, 1);
        const d2 = g.save.data;
        d2.horseshoes.push(it.i);
        d2.money += 25;
        g.updateWallet();
        g.audio.coin();
        const n = d2.horseshoes.length;
        g.hud.toast(`Fer d’or ${n}/${this.total} · +${formatMoney(25)}`, 'gold');
        if (n === this.total) {
          d2.money += 500;
          g.hud.big('COLLECTION COMPLÈTE', 'Les 20 fers d’or · +500 €', 3500);
          g.audio.levelUp();
        }
        g.saveSoon();
      }
    }
  }

  blips() {
    return this.items.map((it) => ({ x: it.x, z: it.z, kind: 'shoe', small: true }));
  }
}
