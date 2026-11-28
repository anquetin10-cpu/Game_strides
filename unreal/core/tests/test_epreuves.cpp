// Jalon J4 : épreuves du cross de Saint-Gatien, de la course de l'hippodrome et concurrents du Grand Prix de Paris
// (StridesCore/Epreuves) contre le jeu web. Oracle : tests/oracles/epreuves.json, produit par la vraie MissionManager du
// web (missions « cross » et « derby » de story.js, courseSteps et raceSteps de courses.js) dans une partie factice
// (scripts/unreal/export-epreuves.mjs). Chaque scénario est rejoué image par image (1/30 s) avec les mêmes entrées
// (positions du cheval, mode, événements d'obstacle, dialogue fermé) ; sont comparés à chaque image relevée : étape,
// texte de l'objectif, état de l'épreuve, appels hud.* et audio.* dans l'ordre, adversaires, issue (paiement, note,
// raison de l'échec).
// Usage : strides_epreuves_tests <dossier des oracles> <Content/Data>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>

#include "StridesCore/Epreuves.h"
#include "StridesCore/MiniJson.h"

static int g_checks = 0, g_fail = 0;
#define CHECK(cond, ...)                                   \
  do {                                                     \
    g_checks++;                                            \
    if (!(cond)) {                                         \
      g_fail++;                                            \
      if (g_fail < 60) {                                   \
        std::printf("ÉCHEC %s:%d : ", __FILE__, __LINE__); \
        std::printf(__VA_ARGS__);                          \
        std::printf("\n");                                 \
      }                                                    \
    }                                                      \
  } while (0)

static std::string readAll(const std::string& p) {
  std::ifstream f(p);
  std::stringstream ss;
  ss << f.rdbuf();
  return ss.str();
}
static double r4(double v) { return strides::jsRoundHalfUp(v * 1e4) / 1e4; }
static bool near(double a, double b, double tol) { return std::fabs(a - b) <= tol; }

// Appel rendu comme l'oracle : « hud.big|3||700 » (nombres arrondis à 1e-4).
static std::string callText(const std::string& ns, const strides::CsoCall& c) {
  std::string s = ns + "." + c.fn;
  for (const strides::CsoArg& a : c.args) {
    s += "|";
    if (a.isNum) {
      char b[64];
      std::snprintf(b, sizeof b, "%.10g", r4(a.n));
      s += b;
    } else s += a.s;
  }
  return s;
}
static std::string oracleCall(const J& c) {
  std::string s;
  for (size_t i = 0; i < c.a.size(); ++i) {
    if (i) s += "|";
    if (c.a[i].t == J::Num) {
      char b[64];
      std::snprintf(b, sizeof b, "%.10g", c.a[i].n);
      s += b;
    } else s += c.a[i].s;
  }
  return s;
}

static strides::CsoObstacleEventKind evKind(const std::string& k) {
  return k == "clear" ? strides::CsoObstacleEventKind::Clear : k == "fault" ? strides::CsoObstacleEventKind::Fault : strides::CsoObstacleEventKind::Refusal;
}

