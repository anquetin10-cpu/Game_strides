// Étape S4 de l'essai de monte (voie A) : vue du cheval WildMesh (StridesCore/HorseView) contre le jeu web, image par
// image, sur l'oracle vue/ (scripts/unreal/export-rider-rules.mjs --vue : scénarios d'O1 rejoués à l'identique et
// scénarios propres à la vue : cercles au trot et au grand galop, sauts à main gauche et à main droite, trois vitesses).
// Deux rejeux par scénario :
//  - « pas à pas » : chaque fonction reçoit les entrées relevées dans le web à cette image et l'état du web à l'image
//    précédente ; sa sortie est comparée à celle du web (départage fonction par fonction) ;
//  - « enchaîné » : la chaîne entière (locomotion → instantané → vue → abaissement d'appel → repli → bascule) repart de son
//    propre état et de ses propres sorties ; seules les entrées du cheval du jeu (vitesse, virage, saut, refus) et les
//    positions des os relevées dans le web sont lues. C'est ce que fait le jeu Unreal.
// Tolérances (justification) : mêmes formules dans le même ordre ; exp, atan2, asin, sin et cos de la bibliothèque C peuvent
// différer d'un ulp de ceux de V8 : 1e-9 sur les grandeurs (s, m, rad, poids). Les décisions (allure, main, mode, clip de
// saut, actions actives) sont comparées exactement. On compte les valeurs identiques au bit près.
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "StridesCore/HorseView.h"
#include "StridesCore/MiniJson.h"

using namespace strides::hview;

static int g_checks = 0, g_fail = 0;
static long g_vals = 0, g_bits = 0;
static double g_worst = 0;
static std::string g_worstWhat;
#define CHECK(cond, ...)                                    \
  do {                                                      \
    g_checks++;                                             \
    if (!(cond)) {                                          \
      g_fail++;                                             \
      if (g_fail < 30) {                                    \
        std::printf("ÉCHEC %s:%d : ", __FILE__, __LINE__);  \
        std::printf(__VA_ARGS__);                           \
        std::printf("\n");                                  \
      }                                                     \
    }                                                       \
  } while (0)

static const double TOL = 1e-9;
// Grandeurs qui dépendent des sabots repliés : le web tourne le quaternion local de l'os d'attache (rotation monde du parent
// tirée de sa matrice, échelle 0,0104 de la vue comprise) puis recalcule les matrices de la chaîne ; le port tourne le sabot
// en bloc autour de l'origine de l'os. Écart mesuré au plus 8,4e-8 m (E3, 25/11/2026) ; seuil 1e-6 m (1 µm).
static const double TOL_TUCK = 1e-6;
static std::string g_ctx;
static void near(const char* what, double got, double want, double tol = TOL) {
  g_vals++;
  if (got == want) g_bits++;
  const double e = std::fabs(got - want);
  if (e > g_worst) {
    g_worst = e;
    g_worstWhat = g_ctx + " " + what;
  }
  CHECK(e <= tol, "%s %s : %.17g au lieu de %.17g (écart %.3g)", g_ctx.c_str(), what, got, want, e);
}
static double num(const J& j, double dflt = 0) { return j.isNull() ? dflt : j.num(); }
static V3 v3(const J& a) { return V3{a[0].num(), a[1].num(), a[2].num()}; }

static Obst obstOf(const J& lj, int id) {
  Obst o;
  o.id = id;
  const J& a = lj["o"];
  o.x = a[0].num(), o.z = a[1].num(), o.nx = a[2].num(), o.nz = a[3].num(), o.tx = a[4].num(), o.tz = a[5].num(), o.w = a[6].num(), o.ground = a[7].num();
  for (const J& b : lj["bars"].a) o.bars.push_back(ObBar{b[0].num(), b[1].num(), b[2].num() != 0, b[3].num() != 0});
  o.sign = num(lj["sign"], 0);
  for (const J& r : lj["rails"].a) o.rails.push_back(r.num());
  for (const J& m : lj["margins"].a) o.margins.push_back(m.num());
  return o;
}
// Point du monde dans le repère du holder (pos + quaternion, sans échelle).
static V3 toHolder(const J& H, const V3& p) {
  const double px = p.x - H[0].num(), py = p.y - H[1].num(), pz = p.z - H[2].num();
  const double qx = -H[3].num(), qy = -H[4].num(), qz = -H[5].num(), qw = H[6].num();
  const double tx = 2 * (qy * pz - qz * py), ty = 2 * (qz * px - qx * pz), tz = 2 * (qx * py - qy * px);
  return V3{px + qw * tx + qy * tz - qz * ty, py + qw * ty + qz * tx - qx * tz, pz + qw * tz + qx * ty - qy * tx};
}

