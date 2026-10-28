// Chef d'orchestre : initialisation, états (titre / jeu / pause / photo), boucle, services transverses.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Bus } from './core/bus.js';
import { SaveSystem, levelFor } from './core/save.js';
import { Metrics } from './core/metrics.js';
import { Audio } from './core/audio.js';
import { Input } from './core/input.js';
import { clamp, formatMoney, mulberry32 } from './core/math.js';
import { World } from './world/world.js';
import { Colliders } from './world/colliders.js';
import { POI, ZONES, shoreZ, forestDensity, nearestRoad, zoneDist } from './world/layout.js';
import { HOME, POLE, TOWN } from './world/sites.js';
import { Horse } from './entities/horse.js';
import { hoofWorldPosition } from './entities/horseModel.js';
import { Human } from './entities/human.js';
import { Truck } from './entities/truck.js';
import { Vehicle } from './entities/vehicle.js';
import { Online, boardById } from './core/online.js';
import { FollowCamera } from './entities/camera.js';
import { Player } from './gameplay/player.js';
import { Interactions } from './gameplay/interact.js';
import { Obstacles } from './gameplay/obstacles.js';
import { GPS } from './gameplay/gps.js';
import { MissionManager } from './gameplay/missions.js';
import { Ambient } from './gameplay/npcs.js';
import { Collectibles } from './gameplay/collectibles.js';
import { Activities } from './gameplay/activities.js';
import { Challenges } from './gameplay/challengeRun.js';
import { HORSES, SHOP, FIRST_NAMES } from './gameplay/data.js';
import { HUD } from './ui/hud.js';
import { Phone } from './ui/phone.js';
import { Screens } from './ui/screens.js';
import { buildMapImage } from './ui/minimap.js';
import { Grass } from './world/grass.js';
import { Particles } from './world/particles.js';
import { installCare, HorseCondition, SIM } from './gameplay/condition.js';
import { installFuel } from './gameplay/fuel.js';
import { installRest } from './gameplay/rest.js';
import { installStabling } from './gameplay/stabling.js';
import { Realism } from './entities/realistic.js';
import { STABLE_UPGRADES, SKILL_LABEL } from './gameplay/data.js';
import { buildStableUpgrades } from './world/upgrades.js';
import { Birds } from './world/birds.js';
import { HoofPrints } from './world/hoofprints.js';
import { Boats } from './world/boats.js';
import { Rain } from './world/rain.js';
import { TIDE_UNIFORMS, tideLevel, tideState, temperature, conditionText } from './world/weather.js';
const _rein = new THREE.Vector3();
const _hoof = new THREE.Vector3();
// Séparation du cheval monté et des passants : cercles le long du cheval (encolure, garrot, croupe).
const HORSE_SEGS = [1.3, 0.3, -0.75];

