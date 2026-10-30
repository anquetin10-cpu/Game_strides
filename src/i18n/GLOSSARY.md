# Traduction anglaise — conventions et glossaire

Mécanique : `src/core/i18n.js`. Le français est le texte source ; l'anglais est dans `src/i18n/en/*.js`
(`{ 'texte français exact': 'English text' }`). Vérification : `node scripts/i18n-check.mjs [fichiers]`.

## Règles

- Texte fixe : `t('Texte')`. Gabarit : `` T`Obstacle n°${n} sur ${total}` `` → clé `Obstacle n°{0} sur {1}`, traduction
  `Fence {0} of {1}` (les `{n}` peuvent changer d'ordre). `t('… {0} …', x)` existe aussi.
- La clé est **exactement** le texte français (mêmes apostrophes ’, espaces insécables ` ` / ` `, mêmes
  échappements). En français, `t()` / `T` renvoient le texte d'origine : rien ne change pour les joueurs francophones
  ni pour les tests (qui tournent en français).
- Ne jamais traduire : identifiants, `data-id`, clés de sauvegarde, noms d'événements, classes CSS, couleurs, URL,
  expressions régulières, textes seulement comparés dans le code.
- Si le code compare un texte affiché (`===`, `includes`, `/…/.test`) : comparer un identifiant à la place, ou la clé
  française avant traduction.
- Pluriels : si le français et l'anglais diffèrent (cheval / chevaux), deux textes : `n > 1 ? T\`${n} chevaux\` :
  T\`${n} cheval\``.
- HTML dans un texte : garder les balises à l'identique dans la traduction.
- Nombres et heures : `dec()` (core/math.js), `num()`, `int()`, `euros()`, `hourText()` (core/i18n.js) au lieu de
  `.replace('.', ',')`, `toLocaleString('fr-FR')`, « 20 h 30 ».
- Les textes calculés au chargement d'un module sont permis : changer de langue recharge le jeu.

## Style

- Anglais britannique, naturel et concis (jeu mobile). Tutoiement → « you ». Garder le ton (chaleureux, sportif).
- Noms propres inchangés : personnages, chevaux, STRIDES, Deauville City, Côte Fleurie, Pôle International,
  Haras de la Pommeraie, Écurie du Val, Grand Prix de Paris Indoor, Saint-Gatien, A13, Normandie → Normandy.
- Monnaie : euros (« €14,850 »).

## Glossaire équestre

| Français | English |
|---|---|
| CSO, saut d'obstacles | show jumping |
| parcours | course |
| obstacle | fence (jump) |
| vertical | vertical |
| oxer | oxer |
| mur | wall |
| double / triple | double / treble (combination) |
| barre (tombée) | rail (down) / pole |
| refus | refusal |
| élimination / éliminé | elimination / eliminated |
| sans faute | clear round |
| temps accordé | time allowed |
| temps limite | time limit |
| pénalités, points | faults, penalties |
| barrage | jump-off |
| barème A / C | Table A / Table C |
| détente, échauffement, paddock | warm-up, warm-up arena, paddock |
| piste, carrière | arena |
| manège | indoor arena |
| abord, foulée | approach, stride |
| zone d'appel / appel | take-off zone / take-off |
| réception | landing |
| reconnaissance du parcours | course walk |
| cross | cross-country |
| pas / trot / galop | walk / trot / canter |
| grand galop | gallop |
| monter, descendre (de cheval) | mount, dismount |
| cavalier, cavalière | rider |
| groom | groom |
| écurie, écuries | stable, stables |
| box | stall |
| sellerie | tack room (lieu) / saddlery (boutique) |
| pansage, panser | grooming, groom |
| brosse, cure-pied | brush, hoof pick |
| douche | wash bay / hose down |
| foin, granulés, aliment | hay, pellets, feed |
| maréchal-ferrant | farrier |
| vétérinaire | vet |
| robe (cheval) | coat |
| haras | stud farm |
| pré | paddock / field |
| van, camion | horsebox / horse lorry (truck) |
| hippodrome | racecourse |
| concours | show / competition |
| épreuve | class |
| réputation, palier | reputation, tier |
| fer d'or | golden horseshoe |
| mission | mission |
| défi | challenge |
| récompense, dotation | reward, prize money |
