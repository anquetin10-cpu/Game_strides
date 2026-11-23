// Statistiques du mode de mesure du coût (essai de monte, voie A, étape 7 : -StridesShots=perf), en C++20 standard, sans
// type Unreal. Le moteur relève une valeur par image (temps du jeu, du rendu, du GPU, mémoire) ; ce cœur en tire la
// médiane et le 95e centile écrits dans perf-unreal.json, et la dispersion des médianes entre passes (critère d'acceptation
// du plan : ≤ 5 %).
//
// Centile : interpolation linéaire entre rangs (définition « type 7 » de Hyndman et Fan, celle de numpy.percentile par
// défaut et de statistics.quantiles(method='inclusive') de Python) : rang h = (n − 1) · p, valeur v[⌊h⌋] + (h − ⌊h⌋) ·
// (v[⌊h⌋+1] − v[⌊h⌋]) sur les valeurs triées. scripts/unreal/perf-summary.py recalcule médiane et 95e centile depuis les
// valeurs brutes avec statistics.quantiles et compare : deux implantations indépendantes.
//
// Dispersion des médianes : (max − min) / min des médianes des passes, en fraction (0,05 = 5 %) ; prise par rapport à la
// plus petite médiane, donc jamais plus indulgente qu'un écart rapporté à la moyenne.
//
// Preuves : unreal/core/tests/test_perf_stats.cpp (ctest « perf ») ; Strides.Shots.PerfStats (même calcul vu du module).
#pragma once
#include <cstddef>
#include <vector>

#include "StridesCore/Api.h"

namespace strides::perf {

struct Summary {
  std::size_t n = 0;
  double median = 0, p95 = 0, mean = 0, min = 0, max = 0;
};

// Centile p (0..1) des valeurs, interpolation linéaire entre rangs ; 0 si vide.
STRIDESCORE_API double percentile(std::vector<double> v, double p);
// Médiane, 95e centile, moyenne, minimum et maximum ; tout à 0 si vide.
STRIDESCORE_API Summary summarize(const std::vector<double>& v);
// (max − min) / min des médianes ; 0 pour moins de deux passes ; −1 si une médiane est ≤ 0 (dispersion indéfinie).
STRIDESCORE_API double medianSpread(const std::vector<double>& medians);

}  // namespace strides::perf
