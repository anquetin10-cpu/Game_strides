// Tests du cœur Strides (C++ pur) : rejoue les oracles exportés du jeu web (scripts/unreal/export-data.mjs) et des
// scénarios de jugement tirés des règles de src/gameplay/courses.js. Sortie non nulle au premier écart.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <map>
#include <set>
#include <sstream>
#include <string>

#include "StridesCore/CsoCourse.h"
#include "StridesCore/CsoFences.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCore/CsoRide.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/Text.h"
#include "StridesCore/JumpModel.h"
#include "StridesCore/MathUtil.h"
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

// Événements du bus sans ceux des autres chevaux (cavaliers du décor) : d.horse est l'identifiant du cheval
// (horse:exhausted) ou son résumé { horse: id } (horse:step) ; texte de cause des fautes retiré.
static std::string playerEvents(const J& ev, const std::string& horseId) {
  std::string s;
  for (const J& e : ev.a) {
    const J& h = e["d"]["horse"];
    const std::string id = h.t == J::Str ? h.s : h.t == J::Obj && h["horse"].t == J::Str ? h["horse"].s : horseId;
    if (id != horseId) continue;
    // Texte de la cause d'une faute (obstacle:fault, causeText) : traduit, seul champ qui dépend de la langue.
    J c = e;
    if (c.o.count("d")) c.o["d"].o.erase("causeText");
    s += dump(c) + ";";
  }
  return s;
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
      // Scénarios légers (tranche T4) : ni caméra ni canal « ch », canal « ep » à chaque image.
      if (su["lite"].b) ok = ok && c.isNull() && f["ch"].isNull() && f["ep"].t == J::Obj && num(f["ep"]["dt"]) && num(f["ep"]["x"]) && f["ep"]["mode"].t == J::Str;
      else ok = ok && vec(c["eye"], 3) && vec(c["target"], 3) && vec(c["dir"], 3) && num(c["fov"]) && num(c["aspect"]);
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
      for (const char* k : {"in", "horse", "cam", "rails", "audio", "course"})
        CHECK(dump(a[i][k]) == dump(fr[i][k]), "%s : image %zu, « %s » dépend de la langue", w, i, k);
      // Événements du bus : ceux des chevaux des cavaliers du décor (d.horse d'un autre cheval que celui du joueur)
      // ne sont pas comparés d'une langue à l'autre (constaté sur t4-sans-faute : foulées et fatigue d'un cavalier de
      // l'ambiance décalées de quelques images après 47 s ; sans effet sur l'épreuve).
      CHECK(playerEvents(a[i]["ev"], su["horseId"].s) == playerEvents(fr[i]["ev"], su["horseId"].s), "%s : image %zu, « ev » dépend de la langue", w, i);
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
  // Les 8 scénarios du critère de T2, puis les compléments du contrôle de T2 (rotation en l'air, plafond de
  // ralentissement de 9 m/s², perte d'élan plafonnée à la réception).
  const char* required[] = {"droit", "bonne-zone", "virage-serre", "rampe-clavier", "ctrl-alt", "appui-10m", "appui-3ms", "abord-70",
                            "virage-en-lair", "survitesse", "appel-pres"};
  std::map<std::string, int> clean;  // scénario → images rejouées sans recalage ni écart
  int keyFrames = 0, refusalsDecided = 0, refusalBrakes = 0, refusalBrakeBad = 0;
  // Témoins relevés dans l'oracle (jeu web) : les branches visées sont bien exercées par les scénarios rejoués.
  std::map<std::string, int> airYaw, decelCap, lossCap;
  for (const J& r : o["runs"].a) {
    const std::string id = r["id"].s, lang = r["lang"].s, who = id + " (" + lang + ")";
    if (r["setup"]["lite"].b) continue;  // scénarios légers de la tranche T4 : pas de canal « ch » (testCsoRuns)
    const J& ch0 = r["setup"]["ch0"];
    CHECK(ch0.t == J::Obj && ch0["s"].t == J::Obj && ch0["obs"].t == J::Arr, "%s : état initial du cheval absent", who.c_str());
    if (ch0.t != J::Obj) continue;
    std::vector<CsoObstacle> obs = obstaclesFrom(ch0["obs"], who);
    CsoHorseState s;
    loadHorse(s, ch0["s"]);
    HorseDev dev;
    int resync = 0, bad = 0, evBad = 0, tmBad = 0, tgBad = 0, refBad = 0, n = 0;
    std::vector<std::string> evAll;
    const J* prevS = &ch0["s"];
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
      // Événements du cheval émis pendant horse.update (ch.he ; ceux de Obstacles.updateHorse, comme le horse:refuse
      // d'une glissade, sont rejoués par testFenceRuns) : même suite.
      std::string got, want;
      for (CsoHorseEvent e : evs) { got += csoHorseEventName(e); got += ' '; evAll.push_back(csoHorseEventName(e)); }
      for (const J& e : ch["he"].a)
        if (e.s == "horse:jump" || e.s == "horse:jumpEarly" || e.s == "horse:tooSlow" || e.s == "horse:refuse" || e.s == "horse:land") { want += e.s; want += ' '; }
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
      // Refus décidé : freinage calculé par csoRefuse (obstacles.js refuse → horse.js brake) sur l'état du cœur, comparé
      // au freinage et à l'obstacle refusé relevés en fin d'image (le garde-fou du nez, T3, ne touche que la position).
      if (wantRef >= 0 && gotRef == wantRef) {
        CsoHorseState t = s;
        csoRefuse(t, obs, gotRef, P);
        refusalBrakes++;
        if (!near(t.brake, ch["s"]["bk"].num(), 1e-12) || t.refusing != wantRef) {
          refusalBrakeBad++;
          std::printf("  %s image %d : freinage du refus %.17g / %.17g\n", who.c_str(), (int)f["f"].num(), t.brake, ch["s"]["bk"].num());
        }
      }
      // Témoins (valeurs du jeu web) : lacet non nul en l'air ; ralentissement au plafond de 9 m/s² ; perte d'élan à la
      // réception au plafond (landingLoss).
      {
        const J& e = ch["s"];
        const J& p = *prevS;
        if (e["jT"].num() >= 0 && std::abs(orZero(e["yr"])) > 0.05) airYaw[id]++;
        if (e["jT"].num() < 0 && p["jT"].num() < 0 && e["bk"].num() == 0 && near((p["v"].num() - e["v"].num()) / fi.dt, 9, 1e-9)) decelCap[id]++;
        if (p["jT"].num() >= 0 && e["jT"].num() < 0 && near(e["v"].num() / p["v"].num(), 1 - csoRideDefaults().landingLoss, 1e-12)) lossCap[id]++;
        prevS = &e;
      }
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
    if (id == "virage-en-lair") CHECK(count("horse:jump") == 1 && airYaw[id] >= 10, "%s : lacet en l'air sur %d images", who.c_str(), airYaw[id]);
    if (id == "survitesse") CHECK(decelCap[id] >= 3, "%s : ralentissement à 9 m/s² sur %d images", who.c_str(), decelCap[id]);
    if (id == "appel-pres") CHECK(count("horse:jump") == 1 && lossCap[id] == 1, "%s : perte d'élan plafonnée à la réception (%d)", who.c_str(), lossCap[id]);
    if (id == "abord-61") CHECK(count("horse:refuse") == 1 && count("horse:jump") == 0, "%s : refus hors de l'angle de saut", who.c_str());
  }
  int ok = 0;
  for (const char* id : required) {
    CHECK(clean.count(id), "scénario %s : absent, recalé ou en écart", id);
    ok += (int)clean.count(id);
  }
  CHECK(keyFrames > 0, "aucune image au clavier");
  CHECK(refusalsDecided >= 3, "décisions de refus à l'abord rejouées : %d", refusalsDecided);
  CHECK(refusalBrakes == refusalsDecided && refusalBrakeBad == 0, "freinages de refus : %d comparés, %d différents du jeu", refusalBrakes, refusalBrakeBad);
  int air = 0, dec = 0, loss = 0;
  for (auto& [k, v] : airYaw) air += v;
  for (auto& [k, v] : decelCap) dec += v;
  for (auto& [k, v] : lossCap) loss += v;
  std::printf("cheval de concours : %d scénarios requis rejoués sans recalage ni écart > 1e-6 ; %d images au clavier ; %d refus à l'abord décidés à la même image que le jeu, freinage identique ; témoins : %d images en l'air avec lacet, %d images au plafond de 9 m/s², %d réceptions au plafond de perte\n", ok, keyFrames, refusalsDecided, air, dec, loss);
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
  int n = 0, bad = 0, hits = 0, zones[5] = {0, 0, 0, 0, 0}, inMargin = 0, outMargin = 0;
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
    // Témoins de la tolérance latérale : décalage du point de passage posé entre la demi-largeur et + 0,35 m (visé par
    // le jeu), ou au-delà (non visé), abord de face.
    const double u0 = std::abs(c["ref"][3].num());
    if (c["ref"][2].num() == 0 && c["ref"].a.size() == 5) {
      if (u0 > fw / 2 && u0 <= fw / 2 + 0.35 && !c["tg"].isNull()) inMargin++;
      if (u0 > fw / 2 + 0.35 && c["tg"].isNull()) outMargin++;
    }
    n++;
  }
  CHECK(bad == 0 && n > 1000, "visée : %d cas sur %d différents du jeu", bad, n);
  CHECK(inMargin > 0 && outMargin > 0, "visée : tolérance latérale de 0,35 m non exercée (%d dans la marge, %d au-delà)", inMargin, outMargin);
  std::printf("visée : %d cas (%d avec obstacle visé ; aide none %d, good %d, far %d, near %d ; de face, %d visés dans la marge latérale de 0,35 m, %d non visés au-delà)\n",
              n, hits, zones[0], zones[1], zones[2], zones[3], inMargin, outMargin);
}

