// Fonctions de base partagées (équivalents exacts de src/core/math.js).
#pragma once
#include <cmath>

namespace strides {
constexpr double kPi = 3.14159265358979323846;
inline double clampd(double v, double a, double b) { return v < a ? a : v > b ? b : v; }
inline double smoothstep(double e0, double e1, double x) {
  const double t = clampd((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
inline double signd(double x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }
}  // namespace strides
