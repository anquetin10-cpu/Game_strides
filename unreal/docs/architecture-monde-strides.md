# Architecture du monde Strides reprise dans Equestrian Tour

Source de vérité fonctionnelle : la version web du même dépôt. L'Unreal n'est plus défini comme un simple parcours
CSO : il doit reproduire la boucle complète « monde ouvert équestre + téléphone Strides + carrière ».

## Boucle principale

1. Arrivée à l'Écurie du Val avec Comète et zéro euro.
2. Proposition de mission dans le téléphone Strides, acceptation ou refus.
3. Déplacement libre à pied, à cheval ou en véhicule dans Deauville City et sa région.
4. Réalisation de la mission, paiement, avis et réputation.
5. Progression Groom → Cavalier → Pro vérifié → International → Légende 5★.
6. Finale sportive au Grand Prix de Paris Indoor.

## Piliers à conserver

- Carte ouverte de 1,2 km² et topologie identique à la version web.
- Écurie du Val comme foyer : box de Comète, maison, carrière, véhicules.
- Deauville City, commerces visitables, Strides HQ, professionnels et services.
- Pôle International, hippodrome, plage, Haras de la Pommeraie, Dunes et Saint-Gatien.
- Téléphone Strides : Missions, Écuries, Transport, Événements, Annuaire, Carte, Messages, Trophées, Profil.
- Missions scénarisées, jobs générés, activités libres, économie, équipement et sauvegarde.
- Avatar constant à pied, à cheval et en véhicule ; casque monté, tenue de concours seulement en concours.
- Cycle jour/nuit, météo, fatigue, repos, état et endurance du cheval.
- Commandes iPhone paysage : joystick, caméra, ACTION, SAUT, BOOST et téléphone.
- FR/EN et identité séparée : Equestrian Tour est le jeu, Strides est l'application intégrée.

## Architecture Unreal

- `world_architecture.json` : carte, régions, routes, POI, progression, applications et graphe des missions.
- `UStridesDataSubsystem` : charge les données et les expose à C++/Blueprint.
- `AStridesWorldDirector` : construit le socle spatial, les routes, les lieux, le Pôle et le guidage de mission.
- `UStridesProgressionSubsystem` : chaîne les 16 missions, leurs prérequis, récompenses, réputation et rangs.
- `AStridesHUD` : téléphone Strides, état de carrière, minicarte et cible GPS.
- `UStridesSaveSubsystem` : sauvegarde versionnée compatible avec l'export web, étendue à la carrière native.
- Étapes artistiques après la bêta : véhicules pilotables, commerces/intérieurs, cycle de vie et remplacement des
  volumes procéduraux par les décors définitifs.

Les volumes procéduraux colorés constituent le décor fonctionnel de la bêta : ils rendent les zones et bâtiments
lisibles, mais ne sont pas les décors définitifs. Leur intérêt est de valider la boucle complète, l'échelle et les
coordonnées sur appareil avant les imports artistiques lourds.
