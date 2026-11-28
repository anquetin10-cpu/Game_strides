// Entraînement à l'abord (jalon J2c) : voir CsoTraining.h. Références : src/gameplay/activities.js:137-205,
// src/gameplay/missions.js:20-35 (far, withDist, modeHint), 55-73 (goto), 189-234 (Run), 461-480 (start), 558-624
// (complete).
#include "StridesCore/CsoTraining.h"

#include <algorithm>
#include <cmath>

#include "StridesCore/MathUtil.h"

namespace strides {

namespace {
CsoArg S(const std::string& s) {
  CsoArg a;
  a.s = s;
  return a;
}
CsoArg N(double n) {
  CsoArg a;
  a.isNum = true;
  a.n = n;
  return a;
}
}  // namespace

CsoTraining::CsoTraining(CsoTrainingConfig cfg, const TextTable& text) : cfg_(std::move(cfg)), text_(text) {}

void CsoTraining::begin() {
  if (started_) return;
  started_ = true;
  // missions.start : hud.big(offer.title.toUpperCase(), `${label} · ${t(offer.category)}`, 2600) ; audio.notify() ;
  // run.begin() → next() : hud.clearHint(), étape goto (aucune astuce).
  if (cfg_.launch) {
    hud_.push_back(cfg_.launchBig);
    audio_.push_back({"notify", {}});
  }
  hud_.push_back({"clearHint", {}});
  step_ = CsoTrainingStep::Goto;
}

void CsoTraining::next() {
  // Run.next : end de l'étape en cours, hud.clearHint(), étape suivante (start, puis astuce) ou missions.complete.
  hud_.push_back({"clearHint", {}});
  if (step_ == CsoTrainingStep::Goto) {
    step_ = CsoTrainingStep::Train;
    // start : ob.resetRails('warmup'), game.course (mode de concours), écouteurs, action « Terminer » ; puis
    // hud.hint(s.hint, s.hintMs).
    resetRails_ = true;
    hud_.push_back({"hint", {S(text_.t("Vertical au nord (sauté vers l’est), oxer au sud (sauté vers l’ouest) : un cercle à main droite les enchaîne. Au galop, appuie sur <b>SAUT</b> quand le bouton est <b>vert</b> (zone verte au sol). Termine quand tu veux.", cfg_.lang)), N(cfg_.hintMs)}});
    return;
  }
  // end : écouteurs retirés, game.course = null, action retirée ; r.resultTitle / resultBody.
  step_ = CsoTrainingStep::Done;
  result_.taken = true;
  result_.title = text_.t("Entraînement terminé", cfg_.lang);
  result_.kicker = text_.t(cfg_.name, cfg_.lang) + " · Strides";  // `${def.title} · ${def.client ? … : 'Strides'}`
  result_.body = countText("{0} sauts sans faute sur {1}.", "{0} saut sans faute sur {1}.");
  result_.jumps = jumps_;
  result_.clean = clean_;
  // missions.complete → run.cleanup : hud.clearHint(), hud.closeDialog().
  hud_.push_back({"clearHint", {}});
  hud_.push_back({"closeDialog", {}});
}

void CsoTraining::update(const CsoRunFrame& f) {
  if (!started_ || step_ == CsoTrainingStep::Done) return;
  if (step_ == CsoTrainingStep::Goto) {
    // goto.update : dist(p) < r && player.mode === 'ride'.
    if (jsHypot(f.focusX - cfg_.paddockX, f.focusZ - cfg_.paddockZ) < cfg_.gotoR && f.riding) next();
    return;
  }
  if (done_) next();
}

std::string CsoTraining::countText(const char* manyKey, const char* oneKey) const {
  // st.clean > 1 ? T`…sauts…` : T`…saut…` (le web garde le singulier à 0 et 1).
  return text_.T(clean_ > 1 ? manyKey : oneKey, {jsInt(clean_), jsInt(jumps_)}, cfg_.lang);
}

std::string CsoTraining::text(const CsoRunFrame& f) const {
  if (!started_ || step_ == CsoTrainingStep::Done) return std::string();
  if (step_ == CsoTrainingStep::Train) return countText("Entraînement : {0} sauts sans faute sur {1}", "Entraînement : {0} saut sans faute sur {1}");
  // goto.text : far(pos, r) (au-delà de max(NEAR = 45, r + 30) m) → withDist, sinon modeHint('ride'), sinon le texte.
  const std::string base = text_.t("Rejoins le paddock d’échauffement du Pôle", cfg_.lang);
  const double d = jsHypot(f.focusX - cfg_.paddockX, f.focusZ - cfg_.paddockZ);
  if (d > std::max(45.0, cfg_.gotoR + 30)) {
    const std::string dist = d >= 1000 ? dec(d / 1000, 1, cfg_.lang) + " km" : jsInt((long long)std::floor(d / 10 + 0.5) * 10) + " m";
    return base + " · " + dist;
  }
  if (!f.riding) {
    if (f.driving) return text_.t(f.vehicle && !f.inTruck ? "Sors du véhicule puis monte à cheval." : "Sors du camion puis monte à cheval.", cfg_.lang);
    return text_.t("Monte sur ton cheval (siffle-le si besoin).", cfg_.lang);
  }
  return base;
}

void CsoTraining::obstacleEvent(CsoObstacleEventKind kind, const std::string& course, double margin, const std::string& causeText) {
  // Écouteurs actifs de start à end de l'étape d'entraînement ; `if (obstacle.course !== 'warmup') return`.
  if (step_ != CsoTrainingStep::Train || course != "warmup") return;
  if (kind == CsoObstacleEventKind::Clear) {
    jumps_++;
    clean_++;
    // Math.round(margin * 100) ; « juste » sous 12 cm de marge.
    const std::string cm = jsInt((long long)std::floor(margin * 100 + 0.5));
    hud_.push_back({"toast", {S(margin < 0.12 ? text_.T("Sans faute · {0} cm de marge (juste : appel un peu long ou un peu près)", {cm}, cfg_.lang)
                                              : text_.T("Sans faute · {0} cm de marge", {cm}, cfg_.lang))}});
  } else if (kind == CsoObstacleEventKind::Fault) {
    jumps_++;
    hud_.push_back({"toast", {S(text_.T("Barre · {0}", {causeText.empty() ? text_.t("appel à revoir", cfg_.lang) : causeText}, cfg_.lang))}});
  } else {
    hud_.push_back({"toast", {S(text_.t("Refus : trop près, appelle plus tôt", cfg_.lang))}});
  }
}

bool CsoTraining::finish() {
  if (!endAvailable()) return false;
  done_ = true;
  return true;
}

CsoCourseMode CsoTraining::course() const {
  CsoCourseMode m;
  m.active = step_ == CsoTrainingStep::Train;
  m.running = false;
  m.pre = false;
  m.board = false;
  m.next = -1;  // obstacle visé : fourni par le jeu (ob.target du cheval, course « warmup »)
  return m;
}

bool CsoTraining::takeResetRails() {
  const bool r = resetRails_;
  resetRails_ = false;
  return r;
}
std::vector<CsoCall> CsoTraining::takeHud() {
  std::vector<CsoCall> v;
  v.swap(hud_);
  return v;
}
std::vector<CsoCall> CsoTraining::takeAudio() {
  std::vector<CsoCall> v;
  v.swap(audio_);
  return v;
}
CsoTrainingResult CsoTraining::takeResult() {
  const CsoTrainingResult r = result_;
  result_.taken = false;
  return r;
}

CsoActivity csoWarmupActivity(const CsoPaddock& p) {
  CsoActivity a;
  a.id = "cso_warmup";
  a.name = "Entraînement à l’abord";
  a.kind = "CSO";
  a.desc = "Un vertical et un oxer au paddock du Pôle, sans enjeu : trouve la bonne distance d’appel.";
  a.category = "Entraînement";
  a.vertical = "EVENEMENTS";
  a.verticalLabel = "Événement";
  a.startX = p.x + 12;
  a.startZ = p.z;
  a.markerX = a.startX + 3;
  a.markerZ = a.startZ;
  a.r = 6;
  a.priority = 1;
  a.modes = {"ride"};
  a.label = "Chrono";
  a.icon = "target";
  a.launchMs = 2600;
  a.noRecord = true;
  return a;
}

CsoTrainingConfig csoTrainingConfig(const CsoPaddock& p, const TextTable& text, Lang lang) {
  CsoTrainingConfig c;
  c.paddockX = p.x;
  c.paddockZ = p.z;
  c.lang = lang;
  const CsoActivity a = csoWarmupActivity(p);
  c.name = a.name;
  c.launch = true;
  c.launchBig = csoActivityLaunchBig(a, text, lang);
  return c;
}

}  // namespace strides
