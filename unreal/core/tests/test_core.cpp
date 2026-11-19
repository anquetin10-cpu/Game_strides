// Tests du cœur Strides (C++ pur) : rejoue les oracles exportés du jeu web (scripts/unreal/export-data.mjs) et des
// scénarios de jugement tirés des règles de src/gameplay/courses.js. Sortie non nulle au premier écart.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>

#include "StridesCore/CsoCourse.h"
#include "StridesCore/CsoHorse.h"
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

// ---------- Cheval de concours (tranche T2) : strides::csoHorseStep rejoué sur le canal « ch » de cso_runs.json ----------

// Obstacles relevés par le banc (champ obs) : reconstruits par makeCsoObstacle (portage de obstacles.js add / _bars /
// faces) et comparés à ceux du jeu.
static std::vector<CsoObstacle> obstaclesFrom(const J& obs, const std::string& who) {
  std::vector<CsoObstacle> v;
  for (const J& o : obs.a) {
    CsoObstacle b = makeCsoObstacle(o["kind"].s, o["x"].num(), o["z"].num(), o["rot"].num(), o["h"].num(), o["w"].num(), o["spread"].num(),
                                    o["label"].s, o["num"].isNull() ? 0 : (int)o["num"].num(), o["course"].s, o["solid"].b);
    b.off = o["off"].b;
    bool ok = b.label == o["label"].s && b.spread == o["spread"].num() && b.front == o["front"].num() && b.back == o["back"].num() && b.bars.size() == o["bars"].a.size();
    for (size_t k = 0; ok && k < b.bars.size(); k++) ok = b.bars[k].s == o["bars"][k][0].num() && b.bars[k].h == o["bars"][k][1].num();
    CHECK(ok, "%s : obstacle %s (%s) : barres ou faces différentes du jeu", who.c_str(), b.label.c_str(), b.kind.c_str());
    v.push_back(b);
  }
  return v;
}

static double orZero(const J& x) { return x.isNull() ? 0 : x.num(); }

// État relevé (s, a ou b) → état du cœur. Le plan du dernier saut n'est pas relevé : il est gardé tant que le saut
// relevé est le même.
static void loadHorse(CsoHorseState& s, const J& j) {
  s.x = j["x"].num(); s.z = j["z"].num(); s.heading = j["h"].num(); s.speed = j["v"].num();
  s.yawRate = orZero(j["yr"]); s.lastTurn = j["lt"].num();
  s.jumpT = j["jT"].num(); s.jumpY = j["jY"].num(); s.jumpPeak = orZero(j["jP"]); s.jumpLen = orZero(j["jL"]); s.jumpDur = orZero(j["jD"]);
  s.jt0 = j["j0"].isNull() ? -1 : j["j0"].num(); s.jt1 = j["j1"].isNull() ? -1 : j["j1"].num();
  s.rearT = orZero(j["rT"]); s.rearAnim = j["ra"].num(); s.brake = j["bk"].num();
  s.refusing = j["rf"].isNull() ? -1 : (int)j["rf"].num();
  const int lj = j["lj"].isNull() ? -1 : (int)j["lj"].num();
  if (lj < 0) { s.hasLastJump = false; s.lastJumpObstacle = -1; }
  else if (!s.hasLastJump || s.lastJumpObstacle != lj) { s.hasLastJump = true; s.lastJumpObstacle = lj; }
  s.hasCadence = !j["cad"].isNull(); s.cadence = orZero(j["cad"]);
  s.kbdSteer = orZero(j["ks"]); s.cadAdjust = j["ca"].b;
}

// Écart maximal par grandeur (m, rad, m/s, s) sur un scénario.
struct HorseDev { double pos = 0, head = 0, speed = 0, jump = 0, cad = 0, yaw = 0, other = 0; };

