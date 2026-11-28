// Jalon J4 : épreuves des missions cross et derby, concurrents du Grand Prix de Paris (voir Epreuves.h).
#include "StridesCore/Epreuves.h"

#include <algorithm>
#include <cmath>
#include <cstdio>

#include "StridesCore/CsoHorse.h"
#include "StridesCore/MathUtil.h"
#include "StridesCore/MiniJson.h"
#include "StridesCore/Ranking.h"
#include "StridesCore/Text.h"

namespace strides {

double jsRoundHalfUp(double x) {
  double r = std::floor(x);
  if (x - r >= 0.5) r += 1;
  return r;
}

std::string formatMoneyFr(double v) {
  long long n = (long long)jsRoundHalfUp(v);
  const bool neg = n < 0;
  if (neg) n = -n;
  std::string digits = std::to_string(n), out;
  for (size_t i = 0; i < digits.size(); ++i) {
    if (i && (digits.size() - i) % 3 == 0) out += "\xE2\x80\xAF";  // U+202F (toLocaleString fr-FR)
    out += digits[i];
  }
  return (neg ? "-" : "") + out + " €";
}

static double lerpd(double a, double b, double t) { return a + (b - a) * t; }

// ---------- Données ----------
static std::vector<EventDialogLine> linesOf(const J& a) {
  std::vector<EventDialogLine> out;
  for (const J& l : a.a) out.push_back({l["who"].s, l["initials"].s, l["text"].s});
  return out;
}

bool loadMissionEvents(const std::string& text, MissionEvents& out, std::string& err) {
  try {
    const J f = JParser(text).parse();
    const J& c = f["cross"];
    CrossData& X = out.cross;
    X.fences.clear();
    for (const J& o : c["fences"].a) {
      EventFence e;
      e.num = (int)o["num"].num();
      e.label = o["label"].s;
      e.kind = o["kind"].s;
      e.x = o["x"].num(); e.z = o["z"].num(); e.rot = o["rot"].num(); e.h = o["h"].num(); e.w = o["w"].num(); e.s = o["s"].num();
      X.fences.push_back(e);
    }
    X.startX = c["start"]["x"].num(); X.startZ = c["start"]["z"].num(); X.startR = c["start"]["r"].num();
    X.finX = c["finish"]["x"].num(); X.finZ = c["finish"]["z"].num(); X.finW = c["finish"]["w"].num();
    X.timeAllowed = (int)c["timeAllowed"].num(); X.maxRefusals = (int)c["maxRefusals"].num(); X.pen = (int)c["pen"].num();
    X.pay = (int)c["pay"].num(); X.xp = (int)c["xp"].num();
    X.officialX = c["official"]["x"].num(); X.officialZ = c["official"]["z"].num(); X.officialHeading = c["official"]["heading"].num();
    X.intro = linesOf(c["intro"]);
    X.path.clear();
    for (const J& p : c["path"].a) X.path.push_back({p[0].num(), p[1].num()});
    X.pondX = c["pond"]["x"].num(); X.pondZ = c["pond"]["z"].num(); X.pondR = c["pond"]["r"].num();

    const J& r = f["race"];
    RaceData& R = out.race;
    R.hippo.x = r["hippo"]["x"].num(); R.hippo.z = r["hippo"]["z"].num(); R.hippo.half = r["hippo"]["half"].num();
    R.hippo.radius = r["hippo"]["radius"].num(); R.hippo.width = r["hippo"]["width"].num();
    R.startS = r["startS"].num(); R.total = r["total"].num(); R.finishS = r["finishS"].num();
    R.meetX = r["meet"]["x"].num(); R.meetZ = r["meet"]["z"].num(); R.meetR = r["meet"]["r"].num();
    R.rivals.clear(); R.silks.clear(); R.coats.clear(); R.stalls.clear(); R.base.clear(); R.payPos.clear();
    for (const J& s : r["rivals"].a) R.rivals.push_back(s.s);
    for (const J& s : r["silks"].a) R.silks.push_back(s.s);
    for (const J& s : r["coats"].a) R.coats.push_back(s.s);
    for (const J& s : r["stalls"].a) R.stalls.push_back((int)s.num());
    for (const J& s : r["base"].a) R.base.push_back(s.num());
    for (const J& s : r["payPos"].a) R.payPos.push_back((int)s.num());
    R.playerStall = (int)r["playerStall"].num();
    R.gallop = r["gallop"].num();
    R.timeLimit = r["timeLimit"].num();
    R.xp = (int)r["xp"].num();
    R.pay = R.payPos.empty() ? 420 : R.payPos[0];
    R.intro = linesOf(r["intro"]);

    const J& p = f["paris"];
    ParisData& P = out.paris;
    P.riders = (int)p["riders"].num();
    P.prizes.clear();
    for (const J& v : p["prizes"].a) P.prizes.push_back((int)v.num());
    P.sprintPrize = (int)p["sprintPrize"].num();
    P.gpHour = (int)p["gpHour"].num();
    P.sprintH = p["sprint"]["h"].num(); P.sprintTa = (int)p["sprint"]["ta"].num(); P.railSeconds = p["sprint"]["railSeconds"].num();
    P.gpH = p["gp"]["h"].num(); P.gpTa = (int)p["gp"]["ta"].num(); P.joTa = (int)p["joTa"].num();
    P.sprintLength = p["sprintLength"].num(); P.gpLength = p["gpLength"].num();
    P.firstNames.clear(); P.lastNames.clear(); P.horseNames.clear();
    for (const J& v : p["firstNames"].a) P.firstNames.push_back(v.s);
    for (const J& v : p["lastNames"].a) P.lastNames.push_back(v.s);
    for (const J& v : p["horseNames"].a) P.horseNames.push_back(v.s);
    if (X.fences.size() != 10 || R.rivals.size() != 5 || R.stalls.size() != 5 || R.base.size() != 5) { err = "mission_events.json incomplet"; return false; }
    return true;
  } catch (const std::exception& e) {
    err = e.what();
    return false;
  }
}

// ---------- Hippodrome ----------
double stallRadius(const Hippo& h, int k) { return h.radius + h.width / 2 - (h.width / 8) * (k + 0.5); }
double ovalLength(const Hippo& h, double r) { return 4 * h.half + 2 * kPi * r; }
void ovalPoint(const Hippo& h, double s, double r, double& x, double& z) {
  const double L = h.half * 2, arc = kPi * r, total = 2 * L + 2 * arc;
  double d = std::fmod(std::fmod(s, total) + total, total);
  if (d < L) { x = h.x - h.half + d; z = h.z - r; return; }
  d -= L;
  if (d < arc) { const double a = -kPi / 2 + d / r; x = h.x + h.half + std::cos(a) * r; z = h.z + std::sin(a) * r; return; }
  d -= arc;
  if (d < L) { x = h.x + h.half - d; z = h.z + r; return; }
  d -= L;
  const double a = kPi / 2 + d / r;
  x = h.x - h.half + std::cos(a) * r;
  z = h.z + std::sin(a) * r;
}
void ovalProject(const Hippo& h, double x, double z, double& s, double& off) {
  const double R = h.radius, L = h.half * 2, arc = kPi * R, lx = x - h.x, lz = z - h.z;
  if (std::fabs(lx) <= h.half) {
    if (lz < 0) { s = lx + h.half; off = -lz - R; return; }
    s = L + arc + (h.half - lx); off = lz - R; return;
  }
  if (lx > h.half) {
    const double a = std::atan2(lz, lx - h.half);
    s = L + (a + kPi / 2) * R; off = jsHypot(lx - h.half, lz) - R; return;
  }
  double a = std::atan2(lz, lx + h.half);
  if (a < 0) a += kPi * 2;
  s = 2 * L + arc + (a - kPi / 2) * R;
  off = jsHypot(lx + h.half, lz) - R;
}

// ---------- Chevaux menés par l'IA ----------
void pathAiUpdate(RaceRival& h, double v, double lookahead) {
  if (h.pathDone) { h.mag = 0; h.hasOverride = true; h.speedOverride = 0; return; }
  if (h.pts.empty()) return;
  auto p = h.pts[(size_t)h.pathI];
  const double d = jsHypot(p.first - h.x, p.second - h.z);
  if (d < lookahead) {
    h.pathI++;
    if (h.pathI >= (int)h.pts.size()) { h.pathDone = true; h.pathI = (int)h.pts.size() - 1; }
    p = h.pts[(size_t)h.pathI];
  }
  // steer(h, p, 1)
  const double dx = p.first - h.x, dz = p.second - h.z;
  double dd = jsHypot(dx, dz);
  if (dd == 0) dd = 1;
  h.cx = dx / dd;
  h.cz = dz / dd;
  h.mag = 1;
  h.hasOverride = true;
  h.speedOverride = v;
}

void aiHorseStep(RaceRival& h, double dt) {
  double desired = 0;
  if (!h.frozen && h.mag > 0.12) {
    const double desiredHeading = std::atan2(h.cx, h.cz);
    const double diff = wrapAngle(desiredHeading - h.heading);
    desired = h.hasOverride ? h.speedOverride : 0;
    const double sp01 = clampd(h.speed / 16, 0, 1);
    const double rate = lerpd(2.8, 1.45, sp01);
    if (std::fabs(diff) > 2.3 && h.speed < 3) desired = std::min(desired, 1.2);
    const double step = clampd(diff, -rate * dt, rate * dt);
    h.heading = wrapAngle(h.heading + step);
    desired *= 1 - smoothstep(1.3, 2.7, std::fabs(diff)) * 0.75;
  }
  const double acc = desired > h.speed ? (h.speed < 5 ? 4.5 : 3.6) : 9;
  h.speed = h.speed + clampd(desired - h.speed, -acc * dt, acc * dt);
  h.x += std::sin(h.heading) * h.speed * dt;
  h.z += std::cos(h.heading) * h.speed * dt;
}

// ---------- Déroulé ----------
EventRun::EventRun(Kind k, const MissionEvents& data, const std::string& playerName, std::vector<double> rivalBase, double seed)
    : kind_(k), d_(data), playerName_(playerName), rivalBase_(std::move(rivalBase)), seed_(seed) {
  if (k == Kind::Cross) steps_ = {Step::Goto, Step::Dialog, Step::Elan, Step::Countdown, Step::XcCourse, Step::XcResult};
  else steps_ = {Step::Goto, Step::Dialog, Step::RaceSetup, Step::Countdown, Step::Race, Step::RaceAfter};
  race_.prog = race_.lastS = d_.race.startS;
}

void EventRun::begin() { next(); }

void EventRun::hud(const char* fn, std::vector<CsoArg> a) { hud_.push_back({fn, std::move(a)}); }
void EventRun::audio(const char* fn, std::vector<CsoArg> a) { audio_.push_back({fn, std::move(a)}); }
std::vector<CsoCall> EventRun::takeHud() { std::vector<CsoCall> o; o.swap(hud_); return o; }
std::vector<CsoCall> EventRun::takeAudio() { std::vector<CsoCall> o; o.swap(audio_); return o; }
bool EventRun::takeTeleport(double& x, double& z, double& h) {
  if (!teleport_) return false;
  teleport_ = false;
  x = tpX_; z = tpZ_; h = tpH_;
  return true;
}

EventRun::Step EventRun::step() const { return i_ >= 0 && i_ < (int)steps_.size() ? steps_[(size_t)i_] : Step::Goto; }
const char* EventRun::stepKindName() const {
  if (i_ < 0 || i_ >= (int)steps_.size()) return "end";
  switch (steps_[(size_t)i_]) {
    case Step::Goto: return "goto";
    case Step::Dialog: return "dialog";
    case Step::Countdown: return "countdown";
    case Step::XcCourse: return "course";
    case Step::Race: return "race";
    default: return finished_ ? "end" : "";  // (oracle : genre vide d'une étape « custom » relevé « end » une fois finie)
  }
}

void EventRun::closeDialog() {
  if (!dialogOpen_) return;
  dialogOpen_ = false;
  dlg_ = true;
}

std::string EventRun::xcLabel(int num) const {
  for (const EventFence& f : d_.cross.fences) if (f.num == num) return f.label;
  return "";
}

int EventRun::points() const {
  const double over = std::max(0.0, xc_.t - d_.cross.timeAllowed);
  return xc_.faults + (int)jsRoundHalfUp(over * 0.4);
}

bool EventRun::board(CsoBoard& b) const {
  if (kind_ != Kind::Cross || finished_ || i_ < 0 || i_ >= (int)steps_.size() || steps_[(size_t)i_] != Step::XcCourse) return false;
  const int n = (int)d_.cross.fences.size();
  b.started = xc_.started;
  b.bell = 0;
  b.t = xc_.t;
  b.ta = d_.cross.timeAllowed;
  b.pen = points();
  b.over = xc_.t > d_.cross.timeAllowed;
  b.next = xc_.next <= n ? xcLabel(xc_.next) : std::string("Arrivée");
  b.finished = xc_.finished;
  b.eliminated = !xc_.eliminated.empty();
  b.txt[0] = dec(b.t, 2, Lang::Fr);
  b.txt[1] = "/ " + jsInt(b.ta) + " s";
  b.txt[2] = jsInt(b.pen) + (b.pen > 1 ? " pts" : " pt");
  b.txt[3] = b.finished ? "Arrivée ✓" : b.next == "Arrivée" ? "▸ Arrivée" : "▸ " + b.next;
  return true;
}

int EventRun::racePosition() const {
  int n = 1;
  for (const RaceRival& r : rivals_) n += r.prog > race_.prog ? 1 : 0;
  return n;
}

bool EventRun::target(double& x, double& z) const {
  if (finished_ || i_ < 0 || i_ >= (int)steps_.size()) return false;
  switch (steps_[(size_t)i_]) {
    case Step::Goto:
      if (kind_ == Kind::Cross) { x = d_.cross.startX; z = d_.cross.startZ; }
      else { x = d_.race.meetX; z = d_.race.meetZ; }
      return true;
    case Step::XcCourse: {
      if (xc_.finished) return false;
      if (xc_.next >= 1 && xc_.next <= (int)d_.cross.fences.size()) {
        const EventFence& o = d_.cross.fences[(size_t)xc_.next - 1];
        x = o.x - std::sin(o.rot) * 7;
        z = o.z - std::cos(o.rot) * 7;
      } else { x = d_.cross.finX; z = d_.cross.finZ; }
      return true;
    }
    default: return false;
  }
}

// missions.js makeSteps withDist / far / modeHint.
static std::string withDist(const std::string& txt, double d) {
  if (d >= 1000) return txt + " · " + dec(d / 1000, 1, Lang::Fr) + " km";
  return txt + " · " + jsInt((long long)(jsRoundHalfUp(d / 10) * 10)) + " m";
}

std::string EventRun::text() const {
  if (finished_ || i_ < 0 || i_ >= (int)steps_.size()) return "";
  switch (steps_[(size_t)i_]) {
    case Step::Goto: {
      const double gx = kind_ == Kind::Cross ? d_.cross.startX : d_.race.meetX, gz = kind_ == Kind::Cross ? d_.cross.startZ : d_.race.meetZ;
      const double r = kind_ == Kind::Cross ? d_.cross.startR : d_.race.meetR;
      const std::string txt = kind_ == Kind::Cross ? "Rejoins le départ du cross" : "Rejoins la piste de l’hippodrome (ligne droite des tribunes)";
      const double dd = jsHypot(cur_.focusX - gx, cur_.focusZ - gz);
      if (dd > std::max(45.0, r + 30)) return withDist(txt, dd);
      if (!cur_.riding) {
        if (cur_.driving) return cur_.vehicle && !cur_.inTruck ? "Sors du véhicule puis monte à cheval." : "Sors du camion puis monte à cheval.";
        return "Monte sur ton cheval (siffle-le si besoin).";
      }
      return txt;
    }
    case Step::Dialog: return "…";
    case Step::Elan: return "Prends ton élan…";
    case Step::Countdown: return "Prépare-toi…";
    case Step::XcCourse: {
      if (!xc_.eliminated.empty()) return "Éliminé";
      if (xc_.finished) return "";
      if (xc_.next >= 1 && xc_.next <= (int)d_.cross.fences.size())
        return "Obstacle n°" + xcLabel(xc_.next) + " sur " + jsInt((long long)d_.cross.fences.size());
      return "Passe la ligne d’arrivée !";
    }
    case Step::XcResult: return "";
    case Step::RaceSetup: return "Place-toi dans les stalles…";
    case Step::Race:
      if (race_.offTrack) return "Reste sur la piste !";
      return "Position " + jsInt(racePosition()) + "/6 · Termine dans le top 3";
    case Step::RaceAfter: return "Ralentis après la ligne";
  }
  return "";
}

void EventRun::next() {
  if (i_ >= 0 && i_ < (int)steps_.size()) endStep();
  hud("clearHint", {});
  i_++;
  stepT_ = 0;
  if (i_ >= (int)steps_.size()) { complete(); return; }
  startStep();
}

void EventRun::startStep() {
  switch (steps_[(size_t)i_]) {
    case Step::Dialog: {
      dlg_ = false;
      locked_ = true;
      dialogLines_ = kind_ == Kind::Cross ? d_.cross.intro : d_.race.intro;
      dialogOpen_ = true;
      std::vector<CsoArg> a;
      for (const EventDialogLine& l : dialogLines_) a.push_back(S(l.who + "|" + l.initials + "|" + l.text));
      hud("dialog", a);
      break;
    }
    case Step::Elan:
      highlight_ = 1;  // ob.resetRails('xc'), ob.highlight('xc', 1)
      audio("cheer", {});
      break;
    case Step::Countdown:
      cd_ = 3.6;
      cdShown_ = 4;
      locked_ = true;
      break;
    case Step::XcCourse:
      xc_.running = true;
      xc_.started = true;  // cross : pas de ligne de départ
      courseOn_ = true;
      hud("hint", {S("Appuie sur <b>SAUT</b> quand le bouton est <b>vert</b>."), N(4000)});
      break;
    case Step::XcResult: {
      const int total = xc_.faults + xc_.timeFaults;
      resultBody_ = "Pénalités : " + jsInt(total) + " · Chrono " + jsInt((long long)jsRoundHalfUp(xc_.t)) + " s";
      break;
    }
    case Step::RaceSetup:
      setup_ = false;
      raceSetup();  // game.fade(setup) : appelé tout de suite (le fondu au noir du web n'est pas porté)
      setup_ = true;
      break;
    case Step::Race:
      race_.started = true;
      for (RaceRival& r : rivals_) r.frozen = false;
      audio("cheer", {});
      hud("hint", {S("Maintiens <b>BOOST</b> par à-coups : l’endurance se recharge au galop normal."), N(5000)});
      race_.finishPos = 0;
      break;
    default: break;
  }
}

void EventRun::endStep() {
  switch (steps_[(size_t)i_]) {
    case Step::Dialog: locked_ = false; break;
    case Step::Countdown: locked_ = false; break;
    case Step::XcCourse: {
      highlight_ = -1;
      courseOn_ = false;
      xc_.running = false;
      hud("_nextNotif", {});
      const double over = std::max(0.0, xc_.t - d_.cross.timeAllowed);
      xc_.timeFaults = (int)jsRoundHalfUp(over * 0.4);
      resultTime_ = xc_.t;
      break;
    }
    default: break;
  }
}

void EventRun::raceSetup() {
  const RaceData& R = d_.race;
  double spx, spz;
  ovalPoint(R.hippo, R.startS, R.hippo.radius, spx, spz);
  Mulberry32 rnd(seed_);
  rivals_.clear();
  for (size_t i = 0; i < R.rivals.size(); ++i) {
    RaceRival r;
    r.name = R.rivals[i];
    const double lane = stallRadius(R.hippo, R.stalls[i]);
    r.x = spx;
    r.z = R.hippo.z - lane;
    r.heading = kPi / 2;
    r.frozen = true;
    const double laneR = R.hippo.radius + ((double)i - 2) * 1.6;
    for (int k = 0; k <= 64; ++k) {
      double px, pz;
      ovalPoint(R.hippo, R.startS + 12 + ((double)k / 64) * (R.total + 60), laneR, px, pz);
      r.pts.push_back({px, pz});
    }
    const double draw = rnd.next();
    r.base = i < rivalBase_.size() ? rivalBase_[i] : R.base[i] * R.gallop * (0.98 + draw * 0.04);
    r.prog = r.lastS = R.startS;
    rivals_.push_back(r);
  }
  teleport_ = true;
  tpX_ = spx;
  tpZ_ = R.hippo.z - stallRadius(R.hippo, R.playerStall);
  tpH_ = kPi / 2;
}

void EventRun::moveRivals(double dt) {
  const RaceData& R = d_.race;
  for (RaceRival& r : rivals_) {
    double v = 0;
    if (race_.started) {
      const double lead = r.prog - race_.prog;
      double k = 1;
      if (lead > 45) k = 0.9;
      else if (lead < -45) k = 1.06;
      const double surge = r.prog > R.finishS - 220 ? 1.06 : 1;
      v = r.base * k * surge;
    }
    pathAiUpdate(r, v, 7);
    aiHorseStep(r, dt);
  }
}

bool EventRun::progress(double x, double z, double speed, double& prog, double& lastS, double dt) const {
  const RaceData& R = d_.race;
  double s, off;
  ovalProject(R.hippo, x, z, s, off);
  double ds = s - std::fmod(lastS, R.total);
  if (ds < -R.total / 2) ds += R.total;
  if (ds > R.total / 2) ds -= R.total;
  lastS = lastS + ds;
  const bool onTrack = std::fabs(off) < R.hippo.width / 2 + 2.5;
  if (onTrack && ds > 0) prog += std::min(ds, (speed + 2) * dt * 1.3);
  return onTrack;
}

void EventRun::obstacleEvent(CsoObstacleEventKind k, int num, int dir, const std::string& cause, const std::string& causeText, CsoCadence& cad) {
  (void)cause;
  if (kind_ != Kind::Cross || finished_ || i_ < 0 || i_ >= (int)steps_.size() || steps_[(size_t)i_] != Step::XcCourse) return;
  if (xc_.finished || !xc_.eliminated.empty()) return;
  const int n = (int)d_.cross.fences.size();
  auto advance = [&] {
    xc_.next++;
    xc_.fenceRefusals = 0;
    highlight_ = xc_.next <= n ? xc_.next : -1;
  };
  auto wrongCourse = [&](int o) {
    if (std::find(xc_.wrong.begin(), xc_.wrong.end(), o) != xc_.wrong.end()) return;
    xc_.wrong.push_back(o);
    audio("fault", {});
    const std::string exp = xcLabel(xc_.next);
    hud("toast", {S("Erreur de parcours : ce n’est pas le " + exp)});
    hud("hint", {S("Erreur de parcours : saute l’obstacle <b>" + exp + "</b> (repère vert)."), N(3500)});
  };
  if (k == CsoObstacleEventKind::Clear) {
    if (num == xc_.next && dir > 0) {
      xc_.log.push_back({xcLabel(num), "clear", "", ""});
      audio("tone", {N(990), N(0.06), S("sine"), N(0.06)});
      advance();
    } else if (dir > 0) wrongCourse(num);
  } else if (k == CsoObstacleEventKind::Fault) {
    if (num == xc_.next && dir > 0) {
      xc_.faults += 4;
      xc_.log.push_back({xcLabel(num), "rail", cause, causeText});
      audio("fault", {});
      audio("crowdOoh", {});
      hud("toast", {S("Touché au " + xcLabel(num) + " · +4" + (causeText.empty() ? std::string() : " · " + causeText))});
      advance();
    } else if (dir > 0) wrongCourse(num);
  } else {
    if (!xc_.started || dir < 0 || num != xc_.next) return;
    xc_.refusals++;
    xc_.fenceRefusals++;
    xc_.faults += d_.cross.pen;
    xc_.log.push_back({xcLabel(num), "refusal", "", ""});
    audio("fault", {});
    audio("crowdOoh", {});
    hud("toast", {S("Refus au " + xcLabel(num) + " · +" + jsInt(d_.cross.pen))});
    if (cad.has) cad.v = 0;
    if (xc_.refusals < d_.cross.maxRefusals && xc_.fenceRefusals < 3)
      hud("hint", {S("Fais une <b>volte</b> pour reprendre ton élan, puis représente l’obstacle."), N(3500)});
  }
}

bool EventRun::xcUpdate(double dt, std::string& fail) {
  const double px = cur_.x, pz = cur_.z;
  hasPrev_ = true;
  prevX_ = px;
  prevZ_ = pz;
  if (xc_.started && !xc_.finished) xc_.t += dt;
  if (xc_.finished) return true;
  auto out = [&](const std::string& reason) {
    audio("bell", {N(2)});
    hud("big", {S("ÉLIMINÉ"), S(reason), N(2600)});
    fail = reason;
    return false;
  };
  const CrossData& X = d_.cross;
  if (!cur_.riding) return out("Tu es descendu de cheval : éliminé.");
  if (xc_.refusals >= X.maxRefusals) return out(nth(X.maxRefusals, Lang::Fr) + " refus : éliminé du parcours.");
  if (xc_.fenceRefusals >= 3) return out("3e refus sur le même obstacle : éliminé du parcours.");
  if (xc_.t > X.timeAllowed * 2) return out("Temps limite dépassé : éliminé.");
  if (xc_.started && xc_.next > (int)X.fences.size()) {
    if (jsHypot(px - X.finX, pz - X.finZ) < X.finW) {
      xc_.finished = true;
      courseOn_ = false;
      const double over = std::max(0.0, xc_.t - X.timeAllowed);
      const int pts = xc_.faults + (int)jsRoundHalfUp(over * 0.4);
      audio("applause", {N(pts == 0 ? 1.3 : 0.55), N(pts == 0 ? 4 : 2.6)});
      if (pts == 0) audio("cheer", {});
      hud("big", {S(pts == 0 ? std::string("SANS FAUTE !") : jsInt(pts) + (pts > 1 ? " POINTS" : " POINT")), S(dec(xc_.t, 2, Lang::Fr) + " s"), N(2600)});
      return true;
    }
  }
  return false;
}

bool EventRun::raceUpdate(double dt, std::string& fail) {
  const RaceData& R = d_.race;
  race_.t += dt;
  if (!cur_.riding) { fail = "Tu es descendu de cheval."; return false; }
  const bool onTrack = progress(cur_.x, cur_.z, cur_.speed, race_.prog, race_.lastS, dt);
  race_.offTrack = !onTrack;
  for (RaceRival& r : rivals_) {
    progress(r.x, r.z, r.speed, r.prog, r.lastS, dt);
    if (!r.finished && r.prog >= R.finishS) {
      r.finished = true;
      race_.order.push_back(r.name);
    }
  }
  if (!race_.finished && race_.prog >= R.finishS) {
    race_.finished = true;
    race_.order.push_back("player");
    race_.finishPos = (int)race_.order.size();
    resultTime_ = race_.t;
    audio("cheer", {});
    return true;
  }
  if (race_.t > R.timeLimit) { fail = "Course terminée sans toi…"; return false; }
  return false;
}

int EventRun::updateStep(double dt) {
  std::string why;
  switch (steps_[(size_t)i_]) {
    case Step::Goto: {
      const double gx = kind_ == Kind::Cross ? d_.cross.startX : d_.race.meetX, gz = kind_ == Kind::Cross ? d_.cross.startZ : d_.race.meetZ;
      const double r = kind_ == Kind::Cross ? d_.cross.startR : d_.race.meetR;
      return jsHypot(cur_.focusX - gx, cur_.focusZ - gz) < r && cur_.riding ? 1 : 0;
    }
    case Step::Dialog: return dlg_ ? 1 : 0;
    case Step::Elan: return 1;
    case Step::Countdown: {
      cd_ -= dt;
      const int n = (int)std::ceil(cd_ - 0.6);
      if (n != cdShown_) {
        cdShown_ = n;
        if (n > 0) {
          hud("big", {S(jsInt(n)), S(""), N(700)});
          audio("tone", {N(660), N(0.12), S("sine"), N(0.12)});
        } else {
          hud("big", {S("PARTEZ !"), S(""), N(900)});
          audio("tone", {N(1320), N(0.3), S("sine"), N(0.14)});
        }
      }
      return cd_ <= 0.6 ? 1 : 0;
    }
    case Step::XcCourse:
      if (xcUpdate(dt, why)) return 1;
      if (!why.empty()) { failReason_ = why; return 2; }
      return 0;
    case Step::XcResult: return 1;
    case Step::RaceSetup: return setup_ && stepT_ > 1.2 ? 1 : 0;
    case Step::Race:
      if (raceUpdate(dt, why)) return 1;
      if (!why.empty()) { failReason_ = why; return 2; }
      return 0;
    case Step::RaceAfter: {
      const int pos = race_.finishPos;
      const int base = d_.race.pay;
      hasPayOverride_ = true;
      payOverride_ = pos >= 1 && pos <= 3 ? (pos == 1 ? base : pos == 2 ? (int)jsRoundHalfUp(base * 250.0 / 420) : (int)jsRoundHalfUp(base * 150.0 / 420)) : 0;
      resultTitle_ = pos == 1 ? "Victoire !" : pos == 2 ? "2e place" : pos == 3 ? "3e place" : jsInt(pos) + "e place";
      if (pos > 3) { failReason_ = "Tu termines " + nth(pos, Lang::Fr) + ". Il faut finir dans le top 3."; return 2; }
      return stepT_ > 1.5 ? 1 : 0;
    }
  }
  return 0;
}

void EventRun::update(const EventFrame& f, CsoCadence& cad) {
  (void)cad;
  cur_ = f;
  if (kind_ == Kind::Race) moveRivals(f.dt);
  if (finished_) return;
  t_ += f.dt;
  stepT_ += f.dt;
  if (i_ < 0 || i_ >= (int)steps_.size()) return;
  const int r = updateStep(f.dt);
  if (finished_) return;
  if (r == 2) { fail(failReason_); return; }
  if (r == 1) next();
}

void EventRun::cleanup() {
  if (i_ >= 0 && i_ < (int)steps_.size()) endStep();
  locked_ = false;
  courseOn_ = false;
  hud("clearHint", {});
  hud("closeDialog", {});
  dialogOpen_ = false;
}

void EventRun::fail(const std::string& reason) {
  if (finished_) return;
  finished_ = true;
  failed_ = true;
  failReason_ = reason;
  cleanup();
}

void EventRun::complete() {
  if (finished_) return;
  finished_ = true;
  completed_ = true;
  // def.rate (story.js : cross :566, derby :677).
  double rate = 5;
  if (kind_ == Kind::Cross) {
    const int p = xc_.faults + xc_.timeFaults;
    rate = p == 0 ? 5 : p <= 8 ? 4 : p <= 24 ? 3 : 2;
  } else {
    const int pos = race_.finishPos;
    rate = pos >= 1 && pos <= 4 ? (double)std::vector<int>{5, 5, 4, 3}[(size_t)pos - 1] : 2;
  }
  stars_ = (int)std::max(1.0, std::min(5.0, jsRoundHalfUp(rate)));
  int pay = hasPayOverride_ ? payOverride_ : (kind_ == Kind::Cross ? d_.cross.pay : d_.race.pay);
  tip_ = stars_ == 5 && pay > 0 ? (int)jsRoundHalfUp(pay * 0.1) : 0;
  pay_ = pay + tip_;
  xp_ = kind_ == Kind::Cross ? d_.cross.xp : d_.race.xp;
  cleanup();
  if (tip_) hud("toast", {S("Pourboire 5★ : +" + formatMoneyFr(tip_)), S("money")});
}

void staminaStep(HorseStamina& s, double speed, double dt) {
  // HORSE.gallopDrain = 7, staminaRegen = 9 (config.js) ; GAIT_EDGES.canter = 10,5 (horse/anim.js) ; SPEEDS[3] = 6,5.
  if (speed > 10.5) {
    s.v -= 7 * dt;
    if (s.v <= 0) { s.v = 0; s.exhausted = true; }
  } else {
    const double regen = 9 * (speed < 5 ? 1.5 : speed > 6.5 + 0.6 ? 0.5 : 1.0);
    s.v = std::min(s.max, s.v + regen * dt);
    if (s.exhausted && s.v > s.max * 0.35) s.exhausted = false;
  }
}

// ---------- Grand Prix de Paris ----------
std::vector<ParisRival> parisRivals(const ParisData& p, double seed) {
  Mulberry32 rnd(seed);
  std::vector<ParisRival> out;
  const int n = p.riders - 1;
  for (int i = 0; i < n; ++i) {
    const std::string& first = p.firstNames[(size_t)std::floor(rnd.next() * p.firstNames.size())];
    const std::string& last = p.lastNames[(size_t)std::floor(rnd.next() * p.lastNames.size())];
    ParisRival r;
    r.rider = first + ". " + last;
    const long long hi = ((long long)i * 7 + (long long)seed) % (long long)p.horseNames.size();
    r.horse = p.horseNames[(size_t)hi];
    r.form = 0.85 + rnd.next() * 0.3;
    out.push_back(r);
  }
  return out;
}

std::vector<ParisSprint> sprintField(const ParisData& p, const std::vector<ParisRival>& rivals, double seed) {
  Mulberry32 rnd(seed + 101);
  std::vector<ParisSprint> out;
  for (const ParisRival& r : rivals) {
    const double x = rnd.next();
    ParisSprint s;
    s.rails = x < 0.56 ? 0 : x < 0.86 ? 1 : 2;
    const double a = rnd.next(), b = rnd.next();
    s.time = jsRoundHalfUp(((p.sprintLength / 7.0) * (1 + (a + b - 1) * 0.04) / std::pow(r.form, 0.3)) * 100) / 100;
    s.score = jsRoundHalfUp((s.time + s.rails * p.railSeconds) * 100) / 100;
    out.push_back(s);
  }
  return out;
}

std::vector<int> rankSprint(const std::vector<double>& scores) {
  std::vector<int> idx(scores.size());
  for (size_t i = 0; i < idx.size(); ++i) idx[i] = (int)i;
  std::stable_sort(idx.begin(), idx.end(), [&](int a, int b) { return scores[(size_t)a] < scores[(size_t)b]; });
  return idx;
}

std::vector<ParisGpRow> gpField(const ParisData& p, const std::vector<ParisRival>& rivals, double seed) {
  Mulberry32 rnd(seed + 202);
  std::vector<ParisGpRow> out;
  const double ta = p.gpTa;
  for (const ParisRival& r : rivals) {
    const double x = rnd.next() / r.form;
    const int faults = x < 0.24 ? 0 : x < 0.62 ? 4 : x < 0.86 ? 8 : 12;
    const double a = rnd.next(), b = rnd.next();
    const double t = jsRoundHalfUp((ta * (0.93 + (a + b - 1) * 0.05)) * 100) / 100;
    const int tf = (int)std::max(0.0, std::ceil(t - ta - 1e-9));
    out.push_back({faults + tf, t});
  }
  return out;
}

std::vector<ParisJoRow> barrageField(const ParisData& p, size_t nClear, double seed) {
  Mulberry32 rnd(seed + 303);
  std::vector<ParisJoRow> out;
  for (size_t i = 0; i < nClear; ++i) {
    const double x = rnd.next();
    const int faults = x < 0.62 ? 0 : x < 0.92 ? 4 : 8;
    const double a = rnd.next(), b = rnd.next();
    out.push_back({faults, jsRoundHalfUp((p.gpLength / 7.2) * (1 + (a + b - 1) * 0.04) * 100) / 100});
  }
  return out;
}

}  // namespace strides
