# États de test privés — contre-recette Hermès

Ces fichiers sont des **sauvegardes de test**, produites par le jeu lui-même. Ils ne sont pas dans le jeu public : aucun menu, paramètre d'URL ni code de triche ne permet de les charger depuis le jeu. On les charge en écrivant la sauvegarde dans le stockage local du navigateur, sous la clé que le jeu utilise.

## Contenu d'un fichier

| Champ | Contenu |
|---|---|
| `id`, `titre`, `usage` | Identifiant, description, tests concernés (COR-…) |
| `origine` | Comment l'état a été produit (partie neuve + mise en place décrite) |
| `prerequis` | Ce qu'il faut savoir avant de l'utiliser |
| `remiseAZero` | Comment revenir à l'état d'origine |
| `build` | Commit du code qui a produit l'état, version du jeu, format de sauvegarde, date |
| `resume` | Argent, réputation, missions terminées, point de reprise, van, position du joueur |
| `cle`, `sauvegarde` | Clé du stockage local (`strides-grand-tour-v1`) et sauvegarde telle que le jeu l'écrit |

Tous les états sont produits par `tests/e2e/make-test-states.mjs`. On les régénère avec :

```bash
BASE=http://127.0.0.1:5173 node tests/e2e/make-test-states.mjs [E01,E05,…]
```

Chaque état part d'une partie neuve dans un navigateur vierge. La mise en place de chacun est technique et décrite dans son champ `origine` : positions, missions marquées terminées, solde.

## Liste

| Id | Situation | Tests |
|---|---|---|
| E01 | Devant le Defender 110 | COR-V01 |
| E02 | Devant le Master (portière conducteur) | COR-V01, COR-M |
| E03 | Devant le Scania (portière conducteur) | COR-V01 |
| E04 | Master : Comète au pied du pont fermé, avant chargement | COR-M01 |
| E05 | Master : Comète chargée, pont encore ouvert (situation d'AUD-02) | COR-M01 à M05 |
| E06 | « Premiers pas » acceptée (juste après l'acceptation) | COR-S01 |
| E07 | M2 acceptée, 400 €, avant le recrutement payant | COR-S03, R05 |
| E08 | Avant le concours du Pôle : camion au Pôle, Comète à bord, 300 € | COR-P01 |
| E09 | Après une réservation de chauffeur (30 €, un seul débit) | COR-R01 |

## Charger un état

**1. Playwright** (fenêtre visible, Chromium) :

```bash
node HERMES_CORRECTIF/ETATS_TEST/charger-etat.mjs E05 http://127.0.0.1:5173/
IPHONE=1 node HERMES_CORRECTIF/ETATS_TEST/charger-etat.mjs E08   # émulation iPhone 13 paysage
```

Puis, à l'écran titre : **Continuer**.

**2. Console du navigateur**, sur la page du jeu (écran titre) :

```js
localStorage.setItem('strides-grand-tour-v1', /* champ "sauvegarde" du fichier, chaîne JSON telle quelle */);
location.reload();
```

**3. Safari sur iPhone** : il faut l'inspecteur web de Safari sur Mac (iPhone relié), puis la même commande dans sa console. Sans Mac, l'état ne peut pas être injecté sur l'appareil. Ce cas n'a pas été vérifié ici (voir `TESTS_RESTANTS.md`).

## Remise à zéro

- Recharger le même fichier : l'état repart à l'identique.
- Supprimer la clé (`localStorage.removeItem('strides-grand-tour-v1')`) : on revient à une partie neuve.
- Ne pas utiliser ces états sur un profil réel : la sauvegarde du joueur serait remplacée. Le jeu garde une copie de secours seulement lors d'une migration de format.

## Points d'attention

- **E04** : la prise en main du cheval n'est pas sauvegardée. Au chargement, Comète est à côté du joueur, non tenue : « Mener en main » se trouve en action secondaire.
- **E08** : l'offre « Concours du Pôle » arrive dans l'app Activités du téléphone 15 à 35 s après « Continuer ». La mission d'histoire suivante (« Groom du matin ») peut aussi afficher sa bannière : ce n'est pas le concours.
  - L'engagement (22 € en Amateur 1) est débité à l'acceptation.
  - Recharger la page pendant le concours le rembourse une fois et met fin au concours (comportement BUG-08, inchangé).
- **E06 / E07** : à « Continuer », la carte « Mission en cours » propose « Reprendre » (nouveau comportement d'AUD-01).
