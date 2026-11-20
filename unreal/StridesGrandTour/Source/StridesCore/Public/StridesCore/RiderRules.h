// Règles de monte du jeu web v3 portées en C++20 standard, sans type Unreal (essai de monte, voie A, étape 4).
//
// Port ligne à ligne de src/entities/human/anim.js en pose « ride » : ik2, kneeOf, lookQ, forwardTrunk, solveLeg,
// solveArm, flankAt, crestAt, hugFlank, hugMemory, riding, hairSpring et l'application lissée d'animateHuman ; et de la
// préparation des entrées de src/entities/human.js animateRiding (rebond et tangage du dos, saut, réception, profils du
// flanc filtrés par FLANK_RELAX et FLANK_LEAD). Les fonctions de Three.js utilisées (Vector3, Quaternion, Matrix4) sont
// reproduites avec leurs formules exactes (three 0.170.0), dans le même ordre d'opérations, sans contraction en FMA.
//
// Preuve : unreal/core/tests/test_monte.cpp rejoue l'oracle O2 (anim.js inchangé rejoué hors navigateur, rigs web_classic
// et rider_f) et compare articulations, cibles et état interne ; mutations : scripts/unreal/mutations-rider-rules.py.
//
// Repères et unités : ceux du web. Repère du modèle du personnage : y vers le haut, +z vers l'avant, +x à gauche du
// personnage, unités du modèle. Repère du siège S (os « saddle » du cheval) : point dans S = point du modèle × échelle
// du cavalier (mètres). Quaternions (x, y, z, w). Côtés : 0 = gauche (sg = +1), 1 = droite (sg = −1).
#pragma once
#include <array>
#include <string>
#include <vector>

#include "StridesCore/Api.h"

struct J;  // StridesCore/MiniJson.h

