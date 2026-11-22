// Interface d'épreuve (tranche T7) — portage de la partie « concours » du HUD du jeu web (src/ui/hud.js) : tableau de
// chrono (.cso-board), crans de cadence, mot d'appel (.jump-fb), astuce (.hint), toasts, grand message (.big-msg) et
// masquages par les classes du HUD (cso-ctl, cso-sober, cso-on, big-on ; src/styles.css).
// État pur, sans rendu : le jeu (UStridesCsoHud, UMG) affiche ce que décrit CsoHud ; les temporisations du web
// (setTimeout de toast, hint, big, jumpFeedback) sont rejouées sur une horloge en « ticks » de 1/3 ms (1/30 s = 100
// ticks : instants et durées en ms entières exacts), un temporisateur échu se déclenche à son échéance, dans l'ordre
// (échéance, création), avant les appels de l'image suivante.
// Oracle : unreal/core/tests/oracles/cso_hud.json (HUD du jeu web rejoué par scripts/unreal/export-hud-style.mjs sur
// les appels hud.* des exécutions de cso_runs/, horloge virtuelle) ; masquages : Content/Data/hud_cso_style.json.
// Bouton SAUT coloré (tranche T9 : hud.js:373-380, jumpEarly :433-442) : canal « ai » des exécutions t9-* de cso_runs/
// (état du bouton relevé dans le DOM à chaque image, temporisation de « Trop tôt » sur l'horloge virtuelle).
#pragma once
#include <cstdint>
#include <string>
#include <vector>
#include "StridesCore/Api.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/JumpModel.h"

namespace strides {

struct CsoHudToast {
  int id = 0;
  std::string text, kind;  // kind : classe en plus de .toast (« money », « gold »…), vide sinon
};

// Ce que lit hud.update pour la partie concours (game.course, game.player).
struct CsoHudFrame {
  bool course = false;      // game.course non nul
  bool controlsCso = false; // game.course.controls === 'cso'
  bool kindCso = false;     // game.course.kind === 'cso'
  bool board = false;       // un tableau est fourni (game.course.hud() le rend) ; sans game.course, il est ignoré
  CsoBoard info;            // ce tableau (données et textes de hud.js:407-412, CsoRun::board)
  bool hasCadence = false;  // player.csoCadence !== undefined
  double cadence = 0;
  bool cadAdjust = false;   // player._cadAdjust (cadence réglée au joystick à cette image)
  // Aide à l'appel lue par le bouton SAUT (g.course?.jumpTiming?.() || 'none', tranche T9 : csoJumpTiming, CourseAids.h).
  Zone jumpTiming = Zone::None;
};

// Éléments du HUD masqués par une classe (styles.css:150, 244, 988-997) : display none ou opacité nulle.
enum class CsoHudElement {
  Minimap, Wallet, PhoneButton, PauseButton, Objective, Hint, Toasts, JumpFeedback, Board, ClockIcon, Telemetry,
  Jump, Boost, Action, Action2, Whistle, HeartRate, Stamina, BigMessage, Count
};
STRIDESCORE_API const char* csoHudElementName(CsoHudElement e);
// Vrai si les classes du HUD masquent l'élément (élément lui-même supposé affiché).
STRIDESCORE_API bool csoHudMasked(CsoHudElement e, bool csoCtl, bool csoSober, bool csoOn, bool bigOn);

// Math.round du JS (au plus proche, égalité vers +∞).
STRIDESCORE_API double jsRound(double x);

class STRIDESCORE_API CsoHud {
 public:
  static constexpr int64_t kTicksPerSecond = 3000;

  // Construction (hud.js:74, h('b.tab-num', { text: dec(0, 2) })) : chrono du tableau « 0,00 » dans la langue du jeu,
  // les trois autres champs vides (hud.js:75-77) ; le tableau reste masqué jusqu'à la première mise à jour.
  explicit CsoHud(Lang lang = Lang::Fr) { boardTxt_[0] = dec(0, 2, lang); }

  // Hauteur du viewport (innerHeight, px CSS) : 1 toast au plus si ≤ 420, sinon 2 (hud.js:447).
  void setViewportHeight(double h) { vh_ = h; }
  double viewportHeight() const { return vh_; }
  // Avance l'horloge et déclenche les temporisateurs échus (dans l'ordre).
  void advanceTicks(int64_t ticks);
  // Pas d'horloge murale du jeu (secondes ; setTimeout du web : ni gel en pause, ni ralenti) : ticks entiers accumulés,
  // reste gardé. Rejoué sur l'oracle par pas de 1/30 s entiers et découpés (testCsoHud).
  void advance(double seconds);
  int64_t now() const { return now_; }