// Appui SAUT et refus décidé sur des poses du cheval (cso_target.json, listes press et refuse) : Horse.startJump et
// Obstacles.refuse du jeu = csoStartJump et csoRefuse (toutes les branches : trop lent, en l'air, refus engagé, trop tôt,
// sans obstacle visé, zone refuse devant ou déjà dans l'obstacle, saut ; freinage v²/2d ou v/0,5).
static void testPress() {
  J o = loadJson(ORA + "/cso_target.json");
  const std::vector<CsoObstacle> obs = obstaclesFrom(o["obs"], "cso_target");
  const bool cso = o["cso"].b;
  CHECK(o["press"].a.size() > 1000 && o["refuse"].a.size() > 500, "appuis / refus absents de cso_target.json");
  int n = 0, bad = 0, jumps = 0, early = 0, refused = 0, ignored = 0, slow = 0, busy = 0;
  for (const J& c : o["press"].a) {
    CsoHorseState s;
    s.x = c["x"].num(); s.z = c["z"].num(); s.heading = c["h"].num(); s.speed = c["v"].num();
    s.jumpT = c["jT0"].num(); s.refusing = c["rf0"].isNull() ? -1 : (int)c["rf0"].num();
    CsoFrameInput fi;
    fi.power = c["pow"].num(); fi.clearance = c["clr"].num(); fi.time = c["t"].num(); fi.csoControls = cso; fi.playerHorse = true;
    const CsoTarget tg = csoTarget(obs, s, fi.power, fi.clearance, cso);
    std::vector<CsoHorseEvent> evs;
    const bool ok = csoStartJump(s, fi, obs, evs);
    std::string why;
    char b[128];
    auto d = [&](const char* k, double a, const J& e) {
      if (e.isNull() || !near(a, e.num(), 1e-12)) { std::snprintf(b, sizeof b, " %s %.17g/%.17g", k, a, e.isNull() ? NAN : e.num()); why += b; }
    };
    if (ok != c["ok"].b) why += " valeur rendue";
    std::string got, want;
    for (CsoHorseEvent e : evs) { got += csoHorseEventName(e); got += ' '; }
    for (const J& e : c["ev"].a) { want += e.s; want += ' '; }
    if (got != want) why += " événements « " + got + "» / « " + want + "»";
    d("jumpT", s.jumpT, c["jT"]);
    if (ok) { d("jumpPeak", s.jumpPeak, c["jP"]); d("jumpLen", s.jumpLen, c["jL"]); d("jumpDur", s.jumpDur, c["jD"]); }
    d("brake", s.brake, c["bk"]);
    if (s.refusing != (c["rf"].isNull() ? -1 : (int)c["rf"].num())) why += " refusing";
    if ((s.hasLastJump ? s.lastJumpObstacle : -1) != (c["lj"].isNull() ? -1 : (int)c["lj"].num())) why += " lastJump";
    if (!why.empty()) { bad++; if (bad < 6) std::printf("  appui, cas %d :%s\n", n, why.c_str()); }
    // Branches exercées (lues sur le résultat du jeu).
    if (c["jT0"].num() >= 0 || !c["rf0"].isNull()) busy++;
    else if (c["v"].num() < csoHorseDefaults().minJumpSpeed) slow++;
    else if (c["ok"].b) jumps++;
    else if (!c["ev"].a.empty()) early++;
    else if (!c["rf"].isNull()) refused++;
    else if (tg.index >= 0 && tg.plan.zone == Zone::Refuse && tg.geo.rails.front().x < 0) ignored++;
    n++;
  }
  CHECK(bad == 0, "appui SAUT : %d cas sur %d différents du jeu", bad, n);
  CHECK(jumps > 0 && early > 0 && refused > 0 && ignored > 0 && slow > 0 && busy > 0,
        "appui SAUT : branche non exercée (saut %d, trop tôt %d, refus %d, ignoré %d, trop lent %d, en l'air ou en refus %d)", jumps, early, refused, ignored, slow, busy);
  std::printf("appui SAUT : %d cas (saut %d, trop tôt ou sans obstacle %d, refus tout contre %d, ignoré dans l'obstacle %d, trop lent %d, en l'air ou déjà en refus %d)\n",
              n, jumps, early, refused, ignored, slow, busy);
  int m = 0, rbad = 0, dist = 0, time = 0;
  for (const J& c : o["refuse"].a) {
    CsoHorseState s;
    s.x = c["x"].num(); s.z = c["z"].num(); s.heading = c["h"].num(); s.speed = c["v"].num();
    csoRefuse(s, obs, (int)c["o"].num());
    if (!near(s.brake, c["bk"].num(), 1e-12) || s.refusing != (c["rf"].isNull() ? -1 : (int)c["rf"].num())) {
      rbad++;
      if (rbad < 6) std::printf("  refus, cas %d : freinage %.17g / %.17g\n", m, s.brake, c["bk"].num());
    }
    if (c["bk"].num() > c["v"].num() / 0.5) dist++; else time++;
    m++;
  }
  CHECK(rbad == 0 && dist > 0 && time > 0, "refus décidé : %d cas sur %d différents du jeu (v²/2d %d, v/0,5 %d)", rbad, m, dist, time);
  std::printf("refus décidé : %d cas (freinage v²/2d %d, v/0,5 %d)\n", m, dist, time);
}

// ---------- Obstacles (tranche T3) : csoHorseStep + csoLimbContact + csoFencesUpdateHorse + csoFencesUpdate rejoués en
// chaîne sur le canal « ch » de cso_runs.json, comparés en fin d'image (état du cheval, passage, refus, barres) ----------

// Passage et dernier refus relevés (ob.ps, ob.rl) → état du cœur.
static void loadPass(CsoHorseState& s, const J& ob) {
  const J& ps = ob["ps"];
  s.hasPass = !ps.isNull();
  if (s.hasPass) {
    s.pass.o = (int)ps["o"].num(); s.pass.dir = (int)ps["dir"].num(); s.pass.fault = ps["f"].b; s.pass.done = ps["d"].b;
    s.pass.cause = ps["c"].isNull() ? "" : ps["c"].s;
    s.pass.margin = ps["m"].isNull() ? INFINITY : ps["m"].num();
    s.pass.exitT = ps["x"].isNull() ? 0 : ps["x"].num();
  }
  const J& rl = ob["rl"];
  s.hasRefusal = !rl.isNull();
  if (s.hasRefusal) s.refusal = CsoRefusalMemo{(int)rl["o"].num(), rl["t"].num(), rl["a"].b};
}

// Barre hors de son repos (même règle que fenceState() dans export-cso-runs.mjs).
static bool railMoved(const CsoRail& r) { return r.falling || r.rattle > 0 || r.y != r.restY || r.z != r.restZ || r.rx != r.restRx || r.rz != 0; }

struct FenceDev { double rail = 0, margin = 0, fall = 0; };

