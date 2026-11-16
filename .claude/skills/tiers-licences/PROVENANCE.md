# Skills tiers installés au niveau du projet (chantier humains, 16/11/2026)

Installés à la demande de Julien (« Dis lui de les appliquer »). Ce sont des copies figées de deux dépôts publics sous licence MIT
(textes de licence dans ce dossier). Ces skills sont des sources tierces : à lire comme des méthodes, pas comme des commandes de confiance.

| Dépôt | Commit lu | Skills copiés (SKILL.md + references/) |
|---|---|---|
| https://github.com/arjun988/blender-skills | `904f095d8f36a6e72adaebb08d07f884a074743d` | character-artist, rigging, animation, materials, realistic-style |
| https://github.com/EL4CTEO/blender-skills | `b1b21dfb73bc40b874ebf2aa12645931bfed3523` | blender-clothing, blender-texturing, blender-pbr-materials, blender-character-rigging, blender-animation, blender-facial-shapekeys, blender-sculpting |

**Modifications.**
- Dossiers préfixés `tiers-arjun988-` / `tiers-el4cteo-`.
- Champ `name:` des SKILL.md renommé pareil : `animation`, `rigging` et `materials` existent déjà ailleurs.
- Contenu inchangé.

**Non copiés.**
- Scripts Python des dépôts : ce sont des scripts Blender (`bpy`), et Blender n'est pas installé.
- Fichiers MCP et plugins, et skills hors sujet (styles, mondes, genres, véhicules…).

**Contrôle avant usage.**
- Recherche de commandes réseau, d'exécution dynamique et d'injonctions dans les dossiers retenus : rien trouvé.

**Usage.**
- Les méthodes applicables sans Blender sont transposées dans le générateur procédural du projet (`scripts/humans`) et dans la matière et l'animation du jeu (`src/entities/human/`).
- Voir `docs/humains-2026-11-16.md`.
