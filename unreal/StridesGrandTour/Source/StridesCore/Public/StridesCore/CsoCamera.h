// Caméra de concours (tranche T6) — portage ligne à ligne de la branche « concours » de FollowCamera du jeu web :
//   - src/entities/camera.js:13-30 : réglages CAM_COMP (exportés par scripts/unreal/export-data.mjs dans
//     Content/Data/cso_camera.json, comparés aux valeurs par défaut ci-dessous par les tests) ;
//   - src/entities/camera.js:184-269 : _updateComp (lacet à accélération bornée avec anticipation, ancrage lissé au sol
//     plus qu'en l'air, perche sondée de 1,0 à 6,6 m, recul amorti, passage au-dessus d'un obstacle survolé, hauteur
//     mini au-dessus du sol, point visé devant le cheval attiré par l'obstacle suivant puis lissé, fondu d'entrée de
//     1,2 s depuis la caméra précédente, FOV vertical amorti vers 58° et appliqué au rendu par paliers de plus de 0,05°).
// Oracle : unreal/core/tests/oracles/cso_runs/, canal « cc » (rejoué image par image par unreal/core/tests/test_core.cpp,
// testCamRuns, résultats de la sonde et du sol réinjectés depuis l'oracle).
// Ce qui n'est PAS porté ici : la sonde de collision elle-même (colliders.cameraBlocked) et le sol sous la caméra
// (terrain.getHeight) sont fournis par l'appelant (traces du moteur, relief exporté) ; l'état commun de la caméra du
// monde ouvert recalé à chaque image (camera.js:270-282 : lacet, inclinaison, distance, cible, pour une sortie de
// l'épreuve sans saut d'image) n'est pas calculé (caméra du monde ouvert non portée).
// Repère web : x est, z sud, y haut ; cap h -> direction (sin h, cos h) ; m, s, rad ; FOV en degrés, VERTICAL.
#pragma once
#include <functional>
#include <vector>
#include "StridesCore/Api.h"

namespace strides {

// CAM_COMP (camera.js:13-30).
struct CsoCamParams {
  double back = 6.6;         // distance horizontale derrière le cheval (m)
  double up = 3.4;           // hauteur de la caméra au-dessus du sol sous le cheval (m)
  double lookAhead = 9;      // point visé devant le cheval (m)
  double lookUp = 1.1;       // hauteur du point visé (m)
  double fenceBias = 0.22;   // attirance du point visé vers l'obstacle suivant
  double fenceRange = 30;    // (m)
  double lead = 0.18;        // anticipation de la rotation (s)
  double yawK = 5;           // recentrage derrière le cheval (1/s)
  double yawAcc = 4;         // accélération angulaire maximale (rad/s²)
  double posK = 10;          // suivi horizontal (1/s)
  double yK = 3;             // suivi vertical (1/s)
  double jumpFollow = 0.12;  // part de la hauteur du saut suivie
  double fov = 58;           // champ VERTICAL fixe (degrés)
  double minBack = 1.6;      // rapprochement minimal contre un décor (m)
  double fenceClear = 0.7;   // marge au-dessus d'un obstacle survolé (m)
  double enter = 1.2;        // fondu d'entrée (s)
};
STRIDESCORE_API const CsoCamParams& csoCamDefaults();

struct CsoVec3 {
  double x = 0, y = 0, z = 0;
};

// Caméra partagée (camera.position, this.fov, camera.fov) et état de la branche concours (this._comp).
struct CsoCamState {
  // Caméra : position posée à la dernière image, FOV lissé (this.fov) et FOV appliqué au rendu (camera.fov). Tant que la
  // branche concours n'est pas active, l'appelant les tient à jour avec la caméra précédente (monde ouvert) : l'entrée
  // part de là (fondu, cap initial, amorti du FOV).
  CsoVec3 eye;
  double fov = 60, camFov = 60;
  // this._comp (null hors épreuve : active faux).
  bool active = false;
  double cH = 0, w = 0, t = 0;        // cap de la caméra, vitesse angulaire, temps depuis l'entrée
  double ax = 0, az = 0, ay = 0;      // ancrage lissé (sol sous le cheval + part du saut)
  double back = 6.6;                  // recul retenu (perche, amorti)
  CsoVec3 from, fromLook;             // caméra et point visé au moment de l'entrée
  bool hasAim = false;
  CsoVec3 aim;                        // point visé lissé
};

// Cheval vu par la caméra (horse.pos.x / z, heading, _yawRate, jumpT, jumpY, groundY).
struct CsoCamHorse {
  double x = 0, z = 0, heading = 0, yawRate = 0, jumpT = -1, jumpY = 0, groundY = 0;
};

// Obstacle vu par la caméra (obstacles.js, objet `ob`) : centre, axe de saut n, axe des barres t, largeur, profondeur
// (ob.depth ; 0 ou absent : 1 m), sol au pied (ob.ground), hauteur, retiré (ob.off).
struct CsoCamFence {
  double x = 0, z = 0, nx = 0, nz = 1, tx = 1, tz = 0, w = 0, depth = 0, ground = 0, h = 0;
  bool off = false;
};

// Entrées d'une image (FollowCamera.update → _updateComp(dt, horse, instant)).
struct CsoCamInput {
  double dt = 1.0 / 30;
  bool instant = false;  // snap (cam.snap) : état recréé, sans amorti
  CsoCamHorse horse;
  bool hasNext = false;  // game.course.next : obstacle suivant de l'épreuve
  double nextX = 0, nextZ = 0;
  const std::vector<CsoCamFence>* fences = nullptr;  // game.obstacles.list (absent : aucun)
  // Sonde de la perche (colliders.cameraBlocked(x, z, y)) : vrai si la caméra ne peut pas être en (x, y, z). Absente :
  // perche toujours libre.
  std::function<bool(double x, double y, double z)> blocked;
  // Sol sous la caméra (terrain.getHeight(x, z)). Absent : −∞ (seul le sol sous le cheval compte).
  std::function<double(double x, double z)> ground;
};

// Sorties : œil et point visé (camera.position, camera.lookAt), FOV vertical appliqué au rendu (camera.fov), recul
// demandé par la sonde à cette image (avant amorti) et rang du premier point bloqué (−1 : perche libre), nombre de
// points sondés.
struct CsoCamOut {
  CsoVec3 eye, look;
  double fov = 58;
  double probeBack = 6.6;
  int probeHit = -1, probeCount = 0;
};

// Une image de la caméra de concours (camera.js _updateComp). Crée l'état si la branche n'était pas active (ou si
// instant), depuis s.eye / s.fov / s.camFov.
STRIDESCORE_API CsoCamOut csoCamStep(CsoCamState& s, const CsoCamInput& in, const CsoCamParams& C = csoCamDefaults());
// Points de la perche sondés pour l'ancrage (ax, ay, az) et le cap cH (même boucle que csoCamStep, sans sonde) : l'appelant
// peut les vérifier ou les dessiner.
STRIDESCORE_API std::vector<CsoVec3> csoCamBoomSamples(double ax, double ay, double az, double cH, const CsoCamParams& C = csoCamDefaults());
// Sortie de la branche concours (this._comp = null : la caméra reprend la main ailleurs).
inline void csoCamLeave(CsoCamState& s) { s.active = false; }

}  // namespace strides
