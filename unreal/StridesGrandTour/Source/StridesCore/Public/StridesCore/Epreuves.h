// Jalon J4 : épreuves des missions de l'histoire verrouillées en J3b (choix n° 25), portées du jeu web en C++ sans type
// Unreal :
//  - cross de Saint-Gatien : mission « cross » (story.js:560-587) = courseSteps(kind « xc ») de src/gameplay/courses.js
//    (rejoindre le départ, dialogue de Paul, « Prends ton élan… », compte à rebours, parcours de 10 obstacles fixes :
//    refus +20, 4e refus ou 3e refus sur un même obstacle éliminatoires, temps limite = 2 × temps accordé, 0,4 point par
//    seconde au-delà du temps accordé arrondi, arrivée à moins de 7 m du point d'arrivée, élimination = échec de la
//    mission), puis le bilan « Pénalités : … · Chrono … s » ;
//  - course de l'hippodrome de la Touques : mission « derby » (story.js:672-689) = raceSteps (courses.js:684-821) :
//    rejoindre la piste, dialogue de Victor, stalles, compte à rebours, un tour contre cinq adversaires (PathAI du web,
//    vitesse selon l'écart au joueur et le dernier virage), progression mesurée par ovalProject, « Reste sur la piste ! »,
//    arrivée, top 3 obligatoire, dotation au prorata de la place ;
//  - Grand Prix de Paris Indoor (parisGP.js) : concurrents simulés (parisRivals), Sprint au barème C (sprintField,
//    rankSprint), Grand Prix au barème A (gpField), barrage (barrageField). Le déroulé jouable est dans GrandPrixParis.h.
// Fin de mission (missions.js complete) : note (def.rate), pourboire de 10 % à 5 étoiles, montant (payOverride sinon
// def.pay) : rendus par EventRun ; le versement unique et la réputation restent dans Career (completeMission).
// Mouvement des chevaux adverses : vraie règle PathAI.update du web, puis sous-ensemble cinématique de Horse.update
// (cap borné, vitesse bornée en accélération, avance sur le cap, sol plat) : choix n° 29 de plan.md.
// Données : Content/Data/mission_events.json ; oracle : unreal/core/tests/oracles/epreuves.json (vraie MissionManager du
// web dans une partie factice, scripts/unreal/export-epreuves.mjs) ; ctest « epreuves ».
// Textes en français (clés du web). L'anglais de ces épreuves n'est pas porté (à confirmer).
#pragma once
#include <string>
#include <vector>
#include "StridesCore/Api.h"
#include "StridesCore/CsoRun.h"

