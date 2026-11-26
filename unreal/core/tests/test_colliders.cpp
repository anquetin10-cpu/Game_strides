// Jalon J1 (correction) : collisions du monde (StridesCore/Colliders) contre l'oracle exporté du jeu web
// (scripts/unreal/export-colliders.mjs : src/world/colliders.js, clôture de la carrière du Pôle, ailes d'obstacles,
// résolution du cheval de horse.js:344-360), image par image.
// Usage : strides_colliders_tests <dossier des oracles>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <sstream>

#include "StridesCore/Colliders.h"
#include "StridesCore/MiniJson.h"

static int g_checks = 0, g_fail = 0;
#define CHECK(cond, ...)                                 \
  do {                                                   \
    g_checks++;                                          \
    if (!(cond)) {                                       \
      g_fail++;                                          \
      std::printf("ÉCHEC %s:%d : ", __FILE__, __LINE__); \
      std::printf(__VA_ARGS__);                          \
      std::printf("\n");                                 \
    }                                                    \
  } while (0)

static bool near(double a, double b, double tol = 1e-9) { return std::fabs(a - b) <= tol * std::fmax(1.0, std::fabs(b)); }

int main(int argc, char** argv) {
  if (argc < 2) {
    std::printf("usage : strides_colliders_tests <oracles>\n");
    return 2;
  }
  std::ifstream f(std::string(argv[1]) + "/colliders.json");
  std::stringstream ss;
  ss << f.rdbuf();
  const std::string text = ss.str();
  CHECK(!text.empty(), "colliders.json lu");
  const J o = JParser(text).parse();
  strides::Colliders C;
  const J& A = o["arena"];
  // Clôture du Pôle : tracé du web (rectFence 's', 7 m, 0,5), sol plat.
  const auto pts = strides::rectFencePoints(A["x"].num(), A["z"].num(), A["w"].num(), A["d"].num(), 's', 7, 0.5);
  CHECK(pts.size() == o["fence"].a.size(), "points de la clôture : %zu", pts.size());
  for (size_t i = 0; i < pts.size() && i < o["fence"].a.size(); i++)
    CHECK(near(pts[i].first, o["fence"][i][0].num()) && near(pts[i].second, o["fence"][i][1].num()), "point %zu de la clôture", i);
  strides::addFence(C, pts, false, 1.0, false, "arena", [](double, double) { return 0.0; });
  for (const J& ob : o["obstacles"].a)
    strides::addObstacleWings(C, ob["kind"].s, ob["x"].num(), ob["z"].num(), ob["rot"].num(), ob["w"].num(), ob["h"].num(), ob["spread"].isNull() ? 0.0 : ob["spread"].num(), 0.0);
  CHECK(C.size() == o["boxes"].a.size(), "boîtes : %zu / %zu", C.size(), o["boxes"].a.size());
  for (size_t i = 0; i < C.size() && i < o["boxes"].a.size(); i++) {
    const strides::Collider& c = C.all()[i];
    const J& b = o["boxes"][i];
    CHECK(near(c.x, b["x"].num()) && near(c.z, b["z"].num()) && near(c.hw, b["hw"].num()) && near(c.hd, b["hd"].num()) && near(c.rot, b["rot"].num()) &&
              near(c.top, b["top"].num()) && c.tag == b["tag"].s,
          "boîte %zu (%s)", i, b["tag"].s.c_str());
  }
  int contacts = 0, bumps = 0, steps = 0;
  for (size_t k = 0; k < o["cases"].a.size(); k++) {
    const J& cs = o["cases"][k];
    const J& s = cs["start"];
    double x = s["x"].num(), z = s["z"].num(), speed = s["speed"].num(), lastBump = -10;
    strides::HorseCollideInput in;
    in.heading = s["heading"].num();
    in.jumpY = s["jumpY"].num();
    in.jumpT = s["jumpT"].num();
    in.clearance = s["clearance"].num();
    in.dt = 1.0 / 60;
    for (size_t i = 0; i < cs["steps"].a.size(); i++) {
      const J& w = cs["steps"][i];
      x += std::sin(in.heading) * speed * in.dt;
      z += std::cos(in.heading) * speed * in.dt;
      in.time = i * in.dt;
      const strides::HorseCollideOut r = strides::horseCollide(C, x, z, speed, lastBump, in);
      steps++;
      contacts += r.hit;
      bumps += r.bump;
      CHECK(r.hit == w["hit"].b && r.bump == w["bump"].b && near(x, w["x"].num()) && near(z, w["z"].num()) && near(speed, w["speed"].num()),
            "cas %zu image %zu : contact %d/%d, choc %d/%d, (%.9g, %.9g) / (%.9g, %.9g), vitesse %.9g / %.9g", k, i, r.hit, w["hit"].b, r.bump, w["bump"].b, x, z,
            w["x"].num(), w["z"].num(), speed, w["speed"].num());
    }
  }
  CHECK(contacts > 0 && bumps > 0, "l'oracle couvre des contacts (%d) et des chocs (%d)", contacts, bumps);
  // Ouverture de la lice (entrée de la carrière, côté sud, 7 m au milieu) : passage libre ; à côté : repoussé.
  {
    double x = A["x"].num(), z = A["z"].num() + A["d"].num() / 2 - 0.6, sp = 6, lb = -10;
    strides::HorseCollideInput in;
    in.heading = 0;
    in.dt = 1.0 / 60;
    CHECK(!strides::horseCollide(C, x, z, sp, lb, in).hit, "ouverture : passage libre");
    x = A["x"].num() + 10;
    CHECK(strides::horseCollide(C, x, z, sp, lb, in).hit, "lice : repoussé");
  }
  std::printf("colliders : %d vérifications, %d échecs (%d images, %d contacts, %d chocs)\n", g_checks, g_fail, steps, contacts, bumps);
  return g_fail ? 1 : 0;
}
