// Tests du cœur Strides (C++ pur) : rejoue les oracles exportés du jeu web (scripts/unreal/export-data.mjs) et des
// scénarios de jugement tirés des règles de src/gameplay/courses.js. Sortie non nulle au premier écart.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <map>
#include <set>
#include <sstream>
#include <string>

#include "StridesCore/CourseAids.h"
#include "StridesCore/CsoAudio.h"
#include "StridesCore/CoursePlan.h"
#include "StridesCore/CsoEntry.h"
#include "StridesCore/Ranking.h"
#include "StridesCore/CsoCamera.h"
#include "StridesCore/CsoCourse.h"
#include "StridesCore/CsoFences.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCore/CsoHud.h"
#include "StridesCore/CsoInput.h"
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

// Journal des sons du portage (tranche T12), rempli par les rejeux du cœur et comparé au canal « audio » de cso_runs/
// par testCsoSounds : clé « id lang » → image → parties de l'image dans l'ordre de game.update (boutons de carte, pas du
// cheval, Obstacles.updateHorse, écouteurs de courses.js sur les événements d'obstacle, Obstacles.update, Run.update).
// Appel écrit « fn(arguments)@fichier » (nombres en %.17g, chaînes entre guillemets).
struct FenceSounds { bool has = false; std::vector<std::string> horse, judge, slide, fall; };
struct RunSounds { bool has = false; std::vector<std::string> ui, ev, upd; };
static std::map<std::string, std::map<int, FenceSounds>> g_fenceSounds;
static std::map<std::string, std::map<int, RunSounds>> g_runSounds;
static std::map<std::string, std::vector<std::string>> g_launchSounds;
static bool g_fenceSoundsDone = false, g_runSoundsDone = false;
static std::string sndArg(bool isNum, double n, const std::string& s) {
  if (isNum) { char b[40]; std::snprintf(b, sizeof b, "%.17g", n); return b; }
  return "\"" + s + "\"";
}
static std::string sndCall(const CsoCall& c, const std::string& src) {
  std::string r = c.fn + "(";
  for (size_t i = 0; i < c.args.size(); i++) r += (i ? ", " : "") + sndArg(c.args[i].isNum, c.args[i].n, c.args[i].s);
  return r + ")@" + src;
}
static std::vector<std::string> sndCalls(const std::vector<CsoCall>& v, const char* src = nullptr) {
  std::vector<std::string> r;
  for (const CsoCall& c : v) r.push_back(sndCall(c, src ? src : csoRunSoundSrc(c)));
  return r;
}

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
    // Le score du jeu passe par CsoRun::points (csoPoints, barème CSO, 1 point par seconde entamée ; tranche T4) : même
    // oracle. CourseJudge::points (juge du cross, plus utilisé par le jeu pour le CSO) reste comparé.
    if (k != 1) continue;
    CHECK(csoPoints(0, c["t"].num(), c["allowed"].num()) == (int)c["out"].num(), "csoPoints à %.12g s / %g : %d au lieu de %d", c["t"].num(), c["allowed"].num(), csoPoints(0, c["t"].num(), c["allowed"].num()), (int)c["out"].num());
    CHECK(csoPoints(8, c["t"].num(), c["allowed"].num()) == 8 + (int)c["out"].num(), "csoPoints avec 8 points de fautes à %.12g s", c["t"].num());
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
  std::printf("parcours : %zu obstacles, longueur %.2f m, abord %zu points, %zu pénalités de temps (%d par CsoRun::points et par le juge du cross), %zu comparaisons\n",
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

// Oracles de scénario (scripts/unreal/export-cso-runs.mjs, format de scripts/unreal/cso-runs-io.mjs) : index
// ORA/cso_runs/index.json (en-tête descriptif des canaux, liste des exécutions) et un fichier par exécution,
// ORA/cso_runs/<id>.<lang>.json. Rendus en un seul arbre : en-tête de l'index, « runs » = exécutions lues dans l'ordre.
static J loadRuns() {
  J o = loadJson(ORA + "/cso_runs/index.json");
  CHECK(o["schema"].s == "strides.oracle.cso_runs/2", "cso_runs : schéma de l'index « %s »", o["schema"].s.c_str());
  CHECK(o["runs"].t == J::Arr && !o["runs"].a.empty(), "cso_runs : index vide");
  J runs;
  runs.t = J::Arr;
  for (const J& e : o["runs"].a) {
    const std::string file = e["file"].s;
    CHECK(!file.empty() && file == e["id"].s + "." + e["lang"].s + ".json", "cso_runs : fichier « %s » pour %s %s", file.c_str(), e["id"].s.c_str(), e["lang"].s.c_str());
    J r = loadJson(ORA + "/cso_runs/" + file);
    CHECK(r["id"].s == e["id"].s && r["lang"].s == e["lang"].s && r["frames"].t == J::Arr && e["frames"].t == J::Num && (double)r["frames"].a.size() == e["frames"].n,
          "cso_runs/%s : identifiant, langue ou nombre d'images différent de l'index", file.c_str());
    runs.a.push_back(std::move(r));
  }
  o.o["runs"] = std::move(runs);
  return o;
}

// Oracles de scénario du banc de parité (scripts/unreal/export-cso-runs.mjs) : contrôle de FORME image par image (ce n'est
// pas une preuve d'identité : celles-ci sont les rejeux testHorseRuns, testFenceRuns, testCsoRuns, testCamRuns…), puis
// recoupements avec le cœur : ligne de départ du jeu web = repère du tracé + décalage de la carrière lu dans
// Content/Data, départ du chrono du web (run.course.started, avec le bip « tone » de courses.js) à l'image où la ligne lue
// dans l'oracle (setup.start, largeur w comprise) est franchie selon strides::lineCrossed (cap à 60° compris), et même simulation en français et en anglais
// (seuls les textes changent).
static void testRuns() {
  J o = loadRuns();
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
    // Ligne de départ telle que le jeu web l'a posée (setup.start : x, z, rot, w), franchie selon la règle du cœur.
    CsoRunLine startLine;
    startLine.x = su["start"]["x"].num();
    startLine.z = su["start"]["z"].num();
    startLine.rot = su["start"]["rot"].num();
    startLine.w = su["start"]["w"].num();
    CHECK(num(su["start"]["w"]) && startLine.w > 0, "%s : largeur de la ligne de départ absente de l'oracle", w);
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
      // Tranche T11 : après la fin de la mission (missions.complete), ni mission ni canal « ep » (et plus jamais ensuite).
      if (su["lite"].b) {
        const bool over = f["ep"].isNull() && f["run"].isNull() && i > 0 && (fr[i - 1]["ep"].t == J::Obj ? fr[i - 1]["run"].isNull() : fr[i - 1]["ep"].isNull());
        ok = ok && c.isNull() && f["ch"].isNull() && ((f["ep"].t == J::Obj && num(f["ep"]["dt"]) && num(f["ep"]["x"]) && f["ep"]["mode"].t == J::Str) || over);
      }
      else ok = ok && vec(c["eye"], 3) && vec(c["target"], 3) && vec(c["dir"], 3) && num(c["fov"]) && num(c["aspect"]);
      ok = ok && calls(f["ev"], "e") && calls(f["hud"], "fn") && calls(f["audio"], "fn");
      ok = ok && (f["run"].isNull() || f["run"].t == J::Obj) && (f["course"].isNull() || f["course"].t == J::Obj) && (f["board"].isNull() || f["board"].t == J::Obj);
      ok = ok && f["rails"].t == J::Arr;
      for (const J& rr : f["rails"].a) ok = ok && rr["r"].t == J::Str && vec(rr["t"], 6) && su["rails"].o.count(rr["r"].s);
      CHECK(ok, "%s (%s) : image %zu mal formée", w, lang.c_str(), i);
      if (!ok) break;
      // Départ du chrono relevé dans l'état de l'épreuve du web (run.course.started passe à vrai) ; bip = son « tone »
      // émis par courses.js à cette image (fréquence non recopiée).
      if (bip < 0 && f["run"].t == J::Obj && f["run"]["course"].t == J::Obj && f["run"]["course"]["started"].b) {
        bip = (int)i;
        bool tone = false;
        for (const J& a : f["audio"].a) tone = tone || (a["fn"].s == "tone" && a["src"].t == J::Str && a["src"].s == "gameplay/courses.js");
        if (id == "droit") CHECK(tone, "%s (%s) : départ à l'image %d sans bip de courses.js", w, lang.c_str(), bip);
      }
      if (in["jump"].b) { jumps++; jumpFrame = (int)i; }
      if (jumpFrame >= 0 && airborne < 0 && h["jumpT"].num() >= 0) airborne = (int)i;
      if (i > 0 && crossed < 0) {
        const J& p = fr[i - 1]["horse"];
        const double hd = h["h"].num();
        if (lineCrossed(startLine, true, p["x"].num(), p["z"].num(), h["x"].num(), h["z"].num(), &hd)) crossed = (int)i;
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

// ---------- Cheval de concours (tranche T2) : strides::csoHorseStep rejoué sur le canal « ch » de cso_runs/ ----------

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
  d("rearAnim", s.rearAnim, j["ra"].num(), dev.other);  // cabré affiché (horse.js : sin de la phase du cabré)
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
  J o = loadRuns();
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
  // Contrôle des remarques (hygiène) : cadence de départ arrondie au dixième depuis une vitesse non multiple de 0,1.
  const char* required[] = {"droit", "bonne-zone", "virage-serre", "rampe-clavier", "ctrl-alt", "appui-10m", "appui-3ms", "abord-70",
                            "virage-en-lair", "survitesse", "appel-pres", "cadence-depart"};
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
    // Témoin : vitesse posée non multiple de 0,1 et cadence de départ relevée = arrondi au plus proche ≠ arrondi par défaut.
    if (id == "cadence-depart") {
      const J& f0 = r["frames"][0]["ch"];
      const double v0 = r["setup"]["ch0"]["s"]["v"].num(), c0 = f0["s"]["cad"].num();
      CHECK(r["setup"]["ch0"]["s"]["cad"].isNull() && std::abs(v0 * 10 - std::round(v0 * 10)) > 0.1 && std::abs(c0 - std::floor(v0 * 10) / 10) > 0.05,
            "%s : cadence de départ %.3f depuis %.3f m/s ne départage pas l'arrondi", who.c_str(), c0, v0);
    }
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
// chaîne sur le canal « ch » de cso_runs/, comparés en fin d'image (état du cheval, passage, refus, barres) ----------

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
  J o = loadRuns();
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
      const size_t judgeSnd = out.sounds.size();
      const bool slid = out.horse.size() > horseEv0;
      if (slid) wit["glissade (refus sur place)"]++;
      else if (s.x != bx || s.z != bz) wit["garde-fou du nez (poussée)"]++;
      CsoFencesUpdateInput ui;
      ui.dt = in["odt"].isNull() ? in["dt"].num() : in["odt"].num();
      ui.time = in["ot"].isNull() ? fi.time : in["ot"].num();
      ui.missionActive = in["ma"].b;
      ui.focusX = s.x; ui.focusZ = s.z;
      csoFencesUpdate(obs, st, ui, out);
      // Tranche T12 : sons du cheval (écouteurs de game.js sur les événements du cœur ; sol de la carrière : sable) et
      // des obstacles de l'image, gardés pour testCsoSounds.
      {
        FenceSounds& fs = g_fenceSounds[id + " " + lang][(int)f["f"].num()];
        fs.has = true;
        std::vector<CsoCall> hc, sc;
        for (CsoHorseEvent e : evs) csoHorseSounds(e, fi.playerHorse, fi.csoControls, "sand", hc);
        fs.horse = sndCalls(hc, "game.js");
        hc.clear();
        for (CsoHorseEvent e : out.horse) csoHorseSounds(e, fi.playerHorse, fi.csoControls, "sand", hc);
        fs.slide = sndCalls(hc, "game.js");
        for (size_t k = 0; k < out.sounds.size(); k++) (k < judgeSnd ? fs.judge : fs.fall).push_back(sndCall(csoFenceSoundCall(out.sounds[k]), "gameplay/obstacles.js"));
      }
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
  s.bestTimes["cso_train"] = 59.800000000000196;  // tranche T11 : chrono + pénalités, double du jeu (%.17g)
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
  CHECK(r.bestTimes.size() == 1 && r.bestTimes["cso_train"] == 59.800000000000196, "meilleur temps relu au bit près (tranche T11)");
  CHECK(SaveGame::fromWebExport("{\"version\":2,\"bestTimes\":{\"cso_train\":63.43333333333334,\"beach\":41.2,\"bad\":\"x\"}}", w, err) && w.bestTimes.size() == 2 && w.bestTimes["cso_train"] == 63.43333333333334,
        "import web : meilleurs temps (bestTimes, nombres seulement)");
  CHECK(!SaveGame::fromJson("{\"schema\":\"strides.save\",\"version\":99}", r, err), "version future refusée");
  CHECK(!SaveGame::fromJson("pas du json", r, err), "fichier abîmé refusé");
  std::printf("sauvegarde : %zu octets\n", txt.size());
}


// ---------- Textes et formats (tranche T4) : cso_text.json (dec, ordinaux, pluriels, gabarits) ----------
static TextTable g_text;
static CsoActivity g_activity;  // Content/Data/cso_activity.json (tranche T10)
static RankNames g_names;       // Content/Data/cso_ranking.json (tranche T11)
static void loadText() {
  const std::string raw = readFile(DATA + "/strings_cso.json");
  std::string err;
  CHECK(g_text.parse(raw, err), "strings_cso.json illisible : %s", err.c_str());
  CHECK(csoActivityFromFile(readFile(DATA + "/cso_activity.json"), g_activity, err), "cso_activity.json illisible : %s", err.c_str());
  CHECK(rankNamesFromFile(readFile(DATA + "/cso_ranking.json"), g_names, err), "cso_ranking.json illisible : %s", err.c_str());
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
    // Tranche T10 : String(n) (jsNumber) et casse (toUpperCase / toLowerCase des textes de la table).
    for (const J& e : c["str"].a) {
      std::snprintf(b, sizeof b, "%.17g", e["n"].num());
      same(jsNumber(e["n"].num()), e["out"].s, "String", b);
    }
    for (const J& e : c["upper"].a) same(jsUpper(e[0].s), e[1].s, "toUpperCase", e[0].s);
    for (const J& e : c["lower"].a) same(jsLower(e[0].s), e[1].s, "toLowerCase", e[0].s);
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

// ---------- Plan du parcours (tranche T10) : coursePlan / coursePlanSvg / coursePlanLegend sur cso_plan.json ----------
// Tracé local du Pôle lu comme le jeu (Content/Data/cso_course_pole.json, design non décalé), carrière et tribunes des
// données ; SVG comparé caractère pour caractère (chaque primitive dessinée relit ses nombres dans ses attributs).
static void testCoursePlan() {
  const J o = loadJson(ORA + "/cso_plan.json");
  CHECK(o["schema"].s == "strides.oracle.cso_plan/1", "cso_plan : schéma « %s »", o["schema"].s.c_str());
  const J data = loadJson(DATA + "/cso_course_pole.json");
  CourseDesign d;
  std::string err;
  CHECK(parseCourseFile(readFile(DATA + "/cso_course_pole.json"), d, err), "cso_course_pole.json : %s", err.c_str());
  const CourseTrace tr = traceCourse(d);
  CoursePlanArena A;
  A.w = data["arena"]["w"].num();
  A.d = data["arena"]["d"].num();
  A.standsW = data["stands"]["w"].num();
  CHECK(A.w == o["arena"]["w"].num() && A.d == o["arena"]["d"].num() && A.standsW == o["stands"]["w"].num(), "cso_plan : carrière ou tribunes des données différentes de l'oracle");
  int n = 0, bad = 0, prims = 0, hot = 0;
  std::map<int, int> kinds;
  for (const char* ln : {"fr", "en"}) {
    const Lang L = langFromName(ln);
    for (const J& c : o[ln]["cases"].a) {
      const bool hasH = !c["heights"].isNull();
      std::vector<double> h;
      if (hasH) {
        for (const J& x : c["heights"].a) h.push_back(x.num());
        CHECK(courseHeights(d, tr, c["base"].num()) == h, "cso_plan : csoHeights(%g) différent du jeu", c["base"].num());
      }
      const int next = (int)c["next"].num();
      const CoursePlan p = coursePlan(tr, A, hasH ? &h : nullptr, next, g_text, L);
      const std::string got = coursePlanSvg(p), want = c["svg"].s;
      n++;
      if (got != want) {
        bad++;
        size_t k = 0;
        while (k < got.size() && k < want.size() && got[k] == want[k]) k++;
        const size_t a = k > 60 ? k - 60 : 0;
        if (bad < 5) std::printf("  plan %s base %s next %d : écart au caractère %zu\n    portage « %s »\n    web     « %s »\n", ln, hasH ? jsNumber(c["base"].num()).c_str() : "null", next, k, got.substr(a, 140).c_str(), want.substr(a, 140).c_str());
      }
      prims += (int)p.prims.size();
      for (const PlanPrim& q : p.prims) {
        kinds[(int)q.kind]++;
        hot += q.fill == "#1a9b62" || q.stroke == "#1a9b62";
        // Géométrie relue : nombre de valeurs attendu par sorte de primitive.
        const size_t nv = q.v.size();
        const bool ok = q.kind == PlanPrim::Kind::Rect ? nv == 5 : q.kind == PlanPrim::Kind::Line ? nv == 4 : q.kind == PlanPrim::Kind::Circle ? nv == 3 : q.kind == PlanPrim::Kind::Text ? nv == 2 : nv >= 4 && nv % 2 == 0;
        CHECK(ok, "plan : primitive %d avec %zu valeurs", (int)q.kind, nv);
      }
    }
    const std::string lg = coursePlanLegend(tr, g_text, L);
    n++;
    if (lg != o[ln]["legend"].s) {
      bad++;
      std::printf("  légende %s : « %s » / « %s »\n", ln, lg.c_str(), o[ln]["legend"].s.c_str());
    }
  }
  CHECK(bad == 0, "cso_plan : %d sorties sur %d différentes du jeu web", bad, n);
  CHECK(hot > 0, "cso_plan : aucun obstacle surligné exercé");
  std::printf("plan du parcours : %d sorties (SVG de 6 hauteurs, sans hauteurs, 4 numéros surlignés, légende ; fr et en), %d primitives, %d écarts\n", n, prims, bad);
}

// ---------- Entrée dans l'épreuve (tranche T10) : présentation, plan, capacité, activité (cso_entry.json) ----------
// Pour chaque configuration de courseSteps relevée dans la page du jeu web : composition du parcours lue dans le tracé du
// jeu (Content/Data/cso_course_pole.json, sous-ensembles de l'oracle), hauteurs csoHeights du jeu, cheval de l'oracle ;
// carte de présentation (arguments de screens.card reconstruits en HTML, DOM : kicker, titre, grille, jury, règles,
// boutons), carte du plan (HTML = coursePlanSvg + légende, DOM), contrôle de capacité (étape, dialogue, attente).
static void testCsoEntry() {
  // Copie de la table : les clés des configurations d'essai (barème, règles) n'y sont pas et ne doivent pas compter parmi
  // les textes demandés par le déroulé (contrôle de testCsoRuns).
  const TextTable tt = g_text;
  const J o = loadJson(ORA + "/cso_entry.json");
  CHECK(o["schema"].s == "strides.oracle.cso_entry/1", "cso_entry : schéma « %s »", o["schema"].s.c_str());
  const J data = loadJson(DATA + "/cso_course_pole.json");
  CourseDesign d;
  std::string err;
  CHECK(parseCourseFile(readFile(DATA + "/cso_course_pole.json"), d, err), "cso_course_pole.json : %s", err.c_str());
  const CourseTrace tr = traceCourse(d);
  CoursePlanArena A;
  A.w = data["arena"]["w"].num();
  A.d = data["arena"]["d"].num();
  A.standsW = data["stands"]["w"].num();
  const double length = data["length"].num();
  // Activité : données relevées (poteau, action) cohérentes avec le déroulé (entrée de piste) et le poteau du manifeste.
  const CsoRunConfig rc = csoRunConfigFromJson(data, {});
  CHECK(g_activity.id == "cso_train" && g_activity.startX == rc.gateX && g_activity.startZ == rc.gateZ, "cso_activity : départ de l'activité différent de l'entrée de piste");
  CHECK(g_activity.label == "Chrono" && g_activity.r > 0 && g_activity.modes.size() == 1 && g_activity.modes[0] == "ride", "cso_activity : action du poteau inattendue");
  int n = 0, bad = 0, presN = 0, capN = 0, shown = 0, planN = 0;
  std::set<std::string> diffs;
  auto same = [&](const std::string& got, const std::string& want, const std::string& what) {
    n++;
    if (got != want) {
      bad++;
      if (bad < 10) std::printf("  %s : « %s » / « %s »\n", what.c_str(), got.c_str(), want.c_str());
    }
  };
  auto labelsOf = [&](const J& cf) {
    std::vector<std::string> v;
    const std::string course = cf["course"].isNull() ? "cso" : cf["course"].s;
    for (const TraceFence& f : tr.fences) {
      bool in = course == "cso";
      if (!in)
        for (const J& x : o["subsets"][course].a) in = in || x.s == f.label;
      if (in) v.push_back(f.label);
    }
    return v;
  };
  auto capOf = [&](const J& cf, const J& c, const std::string& who, Lang L) {
    CsoCapacityInput ci;
    const std::vector<std::string> labels = labelsOf(cf);
    CHECK(labels.size() == c["fences"].a.size(), "%s : composition différente", who.c_str());
    for (size_t i = 0; i < labels.size() && i < c["fences"].a.size(); i++) {
      const TraceFence* f = nullptr;
      for (const TraceFence& x : tr.fences) if (x.label == labels[i]) f = &x;
      const J& w = c["fences"][i];
      CHECK(f && f->kind == w[0].s && f->spread == w[1].num(), "%s : obstacle %s différent du tracé", who.c_str(), labels[i].c_str());
      ci.fences.push_back({f ? f->kind : w[0].s, f ? f->spread : w[1].num(), w[2].num()});  // o.h : hauteur posée dans le jeu web
    }
    ci.hasHeights = !c["heights"].isNull();
    for (const J& x : c["heights"].a) ci.heights.push_back(x.num());
    if (!cf["base"].isNull()) CHECK(courseHeights(d, tr, cf["base"].num()) == ci.heights, "%s : csoHeights différent du jeu", who.c_str());
    ci.cso = cf["kind"].isNull() || cf["kind"].s == "cso";
    ci.hasHorse = !c["horse"].isNull();
    if (ci.hasHorse) {
      ci.power = c["horse"]["jumpPower"].num();
      ci.clearance = c["horse"]["clearance"].num();
      ci.horseName = c["horse"]["name"].s;
    }
    const CsoCapacity cap = csoCapacity(ci, tt, L);
    n++;
    capN++;
    const bool want = !c["dialog"].isNull();
    if (cap.step != c["capStep"].b || cap.hopeless != want || (cap.step && (c["capWarn"].b != cap.hopeless || c["capWait"].b != cap.hopeless || !c["capDone"].b))) {
      bad++;
      if (bad < 10) std::printf("  %s : capacité étape %d/%d dialogue %d/%d (reach %.3f, maxH %.2f)\n", who.c_str(), cap.step, c["capStep"].b, cap.hopeless, want, cap.reach, cap.maxH);
    }
    // Déroulé du portage (CsoRun) : étape de capacité lancée après l'entrée de piste, dialogue demandé (hud « dialog »)
    // seulement si le contrôle échoue, étape tenue tant qu'il n'est pas fermé, puis présentation (comme capWait / capDone).
    if (cap.step && ci.cso) {
      CsoRunConfig rcfg = rc;
      rcfg.lang = L;
      rcfg.hopeless = cap.hopeless;
      rcfg.capWho = cap.who;
      rcfg.capInitials = cap.initials;
      rcfg.capText = cap.text;
      CsoRun run(rcfg, tt);
      run.begin();
      CsoRunFrame fr;
      fr.dt = 1.0 / 30;
      fr.x = fr.focusX = rc.gateX;
      fr.z = fr.focusZ = rc.gateZ;
      CsoCadence cad;
      run.update(fr, cad);  // entrée de piste rejointe : étape de capacité
      std::string dlg;
      int dialogs = 0;
      for (const CsoCall& x : run.takeHud())
        if (x.fn == "dialog" && x.args.size() == 3) {
          dialogs++;
          dlg = x.args[0].s + "|" + x.args[1].s + "|" + x.args[2].s;
        }
      run.update(fr, cad);
      const bool held = run.step() == CsoStep::Capacity;
      run.closeCapacityDialog();
      run.update(fr, cad);
      n++;
      if (run.step() != CsoStep::Presentation || held != c["capWait"].b || dialogs != (want ? 1 : 0) || (want && dlg != c["dialog"][0][0].s + "|" + c["dialog"][0][1].s + "|" + c["dialog"][0][2].s)) {
        bad++;
        if (bad < 10) std::printf("  %s : déroulé de la capacité (dialogues %d, tenue %d / %d, étape %s)\n", who.c_str(), dialogs, held, c["capWait"].b, csoStepName(run.step()));
      }
    }
    if (want) {
      shown++;
      CHECK(c["dialog"].a.size() == 1, "%s : dialogue de %zu lignes", who.c_str(), c["dialog"].a.size());
      same(cap.who, c["dialog"][0][0].s, who + " qui");
      same(cap.initials, c["dialog"][0][1].s, who + " initiales");
      same(cap.text, c["dialog"][0][2].s, who + " texte");
    }
  };
  for (const char* ln : {"fr", "en"}) {
    const Lang L = langFromName(ln);
    const J& pres = o[ln]["presentation"];
    for (size_t k = 0; k < pres.a.size(); k++) {
      const J& c = pres[k];
      const J& cf = o["configs"]["presentation"][k];
      const std::string who = std::string(ln) + " " + cf["id"].s;
      capOf(cf, c, who, L);
      CsoPresentationInput in;
      in.labels = labelsOf(cf);
      std::vector<std::string> wl;
      for (const J& x : c["labels"].a) wl.push_back(x.s);
      CHECK(in.labels == wl, "%s : libellés différents", who.c_str());
      in.hasHeights = !c["heights"].isNull();
      for (const J& x : c["heights"].a) in.heights.push_back(x.num());
      in.hasHeight = !cf["height"].isNull();
      if (in.hasHeight) in.height = cf["height"].num();
      for (const char* key : {"title", "className", "table", "rulesText", "place"}) {
        const std::string v = cf[key].isNull() ? std::string() : cf[key].s;
        if (!std::strcmp(key, "title")) in.title = v;
        else if (!std::strcmp(key, "className")) in.className = v;
        else if (!std::strcmp(key, "table")) in.table = v;
        else if (!std::strcmp(key, "rulesText")) in.rulesText = v;
        else in.place = v;
      }
      for (const J& x : cf["intro"].a) in.intro.push_back(x.s);
      in.hasHorse = !c["horse"].isNull();
      if (in.hasHorse) in.horseName = c["horse"]["name"].s;
      in.timeAllowed = cf["ta"].isNull() ? rc.timeAllowed : (int)cf["ta"].num();
      in.length = cf["length"].isNull() ? length : cf["length"].num();
      in.appTitle = g_activity.appTitle;
      in.defaultPlace = g_activity.place;
      const CsoPresentation p = csoPresentation(in, tt, L);
      const J& args = c["presentation"]["args"];
      const J& dom = c["presentation"]["dom"];
      same(p.kicker, args["kicker"].s, who + " kicker");
      same(p.kicker, dom["kicker"].s, who + " kicker (DOM)");
      same(p.title, args["title"].s, who + " titre");
      same(p.title, dom["title"].s, who + " titre (DOM)");
      // HTML de la carte (courses.js:129-131), valeurs insérées telles quelles.
      std::string html = "<div class=\"cso-pres\">";
      for (const auto& r : p.rows) html += "<div class=\"k\">" + r.first + "</div><div class=\"v\">" + r.second + "</div>";
      html += "</div>" + (p.jury.empty() ? std::string() : "<p class=\"cso-jury\">" + p.jury + "</p>") + "<p class=\"cso-rules\">" + p.rules + "</p>";
      same(html, args["html"].s, who + " html");
      CHECK(dom["rows"].a.size() == p.rows.size(), "%s : %zu lignes au lieu de %zu", who.c_str(), p.rows.size(), dom["rows"].a.size());
      for (size_t i = 0; i < p.rows.size() && i < dom["rows"].a.size(); i++) {
        same(p.rows[i].first, dom["rows"][i][0].s, who + " clé");
        same(p.rows[i].second, dom["rows"][i][1].s, who + " valeur");
      }
      same(p.jury, dom["jury"].isNull() ? std::string() : dom["jury"].s, who + " jury");
      same(p.rules, dom["rules"].s, who + " règles");
      same("plan|" + p.planLabel + "|0 enter|" + p.enterLabel + "|1", args["buttons"][0][0].s + "|" + args["buttons"][0][1].s + "|" + (args["buttons"][0][2].b ? "1" : "0") + " " + args["buttons"][1][0].s + "|" + args["buttons"][1][1].s + "|" + (args["buttons"][1][2].b ? "1" : "0"), who + " boutons");
      same(p.planLabel + "|" + p.enterLabel, dom["buttons"][0][1].s + "|" + dom["buttons"][1][1].s, who + " boutons (DOM)");
      // Carte du plan.
      const CsoPlanCard pc = csoPlanCard(in, tr, tt, L);
      const J& pa = c["plan"]["args"];
      same(pc.kicker, pa["kicker"].s, who + " plan kicker");
      same(pc.title, pa["title"].s, who + " plan titre");
      const CoursePlan plan = coursePlan(tr, A, in.hasHeights ? &in.heights : nullptr, 0, tt, L);
      same(coursePlanSvg(plan) + "<p class=\"plan-legend\">" + pc.legend + "</p>", pa["html"].s, who + " plan html");
      same(pc.legend, c["plan"]["dom"]["legend"].s, who + " légende (DOM)");
      same("plan-back|" + pc.backLabel + "|1", pa["buttons"][0][0].s + "|" + pa["buttons"][0][1].s + "|" + (pa["buttons"][0][2].b ? "1" : "0"), who + " plan bouton");
      CHECK(pa["buttons"].a.size() == 1 && c["plan"]["dom"]["svg"].b, "%s : carte du plan inattendue", who.c_str());
      presN++;
      planN++;
      double ch = 0;
      if (csoClassHeight(in, ch)) diffs.insert(csoDifficultyKey(ch));
    }
    const J& caps = o[ln]["capacity"];
    for (size_t k = 0; k < caps.a.size(); k++) capOf(o["configs"]["capacity"][k], caps[k], std::string(ln) + " capacité " + std::to_string(k), L);
  }
  // Action du poteau (interact.update) : proposée exactement quand le jeu web la retient, libellé traduit.
  int interN = 0, chosen = 0;
  for (const char* ln : {"fr", "en"})
    for (const J& c : o[ln]["interact"].a) {
      const bool av = csoActivityAvailable(g_activity, c["fx"].num(), c["fz"].num(), c["mode"].s, c["mission"].b);
      const bool web = !c["id"].isNull() && c["id"].s == "act:" + g_activity.id;
      n++;
      interN++;
      chosen += web;
      if (av != web || (web && c["label"].s != tt.t(g_activity.label, langFromName(ln)))) {
        bad++;
        if (bad < 10) std::printf("  action du poteau %s (%g ; %g) %s mission %d : portage %d, web %s\n", ln, c["fx"].num(), c["fz"].num(), c["mode"].s.c_str(), c["mission"].b, av, c["id"].isNull() ? "aucune" : c["id"].s.c_str());
      }
    }
  CHECK(chosen > 0 && chosen < interN, "cso_entry : action du poteau jamais ou toujours retenue");
  // Lancement de l'activité : grand message (titre en capitales, verticale · catégorie, durée).
  for (const char* ln : {"fr", "en"}) {
    const CsoCall b = csoActivityLaunchBig(g_activity, tt, langFromName(ln));
    CHECK(b.fn == "big" && b.args.size() == 3 && b.args[2].n == 2600, "lancement %s : appel inattendu", ln);
  }
  CHECK(bad == 0, "cso_entry : %d sorties sur %d différentes du jeu web", bad, n);
  CHECK(diffs.size() == 4, "cso_entry : %zu niveaux de difficulté exercés sur 4", diffs.size());
  CHECK(shown > 0 && shown < capN, "cso_entry : dialogue de capacité jamais ou toujours affiché (%d sur %d)", shown, capN);
  std::printf("entrée dans l'épreuve : %d présentations et cartes du plan, %d contrôles de capacité (%d dialogues), %zu niveaux de difficulté, %d positions de l'action du poteau (%d retenues) ; %d sorties comparées, %d écarts\n", presN, capN, shown, diffs.size(), interN, chosen, n, bad);
}

// ---------- Mot d'appel (tranche T7) : csoTakeoffFeedback sur la grille de cso_feedback.json ----------
// Fonction feedback de courses.js:203-211 évaluée par scripts/unreal/export-data.mjs (épreuve, aide, dernier saut, qualité,
// sans-faute, cause) ; texte comparé en français (clé) et traduit par la table (anglais).
static void testCsoFeedback() {
  const J o = loadJson(ORA + "/cso_feedback.json");
  int n = 0, bad = 0, words = 0;
  for (const J& c : o["cases"].a) {
    CsoLastJump lj;
    const std::string last = c["last"].s;
    lj.has = last != "none";
    lj.num = last == "this" ? 3 : 4;
    lj.quality = c["q"].isNull() ? std::string() : c["q"].s;
    std::string key, kind;
    const bool got = csoTakeoffFeedback(c["cso"].b, c["aid"].s, lj, 3, c["clear"].b, c["cause"].isNull() ? std::string() : c["cause"].s, key, kind);
    const J& out = c["out"];
    const bool ok = got == !out.isNull() && (!got || (key == out[0].s && kind == out[1].s));
    if (!ok && ++bad < 6)
      std::printf("  mot d'appel : %s %s %s q=%s clear=%d cause=%s : %s %s / %s\n", c["cso"].b ? "cso" : "-", c["aid"].s.c_str(), last.c_str(), lj.quality.c_str(), (int)c["clear"].b,
                  c["cause"].isNull() ? "null" : c["cause"].s.c_str(), got ? key.c_str() : "(aucun)", kind.c_str(), out.isNull() ? "(aucun)" : out[0].s.c_str());
    if (got) {
      words++;
      CHECK(g_text.t(key, Lang::En) != key, "mot d'appel « %s » sans traduction anglaise", key.c_str());
    }
    n++;
  }
  CHECK(bad == 0 && n > 1000, "cso_feedback : %d cas sur %d différents du jeu web", bad, n);
  std::printf("mot d'appel : %d cas (%d avec un mot), %d écarts\n", n, words, bad);
}

// ---------- Interface d'épreuve (tranche T7) : strides::CsoHud rejoué sur cso_hud.json ----------
// scripts/unreal/export-hud-style.mjs rejoue dans le vrai HUD du jeu web les appels hud.* et l'état lu par hud.update des
// exécutions de cso_runs/ (et une séquence synthétique) sur une horloge virtuelle ; le modèle reçoit les mêmes entrées
// (même règle) et doit afficher le même état à chaque image : toasts, astuce, grand message, mot d'appel, crans de
// cadence, tableau (masqué, dépassement, pénalités), classes du HUD, objectif. Masquages : table de hud_cso_style.json.
static bool hudPartSame(const std::string& k, const J& w, const CsoHud& h, std::string& got) {
  auto b = [](bool v) { return std::string(v ? "true" : "false"); };
  auto q = [](const std::string& v) { return "\"" + v + "\""; };
  bool ok = false;
  if (k == "to") {
    got = "[";
    ok = w.a.size() == h.toasts().size();
    for (size_t i = 0; i < h.toasts().size(); i++) {
      got += (i ? ", " : "") + std::string("[") + q(h.toasts()[i].text) + ", " + q(h.toasts()[i].kind) + "]";
      if (ok) ok = w[i][0].s == h.toasts()[i].text && w[i][1].s == h.toasts()[i].kind;
    }
    got += "]";
  } else if (k == "hi") {
    got = "[" + b(h.hintOff()) + ", " + q(h.hintHtml()) + ", " + b(h.hintInline()) + "]";
    ok = w[0].b == h.hintOff() && w[1].s == h.hintHtml() && w[2].b == h.hintInline();
  } else if (k == "bg") {
    got = "[" + b(h.bigHidden()) + ", " + q(h.bigTitle()) + ", " + q(h.bigSub()) + ", " + b(h.bigOn()) + "]";
    ok = w[0].b == h.bigHidden() && w[1].s == h.bigTitle() && w[2].s == h.bigSub() && w[3].b == h.bigOn();
  } else if (k == "fb") {
    got = "[" + q(h.fbText()) + ", " + q(h.fbClass()) + "]";
    ok = w[0].s == h.fbText() && w[1].s == h.fbClass();
  } else if (k == "cad") {
    got = "[" + std::to_string(h.cadOn()) + ", " + b(h.cadShow()) + "]";
    ok = (int)w[0].num() == h.cadOn() && w[1].b == h.cadShow();
  } else if (k == "bd") {
    got = "[" + b(h.boardHidden()) + ", " + b(h.boardOver()) + ", " + b(h.boardFaults()) + "]";
    ok = w[0].b == h.boardHidden() && w[1].b == h.boardOver() && w[2].b == h.boardFaults();
  } else if (k == "cl") {
    got = "[" + b(h.csoOn()) + ", " + b(h.csoCtl()) + ", " + b(h.csoSober()) + "]";
    ok = w[0].b == h.csoOn() && w[1].b == h.csoCtl() && w[2].b == h.csoSober();
  } else if (k == "ob") {
    got = b(h.objectiveOff());
    ok = w.b == h.objectiveOff();
  }
  return ok;
}
static CsoCall hudCallOf(const std::string& fn, const J& args) {
  CsoCall c;
  c.fn = fn;
  for (const J& a : args.a) {
    CsoArg x;
    if (a.t == J::Num) { x.isNum = true; x.n = a.n; } else x.s = a.s;
    c.args.push_back(x);
  }
  return c;
}
static void testCsoHud() {
  // Masquages par les classes du HUD (styles.css), relevés par le navigateur.
  const J st = loadJson(DATA + "/hud_cso_style.json");
  const J& mk = st["masks"];
  int maskN = 0, maskBad = 0, maskOn = 0;
  for (const J& combo : mk["combos"].a) {
    const std::string c = " " + combo.s + " ";
    const bool ctl = c.find(" cso-ctl ") != std::string::npos, sober = c.find(" cso-sober ") != std::string::npos, on = c.find(" cso-on ") != std::string::npos, big = c.find(" big-on ") != std::string::npos;
    for (const J& en : mk["elements"].a) {
      const J& v0 = mk["table"][""][en.s];
      const J& v = mk["table"][combo.s][en.s];
      const bool vis0 = v0[0].s != "none" && v0[1].num() > 0, vis = v[0].s != "none" && v[1].num() > 0;
      CHECK(vis0, "hud_cso_style : élément %s non visible sans classe", en.s.c_str());
      int idx = -1;
      for (int e = 0; e < (int)CsoHudElement::Count; e++)
        if (en.s == csoHudElementName((CsoHudElement)e)) idx = e;
      CHECK(idx >= 0, "hud_cso_style : élément %s inconnu du portage", en.s.c_str());
      if (idx < 0) continue;
      const bool got = csoHudMasked((CsoHudElement)idx, ctl, sober, on, big);
      maskN++;
      maskOn += !vis;
      if (got != !vis && ++maskBad < 6) std::printf("  masquage %s sous « %s » : %d / web %d\n", en.s.c_str(), combo.s.c_str(), (int)got, (int)!vis);
    }
  }
  CHECK(maskBad == 0 && maskN > 100, "masquages du HUD : %d écarts sur %d", maskBad, maskN);
  std::printf("masquages du HUD : %d cas (%d masqués), %d écarts\n", maskN, maskOn, maskBad);

  const J o = loadJson(ORA + "/cso_hud.json");
  CHECK(o["schema"].s == "strides.oracle.cso_hud/1", "cso_hud : schéma « %s »", o["schema"].s.c_str());
  static const std::set<std::string> FNS = {"big", "toast", "hint", "clearHint", "jumpFeedback", "setObjective"};
  std::string loaded;
  J runJ;
  int replays = 0, frames = 0, bad = 0, maxToasts = 0;
  std::map<std::string, int> partN;
  // Horloges : 0 = ticks entiers (100 par image : horloge virtuelle du web, 1000/30 ms) ; 1 = advance(1/30 s) ;
  // 2 = advance en trois pas inégaux par image (4 ms, 12,5 ms, reste) ; 3 = advance du pas arrondi en float (Dt du
  // moteur). Toutes rendent les mêmes relevés : la conversion secondes → ticks est couverte par l'oracle.
  int clockBad[4] = {0, 0, 0, 0};
  for (int clock = 0; clock < 4; clock++)
  for (const J& rp : o["replays"].a) {
    const std::string who = rp["id"].s + " (" + rp["lang"].s + ", " + std::to_string((int)rp["vh"].num()) + " px, horloge " + std::to_string(clock) + ")";
    const bool synth = !rp["inputs"].isNull();
    if (!synth) {
      const std::string file = rp["id"].s + "." + rp["lang"].s + ".json";
      if (file != loaded) {
        runJ = loadJson(ORA + "/cso_runs/" + file);
        loaded = file;
      }
    }
    const J& setup = synth ? rp["inputs"]["setup"] : runJ["setup"]["calls"]["hud"];
    const J& fr = synth ? rp["inputs"]["frames"] : runJ["frames"];
    CHECK((double)fr.a.size() == rp["frames"].num(), "%s : nombre d'images", who.c_str());
    CsoHud h;
    h.setViewportHeight(rp["vh"].num());
    auto apply = [&](const J& c) {
      const std::string fn = synth ? c[0].s : c["fn"].s;
      const J& args = synth ? c[1] : c["args"];
      if (!FNS.count(fn)) return;
      if (fn == "setObjective") h.setObjective(!args[0].isNull());
      else h.call(hudCallOf(fn, args));
    };
    for (const J& c : setup.a) apply(c);
    std::map<std::string, J> want;
    size_t si = 0;
    const J& snaps = rp["snaps"];
    int rb = 0;
    auto compare = [&](int f) {
      while (si < snaps.a.size() && (int)snaps[si][0].num() == f) {
        for (const auto& kv : snaps[si][1].o) {
          want[kv.first] = kv.second;
          if (clock == 0) partN[kv.first]++;
          if (kv.first == "to") maxToasts = std::max(maxToasts, (int)kv.second.a.size());
        }
        si++;
      }
      for (const auto& kv : want) {
        std::string got;
        if (!hudPartSame(kv.first, kv.second, h, got)) {
          rb++;
          if (rb < 4) std::printf("  %s image %d : %s = %s / web %s\n", who.c_str(), f, kv.first.c_str(), got.c_str(), dump(kv.second).c_str());
        }
      }
    };
    compare(-1);
    for (size_t k = 0; k < fr.a.size(); k++) {
      const J& f = fr[k];
      if (clock == 0) h.advanceTicks(100);
      else if (clock == 1) h.advance(1.0 / 30);
      else if (clock == 2) {
        h.advance(0.004);
        h.advance(0.0125);
        h.advance(1.0 / 30 - 0.0165);
      } else h.advance((double)(float)(1.0 / 30));
      CsoHudFrame in;
      const J& course = f["course"];
      const J& board = f["board"];
      in.course = !course.isNull();
      in.controlsCso = in.course && course["controls"].s == "cso";
      in.kindCso = in.course && course["kind"].s == "cso";
      in.board = !board.isNull();  // tableau fourni tel quel : CsoHud applique lui-même game.course && hud()
      if (in.board) {
        in.info.over = board["over"].b;
        in.info.pen = (int)board["pen"].num();
      }
      if (synth) {
        in.hasCadence = !f["cad"].isNull() && !f["cad"][0].isNull();
        if (in.hasCadence) { in.cadence = f["cad"][0].num(); in.cadAdjust = f["cad"][1].b; }
      } else {
        const J& s = f["ch"]["s"];
        in.hasCadence = !s.isNull() && !s["cad"].isNull();
        if (in.hasCadence) { in.cadence = s["cad"].num(); in.cadAdjust = !s["ca"].isNull() && s["ca"].b; }
      }
      for (const J& c : f["hud"].a) apply(c);
      h.update(1.0 / 30, in);
      compare((int)k);
      if (clock == 0) frames++;
    }
    CHECK(si == snaps.a.size(), "%s : relevés au-delà des images rejouées", who.c_str());
    CHECK(rb == 0, "%s : HUD d'épreuve : %d écarts", who.c_str(), rb);
    bad += rb;
    clockBad[clock] += rb;
    if (clock == 0) replays++;
  }
  std::string parts;
  for (const auto& kv : partN) parts += " " + kv.first + " " + std::to_string(kv.second);
  for (const char* k : {"to", "hi", "bg", "fb", "cad", "bd", "cl", "ob"}) CHECK(partN[k] > 0, "cso_hud : partie %s jamais relevée", k);
  CHECK(maxToasts == 2, "cso_hud : deux toasts simultanés jamais relevés (max %d)", maxToasts);
  CHECK(replays > 100, "cso_hud : %d rejeux", replays);
  std::printf("HUD d'épreuve : %d rejeux, %d images, %d écarts ; changements relevés :%s ; toasts simultanés au plus %d\n", replays, frames, bad, parts.c_str(), maxToasts);
  std::printf("HUD d'épreuve, horloges (ticks, 1/30 s, pas découpés, pas float) : %d / %d / %d / %d écarts\n", clockBad[0], clockBad[1], clockBad[2], clockBad[3]);
}

// ---------- Déroulé d'épreuve (tranche T4) : strides::CsoRun rejoué sur le canal « ep » de cso_runs/ ----------
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
static std::vector<std::string> oracleCalls(const J& list, bool hud, bool launch = false) {
  std::vector<std::string> v;
  for (const J& c : list.a) {
    const std::string& src = c["src"].s;
    const std::string& fn = c["fn"].s;
    // Mot d'appel hud.jumpFeedback compris depuis la tranche T7 (dernier saut relevé dans ep.lj). Lancement de l'activité
    // (tranche T10, launch) : grand message et son « notify » de missions.start compris.
    const bool mis = src == "gameplay/missions.js";
    // Fin de la mission (tranche T11, missions.complete → run.cleanup) : dialogue fermé (closeDialog) compris.
    const bool keep = hud ? src == "gameplay/courses.js" || (mis && (fn == "clearHint" || fn == "closeDialog")) || (launch && mis && fn == "big") : src == "gameplay/courses.js" || (launch && mis && fn == "notify");
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
// ---------- Classement simulé et bilan (tranche T11) ----------
// Carte de bilan du portage comparée à celle relevée dans le DOM (kicker, titre, grille, tableau, boutons) : texte vide
// si identique, sinon la première différence.
static std::string resultDiff(const CsoResultCard& c, const J& d) {
  auto q = [](const std::string& s) { return " « " + s + " »"; };
  if (c.kicker != d["kicker"].s) return " kicker" + q(c.kicker) + " /" + q(d["kicker"].s);
  if (c.title != d["title"].s) return " titre" + q(c.title) + " /" + q(d["title"].s);
  if (c.rows.size() != d["rows"].a.size()) return " grille de " + std::to_string(c.rows.size()) + " lignes / " + std::to_string(d["rows"].a.size());
  for (size_t i = 0; i < c.rows.size(); i++)
    if (c.rows[i].first != d["rows"][i][0].s || c.rows[i].second != d["rows"][i][1].s) return " grille" + q(c.rows[i].first + " = " + c.rows[i].second) + " /" + q(d["rows"][i][0].s + " = " + d["rows"][i][1].s);
  if (c.table.size() != d["table"].a.size()) return " tableau de " + std::to_string(c.table.size()) + " lignes / " + std::to_string(d["table"].a.size());
  for (size_t i = 0; i < c.table.size(); i++) {
    const CsoResultRow& r = c.table[i];
    const J& w = d["table"][i];
    const std::vector<std::string> got = {std::to_string(r.rank), r.name, r.pts, r.time, r.prize};
    std::vector<std::string> want;
    for (const J& x : w["td"].a) want.push_back(x.s);
    if (got != want || r.me != w["me"].b) {
      std::string a, b;
      for (const auto& x : got) a += x + "|";
      for (const auto& x : want) b += x + "|";
      return " ligne " + std::to_string(i + 1) + q(a + (r.me ? " me" : "")) + " /" + q(b + (w["me"].b ? " me" : ""));
    }
  }
  if (c.buttons.size() != d["buttons"].a.size()) return " boutons";
  for (size_t i = 0; i < c.buttons.size(); i++) {
    const J& b = d["buttons"][i];
    if (c.buttons[i].id != b[0].s || c.buttons[i].label != b[1].s || (b[2].s.find("primary") != std::string::npos) != c.buttons[i].primary) return " bouton" + q(c.buttons[i].id + " " + c.buttons[i].label) + " /" + q(b[0].s + " " + b[1].s);
  }
  return std::string();
}

// mulberry32, simulateField et rankResults du jeu web (cso_ranking.json) : tirages, engagés (cavalier, cheval, points,
// chrono au centième) et ordre du classement, à l'identique.
static void testRanking() {
  const J o = loadJson(ORA + "/cso_ranking.json");
  int bad = 0, nMul = 0, nField = 0, nRank = 0;
  for (const J& m : o["mulberry32"].a) {
    const double seed = m["seed"].t == J::Str ? (m["seed"].s == "NaN" ? NAN : m["seed"].s == "Infinity" ? INFINITY : -INFINITY) : m["seed"].num();
    Mulberry32 r(seed);
    for (const J& v : m["out"].a) {
      const double got = r.next();
      if (got != v.num()) { bad++; if (bad < 6) std::printf("  mulberry32(%s) : %.17g / %.17g\n", dump(m["seed"]).c_str(), got, v.num()); }
      nMul++;
    }
  }
  for (const J& f : o["fields"].a) {
    RankClass cls;
    cls.id = f["cls"]["id"].s;
    cls.ta = f["cls"]["ta"].num();
    const std::vector<RankEntry> got = simulateField(cls, f["seed"].num(), (int)f["n"].num(), g_names);
    if (got.size() != f["field"].a.size()) { bad++; continue; }
    for (size_t i = 0; i < got.size(); i++) {
      const J& w = f["field"][i];
      if (got[i].rider != w["rider"].s || got[i].horse != w["horse"].s || got[i].faults != (int)w["faults"].num() || got[i].time != w["time"].num()) {
        bad++;
        if (bad < 6) std::printf("  simulateField(%s, %g) n° %zu : %s · %s %d %.17g / %s · %s %g %.17g\n", cls.id.c_str(), f["seed"].num(), i, got[i].rider.c_str(), got[i].horse.c_str(), got[i].faults, got[i].time,
                                 w["rider"].s.c_str(), w["horse"].s.c_str(), w["faults"].num(), w["time"].num());
      }
      nField++;
    }
  }
  const RankClass pole{o["classes"]["pole"]["id"].s, o["classes"]["pole"]["ta"].num()};
  for (const J& c : o["ranks"].a) {
    std::vector<RankEntry> list = simulateField(pole, c["seed"].num(), 14, g_names);
    for (size_t i = 0; i < list.size(); i++) list[i].rider += "#" + std::to_string(i);  // repère du rang d'origine
    RankEntry me;
    me.rider = "me";
    me.faults = (int)c["me"]["faults"].num();
    me.time = c["me"]["time"].num();
    me.me = true;
    list.push_back(me);
    const std::vector<RankEntry> ranked = rankResults(list);
    std::vector<int> order;
    for (const RankEntry& x : ranked) order.push_back(x.me ? -1 : std::stoi(x.rider.substr(x.rider.find('#') + 1)));
    std::vector<int> want;
    for (const J& v : c["order"].a) want.push_back((int)v.num());
    if (order != want) { bad++; if (bad < 6) std::printf("  rankResults (graine %g, joueur %g pts %.17g) : ordre différent\n", c["seed"].num(), c["me"]["faults"].num(), c["me"]["time"].num()); }
    nRank++;
  }
  CHECK(bad == 0 && nMul > 200 && nField > 800 && nRank > 100, "classement simulé : %d écarts (mulberry32 %d tirages, %d engagés, %d classements)", bad, nMul, nField, nRank);
  std::printf("classement simulé : %d tirages mulberry32, %d engagés de simulateField, %d classements rankResults identiques au jeu web\n", nMul, nField, nRank);
}

// Carte de bilan (cso_result.json : étape de bilan du jeu web démarrée sur des états posés, DOM relevé) : contenu
// identique ; choix du bilan (Recommencer, Quitter, S'entraîner) relevés dans le jeu web.
static void testCsoResult() {
  const J o = loadJson(ORA + "/cso_result.json");
  // Temps accordé du Parcours du Pôle : celui que le jeu lit (cso_course_pole.json, objet run).
  const CsoRunConfig pole = csoRunConfigFromJson(loadJson(DATA + "/cso_course_pole.json"), {});
  int n = 0, bad = 0, nine = 0, horseless = 0, buttons = 0;
  std::set<std::string> titles;
  for (const char* lang : {"fr", "en"}) {
    const Lang L = langFromName(lang);
    for (const J& c : o[lang].a) {
      CsoResultInput in;
      const J& s = c["state"];
      in.state.t = s["t"].num();
      in.state.faults = (int)s["faults"].num();
      in.state.timeFaults = (int)s["timeFaults"].num();
      in.state.attempt = (int)s["attempt"].num();
      in.state.eliminated = !s["eliminated"].isNull();
      if (in.state.eliminated) in.state.eliminatedReason = s["eliminated"].s;
      for (const J& l : c["log"].a) in.state.log.push_back({l[0].s, l[1].s, l[2].isNull() ? "" : l[2].s, l[3].isNull() ? "" : l[3].s});
      in.playerName = c["playerName"].s;
      in.hasHorse = !c["horseName"].isNull();
      if (in.hasHorse) in.horseName = c["horseName"].s;
      in.timeAllowed = pole.timeAllowed;
      in.courseTitle = g_activity.title;
      in.result = g_activity.result;
      const CsoResultCard card = csoResultCard(in, g_names, g_text, L);
      const std::string why = resultDiff(card, c["dom"]);
      if (!why.empty()) { bad++; if (bad < 8) std::printf("  bilan %s (%s) :%s\n", c["id"].s.c_str(), lang, why.c_str()); }
      n++;
      nine += card.table.size() == 9;
      horseless += !in.hasHorse;
      titles.insert(c["dom"]["title"].s);
      CHECK(c["waiting"].b, "bilan %s (%s) : l'étape attend le choix", c["id"].s.c_str(), lang);
      if (!c["retry"].isNull()) {
        buttons++;
        const J& r = c["retry"];
        const J& d = c["done"];
        const J& t = c["train"];
        // Recommencer : 4 étapes insérées (entrée en piste, cloche, parcours, bilan), état neuf de la manche suivante.
        CHECK(r["closed"].b && r["flag"].s == "retry" && r["next"].b && r["inserted"].a.size() == 4 && r["state"]["attempt"].num() == in.state.attempt + 1 && r["state"]["t"].num() == 0 &&
                  r["state"]["faults"].num() == 0 && r["state"]["log"].num() == 0 && r["state"]["eliminated"].isNull() && !r["state"]["started"].b,
              "bilan %s (%s) : Recommencer du jeu web (manche neuve)", c["id"].s.c_str(), lang);
        // Quitter et S'entraîner : même fin (bilan validé, resultCustom, fermeture) ; S'entraîner demande en plus
        // l'entraînement 300 ms plus tard (startTraining : cso_warmup, absent du portage).
        CHECK(d["closed"].b && d["flag"].s == "done" && d["next"].b && d["custom"].b && d["close"].num() == 1 && !d["afterTrain"].b, "bilan %s (%s) : Quitter l'épreuve du jeu web", c["id"].s.c_str(), lang);
        CHECK(t["closed"].b && t["flag"].s == "train" && t["next"].b && t["close"].num() == 1 && t["afterTrain"].b && t["timers"].a.size() == 1 && t["timers"][0].num() == 300 && t["startTraining"].num() == 1,
              "bilan %s (%s) : S'entraîner du jeu web", c["id"].s.c_str(), lang);
      }
    }
  }
  CHECK(bad == 0 && n >= 20, "bilan : %d cartes sur %d différentes du jeu web", bad, n);
  CHECK(nine > 0 && horseless > 0 && buttons >= 4, "bilan : branches non exercées (joueur au-delà du 8e %d, sans cheval %d, boutons %d)", nine, horseless, buttons);
  std::string ts;
  for (const auto& x : titles) ts += " « " + x + " »";
  std::printf("bilan (cso_result.json) : %d cartes identiques au DOM du jeu web (joueur au-delà du 8e : %d, sans cheval : %d, boutons touchés : %d cas) ; titres :%s\n", n, nine, horseless, buttons, ts.c_str());
}

// Mise en page de la carte de bilan (contrôle adverse de T11) : relevé de base d'une vue du jeu (cso_result_style.json,
// lu par UStridesCsoScreens) et état posé du web (cso_result_layout.json : lignes de chaque texte tirées de la hauteur de
// sa boîte, largeur du texte de chaque cellule) → csoResultLayout : boîtes du kicker, du titre, de la grille, du tableau,
// des lignes et des cellules (au dixième de px du relevé près), scrollHeight, hauteur visible, classe more en haut et
// défilé jusqu'en bas (scrollTop maximal) identiques au navigateur.
static CsoBox boxOfRect(const J& r) { return {r[0].num(), r[1].num(), r[2].num(), r[3].num()}; }
static CsoResultLayoutBase resultLayoutBase(const J& res) {
  CsoResultLayoutBase b;
  b.body = boxOfRect(res["body"]["rect"]);
  b.padBottom = std::stod(res["body"]["paddingBottom"].s);
  b.clientHeight = res["body"]["clientHeight"].num();
  b.kicker = boxOfRect(res["kicker"]["rect"]);
  b.title = boxOfRect(res["title"]["rect"]);
  for (const J& k : res["keys"].a) b.keys.push_back(boxOfRect(k["rect"]));
  for (const J& v : res["values"].a) b.values.push_back(boxOfRect(v["rect"]));
  b.table = boxOfRect(res["table"]["rect"]);
  for (const J& r : res["rows"].a) b.rows.push_back(boxOfRect(r["rect"]));
  for (const J& c : res["rows"][0]["cells"].a) b.cellPad.push_back(std::stod(c["paddingLeft"].s) + std::stod(c["paddingRight"].s));
  return b;
}
static void testCsoResultLayout() {
  const J st = loadJson(DATA + "/cso_result_style.json");
  const J o = loadJson(ORA + "/cso_result_layout.json");
  const J cards = loadJson(ORA + "/cso_result.json");
  int n = 0, bad = 0, wrapped = 0, nine = 0, boxes = 0, moreBottom = 0;
  double worst = 0;
  for (const char* lang : {"fr", "en"}) {
    for (const J& L : o[lang].a) {
      const std::string id = L["id"].s + " (" + lang + ", " + dump(L["viewport"]) + ")";
      const J* base = nullptr;
      for (const J& v : st["views"].a)
        if (v["lang"].s == lang && v["viewport"][0].num() == L["viewport"][0].num() && v["viewport"][1].num() == L["viewport"][1].num()) base = &v["result"];
      const J* card = nullptr;
      for (const J& c : cards[lang].a)
        if (c["id"].s == L["id"].s) card = &c;
      CHECK(base && card && dump((*card)["dom"]) == dump(L["dom"]), "mise en page %s : relevé de base de la vue et carte de cso_result.json", id.c_str());
      if (!base || !card) continue;
      const CsoResultLayoutBase b = resultLayoutBase(*base);
      CsoResultLayoutIn in;
      auto lines = [](const J& r, const CsoBox& one) { return (int)std::lround(r[3].num() / one.h); };
      in.kickerLines = lines(L["kicker"], b.kicker);
      in.titleLines = lines(L["title"], b.title);
      for (size_t i = 0; i < L["keys"].a.size() && i < b.keys.size(); i++) in.keyLines.push_back(lines(L["keys"][i], b.keys[i]));
      for (size_t i = 0; i < L["values"].a.size() && i < b.values.size(); i++) in.valueLines.push_back(lines(L["values"][i], b.values[i]));
      for (const J& r : L["rows"].a) {
        std::vector<double> tw;
        for (const J& w : r["tw"].a) tw.push_back(w.num());
        in.cellText.push_back(tw);
      }
      const CsoResultLayout got = csoResultLayout(b, in);
      int diffs = 0;
      auto cmp = [&](const std::string& what, const CsoBox& g, const J& w) {
        const double d = std::max({std::fabs(g.x - w[0].num()), std::fabs(g.y - w[1].num()), std::fabs(g.w - w[2].num()), std::fabs(g.h - w[3].num())});
        worst = std::max(worst, d);
        boxes++;
        if (d > 0.15 && ++diffs <= 2)
          std::printf("  mise en page %s : %s [%.2f, %.2f, %.2f, %.2f] / web %s\n", id.c_str(), what.c_str(), g.x, g.y, g.w, g.h, dump(w).c_str());
      };
      cmp("kicker", got.kicker, L["kicker"]);
      cmp("titre", got.title, L["title"]);
      if (got.keys.size() != L["keys"].a.size() || got.rows.size() != L["rows"].a.size()) diffs++;
      for (size_t i = 0; i < got.keys.size() && i < L["keys"].a.size(); i++) {
        cmp("clé " + std::to_string(i), got.keys[i], L["keys"][i]);
        cmp("valeur " + std::to_string(i), got.values[i], L["values"][i]);
      }
      cmp("tableau", got.table, L["table"]);
      for (size_t j = 0; j < got.rows.size() && j < L["rows"].a.size(); j++) {
        cmp("ligne " + std::to_string(j + 1), got.rows[j], L["rows"][j]["rect"]);
        for (size_t k = 0; k < got.cells[j].size() && k < L["rows"][j]["cells"].a.size(); k++)
          cmp("cellule " + std::to_string(j + 1) + "." + std::to_string(k + 1), got.cells[j][k], L["rows"][j]["cells"][k]);
      }
      const J& bo = L["bottom"];
      const bool scrollOk = got.scrollHeight == (int)L["body"]["scrollHeight"].num() && got.clientHeight == L["body"]["clientHeight"].num() && got.maxScroll() == bo["scrollTop"].num() &&
                            got.more(0) == L["more"].b && got.more(got.maxScroll()) == bo["more"].b && !got.tooWide;
      if (!scrollOk) {
        diffs++;
        std::printf("  mise en page %s : défilement %d / %g, visible %g / %g, bas %g / %g, more %d %d / %d %d\n", id.c_str(), got.scrollHeight, L["body"]["scrollHeight"].num(), got.clientHeight,
                    L["body"]["clientHeight"].num(), got.maxScroll(), bo["scrollTop"].num(), got.more(0), got.more(got.maxScroll()), L["more"].b, bo["more"].b);
      }
      bad += diffs > 0;
      n++;
      wrapped += *std::max_element(in.valueLines.begin(), in.valueLines.end()) > 1;
      nine += got.rows.size() == 9;
      moreBottom += !bo["more"].b && L["more"].b;
    }
  }
  CHECK(bad == 0 && n >= 60, "mise en page du bilan : %d vues sur %d différentes du navigateur", bad, n);
  CHECK(wrapped >= 6 && nine >= 16 && moreBottom == n, "mise en page du bilan : branches non exercées (valeur sur deux lignes %d, joueur au-delà du 8e %d, ombre retirée en bas %d)", wrapped, nine, moreBottom);
  std::printf("mise en page du bilan (cso_result_layout.json) : %d vues (%d avec une valeur sur deux lignes, %d avec le joueur au-delà du 8e), %d boîtes à %.3f px au plus du navigateur ; défilement et classe more identiques\n",
              n, wrapped, nine, boxes, worst);
}

static void testCsoRuns() {
  J o = loadRuns();
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
                            "t4-gardes", "t4-un-point", "t4-entree", "t4-lance-limites", "t4-lance-limites-gauche", "t4-lance-loin", "t4-lance-large", "t4-lance-cap",
                            "t4-lance-derriere", "t4-hors-parcours", "t4-sortie-descente", "t7-parfait-barre-2", "t11-refus", "t11-manche-2"};
  std::map<std::string, int> clean;  // « id lang » → images rejouées sans écart
  int frames = 0, hudN = 0, audioN = 0, boardN = 0, hlN = 0, rrN = 0, cheerN = 0, launchN = 0;
  // Gardes des écouteurs d'obstacle (courses.js:219-268) réellement exercées par les oracles : événements relevés pendant
  // l'étape de parcours, classés selon l'état de l'épreuve juste avant (contrôle adverse de T4).
  std::map<std::string, int> cover;
  const char* guards[] = {"refus avant le départ, obstacle attendu, dans son sens", "refus devant un obstacle non attendu, après le départ", "refus à rebours devant l'obstacle attendu",
                          "saut à rebours de l'obstacle attendu", "saut à rebours d'un obstacle non attendu", "saut dans son sens après l'arrivée", "saut dans son sens avant le départ",
                          // Second contrôle adverse de T4 : fautes (barres) à rebours et avant le départ (branche partagée avec
                          // les sauts franchis), saut hors de l'étape de parcours (écouteurs pas encore posés), règles de
                          // l'ouverture du parcours (départ lancé, courses.js:274 : chaque condition seule en défaut, et les
                          // limites approchées à moins de 0,5 m ou de 0,1 en cosinus), de l'arrivée (courses.js:333 : ligne
                          // d'arrivée franchie avant le départ, puis avant le dernier obstacle) et de la sortie de piste
                          // écourtée par une descente (courses.js:320).
                          "faute à rebours de l'obstacle attendu", "faute à rebours d'un obstacle non attendu", "faute dans son sens avant le départ",
                          "saut hors de l'étape de parcours (mission en cours)", "départ lancé accordé près des limites (12 m, largeur, cap, 0 m)",
                          "départ lancé refusé : en deçà de la ligne seulement", "départ lancé refusé : au-delà de 12 m seulement", "départ lancé refusé : hors de la largeur seulement",
                          "départ lancé refusé : cap au-delà de 60° seulement", "ligne d'arrivée franchie avant le départ", "ligne d'arrivée franchie avant le dernier obstacle",
                          "sortie de piste écourtée par une descente"};
  for (const char* g : guards) cover[g] = 0;
  int logN = 0;  // changements du journal des fautes comparés
  int ljN = 0, fbN = 0;  // derniers sauts relevés et mots d'appel comparés (tranche T7)
  int perfectN = 0, bar2N = 0;  // « Appel parfait » et « Barre au 2 · +4 · … » produits par le portage (critère de T7)
  int bilanN = 0, recordN = 0;  // tranche T11 : bilans comparés, meilleurs temps enregistrés comparés
  std::set<std::string> bilanIds;
  std::vector<std::string> forced;  // exécutions dont l'état de l'épreuve est écrit par le test (non rejouées)
  for (const J& r : o["runs"].a) {
    const std::string id = r["id"].s, lang = r["lang"].s, who = id + " (" + lang + ")";
    const J& su = r["setup"];
    // Rejoués : scénarios enregistrés depuis le lancement de l'activité (première étape en cours, aucune image avant).
    if (su["run0"].isNull() || su["run0"]["i"].isNull() || su["run0"]["i"].num() != 0 || r["frames"].a.empty() || r["frames"][0]["ep"].isNull() ||
        r["frames"][0]["ep"]["i"].num() != 0)
      continue;
    // Contrôle adverse de T9 : t9-recette (tests/e2e/cso-shots.mjs) écrit l'état de l'épreuve entre deux images (champ fs :
    // chrono lancé, obstacle attendu, chrono, surlignage) ; hors de la logique du jeu, il n'est pas rejoué ici (canal « ai »
    // et HUD rejoués par testCsoAids et les poses aide-4-*, aide-5-*).
    if (!su["recette"].isNull()) {
      bool fs = false;
      for (const J& f : r["frames"].a) fs = fs || !f["fs"].isNull();
      CHECK(fs, "%s : état forcé (fs) absent", who.c_str());
      forced.push_back(id);
      continue;
    }
    CHECK(std::abs(su["finish"]["x"].num() - base.finish.x) < 1e-9 && std::abs(su["finish"]["z"].num() - base.finish.z) < 1e-9 && su["finish"]["w"].num() == base.finish.w &&
              std::abs(su["start"]["x"].num() - base.start.x) < 2e-6 && su["start"]["w"].num() == base.start.w && su["gate"]["x"].num() == base.gateX && su["gate"]["z"].num() == base.gateZ,
          "%s : lignes ou entrée de piste du jeu différentes des données", who.c_str());
    CsoRunConfig cfg = base;
    cfg.playerName = su["playerName"].s;
    cfg.horseName = su["horseName"].s;
    cfg.lang = langFromName(lang);
    // Tranche T9 : réglage jumpAid posé avant le lancement (exécutions t9-*, setup.aid ; aid() de courses.js:82 le lit).
    if (su["aid"].t == J::Str) cfg.aid = su["aid"].s;
    // Tranche T10 : lancement de l'activité (missions.start) porté : grand message (données de cso_activity.json) et
    // « notify » avant la première étape, comparés aux appels du lancement relevés (setup.calls).
    cfg.launch = true;
    cfg.launchBig = csoActivityLaunchBig(g_activity, g_text, cfg.lang);
    // Tranche T11 : bilan (opts.result de l'activité) et étape d'enregistrement du meilleur temps (sauvegarde neuve de
    // la page d'export : aucun meilleur temps au lancement).
    cfg.resultCfg = g_activity.result;
    cfg.courseTitle = g_activity.title;
    cfg.record = !g_activity.noRecord;
    cfg.recordId = g_activity.id;
    cfg.penalties = g_activity.penalties;
    CsoRun run(cfg, g_text);
    run.begin();
    int bad = 0, n = 0;
    auto diff = [&](int f, const std::string& what) {
      bad++;
      if (bad < 6) std::printf("  %s image %d : %s\n", who.c_str(), f, what.c_str());
    };
    {
      const std::vector<std::string> got = coreCalls(run.takeHud()), want = oracleCalls(su["calls"]["hud"], true, true);
      if (got != want) diff(-1, "appels hud au lancement");
      const std::vector<CsoCall> la = run.takeAudio();
      g_launchSounds[id + " " + lang] = sndCalls(la);
      const std::vector<std::string> ga = coreCalls(la), wa = oracleCalls(su["calls"]["audio"], false, true);
      if (ga != wa || wa.empty()) diff(-1, "sons au lancement");
      launchN++;
    }
    std::vector<std::string> hudAll, audioAll;
    std::set<std::string> texts;  // objectifs affichés (étape goto de t4-entree)
    int hlWant = -1;              // dernier numéro surligné par le jeu web (Obstacles.highlight), -1 avant tout appel
    std::vector<std::string> lgWant;  // journal des fautes du jeu web (state.log), relevé quand il change
    bool hasSb0 = false;              // position de l'image précédente pendant l'étape de parcours (ligne d'arrivée)
    double sb0x = 0, sb0z = 0;
    for (const J& f : r["frames"].a) {
      const int fi = (int)f["f"].num();
      const J& ep = f["ep"];
      if (ep.isNull()) { if (!run.finished()) diff(fi, "Run.update absent"); continue; }
      RunSounds& rs = g_runSounds[id + " " + lang][fi];
      rs.has = true;
      if (f["in"]["ui"].s == "enter") run.enter();
      // Tranche T11 : boutons du bilan (r.flags.res = 'retry' / 'train' / 'done').
      if (f["in"]["ui"].s == "cso-retry") run.resultChoice(CsoRun::ResultChoice::Retry);
      if (f["in"]["ui"].s == "cso-train") run.resultChoice(CsoRun::ResultChoice::Train);
      if (f["in"]["ui"].s == "cso-done") run.resultChoice(CsoRun::ResultChoice::Done);
      std::vector<CsoCall> uiAudio = run.takeAudio();  // tranche T12 : sons des boutons de carte (avant g.update)
      rs.ui = sndCalls(uiAudio);
      // Dernier saut du cheval (horse._lastJump, relevé quand il change) : lu par le mot d'appel des écouteurs (T7).
      if (ep.o.count("lj")) {
        CsoLastJump lj;
        const J& v = ep["lj"];
        lj.has = !v.isNull();
        if (lj.has) {
          lj.num = v[0].isNull() ? -1 : (int)v[0].num();
          lj.quality = v[1].isNull() ? std::string() : v[1].s;
          ljN++;
        }
        run.setLastJump(lj);
      }
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
            if (kind == CsoObstacleEventKind::Fault && live && num == s0.next && dir < 0) cover[guards[7]]++;
            if (kind == CsoObstacleEventKind::Fault && live && num != s0.next && dir < 0) cover[guards[8]]++;
            if (kind == CsoObstacleEventKind::Fault && !s0.started && dir > 0) cover[guards[9]]++;
          }
        } else if (!run.finished() && kind != CsoObstacleEventKind::Refusal && !run.state().started && !run.state().finished && !run.state().eliminated)
          cover[guards[10]]++;  // seul cas que la garde d'étape distingue (sinon « chrono pas lancé » serait annoncé)
        run.obstacleEvent(kind, num, dir, e["d"]["cause"].isNull() ? "" : e["d"]["cause"].s, e["d"]["causeText"].isNull() ? "" : e["d"]["causeText"].s, cadEv);
      }
      // Tranche T12 : sons des boutons de carte (avant l'image) puis des écouteurs d'obstacle, séparés de ceux de Run.update.
      std::vector<CsoCall> frameAudio = run.takeAudio();
      rs.ev = sndCalls(frameAudio);
      frameAudio.insert(frameAudio.begin(), uiAudio.begin(), uiAudio.end());
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
      // Règles d'ouverture, d'arrivée et de sortie réellement exercées (classées d'après l'état avant l'image et le jeu
      // web : étape suivante du relevé).
      const CsoStep stepBefore = run.step();
      const CsoRunState sb = run.state();
      run.update(in, cad);
      if (stepBefore != CsoStep::Course && run.step() == CsoStep::Course) {
        const CsoRunLine& L = cfg.start;
        const double nx = std::sin(L.rot), nz = std::cos(L.rot);
        const double sP = (in.x - L.x) * nx + (in.z - L.z) * nz, uP = std::abs((in.x - L.x) * nz - (in.z - L.z) * nx);
        const double cs = std::sin(in.heading) * nx + std::cos(in.heading) * nz, uMax = L.w / 2 + 0.3;
        const bool a = sP >= 0, b = sP < 12, c = uP < uMax, d = cs > 0.5;
        if (a && b && c && d && sP > 11.5 && uP > uMax - 0.5 && cs < 0.6) cover[guards[11]]++;
        if (a && b && c && d && sP < 0.5 && uP > uMax - 0.5 && cs < 0.6) cover[guards[11]]++;
        if (!a && b && c && d && sP > -0.5) cover[guards[12]]++;
        if (a && !b && c && d && sP < 12.5) cover[guards[13]]++;
        if (a && b && !c && d && uP < uMax + 0.5) cover[guards[14]]++;
        if (a && b && c && !d && cs > 0.4) cover[guards[15]]++;
      }
      if (stepBefore == CsoStep::Course && !sb.finished) {
        const CsoRunLine& L = cfg.finish;
        const double nx = std::sin(L.rot), nz = std::cos(L.rot);
        const double s0 = (sb0x - L.x) * nx + (sb0z - L.z) * nz, s1 = (in.x - L.x) * nx + (in.z - L.z) * nz, u = std::abs((in.x - L.x) * nz - (in.z - L.z) * nx);
        if (hasSb0 && s0 < 0 && s1 >= 0 && u < L.w / 2 + 0.3) {
          if (!sb.started) cover[guards[16]]++;
          else if (sb.next <= (int)cfg.fences.size()) cover[guards[17]]++;
        }
      }
      if (stepBefore == CsoStep::Course && sb.finished && !in.riding && sb.exitT + in.dt <= 2.6) cover[guards[18]]++;
      hasSb0 = stepBefore == CsoStep::Course || run.step() == CsoStep::Course;
      sb0x = in.x;
      sb0z = in.z;
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
      // Journal des fautes (state.log, lu par le bilan) : libellé, type, cause, texte de la cause (absent = vide).
      if (!ep["lg"].isNull()) {
        lgWant.clear();
        for (const J& e : ep["lg"].a) {
          std::string row;
          for (size_t k = 0; k < 4; k++) row += (k ? "|" : "") + (e[k].isNull() ? std::string() : e[k].s);
          lgWant.push_back(row);
        }
        logN++;
      }
      {
        std::vector<std::string> lgGot;
        for (const CsoRunLog& e : run.state().log) lgGot.push_back(e.label + "|" + e.kind + "|" + e.cause + "|" + e.causeText);
        if (lgGot != lgWant) {
          std::string s0 = "journal :";
          for (const auto& x : lgGot) s0 += " [" + x + "]";
          s0 += " / web :";
          for (const auto& x : lgWant) s0 += " [" + x + "]";
          diff(fi, s0);
        }
      }
      // Tranche T11 : bilan ouvert à cette image (carte relevée dans le DOM, canal « bl ») et contenu de la carte
      // (csoResultCard sur l'état du portage) ; meilleur temps écrit par l'étape d'enregistrement (ep.bt).
      {
        const bool opened = run.takeResultOpened(), blWant = !f["bl"].isNull();
        if (opened != blWant) diff(fi, std::string("bilan ouvert ") + (opened ? "oui" : "non") + " / " + (blWant ? "oui" : "non"));
        if (opened && blWant) {
          const std::string why = resultDiff(csoResultCard(csoResultInputOf(run), g_names, g_text, cfg.lang), f["bl"]);
          if (!why.empty()) diff(fi, "bilan :" + why);
          bilanN++;
          bilanIds.insert(id + " " + lang + " " + f["bl"]["title"].s);
        }
        const CsoRun::Record rc = run.takeRecord();
        const bool btWant = ep.o.count("bt") > 0;
        if (rc.rec != btWant || (btWant && (ep["bt"].isNull() || rc.score != ep["bt"].num()))) diff(fi, "meilleur temps " + std::to_string(rc.score) + (rc.rec ? " (record)" : "") + " / " + (btWant ? dump(ep["bt"]) : std::string("inchangé")));
        if (btWant) recordN++;
      }
      // Cadence réécrite (sortie de piste) et étape après l'image.
      if (cad.has != !ep["cad1"].isNull() || (cad.has && cad.v != ep["cad1"].num())) diff(fi, "cadence après l'image");
      if ((int)ep["i1"].num() != run.stepIndex()) diff(fi, "étape " + std::to_string(run.stepIndex()) + " / " + std::to_string((int)ep["i1"].num()));
      // Appels de l'interface et sons.
      const std::vector<std::string> gh = coreCalls(run.takeHud()), wh = oracleCalls(f["hud"], true);
      {
        const std::vector<CsoCall> upd = run.takeAudio();
        rs.upd = sndCalls(upd);
        frameAudio.insert(frameAudio.end(), upd.begin(), upd.end());
      }
      const std::vector<std::string> ga = coreCalls(frameAudio), wa = oracleCalls(f["audio"], false);
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
      for (const auto& x : wh) fbN += x.rfind("jumpFeedback(", 0) == 0;
      for (const auto& x : gh) {
        perfectN += x.rfind("jumpFeedback(\"Appel parfait\"", 0) == 0;
        bar2N += x.rfind("toast(\"Barre au 2 · +4 · ", 0) == 0;
      }
      audioN += (int)wa.size();
      for (const auto& x : wh) hudAll.push_back(x);
      for (const auto& x : wa) audioAll.push_back(x);
      // Tranche T11 : mission terminée pendant l'image (missions.complete : active = null, game.course = null, tableau
      // masqué) : plus d'étape ni d'état d'épreuve relevés.
      if (f["run"].isNull()) {
        CsoBoard nb;
        if (!run.finished()) diff(fi, "mission terminée dans le jeu web, en cours dans le portage");
        if (!f["course"].isNull() || !f["board"].isNull() || run.course().active || run.board(nb)) diff(fi, "mode de concours ou tableau après la fin de la mission");
        continue;
      }
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
    // Second contrôle adverse de T4 : départ lancé de part et d'autre de chaque limite, hors du parcours, sortie écourtée.
    const std::string notYet = g_text.t("Le chrono n’est pas lancé : franchis d’abord la <b>ligne de départ</b>.", cfg.lang);
    if (id == "t4-lance-limites" || id == "t4-lance-limites-gauche")
      CHECK(s.started && has(audioAll, "tone(1568") == 1 && run.stepIndex() == 5 && s.t > 0 && s.t < 1, "%s : départ lancé accordé près des limites", who.c_str());
    if (id == "t4-lance-loin" || id == "t4-lance-large" || id == "t4-lance-cap" || id == "t4-lance-derriere")
      CHECK(!s.started && has(audioAll, "tone(1568") == 0 && run.stepIndex() == 5 && s.t == 0, "%s : départ lancé refusé", who.c_str());
    if (id == "t4-hors-parcours")
      CHECK(s.started && s.next == 1 && !s.finished && !s.eliminated && s.faults == 0 && s.log.empty() && s.wrong.empty() && has(hudAll, notYet) == 1 && has(audioAll, "fault(") == 0 &&
                has(hudAll, fr ? "SANS FAUTE" : "CLEAR ROUND") == 0 && run.stepIndex() == 5,
            "%s : saut pendant l'entrée en piste, faute avant le départ, lignes d'arrivée franchies trop tôt et fautes à rebours sans effet", who.c_str());
    if (id == "t4-sortie-descente")
      CHECK(s.finished && !s.eliminated && s.faults == 0 && s.log.size() == 10 && s.exitT < 1 && run.stepIndex() == 6 && has(hudAll, fr ? "ÉLIMINÉ" : "ELIMINATED") == 0,
            "%s : sortie de piste écourtée par la descente, sans élimination", who.c_str());
    // Tranche T11 : fin de la mission après « Quitter l'épreuve » (étape d'enregistrement, missions.complete).
    if (id == "t11-refus") CHECK(run.finished() && !run.trainingRequested() && s.refusals == 1 && s.faults == 4 && s.attempt == 1, "%s : bilan avec un refus, Quitter l'épreuve, fin de la mission", who.c_str());
    if (id == "t11-manche-2")
      CHECK(run.finished() && s.attempt == 2 && s.faults == 0 && s.started && s.finished && has(audioAll, "bell(") == 2 && has(hudAll, fr ? "CLOCHE" : "BELL") == 2,
            "%s : Recommencer (manche 2 : entrée en piste, cloche, parcours), Quitter l'épreuve", who.c_str());
  }
  std::string cov;
  for (const char* g : guards) {
    CHECK(cover[g] > 0, "garde des écouteurs d'obstacle jamais exercée par les oracles : %s", g);
    cov += std::string(" ; ") + g + " " + std::to_string(cover[g]);
  }
  CHECK(hlN > 0 && rrN > 0 && cheerN > 0 && logN > 0, "numéro surligné, barres remises, public en liesse ou journal des fautes jamais relevés");
  CHECK(ljN > 0 && fbN > 0, "mot d'appel jamais exercé par les exécutions (derniers sauts %d, mots %d)", ljN, fbN);
  std::printf("mot d'appel : %d derniers sauts relevés, %d appels hud.jumpFeedback comparés\n", ljN, fbN);
  CHECK(perfectN > 0 && bar2N > 0, "« Appel parfait » (%d) et « Barre au 2 · +4 · … » (%d) jamais produits", perfectN, bar2N);
  std::printf("mot « Appel parfait » : %d appels ; toast « Barre au 2 · +4 · … » : %d appels (portage, égaux au web)\n", perfectN, bar2N);
  std::printf("gardes des écouteurs d'obstacle exercées%s\n", cov.c_str());
  std::printf("demandes comparées : %d changements du numéro surligné, %d remises des barres, %d ovations, %d changements du journal des fautes\n", hlN, rrN, cheerN, logN);
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
  std::printf("déroulé d'épreuve : lancement de l'activité (grand message, clearHint, notify de missions.start) comparé dans %d exécutions\n", launchN);
  CHECK(forced.size() == 1 && forced[0] == "t9-recette", "exécutions à état forcé non rejouées : %zu (attendu : t9-recette seule)", forced.size());
  std::printf("déroulé d'épreuve : non rejouée (état de l'épreuve écrit par tests/e2e/cso-shots.mjs) : %s\n", forced.empty() ? "aucune" : forced[0].c_str());
  CHECK(clean.count("t9-ambre fr"), "t9-ambre (fr) : absent ou en écart");
  // Tranche T11 : bilans de vraies parties (issues : sans-faute vainqueur, sans-faute classé, barres, refus, éliminé,
  // 2e manche, pénalité de temps) et meilleurs temps enregistrés.
  std::string seen;
  for (const auto& x : bilanIds) seen += " « " + x + " »";
  std::printf("bilan (canal bl) : %d cartes comparées :%s ; %d meilleurs temps enregistrés comparés\n", bilanN, seen.c_str(), recordN);
  CHECK(bilanN >= 20 && recordN >= 4, "bilans (%d) ou meilleurs temps (%d) trop peu exercés", bilanN, recordN);
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

// ---------- Caméra de concours (tranche T6) : strides::csoCamStep rejoué sur le canal « cc » de cso_runs/ ----------

// Obstacles relevés par le canal (cc0.obs, cc.obs) : [x, z, n.x, n.z, t.x, t.z, w, depth (null : absent), ground, h, off].
static std::vector<CsoCamFence> camFences(const J& obs) {
  std::vector<CsoCamFence> v;
  for (const J& o : obs.a) {
    CsoCamFence f;
    f.x = o[0].num(); f.z = o[1].num(); f.nx = o[2].num(); f.nz = o[3].num(); f.tx = o[4].num(); f.tz = o[5].num();
    f.w = o[6].num(); f.depth = o[7].isNull() ? 0 : o[7].num(); f.ground = o[8].num(); f.h = o[9].num(); f.off = o[10].b;
    v.push_back(f);
  }
  return v;
}
static CsoVec3 vec3(const J& a) { return CsoVec3{a[0].num(), a[1].num(), a[2].num()}; }

// Mesure du cadrage de tests/e2e/cso-framing.mjs:31-39 avec une caméra Three.js (lookAt, haut = +y, FOV vertical) :
// ordonnée d'écran (0 = haut, 1 = bas) de chaque point de la silhouette.
static std::vector<double> framingYs(const CsoVec3& eye, const CsoVec3& look, double fovDeg, const J& pts, const J& pose) {
  const double hx = pose[0].num(), hz = pose[1].num(), head = pose[2].num(), gy = pose[3].num(), jy = pose[4].num();
  // Object3D.lookAt d'une caméra : z = normalize(œil − cible), x = normalize(haut × z), y = z × x.
  double zx = eye.x - look.x, zy = eye.y - look.y, zz = eye.z - look.z;
  const double zl = std::sqrt(zx * zx + zy * zy + zz * zz);
  zx /= zl; zy /= zl; zz /= zl;
  double xx = zz, xy = 0, xz = -zx;  // (0, 1, 0) × z
  const double xl = std::sqrt(xx * xx + xz * xz);
  xx /= xl; xz /= xl;
  const double yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const double t = std::tan(fovDeg * kPi / 360);
  std::vector<double> ys;
  for (const J& p : pts.a) {
    const double a = p[0].num(), y = p[1].num();
    const double px = hx + std::sin(head) * a - eye.x, py = gy + jy + y - eye.y, pz = hz + std::cos(head) * a - eye.z;
    const double cy = px * yx + py * yy + pz * yz, cz = px * zx + py * zy + pz * zz;
    ys.push_back((1 - (cy / -cz) / t) / 2);
  }
  return ys;
}

// Rejeu chaîné, sans recalage : état de départ setup.cc0, puis chaque appel (ccp hors image, cc de l'image) avec les
// entrées relevées (cheval vu par la caméra, obstacle suivant) ; la sonde de la perche et le sol sous la caméra
// répondent ce que le jeu web a répondu (pb, th), après contrôle des points interrogés. Sorties comparées à 1e-6 près
// (critère T6) : œil, point visé, FOV appliqué, FOV lissé, recul retenu, points sondés.
static void testCamRuns() {
  J o = loadRuns();
  const J cam = loadJson(DATA + "/cso_camera.json");
  const CsoCamParams& C = csoCamDefaults();
  CHECK(cam["schema"].s == "strides.cso_camera/1" && cam["back"].num() == C.back && cam["up"].num() == C.up && cam["lookAhead"].num() == C.lookAhead &&
            cam["lookUp"].num() == C.lookUp && cam["fenceBias"].num() == C.fenceBias && cam["fenceRange"].num() == C.fenceRange &&
            cam["lead"].num() == C.lead && cam["yawK"].num() == C.yawK && cam["yawAcc"].num() == C.yawAcc && cam["posK"].num() == C.posK &&
            cam["yK"].num() == C.yK && cam["jumpFollow"].num() == C.jumpFollow && cam["fov"].num() == C.fov && cam["minBack"].num() == C.minBack &&
            cam["fenceClear"].num() == C.fenceClear && cam["enter"].num() == C.enter,
        "cso_camera.json : réglages CAM_COMP différents du portage");
  int calls = 0, runs = 0, entries = 0, snaps = 0, blocked = 0, minBack = 0, closer = 0, farther = 0, fenceLift = 0, biased = 0;
  double devPos = 0, devFov = 0, devBack = 0;
  std::map<std::string, int> clean;
  std::vector<std::string> marksOk;
  for (const J& r : o["runs"].a) {
    const std::string id = r["id"].s, who = id + " (" + r["lang"].s + ")";
    if (r["setup"]["lite"].b) continue;  // scénarios légers (T4) : pas de canal caméra
    const J& c0 = r["setup"]["cc0"];
    CHECK(c0.t == J::Obj, "%s : état de départ de la caméra (cc0) absent", who.c_str());
    if (c0.t != J::Obj) continue;
    runs++;
    CsoCamState s;
    s.eye = vec3(c0["eye"]);
    s.fov = c0["fov"].num();
    s.camFov = c0["camFov"].num();
    if (!c0["st"].isNull()) {
      const J& st = c0["st"];
      s.active = true;
      s.cH = st["cH"].num(); s.w = st["w"].num(); s.t = st["t"].num();
      s.ax = st["ax"].num(); s.az = st["az"].num(); s.ay = st["ay"].num(); s.back = st["back"].num();
      s.from = vec3(st["from"]); s.fromLook = vec3(st["fromLook"]);
      s.hasAim = !st["aim"].isNull();
      if (s.hasAim) s.aim = vec3(st["aim"]);
    }
    std::vector<CsoCamFence> fences = camFences(c0["obs"]);
    int bad = 0, n = 0;
    std::string first;
    auto call = [&](const J& c, int f) {
      CsoCamInput in;
      in.dt = c["dt"].isNull() ? 1.0 / 30 : c["dt"].num();
      in.instant = c["i"].b;
      const J& hz = c["hz"];
      in.horse = CsoCamHorse{hz[0].num(), hz[1].num(), hz[2].num(), orZero(hz[3]), hz[4].num(), hz[5].num(), hz[6].num()};
      std::string why;
      char b[160];
      // Entrée dans la branche concours : le jeu web relève la caméra précédente ; le cœur doit la (re)créer au même appel.
      const bool created = !c["e0"].isNull();
      if (created != (!s.active || in.instant)) why += created ? " entrée non vue par le cœur" : " entrée inattendue";
      if (created) {
        s.eye = vec3(c["e0"]);
        s.fov = c["f0"][0].num();
        s.camFov = c["f0"][1].num();
        if (in.instant) snaps++; else entries++;
      }
      if (!c["obs"].isNull()) fences = camFences(c["obs"]);
      in.fences = &fences;
      if (!c["nx"].isNull()) {
        const size_t k = (size_t)c["nx"].num();
        in.hasNext = k < fences.size();
        if (in.hasNext) { in.nextX = fences[k].x; in.nextZ = fences[k].z; }
        else why += " obstacle suivant hors liste";
      }
      // Sonde : réponse du jeu web (pb), points interrogés comparés à pq quand il est relevé.
      const int pb = (int)c["pb"].num();
      const J& pq = c["pq"];
      int k = 0;
      double devQ = 0;
      in.blocked = [&](double x, double y, double z) {
        if (!pq.isNull() && (size_t)k < pq.a.size())
          devQ = std::max({devQ, std::abs(x - pq[k][0].num()), std::abs(y - pq[k][1].num()), std::abs(z - pq[k][2].num())});
        return k++ == pb;
      };
      const J& th = c["th"];
      double devT = 0;
      in.ground = [&](double x, double z) {
        devT = std::max({devT, std::abs(x - th[0].num()), std::abs(z - th[1].num())});
        return th[2].num();
      };
      const double back0 = s.back;
      const CsoCamOut out = csoCamStep(s, in, C);
      auto d = [&](const char* k2, double a, double e, double& slot) {
        const double x = std::abs(a - e);
        slot = std::max(slot, x);
        if (!(x <= 1e-6)) { std::snprintf(b, sizeof b, " %s %.12g/%.12g", k2, a, e); why += b; }
      };
      d("eye.x", out.eye.x, c["eye"][0].num(), devPos); d("eye.y", out.eye.y, c["eye"][1].num(), devPos); d("eye.z", out.eye.z, c["eye"][2].num(), devPos);
      d("look.x", out.look.x, c["look"][0].num(), devPos); d("look.y", out.look.y, c["look"][1].num(), devPos); d("look.z", out.look.z, c["look"][2].num(), devPos);
      d("fov", out.fov, c["fov"].num(), devFov);
      d("fov lissé", s.fov, c["fs"].num(), devFov);
      d("recul", s.back, c["bk"].num(), devBack);
      if (out.probeCount != (int)c["pn"].num() || out.probeHit != pb) { std::snprintf(b, sizeof b, " sonde %d/%d points, bloqué %d/%d", out.probeCount, (int)c["pn"].num(), out.probeHit, pb); why += b; }
      if (devQ > 1e-6) { std::snprintf(b, sizeof b, " points sondés à %.3g", devQ); why += b; }
      if (devT > 1e-6) { std::snprintf(b, sizeof b, " sol interrogé à %.3g", devT); why += b; }
      // Témoins des branches exercées (relevés dans l'oracle).
      if (pb >= 0) blocked++;
      if (pb >= 0 && out.probeBack == C.minBack) minBack++;
      if (!in.instant && s.back < back0 - 1e-9) closer++;
      if (!in.instant && s.back > back0 + 1e-9) farther++;
      if (out.eye.y > s.ay + C.up + 1e-9 && created == false) fenceLift++;
      if (in.hasNext) {
        const double dx = in.nextX - s.ax, dz = in.nextZ - s.az, dd = std::hypot(dx, dz);
        if (dd > 1 && dd < C.fenceRange && (dx * std::sin(s.cH) + dz * std::cos(s.cH)) / dd > 0.5) biased++;
      }
      calls++;
      n++;
      if (!why.empty()) {
        bad++;
        if (first.empty()) first = "image " + std::to_string(f) + " :" + why;
      }
      return out;
    };
    for (const J& f : r["frames"].a) {
      const int fi = (int)f["f"].num();
      for (const J& c : f["ccp"].a) call(c, fi);
      if (f["cc"].isNull()) { csoCamLeave(s); continue; }  // branche concours non prise (this._comp = null)
      const CsoCamOut out = call(f["cc"], fi);
      // Scénario « cadrage » : mesure du cadrage de cso-framing.mjs recalculée avec la caméra du cœur.
      const J& fr = f["fr"];
      if (!fr.isNull()) {
        const std::vector<double> ys = framingYs(out.eye, out.look, out.fov, r["setup"]["framing"]["pts"], fr["pose"]);
        double dev = 0;
        for (size_t k = 0; k < ys.size(); k++) dev = std::max(dev, std::abs(ys[k] - fr["ys"][k].num()));
        const double top = std::max(0.0, *std::min_element(ys.begin(), ys.end())), bot = std::min(1.0, *std::max_element(ys.begin(), ys.end()));
        CHECK(dev <= 1e-6 && std::abs((bot - top) - fr["part"].num()) <= 1e-6, "%s image %d : cadrage du cœur %.6f (haut %.4f, bas %.4f) / web %.6f, écart des points %.3g",
              who.c_str(), fi, bot - top, top, bot, fr["part"].num(), dev);
        char b[96];
        std::snprintf(b, sizeof b, "%d%s:%.4f", fi, fr["jump"].b ? "(saut)" : "", bot - top);
        marksOk.push_back(b);
      }
    }
    CHECK(bad == 0, "%s : caméra, %d appels sur %d en écart ; premier : %s", who.c_str(), bad, n, first.c_str());
    if (bad == 0) clean[id] = n;
  }
  // Scénarios requis : parcours droit (entrée en piste, fondu d'entrée), cheval et obstacles (snap), contre le décor
  // (sonde bloquée, recul minimal), entrée depuis une caméra décalée, relief et obstacle survolé hors de la carrière, et
  // le cadrage de cso-framing.mjs (6 instants mesurés).
  for (const char* id : {"droit", "bonne-zone", "virage-serre", "virage-en-lair", "refus", "t3-refus-5s", "t6-tribunes", "t6-mat", "t6-entree", "t6-relief", "t6-survol", "cadrage"})
    CHECK(clean.count(id) && clean[id] > 0, "caméra : scénario %s absent ou en écart", id);
  const J* cad = nullptr;
  for (const J& r : o["runs"].a) if (r["id"].s == "cadrage") cad = &r;
  if (cad) {
    std::set<int> want;
    for (const J& m : (*cad)["setup"]["framing"]["marks"].a) want.insert((int)m.num());
    int seen = 0;
    for (const J& f : (*cad)["frames"].a) if (!f["fr"].isNull() && want.count((int)f["f"].num())) seen++;
    CHECK(want.size() == 6 && seen == 6, "cadrage : %d instants de cso-framing.mjs mesurés sur %zu", seen, want.size());
  }
  CHECK(entries > 0 && snaps > 0 && blocked > 0 && minBack > 0 && closer > 0 && farther > 0 && biased > 0,
        "caméra : branche non exercée (entrées %d, snaps %d, sonde bloquée %d, recul minimal %d, rapprochement %d, éloignement %d, point visé attiré %d)",
        entries, snaps, blocked, minBack, closer, farther, biased);
  std::string mk;
  for (const std::string& m : marksOk) mk += " " + m;
  std::printf("caméra de concours : %d scénarios, %d appels rejoués, écarts max œil/visée %.3g m, FOV %.3g°, recul %.3g m ; entrées %d, snaps %d, sonde bloquée %d (recul minimal %d), rapprochements %d, éloignements %d, œil relevé (obstacle survolé ou relief) %d, visée attirée %d ; cadrage du cœur (image:part)%s\n",
              runs, calls, devPos, devFov, devBack, entries, snaps, blocked, minBack, closer, farther, fenceLift, biased, mk.c_str());
}

// ---------- Commandes (tranche T8) : cso_input.json (classe Input du web sous événements synthétiques) ----------
// Chaque appel relevé dans le navigateur est rejoué sur une instance neuve par scénario ; l'état complet est comparé
// après chaque appel : move, look, keyMove, _virtual, held, pressed, keys, enabled, joy, lookPtr exactement ; élément du
// joystick (left, top, translation du bouton) à l'arrondi de la sérialisation CSS du navigateur près (6 chiffres
// significatifs : écart relatif ≤ 1e-5).
static std::string csoInputState(const CsoInput& in) {
  auto set = [](const std::set<std::string>& s) {
    std::string o = "[";
    for (const std::string& x : s) o += (o.size() > 1 ? "," : "") + x;
    return o + "]";
  };
  // −0 du web (move.y = -dy / R) : JSON l'écrit 0 ; comparé comme 0.
  const auto z = [](double v) { return v == 0 ? 0.0 : v; };
  char b[512];
  std::snprintf(b, sizeof b, "mv %.17g %.17g %.17g km %d vi %d lk %.17g %.17g en %d joy %s%lld %.17g %.17g %.17g %.17g lp %s%lld %.17g %.17g", z(in.move.x), z(in.move.y), z(in.move.mag),
                in.keyMove, in.virtualMove, z(in.look.dx), z(in.look.dy), in.enabled, in.joy.on ? "" : "null:", (long long)in.joy.id, z(in.joy.ox), z(in.joy.oy), z(in.joy.x), z(in.joy.y),
                in.lookPtr.on ? "" : "null:", (long long)in.lookPtr.id, z(in.lookPtr.x), z(in.lookPtr.y));
  return std::string(b) + " held " + set(in.held) + " pr " + set(in.pressed) + " keys " + set(in.keys);
}
static void testCsoInput() {
  const J o = loadJson(ORA + "/cso_input.json");
  CHECK(o["schema"].s == "strides.oracle.cso_input/1", "cso_input.json : schéma %s", o["schema"].s.c_str());
  int calls = 0, bad = 0, elBad = 0, joyDowns = 0, rebases = 0, lookMoves = 0, keyCalls = 0, btnCalls = 0, scen = 0;
  std::set<std::string> fns;
  for (const J& sc : o["scenarios"].a) {
    scen++;
    CsoInput in;
    int scBad = 0;
    for (const J& e : sc["log"].a) {
      const J& c = e["c"];
      const std::string fn = c["fn"].s;
      fns.insert(fn);
      calls++;
      const auto ptype = [&]() { return c["pt"].s == "mouse" ? CsoPointer::Mouse : c["pt"].s == "pen" ? CsoPointer::Pen : CsoPointer::Touch; };
      const bool wasJoy = in.joy.on;
      const double ox0 = in.joy.ox, oy0 = in.joy.oy;
      if (fn == "init") CHECK(c["R"].num() == in.R, "%s : rayon %g", sc["id"].s.c_str(), c["R"].num());
      else if (fn == "down") in.pointerDown((std::int64_t)c["id"].num(), ptype(), c["x"].num(), c["y"].num(), c["vw"].num(), c["vh"].num());
      else if (fn == "move") in.pointerMove((std::int64_t)c["id"].num(), ptype(), c["x"].num(), c["y"].num());
      else if (fn == "up") in.pointerUp((std::int64_t)c["id"].num());
      else if (fn == "key") { in.key(c["code"].s, c["down"].b, c["rep"].b); keyCalls++; }
      else if (fn == "btnDown") { in.buttonDown(c["name"].s); btnCalls++; }
      else if (fn == "btnUp") { in.buttonUp(c["name"].s); btnCalls++; }
      else if (fn == "poll") in.poll();
      else if (fn == "endFrame") in.endFrame();
      else if (fn == "setEnabled") in.setEnabled(c["v"].b);
      else if (fn == "releaseAll") in.releaseAll();
      else if (fn == "setVirtualMove") in.setVirtualMove(c["x"].num(), c["y"].num());
      else CHECK(false, "%s : appel inconnu %s", sc["id"].s.c_str(), fn.c_str());
      if (fn == "down" && !wasJoy && in.joy.on) joyDowns++;
      if (fn == "move" && in.joy.on && (in.joy.ox != ox0 || in.joy.oy != oy0)) rebases++;
      if (fn == "move" && in.lookPtr.on && (std::int64_t)c["id"].num() == in.lookPtr.id) lookMoves++;
      // État attendu, même format.
      const J& s = e["s"];
      CsoInput w;
      w.move = {s["mv"][0].num(), s["mv"][1].num(), s["mv"][2].num()};
      w.keyMove = s["km"].b;
      w.virtualMove = s["vi"].b;
      w.look = {s["lk"][0].num(), s["lk"][1].num()};
      w.enabled = s["en"].b;
      w.joy.on = !s["joy"][0].isNull();
      w.joy.id = w.joy.on ? (std::int64_t)s["joy"][0].num() : 0;
      w.joy.ox = s["joy"][1].num(); w.joy.oy = s["joy"][2].num(); w.joy.x = s["joy"][3].num(); w.joy.y = s["joy"][4].num();
      w.lookPtr.on = !s["lp"][0].isNull();
      w.lookPtr.id = w.lookPtr.on ? (std::int64_t)s["lp"][0].num() : 0;
      w.lookPtr.x = s["lp"][1].num(); w.lookPtr.y = s["lp"][2].num();
      for (const J& x : s["held"].a) w.held.insert(x.s);
      for (const J& x : s["pr"].a) w.pressed.insert(x.s);
      for (const J& x : s["keys"].a) w.keys.insert(x.s);
      CsoInput g = in;
      if (!g.joy.on) g.joy.id = 0;
      if (!g.lookPtr.on) g.lookPtr.id = 0;
      const std::string got = csoInputState(g), want = csoInputState(w);
      if (got != want) {
        bad++;
        if (++scBad <= 2) std::printf("  %s, appel %d (%s) :\n    obtenu %s\n    attendu %s\n", sc["id"].s.c_str(), calls, fn.c_str(), got.c_str(), want.c_str());
      }
      // Élément du joystick : [active, left, top, bouton x, bouton y].
      const J& el = s["el"];
      const auto css = [](double a, double b) { return std::abs(a - b) <= 1e-5 * std::max(1.0, std::abs(b)); };
      const bool placed = !el[1].isNull();
      bool elOk = el.a.size() == 5 && el[0].b == in.view.active && placed == in.view.placed && (!placed || (css(in.view.left, el[1].num()) && css(in.view.top, el[2].num()))) &&
                  css(in.view.knobX, el[3].num()) && css(in.view.knobY, el[4].num());
      if (!elOk) {
        elBad++;
        if (elBad < 4) std::printf("  %s, appel %d : joystick affiché %d %d %g %g %g %g\n", sc["id"].s.c_str(), calls, in.view.active, in.view.placed, in.view.left, in.view.top, in.view.knobX, in.view.knobY);
      }
    }
  }
  CHECK(bad == 0, "commandes : %d états différents de l'oracle sur %d appels", bad, calls);
  CHECK(elBad == 0, "commandes : %d états du joystick affiché différents", elBad);
  // L'oracle exerce bien ce qu'il doit : joystick pris, rebasage, regard, clavier, boutons, tous les appels.
  CHECK(scen >= 15 && joyDowns >= 10 && rebases >= 3 && lookMoves >= 4 && keyCalls >= 80 && btnCalls >= 8, "commandes : couverture %d %d %d %d %d %d", scen, joyDowns, rebases, lookMoves, keyCalls, btnCalls);
  for (const char* f : {"init", "down", "move", "up", "key", "btnDown", "btnUp", "poll", "endFrame", "setEnabled", "releaseAll", "setVirtualMove"}) CHECK(fns.count(f), "commandes : appel %s absent de l'oracle", f);
  // Codes physiques (tables de la plateforme, sans oracle web) : W et Z, A et Q distincts ; flèches, modificateurs.
  CHECK(webCodeFromMacKeyCode(0x0D) == "KeyW" && webCodeFromMacKeyCode(0x06) == "KeyZ" && webCodeFromMacKeyCode(0x00) == "KeyA" && webCodeFromMacKeyCode(0x0C) == "KeyQ" &&
            webCodeFromMacKeyCode(0x7E) == "ArrowUp" && webCodeFromMacKeyCode(0x3B) == "ControlLeft" && webCodeFromMacKeyCode(0x3A) == "AltLeft" && webCodeFromMacKeyCode(0x35) == "Escape" &&
            webCodeFromMacKeyCode(0x30) == "Tab" && webCodeFromMacKeyCode(0x31) == "Space" && webCodeFromMacKeyCode(0x2E) == "KeyM" && webCodeFromMacKeyCode(0x63).empty(),
        "codes physiques du Mac");
  CHECK(webCodeFromKeyName("W") == "KeyW" && webCodeFromKeyName("SpaceBar") == "Space" && webCodeFromKeyName("LeftControl") == "ControlLeft" && webCodeFromKeyName("Up") == "ArrowUp" &&
            webCodeFromKeyName("F8").empty(),
        "noms de touches Unreal");
  std::printf("commandes : %d scénarios, %d appels rejoués (%d joysticks pris, %d rebasages, %d regards, %d touches, %d boutons), %d écarts\n", scen, calls, joyDowns, rebases, lookMoves, keyCalls,
              btnCalls, bad + elBad);
}

// ---------- Carte Pause (tranche T8) : cso_pause.json (bascules cliquées dans la vraie carte du web) ----------
// Réglages après chaque clic (absent / valeur) et libellés affichés : clé calculée par le cœur, texte pris dans les
// libellés relevés dans le DOM (Content/Data/cso_controls_style.json, ce que lit le jeu).
static void testCsoPause() {
  const J o = loadJson(ORA + "/cso_pause.json");
  const J st = loadJson(DATA + "/cso_controls_style.json");
  const J& lb = st["labels"];
  const auto label = [&](const std::string& key) -> std::string {
    if (key.empty()) return "";
    if (key == "aid.locked") return lb["locked"].s;
    const size_t dot = key.find('.');
    return lb[key.substr(0, dot)][key.substr(dot + 1)].s;
  };
  int steps = 0, bad = 0;
  for (const J& c : o["cases"].a) {
    Settings s;
    if (!c["start"]["courseLine"].isNull()) s["courseLine"] = c["start"]["courseLine"].b ? "true" : "false";
    if (!c["start"]["jumpAid"].isNull()) s["jumpAid"] = c["start"]["jumpAid"].s;
    const bool locked = c["locked"].b;
    for (const J& e : c["steps"].a) {
      steps++;
      if (e["act"].s == "ligne") toggleCourseLine(s);
      else if (e["act"].s == "aide") cycleJumpAid(s, locked);
      const std::string wantLine = e["courseLine"].isNull() ? "absent" : e["courseLine"].b ? "true" : "false";
      const std::string gotLine = s.count("courseLine") ? s["courseLine"] : "absent";
      const std::string wantAid = e["jumpAid"].isNull() ? "absent" : e["jumpAid"].s;
      const std::string gotAid = s.count("jumpAid") ? s["jumpAid"] : "absent";
      const std::string lineTxt = label(pauseLineLabelKey(s)), aidTxt = label(pauseAidLabelKey(s, locked));
      const bool ok = gotLine == wantLine && gotAid == wantAid && lineTxt == e["line"].s && aidTxt == e["aid"].s && locked == e["aidDisabled"].b;
      if (!ok) {
        bad++;
        if (bad < 4) std::printf("  pause « %s », %s : %s %s « %s » « %s » / %s %s « %s » « %s »\n", c["desc"].s.c_str(), e["act"].s.c_str(), gotLine.c_str(), gotAid.c_str(), lineTxt.c_str(), aidTxt.c_str(),
                                 wantLine.c_str(), wantAid.c_str(), e["line"].s.c_str(), e["aid"].s.c_str());
      }
    }
  }
  CHECK(bad == 0 && steps >= 25, "carte Pause : %d étapes, %d écarts", steps, bad);
  // Sauvegarde neuve : réglages du web (save.js:37) ; relus après un aller-retour JSON, et depuis un export du web
  // (booléen false).
  SaveGame g = SaveGame::fresh();
  CHECK(courseLineShown(g.settings) && jumpAidOf(g.settings) == "full" && g.settings.at("courseLine") == "true", "réglages neufs");
  toggleCourseLine(g.settings);
  cycleJumpAid(g.settings);
  SaveGame r;
  std::string err;
  CHECK(SaveGame::fromJson(g.toJson(), r, err) && !courseLineShown(r.settings) && jumpAidOf(r.settings) == "button", "réglages relus : %s", err.c_str());
  SaveGame w;
  CHECK(SaveGame::fromWebExport("{\"version\":2,\"settings\":{\"jumpAid\":\"off\",\"courseLine\":false}}", w, err) && !courseLineShown(w.settings) && jumpAidOf(w.settings) == "off",
        "réglages importés du web : %s", err.c_str());
  std::printf("carte Pause : %zu cas, %d étapes rejouées, %d écarts\n", o["cases"].a.size(), steps, bad);
}

// ---------- Aides à l'appel (tranche T9) ----------
// Ligne du cavalier du jeu web (CSO_LINE = CSO_TRACE.pts.map(toWorld), obstacles.js:39-44) : tracé du design lu par le
// jeu (Content/Data/cso_course_pole.json), chaque point décalé de la carrière.
static std::vector<TracePoint> aidsWorldLine() {
  const J data = loadJson(DATA + "/cso_course_pole.json");
  CourseDesign d;
  std::string err;
  CHECK(parseCourseFile(readFile(DATA + "/cso_course_pole.json"), d, err), "cso_course_pole.json : %s", err.c_str());
  const double ax = data["arena"]["x"].num(), az = data["arena"]["z"].num();
  std::vector<TracePoint> line;
  for (const TracePoint& p : traceCourse(d).pts) line.push_back({ax + p.x, az + p.z, p.h, p.s});
  return line;
}
// Obstacle du parcours relevé dans le web (label, num, kind, x, z, rot, h, w, spread, n, bars) : reconstruit par le cœur
// (makeCsoObstacle) et comparé au relevé (axe, barres).
static CsoObstacle aidsObstacle(const J& o, const std::string& who) {
  const CsoObstacle c = makeCsoObstacle(o["kind"].s, o["x"].num(), o["z"].num(), o["rot"].num(), o["h"].num(), o["w"].num(), o["spread"].num(), o["label"].s, (int)o["num"].num(), "cso");
  bool ok = near(c.n.x, o["n"][0].num()) && near(c.n.z, o["n"][1].num()) && c.bars.size() == o["bars"].a.size();
  for (size_t k = 0; ok && k < c.bars.size(); k++) ok = near(c.bars[k].s, o["bars"][k][0].num()) && near(c.bars[k].h, o["bars"][k][1].num());
  CHECK(ok, "%s : obstacle %s reconstruit différent du web (axe ou barres)", who.c_str(), o["label"].s.c_str());
  return c;
}
static Zone aidsZoneOf(const std::string& s) {
  return s == "good" ? Zone::Good : s == "far" ? Zone::Far : s == "near" ? Zone::Near : s == "refuse" ? Zone::Refuse : Zone::None;
}
// Valeur float32 du web (Float32BufferAttribute) : le double du cœur arrondi en float, à un écart d'arrondi près.
static bool aidsF32(double core, double web) {
  const float f = (float)core;
  return (double)f == web || (double)std::nextafter(f, 1e30f) == web || (double)std::nextafter(f, -1e30f) == web;
}

// takeoffZone sur la grille de cso_takeoff_zone.json (obstacles du parcours à 8 jeux de hauteurs × 15 vitesses ×
// 4 puissances × 3 bonus) à 1e-9 ; tirets du tracé (_marks, _strip) : nombre, indices de tracé, coins x / z lus par
// le sol à 1e-9 du cœur, coins x / y / z du tampon du web (float32) = cœur, y = sol lu par le web + lineLift.
static void testCsoTakeoffZone() {
  const J o = loadJson(ORA + "/cso_takeoff_zone.json");
  CHECK(o["schema"].s == "strides.oracle.cso_takeoff_zone/1", "cso_takeoff_zone.json : schéma « %s »", o["schema"].s.c_str());
  int n = 0, both = 0, passOnly = 0, none = 0, slowClamp = 0;
  for (const J& st : o["sets"].a) {
    const std::string who = "cso_takeoff_zone base " + (st["base"].isNull() ? std::string("hors épreuve") : std::to_string(st["base"].num()));
    std::vector<CsoObstacle> obs;
    for (const J& ob : st["obs"].a) obs.push_back(aidsObstacle(ob, who));
    for (const J& c : st["cases"].a) {
      const size_t i = (size_t)c[0].num();
      const CsoTakeoffZone z = csoTakeoffZone(obs.at(i), c[1].num(), c[2].num(), c[3].num());
      auto same = [](bool has, const double* r, const J& w) { return w.isNull() ? !has : has && near(r[0], w[0].num()) && near(r[1], w[1].num()); };
      CHECK(same(z.hasPass, z.pass, c[4]) && same(z.hasGood, z.good, c[5]), "%s : takeoffZone(%s, v %g, puissance %g, bonus %g) : pass %s [%.15g ; %.15g], good %s [%.15g ; %.15g]", who.c_str(),
            obs[i].label.c_str(), c[1].num(), c[2].num(), c[3].num(), z.hasPass ? "oui" : "non", z.pass[0], z.pass[1], z.hasGood ? "oui" : "non", z.good[0], z.good[1]);
      n++;
      if (!c[4].isNull() && !c[5].isNull()) both++;
      else if (!c[4].isNull()) passOnly++;
      else none++;
      if (c[1].num() < 5.5) slowClamp++;
    }
  }
  CHECK(n > 5000 && both > 0 && passOnly > 0 && none > 0 && slowClamp > 0, "takeoffZone : branche non exercée (%d cas : deux bandes %d, ambre seule %d, aucune %d, vitesse < 5,5 %d)", n, both, passOnly, none, slowClamp);
  // Tirets du tracé.
  const std::vector<TracePoint> line = aidsWorldLine();
  CHECK((double)line.size() == o["line"]["n"].num() && near(line.front().x, o["line"]["first"]["x"].num()) && near(line.back().z, o["line"]["last"]["z"].num()) &&
            near(line.back().s, o["line"]["last"]["s"].num()), "CSO_LINE : %zu points, extrémités différentes du web", line.size());
  const std::vector<CsoLineMark> marks = csoLineMarks(line);
  CHECK(marks.size() == o["marks"].a.size(), "tirets du tracé : %zu au lieu de %zu", marks.size(), o["marks"].a.size());
  const CsoAidsParams& A0 = csoAidsDefaults();
  int bad = 0, liftN = 0;
  for (size_t k = 0; k < marks.size() && k < o["marks"].a.size(); k++) {
    const J& w = o["marks"][k];
    bool ok = near(marks[k].s, w["s"].num()) && w["g"].t == J::Arr && w["g"].a.size() == 4;
    for (int j = 0; ok && j < 4; j++) {
      const J& gq = w["g"][(size_t)j];  // terrain.getHeight(x, z) appelé par _strip pour ce coin (pleine précision)
      ok = near(marks[k].c[j][0], gq[0].num()) && near(marks[k].c[j][1], gq[1].num()) && aidsF32(marks[k].c[j][0], w["c"][(size_t)j][0].num()) &&
           aidsF32(gq[2].num() + A0.lineLift, w["c"][(size_t)j][1].num()) && aidsF32(marks[k].c[j][1], w["c"][(size_t)j][2].num());
      if (ok) liftN++;
    }
    if (!ok && bad++ < 3) CHECK(false, "tiret %zu (s %g) : coins ou hauteur (sol + %g) différents du web", k, w["s"].num(), A0.lineLift);
  }
  CHECK(bad == 0, "tirets du tracé : %d tirets différents", bad);
  CHECK(liftN == (int)marks.size() * 4, "hauteur des tirets : %d coins comparés", liftN);
  // LINE_MARK relu dans la scène du web (Content/Data/cso_aids.json) = constantes du cœur.
  const J d = loadJson(DATA + "/cso_aids.json");
  const CsoAidsParams& A = csoAidsDefaults();
  const J& L = d["lineMark"];
  CHECK(near(A.dash, L["dash"].num()) && near(A.width, L["width"].num()) && near(A.every, L["every"].num()) && near(A.after, L["after"].num()) && near(A.hideNear, L["hideNear"].num()),
        "LINE_MARK du cœur différent de cso_aids.json");
  std::printf("aides (takeoffZone) : %d cas (deux bandes %d, ambre seule %d, aucune %d), %zu tirets du tracé (%d coins : x, z, hauteur sol + %g)\n", n, both, passOnly, none, marks.size(), liftN, A0.lineLift);
}

// Canal « ai » des exécutions t9-* : chaque appel de CourseAids.update rejoué par strides::CsoCourseAids (entrées,
// sol lu, maillages après l'appel, zone et sa temporisation) ; bouton SAUT image par image par strides::CsoHud (aide
// lue = csoJumpTiming, appuis « Trop tôt » de l'image, temporisation de 600 ms sur 100 ticks par image ; état, classes,
// signe, libellé traduit).
static void testCsoAids() {
  J o = loadRuns();
  const std::vector<TracePoint> line = aidsWorldLine();
  int runs = 0, frames = 0, calls = 0, lineOn = 0, lineOff = 0, nextNull = 0, okOn = 0, goodOn = 0, recompute = 0, pre = 0, aidOff = 0, earlyF = 0, earlyCalls = 0, virt = 0;
  // Contrôle adverse de T9 : zone d'appel sans bande verte (takeoffZone rend pass, pas good : place(this.good, null),
  // courseAids.js:155 ; t9-ambre) ; pauses du HUD de t9-recette (hw : captures de tests/e2e/cso-shots.mjs).
  int okOnly = 0, okOnlyGoodMoved = 0, pauses = 0;
  std::set<std::string> ids;
  // Sous-branches (relevées sur les entrées) : aide coupée à l'entrée en piste alors que le cheval vise un obstacle, zone
  // coupée à pied près de l'obstacle suivant, point du tracé le plus proche avant l'obstacle précédent (prevS − 2 m),
  // cheval loin du tracé (> 15 m), appui « Trop tôt » relancé avant la fin des 600 ms.
  int preAimed = 0, footNear = 0, behindPrev = 0, farLine = 0, earlyAgain = 0, lastEarly = -1000;
  std::map<std::string, int> states;
  for (const J& r : o["runs"].a) {
    if (!r["setup"]["aides"].b) continue;
    runs++;
    ids.insert(r["id"].s);
    virt += (int)r["setup"]["virtualEarly"].num();
    const std::string id = r["id"].s, lang = r["lang"].s;
    const Lang L = lang == "en" ? Lang::En : Lang::Fr;
    CsoCourseAids aids(line);
    CsoHud hud;
    hud.setViewportHeight(390);
    std::vector<CsoAidsFence> fences;
    int bad = 0;
    double zt0 = 0, gx0 = 0, gy0 = 0;
    for (const J& f : r["frames"].a) {
      const int fi = (int)f["f"].num();
      const std::string who = id + "." + lang + " image " + std::to_string(fi);
      const J& ai = f["ai"];
      if (!ai["ob"].isNull()) {
        fences.clear();
        for (size_t k = 0; k < ai["ob"].a.size(); k++) {
          const J& ob = ai["ob"][k];
          CsoAidsFence fe;
          fe.id = (int)k;
          fe.ob = aidsObstacle(ob, who);
          fe.ground = ob["ground"].num();
          fe.hasLineS = !ob["lineS"].isNull();
          fe.lineS = fe.hasLineS ? ob["lineS"].num() : 0;
          fences.push_back(fe);
        }
      }
      frames++;
      // Bouton SAUT.
      hud.advanceTicks(100);
      for (const J& c : f["hud"].a)
        if (c["fn"].s == "jumpEarly") {
          hud.jumpEarly();
          earlyCalls++;
          if (fi - lastEarly < 18) earlyAgain++;
          lastEarly = fi;
        }
      const J& b = ai["b"];
      const Zone jt = csoJumpTiming(b["c"].b, b["pre"].b, b["aid"].s, aidsZoneOf(b["tm"].s));
      CHECK(zoneName(jt) == b["jt"].s, "%s : aide lue par le bouton %s au lieu de %s (timing %s, épreuve %d, entrée %d, aide %s)", who.c_str(), zoneName(jt), b["jt"].s.c_str(), b["tm"].s.c_str(),
            b["c"].b, b["pre"].b, b["aid"].s.c_str());
      CsoHudFrame hf;
      hf.jumpTiming = jt;
      hud.update(1.0 / 30, hf);
      // (état du bouton relevé en fin d'image, avant la pause de la capture)
      const std::string st = b["st"].isNull() ? std::string() : b["st"].s;
      std::set<std::string> cl;
      for (const J& k : b["cl"].a) cl.insert(k.s);
      const bool same = hud.jumpState() == st && hud.jumpFar() == (cl.count("far") > 0) && hud.jumpGood() == (cl.count("good") > 0) && hud.jumpNear() == (cl.count("near") > 0) &&
                        hud.jumpEarlyOn() == (cl.count("early") > 0) && hud.jumpSign() == b["sg"].s && g_text.t(hud.jumpLabelKey(), L) == b["lb"].s;
      if (!same && bad++ < 3)
        CHECK(false, "%s : bouton SAUT « %s » [%s%s%s%s] « %s » « %s » au lieu de « %s » « %s » « %s »", who.c_str(), hud.jumpState().c_str(), hud.jumpFar() ? "far " : "", hud.jumpGood() ? "good " : "",
              hud.jumpNear() ? "near " : "", hud.jumpEarlyOn() ? "early" : "", hud.jumpSign().c_str(), g_text.t(hud.jumpLabelKey(), L).c_str(), st.c_str(), b["sg"].s.c_str(), b["lb"].s.c_str());
      states[st.empty() ? "null" : st]++;
      if (hud.jumpEarlyOn()) earlyF++;
      if (b["pre"].b) pre++;
      if (b["pre"].b && b["tm"].s != "none") preAimed++;
      if (b["c"].b && b["aid"].s == "off") aidOff++;
      // Pause d'une capture de t9-recette après l'image : temporisations du HUD seules (sans image de jeu).
      if (f["hw"].t == J::Num) {
        hud.advanceTicks((int64_t)f["hw"].num());
        pauses += (int)std::lround(f["hw"].num() / r["setup"]["recette"]["pause"]["ticks"].num());  // captures (1-presentation et 2-plan : même image)
      }
      // Aides du parcours.
      const J& c = ai["c"];
      if (c.isNull()) continue;
      calls++;
      const J& in = c["in"];
      CsoAidsInput ain;
      ain.dt = in["dt"].num();
      ain.next = in["n"].isNull() ? nullptr : &fences.at((size_t)in["n"].num());
      ain.prevS = in["ps"].num();
      ain.showLine = in["sl"].b;
      ain.showZone = in["sz"].b;
      ain.hasHorse = in["hh"].b;
      if (ain.hasHorse) {
        ain.hx = in["x"].num();
        ain.hz = in["z"].num();
        ain.speed = in["v"].num();
        ain.power = in["pw"].num();
        ain.clearance = in["cl"].num();
      }
      ain.riding = in["md"].b;
      ain.time = in["t"].num();
      if (ain.next && ain.hasHorse) {
        if (!ain.riding && std::hypot(ain.next->ob.x - ain.hx, ain.next->ob.z - ain.hz) <= 26) footNear++;
        double bd = 1e9, bs = 0;
        for (const TracePoint& p : line) {
          if (p.s < ain.prevS - 2 || p.s > ain.next->lineS + 12) continue;
          const double d2 = (p.x - ain.hx) * (p.x - ain.hx) + (p.z - ain.hz) * (p.z - ain.hz);
          if (d2 < bd) { bd = d2; bs = p.s; }
        }
        if (bd > 225) farLine++;
        else if (bs < ain.prevS) behindPrev++;
      }
      size_t gi = 0;
      bool gqOk = true;
      const J& gq = c["gq"];
      aids.update(ain, [&](double x, double z) {
        if (gi >= gq.a.size()) {
          gqOk = false;
          return 0.0;
        }
        const J& q = gq[gi++];
        gqOk = gqOk && near(q[0].num(), x) && near(q[1].num(), z);
        return q[2].num();
      });
      const CsoAidsView& v = aids.view();
      const J& out = c["out"];
      auto band = [&](const CsoAidsBand& m, const J& w) {
        return m.visible == w[0].b && near(m.x, w[1].num()) && near(m.y, w[2].num()) && near(m.z, w[3].num()) && near(m.rot, w[4].num()) && near(m.sx, w[5].num()) && near(m.sz, w[6].num());
      };
      auto range = [&](bool vis, int first, int count, const J& w) {
        if (vis != w[0].b) return false;
        if (!vis) return true;  // plage d'un maillage masqué : sans effet (drawRange du web gardé tel quel)
        return !w[2].isNull() && first == (int)w[1].num() && count == (int)w[2].num();
      };
      bool ok = gqOk && gi == gq.a.size();
      ok = ok && range(v.lineVisible, v.lineFirst, v.lineCount, out["ln"]) && range(v.lineVisible, v.afterFirst, v.afterCount, out["af"]);
      ok = ok && v.markVisible == out["mk"][0].b && near(v.markX, out["mk"][1].num()) && near(v.markY, out["mk"][2].num()) && near(v.markZ, out["mk"][3].num()) && near(v.markRot, out["mk"][4].num());
      ok = ok && band(v.ok, out["ok"]) && band(v.good, out["gd"]);
      ok = ok && near(aids.zoneTimer(), out["zt"].num()) && aids.zoneFor() == (out["zf"].isNull() ? -1 : (int)out["zf"].num());
      if (!out["zo"].isNull()) {
        const CsoTakeoffZone& z = aids.zone();
        const J& p = out["zo"]["p"];
        const J& g = out["zo"]["g"];
        ok = ok && (p.isNull() ? !z.hasPass : z.hasPass && near(z.pass[0], p[0].num()) && near(z.pass[1], p[1].num()));
        ok = ok && (g.isNull() ? !z.hasGood : z.hasGood && near(z.good[0], g[0].num()) && near(z.good[1], g[1].num()));
      }
      if (!ok && bad++ < 3)
        CHECK(false, "%s : aides différentes du web (tracé %d [%d+%d] [%d+%d], repère %d (%.6f ; %.6f ; %.6f), ambre %d, verte %d, zone %.6f / obstacle %d, sol %zu/%zu lus)", who.c_str(), v.lineVisible, v.lineFirst,
              v.lineCount, v.afterFirst, v.afterCount, v.markVisible, v.markX, v.markY, v.markZ, v.ok.visible, v.good.visible, aids.zoneTimer(), aids.zoneFor(), gi, gq.a.size());
      (v.lineVisible ? lineOn : lineOff)++;
      if (!ain.next) nextNull++;
      if (v.ok.visible) okOn++;
      if (v.good.visible) goodOn++;
      // Bande ambre seule : la verte reste masquée et garde sa position, relevée de 0,005 m (courseAids.js:166).
      if (v.ok.visible && !v.good.visible && !out["zo"].isNull() && out["zo"]["g"].isNull()) {
        okOnly++;
        if (near(v.good.y, gy0 + csoAidsDefaults().goodLift) && near(v.good.x, gx0)) okOnlyGoodMoved++;
      }
      gx0 = v.good.x;
      gy0 = v.good.y;
      if (ain.next && aids.zoneTimer() > zt0 + 1e-12) recompute++;
      zt0 = aids.zoneTimer();
    }
    CHECK(bad == 0, "%s.%s : %d écarts (aides ou bouton)", id.c_str(), lang.c_str(), bad);
  }
  CHECK(runs >= 5, "canal « ai » : %d exécutions t9-*", runs);
  for (const char* id : {"t9-parcours", "t9-appel", "t9-retour", "t9-aide-bouton", "t9-aide-off", "t9-sans-trace", "t9-ambre", "t9-courbe", "t9-recette"})
    CHECK(ids.count(id), "canal « ai » : exécution %s absente", id);
  // Zone sans bande verte (pass seul) : affichée dans t9-ambre (abord du 8 à 4,6 m/s) ; zone sans aucune plage (pass nul)
  // jamais avec les hauteurs de l'épreuve (1,05 à 1,15 m), même garde de place (écart déclaré à l'inventaire).
  CHECK(okOnly > 0 && okOnlyGoodMoved > 0, "canal « ai » : bande ambre seule %d appels (verte masquée relevée de 0,005 m : %d)", okOnly, okOnlyGoodMoved);
  CHECK(pauses == 5, "t9-recette : %d pauses de capture rejouées (5 captures de tests/e2e/cso-shots.mjs jusqu'à 5-abord-bonne-zone)", pauses);
  CHECK(lineOn > 0 && lineOff > 0 && nextNull > 0 && okOn > 0 && goodOn > 0 && recompute > 0 && pre > 0 && aidOff > 0 && earlyF > 0 && earlyCalls > 0 && virt == earlyCalls,
        "canal « ai » : branche non exercée (tracé affiché %d / masqué %d, sans obstacle suivant %d, bande ambre %d, verte %d, zone recalculée %d, entrée en piste %d, aide coupée %d, « Trop tôt » %d images / %d appuis, %d temporisations virtuelles)",
        lineOn, lineOff, nextNull, okOn, goodOn, recompute, pre, aidOff, earlyF, earlyCalls, virt);
  for (const char* k : {"none", "far", "good", "near", "early"}) CHECK(states[k] > 0, "bouton SAUT : état « %s » jamais relevé", k);
  CHECK(preAimed > 0 && footNear > 0 && behindPrev > 0 && farLine > 0 && earlyAgain > 0,
        "canal « ai » : sous-branche non exercée (entrée en piste en visée %d, à pied près de l'obstacle %d, avant l'obstacle précédent %d, loin du tracé %d, « Trop tôt » relancé %d)", preAimed, footNear, behindPrev, farLine, earlyAgain);
  std::printf("aides (sous-branches) : entrée en piste en visée %d images, à pied près de l'obstacle %d appels, point du tracé avant l'obstacle précédent %d, loin du tracé %d, « Trop tôt » relancé %d fois, bande ambre seule %d appels, pauses de capture %d\n", preAimed, footNear, behindPrev, farLine, earlyAgain, okOnly, pauses);
  std::printf("aides (canal ai) : %d exécutions, %d images, %d appels de CourseAids.update (tracé affiché %d, masqué %d, sans obstacle suivant %d, bande ambre %d, verte %d, zone recalculée %d) ; bouton : entrée en piste %d, aide coupée %d, « Trop tôt » %d images (%d appuis)",
              runs, frames, calls, lineOn, lineOff, nextNull, okOn, goodOn, recompute, pre, aidOff, earlyF, earlyCalls);
  for (const auto& kv : states) std::printf(", %s %d", kv.first.c_str(), kv.second);
  std::printf("\n");
}


// ---------- Sons de l'épreuve (tranche T12) ----------
// Journal des sons du portage comparé, image par image et dans l'ordre, au canal « audio » de TOUTES les exécutions de
// cso_runs/ (fn, arguments, fichier appelant) ; parties produites par les rejeux du cœur (testFenceRuns : écouteurs de
// game.js sur les événements du cheval du cœur, sons des obstacles du cœur ; testCsoRuns : déroulé d'épreuve), dans
// l'ordre de game.update : boutons de carte, pas du cheval (horse.update), Obstacles.updateHorse (barres, glissade),
// écouteurs de courses.js sur les événements d'obstacle, Obstacles.update (chute des barres), Run.update. Exécutions
// légères (t4-*, sans canal « ch ») : sons du cheval rejoués depuis les événements du bus de l'oracle par les mêmes
// écouteurs (le cheval n'y est pas rejoué), click (interact.js:52) d'après l'action pressée et l'action déclenchée
// (descente : player:dismountStart), sons des obstacles exclus (obstacles non rejoués). Exclus partout et déclarés :
// breath (foulées de l'animation du cheval, non portée). Chaque appel comparé doit avoir son WAV dans cso_sounds.json.
static std::string oraSnd(const J& c) {
  std::vector<std::string> a;
  for (const J& x : c["args"].a) a.push_back(argStr(x));
  return callStr(c["fn"].s, a) + "@" + (c["src"].t == J::Str ? c["src"].s : std::string("null"));
}
static void testCsoSounds() {
  CHECK(!g_fenceSounds.empty() && !g_runSounds.empty(), "sons : rejeux « fences » et « csoruns » requis (STRIDES_TESTS)");
  if (g_fenceSounds.empty() || g_runSounds.empty()) return;
  const J man = loadJson(DATA + "/cso_sounds.json");
  std::map<std::string, int> manKeys;
  for (const J& x : man["sounds"].a) manKeys[x["nom"].s] = 0;
  J o = loadRuns();
  std::map<std::string, int> perFn, excluded;
  int frames = 0, cmp = 0, bad = 0, okRuns = 0, liteRuns = 0, fullRuns = 0, missingKey = 0, noRun = 0;
  for (const J& r : o["runs"].a) {
    const std::string id = r["id"].s, lang = r["lang"].s, who = id + " (" + lang + ")", key = id + " " + lang;
    const bool lite = r["setup"]["lite"].b;
    const std::string pid = r["setup"]["horseId"].s;
    int rbad = 0;
    auto diff = [&](int fi, const std::vector<std::string>& got, const std::vector<std::string>& want) {
      rbad++;
      if (rbad > 3) return;
      std::string g, w;
      for (const auto& x : got) g += " " + x;
      for (const auto& x : want) w += " " + x;
      std::printf("  %s image %d : sons du portage :%s / web :%s\n", who.c_str(), fi, g.c_str(), w.c_str());
    };
    auto useKey = [&](const J& c) {
      CsoCall call;
      call.fn = c["fn"].s;
      for (const J& x : c["args"].a) {
        CsoArg a;
        a.isNum = x.t == J::Num;
        if (a.isNum) a.n = x.num(); else a.s = x.s;
        call.args.push_back(a);
      }
      const auto it = manKeys.find(csoSoundKey(call));
      if (it == manKeys.end()) { missingKey++; if (missingKey < 4) std::printf("  %s : son %s sans WAV au manifeste\n", who.c_str(), csoSoundKey(call).c_str()); }
      else it->second++;
    };
    // Déroulé rejoué par testCsoRuns (exécution enregistrée depuis le lancement de l'activité) ; sinon (épreuve posée en
    // cours de parcours par le scénario, ou état écrit par le test : t9-recette), sons de courses.js et missions.js exclus.
    const auto itL = g_launchSounds.find(key);
    const bool runReplayed = itL != g_launchSounds.end();
    if (runReplayed) {
      std::vector<std::string> want;
      for (const J& c : r["setup"]["calls"]["audio"].a) { want.push_back(oraSnd(c)); useKey(c); }
      if (itL->second != want) diff(-1, itL->second, want);
      cmp += (int)want.size();
    } else
      for (const J& c : r["setup"]["calls"]["audio"].a) { excluded[c["fn"].s + " (déroulé non rejoué)"]++; useKey(c); }
    const auto itF = g_fenceSounds.find(key);
    const auto itR = g_runSounds.find(key);
    if (!lite && itF == g_fenceSounds.end()) { CHECK(false, "%s : rejeu des obstacles absent", who.c_str()); continue; }
    bool prevCso = false;  // game.course?.controls === 'cso' à la fin de l'image précédente (vu par horse.update)
    for (const J& f : r["frames"].a) {
      const int fi = (int)f["f"].num();
      std::vector<std::string> want, got;
      for (const J& c : f["audio"].a) {
        const std::string& fn = c["fn"].s;
        if (fn == "breath") { excluded["breath (foulées de l’animation)"]++; continue; }
        if (lite && c["src"].s == "gameplay/obstacles.js") { excluded[fn + " (obstacles, exécutions légères)"]++; useKey(c); continue; }
        if (!runReplayed && (c["src"].s == "gameplay/courses.js" || c["src"].s == "gameplay/missions.js")) {
          excluded[fn + " (déroulé non rejoué)"]++;
          if (fn != "cheer") useKey(c);
          continue;
        }
        want.push_back(oraSnd(c));
        perFn[fn]++;
        if (fn != "cheer") useKey(c);  // cheer : automation du bus du public (testCsoCrowd)
      }
      const RunSounds* rs = nullptr;
      if (itR != g_runSounds.end()) { const auto it = itR->second.find(fi); if (it != itR->second.end()) rs = &it->second; }
      const FenceSounds* fs = nullptr;
      if (!lite) { const auto it = itF->second.find(fi); if (it != itF->second.end()) fs = &it->second; }
      auto add = [&](const std::vector<std::string>& v) { got.insert(got.end(), v.begin(), v.end()); };
      if (rs) add(rs->ui);
      if (!lite) {
        if (!fs) { CHECK(false, "%s image %d : image absente du rejeu des obstacles", who.c_str(), fi); continue; }
        add(fs->horse);
        add(fs->judge);
        add(fs->slide);
      } else {
        bool press = false, trig = false;
        for (const J& x : f["in"]["press"].a) press = press || x.s == "action";
        for (const J& e : f["ev"].a) trig = trig || e["e"].s == "player:dismountStart";
        if (press && trig) got.push_back(sndCall(csoClickCall(), "gameplay/interact.js"));
        std::vector<CsoCall> hc;
        for (const J& e : f["ev"].a) {
          const std::string& en = e["e"].s;
          const bool pl = e["d"]["horse"].t == J::Str && e["d"]["horse"].s == pid;
          if (en == "horse:jump") csoHorseSounds(CsoHorseEvent::Jump, pl, prevCso, "sand", hc);
          else if (en == "horse:land") csoHorseSounds(CsoHorseEvent::Land, pl, prevCso, "sand", hc);
          else if (en == "horse:refuse") csoHorseSounds(CsoHorseEvent::Refuse, pl, prevCso, "sand", hc);
        }
        add(sndCalls(hc, "game.js"));
      }
      if (rs) add(rs->ev);
      if (fs) add(fs->fall);
      if (rs) add(rs->upd);
      prevCso = f["course"].t == J::Obj && f["course"]["controls"].t == J::Str && f["course"]["controls"].s == "cso";
      if (got != want) diff(fi, got, want);
      cmp += (int)want.size();
      frames++;
    }
    bad += rbad;
    CHECK(rbad == 0, "%s : journal des sons : %d images en écart", who.c_str(), rbad);
    if (rbad == 0) okRuns++;
    (lite ? liteRuns : fullRuns)++;
    if (!runReplayed) noRun++;
  }
  CHECK(missingKey == 0, "sons : %d appels sans WAV au manifeste", missingKey);
  // Chaque WAV d'appel du manifeste sert au moins une fois (le manifeste est relevé dans le même oracle).
  for (const auto& [k, n] : manKeys) if (k != "crowd_loop") CHECK(n > 0, "sons : WAV %s jamais appelé", k.c_str());
  // Branches des écouteurs exercées.
  for (const char* fn : {"snort", "hoof", "landing", "neigh", "railFall", "railTouch", "thud", "notify", "applause", "bell", "tone", "fault", "crowdOoh", "cheer", "click"})
    CHECK(perFn[fn] > 0 || (std::string(fn) == "notify"), "sons : %s jamais comparé", fn);
  std::printf("sons : %d exécutions sur %zu au journal identique (%d complètes, %d légères ; déroulé non rejoué dans %d), %d images, %d appels comparés (fn, arguments, fichier, ordre) ;", okRuns, o["runs"].a.size(), fullRuns, liteRuns, noRun, frames, cmp);
  for (const auto& [k, v] : perFn) std::printf(" %s %d", k.c_str(), v);
  std::printf(" ; exclus :");
  for (const auto& [k, v] : excluded) std::printf(" %s %d ;", k.c_str(), v);
  std::printf("\n");
}

// Bus du public (tranche T12) : constantes du portage = manifeste (lues dans le source) ; niveau relevé dans le jeu autour
// du bord des 90 m ; gain rendu hors ligne (cso_crowd.json, échantillon par échantillon) rejoué par strides::CsoCrowd.
static void testCsoCrowd() {
  const J man = loadJson(DATA + "/cso_sounds.json");
  const J ora = loadJson(ORA + "/cso_crowd.json");
  const CsoCrowdParams& P = csoCrowdDefaults();
  {
    // Chemin du jeu : manifeste lu par csoSoundBankFromFile (constantes du bus prises dans le manifeste par le jeu).
    std::ifstream fm(DATA + "/cso_sounds.json");
    std::stringstream ss;
    ss << fm.rdbuf();
    CsoSoundBank bank;
    std::string err;
    CHECK(csoSoundBankFromFile(ss.str(), bank, err), "cso_sounds.json : %s", err.c_str());
    const CsoCrowdParams& B = bank.crowd;
    CHECK(B.radius == P.radius && B.level == P.level && B.scale == P.scale && B.tau == P.tau && B.cheerPeak == P.cheerPeak && B.cheerTarget == P.cheerTarget &&
              B.cheerHold == P.cheerHold && B.cheerTau == P.cheerTau && bank.crowdLoop == "crowd_loop" && bank.rate == (int)ora["rate"].num() &&
              bank.sounds.size() == man["sounds"].a.size(),
          "cso_sounds.json lu par le jeu : constantes, boucle ou nombre de sons inattendus");
  }
  for (const J* C : {&man["crowd"], &ora["constants"]}) {
    const J& c = *C;
    CHECK(c["level"]["radius"].num() == P.radius && c["level"]["value"].num() == P.level && c["ambience"]["scale"].num() == P.scale &&
              c["ambience"]["tau"].num() == P.tau && c["cheer"]["peak"].num() == P.cheerPeak && c["cheer"]["target"].num() == P.cheerTarget &&
              c["cheer"]["hold"].num() == P.cheerHold && c["cheer"]["tau"].num() == P.cheerTau,
          "public : constantes du portage ≠ source (%g %g %g %g %g %g %g %g)", c["level"]["radius"].num(), c["level"]["value"].num(), c["ambience"]["scale"].num(),
          c["ambience"]["tau"].num(), c["cheer"]["peak"].num(), c["cheer"]["target"].num(), c["cheer"]["hold"].num(), c["cheer"]["tau"].num());
  }
  int lv = 0;
  for (const J& x : man["crowd"]["inGame"].a) {
    const double got = csoCrowdLevel(x["dist"].num(), 0, 0, 0, false);
    CHECK(got == x["crowd"].num(), "public : niveau à %.3f m : %g / jeu %g", x["dist"].num(), got, x["crowd"].num());
    lv++;
  }
  CHECK(lv >= 4, "public : niveau relevé dans le jeu absent du manifeste (--no-game ?)");
  CHECK(csoCrowdLevel(500, 0, 0, 0, true) == P.level, "public : épreuve CSO en cours, hors des 90 m");
  const double rate = ora["rate"].num();
  double worst = 0;
  int probes = 0, scen = 0;
  for (const J& sc : ora["scenarios"].a) {
    CsoCrowd cr;
    const J& times = sc["times"];
    const J& pr = sc["probe"];
    size_t p = 0;
    double sw = 0;
    for (size_t k = 0; k < times.a.size(); k++) {
      const double t = times[k].num();
      const std::string ks = std::to_string(k);
      if (sc["actions"].o.count(ks))
        for (const J& a : sc["actions"][ks].a) cr.onCall(CsoCall{a[0].s, {}}, t);
      cr.ambience(sc["crowd"][k].num(), t);
      for (int q = 0; q < 2 && p < pr.a.size(); q++, p++) {
        const double n = pr[p][0].num(), want = pr[p][1].num();
        const double got = cr.gainAt(n / rate);
        sw = std::max(sw, std::abs(got - want));
        probes++;
      }
    }
    CHECK(p == pr.a.size(), "public %s : %zu relevés rejoués sur %zu", sc["id"].s.c_str(), p, pr.a.size());
    // Le modèle du cœur suit la formule exacte de la spécification ; le gain rendu par Chrome cale juste sous la cible
    // (0,0479553 au lieu de 0,048 au plateau, relevé dans l'oracle) : écart toléré 5e-5 (0,1 % du gain d'ambiance,
    // −0,008 dB). Cause supposée, à confirmer : calcul de setTargetAtTime en float32 par Chrome (l'incrément s'annule
    // près de la cible) ; une récurrence float32 simple ne reproduit pas l'oracle à mieux que 4e-5 (essayé, non gardé).
    CHECK(sw <= 5e-5, "public %s : écart de gain %.3g", sc["id"].s.c_str(), sw);
    worst = std::max(worst, sw);
    scen++;
  }
  std::printf("public : %d séquences, %d relevés du gain rejoués, écart max %.3g (formule de la spécification ; plateau du navigateur juste sous la cible) ; niveau : %d relevés du jeu\n", scen, probes, worst, lv);
}

#include "StridesCore/HorseCoat.h"

// Robe du cheval engagé (C1) : coatOf, uniformes de makeCoatMaterial / makeHairMaterial, ownedHorses / activeHorseId et
// cheval engagé, contre oracles/horse_coat.json (fonctions du web appelées telles quelles, export-horse-coat.mjs), avec
// les données lues par le jeu (Content/Data/horse_coats.json).
static void testHorseCoat() {
  const J o = loadJson(ORA + "/horse_coat.json");
  const HorseCoatData data = horseCoatDataFromJson(loadJson(DATA + "/horse_coats.json"));
  int nOf = 0, nUni = 0, nAct = 0, nEng = 0, nThrow = 0;
  // Couleurs : Math.pow de V8 et pow de la bibliothèque C diffèrent parfois au dernier bit (2e-16 mesuré) ; tolérance
  // 1e-14 (absolue sous 1), très en dessous de la précision des uniformes float du GPU.
  auto same3 = [](const std::array<double, 3>& a, const J& w) { return w.a.size() == 3 && near(a[0], w[0].num(), 1e-14) && near(a[1], w[1].num(), 1e-14) && near(a[2], w[2].num(), 1e-14); };
  auto same4 = [](const std::array<double, 4>& a, const J& w) { return w.a.size() == 4 && a[0] == w[0].num() && a[1] == w[1].num() && a[2] == w[2].num() && a[3] == w[3].num(); };
  auto coatSame = [](const Coat& c, const J& w) {
    if (c.colour != w["colour"].s || !c.blaze || *c.blaze != w["blaze"].s || !c.socks || !c.dapples || *c.dapples != w["dapples"].num()) return false;
    if (c.socks->size() != w["socks"].a.size()) return false;
    for (size_t k = 0; k < c.socks->size(); k++) if ((*c.socks)[k] != w["socks"][k].num()) return false;
    return true;
  };
  for (const J& c : o["coatOf"].a) {
    nOf++;
    if (c["out"]["throws"].t == J::Str) {
      bool threw = false;
      try { coatOf(c["def"], data); } catch (const std::exception&) { threw = true; }
      CHECK(threw, "coatOf(%s) : exception attendue (%s)", dump(c["def"]).c_str(), c["out"]["throws"].s.c_str());
      nThrow++;
      continue;
    }
    const Coat got = coatOf(c["def"], data);
    CHECK(coatSame(got, c["out"]), "coatOf(%s) : %s %s / %s", dump(c["def"]).c_str(), got.colour.c_str(), got.blaze ? got.blaze->c_str() : "-", dump(c["out"]).c_str());
  }
  for (const J& c : o["uniforms"].a) {
    nUni++;
    Coat in;
    in.colour = c["coat"]["colour"].s;
    if (c["coat"]["blaze"].t == J::Str) in.blaze = c["coat"]["blaze"].s;
    if (c["coat"]["socks"].t == J::Arr) { std::vector<double> v; for (const J& x : c["coat"]["socks"].a) v.push_back(x.num()); in.socks = v; }
    if (c["coat"]["dapples"].t == J::Num) in.dapples = c["coat"]["dapples"].num();
    const J& w = c["out"];
    if (w["throws"].t == J::Str) {
      bool threw = false;
      try { coatUniforms(in, data); } catch (const std::exception&) { threw = true; }
      CHECK(threw, "makeCoatMaterial(%s) : exception attendue (%s)", dump(c["coat"]).c_str(), w["throws"].s.c_str());
      nThrow++;
      continue;
    }
    const CoatUniforms u = coatUniforms(in, data);
    const bool ok = same3(u.coat, w["coat"]) && same3(u.points, w["points"]) && same3(u.hair, w["hair"]) && u.pointsAmt == w["pointsAmt"].num() &&
                    u.detail == w["detail"].num() && same4(u.socks, w["socks"]) && same4(u.blaze, w["blaze"]) && u.dapples == w["dapples"].num() &&
                    u.wet == w["wet"].num() && u.roughness == w["roughness"].num() && u.metalness == w["metalness"].num() &&
                    u.hairRoughness == w["hairRoughness"].num() && u.alphaTest == w["alphaTest"].num() &&
                    // THREE.DoubleSide = 2 (matériaux de base du GLB : doubleSided), gardé par clone() ; cheveux opaques (alphaTest).
                    (w["side"].num() == 2) == u.doubleSided && (w["hairSide"].num() == 2) == u.doubleSided && w["hairTransparent"].t == J::Bool && !w["hairTransparent"].b;
    CHECK(ok, "uniformes(%s) : robe (%.17g %.17g %.17g) balzanes (%g %g %g %g) liste (%g %g %g %g) / %s", dump(c["coat"]).c_str(), u.coat[0], u.coat[1], u.coat[2],
          u.socks[0], u.socks[1], u.socks[2], u.socks[3], u.blaze[0], u.blaze[1], u.blaze[2], u.blaze[3], dump(w).c_str());
  }
  for (const J& c : o["active"].a) {
    nAct++;
    const std::vector<std::string> own = ownedHorses(c["save"], data);
    std::string got = "[", want = dump(c["owned"]);
    for (size_t i = 0; i < own.size(); i++) got += (i ? "," : "") + std::string("\"") + own[i] + "\"";
    got += "]";
    bool same = own.size() == c["owned"].a.size();
    for (size_t i = 0; same && i < own.size(); i++) same = own[i] == c["owned"][i].s;
    CHECK(same, "ownedHorses(%s) : %s / %s", dump(c["save"]).c_str(), got.c_str(), want.c_str());
    CHECK(activeHorseId(c["save"], data) == c["active"].s, "activeHorseId(%s) : %s / %s", dump(c["save"]).c_str(), activeHorseId(c["save"], data).c_str(), c["active"].s.c_str());
    // Sauvegarde native (tableau de chaînes) : mêmes réponses quand save.data a cette forme.
    if (c["save"]["horses"].t == J::Arr && c["save"]["activeHorse"].t == J::Str) {
      std::vector<std::string> hs;
      bool strs = true;
      for (const J& h : c["save"]["horses"].a) { strs = strs && h.t == J::Str; hs.push_back(h.s); }
      if (strs) CHECK(activeHorseId(hs, c["save"]["activeHorse"].s, data) == c["active"].s, "activeHorseId(sauvegarde native %s)", dump(c["save"]).c_str());
    }
  }
  for (const J& c : o["engaged"].a) {
    nEng++;
    const EngagedHorse e = engagedHorse(activeHorseId(c["save"], data), data);
    CHECK(e.id == c["id"].s && e.model == (c["model"].t == J::Str ? c["model"].s : std::string()) && coatSame(e.coat, c["coat"]),
          "cheval engagé (%s) : %s %s / %s", dump(c["save"]).c_str(), e.id.c_str(), e.coat.colour.c_str(), dump(c).c_str());
  }
  // Les chevaux, robes, palette et listes du jeu sont ceux de l'oracle (même export).
  CHECK(data.horses.size() >= 4 && data.coats.size() == data.palette.size() && data.blaze.count("none") && data.bodyFragmentSha1.size() == 40,
        "horse_coats.json : %zu chevaux, %zu robes, %zu palettes", data.horses.size(), data.coats.size(), data.palette.size());
  std::printf("robe : coatOf %d, uniformes %d, sauvegardes %d, chevaux engagés %d (dont %d exceptions comme le web)\n", nOf, nUni, nAct, nEng, nThrow);
}

int main(int argc, char** argv) {
  ORA = argc > 1 ? argv[1] : "oracles";
  DATA = argc > 2 ? argv[2] : "../../StridesGrandTour/Content/Data";
  // STRIDES_TESTS=input,save… : seulement ces bancs (scripts de mutations ciblés) ; sans la variable, tous.
  const char* only = std::getenv("STRIDES_TESTS");
  const std::string sel = only ? std::string(",") + only + "," : std::string();
  const auto run = [&](const char* name, void (*fn)()) {
    if (sel.empty() || sel.find(std::string(",") + name + ",") != std::string::npos) fn();
  };
  try {
    run("jump", testJump);
    run("ride", testRide);
    run("course", testCourse);
    run("runs", testRuns);
    run("horse", testHorseRuns);
    run("fences", testFenceRuns);
    run("target", testTarget);
    run("press", testPress);
    run("judge", testJudge);
    run("save", testSave);
    loadText();
    run("text", testText);
    run("plan", testCoursePlan);
    run("entry", testCsoEntry);
    run("feedback", testCsoFeedback);
    run("hud", testCsoHud);
    run("ranking", testRanking);
    run("result", testCsoResult);
    run("layout", testCsoResultLayout);
    run("csoruns", testCsoRuns);
    run("sounds", testCsoSounds);
    run("crowd", testCsoCrowd);
    run("goto", testCsoGoto);
    run("camera", testCamRuns);
    run("input", testCsoInput);
    run("pause", testCsoPause);
    run("zone", testCsoTakeoffZone);
    run("aids", testCsoAids);
    run("coat", testHorseCoat);
  } catch (const std::exception& e) {
    std::printf("exception : %s\n", e.what());
    return 2;
  }
  std::printf("%d vérifications, %d échecs\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
