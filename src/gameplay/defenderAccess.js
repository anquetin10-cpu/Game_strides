// Defender 110 : accès à pied (bouton ACTION et action secondaire), comme le transport. Portières (la plus proche),
// coffre (ouverture, rangement d'un objet porté, reprise), teinte de la carrosserie ; la montée au volant passe par
// la séquence commune de montée (« Monter », gameplay/boarding.js), qui ouvre et referme la portière.
// État conservé dans la sauvegarde (save.data.defender) : identifiant, type, teinte, accès ouverts, objet du coffre ;
// la position est enregistrée avec celles des autres véhicules (save.data.pos.defender).
import * as THREE from 'three';
import { DEFENDER_ID, DEFENDER_DIM } from '../entities/defenderModel.js';
import { t, T } from '../core/i18n.js';

// Teintes proposées (la première est celle du modèle fourni).
export const DEFENDER_PAINTS = [
  { id: 'vert', name: 'Vert forêt', css: null },
  { id: 'blanc', name: 'Blanc glacier', css: '#e9ebe8' },
  { id: 'gris', name: 'Gris pierre', css: '#7d8079' },
  { id: 'bleu', name: 'Bleu nuit', css: '#22344d' },
  { id: 'sable', name: 'Sable', css: '#b49a72' },
  { id: 'noir', name: 'Noir', css: '#141516' },
];
const ITEM_NAMES = { hay: 'la botte de foin', saddle: 'la selle', bag: 'le sac', box: 'le carton' };
const SIDE_DOORS = ['door_FL', 'door_FR', 'door_RL', 'door_RR'];
const _a = new THREE.Vector3();

export class DefenderAccess {
  constructor(game, v) {
    this.game = game;
    this.v = v;
    this.cands = [];
    this._sec = null;
    this._savedRef = null;
    this._it = game.interact.list.get(
      game.interact.add('defender', {
        label: '', icon: 'car', r: 1e9, priority: 0, modes: ['foot'],
        getPos: () => game.player.human.pos,
        when: () => this.cands.length > 0,
        action: () => this.cands[0] && this._run(this.cands[0]),
      }),
    );
  }

  get player() {
    return this.game.player;
  }

  // Actions possibles là où se tient le personnage, de la plus prioritaire à la moins prioritaire.
  _candidates() {
    const v = this.v, p = this.player, hu = p.human;
    const out = [];
    if (p.mode !== 'foot' || v.driver || v.boardingBy || p.boarding?.active || !v.stopped || p.transport?.leading || p.transport?.busy || this.game.indoor) return out;
    const pos = hu.pos;
    if (Math.abs(pos.x - v.pos.x) > 7 || Math.abs(pos.z - v.pos.z) > 7) return out;
    const d = (pt) => Math.hypot(pos.x - pt.x, pos.z - pt.z);
    // Portière la plus proche.
    let door = null, best = 1.5;
    for (const a of SIDE_DOORS) {
      const dd = d(v.accessPoint(a, _a));
      if (dd < best) {
        best = dd;
        door = a;
      }
    }
    if (door) {
      const open = v.isOpen(door);
      // Portière avant fermée : « Monter » (1,4) reste l'action principale, celle-ci passe en secondaire ; portière
      // arrière ou ouverte : action principale.
      const front = door === 'door_FL' || door === 'door_FR';
      out.push({ id: 'door', a: door, label: open ? t('Fermer la portière') : t('Ouvrir la portière'), icon: 'car', prio: open ? 1.45 : front ? 1.3 : 1.42 });
    }
    // Monter au volant (action secondaire quand la portière est l'action principale).
    if (!hu.carrying && d(v.doorPoint(1, _a)) < 2.2) out.push({ id: 'enter', label: t('Monter\u2060'), icon: 'car', prio: 1.0 });
    // Coffre : ouverture latérale à l'arrière ; rangement d'un objet porté.
    if (d(v.accessPoint('tailgate', _a)) < 2.2) {
      const open = v.isOpen('tailgate');
      const ready = open && v.access.tailgate.t >= 1;
      if (ready && hu.carrying && !v.boot && ITEM_NAMES[hu.carrying.kind]) out.push({ id: 'store', label: t('Ranger dans le coffre'), icon: 'bag', prio: 1.6 });
      if (ready && !hu.carrying && v.boot) out.push({ id: 'take', label: T`Prendre ${t(ITEM_NAMES[v.boot] || 'l’objet')}`, icon: 'bag', prio: 1.6 });
      out.push({ id: 'boot', label: open ? t('Fermer le coffre') : t('Ouvrir le coffre'), icon: 'car', prio: 1.5 });
    }
    // Teinte de la carrosserie : devant le capot.
    if (d(v.groundPoint(0, DEFENDER_DIM.L / 2 + DEFENDER_DIM.zc + 0.9, _a)) < 1.6) {
      const next = DEFENDER_PAINTS[(this._paintIndex() + 1) % DEFENDER_PAINTS.length];
      out.push({ id: 'paint', label: T`Teinte : ${t(next.name)}`, icon: 'car', prio: 1.2, paint: next });
    }
    return out.sort((x, y) => y.prio - x.prio);
  }

