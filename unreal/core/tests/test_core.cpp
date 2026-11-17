// Tests du cœur Strides (C++ pur) : rejoue les oracles exportés du jeu web (scripts/unreal/export-data.mjs) et des
// scénarios de jugement tirés des règles de src/gameplay/courses.js. Sortie non nulle au premier écart.
#include <cmath>
#include <cstdio>
#include <string>

#include "StridesCore/CsoCourse.h"
#include "StridesCore/CsoRide.h"
#include "StridesCore/JumpModel.h"
#include "StridesCore/SaveGame.h"
#include "StridesCore/MiniJson.h"

using namespace strides;
static int g_checks = 0, g_fail = 0;
#define CHECK(cond, ...)                                  \
  do {                                                    \
    g_checks++;                                           \
    if (!(cond)) {                                        \
      g_fail++;                                           \
      if (g_fail < 25) {                                  \
        std::printf("ÉCHEC %s:%d : ", __FILE__, __LINE__); \
        std::printf(__VA_ARGS__);                         \
        std::printf("\n");                                \
      }                                                   \
    }                                                     \
  } while (0)
static bool near(double a, double b, double tol = 1e-9) { return std::abs(a - b) <= tol * std::max(1.0, std::abs(b)); }

static std::string ORA;

static void testJump() {
  J o = loadJson(ORA + "/jump.json");
  for (const J& f : o["factors"].a) {
    if (!f["v"].isNull()) CHECK(near(speedFactor(f["v"].num()), f["speed"].num()), "speedFactor(%g)", f["v"].num());
    else CHECK(near(angleFactor(f["cosA"].num()), f["angle"].num()), "angleFactor");
  }
  int i = 0;
  for (const J& c : o["cases"].a) {
    const J& in = c["in"];
    const J& out = c["out"];
    Fence fe;
    fe.pos = {in["fence"]["x"].num(), in["fence"]["z"].num()};
    fe.n = {in["fence"]["n"]["x"].num(), in["fence"]["n"]["z"].num()};
    fe.t = {in["fence"]["t"]["x"].num(), in["fence"]["t"]["z"].num()};
    fe.kind = in["fence"]["kind"].s;
    for (const J& b : in["fence"]["bars"].a) fe.bars.push_back({b["s"].num(), b["h"].num()});
    FenceGeo g = railsAhead(fe, in["px"].num(), in["pz"].num(), in["fx"].num(), in["fz"].num());
    JumpHorse h{in["horse"]["v"].num(), in["horse"]["power"].num(), in["horse"]["clearance"].num(), in["horse"]["cso"].b};
    JumpPlan p = planJump(h, &g);
    CHECK(near(p.L, out["L"].num()), "saut %d : L %.9g / %.9g", i, p.L, out["L"].num());
    CHECK(near(p.H, out["H"].num()), "saut %d : H %.9g / %.9g", i, p.H, out["H"].num());
    if (out["margin"].isNull()) CHECK(!p.hasMargin, "saut %d : marge attendue nulle", i);
    else CHECK(p.hasMargin && near(p.margin, out["margin"].num()), "saut %d : marge %.9g / %.9g", i, p.margin, out["margin"].num());
    CHECK(p.margins.size() == out["margins"].a.size(), "saut %d : nombre de marges", i);
    for (size_t k = 0; k < p.margins.size() && k < out["margins"].a.size(); k++) CHECK(near(p.margins[k], out["margins"][k].num()), "saut %d : marge %zu", i, k);
    CHECK(out["zone"].s == zoneName(p.zone), "saut %d : zone %s / %s", i, zoneName(p.zone), out["zone"].s.c_str());
    CHECK((out["cause"].isNull() ? std::string() : out["cause"].s) == causeName(p.cause), "saut %d : cause %s / %s", i, causeName(p.cause), out["cause"].s.c_str());
    CHECK((out["quality"].isNull() ? std::string() : out["quality"].s) == qualityName(takeoffQuality(p)), "saut %d : qualité %s / %s", i, qualityName(takeoffQuality(p)), out["quality"].s.c_str());
    i++;
  }
  std::printf("saut : %d cas\n", i);
}

