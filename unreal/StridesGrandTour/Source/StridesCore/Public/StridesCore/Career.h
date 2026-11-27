// Jalon J3 (correction après contrôle adverse) : missions de l'histoire du jeu web portées en C++ sans type Unreal.
// Données : Content/Data/story_missions.json, exporté du web lui-même (scripts/unreal/export-missions.mjs : STORY de
// story.js et story2.js, parisGP.js, REPUTATION de config.js). Règles portées :
//  - storyAvailable (missions.js:279) : pas déjà terminée, tous les prérequis terminés ;
//  - refreshOffers (missions.js:310) : offres de l'histoire dans l'ordre de STORY, sauf la mission en cours et celles
//    refusées depuis moins de 40 s ; verrou de palier (def.level > palier) avec une seule offre verrouillée gardée ; tri
//    stable « verrouillées en dernier » ; point de reprise marqué ;
//  - accept (missions.js:422) : verrouillée, mission en cours, solde inférieur au coût → refus ;
//  - complete (missions.js:558) : paiement def.pay, réputation def.xp, une seule fois par mission de l'histoire.
//    Pourboire de 10 % à 5 étoiles NON porté (la note dépend du déroulé complet, J4-C) : choix n° 19 de plan.md.
//  - reputationTier (save.js:276) : palier, palier suivant et progression.
// Itinéraire : étapes du web qui ont une position fixe (voir export-missions.mjs) ; « goto » franchie à moins de r m,
// « course » franchie quand une épreuve du Pôle commencée pendant l'étape est terminée.
// Repère du web : x, z au sol (m).
#pragma once
#include <string>
#include <vector>
#include "StridesCore/Api.h"

