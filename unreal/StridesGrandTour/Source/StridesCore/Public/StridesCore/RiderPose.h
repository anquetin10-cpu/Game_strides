// Monte de la cavalière par les règles du web, côté jeu (essai de monte, voie A, étape 6) : ce que le composant Unreal
// UStridesRiderRig demande au cœur, sans type Unreal.
//
// 1. Lecture des données de monte : rig de règle (unreal/core/tests/oracles/monte/rigs/<rig>.json, ou setup d'un oracle
//    O2), entrées de la règle (canal in d'O1), état brut du cheval (canaux hz et mx d'O1), réglages de la mise en selle
//    (setup.fit0 d'O1). Mêmes règles de lecture que unreal/core/tests/test_monte.cpp (fitFrom, inputsFrom, rigFrom,
//    sampleFrom, fitMeters), qui reste le banc de l'étape 4.
// 2. RideDriver : la chaîne du web human.js animateRiding, cheval → entrées → règle, avec son retard d'une image : le
//    cavalier est animé AVANT la mise à jour du cheval de l'image, il lit donc l'état du cheval de l'image précédente.
// 3. poseInSeat : rotations monde des 25 os de la règle dans S (sans échelle) et articulations, pour le reciblage sur le
//    squelette de la cavalière Unreal (realistic.js update : rotation monde de l'os classique × décalage du calage).
#pragma once
#include <array>
#include <string>

#include "StridesCore/Api.h"
#include "StridesCore/RiderRules.h"

struct J;  // StridesCore/MiniJson.h

namespace strides::rider {

// Rig de règle : clés rest (25 os), info ou rig (rigInfo), fist, fistR (facultatif), scale. Faux si une clé manque.
STRIDESCORE_API bool rigFromJson(const J& setup, Rig& out, std::string& err);
// Réglages du canal in.fit, × k sauf kneeOut et mountKneeOut (directions) ; k = 1 : valeurs telles quelles.
STRIDESCORE_API RideFit fitFromJson(const J& fit, double k);
// Entrées de la règle (canal in d'O1), réglages × k (O2 : setup.fitScale).
STRIDESCORE_API RideInputs rideInputsFromJson(const J& in, double k);
// État brut du cheval d'une image (canaux hz et mx d'O1). Virage (h.lastTurn) non exporté : 0.
STRIDESCORE_API RideHorseSample horseSampleFromJson(const J& hz, const J& mx);
// Réglages de la mise en selle (setup.fit0, mètres) et profils du cheval de l'image (hz.fl, hz.fr, hz.cr).
STRIDESCORE_API RideFitMeters fitMetersFromJson(const J& fit0, const J& hz);

// Pose du squelette de règle dans S : rotation monde de chaque os (le repos des os du personnage classique est sans
// rotation, donc rotation monde = rotation depuis le repos), articulations, plantes et poings (mètres).
struct RidePoseS {
  std::array<Quat, BoneCount> world{};
  std::array<Vec3, BoneCount> joints{};
  Vec3 sole[2];
  Vec3 fist[2];
};
STRIDESCORE_API RidePoseS poseInSeat(const RiderRules& rules);

// Membres résolus par deux os (cuisse, jambe, pied ; bras, avant-bras, main) : racine, articulation intermédiaire (genou,
// coude : pôle en position), extrémité (cheville, poignet : cible).
struct Limb {
  int root, joint, end;
};
inline constexpr Limb kRideLimbs[4] = {{LThigh, LShin, LFoot}, {RThigh, RShin, RFoot}, {LArm, LFore, LHand}, {RArm, RFore, RHand}};

// Chaîne cheval → entrées → règle d'un cavalier en selle (human.js animateRiding puis animateHuman).
class STRIDESCORE_API RideDriver {
 public:
  RideDriver(const Rig& rig, const RideParams& params, bool hair = false);
  // Remise à neuf (mise en selle).
  void reset();
  // Première image connue par ses entrées (rejeu d'oracle : canal in de la première image) ; h et fit : état du cheval
  // de cette image, lu par l'image suivante.
  void seed(const RideInputs& first, const RideHorseSample& h, const RideFitMeters& fit);
  // Entrées de l'image depuis l'état du cheval : celui de l'IMAGE PRÉCÉDENTE (retard d'une image du web) ; à la première
  // image sans précédent, l'état courant. hNow et fitNow sont retenus pour l'image suivante. dt : pas de l'image (s).
  RideInputs prepare(const RideHorseSample& hNow, const RideFitMeters& fitNow, double dt, bool wave = false);
  // Une image de la règle sur ces entrées.
  void apply(const RideInputs& in);
  const RiderRules& rules() const { return rules_; }
  int frames() const { return frames_; }

 private:
  RideParams C_;
  RiderRules rules_;
  RideInputFilter filt_;
  bool hasPrev_ = false;
  RideHorseSample prev_;
  RideFitMeters prevFit_;
  int frames_ = 0;
};

}  // namespace strides::rider