// Compare l'état du cœur à l'état relevé ; tolérance absolue 1e-6 (critère T2) ; renvoie la liste des écarts.
static std::string diffHorse(const CsoHorseState& s, const J& j, HorseDev& dev) {
  std::string why;
  char b[96];
  auto d = [&](const char* k, double a, double e, double& slot) {
    const double x = std::abs(a - e);
    slot = std::max(slot, x);
    if (!(x <= 1e-6)) { std::snprintf(b, sizeof b, " %s %.9g/%.9g", k, a, e); why += b; }
  };
  d("x", s.x, j["x"].num(), dev.pos);
  d("z", s.z, j["z"].num(), dev.pos);
  d("h", wrapAngle(s.heading - j["h"].num()), 0, dev.head);
  d("v", s.speed, j["v"].num(), dev.speed);
  d("jumpT", s.jumpT, j["jT"].num(), dev.jump);
  d("jumpY", s.jumpY, j["jY"].num(), dev.jump);
  d("yawRate", s.yawRate, orZero(j["yr"]), dev.yaw);
  d("rearT", s.rearT, orZero(j["rT"]), dev.other);
  d("brake", s.brake, j["bk"].num(), dev.other);
  d("kbdSteer", s.kbdSteer, orZero(j["ks"]), dev.other);
  d("lastTurn", s.lastTurn, j["lt"].num(), dev.other);
  if (s.jumpT >= 0) { d("jumpPeak", s.jumpPeak, orZero(j["jP"]), dev.jump); d("jumpDur", s.jumpDur, orZero(j["jD"]), dev.jump); }
  if (s.hasCadence != !j["cad"].isNull()) why += " cadence définie/indéfinie";
  else if (s.hasCadence) d("cadence", s.cadence, j["cad"].num(), dev.cad);
  if (s.cadAdjust != j["ca"].b) why += " cadAdjust";
  if (s.refusing != (j["rf"].isNull() ? -1 : (int)j["rf"].num())) why += " refusing";
  if ((s.hasLastJump ? s.lastJumpObstacle : -1) != (j["lj"].isNull() ? -1 : (int)j["lj"].num())) why += " lastJump";
  return why;
}

static std::string targetDiff(const CsoTarget& t, const J& e) {
  if (e.isNull()) return t.index < 0 ? "" : " cible inattendue";
  if (t.index < 0) return " cible absente";
  std::string why;
  char b[96];
  auto d = [&](const char* k, double a, const J& x) {
    if (x.isNull() ? std::isfinite(a) : !near(a, x.num(), 1e-9)) { std::snprintf(b, sizeof b, " %s %.12g/%.12g", k, a, x.isNull() ? NAN : x.num()); why += b; }
  };
  if (t.index != (int)e["o"].num()) why += " obstacle";
  d("x0", t.geo.rails.front().x, e["x0"]);
  d("cosA", t.geo.cosA, e["cosA"]);
  d("L0", t.plan.L0, e["L0"]);
  d("L", t.plan.L, e["L"]);
  d("H", t.plan.H, e["H"]);
  d("marge", t.plan.hasMargin ? t.plan.margin : INFINITY, e["m"]);
  d("ideal", t.plan.ideal, e["ideal"]);
  d("dev", t.plan.dev, e["dev"]);
  if (e["zone"].s != zoneName(t.plan.zone)) why += std::string(" zone ") + zoneName(t.plan.zone) + "/" + e["zone"].s;
  if ((e["cause"].isNull() ? std::string() : e["cause"].s) != causeName(t.plan.cause)) why += std::string(" cause ") + causeName(t.plan.cause);
  return why;
}

static bool hasKey(const J& keys, std::initializer_list<const char*> names) {
  for (const J& k : keys.a)
    for (const char* n : names) if (k.s == n) return true;
  return false;
}

