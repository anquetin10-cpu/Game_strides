// Caméra de concours : portage ligne à ligne de src/entities/camera.js (_updateComp, 184-269). Voir CsoCamera.h.
#include "StridesCore/CsoCamera.h"

#include <algorithm>
#include <cmath>

#include "StridesCore/CsoHorse.h"
#include "StridesCore/MathUtil.h"

namespace strides {

const CsoCamParams& csoCamDefaults() {
  static const CsoCamParams P;
  return P;
}

namespace {
// src/core/math.js damp / angleDiff.
double damp(double a, double b, double lambda, double dt) { return a + (b - a) * (1 - std::exp(-lambda * dt)); }
double angleDiff(double from, double to) { return wrapAngle(to - from); }
}  // namespace

std::vector<CsoVec3> csoCamBoomSamples(double ax, double ay, double az, double cH, const CsoCamParams& C) {
  std::vector<CsoVec3> v;
  const double fx = std::sin(cH), fz = std::cos(cH);
  for (double q = 1.0; q <= C.back + 1e-6; q += 0.4) {
    CsoVec3 p;
    p.x = ax - fx * q;
    p.z = az - fz * q;
    p.y = ay + 2.2 + (C.up - 2.2) * (q / C.back);
    v.push_back(p);
  }
  return v;
}

CsoCamOut csoCamStep(CsoCamState& s, const CsoCamInput& in, const CsoCamParams& C) {
  const CsoCamHorse& h = in.horse;
  const double dt = in.dt;
  const bool instant = in.instant;
  CsoCamOut out;
  // camera.js:188-189 : cap visé = cap du cheval + vitesse de lacet × anticipation (lacet ignoré en vol).
  const double yawRate = h.jumpT >= 0 ? 0 : h.yawRate;
  const double want = h.heading + yawRate * C.lead;
  if (!s.active || instant) {
    // Entrée (camera.js:191-204) : on part de la caméra actuelle (cap vers le cheval), fondu vers le cadrage de concours.
    const double ch = std::atan2(h.x - s.eye.x, h.z - s.eye.z);
    s.active = true;
    s.cH = instant ? want : ch;
    s.w = 0;
    s.t = instant ? C.enter : 0;
    s.ax = h.x;
    s.az = h.z;
    s.ay = h.groundY;
    s.back = C.back;
    s.from = s.eye;
    s.fromLook = CsoVec3{h.x, h.groundY + 1.6, h.z};
    s.hasAim = false;
  }
  s.t += dt;
  // Lacet : vitesse angulaire bornée (rattrapage progressif), recentrage à toutes les vitesses (camera.js:206-210).
  const double d = angleDiff(s.cH, want);
  const double wWant = d * C.yawK + (instant ? 0 : yawRate);
  s.w += clampd(wWant - s.w, -C.yawAcc * dt, C.yawAcc * dt);
  s.cH = instant ? want : s.cH + s.w * dt;
  // Ancrage : le cheval, suivi en douceur, au sol plus qu'en l'air (camera.js:211-216).
  const double kp = instant ? 1 : 1 - std::exp(-C.posK * dt);
  s.ax += (h.x - s.ax) * kp;
  s.az += (h.z - s.az) * kp;
  const double ay = h.groundY + std::max(0.0, h.jumpY) * C.jumpFollow;
  s.ay += (ay - s.ay) * (instant ? 1 : 1 - std::exp(-C.yK * dt));
  const double fx = std::sin(s.cH), fz = std::cos(s.cH);
  // Perche (camera.js:218-229) : de la tête du cavalier vers l'arrière, sondée tous les 0,4 m ; obstacle sur le chemin :
  // la caméra se rapproche (jamais à moins de minBack) ; recul amorti, plus vite en rapprochement.
  double back = C.back;
  int k = 0;
  for (double q = 1.0; q <= C.back + 1e-6; q += 0.4, k++) {
    const double x = s.ax - fx * q, z = s.az - fz * q;
    const double y = s.ay + 2.2 + (C.up - 2.2) * (q / C.back);
    if (in.blocked && in.blocked(x, y, z)) {
      back = std::max(C.minBack, q - 0.45);
      out.probeHit = k;
      k++;
      break;
    }
  }
  out.probeCount = k;
  out.probeBack = back;
  s.back = instant ? back : damp(s.back, back, back < s.back ? 10 : 2.5, dt);
  const double cx = s.ax - fx * s.back, cz = s.az - fz * s.back;
  double cy = s.ay + C.up;
  // Obstacle survolé : la caméra passe au-dessus, jamais au travers (camera.js:232-238).
  if (in.fences)
    for (const CsoCamFence& o : *in.fences) {
      if (o.off || std::abs(o.x - cx) > 4 || std::abs(o.z - cz) > 4) continue;
      const double ls = (cx - o.x) * o.nx + (cz - o.z) * o.nz;
      const double lu = (cx - o.x) * o.tx + (cz - o.z) * o.tz;
      const double depth = o.depth != 0 && !std::isnan(o.depth) ? o.depth : 1;  // (o.depth || 1)
      if (std::abs(lu) < o.w / 2 + 2.4 && std::abs(ls) < depth / 2 + 0.8) cy = std::max(cy, o.ground + o.h + 0.75 + C.fenceClear);
    }
  // Au moins 0,8 m au-dessus du sol sous le cheval et sous la caméra (camera.js:239).
  const double gc = in.ground ? in.ground(cx, cz) : -INFINITY;
  cy = std::max(cy, std::max(h.groundY, gc) + 0.8);
  // Point visé : devant le cheval, légèrement attiré par l'obstacle suivant quand il est devant (camera.js:240-251).
  double lx = s.ax + fx * C.lookAhead, lz = s.az + fz * C.lookAhead;
  const double ly = s.ay + C.lookUp;
  if (in.hasNext) {
    const double dx = in.nextX - s.ax, dz = in.nextZ - s.az, dd = jsHypot(dx, dz);
    if (dd > 1 && dd < C.fenceRange && (dx * fx + dz * fz) / dd > 0.5) {
      const double kb = C.fenceBias * (1 - smoothstep(C.fenceRange * 0.6, C.fenceRange, dd));
      lx += (in.nextX - lx) * kb;
      lz += (in.nextZ - lz) * kb;
    }
  }
  // Point visé lissé e^(−4 dt) (camera.js:252-258).
  if (!s.hasAim || instant) {
    s.aim = CsoVec3{lx, ly, lz};
    s.hasAim = true;
  } else {
    const double ka = 1 - std::exp(-4 * dt);
    s.aim.x += (lx - s.aim.x) * ka;
    s.aim.y += (ly - s.aim.y) * ka;
    s.aim.z += (lz - s.aim.z) * ka;
  }
  // Fondu d'entrée depuis la caméra précédente (camera.js:259-263).
  const double e = smoothstep(0, C.enter, s.t);
  out.eye = CsoVec3{s.from.x + (cx - s.from.x) * e, s.from.y + (cy - s.from.y) * e, s.from.z + (cz - s.from.z) * e};
  out.look = CsoVec3{s.fromLook.x + (s.aim.x - s.fromLook.x) * e, s.fromLook.y + (s.aim.y - s.fromLook.y) * e,
                     s.fromLook.z + (s.aim.z - s.fromLook.z) * e};
  s.eye = out.eye;
  // FOV vertical : amorti vers 58° ; appliqué au rendu seulement quand l'écart dépasse 0,05° (camera.js:264-268).
  s.fov = instant ? C.fov : damp(s.fov, C.fov, 3, dt);
  if (std::abs(s.camFov - s.fov) > 0.05) s.camFov = s.fov;
  out.fov = s.camFov;
  return out;
}

}  // namespace strides
