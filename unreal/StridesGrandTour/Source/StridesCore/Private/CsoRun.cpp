#include "StridesCore/CsoRun.h"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include "StridesCore/MathUtil.h"
#include "StridesCore/MiniJson.h"

namespace strides {

const char* csoStepName(CsoStep s) {
  switch (s) {
    case CsoStep::Goto: return "goto";
    case CsoStep::Capacity: return "capacity";
    case CsoStep::Presentation: return "presentation";
    case CsoStep::Entrance: return "entrance";
    case CsoStep::Bell: return "bell";
    case CsoStep::Course: return "course";
    case CsoStep::Result: return "result";
  }
  return "?";
}

CsoRunConfig csoRunConfigFromJson(const J& file, const std::vector<std::string>& labels) {
  const J& r = file["run"];
  if (r.t != J::Obj) throw std::runtime_error("cso_course_pole.json : objet « run » absent (export-data.mjs, tranche T4)");
  CsoRunConfig c;
  for (size_t i = 0; i < labels.size(); i++) c.fences.push_back({labels[i], (int)i + 1});
  auto line = [](const J& l) {
    CsoRunLine L;
    L.x = l["x"].num();
    L.z = l["z"].num();
    L.rot = l["rot"].num();
    L.w = l["w"].isNull() ? 6 : l["w"].num();
    return L;
  };
  c.start = line(r["start"]);
  c.finish = line(r["finish"]);
  c.gateX = r["gate"]["x"].num();
  c.gateZ = r["gate"]["z"].num();
  c.gateR = r["gate"]["r"].num();
  c.timeAllowed = (int)r["timeAllowed"].num();
  c.bellDelay = (int)r["bellDelay"].num();
  c.maxRefusals = (int)r["maxRefusals"].num();
  c.pen = (int)r["pen"].num();
  c.rail = (int)r["rail"].num();
  return c;
}

bool csoRunConfigFromFile(const std::string& text, const std::vector<std::string>& labels, CsoRunConfig& out, std::string& err) {
  try {
    out = csoRunConfigFromJson(JParser(text).parse(), labels);
    return true;
  } catch (const std::exception& e) {
    err = e.what();
    return false;
  }
}

CsoRun::CsoRun(CsoRunConfig cfg, const TextTable& text) : cfg_(std::move(cfg)), text_(text) {
  // courses.js:495-539 : goto, capacité (si hauteurs), présentation, puis une manche (attemptSteps).
  steps_ = {CsoStep::Goto};
  if (cfg_.capacity) steps_.push_back(CsoStep::Capacity);
  if (cfg_.present) steps_.push_back(CsoStep::Presentation);
  for (CsoStep s : {CsoStep::Entrance, CsoStep::Bell, CsoStep::Course}) steps_.push_back(s);
  if (cfg_.result) steps_.push_back(CsoStep::Result);
  st_.bell = cfg_.bellDelay;
}

void CsoRun::hud(const char* fn, std::vector<CsoArg> args) { hud_.push_back({fn, std::move(args)}); }
void CsoRun::audio(const char* fn, std::vector<CsoArg> args) { audio_.push_back({fn, std::move(args)}); }
std::vector<CsoCall> CsoRun::takeHud() { std::vector<CsoCall> v; v.swap(hud_); return v; }
std::vector<CsoCall> CsoRun::takeAudio() { std::vector<CsoCall> v; v.swap(audio_); return v; }
bool CsoRun::takeResetRails() { const bool r = resetRails_; resetRails_ = false; return r; }
double CsoRun::takeCheer() { const double r = cheer_; cheer_ = 0; return r; }

// ---------- Étape goto (missions.js:20-35, 55-73) ----------
std::string csoGotoText(const CsoRunConfig& cfg, const TextTable& text, const CsoRunFrame& f) {
  // text : far(pos, r) — distance au-delà de max(NEAR = 45, r + 30) m — puis withDist, sinon modeHint('ride'), sinon le
  // texte.
  const std::string base = text.t("Entre en piste : rejoins l’entrée de la carrière", cfg.lang);
  const double d = jsHypot(f.focusX - cfg.gateX, f.focusZ - cfg.gateZ);  // Math.hypot du jeu web (MathUtil.h)
  if (d > std::max(45.0, cfg.gateR + 30)) {
    // withDist : « 1,2 km » (num(d / 1000, 1)) ou « 120 m » (Math.round(d / 10) * 10)
    const std::string dist = d >= 1000 ? dec(d / 1000, 1, cfg.lang) + " km" : jsInt((long long)std::floor(d / 10 + 0.5) * 10) + " m";
    return base + " · " + dist;
  }
  if (!f.riding) {
    // modeHint('ride') : au volant (camion, ou autre véhicule), sinon à pied.
    if (f.driving) return text.t(f.vehicle && !f.inTruck ? "Sors du véhicule puis monte à cheval." : "Sors du camion puis monte à cheval.", cfg.lang);
    return text.t("Monte sur ton cheval (siffle-le si besoin).", cfg.lang);
  }
  return base;
}

bool csoGotoDone(const CsoRunConfig& cfg, const CsoRunFrame& f) {
  // update : dist(p) < r && player.mode === 'ride'
  return jsHypot(f.focusX - cfg.gateX, f.focusZ - cfg.gateZ) < cfg.gateR && f.riding;
}

CsoStep CsoRun::step() const { return i_ >= 0 && i_ < (int)steps_.size() ? steps_[(size_t)i_] : CsoStep::Result; }
std::string CsoRun::labelOf(int num) const { return num >= 1 && num <= (int)cfg_.fences.size() ? cfg_.fences[(size_t)num - 1].label : std::string(); }

// ---------- Déroulé de mission (missions.js Run) ----------
void CsoRun::begin() { next(); }

void CsoRun::next() {
  if (i_ >= 0 && i_ < (int)steps_.size()) endStep();
  hud("clearHint", {});
  i_++;
  stepT_ = 0;
  if (i_ >= (int)steps_.size()) {
    done_ = true;  // missions.complete (bilan de la mission : tranche T11)
    return;
  }
  startStep();
}

void CsoRun::update(const CsoRunFrame& f, CsoCadence& cad) {
  if (done_) return;
  cur_ = f;
  t_ += f.dt;
  stepT_ += f.dt;
  if (i_ < 0 || i_ >= (int)steps_.size()) return;
  if (!updateStep(f, cad)) return;
  if (failed_) {
    // missions.fail (épreuve non « souple » : échec de la mission, pas de bilan) — branche sans oracle, le Parcours du
    // Pôle est souple.
    endStep();
    done_ = true;
    return;
  }
  next();
}

void CsoRun::enter() { pres_ = true; }
void CsoRun::closeCapacityDialog() { capWarn_ = false; }
void CsoRun::resultChoice(ResultChoice c) {
  resultChoice_ = true;
  choice_ = c;
}

std::string CsoRun::text() const {
  if (done_ || i_ < 0) return std::string();
  switch (step()) {
    case CsoStep::Goto: return csoGotoText(cfg_, text_, cur_);
    case CsoStep::Capacity: return std::string();
    case CsoStep::Presentation: return tr("Présentation de l’épreuve");
    case CsoStep::Entrance: return tr("Entrée en piste…");
    case CsoStep::Bell: return std::string();
    case CsoStep::Result: return tr("Résultats…");
    case CsoStep::Course: {
      if (st_.eliminated) return tr("Éliminé");
      if (st_.finished) return std::string();
      if (!st_.started) return tr("Franchis la ligne de départ");
      const int n = (int)cfg_.fences.size();
      if (st_.next >= 1 && st_.next <= n) {
        const std::string& lab = cfg_.fences[(size_t)st_.next - 1].label;
        const bool dbl = !lab.empty() && lab.back() == 'A';
        return Tr("Obstacle n°{0}{1} sur {2}", {lab, dbl ? tr(" · double") : std::string(), jsInt(n)});
      }
      return tr("Passe la ligne d’arrivée !");
    }
  }
  return std::string();
}

// ---------- Étapes ----------
void CsoRun::startStep() {
  switch (step()) {
    case CsoStep::Goto: break;
    case CsoStep::Capacity:
      // courses.js:499-528 : dialogue de l'entraîneur si les obstacles sont hors de portée (grille et texte : T10).
      capWarn_ = cfg_.hopeless;
      break;
    case CsoStep::Presentation: pres_ = false; break;  // carte de présentation (T10)
    case CsoStep::Entrance: {
      // courses.js:452-462 : hauteurs posées, barres remises, n° 1 surligné, mode concours, annonce, applaudissements.
      resetRails_ = true;
      highlight_ = 1;
      mode_ = CsoCourseMode();
      mode_.active = true;
      mode_.pre = true;
      mode_.next = cfg_.fences.empty() ? -1 : 0;
      bib_ = cfg_.bib >= 0 ? cfg_.bib : 40 + (int)((long long)std::floor(cur_.time) % 50);
      const std::string horse = cfg_.horseName.empty() ? tr("son cheval") : cfg_.horseName;
      hud("big", {S(Tr("N° {0} · {1}", {jsInt(bib_), cfg_.playerName})), S(Tr("et {0}{1}", {horse, cfg_.stable.empty() ? std::string() : " · " + cfg_.stable})), N(2400)});
      audio("applause", {N(0.5), N(2.2)});
      break;
    }
    case CsoStep::Bell:
      audio("bell", {});
      hud("big", {S(tr("CLOCHE")), S(Tr("Tu as {0} s pour franchir la ligne de départ", {jsInt(cfg_.bellDelay)})), N(2000)});
      break;
    case CsoStep::Course: {
      // courses.js:182-285 (start) : chrono pas encore lancé, mode concours de parcours, départ lancé, consigne.
      st_.running = true;
      hasPrev_ = false;
      mode_ = CsoCourseMode();
      mode_.active = true;
      mode_.running = true;
      mode_.board = true;
      mode_.next = -1;
      const CsoRunLine& L = cfg_.start;
      const double nx = std::sin(L.rot), nz = std::cos(L.rot);
      const double sP = (cur_.x - L.x) * nx + (cur_.z - L.z) * nz;
      const double uP = std::abs((cur_.x - L.x) * nz - (cur_.z - L.z) * nx);
      if (sP >= 0 && sP < 12 && uP < L.w / 2 + 0.3 && std::sin(cur_.heading) * nx + std::cos(cur_.heading) * nz > 0.5) {
        st_.started = true;
        audio("tone", {N(1568), N(0.1), S("sine"), N(0.08)});
        highlight_ = st_.next;
      }
      if (st_.started) hud("hint", {S(tr("<b>Gauche/droite</b> : diriger · <b>avant/arrière</b> : cadence (gardée) · <b>SAUT</b> au bon moment.")), N(5000)});
      else hud("hint", {S(tr("<b>Gauche/droite</b> : diriger · <b>avant/arrière</b> : cadence (gardée) · <b>SAUT</b> au bon moment. Franchis la <b>ligne de départ</b>.")), N(6000)});
      break;
    }
    case CsoStep::Result:
      // courses.js:372-424 : carte de bilan, classement simulé, récompense (tranche T11) ; attente du choix.
      resultChoice_ = false;
      break;
  }
}

bool CsoRun::updateStep(const CsoRunFrame& f, CsoCadence& cad) {
  switch (step()) {
    case CsoStep::Goto: return csoGotoDone(cfg_, f);
    case CsoStep::Capacity: return !capWarn_;
    case CsoStep::Presentation: return pres_;
    case CsoStep::Entrance: return stepT_ > 2.4;
    case CsoStep::Bell: return true;
    case CsoStep::Course: return courseUpdate(f, cad);
    case CsoStep::Result: {
      if (!resultChoice_) return false;
      if (choice_ == ResultChoice::Retry) {
        // Nouvelle manche : état neuf, entrée en piste, cloche, parcours, bilan insérés après le bilan.
        const int attempt = st_.attempt + 1;
        st_ = CsoRunState();
        st_.attempt = attempt;
        st_.bell = cfg_.bellDelay;
        std::vector<CsoStep> more = {CsoStep::Entrance, CsoStep::Bell, CsoStep::Course};
        if (cfg_.result) more.push_back(CsoStep::Result);
        steps_.insert(steps_.begin() + i_ + 1, more.begin(), more.end());
      }
      return true;
    }
  }
  return false;
}

void CsoRun::endStep() {
  if (step() != CsoStep::Course) return;
  // courses.js:352-367 : fin du mode concours, pénalités de temps (barème A : 1 point par seconde entamée).
  highlight_ = -1;
  mode_ = CsoCourseMode();
  st_.running = false;
  const double over = std::max(0.0, st_.t - cfg_.timeAllowed);
  st_.timeFaults = (int)std::ceil(over - 1e-9);
}

// Ligne orientée franchie entre deux positions (courses.js:28-36) ; cap facultatif (départ seulement).
static bool lineCrossed(const CsoRunLine& L, bool hasP0, double x0, double z0, double x1, double z1, const double* heading) {
  if (!hasP0) return false;
  const double nx = std::sin(L.rot), nz = std::cos(L.rot);
  if (heading && std::sin(*heading) * nx + std::cos(*heading) * nz < 0.5) return false;
  const double s0 = (x0 - L.x) * nx + (z0 - L.z) * nz;
  const double s1 = (x1 - L.x) * nx + (z1 - L.z) * nz;
  const double u = std::abs((x1 - L.x) * nz - (z1 - L.z) * nx);
  return s0 < 0 && s1 >= 0 && u < L.w / 2 + 0.3;
}

bool CsoRun::out(const std::string& reason) {
  audio("bell", {N(2)});
  hud("big", {S(tr("ÉLIMINÉ")), S(reason), N(2600)});
  if (!cfg_.soft) {
    failed_ = true;  // échec de la mission (épreuve non « souple ») : hors du parcours du Pôle
    return true;
  }
  st_.eliminated = true;
  st_.eliminatedReason = reason;
  return true;
}

int csoPoints(int faults, double t, double timeAllowed) {
  const double over = std::max(0.0, t - timeAllowed);
  return faults + (int)std::ceil(over - 1e-9);
}

int CsoRun::points() const { return csoPoints(st_.faults, st_.t, cfg_.timeAllowed); }

bool CsoRun::courseUpdate(const CsoRunFrame& f, CsoCadence& cad) {
  // courses.js:286-351.
  const bool hasP0 = hasPrev_;
  const double x0 = prevX_, z0 = prevZ_;
  hasPrev_ = true;
  prevX_ = f.x;
  prevZ_ = f.z;
  if (!st_.started) {
    st_.bell -= f.dt;
    if (lineCrossed(cfg_.start, hasP0, x0, z0, f.x, f.z, &f.heading)) {
      st_.started = true;
      audio("tone", {N(1568), N(0.1), S("sine"), N(0.08)});
      highlight_ = st_.next;
    } else if (st_.bell <= 0) {
      st_.started = true;
      hud("toast", {S(Tr("{0} s écoulées : le chrono est lancé", {jsInt(cfg_.bellDelay)}))});
    }
  } else if (!st_.finished) st_.t += f.dt;
  const int n = (int)cfg_.fences.size();
  const int nextIdx = st_.started ? st_.next - 1 : 0;
  mode_.next = st_.finished || nextIdx < 0 || nextIdx >= n ? -1 : nextIdx;
  // Arrivée franchie : sortie de piste (mode concours gardé, retour au pas), puis bilan.
  if (st_.finished) {
    st_.exitT += f.dt;
    if (cad.has) cad.v = std::max(std::min(cad.v, 1.9), cad.v - 1.6 * f.dt);
    return st_.exitT > 2.6 || !f.riding;
  }
  if (!f.riding) return out(tr("Tu es descendu de cheval : éliminé."));
  if (st_.refusals >= cfg_.maxRefusals) return out(Tr("{0} refus : éliminé du parcours.", {nth(cfg_.maxRefusals, cfg_.lang)}));
  // Temps limite : le double du temps accordé.
  if (st_.t > cfg_.timeAllowed * 2) return out(tr("Temps limite dépassé : éliminé."));
  if (st_.started && st_.next > n && lineCrossed(cfg_.finish, hasP0, x0, z0, f.x, f.z, nullptr)) {
    st_.finished = true;
    mode_.running = false;
    const int pts = points();
    audio("applause", {N(pts == 0 ? 1.3 : 0.55), N(pts == 0 ? 4 : 2.6)});
    if (pts == 0) audio("cheer", {});
    hud("big", {S(pts == 0 ? tr("SANS FAUTE !") : pts > 1 ? Tr("{0} POINTS", {jsInt(pts)}) : Tr("{0} POINT", {jsInt(pts)})), S(dec(st_.t, 2, cfg_.lang) + " s"), N(2600)});
    if (pts == 0) cheer_ = 3.5;  // game.cheerT = 3.5 (CSO)
    return false;  // CSO : courte sortie de piste avant le bilan
  }
  return false;
}

// ---------- Événements d'obstacle (écouteurs de courses.js:219-268, actifs pendant l'étape de parcours) ----------
void CsoRun::advance() {
  st_.next++;
  st_.fenceRefusals = 0;
  highlight_ = st_.next;
}

bool CsoRun::notStarted() {
  if (st_.started) return false;
  hud("hint", {S(tr("Le chrono n’est pas lancé : franchis d’abord la <b>ligne de départ</b>.")), N(3000)});
  return true;
}

void CsoRun::wrongCourse(int num) {
  if (st_.wrong.count(num)) return;
  st_.wrong.insert(num);
  audio("fault", {});
  const std::string want = labelOf(st_.next);
  hud("toast", {S(Tr("Erreur de parcours : ce n’est pas le {0}", {want}))});
  hud("hint", {S(Tr("Erreur de parcours : saute l’obstacle <b>{0}</b> (repère vert).", {want})), N(3500)});
}

void CsoRun::obstacleEvent(CsoObstacleEventKind kind, int num, int dir, const std::string& cause, const std::string& causeText, CsoCadence& cad) {
  if (done_ || step() != CsoStep::Course) return;  // écouteurs posés au début du parcours, retirés à sa fin
  const std::string label = labelOf(num);
  if (kind == CsoObstacleEventKind::Refusal) {
    // Refus compté seulement face à l'obstacle attendu, dans son sens de franchissement.
    if (st_.finished || st_.eliminated || !st_.started || dir < 0) return;
    if (num != st_.next) return;
    st_.refusals++;
    st_.fenceRefusals++;
    st_.faults += cfg_.pen;
    st_.log.push_back({label, "refusal", "", ""});
    audio("fault", {});
    audio("crowdOoh", {});
    std::string msg = tr("Fais demi-tour, reprends ta <b>cadence</b> (joystick vers l’avant) et représente l’obstacle.");
    // Refus dans une combinaison : reprise au premier élément.
    if (!label.empty() && label.back() == 'B') {
      const std::string a = label.substr(0, label.size() - 1) + "A";
      for (const CsoRunFence& fe : cfg_.fences)
        if (fe.label == a) {
          st_.next = fe.num;
          highlight_ = st_.next;
          msg = Tr("Refus dans le double : reprends-le au <b>{0}</b>.", {a});
          break;
        }
    }
    hud("toast", {S(Tr("Refus au {0} · +{1}", {label, jsInt(cfg_.pen)}))});
    if (cad.has) cad.v = 0;
    if (st_.refusals < cfg_.maxRefusals && st_.fenceRefusals < 3) hud("hint", {S(msg), N(3500)});
    return;
  }
  if (st_.finished || st_.eliminated || notStarted()) return;
  if (num == st_.next && dir > 0) {
    if (kind == CsoObstacleEventKind::Clear) {
      st_.log.push_back({label, "clear", "", ""});
      audio("tone", {N(990), N(0.06), S("sine"), N(0.06)});
      feedback(num, true, std::string());
    } else {
      st_.faults += cfg_.rail;
      st_.log.push_back({label, "rail", cause, causeText});
      feedback(num, false, cause);
      audio("fault", {});
      audio("crowdOoh", {});
      hud("toast", {S(Tr("Barre au {0} · +4{1}", {label, causeText.empty() ? std::string() : " · " + causeText}))});
    }
    advance();
  } else if (dir > 0) wrongCourse(num);
}

// courses.js:39-49 (TAKEOFF_TEXT) et :203-211 (feedback).
bool csoTakeoffFeedback(bool cso, const std::string& aid, const CsoLastJump& last, int num, bool clear, const std::string& cause, std::string& key, std::string& kind) {
  if (!cso || aid == "off") return false;
  std::string q = last.has && last.num == num ? last.quality : std::string();
  if (!clear) q = !cause.empty() ? (cause == "short" ? "far" : cause == "fast" ? "far" : cause) : (q == "perfect" || q == "good" ? std::string() : q);
  else if (q == "far") q = "bitFar";
  else if (q == "near" || q == "tooClose") q = "bitNear";
  static const char* const TEXT[][2] = {
      {"perfect", "Appel parfait"}, {"good", "Bon appel"}, {"bitFar", "Un peu loin"}, {"bitNear", "Un peu près"},
      {"far", "Appel trop loin"}, {"near", "Appel trop près"}, {"angle", "Abord en biais"},
      {"slow", "Manque d’impulsion"}, {"tooClose", "Trop près"}};
  for (const auto& e : TEXT)
    if (q == e[0]) {
      key = e[1];
      kind = clear ? (q == "perfect" || q == "good" ? "good" : "ok") : "bad";
      return true;
    }
  return false;
}

void CsoRun::feedback(int num, bool clear, const std::string& cause) {
  std::string key, kind;
  if (csoTakeoffFeedback(true, cfg_.aid, lastJump_, num, clear, cause, key, kind)) hud("jumpFeedback", {S(tr(key.c_str())), S(kind)});
}

bool CsoRun::board(CsoBoard& b) const {
  if (!mode_.board) return false;
  // courses.js hudInfo (:141-154) puis src/ui/hud.js:407-412.
  const double over = std::max(0.0, st_.t - cfg_.timeAllowed);
  const int n = (int)cfg_.fences.size();
  b.started = st_.started;
  b.bell = st_.bell;
  b.t = st_.t;
  b.ta = cfg_.timeAllowed;
  b.pen = points();
  b.over = over > 0;
  b.next = st_.next <= n ? labelOf(st_.next) : std::string("Arrivée");
  b.finished = st_.finished;
  b.eliminated = st_.eliminated;
  b.txt[0] = b.started ? dec(b.t, 2, cfg_.lang) : Tr("Départ {0} s", {jsInt((long long)std::max(0.0, std::ceil(b.bell)))});
  b.txt[1] = b.started ? "/ " + jsInt(b.ta) + " s" : Tr("· accordé {0} s", {jsInt(b.ta)});
  b.txt[2] = b.pen > 1 ? Tr("{0} pts", {jsInt(b.pen)}) : Tr("{0} pt", {jsInt(b.pen)});
  b.txt[3] = b.finished ? tr("Arrivée ✓") : b.next == "Arrivée" ? tr("▸ Arrivée") : "▸ " + b.next;
  return true;
}

}  // namespace strides
