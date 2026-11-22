// Tests de l'essai de monte, voie A, étape 4 : règles de monte du web v3 portées en C++ (StridesCore/RiderRules.h).
//
// 1. Paramètres : valeurs par défaut de RideParams = Content/Data/rider_rules.json (exporté du source du web).
// 2. Règle : chaque scénario de l'oracle O2 (anim.js inchangé rejoué hors navigateur, rigs web_classic et rider_f) est
//    rejoué par RiderRules sur les mêmes entrées (canal in d'O1, réglages × setup.fitScale) ; articulations, points,
//    rotations locales, cibles et état interne comparés à chaque image (tolérances du plan, étape 4).
// 3. Entrées : RideInputFilter recalcule le canal in d'O1 depuis l'état brut du cheval (canal hz de l'image précédente,
//    réglages de la mise en selle setup.fit0) ; puis chaîne complète hz → entrées → règle contre O2 web_classic.
// 4. Pas d'état partagé : deux cavaliers, et un même cavalier remis à neuf, donnent les mêmes octets.
// Usage : strides_monte_tests <unreal/core/tests/oracles/monte> <unreal/StridesGrandTour/Content/Data>. Sortie 1 au
// moindre écart.
#include <cmath>
#include <cstdio>
#include <cstring>
#include <map>
#include <string>
#include <utility>
#include <vector>

#include "StridesCore/MiniJson.h"
#include "StridesCore/RiderRules.h"

using namespace strides::rider;

static int g_checks = 0, g_fail = 0;
#define CHECK(cond, ...)                                    \
  do {                                                      \
    g_checks++;                                             \
    if (!(cond)) {                                          \
      g_fail++;                                             \
      if (g_fail < 25) {                                    \
        std::printf("ÉCHEC %s:%d : ", __FILE__, __LINE__);  \
        std::printf(__VA_ARGS__);                           \
        std::printf("\n");                                  \
      }                                                     \
    }                                                       \
  } while (0)

// Tolérances (plan-essai.md, étape 4) : articulations et cibles ≤ 0,1 mm et ≤ 1e-4 rad ; état interne et entrées ≤ 1e-6.
static const double TOL_POS = 1e-4, TOL_ROT = 1e-4, TOL_STATE = 1e-6, TOL_IN = 1e-6;
static std::string ORA, DATA;

struct Worst {
  double v = 0;
  std::string run, what;
  int f = -1;
  void see(double x, const std::string& r, int frame, const char* w) {
    if (std::isnan(x)) x = INFINITY;  // un NaN ne passe jamais pour un écart nul
    if (f < 0 || x > v) {
      v = x;
      run = r;
      f = frame;
      what = w;
    }
  }
  void print(const char* label) const {
    std::printf("  %-40s %.3e (%s, image %d, %s)\n", label, v, run.c_str(), f, what.c_str());
  }
};

static Vec3 v3(const J& a) { return Vec3{a[0].num(), a[1].num(), a[2].num()}; }
static double vdiff(const Vec3& a, const J& b) {
  return std::fmax(std::fabs(a.x - b[0].num()), std::fmax(std::fabs(a.y - b[1].num()), std::fabs(a.z - b[2].num())));
}
// Angle entre deux quaternions unitaires, par la corde (bien conditionné près de 0), comme rider-rules-o2.mjs.
static double qAng(const Quat& a, const J& b) {
  const double bx = b[0].num(), by = b[1].num(), bz = b[2].num(), bw = b[3].num();
  const double sg = a.x * bx + a.y * by + a.z * bz + a.w * bw < 0 ? -1 : 1;
  const double c = std::sqrt((a.x - sg * bx) * (a.x - sg * bx) + (a.y - sg * by) * (a.y - sg * by) + (a.z - sg * bz) * (a.z - sg * bz) +
                             (a.w - sg * bw) * (a.w - sg * bw));
  return 4 * std::asin(std::fmin(1.0, c / 2));
}

static const char* const SCALAR_FIT[] = {"stirrupX", "stirrupY", "stirrupZ", "kneeOut", "handX", "handY", "handZ", "legClear", "mountKneeOut"};

