// Portage ligne à ligne de src/gameplay/jumpModel.js (voir JumpModel.h). Toute divergence avec le JS est un défaut :
// les tests rejouent les oracles exportés du JS (unreal/core/tests/oracles/jump.json).
#include "StridesCore/JumpModel.h"
#include "StridesCore/MathUtil.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace strides {

const JumpParams& jumpDefaults() {
  static const JumpParams P;
  return P;
}

double speedFactor(double v) { return (0.72 + 0.28 * smoothstep(3.5, 6.5, v)) * (1 - 0.16 * smoothstep(9, 12, v)); }
double angleFactor(double cosA) { return 1 - 0.6 * (1 - cosA); }
double arcY(double H, double L, double x) { return (x <= 0 || x >= L) ? 0 : (4 * H * x * (L - x)) / (L * L); }

static bool isCsoKind(const std::string& k) { return k.empty() || k == "v" || k == "o" || k == "w"; }

FenceGeo railsAhead(const Fence& f, double px, double pz, double fx, double fz) {
  FenceGeo g;
  const double cosN = fx * f.n.x + fz * f.n.z;
  g.sign = cosN >= 0 ? 1 : -1;
  g.cosA = std::abs(cosN);
  const double sP = (px - f.pos.x) * f.n.x + (pz - f.pos.z) * f.n.z;
  const double uP = (px - f.pos.x) * f.t.x + (pz - f.pos.z) * f.t.z;
  const double fu = fx * f.t.x + fz * f.t.z;
  for (const Bar& r : f.bars) {
    RailAhead a;
    a.s = r.s;
    a.h = r.h;
    a.x = g.cosA > 1e-3 ? (g.sign * r.s - g.sign * sP) / g.cosA : std::numeric_limits<double>::infinity();
    a.u = uP + fu * a.x;
    g.rails.push_back(a);
  }
  std::stable_sort(g.rails.begin(), g.rails.end(), [](const RailAhead& a, const RailAhead& b) { return a.x < b.x; });
  g.kind = f.kind;
  g.valid = true;
  return g;
}

namespace {
struct Shape { double H, L0, Hcap; };
Shape shape(const JumpHorse& horse, double v, double cosA, const std::vector<RailAhead>& rails, bool cso, const JumpParams& P) {
  const double Hcap = horse.power * speedFactor(v) * angleFactor(cosA);
  if (!cso || rails.empty()) return {Hcap, std::max(1.5, v * P.T), Hcap};
  double top = -std::numeric_limits<double>::infinity();
  for (const auto& r : rails) top = std::max(top, r.h);
  const double spread = rails.back().x - rails.front().x;
  const double want = top + P.clear + P.spreadK * spread - P.lift;
  const double H = std::min(Hcap, want);
  const double T = clampd(P.T0 + P.Tk * H, P.Tmin, P.Tmax);
  return {H, std::max(1.5, v * T), Hcap};
}
double minMargin(const std::vector<RailAhead>& rails, double H, double L, double lift) {
  double m = std::numeric_limits<double>::infinity();
  for (const auto& r : rails) m = std::min(m, arcY(H, L, r.x) + lift - r.h);
  return m;
}
}  // namespace

