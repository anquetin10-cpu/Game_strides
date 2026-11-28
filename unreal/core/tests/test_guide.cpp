// Jalon J1 (correction après le 2e contrôle) : guidage qui contourne les obstacles, leurs ailes et la lice
// (StridesCore/CsoGuide, choix du portage : le web n'a pas de pastille de guidage). Carrière et obstacles de l'oracle
// colliders.json (géométrie du web : lice du Pôle, ouverture de 7 m au sud, ailes), plus un oxer et un droit posés pour
// le cas « obstacle pris de dos ». Un marcheur suit le point visé par pas de 0,5 m : il doit atteindre le but sans
// jamais entrer dans une case bloquée (une fois sorti de sa case de départ).
// Usage : strides_guide_tests <dossier des oracles>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <sstream>

#include "StridesCore/Colliders.h"
#include "StridesCore/CsoGuide.h"
#include "StridesCore/CsoHorse.h"
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

// Marcheur : pas de 0,5 m vers le point visé ; renvoie le nombre de pas (−1 : but non atteint) et compte les entrées
// en zone bloquée après en être sorti.
static int walk(const strides::GuideGrid& g, double x, double z, double gx, double gz, int& intrusions, double& length) {
  intrusions = 0;
  length = 0;
  bool left = !g.blockedAt(x, z);
  for (int k = 0; k < 2000; k++) {
    if (std::hypot(gx - x, gz - z) < 0.6) return k;
    double ax, az;
    strides::guideAim(g, x, z, gx, gz, ax, az);
    const double d = std::hypot(ax - x, az - z);
    if (d < 1e-6) return -1;
    const double s = std::min(0.5, d);
    x += (ax - x) / d * s;
    z += (az - z) / d * s;
    length += s;
    const bool b = g.blockedAt(x, z);
    if (!b) left = true;
    else if (left) intrusions++;
  }
  return -1;
}

