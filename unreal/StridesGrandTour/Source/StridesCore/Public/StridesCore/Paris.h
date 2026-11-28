// Jalon J4 (correction après contrôle adverse) : Grand Prix de Paris Indoor, mission « gpparis » du jeu web
// (src/gameplay/parisGP.js PARIS_MISSION), porté en C++ sans type Unreal :
//   invitation (dialogue de Margot) → charger le cheval → rouler jusqu'à la bretelle de l'A13 → prendre l'autoroute
//   (trajet fait par le jeu : région « paris ») → décharger → accréditation (dossard) → dialogue → monter → échauffement
//   au paddock (2 sauts) → Sprint à 1,50 m (courseSteps du web, CsoRun intégré, barème C : chrono + 4 s par barre) →
//   classement du Sprint et grille (ordre inverse) → soirée : présentation des cavaliers → dialogue de l'ordre de départ
//   → Grand Prix à 1,60 m (barème A) → barrage des sans-faute s'il y en a → podium, dotation, note et pourboire.
// Les 39 autres couples sont ceux de parisRivals / sprintField / gpField / barrageField (StridesCore/Epreuves).
// Ce que la mission demande au jeu (trajet par l'autoroute, heure du soir, tracé affiché, public, écran géant) est rendu
// par des demandes (take*) ; ce qu'elle lit (positions, mode, camion, région) arrive dans ParisFrame à chaque image.
// Données : Content/Data/paris_gp.json (scripts/unreal/export-paris.mjs) ; oracle : unreal/core/tests/oracles/
// paris_gp.json (vraie MissionManager du web dans une partie factice), ctest « paris ».
// Textes en français (clés du web). L'anglais n'est pas porté (comme les autres épreuves des missions, à confirmer).
#pragma once
#include <memory>
#include <string>
#include <vector>
#include "StridesCore/Api.h"
#include "StridesCore/CsoCourse.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/Epreuves.h"
#include "StridesCore/Text.h"

