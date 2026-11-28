// Essai de monte, voie A, étape 7 : statistiques du mode de mesure du coût (StridesCore/PerfStats), hors moteur.
// Valeurs attendues calculées à la main par la définition « type 7 » (rang h = (n − 1) · p, interpolation linéaire), qui
// est aussi celle de statistics.quantiles(method='inclusive') utilisée par scripts/unreal/perf-summary.py.
// Usage : strides_perf_tests
#include <cmath>
#include <cstdio>
#include <vector>

#include "StridesCore/PerfStats.h"

using namespace strides::perf;

static int g_checks = 0, g_fail = 0;
#define CHECK(cond, ...)                                    \
  do {                                                      \
    g_checks++;                                             \
    if (!(cond)) {                                          \
      g_fail++;                                             \
      std::printf("ÉCHEC %s:%d : ", __FILE__, __LINE__);    \
      std::printf(__VA_ARGS__);                             \
      std::printf("\n");                                    \
    }                                                       \
  } while (0)

static bool near(double a, double b) { return std::fabs(a - b) <= 1e-12 * std::fmax(1.0, std::fabs(b)); }

int main() {
  // 1..20 dans le désordre : médiane 10,5 ; 95e centile h = 18,05 → 19 + 0,05 · 1 = 19,05.
  std::vector<double> v;
  for (int i = 0; i < 20; i++) v.push_back((double)((i * 7) % 20 + 1));
  const std::vector<double> copy = v;
  const Summary s = summarize(v);
  CHECK(s.n == 20, "n %zu", s.n);
  CHECK(near(s.median, 10.5), "médiane %.17g", s.median);
  CHECK(near(s.p95, 19.05), "p95 %.17g", s.p95);
  CHECK(near(s.mean, 10.5), "moyenne %.17g", s.mean);
  CHECK(near(s.min, 1) && near(s.max, 20), "min %.17g max %.17g", s.min, s.max);
  CHECK(v == copy, "entrée modifiée");
  // Nombre impair : médiane = valeur centrale ; extrêmes du centile.
  const std::vector<double> odd = {5, 1, 3};
  CHECK(near(percentile(odd, 0.5), 3), "médiane impaire %.17g", percentile(odd, 0.5));
  CHECK(near(percentile(odd, 0), 1) && near(percentile(odd, 1), 5), "bornes");
  CHECK(near(percentile(odd, 0.95), 4.8), "p95 de {1,3,5} : h = 1,9 → 3 + 0,9 · 2 = 4,8 ; %.17g", percentile(odd, 0.95));
  CHECK(near(percentile(odd, 1.5), 5) && near(percentile(odd, -1), 1), "p hors de 0..1 borné");
  // Deux valeurs : p95 = 0 + 0,95 · 10.
  CHECK(near(percentile({0, 10}, 0.95), 9.5), "p95 de {0,10}");
  // Une valeur, aucune valeur.
  const Summary one = summarize({2.5});
  CHECK(one.n == 1 && near(one.median, 2.5) && near(one.p95, 2.5) && near(one.mean, 2.5), "une valeur");
  const Summary none = summarize({});
  CHECK(none.n == 0 && none.median == 0 && none.p95 == 0, "aucune valeur");
  // 600 images mesurées (taille du mode perf) : 0, 1, …, 599 ; p95 h = 569,05.
  std::vector<double> big;
  for (int i = 599; i >= 0; i--) big.push_back(i);
  CHECK(near(summarize(big).median, 299.5), "médiane de 600 valeurs");
  CHECK(near(summarize(big).p95, 569.05), "p95 de 600 valeurs %.17g", summarize(big).p95);
  // Dispersion des médianes : rapportée à la plus petite.
  CHECK(near(medianSpread({10, 10.5, 9.8}), (10.5 - 9.8) / 9.8), "dispersion %.17g", medianSpread({10, 10.5, 9.8}));
  CHECK(near(medianSpread({4, 4, 4}), 0), "dispersion nulle");
  CHECK(near(medianSpread({4}), 0) && near(medianSpread({}), 0), "moins de deux passes");
  CHECK(medianSpread({0, 1}) == -1, "médiane nulle : indéfinie");
  CHECK(medianSpread({1.05, 1.0}) > 0.0499 && medianSpread({1.05, 1.0}) < 0.0501, "5 %% exactement");
  std::printf("perf : %d vérifications, %d échecs\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