int main(int argc, char** argv) {
  if (argc < 2) {
    std::printf("usage : strides_guide_tests <oracles>\n");
    return 2;
  }
  std::ifstream f(std::string(argv[1]) + "/colliders.json");
  std::stringstream ss;
  ss << f.rdbuf();
  const J o = JParser(ss.str()).parse();
  const J& A = o["arena"];
  const double AX = A["x"].num(), AZ = A["z"].num(), AW = A["w"].num(), AD = A["d"].num();
  CHECK(AW > 0 && AD > 0, "carrière lue (%g × %g)", AW, AD);
  strides::Colliders C;
  strides::addFence(C, strides::rectFencePoints(AX, AZ, AW, AD, 's', 7, 0.5), false, 1.0, false, "arena", [](double, double) { return 0.0; });
  std::vector<strides::CsoObstacle> obs;
  for (const J& ob : o["obstacles"].a) {
    const double sp = ob["spread"].isNull() ? 0.0 : ob["spread"].num();
    strides::addObstacleWings(C, ob["kind"].s, ob["x"].num(), ob["z"].num(), ob["rot"].num(), ob["w"].num(), ob["h"].num(), sp, 0.0);
    obs.push_back(strides::makeCsoObstacle(ob["kind"].s, ob["x"].num(), ob["z"].num(), ob["rot"].num(), ob["h"].num(), ob["w"].num(), sp));
  }
  // Oxer large posé en travers de la carrière, au milieu (rot 0 : barres le long de x, saut vers +z).
  const strides::CsoObstacle wide = strides::makeCsoObstacle("o", AX + 20, AZ, 0.0, 1.2, 4.0, 1.4);
  strides::addObstacleWings(C, wide.kind, wide.x, wide.z, wide.rot, wide.w, wide.h, wide.spread, 0.0);
  obs.push_back(wide);
  const strides::GuideBounds B{AX - AW / 2 - 30, AZ - AD / 2 - 30, AX + AW / 2 + 30, AZ + AD / 2 + 30};
  const strides::GuideGrid g = strides::buildGuideGrid(B, C, obs);
  int nb = 0;
  for (uint8_t v : g.blocked) nb += v;
  CHECK(g.nx > 0 && g.nz > 0 && nb > 0, "grille %d × %d, %d cases bloquées", g.nx, g.nz, nb);

  // 1) Ligne directe libre : le but lui-même.
  {
    double ax, az;
    const double mx = AX - 40, mz = AZ + 20, gx = AX - 40, gz = AZ - 10;
    CHECK(strides::guideClear(g, mx, mz, gx, gz), "couloir ouest libre");
    CHECK(strides::guideAim(g, mx, mz, gx, gz, ax, az) && ax == gx && az == gz, "ligne libre : point visé = but (%.2f ; %.2f)", ax, az);
  }
  // 2) Hors grille : faux, point visé = but (comportement d'avant : la ligne « Chrono du Pôle » mène à l'entrée).
  {
    double ax, az;
    CHECK(!strides::guideAim(g, AX + 500, AZ, AX, AZ, ax, az) && ax == AX && az == AZ, "hors grille : but");
  }
  // 3) Obstacle pris de dos (relevé au contrôle : joueur bloqué au 7 « sens −1 ») : cavalier 10 m derrière l'oxer, but =
  //    abord 12 m devant lui. La ligne droite traverse l'oxer ; le guidage le contourne et l'atteint.
  {
    const double mx = wide.x + wide.n.x * 10, mz = wide.z + wide.n.z * 10;
    const double gx = wide.x - wide.n.x * 12, gz = wide.z - wide.n.z * 12;
    CHECK(!strides::guideClear(g, mx, mz, gx, gz), "ligne droite à travers l'oxer : bloquée");
    double ax, az;
    CHECK(strides::guideAim(g, mx, mz, gx, gz, ax, az), "chemin trouvé autour de l'oxer");
    CHECK(strides::guideClear(g, mx, mz, ax, az), "point visé (%.2f ; %.2f) vu sans traverser l'oxer", ax, az);
    const double u = (ax - wide.x) * wide.t.x + (az - wide.z) * wide.t.z;
    CHECK(std::abs(u) > wide.w / 2 + 1.06, "point visé à côté des ailes (u = %.2f m)", u);
    int in = 0;
    double len = 0;
    const int steps = walk(g, mx, mz, gx, gz, in, len);
    CHECK(steps > 0 && in == 0, "marcheur : but atteint en %d pas (%.1f m), %d entrées en zone bloquée", steps, len, in);
    CHECK(len < 60, "détour raisonnable (%.1f m pour 22 m à vol d'oiseau)", len);
  }
  // 4) Depuis l'extérieur au nord (côté fermé de la lice), but au centre : le chemin passe par l'ouverture sud.
  {
    const double mx = AX, mz = AZ - AD / 2 - 10, gx = AX - 30, gz = AZ;
    int in = 0;
    double len = 0;
    const int steps = walk(g, mx, mz, gx, gz, in, len);
    CHECK(steps > 0 && in == 0, "nord → centre : but atteint (%d pas, %.1f m), %d entrées en zone bloquée", steps, len, in);
    CHECK(len > AD, "nord → centre : contour par l'ouverture sud (%.1f m > %.0f m)", len, AD);
  }
  // 5) Cavalier collé à une aile (case de départ bloquée) : il en sort et atteint le but.
  {
    const double mx = wide.x + wide.t.x * (wide.w / 2 + 0.8), mz = wide.z + wide.t.z * (wide.w / 2 + 0.8);
    CHECK(g.blockedAt(mx, mz), "départ dans la zone de l'aile");
    int in = 0;
    double len = 0;
    const int steps = walk(g, mx, mz, wide.x - wide.n.x * 12, wide.z - wide.n.z * 12, in, len);
    CHECK(steps > 0 && in == 0, "départ contre l'aile : but atteint (%d pas), %d entrées", steps, in);
  }
  // 6) Balayage : 200 départs et buts libres dans la carrière ; tous atteints sans entrer dans une zone bloquée.
  {
    int ok = 0, tot = 0, intr = 0;
    unsigned s = 12345;
    auto rnd = [&]() { s = s * 1103515245u + 12345u; return ((s >> 8) & 0xFFFF) / 65535.0; };
    while (tot < 200) {
      const double mx = AX - AW / 2 + 3 + rnd() * (AW - 6), mz = AZ - AD / 2 + 3 + rnd() * (AD - 6);
      const double gx = AX - AW / 2 + 3 + rnd() * (AW - 6), gz = AZ - AD / 2 + 3 + rnd() * (AD - 6);
      if (g.blockedAt(mx, mz) || g.blockedAt(gx, gz)) continue;
      tot++;
      int in = 0;
      double len = 0;
      if (walk(g, mx, mz, gx, gz, in, len) > 0) ok++;
      intr += in;
    }
    CHECK(ok == tot && intr == 0, "balayage : %d / %d buts atteints, %d entrées en zone bloquée", ok, tot, intr);
  }
  // 6 bis) Cavalier dehors, collé au bout de la lice à côté de l'ouverture (relevé en partie le 26/11 : « tout droit »
  //    vers le 1 à travers la lice, cheval bloqué 2 min) : la ligne au travers de la lice est refusée, le chemin passe
  //    par l'ouverture.
  {
    const double mx = AX + 4.4, mz = AZ + AD / 2 + 0.9, gx = AX + 7, gz = AZ + AD / 2 - 12;
    CHECK(g.levelAt(mx, mz) >= 1, "départ dans la marge de la lice (niveau %d)", g.levelAt(mx, mz));
    CHECK(!strides::guideClear(g, mx, mz, gx, gz), "ligne droite à travers la lice : refusée malgré le départ dans la marge");
    double ax, az;
    strides::guideAim(g, mx, mz, gx, gz, ax, az);
    CHECK(std::abs(ax - AX) < 3.5 || az > AZ + AD / 2, "point visé vers l'ouverture (%.2f ; %.2f)", ax - AX, az - AZ);
    int in = 0;
    double len = 0;
    CHECK(walk(g, mx, mz, gx, gz, in, len) > 0, "bout de lice → carrière : but atteint (%.1f m)", len);
  }
  // 7) Abord d'un axe (guideAxisTarget) : obstacle en (0, 0), saut vers +z, face avant à −0,5 m.
  {
    strides::GuideAxis a;
    a.front = -0.5;
    a.halfW = 1.9;
    double tx, tz;
    bool path;
    using M = strides::GuideMode;
    CHECK(strides::guideAxisTarget(a, 0, -40, 0, 1, 5, tx, tz, path) == M::Approach && path && tx == 0 && tz == -12.5, "loin : abord 12 m devant la face (%.2f ; %.2f)", tx, tz);
    CHECK(strides::guideAxisTarget(a, 3, -10, 0, 1, 5, tx, tz, path) == M::Pursue && !path && tx == 0 && tz > -10 && tz < -0.5, "couloir, tourné vers l'axe : point de l'axe devant (%.2f ; %.2f)", tx, tz);
    CHECK(strides::guideAxisTarget(a, 0, -2, 0, 1, 5, tx, tz, path) == M::Center && tx == 0 && tz == 0, "derniers mètres, lancé : le centre");
    CHECK(strides::guideAxisTarget(a, 0, 1.5, 0, 1, 5, tx, tz, path) == M::Center, "au-dessus de l'obstacle (saut) : le centre, pas de demi-tour");
    CHECK(strides::guideAxisTarget(a, 0, -1.2, 0, 1, 0.2, tx, tz, path) == M::RideOut && path && tz < -15, "arrêté contre la face (refus) : sortie à 18 m (%.2f)", tz);
    CHECK(strides::guideAxisTarget(a, 0, -8, 0, -1, 5, tx, tz, path) == M::RideOut, "couloir, dos à l'obstacle : sortie");
    CHECK(strides::guideAxisTarget(a, 0, 10, 0, -1, 5, tx, tz, path) == M::Approach && path, "derrière l'obstacle : l'abord par un chemin");
    CHECK(strides::guideAxisTarget(a, 20, -10, -1, 0, 5, tx, tz, path) == M::Approach, "hors couloir sur le côté : l'abord");
  }
  std::printf("guidage : %d vérifications, %d échecs\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
