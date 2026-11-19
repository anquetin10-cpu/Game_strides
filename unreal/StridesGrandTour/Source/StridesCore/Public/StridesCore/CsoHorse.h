// Cheval de concours — portage ligne à ligne de la partie « cheval du joueur en épreuve de CSO » du jeu web :
//   - src/gameplay/csoRide.js : csoRideStep (cadence initiale arrondie, rampe clavier, gel pendant le refus) ;
//   - src/entities/horse.js : update (lacet exponentiel puis borné, airTurn sur la rotation effective, pas de direction
//     pendant le cabré, accélération 4,5 / 3,6 / 9 et freinage du refus, saut par dt / jumpDur, perte à la réception),
//     startJump (trop lent, refus engagé, épreuve : cible / zone / 1,9 × L0, zone refuse et x ≥ 0), refuse, brake ;
//   - src/gameplay/obstacles.js : add / _bars / faces avant-arrière (makeCsoObstacle), target, timing, refuse ;
//   - src/core/input.js : poll (déplacement venu du clavier, Ctrl / Alt).
// Oracles : unreal/core/tests/oracles/cso_runs.json (canal « ch », rejoué image par image) et cso_target.json (visée).
// Ce qui n'est PAS porté ici (entrées de l'appelant ou tranches suivantes) : collisions du monde (colliders.resolve),
// profondeur d'eau et pente (fournies par l'appelant), endurance et état physiologique (puissance fournie par
// l'appelant), jugement des barres, refus décidés à l'abord, comptage des refus (Obstacles.updateHorse : portés par
// CsoFences.h, tranche T3).
// Unités SI, repère web (x est, z sud, cap h -> direction (sin h, cos h)).
#pragma once
#include <functional>
#include <string>
#include <vector>
#include "StridesCore/Api.h"
#include "StridesCore/CsoRide.h"
#include "StridesCore/JumpModel.h"

