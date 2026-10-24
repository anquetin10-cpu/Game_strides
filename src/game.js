// Chef d'orchestre : initialisation, états (titre / jeu / pause / photo), boucle, services transverses.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Bus } from './core/bus.js';
import { SaveSystem, levelFor } from './core/save.js';
import { Audio } from './core/audio.js';
import { Input } from './core/input.js';
import { clamp, formatMoney, mulberry32 } from './core/math.js';
import { World } from './world/world.js';
import { Colliders } from './world/colliders.js';
import { POI, ZONES, shoreZ, forestDensity, nearestRoad, zoneDist } from './world/layout.js';
import { HOME, POLE, TOWN } from './world/sites.js';
import { Horse } from './entities/horse.js';
import { Human } from './entities/human.js';
import { Truck } from './entities/truck.js';
import { FollowCamera } from './entities/camera.js';
import { Player } from './gameplay/player.js';
import { Interactions } from './gameplay/interact.js';
import { Obstacles } from './gameplay/obstacles.js';
import { GPS } from './gameplay/gps.js';
import { MissionManager } from './gameplay/missions.js';
import { Ambient } from './gameplay/npcs.js';
import { Collectibles } from './gameplay/collectibles.js';
import { Activities } from './gameplay/activities.js';
import { HORSES, SHOP, FIRST_NAMES } from './gameplay/data.js';
import { HUD } from './ui/hud.js';
import { Phone } from './ui/phone.js';
import { Screens } from './ui/screens.js';
import { buildMapImage } from './ui/minimap.js';
import { Grass } from './world/grass.js';
import { Particles } from './world/particles.js';
import { installCare } from './gameplay/condition.js';
import { Birds } from './world/birds.js';
import { HoofPrints } from './world/hoofprints.js';