static void testRide() {
  J o = loadJson(ORA + "/cso_ride.json");
  int n = 0;
  for (const J& c : o["cases"].a) {
    const std::string& fn = c["fn"].s;
    const J& a = c["in"];
    double got = fn == "steerRate" ? steerRate(a[0].num(), a[1].num())
               : fn == "cadenceDelta" ? cadenceDelta(a[0].num(), a[1].num(), a[2].num())
               : fn == "minRadius" ? minRadius(a[0].num()) : maxTurnRate(a[0].num());
    CHECK(near(got, c["out"].num()), "%s : %.9g / %.9g", fn.c_str(), got, c["out"].num());
    n++;
  }
  std::printf("conduite CSO : %d cas\n", n);
}

static void testCourse() {
  J o = loadJson(ORA + "/cso_course.json");
  CourseDesign d = poleDesign();
  CourseTrace t = traceCourse(d);
  CHECK(near(t.length, o["length"].num()), "longueur %.9g / %.9g", t.length, o["length"].num());
  CHECK(t.fences.size() == o["fences"].a.size(), "nombre d'obstacles");
  for (size_t i = 0; i < t.fences.size() && i < o["fences"].a.size(); i++) {
    const J& f = o["fences"][i];
    CHECK(t.fences[i].label == f["label"].s && t.fences[i].kind == f["kind"].s, "obstacle %zu : libellé", i);
    CHECK(near(t.fences[i].x, f["x"].num(), 1e-7) && near(t.fences[i].z, f["z"].num(), 1e-7) && near(t.fences[i].rot, f["rot"].num(), 1e-9) && near(t.fences[i].s, f["s"].num(), 1e-7),
          "obstacle %s : position %.6f %.6f / %.6f %.6f", f["label"].s.c_str(), t.fences[i].x, t.fences[i].z, f["x"].num(), f["z"].num());
    CHECK(near(t.fences[i].spread, f["spread"].num()), "obstacle %zu : largeur", i);
  }
  for (const char* m : {"start", "finish"}) CHECK(near(t.marks[m].x, o["marks"][m]["x"].num(), 1e-7) && near(t.marks[m].s, o["marks"][m]["s"].num(), 1e-7), "repère %s", m);
  for (size_t i = 0; i < o["samplePts"].a.size(); i++) {
    const J& p = o["samplePts"][i];
    const TracePoint& q = t.pts.at(i * 25);
    CHECK(near(q.x, p["x"].num(), 1e-7) && near(q.z, p["z"].num(), 1e-7) && near(q.s, p["s"].num(), 1e-7), "point %zu", i * 25);
  }
  auto hs = courseHeights(d, t, 1.1);
  for (size_t i = 0; i < hs.size(); i++) CHECK(near(hs[i], o["heights110"][i].num()), "hauteur %zu", i);
  const double len = std::round(t.length);
  for (auto& [k, sp] : std::map<std::string, double>{{"national", 350}, {"csi", 375}, {"gp", 400}, {"crossAmateur", 420}})
    CHECK(timeAllowedFor(len, sp) == (int)o["timeAllowed"][k].num(), "temps accordé %s", k.c_str());
  for (const J& c : o["timeFaults"].a) CHECK(timeFaults(c["t"].num(), c["allowed"].num()) == (int)c["out"].num(), "pénalités de temps %g", c["t"].num());
  for (const J& c : o["compare"].a) {
    auto R = [](const J& x) { return RunResult{!x["eliminated"].isNull(), x["penalties"].isNull() ? 0 : (int)x["penalties"].num(), x["time"].isNull() ? 0 : x["time"].num()}; };
    int s = compareResults(R(c["a"]), R(c["b"]));
    CHECK((s > 0) - (s < 0) == (int)c["out"].num(), "classement");
  }
  std::printf("parcours : %zu obstacles, longueur %.2f m\n", t.fences.size(), t.length);
}