// État des obstacles et du passage du cœur ↔ relevé (ob). Tolérance absolue 1e-6 (critère T3), 1e-9 sur les heures.
static std::string diffFences(const CsoHorseState& s, const std::vector<CsoFenceState>& st, const J& ob, FenceDev& dev) {
  std::string why;
  char b[160];
  auto d = [&](const char* k, double a, double e, double& slot, double tol = 1e-6) {
    const double x = std::abs(a - e);
    slot = std::max(slot, x);
    if (!(x <= tol)) { std::snprintf(b, sizeof b, " %s %.12g/%.12g", k, a, e); why += b; }
  };
  double dummy = 0;
  const J& ps = ob["ps"];
  if (s.hasPass != !ps.isNull()) why += " passage présent/absent";
  else if (s.hasPass) {
    if (s.pass.o != (int)ps["o"].num() || s.pass.dir != (int)ps["dir"].num() || s.pass.fault != ps["f"].b || s.pass.done != ps["d"].b ||
        s.pass.cause != (ps["c"].isNull() ? std::string() : ps["c"].s))
      why += " passage (obstacle, sens, faute, annoncé ou cause)";
    if (ps["m"].isNull() ? std::isfinite(s.pass.margin) : !std::isfinite(s.pass.margin)) why += " marge infinie/finie";
    else if (!ps["m"].isNull()) d("marge", s.pass.margin, ps["m"].num(), dev.margin);
    if (ps["x"].isNull() ? s.pass.exitT != 0 : !near(s.pass.exitT, ps["x"].num(), 1e-12)) why += " heure de sortie";
  }
  const J& rl = ob["rl"];
  if (s.hasRefusal != !rl.isNull()) why += " refus compté présent/absent";
  else if (s.hasRefusal && (s.refusal.o != (int)rl["o"].num() || s.refusal.away != rl["a"].b || !near(s.refusal.t, rl["t"].num(), 1e-12)))
    why += " dernier refus (obstacle, heure ou détour)";
  std::map<int, const J*> rec;
  for (const J& e : ob["fs"].a) rec[(int)e["i"].num()] = &e;
  for (size_t i = 0; i < st.size(); i++) {
    const CsoFenceState& f = st[i];
    std::vector<int> moved;
    for (size_t k = 0; k < f.rails.size(); k++) if (railMoved(f.rails[k])) moved.push_back((int)k);
    const bool active = f.knocked || f.rebuild || !f.pending.empty() || !moved.empty();
    auto it = rec.find((int)i);
    if (active != (it != rec.end())) { std::snprintf(b, sizeof b, " obstacle %zu actif %d/%d", i, (int)active, (int)(it != rec.end())); why += b; continue; }
    if (!active) continue;
    const J& e = *it->second;
    if (f.knocked != e["kn"].b) why += " renversé";
    d("remise", f.rebuild, e["rb"].num(), dummy, 1e-9);
    if (f.pending.size() != e["pd"].a.size()) why += " barres en attente (nombre)";
    else
      for (size_t k = 0; k < f.pending.size(); k++) {
        const J& p = e["pd"][k];
        const CsoPendingBar& q = f.pending[k];
        if (q.bar != (int)p[0].num() || q.dir != p[1].num() || q.side != p[2].num()) why += " barre en attente";
        d("attente.hit", q.hit, p[3].num(), dev.rail);
        d("attente.reste", q.left, p[4].num(), dev.rail);
      }
    if (moved.size() != e["r"].a.size()) { std::snprintf(b, sizeof b, " obstacle %zu : %zu barres déplacées / %zu", i, moved.size(), e["r"].a.size()); why += b; continue; }
    for (size_t k = 0; k < moved.size(); k++) {
      const J& r = e["r"][k];
      const CsoRail& q = f.rails[moved[k]];
      if (moved[k] != (int)r[0].num()) { why += " rang de barre"; continue; }
      d("y", q.y, r[1].num(), dev.rail);
      d("z", q.z, r[2].num(), dev.rail);
      d("rx", q.rx, r[3].num(), dev.rail);
      d("rz", q.rz, r[4].num(), dev.rail);
      d("vibration", q.rattle, r[5].num(), dev.rail);
      const J& fa = r[6];
      if (q.falling != !fa.isNull()) { why += " chute présente/absente"; continue; }
      if (!q.falling) continue;
      const CsoRailFall& c = q.fall;
      d("chute.t", c.t, fa["t"].num(), dev.fall);
      if (c.dir != fa["dir"].num() || c.side != fa["side"].num() || c.clonk != fa["ck"].b || c.done != fa["dn"].b) why += " chute (sens, côté, choc, fin)";
      d("chute.hit", c.hit, fa["hit"].num(), dev.fall);
      if (c.started != !fa["e"].isNull()) { why += " bouts posés/non posés"; continue; }
      if (!c.started) continue;
      for (int k2 = 0; k2 < 2; k2++) {
        d("bout.y", c.ends[k2].y, fa["e"][k2][0].num(), dev.fall);
        d("bout.vy", c.ends[k2].vy, fa["e"][k2][1].num(), dev.fall);
        d("bout.t0", c.ends[k2].t0, fa["e"][k2][2].num(), dev.fall);
      }
      d("chute.z", c.z, fa["z"].num(), dev.fall);
      d("chute.vz", c.vz, fa["vz"].num(), dev.fall);
      d("chute.roll", c.roll, fa["roll"].num(), dev.fall);
    }
  }
  return why;
}

