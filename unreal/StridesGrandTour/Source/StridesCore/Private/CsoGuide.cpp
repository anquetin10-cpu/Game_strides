// Guidage qui contourne les obstacles (choix du portage, voir CsoGuide.h).
#include "StridesCore/CsoGuide.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <queue>

namespace strides {

bool GuideGrid::inside(double x, double z) const {
  const int i = (int)std::floor((x - minX) / cell), j = (int)std::floor((z - minZ) / cell);
  return nx > 0 && i >= 0 && j >= 0 && i < nx && j < nz;
}

bool GuideGrid::blockedAt(double x, double z) const {
  if (!inside(x, z)) return false;
  const int i = (int)std::floor((x - minX) / cell), j = (int)std::floor((z - minZ) / cell);
  return blocked[(size_t)j * nx + i] != 0;
}

void guideObstacleBox(const CsoObstacle& o, double& cx, double& cz, double& hw, double& hd) {
  const double mid = (o.front + o.back) / 2;
  cx = o.x + o.n.x * mid;
  cz = o.z + o.n.z * mid;
  hw = o.w / 2 + 1.06;
  hd = (o.back - o.front) / 2 + 0.2;
}

namespace {
// Boîte orientée par ses axes (ux, uz) (demi-longueur hw) et (vx, vz) (demi-profondeur hd).
bool inBox(double px, double pz, double cx, double cz, double ux, double uz, double vx, double vz, double hw, double hd, double infl) {
  const double dx = px - cx, dz = pz - cz;
  const double a = dx * ux + dz * uz, b = dx * vx + dz * vz;
  const double qa = std::max(0.0, std::abs(a) - hw), qb = std::max(0.0, std::abs(b) - hd);
  return std::hypot(qa, qb) <= infl;
}
}  // namespace

GuideGrid buildGuideGrid(const GuideBounds& b, const Colliders& cols, const std::vector<CsoObstacle>& obstacles, double inflate, double cell) {
  GuideGrid g;
  g.cell = cell;
  g.minX = b.minX;
  g.minZ = b.minZ;
  g.nx = std::max(0, (int)std::ceil((b.maxX - b.minX) / cell));
  g.nz = std::max(0, (int)std::ceil((b.maxZ - b.minZ) / cell));
  g.blocked.assign((size_t)g.nx * g.nz, 0);
  auto mark = [&](double cx, double cz, double reach, auto&& test) {
    const int i0 = std::max(0, (int)std::floor((cx - reach - g.minX) / cell)), i1 = std::min(g.nx - 1, (int)std::floor((cx + reach - g.minX) / cell));
    const int j0 = std::max(0, (int)std::floor((cz - reach - g.minZ) / cell)), j1 = std::min(g.nz - 1, (int)std::floor((cz + reach - g.minZ) / cell));
    for (int j = j0; j <= j1; j++)
      for (int i = i0; i <= i1; i++)
        if (test(g.minX + (i + 0.5) * cell, g.minZ + (j + 0.5) * cell)) g.blocked[(size_t)j * g.nx + i] = 1;
  };
  for (const Collider& c : cols.all()) {
    if (!c.enabled) continue;
    if (c.type == 'c') {
      mark(c.x, c.z, c.r + inflate, [&](double px, double pz) { return std::hypot(px - c.x, pz - c.z) <= c.r + inflate; });
    } else {
      // Repère local de Colliders::resolve : lx = dx·c − dz·s, lz = dx·s + dz·c.
      mark(c.x, c.z, std::hypot(c.hw, c.hd) + inflate, [&](double px, double pz) { return inBox(px, pz, c.x, c.z, c.c, -c.s, c.s, c.c, c.hw, c.hd, inflate); });
    }
  }
  for (const CsoObstacle& o : obstacles) {
    if (o.off) continue;
    double cx, cz, hw, hd;
    guideObstacleBox(o, cx, cz, hw, hd);
    mark(cx, cz, std::hypot(hw, hd) + inflate, [&](double px, double pz) { return inBox(px, pz, cx, cz, o.t.x, o.t.z, o.n.x, o.n.z, hw, hd, inflate); });
  }
  return g;
}

bool guideClear(const GuideGrid& g, double x0, double z0, double x1, double z1) {
  const double len = std::hypot(x1 - x0, z1 - z0);
  const int n = std::max(1, (int)std::ceil(len / (g.cell * 0.1)));
  // Départ dans une zone bloquée (cavalier contre une aile, réception d'un saut) : cette zone de départ est ignorée,
  // seule compte la traversée d'une zone bloquée après en être sorti.
  bool left = !g.blockedAt(x0, z0);
  for (int k = 0; k <= n; k++) {
    const double t = (double)k / n;
    const bool b = g.blockedAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
    if (!b) left = true;
    else if (left) return false;
  }
  return true;
}

bool guideAim(const GuideGrid& g, double mx, double mz, double gx, double gz, double& ax, double& az, double lookahead, double* pathLength) {
  ax = gx;
  az = gz;
  if (pathLength) *pathLength = std::hypot(gx - mx, gz - mz);
  if (!g.inside(mx, mz) || !g.inside(gx, gz)) return false;
  if (guideClear(g, mx, mz, gx, gz)) return true;  // ligne directe libre : le but
  const int nx = g.nx, nz = g.nz;
  auto idx = [&](int i, int j) { return j * nx + i; };
  auto cellOf = [&](double x, double z, int& i, int& j) {
    i = std::clamp((int)std::floor((x - g.minX) / g.cell), 0, nx - 1);
    j = std::clamp((int)std::floor((z - g.minZ) / g.cell), 0, nz - 1);
  };
  // Case libre la plus proche (cavalier contre une aile, but tout près d'une barre) : recherche en anneaux.
  auto nearestFree = [&](int& i, int& j) {
    if (!g.blocked[(size_t)idx(i, j)]) return true;
    for (int r = 1; r < 8; r++)
      for (int dj = -r; dj <= r; dj++)
        for (int di = -r; di <= r; di++) {
          if (std::max(std::abs(di), std::abs(dj)) != r) continue;
          const int a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= nx || b >= nz || g.blocked[(size_t)idx(a, b)]) continue;
          i = a;
          j = b;
          return true;
        }
    return false;
  };
  int si, sj, ti, tj;
  cellOf(mx, mz, si, sj);
  cellOf(gx, gz, ti, tj);
  if (!nearestFree(si, sj) || !nearestFree(ti, tj)) return false;
  const int N = nx * nz, S = idx(si, sj), T = idx(ti, tj);
  std::vector<double> cost(N, std::numeric_limits<double>::infinity());
  std::vector<int> from(N, -1);
  using Item = std::pair<double, int>;
  std::priority_queue<Item, std::vector<Item>, std::greater<Item>> open;
  auto h = [&](int k) { return std::hypot((double)(k % nx - ti), (double)(k / nx - tj)); };
  cost[S] = 0;
  open.push({h(S), S});
  static const int DI[8] = {1, -1, 0, 0, 1, 1, -1, -1}, DJ[8] = {0, 0, 1, -1, 1, -1, 1, -1};
  bool found = false;
  while (!open.empty()) {
    const auto [f, k] = open.top();
    open.pop();
    if (k == T) { found = true; break; }
    if (f - h(k) > cost[k] + 1e-9) continue;
    const int i = k % nx, j = k / nx;
    for (int d = 0; d < 8; d++) {
      const int a = i + DI[d], b = j + DJ[d];
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const int q = idx(a, b);
      if (g.blocked[(size_t)q]) continue;
      // Diagonale : les deux cases d'angle doivent être libres (pas de coin coupé contre une aile).
      if (d >= 4 && (g.blocked[(size_t)idx(a, j)] || g.blocked[(size_t)idx(i, b)])) continue;
      const double c = cost[k] + (d >= 4 ? std::sqrt(2.0) : 1.0);
      if (c < cost[q]) {
        cost[q] = c;
        from[q] = k;
        open.push({c + h(q), q});
      }
    }
  }
  if (!found) return false;
  std::vector<int> path;
  for (int k = T; k != -1; k = from[k]) path.push_back(k);
  std::reverse(path.begin(), path.end());
  if (pathLength) *pathLength = cost[T] * g.cell;
  // Point le plus loin du chemin vu en ligne droite, à moins de lookahead m (le premier point du chemin à défaut).
  auto px = [&](int k) { return g.minX + (k % nx + 0.5) * g.cell; };
  auto pz = [&](int k) { return g.minZ + (k / nx + 0.5) * g.cell; };
  int best = path.size() > 1 ? 1 : 0;
  for (size_t m = 1; m < path.size(); m++) {
    const double x = px(path[m]), z = pz(path[m]);
    if (std::hypot(x - mx, z - mz) > lookahead) break;
    if (guideClear(g, mx, mz, x, z)) best = (int)m;
  }
  // Dernière case du chemin = case du but : le but exact.
  if (best == (int)path.size() - 1) return true;
  ax = px(path[best]);
  az = pz(path[best]);
  return true;
}

