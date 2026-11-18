// Tests du cœur Strides (C++ pur) : rejoue les oracles exportés du jeu web (scripts/unreal/export-data.mjs) et des
// scénarios de jugement tirés des règles de src/gameplay/courses.js. Sortie non nulle au premier écart.
#include <cmath>
#include <cstdio>
#include <fstream>
#include <sstream>
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

static std::string ORA, DATA;

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

static std::string readFile(const std::string& path) {
  std::ifstream f(path);
  if (!f) throw std::runtime_error("fichier introuvable : " + path);
  std::stringstream ss;
  ss << f.rdbuf();
  return ss.str();
}

// Le tracé `d` doit être, commande par commande, celui que le JS déclare (oracle cso_course.json, clé "design", JSON brut
// lu ici sans passer par courseDesignFromJson).
static void checkDesign(const CourseDesign& d, const J& od, const char* who) {
  CHECK(near(d.x, od["start"]["x"].num()) && near(d.z, od["start"]["z"].num()) && near(d.h, od["start"]["h"].num()), "%s : départ du tracé", who);
  CHECK(d.cmds.size() == od["cmds"].a.size(), "%s : %zu commandes / %zu", who, d.cmds.size(), od["cmds"].a.size());
  for (size_t i = 0; i < d.cmds.size() && i < od["cmds"].a.size(); i++) {
    const CourseCmd& c = d.cmds[i];
    const J& e = od["cmds"][i];
    const std::string op(1, c.op);
    bool ok = e[0].s == op;
    if (op == "F") ok = ok && e.a.size() == 2 && near(c.a, e[1].num());
    else if (op == "L" || op == "R") ok = ok && e.a.size() == 3 && near(c.a, e[1].num()) && near(c.b, e[2].num());
    else if (op == "J") ok = ok && c.label == e[1].s && c.kind == e[2].s && near(c.spread, e.a.size() > 3 ? e[3].num() : 0.0);
    else if (op == "M") ok = ok && c.label == e[1].s;
    CHECK(ok, "%s : commande %zu (%s)", who, i, op.c_str());
  }
  CHECK(d.profile.size() == od["profile"].o.size(), "%s : profil de hauteurs", who);
  for (const auto& [k, v] : od["profile"].o) CHECK(d.profile.count(k) && near(d.profile.at(k), v.num()), "%s : profil %s", who, k.c_str());
}

// Tracé de `d` comparé à l'oracle : longueur, obstacles, repères (x, z, cap, abscisse), un point sur 25, abord complet,
// hauteurs.
static CourseTrace checkTrace(const CourseDesign& d, const J& o, const char* who) {
  CourseTrace t = traceCourse(d);
  CHECK(near(t.length, o["length"].num()), "%s : longueur %.9g / %.9g", who, t.length, o["length"].num());
  CHECK(t.fences.size() == o["fences"].a.size(), "%s : nombre d'obstacles", who);
  for (size_t i = 0; i < t.fences.size() && i < o["fences"].a.size(); i++) {
    const J& f = o["fences"][i];
    CHECK(t.fences[i].label == f["label"].s && t.fences[i].kind == f["kind"].s, "%s : obstacle %zu : libellé", who, i);
    CHECK(near(t.fences[i].x, f["x"].num(), 1e-7) && near(t.fences[i].z, f["z"].num(), 1e-7) && near(t.fences[i].rot, f["rot"].num(), 1e-9) && near(t.fences[i].s, f["s"].num(), 1e-7),
          "%s : obstacle %s : position %.6f %.6f / %.6f %.6f", who, f["label"].s.c_str(), t.fences[i].x, t.fences[i].z, f["x"].num(), f["z"].num());
    CHECK(near(t.fences[i].spread, f["spread"].num()), "%s : obstacle %zu : largeur", who, i);
  }
  CHECK(t.marks.size() == o["marks"].o.size(), "%s : nombre de repères", who);
  for (const auto& [m, om] : o["marks"].o) {
    CHECK(t.marks.count(m), "%s : repère %s absent", who, m.c_str());
    if (!t.marks.count(m)) continue;
    const TraceMark& k = t.marks.at(m);
    CHECK(near(k.x, om["x"].num(), 1e-7) && near(k.z, om["z"].num(), 1e-7) && near(k.rot, om["rot"].num(), 1e-9) && near(k.s, om["s"].num(), 1e-7),
          "%s : repère %s : %.9f %.9f %.9f %.9f / %.9f %.9f %.9f %.9f", who, m.c_str(), k.x, k.z, k.rot, k.s, om["x"].num(), om["z"].num(), om["rot"].num(), om["s"].num());
  }
  for (size_t i = 0; i < o["samplePts"].a.size(); i++) {
    const J& p = o["samplePts"][i];
    const TracePoint& q = t.pts.at(i * 25);
    CHECK(near(q.x, p["x"].num(), 1e-7) && near(q.z, p["z"].num(), 1e-7) && near(q.h, p["h"].num(), 1e-9) && near(q.s, p["s"].num(), 1e-7), "%s : point %zu", who, i * 25);
  }
  CHECK(t.leadIn.size() == o["leadIn"].a.size(), "%s : abord %zu points / %zu", who, t.leadIn.size(), o["leadIn"].a.size());
  for (size_t i = 0; i < t.leadIn.size() && i < o["leadIn"].a.size(); i++) {
    const J& p = o["leadIn"][i];
    const TracePoint& q = t.leadIn[i];
    CHECK(near(q.x, p["x"].num(), 1e-7) && near(q.z, p["z"].num(), 1e-7) && near(q.h, p["h"].num(), 1e-9) && near(q.s, p["s"].num(), 1e-7), "%s : abord, point %zu", who, i);
  }
  auto hs = courseHeights(d, t, 1.1);
  CHECK(hs.size() == o["heights110"].a.size(), "%s : nombre de hauteurs", who);
  for (size_t i = 0; i < hs.size() && i < o["heights110"].a.size(); i++) CHECK(near(hs[i], o["heights110"][i].num()), "%s : hauteur %zu", who, i);
  return t;
}