// Réglages lus par la règle : canal in.fit d'O1, × k sauf kneeOut et mountKneeOut (directions), aucune opération si k = 1
// (rider-rules-o2.mjs rigFit).
static RideFit fitFrom(const J& F, double k) {
  RideFit fit;
  const auto sc = [&](const char* key, double v) { return (k == 1 || !std::strcmp(key, "kneeOut") || !std::strcmp(key, "mountKneeOut")) ? v : v * k; };
  const auto arr = [&](const char* key) {
    std::vector<double> out;
    const J& a = F[key];
    if (a.t != J::Arr) return out;
    for (const J& x : a.a) out.push_back(k == 1 ? x.num() : x.num() * k);
    return out;
  };
  if (F["stirrupX"].t == J::Num) fit.stirrupX = sc("stirrupX", F["stirrupX"].num());
  if (F["stirrupY"].t == J::Num) fit.stirrupY = sc("stirrupY", F["stirrupY"].num());
  if (F["stirrupZ"].t == J::Num) fit.stirrupZ = sc("stirrupZ", F["stirrupZ"].num());
  if (F["kneeOut"].t == J::Num) fit.kneeOut = sc("kneeOut", F["kneeOut"].num());
  if (F["handX"].t == J::Num) fit.handX = sc("handX", F["handX"].num());
  if (F["handY"].t == J::Num) fit.handY = sc("handY", F["handY"].num());
  if (F["handZ"].t == J::Num) fit.handZ = sc("handZ", F["handZ"].num());
  if (F["legClear"].t == J::Num) fit.legClear = sc("legClear", F["legClear"].num());
  if (F["mountKneeOut"].t == J::Num) {
    fit.hasMountKneeOut = true;
    fit.mountKneeOut = F["mountKneeOut"].num();
  }
  fit.flankL = arr("flankL");
  fit.flankR = arr("flankR");
  fit.flank = arr("flank");
  fit.crest = arr("crest");
  for (const auto& kv : F.o) {
    bool known = kv.first == "flankL" || kv.first == "flankR" || kv.first == "flank" || kv.first == "crest";
    for (const char* s : SCALAR_FIT) known = known || kv.first == s;
    CHECK(known, "réglage inconnu dans in.fit : %s", kv.first.c_str());
  }
  return fit;
}

static RideInputs inputsFrom(const J& I, double k) {
  RideInputs a;
  a.dt = I["dt"].num();
  a.t = I["t"].num();
  a.horseSpeed = I["hs"].num();
  a.gaitPhase = I["ph"].num();
  a.turn = I["turn"].num();
  a.jump = I["jump"].num();
  a.hasLandT = !I["landT"].isNull();
  a.landT = a.hasLandT ? I["landT"].num() : -1;
  a.hindDown = I["hindDown"].b;
  a.bob = I["bob"].num();
  a.pitch = I["pitch"].num();
  const J& w = I["wave"];
  a.wave = w.t == J::Bool ? w.b : (w.t == J::Num && w.n != 0);
  a.hasFit = I["fit"].t == J::Obj;
  if (a.hasFit) a.fit = fitFrom(I["fit"], k);
  return a;
}

static Rig rigFrom(const J& setup) {
  Rig rig;
  for (int b = 0; b < BoneCount; b++) {
    const J& r = setup["rest"][boneName(b)];
    CHECK(r.t == J::Arr, "repos absent : %s", boneName(b));
    if (r.t == J::Arr) rig.rest[b] = v3(r);
  }
  const J& info = setup["rig"];
  rig.info.thighLen = info["thighLen"].num();
  rig.info.shinLen = info["shinLen"].num();
  rig.info.upperArmLen = info["upperArmLen"].num();
  rig.info.foreArmLen = info["foreArmLen"].num();
  rig.info.ankleY = info["ankleY"].num();
  rig.info.seatToHips = info["seatToHips"].num();
  rig.info.toe = v3(info["toe"]);
  rig.fist = v3(setup["fist"]);
  rig.hasFistR = setup["fistR"].t == J::Arr;
  if (rig.hasFistR) rig.fistR = v3(setup["fistR"]);
  rig.scale = setup["scale"].num();
  return rig;
}

static std::string o1Path(const J& setupO2) {
  const std::string& f = setupO2["o1"]["file"].s;
  return ORA + "/o1/" + f.substr(f.find_last_of('/') + 1);
}

// ---------------------------------------------------------------------------------------------------------------
static RideParams g_params;

