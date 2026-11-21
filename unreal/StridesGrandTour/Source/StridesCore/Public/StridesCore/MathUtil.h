// Fonctions de base partagées (équivalents exacts de src/core/math.js).
#pragma once
#include <cmath>
#include <initializer_list>

namespace strides {
constexpr double kPi = 3.14159265358979323846;
inline double clampd(double v, double a, double b) { return v < a ? a : v > b ? b : v; }
inline double smoothstep(double e0, double e1, double x) {
  const double t = clampd((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
inline double signd(double x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }
// Math.hypot(a, b) tel que V8 le calcule (src/builtins/math.tq ; moteur du Chrome qui exporte les oracles ; celui
// de Safari n'a pas été comparé, à confirmer) :
// valeurs ramenées à la plus grande, somme des carrés compensée (Kahan), racine, puis remise à l'échelle. std::hypot
// peut différer d'un ulp (constaté : 994,99999999999989 au lieu de 995 sur la grille de cso_goto.json, ce qui change
// l'arrondi à la dizaine). Une opération par instruction : pas de contraction en FMA (-ffp-contract=on par défaut).
inline double jsHypot(double a, double b) {
  if (std::isnan(a) || std::isnan(b)) return std::isinf(a) || std::isinf(b) ? INFINITY : NAN;
  const double x = std::fabs(a), y = std::fabs(b);
  const double m = x > y ? x : y;
  if (m == INFINITY) return INFINITY;
  if (m == 0) return 0;
  double sum = 0, comp = 0;
  for (const double v : {x, y}) {
    const double n = v / m;
    const double sq = n * n;
    const double summand = sq - comp;
    const double pre = sum + summand;
    const double grow = pre - sum;
    comp = grow - summand;
    sum = pre;
  }
  const double root = std::sqrt(sum);
  return root * m;
}
}  // namespace strides