// Rejeu chaîné : l'état du cœur n'est recalé sur l'état relevé qu'aux images marquées par le banc (a : changé avant
// player.update ; b : corrigé après horse.update par une collision ou par Obstacles.updateHorse, hors du pas du cheval).
static void testHorseRuns() {
  J o = loadJson(ORA + "/cso_runs.json");
  const J ride = loadJson(DATA + "/cso_ride.json");
  const J hp = loadJson(DATA + "/cso_horse.json");
  // Constantes nommées extraites du source par export-data.mjs = valeurs par défaut du portage.
  const CsoHorseParams& P = csoHorseDefaults();
  CHECK(hp["schema"].s == "strides.cso_horse/1" && hp["ref"].num() == P.ref && hp["nose"].num() == P.nose && hp["overrun"].num() == P.overrun &&
            hp["jumpDuration"].num() == P.jumpDuration && hp["minJumpSpeed"].num() == P.minJumpSpeed,
        "cso_horse.json : constantes REF / NOSE / OVERRUN / HORSE différentes du portage");
  CHECK(ride["kbdRamp"].num() == csoRideDefaults().kbdRamp && ride["airTurn"].num() == csoRideDefaults().airTurn && ride["landingLoss"].num() == csoRideDefaults().landingLoss &&
            ride["yawTau"].num() == csoRideDefaults().yawTau && ride["yawAcc"].num() == csoRideDefaults().yawAcc,
        "cso_ride.json : rampe clavier, airTurn, perte, τ ou accélération de lacet différents du portage");
  const char* required[] = {"droit", "bonne-zone", "virage-serre", "rampe-clavier", "ctrl-alt", "appui-10m", "appui-3ms", "abord-70"};
  std::map<std::string, int> clean;  // scénario → images rejouées sans recalage ni écart
  int keyFrames = 0, refusalsDecided = 0;
  for (const J& r : o["runs"].a) {
    const std::string id = r["id"].s, lang = r["lang"].s, who = id + " (" + lang + ")";
    const J& ch0 = r["setup"]["ch0"];
    CHECK(ch0.t == J::Obj && ch0["s"].t == J::Obj && ch0["obs"].t == J::Arr, "%s : état initial du cheval absent", who.c_str());
    if (ch0.t != J::Obj) continue;
    std::vector<CsoObstacle> obs = obstaclesFrom(ch0["obs"], who);
    CsoHorseState s;
    loadHorse(s, ch0["s"]);
    HorseDev dev;
    int resync = 0, bad = 0, evBad = 0, tmBad = 0, tgBad = 0, refBad = 0, n = 0;
    std::vector<std::string> evAll;
    for (const J& f : r["frames"].a) {
      const J& ch = f["ch"];
      if (ch.t != J::Obj) { bad++; continue; }
      const J& in = ch["in"];
      if (!ch["a"].isNull()) { loadHorse(s, ch["a"]); resync++; }
      // Clavier : le déplacement vu par player.update est celui de input.poll (portage keyboardMove).
      const J& keys = f["in"]["keys"];
      if (!keys.a.empty()) {
        const KeyboardMove km = keyboardMove(hasKey(keys, {"KeyW", "ArrowUp"}), hasKey(keys, {"KeyS", "ArrowDown"}), hasKey(keys, {"KeyD", "ArrowRight"}),
                                             hasKey(keys, {"KeyA", "ArrowLeft"}), hasKey(keys, {"ControlLeft"}), hasKey(keys, {"AltLeft"}));
        keyFrames++;
        CHECK(km.x == in["mx"].num() && km.y == in["my"].num() && km.keyMove == in["key"].b, "%s : image %d : clavier %g %g / %g %g", who.c_str(), (int)f["f"].num(), km.x, km.y, in["mx"].num(), in["my"].num());
      }
      CsoFrameInput fi;
      fi.dt = in["hdt"].isNull() ? in["dt"].num() : in["hdt"].num();
      fi.moveX = in["mx"].num(); fi.moveY = in["my"].num(); fi.keyMove = in["key"].b; fi.jumpPressed = in["jp"].b;
      fi.csoControls = in["cso"].b; fi.locked = in["lk"].b; fi.frozen = in["fz"].b; fi.playerHorse = in["pl"].b;
      fi.power = in["pow"].num(); fi.clearance = in["clr"].num(); fi.time = in["t"].num(); fi.slope = in["sl"].num();
      fi.waterDepth = orZero(in["wd"]); fi.waterAhead = orZero(in["wa"]);
      CHECK(in["dt"].num() == fi.dt || !in["hdt"].isNull(), "%s : pas", who.c_str());
      std::vector<CsoHorseEvent> evs;
      csoHorseStep(s, fi, obs, evs);
      // Événements du cheval (bus) : même suite.
      std::string got, want;
      for (CsoHorseEvent e : evs) { got += csoHorseEventName(e); got += ' '; evAll.push_back(csoHorseEventName(e)); }
      for (const J& e : f["ev"].a)
        if (e["e"].s == "horse:jump" || e["e"].s == "horse:jumpEarly" || e["e"].s == "horse:tooSlow" || e["e"].s == "horse:refuse" || e["e"].s == "horse:land") { want += e["e"].s; want += ' '; }
      if (got != want) { evBad++; if (evBad < 4) std::printf("  %s image %d : événements « %s » / « %s »\n", who.c_str(), (int)f["f"].num(), got.c_str(), want.c_str()); }
      const bool external = !ch["b"].isNull() || ch["col"].b;
      const J& expect = !ch["b"].isNull() ? ch["b"] : ch["s"];
      std::string why = ch["col"].b ? std::string() : diffHorse(s, expect, dev);
      if (!why.empty()) { bad++; if (bad < 4) std::printf("  %s image %d :%s\n", who.c_str(), (int)f["f"].num(), why.c_str()); }
      // Décision de refus à l'abord (extrait de updateHorse, évalué sur l'état après le pas du cheval) : même image.
      const int wantRef = !ch["b"].isNull() && ch["b"]["rf"].isNull() && !ch["s"]["rf"].isNull() ? (int)ch["s"]["rf"].num() : -1;
      const int gotRef = csoApproachRefusal(s, obs, fi.power, fi.clearance, fi.csoControls, fi.time);
      if (gotRef != wantRef) { refBad++; if (refBad < 3) std::printf("  %s image %d : refus à l'abord %d / %d\n", who.c_str(), (int)f["f"].num(), gotRef, wantRef); }
      if (wantRef >= 0) refusalsDecided++;
      if (external) { loadHorse(s, ch["s"]); resync++; }
      if (!ch["obs"].isNull()) obs = obstaclesFrom(ch["obs"], who);
      // Aide à l'appel et cible après l'image.
      const Zone tm = csoTiming(obs, s, fi.power, fi.clearance, fi.csoControls);
      if (ch["tm"].s != zoneName(tm)) tmBad++;
      const std::string td = targetDiff(csoTarget(obs, s, fi.power, fi.clearance, fi.csoControls), ch["tg"]);
      if (!td.empty()) { tgBad++; if (tgBad < 3) std::printf("  %s image %d : cible%s\n", who.c_str(), (int)f["f"].num(), td.c_str()); }
      n++;
    }
    CHECK(bad == 0 && evBad == 0 && tmBad == 0 && tgBad == 0 && refBad == 0, "%s : rejeu du cheval : %d images en écart, %d suites d'événements, %d aides, %d cibles, %d décisions de refus", who.c_str(), bad, evBad, tmBad, tgBad, refBad);
    std::printf("cheval %-14s %-2s : %3d images, %d recalages, écarts max : position %.2g m, cap %.2g rad, vitesse %.2g m/s, saut %.2g, cadence %.2g m/s, lacet %.2g rad/s ; événements :",
                id.c_str(), lang.c_str(), n, resync, dev.pos, dev.head, dev.speed, dev.jump, dev.cad, dev.yaw);
    for (const std::string& e : evAll) std::printf(" %s", e.c_str() + 6);
    std::printf("\n");
    if (bad == 0 && evBad == 0 && tmBad == 0 && tgBad == 0 && resync == 0 && n > 0) clean[id] = n;
    // Comportements attendus des scénarios de la tranche (en plus de l'identité au jeu web).
    auto count = [&](const char* e) { return (int)std::count(evAll.begin(), evAll.end(), std::string(e)); };
    if (id == "appui-10m") CHECK(count("horse:jumpEarly") == 1 && count("horse:jump") == 1 && evAll.front() == "horse:jumpEarly", "%s : appui à 10 m sans effet, puis saut", who.c_str());
    if (id == "appui-3ms") CHECK(count("horse:tooSlow") == 1 && count("horse:jump") == 0, "%s : trop lent, pas de saut", who.c_str());
    if (id == "abord-70") CHECK(count("horse:jumpEarly") == 1 && count("horse:jump") == 0, "%s : pas d'obstacle visé à 70°", who.c_str());
    if (id == "bonne-zone" || id == "droit") CHECK(count("horse:jump") == 1 && count("horse:land") == 1, "%s : un saut", who.c_str());
    if (id == "refus") CHECK(count("horse:refuse") >= 1 && count("horse:jump") == 0, "%s : refus (cabré) sans saut", who.c_str());
  }
  int ok = 0;
  for (const char* id : required) {
    CHECK(clean.count(id), "scénario %s : absent, recalé ou en écart", id);
    ok += (int)clean.count(id);
  }
  CHECK(keyFrames > 0, "aucune image au clavier");
  CHECK(refusalsDecided >= 2, "décisions de refus à l'abord rejouées : %d", refusalsDecided);
  std::printf("cheval de concours : %d scénarios requis rejoués sans recalage ni écart > 1e-6 ; %d images au clavier ; %d refus à l'abord décidés à la même image que le jeu\n", ok, keyFrames, refusalsDecided);
}

