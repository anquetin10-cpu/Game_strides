---
name: equine-jump-gameplay
description: Concevoir, implémenter ou auditer le saut d’un cheval dans un jeu vidéo, notamment Grand Tour : appel, trajectoire, rotation du corps, articulation des membres et réception. Utiliser pour une animation de saut, une physique de franchissement ou un défaut de coordination, pas pour un conseil vétérinaire ou un programme d’entraînement réel.
---

# Saut équestre pour jeu vidéo

## 1. Cadrer le résultat
Identifier le moteur, le rig et ses axes, les unités, les animations existantes, la commande de saut et le défaut observé. Chercher d’abord les composants déjà présents et les bibliothèques maintenues adaptées. Ne pas remplacer l’architecture sans nécessité.
Choisir une branche : conception, implémentation ou audit. Fixer avec le contexte disponible le niveau de réalisme, le type d’obstacle et le livrable.
Fin : contrat explicite et fichiers concernés localisés ; aucune dépendance payante implicite.

## 2. Séparer preuves et hypothèses
Lire [les sources](references/sources.md). Pour chaque affirmation ou réglage, distinguer : observation publiée, hypothèse de simulation, préférence de gameplay. Avant tout paramètre chiffré issu d’une étude, consulter le passage original, les unités, la population et le protocole. Un résumé ne suffit pas à reconstruire une courbe d’animation.
Ne pas extrapoler automatiquement les mesures à 1 m ou en liberté vers un parcours monté à 1,60 m. Ne pas confondre garrot, racine du modèle et centre de masse. Aucune valeur inventée présentée comme mesurée.
Fin : décisions accompagnées de leur provenance et incertitudes visibles.

## 3. Concevoir trois couches coordonnées
- Trajectoire globale : déplacement du centre de masse approximé ou du repère explicitement choisi. Pour un modèle balistique simplifié en vol, documenter gravité, vitesse initiale et hypothèses ; ne pas confondre hauteur de barre et élévation du centre de masse. En vol, les mouvements internes modifient la posture, pas arbitrairement la trajectoire du centre de masse.
- Orientation et posture : tronc, bassin, dos et tête-encolure. La bascule n’est pas une simple rotation d’un cheval rigide. Ne pas attribuer une courbure uniforme à toute la colonne.
- Membres et contacts : appuis, flexion, dégagement des barres, extension et absorption. Les pieds en appui doivent rester cohérents avec le sol ; employer l’IK si adaptée au rig, sans étirement anatomique arbitraire.
Décomposer en approche, préparation/appel, envol, franchissement, descente, réception, reprise du galop. Ce découpage est une convention de développement ; les mouvements se chevauchent. Respecter le pied de galop et les asymétries pertinentes plutôt qu’imposer des contacts simultanés.
Fin : phases, transitions et responsabilités de chaque couche définies, sans double déplacement par root motion et physique.

## 4. Produire selon la branche
### Conception
Écrire une fiche dans le dossier de documentation du projet : diagramme des phases, paramètres nommés avec unités, provenance, gestion des entrées joueur, critères d’acceptation. Ne pas inventer de plages physiologiques.
### Implémentation
Inspecter le code existant, modifier le périmètre demandé, synchroniser transitions et collisions avec les contacts. Préserver les contrôles. La trajectoire ne garantit pas à elle seule le dégagement des sabots. Les styles individuels sont des paramètres de coordination, pas un classement automatique par hauteur de saut. Distinguer choix arcade et comportement physique ; pas de correction invisible de trajectoire prétendue réaliste.
### Audit
Localiser le défaut par couche et phase. Relier chaque constat à une capture, un horodatage ou un passage de code. Classer les corrections ; enregistrer le diagnostic dans la documentation du projet sans changer le gameplay sauf demande.
Fin : fiche persistée, modification ciblée ou diagnostic vérifiable ; chemins précis conservés.

## 5. Vérifier dans le jeu
Appliquer [la grille de vérification](references/verification.md). Examiner le rendu à vitesse réelle et au ralenti, de profil puis de face/trois quarts. Si une référence vidéo est disponible et utilisable, comparer les phases sans prétendre obtenir une mesure 3D à partir d’une seule vue.
Un build ou typecheck vert ne prouve pas un saut crédible. Signaler explicitement ce qui n’a pas pu être observé. Réserver les tests automatisés aux invariants utiles et régressions, sans tester simplement une copie de l’implémentation.
Fin : résultat, preuves, limites, fichiers produits et corrections restantes rapportés ; aucun déploiement implicite.
