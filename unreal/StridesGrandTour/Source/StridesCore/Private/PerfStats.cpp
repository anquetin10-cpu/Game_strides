// Statistiques du mode de mesure du coût : voir StridesCore/PerfStats.h.
#include "StridesCore/PerfStats.h"

#include <algorithm>
#include <cmath>

namespace strides::perf {

double percentile(std::vector<double> v, double p) {
  if (v.empty()) return 0;
  std::sort(v.begin(), v.end());
  p = std::clamp(p, 0.0, 1.0);
  const double h = (double)(v.size() - 1) * p;
  const std::size_t lo = (std::size_t)std::floor(h);
  const std::size_t hi = std::min(lo + 1, v.size() - 1);
  return v[lo] + (h - (double)lo) * (v[hi] - v[lo]);
}

Summary summarize(const std::vector<double>& v) {
  Summary s;
  if (v.empty()) return s;
  s.n = v.size();
  s.median = percentile(v, 0.5);
  s.p95 = percentile(v, 0.95);
  double sum = 0;
  s.min = s.max = v[0];
  for (double x : v) {
    sum += x;
    s.min = std::min(s.min, x);
    s.max = std::max(s.max, x);
  }
  s.mean = sum / (double)v.size();
  return s;
}

double medianSpread(const std::vector<double>& medians) {
  if (medians.size() < 2) return 0;
  const auto [lo, hi] = std::minmax_element(medians.begin(), medians.end());
  if (*lo <= 0) return -1;
  return (*hi - *lo) / *lo;
}

}  // namespace strides::perf