namespace strides {

struct ParisPoint { double x = 0, z = 0, r = 0, h = 0; };
struct ParisFenceData { int num = 0; std::string label, kind; double spread = 0, x = 0, z = 0, rot = 0, h = 1.45, lineS = 0; };
struct ParisCourseData {
  std::string id;
  double length = 0;
  CsoRunLine start, finish;
  std::vector<ParisFenceData> fences;
  std::vector<std::pair<double, double>> line;  // tracé du cavalier (repère monde)
  CourseDesign design;                          // tracé du web (repère de la piste)
  // Hauteurs de l'épreuve (parisCourse.js heights(h) : h + profil, arrondi au centimètre).
  std::vector<double> heights(double h) const;
};
struct ParisRect { double x = 0, z = 0, w = 0, d = 0, h = 0, rot = 0; };
struct ParisSite {
  double x = 4000, z = 0, y = 12;
  ParisRect arena, hall, warmup, stables;
  std::vector<ParisRect> stands;
  ParisPoint door, gate, park, exit, secretariat;
  double doorW = 6;
};
struct ParisA13 {
  ParisPoint deauville, paris;     // bretelles (x, z, r)
  ParisPoint arriveDeauville, arriveParis;  // camion posé à l'arrivée (x, z, h)
  int km = 200, minutes = 130, fuelL = 46;
  double aireDiesel = 0;
};
struct ParisGpData {
  ParisSite site;
  ParisA13 a13;
  ParisCourseData sprint, gp;
  std::vector<ParisFenceData> warm;  // vertical et oxer du paddock (num 0)
  int riders = 40, sprintPrize = 1500, gpHour = 20, sprintTa = 54, gpTa = 54, joTa = 47, xp = 1500, bellDelay = 45;
  double sprintH = 1.5, gpH = 1.6, railSeconds = 4, gateR = 9;
  std::vector<int> prizes;
};
STRIDESCORE_API bool loadParisGp(const std::string& jsonText, ParisGpData& out, std::string& err);

// Entrées d'une image (ce que lisent les étapes du web).
struct ParisFrame {
  double dt = 0, time = 0;
  double hx = 0, hz = 0, heading = 0;  // cheval du joueur (game.mainHorse)
  double fx = 0, fz = 0;               // point suivi (player.focus)
  std::string mode = "ride";           // « ride », « foot », « drive »
  bool inTruck = false, vehicle = false;
  bool horseAboard = false;            // cheval du joueur dans le camion (player.transport.isAboard)
  bool rampOpen = false;               // rampe du camion ouverte (tk.ramp.target === 1)
  double tkx = 0, tkz = 0, tkSpeed = 0;
  bool inParis = false;                // game.region === 'paris'
  double gameTime = 0;                 // game.save.data.gameTime (s)
};

// Carte (screens.card) : en-tête, titre, lignes (clé, valeur), classement (moi, colonnes), boutons (data-id).
struct ParisCardRow { bool me = false; std::vector<std::string> cells; };
struct ParisCard {
  std::string kicker, title;
  std::vector<std::pair<std::string, std::string>> rows;
  std::vector<ParisCardRow> table;
  std::vector<std::string> buttons;
  bool presentation = false;  // carte de présentation d'une manche (courseSteps showPresentation)
};

class STRIDESCORE_API ParisRun {
 public:
  enum class Step { Invite, Load, Drive, Ramp, Unload, Official, Accred, Welcome, Mount, Warm, ShowSprint, Round, SprintCard, Presentation, OrderDialog, GpStart, GpResults, Podium };
  enum class Round { Sprint, Gp, Barrage };
  // seed : run.data.seed (4000 + 0..4999) ; bib : run.data.bib (100 + 0..39) ; hopeless : contrôle de capacité de chaque
  // manche (courses.js:499-528, calculé par le jeu sur le cheval engagé) ; aid : réglage jumpAid.
  ParisRun(const ParisGpData& d, const MissionEvents& ev, const TextTable& text, std::string playerName, std::string horseName, double seed, int bib, std::string aid = "full");
  void begin();
  void update(const ParisFrame& f, CsoCadence& cad);
  // Dialogue fermé (hud.dialog : rappel) ; bouton d'une carte (« enter », « sprint-ok », « gpparis-ok ») ; action
  // « Accréditation » (interact) : faux si elle n'est pas proposée (mode, distance).
  void closeDialog();
  bool pressButton(const std::string& id);
  bool interact(const ParisFrame& f);
  bool interactAvailable(const ParisFrame& f) const;
  // Événements d'obstacle (obstacle:clear / fault / refusal) : paddock de Paris (warm) ou manche en cours (num 1..n).
  void warmEvent(CsoObstacleEventKind k);
  // course : parcours de l'obstacle (« paris_sprint », « paris_gp ») ; un obstacle d'un autre parcours est ignoré
  // (courses.js : obstacle.course !== courseId).
  void obstacleEvent(CsoObstacleEventKind k, const std::string& course, int num, int dir, const std::string& cause, const std::string& causeText, CsoCadence& cad);
  void capacityClosed();
  void setHopeless(bool sprint, bool gp) { hopelessSprint_ = sprint; hopelessGp_ = gp; }
  void setLastJump(const CsoLastJump& lj) { if (cso_) cso_->setLastJump(lj); }

