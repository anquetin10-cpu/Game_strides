// Tests de l'essai de monte, voie A, étape 6 : ce que la cavalière Unreal demande au cœur (StridesCore/RiderPose.h).
//
// 1. Rig : rigs/rider_f.json lu par rigFromJson est celui du setup de chaque oracle O2 rider_f (repos, rigInfo, poing).
// 2. Données du jeu : Content/Data/monte_rider_f.json (scripts/unreal/export-rider-rig-data.py) reprend rigs/rider_f.json
//    et le setup.fit0 d'O1 à l'identique.
// 3. Chaîne du jeu : RideDriver (cheval de l'image précédente → entrées → règle) sur le rig rider_f à l'échelle 1, depuis
//    les canaux hz et mx d'O1, contre O2 rider_f, sur les 8 scénarios : articulations et points ≤ 0,1 mm.
// 4. poseInSeat : les articulations recomposées depuis les rotations monde et le repos redonnent skeleton() (≤ 1e-12 m).
// 5. Lecteurs du canal in : rejeu direct de toutes les images (rideInputsFromJson, réglages × fitScale) contre O2 rider_f.
// Usage : strides_rider_pose_tests <unreal/core/tests/oracles/monte> <unreal/StridesGrandTour/Content/Data>. Sortie 1 au
// moindre écart.
#include <cmath>
#include <cstdio>
#include <string>

#include "StridesCore/MiniJson.h"
#include "StridesCore/RiderPose.h"

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

static const double TOL_POS = 1e-4;  // plan-essai.md, étape 4 : 0,1 mm
static std::string ORA, DATA;

static double vdiff(const Vec3& a, const J& b) {
  return std::fmax(std::fabs(a.x - b[0].num()), std::fmax(std::fabs(a.y - b[1].num()), std::fabs(a.z - b[2].num())));
}
static double vdiff(const Vec3& a, const Vec3& b) { return std::fmax(std::fabs(a.x - b.x), std::fmax(std::fabs(a.y - b.y), std::fabs(a.z - b.z))); }
static Vec3 rot(const Quat& q, const Vec3& v) {
  const double tx = 2 * (q.y * v.z - q.z * v.y), ty = 2 * (q.z * v.x - q.x * v.z), tz = 2 * (q.x * v.y - q.y * v.x);
  return Vec3{v.x + q.w * tx + q.y * tz - q.z * ty, v.y + q.w * ty + q.z * tx - q.x * tz, v.z + q.w * tz + q.x * ty - q.y * tx};
}

static bool sameRig(const Rig& a, const Rig& b, std::string& what) {
  for (int i = 0; i < BoneCount; i++)
    if (vdiff(a.rest[i], b.rest[i]) != 0) return what = boneName(i), false;
  const double ia[6] = {a.info.thighLen, a.info.shinLen, a.info.upperArmLen, a.info.foreArmLen, a.info.ankleY, a.info.seatToHips};
  const double ib[6] = {b.info.thighLen, b.info.shinLen, b.info.upperArmLen, b.info.foreArmLen, b.info.ankleY, b.info.seatToHips};
  for (int i = 0; i < 6; i++)
    if (ia[i] != ib[i]) return what = "rigInfo", false;
  if (vdiff(a.info.toe, b.info.toe) != 0 || vdiff(a.fist, b.fist) != 0 || a.hasFistR != b.hasFistR || vdiff(a.fistR, b.fistR) != 0 || a.scale != b.scale)
    return what = "toe, fist, fistR ou scale", false;
  return true;
}