namespace strides {

struct EventFence {
  int num = 0;
  std::string label, kind;  // « log », « brush », « water »
  double x = 0, z = 0, rot = 0, h = 1, w = 4.2, s = 0;
};
struct EventDialogLine { std::string who, initials, text; };

struct CrossData {
  std::vector<EventFence> fences;
  double startX = 0, startZ = 0, startR = 7, finX = 0, finZ = 0, finW = 7;
  int timeAllowed = 110, maxRefusals = 4, pen = 20, pay = 320, xp = 350;
  double officialX = 0, officialZ = 0, officialHeading = 0;
  std::vector<EventDialogLine> intro;
  std::vector<std::pair<double, double>> path;  // XC_PATH (tracé au sol)
  double pondX = 0, pondZ = 0, pondR = 15;
};
struct Hippo { double x = 330, z = 230, half = 100, radius = 62, width = 16; };
struct RaceData {
  Hippo hippo;
  double startS = 60, total = 0, finishS = 0;
  double meetX = 0, meetZ = 0, meetR = 8;
  std::vector<std::string> rivals, silks, coats;
  std::vector<int> stalls;
  int playerStall = 3;
  std::vector<double> base;
  double gallop = 14, timeLimit = 160;
  std::vector<int> payPos;
  int pay = 420, xp = 400;
  std::vector<EventDialogLine> intro;
};
struct ParisData {
  int riders = 40, sprintPrize = 1500, gpHour = 20, sprintTa = 0, gpTa = 0, joTa = 0;
  double sprintH = 1.5, gpH = 1.6, railSeconds = 4, sprintLength = 0, gpLength = 0;
  std::vector<int> prizes;
  std::vector<std::string> firstNames, lastNames, horseNames;
};
struct MissionEvents {
  CrossData cross;
  RaceData race;
  ParisData paris;
};
STRIDESCORE_API bool loadMissionEvents(const std::string& jsonText, MissionEvents& out, std::string& err);

// Hippodrome (courses.js:625-682) : stalles, ovale, projection.
STRIDESCORE_API double stallRadius(const Hippo& h, int k);
STRIDESCORE_API double ovalLength(const Hippo& h, double r);
STRIDESCORE_API void ovalPoint(const Hippo& h, double s, double r, double& x, double& z);
STRIDESCORE_API void ovalProject(const Hippo& h, double x, double z, double& s, double& off);

// Entrées d'une image du déroulé (game.player et cheval du joueur).
struct EventFrame {
  double dt = 0;
  double x = 0, z = 0, heading = 0, speed = 0;  // cheval du joueur
  double focusX = 0, focusZ = 0;                // point suivi (cheval monté, sinon cavalier)
  bool riding = true, driving = false, inTruck = false, vehicle = false;
};

// Adversaire de la course (rival de raceSteps + cheval mené par PathAI).
struct RaceRival {
  std::string name;
  double x = 0, z = 0, heading = 0, speed = 0;
  bool frozen = true;
  // PathAI : points, point visé, fini.
  std::vector<std::pair<double, double>> pts;
  int pathI = 0;
  bool pathDone = false;
  // Commande du cheval (control) : direction, intensité, vitesse imposée.
  double cx = 0, cz = 0, mag = 0, speedOverride = 0;
  bool hasOverride = false;
  // Progression sur l'ovale.
  double prog = 0, lastS = 0, base = 0;
  bool finished = false;
};

struct XcState {
  int faults = 0, refusals = 0, fenceRefusals = 0, next = 1, timeFaults = 0;
  double t = 0;
  bool running = false, started = false, finished = false;
  std::string eliminated;
  std::vector<CsoRunLog> log;
  std::vector<int> wrong;
};
struct RaceState {
  double t = 0, prog = 0, lastS = 0;
  bool started = false, finished = false, offTrack = false;
  std::vector<std::string> order;
  int finishPos = 0;
};

class STRIDESCORE_API EventRun {
 public:
  enum class Kind { Cross, Race };
  enum class Step { Goto, Dialog, Elan, Countdown, XcCourse, XcResult, RaceSetup, Race, RaceAfter };
  // rivalBase : vitesses des adversaires (rival.base) ; vide : tirées comme au web (0,98 + 0,04 × hasard, graine seed).
  EventRun(Kind k, const MissionEvents& data, const std::string& playerName = "Alex", std::vector<double> rivalBase = {}, double seed = 7);
  void begin();
  Kind kind() const { return kind_; }
  // Dialogue fermé par le joueur (hud.dialog : rappel de fin).
  void closeDialog();
  bool dialogOpen() const { return dialogOpen_; }
  const std::vector<EventDialogLine>& dialogLines() const { return dialogLines_; }
  // Événement d'obstacle du cross (obstacle:clear / fault / refusal), avant l'image ; num 1..10.
  void obstacleEvent(CsoObstacleEventKind k, int num, int dir, const std::string& cause, const std::string& causeText, CsoCadence& cad);
  // Une image : adversaires (PathAI + mouvement) puis Run.update (missions.update).
  void update(const EventFrame& f, CsoCadence& cad);
  std::vector<CsoCall> takeHud();
  std::vector<CsoCall> takeAudio();
  // Cheval du joueur posé par l'épreuve (stalles de départ) : vrai une fois.
  bool takeTeleport(double& x, double& z, double& heading);

  std::string text() const;          // objectif (Run.text), vide une fois finie
  int stepIndex() const { return i_; }
  Step step() const;
  const char* stepKindName() const;  // kind du web (« goto », « dialog », « countdown », « course », « race », « » ; « end »)
  bool finished() const { return finished_; }
  bool failed() const { return failed_; }
  bool completed() const { return completed_; }
  const std::string& failReason() const { return failReason_; }
  bool locked() const { return locked_; }  // player.locked (dialogue, compte à rebours)
  // Cible du GPS de l'étape (applyWaypoint) : faux si aucune.
  bool target(double& x, double& z) const;
  // Mode de concours du cross (game.course) : actif, épreuve lancée ; obstacle surligné (1..n, -1 aucun).
  bool courseActive() const { return courseOn_; }
  int highlight() const { return highlight_; }
  const XcState& course() const { return xc_; }
  int points() const;  // points en direct (hudInfo.pen)
  // Tableau du cross (game.course.hud de courses.js:141-154, textes de hud.js:407-412) pendant l'étape de parcours.
  bool board(CsoBoard& b) const;
  const RaceState& race() const { return race_; }
  const std::vector<RaceRival>& rivals() const { return rivals_; }
  int racePosition() const;  // 1 + adversaires devant
  // Fin de mission (missions.complete) : note, montant (payOverride ou def.pay) avec le pourboire, titre et texte.
  int stars() const { return stars_; }
  int pay() const { return pay_; }
  int tip() const { return tip_; }
  int xp() const { return xp_; }
  const std::string& resultTitle() const { return resultTitle_; }
  const std::string& resultBody() const { return resultBody_; }
  double resultTime() const { return resultTime_; }

