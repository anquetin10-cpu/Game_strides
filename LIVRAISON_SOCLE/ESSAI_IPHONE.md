# Essai sur iPhone réel : version candidate du socle (≈ 10 minutes)

Cette version est **candidate**. Elle n'est pas publiée : le site public (GitHub Pages) reste inchangé tant que l'essai n'est pas fait et qu'aucun accord explicite n'a été donné. **Safari iPhone n'est pas validé** avant cet essai : tout ce qui suit a été vérifié en émulation (Chromium en rendu logiciel, iPhone simulé en paysage), jamais sur un vrai téléphone.

- **Où jouer :** page privée claude.ai « Equestrian Tour · candidat », lien fourni avec la livraison. Elle est séparée de la production.
- **Quelle version :** le menu pause (bouton ⏸) affiche l'identifiant de la version construite. Il doit commencer par le commit candidat annoncé, **sans** « +modifs ».
- **Sauvegarde réelle :** **rien à effacer.** La page d'essai a sa propre sauvegarde, distincte de celle du site public.
- **Avant de commencer :** iPhone en paysage, mode économie d'énergie désactivé, Wi-Fi.

## 1. Posture du cavalier au galop (priorité, ≈ 4 min)

Nouvelle partie, première mission jusqu'à monter sur Comète, puis à cheval :

| Situation | À observer | Critère de réussite |
|---|---|---|
| Pas, trot | Jambe le long du flanc, étrier bas, talon plus bas que la pointe | Aucune jambe ni botte dans le cheval |
| Galop en ligne droite, vue de profil (caméra sur le côté) | Genou et mollet contre le flanc | Jambe naturelle, ni dans le cheval, ni écartée « en A » |
| Galop, vue arrière | Les deux jambes symétriques autour du ventre | Pieds pas plus écartés que nécessaire ; genoux pas « en ailes » |
| Cercles au galop, à gauche puis à droite | La jambe **extérieure** au virage | Au pire un frôlement à un instant de la foulée ; jamais une botte visiblement enfoncée |
| Saut (bouton saut au galop), montée et descente | Jambes pendant l'appel, le sommet, la réception, la montée, la descente | Aucune jambe dans le cheval |

**Vérifié en émulation :**
- pénétration de la jambe dans le corps du cheval : 0 cm dans toutes ces situations ;
- au galop, la jambe extérieure frôle le flanc à un instant de la foulée (moins de 1 cm entre l'axe du tibia et la peau).

**Reste à juger à l'œil** (Julien) : le naturel de la posture. Les chiffres ne le prouvent pas.

## 2. À-coup au chargement différé des véhicules (≈ 1 min)

Le van Renault Master et le Defender se préparent **6 s après la prise en main**, jamais pendant que le téléphone, un dialogue ou une carte est ouvert.

| À observer | Critère de réussite |
|---|---|
| Rester dans la cour de l'Écurie du Val juste après « En selle », puis regarder le van et le Defender apparaître | Un à-coup bref est acceptable. Échec : une saccade de plus d'environ 1 s, des touchers perdus ou une page qui se recharge |

**Vérifié en émulation :** chargement correct, sans erreur ; les touchers restent pris en compte pendant la préparation (confirmation « Accepter »).

**Inconnu :** la durée de l'à-coup sur un vrai iPhone. Le rendu logiciel est beaucoup plus lent et ne permet pas de la juger.

## 3. Nouvelle partie → première mission → récompense → sauvegarde → rechargement (≈ 4 min)

| Étape | Critère de réussite |
|---|---|
| Jouer → C'est parti → **En selle**, puis toucher le téléphone aussitôt | Le widget indique « 1 mission dispo » ; les 12 applications sont visibles ou accessibles en faisant défiler ; rien sous le bouton de fermeture |
| Strides → « J'ai compris » → « Premiers pas » → « Accepter la mission », deux touchers | La mission démarre, le téléphone se range |
| Finir « Premiers pas » | Carte de résultat ; argent et réputation versés **une seule fois** (noter le montant) |
| Recharger la page, puis **Continuer** | Même argent, même réputation ; « Premiers pas » terminée et non reproposée |

**Vérifié en émulation** (844×390 et 667×300) : tout ce parcours. La récompense mesurée est de +55 € et +60 de réputation.

## 4. Reprise d'une sauvegarde existante, sans toucher à la vraie (≈ 1 min, facultatif)

1. Sur le site public, ouvrir Réglages → **« Copier ma sauvegarde »**. Cela lit la sauvegarde sans la modifier.
2. Dans la page d'essai, ouvrir Réglages → **« Restaurer cette sauvegarde »**, coller, recharger, puis Continuer.

**Critère :** la partie reprend avec l'argent, les chevaux et l'avancement attendus. La sauvegarde du site public n'est pas touchée.

## Réserves sur le canal d'essai

- **Stockage.** La page d'essai s'affiche dans claude.ai, qui peut restreindre le stockage local de Safari. Si la sauvegarde ne survit pas au rechargement *dans la page d'essai seulement*, noter « canal » plutôt que « jeu ». Ce point sera refait sur GitHub Pages après accord.
- **Démarrage.** La page d'essai tient en un seul fichier (environ 15,6 Mo plus les modèles 3D). Elle **ne mesure pas** le démarrage. Le gain mesuré vaut pour la version GitHub Pages : **11,44 → 8,42 Mo** transférés avant de jouer, dans les mêmes conditions, soit environ −26 %. Les 27 Mo de l'audit étaient des tailles décompressées. **Aucun gain de délai de prise en main n'est démontré.**

## Fiche de résultats

- **Appareil :** modèle d'iPhone et version d'iOS : ____________
- **Version :** identifiant affiché dans la pause : ____________
- **Résultats par point :**

| Point | OK | KO | Remarque |
|---|---|---|---|
| 1. Posture | ☐ | ☐ | |
| 2. À-coup | ☐ | ☐ | |
| 3. Parcours | ☐ | ☐ | |
| 4. Reprise | ☐ | ☐ | ☐ non testé |

- **Plantage ou rechargement spontané :** oui / non ; si oui, à quel moment : ____________
- **Captures ou vidéo jointes :** oui / non

Un KO bloque la publication. Une remarque de confort est notée, puis arbitrée.