namespace strides::rider {

struct Vec3 {
  double x = 0, y = 0, z = 0;
};
struct Quat {
  double x = 0, y = 0, z = 0, w = 1;
};

// Os du squelette classique du web, dans l'ordre de skeleton.js BONES (root, puis les 24 os animés, NAMES d'anim.js).
enum Bone : int {
  Root, Hips, Spine, Chest, Neck, Head, HairTail,
  LClav, LArm, LFore, LHand, LFing,
  RClav, RArm, RFore, RHand, RFing,
  LThigh, LShin, LFoot, LToe,
  RThigh, RShin, RFoot, RToe,
  BoneCount
};
STRIDESCORE_API int boneParent(int bone);         // skeleton.js parentOf ; −1 pour root (enfant du maillage)
STRIDESCORE_API const char* boneName(int bone);   // nom web (« lThigh »…)

// Réglages de position (fit) tels que la règle les lit : unités du modèle, sauf kneeOut et mountKneeOut (directions).
// Un profil vide équivaut à un profil absent (dans le jeu, un profil fourni n'est jamais vide). legClear = 0 : absent.
struct RideFit {
  double stirrupX = 0.33, stirrupY = -0.64, stirrupZ = 0.06, kneeOut = 0.45, handX = 0.06, handY = 0.3, handZ = 0.36;
  double legClear = 0;
  bool hasMountKneeOut = false;
  double mountKneeOut = 0;
  std::vector<double> flankL, flankR, flank;  // [y0, pas, d0, d1…] : demi-largeur du tronc par tranche de hauteur
  std::vector<double> crest;                  // [z0, pas, h0, h1…] : dessus de l'encolure (−9 : pas de mesure)
};

// Paramètres de la règle. Valeurs par défaut = celles du web ; le test les compare à Content/Data/rider_rules.json,
// exporté du source par scripts/unreal/export-rider-rules-data.mjs (rien n'est recopié sans contrôle).
struct RideParams {
  // RIDE (anim.js:485-507)
  double postLift = 0.085, twoLift = 0.1, jumpLift = 0.05;
  double seatReach = 0.93, riseReach = 0.95;
  double foldIn = 0.18, releaseIn0 = 0.12, releaseIn1 = 0.35, holdMax = 0.45, recover = 0.5, handBack = 0.4;
  double landFold = 0.6, hindFold = 0.4;
  double breathRate = 0.25, breathChest = 0.012, breathShoulder = 0.012, idleShift = 0.018;
  double handSpread = 0.02;
  double handReach = 0.97, handClear = 0.1;
  // Constantes nommées d'anim.js, non exportées par le module (relues dans le source).
  double thighMargin = 0.02, poleOpen = 0.9;                                // THIGH_MARGIN, POLE_OPEN
  double hugOpen = 2.4, hugRelax = 0.12, footOpen = 0.6, footRelax = 0.02;  // HUG_OPEN, HUG_RELAX, FOOT_OPEN, FOOT_RELAX
  RideFit defaultFit;                                                       // DEFAULT_FIT (sans st.fit)
  // human.js : profil du flanc vu par le cavalier (animateRiding).
  double flankRelax = 0.3, flankLead = 2;  // FLANK_RELAX (m/s), FLANK_LEAD
  // Données du jeu lues par les étapes suivantes (cheval Unreal, Control Rig), non lues par la règle elle-même.
  double riderFitStirrupX = 0.38, riderFitStirrupY = -0.69, riderFitStirrupZ = 0.06, riderFitKneeOut = 0.45;
  double riderFitHandX = 0.065, riderFitHandY = 0.2, riderFitHandZ = 0.36;  // RIDER_FIT (m, human.js:51)
  Vec3 seatSaddle{0, 0, 0}, seatBody{0, 0.575, 0};                         // RIDER_SEAT (human.js:48)
  Vec3 fist{0, -0.068, 0.012};                                              // FIST (human.js:56)
  double legThick = 0.05, hindDown = 0.1;                                   // LEG_THICK, HIND_DOWN (pjlHorse.js)
};
// Lit Content/Data/rider_rules.json (schéma strides.rider_rules/1). Faux et err renseigné si une valeur manque.
STRIDESCORE_API bool rideParamsFromJson(const J& data, RideParams& out, std::string& err);

// Mesures du corps lues par la règle (skeleton.js rigInfo, unités du modèle).
struct RigInfo {
  double thighLen = 0, shinLen = 0, upperArmLen = 0, foreArmLen = 0, ankleY = 0, seatToHips = 0;
  Vec3 toe;
};
struct Rig {
  std::array<Vec3, BoneCount> rest{};  // décalages de repos par rapport au parent (userData.rest)
  RigInfo info;
  Vec3 fist;              // poing dans le repère de la main
  bool hasFistR = false;  // poing droit distinct (rig réaliste)
  Vec3 fistR;
  double scale = 1;       // échelle du cavalier (hu.scale)
};

// Entrées lues par riding() à une image (st de human.js).
struct RideInputs {
  double dt = 0;          // pas de l'image (s)
  double t = 0;           // horloge de l'animation (s)
  double horseSpeed = 0;  // allure (m/s)
  double gaitPhase = 0;   // phase de foulée [0, 1)
  double turn = 0;        // virage [−1, 1]
  double jump = -1;       // vol du jeu [0, 1], −1 au sol
  bool hasLandT = false;  // landT absent (null) : la règle lit −1
  double landT = -1;      // s depuis le poser des antérieurs
  bool hindDown = false;  // postérieurs reposés
  double bob = 0;         // hauteur du dos du cheval au siège (m)
  double pitch = 0;       // tangage du siège (rad)
  bool wave = false;      // salut de la main
  bool hasFit = true;     // faux : DEFAULT_FIT
  RideFit fit;
};

// Cibles de la règle (_P), repère du modèle.
struct RideTargets {
  Vec3 foot[2];        // cheville visée
  Quat footQ[2];       // orientation du pied
  bool hasXMax[2] = {false, false};
  double xMax[2] = {0, 0};  // place naturelle du pied (|x|), avec un profil de flanc
  Vec3 hand[2];        // poignet visé
  Vec3 hips;           // bassin visé (P.hips)
};

// État interne de la règle d'une image à l'autre (_ride), après l'image.
struct RideState {
  bool started = false;
  double post = 0, diag = 0, wantDiag = 0, diagT = 0, two = 0, jumpK = 0, rel = 0, bobAvg = 0, hd = -1;
  bool wasJump = false;
  bool hasLook = false;
  double lookA = 0, lookTo = 0, lookT = 0;
  bool hasHugMap = false;
  bool hasHug[2] = {false, false};
  double hugPx[2] = {0, 0}, hugFx[2] = {0, 0}, hugT[2] = {0, 0};
};

// Squelette posé, dans S (m) : articulations dans l'ordre Bone, plante de chaque pied (anim.js:771) et poing.
struct RideSkeleton {
  std::array<Vec3, BoneCount> joints{};
  Vec3 sole[2];
  Vec3 fist[2];
};

// Pose cible et repères calculés par la règle (_P), réutilisés d'une image à l'autre.
struct RidePose {
  std::array<Quat, BoneCount> q{};
  Quat mqHips, mqSpine, mqChest, mqNeck, mqClav[2], mqShin[2], mqFore[2];
  Vec3 mpSpine, mpChest, mpClav[2], mpArm[2], mpThigh[2];
  RideTargets tg;
  Quat handQ[2];
  bool rideStarted = false;  // lastPose === 'ride'
  double blendT = 9;
};

// Cavalier : la règle, son état et la pose de son squelette (B). Aucun état partagé entre instances.
class STRIDESCORE_API RiderRules {
 public:
  RiderRules(const Rig& rig, const RideParams& params, bool hair = false);
  // État neuf, comme à la mise en selle (Human.mount : _init = false, _ride = null).
  void reset();
  // Une image : animateHuman(B, 'ride', st, in.dt).
  void step(const RideInputs& in);