namespace strides {

struct MissionStep {
  std::string kind = "goto";  // « goto » ou « course »
  std::string text;
  double x = 0, z = 0, r = 5;
  // Compte à rebours du web (missions.js r.timer, :226-228) : posé quand l'étape commence (s), arrêté quand une étape
  // marquée stopTimer est franchie ; à 0, la mission échoue (missions.fail, def.timeoutText).
  double timer = 0;
  bool stopTimer = false;
  // Étape « course » : règle de résultat du web. maxPenalties ≥ 0 : échec au-delà (csi3, story.js:717 « p > 8 ») ;
  // beatFaults ≥ 0 : victoire si p < beatFaults ou (p == beatFaults et chrono < beatTime), sinon échec (gp, story.js:748).
  int maxPenalties = -1, beatFaults = -1;
  double beatTime = 0;
  std::string beatName;
};

struct StoryMission {
  std::string id, title, category, place, placeName, payLabel, choice, timeoutText;
  int level = 1, pay = 0, xp = 0, cost = 0;
  bool full = false;  // itinéraire relevé dans les étapes du web (sinon : rejoindre le lieu)
  // Choix n° 25 (J3b) : épreuve du web non portée ; l'offre reste celle du web mais ne s'accepte pas (« À venir »).
  std::string upcoming;
  std::vector<std::string> prereqs, skipped;
  std::vector<MissionStep> route;
};

struct ReputationTier {
  int xp = 0;
  std::string title, shortTitle;
};

struct StoryData {
  std::vector<StoryMission> missions;
  std::vector<ReputationTier> tiers;
  STRIDESCORE_API const StoryMission* find(const std::string& id) const;
};

STRIDESCORE_API bool loadStory(const std::string& jsonText, StoryData& out, std::string& err);

struct TierInfo {
  int index = 0, level = 1;
  const ReputationTier* tier = nullptr;
  const ReputationTier* next = nullptr;
  double progress = 0;
};
STRIDESCORE_API TierInfo reputationTier(const StoryData& d, int points);

struct CareerOffer {
  const StoryMission* mission = nullptr;
  bool locked = false, resume = false;
  bool upcoming = false;  // choix n° 25 : épreuve non portée, offre visible mais refusée à l'acceptation
  std::string lockText;  // « Débloqué au palier « … ». » ou « À venir : … »
};

struct CareerState {
  int credits = 0, reputation = 0;
  std::vector<std::string> completed;
  std::string active;      // mission en cours
  std::string checkpoint;  // point de reprise (mission en cours à la sauvegarde)
  int step = 0;            // étape de l'itinéraire de la mission en cours
  double timeLeft = -1;    // compte à rebours de la mission en cours (s), -1 : aucun
  STRIDESCORE_API bool done(const std::string& id) const;
};

STRIDESCORE_API bool storyAvailable(const CareerState& s, const StoryMission& m);
// refused(id) : vrai si l'offre a été refusée depuis moins de 40 s.
template <class Refused>
std::vector<CareerOffer> storyOffers(const StoryData& d, const CareerState& s, Refused refused) {
  std::vector<CareerOffer> out;
  const TierInfo lv = reputationTier(d, s.reputation);
  for (const StoryMission& m : d.missions) {
    if (!storyAvailable(s, m) || m.id == s.active || refused(m.id)) continue;
    CareerOffer o;
    o.mission = &m;
    o.resume = s.checkpoint == m.id;
    if (m.level > lv.level) {
      o.locked = true;
      const size_t i = (size_t)(m.level - 1) < d.tiers.size() ? (size_t)(m.level - 1) : d.tiers.size() - 1;
      o.lockText = "Débloqué au palier « " + (d.tiers.empty() ? std::string() : d.tiers[i].title) + " ».";
      bool already = false;
      for (const CareerOffer& x : out) already = already || x.locked;
      if (already) continue;
    } else if (!m.upcoming.empty()) {
      o.upcoming = true;
      o.lockText = "À venir : " + m.upcoming;
    }
    out.push_back(o);
  }
  // offers.sort : histoire d'abord (toutes le sont ici), verrouillées en dernier ; tri stable comme Array.sort.
  std::vector<CareerOffer> sorted;
  for (const CareerOffer& o : out) if (!o.locked) sorted.push_back(o);
  for (const CareerOffer& o : out) if (o.locked) sorted.push_back(o);
  return sorted;
}

enum class AcceptResult { Ok, Unknown, Locked, Busy, Funds, Upcoming };
STRIDESCORE_API AcceptResult acceptMission(const StoryData& d, CareerState& s, const std::string& id);

// Fin de l'étape en cours. Pour « goto » : distance au point ≤ r. Pour « course » : courseFinishedSinceStep.
// Renvoie vrai si l'étape a été franchie (s.step avance) ; la mission est alors finie si s.step == route.size().
STRIDESCORE_API bool advanceStep(const StoryData& d, CareerState& s, double x, double z, bool courseFinishedSinceStep);
STRIDESCORE_API const MissionStep* currentStep(const StoryData& d, const CareerState& s);

// Résultat de l'épreuve du Pôle lancée pendant une étape « course » (CsoRun : points(), state().t, state().eliminated).
struct CourseOutcome {
  bool finished = false;
  int penalties = 0;
  double time = 0;
  bool eliminated = false;
};
enum class StepUpdate { None, Advanced, Failed };
// Une image de la mission en cours (missions.js Run.update) : compte à rebours (dt, s), puis fin de l'étape. Échec :
// failText reçoit la raison du web (timeoutText ou règle de l'épreuve) et la mission est arrêtée (failMission).
STRIDESCORE_API StepUpdate updateStep(const StoryData& d, CareerState& s, double x, double z, const CourseOutcome& course, double dt, std::string& failText);
// missions.fail : mission arrêtée, rien n'est payé ; le point de reprise sans données est effacé (missions.js:536-538) et
// l'offre redevient disponible (offers.unshift).
STRIDESCORE_API void failMission(CareerState& s);

struct CareerReward {
  int pay = 0, rep = 0, cost = 0;
  bool fresh = false;
};
// missions.complete : paie et note la mission en cours une seule fois, l'enlève, efface le point de reprise.
STRIDESCORE_API CareerReward completeMission(const StoryData& d, CareerState& s);

}  // namespace strides
