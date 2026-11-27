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

}  // namespace strides
