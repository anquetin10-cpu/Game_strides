#include "StridesCore/Challenge.h"

#include <algorithm>
#include <cmath>

#include "StridesCore/Epreuves.h"
#include "StridesCore/MiniJson.h"
#include "StridesCore/Text.h"

namespace strides {

const ChallengeConfig* ChallengeData::find(const std::string& id) const {
  for (const ChallengeConfig& c : challenges) if (c.id == id) return &c;
  return nullptr;
}

bool loadChallenges(const std::string& text, ChallengeData& out, std::string& err) {
  try {
    const J f = JParser(text).parse();
    if (f["schema"].s != "strides.challenges.v1") { err = "schéma inattendu"; return false; }
    out = ChallengeData();
    out.current = f["current"].s;
    out.startX = f["start"]["x"].num();
    out.startZ = f["start"]["z"].num();
    out.startRot = f["start"]["rot"].num();
    for (const J& c : f["challenges"].a) {
      ChallengeConfig g;
      g.id = c["id"].s; g.name = c["name"].s; g.course = c["course"].s; g.place = c["place"].s; g.courseId = c["courseId"].s;
      g.where = c["where"].s;
      g.version = (int)c["version"].num(); g.timeAllowed = (int)c["timeAllowed"].num(); g.timeLimit = (int)c["timeLimit"].num();
      for (const J& o : c["obstacles"].a) g.obstacles.push_back((int)o.num());
      g.height = c["height"].num();
      g.horseId = c["horse"]["id"].s; g.horseName = c["horse"]["name"].s; g.horseCoat = c["horse"]["coat"].s;
      g.horseSpeed = c["horse"]["speed"].num(); g.horseJump = c["horse"]["jump"].num(); g.horseStamina = c["horse"]["stamina"].num();
      g.weatherLabel = c["weather"]["label"].s; g.weatherDay = (int)c["weather"]["day"].num(); g.weatherHour = c["weather"]["hour"].num();
      g.rain = c["weather"]["rain"].num(); g.wet = c["weather"]["wet"].num();
      g.jumpAid = c["jumpAid"].t == J::Bool && c["jumpAid"].b;
      g.rail = (int)c["rules"]["rail"].num(); g.firstRefusal = (int)c["rules"]["firstRefusal"].num();
      g.refusalsToEliminate = (int)c["rules"]["refusalsToEliminate"].num(); g.timeFaultPerSecond = (int)c["rules"]["timeFaultPerSecond"].num();
      out.challenges.push_back(g);
    }
    if (out.challenges.empty() || !out.find(out.current)) { err = "défi courant absent"; return false; }
    return true;
  } catch (const std::exception& e) {
    err = e.what();
    return false;
  }
}

int challengeTimeFaults(double t, double allowed, int perSecond) {
  const double over = t - allowed;
  return over > 1e-9 ? (int)std::ceil(over - 1e-9) * perSecond : 0;
}

ChallengeResult makeChallengeResult(const ChallengeConfig& cfg, const std::string& attempt, int faults, int refusals, int rails, double t, const std::string& eliminated) {
  ChallengeResult r;
  r.challenge = cfg.id;
  r.version = cfg.version;
  r.attempt = attempt;
  r.eliminated = eliminated;
  r.rails = rails;
  r.refusals = refusals;
  const int tf = eliminated.empty() ? challengeTimeFaults(t, cfg.timeAllowed, cfg.timeFaultPerSecond) : 0;
  r.faults = eliminated.empty() ? faults : 0;
  r.timeFaults = tf;
  r.penalties = eliminated.empty() ? faults + tf : 0;
  r.time = jsRoundHalfUp(t * 100) / 100;
  return r;
}

int compareChallengeResults(const ChallengeResult* a, const ChallengeResult* b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const bool ea = a->isEliminated(), eb = b->isEliminated();
  if (ea != eb) return ea ? 1 : -1;
  if (ea) return 0;
  if (a->penalties != b->penalties) return a->penalties - b->penalties;
  return a->time < b->time ? -1 : a->time > b->time ? 1 : 0;
}

RecordOutcome recordChallengeResult(std::map<std::string, ChallengeRecord>& records, const ChallengeResult& res) {
  ChallengeRecord& r = records[res.challenge];
  RecordOutcome o;
  if (!res.attempt.empty() && std::find(r.seen.begin(), r.seen.end(), res.attempt) != r.seen.end()) {
    o.duplicate = true;
    o.hadPrevious = r.hasBest;
    if (r.hasBest) o.previous = r.best;
    return o;
  }
  if (!res.attempt.empty()) {
    r.seen.push_back(res.attempt);
    if (r.seen.size() > 30) r.seen.erase(r.seen.begin());
  }
  r.attempts++;
  r.last = res;
  r.hasLast = true;
  o.hadPrevious = r.hasBest;
  if (r.hasBest) o.previous = r.best;
  o.isRecord = !res.isEliminated() && (!r.hasBest || compareChallengeResults(&res, &r.best) < 0);
  if (o.isRecord) { r.best = res; r.hasBest = true; }
  return o;
}

std::string challengeResultLine(const ChallengeResult& r) {
  if (r.isEliminated()) return "Éliminé";
  const std::string pts = jsInt(r.penalties) + (r.penalties > 1 ? " pts" : " pt");
  return pts + " · " + dec(jsRoundHalfUp(r.time * 100) / 100, 2, Lang::Fr) + " s";
}

}  // namespace strides