// Scénarios de jugement (règles de courses.js) : sans faute, barre, refus, double, temps, élimination.
static void testJudge() {
  CourseTrace t = traceCourse(poleDesign());
  std::vector<std::string> labels;
  for (auto& f : t.fences) labels.push_back(f.label);
  const int n = (int)labels.size();
  {
    CourseJudge j(labels, 64);
    j.clear(1, 1);  // avant le départ : ignoré
    CHECK(j.next() == 1, "obstacle avant le départ ignoré");
    j.startCrossed();
    for (int k = 1; k <= n; k++) { j.tick(5); j.clear(k, 1); }
    CHECK(j.finishCrossed() && j.points() == 0 && !j.result().eliminated, "sans faute");
  }
  {
    CourseJudge j(labels, 64);
    j.startCrossed();
    j.rail(1, 1); j.clear(2, 1); j.rail(3, 1);
    CHECK(j.faults() == 8 && j.next() == 4, "deux barres = 8 points");
    CHECK(!j.clear(6, 1) && j.wrongCourse() == 1 && j.next() == 4, "erreur de parcours");
    j.clear(4, 1); j.clear(5, 1);  // 4A puis 4B
    for (int k = 6; k <= n; k++) j.clear(k, 1);
    j.tick(66.2);  // 2,2 s au-delà de 64 → 3 points
    CHECK(j.finishCrossed() && j.points() == 11, "8 + 3 pénalités de temps : %d", j.points());
  }
  {
    CourseJudge j(labels, 64);
    j.startCrossed();
    j.clear(1, 1); j.clear(2, 1); j.clear(3, 1); j.clear(4, 1);  // … 4A
    j.refusal(5, 1);  // refus au 4B : reprise au 4A
    CHECK(j.faults() == 4 && j.next() == 4 && j.refusals() == 1, "refus dans le double : reprise au 4A (next=%d)", j.next());
    j.refusal(5, -1);  // de dos : ignoré
    CHECK(j.refusals() == 1, "refus de dos ignoré");
    j.refusal(4, 1);
    CHECK(j.eliminated() == Elim::Refusals && j.result().eliminated, "2e refus : éliminé");
  }
  {
    CourseJudge j(labels, 64);
    j.startCrossed();
    j.tick(128.5);
    CHECK(j.eliminated() == Elim::TimeLimit, "temps limite (double du temps accordé)");
  }
  {
    CourseJudge j(labels, 64);
    j.startCrossed(); j.dismounted();
    CHECK(j.eliminated() == Elim::Dismounted, "descendu : éliminé");
  }
  {
    CourseJudge j(labels, 100, true);
    j.startCrossed();
    j.refusal(1, 1); j.refusal(1, 1);
    CHECK(j.faults() == 40 && j.eliminated() == Elim::None, "cross : 20 points par refus");
    j.refusal(1, 1);
    CHECK(j.eliminated() == Elim::FenceRefusals, "cross : 3e refus sur le même obstacle");
  }
  std::printf("jugement : scénarios joués\n");
}

static void testSave() {
  SaveGame s = SaveGame::fresh();
  s.playerName = "Julien";
  s.gameTime = 12 * 3600 + 5;
  s.money = 1250;
  s.horses.push_back("biscotte");
  s.records["cso"] = {false, 4, 61.37};
  s.pose = {"ride", 330.5, 2.1, -270.25, 1.2, true};
  std::string txt = s.toJson();
  SaveGame r;
  std::string err;
  CHECK(SaveGame::fromJson(txt, r, err), "relecture : %s", err.c_str());
  CHECK(r.version == SaveGame::kVersion && r.playerName == "Julien" && r.gameTime == s.gameTime && r.money == 1250, "champs relus");
  CHECK(r.horses.size() == 2 && r.horses[1] == "biscotte" && r.pose.valid && r.pose.mode == "ride" && near(r.pose.z, -270.25), "chevaux et position relus");
  // Import d'une sauvegarde web (version 1 : l'expérience devient la réputation, comme la migration du jeu web).
  SaveGame w;
  CHECK(SaveGame::fromWebExport("{\"version\":1,\"playerName\":\"Léa\",\"xp\":340,\"money\":90,\"horses\":[\"comete\"],\"inventory\":{\"carrots\":3}}", w, err), "import web : %s", err.c_str());
  CHECK(w.playerName == "Léa" && w.reputation == 340 && w.money == 90 && w.legacyJson.find("carrots") != std::string::npos, "import web : champs et reste conservé");
  CHECK(r.records.count("cso") && r.records["cso"].penalties == 4 && near(r.records["cso"].time, 61.37), "record relu");
  CHECK(!SaveGame::fromJson("{\"schema\":\"strides.save\",\"version\":99}", r, err), "version future refusée");
  CHECK(!SaveGame::fromJson("pas du json", r, err), "fichier abîmé refusé");
  std::printf("sauvegarde : %zu octets\n", txt.size());
}

int main(int argc, char** argv) {
  ORA = argc > 1 ? argv[1] : "oracles";
  try {
    testJump();
    testRide();
    testCourse();
    testJudge();
    testSave();
  } catch (const std::exception& e) {
    std::printf("exception : %s\n", e.what());
    return 2;
  }
  std::printf("%d vérifications, %d échecs\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
