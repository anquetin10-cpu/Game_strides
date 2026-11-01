// Maison de l'Écurie du Val : on y entre à pied par la porte sur la cour (action « Entrer »), on en ressort par
// « Sortir ». Même fonctionnement que les commerces (shops.js) :
// - à cheval, le joueur met pied à terre ; un cheval mené en main est lâché : il reste dehors, là où il est ;
// - transition courte (fondu), personnage placé dans l'entrée, caméra intérieure (game.indoor, camera.js) ; dedans,
//   ni pluie ni sifflet, et seules les actions de la maison sont proposées (interact.js : rien à travers les murs) ;
// - l'intérieur est construit à l'approche (une étape par image, moins de LOAD_R mètres), libéré au loin (UNLOAD_R) ;
//   il n'est jamais visible du dehors (porte fermée, vitrages à effet de pièce) : il n'est dessiné que joueur dedans ;
// - la sauvegarde enregistre la porte et save.data.indoorHome : à la reprise, le joueur est replacé dans la maison ;
// - sécurité : déplacé hors de la maison (mission, téléportation), le joueur n'est plus « à l'intérieur ».
// Le lit propose « Se coucher » : menu du sommeil (g.rest.openBed, système de repos), sinon un simple message.
import { HOME } from '../world/sites.js';
import { houseLayout, houseAnchor, roomAt } from '../world/homeGeo.js';
import { h } from '../ui/dom.js';
import { t } from '../core/i18n.js';

