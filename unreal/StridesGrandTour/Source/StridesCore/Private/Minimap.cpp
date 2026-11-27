// Mini-carte du web (src/ui/minimap.js draw) ; voir Minimap.h.
#include "StridesCore/Minimap.h"

#include <cmath>

#include "StridesCore/MathUtil.h"

namespace strides {

bool MinimapView::step(double dt, double speed, bool driving) {
  acc += dt;
  if (acc < 1.0 / 30) return false;
  acc = 0;
  const double s = std::fabs(speed);
  range += ((driving ? 260 : 150 + std::fmin(s, 16) * 6) - range) * 0.05;
  return true;
}

MinimapPoint MinimapView::toScreen(double W, double range, double fx0, double fz0, double yaw, double x, double z) {
  const double R = W / 2, scale = R / range;
  const double fx = -std::sin(yaw), fz = -std::cos(yaw);
  const double rx = std::cos(yaw), rz = -std::sin(yaw);
  const double dx = x - fx0, dz = z - fz0;
  return {R + (dx * rx + dz * rz) * scale, R - (dx * fx + dz * fz) * scale};
}

MinimapView::Image MinimapView::image(double W, double fx, double fz) const {
  // drawImage(image, −px(x)·k, −pz(z)·k, SIZE·k, SIZE·k), k = scale / S, px(x) = (x + half)·S : S s'annule.
  const double scale = (W / 2) / range;
  const double half = 600;  // WORLD.half (1 200 m)
  return {-(fx + half) * scale, -(fz + half) * scale, 2 * half * scale};
}

bool MinimapView::blip(double W, double fx, double fz, double yaw, double x, double z, bool sticky, MinimapPoint& out) const {
  const double R = W / 2;
  out = toScreen(W, fx, fz, yaw, x, z);
  const double dx = out.x - R, dy = out.y - R;
  const double d = jsHypot(dx, dy);
  const double edge = R - 10;
  if (d > edge) {
    if (!sticky) return false;
    out.x = R + (dx / d) * edge;
    out.y = R + (dy / d) * edge;
  }
  return true;
}

double MinimapView::arrowRotation(double heading, double yaw) { return -(heading - yaw + kPi); }

MinimapPoint MinimapView::north(double W, double fx, double fz, double yaw) const {
  const double R = W / 2;
  const MinimapPoint n = toScreen(W, fx, fz, yaw, fx, fz - 10000);
  const double nd = jsHypot(n.x - R, n.y - R);
  const double k = nd != 0 ? nd : 1;
  return {R + ((n.x - R) / k) * (R - 9), R + ((n.y - R) / k) * (R - 9)};
}

double MinimapView::yawFromLook(double lookX, double lookZ) { return std::atan2(-lookX, -lookZ); }

}  // namespace strides