// Grille de visée : obstacles.target / timing du jeu (cso_target.json) = csoTarget / csoTiming.
static void testTarget() {
  J o = loadJson(ORA + "/cso_target.json");
  CHECK(o["schema"].s == "strides.oracle.cso_target/1", "cso_target : schéma");
  const std::vector<CsoObstacle> obs = obstaclesFrom(o["obs"], "cso_target");
  // Largeur des obstacles du parcours extraite du source (Content/Data/cso_horse.json) = celle du jeu en cours.
  const double fw = loadJson(DATA + "/cso_horse.json")["csoFenceWidth"].num();
  int csoFences = 0;
  for (const CsoObstacle& f : obs)
    if (f.course == "cso") { csoFences++; CHECK(f.w == fw, "obstacle %s : largeur %g / %g (cso_horse.json)", f.label.c_str(), f.w, fw); }
  CHECK(csoFences == 10, "obstacles du parcours dans la grille : %d", csoFences);
  const double power = o["power"].num(), clr = o["clearance"].num();
  const bool cso = o["cso"].b;
  int n = 0, bad = 0, hits = 0, zones[5] = {0, 0, 0, 0, 0};
  for (const J& c : o["list"].a) {
    CsoHorseState s;
    s.x = c["x"].num(); s.z = c["z"].num(); s.heading = c["h"].num(); s.speed = c["v"].num();
    s.jumpT = c["jT"].num(); s.refusing = c["rf"].isNull() ? -1 : (int)c["rf"].num();
    const CsoTarget t = csoTarget(obs, s, power, clr, cso);
    const Zone tm = csoTiming(obs, s, power, clr, cso);
    const std::string why = targetDiff(t, c["tg"]) + (c["tm"].s == zoneName(tm) ? "" : std::string(" timing ") + zoneName(tm) + "/" + c["tm"].s);
    if (!why.empty()) { bad++; if (bad < 6) std::printf("  visée, cas %d :%s\n", n, why.c_str()); }
    if (t.index >= 0) hits++;
    zones[(int)tm]++;
    n++;
  }
  CHECK(bad == 0 && n > 1000, "visée : %d cas sur %d différents du jeu", bad, n);
  std::printf("visée : %d cas (%d avec obstacle visé ; aide none %d, good %d, far %d, near %d)\n", n, hits, zones[0], zones[1], zones[2], zones[3]);
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
    testHorseRuns();
    testTarget();
    testJudge();
    testSave();
  } catch (const std::exception& e) {
    std::printf("exception : %s\n", e.what());
    return 2;
  }
  std::printf("%d vérifications, %d échecs\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