static void replay(const std::string& id, const J& sc, const strides::MissionEvents& data, strides::EventRun::Kind kind) {
  std::vector<double> base;
  if (sc["rivalsBase"].t == J::Arr) for (const J& b : sc["rivalsBase"].a) base.push_back(b.num());
  strides::EventRun run(kind, data, "Alex", base);
  run.begin();
  // Appels de missions.start (avant la boucle de l'oracle) et de la première étape : écartés comme l'oracle.
  run.takeHud();
  run.takeAudio();
  const J& inputs = sc["inputs"];
  const J& frames = sc["frames"];
  size_t ii = 0, fi = 0;
  strides::EventFrame fr;
  fr.dt = 1.0 / 30;
  std::string mode = "ride";
  int lastFrame = (int)frames.a.back()["f"].num();
  int mismatches = 0;
  for (int f = 0; f <= lastFrame; ++f) {
    std::vector<std::string> calls;
    strides::CsoCadence cad;
    // Entrées de l'image.
    while (ii < inputs.a.size() && (int)inputs[ii]["f"].num() == f) {
      const J& in = inputs[ii];
      const J& p = in["p"];
      fr.x = fr.focusX = p[0].num();
      fr.z = fr.focusZ = p[1].num();
      fr.heading = p[2].num();
      fr.speed = p[3].num();
      mode = p[4].s;
      fr.riding = mode == "ride";
      if (in["dlg"].t == J::Num) run.closeDialog();
      if (in["ev"].t == J::Arr)
        for (const J& e : in["ev"].a) {
          const std::string k = e[1].s;
          run.obstacleEvent(evKind(k), (int)e[0].num(), (int)e[2].num(), k == "fault" ? "short" : "", k == "fault" ? "Appel trop loin" : "", cad);
        }
      ii++;
    }
    // Appels des écouteurs d'obstacle (avant missions.update) puis de l'image, dans l'ordre de l'oracle : sons et hud
    // sont relevés ensemble par l'oracle ; ici, deux files : comparées chacune dans l'ordre.
    run.update(fr, cad);
    double tx, tz, th;
    if (run.takeTeleport(tx, tz, th)) { fr.x = fr.focusX = tx; fr.z = fr.focusZ = tz; fr.heading = th; }
    std::vector<std::string> hud, au;
    for (const strides::CsoCall& c : run.takeHud()) hud.push_back(callText("hud", c));
    for (const strides::CsoCall& c : run.takeAudio()) au.push_back(callText("audio", c));
    if (fi >= frames.a.size() || (int)frames[fi]["f"].num() != f) continue;
    const J& row = frames[fi++];
    const std::string tag = id + " image " + std::to_string(f);
    const int before = g_fail;
    CHECK(run.stepIndex() == (int)row["i"].num(), "%s : étape %d (oracle %d)", tag.c_str(), run.stepIndex(), (int)row["i"].num());
    CHECK(std::string(run.stepKindName()) == row["k"].s, "%s : genre « %s » (oracle « %s »)", tag.c_str(), run.stepKindName(), row["k"].s.c_str());
    CHECK(run.text() == row["txt"].s, "%s : texte « %s » (oracle « %s »)", tag.c_str(), run.text().c_str(), row["txt"].s.c_str());
    if (row["cs"].t == J::Arr) {
      const J& cs = row["cs"];
      const strides::XcState& s = run.course();
      CHECK(s.faults == (int)cs[0].num() && s.refusals == (int)cs[1].num() && s.fenceRefusals == (int)cs[2].num() && s.next == (int)cs[3].num(),
            "%s : fautes %d refus %d/%d suivant %d (oracle %g %g/%g %g)", tag.c_str(), s.faults, s.refusals, s.fenceRefusals, s.next, cs[0].n, cs[1].n, cs[2].n, cs[3].n);
      CHECK(near(s.t, cs[4].num(), 2e-4), "%s : chrono %.4f (oracle %.4f)", tag.c_str(), s.t, cs[4].n);
      CHECK((s.started ? 1 : 0) == (int)cs[5].num() && (s.finished ? 1 : 0) == (int)cs[6].num(), "%s : lancé / fini", tag.c_str());
      CHECK(s.timeFaults == (int)cs[8].num(), "%s : pénalités de temps %d (oracle %g)", tag.c_str(), s.timeFaults, cs[8].n);
    }
    if (row["rc"].t == J::Arr) {
      const J& rc = row["rc"];
      const strides::RaceState& r = run.race();
      CHECK(near(r.t, rc[0].num(), 2e-4), "%s : temps de course %.4f (oracle %.4f)", tag.c_str(), r.t, rc[0].n);
      CHECK(near(r.prog, rc[1].num(), 2e-3), "%s : progression %.4f (oracle %.4f)", tag.c_str(), r.prog, rc[1].n);
      std::string order;
      for (size_t k = 0; k < r.order.size(); ++k) order += (k ? "," : "") + r.order[k];
      CHECK(order == rc[3].s, "%s : arrivée « %s » (oracle « %s »)", tag.c_str(), order.c_str(), rc[3].s.c_str());
      CHECK((r.offTrack ? 1 : 0) == (int)rc[4].num(), "%s : hors piste", tag.c_str());
      const J& rv = row["rv"];
      CHECK(rv.a.size() == run.rivals().size(), "%s : %zu adversaires (oracle %zu)", tag.c_str(), run.rivals().size(), rv.a.size());
      for (size_t k = 0; k < rv.a.size() && k < run.rivals().size(); ++k) {
        const strides::RaceRival& R = run.rivals()[k];
        CHECK(near(R.x, rv[k][0].num(), 2e-3) && near(R.z, rv[k][1].num(), 2e-3) && near(R.heading, rv[k][2].num(), 2e-3) && near(R.speed, rv[k][3].num(), 2e-3) &&
                  near(R.prog, rv[k][4].num(), 2e-3),
              "%s : adversaire %zu (%.4f ; %.4f ; %.4f ; %.4f ; %.4f) oracle (%g ; %g ; %g ; %g ; %g)", tag.c_str(), k, R.x, R.z, R.heading, R.speed, R.prog,
              rv[k][0].n, rv[k][1].n, rv[k][2].n, rv[k][3].n, rv[k][4].n);
      }
    }
    // Appels : séparés en hud.* et audio.*, ordre conservé dans chaque famille.
    std::vector<std::string> ohud, oau;
    if (row["calls"].t == J::Arr)
      for (const J& c : row["calls"].a) {
        const std::string s = oracleCall(c);
        (s.rfind("hud.", 0) == 0 ? ohud : oau).push_back(s);
      }
    auto join = [](const std::vector<std::string>& v) { std::string s; for (const std::string& x : v) s += "[" + x + "]"; return s; };
    CHECK(hud == ohud, "%s : hud %s (oracle %s)", tag.c_str(), join(hud).c_str(), join(ohud).c_str());
    CHECK(au == oau, "%s : audio %s (oracle %s)", tag.c_str(), join(au).c_str(), join(oau).c_str());
    if (row["out"].t == J::Obj) {
      const J& o = row["out"];
      if (o["kind"].s == "fail") {
        CHECK(run.failed() && run.failReason() == o["reason"].s, "%s : échec « %s » (oracle « %s »)", tag.c_str(), run.failReason().c_str(), o["reason"].s.c_str());
      } else {
        CHECK(run.completed(), "%s : mission non terminée", tag.c_str());
        CHECK(run.pay() == (int)o["pay"].num() && run.xp() == (int)o["xp"].num() && run.stars() == (int)o["stars"].num(),
              "%s : %d € %d points %d étoiles (oracle %g %g %g)", tag.c_str(), run.pay(), run.xp(), run.stars(), o["pay"].n, o["xp"].n, o["stars"].n);
        CHECK(run.resultTitle() == o["title"].s && run.resultBody() == o["body"].s, "%s : titre « %s » texte « %s »", tag.c_str(), run.resultTitle().c_str(), run.resultBody().c_str());
      }
    }
    if (g_fail > before && ++mismatches > 4) { std::printf("%s : arrêt après 5 images en écart\n", id.c_str()); return; }
  }
  CHECK(run.finished(), "%s : déroulé non terminé à la dernière image", id.c_str());
}

