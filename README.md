# STRIDES — Grand Tour

Jeu en monde ouvert 3D inspiré de GTA, transposé dans l'univers du cheval, au service de la marque **STRIDES**.
On y incarne un jeune talent du monde équestre qui arrive sur la Côte Fleurie avec sa jument, Comète, et zéro euro en poche.
Les missions arrivent sur le téléphone du personnage, dans l'application Strides : on les **accepte** ou on les **refuse**,
on les réalise, on est payé et noté… jusqu'à remporter le Grand Prix CSI 5★ de Deauvelle.

Jouable dans le navigateur, **pensé d'abord pour l'iPhone** (commandes tactiles, paysage), et aussi au clavier sur ordinateur.

## Jouer

| Tactile (iPhone) | Clavier |
| --- | --- |
| Joystick : poser le pouce n'importe où dans la moitié gauche et glisser — à fond : **galop** | ZQSD / WASD ou flèches (galop ; Ctrl : trot, Alt : pas) |
| Caméra : glisser dans la moitié droite | Glisser à la souris |
| **SAUT** (à cheval) — l'anneau devient vert au bon moment | Espace |
| **BOOST** (maintenir) : grand galop, anneau d'endurance autour du bouton / **COURIR** à pied | Maj |
| **ACTION** contextuelle : monter, descendre, parler, prendre, livrer… | E |
| Sifflet : rappeler son cheval | Q |
| Téléphone (en haut à droite) — app Strides, carte, messages… | P |
| Minimap : toucher pour ouvrir la carte et poser un repère GPS | M |
| Pause | Échap |

Astuce iPhone : dans Safari, **Partager → Sur l'écran d'accueil** pour jouer en plein écran comme une app.

## Ce qu'il y a dedans

- **Un monde ouvert de 1,2 km²** : Deauvelle (ville normande, place, Grand Hôtel, Strides HQ), la plage et ses Planches,
  le Haras de la Pommeraie, le Pôle International (carrière de CSO, tribunes), l'hippodrome de la Touques, la forêt de
  Saint-Gatien et son cross, les falaises et le phare, le bocage, la colline « STRIDES ». Cycle jour/nuit, mer animée,
  herbe au vent, circulation, passants, chevaux au paddock, cavaliers à l'entraînement.
- **Un cheval procédural** articulé (pas, trot, galop, grand galop, saut, refus, broute), endurance à gérer, quatre chevaux
  à acquérir (Comète, Ulysse, Onyx, Saphir) et des équipements à la Sellerie du Port.
- **Le téléphone et l'app Strides** : notifications de missions (Refuser / Voir / Accepter), onglets Missions, Écuries,
  Transport, Événements, Annuaire, Profil (note moyenne, statut, revenus), carte GPS, messages, trophées, mode photo.
- **12 missions d'histoire**, chacune illustrant un service réel de Strides :

  | Mission | Univers Strides |
  | --- | --- |
  | Premiers pas · Groom du matin · Selle sur-mesure · Le fugueur · Galop sur la plage | Jobs & services |
  | Transport express (camion Strides, confort du cheval) | Transport |
  | Fer perdu (trouver un maréchal vérifié dans l'annuaire) | Annuaire |
  | La pension parfaite (comparer les pensions) | Écuries |
  | Cross de Saint-Gatien · Derby de la Touques · Qualificative CSI 3★ · Grand Prix CSI 5★ | Événements |

- **Des jobs générés à l'infini** (coursier, transport, reconnaissance de parcours, soins), des **chronos libres**
  (plage, CSO, cross, hippodrome) et **20 fers d'or** cachés.
- **Progression** : Groom → Cavalier → Pro vérifié → International → Légende 5★, avis clients étoilés, pourboires.
- **Marque** : panneaux publicitaires, camion et tapis de selle Strides, ligne « Dans la vraie vie » après chaque mission,
  écran de fin et boutons « Découvrir l'app » / « Partager le jeu ».

## Configuration marketing

Le lien vers la vraie application se règle dans [`src/config.js`](src/config.js) :

```js
downloadUrl: 'https://…', // App Store, site Strides, lien dynamique…
```

Laissé vide, les boutons « Découvrir » affichent un message « Bientôt sur votre téléphone ».
Les clics sur les appels à l'action émettent aussi un évènement `strides_cta` dans `window.dataLayer` (Google Tag Manager) si présent.

## Développement

```bash
npm install
npm run dev          # serveur local (accessible depuis l'iPhone sur le même réseau)
npm test             # tests unitaires (Vitest)
npm run build        # build statique dans dist/
npm run build:single # un seul fichier HTML autonome dans dist-single/
```

Tests de bout en bout (Chromium, émulation iPhone, serveur de dev lancé sur le port 5173) :

```bash
node tests/e2e/scenario.mjs   # partie réelle au doigt : titre, notification, joystick, téléphone
node tests/e2e/missions.mjs   # pilote automatique : les 12 missions de l'histoire jusqu'au Grand Prix
node tests/e2e/jobs.mjs       # 16 jobs générés
node tests/e2e/features.mjs   # boutique, sifflet, transport, achat de cheval, fers d'or, chronos, photo
node tests/e2e/ui.mjs se      # captures d'interface (se | i14 | max)
```

Pas d'assets externes : géométrie, textures et sons sont générés par le code (Three.js + WebAudio).
Le build pèse environ 250 Ko gzip.

## Mise en ligne

Le workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) lance les tests, construit le jeu et le publie
sur **GitHub Pages** à chaque push. À activer une fois : *Settings → Pages → Build and deployment → Source : GitHub Actions*.
Le dossier `dist/` (ou le fichier unique `dist-single/index.html`) peut aussi être déposé sur n'importe quel hébergement statique.

---

Jeu de démonstration : Deauvelle, ses lieux et ses personnages sont fictifs.
