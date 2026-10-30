// Achats, équipement et consommables : une seule règle pour les boutiques de Deauville City et l'application du
// téléphone (même catalogue SHOP, mêmes prix).
// - Article unique : une seule facturation ; un second achat est refusé (« Déjà acquis »).
// - Consommable : chaque achat volontaire ajoute une unité (save.data.inventory).
// - Équipement (slot) : l'achat équipe l'article si l'emplacement est libre ; « Équiper » le change ensuite.
// Le débit et l'attribution sont écrits ensemble, puis la sauvegarde est enregistrée tout de suite (une seule écriture
// du document complet) : après une interruption, on retrouve soit l'état d'avant, soit l'achat entier.
// Un double appui (deux déclenchements à moins de 0,7 s pour le même article) ne produit qu'une transaction.
import { SHOP, SLOTS } from './data.js';
import { clamp } from '../core/math.js';
import { t, T } from '../core/i18n.js';

export const DOUBLE_TAP_MS = 700;

export class Commerce {
  constructor(game) {
    this.game = game;
    this._last = new Map(); // id → instant (ms) de la dernière transaction
  }

  get data() {
    return this.game.save.data;
  }
  item(id) {
    return SHOP.find((s) => s.id === id) || null;
  }
  owned(id) {
    return this.data.upgrades.includes(id);
  }
  qty(id) {
    return this.data.inventory?.[id] || 0;
  }

  // Article équipé dans un emplacement : choix enregistré s'il est possédé ; sans choix enregistré (anciennes
  // sauvegardes), le dernier article acheté pour cet emplacement, comme avant l'arrivée des emplacements.
  equipped(slot) {
    const d = this.data;
    const chosen = d.equipped?.[slot];
    if (chosen === null) return null;
    if (chosen && this.owned(chosen)) return chosen;
    const own = d.upgrades.filter((id) => this.item(id)?.slot === slot);
    return own.length ? own[own.length - 1] : null;
  }
  isActive(id) {
    const s = this.item(id);
    if (!s || !this.owned(id)) return false;
    return s.slot ? this.equipped(s.slot) === id : true;
  }

  // État d'un article pour l'affichage : 'owned' | 'equipped' | 'locked' | 'poor' | 'buy'.
  status(id) {
    const s = this.item(id);
    if (!s) return 'locked';
    if (s.kind !== 'consumable' && this.owned(id)) return s.slot && this.isActive(id) ? 'equipped' : 'owned';
    if (s.requires && !this.owned(s.requires)) return 'locked';
    if (this.data.money < s.price) return 'poor';
    return 'buy';
  }
  restriction(id) {
    const s = this.item(id);
    if (s?.requires && !this.owned(s.requires)) return T`Nécessite : ${this.item(s.requires)?.name || s.requires}`;
    return '';
  }

  // Achat : renvoie { ok, reason } ; reason : 'unknown' | 'dup' | 'owned' | 'locked' | 'money'.
  purchase(id, { now = performance.now() } = {}) {
    const g = this.game;
    const d = this.data;
    const s = this.item(id);
    if (!s) return { ok: false, reason: 'unknown' };
    const last = this._last.get(id);
    if (last !== undefined && now - last < DOUBLE_TAP_MS) return { ok: false, reason: 'dup' };
    if (s.kind !== 'consumable' && this.owned(id)) {
      g.hud.toast(T`${s.name} : déjà acquis.`);
      return { ok: false, reason: 'owned' };
    }
    if (s.requires && !this.owned(s.requires)) {
      g.hud.toast(this.restriction(id));
      return { ok: false, reason: 'locked' };
    }
    if (d.money < s.price) {
      g.hud.toast(t('Solde insuffisant.'));
      return { ok: false, reason: 'money' };
    }
    this._last.set(id, now);
    // Débit et attribution ensemble, puis une seule écriture de la sauvegarde.
    d.money = Math.round((d.money - s.price) * 100) / 100;
    if (s.kind === 'consumable') {
      d.inventory ||= {};
      d.inventory[id] = (d.inventory[id] || 0) + 1;
    } else {
      d.upgrades.push(id);
      if (s.slot) {
        d.equipped ||= {};
        // Emplacement libre (ou ancien choix implicite) : l'article neuf est porté tout de suite.
        if (!d.equipped[s.slot] || !this.owned(d.equipped[s.slot])) d.equipped[s.slot] = id;
      }
    }
    (d.purchases ||= []).push({ id, price: s.price, t: Date.now() });
    if (d.purchases.length > 50) d.purchases.splice(0, d.purchases.length - 50);
    g.saveNow();
    this._apply(s);
    g.updateWallet();
    g.audio.coin();
    g.hud.toast(s.kind === 'consumable' ? T`${s.name} : ${this.qty(id)} en stock` : T`${s.name} : acheté !`, 'check');
    g.bus?.emit('shop:purchase', { id, price: s.price });
    return { ok: true };
  }

  // Équiper (ou retirer : id null) dans l'emplacement de l'article.
  equip(id, slot = this.item(id)?.slot) {
    const d = this.data;
    if (!slot || (id && !this.owned(id))) return false;
    d.equipped ||= {};
    d.equipped[slot] = id || null;
    this.game.saveNow();
    this._apply(this.item(id) || { slot });
    this.game.hud.toast(id ? T`${this.item(id).name} : équipé` : T`${SLOTS[slot] || slot} retiré`);
    return true;
  }

  // Consommable : soins appliqués au cheval monté ou tout proche (2,5 m) ; une unité retirée.
  use(id) {
    const g = this.game;
    const s = this.item(id);
    if (!s?.use || this.qty(id) < 1) return false;
    const h = g.mainHorse;
    const p = g.player;
    const near = h && (p.mode === 'ride' || Math.hypot(h.pos.x - p.human.pos.x, h.pos.z - p.human.pos.z) < 2.5);
    if (!near || !h.cond) {
      g.hud.toast(T`Approche-toi de ${h?.def?.name || t('ton cheval')} pour utiliser ce produit.`);
      return false;
    }
    for (const [k, v] of Object.entries(s.use)) h.cond[k] = clamp((h.cond[k] ?? 100) + v, 0, 100);
    this.data.inventory[id] -= 1;
    if (!this.data.inventory[id]) delete this.data.inventory[id];
    g.saveNow();
    g.hud.toast(T`${s.name} utilisé : ${s.desc}`, 'check');
    return true;
  }

  // Conséquences visibles : bonus du cheval, tapis, tenue.
  _apply(s) {
    const g = this.game;
    if (!g.mainHorse) return;
    g.applyUpgrades(g.mainHorse);
    if (s.slot === 'tapis') g.refreshTack?.();
    if (s.wear || s.effect?.outfit || ['haut', 'tete', 'casque', 'bottes'].includes(s.slot)) g.player._rebuild();
  }

  // Champs de tenue portés (haut, couvre-chef, casque, bottes) ; preview : article essayé en boutique.
  wear(preview = null) {
    const o = {};
    for (const slot of ['haut', 'tete', 'casque', 'bottes']) {
      const id = preview && this.item(preview)?.slot === slot ? preview : this.equipped(slot);
      const s = id && this.item(id);
      if (s?.wear) Object.assign(o, s.wear);
    }
    return o;
  }
  // Couleurs du tapis équipé (null : tapis noir d'origine).
  pad() {
    const s = this.item(this.equipped('tapis'));
    return s ? { pad: s.pad, trim: s.trim } : null;
  }
}
