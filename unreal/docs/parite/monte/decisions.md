# Essai de monte — décisions de Julien

| Date | Point | Décision | Chiffres au moment de la décision |
|---|---|---|---|
| 20/11/2026 | Voie | **Voie A** : règles de monte du web v3 portées en C++ et appliquées par Control Rig à la cavalière actuelle. Voie B (MetaHuman) écartée pour l'instant. | — |
| 20/11/2026 | J3, longueur d'étriers | **Longueur v3 conservée** : `stirrupY` = −0,64 m sous le point d'assise (borne la plus courte de la règle v3), aucun raccourcissement. | Arrêt (O2, cavalier classique) : genou 132,2°, ρ 0,914. Galop : genou le plus fermé 117,5°. Sommet du saut : genou 142,1°. Détail : `o2.md` §4, `v3-mesures.md`. |
| 24/11/2026 | Clips miroir du cheval | **Porter dans Unreal la logique web qui inverse les clips de droite** (`pjl/asset.js` bakeMirror, `pjl/view.js` leadBlend), puis la comparer et la prouver face au web (étape M2). | Avant M2 : cheval Unreal toujours sur les clips d'origine, aucun clip `_M` ; 0 image d'O1 avec clip miroir rejouée dans le moteur (README, étape 5). |
