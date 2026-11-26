// Portage de src/world/colliders.js, world.js (fence, rectFence), obstacles.js (ailes) et horse.js:344-360. Voir Colliders.h.
#include "StridesCore/Colliders.h"

#include <algorithm>
#include <cmath>

namespace strides {
namespace {
double sgn(double v) { return v > 0 ? 1.0 : v < 0 ? -1.0 : 0.0; }
}  // namespace

int Colliders::addCircle(double x, double z, double r, double top, const std::string& tag) {
  Collider c;
  c.type = 'c';
  c.x = x;
  c.z = z;
  c.r = r;
  c.top = top;
  c.tag = tag;
  list_.push_back(c);
  return (int)list_.size() - 1;
}

int Colliders::addBox(double x, double z, double hw, double hd, double rot, double top, const std::string& tag) {
  Collider c;
  c.type = 'b';
  c.x = x;
  c.z = z;
  c.hw = hw;
  c.hd = hd;
  c.rot = rot;
  c.c = std::cos(rot);
  c.s = std::sin(rot);
  c.top = top;
  c.tag = tag;
  list_.push_back(c);
  return (int)list_.size() - 1;
}

int Colliders::addSegment(double x1, double z1, double x2, double z2, double thick, double top, const std::string& tag) {
  const double x = (x1 + x2) / 2, z = (z1 + z2) / 2;
  const double len = std::hypot(x2 - x1, z2 - z1);
  const double rot = std::atan2(x2 - x1, z2 - z1);
  return addBox(x, z, thick / 2, len / 2, rot, top, tag);
}

void Colliders::removeTag(const std::string& tag) {
  list_.erase(std::remove_if(list_.begin(), list_.end(), [&](const Collider& c) { return c.tag == tag; }), list_.end());
}

ColliderHit Colliders::resolve(double& px, double& pz, double r, double feetY, const std::string& ignoreTag) const {
  ColliderHit hit;
  for (size_t i = 0; i < list_.size(); i++) {
    const Collider& col = list_[i];
    if (!col.enabled) continue;
    // Tri rapide (le web passe par sa grille) : hors de portée, aucune poussée possible.
    const double bound = col.type == 'c' ? col.r : std::hypot(col.hw, col.hd);
    if (std::abs(px - col.x) > r + bound || std::abs(pz - col.z) > r + bound) continue;
    if (feetY > col.top - 0.05) continue;
    if (!ignoreTag.empty() && col.tag == ignoreTag) continue;
    if (col.type == 'c') {
      const double dx = px - col.x, dz = pz - col.z;
      const double d = std::hypot(dx, dz);
      const double mn = r + col.r;
      if (d < mn) {
        const double nx = d > 1e-5 ? dx / d : 1, nz = d > 1e-5 ? dz / d : 0;
        px = col.x + nx * mn;
        pz = col.z + nz * mn;
        hit = ColliderHit{true, (int)i, nx, nz};
      }
    } else {
      // Repère local de la boîte (rotation autour de Y).
      const double dx = px - col.x, dz = pz - col.z;
      const double lx = dx * col.c - dz * col.s;
      const double lz = dx * col.s + dz * col.c;
      const double cx = std::max(-col.hw, std::min(col.hw, lx));
      const double cz = std::max(-col.hd, std::min(col.hd, lz));
      double ox = lx - cx, oz = lz - cz;
      const double d = std::hypot(ox, oz);
      if (d < 1e-5) {
        // Centre à l'intérieur : sortir par le côté le plus proche.
        const double qx = col.hw - std::abs(lx), qz = col.hd - std::abs(lz);
        double nlx, nlz;
        if (qx < qz) {
          nlx = sgn(lx) != 0 ? sgn(lx) : 1;
          nlz = 0;
          ox = nlx * (qx + r);
          oz = 0;
        } else {
          nlx = 0;
          nlz = sgn(lz) != 0 ? sgn(lz) : 1;
          ox = 0;
          oz = nlz * (qz + r);
        }
        px += ox * col.c + oz * col.s;
        pz += -ox * col.s + oz * col.c;
        hit = ColliderHit{true, (int)i, nlx * col.c + nlz * col.s, -nlx * col.s + nlz * col.c};
      } else if (d < r) {
        const double nlx = ox / d, nlz = oz / d;
        const double push = r - d;
        px += (nlx * col.c + nlz * col.s) * push;
        pz += (-nlx * col.s + nlz * col.c) * push;
        hit = ColliderHit{true, (int)i, nlx * col.c + nlz * col.s, -nlx * col.s + nlz * col.c};
      }
    }
  }
  return hit;
}

bool Colliders::blocked(double x, double z, double y) const {
  for (const Collider& col : list_) {
    if (!col.enabled || y > col.top) continue;
    if (col.type == 'c') {
      if (std::hypot(x - col.x, z - col.z) < col.r) return true;
    } else {
      const double dx = x - col.x, dz = z - col.z;
      const double lx = dx * col.c - dz * col.s, lz = dx * col.s + dz * col.c;
      if (std::abs(lx) < col.hw && std::abs(lz) < col.hd) return true;
    }
  }
  return false;
}

void addFence(Colliders& C, const std::vector<std::pair<double, double>>& points, bool closed, double height, bool solid, const std::string& tag,
              const std::function<double(double, double)>& ground) {
  std::vector<std::pair<double, double>> pts = points;
  if (closed && !points.empty()) pts.push_back(points[0]);
  for (size_t i = 0; i + 1 < pts.size(); i++) {
    const double ax = pts[i].first, az = pts[i].second, bx = pts[i + 1].first, bz = pts[i + 1].second;
    const double top = std::max({ground(ax, az), ground(bx, bz), ground((ax + bx) / 2, (az + bz) / 2)}) + height;
    C.addSegment(ax, az, bx, bz, 0.35, solid ? std::numeric_limits<double>::infinity() : top, tag.empty() ? "fence" : tag);
  }
}

std::vector<std::pair<double, double>> rectFencePoints(double x, double z, double w, double d, char gapSide, double gap, double gapPos) {
  const double x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
  const double gx = x0 + w * gapPos, gz = z0 + d * gapPos;
  switch (gapSide) {
    case 'n': return {{gx - gap / 2, z0}, {x0, z0}, {x0, z1}, {x1, z1}, {x1, z0}, {gx + gap / 2, z0}};
    case 's': return {{gx + gap / 2, z1}, {x1, z1}, {x1, z0}, {x0, z0}, {x0, z1}, {gx - gap / 2, z1}};
    case 'e': return {{x1, gz - gap / 2}, {x1, z0}, {x0, z0}, {x0, z1}, {x1, z1}, {x1, gz + gap / 2}};
    case 'w': return {{x0, gz + gap / 2}, {x0, z1}, {x1, z1}, {x1, z0}, {x0, z0}, {x0, gz - gap / 2}};
    default: return {{x0, z0}, {x1, z0}, {x1, z1}, {x0, z1}, {x0, z0}};
  }
}

int addObstacleWings(Colliders& C, const std::string& kind, double x, double z, double rot, double w, double h, double spread, double ground,
                     const std::string& tag) {
  if (kind != "v" && kind != "o") return 0;
  if (kind == "o" && !spread) spread = 1.2;
  const double tx = std::cos(rot), tz = -std::sin(rot);
  const double u0 = w / 2 + 0.5, u1 = w / 2 + 1.06;
  for (const double side : {-1.0, 1.0}) {
    const double u = side * (u0 + u1) / 2;
    C.addBox(x + tx * u, z + tz * u, (u1 - u0) / 2, spread / 2 + 0.12, rot, ground + h + 0.75, tag);
  }
  return 2;
}

HorseCollideOut horseCollide(const Colliders& C, double& x, double& z, double& speed, double& lastBump, const HorseCollideInput& in) {
  HorseCollideOut out;
  // Un cheval immobilisé (placé par la mission) n'est pas repoussé.
  if (in.frozen) return out;
  const double fx = std::sin(in.heading), fz = std::cos(in.heading);
  // Collision : centre un peu vers l'avant (le cheval est long).
  const double cx = x + fx * 0.45, cz = z + fz * 0.45;
  double qx = cx, qz = cz;
  const double feet = in.groundNow + in.jumpY + (in.jumpT >= 0 ? 0.2 + in.clearance : 0);
  const ColliderHit h = C.resolve(qx, qz, in.radius, feet);
  if (!h.hit) return out;
  out.hit = true;
  out.index = h.index;
  x += qx - cx;
  z += qz - cz;
  const double into = -(fx * h.nx + fz * h.nz);
  if (into > 0.5 && speed > 5 && in.time - lastBump > 0.6) {
    lastBump = in.time;
    out.bump = true;
  }
  speed *= 1 - std::clamp(into, 0.0, 1.0) * std::min(1.0, in.dt * 12);
  return out;
}

}  // namespace strides
