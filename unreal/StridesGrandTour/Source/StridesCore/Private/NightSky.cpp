// Portage du ciel de nuit et de la pluie du web ; voir NightSky.h.
#include "StridesCore/NightSky.h"

#include <algorithm>
#include <cmath>

namespace strides::sky {

namespace {
float fract(float v) { return v - std::floor(v); }
double modp(double a, double m) { return a - m * std::floor(a / m); }
}  // namespace

float hash13(float x, float y, float z) {
  // sky.js : p = fract(p * 0.3183099 + 0.1) ; p *= 17.0 ; fract(p.x * p.y * p.z * (p.x + p.y + p.z)).
  x = fract(x * 0.3183099f + 0.1f) * 17.0f;
  y = fract(y * 0.3183099f + 0.1f) * 17.0f;
  z = fract(z * 0.3183099f + 0.1f) * 17.0f;
  return fract(x * y * z * (x + y + z));
}

std::vector<Star> stars() {
  std::vector<Star> out;
  const int R = 300;
  const double R2 = (double)R * R;
  for (int i = -R; i < R; ++i)
    for (int k = -R; k < R; ++k) {
      // Distance horizontale la plus courte et la plus longue de la colonne (i, k) au centre.
      const double nx = i >= 0 ? i : (i + 1 <= 0 ? -(i + 1) : 0), fxv = std::max(std::fabs((double)i), std::fabs((double)i + 1));
      const double nz = k >= 0 ? k : (k + 1 <= 0 ? -(k + 1) : 0), fzv = std::max(std::fabs((double)k), std::fabs((double)k + 1));
      const double hmin = nx * nx + nz * nz, hmax = fxv * fxv + fzv * fzv;
      if (hmin > R2) continue;
      // Hémisphère haut seulement (étoiles estompées sous d.y = 0,02).
      const int j0 = std::max(0, (int)std::floor(std::sqrt(std::max(0.0, R2 - hmax))) - 1);
      const int j1 = std::min(R - 1, (int)std::ceil(std::sqrt(R2 - hmin)) + 1);
      for (int j = j0; j <= j1; ++j) {
        // La cellule [i, i+1) × [j, j+1) × [k, k+1) touche la sphère de rayon 300.
        const double ymin = j, ymax = j + 1.0;
        if (hmin + ymin * ymin > R2 || hmax + ymax * ymax < R2) continue;
        if (hash13((float)i, (float)j, (float)k) <= 0.9972f) continue;
        const double cx = i + 0.5, cy = j + 0.5, cz = k + 0.5, n = std::sqrt(cx * cx + cy * cy + cz * cz);
        const double dy = cy / n;
        const double t = std::clamp((dy - 0.02) / (0.2 - 0.02), 0.0, 1.0);
        const double fade = t * t * (3 - 2 * t);
        if (fade <= 0) continue;
        const float b = (float)((0.25 + 0.6 * hash13((float)i + 3, (float)j + 3, (float)k + 3)) * fade);
        out.push_back({(float)(cx / n), (float)dy, (float)(cz / n), b});
      }
    }
  return out;
}

double nightFactor(double sunY) {
  const double t = std::clamp((sunY - 0.03) / (-0.16 - 0.03), 0.0, 1.0);
  return t * t * (3 - 2 * t);
}

void fogColor(double night, const double day[3], double out[3]) {
  static const double nightHor[3] = {0.004, 0.007, 0.016};
  const double k = std::clamp(night, 0.0, 1.0);
  for (int i = 0; i < 3; ++i) out[i] = day[i] + (nightHor[i] - day[i]) * k;
}

std::vector<RainDrop> rainDrops(int count, uint32_t seed) {
  std::vector<RainDrop> out;
  out.reserve((size_t)count);
  uint32_t s = seed;
  auto rnd = [&]() {
    s = s * 1664525u + 1013904223u;
    return (float)((s >> 8) & 0xFFFFFF) / 16777216.0f;
  };
  for (int i = 0; i < count; ++i) {
    const float x = rnd() * 46, y = rnd() * 26, z = rnd() * 46, sd = rnd();
    out.push_back({x, y, z, sd});
  }
  return out;
}

void rainAt(const RainDrop& d, double t, double cx, double cy, double cz, double& x, double& y, double& z) {
  // rain.js (vertex) : y = mod(b.y − t × (9 + 3 × seed), 26) ; xz enroulés dans une boîte de 46 m centrée sur la caméra ;
  // c = cam + (−23, −8, −23).
  const double BOX = 46, HGT = 26;
  const double speed = 9.0 + d.seed * 3.0;
  y = modp(d.y - t * speed, HGT) + cy - 8.0;
  x = modp(d.x - cx + BOX * 0.5, BOX) + cx - BOX * 0.5;
  z = modp(d.z - cz + BOX * 0.5, BOX) + cz - BOX * 0.5;
}

}  // namespace strides::sky