int main(int argc, char** argv) {
  if (argc < 3) { std::printf("usage : %s <oracles> <Content/Data>\n", argv[0]); return 2; }
  const std::string oracles = argv[1], dataDir = argv[2];
  strides::MissionEvents data;
  std::string err;
  if (!strides::loadMissionEvents(readAll(dataDir + "/mission_events.json"), data, err)) { std::printf("lecture : %s\n", err.c_str()); return 1; }
  const J oracle = loadJson(oracles + "/epreuves.json");

  // 1. Hippodrome : fonctions de l'ovale (valeurs du web relevées dans l'oracle par les positions des stalles).
  CHECK(near(strides::ovalLength(data.race.hippo, data.race.hippo.radius), data.race.total, 1e-3), "longueur de l'ovale");
  {
    double x, z, s, off;
    for (double ss : {0.0, 60.0, 150.0, 300.0, 450.0, 600.0, 789.0}) {
      strides::ovalPoint(data.race.hippo, ss, data.race.hippo.radius, x, z);
      strides::ovalProject(data.race.hippo, x, z, s, off);
      CHECK(near(std::fmod(s, data.race.total), std::fmod(ss, data.race.total), 1e-6) && near(off, 0, 1e-6), "ovale : projection de s = %g (%g, écart %g)", ss, s, off);
    }
  }

  // 2. Scénarios de mission.
  for (const auto& [id, sc] : oracle["cross"].o) replay(id, sc, data, strides::EventRun::Kind::Cross);
  for (const auto& [id, sc] : oracle["race"].o) replay(id, sc, data, strides::EventRun::Kind::Race);

  // 3. Grand Prix de Paris : concurrents, Sprint, Grand Prix, barrage (4 graines).
  for (const J& p : oracle["paris"].a) {
    const double seed = p["seed"].num();
    const auto rivals = strides::parisRivals(data.paris, seed);
    CHECK(rivals.size() == p["rivals"].a.size(), "Paris %g : %zu concurrents", seed, rivals.size());
    for (size_t i = 0; i < rivals.size() && i < p["rivals"].a.size(); ++i)
      CHECK(rivals[i].rider == p["rivals"][i][0].s && rivals[i].horse == p["rivals"][i][1].s && near(rivals[i].form, p["rivals"][i][2].num(), 1e-4),
            "Paris %g : concurrent %zu « %s · %s » (oracle « %s · %s »)", seed, i, rivals[i].rider.c_str(), rivals[i].horse.c_str(), p["rivals"][i][0].s.c_str(), p["rivals"][i][1].s.c_str());
    const auto sp = strides::sprintField(data.paris, rivals, seed);
    std::vector<double> scores;
    for (size_t i = 0; i < sp.size(); ++i) {
      CHECK(sp[i].rails == (int)p["sprint"][i][0].num() && near(sp[i].time, p["sprint"][i][1].num(), 1e-9) && near(sp[i].score, p["sprint"][i][2].num(), 1e-9),
            "Paris %g : Sprint %zu (%d ; %.2f ; %.2f) oracle (%g ; %g ; %g)", seed, i, sp[i].rails, sp[i].time, sp[i].score, p["sprint"][i][0].n, p["sprint"][i][1].n, p["sprint"][i][2].n);
      scores.push_back(sp[i].score);
    }
    const auto rank = strides::rankSprint(scores);
    for (size_t i = 0; i < rank.size(); ++i) CHECK(rank[i] == (int)p["sprintRank"][i].num(), "Paris %g : rang %zu du Sprint", seed, i);
    const auto gp = strides::gpField(data.paris, rivals, seed);
    size_t clear = 0;
    for (size_t i = 0; i < gp.size(); ++i) {
      CHECK(gp[i].faults == (int)p["gp"][i][0].num() && near(gp[i].time, p["gp"][i][1].num(), 1e-9), "Paris %g : Grand Prix %zu", seed, i);
      clear += gp[i].faults == 0 ? 1 : 0;
    }
    const auto jo = strides::barrageField(data.paris, clear, seed);
    CHECK(jo.size() == p["jo"].a.size(), "Paris %g : %zu au barrage (oracle %zu)", seed, jo.size(), p["jo"].a.size());
    for (size_t i = 0; i < jo.size() && i < p["jo"].a.size(); ++i)
      CHECK(jo[i].faults == (int)p["jo"][i][0].num() && near(jo[i].time, p["jo"][i][1].num(), 1e-9), "Paris %g : barrage %zu", seed, i);
  }
  CHECK(strides::formatMoneyFr(1500) == "1\xE2\x80\xAF" "500 €" && strides::formatMoneyFr(42) == "42 €", "formatMoney");

  std::printf("epreuves : %d vérifications, %d échecs\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