static void testParams() {
  const J d = loadJson(DATA + "/rider_rules.json");
  CHECK(d["schema"].s == "strides.rider_rules/1", "rider_rules.json : schéma %s", d["schema"].s.c_str());
  RideParams p;
  std::string err;
  CHECK(rideParamsFromJson(d, p, err), "rider_rules.json illisible : %s", err.c_str());
  const RideParams def;
  int n = 0;
#define SAME(field)                                                                                     \
  do {                                                                                                  \
    n++;                                                                                                \
    CHECK(p.field == def.field, "valeur par défaut de RiderRules.h différente du web : " #field " %.17g / %.17g", def.field, p.field); \
  } while (0)
  SAME(postLift); SAME(twoLift); SAME(jumpLift); SAME(seatReach); SAME(riseReach); SAME(foldIn); SAME(releaseIn0); SAME(releaseIn1);
  SAME(holdMax); SAME(recover); SAME(handBack); SAME(landFold); SAME(hindFold); SAME(breathRate); SAME(breathChest);
  SAME(breathShoulder); SAME(idleShift); SAME(handSpread); SAME(handReach); SAME(handClear); SAME(thighMargin); SAME(poleOpen);
  SAME(hugOpen); SAME(hugRelax); SAME(footOpen); SAME(footRelax); SAME(defaultFit.stirrupX); SAME(defaultFit.stirrupY);
  SAME(defaultFit.stirrupZ); SAME(defaultFit.kneeOut); SAME(defaultFit.handX); SAME(defaultFit.handY); SAME(defaultFit.handZ);
  SAME(flankRelax); SAME(flankLead); SAME(riderFitStirrupX); SAME(riderFitStirrupY); SAME(riderFitStirrupZ); SAME(riderFitKneeOut);
  SAME(riderFitHandX); SAME(riderFitHandY); SAME(riderFitHandZ); SAME(seatSaddle.x); SAME(seatSaddle.y); SAME(seatSaddle.z);
  SAME(seatBody.x); SAME(seatBody.y); SAME(seatBody.z); SAME(fist.x); SAME(fist.y); SAME(fist.z); SAME(legThick); SAME(hindDown);
#undef SAME
  // Le web n'a pas d'autres clés que celles lues (une clé nouvelle de RIDE doit être portée).
  CHECK(d["RIDE"].o.size() == 19, "RIDE : %zu clés (19 portées)", d["RIDE"].o.size());
  g_params = p;
  std::printf("paramètres : %d valeurs de rider_rules.json identiques aux valeurs par défaut de RiderRules.h\n", n);
}

// ---------------------------------------------------------------------------------------------------------------
struct Acc {
  Worst cl, cq, tg, tq, dg, frames;
  int images = 0;
};

// Compare une image de RiderRules à une image d'O2.
static void compareFrame(const RiderRules& rr, const J& fr, const std::string& id, Acc& acc) {
  const int f = static_cast<int>(fr["f"].num());
  const RideSkeleton sk = rr.skeleton();
  const J& cl = fr["cl"];
  CHECK(cl.a.size() == BoneCount + 4, "%s image %d : cl à %zu points", id.c_str(), f, cl.a.size());
  if (cl.a.size() != BoneCount + 4) return;
  for (int b = 0; b < BoneCount; b++) {
    const double d = vdiff(sk.joints[b], cl[b]);
    acc.cl.see(d, id, f, boneName(b));
    CHECK(d <= TOL_POS, "%s image %d : %s à %.3e m", id.c_str(), f, boneName(b), d);
  }
  const char* pts[4] = {"planteL", "planteR", "poingL", "poingR"};
  const Vec3 pv[4] = {sk.sole[0], sk.sole[1], sk.fist[0], sk.fist[1]};
  for (int i = 0; i < 4; i++) {
    const double d = vdiff(pv[i], cl[BoneCount + i]);
    acc.cl.see(d, id, f, pts[i]);
    CHECK(d <= TOL_POS, "%s image %d : %s à %.3e m", id.c_str(), f, pts[i], d);
  }
  const J& cq = fr["cq"];
  for (int b = Hips; b < BoneCount; b++) {
    const double d = qAng(rr.boneQuat(b), cq[b - 1]);
    acc.cq.see(d, id, f, boneName(b));
    CHECK(d <= TOL_ROT, "%s image %d : rotation de %s à %.3e rad", id.c_str(), f, boneName(b), d);
  }
  // Cibles : repère du modèle × échelle (sc3).
  const double s = rr.rig().scale;
  const RideTargets& T = rr.targets();
  const auto sc3 = [&](const Vec3& v) { return Vec3{v.x * s, v.y * s, v.z * s}; };
  const J& tg = fr["tg"];
  const std::pair<const char*, Vec3> tp[5] = {{"fL", sc3(T.foot[0])}, {"fR", sc3(T.foot[1])}, {"hL", sc3(T.hand[0])}, {"hR", sc3(T.hand[1])}, {"hp", sc3(T.hips)}};
  for (const auto& [k, v] : tp) {
    const double d = vdiff(v, tg[k]);
    acc.tg.see(d, id, f, k);
    CHECK(d <= TOL_POS, "%s image %d : cible %s à %.3e m", id.c_str(), f, k, d);
  }
  for (int side = 0; side < 2; side++) {
    const char* kq = side ? "qR" : "qL";
    const double dq = qAng(T.footQ[side], tg[kq]);
    acc.tq.see(dq, id, f, kq);
    CHECK(dq <= TOL_ROT, "%s image %d : cible %s à %.3e rad", id.c_str(), f, kq, dq);
    const char* kx = side ? "xR" : "xL";
    const bool nul = tg[kx].isNull();
    CHECK(nul == !T.hasXMax[side], "%s image %d : %s présent d'un seul côté", id.c_str(), f, kx);
    if (!nul && T.hasXMax[side]) {
      const double d = std::fabs(T.xMax[side] * s - tg[kx].num());
      acc.tg.see(d, id, f, kx);
      CHECK(d <= TOL_POS, "%s image %d : %s à %.3e m", id.c_str(), f, kx, d);
    }
  }
  // État interne.
  const RideState& R = rr.state();
  const J& dg = fr["dg"];
  const std::pair<const char*, double> ds[10] = {{"post", R.post}, {"diag", R.diag}, {"wantDiag", R.wantDiag}, {"diagT", R.diagT}, {"two", R.two},
                                                 {"jumpK", R.jumpK}, {"rel", R.rel}, {"bobAvg", R.bobAvg}, {"hd", R.hd}, {"bT", rr.blendT()}};
  for (const auto& [k, v] : ds) {
    const double d = std::fabs(v - dg[k].num());
    acc.dg.see(d, id, f, k);
    CHECK(d <= TOL_STATE, "%s image %d : état %s à %.3e", id.c_str(), f, k, d);
  }
  CHECK(R.wasJump == dg["wasJump"].b, "%s image %d : wasJump", id.c_str(), f);
  CHECK(R.hasLook == !dg["look"].isNull(), "%s image %d : look présent d'un seul côté", id.c_str(), f);
  if (R.hasLook && !dg["look"].isNull()) {
    const double lk[3] = {R.lookA, R.lookTo, R.lookT};
    for (int i = 0; i < 3; i++) {
      const double d = std::fabs(lk[i] - dg["look"][i].num());
      acc.dg.see(d, id, f, "look");
      CHECK(d <= TOL_STATE, "%s image %d : look[%d] à %.3e", id.c_str(), f, i, d);
    }
  }
  CHECK(R.hasHugMap == !dg["hug"].isNull(), "%s image %d : hug présent d'un seul côté", id.c_str(), f);
  if (R.hasHugMap && !dg["hug"].isNull()) {
    for (int side = 0; side < 2; side++) {
      const J& h = dg["hug"][side ? "r" : "l"];
      CHECK(R.hasHug[side] == !h.isNull(), "%s image %d : hug.%s présent d'un seul côté", id.c_str(), f, side ? "r" : "l");
      if (!R.hasHug[side] || h.isNull()) continue;
      const double hv[3] = {R.hugPx[side], R.hugFx[side], R.hugT[side]};
      for (int i = 0; i < 3; i++) {
        const double d = std::fabs(hv[i] - h[i].num());
        acc.dg.see(d, id, f, side ? "hug.r" : "hug.l");
        CHECK(d <= TOL_STATE, "%s image %d : hug.%s[%d] à %.3e", id.c_str(), f, side ? "r" : "l", i, d);
      }
    }
  }
  acc.images++;
}

static void testRules() {
  const J idx = loadJson(ORA + "/o2/index.json");
  CHECK(idx["schema"].s == "strides.oracle.rider_rules_o2/1", "O2 : schéma %s", idx["schema"].s.c_str());
  std::map<std::string, Acc> byRig;
  std::vector<std::string> order;
  int runs = 0;
  for (const J& e : idx["runs"].a) {
    const std::string rigName = e["rig"].s, id = rigName + "/" + e["id"].s;
    const J o2 = loadJson(ORA + "/o2/" + e["file"].s);
    const J& S = o2["setup"];
    // Ordre des os et des quaternions : celui du portage.
    CHECK(S["bones"].a.size() == BoneCount, "%s : %zu os", id.c_str(), S["bones"].a.size());
    for (int b = 0; b < BoneCount && b < static_cast<int>(S["bones"].a.size()); b++) CHECK(S["bones"][b].s == boneName(b), "%s : os %d %s", id.c_str(), b, S["bones"][b].s.c_str());
    for (int b = Hips; b < BoneCount && b - 1 < static_cast<int>(S["cq"].a.size()); b++) CHECK(S["cq"][b - 1].s == boneName(b), "%s : cq %d", id.c_str(), b);
    CHECK(S["fitOverride"].isNull() && S["seat"].isNull(), "%s : oracle O2 non versionné (fitOverride, seat)", id.c_str());
    const J o1 = loadJson(o1Path(S));
    CHECK(o1["frames"].a.size() == o2["frames"].a.size(), "%s : %zu images O1, %zu O2", id.c_str(), o1["frames"].a.size(), o2["frames"].a.size());
    const Rig rig = rigFrom(S);
    const double k = S["fitScale"].num();
    RiderRules rr(rig, g_params, S["hair"].b);
    if (!byRig.count(rigName)) order.push_back(rigName);
    Acc& acc = byRig[rigName];
    for (size_t i = 0; i < o2["frames"].a.size() && i < o1["frames"].a.size(); i++) {
      const J& f1 = o1["frames"][i];
      const J& f2 = o2["frames"][i];
      CHECK(f1["f"].num() == f2["f"].num(), "%s : image %zu décalée", id.c_str(), i);
      rr.step(inputsFrom(f1["in"], k));
      compareFrame(rr, f2, id, acc);
    }
    runs++;
  }
  std::printf("règle contre O2 : %d scénarios\n", runs);
  for (const std::string& n : order) {
    const Acc& a = byRig[n];
    std::printf(" rig %s : %d images\n", n.c_str(), a.images);
    a.cl.print("articulations et points (m)");
    a.cq.print("rotations locales (rad)");
    a.tg.print("cibles, positions (m)");
    a.tq.print("cibles, orientations des pieds (rad)");
    a.dg.print("état interne");
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Entrées depuis le cheval : hz de l'image f − 1 (le cavalier est animé avant la mise à jour du cheval).
static RideHorseSample sampleFrom(const J& hz, const J& mx) {
  RideHorseSample h;
  const J& S = hz["S"];
  // Os d'attache : matrice monde recomposée à l'échelle 1 (repère S d'O1) ; colonne z = (e[8], e[9], e[10]) de compose.
  const double x = S[3].num(), y = S[4].num(), z = S[5].num(), w = S[6].num();
  const double x2 = x + x, y2 = y + y, z2 = z + z;
  const double xx = x * x2, xz = x * z2, yy = y * y2, yz = y * z2, wx = w * x2, wy = w * y2;
  h.attachY = S[1].num();
  h.attachZ = Vec3{xz + wy, yz - wx, 1 - (xx + yy)};
  h.horseY = hz["p"][1].num();
  h.contactOff = mx["co"].isNull() ? 0 : mx["co"].num();
  h.speed = hz["v"].num();
  h.phase = hz["ph"].num();
  h.postOffset = 0;  // Comète : pas de riderPostOffset
  h.jumpT = hz["jT"].num();
  h.hindDown = hz["hd"].b;
  return h;
}
static RideFitMeters fitMeters(const J& fit0, const J& hz) {
  RideFitMeters f;
  f.stirrupX = fit0["stirrupX"].num();
  f.stirrupY = fit0["stirrupY"].num();
  f.stirrupZ = fit0["stirrupZ"].num();
  f.kneeOut = fit0["kneeOut"].num();
  f.handX = fit0["handX"].num();
  f.handY = fit0["handY"].num();
  f.handZ = fit0["handZ"].num();
  f.legClear = fit0["legClear"].t == J::Num ? fit0["legClear"].num() : 0;
  f.hasMountKneeOut = fit0["mountKneeOut"].t == J::Num;
  f.mountKneeOut = f.hasMountKneeOut ? fit0["mountKneeOut"].num() : 0;
  for (const J& x : hz["fl"].a) f.flankL.push_back(x.num());
  for (const J& x : hz["fr"].a) f.flankR.push_back(x.num());
  for (const J& x : hz["cr"].a) f.crest.push_back(x.num());
  return f;
}
static double arrDiff(const std::vector<double>& a, const J& b) {
  if (b.t != J::Arr) return a.empty() ? 0 : INFINITY;
  if (a.size() != b.a.size()) return INFINITY;
  double m = 0;
  for (size_t i = 0; i < a.size(); i++) m = std::fmax(m, std::fabs(a[i] - b[i].num()));
  return m;
}

static void testInputs() {
  const J idx = loadJson(ORA + "/o1/index.json");
  Worst wIn;
  int n = 0, runs = 0;
  Acc chain;
  for (const J& e : idx["runs"].a) {
    const std::string id = e["id"].s;
    const J o1 = loadJson(ORA + "/o1/" + e["file"].s);
    const J& S = o1["setup"];
    const J& F = o1["frames"];
    RideInputFilter filt(g_params);
    filt.seed(inputsFrom(F[0]["in"], 1));
    // Chaîne complète contre O2 web_classic (même échelle qu'O1).
    const J o2 = loadJson(ORA + "/o2/web_classic/" + id + ".json");
    RiderRules rr(rigFrom(o2["setup"]), g_params, o2["setup"]["hair"].b);
    rr.step(inputsFrom(F[0]["in"], 1));
    compareFrame(rr, o2["frames"][0], "chaîne/" + id, chain);
    for (size_t i = 1; i < F.a.size(); i++) {
      const J& I = F[i]["in"];
      const int f = static_cast<int>(F[i]["f"].num());
      RideInputs a = filt.next(sampleFrom(F[i - 1]["hz"], F[i - 1]["mx"]), fitMeters(S["fit0"], F[i - 1]["hz"]), S["scale"].num(), I["dt"].num(), I["dt"].num(), false);
      // Virage : h.lastTurn n'est pas exporté dans O1 ; il est repris du canal in (non comparé).
      a.turn = I["turn"].num();
      const std::pair<const char*, double> sc[8] = {{"dt", std::fabs(a.dt - I["dt"].num())}, {"t", std::fabs(a.t - I["t"].num())},
                                                    {"hs", std::fabs(a.horseSpeed - I["hs"].num())}, {"ph", std::fabs(a.gaitPhase - I["ph"].num())},
                                                    {"jump", std::fabs(a.jump - I["jump"].num())}, {"bob", std::fabs(a.bob - I["bob"].num())},
                                                    {"pitch", std::fabs(a.pitch - I["pitch"].num())},
                                                    {"landT", I["landT"].isNull() ? (a.hasLandT ? INFINITY : 0) : (a.hasLandT ? std::fabs(a.landT - I["landT"].num()) : INFINITY)}};
      for (const auto& [k, d] : sc) {
        wIn.see(d, id, f, k);
        CHECK(d <= TOL_IN, "entrées %s image %d : %s à %.3e", id.c_str(), f, k, d);
        n++;
      }
      CHECK(a.hindDown == I["hindDown"].b, "entrées %s image %d : hindDown", id.c_str(), f);
      const RideFit ref = fitFrom(I["fit"], 1);
      const std::pair<const char*, double> fs[12] = {
          {"fit.stirrupX", std::fabs(a.fit.stirrupX - ref.stirrupX)}, {"fit.stirrupY", std::fabs(a.fit.stirrupY - ref.stirrupY)},
          {"fit.stirrupZ", std::fabs(a.fit.stirrupZ - ref.stirrupZ)}, {"fit.kneeOut", std::fabs(a.fit.kneeOut - ref.kneeOut)},
          {"fit.handX", std::fabs(a.fit.handX - ref.handX)}, {"fit.handY", std::fabs(a.fit.handY - ref.handY)},
          {"fit.handZ", std::fabs(a.fit.handZ - ref.handZ)}, {"fit.legClear", std::fabs(a.fit.legClear - ref.legClear)},
          {"fit.mountKneeOut", a.fit.hasMountKneeOut == ref.hasMountKneeOut ? std::fabs(a.fit.mountKneeOut - ref.mountKneeOut) : INFINITY},
          {"fit.flankL", arrDiff(a.fit.flankL, I["fit"]["flankL"])}, {"fit.flankR", arrDiff(a.fit.flankR, I["fit"]["flankR"])},
          {"fit.crest", arrDiff(a.fit.crest, I["fit"]["crest"])}};
      for (const auto& [k, d] : fs) {
        wIn.see(d, id, f, k);
        CHECK(d <= TOL_IN, "entrées %s image %d : %s à %.3e", id.c_str(), f, k, d);
        n++;
      }
      rr.step(a);
      compareFrame(rr, o2["frames"][i], "chaîne/" + id, chain);
    }
    runs++;
  }
  std::printf("entrées depuis le cheval (hz de l'image précédente) : %d scénarios, %d valeurs\n", runs, n);
  wIn.print("écart maximal au canal in");
  std::printf(" chaîne complète hz → entrées → règle, contre O2 web_classic : %d images\n", chain.images);
  chain.cl.print("articulations et points (m)");
  chain.cq.print("rotations locales (rad)");
  chain.tg.print("cibles, positions (m)");
  chain.tq.print("cibles, orientations des pieds (rad)");
  chain.dg.print("état interne");
}

// ---------------------------------------------------------------------------------------------------------------
// Aucun état partagé : deux instances simultanées, puis la première remise à neuf, donnent les mêmes octets.
static void testIsolation() {
  const J o2 = loadJson(ORA + "/o2/rider_f/E3b.json");
  const J o1 = loadJson(o1Path(o2["setup"]));
  const Rig rig = rigFrom(o2["setup"]);
  const double k = o2["setup"]["fitScale"].num();
  RiderRules a(rig, g_params), b(rig, g_params);
  std::vector<double> first;
  const auto snap = [](const RiderRules& r, std::vector<double>& out) {
    const RideSkeleton sk = r.skeleton();
    for (const Vec3& v : sk.joints) out.insert(out.end(), {v.x, v.y, v.z});
    for (int b2 = 0; b2 < BoneCount; b2++) out.insert(out.end(), {r.boneQuat(b2).x, r.boneQuat(b2).y, r.boneQuat(b2).z, r.boneQuat(b2).w});
    out.insert(out.end(), {r.state().two, r.state().jumpK, r.state().hugPx[0], r.state().hugPx[1]});
  };
  std::vector<double> sa, sb;
  for (const J& f : o1["frames"].a) {
    const RideInputs in = inputsFrom(f["in"], k);
    a.step(in);
    b.step(in);
    snap(a, sa);
    snap(b, sb);
  }
  CHECK(sa.size() == sb.size() && std::memcmp(sa.data(), sb.data(), sa.size() * sizeof(double)) == 0, "deux cavaliers simultanés diffèrent");
  a.reset();
  std::vector<double> sc;
  for (const J& f : o1["frames"].a) {
    a.step(inputsFrom(f["in"], k));
    snap(a, sc);
  }
  CHECK(sa.size() == sc.size() && std::memcmp(sa.data(), sc.data(), sa.size() * sizeof(double)) == 0, "cavalier remis à neuf différent");
  std::printf("isolation : deux cavaliers simultanés et un cavalier remis à neuf identiques à l'octet (%zu valeurs)\n", sa.size());
}

int main(int argc, char** argv) {
  if (argc < 3) {
    std::printf("usage : %s <oracles/monte> <Content/Data>\n", argv[0]);
    return 2;
  }
  ORA = argv[1];
  DATA = argv[2];
  try {
    testParams();
    testRules();
    testInputs();
    testIsolation();
  } catch (const std::exception& ex) {
    std::printf("ÉCHEC : exception %s\n", ex.what());
    return 1;
  }
  std::printf("monte : %d vérifications, %d échecs\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
