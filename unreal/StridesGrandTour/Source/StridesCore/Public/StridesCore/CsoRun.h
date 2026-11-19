// Déroulé d'une épreuve de CSO (tranche T4) — portage de courseSteps (src/gameplay/courses.js:66-540) tel que
// l'activité « Parcours du Pôle » (cso_train, src/gameplay/activities.js:31-39) le construit, et du déroulé de mission
// qui l'exécute (Run.next / Run.update / Run.text, src/gameplay/missions.js:166-234 ; étape « goto » :55-73).
// Étapes : rejoindre l'entrée de piste, contrôle de capacité, présentation, entrée en piste (annonce du dossard), cloche,
// parcours (lignes, chrono, points en direct, refus, erreurs de parcours, éliminations, arrivée, sortie de piste),
// bilan. Textes (t / T, Text.h) et sons demandés par courses.js ; appels de l'interface (big / toast / hint /
// clearHint) restitués dans l'ordre du jeu web.
// L'appelant (le jeu) fournit à chaque image ce que lisent courses.js et missions.js (pas de la mission, cheval du
// joueur, point suivi, mode, cadence) et transmet les événements d'obstacle du parcours (CsoFences) avant l'image,
// comme Obstacles.updateHorse les émet avant missions.update (src/game.js:1491, 1507).
// Mot d'appel après un passage (hud.jumpFeedback, tranche T7) : dernier saut du cheval fourni par l'appelant
// (setLastJump), réglage jumpAid dans la configuration.
// Hors de cette tranche (honnêtement absents) : texte du dialogue de capacité et sa grille (T10), carte de présentation
// et plan (T10), aides à l'appel (T9), carte de bilan et classement (T11), GPS.
// Oracles : canal « ep » des scénarios de unreal/core/tests/oracles/cso_runs/ (test_core.cpp, testCsoRuns).
#pragma once
#include <set>
#include <string>
#include <vector>
#include "StridesCore/Api.h"
#include "StridesCore/Text.h"

struct J;