  _paintIndex() {
    return Math.max(0, DEFENDER_PAINTS.findIndex((p) => p.css === this.v.paint));
  }

  _run(c) {
    const v = this.v, hu = this.player.human;
    switch (c.id) {
      case 'door':
        v.setAccess(c.a, !v.isOpen(c.a));
        break;
      case 'boot':
        if (!v.setAccess('tailgate', !v.isOpen('tailgate')) && !v.stopped) this.game.hud.hint(t('Le coffre ne s’ouvre pas en roulant.'), 2500);
        break;
      case 'store': {
        const k = hu.carrying.kind;
        hu.drop();
        v.storeInBoot(k);
        this.game.hud.toast(T`Rangé dans le coffre : ${t(ITEM_NAMES[k])}.`);
        break;
      }
      case 'take': {
        const k = v.takeFromBoot();
        if (k) hu.carry(k);
        break;
      }
      case 'enter':
        this.player.boarding.begin(v);
        break;
      case 'paint':
        v.setPaint(c.paint.css);
        this.game.hud.toast(T`Defender 110 : teinte ${t(c.paint.name)}.`);
        break;
    }
    this._persist();
  }

  // Action secondaire pour le HUD (voir transport.secondary).
  secondary() {
    const c = this.cands;
    if (!c.length) return null;
    const cur = this.game.interact.current;
    if (cur && cur.id === 'defender') return c[1] || null;
    // « Monter » est déjà l'action principale (interaction commune des véhicules).
    const first = c.find((x) => !(cur?.id === 'vehicle-in' && x.id === 'enter'));
    return first || null;
  }
  triggerSecondary() {
    const s = this._sec;
    if (s) this._run(s);
  }

  // ---------- Sauvegarde ----------
  _persist() {
    const d = this.game.save.data;
    const v = this.v;
    d.defender = { id: v.instanceId, type: DEFENDER_ID, paint: v.paint, access: v.accessState(), boot: v.boot };
    this._savedRef = d;
    this.game.saveSoon?.();
  }
  // Nouvelle partie / chargement : état repris de la sauvegarde ; sauvegarde antérieure au Defender : il est ajouté une
  // seule fois (garé à l'Écurie du Val), sans toucher au reste de la partie.
  _sync() {
    const d = this.game.save.data;
    if (this._savedRef === d) return;
    this._savedRef = d;
    const v = this.v;
    const s = d.defender;
    v.setAccessInstant(s?.access || {});
    v.setPaint(s?.paint || null);
    v.storeInBoot(s?.boot || null);
    if (!s || s.type !== DEFENDER_ID) this._persist();
  }

  // Appelée par le jeu à chaque image.
  update() {
    const g = this.game;
    if (g.state === 'play') this._sync();
    this.cands = this._candidates();
    const it = this._it, c0 = this.cands[0];
    it.label = c0 ? c0.label : '';
    it.icon = c0 ? c0.icon : 'car';
    it.priority = c0 ? c0.prio : 0;
    this._sec = this.secondary();
  }
}