struct Chain {
  Loco loco;
  SnapState sn;
  ViewState view;
  PushState push;
  ClearState clr;
  TuckState tuck;
  PrevMap prev;
  bool tuckOn = false;
};

static void checkView(const ViewState& v, const J& w, const ViewData& d) {
  // Actions de poids non nul du web : poids et temps ; les autres doivent être nulles ici.
  std::map<std::string, const J*> web;
  for (const J& e : w["w"].a) web[e[0].s] = &e;
  for (const auto& [name, x] : v.weights) {
    auto it = web.find(name);
    if (it == web.end()) {
      CHECK(x == 0 || std::fabs(x) < 1e-300, "%s action %s de poids %.3g, nulle dans le web", g_ctx.c_str(), name.c_str(), x);
      continue;
    }
    const J& e = *it->second;
    near(("poids " + name).c_str(), x, e[1].num());
    CHECK(actionEnabled(v, name) == (e[3].num() != 0), "%s action %s active %d au lieu de %d", g_ctx.c_str(), name.c_str(), actionEnabled(v, name), (int)e[3].num());
    if (actionEnabled(v, name)) near(("temps " + name).c_str(), v.times.at(name), e[2].num());
  }
  for (const auto& [name, e] : web) CHECK(v.weights.count(name), "%s action %s absente des clips", g_ctx.c_str(), name.c_str());
  CHECK(v.jumpClip == (w["jc"].isNull() ? std::string() : w["jc"].s), "%s clip de saut %s au lieu de %s", g_ctx.c_str(), v.jumpClip.c_str(), w["jc"].s.c_str());
  CHECK(v.jumpMirror == w["jm"].b, "%s miroir du saut", g_ctx.c_str());
  CHECK(v.wasJumping == w["wj"].b, "%s wasJumping", g_ctx.c_str());
  near("jumpTime", v.jumpTime, w["jt"].num());
  near("jumpWeight", v.jumpWeight, w["jw"].num());
  near("postLand", v.postLand, w["pl"].num());
  near("lastJt", v.lastJt, w["lj"].num());
  near("refusalT", v.refusalT, w["rt"].num());
  near("leadBlend", v.leadBlend, w["lb"].num());
  near("idleTime", v.idleTime, w["it"].num());
  near("bodyBaseY", v.bodyBaseY, w["bb"].num());
  near("body.y", v.bodyY, w["by"].num());
  near("body.rotation.z", v.rotZ, w["rz"].num());
  near("contactOff", v.contactOff, w["co"].num());
  (void)d;
}

static void checkSnap(const Snap& s, const SnapState& st, double phaseOut, const J& r) {
  const J& w = r["s"];
  CHECK(s.gait == w["gait"].s, "%s allure %s au lieu de %s", g_ctx.c_str(), s.gait.c_str(), w["gait"].s.c_str());
  CHECK(std::string(1, s.lead) == w["lead"].s, "%s main %c au lieu de %s", g_ctx.c_str(), s.lead, w["lead"].s.c_str());
  CHECK(s.mode == w["mode"].s, "%s mode %s au lieu de %s", g_ctx.c_str(), s.mode.c_str(), w["mode"].s.c_str());
  near("s.phase", s.phase, w["phase"].num());
  near("s.strideLen", s.strideLen, w["strideLen"].num());
  near("s.turnRate", s.turnRate, w["turnRate"].num());
  near("s.jt", s.jt, w["jt"].num());
  near("s.jT", s.jT, w["jT"].num());
  near("s.roll", s.roll, w["roll"].num());
  near("s.landingTimer", s.landingTimer, w["landingTimer"].num());
  near("landT", st.landT, r["st"]["landT"].num());
  near("h.anim.phase", phaseOut, r["phaseOut"].num());
}

