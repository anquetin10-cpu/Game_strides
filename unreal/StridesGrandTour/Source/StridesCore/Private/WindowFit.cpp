#include "StridesCore/WindowFit.h"

#include <cmath>

namespace strides {

std::optional<WindowOrigin> fullscreenWindowResync(double cursorX, double cursorY, double winX, double winY, double winW,
                                                   double winH, const std::vector<ScreenRect>& screens) {
  for (const ScreenRect& s : screens) {
    if (cursorX < s.left || cursorX >= s.right || cursorY < s.top || cursorY >= s.bottom) continue;
    if (std::fabs(winW - (s.right - s.left)) > 2 || std::fabs(winH - (s.bottom - s.top)) > 2) return std::nullopt;
    if (std::fabs(winX - s.left) < 0.5 && std::fabs(winY - s.top) < 0.5) return std::nullopt;
    return WindowOrigin{s.left, s.top};
  }
  return std::nullopt;
}

SafeShift safeAreaShift(double insetLeft, double insetTop, double insetRight, double insetBottom) {
  auto Ex = [](double inset, double margin) { return inset > margin ? inset - margin : 0.0; };
  return SafeShift{Ex(insetLeft, 16), Ex(insetTop, 10), Ex(insetRight, 16), Ex(insetBottom, 10)};
}

double iosContentScale(double requested, double nativeScale) {
  if (nativeScale <= 0) nativeScale = 1;
  if (requested <= 0) return nativeScale;
  return requested < nativeScale ? requested : nativeScale;
}

}  // namespace strides
