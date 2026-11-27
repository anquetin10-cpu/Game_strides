// Jalon J3 (correction) : missions de l'histoire du web (voir Career.h).
#include "StridesCore/Career.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <stdexcept>

#include "StridesCore/MiniJson.h"

namespace strides {

const StoryMission* StoryData::find(const std::string& id) const {
  for (const StoryMission& m : missions)
    if (m.id == id) return &m;
  return nullptr;
}

bool CareerState::done(const std::string& id) const { return std::find(completed.begin(), completed.end(), id) != completed.end(); }

static std::string str(const J& v) { return v.t == J::Str ? v.s : std::string(); }
static int integer(const J& v) { return v.t == J::Num ? (int)std::lround(v.n) : 0; }

bool loadStory(const std::string& text, StoryData& out, std::string& err) {
  try {
    const J root = JParser(text).parse();
    if (str(root["schema"]) != "strides.story.v1") { err = "schéma inattendu"; return false; }
    out = StoryData();
    for (const J& t : root["tiers"].a) out.tiers.push_back({integer(t["xp"]), str(t["title"]), str(t["short"])});
    for (const J& o : root["missions"].a) {
      StoryMission m;
      m.id = str(o["id"]); m.title = str(o["title"]); m.category = str(o["category"]); m.place = str(o["place"]);
      m.placeName = str(o["placeName"]); m.payLabel = str(o["payLabel"]); m.choice = str(o["choice"]);
      m.timeoutText = str(o["timeoutText"]);
      m.level = std::max(1, integer(o["level"])); m.pay = integer(o["pay"]); m.xp = integer(o["xp"]); m.cost = integer(o["cost"]);
      m.full = o["full"].t == J::Bool && o["full"].b;
      m.upcoming = str(o["upcoming"]);
      for (const J& r : o["requires"].a) m.prereqs.push_back(str(r));
      for (const J& r : o["skipped"].a) m.skipped.push_back(str(r));
      for (const J& st : o["route"].a) {
        MissionStep s;
        s.kind = str(st["kind"]); s.text = str(st["text"]);
        s.x = st["x"].num(); s.z = st["z"].num(); s.r = st["r"].num();
        if (st["timer"].t == J::Num) s.timer = st["timer"].n;
        s.stopTimer = st["stopTimer"].t == J::Bool && st["stopTimer"].b;
        if (st["maxPenalties"].t == J::Num) s.maxPenalties = integer(st["maxPenalties"]);
        if (st["beat"].t == J::Obj) { s.beatFaults = integer(st["beat"]["faults"]); s.beatTime = st["beat"]["time"].num(); s.beatName = str(st["beat"]["name"]); }
        s.event = str(st["event"]);
        if (s.kind != "goto" && s.kind != "course" && s.kind != "event") { err = "étape inconnue dans " + m.id; return false; }
        if (s.kind == "event" && s.event != "cross" && s.event != "derby") { err = "épreuve inconnue dans " + m.id; return false; }
        m.route.push_back(s);
      }
      if (m.id.empty() || m.route.empty()) { err = "mission sans identifiant ou sans itinéraire"; return false; }
      out.missions.push_back(m);
    }
    if (out.tiers.empty() || out.missions.empty()) { err = "données vides"; return false; }
    return true;
  } catch (const std::exception& e) {
    err = e.what();
    return false;
  }
}

TierInfo reputationTier(const StoryData& d, int points) {
  TierInfo r;
  if (d.tiers.empty()) return r;
  const int p = std::max(0, points);
  for (size_t i = 0; i < d.tiers.size(); ++i)
    if (p >= d.tiers[i].xp) r.index = (int)i;
  r.level = r.index + 1;
  r.tier = &d.tiers[(size_t)r.index];
  r.next = (size_t)r.index + 1 < d.tiers.size() ? &d.tiers[(size_t)r.index + 1] : nullptr;
  r.progress = r.next ? std::clamp((double)(p - r.tier->xp) / (double)(r.next->xp - r.tier->xp), 0.0, 1.0) : 1.0;
  return r;
}

bool storyAvailable(const CareerState& s, const StoryMission& m) {
  if (s.done(m.id)) return false;
  for (const std::string& r : m.prereqs)
    if (!s.done(r)) return false;
  return true;
}

AcceptResult acceptMission(const StoryData& d, CareerState& s, const std::string& id) {
  const StoryMission* m = d.find(id);
  if (!m || !storyAvailable(s, *m)) return AcceptResult::Unknown;
  if (m->level > reputationTier(d, s.reputation).level) return AcceptResult::Locked;
  if (!m->upcoming.empty()) return AcceptResult::Upcoming;  // choix n° 25
  if (!s.active.empty()) return AcceptResult::Busy;
  if (m->cost > s.credits) return AcceptResult::Funds;
  s.active = m->id;
  s.checkpoint = m->id;
  s.step = 0;
  s.timeLeft = m->route[0].timer > 0 ? m->route[0].timer : -1;
  return AcceptResult::Ok;
}

const MissionStep* currentStep(const StoryData& d, const CareerState& s) {
  const StoryMission* m = s.active.empty() ? nullptr : d.find(s.active);
  if (!m || s.step < 0 || (size_t)s.step >= m->route.size()) return nullptr;
  return &m->route[(size_t)s.step];
}

bool advanceStep(const StoryData& d, CareerState& s, double x, double z, bool courseFinishedSinceStep) {
  CourseOutcome c;
  c.finished = courseFinishedSinceStep;
  std::string why;
  return updateStep(d, s, x, z, c, 0, why) == StepUpdate::Advanced;
}

void failMission(CareerState& s) {
  if (s.checkpoint == s.active) s.checkpoint.clear();
  s.active.clear();
  s.step = 0;
  s.timeLeft = -1;
}

static std::string fmt1(double v) {
  char b[32];
  std::snprintf(b, sizeof b, "%.1f", v);
  std::string r = b;
  for (char& ch : r) if (ch == '.') ch = ',';
  return r;
}

StepUpdate updateStep(const StoryData& d, CareerState& s, double x, double z, const CourseOutcome& course, double dt, std::string& failText) {
  const StoryMission* m = s.active.empty() ? nullptr : d.find(s.active);
  const MissionStep* st = currentStep(d, s);
  if (!m || !st) return StepUpdate::None;
  if (s.timeLeft >= 0 && dt > 0) {
    s.timeLeft -= dt;
    if (s.timeLeft <= 0) {
      failText = m->timeoutText.empty() ? std::string("Temps écoulé !") : m->timeoutText;  // missions.js:228
      failMission(s);
      return StepUpdate::Failed;
    }
  }
  if (st->kind == "event" && course.failed) {
    failText = course.failText;
    failMission(s);
    return StepUpdate::Failed;
  }
  const bool ok = st->kind == "course" || st->kind == "event" ? course.finished : std::hypot(x - st->x, z - st->z) <= st->r;
  if (!ok) return StepUpdate::None;
  if (st->kind == "course" && (st->maxPenalties >= 0 || st->beatFaults >= 0)) {
    const int p = course.penalties;
    std::string why;
    if (course.eliminated) why = "Éliminé(e) : " + m->title + " à retenter.";
    else if (st->maxPenalties >= 0 && p > st->maxPenalties)
      why = std::to_string(p) + " pénalités : non qualifié(e). Il en faut " + std::to_string(st->maxPenalties) + " au maximum.";
    else if (st->beatFaults >= 0 && !(p < st->beatFaults || (p == st->beatFaults && course.time < st->beatTime)))
      why = std::to_string(p) + " pénalités en " + fmt1(course.time) + " s : " + st->beatName + " reste devant. Retente ta chance !";
    if (!why.empty()) {
      failText = why;
      failMission(s);
      return StepUpdate::Failed;
    }
  }
  if (st->stopTimer) s.timeLeft = -1;
  s.step++;
  if ((size_t)s.step < m->route.size() && m->route[(size_t)s.step].timer > 0) s.timeLeft = m->route[(size_t)s.step].timer;
  return StepUpdate::Advanced;
}

CareerReward completeMission(const StoryData& d, CareerState& s) { return completeMission(d, s, -1); }

CareerReward completeMission(const StoryData& d, CareerState& s, int payOverride) {
  CareerReward r;
  const StoryMission* m = s.active.empty() ? nullptr : d.find(s.active);
  if (!m) return r;
  // grantOnce(`story:${id}`) : une mission de l'histoire ne paie qu'une fois.
  r.fresh = !s.done(m->id);
  if (r.fresh) {
    r.pay = payOverride >= 0 ? payOverride : m->pay;
    r.rep = m->xp;
    r.cost = std::min(m->cost, s.credits);  // coût de la mission (soins du « Fer perdu ») réglé sur place
    s.completed.push_back(m->id);
  }
  s.credits += r.pay - r.cost;
  s.reputation += r.rep;
  if (s.checkpoint == m->id) s.checkpoint.clear();
  s.active.clear();
  s.step = 0;
  s.timeLeft = -1;
  return r;
}

}  // namespace strides