  const Quat& boneQuat(int bone) const { return boneQ_[bone]; }  // rotation locale de l'os (après lissage)
  const Vec3& hipsPosition() const { return hipsPos_; }           // position locale du bassin (modèle)
  const RideTargets& targets() const { return P_.tg; }
  const RideState& state() const { return R_; }
  double blendT() const { return P_.blendT; }
  const Rig& rig() const { return rig_; }
  RideSkeleton skeleton() const;

 private:
  void riding(const RideInputs& in, double dt);
  void hairSpring(double dt, double driveX, double driveZ);

  Rig rig_;
  RideParams C_;
  bool hair_ = false;
  std::array<Quat, BoneCount> boneQ_{};
  Vec3 hipsPos_;
  RidePose P_;
  RideState R_;
  bool init_ = false;
  bool hairStarted_ = false;
  double hairA_ = 0, hairV_ = 0, hairB_ = 0, hairW_ = 0;
};

// ---------------------------------------------------------------------------------------------------------------
// Préparation des entrées (human.js animateRiding, :317-383) à partir de l'état brut du cheval.

// Ce que animateRiding lit du cheval, avant la mise à jour du cheval de l'image (donc son état de l'image précédente).
struct RideHorseSample {
  double attachY = 0;     // hauteur monde de l'os d'attache du cavalier (matrixWorld e[13])
  Vec3 attachZ{0, 0, 1};  // colonne z de sa matrice monde (e[8], e[9], e[10]), échelle comprise
  double horseY = 0;      // h.pos.y
  double contactOff = 0;  // h.pjl.view.contactOff (0 sans)
  double speed = 0;       // h.anim.speed
  double phase = 0;       // h.anim.phase
  double postOffset = 0;  // h.riderPostOffset
  double jumpT = -1;      // h.jumpT
  bool hindDown = false;  // h.pjl.hindDown
  double lastTurn = 0;    // h.lastTurn
};
// Réglages en mètres (hu._fit = RIDER_FIT, puis réglages du cheval, puis ceux de la mise en selle) ; profils du cheval
// tels qu'il les a calculés à sa dernière mise à jour.
using RideFitMeters = RideFit;

class STRIDESCORE_API RideInputFilter {
 public:
  explicit RideInputFilter(const RideParams& params) : C_(params) {}
  // État laissé par les images déjà animées (entrées lues à la dernière image) : horloge, réception, profils filtrés.
  void seed(const RideInputs& last);
  // Une image du joueur (pas = dt) ou d'un cavalier animé à pas réduit (step) : animateRiding(dt).
  RideInputs next(const RideHorseSample& h, const RideFitMeters& fit, double scale, double dt, double step, bool wave);

 private:
  RideParams C_;
  double t_ = 0;
  bool hasLandT_ = false;
  double landT_ = -1;
  bool wasJump_ = false;
  bool hasPrev_ = false;
  RideFit rf_;
  bool hasRaw_[3] = {false, false, false};
  std::vector<double> raw_[3];  // flankL, flankR, flank : profil brut de l'image précédente (_flankRaw)
};

}  // namespace strides::rider