namespace strides {

struct CsoRunLine { double x = 0, z = 0, rot = 0, w = 6; };
struct CsoRunFence { std::string label; int num = 0; };  // dans l'ordre du parcours (num = 1..n)

struct CsoRunConfig {
  std::vector<CsoRunFence> fences;
  CsoRunLine start, finish;
  double gateX = 0, gateZ = 0, gateR = 9;
  int timeAllowed = 64, bellDelay = 45, maxRefusals = 2, pen = 4, rail = 4;
  bool soft = true;      // opts.soft || !!opts.result : l'élimination termine le parcours, le bilan suit
  bool result = true;    // étape de bilan (opts.result)
  bool present = true;   // présentation (opts.present !== false)
  bool capacity = true;  // contrôle de capacité (hauteurs données : maxH)
  bool hopeless = false; // résultat du contrôle de capacité (grille de courses.js:506-521, tranche T10) : dialogue
  std::string playerName, horseName, stable;  // horseName vide : t('son cheval')
  int bib = -1;          // opts.bib ?? run.data.bib ; sinon 40 + floor(game.time) % 50 à l'entrée en piste
  Lang lang = Lang::Fr;
  std::string aid = "full";  // aide à l'appel (aid() de courses.js:82 : réglage jumpAid, « full », « button » ou « off »)
};
// Règles et lignes de Content/Data/cso_course_pole.json (objet « run », exporté de courses.js / obstacles.js) ;
// fences : libellés dans l'ordre du tracé. Exception si mal formé.
STRIDESCORE_API CsoRunConfig csoRunConfigFromJson(const J& courseFile, const std::vector<std::string>& labels);
// Même lecture depuis le texte du fichier (chemin du jeu) : faux et message si illisible, sans exception.
STRIDESCORE_API bool csoRunConfigFromFile(const std::string& text, const std::vector<std::string>& labels, CsoRunConfig& out, std::string& err);

// Appel d'interface ou de son : nom de la méthode du jeu web (hud.big, hud.toast, hud.hint, hud.clearHint ;
// audio.tone, audio.bell, audio.applause, audio.fault, audio.crowdOoh, audio.cheer) et arguments.
struct CsoArg {
  bool isNum = false;
  double n = 0;
  std::string s;
};
struct CsoCall {
  std::string fn;
  std::vector<CsoArg> args;
};

enum class CsoStep { Goto, Capacity, Presentation, Entrance, Bell, Course, Result };
STRIDESCORE_API const char* csoStepName(CsoStep s);

// Entrées d'une image (missions.update(sdt) puis l'étape en cours).
struct CsoRunFrame {
  double dt = 0;                    // pas de la mission (nul quand la simulation est en pause)
  double time = 0;                  // game.time (dossard)
  double x = 0, z = 0, heading = 0; // cheval du joueur (game.player.horse)
  double focusX = 0, focusZ = 0;    // point suivi (player.focus : cheval monté, sinon cavalier)
  bool riding = true;               // player.mode === 'ride'
  // Au volant (player.mode === 'drive') : dans le camion (player.inTruck) ou dans un autre véhicule (player.vehicle non
  // nul, hors camion). Lus par la consigne de l'étape goto (missions.js modeHint) ; le jeu Unreal n'a pas de véhicule.
  bool driving = false, inTruck = false, vehicle = false;
};
// Cadence de concours du joueur (player.csoCadence ; has = faux si indéfinie), lue et réécrite par l'épreuve : remise à
// 0 sur un refus compté, ramenée vers 1,9 m/s pendant la sortie de piste.
struct CsoCadence {
  bool has = false;
  double v = 0;
};

// Étape « rejoindre l'entrée de la carrière » (missions.js goto(CSO_GATE, …, { r: 9, mode: 'ride' }), courses.js:496) :
// objectif affiché (au-delà de max(45, r + 30) m : texte et distance, « 120 m » ou « 1,2 km » ; sinon consigne de mode
// — descendre du camion ou du véhicule, monter à cheval — ; sinon le texte) et validation (point suivi à moins de r m,
// à cheval). Oracle : unreal/core/tests/oracles/cso_goto.json (étape du jeu web évaluée sur une grille de points et de
// modes du joueur).
STRIDESCORE_API std::string csoGotoText(const CsoRunConfig& cfg, const TextTable& text, const CsoRunFrame& f);
STRIDESCORE_API bool csoGotoDone(const CsoRunConfig& cfg, const CsoRunFrame& f);
// Points de l'épreuve de CSO (courses.js:148 hudInfo.pen et :341) : fautes + 1 point par seconde entamée au-delà du
// temps accordé (ceil(max(0, t − TA) − 1e-9)) ; CsoRun::points l'applique à l'état de la manche.
STRIDESCORE_API int csoPoints(int faults, double t, double timeAllowed);

enum class CsoObstacleEventKind { Clear, Fault, Refusal };

// Dernier saut du cheval du joueur (horse._lastJump), lu par le mot d'appel au moment d'un passage.
struct CsoLastJump {
  bool has = false;     // un saut a eu lieu
  int num = -1;         // numéro (1..n) de l'obstacle sauté s'il est du parcours, -1 sinon
  std::string quality;  // takeoffQuality(plan) (JumpModel.h, qualityName) ; vide si aucune
};
// Mot d'appel (courses.js:203-211, feedback) : sur le passage de l'obstacle num (sans-faute si clear, sinon faute de
// cause cause, vide = absente), clé française de TAKEOFF_TEXT (courses.js:39-49) et genre (« good », « ok », « bad ») ;
// faux si aucun mot (épreuve hors CSO, aide « off », pas de qualité ou qualité sans texte). Oracle : cso_feedback.json.
STRIDESCORE_API bool csoTakeoffFeedback(bool cso, const std::string& aid, const CsoLastJump& last, int num, bool clear, const std::string& cause, std::string& key, std::string& kind);

// État de l'épreuve (run.data.course de courses.js).
struct CsoRunLog { std::string label, kind, cause, causeText; };
struct CsoRunState {
  int faults = 0, refusals = 0, fenceRefusals = 0, next = 1, timeFaults = 0, attempt = 1;
  double t = 0, bell = 45, exitT = 0;
  bool running = false, started = false, finished = false;
  bool eliminated = false;
  std::string eliminatedReason;
  std::vector<CsoRunLog> log;
  std::set<int> wrong;
};

// Mode de concours du jeu (game.course) : null hors de l'entrée en piste et du parcours.
struct CsoCourseMode {
  bool active = false;   // game.course non nul (caméra et commandes de concours)
  bool running = false;
  bool pre = false;      // entrée en piste et cloche (aide à l'appel coupée)
  bool board = false;    // tableau de chrono (game.course.hud)
  int next = -1;         // rang (0..n-1) de l'obstacle suivant, -1 si aucun
};

// Tableau de chrono : données (courses.js hudInfo) et textes (src/ui/hud.js:407-414).
struct CsoBoard {
  bool started = false, over = false, finished = false, eliminated = false;
  double bell = 0, t = 0;
  int ta = 0, pen = 0;
  std::string next;  // libellé, ou « Arrivée »
  std::string txt[4];
};

class STRIDESCORE_API CsoRun {
 public:
  CsoRun(CsoRunConfig cfg, const TextTable& text);
  // Lancement de l'activité (Run.begin : première étape).
  void begin();
  // Bouton « Entrer en piste » de la présentation ; fermeture du dialogue de capacité ; choix du bilan.
  void enter();
  void closeCapacityDialog();
  enum class ResultChoice { Retry, Train, Done };
  void resultChoice(ResultChoice c);
  // Événement d'obstacle du parcours (obstacle:clear / fault / refusal), avant l'image : rang 1..n (o.num), sens du
  // passage, cause et texte de la cause (faute).
  void obstacleEvent(CsoObstacleEventKind kind, int num, int dir, const std::string& cause, const std::string& causeText, CsoCadence& cad);
  // Dernier saut du cheval du joueur, lu par les écouteurs d'obstacle (mot d'appel) : à fournir quand il change.
  void setLastJump(const CsoLastJump& lj) { lastJump_ = lj; }
  const CsoLastJump& lastJump() const { return lastJump_; }
  // Une image : Run.update(dt) (pas cumulé, étape en cours, passage à la suivante).
  void update(const CsoRunFrame& f, CsoCadence& cad);

