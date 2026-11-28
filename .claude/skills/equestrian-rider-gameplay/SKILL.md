---
name: equestrian-rider-gameplay
description: "Concevoir, implémenter ou auditer un cavalier humain dans un jeu 3D : proportions, rig, posture montée, contacts selle-étriers-rênes et accompagnement du saut. Complète equine-jump-gameplay sans remplacer la physique du cheval."
---

# Cavalier humain et coordination cheval-cavalier

## 1. Délimiter le travail
Identifier la demande : concevoir un humain, articuler un modèle, animer son accompagnement ou auditer un défaut. Lire le code et les assets concernés avant de proposer une reconstruction. Vérifier moteur/version, unités, axes, squelette, clips, root motion et repères de selle, étriers et rênes. Préserver les modifications et réglages de position de l'utilisateur. Ne pas convertir une demande d'audit en modification.
Chercher les moyens déjà disponibles ; Blender/MPFB sont optionnels, jamais une dépendance implicite. Aucun téléchargement, installation, service payant ou publication découlant automatiquement de ce skill.
Terminé : périmètre et livrable explicités dans une note du projet, points inconnus identifiés.

## 2. Séparer observations, sources et réglages
Lire [sources et limites](references/sources.md). Les études repérées ne définissent aucune posture universelle ni angle idéal. Aucun angle, timing, budget de polygones ou critère chiffré présenté comme mesuré sans passage source et protocole vérifiés.
Distinguer observation vidéo, résultat scientifique, hypothèse d'animation, préférence de Julien et choix de gameplay. Les consignes de ce skill concernent un jeu, pas un entraînement réel ni une expertise médicale.
Terminé : provenance des choix consignée, hypothèses explicites.

## 3. Construire selon la branche
### Modélisation humaine
Lire [humain et rig](references/humain-rig.md). Réutiliser un humain exploitable avant de le reconstruire. Vérifier proportions à l'échelle du cheval et de la selle, tenue séparée si utile, topologie déformable et licence de chaque asset. Préparer la version mobile d'après des mesures, pas une cible arbitraire. Ne pas prendre une silhouette en image pour une reconstruction 3D exacte.
Terminé : fiche d'asset ou modification ciblée ; origine et droits renseignés.
### Articulation
Cartographier bassin, tronc, tête, bras, mains, cuisses, jambes et pieds ; gérer orientation des axes, limites et poids. Définir propriétaire et ordre d'écriture des os : animation de base, corrections, contraintes, matrices finales. Interdire la double écriture accidentelle entre mixer et pose procédurale. IK seulement si adaptée ; prévoir singularités, cibles inaccessibles et repli sans allongement des membres.
Terminé : carte du rig et tests de poses dans l'environnement effectivement disponible.
### Posture et accompagnement
Lire [coordination du saut](references/coordination.md). Synchroniser le cavalier sur les phases et contacts déjà exposés par le cheval, pas sur un deuxième chronomètre indépendant. Séparer déplacement global du couple, orientation locale du bassin et articulations. Ne pas modifier la trajectoire du cheval pour masquer un défaut de cavalier.
Terminé : courbes ou corrections limitées au défaut demandé, paramètres nommés et réglages existants préservés.
### Audit
Appliquer [la grille visuelle](references/verification.md). Pour chaque défaut, citer phase, repère, preuve et couche responsable probable. Persister le diagnostic sans modifier les assets ou le gameplay.
Terminé : diagnostic localisé, pistes classées, inconnues maintenues visibles.

## 4. Vérifier et remettre
Rejouer les scénarios concernés dans le jeu réel, au ralenti et à vitesse normale, de profil et de trois quarts. Utiliser equine-jump-gameplay pour le cheval et threejs-animation si disponibles ; leur absence n'autorise aucune installation. Adapter toute API à la version du moteur installée.
Consigner dans la documentation du projet : fichiers modifiés, avant/après, scénarios, régressions, mesures, limites et questions de jugement équestre réservées à Julien. Ne pas déduire d'un build vert une posture crédible. Si le jeu ou l'appareil n'a pas été utilisé, écrire « validation visuelle non effectuée » ou « appareil non testé ».
Terminé : preuves vérifiables et bilan ; aucune fusion, publication ni déploiement implicites.