const char* guideModeName(GuideMode m) {
  switch (m) {
    case GuideMode::Pursue: return "axe";
    case GuideMode::Center: return "centre";
    case GuideMode::Approach: return "abord";
    case GuideMode::RideOut: return "sortie";
  }
  return "";
}

GuideMode guideAxisTarget(const GuideAxis& a, double mx, double mz, double fx, double fz, double speed, double& tx, double& tz, bool& usePath) {
  const double s = (mx - a.x) * a.nx + (mz - a.z) * a.nz, u = (mx - a.x) * a.tx + (mz - a.z) * a.tz;
  const double facing = fx * a.nx + fz * a.nz;
  const bool corridor = s < a.front && s > a.front - 16 && std::abs(u) < a.halfW + 6;
  usePath = false;
  // Derniers mètres avant la face et passage au-dessus (jusqu'à 6 m après elle) : le centre si le cheval y va, lancé ;
  // arrêté (refus) ou détourné : sortir pour revenir (plus de « demi-tour » affiché pendant le saut).
  if (s > a.front - 3 && s < a.front + 6 && std::abs(u) < a.halfW + 2 && facing > 0.3 && speed >= 2.5) {
    tx = a.x;
    tz = a.z;
    return GuideMode::Center;
  }
  if (corridor && facing > -0.2) {
    if (s <= a.front - 3) {
      const double sa = std::min(a.front - 0.5, s + 7);
      tx = a.x + a.nx * sa;
      tz = a.z + a.nz * sa;
      return GuideMode::Pursue;
    }
  }
  if (corridor || (s >= a.front && s < a.front + 1 && std::abs(u) < a.halfW + 6)) {
    // Dos à l'obstacle (ou arrêté tout contre) : sortie à 18 m, décalée de 4 m du côté où se trouve déjà le cavalier.
    const double side = u >= 0 ? 1 : -1;
    tx = a.x + a.nx * (a.front - 18) + a.tx * side * 4;
    tz = a.z + a.nz * (a.front - 18) + a.tz * side * 4;
    usePath = true;
    return GuideMode::RideOut;
  }
  tx = a.x + a.nx * (a.front - a.approach);
  tz = a.z + a.nz * (a.front - a.approach);
  usePath = true;
  return GuideMode::Approach;
}

}  // namespace strides
