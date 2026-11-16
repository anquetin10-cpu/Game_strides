# Vérification du saut dans le jeu

Pour chaque point, consigner observé conforme, défaut observé ou non vérifié, avec une preuve. Adapter les scénarios au périmètre réellement modifié ; ne pas revendiquer une fidélité biomécanique validée sur la seule inspection visuelle.

## Contrôles visuels

- Approche → appel : continuité de vitesse et de posture, pas de téléportation ; préparation visible et cohérente avec les appuis.
- Appuis : pas de glissement manifeste des sabots ancrés ; pas de traversée du sol ou d’allongement impossible des membres.
- Envol et franchissement : dissocier trajectoire du corps, bascule et repli ; vérifier les sabots et non seulement le tronc contre les barres.
- Dos, tête et encolure : coordination sans cassure ni rotation rigide uniforme du modèle.
- Réception : contacts séquencés selon l’animation retenue, absorption puis reprise du galop ; pas de retour instantané à une pose neutre.
- Cavalier si présent : continuité de son équilibre et de ses contacts ; éviter mains, selle et rênes déconnectées. Critère de cohérence visuelle, pas conclusion des articles référencés.

## Scénarios représentatifs

Dans les plages autorisées par le jeu : vertical et oxer si pris en charge, petite et grande hauteur, vitesse basse et haute, appel proche et loin, deux pieds de galop. Vérifier le cas nominal et au moins un cas limite pertinent pour la modification.

Définir explicitement ce que fait le jeu si le saut est irréalisable : faute, refus ou assistance arcade. Ne pas faire réussir tous les appels par une attraction automatique non documentée.

## Invariants techniques utiles

- Définir le repère vertical et les unités ; vitesses finies et trajectoire continue.
- Absence de double application du root motion et du déplacement physique.
- Transitions et événements de contact stables sur plusieurs cadences d’affichage supportées.
- Collisions cohérentes avec les barres et les membres visibles, ou approximation clairement déclarée.

## Bilan minimal

Contexte de test, scénarios observés, défauts restants, captures ou vidéo si disponibles, fichiers modifiés. Séparer compilation réussie, fonctionnement observé et réalisme jugé. Si le jeu n’a pas été lancé, écrire « validation visuelle non effectuée ».
