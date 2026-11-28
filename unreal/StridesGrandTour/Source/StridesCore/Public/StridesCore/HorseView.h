// Vue du cheval WildMesh (essai de monte, voie A, étape S4 : inclinaison en virage, corps et horloge du saut), en C++20
// standard, sans type Unreal. Port de :
//  - src/entities/horse/anim.js animateHorse, la part que lit la vue : choix de l'allure (seuils GAIT_EDGES et hystérésis),
//    main au galop (entrée st.lead ou virage tenu), fréquence et facteur de service lissés (GAIT.f, GAIT.duty, 7/s ; foulée
//    bornée par Lmax), mouvement lissé (A.move, 6/s ou 4/s) et phase de foulée st.phase (qui avance hors réécriture : à
//    l'arrêt qui commence, pendant le saut) ;
//  - src/entities/pjlHorse.js _snapshot (foulée lissée, cadence bornée CADENCE, phase de la vue, réécriture de
//    h.anim.phase, roulis en virage, temps depuis la réception, mode), _jumpTime (vol du jeu réparti sur le clip de saut en
//    deux morceaux autour du sommet du tronc, départ PUSH s avant le décollage), _pushContact (abaissement d'appel),
//    _barNeed, _limbTuck (repli des membres au-dessus des barres, géométrie : sous-arbre tourné en bloc autour de l'os
//    d'attache) et _barClear (bascule de la croupe et de l'avant-main, relevé en vol) ;
//  - src/entities/pjl/view.js update (fondu de main, choix et horloge du clip de saut : toeOff, jt / T, foreLand ; fondu
//    jumpWeight 18/s et 12/s ; suite après la réception postLand jusqu'au poser suivant des antérieurs ; poids des allures,
//    des virages L90 / R90 et des clips miroir, lissés à 14/s ; temps des clips ; hauteur du corps rootY lissée à 30/s,
//    trunkRise annulé ; inclinaison en virage body.rotation.z lissée à 8/s) et pelvisRise.
// Le moteur fournit, image par image : les entrées du cheval du jeu (vitesse, virage lissé, saut, refus), les positions
// monde des os des sabots et des os d'attache des membres sur la pose de l'image, le sol, l'obstacle du dernier saut ; il
// applique les poids et temps des clips, le repère du corps (hauteur, avance, bascule, inclinaison) et les replis.
// Repère du cheval (holder du web) : x à gauche, y vers le haut, z vers l'avant, m.
//
// Données : Content/Data/pjl_horse_view.json (scripts/unreal/export-rider-rules.mjs --vue : asset.jumps, gaitInfo, durées
// des clips, constantes relues dans le source). Preuves : unreal/core/tests/test_horse_view.cpp (ctest « monte-vue »,
// contre l'oracle unreal/core/tests/oracles/monte/vue/) ; dans le moteur, Strides.Parite.HorseView.
#pragma once
#include <map>
#include <string>
#include <vector>

#include "StridesCore/Api.h"

struct J;  // StridesCore/MiniJson.h

