// Contacts des membres visibles avec les barres : voir StridesCore/LimbContact.h.
#include "StridesCore/LimbContact.h"

#include <algorithm>
#include <cmath>

namespace strides::limb {

const Params& defaults() {
  static const Params P;
  return P;
}

const std::array<std::array<const char*, 3>, 4>& limbBones() {
  static const std::array<std::array<const char*, 3>, 4> B = {{
      {"hand_l", "fingers_01_l", "fingers_end_l"},
      {"hand_r", "fingers_01_r", "fingers_end_r"},
      {"foot_l", "toes_01_l", "toes_end_l"},
      {"foot_r", "toes_01_r", "toes_end_r"},
  }};
  return B;
}

const std::array<const char*, 4>& limbKeys() {
  static const std::array<const char*, 4> K = {"AG", "AD", "PG", "PD"};
  return K;
}

// limbContact.js toLocal.
P3 toLocal(const CsoObstacle& o, double ground, double x, double y, double z) {
  const double dx = x - o.x, dz = z - o.z;
  return P3{dx * o.n.x + dz * o.n.z, dx * o.t.x + dz * o.t.z, y - ground};
}

// limbContact.js segAxis.
SegAxis segAxis(const P3& a, const P3& b, double barS, double barH) {
  const double ds = b.s - a.s, dy = b.y - a.y;
  const double L2 = ds * ds + dy * dy;
  double k = L2 > 1e-12 ? ((barS - a.s) * ds + (barH - a.y) * dy) / L2 : 0;
  k = std::max(0.0, std::min(1.0, k));
  const double s = a.s + ds * k, y = a.y + dy * k, u = a.u + (b.u - a.u) * k;
  return SegAxis{std::hypot(s - barS, y - barH), u, k};
}

// limbContact.js capsuleRail.
Contact capsuleRail(const P3& a, const P3& b, double r, double barS, double barH, double halfW, const Params& P) {
  const SegAxis q = segAxis(a, b, barS, barH);
  Contact c;
  if (std::abs(q.u) > halfW + r) return c;
  c.valid = true;
  c.depth = r + P.railR - q.dist;
  c.dist = q.dist;
  c.u = q.u;
  return c;
}

// limbContact.js sweepRail.
Contact sweepRail(const P3& a0, const P3& b0, const P3& a1, const P3& b1, double r, double barS, double barH, double halfW,
                  int steps, const Params& P) {
  Contact best;
  for (int i = 1; i <= steps; i++) {
    const double t = (double)i / steps;
    const P3 a{a0.s + (a1.s - a0.s) * t, a0.u + (a1.u - a0.u) * t, a0.y + (a1.y - a0.y) * t};
    const P3 b{b0.s + (b1.s - b0.s) * t, b0.u + (b1.u - b0.u) * t, b0.y + (b1.y - b0.y) * t};
    const Contact c = capsuleRail(a, b, r, barS, barH, halfW, P);
    if (c.valid && c.depth > 0 && (!best.valid || c.depth > best.depth)) {
      best = c;
      best.t = t;
    }
  }
  return best;
}

// pjlHorse.js _limbContacts : `judging`.
bool judgingNow(const CsoHorseState& s, const std::vector<CsoObstacle>& obstacles, bool playerHorse, double time, const Params& P) {
  if (!playerHorse || !s.hasLastJump || s.lastJumpObstacle < 0 || s.lastJumpObstacle >= (int)obstacles.size()) return false;
  if (obstacles[s.lastJumpObstacle].off) return false;
  return s.jumpT >= 0 || (s.lastLanded && time - s.lastLandTime < P.window);
}

// pjlHorse.js _limbContacts : obstacle jugé, ou visé à l'abord (pose gardée).
Choice choose(const CsoHorseState& s, const std::vector<CsoObstacle>& obstacles, bool playerHorse, double time,
              const CsoTarget* target, const Params& P) {
  Choice c;
  c.judging = judgingNow(s, obstacles, playerHorse, time, P);
  if (c.judging) {
    c.obstacle = s.lastJumpObstacle;
    return c;
  }
  if (playerHorse && target && target->index >= 0 && !target->geo.rails.empty() && target->geo.rails[0].x < P.preRoll)
    c.obstacle = target->index;
  return c;
}

std::vector<Hit> step(State& st, const Choice& choice, const Pose& pose, double time, const CsoObstacle* o,
                      const CsoFenceState* fence, const std::function<void(const Hit&)>& onHit, const Params& P) {
  std::vector<Hit> hits;
  if (choice.obstacle < 0 || !o) {
    st.has = false;
    return hits;
  }
  const State prev = st;
  st.has = true;
  st.obstacle = choice.obstacle;
  st.time = time;
  st.pose = pose;
  if (!choice.judging || !prev.has || prev.obstacle != choice.obstacle || time - prev.time > P.maxGap) return hits;
  static const int seg[2][2] = {{0, 1}, {1, 2}};
  for (size_t bi = 0; bi < o->bars.size(); bi++) {
    // Barre sans maillage (obstacle sans barre mobile) ou déjà en chute : ignorée.
    if (!fence || bi >= fence->rails.size() || fence->rails[bi].falling) continue;
    const Bar& bar = o->bars[bi];
    bool has = false;
    Hit best;
    for (int i = 0; i < 4; i++) {
      for (int k = 0; k < 2; k++) {
        const double r = k == 0 ? P.rCanon : P.rHoof;
        const Contact c = sweepRail(prev.pose[i][seg[k][0]], prev.pose[i][seg[k][1]], pose[i][seg[k][0]], pose[i][seg[k][1]], r, bar.s,
                                    bar.h, o->w / 2, P.steps, P);
        if (c.valid && c.depth > P.tol && (!has || c.depth > best.depth)) {
          has = true;
          best = Hit{(int)bi, c.depth, c.u, c.t, i, i >= 2};
        }
      }
    }
    if (has) {
      hits.push_back(best);
      if (onHit) onHit(best);
    }
  }
  return hits;
}

CsoLimbHit toFenceHit(const Hit& h, int obstacle) {
  CsoLimbHit f;
  f.obstacle = obstacle;
  f.bar = h.bar;
  f.depth = h.depth;
  f.u = h.u;
  f.hind = h.hind;
  return f;
}

}  // namespace strides::limb