static void testCourse() {
  J o = loadJson(ORA + "/cso_course.json");
  // 1) tracé compilé (poleDesign) ; 2) tracé que le jeu lit dans Content/Data/cso_course_pole.json, par la même
  // fonction que StridesDataSubsystem (parseCourseFile).
  checkDesign(poleDesign(), o["design"], "poleDesign");
  CourseTrace t = checkTrace(poleDesign(), o, "poleDesign");
  CourseDesign dj;
  std::string err;
  CHECK(parseCourseFile(readFile(DATA + "/cso_course_pole.json"), dj, err), "cso_course_pole.json illisible : %s", err.c_str());
  checkDesign(dj, o["design"], "cso_course_pole.json");
  checkTrace(dj, o, "cso_course_pole.json");
  CourseDesign bad;
  CHECK(!parseCourseFile("{\"design\":{\"start\":{\"x\":0,\"z\":0,\"h\":0},\"cmds\":[[\"Q\",1]]}}", bad, err) && !err.empty(), "commande inconnue refusée");
  CHECK(!parseCourseFile("pas du json", bad, err), "fichier abîmé refusé");
  const double len = std::round(t.length);
  for (auto& [k, sp] : std::map<std::string, double>{{"national", 350}, {"csi", 375}, {"gp", 400}, {"crossAmateur", 420}})
    CHECK(timeAllowedFor(len, sp) == (int)o["timeAllowed"][k].num(), "temps accordé %s", k.c_str());
  std::vector<std::string> labels;
  for (auto& f : t.fences) labels.push_back(f.label);
  int nPoints = 0;
  for (const J& c : o["timeFaults"].a) {
    const int k = (int)c["perSecond"].num();
    CHECK(timeFaults(c["t"].num(), c["allowed"].num(), k) == (int)c["out"].num(), "pénalités de temps %.12g / %g (×%d)", c["t"].num(), c["allowed"].num(), k);
    // Le score du jeu passe par CourseJudge::points (barème CSO, 1 point par seconde entamée) : même oracle.
    if (k != 1) continue;
    CourseJudge j(labels, c["allowed"].num());
    j.startCrossed();
    j.tick(c["t"].num());
    CHECK(j.points() == (int)c["out"].num(), "CourseJudge::points à %.12g s / %g : %d au lieu de %d", c["t"].num(), c["allowed"].num(), j.points(), (int)c["out"].num());
    nPoints++;
  }
  for (const J& c : o["compare"].a) {
    auto R = [](const J& x) { return RunResult{!x["eliminated"].isNull(), x["penalties"].isNull() ? 0 : (int)x["penalties"].num(), x["time"].isNull() ? 0 : x["time"].num()}; };
    int s = compareResults(R(c["a"]), R(c["b"]));
    CHECK((s > 0) - (s < 0) == (int)c["out"].num(), "classement");
  }
  std::printf("parcours : %zu obstacles, longueur %.2f m, abord %zu points, %zu pénalités de temps (%d par le juge), %zu comparaisons\n",
              t.fences.size(), t.length, t.leadIn.size(), o["timeFaults"].a.size(), nPoints, o["compare"].a.size());
}

