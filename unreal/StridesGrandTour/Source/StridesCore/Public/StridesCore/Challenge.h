// Jalon J4-D : défis à conditions fixes du web (src/gameplay/challenge.js) en C++ sans type Unreal : conditions versionnées
// (Content/Data/challenges.json, scripts/unreal/export-defis.mjs), résultat d'une tentative (makeResult : pénalités de
// temps à la seconde entamée, élimination), comparaison (compareResults : terminé avant éliminé, pénalités, chrono),
// record personnel par version (recordResult : tentative dédoublonnée par identifiant, record si meilleur et non
// éliminé), texte du résultat (resultLine). Oracle : unreal/core/tests/oracles/defis.json ; ctest « defis ».
#pragma once
#include <map>
#include <string>
#include <vector>
#include "StridesCore/Api.h"

namespace strides {

struct ChallengeConfig {
  std::string id, name, course, place, courseId, where;
  int version = 1, timeAllowed = 64, timeLimit = 128;
  std::vector<int> obstacles;
  double height = 1.1;
  std::string horseId, horseName, horseCoat;
  double horseSpeed = 1, horseJump = 1, horseStamina = 1;
  std::string weatherLabel;
  int weatherDay = 2;
  double weatherHour = 11, rain = 0, wet = 0;
  bool jumpAid = true;
  int rail = 4, firstRefusal = 4, refusalsToEliminate = 2, timeFaultPerSecond = 1;
};
struct ChallengeData {
  std::string current;
  std::vector<ChallengeConfig> challenges;
  double startX = 0, startZ = 0, startRot = 0;  // ligne de départ du Pôle (CSO_START)
  STRIDESCORE_API const ChallengeConfig* find(const std::string& id) const;
};
STRIDESCORE_API bool loadChallenges(const std::string& jsonText, ChallengeData& out, std::string& err);

struct ChallengeResult {
  std::string challenge, attempt, eliminated;  // eliminated vide : terminé
  int version = 0, rails = 0, refusals = 0, faults = 0, timeFaults = 0, penalties = 0;
  double time = 0;
  bool isEliminated() const { return !eliminated.empty(); }
};
STRIDESCORE_API int challengeTimeFaults(double t, double allowed, int perSecond = 1);
STRIDESCORE_API ChallengeResult makeChallengeResult(const ChallengeConfig& cfg, const std::string& attempt, int faults, int refusals, int rails, double t, const std::string& eliminated);
// < 0 : a meilleur ; 0 : égal ; > 0 : b meilleur (nul = absent).
STRIDESCORE_API int compareChallengeResults(const ChallengeResult* a, const ChallengeResult* b);
// Record d'une version (data.challenges.records[id]) : meilleur, tentatives, dernier, identifiants vus (30 au plus).
struct ChallengeRecord {
  bool hasBest = false, hasLast = false;
  ChallengeResult best, last;
  int attempts = 0;
  std::vector<std::string> seen;
};
struct RecordOutcome { bool isRecord = false, duplicate = false, hadPrevious = false; ChallengeResult previous; };
STRIDESCORE_API RecordOutcome recordChallengeResult(std::map<std::string, ChallengeRecord>& records, const ChallengeResult& res);
// resultLine : « Éliminé » ou « 4 pts · 63,21 s » (fmtPenalties, fmtSeconds en français).
STRIDESCORE_API std::string challengeResultLine(const ChallengeResult& r);

}  // namespace strides
