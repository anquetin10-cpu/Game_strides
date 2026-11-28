// Interface d'épreuve (tranche T7) : portage de src/ui/hud.js (toast, big, hint, clearHint, jumpFeedback, setObjective,
// _placeHint, partie concours de update) et des masquages de src/styles.css. Voir CsoHud.h.
#include "StridesCore/CsoHud.h"

#include <algorithm>
#include <cmath>

namespace strides {

double jsRound(double x) {
  if (!std::isfinite(x)) return x;
  double r = std::floor(x);
  if (x - r >= 0.5) r += 1.0;
  return r;
}

const char* csoHudElementName(CsoHudElement e) {
  switch (e) {
    case CsoHudElement::Minimap: return "minimap";
    case CsoHudElement::Wallet: return "wallet";
    case CsoHudElement::PhoneButton: return "phone";
    case CsoHudElement::PauseButton: return "pause";
    case CsoHudElement::Objective: return "objective";
    case CsoHudElement::Hint: return "hint";
    case CsoHudElement::Toasts: return "toasts";
    case CsoHudElement::JumpFeedback: return "jumpFb";
    case CsoHudElement::Board: return "board";
    case CsoHudElement::ClockIcon: return "clockIco";
    case CsoHudElement::Telemetry: return "telemetry";
    case CsoHudElement::Jump: return "jump";
    case CsoHudElement::Boost: return "boost";
    case CsoHudElement::Action: return "action";
    case CsoHudElement::Action2: return "action2";
    case CsoHudElement::Whistle: return "whistle";
    case CsoHudElement::HeartRate: return "hr";
    case CsoHudElement::Stamina: return "stamina";
    case CsoHudElement::BigMessage: return "big";
    default: return "?";
  }
}

bool csoHudMasked(CsoHudElement e, bool csoCtl, bool csoSober, bool csoOn, bool bigOn) {
  switch (e) {
    // styles.css:988-989 (.hud.cso-ctl … { display: none !important })
    case CsoHudElement::Minimap:
    case CsoHudElement::PhoneButton:
    case CsoHudElement::Boost:
    case CsoHudElement::Whistle:
    case CsoHudElement::HeartRate:
    case CsoHudElement::Stamina:
    case CsoHudElement::Action2: return csoCtl;
    // :988 (cso-ctl) et :150 (.hud.big-on .wallet { opacity: 0 })
    case CsoHudElement::Wallet: return csoCtl || bigOn;
    // :995 (.hud.cso-sober .telemetry, .btn-action) et :997 (horloge du tableau)
    case CsoHudElement::Telemetry:
    case CsoHudElement::Action:
    case CsoHudElement::ClockIcon: return csoSober;
    // :244 (.hud.cso-on .objective) et :150 (big-on)
    case CsoHudElement::Objective: return csoOn || bigOn;
    case CsoHudElement::Hint: return bigOn;
    default: return false;
  }
}

uint64_t CsoHud::schedule(double ms, TimerKind kind, int arg) {
  // setTimeout : délai en ms (négatif ou absent : 0) ; échéance en ticks de 1/3 ms.
  const double d = std::isfinite(ms) && ms > 0 ? ms : 0.0;
  const uint64_t h = ++seq_;
  timers_.push_back({now_ + (int64_t)std::llround(d * 3.0), h, kind, arg, h});
  return h;
}

void CsoHud::cancel(uint64_t handle) {
  if (!handle) return;
  timers_.erase(std::remove_if(timers_.begin(), timers_.end(), [handle](const Timer& t) { return t.handle == handle; }), timers_.end());
}

void CsoHud::advanceTicks(int64_t ticks) {
  const int64_t target = now_ + std::max<int64_t>(0, ticks);
  for (;;) {
    auto it = std::min_element(timers_.begin(), timers_.end(), [](const Timer& a, const Timer& b) { return a.due != b.due ? a.due < b.due : a.seq < b.seq; });
    if (it == timers_.end() || it->due > target) break;
    const Timer t = *it;
    timers_.erase(it);
    if (t.due > now_) now_ = t.due;
    fire(t);
  }
  now_ = target;
}

void CsoHud::advance(double seconds) {
  // Pas d'horloge murale du jeu (secondes) → ticks entiers, reste gardé pour le pas suivant. Tolérance d'un millionième
  // de tick : 1/30 s découpé en plusieurs pas, ou arrondi en double, donne 100 ticks et non 99 plus un reste de 0,999…
  frac_ += std::max(0.0, seconds) * (double)kTicksPerSecond;
  const double k = std::floor(frac_ + 1e-6);
  frac_ -= k;
  advanceTicks((int64_t)k);
}

void CsoHud::fire(const Timer& t) {
  switch (t.kind) {
    case TimerKind::ToastRemove:  // setTimeout(() => t.remove(), 3200)
      toasts_.erase(std::remove_if(toasts_.begin(), toasts_.end(), [&](const CsoHudToast& x) { return x.id == t.arg; }), toasts_.end());
      break;
    case TimerKind::HintOff:  // hintEl.classList.add('off')
      hintOff_ = true;
      break;
    case TimerKind::BigHide:  // bigEl hidden, puis big-on retiré 400 ms plus tard
      bigHidden_ = true;
      bigT_ = schedule(400, TimerKind::BigOnOff);
      break;
    case TimerKind::BigOnOff:
      bigOn_ = false;
      break;
    case TimerKind::FbOff:  // el.classList.add('off') ; el.textContent = ''
      fbOff_ = true;
      fbText_.clear();
      break;
    case TimerKind::EarlyOff:  // btnJump.classList.remove('early') ; this._jt = null
      jEarly_ = false;
      jt_.clear();
      break;
  }
}

void CsoHud::toast(const std::string& text, const std::string& kind) {
  const int id = ++toastId_;
  toasts_.push_back({id, text, kind});
  // Écran bas : un seul toast à la fois (innerHeight ≤ 420), sinon deux.
  const size_t max = vh_ <= 420 ? 1 : 2;
  while (toasts_.size() > max) toasts_.erase(toasts_.begin());
  schedule(3200, TimerKind::ToastRemove, id);
}

void CsoHud::big(const std::string& title, const std::string& sub, double ms) {
  bigTitle_ = title;
  bigSub_ = sub;
  bigHidden_ = false;
  bigPop_ = now_;  // animation pop relancée
  bigOn_ = true;
  cancel(bigT_);
  bigT_ = schedule(ms, TimerKind::BigHide);
}

void CsoHud::placeHint() {
  // _placeHint (hud.js:166-172) : astuce dans la carte d'objectif quand elle est affichée hors tableau, sinon dans la
  // colonne du haut, entre l'objectif et les toasts (l'élément a toujours un parent).
  hintInline_ = !objOff_ && !csoOn_;
}

void CsoHud::hint(const std::string& html, double ms) {
  hintHtml_ = html;
  hintOff_ = false;
  placeHint();
  cancel(hintT_);
  hintT_ = 0;
  if (ms != 0 && !std::isnan(ms)) hintT_ = schedule(ms, TimerKind::HintOff);
}

void CsoHud::clearHint() { hintOff_ = true; }

void CsoHud::jumpFeedback(const std::string& text, const std::string& kind) {
  if (text.empty()) return;
  fbText_ = text;
  fbKind_ = kind;
  fbOff_ = false;
  cancel(fbT_);
  fbT_ = schedule(1500, TimerKind::FbOff);
}

std::string CsoHud::fbClass() const {
  std::string c = "jump-fb";
  if (!fbKind_.empty()) c += " " + fbKind_;
  if (fbOff_) c += " off";
  return c;
}

// hud.js:433-442 : le libellé passe à « Trop tôt » ; classes far / good / near et signe gardés.
void CsoHud::jumpEarly() {
  jEarly_ = true;
  jLabel_ = "Trop tôt";
  jt_ = "early";
  cancel(earlyT_);
  earlyT_ = schedule(600, TimerKind::EarlyOff);
}

void CsoHud::setObjective(bool present) {
  if (present == !objOff_) return;
  objOff_ = !present;
  placeHint();
}

bool CsoHud::call(const CsoCall& c) {
  auto str = [&](size_t i, const std::string& def) { return i < c.args.size() && !c.args[i].isNum ? c.args[i].s : def; };
  auto num = [&](size_t i, double def) { return i < c.args.size() && c.args[i].isNum ? c.args[i].n : def; };
  if (c.fn == "toast") toast(str(0, ""), str(1, ""));
  else if (c.fn == "big") big(str(0, ""), str(1, ""), num(2, 2200));
  else if (c.fn == "hint") hint(str(0, ""), num(1, 4500));
  else if (c.fn == "clearHint") clearHint();
  else if (c.fn == "jumpFeedback") jumpFeedback(str(0, ""), str(1, "ok"));
  else return false;
  return true;
}

void CsoHud::update(double dt, const CsoHudFrame& f) {
  // Indicateur d'appel de saut (hud.js:373-380) : changé seulement hors de « Trop tôt ».
  const std::string jt = zoneName(f.jumpTiming);
  if (jt != jt_ && jt_ != "early") {
    jt_ = jt;
    jFar_ = jt == "far";
    jGood_ = jt == "good";
    jNear_ = jt == "near";
    jSign_ = jFar_ ? "»" : jGood_ ? "✓" : jNear_ ? "!" : "";
    jLabel_ = jFar_ ? "Trop loin" : jGood_ ? "Saute !" : jNear_ ? "Trop près" : "Saut";
  }
  // Tableau du parcours (hud.js:381-387).
  const bool ci = f.course && f.board;
  boardHidden_ = !ci;
  if (csoOn_ != ci) {
    csoOn_ = ci;
    placeHint();
  }
  // Commandes de concours et HUD sobre (:389-392).
  csoCtl_ = f.course && f.controlsCso;
  csoSober_ = csoCtl_ && f.kindCso;
  // Cadence : affichée deux secondes après un réglage (:394-406).
  if (csoCtl_ && f.hasCadence) {
    if (!hasCad_ || f.cadAdjust) {
      cadT_ = 2;
      hasCadT_ = true;
    }
    hasCad_ = true;
    cadT_ = std::max(0.0, (hasCadT_ ? cadT_ : 0.0) - dt);
    hasCadT_ = true;
    const double n = jsRound((f.cadence / 8) * 6);
    if (!hasCadN_ || n != cadN_) {
      hasCadN_ = true;
      cadN_ = n;
      cadOn_ = (int)std::clamp(n, 0.0, 6.0);
    }
    const bool show = cadT_ > 0;
    if (show != cadShow_) cadShowT_ = now_;
    cadShow_ = show;
  } else
    hasCad_ = false;
  // Textes et états du tableau (:407-414).
  if (ci) {
    for (int k = 0; k < 4; k++) boardTxt_[k] = f.info.txt[k];
    over_ = f.info.over;
    faults_ = f.info.pen > 0;
  }
}

}  // namespace strides
