# Protocole de validation sur iPhone réel (≈ 10 minutes)

Les tests automatiques du socle tournent dans **Chromium en rendu logiciel, avec une émulation tactile en paysage**. Cette émulation ne reproduit ni Safari (WebKit), ni le GPU de l'iPhone, ni ses limites de mémoire. **Safari iPhone n'est donc pas validé** tant que ce protocole n'a pas été suivi sur un appareil réel.

## Préparation

- iPhone récent (iOS 17 ou plus), Safari, batterie > 30 %, mode économie d'énergie **désactivé**.
- Wi-Fi ordinaire (noter le débit, par exemple avec un test de vitesse). Faire une seconde passe en 4G/5G si possible.
- Adresse de la version à tester : celle fournie avec la livraison (version de test, pas la version publiée).
- **Navigation privée** pour un premier lancement réel : cache et sauvegarde vides.
- Tenir l'iPhone **en paysage** pendant tout le protocole.

## Étapes

| # | Action | À observer | Résultat |
|---|--------|-----------|----------|
| 1 | Ouvrir l'adresse, démarrer un chronomètre. | Écran de chargement, puis choix de la langue. Noter le temps jusqu'à l'écran titre (« Jouer »). | ____ s |
| 2 | « Jouer » → « C'est parti » → « En selle ». | Noter le temps entre « Jouer » et le personnage contrôlable (joystick visible). | ____ s |
| 3 | Toucher le téléphone **tout de suite**. | Le widget Strides indique au moins « 1 mission dispo » ; les 12 applications sont visibles ou accessibles en faisant défiler ; rien n'est caché sous le bouton de fermeture. | OK / KO |
| 4 | Strides → « Premiers pas » → « Accepter la mission » (deux touchers). | La mission démarre, l'objectif s'affiche en haut. | OK / KO |
| 5 | Jouer « Premiers pas » : aller au box, sortir Comète, monter. | Montée fluide, jambes du cavalier **le long du flanc**, sans traverser le cheval. | OK / KO |
| 6 | Pas, trot, galop, puis cercles au galop à gauche et à droite. | Jambes et pieds dans les étriers, genoux non écartés « en ailes », aucune jambe dans le corps du cheval, notamment à l'intérieur du cercle. | OK / KO |
| 7 | Un saut (bouton saut au galop), puis descendre de cheval. | Réception propre ; descente sans pied ni jambe dans le cheval. | OK / KO |
| 8 | Terminer la mission. | Carte de résultat, paiement et réputation affichés une fois. Noter l'argent : ____ €. | OK / KO |
| 9 | Aller près des véhicules de l'Écurie du Val (≈ 1 minute de jeu). | Le van Renault Master et le Defender apparaissent (chargés après la prise en main), sans à-coup marqué. | OK / KO |
| 10 | Recharger la page (geste ↻), puis « Continuer ». | Même argent, même réputation, « Premiers pas » terminée ; aucune récompense en double. | OK / KO |
| 11 | Jouer 3 minutes de plus (à cheval et à pied). | **Aucun rechargement spontané de la page, aucun écran blanc.** Si la page se recharge seule : noter le moment et l'action en cours. | OK / KO |
| 12 | En cas de plantage : rouvrir l'adresse. | Le jeu propose le mode sûr (ou ajouter `?secours` à l'adresse) et démarre. | OK / KO / non testé |

## Fiche de résultats

- Modèle d'iPhone et version d'iOS : ____________________
- Réseau et débit : ____________________
- Temps jusqu'à l'écran titre : ____ s · jusqu'à la prise en main : ____ s
- Fluidité ressentie (à cheval, au galop) : fluide / quelques à-coups / saccadé
- Échauffement ou baisse de fluidité après 5 minutes : oui / non
- Étapes KO (numéros et description) : ____________________
- Captures d'écran ou vidéo jointes : oui / non

Envoyer la fiche avec les captures. Une étape KO bloque la mise en ligne ; une remarque de confort (fluidité, temps) est notée et arbitrée.