namespace strides {

// Constantes nommées du jeu web lues par le portage (valeurs par défaut = source ; les tests les comparent à celles que
// scripts/unreal/export-data.mjs extrait du source dans Content/Data/cso_horse.json).
struct CsoHorseParams {
  double ref = 0.4;            // obstacles.js REF : point de référence du saut, épaules à 0,4 m devant l'origine
  double nose = 1.6;           // obstacles.js NOSE : nez du cheval devant l'origine
  double overrun = 0.6;        // obstacles.js OVERRUN : avancée maximale du nez au-delà de la face de l'obstacle
  double jumpDuration = 0.8;   // config.js HORSE.jumpDuration
  double minJumpSpeed = 3.2;   // config.js HORSE.minJumpSpeed
};
STRIDESCORE_API const CsoHorseParams& csoHorseDefaults();

// Obstacle du monde tel que le voit le cheval (obstacles.js : objet `ob` après add / _mesh).
struct CsoObstacle {
  std::string label, kind = "v", course;
  int num = 0;
  double x = 0, z = 0, rot = 0, w = 3.6, h = 1.1, spread = 0;
  Vec2 n{0, 1}, t{1, 0};
  std::vector<Bar> bars;
  double front = 0, back = 0, depth = 0;
  bool off = false, solid = false;
  Fence fence() const { return Fence{{x, z}, n, t, bars, kind}; }
};
// obstacles.js add() + _bars() + faces (_mesh) : oxer sans écartement → 1,2 m ; barres ; faces avant / arrière.
STRIDESCORE_API CsoObstacle makeCsoObstacle(const std::string& kind, double x, double z, double rot, double h, double w,
                                            double spread = 0, const std::string& label = "", int num = 0,
                                            const std::string& course = "", bool solid = false);

// Obstacle visé (obstacles.js target) : indice dans la liste (−1 : aucun), géométrie et plan de saut.
struct CsoTarget {
  int index = -1;
  FenceGeo geo;
  JumpPlan plan;
};

// Événements du bus émis par le cheval (horse.js).
enum class CsoHorseEvent { Jump, JumpEarly, TooSlow, Refuse, Land };
STRIDESCORE_API const char* csoHorseEventName(CsoHorseEvent);  // "horse:jump", …

// Passage en cours au-dessus d'un obstacle (obstacles.js _judge / limbContact : horse._pass). cause = clé du jeu web
// (« short », « far », « near », « tooClose », « angle », « slow », « fast », « hindRail », « foreRail ») ou vide ; marge
// minimale des barres jugées (+∞ tant qu'aucune ne l'est) ; exitT = heure de sortie des épaules (0 : pas encore, comme
// le `!pass.exitT` du JS).
struct CsoPass {
  int o = -1, dir = 1;
  bool fault = false, done = false;
  std::string cause;
  double margin = 0, exitT = 0;
};
// Dernier refus compté (obstacles.js _count : horse._refusal) : obstacle, heure, cheval détourné depuis.
struct CsoRefusalMemo {
  int o = -1;
  double t = 0;
  bool away = false;
};

// État du cheval du joueur et de sa conduite de concours (champs du Horse et du Player web utilisés par le pas).
struct CsoHorseState {
  double x = 0, z = 0, heading = 0, speed = 0;
  double yawRate = 0;    // _yawRate
  double lastTurn = 0;   // lastTurn (lissé, animation)
  double jumpT = -1, jumpY = 0, jumpPeak = 0, jumpLen = 0, jumpDur = 0;
  double jt0 = -1, jt1 = -1;  // progression du saut avant / après l'image (_jt0, _jt1)
  double rearT = 0;      // _rearT : cabré en cours (s)
  double rearAnim = 0;   // anim.rear
  double brake = 0;      // _brake : décélération du refus en cours (m/s²)
  int refusing = -1;     // _refusing : indice de l'obstacle refusé (−1 : aucun)
  // Dernier saut (_lastJump) : obstacle, plan, géométrie, instant de l'appel et de la réception.
  bool hasLastJump = false;
  int lastJumpObstacle = -1;
  JumpPlan lastPlan;
  FenceGeo lastGeo;
  double lastJumpTime = 0, lastLandTime = 0;
  bool lastLanded = false;
  // Cavalier (player.js / csoRide.js) : cadence de concours (undefined → hasCadence faux), rampe clavier.
  bool hasCadence = false;
  double cadence = 0, kbdSteer = 0;
  bool cadAdjust = false;
  // Jugement des obstacles (tranche T3, CsoFences.h) : passage en cours (horse._pass, remis à zéro par setPosition) et
  // dernier refus compté (horse._refusal, gardé par setPosition).
  bool hasPass = false;
  CsoPass pass;
  bool hasRefusal = false;
  CsoRefusalMemo refusal;
};

// Entrées d'une image (game.update → player.update → horse.update).
struct CsoFrameInput {
  double dt = 1.0 / 30;        // pas de la simulation du cheval (0 quand la simulation est en pause)
  double moveX = 0, moveY = 0; // input.move après input.poll (joystick ou clavier)
  bool keyMove = false;        // input.keyMove : déplacement venu du clavier
  bool jumpPressed = false;    // input.wasPressed('jump')
  bool csoControls = true;     // game.course?.controls === 'cso'
  bool locked = false;         // player.locked
  bool frozen = false;         // horse.frozen
  bool playerHorse = true;     // horse.isPlayerHorse
  double power = 1.35;         // horse.jumpPower (puissance × équipement × état : calculée par l'appelant)
  double clearance = 0;        // horse.mods.clearance
  double time = 0;             // game.time (horodatage de _lastJump)
  double slope = 0;            // pente devant (horse.js : (sol à +1,1 m − sol à −1,1 m) / 2,2)
  double waterDepth = 0, waterAhead = 0;  // profondeur d'eau sous le cheval et 0,8 m devant
  // Saut hors épreuve sans obstacle visé : distance du premier point bloqué de la trajectoire (Horse._jumpBlocked),
  // −1 si la voie est libre. Absent : voie libre.
  std::function<double(double peak)> jumpBlocked;
};

// Déplacement venu du clavier (input.js poll) : flèches / WASD, Ctrl gauche = 0,5, Alt gauche = 0,25.
struct KeyboardMove { double x = 0, y = 0, mag = 0; bool keyMove = false; };
STRIDESCORE_API KeyboardMove keyboardMove(bool up, bool down, bool right, bool left, bool ctrlLeft, bool altLeft);

// Visée et aide à l'appel (obstacles.js target / timing). Zone None si aucun appel n'est possible.
STRIDESCORE_API CsoTarget csoTarget(const std::vector<CsoObstacle>& obstacles, const CsoHorseState& s, double power,
                                    double clearance, bool csoCourse, const JumpParams& J = jumpDefaults(),
                                    const CsoHorseParams& P = csoHorseDefaults());
STRIDESCORE_API Zone csoTiming(const std::vector<CsoObstacle>& obstacles, const CsoHorseState& s, double power,
                               double clearance, bool csoCourse, const JumpParams& J = jumpDefaults(),
                               const CsoHorseParams& P = csoHorseDefaults());

// Freinage d'un refus (horse.js brake), cabré (horse.js refuse), refus décidé devant un obstacle (obstacles.js refuse).
STRIDESCORE_API void csoBrake(CsoHorseState& s, double dist);
STRIDESCORE_API void csoRear(CsoHorseState& s, std::vector<CsoHorseEvent>& events);
STRIDESCORE_API void csoRefuse(CsoHorseState& s, const std::vector<CsoObstacle>& obstacles, int index,
                               const CsoHorseParams& P = csoHorseDefaults());

// Décision de refus à l'abord, extraite de Obstacles.updateHorse (obstacles.js:440-455) : cheval au sol, pas déjà en
// refus, plus de 0,5 m/s, entre les chandeliers, dirigé vers l'obstacle ; abordable (angle) : refus si l'appel n'est plus
// possible (zone refuse, trop près, ou trop lent tout contre) ; sinon refus quand le nez est à moins de v²/16 + 0,3 m.
// Renvoie l'indice de l'obstacle refusé, −1 sinon (l'appelant appelle csoRefuse). updateHorse entier (même décision,
// jugement des barres, comptage, glissade, garde-fou du nez, chute des barres) : csoFencesUpdateHorse (CsoFences.h).
STRIDESCORE_API int csoApproachRefusal(const CsoHorseState& s, const std::vector<CsoObstacle>& obstacles, double power,
                                       double clearance, bool csoCourse, double time, const JumpParams& J = jumpDefaults(),
                                       const CsoHorseParams& P = csoHorseDefaults());

// Appui SAUT (horse.js startJump), appelé par csoHorseStep : trop lent, en l'air ou refus engagé → rien ; avec les
// commandes de concours, sans obstacle visé ou bien trop tôt (> 1,9 × L0) → JumpEarly ; zone refuse → refus si la barre
// avant est encore devant les épaules (x ≥ 0), appui ignoré sinon ; sinon saut (Jump) sur le plan de l'obstacle visé.
STRIDESCORE_API bool csoStartJump(CsoHorseState& s, const CsoFrameInput& in, const std::vector<CsoObstacle>& obstacles,
                                  std::vector<CsoHorseEvent>& events, const JumpParams& J = jumpDefaults(),
                                  const CsoHorseParams& P = csoHorseDefaults());

// Une image : conduite (player.js → csoRideStep) puis cheval (horse.js update) jusqu'au déplacement compris. Les
// corrections qui suivent dans le jeu web (collisions, Obstacles.updateHorse) sont à la charge de l'appelant.
STRIDESCORE_API void csoHorseStep(CsoHorseState& s, const CsoFrameInput& in, const std::vector<CsoObstacle>& obstacles,
                                  std::vector<CsoHorseEvent>& events, const CsoRideParams& R = csoRideDefaults(),
                                  const JumpParams& J = jumpDefaults(), const CsoHorseParams& P = csoHorseDefaults());

STRIDESCORE_API double wrapAngle(double a);  // src/core/math.js wrapAngle

}  // namespace strides
