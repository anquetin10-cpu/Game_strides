// Entraînement à l'abord au paddock du Pôle (jalon J2c, lot J2-D) — portage de l'activité cso_warmup du jeu web :
// Activities.startTraining et trainingSteps (src/gameplay/activities.js:42-46, 137-205), lancée comme une mission
// (missions.js start : grand message et son « notify » ; Run.next / update / text ; étape goto :55-73 ; complete :
// carte de fin de mission). Deux étapes : rejoindre le paddock d'échauffement (goto, r = 18 m, à cheval), puis
// l'entraînement (sauts du vertical et de l'oxer du paddock, course « warmup » : explication de chaque saut en toast —
// marge en cm, cause de la faute, refus —, compte des sauts sans faute, action « Terminer » de priorité 2, mode de
// concours game.course { kind: 'cso-train', camera, controls: 'cso' }).
// Absents du portage (comme pour l'épreuve du Pôle, CsoRun.h) : GPS de l'étape goto, récompense de la mission
// (+15 réputation, compétence « organisation »), carte de fin de mission du web (screens.missionResult) : le jeu
// affiche son contenu (titre, kicker, texte) par un grand message (choix n° 12 du plan, docs/livraison/plan.md).
// Oracle : unreal/core/tests/oracles/cso_training.json (scripts/unreal/export-cso-training.mjs, jeu web réel).
#pragma once
#include <string>
#include <vector>
#include "StridesCore/Api.h"
#include "StridesCore/CsoEntry.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/Text.h"

namespace strides {

struct CsoTrainingConfig {
  // POLE.warmup (src/world/sites.js, Content/Data/cso_course_pole.json « warmup ») : centre visé par l'étape goto.
  double paddockX = 240, paddockZ = -232;
  double gotoR = 18;     // goto(…, { r: 18, mode: 'ride' }) (activities.js:154)
  double hintMs = 7000;  // hintMs de l'étape d'entraînement (activities.js:159)
  Lang lang = Lang::Fr;
  // missions.start : grand message (csoActivityLaunchBig : « ENTRAÎNEMENT À L'ABORD », « Événement · Entraînement »,
  // 2600 ms) puis « notify » ; absent si launch faux.
  bool launch = true;
  CsoCall launchBig;
  std::string name = "Entraînement à l’abord";  // a.name (clé) : kicker de la carte de fin
};

enum class CsoTrainingStep { Goto, Train, Done };

// Carte de fin de mission (missions.js complete : result.title / kicker / body ; pay 0, xp 15 non portés).
struct CsoTrainingResult {
  bool taken = false;
  std::string title, kicker, body;
  int jumps = 0, clean = 0;
};

class STRIDESCORE_API CsoTraining {
 public:
  CsoTraining(CsoTrainingConfig cfg, const TextTable& text);
  void begin();
  // Une image (Run.update) : étape goto validée (point suivi à moins de r m, à cheval) ; étape d'entraînement terminée
  // après « Terminer ».
  void update(const CsoRunFrame& f);
  // Écouteurs de l'étape d'entraînement (obstacle:clear / fault / refusal) : obstacles de la course « warmup » seulement.
  // margin : marge du passage (m) ; causeText : texte traduit de la cause (vide : aucune).
  void obstacleEvent(CsoObstacleEventKind kind, const std::string& course, double margin, const std::string& causeText);
  // Action « Terminer » (interact train:end : st.done = true) : vrai si elle était proposée.
  bool finish();
  // Action « Terminer » proposée (étape d'entraînement), libellé traduit.
  bool endAvailable() const { return step_ == CsoTrainingStep::Train && !done_; }
  std::string endLabel() const { return text_.t("Terminer", cfg_.lang); }
  static constexpr int kEndPriority = 2;  // priority: 2, r: 999, modes ride et foot

  std::string text(const CsoRunFrame& f) const;  // objectif (Run.text)
  CsoTrainingStep step() const { return step_; }
  bool finished() const { return step_ == CsoTrainingStep::Done; }
  // game.course de l'étape d'entraînement : caméra et commandes de concours, aucun tableau, pas d'entrée en piste.
  CsoCourseMode course() const;
  int jumps() const { return jumps_; }
  int clean() const { return clean_; }
  // Barres du paddock remises (ob.resetRails('warmup')) au début de l'étape d'entraînement : vrai une fois.
  bool takeResetRails();
  std::vector<CsoCall> takeHud();
  std::vector<CsoCall> takeAudio();
  CsoTrainingResult takeResult();
  const CsoTrainingConfig& config() const { return cfg_; }

 private:
  void next();
  std::string countText(const char* manyKey, const char* oneKey) const;
  CsoTrainingConfig cfg_;
  const TextTable& text_;
  CsoTrainingStep step_ = CsoTrainingStep::Goto;
  bool started_ = false, done_ = false, resetRails_ = false;
  int jumps_ = 0, clean_ = 0;
  std::vector<CsoCall> hud_, audio_;
  CsoTrainingResult result_;
};

// Points du paddock (cso_course_pole.json « warmup ») : bornes de la zone d'entraînement et lice (world.js rectFence(
// POLE.warmup, { height: 1.0, board: true }, 'e', 6, 0.5)).
struct CsoPaddock { double x = 0, z = 0, w = 0, d = 0; };

// Activité cso_warmup (activities.js:42-46) telle que missions.start la lance : nom, catégorie « Entraînement »,
// vertical EVENEMENTS (libellé « Événement »), grand message de 2600 ms ; départ a.start = (warmup.x + 12, warmup.z),
// poteau a.marker absent → (start.x + 3, start.z), action à cheval à moins de 6 m, priorité 1 (Activities._markers).
STRIDESCORE_API CsoActivity csoWarmupActivity(const CsoPaddock& paddock);
// Configuration de l'entraînement pour ce paddock, langue et table de textes (grand message traduit).
STRIDESCORE_API CsoTrainingConfig csoTrainingConfig(const CsoPaddock& paddock, const TextTable& text, Lang lang);

}  // namespace strides