const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export class Game {
  constructor() {
    this.bus = new Bus();
    this.save = new SaveSystem();
    this.audio = new Audio();
    this.state = 'loading';
    // Mesure locale (aucun envoi externe) : window.__metrics.log pour la vérification, console avec ?metrics=1.
    this.metrics = new Metrics(this.save);
    // Sauvegarde dans le nuage et classements partagés (base de la page publiée sur claude.ai ; local ailleurs).
    this.online = new Online(this);
    this.save.onSaved = () => this.online.scheduleSave();
    if (typeof window !== 'undefined') {
      window.__metrics = this.metrics;
      if (/[?&]metrics=1/.test(location.search)) this.metrics.listeners.push((e) => console.info('[mesure]', e.name, e.params));
    }
    this.time = 0;
    // Horloge de simulation : suspendue (avec l'heure du monde, les besoins, la météo, les marées, les délais et
    // chronos) tant qu'un dialogue, le téléphone ou un écran de choix est ouvert.
    this.simClock = 0;
    this.simPaused = false;
    this.horses = [];
    this.humans = [];
    this.vehicles = [];
    this.drivables = []; // véhicules conduisibles autres que le camion
    this.cheerT = 0;
    this.params = new URLSearchParams(location.search);
    this.debug = this.params.has('debug');
  }

  async boot() {
    const d = this.save.load();
    // Connexion en arrière-plan : le jeu démarre sans l'attendre.
    this.online.init();
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
    window.addEventListener('pagehide', () => {
      this.saveNow();
      this.online.scheduleSave(true);
    });
    // iOS peut suspendre l'audio : reprise au prochain geste.
    window.addEventListener('pointerup', () => {
      const c = this.audio.ctx;
      if (c && c.state !== 'running' && this.save.data.settings.sound) c.resume();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'play') {
        this.saveNow();
        this.online.scheduleSave(true);
      }
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
    this.boats = new Boats(this.scene);
    this.rainFx = new Rain(this.scene);
    // Météo lue par les entités (robe mouillée du cheval) : intensité de pluie et humidité des surfaces.
    this.weather = { rain: 0, wetness: 0 };
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
    // Prototype de personnage réaliste (réglage « Personnages »), chargé à part.
    // Modèles 3D : « Auto » par défaut (réalistes si l'appareil suit) ; l'ancien défaut « Classiques » jamais choisi
    // à la main passe en « Auto ».
    if (!d.settings.charactersSet && d.settings.characters === 'classic') d.settings.characters = 'auto';
    if (this.params.has('real')) d.settings.characters = 'real';
    if (this.params.has('classic')) d.settings.characters = 'classic';
    this.realism = new Realism(this);
    this.truck = new Truck(this, { x: HOME.truck.x, z: HOME.truck.z, heading: HOME.truck.rot });
    this.player.truck = this.truck;
    this.vehicles.push(this.truck);
    // Voitures garées, voiture et tracteur de l'écurie : conduisibles.
    for (const d of this.world.parkedVehicles) {
      const v = new Vehicle(this, d);
      v.home = d;
      this.drivables.push(v);
      this.vehicles.push(v);
    }
    this.spawnMainHorse(d.activeHorse);
    this.ambient = new Ambient(this);
    this.screens.setLoading(0.9, 'Fers d’or et parcours');
    await new Promise((r) => setTimeout(r, 0));
    this.collectibles = new Collectibles(this);
    this.activities = new Activities(this);
    this.challenge = new Challenges(this);
    this.mapImage = buildMapImage(this.world);
    this.hud.minimap.setImage(this.mapImage);
    this._worldInteractions();
    installCare(this);
    installFuel(this);
    installRest(this);
    installStabling(this);
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
      this.sky.sun.shadow.intensity = 1;
      this.renderer.shadowMap.autoUpdate = true;
      this.sky.setShadowSize(q === 'high' ? 2048 : IS_TOUCH ? 1024 : 2048, 55);
    }
    this._shadowsOn = shadows;
    this._shadowDrops = 0;
    if (!initial) this.resize();
  }

  _adapt(dt) {
    if (this.quality !== 'auto' || this.state !== 'play') return;
    // Ombres : fondu de leur intensité (un uniforme) plutôt que castShadow, qui recompile tous les shaders d'un
    // coup ; la carte d'ombre n'est plus rafraîchie une fois le fondu terminé, et elles reviennent quand la cadence
    // le permet.
    const sh = this.sky.sun.shadow;
    const want = this._shadowsOn ? 1 : 0;
    if (sh.intensity !== want) {
      sh.intensity = clamp(sh.intensity + (want ? dt : -dt) / 0.8, 0, 1);
      this.renderer.shadowMap.autoUpdate = sh.intensity > 0;
    }
    const a = this._fpsAcc;
    a.t += dt;
    a.n++;
    if (a.t < 3) return;
    const fps = a.n / a.t;
    a.t = 0;
    a.n = 0;
    this.fps = fps;
    // Modèles 3D en « Auto » : retour aux modèles classiques si la cadence reste basse une fois la résolution déjà
    // au minimum (une fois par partie).
    if (fps < 30 && this.pixelRatio <= 1) this.realism?.autoFallback();
    this._goodWin = fps > 50 ? (this._goodWin || 0) + 1 : 0;
    if (fps < 42 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    } else if (fps < 30 && this._shadowsOn) {
      this._shadowsOn = false;
      this._shadowDrops = (this._shadowDrops || 0) + 1;
    } else if (!this._shadowsOn && this._goodWin >= 2 && this._shadowDrops < 3) {
      // Deux fenêtres consécutives au-dessus de 50 i/s : les ombres reviennent (trois coupures au plus par partie).
      this._shadowsOn = true;
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

  // Rênes : les os de rênes du cheval rejoignent les poings du cavalier (au repos sur l'encolure sinon).
  _reins() {
    const cam = this.camera.position;
    for (const h of this.humans) {
      const horse = h.mounted;
      const b = horse?.bones;
      if (!b?.reinL || !h.getHandWorldPositions) continue;
      if (Math.hypot(horse.pos.x - cam.x, horse.pos.z - cam.z) > 35) continue;
      const [L, R] = h.getHandWorldPositions();
      for (const bone of [b.reinL, b.reinR]) {
        bone.userData.rest ||= bone.position.clone();
        bone.parent.updateWorldMatrix(true, false);
      }
      b.reinL.position.copy(b.reinL.parent.worldToLocal(_rein.copy(L)));
      b.reinR.position.copy(b.reinR.parent.worldToLocal(_rein.copy(R)));
      horse._reinsHeld = true;
    }
    for (const horse of this.horses) {
      if (!horse._reinsHeld || horse.rider) continue;
      horse._reinsHeld = false;
      for (const bone of [horse.bones.reinL, horse.bones.reinR]) if (bone?.userData.rest) bone.position.copy(bone.userData.rest);
    }
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
    this.message('Normandie Horse Transport', 'NH', `Location pour la saison signée : ${hd.name} a été livré(e) à ton écurie. Sélectionne-le dans « Mes chevaux ».`);
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
    // Veste de concours : portée sur le terrain des concours (voir Player.desiredOutfit).
    if (s.effect.outfit && this.player.outfitKind === 'competition') this.player._rebuild();
    this.updateWallet();
    this.audio.coin();
    this.hud.toast(`${s.name} : acheté !`);
    this.saveNow();
    return true;
  }

  // ---------- Chapitre 1 : compétences, recrutement, écurie, invitation ----------
  // Compétences (0 à 100) : préparation, équitation, transport, organisation.
  addSkill(name, delta) {
    const sk = this.save.data.skills;
    if (!(name in sk) || !delta) return;
    const before = sk[name];
    sk[name] = Math.max(0, Math.min(100, Math.round((before + delta) * 10) / 10));
    if (Math.floor(sk[name] / 10) > Math.floor(before / 10) && this.state === 'play') this.hud.toast(`Compétence ${SKILL_LABEL[name]} : ${Math.floor(sk[name])}/100`);
    this.saveSoon();
  }

  // Recrutement fictif (parcours client) : débit à la confirmation, une seule fois par clé ; en cas d'échec technique,
  // l'état est restauré et rien n'est débité. Renvoie 'ok', 'already' (déjà réglé), 'funds' ou 'error'.
  hire(key, price) {
    const d = this.save.data;
    if (d.rewards[key]) return 'already';
    if (d.money < price) return 'funds';
    const before = d.money;
    try {
      this.save.grantOnce(key, () => (d.money -= price));
      if (this.failNextHire) {
        this.failNextHire = false;
        throw new Error('échec simulé (recette)');
      }
      this.updateWallet();
      this.audio.coin();
      this.saveNow();
      return 'ok';
    } catch (e) {
      d.money = before;
      delete d.rewards[key];
      this.updateWallet();
      this.saveNow();
      console.warn('[recrutement] annulé, montant restitué :', e.message);
      return 'error';
    }
  }

  // Amélioration de l'écurie achetée avec les premiers gains (persistante, achat unique).
  buyStableUpgrade(id) {
    const d = this.save.data;
    const u = STABLE_UPGRADES.find((x) => x.id === id);
    if (!u) return false;
    if (d.upgrades.includes(id)) return true;
    if (u.requires && !d.flags[u.requires]) {
      this.hud.toast(u.lockedText);
      return false;
    }
    if (d.money < u.price) {
      this.hud.toast('Solde insuffisant.');
      return false;
    }
    this.save.grantOnce(`upgrade:${id}`, () => {
      d.money -= u.price;
      d.upgrades.push(id);
    });
    this.updateWallet();
    this.audio.coin();
    buildStableUpgrades(this);
    this.hud.toast(`${u.name} : installée au Val !`);
    this.saveNow();
    return true;
  }

  // Invitation automatique vers la vraie application (au plus une, après le bilan du chapitre 1 ; jamais pendant
  // une conduite, un saut ou une mission : elle attend un moment calme).
  inviteStrides(placement = 'bilan') {
    const d = this.save.data;
    if (d.flags.ctaShown) return false;
    const busy = this.state !== 'play' || this.player.mode === 'drive' || (this.player.mode === 'ride' && this.player.horse.jumpT >= 0) || this.missions.active || document.querySelector('.overlay') || this.phone.isOpen;
    if (busy) {
      this._pendingInvite = placement;
      return false;
    }
    this._pendingInvite = null;
    d.flags.ctaShown = true;
    this.saveNow();
    this.metrics.track('strides_cta_shown', { placement });
    this.screens.card({
      kicker: 'Fin du chapitre 1',
      title: 'Découvrir la vraie application Strides',
      body: 'Ce que tu viens de jouer existe pour de vrai : sur Strides, les écuries et cavaliers trouvent des grooms, palefreniers, cavaliers et chauffeurs aux profils vérifiés, et les professionnels reçoivent des propositions de missions. Le jeu reste ouvert : ta partie est sauvegardée.',
      buttons: [
        { label: 'Plus tard', ghost: true, id: 'cta-later', run: () => ((d.flags.ctaDismissed = true), this.saveSoon()) },
        { label: 'Je cherche un professionnel', id: 'cta-pro', run: () => ((d.flags.ctaClicked = true), this.openStrides(placement, 'pro')) },
        { label: 'Je cherche des missions', primary: true, id: 'cta-missions', run: () => ((d.flags.ctaClicked = true), this.openStrides(placement, 'missions')) },
      ],
    });
    return true;
  }

  // Reprise d'une mission à étapes interrompue (point de reprise enregistré dans la sauvegarde).
  _offerResume() {
    const cp = this.save.data.checkpoint;
    if (!cp) return;
    this.missions.refreshOffers(false);
    const o = this.missions.offers.find((x) => x.id === `story:${cp.mission}`);
    if (!o) return;
    this.screens.card({
      kicker: 'Mission en cours',
      title: o.title,
      body: 'Ta mission a été interrompue. Elle reprend au dernier point enregistré : tes choix et tes paiements sont conservés, rien n’est débité ni versé deux fois.',
      buttons: [
        { label: 'Plus tard', ghost: true, id: 'resume-later' },
        { label: 'Reprendre', primary: true, id: 'resume-mission', run: () => this.missions.accept(o.id) },
      ],
    });
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
          { who: 'Inès · Équipe Strides', initials: 'IS', text: 'Grooms, palefreniers, cavaliers, chauffeurs, enseignants : sur Strides, les écuries et cavaliers trouvent le bon professionnel, au profil vérifié, avec un paiement sécurisé.' },
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
    b.on('horse:step', ({ horse, n, depth, hooves }) => {
      const surf = this.surfaceAt(horse.pos.x, horse.pos.z, depth);
      // Poussière, sable, mottes d'herbe, éclaboussures.
      const sp = horse.speed;
      const f = horse.forward;
      const bx = horse.pos.x - f.x * 0.4, bz = horse.pos.z - f.z * 0.4;
      const vx = f.x * sp, vz = f.z * sp;
      // Empreintes dans les sols meubles (sable, terre), plus discrètes dans l'herbe.
      if ((surf === 'sand' || surf === 'soil') && (horse.isPlayerHorse || horse.rider)) {
        if (hooves && horse.bones) this.hoofPrints.stepAt(horse, hooves, 1);
        else this.hoofPrints.step(horse, n, 1);
      }
      const wet = this.sky.wet || 0;
      if (surf === 'water') {
        // Éclaboussures à la surface, au poser de chaque sabot ; de moins en moins en eau profonde (jambes immergées :
        // plus de gerbe qui monte à travers le ventre et le cavalier), et pas à l'arrêt.
        const k = clamp(1 - (depth - 0.45) / 0.5, 0, 1);
        if (k > 0 && sp > 1) {
          const y = horse.groundY + Math.max(0, depth);
          if (hooves && horse.bones) {
            for (const i of hooves) {
              const hp = hoofWorldPosition(horse.bones, i, _hoof);
              this.particles.emit('splash', hp.x, y, hp.z, Math.ceil(3 * k), vx, vz);
            }
          } else this.particles.emit('splash', bx, y, bz, Math.ceil((3 + n * 2) * k), vx, vz);
        }
      } else if (wet > 0.35 && sp > 3 && surf !== 'sand') {
        // Sol détrempé : mottes de terre au lieu de poussière, gouttelettes sur le bitume.
        if (surf === 'road' || surf === 'gravel') this.particles.emit('spray', bx, horse.groundY, bz, n, vx, vz);
        else if (surf === 'grass' || surf === 'soil') this.particles.emit('mud', bx, horse.groundY, bz, n * (sp > 8 ? 3 : 1), vx, vz);
      } else if (sp > 5) {
        // Estran encore humide (sous la dernière pleine mer) : sable ferme et tassé, quelques mottes, pas de poussière.
        const firm = surf === 'sand' && horse.groundY < TIDE_UNIFORMS.tdWet.value + 0.1;
        if (firm) this.particles.emit('sand', bx, horse.groundY, bz, n, vx, vz);
        else if (surf === 'sand') this.particles.emit('sand', bx, horse.groundY, bz, n * 3, vx, vz);
        else if (surf === 'grass' && sp > 9) this.particles.emit('grass', bx, horse.groundY, bz, n, vx, vz);
        if (surf !== 'road' && !firm && sp > 8) this.particles.emit('dust', bx, horse.groundY, bz, 1, vx, vz);
      }
      if (!horse.isPlayerHorse || !a.ctx) return;
      const k = clamp(horse.speed / 10, 0.35, 1);
      const hs = wet > 0.35 && (surf === 'grass' || surf === 'soil') ? 'mud' : surf;
      for (let i = 0; i < n; i++) setTimeout(() => a.hoof(hs, k), i * 35);
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
    b.on('horse:exhausted', (h) => {
      if (this.player.mode === 'ride' && this.player.horse === h) hintOnce('tired', 'Cheval essoufflé : relâche <b>BOOST</b>.', 3500);
    });
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
      this.addSkill('equitation', 0.5);
      if (!this.missions.active) this.hud.toast(margin > 0.3 ? 'Beau saut !' : 'Saut réussi');
    });
    b.on('obstacle:fault', ({ obstacle }) => {
      this.save.data.stats.faults++;
      if (!this.missions.active) {
        a.fault();
        this.hud.toast(obstacle.solid ? 'Touché !' : 'Barre !');
      }
    });
    b.on('mission:complete', ({ run }) => {
      if (run.def.story) this.cheerT = 4;
      // Trajet en camion : la compétence transport suit le confort du cheval.
      if (run.data.comfort !== undefined) this.addSkill('transport', Math.max(1, Math.round(run.data.comfort / 20)));
    });
  }

  surfaceAt(x, z, depth = 0) {
    if (depth > 0.08) return 'water';
    if (z > -376 && z < -372 && x > TOWN.planches.x0 && x < TOWN.planches.x1) return 'wood';
    if (nearestRoad(x, z).d < 0) return 'road';
    if (z - shoreZ(x) < 60 || (z < -368 && x > -430)) return 'sand';
    const A = POLE.arena;
    if (Math.abs(x - A.x) < A.w / 2 && Math.abs(z - A.z) < A.d / 2) return 'sand';
    const H = HOME.arena;
    if (Math.abs(x - H.x) < H.w / 2 && Math.abs(z - H.z) < H.d / 2) return 'sand';
    return this.world.groundClass(x, z);
  }

  // prev : étiquette affichée ; elle garde une marge de 8 m avant de céder la place (pas de clignotement en longeant
  // une limite de zone).
  zoneName(x, z, prev = null) {
    const keep = (name) => (name === prev ? 8 : 0);
    const named = [
      ['town', 'Deauvelle'], ['pole', 'Pôle International'], ['hippo', 'Hippodrome de la Touques'], ['home', 'Écurie du Val'],
      ['haras', 'Haras de la Pommeraie'], ['dunes', 'Écurie des Dunes'], ['gatien', 'Domaine de Saint-Gatien'],
    ];
    for (const [id, name] of named) {
      const zn = ZONES.find((zz) => zz.id === id);
      if (zoneDist(x, z, zn) < 4 + keep(name)) return name;
    }
    // Front de mer de Deauvelle (route côtière, cabines, Planches) : c'est la ville jusqu'au sable.
    const town = ZONES.find((zz) => zz.id === 'town');
    if (Math.abs(x - town.x) < town.hw + 4 + keep('Deauvelle') && z < town.z && z > -380 - keep('Deauvelle')) return 'Deauvelle';
    const ds = z - shoreZ(x);
    if (x < -430 + keep('Falaises d’Aval') && z < -250) return 'Falaises d’Aval';
    if (ds < 70 + keep('Plage de Deauvelle')) return 'Plage de Deauvelle';
    if (forestDensity(x, z) > (keep('Forêt de Saint-Gatien') ? 0.37 : 0.45)) return 'Forêt de Saint-Gatien';
    if (Math.hypot(x - 120, z - 500) < 120 + keep('Colline Strides')) return 'Colline Strides';
    return 'Pays d’Auge';
  }

  // Éclairement des particules (soleil ou lune, ciel, appoint d'hémisphère) dans l'échelle HDR de la scène : la
  // poussière est tone-mappée comme le décor et suit donc sa luminosité du plein jour à la nuit, avec un léger
  // surcroît en pleine lumière (nuages clairs).
  _particleLight() {
    const S = this.sky;
    const e = S.sun.intensity * 0.45 + Math.PI * (S.envBright || 0) + S.hemi.intensity * 0.25;
    return e * (0.32 + 0.08 * e);
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
    const day = Math.floor(this.save.data.gameTime / 86400), h = this.hour();
    return `${conditionText(day, h)} · ${Math.round(temperature(day, h))} °C`;
  }
  // Marée : niveau de la mer (physique, rendu de l'eau) et estran mouillé, recalculé chaque seconde pour le reste.
  updateTide(dt) {
    const t = this.save.data.gameTime / 3600;
    TIDE_UNIFORMS.tdLevel.value = tideLevel(t);
    if ((this._tideT = (this._tideT || 0) - dt) > 0) return;
    this._tideT = 1;
    const st = tideState(t);
    TIDE_UNIFORMS.tdWet.value = st.wet;
    TIDE_UNIFORMS.tdMark.value = st.mark;
    this.tide = st;
    this._seaLine = null;
  }
  // Rivage (z) de la mer en x, au niveau de marée du moment (recalculé chaque seconde, par pas de 10 m en x).
  seaLineZ(x) {
    const k = Math.round(x / 10);
    if (!this._seaLine || this._seaLine.k !== k) this._seaLine = { k, z: this.terrain.waterlineZ(k * 10) };
    return this._seaLine.z;
  }
  rating() {
    const r = this.save.data.ratings;
    return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
  }
  levelInfo() {
    return levelFor(this.save.data.reputation);
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

  // Une sauvegarde en ligne plus récente que celle de cet appareil (autre appareil, navigateur vidé) : on propose de
  // la reprendre. Au titre, carte de choix ; en jeu, message (la reprise recharge la partie).
  onCloudSave(online) {
    const c = online.cloudNewer;
    if (!c) return;
    const when = new Date(c.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    const adopt = () => {
      if (online.adoptCloudSave()) location.reload();
    };
    const keep = () => {
      online.cloudNewer = null;
      online.scheduleSave(true);
    };
    // Pendant le chargement : proposée dès que l'écran titre est affiché (sinon il la recouvrirait).
    if (this.state === 'loading') {
      this._cloudPending = true;
      return;
    }
    if (this.state === 'play') {
      this.message('Sauvegarde', 'S', `Une sauvegarde en ligne plus récente (${when}) existe. Pour la reprendre : Réglages → Sauvegarde automatique.`);
      return;
    }
    this.screens.card({
      top: true,
      kicker: 'Sauvegarde en ligne',
      title: 'Reprendre ta partie ?',
      body: `Une sauvegarde plus récente que celle de cet appareil a été trouvée (${when}). Celle de cet appareil est gardée en copie de secours.`,
      buttons: [
        { label: 'Reprendre', primary: true, id: 'cloud-adopt', run: adopt },
        { label: 'Garder cet appareil', ghost: true, id: 'cloud-keep', run: keep },
      ],
    });
  }

  // Performance à classer (défi, concours, chronos) : meilleur résultat enregistré en ligne, rang annoncé.
  reportScore(boardId, perf) {
    const b = boardById(boardId);
    if (!b) return;
    this.online
      .submit(boardId, perf)
      .then((r) => {
        if (r && r.rank) this.hud.toast(`${r.improved ? 'Classement en ligne' : 'Classement'} · ${b.title} : ${r.rank === 1 ? '1er' : `${r.rank}e`} sur ${r.total}`, 'star');
      })
      .catch(() => {});
  }
  _storePositions() {
    if (!this.player || this.state === 'title') return;
    const p = this.player;
    const f = p.mode === 'foot' ? p.human.pos : p.mode === 'ride' ? p.horse.pos : p.vehicle.pos;
    this.save.data.pos = {
      x: f.x, z: f.z, heading: p.heading,
      horse: this.mainHorse ? { x: this.mainHorse.pos.x, z: this.mainHorse.pos.z, heading: this.mainHorse.heading } : null,
      truck: { x: this.truck.pos.x, z: this.truck.pos.z, heading: this.truck.heading },
      // Véhicules déplacés par le joueur (indice dans la liste des véhicules garés à l'origine).
      vehicles: this.drivables.map((v, i) => (v.home && !v.atSpot ? { i: this.world.parkedVehicles.indexOf(v.home), x: v.pos.x, z: v.pos.z, heading: v.heading } : null)).filter((v) => v && v.i >= 0),
    };
    // État du cheval (énergie, hydratation, soins…).
    if (this.mainHorse) (this.save.data.horseCare ||= {})[this.mainHorse.id] = this.mainHorse.cond.toJSON();
    // Carburant du camion Strides.
    this.save.data.fuel = { truck: Math.round(this.truck.sim.fuelL * 10) / 10 };
  }

  placeFromSave() {
    const pos = this.save.data.pos;
    // Carburant du camion (nouvelle partie : réservoir aux trois quarts).
    const ts = this.truck.sim;
    ts.fuelL = Math.min(ts.spec.tank, Math.max(0, this.save.data.fuel?.truck ?? ts.spec.tank * 0.75));
    ts.dry = ts.fuelL <= 0;
    if (pos && this.save.data.started) {
      if (pos.truck) this.truck.setPosition(pos.truck.x, pos.truck.z, pos.truck.heading);
      for (const sv of pos.vehicles || []) {
        const v = this.drivables.find((d) => d.home === this.world.parkedVehicles[sv.i]);
        if (v) {
          v.setPosition(sv.x, sv.z, sv.heading);
          v.atSpot = false;
        }
      }
      this.player.human.setPosition(pos.x, pos.z, pos.heading);
      this.colliders.resolve(this.player.human.pos, 0.5, -Infinity);
      if (pos.horse) this.mainHorse.setPosition(pos.horse.x, pos.horse.z, pos.horse.heading);
      // Cheval laissé au box de l'Écurie du Val.
      if (this.save.data.horseInBox && this.save.data.horseInBox === this.mainHorse.id) this.stabling?.putIn(this.mainHorse, true);
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

  // Accès à la vraie plateforme Strides (destinations officielles, voir config.js) : la partie est sauvegardée avant
  // toute sortie. intent : 'discover' (page de présentation), 'missions' ou 'pro' (application web, même page :
  // aucun lien profond inventé), 'store' (fiche App Store).
  openStrides(placement = 'menu', intent = 'discover') {
    this.saveNow();
    this.bus.emit('cta', placement);
    this.metrics.track('strides_cta_clicked', { placement, mode: intent });
    const url = intent === 'store' ? CONFIG.downloadUrl || CONFIG.landingUrl : intent === 'discover' ? CONFIG.landingUrl : CONFIG.siteUrl;
    const w = window.open(url, '_blank');
    if (w) w.opener = null;
    else if (this.state === 'play') this.hud.toast(url.replace(/^https?:\/\//, '').replace(/\/$/, ''));
  }

  openDownload(source) {
    if (CONFIG.downloadUrl) return this.openStrides(source, 'store');
    this.bus.emit('cta', source);
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
    this.openStrides('card', 'discover');
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
    // Dialogue en cours (PNJ, Strides HQ…) : fermé sans suite ; s'il figeait le joueur, on le libère pour « Continuer ».
    if (this.hud.dialogActive) {
      this.hud.closeDialog();
      this.player.locked = false;
    }
    this.hud.el.classList.add('hidden');
    document.getElementById('touch').classList.add('hidden');
    const hasSave = this.save.hasSave();
    const issue = this.save.loadIssue;
    if (this._cloudPending) {
      this._cloudPending = false;
      setTimeout(() => this.onCloudSave(this.online), 0);
    }
    this.screens.showTitle({
      hasSave,
      issue,
      backups: issue ? this.save.backups() : [],
      // Restauration : la copie est validée et migrée ; la page est rechargée pour repartir d'un état propre.
      onRestore: (key) => {
        if (this.save.restore(key)) location.reload();
        else this.screens.card({ top: true, kicker: 'Sauvegarde', title: 'Copie illisible', body: 'Cette copie ne peut pas être restaurée non plus. Vous pouvez commencer une nouvelle partie ; la copie reste conservée dans le navigateur.', buttons: [{ label: 'Retour', primary: true, id: 'back' }] });
      },
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
      } else this.mainHorse.cond = new HorseCondition(this.mainHorse); // Comète repart reposée : rien de l'ancienne sauvegarde.
      this.applyUpgrades(this.mainHorse);
      this.placeFromSave();
      this.save.saveNow();
    } else {
      this.player.setAvatar(d.avatar);
    }
    this.state = 'play';
    this.hud.el.classList.remove('hidden');
    document.getElementById('touch').classList.remove('hidden');
    this.metrics.track('game_started', { mode: isNew ? 'new' : 'continue' });
    buildStableUpgrades(this);
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
    } else {
      this.missions.timer = 3;
      this._offerResume();
    }
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
    if (!(this.player.mode === 'drive' && this.player.vehicle === this.truck)) out.push({ x: this.truck.pos.x, z: this.truck.pos.z, kind: 'truck', label: full ? 'Camion Strides' : '' });
    const f = this.player.focus.pos;
    for (const b of this.collectibles.blips()) if (Math.hypot(b.x - f.x, b.z - f.z) < 70) out.push(b);
    return out;
  }

  // ---------- Boucle ----------
  frame(now) {
    // Jamais de pas négatif : l'horodatage de la première image peut précéder `last` (démarrage, retour au premier
    // plan) et faisait reculer l'heure du monde.
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000) || 0.016);
    this.last = now;
    try {
      if (this.state === 'play' || this.state === 'photo') this.update(dt);
      else if (this.state === 'title') this.updateTitle(dt);
      this.realism?.update();
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
    this.boats.update(dt);
    for (const h of this.horses) if (h.ambient) h.update(dt, this.camera.position);
    for (const p of this.humans) if (!p.mounted) p.update(dt, this.camera.position);
    for (const h of this.humans) if (h.mounted) h.animateRiding(dt);
    this.ambient.update(dt, this.camera.position);
    this._reins();
    this.particles.update(dt, this._particleLight());
  }

  update(dt) {
    const d = this.save.data;
    const input = this.input;
    this.time += dt;
    input.poll();
    const overlayOpen = !!document.querySelector('.overlay');
    this.simPaused = SIM.paused = this.state === 'play' && (this.phone.isOpen || overlayOpen || !!this.hud.dialogActive);
    const sdt = this.simPaused ? 0 : dt;
    this.simClock += sdt;
    // Écoulement du temps : journée de jeu compressée (20 min), ou temps réel (24 h) au choix dans Réglages.
    d.gameTime += (sdt * 86400) / (d.settings.timeScale === 'reel' ? 86400 : CONFIG.dayLength);

    if (this.state === 'photo') {
      this.cam.update(dt, this.player.focus, input.look);
      this.sky.setDay(Math.floor(d.gameTime / 86400));
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
    this._reins();
    this.obstacles.update(dt);
    this.cam.update(dt, this.player.focus, input.look);

    // Gameplay.
    this._talker = this.player.mode !== 'drive' ? this.ambient.nearestTalker(this.player.focus.pos) : null;
    this.interact.update();
    this.missions.update(sdt);
    this.collectibles.update(dt);
    this.gps.update(dt);
    this.grass.update(dt, this.player.focus.pos);
    this.particles.update(dt, this._particleLight());
    if (this.cheerT > 0) this.cheerT -= dt;
    if (this._confetti) this._updateConfetti(dt);

    // Ambiance.
    const hour = this.hour();
    this.sky.setDay(Math.floor(d.gameTime / 86400));
    this.sky.update(hour, this.player.focus.pos, dt);
    this.sky.follow(this.camera);
    this.sky.updateEnvironment(this.renderer, performance.now() / 1000);
    this.updateTide(dt);
    this.world.water.update(this.time, this.sky);
    this.world.update(dt, this.camera, this.sky, this.player.focus.pos);
    this.birds.update(dt, this.sky.nightFactor);
    this.hoofPrints.update(dt);
    this.boats.update(dt);
    // Pluie (traînées autour de la caméra, bruit de pluie).
    this.rainFx.update(dt, this.camera, this.sky.rain, (1 - this.sky.nightFactor) * 0.9 + 0.1, this.sky.windVec);
    this.weather.rain = this.sky.rain;
    this.weather.wetness = this.sky.wet;
    this.audio.setRain?.(this.sky.rain);
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
      // Distance au rivage du moment (la mer se retire à plus de 100 m à basse mer de vives-eaux).
      seaDist: Math.max(0, f.z - this.seaLineZ(f.x)),
      crowd: Math.hypot(f.x - POLE.arena.x, f.z - POLE.arena.z) < 90 ? 0.6 : 0,
      engine: this.player.mode === 'drive' ? Math.abs(this.player.vehicle.speed) : -1,
    }, dt);

    // HUD.
    this.hud.update(dt);
    this._zoneT = (this._zoneT || 0) - dt;
    if (this._zoneT <= 0) {
      this._zoneT = 0.5;
      this._zone = this.zoneName(f.x, f.z, this._zone);
      this.hud.setZone(this._zone);
      this.phone.updateClock(this.clockText());
      if (this._pendingInvite) this.inviteStrides(this._pendingInvite);
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

  // Séparation simple entre chevaux, et entre le joueur et les voitures ou les passants.
  _separate() {
    const hs = this.horses;
    const p = this.player;
    const mover = p.mode === 'ride' ? p.horse : null;
    for (let i = 0; i < hs.length; i++) {
      const a = hs[i];
      if (a.hiddenInTruck || !a.mesh.visible) continue;
      for (let j = i + 1; j < hs.length; j++) {
        const b = hs[j];
        if (b.hiddenInTruck || !b.mesh.visible) continue;
        if (Math.abs(b.pos.x - a.pos.x) > 3.2 || Math.abs(b.pos.z - a.pos.z) > 3.2) continue;
        // Deux cercles par cheval (avant-main, arrière-main) : plus de nez dans la croupe du voisin. Le cheval monté
        // par le joueur encaisse toute la poussée et ralentit (le voisin n'est pas traîné, sabots glissants).
        const ax = Math.sin(a.heading) * 0.7, az = Math.cos(a.heading) * 0.7;
        const bx = Math.sin(b.heading) * 0.7, bz = Math.cos(b.heading) * 0.7;
        const ka = a === mover ? 1 : b === mover ? 0 : 0.5;
        for (let sa = -1; sa <= 1; sa += 2) {
          for (let sb = -1; sb <= 1; sb += 2) {
            const dx = b.pos.x + bx * sb - a.pos.x - ax * sa, dz = b.pos.z + bz * sb - a.pos.z - az * sa;
            const dd = dx * dx + dz * dz;
            if (dd < 2.6 && dd > 1e-6) {
              const dist = Math.sqrt(dd);
              const push = 1.62 - dist;
              const nx = dx / dist, nz = dz / dist;
              a.pos.x -= nx * push * ka;
              a.pos.z -= nz * push * ka;
              b.pos.x += nx * push * (1 - ka);
              b.pos.z += nz * push * (1 - ka);
              if (mover === a || mover === b) {
                const into = mover === a ? (ax * nx + az * nz) / 0.7 : -(bx * nx + bz * nz) / 0.7;
                if (into > 0) mover.speed *= 1 - into * 0.4;
              }
            }
          }
        }
      }
    }
    const ent = p.mode === 'ride' ? p.horse : p.mode === 'foot' ? p.human : null;
    if (!ent) return;
    const r = p.mode === 'ride' ? 1.0 : 0.4;
    // Joueur à pied : les chevaux montés (cavaliers à l'entraînement) le contournent largement au lieu de le
    // traverser, hors séquences du camion (positions scénarisées) ; les chevaux libres sont traités plus bas.
    if (p.mode === 'foot' && !p.transport?.busy) {
      for (const h of hs) {
        if (!h.rider || h.rider === p.human || h.hiddenInTruck || !h.mesh.visible) continue;
        const fx = Math.sin(h.heading), fz = Math.cos(h.heading);
        for (let off = -0.6; off <= 0.6; off += 1.2) {
          const cx = h.pos.x + fx * off, cz = h.pos.z + fz * off;
          const dx = ent.pos.x - cx, dz = ent.pos.z - cz;
          const dist = Math.hypot(dx, dz);
          if (dist < 1.0 && dist > 1e-4) {
            ent.pos.x = cx + (dx / dist) * 1.0;
            ent.pos.z = cz + (dz / dist) * 1.0;
          }
        }
      }
    }
    for (const v of this.vehicles) {
      if (v === p.vehicle && p.mode === 'drive') continue;
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
    // Passants et PNJ à pied : le cheval monté (ou le personnage) ne les traverse plus — repoussé comme devant une
    // voiture, sur trois cercles le long du cheval ; le passant, lui, ne bouge pas (il ne finit pas dans un mur).
    const ride = p.mode === 'ride';
    const fx = Math.sin(ent.heading), fz = Math.cos(ent.heading);
    const er = ride ? 0.42 : 0.3;
    for (const hu of this.humans) {
      if (hu === p.human || hu.mounted || hu.hidden || !hu.mesh.visible) continue;
      const ddx = hu.pos.x - ent.pos.x, ddz = hu.pos.z - ent.pos.z;
      if (ddx * ddx + ddz * ddz > 9) continue;
      for (let k = 0; k < (ride ? 3 : 1); k++) {
        const off = ride ? HORSE_SEGS[k] : 0;
        const cx = ent.pos.x + fx * off, cz = ent.pos.z + fz * off;
        const dx = cx - hu.pos.x, dz = cz - hu.pos.z;
        const dist = Math.hypot(dx, dz), min = er + hu.radius;
        if (dist < min && dist > 1e-4) {
          ent.pos.x += (dx / dist) * (min - dist);
          ent.pos.z += (dz / dist) * (min - dist);
          if (ride) ent.speed *= 0.6;
        }
      }
    }
    // À pied, le joueur ne traverse pas les chevaux (capsule croupe → poitrail de chaque cheval libre) : le cheval
    // mené s'écarte surtout lui-même (il cède au meneur qui fait demi-tour), les autres ne bougent pas.
    const tp = p.transport;
    if (p.mode !== 'foot' || tp.seq) return;
    for (const h of hs) {
      if (h.hiddenInTruck || h.rider || !h.mesh.visible) continue;
      const fx = Math.sin(h.heading), fz = Math.cos(h.heading);
      const rx = ent.pos.x - h.pos.x, rz = ent.pos.z - h.pos.z;
      const s = clamp(rx * fx + rz * fz, -0.85, 0.8);
      const dx = rx - fx * s, dz = rz - fz * s;
      const dist = Math.hypot(dx, dz);
      const min = 0.68; // demi-largeur du corps (~0,33) + rayon du personnage (0,35)
      if (dist >= min) continue;
      // Sens de l'écart ; superposés : vers la gauche du cheval (côté du meneur).
      const nx = dist > 1e-4 ? dx / dist : Math.cos(h.heading), nz = dist > 1e-4 ? dz / dist : -Math.sin(h.heading);
      const led = tp.led && tp.led.horse === h;
      const wH = led ? 0.75 : 0;
      const push = min - dist;
      h.pos.x -= nx * push * wH;
      h.pos.z -= nz * push * wH;
      ent.pos.x += nx * push * (1 - wH);
      ent.pos.z += nz * push * (1 - wH);
      h.mesh.position.x = h.pos.x;
      h.mesh.position.z = h.pos.z;
      ent.mesh.position.x = ent.pos.x;
      ent.mesh.position.z = ent.pos.z;
      if (led) h.speed *= 0.9;
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