 private:
  void next();
  void startStep();
  int updateStep(double dt);  // 0 : rien, 1 : étape franchie, 2 : échec (failReason_)
  void endStep();
  void complete();
  void fail(const std::string& reason);
  void cleanup();
  bool xcUpdate(double dt, std::string& fail);
  bool raceUpdate(double dt, std::string& fail);
  void raceSetup();
  void moveRivals(double dt);
  bool progress(double x, double z, double speed, double& prog, double& lastS, double dt) const;
  std::string xcLabel(int num) const;
  void hud(const char* fn, std::vector<CsoArg> a);
  void audio(const char* fn, std::vector<CsoArg> a);
  static CsoArg S(const std::string& s) { CsoArg a; a.s = s; return a; }
  static CsoArg N(double n) { CsoArg a; a.isNum = true; a.n = n; return a; }

  Kind kind_;
  const MissionEvents& d_;
  std::string playerName_;
  std::vector<double> rivalBase_;
  double seed_;
  std::vector<Step> steps_;
  int i_ = -1;
  double t_ = 0, stepT_ = 0;
  bool finished_ = false, failed_ = false, completed_ = false, locked_ = false;
  std::string failReason_;
  bool dialogOpen_ = false, dlg_ = false;
  std::vector<EventDialogLine> dialogLines_;
  double cd_ = 0;
  int cdShown_ = 0;
  EventFrame cur_;
  // Cross.
  XcState xc_;
  bool courseOn_ = false, hasPrev_ = false;
  double prevX_ = 0, prevZ_ = 0;
  int highlight_ = -1;
  // Course.
  RaceState race_;
  std::vector<RaceRival> rivals_;
  bool setup_ = false;
  bool teleport_ = false;
  double tpX_ = 0, tpZ_ = 0, tpH_ = 0;
  bool hasPayOverride_ = false;
  int payOverride_ = 0;
  // Résultat.
  int stars_ = 0, pay_ = 0, tip_ = 0, xp_ = 0;
  std::string resultTitle_ = "Mission réussie", resultBody_;
  double resultTime_ = 0;
  std::vector<CsoCall> hud_, audio_;
};

// Sous-ensemble cinématique de Horse.update pour un cheval mené par son IA (choix n° 29) : une image.
STRIDESCORE_API void aiHorseStep(RaceRival& h, double dt);
// PathAI.update du web (horse.js:578-604) : point visé, commande (steer), vitesse imposée v.
STRIDESCORE_API void pathAiUpdate(RaceRival& h, double v, double lookahead = 7);

// Endurance du cheval (horse.js:294-307) : le grand galop (vitesse > GAIT_EDGES.canter = 10,5 m/s) la vide de 7 / s ;
// sinon elle remonte de 9 / s (× 1,5 sous 5 m/s, × 0,5 au-dessus de 7,1 m/s) ; à 0, cheval épuisé jusqu'à 35 %.
// Jalon J4 : lue par la course de l'hippodrome (BOOST tenu : grand galop tant que le cheval n'est pas épuisé).
struct HorseStamina {
  double v = 100, max = 100;
  bool exhausted = false;
};
STRIDESCORE_API void staminaStep(HorseStamina& s, double speed, double dt);

// ---- Grand Prix de Paris Indoor : concurrents simulés (parisGP.js:35-82) ----
struct ParisRival { std::string rider, horse; double form = 1; };
struct ParisSprint { int rails = 0; double time = 0, score = 0; };
struct ParisGpRow { int faults = 0; double time = 0; };
struct ParisJoRow { int faults = 0; double time = 0; };
STRIDESCORE_API std::vector<ParisRival> parisRivals(const ParisData& p, double seed);
STRIDESCORE_API std::vector<ParisSprint> sprintField(const ParisData& p, const std::vector<ParisRival>& rivals, double seed);
// rankSprint : tri stable par score croissant (indices dans la liste donnée).
STRIDESCORE_API std::vector<int> rankSprint(const std::vector<double>& scores);
STRIDESCORE_API std::vector<ParisGpRow> gpField(const ParisData& p, const std::vector<ParisRival>& rivals, double seed);
STRIDESCORE_API std::vector<ParisJoRow> barrageField(const ParisData& p, size_t nClear, double seed);
// Math.round du JavaScript (arrondi au plus proche, égalité vers +∞).
STRIDESCORE_API double jsRoundHalfUp(double x);
// formatMoney du web en français : entier arrondi, séparateur des milliers U+202F, « € ».
STRIDESCORE_API std::string formatMoneyFr(double v);

}  // namespace strides