  // Appels produits depuis le dernier takeCalls (ordre du jeu web).
  std::vector<CsoCall> takeHud();
  std::vector<CsoCall> takeAudio();

  bool finished() const { return done_; }  // mission terminée (après le bilan, ou échouée)
  bool failed() const { return failed_; }  // échec de la mission (élimination d'une épreuve non « souple »)
  int stepIndex() const { return i_; }     // rang de l'étape (Run.i)
  CsoStep step() const;
  double stepT() const { return stepT_; }
  std::string text() const;                // objectif affiché (Run.text)
  const CsoRunState& state() const { return st_; }
  int points() const;                      // fautes + pénalités de temps en direct (hudInfo.pen)
  const CsoCourseMode& course() const { return mode_; }
  bool board(CsoBoard& out) const;         // faux si aucun tableau (game.course.hud absent)
  int highlight() const { return highlight_; }  // numéro surligné (Obstacles.highlight), -1 : aucun
  // Demandes faites aux obstacles à l'entrée en piste (hauteurs posées, barres remises) : vrai une fois puis remis à faux.
  bool takeResetRails();
  // Public en liesse demandé après un sans-faute (game.cheerT = 3,5, courses.js:345) : durée en secondes une fois, puis 0.
  double takeCheer();
  int bib() const { return bib_; }
  const CsoRunConfig& config() const { return cfg_; }

 private:
  void next();
  void startStep();
  bool updateStep(const CsoRunFrame& f, CsoCadence& cad);
  void endStep();
  bool courseUpdate(const CsoRunFrame& f, CsoCadence& cad);
  bool out(const std::string& reason);
  void advance();
  bool notStarted();
  void wrongCourse(int num);
  std::string labelOf(int num) const;  // libellé de l'obstacle de rang num, vide hors parcours
  std::string tr(const char* key) const { return text_.t(key, cfg_.lang); }
  std::string Tr(const char* key, const std::vector<std::string>& v) const { return text_.T(key, v, cfg_.lang); }
  void hud(const char* fn, std::vector<CsoArg> args);
  void audio(const char* fn, std::vector<CsoArg> args);
  static CsoArg S(const std::string& s) { CsoArg a; a.s = s; return a; }
  static CsoArg N(double n) { CsoArg a; a.isNum = true; a.n = n; return a; }

  CsoRunConfig cfg_;
  const TextTable& text_;
  std::vector<CsoStep> steps_;
  int i_ = -1;
  double t_ = 0, stepT_ = 0;
  bool done_ = false, failed_ = false;
  // Drapeaux des étapes (run.flags) et position précédente du parcours (prevP).
  bool capWarn_ = false, pres_ = false, resultChoice_ = false;
  ResultChoice choice_ = ResultChoice::Done;
  bool hasPrev_ = false;
  double prevX_ = 0, prevZ_ = 0;
  CsoRunState st_;
  CsoCourseMode mode_;
  int highlight_ = -1, bib_ = -1;
  double cheer_ = 0;
  bool resetRails_ = false;
  std::vector<CsoCall> hud_, audio_;
  CsoRunFrame cur_;
  CsoLastJump lastJump_;
  void feedback(int num, bool clear, const std::string& cause);
};

}  // namespace strides
