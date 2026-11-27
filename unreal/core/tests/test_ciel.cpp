// Jalon J3b : ciel de nuit et pluie du web (StridesCore/NightSky) : hash13 de sky.js (simple précision, valeurs de
// référence calculées sous Node avec Math.fround), densité des étoiles, estompage à l'horizon, nightFactor, gouttes de
// rain.js enroulées autour de la caméra.
#include <cmath>
#include <cstdio>

#include "StridesCore/NightSky.h"

static int g_checks = 0, g_fail = 0;
#define CHECK(cond, ...)                                   \
  do {                                                     \
    g_checks++;                                            \
    if (!(cond)) {                                         \
      g_fail++;                                            \
      std::printf("ÉCHEC %s:%d : ", __FILE__, __LINE__);   \
      std::printf(__VA_ARGS__);                            \
      std::printf("\n");                                   \
    }                                                      \
  } while (0)

int main() {
  namespace S = strides::sky;
  struct Ref { float x, y, z, h; };
  const Ref refs[] = {{0, 0, 0, 0.0563030f}, {12, 250, -31, 0.9003906f}, {-200, 180, 77, 0.0498047f}, {5, 299, 3, 0.8222046f}, {299, 10, -3, 0.1460571f}};
  for (const Ref& r : refs) {
    const float h = S::hash13(r.x, r.y, r.z);
    CHECK(std::fabs(h - r.h) < 2e-3, "hash13(%g, %g, %g) = %.7f au lieu de %.7f", r.x, r.y, r.z, h, r.h);
  }
  const auto st = S::stars();
  int low = 0;
  float bmin = 9, bmax = 0;
  for (const auto& s : st) {
    low += s.y < 0.02f;
    bmin = std::fmin(bmin, s.bright);
    bmax = std::fmax(bmax, s.bright);
    CHECK(std::fabs(std::sqrt(s.x * s.x + s.y * s.y + s.z * s.z) - 1) < 1e-4, "direction non unitaire");
  }
  // Densité du web : 0,28 % des cellules de la sphère de rayon 300 (≈ 565 000 cellules sur l'hémisphère haut).
  CHECK(st.size() > 1000 && st.size() < 2600, "%zu étoiles", st.size());
  CHECK(low == 0 && bmin > 0 && bmax <= 0.85f + 1e-4f, "estompage : %d sous l'horizon, éclat %.3f à %.3f", low, bmin, bmax);
  CHECK(S::nightFactor(0.1) == 0 && S::nightFactor(-0.2) == 1 && std::fabs(S::nightFactor(-0.065) - 0.5) < 1e-9, "nightFactor");
  const auto drops = S::rainDrops(3000);
  int outside = 0;
  for (const auto& d : drops) {
    double x, y, z;
    S::rainAt(d, 123.4, 500, 12, -300, x, y, z);
    outside += std::fabs(x - 500) > 23 || std::fabs(z + 300) > 23 || y < 12 - 8 || y > 12 + 18;
  }
  CHECK(outside == 0, "%d gouttes hors de la boîte de 46 × 26 m autour de la caméra", outside);
  {
    double x0, y0, z0, x1, y1, z1;
    S::rainAt(drops[0], 1.0, 0, 0, 0, x0, y0, z0);
    S::rainAt(drops[0], 1.05, 0, 0, 0, x1, y1, z1);
    const double v = (y0 - y1) / 0.05;
    CHECK((v > 8.99 && v < 12.01) || v < 0, "chute de %.2f m/s (9 à 12 m/s au web)", v);
  }
  std::printf("ciel : %d vérifications, %d échecs ; %zu étoiles\n", g_checks, g_fail, st.size());
  return g_fail ? 1 : 0;
}
