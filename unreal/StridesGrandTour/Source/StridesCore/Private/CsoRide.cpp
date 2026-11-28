// Portage de src/gameplay/csoRide.js (voir CsoRide.h).
#include "StridesCore/CsoRide.h"
#include "StridesCore/MathUtil.h"
#include <algorithm>
#include <cmath>

namespace strides {
const CsoRideParams& csoRideDefaults() {
  static const CsoRideParams R;
  return R;
}
double minRadius(double v, const CsoRideParams& R) { return R.radius0 + R.radiusK * std::max(0.0, v); }
double maxTurnRate(double v, const CsoRideParams& R) {
  if (v >= 1) return v / minRadius(v, R);
  const double w1 = 1 / minRadius(1, R);
  return R.pivot + (w1 - R.pivot) * std::max(0.0, v);
}
double steerRate(double x, double v, const CsoRideParams& R) {
  const double a = std::abs(x);
  if (a <= R.steerDead) return 0;
  const double u = std::min(1.0, (a - R.steerDead) / (1 - R.steerDead));
  return -signd(x) * std::pow(u, R.expo) * maxTurnRate(v, R);
}
double cadenceDelta(double y, double x, double cadence, const CsoRideParams& R) {
  const double a = std::abs(y);
  if (a <= R.deadZone || a <= R.slope * std::abs(x)) return 0;
  const double thr = signd(y) * std::min(1.0, (a - R.deadZone) / (1 - R.deadZone));
  return thr * (cadence < 4.6 ? R.lowRate : R.cadenceRate);
}
}  // namespace strides