int main(int argc, char** argv) {
  if (argc < 3) {
    std::printf("usage : %s <oracles/monte> <Content/Data>\n", argv[0]);
    return 2;
  }
  ORA = argv[1];
  DATA = argv[2];
  try {
    RideParams params;
    std::string err;
    CHECK(rideParamsFromJson(loadJson(DATA + "/rider_rules.json"), params, err), "rider_rules.json : %s", err.c_str());
    Rig rig;
    CHECK(rigFromJson(loadJson(ORA + "/rigs/rider_f.json"), rig, err), "rigs/rider_f.json : %s", err.c_str());
    // Données du jeu.
    const J game = loadJson(DATA + "/monte_rider_f.json");
    CHECK(game["schema"].s == "strides.monte_rider/1", "monte_rider_f.json : schéma %s", game["schema"].s.c_str());
    Rig rigGame;
    CHECK(rigFromJson(game["rig"], rigGame, err), "monte_rider_f.json rig : %s", err.c_str());
    std::string what;
    CHECK(sameRig(rig, rigGame, what), "monte_rider_f.json : rig différent de rigs/rider_f.json (%s)", what.c_str());
    const J idx = loadJson(ORA + "/o1/index.json");
    int runs = 0, images = 0;
    double worst = 0, worstPose = 0, worstDirect = 0;
    std::string worstAt;
    for (const J& e : idx["runs"].a) {
      const std::string id = e["id"].s;
      const J o1 = loadJson(ORA + "/o1/" + e["file"].s);
      const J o2 = loadJson(ORA + "/o2/rider_f/" + id + ".json");
      const J& S = o1["setup"];
      Rig rigO2;
      CHECK(rigFromJson(o2["setup"], rigO2, err), "%s : setup O2 : %s", id.c_str(), err.c_str());
      CHECK(sameRig(rig, rigO2, what), "%s : rigs/rider_f.json différent du setup d'O2 (%s)", id.c_str(), what.c_str());
      // fit0 du jeu = fit0 d'O1 (mêmes réglages de mise en selle dans tous les scénarios).
      for (const char* k : {"stirrupX", "stirrupY", "stirrupZ", "kneeOut", "handX", "handY", "handZ"})
        CHECK(game["fit0"][k].num() == S["fit0"][k].num(), "%s : fit0.%s du jeu différent d'O1", id.c_str(), k);
      const double k = o2["setup"]["fitScale"].num();
      const J& F = o1["frames"];
      const J& F2 = o2["frames"];
      CHECK(F.a.size() == F2.a.size(), "%s : %zu images O1, %zu O2", id.c_str(), F.a.size(), F2.a.size());
      RideDriver drv(rig, params, o2["setup"]["hair"].b);
      for (size_t i = 0; i < F.a.size() && i < F2.a.size(); i++) {
        const RideHorseSample h = horseSampleFromJson(F[i]["hz"], F[i]["mx"]);
        const RideFitMeters fm = fitMetersFromJson(S["fit0"], F[i]["hz"]);
        if (i == 0) {
          drv.seed(rideInputsFromJson(F[0]["in"], k), h, fm);
        } else {
          RideInputs a = drv.prepare(h, fm, F[i]["in"]["dt"].num());
          a.turn = F[i]["in"]["turn"].num();  // h.lastTurn non exporté dans O1 (comme test_monte.cpp)
          drv.apply(a);
        }
        const RidePoseS P = poseInSeat(drv.rules());
        const J& cl = F2[i]["cl"];
        for (int b = 0; b < BoneCount; b++) {
          const double d = vdiff(P.joints[b], cl[b]);
          if (d > worst) worst = d, worstAt = id + " image " + std::to_string(i) + " " + boneName(b);
          CHECK(d <= TOL_POS, "%s image %zu : %s à %.3e m", id.c_str(), i, boneName(b), d);
        }
        const Vec3 pts[4] = {P.sole[0], P.sole[1], P.fist[0], P.fist[1]};
        for (int p = 0; p < 4; p++) {
          const double d = vdiff(pts[p], cl[BoneCount + p]);
          if (d > worst) worst = d, worstAt = id + " image " + std::to_string(i) + " point " + std::to_string(p);
          CHECK(d <= TOL_POS, "%s image %zu : point %d à %.3e m", id.c_str(), i, p, d);
        }
        // Articulations recomposées depuis les rotations monde (pose de reciblage) et le repos.
        const double s = rig.scale;
        for (int b = Root + 1; b < BoneCount; b++) {
          const int par = boneParent(b);
          const Vec3 off = b == Hips ? drv.rules().hipsPosition() : rig.rest[b];
          const Vec3 r = rot(P.world[par], off);
          const Vec3 j{P.joints[par].x + r.x * s, P.joints[par].y + r.y * s, P.joints[par].z + r.z * s};
          const double d = vdiff(j, P.joints[b]);
          worstPose = std::fmax(worstPose, d);
          CHECK(d <= 1e-12, "%s image %zu : %s recomposé à %.3e m", id.c_str(), i, boneName(b), d);
        }
        images++;
      }
      // Lecteurs du canal in (rideInputsFromJson, fitFromJson × fitScale) : rejeu direct de toutes les images contre O2.
      RiderRules direct(rig, params, o2["setup"]["hair"].b);
      for (size_t i = 0; i < F.a.size() && i < F2.a.size(); i++) {
        direct.step(rideInputsFromJson(F[i]["in"], k));
        const RideSkeleton sk = direct.skeleton();
        for (int b = 0; b < BoneCount; b++) {
          const double d = vdiff(sk.joints[b], F2[i]["cl"][b]);
          if (d > worstDirect) worstDirect = d;
          CHECK(d <= TOL_POS, "%s image %zu (rejeu du canal in) : %s à %.3e m", id.c_str(), i, boneName(b), d);
        }
      }
      runs++;
    }
    std::printf("chaîne du jeu (cheval de l'image précédente → entrées → règle), rig rider_f à l'échelle 1, contre O2 rider_f : %d scénarios, %d images\n", runs, images);
    std::printf("  articulations et points (m)              %.3e (%s)\n", worst, worstAt.c_str());
    std::printf("  articulations recomposées par poseInSeat %.3e\n", worstPose);
    std::printf("rejeu direct du canal in (rideInputsFromJson) contre O2 rider_f : articulations %.3e m\n", worstDirect);
  } catch (const std::exception& ex) {
    std::printf("ÉCHEC : exception %s\n", ex.what());
    g_fail++;
  }
  std::printf("monte-cavaliere : %d vérifications, %d échecs\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