namespace strides::hview {

struct V3 {
  double x = 0, y = 0, z = 0;
};

// Constantes du web (pjlHorse.js, view.js, anim.js, jumpModel.js) : valeurs par défaut = source, relues dans les données.
struct Consts {
  double cadence[3][2] = {{0.55, 1.15}, {1.1, 1.75}, {1.3, 2.6}};  // CADENCE walk, trot, canter (Hz)
  double push = 0.12, pushRelease = 0.25;                          // PUSH (s), PUSH_RELEASE (part du vol)
  double hoofSole = 0.08, railR = 0.05, hindClearMax = 0.2, hindTiltMax = 0.21, hindLiftMax = 0.25, foreTiltMax = 0.26;
  double tuckMax = 0.6;                                            // TUCK_MAX (rad)
  double com = 1.3;                                                // COM_CANTER_HEIGHT
  double edgeWalk = 3.2, edgeTrot = 5.6, edgeCanter = 10.5;        // GAIT_EDGES
  double rub = 0.06;                                               // JUMP.rub
};

// Analyse d'un clip de saut (asset.js « Jump clip analysis »).
struct JumpClip {
  std::string name;
  double toeOff = 0, foreLand = 0, hindLand = 0, nextFore = 0, end = 0;
  std::vector<double> pelvisRise, trunkRise;  // unités de la scène du GLB, 24 images/s
  double apex = 0;                            // _jumpTime : sommet du tronc entre décollage et réception (calculé)
};

struct GaitInfo {
  double stride = 0, offset = 0;
};

struct ViewData {
  Consts c;
  double scale = 0.0103882601;                 // asset.scale (m par unité du GLB)
  std::map<std::string, GaitInfo> gaitInfo;    // walk, trot, canter, gallop
  std::map<std::string, JumpClip> jumps;       // jump_canter, jump_gallop
  std::map<std::string, double> clips;         // clips du mélangeur (noms) et durées (s)
  std::vector<std::string> clipOrder;          // ordre des actions du mélangeur du web (accumulation des poses)
  std::map<std::string, double> align;         // pjlHorse.js align (clé walk, trot, canterR, …) : décalage ; absent = null
  bool leadSwap = false;
};
// Lecture des données ; exception si une clé manque. Le sommet de chaque clip de saut est calculé (_jumpTime).
STRIDESCORE_API ViewData viewDataFromJson(const J& j);
// Sommet du tronc d'un clip (pjlHorse.js _jumpTime, j._apex).
STRIDESCORE_API double jumpApex(const JumpClip& j);
// view.js pelvisRise : montée du tronc du clip au temps t (unités du GLB), interpolée à 24 images/s.
STRIDESCORE_API double pelvisRise(const JumpClip& j, double t);

// ---- Locomotion du jeu (horse/anim.js, ce que lit la vue).
struct LocoIn {
  double dt = 1.0 / 30;  // pas donné à animateHorse (borné à 0,1 s dedans)
  double speed = 0;      // st.speed : vitesse normalisée (vitesse / max(0,6, speedMul))
  double vel = 0;        // st.vel : vitesse réelle (m/s)
  double jump = -1;      // st.jump (h.jumpT)
  double turn = 0;       // st.turn (h.lastTurn)
  double rear = 0;       // st.rear
  int lead = 0;          // st.lead : main imposée (±1), 0 sinon
};
struct Loco {
  std::string gait = "idle";
  int lead = 1;
  double leadHold = 0, freq = 0.9, duty = 0.65, move = 0;  // createState
  double phase = 0;                                         // st.phase (h.anim.phase)
};
STRIDESCORE_API void locoStep(const Consts& c, Loco& a, const LocoIn& in);

// ---- Instantané de la vue (pjlHorse.js _snapshot).
struct SnapIn {
  double dt = 1.0 / 30;
  double speed = 0;            // h.speed
  std::string gait = "idle";   // h.anim._a.gait (après animateHorse)
  int lead = 1;                // h.anim._a.lead
  double jumpT = -1;           // h.jumpT
  double jumpDur = 0;          // h.jumpDur (0 : absent)
  double brake = 0, rearT = 0; // h._brake, h._rearT
  double lastTurn = 0;         // h.lastTurn
};
struct Snap {
  std::string gait = "halt", mode = "ride";
  char lead = 'R';
  double phase = 0, strideLen = 3.42, turnRate = 0, jt = 0, jT = 0, roll = 0, speed = 0, landingTimer = 0, y = 1.3;
};
struct SnapState {
  double ph = 0, stride = 3.42, roll = 0, landT = 9;
  bool wasJump = false;
};
// animPhase : h.anim.phase, réécrite comme le web (sans saut, au-delà de 0,2 m/s, clé de calage connue).
STRIDESCORE_API Snap snapshotStep(const ViewData& d, SnapState& st, const SnapIn& in, double& animPhase);
// _jumpTime : temps de saut de la vue (jt < 0 avant le décollage des postérieurs) depuis la progression du vol tau.
STRIDESCORE_API double jumpTimeOf(const ViewData& d, double tau, double T, double speed);

// ---- Mélangeur et corps (pjl/view.js update).
struct ViewState {
  std::map<std::string, double> weights;  // poids lissés de toutes les actions (clips de d.clips)
  std::map<std::string, double> times;    // temps des clips (gardé quand l'action est inactive, comme AnimationAction.time)
  std::string jumpClip;                   // vide : aucun
  bool jumpMirror = false;
  double jumpTime = 0, jumpWeight = 0, postLand = -1, lastJt = 0, refusalT = -1, leadBlend = 1, idleTime = 0;
  bool wasJumping = false;
  bool hasBodyBaseY = false;
  double bodyBaseY = 0;
  double bodyY = 0, bodyZ = 0, rotX = 0, rotZ = 0, contactOff = 0;  // groupe « body » de la vue
};
// Constructeur de la vue : idle au poids 1, autres à 0.
STRIDESCORE_API void viewInit(const ViewData& d, ViewState& v);
// Une image ; s.y vaut COM_CANTER_HEIGHT (pjlHorse.js : la trajectoire est portée par le cheval du jeu).
STRIDESCORE_API void viewStep(const ViewData& d, ViewState& v, const Snap& s, double dt);
// Action active (poids > 0,002) : clips à jouer.
STRIDESCORE_API bool actionEnabled(const ViewState& v, const std::string& name);

// ---- Abaissement d'appel (pjlHorse.js _pushContact).
struct PushState {
  double off = 0, tau = 0, k = 1;
  bool jumping = false;
};
struct PushIn {
  double jumpT = -1;
  bool hasClip = false;
  double jumpTime = 0, toeOff = 0;
  bool nearBar = false;
  bool hasD = false;  // d calculé (antérieurs devant une barre) ; sinon k = 1
  double d = 0;
  double hind = 0, fore = 0;  // plus bas des os toes_02 / fingers_02 au-dessus du sol (pose de cette image, abaissement compris)
};
// Rend le nouvel abaissement (contactOff) ; contactOff : abaissement actuel.
STRIDESCORE_API double pushStep(const Consts& c, PushState& p, const PushIn& in, double contactOff);
// pjlHorse.js _setContact : hauteur du corps décalée de l'écart d'abaissement, abaissement posé.
STRIDESCORE_API void setContact(ViewState& v, double off);

// ---- Membres face aux barres (pjlHorse.js _barNeed, _limbTuck, _barClear).
struct ObBar {
  double s = 0, h = 0;
  bool mesh = true, fall = false;
};
struct Obst {
  int id = 0;  // identité de l'obstacle (q.o === o)
  double x = 0, z = 0, nx = 0, nz = 1, tx = 1, tz = 0, w = 3.6, ground = 0;
  std::vector<ObBar> bars;
  double sign = 1;
  std::vector<double> rails, margins;  // geo.rails[].s, plan.margins
};
struct Prev {
  double y = 0, s = 0, t = 0;
  int o = 0;
};
using PrevMap = std::map<std::string, Prev>;
struct Need {
  double lift = 0, lever = 1, w = 0;
  V3 pivot;
};
struct Hoof {
  std::string name;
  V3 p;
};
// _barNeed : dt = max(1e-3, _dt || 1/60) appliqué dedans.
STRIDESCORE_API Need barNeed(const Consts& c, const Obst& o, const std::vector<Hoof>& hoofs, const V3& piv0, const V3& piv1, const std::string& tag,
                             double time, double dt, PrevMap& prev);
// Rotation du point p d'angle a autour de l'axe unitaire ax passant par o (quaternion setFromAxisAngle de three.js).
STRIDESCORE_API V3 rotateAbout(const V3& p, const V3& o, const V3& ax, double a);

// _limbTuck : membres PG, PD, AG, AD (os des sabots toes_02_l, toes_02_r, fingers_02_l, fingers_02_r ; os qui tournent
// upperleg_l, upperleg_r, hand_l, hand_r).
struct TuckState {
  double a[4] = {0, 0, 0, 0};  // T[key]
  double s[4] = {0, 0, 0, 0};  // T['s' + key] (0 : non encore posé, lu comme 1)
};
struct TuckIn {
  V3 toe[4];          // sabots dans l'ordre fingers_02_l, fingers_02_r, toes_02_l, toes_02_r (monde, avant le repli)
  V3 up[4];           // os d'attache upperleg_l, upperleg_r, hand_l, hand_r (monde)
  bool hasUp[4] = {true, true, true, true};
  V3 ax, fw;          // axes latéral et avant du cheval (monde)
  bool jumping = false;
  double time = 0, dt = 1.0 / 60;
};
// Rend les angles appliqués (T[key] · signe, rad, autour de ax ; 0 si T[key] ≤ 1e-3) ; toe sort replié.
STRIDESCORE_API void tuckStep(const Consts& c, TuckState& t, const Obst& o, TuckIn& in, PrevMap& prev, double applied[4]);

struct ClearState {
  bool clr = false;
  double a = 0, y = 0, f = 0;
  bool hasPivF = false, hasPivH = false;
  V3 pivF, pivH;  // repère du parent du corps
};
// Début de _barClear : corps sans bascule (rotation.x = 0, position.z = 0) si la dernière image en avait une. À appeler
// avant de lire les sabots pour le repli et _barNeed.
STRIDESCORE_API void barClearReset(const ClearState& st, ViewState& v);
// Fin de _barClear (après le repli et les appels de _barNeed, faits par l'appelant) : hind / fore = résultats de _barNeed
// (nuls : absents), pivots déjà ramenés dans le repère du parent du corps. Pose bodyY, bodyZ et rotX de v.
STRIDESCORE_API void barClearStep(const Consts& c, ClearState& st, bool jumping, const Need* hind, const V3* pivHindParent, const Need* fore,
                                  const V3* pivForeParent, ViewState& v, double dt);

}  // namespace strides::hview