static void testFenceRuns() {
  J o = loadJson(ORA + "/cso_runs.json");
  const J hp = loadJson(DATA + "/cso_horse.json");
  CHECK(hp["hindTrail"].num() == csoFenceDefaults().hindTrail, "cso_horse.json : HIND_TRAIL %g / portage %g", hp["hindTrail"].num(), csoFenceDefaults().hindTrail);
  // Critère T3 : ces scénarios rejoués en chaîne sans recalage ni écart (dont refus et abord-61, recalés par T2).
  const char* required[] = {"t3-sans-faute", "t3-oxer-loin", "t3-pres-montee", "t3-posterieurs", "t3-effleurement", "t3-faute-limite",
                            "t3-effleurement-haut", "t3-refus-62", "t3-refus-lent", "t3-refus-oblique", "t3-refus-5s", "t3-glissade",
                            "refus", "abord-61"};
  // Rejoués sans écart, recalés seulement aux images de collision avec le décor (colliders.resolve, non porté) : le
  // cheval s'éloigne du 7 en frôlant une aile après avoir tourné le dos (remise de la barre par le jury).
  const char* withCollisions[] = {"t3-tout-contre-remonte"};
  std::map<std::string, int> clean, colOnly;
  // Témoins relevés dans l'oracle (jeu web) et branches du portage exercées.
  std::map<std::string, int> wit;
  int frames = 0, railCmp = 0;
  double railDevMax = 0;
  for (const J& r : o["runs"].a) {
    const std::string id = r["id"].s, lang = r["lang"].s, who = id + " (" + lang + ")";
    if (r["setup"]["lite"].b) continue;  // scénarios légers de la tranche T4 : pas de canal « ch » (testCsoRuns)
    const J& ch0 = r["setup"]["ch0"];
    if (ch0["ob"].isNull()) { CHECK(false, "%s : état initial des obstacles absent (oracle antérieur à T3)", who.c_str()); continue; }
    std::vector<CsoObstacle> obs = obstaclesFrom(ch0["obs"], who);
    std::vector<CsoFenceState> st = csoFenceStates(obs);
    CsoHorseState s;
    loadHorse(s, ch0["s"]);
    loadPass(s, ch0["ob"]);
    HorseDev dev;
    FenceDev fdev;
    int resync = 0, cols = 0, bad = 0, fbad = 0, evBad = 0, oeBad = 0, sndBad = 0, railBad = 0, n = 0;
    std::map<std::string, int> cnt;  // événements du cœur sur ce scénario
    std::vector<double> margins;     // marges des franchissements et fautes annoncés
    // Barres du parcours relevées (canal rails, arrondi au millionième) : état initial, puis changements image par image.
    std::map<std::string, std::vector<double>> rails;
    for (const auto& [k, v] : r["setup"]["rails"].o) { std::vector<double> t; for (const J& x : v.a) t.push_back(x.num()); rails[k] = t; }
    std::set<int> knockedBefore;
    std::string why0 = diffFences(s, st, ch0["ob"], fdev);
    CHECK(why0.empty(), "%s : état initial des obstacles :%s", who.c_str(), why0.c_str());
    for (const J& f : r["frames"].a) {
      const J& ch = f["ch"];
      if (ch.t != J::Obj) { bad++; continue; }
      const J& in = ch["in"];
      if (!ch["a"].isNull()) { loadHorse(s, ch["a"]); resync++; }
      const double prevX = s.x, prevZ = s.z;
      CsoFrameInput fi;
      fi.dt = in["hdt"].isNull() ? in["dt"].num() : in["hdt"].num();
      fi.moveX = in["mx"].num(); fi.moveY = in["my"].num(); fi.keyMove = in["key"].b; fi.jumpPressed = in["jp"].b;
      fi.csoControls = in["cso"].b; fi.locked = in["lk"].b; fi.frozen = in["fz"].b; fi.playerHorse = in["pl"].b;
      fi.power = in["pow"].num(); fi.clearance = in["clr"].num(); fi.time = in["t"].num(); fi.slope = in["sl"].num();
      fi.waterDepth = orZero(in["wd"]); fi.waterAhead = orZero(in["wa"]);
      std::vector<CsoHorseEvent> evs;
      csoHorseStep(s, fi, obs, evs);
      // Collision du monde pendant horse.update (non portée) : recalage sur l'état relevé après horse.update.
      if (ch["col"].b) { loadHorse(s, ch["b"].isNull() ? ch["s"] : ch["b"]); resync++; cols++; }
      CsoFenceOut out;
      // Contacts des membres signalés par le cheval WildMesh pendant horse.update (détection non portée : entrée).
      for (const J& c : ch["lc"].a) {
        csoLimbContact(s, obs, st, CsoLimbHit{(int)c["o"].num(), (int)c["bar"].num(), c["d"].num(), c["u"].num(), c["hind"].b}, fi.time, out);
        wit["contact de membre"]++;
      }
      CsoUpdateHorseInput uh;
      uh.prevX = prevX; uh.prevZ = prevZ;
      uh.time = in["ut"].isNull() ? fi.time : in["ut"].num();
      uh.limbJudged = in["lj"].b;
      uh.power = fi.power; uh.clearance = fi.clearance; uh.csoCourse = fi.csoControls;
      const double bx = s.x, bz = s.z;
      const size_t horseEv0 = out.horse.size();
      csoFencesUpdateHorse(s, obs, st, uh, out);
      const bool slid = out.horse.size() > horseEv0;
      if (slid) wit["glissade (refus sur place)"]++;
      else if (s.x != bx || s.z != bz) wit["garde-fou du nez (poussée)"]++;
      CsoFencesUpdateInput ui;
      ui.dt = in["odt"].isNull() ? in["dt"].num() : in["odt"].num();
      ui.time = in["ot"].isNull() ? fi.time : in["ot"].num();
      ui.missionActive = in["ma"].b;
      ui.focusX = s.x; ui.focusZ = s.z;
      csoFencesUpdate(obs, st, ui, out);
      // Événements du cheval (horse.update puis updateHorse) : même suite que le bus du jeu sur l'image.
      std::string got, want;
      for (CsoHorseEvent e : evs) { got += csoHorseEventName(e); got += ' '; }
      for (CsoHorseEvent e : out.horse) { got += csoHorseEventName(e); got += ' '; }
      for (const J& e : f["ev"].a)
        if (e["e"].s == "horse:jump" || e["e"].s == "horse:jumpEarly" || e["e"].s == "horse:tooSlow" || e["e"].s == "horse:refuse" || e["e"].s == "horse:land") { want += e["e"].s; want += ' '; }
      if (got != want) { evBad++; if (evBad < 4) std::printf("  %s image %d : événements du cheval « %s » / « %s »\n", who.c_str(), (int)f["f"].num(), got.c_str(), want.c_str()); }
      // Événements des obstacles (pleine précision) : même suite, même obstacle, sens, marge (1e-6), cause.
      std::string ow;
      const J& oe = ch["oe"];
      if (out.events.size() != oe.a.size()) ow += " nombre";
      else
        for (size_t k = 0; k < out.events.size(); k++) {
          const CsoFenceEvent& e = out.events[k];
          const J& x = oe[k];
          if (x["e"].s != csoFenceEventName(e.kind) || e.obstacle != (int)x["o"].num() || e.dir != (int)x["dir"].num()) ow += " événement";
          if (e.kind != CsoFenceEventKind::Refusal) {
            if (x["m"].isNull() ? std::isfinite(e.margin) : !(std::abs(e.margin - x["m"].num()) <= 1e-6)) ow += " marge";
            else if (!x["m"].isNull()) fdev.margin = std::max(fdev.margin, std::abs(e.margin - x["m"].num()));
          }
          if (e.cause != (x["c"].isNull() ? std::string() : x["c"].s)) ow += " cause " + e.cause;
        }
      for (const CsoFenceEvent& e : out.events) {
        cnt[csoFenceEventName(e.kind)]++;
        if (e.kind != CsoFenceEventKind::Refusal) margins.push_back(e.margin);
        if (e.kind == CsoFenceEventKind::Fault) wit["faute cause " + e.cause]++;
        if (e.kind == CsoFenceEventKind::Clear) wit["franchi"]++;
        if (e.kind == CsoFenceEventKind::Refusal) wit["refus compté"]++;
      }
      for (CsoHorseEvent e : evs) if (e == CsoHorseEvent::Refuse) cnt["horse:refuse"]++;
      for (CsoHorseEvent e : out.horse) if (e == CsoHorseEvent::Refuse) cnt["horse:refuse"]++;
      if (!ow.empty()) { oeBad++; if (oeBad < 4) std::printf("  %s image %d : événements d'obstacle%s\n", who.c_str(), (int)f["f"].num(), ow.c_str()); }
      // Sons des obstacles (game.audio) : même suite.
      std::string sg, sw;
      for (CsoFenceSound x : out.sounds) { sg += csoFenceSoundName(x); sg += ' '; cnt[csoFenceSoundName(x)]++; }
      for (const J& a : f["audio"].a)
        if (a["fn"].s == "railFall" || a["fn"].s == "railTouch" || a["fn"].s == "thud") { sw += a["fn"].s; sw += ' '; }
      if (sg != sw) { sndBad++; if (sndBad < 4) std::printf("  %s image %d : sons « %s » / « %s »\n", who.c_str(), (int)f["f"].num(), sg.c_str(), sw.c_str()); }
      // État du cheval en fin d'image (après updateHorse : refus, poussée, glissade).
      const std::string why = diffHorse(s, ch["s"], dev);
      if (!why.empty()) { bad++; if (bad < 4) std::printf("  %s image %d :%s\n", who.c_str(), (int)f["f"].num(), why.c_str()); }
      if (!ch["obs"].isNull()) {
        // Hauteurs changées par l'épreuve (setHeights → _mesh) : barres reconstruites au repos, état du jeu gardé.
        std::vector<CsoObstacle> nobs = obstaclesFrom(ch["obs"], who);
        std::vector<CsoFenceState> fresh = csoFenceStates(nobs);
        for (size_t i = 0; i < fresh.size() && i < st.size() && i < obs.size(); i++) {
          bool same = obs[i].bars.size() == nobs[i].bars.size() && obs[i].h == nobs[i].h;
          for (size_t k = 0; same && k < obs[i].bars.size(); k++) same = obs[i].bars[k].s == nobs[i].bars[k].s && obs[i].bars[k].h == nobs[i].bars[k].h;
          if (same) fresh[i] = st[i];
          else { fresh[i].knocked = st[i].knocked; fresh[i].rebuild = st[i].rebuild; fresh[i].pending = st[i].pending; }
        }
        obs = nobs;
        st = fresh;
      }
      const std::string fw = diffFences(s, st, ch["ob"], fdev);
      if (!fw.empty()) { fbad++; if (fbad < 4) std::printf("  %s image %d : obstacles%s\n", who.c_str(), (int)f["f"].num(), fw.c_str()); }
      // Transformées des barres du parcours (canal rails, arrondi au millionième) : 1e-6 m / rad par image.
      for (const J& x : f["rails"].a) { std::vector<double> t; for (const J& v : x["t"].a) t.push_back(v.num()); rails[x["r"].s] = t; }
      for (size_t i = 0; i < obs.size(); i++) {
        if (obs[i].course != "cso") continue;
        for (size_t k = 0; k < st[i].rails.size(); k++) {
          const auto itR = rails.find(obs[i].label + "/" + std::to_string(k));
          if (itR == rails.end() || itR->second.size() != 6) { railBad++; continue; }
          const CsoRail& q = st[i].rails[k];
          const double want6[6] = {0, q.y, q.z, q.rx, 0, q.rz};
          double m = 0;
          for (int c = 0; c < 6; c++) m = std::max(m, std::abs(itR->second[c] - want6[c]));
          railDevMax = std::max(railDevMax, m);
          railCmp++;
          if (!(m <= 1e-6)) { railBad++; if (railBad < 4) std::printf("  %s image %d : barre %s/%zu écart %.3g\n", who.c_str(), (int)f["f"].num(), obs[i].label.c_str(), k, m); }
        }
      }
      // Témoins (état du jeu web relevé).
      std::set<int> knockedNow;
      for (const J& e : ch["ob"]["fs"].a) if (e["kn"].b) knockedNow.insert((int)e["i"].num());
      for (int i : knockedBefore) if (!knockedNow.count(i)) wit["barre remise par le jury"]++;
      knockedBefore = knockedNow;
      for (const J& e : ch["ob"]["fs"].a) {
        if (!e["pd"].a.empty()) wit["barre en attente (postérieurs)"]++;
        for (const J& x : e["r"].a) if (x[5].num() > 0) wit["vibration d'effleurement"]++;
        if (e["rb"].num() > 0) wit["remise prévue"]++;
      }
      if (!ch["ob"]["rl"].isNull() && ch["ob"]["rl"]["a"].b) wit["refus détourné"]++;
      if (!ch["ob"]["ps"].isNull() && !ch["ob"]["ps"]["x"].isNull() && !ch["ob"]["ps"]["d"].b) wit["résultat différé (membres jugés)"]++;
      n++;
    }
    frames += n;
    CHECK(bad == 0 && fbad == 0 && evBad == 0 && oeBad == 0 && sndBad == 0 && railBad == 0,
          "%s : rejeu des obstacles : %d images en écart (cheval), %d (obstacles), %d (événements du cheval), %d (événements d'obstacle), %d (sons), %d (barres)",
          who.c_str(), bad, fbad, evBad, oeBad, sndBad, railBad);
    if (bad == 0 && fbad == 0 && evBad == 0 && oeBad == 0 && sndBad == 0 && railBad == 0 && resync == 0 && n > 0) clean[id] = n;
    if (bad == 0 && fbad == 0 && evBad == 0 && oeBad == 0 && sndBad == 0 && railBad == 0 && resync == cols && n > 0) colOnly[id] = cols;
    std::printf("obstacles %-22s %-2s : %3d images, %d recalages, écarts max : position %.2g m, vitesse %.2g m/s, barres %.2g, chute %.2g, marge %.2g ; franchi %d, faute %d, refus compté %d, cabré %d, chute %d, effleurement %d, choc %d\n",
                id.c_str(), lang.c_str(), n, resync, dev.pos, dev.speed, fdev.rail, fdev.fall, fdev.margin, cnt["obstacle:clear"], cnt["obstacle:fault"],
                cnt["obstacle:refusal"], cnt["horse:refuse"], cnt["railFall"], cnt["railTouch"], cnt["thud"]);
    // Comportements attendus des scénarios de la tranche (en plus de l'identité au jeu web).
    auto c = [&](const char* k) { return cnt[k]; };
    if (id == "t3-sans-faute") CHECK(c("obstacle:clear") == 1 && c("obstacle:fault") == 0 && c("railFall") == 0, "%s : sans faute", who.c_str());
    if (id == "t3-oxer-loin") CHECK(c("obstacle:fault") == 1 && c("railFall") == 2, "%s : deux barres, une faute", who.c_str());
    if (id == "t3-pres-montee" || id == "t3-posterieurs") CHECK(c("obstacle:fault") == 1 && c("railFall") == 1, "%s : une barre, une faute", who.c_str());
    if (id == "t3-effleurement") CHECK(c("obstacle:clear") == 1 && c("railTouch") >= 1 && c("railFall") == 0, "%s : effleurée, franchi", who.c_str());
    // Seuils : marge juste sous −0,06 (faute) et juste sous +0,04 (effleurement), relevées dans le jeu web.
    if (id == "t3-faute-limite") CHECK(c("obstacle:fault") == 1 && c("railFall") == 1 && margins.size() == 1 && margins[0] < -0.06 && margins[0] >= -0.08, "%s : faute de justesse", who.c_str());
    if (id == "t3-effleurement-haut") CHECK(c("obstacle:clear") == 1 && c("railTouch") >= 1 && margins.size() == 1 && margins[0] >= 0.02 && margins[0] < 0.04, "%s : effleurement de justesse", who.c_str());
    if (id == "t3-refus-62" || id == "t3-tout-contre-remonte") CHECK(c("obstacle:refusal") == 1 && c("railFall") == 1, "%s : refus tout contre, barre emportée", who.c_str());
    if (id == "t3-refus-lent" || id == "t3-refus-oblique") CHECK(c("obstacle:refusal") == 1 && c("railFall") == 0, "%s : refus sans barre", who.c_str());
    if (id == "t3-refus-5s") CHECK(c("obstacle:refusal") == 2 && c("horse:refuse") > 2, "%s : refus recompté après 5 s seulement (%d cabrés)", who.c_str(), c("horse:refuse"));
    if (id == "t3-glissade") CHECK(c("obstacle:refusal") == 1 && c("horse:refuse") >= 2, "%s : glissades, refus compté une fois", who.c_str());
  }
  int ok = 0;
  for (const char* id : required) {
    CHECK(clean.count(id), "scénario %s : absent, recalé ou en écart", id);
    ok += (int)clean.count(id);
  }
  for (const char* id : withCollisions) CHECK(colOnly.count(id), "scénario %s : absent, en écart ou recalé hors collisions", id);
  for (const char* w : {"franchi", "faute cause short", "faute cause far", "faute cause near", "barre en attente (postérieurs)", "vibration d'effleurement",
                        "refus compté", "remise prévue", "barre remise par le jury", "refus détourné", "glissade (refus sur place)", "garde-fou du nez (poussée)"})
    CHECK(wit[w] > 0, "branche non exercée : %s", w);
  std::printf("obstacles : %d scénarios requis rejoués sans recalage ni écart > 1e-6 (%zu au total) ; t3-tout-contre-remonte sans écart, %d recalages de collision ; %d images, %d transformées de barres comparées (écart max %.2g) ; témoins :",
              ok, clean.size(), colOnly.count("t3-tout-contre-remonte") ? colOnly["t3-tout-contre-remonte"] : -1, frames, railCmp, railDevMax);
  for (const auto& [k, v] : wit) std::printf(" %s %d ;", k.c_str(), v);
  std::printf("\n");
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


// ---------- Textes et formats (tranche T4) : cso_text.json (dec, ordinaux, pluriels, gabarits) ----------
static TextTable g_text;
static void loadText() {
  const std::string raw = readFile(DATA + "/strings_cso.json");
  std::string err;
  CHECK(g_text.parse(raw, err), "strings_cso.json illisible : %s", err.c_str());
}
static void testText() {
  const J o = loadJson(ORA + "/cso_text.json");
  CHECK(o["schema"].s == "strides.oracle.cso_text/1", "cso_text : schéma « %s »", o["schema"].s.c_str());
  int n = 0, bad = 0;
  auto same = [&](const std::string& got, const std::string& want, const char* what, const std::string& in) {
    n++;
    if (got != want) {
      bad++;
      if (bad < 8) std::printf("  %s(%s) : « %s » / « %s »\n", what, in.c_str(), got.c_str(), want.c_str());
    }
  };
  for (const char* ln : {"fr", "en"}) {
    const Lang L = langFromName(ln);
    const J& c = o[ln];
    char b[64];
    for (const J& e : c["dec"].a) {
      std::snprintf(b, sizeof b, "%.17g, %d, %s", e["n"].num(), (int)e["k"].num(), ln);
      same(dec(e["n"].num(), (int)e["k"].num(), L), e["out"].s, "dec", b);
    }
    for (const J& e : c["ordinal"].a) same(ordinal((long long)e["n"].num(), L), e["out"].s, "ordinal", std::to_string((long long)e["n"].num()) + " " + ln);
    for (const J& e : c["enOrdinal"].a) same(enOrdinal((long long)e["n"].num()), e["out"].s, "enOrdinal", std::to_string((long long)e["n"].num()));
    for (const J& e : c["nth"].a) same(nth((long long)e["n"].num(), L), e["out"].s, "nth", std::to_string((long long)e["n"].num()) + " " + ln);
    for (const J& e : c["ptsText"].a) same(ptsText((long long)e["n"].num(), L, g_text), e["out"].s, "ptsText", std::to_string((long long)e["n"].num()) + " " + ln);
    for (const J& e : c["templates"].a) {
      CHECK(g_text.has(e["key"].s), "strings_cso.json : clé absente « %s »", e["key"].s.c_str());
      if (e["vals"].isNull()) same(g_text.t(e["key"].s, L), e["out"].s, "t", e["key"].s + " " + ln);
      else {
        std::vector<std::string> v;
        for (const J& x : e["vals"].a) v.push_back(x.t == J::Num ? jsInt((long long)x.num()) : x.s);
        same(g_text.T(e["key"].s, v, L), e["out"].s, "T", e["key"].s + " " + ln);
      }
    }
  }
  CHECK(bad == 0, "cso_text : %d cas sur %d différents du jeu web", bad, n);
  std::printf("textes et formats : %d cas (dec, ordinaux, pluriels, %zu clés de gabarits et textes fixes, fr et en), %d écarts\n", n, o["fr"]["templates"].a.size(), bad);
}

// ---------- Déroulé d'épreuve (tranche T4) : strides::CsoRun rejoué sur le canal « ep » de cso_runs.json ----------
// Entrées réinjectées : trajectoire et mode du joueur vus par Run.update, bouton « Entrer en piste », événements
// d'obstacle émis avant Run.update ; comparés image par image : étape, objectif, état de l'épreuve, mode de concours,
// tableau de chrono (données et textes), cadence réécrite, appels hud.* et audio.* faits par courses.js (et
// hud.clearHint du déroulé de mission).
static double R6(double v) { return std::floor(v * 1e6 + 0.5) / 1e6; }  // Math.round(v * 1e6) / 1e6
static std::string callStr(const std::string& fn, const std::vector<std::string>& args) {
  std::string s = fn + "(";
  for (size_t i = 0; i < args.size(); i++) s += (i ? ", " : "") + args[i];
  return s + ")";
}
static std::string argStr(const J& a) {
  if (a.t == J::Num) { char b[40]; std::snprintf(b, sizeof b, "%.17g", a.n); return b; }
  if (a.t == J::Str) return "\"" + a.s + "\"";
  return dump(a);
}
static std::vector<std::string> oracleCalls(const J& list, bool hud) {
  std::vector<std::string> v;
  for (const J& c : list.a) {
    const std::string& src = c["src"].s;
    const std::string& fn = c["fn"].s;
    const bool keep = hud ? (src == "gameplay/courses.js" && fn != "jumpFeedback") || (src == "gameplay/missions.js" && fn == "clearHint") : src == "gameplay/courses.js";
    if (!keep) continue;
    std::vector<std::string> a;
    for (const J& x : c["args"].a) a.push_back(argStr(x));
    v.push_back(callStr(fn, a));
  }
  return v;
}
static std::vector<std::string> coreCalls(const std::vector<CsoCall>& calls) {
  std::vector<std::string> v;
  for (const CsoCall& c : calls) {
    std::vector<std::string> a;
    for (const CsoArg& x : c.args) {
      if (x.isNum) { char b[40]; std::snprintf(b, sizeof b, "%.17g", x.n); a.push_back(b); }
      else a.push_back("\"" + x.s + "\"");
    }
    v.push_back(callStr(c.fn, a));
  }
  return v;
}
static void testCsoRuns() {
  J o = loadJson(ORA + "/cso_runs.json");
  const J data = loadJson(DATA + "/cso_course_pole.json");
  CourseDesign d;
  std::string err;
  CHECK(parseCourseFile(readFile(DATA + "/cso_course_pole.json"), d, err), "cso_course_pole.json : %s", err.c_str());
  d.x += data["arena"]["x"].num();
  d.z += data["arena"]["z"].num();
  const CourseTrace tr = traceCourse(d);
  std::vector<std::string> labels;
  for (const TraceFence& f : tr.fences) labels.push_back(f.label);
  const CsoRunConfig base = csoRunConfigFromJson(data, labels);
  // Lignes du jeu web (données exportées) = repères du tracé lu par le jeu, décalés de la carrière.
  CHECK(std::abs(base.start.x - tr.marks.at("start").x) < 1e-9 && std::abs(base.start.z - tr.marks.at("start").z) < 1e-9 && std::abs(base.start.rot - tr.marks.at("start").rot) < 1e-12 &&
            std::abs(base.finish.x - tr.marks.at("finish").x) < 1e-9 && std::abs(base.finish.z - tr.marks.at("finish").z) < 1e-9 && std::abs(base.finish.rot - tr.marks.at("finish").rot) < 1e-12,
        "lignes de départ / d'arrivée des données différentes du tracé");
  const char* required[] = {"droit", "t4-sans-faute", "t4-depart-lance", "t4-cloche", "t4-erreur-parcours", "t4-deux-refus", "t4-temps-limite", "t4-descente", "t4-saute-avant-depart", "t4-arrivee-barre", "t4-lignes",
                            "t4-gardes", "t4-un-point", "t4-entree"};
  std::map<std::string, int> clean;  // « id lang » → images rejouées sans écart
  int frames = 0, hudN = 0, audioN = 0, boardN = 0, hlN = 0, rrN = 0, cheerN = 0;
  // Gardes des écouteurs d'obstacle (courses.js:219-268) réellement exercées par les oracles : événements relevés pendant
  // l'étape de parcours, classés selon l'état de l'épreuve juste avant (contrôle adverse de T4).
  std::map<std::string, int> cover;
  const char* guards[] = {"refus avant le départ, obstacle attendu, dans son sens", "refus devant un obstacle non attendu, après le départ", "refus à rebours devant l'obstacle attendu",
                          "saut à rebours de l'obstacle attendu", "saut à rebours d'un obstacle non attendu", "saut dans son sens après l'arrivée", "saut dans son sens avant le départ"};
  for (const char* g : guards) cover[g] = 0;
  for (const J& r : o["runs"].a) {
    const std::string id = r["id"].s, lang = r["lang"].s, who = id + " (" + lang + ")";
    const J& su = r["setup"];
    // Rejoués : scénarios enregistrés depuis le lancement de l'activité (première étape en cours, aucune image avant).
    if (su["run0"].isNull() || su["run0"]["i"].isNull() || su["run0"]["i"].num() != 0 || r["frames"].a.empty() || r["frames"][0]["ep"].isNull() ||
        r["frames"][0]["ep"]["i"].num() != 0)
      continue;
    CHECK(std::abs(su["finish"]["x"].num() - base.finish.x) < 1e-9 && std::abs(su["finish"]["z"].num() - base.finish.z) < 1e-9 && su["finish"]["w"].num() == base.finish.w &&
              std::abs(su["start"]["x"].num() - base.start.x) < 2e-6 && su["start"]["w"].num() == base.start.w && su["gate"]["x"].num() == base.gateX && su["gate"]["z"].num() == base.gateZ,
          "%s : lignes ou entrée de piste du jeu différentes des données", who.c_str());
    CsoRunConfig cfg = base;
    cfg.playerName = su["playerName"].s;
    cfg.horseName = su["horseName"].s;
    cfg.lang = langFromName(lang);
    CsoRun run(cfg, g_text);
    run.begin();
    int bad = 0, n = 0;
    auto diff = [&](int f, const std::string& what) {
      bad++;
      if (bad < 6) std::printf("  %s image %d : %s\n", who.c_str(), f, what.c_str());
    };
    {
      const std::vector<std::string> got = coreCalls(run.takeHud()), want = oracleCalls(su["calls"]["hud"], true);
      if (got != want) diff(-1, "appels hud au lancement");
    }
    std::vector<std::string> hudAll, audioAll;
    std::set<std::string> texts;  // objectifs affichés (étape goto de t4-entree)
    int hlWant = -1;              // dernier numéro surligné par le jeu web (Obstacles.highlight), -1 avant tout appel
    for (const J& f : r["frames"].a) {
      const int fi = (int)f["f"].num();
      const J& ep = f["ep"];
      if (ep.isNull()) { if (!run.finished()) diff(fi, "Run.update absent"); continue; }
      if (f["in"]["ui"].s == "enter") run.enter();
      // Événements d'obstacle de l'image émis avant Run.update. Un refus compté remet la cadence à 0 (courses.js:265) :
      // la cadence vue ensuite par Run.update (ep.cad) doit être nulle, et le portage doit l'avoir remise.
      const int refusals0 = run.state().refusals;
      CsoCadence cadEv{!ep["cad"].isNull(), -12345.0};
      for (size_t k = 0; k < (size_t)ep["e0"].num() && k < f["ev"].a.size(); k++) {
        const J& e = f["ev"][k];
        const std::string& en = e["e"].s;
        if (en != "obstacle:clear" && en != "obstacle:fault" && en != "obstacle:refusal") continue;
        const J& ob = e["d"]["obstacle"];
        if (ob["course"].s != "cso") continue;
        const CsoObstacleEventKind kind = en == "obstacle:clear" ? CsoObstacleEventKind::Clear : en == "obstacle:fault" ? CsoObstacleEventKind::Fault : CsoObstacleEventKind::Refusal;
        CHECK(labels[(size_t)ob["num"].num() - 1] == ob["label"].s, "%s : obstacle %s de rang %g", who.c_str(), ob["label"].s.c_str(), ob["num"].num());
        const int num = (int)ob["num"].num(), dir = (int)e["d"]["dir"].num();
        if (run.step() == CsoStep::Course) {
          const CsoRunState& s0 = run.state();
          const bool live = s0.started && !s0.finished && !s0.eliminated;
          if (kind == CsoObstacleEventKind::Refusal) {
            if (!s0.started && num == s0.next && dir > 0) cover[guards[0]]++;
            if (live && num != s0.next && dir > 0) cover[guards[1]]++;
            if (live && num == s0.next && dir < 0) cover[guards[2]]++;
          } else {
            if (live && num == s0.next && dir < 0) cover[guards[3]]++;
            if (live && num != s0.next && dir < 0) cover[guards[4]]++;
            if (s0.finished && dir > 0) cover[guards[5]]++;
            if (!s0.started && dir > 0) cover[guards[6]]++;
          }
        }
        run.obstacleEvent(kind, num, dir, e["d"]["cause"].isNull() ? "" : e["d"]["cause"].s, e["d"]["causeText"].isNull() ? "" : e["d"]["causeText"].s, cadEv);
      }
      if (run.state().refusals != refusals0 && cadEv.has && !(cadEv.v == 0 && ep["cad"].num() == 0)) diff(fi, "cadence remise à 0 par le refus compté");
      if (run.state().refusals == refusals0 && cadEv.v != -12345.0) diff(fi, "cadence réécrite sans refus compté");
      CsoRunFrame in;
      in.dt = ep["dt"].num();
      in.time = ep["gt"].num();
      in.x = ep["x"].num();
      in.z = ep["z"].num();
      in.heading = ep["h"].num();
      in.focusX = ep["fx"].isNull() ? in.x : ep["fx"].num();
      in.focusZ = ep["fz"].isNull() ? in.z : ep["fz"].num();
      in.riding = ep["mode"].s == "ride";
      in.driving = ep["mode"].s == "drive";
      in.inTruck = !ep["tk"].isNull() && ep["tk"].b;
      in.vehicle = !ep["vh"].isNull() && ep["vh"].b;
      CsoCadence cad{!ep["cad"].isNull(), ep["cad"].isNull() ? 0 : ep["cad"].num()};
      CHECK((int)ep["i"].num() == run.stepIndex(), "%s image %d : étape %d avant Run.update / %d", who.c_str(), fi, (int)ep["i"].num(), run.stepIndex());
      run.update(in, cad);
      n++;
      // Demandes aux obstacles et au public (relevées par le jeu web seulement quand elles changent) : numéro surligné,
      // barres remises à l'entrée en piste, public en liesse après un sans-faute (durée).
      if (!ep["hl"].isNull()) {
        hlWant = (int)ep["hl"].num();
        hlN++;
      }
      if (run.highlight() != hlWant) diff(fi, "numéro surligné " + std::to_string(run.highlight()) + " / " + std::to_string(hlWant));
      const bool rrGot = run.takeResetRails(), rrWant = !ep["rr"].isNull();
      rrN += rrWant;
      if (rrGot != rrWant || (rrWant && ep["rr"].num() != 1)) diff(fi, std::string("barres remises ") + (rrGot ? "oui" : "non") + " / " + (rrWant ? "oui" : "non"));
      const double cheer = run.takeCheer();
      cheerN += !ep["cheer"].isNull();
      if (cheer != (ep["cheer"].isNull() ? 0.0 : ep["cheer"].num())) diff(fi, "public en liesse " + std::to_string(cheer));
      // Cadence réécrite (sortie de piste) et étape après l'image.
      if (cad.has != !ep["cad1"].isNull() || (cad.has && cad.v != ep["cad1"].num())) diff(fi, "cadence après l'image");
      if ((int)ep["i1"].num() != run.stepIndex()) diff(fi, "étape " + std::to_string(run.stepIndex()) + " / " + std::to_string((int)ep["i1"].num()));
      // Appels de l'interface et sons.
      const std::vector<std::string> gh = coreCalls(run.takeHud()), wh = oracleCalls(f["hud"], true);
      const std::vector<std::string> ga = coreCalls(run.takeAudio()), wa = oracleCalls(f["audio"], false);
      if (gh != wh) {
        std::string s = "hud :";
        for (const auto& x : gh) s += " " + x;
        s += " / web :";
        for (const auto& x : wh) s += " " + x;
        diff(fi, s);
      }
      if (ga != wa) {
        std::string s = "audio :";
        for (const auto& x : ga) s += " " + x;
        s += " / web :";
        for (const auto& x : wa) s += " " + x;
        diff(fi, s);
      }
      hudN += (int)wh.size();
      audioN += (int)wa.size();
      for (const auto& x : wh) hudAll.push_back(x);
      for (const auto& x : wa) audioAll.push_back(x);
      // Étape, objectif, état de l'épreuve.
      const J& rr = f["run"];
      if (run.step() == CsoStep::Goto || (int)ep["i"].num() == 0) texts.insert(rr["text"].s + (in.riding ? " [à cheval]" : in.driving ? " [au volant]" : " [à pied]") + (jsHypot(in.focusX - cfg.gateX, in.focusZ - cfg.gateZ) < cfg.gateR ? " [dans le rayon]" : ""));
      if ((int)rr["i"].num() != run.stepIndex() || rr["text"].s != run.text() || R6(run.stepT()) != rr["stepT"].num()) diff(fi, "étape / objectif « " + run.text() + " » / « " + rr["text"].s + " »");
      const J& c = rr["course"];
      const CsoRunState& s = run.state();
      const bool elimWant = !c["eliminated"].isNull();
      if (c["started"].b != s.started || R6(s.t) != c["t"].num() || (int)c["next"].num() != s.next || (int)c["faults"].num() != s.faults || (int)c["refusals"].num() != s.refusals ||
          (int)c["fenceRefusals"].num() != s.fenceRefusals || c["finished"].b != s.finished || elimWant != s.eliminated || (elimWant && c["eliminated"].s != s.eliminatedReason) ||
          (int)c["timeFaults"].num() != s.timeFaults || R6(s.bell) != c["bell"].num() || (int)c["attempt"].num() != s.attempt || c["running"].b != s.running)
        diff(fi, "état de l'épreuve");
      // Mode de concours (game.course).
      const J& gc = f["course"];
      const CsoCourseMode& m = run.course();
      if (gc.isNull() != !m.active) diff(fi, "mode de concours présent / absent");
      else if (m.active) {
        const int wantNext = gc["next"].isNull() ? -1 : (int)gc["next"]["num"].num() - 1;
        if (gc["running"].b != m.running || gc["pre"].b != m.pre || gc["controls"].s != "cso" || wantNext != m.next) diff(fi, "mode de concours");
      }
      // Tableau de chrono : données (hudInfo) et textes (hud.js).
      CsoBoard b;
      const bool has = run.board(b);
      const J& wb = f["board"];
      if (wb.isNull() != !has) diff(fi, "tableau présent / absent");
      else if (has) {
        boardN++;
        if (wb["started"].b != b.started || R6(b.bell) != wb["bell"].num() || R6(b.t) != wb["t"].num() || (int)wb["ta"].num() != b.ta || (int)wb["pen"].num() != b.pen ||
            wb["over"].b != b.over || wb["next"].s != b.next || wb["finished"].b != b.finished || wb["eliminated"].b != b.eliminated)
          diff(fi, "tableau (données)");
        for (int k = 0; k < 4; k++)
          if (wb["txt"][(size_t)k].s != b.txt[k]) diff(fi, "tableau « " + b.txt[k] + " » / « " + wb["txt"][(size_t)k].s + " »");
      }
    }
    frames += n;
    CHECK(bad == 0, "%s : rejeu du déroulé d'épreuve : %d écarts", who.c_str(), bad);
    if (bad == 0 && n > 0) clean[id + " " + lang] = n;
    const CsoRunState& s = run.state();
    std::printf("épreuve %-22s %-2s : %4d images, %d écarts ; étape %d, %s, t %.2f s, prochain %d, fautes %d, refus %d, points %d%s%s ; %zu appels d'interface, %zu sons\n", id.c_str(), lang.c_str(), n, bad,
                run.stepIndex(), s.started ? "parti" : "pas parti", s.t, s.next, s.faults, s.refusals, run.points(), s.finished ? ", arrivé" : "", s.eliminated ? (", éliminé : " + s.eliminatedReason).c_str() : "", hudAll.size(), audioAll.size());
    // Comportements attendus des scénarios (en plus de l'identité au jeu web).
    auto has = [&](const std::vector<std::string>& v, const std::string& sub) { int k = 0; for (const auto& x : v) k += x.find(sub) != std::string::npos; return k; };
    const bool fr = lang == "fr";
    if (id == "t4-sans-faute") CHECK(s.finished && s.faults == 0 && run.points() == 0 && has(hudAll, fr ? "SANS FAUTE !" : "CLEAR ROUND!") == 1 && has(audioAll, "cheer(") == 1 && s.timeFaults == 0, "%s : sans-faute", who.c_str());
    if (id == "t4-depart-lance") CHECK(s.started && has(audioAll, "tone(1568") == 1 && s.next == 2, "%s : départ lancé", who.c_str());
    if (id == "t4-cloche") CHECK(s.started && has(hudAll, fr ? "45 s écoulées" : "45 s up") == 1 && has(audioAll, "tone(1568") == 0, "%s : chrono lancé par la cloche", who.c_str());
    if (id == "t4-erreur-parcours") CHECK(s.wrong.size() == 1 && has(hudAll, fr ? "Erreur de parcours" : "Wrong course") == 2 && has(hudAll, fr ? "ce n’est pas le 1" : "not fence 1") == 1 && s.next == 2 && s.faults == 0, "%s : une erreur annoncée une fois", who.c_str());
    if (id == "t4-deux-refus") CHECK(s.eliminated && s.refusals == 2 && has(hudAll, fr ? "2e refus : éliminé du parcours." : "2nd refusal") == 1 && has(hudAll, fr ? "reprends-le au <b>4A</b>" : "4A") >= 1, "%s : deux refus, reprise au 4A", who.c_str());
    if (id == "t4-temps-limite") CHECK(s.eliminated && s.t > 128 && s.faults == 0 && has(hudAll, fr ? "Temps limite dépassé" : "Time limit") == 1, "%s : temps limite", who.c_str());
    if (id == "t4-descente") CHECK(s.eliminated && !s.started && has(hudAll, fr ? "Tu es descendu de cheval" : "You dismounted") == 1, "%s : descente avant le départ", who.c_str());
    if (id == "t4-saute-avant-depart") CHECK(s.started && s.next == 1 && has(hudAll, fr ? "Le chrono n’est pas lancé" : "clock") >= 1, "%s : obstacle sauté avant le départ ignoré", who.c_str());
    if (id == "t4-lignes") CHECK(s.started && has(audioAll, "tone(1568") == 1 && s.t < 1, "%s : ligne franchie de biais puis hors de la marge (rien), puis dans la marge (chrono lancé)", who.c_str());
    if (id == "t4-arrivee-barre") CHECK(s.finished && s.faults == 4 && run.points() == 4 && has(hudAll, fr ? "4 POINTS" : "4 FAULTS") == 1 && has(hudAll, fr ? "Barre au 1 · +4" : "at 1 · +4") == 1, "%s : arrivée avec une barre", who.c_str());
    // Contrôle adverse de T4.
    if (id == "t4-gardes")
      CHECK(s.started && s.next == 2 && s.faults == 0 && s.refusals == 0 && s.fenceRefusals == 0 && s.wrong.empty() && s.log.size() == 1 && has(hudAll, fr ? "Refus" : "Refusal") == 0 &&
                has(hudAll, fr ? "Erreur de parcours" : "Wrong course") == 0 && has(audioAll, "fault(") == 0,
            "%s : refus avant le départ, devant un autre obstacle, à rebours, et sauts à rebours ignorés ; le 1 dans son sens compté", who.c_str());
    if (id == "t4-un-point")
      CHECK(s.finished && s.faults == 0 && s.timeFaults == 1 && run.points() == 1 && s.t > 64 && s.t <= 65 && has(hudAll, fr ? "\"1 POINT\"" : "\"1 FAULT\"") == 1 && has(hudAll, "POINTS") == 0 &&
                has(hudAll, "FAULTS") == 0 && has(audioAll, "cheer(") == 0 && s.wrong.empty() && has(hudAll, fr ? "Erreur de parcours" : "Wrong course") == 0,
            "%s : arrivée à 1 point, saut pendant la sortie de piste ignoré", who.c_str());
    if (id == "t4-entree") {
      const std::string base = fr ? "Entre en piste : rejoins l’entrée de la carrière" : "Enter the arena: head to the arena entrance";
      const std::string mount = fr ? "Monte sur ton cheval (siffle-le si besoin)." : "Mount your horse (whistle for it if needed).";
      const std::string truck = fr ? "Sors du camion puis monte à cheval." : "Get out of the horsebox, then mount your horse.";
      bool ok = texts.count(base + " · 130 m [à cheval]") && texts.count(base + " · 60 m [à cheval]") && texts.count(base + " · 50 m [à cheval]") && texts.count(base + " [à cheval]") &&
                texts.count(mount + " [à pied]") && texts.count(mount + " [à pied] [dans le rayon]") && texts.count(truck + " [au volant]") && texts.count(truck + " [au volant] [dans le rayon]") &&
                s.started == false && run.stepIndex() == 5;
      std::string seen;
      for (const auto& x : texts) seen += " « " + x + " »";
      CHECK(ok, "%s : étape goto (distance, pied à terre, camion, validation à cheval) ; vu :%s", who.c_str(), seen.c_str());
    }
  }
  std::string cov;
  for (const char* g : guards) {
    CHECK(cover[g] > 0, "garde des écouteurs d'obstacle jamais exercée par les oracles : %s", g);
    cov += std::string(" ; ") + g + " " + std::to_string(cover[g]);
  }
  CHECK(hlN > 0 && rrN > 0 && cheerN > 0, "numéro surligné, barres remises ou public en liesse jamais relevés");
  std::printf("gardes des écouteurs d'obstacle exercées%s\n", cov.c_str());
  std::printf("demandes comparées : %d changements du numéro surligné, %d remises des barres, %d ovations\n", hlN, rrN, cheerN);
  int ok = 0;
  for (const char* id : required)
    for (const char* lang : {"fr", "en"}) {
      CHECK(clean.count(std::string(id) + " " + lang), "scénario %s (%s) : absent ou en écart", id, lang);
      ok += (int)clean.count(std::string(id) + " " + lang);
    }
  std::string miss;
  for (const auto& k : g_text.missing()) miss += " « " + k + " »";
  CHECK(g_text.missing().empty(), "textes demandés absents de strings_cso.json :%s", miss.c_str());
  std::printf("déroulé d'épreuve : %d exécutions requises rejouées sans écart (%zu au total), %d images, %d appels d'interface et %d sons de courses.js comparés, %d tableaux\n", ok, clean.size(), frames, hudN, audioN, boardN);
}

// Étape « rejoindre l'entrée de la carrière » (contrôle adverse de T4) : objectif et validation de l'étape goto du jeu
// web sur la grille de cso_goto.json (points suivis autour des seuils, quatre modes du joueur, fr et en).
static void testCsoGoto() {
  const J o = loadJson(ORA + "/cso_goto.json");
  const J data = loadJson(DATA + "/cso_course_pole.json");
  const CsoRunConfig base = csoRunConfigFromJson(data, {});
  CHECK(o["gate"]["x"].num() == base.gateX && o["gate"]["z"].num() == base.gateZ && o["r"].num() == base.gateR && o["mode"].s == "ride", "cso_goto.json : entrée de piste, rayon ou mode différents des données");
  int n = 0, bad = 0;
  std::set<std::string> texts;
  for (const J& L : o["langs"].a) {
    CsoRunConfig cfg = base;
    cfg.lang = langFromName(L["lang"].s);
    for (const J& c : L["cases"].a) {
      CsoRunFrame f;
      f.focusX = c["fx"].num();
      f.focusZ = c["fz"].num();
      f.riding = c["mode"].s == "ride";
      f.driving = c["mode"].s == "drive";
      f.inTruck = !c["tk"].isNull() && c["tk"].b;
      f.vehicle = !c["vh"].isNull() && c["vh"].b;
      const std::string got = csoGotoText(cfg, g_text, f);
      const bool done = csoGotoDone(cfg, f);
      n++;
      texts.insert(c["text"].s);
      if (got != c["text"].s || done != c["done"].b) {
        if (++bad < 6) std::printf("  goto %s (%.6g, %.6g) %s : « %s » %d / « %s » %d\n", L["lang"].s.c_str(), f.focusX, f.focusZ, c["mode"].s.c_str(), got.c_str(), (int)done, c["text"].s.c_str(), (int)c["done"].b);
      }
    }
  }
  CHECK(n >= 400 && bad == 0, "étape goto : %d cas, %d écarts", n, bad);
  CHECK(texts.size() >= 28, "étape goto : %zu textes distincts seulement", texts.size());  // 14 par langue
  std::printf("étape goto : %d cas, %d écarts, %zu textes distincts\n", n, bad, texts.size());
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
    testFenceRuns();
    testTarget();
    testPress();
    testJudge();
    testSave();
    loadText();
    testText();
    testCsoRuns();
    testCsoGoto();
  } catch (const std::exception& e) {
    std::printf("exception : %s\n", e.what());
    return 2;
  }
  std::printf("%d vérifications, %d échecs\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