// Une image de la chaîne. pas : entrées et état du web (pas à pas) ; sinon état propre (enchaîné).
static void frame(const ViewData& d, Chain& C, const J& r, const J* prevRec, bool stepwise, int obstId) {
  const double dt = r["dt"].num();
  // 1. Locomotion du jeu (anim.js) : entrées st relevées après animateHorse (elle ne les modifie pas).
  const J& st = r["loco"]["st"];
  if (stepwise) {
    if (prevRec && !(*prevRec)["end"]["A"].isNull()) {
      const J& A = (*prevRec)["end"]["A"];
      C.loco.gait = A["gait"].s, C.loco.lead = (int)A["lead"].num(), C.loco.leadHold = A["leadHold"].num(), C.loco.freq = A["freq"].num(),
      C.loco.duty = A["duty"].num(), C.loco.move = A["move"].num();
      C.loco.phase = (*prevRec)["end"]["st"]["phase"].num();
    } else if (!prevRec)
      C.loco = Loco();
  }
  LocoIn li;
  li.dt = dt;
  li.speed = st["speed"].num(), li.vel = st["vel"].num(), li.jump = st["jump"].num(), li.turn = st["turn"].num(), li.rear = st["rear"].num();
  li.lead = st["lead"].isNull() ? 0 : (int)st["lead"].num();
  locoStep(d.c, C.loco, li);
  const J& A = r["loco"]["A"];
  CHECK(C.loco.gait == A["gait"].s, "%s allure du jeu %s au lieu de %s", g_ctx.c_str(), C.loco.gait.c_str(), A["gait"].s.c_str());
  CHECK(C.loco.lead == (int)A["lead"].num(), "%s main du jeu %d au lieu de %g", g_ctx.c_str(), C.loco.lead, A["lead"].num());
  near("A.leadHold", C.loco.leadHold, A["leadHold"].num());
  near("A.freq", C.loco.freq, A["freq"].num());
  near("A.duty", C.loco.duty, A["duty"].num());
  near("A.move", C.loco.move, A["move"].num());
  near("st.phase (anim.js)", C.loco.phase, st["phase"].num());
  // 2. Instantané.
  const J& sn = r["sn"];
  if (stepwise) {
    const J& s0 = sn["st0"];
    C.sn.ph = s0["ph"].num(), C.sn.stride = s0["stride"].num(), C.sn.roll = s0["roll"].num(), C.sn.landT = s0["landT"].num(), C.sn.wasJump = s0["wasJump"].b;
  }
  SnapIn si;
  si.dt = dt;
  si.speed = sn["in"]["speed"].num();
  si.gait = stepwise ? sn["in"]["gait"].s : C.loco.gait;
  si.lead = stepwise ? (int)num(sn["in"]["lead"], 1) : C.loco.lead;
  si.jumpT = sn["in"]["jumpT"].num();
  si.jumpDur = num(sn["in"]["jumpDur"], 0);
  si.brake = num(sn["in"]["brake"], 0);
  si.rearT = num(sn["in"]["rearT"], 0);
  si.lastTurn = num(sn["in"]["lastTurn"], 0);
  double animPhase = stepwise ? sn["in"]["phase"].num() : C.loco.phase;
  const Snap s = snapshotStep(d, C.sn, si, animPhase);
  checkSnap(s, C.sn, animPhase, sn);
  C.loco.phase = animPhase;
  // 3. Vue.
  if (stepwise && prevRec) {
    // État de la vue du web à la fin de l'image précédente.
    const J& w = (*prevRec)["view"];
    for (auto& [name, x] : C.view.weights) x = 0;
    for (const J& e : w["w"].a) {
      C.view.weights[e[0].s] = e[1].num();
      C.view.times[e[0].s] = e[2].num();
    }
    C.view.jumpClip = w["jc"].isNull() ? "" : w["jc"].s;
    C.view.jumpMirror = w["jm"].b, C.view.jumpTime = w["jt"].num(), C.view.jumpWeight = w["jw"].num(), C.view.postLand = w["pl"].num();
    C.view.lastJt = w["lj"].num(), C.view.wasJumping = w["wj"].b, C.view.refusalT = w["rt"].num(), C.view.leadBlend = w["lb"].num(), C.view.idleTime = w["it"].num();
    C.view.hasBodyBaseY = !w["bb"].isNull();
    C.view.bodyBaseY = num(w["bb"], 0);
    const J& bo = (*prevRec)["bar"]["out"];
    C.view.bodyY = bo["by"].num(), C.view.bodyZ = bo["bz"].num(), C.view.rotX = bo["rx"].num(), C.view.rotZ = w["rz"].num();
    C.view.contactOff = (*prevRec)["push"]["co"].num();
  }
  viewStep(d, C.view, s, dt);
  checkView(C.view, r["view"], d);
  // 4. Abaissement d'appel : hauteurs des sabots relevées dans le web (pose de cette image).
  const J& pu = r["push"];
  if (stepwise && !pu["in"]["P0"].isNull()) {
    const J& p0 = pu["in"]["P0"];
    C.push.off = p0["off"].num(), C.push.tau = p0["tau"].num(), C.push.jumping = p0["jumping"].b, C.push.k = num(p0["k"], 1);
  } else if (stepwise)
    C.push = PushState();
  PushIn pi;
  pi.jumpT = pu["in"]["jumpT"].num();
  pi.hasClip = pu["in"]["hasClip"].b;
  pi.jumpTime = pu["in"]["jumpTime"].num();
  pi.toeOff = num(pu["in"]["toeOff"], 0);
  pi.nearBar = pu["in"]["nearBar"].b;
  pi.hasD = !pu["in"]["d"].isNull();
  pi.d = num(pu["in"]["d"], 0);
  pi.hind = pu["in"]["hind"].num();
  pi.fore = pu["in"]["fore"].num();
  near("jumpTime vu par l'appel", C.view.jumpTime, pi.jumpTime);
  const double off = pushStep(d.c, C.push, pi, C.view.contactOff);
  setContact(C.view, off);
  near("contactOff (appel)", C.view.contactOff, pu["co"].num());
  near("body.y (appel)", C.view.bodyY, pu["by"].num());
  if (!pu["P"].isNull()) {
    near("P.off", C.push.off, pu["P"]["off"].num());
    near("P.tau", C.push.tau, pu["P"]["tau"].num());
    if (!pu["P"]["k"].isNull()) near("P.k", C.push.k, pu["P"]["k"].num());
    CHECK(C.push.jumping == pu["P"]["jumping"].b, "%s P.jumping", g_ctx.c_str());
  }
  // 5. Repli et bascule.
  const J& b = r["bar"];
  if (stepwise) {
    const J& s0 = b["st0"];
    C.clr.clr = s0["clr"].b, C.clr.a = s0["a"].num(), C.clr.y = s0["y"].num(), C.clr.f = s0["f"].num();
    C.clr.hasPivF = !s0["pivF"].isNull(), C.clr.hasPivH = !s0["pivH"].isNull();
    if (C.clr.hasPivF) C.clr.pivF = v3(s0["pivF"]);
    if (C.clr.hasPivH) C.clr.pivH = v3(s0["pivH"]);
    C.view.bodyY = s0["by"].num(), C.view.bodyZ = s0["bz"].num(), C.view.rotX = s0["rx"].num();
  }
  barClearReset(C.clr, C.view);
  const bool jumping = b["jumpT"].num() >= 0;
  Need hind, fore;
  V3 pH, pF;
  bool hasH = false, hasF = false;
  const J& calls = r["need"];
  if (b["near"].b) {
    const Obst o = obstOf(b["lj"], obstId);
    const J& tk = b["tk"];
    if (stepwise) {
      C.tuck = TuckState();
      if (!tk["tuck0"].isNull()) {
        static const char* K[4] = {"PG", "PD", "AG", "AD"};
        for (int i = 0; i < 4; i++) {
          C.tuck.a[i] = num(tk["tuck0"][K[i]], 0);
          C.tuck.s[i] = num(tk["tuck0"][std::string("s") + K[i]], 0);
        }
      }
      // Mémoire de _barNeed : celle du web à l'entrée de chaque appel (relevée).
      C.prev.clear();
      for (int c = (int)b["calls"][0].num(); c < (int)b["calls"][1].num(); c++) {
        const J& call = calls[c];
        for (size_t k = 0; k < call["names"].a.size(); k++) {
          const J& q = call["prev"][k];
          const std::string key = call["tag"].s + call["names"][k].s;
          if (q.isNull() || C.prev.count(key)) continue;
          C.prev[key] = Prev{q["y"].num(), q["s"].num(), q["t"].num(), q["same"].b ? obstId : -1};
        }
      }
    } else if (!C.tuckOn)
      C.tuck = TuckState();
    C.tuckOn = true;
    TuckIn ti;
    for (int i = 0; i < 4; i++) {
      ti.toe[i] = v3(tk["toe"][i]);
      ti.hasUp[i] = !tk["up"][i].isNull();
      if (ti.hasUp[i]) ti.up[i] = v3(tk["up"][i]);
    }
    ti.ax = v3(tk["ax"]);
    ti.fw = v3(tk["fw"]);
    ti.jumping = jumping;
    ti.time = b["lj"]["t"].num();
    ti.dt = num(b["dt"], 0);
    double applied[4];
    tuckStep(d.c, C.tuck, o, ti, C.prev, applied);
    if (!b["out"]["tuck"].isNull()) {
      static const char* K[4] = {"PG", "PD", "AG", "AD"};
      for (int i = 0; i < 4; i++) near((std::string("repli ") + K[i]).c_str(), C.tuck.a[i], num(b["out"]["tuck"][K[i]], 0));
    }
    // Appels de _barNeed faits par _barClear après le repli : positions repliées comparées à celles du web.
    const V3 *toes = &ti.toe[2], *fings = &ti.toe[0];
    int ih = -1, ifo = -1;
    for (int c = (int)b["calls"][0].num(); c < (int)b["calls"][1].num(); c++)
      if (calls[c]["tag"].s.empty()) (calls[c]["names"][0].s == "toes_02_l" ? ih : ifo) = c;
    if (ih >= 0) {
      for (int k = 0; k < 2; k++) {
        const V3 w = v3(calls[ih]["p"][k]);
        near("sabot replié x", toes[k].x, w.x, TOL_TUCK), near("sabot replié y", toes[k].y, w.y, TOL_TUCK), near("sabot replié z", toes[k].z, w.z, TOL_TUCK);
        const V3 wp = v3(calls[ih]["pp"][k]);
        near("pivot replié y", fings[k].y, wp.y, TOL_TUCK);
      }
      hind = barNeed(d.c, o, {Hoof{"toes_02_l", toes[0]}, Hoof{"toes_02_r", toes[1]}}, fings[0], fings[1], "", ti.time, ti.dt, C.prev);
      const J& w = calls[ih]["out"];
      near("hind.lift", hind.lift, w["lift"].num(), TOL_TUCK), near("hind.lever", hind.lever, w["lever"].num(), TOL_TUCK), near("hind.w", hind.w, w["w"].num(), TOL_TUCK);
      hasH = true;
      pH = toHolder(r["H"], hind.pivot);
    }
    if (ifo >= 0) {
      fore = barNeed(d.c, o, {Hoof{"fingers_02_l", fings[0]}, Hoof{"fingers_02_r", fings[1]}}, toes[0], toes[1], "", ti.time, ti.dt, C.prev);
      const J& w = calls[ifo]["out"];
      near("fore.lift", fore.lift, w["lift"].num(), TOL_TUCK), near("fore.lever", fore.lever, w["lever"].num(), TOL_TUCK);
      hasF = true;
      pF = toHolder(r["H"], fore.pivot);
    }
  } else {
    C.tuckOn = false;
    if (stepwise) C.prev.clear();
  }
  barClearStep(d.c, C.clr, jumping, hasH ? &hind : nullptr, hasH ? &pH : nullptr, hasF ? &fore : nullptr, hasF ? &pF : nullptr, C.view, num(b["dt"], 0));
  const J& bo = b["out"];
  near("clrA", C.clr.a, num(bo["a"], 0), TOL_TUCK);
  near("clrY", C.clr.y, num(bo["y"], 0), TOL_TUCK);
  near("clrF", C.clr.f, num(bo["f"], 0), TOL_TUCK);
  near("body.y (barres)", C.view.bodyY, bo["by"].num(), TOL_TUCK);
  near("body.z (barres)", C.view.bodyZ, bo["bz"].num(), TOL_TUCK);
  near("body.rotation.x", C.view.rotX, bo["rx"].num(), TOL_TUCK);
  if (hasH && !bo["pivF"].isNull()) near("pivF y", C.clr.pivF.y, bo["pivF"][1].num(), TOL_TUCK), near("pivF z", C.clr.pivF.z, bo["pivF"][2].num(), TOL_TUCK);
}

