// Jalon J3 (correction) : missions de l'histoire du web (voir Career.h).
#include "StridesCore/Career.h"

#include <algorithm>
#include <cmath>
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
      m.level = std::max(1, integer(o["level"])); m.pay = integer(o["pay"]); m.xp = integer(o["xp"]); m.cost = integer(o["cost"]);
      m.full = o["full"].t == J::Bool && o["full"].b;
      for (const J& r : o["requires"].a) m.prereqs.push_back(str(r));
      for (const J& r : o["skipped"].a) m.skipped.push_back(str(r));
      for (const J& st : o["route"].a) {
        MissionStep s;
        s.kind = str(st["kind"]); s.text = str(st["text"]);
        s.x = st["x"].num(); s.z = st["z"].num(); s.r = st["r"].num();
        if (s.kind != "goto" && s.kind != "course") { err = "étape inconnue dans " + m.id; return false; }
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
  if (!s.active.empty()) return AcceptResult::Busy;
  if (m->cost > s.credits) return AcceptResult::Funds;
  s.active = m->id;
  s.checkpoint = m->id;
  s.step = 0;
  return AcceptResult::Ok;
}

const MissionStep* currentStep(const StoryData& d, const CareerState& s) {
  const StoryMission* m = s.active.empty() ? nullptr : d.find(s.active);
  if (!m || s.step < 0 || (size_t)s.step >= m->route.size()) return nullptr;
  return &m->route[(size_t)s.step];
}

bool advanceStep(const StoryData& d, CareerState& s, double x, double z, bool courseFinishedSinceStep) {
  const MissionStep* st = currentStep(d, s);
  if (!st) return false;
  const bool ok = st->kind == "course" ? courseFinishedSinceStep : std::hypot(x - st->x, z - st->z) <= st->r;
  if (ok) s.step++;
  return ok;
}

CareerReward completeMission(const StoryData& d, CareerState& s) {
  CareerReward r;
  const StoryMission* m = s.active.empty() ? nullptr : d.find(s.active);
  if (!m) return r;
  // grantOnce(`story:${id}`) : une mission de l'histoire ne paie qu'une fois.
  r.fresh = !s.done(m->id);
  if (r.fresh) {
    r.pay = m->pay;
    r.rep = m->xp;
    r.cost = std::min(m->cost, s.credits);  // coût de la mission (soins du « Fer perdu ») réglé sur place
    s.completed.push_back(m->id);
  }
  s.credits += r.pay - r.cost;
  s.reputation += r.rep;
  if (s.checkpoint == m->id) s.checkpoint.clear();
  s.active.clear();
  s.step = 0;
  return r;
}

}  // namespace strides