// Écriture canonique d'une valeur JSON (comparaisons entre scénarios).
static std::string dump(const J& x) {
  char b[40];
  switch (x.t) {
    case J::Null: return "null";
    case J::Bool: return x.b ? "true" : "false";
    case J::Num: std::snprintf(b, sizeof b, "%.17g", x.n); return b;
    case J::Str: return "\"" + x.s + "\"";
    case J::Arr: { std::string s = "["; for (const J& e : x.a) s += dump(e) + ","; return s + "]"; }
    case J::Obj: { std::string s = "{"; for (const auto& [k, v] : x.o) s += k + ":" + dump(v) + ","; return s + "}"; }
  }
  return "";
}

// Oracles de scénario du banc de parité (scripts/unreal/export-cso-runs.mjs) : contrôle de schéma image par image, puis
// recoupements avec le cœur : ligne de départ du jeu web = repère du tracé + décalage de la carrière lu dans
// Content/Data, bip de départ à l'image où le cheval franchit cette ligne, et même simulation en français et en anglais
// (seuls les textes changent).
static void testRuns() {
  J o = loadJson(ORA + "/cso_runs.json");
  CHECK(o["schema"].s == "strides.oracle.cso_runs/1", "cso_runs : schéma « %s »", o["schema"].s.c_str());
  CHECK(o["dt"].t == J::Num && near(o["dt"].num(), 1.0 / 30), "cso_runs : pas fixe 1/30 s");
  CHECK(o["runs"].t == J::Arr && !o["runs"].a.empty(), "cso_runs : aucun scénario");
  auto num = [](const J& x) { return x.t == J::Num; };
  auto vec = [&](const J& x, size_t n) {
    if (x.t != J::Arr || x.a.size() != n) return false;
    for (const J& e : x.a) if (!num(e)) return false;
    return true;
  };
  auto strs = [](const J& x) {
    if (x.t != J::Arr) return false;
    for (const J& e : x.a) if (e.t != J::Str) return false;
    return true;
  };
  auto calls = [](const J& x, const char* key) {
    if (x.t != J::Arr) return false;
    for (const J& e : x.a) if (e.t != J::Obj || e[key].t != J::Str || (std::string(key) == "fn" && e["args"].t != J::Arr)) return false;
    return true;
  };
  const J data = loadJson(DATA + "/cso_course_pole.json");
  const double ax = data["arena"]["x"].num(), az = data["arena"]["z"].num();
  const CourseTrace tr = traceCourse(poleDesign());
  const TraceMark& sm = tr.marks.at("start");
  std::map<std::string, const J*> first;  // scénario → première langue rencontrée
  size_t nFrames = 0;
  for (const J& r : o["runs"].a) {
    const std::string id = r["id"].s, lang = r["lang"].s;
    const char* w = id.c_str();
    CHECK(!id.empty() && (lang == "fr" || lang == "en"), "cso_runs : identifiant ou langue (%s, %s)", w, lang.c_str());
    const J& su = r["setup"];
    CHECK(num(su["seed"]) && num(su["horse"]["x"]) && num(su["horse"]["z"]) && num(su["horse"]["h"]), "%s : pose de départ", w);
    CHECK(su["rails"].t == J::Obj && !su["rails"].o.empty(), "%s : barres initiales", w);
    for (const auto& [k, v] : su["rails"].o) CHECK(vec(v, 6), "%s : barre %s", w, k.c_str());
    // Ligne de départ du web (monde) = repère du tracé + carrière des données du jeu (précision de l'oracle : 1e-6).
    CHECK(std::abs(su["start"]["x"].num() - (ax + sm.x)) < 2e-6 && std::abs(su["start"]["z"].num() - (az + sm.z)) < 2e-6 && std::abs(su["start"]["rot"].num() - sm.rot) < 2e-6,
          "%s : ligne de départ web (%.6f ; %.6f) / cœur (%.6f ; %.6f)", w, su["start"]["x"].num(), su["start"]["z"].num(), ax + sm.x, az + sm.z);
    const J& fr = r["frames"];
    CHECK(fr.t == J::Arr && !fr.a.empty(), "%s : aucune image", w);
    const double nx = std::sin(sm.rot), nz = std::cos(sm.rot);
    int bip = -1, crossed = -1, jumps = 0, jumpFrame = -1, airborne = -1;
    for (size_t i = 0; i < fr.a.size(); i++) {
      const J& f = fr[i];
      const J& in = f["in"];
      const J& h = f["horse"];
      const J& c = f["cam"];
      bool ok = num(f["f"]) && (size_t)f["f"].num() == i;
      ok = ok && in.t == J::Obj && vec(in["move"], 2) && strs(in["keys"]) && strs(in["held"]) && in["jump"].t == J::Bool && (in["ui"].isNull() || in["ui"].t == J::Str);
      ok = ok && num(h["x"]) && num(h["y"]) && num(h["z"]) && num(h["h"]) && num(h["v"]) && num(h["jumpT"]) && num(h["jumpY"]) && (h["cad"].isNull() || num(h["cad"])) && h["mode"].t == J::Str;
      ok = ok && vec(c["eye"], 3) && vec(c["target"], 3) && vec(c["dir"], 3) && num(c["fov"]) && num(c["aspect"]);
      ok = ok && calls(f["ev"], "e") && calls(f["hud"], "fn") && calls(f["audio"], "fn");
      ok = ok && (f["run"].isNull() || f["run"].t == J::Obj) && (f["course"].isNull() || f["course"].t == J::Obj) && (f["board"].isNull() || f["board"].t == J::Obj);
      ok = ok && f["rails"].t == J::Arr;
      for (const J& rr : f["rails"].a) ok = ok && rr["r"].t == J::Str && vec(rr["t"], 6) && su["rails"].o.count(rr["r"].s);
      CHECK(ok, "%s (%s) : image %zu mal formée", w, lang.c_str(), i);
      if (!ok) break;
      for (const J& a : f["audio"].a)
        if (a["fn"].s == "tone" && !a["args"].a.empty() && a["args"][0].num() == 1568) bip = bip < 0 ? (int)i : bip;
      if (in["jump"].b) { jumps++; jumpFrame = (int)i; }
      if (jumpFrame >= 0 && airborne < 0 && h["jumpT"].num() >= 0) airborne = (int)i;
      if (i > 0 && crossed < 0) {
        const J& p = fr[i - 1]["horse"];
        const double s0 = (p["x"].num() - ax - sm.x) * nx + (p["z"].num() - az - sm.z) * nz;
        const double s1 = (h["x"].num() - ax - sm.x) * nx + (h["z"].num() - az - sm.z) * nz;
        const double u = std::abs((h["x"].num() - ax - sm.x) * nz - (h["z"].num() - az - sm.z) * nx);
        if (s0 < 0 && s1 >= 0 && u < 3.8) crossed = (int)i;
      }
    }
    nFrames += fr.a.size();
    if (id == "droit") {
      CHECK(bip >= 0 && bip == crossed, "%s (%s) : bip de départ à l'image %d, ligne du cœur franchie à l'image %d", w, lang.c_str(), bip, crossed);
      CHECK(jumps == 1 && airborne >= jumpFrame && airborne <= jumpFrame + 1, "%s (%s) : un appel (%d) suivi du saut (image %d → %d)", w, lang.c_str(), jumps, jumpFrame, airborne);
    }
    // Même scénario dans une autre langue : entrées, cheval, caméra, barres, sons et événements identiques ; textes traduits.
    if (!first.count(id)) { first[id] = &r; continue; }
    const J& a = (*first[id])["frames"];
    CHECK(a.a.size() == fr.a.size(), "%s : %zu images / %zu selon la langue", w, a.a.size(), fr.a.size());
    int textDiff = 0;
    for (size_t i = 0; i < a.a.size() && i < fr.a.size(); i++) {
      for (const char* k : {"in", "horse", "cam", "rails", "audio", "ev", "course"})
        CHECK(dump(a[i][k]) == dump(fr[i][k]), "%s : image %zu, « %s » dépend de la langue", w, i, k);
      textDiff += dump(a[i]["hud"]) != dump(fr[i]["hud"]);
    }
    CHECK(textDiff > 0, "%s : aucun texte traduit entre les langues", w);
  }
  std::printf("scénarios CSO : %zu (%zu images)\n", o["runs"].a.size(), nFrames);
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
  DATA = argc > 2 ? argv[2] : "../../StridesGrandTour/Content/Data";
  try {
    testJump();
    testRide();
    testCourse();
    testRuns();
    testJudge();
    testSave();
  } catch (const std::exception& e) {
    std::printf("exception : %s\n", e.what());
    return 2;
  }
  std::printf("%d vérifications, %d échecs\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