static void testRun(const ViewData& d, const std::string& file, const std::string& id, bool stepwise, int& frames) {
  const J run = loadJson(file);
  Chain C;
  viewInit(d, C.view);
  const J& v0 = run["setup"]["vue0"];
  CHECK(!v0.isNull(), "%s : image de mise en place absente", id.c_str());
  // Image de mise en place, puis images exportées.
  std::vector<const J*> recs = {&v0};
  for (const J& f : run["frames"].a) recs.push_back(&f["vu"]);
  for (size_t i = 0; i < recs.size(); i++) {
    g_ctx = id + (stepwise ? " pas" : " enchaîné") + " image " + std::to_string((int)i - 1);
    frame(d, C, *recs[i], i ? recs[i - 1] : nullptr, stepwise, 1);
    frames++;
  }
}

// Données : constantes du port égales à celles relues dans le source du web ; sommets des clips de saut.
static void testData(const ViewData& d) {
  const Consts c0;
  for (int i = 0; i < 3; i++)
    for (int k = 0; k < 2; k++) CHECK(c0.cadence[i][k] == d.c.cadence[i][k], "CADENCE[%d][%d]", i, k);
  CHECK(c0.push == d.c.push && c0.pushRelease == d.c.pushRelease, "PUSH, PUSH_RELEASE");
  CHECK(c0.hoofSole == d.c.hoofSole && c0.railR == d.c.railR && c0.hindClearMax == d.c.hindClearMax, "HOOF_SOLE, RAIL_R, HIND_CLEAR_MAX");
  CHECK(c0.hindTiltMax == d.c.hindTiltMax && c0.hindLiftMax == d.c.hindLiftMax && c0.foreTiltMax == d.c.foreTiltMax && c0.tuckMax == d.c.tuckMax, "bascules");
  CHECK(c0.com == d.c.com && c0.rub == d.c.rub, "COM_CANTER_HEIGHT, JUMP.rub");
  CHECK(c0.edgeWalk == d.c.edgeWalk && c0.edgeTrot == d.c.edgeTrot && c0.edgeCanter == d.c.edgeCanter, "GAIT_EDGES");
  CHECK(d.jumps.count("jump_canter") && d.jumps.count("jump_gallop"), "clips de saut");
  for (const auto& [k, j] : d.jumps) {
    CHECK(j.toeOff < j.apex && j.apex < j.foreLand && j.foreLand < j.hindLand && j.hindLand <= j.nextFore && j.nextFore <= j.end,
          "%s : ordre des instants (toeOff %.4f, sommet %.4f, foreLand %.4f, hindLand %.4f, nextFore %.4f, fin %.4f)", k.c_str(), j.toeOff, j.apex,
          j.foreLand, j.hindLand, j.nextFore, j.end);
    std::printf("%s : toeOff %.4f s, sommet du tronc %.4f s, foreLand %.4f s, hindLand %.4f s, nextFore %.4f s, fin %.4f s\n", k.c_str(), j.toeOff, j.apex,
                j.foreLand, j.hindLand, j.nextFore, j.end);
  }
}

int main(int argc, char** argv) {
  if (argc < 3) {
    std::printf("usage : %s <oracles/monte> <Content/Data>\n", argv[0]);
    return 2;
  }
  try {
    const ViewData d = viewDataFromJson(loadJson(std::string(argv[2]) + "/pjl_horse_view.json"));
    testData(d);
    const std::string dir = std::string(argv[1]) + "/vue";
    const J idx = loadJson(dir + "/index.json");
    int runs = 0, frames = 0;
    for (const J& r : idx["runs"].a) {
      for (const bool stepwise : {true, false}) testRun(d, dir + "/" + r["file"].s, r["id"].s, stepwise, frames);
      runs++;
    }
    CHECK(runs >= 17, "%d scénarios dans l'oracle vue/", runs);
    std::printf("vue : %d scénarios, %d images rejouées (pas à pas et enchaîné), %ld valeurs, %ld identiques au bit, plus grand écart %.3g (%s)\n", runs, frames,
                g_vals, g_bits, g_worst, g_worstWhat.c_str());
  } catch (const std::exception& ex) {
    std::printf("ÉCHEC : exception %s\n", ex.what());
    return 1;
  }
  std::printf("monte-vue : %d vérifications, %d échecs\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