  std::string text() const;
  const char* kindName() const;  // step.kind du web (« dialog », « tload », « goto », « course », …, « end »)
  Step step() const { return i_ >= 0 && i_ < (int)steps_.size() ? steps_[(size_t)i_].step : Step::Podium; }
  bool finished() const { return done_; }
  bool locked() const { return dialogOpen_; }
  bool dialogOpen() const { return dialogOpen_; }
  const std::vector<EventDialogLine>& dialogLines() const { return dialog_; }
  bool target(double& x, double& z) const;
  // Manche en cours (CsoRun intégré) et laquelle ; nul hors manche.
  const CsoRun* round() const { return cso_ && !cso_->finished() ? cso_.get() : nullptr; }
  CsoRun* mutableRound() { return cso_ && !cso_->finished() ? cso_.get() : nullptr; }
  Round roundKind() const { return roundKind_; }
  // Parcours affiché dans l'arène (showParisCourse) : « paris_sprint » ou « paris_gp ».
  const std::string& courseShown() const { return shown_; }
  std::vector<CsoCall> takeHud();
  std::vector<CsoCall> takeAudio();
  bool takeCard(ParisCard& c);
  bool cardOpen() const { return cardOpen_; }
  const ParisCard& card() const { return card_; }
  bool takeResetWarm();  // ob.resetRails(PARIS_WARM)
  bool takeGameTime(double& t);  // heure du soir posée (d.gameTime)
  // Écran géant de l'arène (paris.screenInfo) : titre, deux lignes, grand mot.
  struct Screen { std::string title, line1, line2, big; };
  const Screen& screen() const { return screen_; }
  // Fin (missions.complete) : note, montant (payOverride, pourboire de 10 % à 5 étoiles compris), réputation, textes.
  int stars() const { return stars_; }
  int pay() const { return pay_; }
  int tip() const { return tip_; }
  int xp() const { return d_.xp; }
  const std::string& resultTitle() const { return resultTitle_; }
  const std::string& resultBody() const { return resultBody_; }
  int sprintRank() const { return sprintRank_; }
  int order() const { return order_; }
  bool barrage() const { return barrage_; }
  int finalRank() const { return final_; }
  int payOverride() const { return payOverride_; }
  bool hasPayOverride() const { return hasPay_; }
  int bib() const { return bib_; }

 private:
  struct StepDef { Step step; Round round = Round::Sprint; };
  void next();
  void startStep();
  bool updateStep(double dt, CsoCadence& cad);
  std::string loadState() const;
  std::string unloadState() const;
  std::string farText(const std::string& txt, double px, double pz, double r) const;
  CsoRunConfig roundConfig(Round r) const;
  void openCard(ParisCard c);
  void say(std::vector<std::string> lines);
  void hud(const char* fn, std::vector<CsoArg> a) { hud_.push_back({fn, std::move(a)}); }
  void audio(const char* fn, std::vector<CsoArg> a) { audio_.push_back({fn, std::move(a)}); }
  static CsoArg S(const std::string& s) { CsoArg a; a.s = s; return a; }
  static CsoArg N(double n) { CsoArg a; a.isNum = true; a.n = n; return a; }
  std::string pt(int n) const;

  const ParisGpData& d_;
  const MissionEvents& ev_;
  const TextTable& text_;
  std::string player_, horse_, aid_;
  double seed_;
  int bib_;
  std::vector<ParisRival> rivals_;
  std::vector<StepDef> steps_;
  int i_ = -1;
  double t_ = 0, stepT_ = 0;
  bool done_ = false;
  ParisFrame cur_;
  bool dialogOpen_ = false, dlgDone_ = false, interacted_ = false, ok_ = false;
  std::vector<EventDialogLine> dialog_;
  int warm_ = 0;
  std::unique_ptr<CsoRun> cso_;
  Round roundKind_ = Round::Sprint;
  bool hopelessSprint_ = false, hopelessGp_ = false;
  std::string shown_ = "paris_gp";
  std::vector<CsoCall> hud_, audio_;
  ParisCard card_;
  bool cardOpen_ = false, cardNew_ = false;
  bool resetWarm_ = false, newTime_ = false;
  double gameTime_ = 0;
  Screen screen_;
  int intro_ = 0;
  std::vector<std::string> names_;
  // Manches.
  CsoRunState sprintSt_, gpSt_, joSt_;
  int sprintRank_ = 0, order_ = 0, final_ = 0;
  bool barrage_ = false, hasPay_ = false;
  int payOverride_ = 0;
  struct Me { int faults = 0; double time = 0; int joFaults = 0; double joTime = 0; };
  Me me_;
  std::vector<ParisGpRow> field_;
  int stars_ = 0, pay_ = 0, tip_ = 0;
  std::string resultTitle_, resultBody_;
};

}  // namespace strides