  // Appels du jeu web (hud.js:432-475, :174-185).
  void toast(const std::string& text, const std::string& kind = std::string());
  void big(const std::string& title, const std::string& sub = std::string(), double ms = 2200);
  void hint(const std::string& html, double ms = 4500);
  void clearHint();
  void jumpFeedback(const std::string& text, const std::string& kind = "ok");
  void setObjective(bool present);
  // Appui SAUT sans effet (hud.js:433-442, tranche T9) : classe early, libellé « Trop tôt », état « early » 600 ms.
  void jumpEarly();
  // Appel enregistré (CsoRun::takeHud, oracle) : big, toast, hint, clearHint, jumpFeedback ; les autres sont ignorés
  // (rend faux). Arguments absents : valeurs par défaut du JS.
  bool call(const CsoCall& c);
  // Partie concours de hud.update(dt) (hud.js:381-415) : classes, tableau, crans de cadence.
  void update(double dt, const CsoHudFrame& f);

  // État affiché.
  const std::vector<CsoHudToast>& toasts() const { return toasts_; }
  bool hintOff() const { return hintOff_; }
  const std::string& hintHtml() const { return hintHtml_; }
  bool hintInline() const { return hintInline_; }
  bool bigHidden() const { return bigHidden_; }
  const std::string& bigTitle() const { return bigTitle_; }
  const std::string& bigSub() const { return bigSub_; }
  bool bigOn() const { return bigOn_; }
  double bigPopSeconds() const { return double(now_ - bigPop_) / kTicksPerSecond; }  // depuis le dernier big()
  const std::string& fbText() const { return fbText_; }
  const std::string& fbKind() const { return fbKind_; }
  bool fbOff() const { return fbOff_; }
  std::string fbClass() const;  // className de .jump-fb
  int cadOn() const { return cadOn_; }  // crans allumés (0..6)
  bool cadShow() const { return cadShow_; }
  double cadShowSince() const { return double(now_ - cadShowT_) / kTicksPerSecond; }  // fondu de 0,4 s
  bool boardHidden() const { return boardHidden_; }
  const std::string& boardText(int k) const { return boardTxt_[k]; }
  bool boardOver() const { return over_; }
  bool boardFaults() const { return faults_; }
  bool csoOn() const { return csoOn_; }
  bool csoCtl() const { return csoCtl_; }
  bool csoSober() const { return csoSober_; }
  bool objectiveOff() const { return objOff_; }
  bool masked(CsoHudElement e) const { return csoHudMasked(e, csoCtl_, csoSober_, csoOn_, bigOn_); }
  // Bouton SAUT (tranche T9) : this._jt (vide : non défini ou remis à null ; « none », « far », « good », « near »,
  // « refuse » ou « early »), classes far / good / near / early de .btn-jump, signe de la pastille (« » », « ✓ », « ! »
  // ou vide) et clé française du libellé (« Saut », « Trop loin », « Saute ! », « Trop près », « Trop tôt » : t(clé)).
  const std::string& jumpState() const { return jt_; }
  bool jumpFar() const { return jFar_; }
  bool jumpGood() const { return jGood_; }
  bool jumpNear() const { return jNear_; }
  bool jumpEarlyOn() const { return jEarly_; }
  const std::string& jumpSign() const { return jSign_; }
  const std::string& jumpLabelKey() const { return jLabel_; }

 private:
  enum class TimerKind { ToastRemove, HintOff, BigHide, BigOnOff, FbOff, EarlyOff };
  struct Timer { int64_t due; uint64_t seq; TimerKind kind; int arg; uint64_t handle; };
  uint64_t schedule(double ms, TimerKind kind, int arg = 0);
  void cancel(uint64_t handle);
  void fire(const Timer& t);
  void placeHint();

  double vh_ = 390;
  int64_t now_ = 0;
  double frac_ = 0;
  uint64_t seq_ = 0;
  std::vector<Timer> timers_;
  std::vector<CsoHudToast> toasts_;
  int toastId_ = 0;
  bool hintOff_ = true, hintInline_ = false;
  std::string hintHtml_;
  uint64_t hintT_ = 0;
  bool bigHidden_ = true, bigOn_ = false;
  std::string bigTitle_, bigSub_;
  int64_t bigPop_ = 0;
  uint64_t bigT_ = 0;
  std::string fbText_, fbKind_;
  bool fbOff_ = true;
  uint64_t fbT_ = 0;
  bool objOff_ = true;
  bool hasCad_ = false;     // this._cad !== undefined
  bool hasCadT_ = false;    // this._cadT défini
  double cadT_ = 0;
  bool hasCadN_ = false;
  double cadN_ = 0;
  int cadOn_ = 0;
  bool cadShow_ = false;
  int64_t cadShowT_ = 0;
  bool boardHidden_ = true, over_ = false, faults_ = false;
  std::string boardTxt_[4];
  bool csoOn_ = false, csoCtl_ = false, csoSober_ = false;
  std::string jt_;  // this._jt
  bool jFar_ = false, jGood_ = false, jNear_ = false, jEarly_ = false;
  std::string jSign_, jLabel_ = "Saut";  // signe vide et libellé « Saut » du bouton construit (hud.js:113-118)
  uint64_t earlyT_ = 0;
};

}  // namespace strides