JumpPlan planJump(const JumpHorse& horse, const FenceGeo* geo, const JumpParams& P) {
  JumpPlan out;
  const double v = horse.v;
  const double cosA = geo ? geo->cosA : 1;
  const bool cso = horse.cso && isCsoKind(geo ? geo->kind : std::string());
  static const std::vector<RailAhead> none;
  const auto& rails = geo ? geo->rails : none;
  const Shape base = shape(horse, v, cosA, rails, cso, P);
  out.L0 = base.L0;
  if (!geo || rails.empty() || cosA < P.maxAngle) {
    out.L = base.L0;
    out.H = base.H;
    out.hasMargin = false;
    out.zone = Zone::None;
    return out;
  }
  const double first = rails.front().x, last = rails.back().x;
  const double ideal = first + last;
  const double shortK = cso ? P.shorten : P.shortenXc, adaptK = cso ? P.adapt : P.adaptXc;
  const double L = clampd(ideal, base.L0 * (1 - shortK), base.L0 * (1 + adaptK));
  const double dev = L / base.L0 - 1;
  const double H = base.H * (1 - 1.5 * dev * dev);
  const double lift = P.lift + horse.clearance;
  for (const auto& r : rails) out.margins.push_back(arcY(H, L, r.x) + lift - r.h);
  const double margin = *std::min_element(out.margins.begin(), out.margins.end());
  const bool farSide = cso ? ideal > base.L0 : ideal > L;
  Zone zone;
  if (first < P.minFront) zone = Zone::Refuse;
  else if (margin >= P.good) zone = Zone::Good;
  else zone = farSide ? Zone::Far : Zone::Near;
  Cause cause = Cause::None;
  if (zone == Zone::Refuse) cause = Cause::TooClose;
  else if (margin < -P.rub && !cso) {
    const double Hok = horse.power * speedFactor(clampd(v, 6.5, 9)) * (1 - 1.5 * dev * dev);
    const double straight = minMargin(rails, Hok, L, lift);
    if (straight >= -P.rub) cause = cosA < 0.92 ? Cause::Angle : v < 6.5 ? Cause::Slow : Cause::Fast;
    else cause = ideal > L ? Cause::Far : Cause::Near;
  } else if (margin < -P.rub) {
    auto passesWith = [&](double vv, double cc) {
      const Shape b = shape(horse, vv, cc, rails, cso, P);
      const double LL = clampd(ideal, b.L0 * (1 - shortK), b.L0 * (1 + adaptK));
      const double dd = LL / b.L0 - 1;
      const double HH = b.H * (1 - 1.5 * dd * dd);
      return minMargin(rails, HH, LL, lift) >= -P.rub;
    };
    if (cosA < 0.94 && passesWith(v, 1)) cause = Cause::Angle;
    else if (speedFactor(v) < 0.97 && passesWith(std::max(v, 6.5), cosA)) cause = Cause::Slow;
    else cause = farSide ? Cause::Far : Cause::Near;
  }
  out.L = L;
  out.H = H;
  out.margin = margin;
  out.hasMargin = true;
  out.zone = zone;
  out.cause = cause;
  out.ideal = ideal;
  out.cosA = cosA;
  out.dev = dev;
  out.cso = cso;
  return out;
}

Quality takeoffQuality(const JumpPlan& p) {
  if (p.zone == Zone::None) return Quality::None;
  switch (p.cause) {
    case Cause::TooClose: return Quality::TooClose;
    case Cause::Far: return Quality::Far;
    case Cause::Near: return Quality::Near;
    case Cause::Angle: return Quality::Angle;
    case Cause::Slow: return Quality::Slow;
    case Cause::Fast: return Quality::Fast;
    case Cause::None: break;
  }
  if (p.zone == Zone::Good) return std::abs(p.dev) < 0.03 ? Quality::Perfect : Quality::Good;
  return p.ideal > p.L0 ? Quality::BitFar : Quality::BitNear;
}

const char* zoneName(Zone z) {
  switch (z) {
    case Zone::Good: return "good";
    case Zone::Far: return "far";
    case Zone::Near: return "near";
    case Zone::Refuse: return "refuse";
    default: return "none";
  }
}
const char* causeName(Cause c) {
  switch (c) {
    case Cause::TooClose: return "tooClose";
    case Cause::Far: return "far";
    case Cause::Near: return "near";
    case Cause::Angle: return "angle";
    case Cause::Slow: return "slow";
    case Cause::Fast: return "fast";
    default: return "";
  }
}
const char* qualityName(Quality q) {
  switch (q) {
    case Quality::Perfect: return "perfect";
    case Quality::Good: return "good";
    case Quality::BitFar: return "bitFar";
    case Quality::BitNear: return "bitNear";
    case Quality::Far: return "far";
    case Quality::Near: return "near";
    case Quality::Angle: return "angle";
    case Quality::Slow: return "slow";
    case Quality::TooClose: return "tooClose";
    case Quality::Fast: return "fast";
    default: return "";
  }
}

}  // namespace strides
