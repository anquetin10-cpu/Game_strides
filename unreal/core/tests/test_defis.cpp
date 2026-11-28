// Jalon J4-D : défis à conditions fixes (StridesCore/Challenge) contre le vrai module du web (challenge.js), oracle
// tests/oracles/defis.json (scripts/unreal/export-defis.mjs) ; données lues dans Content/Data/challenges.json comme le jeu.
// Usage : strides_defis_tests <dossier des oracles> <Content/Data>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <sstream>
#include "StridesCore/Challenge.h"
#include "StridesCore/MiniJson.h"
#include "StridesCore/SaveGame.h"

static int g_checks = 0, g_fail = 0;
#define CHECK(cond, ...) do { g_checks++; if (!(cond)) { g_fail++; if (g_fail < 40) { std::printf("ÉCHEC %s:%d : ", __FILE__, __LINE__); std::printf(__VA_ARGS__); std::printf("\n"); } } } while (0)

static std::string readAll(const std::string& p) { std::ifstream f(p); std::stringstream ss; ss << f.rdbuf(); return ss.str(); }

int main(int argc, char** argv) {
  if (argc < 3) { std::printf("usage : %s <oracles> <Content/Data>\n", argv[0]); return 2; }
  strides::ChallengeData d;
  std::string err;
  if (!strides::loadChallenges(readAll(std::string(argv[2]) + "/challenges.json"), d, err)) { std::printf("lecture : %s\n", err.c_str()); return 1; }
  const J o = loadJson(std::string(argv[1]) + "/defis.json");
  const strides::ChallengeConfig* cfg = d.find(o["challenge"].s);
  CHECK(cfg && d.current == cfg->id, "défi courant %s", d.current.c_str());
  if (!cfg) return 1;
  CHECK(cfg->timeAllowed == 64 && cfg->refusalsToEliminate == 2 && cfg->obstacles.size() == 10 && cfg->height == 1.1 && cfg->horseName == "Onyx", "conditions du défi du Pôle v6");
  std::map<std::string, strides::ChallengeRecord> rec;
  std::vector<strides::ChallengeResult> results;
  for (const J& s : o["seq"].a) {
    const J& in = s["in"];
    const strides::ChallengeResult r = strides::makeChallengeResult(*cfg, in["attempt"].s, (int)in["faults"].num(), (int)in["refusals"].num(), (int)in["rails"].num(), in["t"].num(), in["eliminated"].s);
    results.push_back(r);
    const J& w = s["res"];
    CHECK(r.eliminated == (w["eliminated"].isNull() ? std::string() : w["eliminated"].s), "%s : élimination", in["attempt"].s.c_str());
    if (!r.isEliminated()) CHECK(r.penalties == (int)w["penalties"].num() && r.timeFaults == (int)w["timeFaults"].num() && r.faults == (int)w["faults"].num(), "%s : %d pénalités (oracle %g)", in["attempt"].s.c_str(), r.penalties, w["penalties"].n);
    CHECK(std::fabs(r.time - w["time"].num()) < 1e-9 && r.rails == (int)w["rails"].num(), "%s : chrono %.3f", in["attempt"].s.c_str(), r.time);
    CHECK(strides::challengeResultLine(r) == s["line"].s, "%s : « %s » (oracle « %s »)", in["attempt"].s.c_str(), strides::challengeResultLine(r).c_str(), s["line"].s.c_str());
    const strides::RecordOutcome ro = strides::recordChallengeResult(rec, r);
    CHECK(ro.isRecord == s["isRecord"].b && ro.duplicate == s["duplicate"].b, "%s : record %d doublon %d", in["attempt"].s.c_str(), ro.isRecord, ro.duplicate);
    const strides::ChallengeRecord& R = rec[cfg->id];
    CHECK(R.attempts == (int)s["attempts"].num(), "%s : %d tentatives", in["attempt"].s.c_str(), R.attempts);
    CHECK((R.hasBest ? strides::challengeResultLine(R.best) : std::string()) == (s["best"].isNull() ? std::string() : s["best"].s), "%s : record « %s »", in["attempt"].s.c_str(), R.hasBest ? strides::challengeResultLine(R.best).c_str() : "");
  }
  for (const J& c : o["cmp"].a) {
    const int i = (int)c[0].num(), j = (int)c[1].num(), want = (int)c[2].num();
    const int got = strides::compareChallengeResults(&results[(size_t)i], &results[(size_t)j]);
    CHECK((got > 0) - (got < 0) == want, "comparaison %d / %d : %d (oracle %d)", i, j, got, want);
  }
  for (const J& t : o["timeFaults"].a) CHECK(strides::challengeTimeFaults(t[0].num(), t[1].num()) == (int)t[2].num(), "pénalités de temps à %.7f s", t[0].n);
  // Sauvegarde native : records, tentatives et identifiants relus à l'identique.
  {
    strides::SaveGame sg;
    sg.challenges = rec;
    strides::SaveGame back;
    std::string e2;
    CHECK(strides::SaveGame::fromJson(sg.toJson(), back, e2), "relecture : %s", e2.c_str());
    const strides::ChallengeRecord& a = rec[cfg->id];
    const strides::ChallengeRecord& b = back.challenges[cfg->id];
    CHECK(b.attempts == a.attempts && b.seen == a.seen && b.hasBest && strides::challengeResultLine(b.best) == strides::challengeResultLine(a.best) && b.hasLast &&
              b.last.attempt == a.last.attempt && b.last.eliminated == a.last.eliminated,
          "records relus (%d tentatives, record « %s »)", b.attempts, strides::challengeResultLine(b.best).c_str());
  }
  std::printf("defis : %d vérifications, %d échecs\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