export const LOAD_R = 30;
// Libéré loin de l'Écurie du Val seulement : pas de reconstruction à chaque retour dans la cour, au club-house ou à la
// carrière (l'intérieur pèse environ 27 000 triangles, non dessinés tant que le joueur est dehors).
export const UNLOAD_R = 140;
// Épaisseur des murs : un point plus loin que cela à l'intérieur de l'emprise est dans les pièces.
const WALL_IN = 0.45;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class HomeManager {
  constructor(game) {
    this.game = game;
    this.busy = false; // transition en cours
    this._in = false;
    this.layout = houseLayout();
    this.lying = null; // position avant de s'allonger (lieDown)
    this._fadeEl = null;
    const g = game;
    g.interact.add('home:door', {
      label: t('Entrer'), icon: 'home', r: 2.4, priority: 2, modes: ['foot'],
      getPos: () => this.anchor('door'),
      // (seulement du dehors : jamais à travers la façade, depuis le salon)
      when: () => !this._in && !this.busy && !g.player.locked && !g.shops?.current && !this.contains(g.player.human.pos.x, g.player.human.pos.z),
      action: () => this.enter(),
    });
    g.interact.add('home:exit', {
      label: t('Sortir'), icon: 'back', r: 1.7, priority: 2.5, modes: ['foot'],
      getPos: () => this.anchor('exit'),
      when: () => this._in && !this.busy && !g.player.locked,
      action: () => this.exit(),
    });
    g.interact.add('home:bed', {
      label: t('Se coucher'), icon: 'bed', r: 1.8, priority: 3, modes: ['foot'],
      getPos: () => this.anchor('bed'),
      when: () => this._in && !this.busy && !g.player.locked && this.room() === 'chambre',
      action: () => {
        if (g.rest?.openBed) g.rest.openBed();
        else g.hud.toast(t('Le lit est fait.'));
      },
    });
    // Petits gestes du quotidien, sans effet sur la partie.
    g.interact.add('home:sink', {
      label: t('Boire un verre d’eau'), icon: 'hand', r: 1.4, priority: 1.6, modes: ['foot'],
      getPos: () => this.anchor('sink'),
      when: () => this._in && !this.busy && !g.player.locked && this.room() === 'cuisine',
      action: () => g.hud.toast(t('Un grand verre d’eau fraîche.')),
    });
    g.interact.add('home:basin', {
      label: t('Se rafraîchir'), icon: 'hand', r: 1.4, priority: 1.6, modes: ['foot'],
      getPos: () => this.anchor('basin'),
      when: () => this._in && !this.busy && !g.player.locked && this.room() === 'sdb',
      action: () => g.hud.toast(t('Un peu d’eau fraîche sur le visage : ça réveille.')),
    });
  }

  get world() {
    return this.game.world;
  }
  // Vrai quand le joueur est dans la maison.
  get inside() {
    return this._in;
  }
  // Repère en coordonnées du monde : 'bed' (côté du lit, face au lit), 'door' (dehors, devant la porte, face à la cour),
  // 'spawn' (dedans, dans l'entrée), 'exit', 'lie' (couché), 'sink', 'basin', 'salon'. { x, z, heading } ou null.
  anchor(name) {
    return houseAnchor(name);
  }
  // Point (x, z) du monde dans l'emprise de la maison (marge en mètres).
  contains(x, z, margin = 0) {
    const S = HOME.house;
    return Math.abs(x - S.x) < S.w / 2 + margin && Math.abs(z - S.z) < S.d / 2 + margin;
  }
  // Pièce où se trouve le joueur (ou le point donné) : 'salon', 'cuisine', 'chambre', 'sdb' ou null.
  room(x, z) {
    const p = this.game.player.human.pos;
    return roomAt((x ?? p.x) - HOME.house.x, (z ?? p.z) - HOME.house.z);
  }

  // ---------- Chargement à la demande ----------
  update() {
    const g = this.game;
    const w = this.world;
    if (!w?.house) return;
    const f = g.player.focusPos;
    const S = HOME.house;
    const d = Math.hypot(f.x - S.x, f.z - S.z);
    // Une étape de construction par image à l'approche ; libéré au loin (jamais avec le joueur dedans).
    if (d < LOAD_R && !w.house.interior && !(this._retryAt > g.time)) {
      try {
        w.homeInteriorStep();
      } catch (e) {
        // Échec : nouvel essai dans quelques secondes (l'entrée, elle, reconstruit tout d'un coup).
        console.warn('[maison] intérieur non construit', e);
        this._retryAt = g.time + 5;
      }
    } else if (d > UNLOAD_R && (w.house.interior || w.house.steps) && !this._in) w.unloadHomeInterior();
    // Lumière des plafonniers et des lampes : plus douce le jour, chaude la nuit.
    const I = w.house.interior;
    if (I) {
      I.group.visible = this._in;
      I.U.shopLC.value.copy(I.color).multiplyScalar(0.55 + 0.45 * (g.sky?.nightFactor || 0));
    }
    // Couché sur le lit : le personnage y reste (pose entretenue à chaque image).
    if (this.lying) this._holdLying();
    // Sécurité : le joueur a été déplacé hors de la maison (mission, téléportation), ou est entré ailleurs.
    if (this._in && !this.busy) {
      const p = g.player.human.pos;
      if (g.player.mode !== 'foot' || !this.contains(p.x, p.z, 0.5) || (g.indoor && !g.indoor.home)) this._leaveState();
      else if (!g.indoor) this._setIndoor();
    } else if (!this._in && !this.busy && g.player.mode === 'foot' && !g.shops?.current && !g.indoor) {
      // Inverse : joueur à pied dans les pièces sans être « dedans » (retour d'un défi rejouable lancé de la maison,
      // ancienne sauvegarde prise contre un pignon de l'ancienne maison, plus petite…) : il est dans la maison.
      const p = g.player.human.pos;
      if (this.contains(p.x, p.z, -WALL_IN)) this._adopt();
    }
  }

  // ---------- Entrer / sortir ----------
  _fade(on) {
    if (!this._fadeEl) {
      this._fadeEl = h('div.shop-fade');
      document.body.appendChild(this._fadeEl);
    }
    this._fadeEl.classList.toggle('on', on);
  }

  // Le joueur est (déjà) dans les pièces : état « dedans » rétabli sur place (intérieur chargé et visible).
  _adopt() {
    const g = this.game;
    try {
      this.world.loadHomeInterior().group.visible = true;
    } catch (e) {
      console.warn('[maison] intérieur non chargé', e);
      return;
    }
    this._in = true;
    this._setIndoor();
    g.save.data.indoorHome = true;
    g.cam.snap(g.player.human.pos, g.player.human.heading);
  }

  // Cheval ou véhicule laissé dans l'emprise de la maison (ancienne sauvegarde : la maison était plus petite) : remis
  // à sa place habituelle, devant l'écurie.
  evict() {
    const g = this.game;
    const hs = g.mainHorse;
    if (hs && !hs.hiddenInTruck && !hs.inBox && this.contains(hs.pos.x, hs.pos.z, 1.0)) hs.setPosition(HOME.horse.x, HOME.horse.z, HOME.horse.rot);
    const spots = [[g.truck, HOME.truck], [g.van, HOME.master], [g.defender, HOME.defender]];
    for (const [v, s] of spots) if (v?.pos && this.contains(v.pos.x, v.pos.z, 2.6)) v.setPosition?.(s.x, s.z, s.rot);
    for (const v of g.drivables || []) {
      if (!v?.pos || spots.some(([w]) => w === v) || !this.contains(v.pos.x, v.pos.z, 2.6)) continue;
      const hm = v.home;
      if (hm && Number.isFinite(hm.x)) v.setPosition?.(hm.x, hm.z, hm.heading ?? hm.rot ?? 0);
    }
  }

  // Point libre devant la façade, hors de l'emprise (un véhicule garé devant la porte ne repousse pas le joueur dedans).
  _outsideSpot() {
    const g = this.game;
    const d = this.anchor('door');
    const probe = { x: 0, y: 0, z: 0 };
    for (const dz of [0, 0.8, 1.6, 2.4, 3.2]) {
      for (const dx of [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1, 2.8, -2.8, 3.5, -3.5]) {
        probe.x = d.x + dx;
        probe.z = d.z + dz;
        probe.y = 0;
        const x0 = probe.x, z0 = probe.z;
        g.colliders.resolve(probe, 0.5, -Infinity);
        if (Math.hypot(probe.x - x0, probe.z - z0) < 0.05 && !this.contains(probe.x, probe.z, 0.4)) return { x: x0, z: z0 };
      }
    }
    return { x: HOME.spawn.x, z: HOME.spawn.z };
  }

  _setIndoor() {
    const g = this.game;
    g.indoor = { id: 'maison', spec: HOME.house, home: true, contains: (x, z) => this.contains(x, z, 0.05) };
    g.world.activeHome = true;
  }

  async enter({ instant = false } = {}) {
    const g = this.game;
    const p = g.player;
    if (this.busy || this._in || p.mode === 'drive' || p.locked || g.shops?.current) return false;
    this.busy = true;
    // Commandes verrouillées pendant le fondu : un double appui ne lance pas une autre action (« Monter »…).
    p.locked = true;
    if (!instant) {
      this._fade(true);
      await wait(240);
    }
    let ok = false;
    try {
      if (p.mode === 'ride') p.dismount(true);
      // Cheval mené en main : on lâche la longe, il attend dehors, là où il est.
      if (p.transport?.led) p.transport.release(true);
      const hs = g.mainHorse;
      if (hs && !hs.hiddenInTruck && !hs.inBox && !hs.frozen) {
        hs.ai = null;
        hs.control.mag = 0;
      }
      this.world.loadHomeInterior().group.visible = true;
      const sp = this.anchor('spawn');
      p.human.setPosition(sp.x, sp.z, sp.heading);
      p.focusPos = p.human.pos;
      this._in = true;
      this._setIndoor();
      g.save.data.indoorHome = true;
      g.cam.snap(p.human.pos, sp.heading);
      g.audio.shopDoor?.();
      if (!instant) g.hud.toast(t('Maison · Écurie du Val'), 'home');
      g.bus?.emit('home:enter', {});
      g.saveSoon();
      ok = true;
    } catch (e) {
      console.warn('[maison] entrée impossible', e);
      g.hud.toast(t('La porte est coincée. Réessaie dans un instant.'));
    }
    if (!instant) {
      await wait(60);
      this._fade(false);
    }
    p.locked = false;
    this.busy = false;
    return ok;
  }

  async exit({ instant = false } = {}) {
    const g = this.game;
    if (!this._in || this.busy) return false;
    this.busy = true;
    const wasLocked = g.player.locked;
    g.player.locked = true;
    if (!instant) {
      this._fade(true);
      await wait(240);
    }
    this.lieDown(false);
    const out = this.anchor('door');
    g.player.human.setPosition(out.x, out.z, out.heading);
    g.colliders.resolve(g.player.human.pos, 0.5, -Infinity);
    // Repoussé dans la maison (véhicule garé contre la porte…) : premier point libre devant la façade.
    if (this.contains(g.player.human.pos.x, g.player.human.pos.z, 0.4)) {
      const s = this._outsideSpot();
      g.player.human.setPosition(s.x, s.z, out.heading);
    }
    this._leaveState();
    g.cam.snap(g.player.human.pos, out.heading);
    g.audio.shopDoor?.();
    g.bus?.emit('home:exit', {});
    g.saveSoon();
    if (!instant) {
      await wait(60);
      this._fade(false);
    }
    g.player.locked = wasLocked;
    this.busy = false;
    return true;
  }

  _leaveState() {
    const g = this.game;
    if (this.lying) this.lieDown(false);
    this._in = false;
    if (g.indoor?.home) g.indoor = null;
    if (g.world) {
      g.world.activeHome = false;
      if (g.world.house?.interior) g.world.house.interior.group.visible = false;
    }
    g.save.data.indoorHome = false;
  }

  // Reprise d'une sauvegarde faite dans la maison : le joueur est devant la porte (position enregistrée) et rentre.
  async resume() {
    const g = this.game;
    if (this._in || !g.save.data.indoorHome || g.shops?.current) return;
    const ok = await this.enter({ instant: true });
    if (!ok) g.save.data.indoorHome = false;
  }

  // Position à enregistrer quand le joueur est dans la maison : devant la porte, face à la cour.
  savedPos() {
    return this._in ? this.anchor('door') : null;
  }

  // ---------- Couché sur le lit (aide visuelle pour le fondu du sommeil) ----------
  // lieDown(true) : le personnage s'allonge sur le lit (à pied dans la chambre seulement) ; lieDown(false) : il se
  // relève à côté du lit. Renvoie vrai si l'état a changé. Le verrouillage des commandes reste au système de repos.
  lieDown(on) {
    const g = this.game;
    const hu = g.player?.human;
    if (!hu) return false;
    if (on) {
      if (this.lying || !this._in || g.player.mode !== 'foot') return false;
      this.lying = { x: hu.pos.x, z: hu.pos.z, heading: hu.heading };
      this._holdLying();
      return true;
    }
    if (!this.lying) return false;
    this.lying = null;
    const b = this.anchor('bed');
    if (this._in) hu.setPosition(b.x, b.z, b.heading);
    hu.mesh.rotation.set(0, hu.heading, 0, 'XYZ');
    g.player.focusPos = hu.pos;
    return true;
  }

  // Après la mise à jour du personnage (et sa résolution des collisions, qui le repousse hors du lit) : maillage couché
  // sur le dos sur la couette, pieds vers le pied du lit, tête sur l'oreiller.
  _holdLying() {
    const hu = this.game.player.human;
    const a = this.anchor('lie');
    hu.pos.x = a.x;
    hu.pos.z = a.z;
    hu.heading = a.heading;
    hu.speed = 0;
    hu.mesh.position.set(a.x, this.world.house.y + 0.6, a.z);
    hu.mesh.rotation.set(-Math.PI / 2, a.heading, 0, 'YXZ');
  }
}