const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export class Game {
  constructor() {
    this.bus = new Bus();
    this.save = new SaveSystem();
    this.audio = new Audio();
    this.state = 'loading';
    this.time = 0;
    this.horses = [];
    this.humans = [];
    this.vehicles = [];
    this.cheerT = 0;
    this.params = new URLSearchParams(location.search);
    this.debug = this.params.has('debug');
  }

  async boot() {
    const d = this.save.load();
    document.body.classList.toggle('desktop', !IS_TOUCH);
    // Rendu.
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Rendu photoréaliste : radiance HDR (ciel physique, soleil), tone mapping filmique.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.42;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 1500);
    this.colliders = new Colliders();
    this.uiRoot = document.getElementById('ui');
    this.screens = new Screens(this, this.uiRoot);
    this.screens.showLoading();
    this.applyQuality(d.settings.quality, true);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    // iOS : sauvegarde à la mise en arrière-plan, rechargement si le contexte WebGL est perdu.
    window.addEventListener('pagehide', () => this.saveNow());
    // iOS peut suspendre l'audio : reprise au prochain geste.
    window.addEventListener('pointerup', () => {
      const c = this.audio.ctx;
      if (c && c.state !== 'running' && this.save.data.settings.sound) c.resume();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'play') this.saveNow();
      this.last = performance.now();
    });
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.saveNow();
    });
    this.canvas.addEventListener('webglcontextrestored', () => location.reload());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));

    // Monde.
    this.world = new World(this.scene, this.colliders);
    this.world.textureSize = IS_TOUCH ? 2048 : 2048;
    await this.world.build((p, m) => this.screens.setLoading(p * 0.8, m));
    this.terrain = this.world.terrain;
    this.sky = this.world.sky;
    this.grass = new Grass(this.scene, this.terrain, this.world.grassMask, IS_TOUCH ? 3200 : 4500);
    this.particles = new Particles(this.scene);
    this.birds = new Birds(this.scene);
    this.hoofPrints = new HoofPrints(this.scene, this.terrain);
    this.resize();
    this.screens.setLoading(0.82, 'Chevaux et cavaliers');
    await new Promise((r) => setTimeout(r, 0));

    // Systèmes.
    this.input = new Input(this.canvas, document.getElementById('touch'));
    this.interact = new Interactions(this);
    this.cam = new FollowCamera(this.camera, this);
    this.cam.sens = d.settings.camSens || 1;
    this.obstacles = new Obstacles(this);
    this.hud = new HUD(this, this.uiRoot);
    this.hud.el.classList.add('hidden');
    this.phone = new Phone(this, document.body);
    this.gps = new GPS(this);
    this.missions = new MissionManager(this);
    this.player = new Player(this, d.avatar);
    this.truck = new Truck(this, { x: HOME.truck.x, z: HOME.truck.z, heading: HOME.truck.rot });
    this.player.truck = this.truck;
    this.vehicles.push(this.truck);
    this.spawnMainHorse(d.activeHorse);
    this.ambient = new Ambient(this);
    this.screens.setLoading(0.9, 'Fers d’or et parcours');
    await new Promise((r) => setTimeout(r, 0));
    this.collectibles = new Collectibles(this);
    this.activities = new Activities(this);
    this.mapImage = buildMapImage(this.world);
    this.hud.minimap.setImage(this.mapImage);
    this._worldInteractions();
    installCare(this);
    this._events();
    this.placeFromSave();
    this.updateWallet();
    this.audio.setEnabled(d.settings.sound);
    this.screens.setLoading(0.97, 'Préparation des shaders');
    await new Promise((r) => setTimeout(r, 0));
    this.sky.update(17.5, this.player.focus.pos, 0);
    this.sky.updateEnvironment(this.renderer, 0, true);
    this.renderer.compile(this.scene, this.camera);
    this.screens.setLoading(1, 'Prêt');
    this.screens.hideLoading();
    this.last = performance.now();
    this._fpsAcc = { t: 0, n: 0 };
    this.renderer.setAnimationLoop((t) => this.frame(t));
    window.__game = this;
    if (this.params.has('autostart')) this.startGame(!this.save.hasSave(), { name: 'Test', avatar: 'f' });
    else this.showTitle();
  }

  // ---------- Qualité ----------
  applyQuality(q = 'auto', initial = false) {
    const dpr = window.devicePixelRatio || 1;
    this.quality = q;
    if (q === 'low') this.pixelRatio = 1;
    else if (q === 'high') this.pixelRatio = Math.min(dpr, 2);
    else this.pixelRatio = Math.min(dpr, IS_TOUCH ? 1.5 : 1.75);
    this.maxPixelRatio = q === 'auto' ? Math.min(dpr, IS_TOUCH ? 2 : 2) : this.pixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    const shadows = q !== 'low';
    if (this.sky) {
      this.sky.sun.castShadow = shadows;
      this.sky.setShadowSize(q === 'high' ? 2048 : IS_TOUCH ? 1024 : 2048, 55);
    }
    this._shadowsOn = shadows;
    if (!initial) this.resize();
  }

  _adapt(dt) {
    if (this.quality !== 'auto' || this.state !== 'play') return;
    const a = this._fpsAcc;
    a.t += dt;
    a.n++;
    if (a.t < 3) return;
    const fps = a.n / a.t;
    a.t = 0;
    a.n = 0;
    this.fps = fps;
    if (fps < 42 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    } else if (fps < 30 && this._shadowsOn) {
      this._shadowsOn = false;
      this.sky.sun.castShadow = false;
    } else if (fps > 58 && this.pixelRatio < this.maxPixelRatio) {
      this.pixelRatio = Math.min(this.maxPixelRatio, this.pixelRatio + 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.hud?.resize();
    this.particles?.setViewport(h * this.renderer.getPixelRatio());
  }

  // ---------- Entités ----------
  spawnHorse(def, x, z, heading = 0, opts = {}) {
    const h = new Horse(this, def, { ...opts, x, z, heading });
    this.horses.push(h);
    return h;
  }
  spawnHuman(outfit, x, z, heading = 0, opts = {}) {
    const h = new Human(this, outfit, { ...opts, x, z, heading });
    this.humans.push(h);
    return h;
  }
  despawn(e) {
    if (!e) return;
    if (e instanceof Horse) {
      if (e.rider && !e.rider.isPlayer) {
        e.rider.mounted = null;
        e.rider.mesh.parent?.remove(e.rider.mesh);
      }
      if (e.rider?.isPlayer) this.player.dismount(true);
      this.horses = this.horses.filter((x) => x !== e);
      e.dispose();
    } else if (e instanceof Human) {
      if (e.mounted) {
        e.mounted.rider = null;
        e.mounted.bones.body.remove(e.mesh);
        e.mounted = null;
      }
      this.humans = this.humans.filter((x) => x !== e);
      e.dispose();
    }
  }

  applyUpgrades(horse) {
    const mods = { speed: 0, jump: 0, stamina: 0, clearance: 0 };
    for (const id of this.save.data.upgrades) {
      const s = SHOP.find((x) => x.id === id);
      if (!s) continue;
      for (const k of Object.keys(mods)) if (s.effect[k]) mods[k] += s.effect[k];
    }
    horse.mods = mods;
  }

  spawnMainHorse(id, at = null) {
    const def = HORSES[id] || HORSES.comete;
    const pos = at || { x: HOME.horse.x, z: HOME.horse.z, heading: HOME.horse.rot };
    const h = this.spawnHorse(def, pos.x, pos.z, pos.heading ?? 0, { player: true, cond: this.save.data.horseCare?.[id] });
    h.visibleDist = 600;
    this.applyUpgrades(h);
    this.mainHorse = h;
    this.player.setHorse(h);
    return h;
  }

  setActiveHorse(id) {
    const d = this.save.data;
    if (!d.horses.includes(id)) return;
    const old = this.mainHorse;
    const wasRiding = this.player.mode === 'ride' && this.player.horse === old;
    if (wasRiding) this.player.dismount(true);
    const at = { x: old.pos.x, z: old.pos.z, heading: old.heading };
    this.despawn(old);
    d.activeHorse = id;
    this.spawnMainHorse(id, at);
    if (wasRiding) this.player.mount();
    this.hud.toast(`${HORSES[id].name} est sellé(e).`);
    this.saveSoon();
  }

  buyHorse(id) {
    const d = this.save.data;
    const hd = HORSES[id];
    if (d.horses.includes(id)) return false;
    if (d.money < hd.price) {
      this.hud.toast('Solde insuffisant.');
      return false;
    }
    d.money -= hd.price;
    d.horses.push(id);
    this.updateWallet();
    this.audio.coin();
    this.message('Normandie Horse Transport', 'NH', `${hd.name} a été livré(e) à ton écurie. Sélectionne-le dans « Mes chevaux ». Transport réservé via Strides.`);
    this.saveNow();
    return true;
  }

  buyUpgrade(id) {
    const d = this.save.data;
    const s = SHOP.find((x) => x.id === id);
    if (!s || d.upgrades.includes(id)) return false;
    if (d.money < s.price) {
      this.hud.toast('Solde insuffisant.');
      return false;
    }
    d.money -= s.price;
    d.upgrades.push(id);
    this.applyUpgrades(this.mainHorse);
    if (s.effect.outfit) this.player.setOutfit('competition');
    this.updateWallet();
    this.audio.coin();
    this.hud.toast(`${s.name} : acheté !`);
    this.saveNow();
    return true;
  }

  // ---------- Interactions du monde ----------
  _worldInteractions() {
    const g = this;
    this.interact.add('shop', { label: 'Sellerie', icon: 'bag', r: 7, priority: 1, modes: ['foot', 'ride'], x: POI.sellerie.x, z: POI.sellerie.z, action: () => g.phone.open('shop') });
    this.interact.add('hq', {
      label: 'Strides HQ', icon: 'strides', r: 7, priority: 1, modes: ['foot', 'ride'], x: POI.hq.x, z: POI.hq.z,
      action: () => {
        g.player.locked = true;
        g.hud.dialog([
          { who: 'Inès · Équipe Strides', initials: 'IS', text: `Bienvenue chez STRIDES, ${g.save.data.playerName} ! Ici, on construit l’app que tu utilises tous les jours.` },
          { who: 'Inès · Équipe Strides', initials: 'IS', text: 'Jobs, écuries, transport, événements, annuaire : tout l’écosystème équestre, au même endroit, avec des pros vérifiés.' },
          { who: 'Inès · Équipe Strides', initials: 'IS', text: 'Et dans la vraie vie, c’est pareil. Tu veux la découvrir ?' },
        ], () => {
          g.player.locked = false;
          g.openDownload('hq');
        });
      },
    });
    this.interact.add('talk', {
      label: 'Parler', icon: 'talk', r: 3.2, priority: 0.5, modes: ['foot', 'ride'],
      getPos: () => this._talker?.pos || { x: 1e9, z: 1e9 },
      when: () => !!this._talker,
      action: () => {
        const p = this._talker;
        p.talking = 6;
        p.name ||= FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
        g.hud.dialog([{ who: p.name, initials: p.name.slice(0, 2).toUpperCase(), text: p.chatter }]);
      },
    });
  }

  _events() {
    const b = this.bus;
    const a = this.audio;
    b.on('horse:step', ({ horse, n, depth }) => {
      const surf = this.surfaceAt(horse.pos.x, horse.pos.z, depth);
      // Poussière, sable, mottes d'herbe, éclaboussures.
      const sp = horse.speed;
      const f = horse.forward;
      const bx = horse.pos.x - f.x * 0.4, bz = horse.pos.z - f.z * 0.4;
      const vx = f.x * sp, vz = f.z * sp;
      // Empreintes dans les sols meubles (sable, terre), plus discrètes dans l'herbe.
      if ((surf === 'sand' || surf === 'soil') && (horse.isPlayerHorse || horse.rider)) this.hoofPrints.step(horse, n, 1);
      if (surf === 'water') this.particles.emit('splash', bx, horse.groundY + Math.max(0, depth), bz, 3 + n * 2, vx, vz);
      else if (sp > 5) {
        if (surf === 'sand') this.particles.emit('sand', bx, horse.groundY, bz, n * 3, vx, vz);
        else if (surf === 'grass' && sp > 9) this.particles.emit('grass', bx, horse.groundY, bz, n, vx, vz);
        if (surf !== 'road' && sp > 8) this.particles.emit('dust', bx, horse.groundY, bz, 1, vx, vz);
      }
      if (!horse.isPlayerHorse || !a.ctx) return;
      const k = clamp(horse.speed / 10, 0.35, 1);
      for (let i = 0; i < n; i++) setTimeout(() => a.hoof(surf, k), i * 35);
      // Au galop, le cheval expire à chaque foulée (couplage locomotion-respiration).
      const ph = horse.anim.phase;
      if (horse.speed > 6 && ph < (horse._lastBreathPh ?? 1)) a.breath(clamp((horse.speed - 5) / 9, 0.3, 1));
      horse._lastBreathPh = ph;
    });
    b.on('horse:land', (h) => {
      a.thud();
      const surf = this.surfaceAt(h.pos.x, h.pos.z);
      this.particles.emit(surf === 'grass' ? 'grass' : 'sand', h.pos.x, h.groundY, h.pos.z, 10, h.forward.x * h.speed, h.forward.z * h.speed);
    });
    b.on('horse:jump', (h) => {
      if (h.isPlayerHorse) a.snort();
    });
    b.on('horse:refuse', () => a.neigh());
    // Astuces répétitives : au plus une fois toutes les 45 s (elles ne doivent pas encombrer l'écran).
    const hintAt = {};
    const hintOnce = (key, html, ms) => {
      if (this.time - (hintAt[key] ?? -1e9) < 45) return;
      hintAt[key] = this.time;
      this.hud.hint(html, ms);
    };
    b.on('horse:tooSlow', () => hintOnce('slow', 'Trop lent pour sauter : passe au <b>trot</b>.', 2500));
    b.on('horse:exhausted', () => hintOnce('tired', 'Cheval essoufflé : relâche <b>GALOP</b>.', 3500));
    b.on('horse:bump', ({ horse }) => {
      if (horse.isPlayerHorse) {
        a.thud();
        this.cam.shake = 0.12;
      }
    });
    b.on('player:mount', () => a.snort());
    b.on('player:whistle', (h) => {
      a.whistle();
      setTimeout(() => a.neigh(), 700);
      this.hud.toast(`${h.name} arrive !`);
    });
    b.on('obstacle:clear', ({ margin }) => {
      this.save.data.stats.jumps++;
      if (!this.missions.active) this.hud.toast(margin > 0.3 ? 'Beau saut !' : 'Saut réussi');
    });
    b.on('obstacle:fault', () => {
      this.save.data.stats.faults++;
      if (!this.missions.active) {
        a.fault();
        this.hud.toast('Barre !');
      }
    });
    b.on('mission:complete', ({ run }) => {
      if (run.def.story) this.cheerT = 4;
    });
  }

  surfaceAt(x, z, depth = 0) {
    if (depth > 0.08) return 'water';
    if (z > -376 && z < -372 && x > TOWN.planches.x0 && x < TOWN.planches.x1) return 'wood';
    if (nearestRoad(x, z).d < 0) return 'road';
    if (z - shoreZ(x) < 60) return 'sand';
    const A = POLE.arena;
    if (Math.abs(x - A.x) < A.w / 2 && Math.abs(z - A.z) < A.d / 2) return 'sand';
    const H = HOME.arena;
    if (Math.abs(x - H.x) < H.w / 2 && Math.abs(z - H.z) < H.d / 2) return 'sand';
    return this.world.groundClass(x, z);
  }

  zoneName(x, z) {
    const named = [
      ['town', 'Deauvelle'], ['pole', 'Pôle International'], ['hippo', 'Hippodrome de la Touques'], ['home', 'Écurie du Val'],
      ['haras', 'Haras de la Pommeraie'], ['dunes', 'Écurie des Dunes'], ['gatien', 'Domaine de Saint-Gatien'],
    ];
    for (const [id, name] of named) {
      const zn = ZONES.find((zz) => zz.id === id);
      if (zoneDist(x, z, zn) < 4) return name;
    }
    const ds = z - shoreZ(x);
    if (x < -430 && z < -250) return 'Falaises d’Aval';
    if (ds < 70) return 'Plage de Deauvelle';
    if (forestDensity(x, z) > 0.45) return 'Forêt de Saint-Gatien';
    if (Math.hypot(x - 120, z - 500) < 120) return 'Colline Strides';
    return 'Pays d’Auge';
  }

  // ---------- Services ----------
  distanceTo(p) {
    if (!p) return 0;
    const f = this.player.focus.pos;
    return Math.hypot(f.x - p.x, f.z - p.z);
  }
  hour() {
    return (this.save.data.gameTime / 3600) % 24;
  }
  clockText() {
    const h = this.hour();
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    return `${hh}:${String(mm).padStart(2, '0')}`;
  }
  weatherText() {
    const h = this.hour();
    return h > 6 && h < 21 ? 'Ensoleillé · 21 °C' : 'Nuit claire · 14 °C';
  }
  rating() {
    const r = this.save.data.ratings;
    return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
  }
  levelInfo() {
    return levelFor(this.save.data.xp);
  }
  updateWallet() {
    this.hud.setMoney(this.save.data.money);
    this.hud.setLevel(this.levelInfo(), this.rating());
  }
  saveSoon() {
    this._storePositions();
    this.save.save();
  }
  saveNow() {
    this._storePositions();
    this.save.saveNow();
  }
  _storePositions() {
    if (!this.player || this.state === 'title') return;
    const p = this.player;
    const f = p.mode === 'foot' ? p.human.pos : p.mode === 'ride' ? p.horse.pos : p.truck.pos;
    this.save.data.pos = {
      x: f.x, z: f.z, heading: p.heading,
      horse: this.mainHorse ? { x: this.mainHorse.pos.x, z: this.mainHorse.pos.z, heading: this.mainHorse.heading } : null,
      truck: { x: this.truck.pos.x, z: this.truck.pos.z, heading: this.truck.heading },
    };
    // État du cheval (énergie, hydratation, soins…).
    if (this.mainHorse) (this.save.data.horseCare ||= {})[this.mainHorse.id] = this.mainHorse.cond.toJSON();
  }

  placeFromSave() {
    const pos = this.save.data.pos;
    if (pos && this.save.data.started) {
      if (pos.truck) this.truck.setPosition(pos.truck.x, pos.truck.z, pos.truck.heading);
      this.player.human.setPosition(pos.x, pos.z, pos.heading);
      this.colliders.resolve(this.player.human.pos, 0.5, -Infinity);
      if (pos.horse) this.mainHorse.setPosition(pos.horse.x, pos.horse.z, pos.horse.heading);
    } else {
      this.player.human.setPosition(HOME.spawn.x, HOME.spawn.z, HOME.spawn.rot);
      this.mainHorse.setPosition(HOME.horse.x, HOME.horse.z, HOME.horse.rot);
    }
    this.cam.snap(this.player.focus.pos, this.player.heading);
  }

  message(from, initials, text) {
    this.save.data.messages.push({ from, initials, text, read: false, t: Date.now() });
    this.saveSoon();
    if (this.state === 'play')
      this.hud.notify({ app: 'MESSAGES', title: from, body: text, timeout: 7000, onTap: () => this.phone.open('messages', { conv: from }) });
  }

  contactPro(p) {
    this.bus.emit('pro:contact', p);
    if (this.missions.active?.def.id !== 'fer') {
      this.hud.dialog([{ who: `${p.name} · ${p.job}`, initials: p.initials, text: `Bonjour ! J’ai bien reçu ta demande via Strides. ${p.avail}. Je t’envoie ma position.` }]);
      this.gps.set(p.place, p.name);
    }
  }

  openDownload(source) {
    this.bus.emit('cta', source);
    try {
      window.dataLayer?.push({ event: 'strides_cta', source });
    } catch {
      /* rien */
    }
    if (CONFIG.downloadUrl) {
      window.open(CONFIG.downloadUrl, '_blank', 'noopener');
      return;
    }
    if (document.querySelector('.overlay [data-id="dl-back"]')) return;
    // Textes de strides-app.com : l'app est disponible sur l'App Store et Google Play.
    this.screens.card({
      kicker: 'L’application mobile',
      title: 'Emportez STRIDES avec vous',
      body: 'Disponible sur l’App Store et Google Play. STRIDES connecte les écuries et cavaliers aux grooms, palefreniers, chauffeurs et enseignants vérifiés — partout en France, avec un paiement garanti et sécurisé pour chaque prestation.',
      buttons: [
        { label: 'Retour au jeu', id: 'dl-back' },
        { label: 'Ouvrir strides-app.com', primary: true, id: 'dl-site', run: () => this.openSite() },
      ],
    });
  }

  // Ouvre strides-app.com dans un nouvel onglet ; si le navigateur (ou le lecteur intégré) bloque, on affiche l'adresse.
  openSite() {
    const w = window.open(CONFIG.siteUrl, '_blank');
    if (w) w.opener = null;
    else this.hud.toast('strides-app.com');
  }

  share(source = 'game') {
    const url = location.href.split(/[?#]/)[0];
    const data = { title: 'STRIDES Grand Tour', text: 'Le monde équestre en monde ouvert : de groom à vainqueur du Grand Prix. Par STRIDES.', url };
    this.bus.emit('share', source);
    // En mode photo le HUD est masqué : le message s'affiche dans le cadre photo.
    const say = (m) => (this.state === 'photo' ? this.screens.photoToast(m) : this.hud.toast(m));
    const copy = () => {
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => say('Lien du jeu copié !'), () => say(url));
      else say(url);
    };
    if (navigator.share) {
      navigator.share(data).catch((e) => {
        if (e?.name !== 'AbortError') copy();
      });
    } else copy();
  }

  fade(fn, hold = 0.5) {
    if (this.syncFade) {
      fn?.();
      return;
    }
    this.screens.fade(true);
    setTimeout(() => {
      fn?.();
      setTimeout(() => this.screens.fade(false), hold * 1000);
    }, 470);
  }

  fastTravel(place, price, name) {
    const d = this.save.data;
    d.money -= price;
    this.updateWallet();
    this.player.locked = true;
    this.fade(() => {
      const a = Math.random() * Math.PI * 2;
      const x = place.x + Math.cos(a) * 6;
      const z = place.z + Math.sin(a) * 6;
      if (this.player.mode === 'ride') this.player.teleport(x, z, 0);
      else {
        this.player.teleport(x, z, 0, true);
      }
      this.colliders.resolve(this.player.focus.pos, 1.2, -Infinity);
      this.player.locked = false;
      this.hud.toast(`Transport Strides : arrivée — ${name}`);
      this.saveNow();
    }, 0.8);
  }

  restoreAfterMission() {
    this.player.locked = false;
    this.hud.setObjective(null);
    if (this.mainHorse) {
      this.mainHorse.frozen = false;
      this.mainHorse.lame = false;
    }
    if (this.player.horse !== this.mainHorse && this.player.mode !== 'ride') this.player.setHorse(this.mainHorse);
  }

  celebrate() {
    this.cheerT = 6;
    this.audio.cheer();
    const n = 400;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const vel = [];
    const f = this.player.focus.pos;
    const rnd = mulberry32(7);
    const palette = [new THREE.Color('#f4f3ef'), new THREE.Color('#d9b46a'), new THREE.Color('#1b1c1f'), new THREE.Color('#3ddc97')];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = f.x + (rnd() - 0.5) * 6;
      pos[i * 3 + 1] = f.y + 6 + rnd() * 4;
      pos[i * 3 + 2] = f.z + (rnd() - 0.5) * 6;
      vel.push([(rnd() - 0.5) * 9, rnd() * 9, (rnd() - 0.5) * 9]);
      const c = palette[i % palette.length];
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.25, vertexColors: true }));
    this.scene.add(pts);
    this._confetti = { pts, vel, t: 0 };
  }

  photoMode(on) {
    if (on) {
      this.state = 'photo';
      this.uiRoot.classList.add('hidden');
      document.getElementById('touch').classList.add('hidden');
      this.screens.photoFrame(true, () => this.photoMode(false));
      this.input.setEnabled(true);
    } else {
      this.state = 'play';
      this.uiRoot.classList.remove('hidden');
      document.getElementById('touch').classList.remove('hidden');
      this.screens.photoFrame(false);
    }
  }

  resetGame() {
    this.save.reset();
    location.reload();
  }

  // ---------- Titre / démarrage ----------
  showTitle() {
    this.state = 'title';
    this.titleT = 0;
    this.hud.el.classList.add('hidden');
    document.getElementById('touch').classList.add('hidden');
    const hasSave = this.save.hasSave();
    this.screens.showTitle({
      hasSave,
      onPlay: () => this.startGame(false),
      onNew: () => {
        this.audio.unlock();
        this.screens.hideTitle();
        this.screens.showSetup((cfg) => this.startGame(true, cfg));
      },
    });
  }

  startGame(isNew, cfg = null) {
    this.audio.unlock();
    this.audio.setEnabled(this.save.data.settings.sound);
    this.audio.setMusic(this.save.data.settings.music);
    this.screens.hideTitle();
    const d = this.save.data;
    if (isNew) {
      const settings = d.settings;
      this.save.reset();
      Object.assign(this.save.data, { settings, started: true, playerName: cfg?.name || 'Alex', avatar: cfg?.avatar || 'f' });
      this.player.setAvatar(this.save.data.avatar);
      if (this.mainHorse.def.id !== 'comete') {
        this.despawn(this.mainHorse);
        this.spawnMainHorse('comete');
      }
      this.applyUpgrades(this.mainHorse);
      this.placeFromSave();
      this.save.saveNow();
    } else {
      this.player.setAvatar(d.avatar);
      if (d.upgrades.includes('veste')) this.player.setOutfit('competition');
    }
    this.state = 'play';
    this.hud.el.classList.remove('hidden');
    document.getElementById('touch').classList.remove('hidden');
    this.updateWallet();
    this.cam.snap(this.player.focus.pos, this.player.heading);
    this.input.setEnabled(true);
    if (isNew) {
      this.screens.card({
        kicker: 'Côte Fleurie · Normandie',
        title: 'Bienvenue à Deauvelle',
        body: `${this.save.data.playerName}, tu arrives avec Comète, ta jument baie, et zéro euro en poche. Ici, tout le monde travaille avec STRIDES : les missions tombent sur ton téléphone. Accepte-les, réalise-les, construis ta réputation… jusqu’au Grand Prix.`,
        buttons: [{ label: 'En selle', primary: true, id: 'go', run: () => (this.missions.timer = 2.5) }],
      });
      this.missions.timer = 999;
    } else this.missions.timer = 3;
  }

  // ---------- Blips (minimap / carte) ----------
  getBlips(full = false) {
    const out = [];
    const m = this.missions;
    if (!m.active) {
      for (const o of m.offers) if (!o.locked && o.place) out.push({ x: o.place.x, z: o.place.z, kind: 'mission', sticky: o.story, label: full ? o.title : '' });
    }
    if (this.gps.target) out.push({ x: this.gps.target.x, z: this.gps.target.z, kind: 'waypoint', sticky: true, label: full ? this.gps.target.label : '' });
    const pois = [
      [POI.home, 'home'], [POI.sellerie, 'shop'], [POI.pole, 'event'], [POI.hippo, 'event'], [POI.haras, 'stable'], [POI.dunes, 'stable'], [POI.gatien, 'stable'],
      [POI.hq, 'strides'], [POI.forge, 'pro'], [POI.vet, 'pro'],
    ];
    for (const [p, kind] of pois) out.push({ x: p.x, z: p.z, kind, label: full ? p.name : '' });
    if (this.player.mode !== 'ride' && this.mainHorse && !this.mainHorse.hiddenInTruck) out.push({ x: this.mainHorse.pos.x, z: this.mainHorse.pos.z, kind: 'horse', sticky: true, label: full ? this.mainHorse.name : '' });
    if (this.player.mode !== 'drive') out.push({ x: this.truck.pos.x, z: this.truck.pos.z, kind: 'truck', label: full ? 'Camion Strides' : '' });
    const f = this.player.focus.pos;
    for (const b of this.collectibles.blips()) if (Math.hypot(b.x - f.x, b.z - f.z) < 70) out.push(b);
    return out;
  }

  // ---------- Boucle ----------
  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
    this.last = now;
    try {
      if (this.state === 'play' || this.state === 'photo') this.update(dt);
      else if (this.state === 'title') this.updateTitle(dt);
      this.renderer.render(this.scene, this.camera);
    } catch (e) {
      console.error(e);
      if (this.debug) throw e;
    }
  }

  updateTitle(dt) {
    this.titleT += dt;
    this.time += dt;
    const t = this.titleT * 0.035;
    const c = { x: 60, z: -330 };
    this.camera.position.set(c.x + Math.cos(t) * 190, 46 + Math.sin(t * 0.7) * 6, c.z + 70 + Math.sin(t) * 120);
    this.camera.lookAt(c.x, 6, c.z - 40);
    this.sky.update(18.4, { x: this.camera.position.x, y: 0, z: this.camera.position.z }, dt);
    this.sky.follow(this.camera);
    this.sky.updateEnvironment(this.renderer, performance.now() / 1000);
    this.world.water.update(this.time, this.sky);
    this.world.update(dt, this.camera, this.sky);
    this.birds.update(dt, this.sky.nightFactor);
    for (const h of this.horses) if (h.ambient) h.update(dt, this.camera.position);
    for (const p of this.humans) if (!p.mounted) p.update(dt, this.camera.position);
    for (const h of this.humans) if (h.mounted) h.animateRiding(dt);
    this.ambient.update(dt, this.camera.position);
    this.particles.update(dt, 0.12 + 0.78 * (1 - this.sky.nightFactor) * Math.min(1, 0.45 + this.sky.sun.intensity / 6));
  }

  update(dt) {
    const d = this.save.data;
    const input = this.input;
    this.time += dt;
    d.gameTime += (dt * 86400) / CONFIG.dayLength;
    input.poll();
    const overlayOpen = !!document.querySelector('.overlay');

    if (this.state === 'photo') {
      this.cam.update(dt, this.player.focus, input.look);
      this.sky.update(this.hour(), this.player.focus.pos, dt);
      this.sky.follow(this.camera);
      this.sky.updateEnvironment(this.renderer, performance.now() / 1000);
      this.world.water.update(this.time, this.sky);
      input.endFrame();
      return;
    }

    // Boutons globaux.
    if (input.wasPressed('phone') && !overlayOpen) this.phone.toggle();
    if (input.wasPressed('map') && !overlayOpen) this.phone.isOpen ? this.phone.close() : this.phone.open('map');
    if (input.wasPressed('pause') && !overlayOpen) {
      if (this.phone.isOpen) this.phone.close();
      else this.pause();
    }
    const canAct = !this.phone.isOpen && !overlayOpen;
    if (canAct && input.wasPressed('action')) {
      if (!this.hud.advanceDialog()) this.interact.trigger();
    }
    if (canAct && input.wasPressed('whistle') && !this.missions.noWhistle) this.player.whistle();

    // Joueur et monde.
    const frozenInput = !canAct || this.hud.dialogActive;
    if (frozenInput) {
      input.move.x = input.move.y = input.move.mag = 0;
      input.pressed.delete('jump');
    }
    const ph = this.player.mode === 'ride' ? this.player.horse : null;
    const prev = ph ? { x: ph.pos.x, z: ph.pos.z } : null;
    this.player.update(dt, input);
    for (const h of this.horses) h.update(dt, this.camera.position);
    if (ph && prev) this.obstacles.updateHorse(ph, prev.x, prev.z);
    if (this.player.mode === 'foot') this.obstacles.blockHuman(this.player.human);
    for (const p of this.humans) if (!p.mounted) p.update(dt, this.camera.position);
    for (const h of this.humans) if (h.mounted && !h.isPlayer) h.animateRiding(dt);
    this._separate();
    this.ambient.update(dt, this.camera.position);
    this.obstacles.update(dt);
    this.cam.update(dt, this.player.focus, input.look);

    // Gameplay.
    this._talker = this.player.mode !== 'drive' ? this.ambient.nearestTalker(this.player.focus.pos) : null;
    this.interact.update();
    this.missions.update(dt);
    this.collectibles.update(dt);
    this.gps.update(dt);
    this.grass.update(dt, this.player.focus.pos);
    this.particles.update(dt, 0.12 + 0.78 * (1 - this.sky.nightFactor) * Math.min(1, 0.45 + this.sky.sun.intensity / 6));
    if (this.cheerT > 0) this.cheerT -= dt;
    if (this._confetti) this._updateConfetti(dt);

    // Ambiance.
    const hour = this.hour();
    this.sky.setDay(Math.floor(d.gameTime / 86400));
    this.sky.update(hour, this.player.focus.pos, dt);
    this.sky.follow(this.camera);
    this.sky.updateEnvironment(this.renderer, performance.now() / 1000);
    this.world.water.update(this.time, this.sky);
    this.world.update(dt, this.camera, this.sky);
    this.birds.update(dt, this.sky.nightFactor);
    this.hoofPrints.update(dt);
    // Ambiance sonore : oiseaux des haies le jour, goélands sur la côte.
    if ((this._birdT = (this._birdT ?? 4) - dt) <= 0 && this.sky.nightFactor < 0.5) {
      const fp = this.player.focus.pos;
      const coast = fp.z - shoreZ(fp.x) < 90;
      this._birdT = 3 + Math.random() * 7;
      if (coast) this.audio.gull(0.035);
      else if (zoneDist(fp.x, fp.z, ZONES.find((zz) => zz.id === 'town')) > 30) this.audio.birdsong(0.03);
    }
    const f = this.player.focus.pos;
    this.audio.ambience({
      speed: Math.abs(this.player.speed),
      seaDist: Math.max(0, f.z - shoreZ(f.x)),
      crowd: Math.hypot(f.x - POLE.arena.x, f.z - POLE.arena.z) < 90 ? 0.6 : 0,
      engine: this.player.mode === 'drive' ? Math.abs(this.truck.speed) : -1,
    }, dt);

    // HUD.
    this.hud.update(dt);
    this._zoneT = (this._zoneT || 0) - dt;
    if (this._zoneT <= 0) {
      this._zoneT = 0.5;
      this.hud.setZone(this.zoneName(f.x, f.z));
      this.phone.updateClock(this.clockText());
    }
    if (this.player.mode === 'ride') d.stats.distance += Math.abs(this.player.speed) * dt;
    this._saveT = (this._saveT || 0) + dt;
    if (this._saveT > 12) {
      this._saveT = 0;
      this.saveSoon();
    }
    this._adapt(dt);
    if (this.debug) this._debugInfo();
    input.endFrame();
  }

  // Séparation simple entre chevaux, et entre le joueur et les voitures.
  _separate() {
    const hs = this.horses;
    for (let i = 0; i < hs.length; i++) {
      const a = hs[i];
      if (a.hiddenInTruck || !a.mesh.visible) continue;
      for (let j = i + 1; j < hs.length; j++) {
        const b = hs[j];
        if (b.hiddenInTruck || !b.mesh.visible) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const dd = dx * dx + dz * dz;
        if (dd < 2.6 && dd > 1e-6) {
          const dist = Math.sqrt(dd);
          const push = (1.62 - dist) / 2;
          const nx = dx / dist, nz = dz / dist;
          a.pos.x -= nx * push;
          a.pos.z -= nz * push;
          b.pos.x += nx * push;
          b.pos.z += nz * push;
        }
      }
    }
    const p = this.player;
    const ent = p.mode === 'ride' ? p.horse : p.mode === 'foot' ? p.human : null;
    if (!ent) return;
    const r = p.mode === 'ride' ? 1.0 : 0.4;
    for (const v of this.vehicles) {
      if (v === this.truck && p.mode === 'drive') continue;
      for (const off of [1.5, -1.5]) {
        const cx = v.pos.x + Math.sin(v.heading) * off, cz = v.pos.z + Math.cos(v.heading) * off;
        const dx = ent.pos.x - cx, dz = ent.pos.z - cz;
        const dist = Math.hypot(dx, dz);
        const min = r + 1.3;
        if (dist < min && dist > 1e-4) {
          ent.pos.x = cx + (dx / dist) * min;
          ent.pos.z = cz + (dz / dist) * min;
          if (p.mode === 'ride') ent.speed *= 0.6;
        }
      }
    }
  }

  _updateConfetti(dt) {
    const c = this._confetti;
    c.t += dt;
    const a = c.pts.geometry.attributes.position;
    for (let i = 0; i < c.vel.length; i++) {
      const v = c.vel[i];
      v[1] -= 6 * dt;
      v[0] *= 0.99;
      v[2] *= 0.99;
      a.array[i * 3] += v[0] * dt;
      a.array[i * 3 + 1] += Math.max(v[1], -2.5) * dt;
      a.array[i * 3 + 2] += v[2] * dt;
    }
    a.needsUpdate = true;
    if (c.t > 7) {
      this.scene.remove(c.pts);
      c.pts.geometry.dispose();
      this._confetti = null;
    }
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.input.setEnabled(false);
    this.screens.pause({
      onResume: () => {
        this.state = 'play';
        this.input.setEnabled(true);
        this.last = performance.now();
      },
      onTitle: () => {
        this.saveNow();
        if (this.missions.active) this.missions.abandon();
        this.showTitle();
      },
    });
  }

  _debugInfo() {
    if (!this._dbg) {
      this._dbg = document.createElement('div');
      Object.assign(this._dbg.style, { position: 'fixed', left: '50%', bottom: '4px', transform: 'translateX(-50%)', font: '11px monospace', color: '#fff', background: 'rgba(0,0,0,.5)', padding: '2px 6px', zIndex: 99, pointerEvents: 'none' });
      document.body.appendChild(this._dbg);
    }
    const i = this.renderer.info.render;
    const f = this.player.focus.pos;
    this._dbg.textContent = `fps ${this.fps ? this.fps.toFixed(0) : '…'} · pr ${this.pixelRatio} · calls ${i.calls} · tris ${(i.triangles / 1000).toFixed(0)}k · ${f.x.toFixed(0)},${f.z.toFixed(0)}`;
  }
}

export { formatMoney };
