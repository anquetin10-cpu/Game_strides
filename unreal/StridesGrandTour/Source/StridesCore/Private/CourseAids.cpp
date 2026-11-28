// Portage ligne à ligne de src/gameplay/courseAids.js (voir CourseAids.h). Chaque bloc cite sa source JS ; toute
// divergence est un défaut : les tests rejouent cso_takeoff_zone.json et le canal « ai » de cso_runs/.
#include "StridesCore/CourseAids.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace strides {

const CsoAidsParams& csoAidsDefaults() {
  static const CsoAidsParams A;
  return A;
}

// courseAids.js:25-34.
CsoTakeoffZone csoTakeoffZone(const CsoObstacle& o, double speed, double power, double clearance, const JumpParams& J,
                              const CsoAidsParams& A) {
  JumpHorse st;
  st.v = std::max(speed, A.zoneMinSpeed);
  st.power = power;
  st.clearance = clearance;
  st.cso = true;
  CsoTakeoffZone z;
  const Fence f = o.fence();
  for (double d = A.zoneFrom; d >= 0; d -= A.zoneStep) {
    const FenceGeo geo = railsAhead(f, o.x - o.n.x * d, o.z - o.n.z * d, o.n.x, o.n.z);
    const JumpPlan p = planJump(st, &geo, J);
    // Plan sans barre (margin: Infinity du web) : la marge passe toujours le seuil.
    const double margin = p.hasMargin ? p.margin : std::numeric_limits<double>::infinity();
    if (margin >= -J.rub && p.zone != Zone::Refuse) {
      if (z.hasPass) {
        z.pass[0] = std::min(z.pass[0], d);
        z.pass[1] = std::max(z.pass[1], d);
      } else {
        z.hasPass = true;
        z.pass[0] = z.pass[1] = d;
      }
    }
    if (p.zone == Zone::Good) {
      if (z.hasGood) {
        z.good[0] = std::min(z.good[0], d);
        z.good[1] = std::max(z.good[1], d);
      } else {
        z.hasGood = true;
        z.good[0] = z.good[1] = d;
      }
    }
  }
  return z;
}

// _marks (courseAids.js:80-92).
std::vector<CsoLineMark> csoLineMarks(const std::vector<TracePoint>& pts, const CsoAidsParams& A) {
  std::vector<CsoLineMark> out;
  double next = A.firstMark;
  for (size_t i = 0; i + 1 < pts.size(); i++) {
    const TracePoint& p = pts[i];
    if (p.s < next) continue;
    next = p.s + A.every;
    const double fx = std::sin(p.h), fz = std::cos(p.h), tx = fz, tz = -fx;
    const double l = A.dash / 2, w = A.width / 2;
    CsoLineMark m;
    m.s = p.s;
    m.c[0][0] = p.x - fx * l - tx * w;
    m.c[0][1] = p.z - fz * l - tz * w;
    m.c[1][0] = p.x - fx * l + tx * w;
    m.c[1][1] = p.z - fz * l + tz * w;
    m.c[2][0] = p.x + fx * l + tx * w;
    m.c[2][1] = p.z + fz * l + tz * w;
    m.c[3][0] = p.x + fx * l - tx * w;
    m.c[3][1] = p.z + fz * l - tz * w;
    out.push_back(m);
  }
  return out;
}

// _range (courseAids.js:95-101).
void csoMarkRange(const std::vector<CsoLineMark>& marks, double s0, double s1, int& first, int& count) {
  const int n = (int)marks.size();
  int a = -1, b = -1;
  for (int i = 0; i < n; i++)
    if (marks[(size_t)i].s >= s0) { a = i; break; }
  for (int i = 0; i < n; i++)
    if (marks[(size_t)i].s > s1) { b = i; break; }
  if (a < 0) a = n;
  if (b < 0) b = n;
  first = a;
  count = std::max(0, b - a);
}

// courses.js:187 (parcours) et :458 (entrée en piste), hud.js:374 (game.course absent).
Zone csoJumpTiming(bool course, bool pre, const std::string& aid, Zone timing) {
  if (!course || pre) return Zone::None;
  return aid == "off" ? Zone::None : timing;
}

CsoCourseAids::CsoCourseAids(std::vector<TracePoint> line, const CsoAidsParams& A, const JumpParams& J)
    : A_(A), J_(J), line_(std::move(line)) {
  if (!line_.empty()) marks_ = csoLineMarks(line_, A_);
}

// place (courseAids.js:154-163) : les distances du modèle sont celles du point d'appel (épaules), la bande est posée
// sous les antérieurs.
void CsoCourseAids::placeBand(CsoAidsBand& m, bool has, const double r[2], const CsoAidsFence& next,
                              const std::function<double(double, double)>& groundAt) {
  if (!has) return;
  const double nearD = r[0] + A_.bandShift, farD = r[1] + A_.bandShift;
  const double mid = (nearD + farD) / 2, len = std::max(A_.bandMinLen, farD - nearD);
  const double x = next.ob.x - next.ob.n.x * mid, zz = next.ob.z - next.ob.n.z * mid;
  m.x = x;
  m.y = (groundAt ? groundAt(x, zz) : 0.0) + A_.bandLift;
  m.z = zz;
  m.rot = next.ob.rot;
  m.sx = std::min(next.ob.w, A_.bandMaxWidth);
  m.sz = len;
  m.visible = true;
}

// update (courseAids.js:104-167).
void CsoCourseAids::update(const CsoAidsInput& in, const std::function<double(double, double)>& groundAt) {
  const CsoAidsFence* next = in.next;
  // Tracé : depuis le cheval (ou l'obstacle précédent) jusqu'à quelques mètres après l'obstacle suivant.
  if (!line_.empty()) {
    const bool on = in.showLine && next;
    view_.lineVisible = on;
    if (on) {
      const double sF = next->hasLineS ? next->lineS : 1e9;
      const double s1 = sF + A_.after;
      double s0 = in.prevS;
      if (in.hasHorse) {
        double bd = 1e9;
        for (const TracePoint& p : line_) {
          if (p.s < in.prevS - A_.lineBack || p.s > s1) continue;
          const double dx = p.x - in.hx, dz = p.z - in.hz;
          const double d = dx * dx + dz * dz;
          if (d < bd) {
            bd = d;
            s0 = p.s;
          }
        }
        if (bd > A_.farFromLine * A_.farFromLine) s0 = in.prevS;  // loin du tracé (volte, départ) : tout le tronçon
        else s0 += A_.hideNear;                                    // pas de repère sous les sabots
        s0 = std::max(in.prevS, s0);
      }
      csoMarkRange(marks_, s0, sF, view_.lineFirst, view_.lineCount);
      csoMarkRange(marks_, std::max(s0, sF), s1, view_.afterFirst, view_.afterCount);
    }
  }
  // Repère au-dessus de l'obstacle suivant.
  view_.markVisible = next != nullptr;
  if (next) {
    view_.markX = next->ob.x;
    view_.markY = next->ground + next->ob.h + A_.markLift + std::sin(in.time * A_.markFreq) * A_.markAmp;
    view_.markZ = next->ob.z;
    view_.markRot = next->ob.rot;
  }
  // Zone d'appel (recalculée quatre fois par seconde : elle suit la vitesse du cheval).
  const bool zoneOn = in.showZone && next && in.hasHorse && in.riding;
  view_.good.visible = view_.ok.visible = false;
  if (!zoneOn) return;
  const double dist = std::hypot(next->ob.x - in.hx, next->ob.z - in.hz);
  if (dist > A_.zoneMaxDist) return;
  zoneT_ -= in.dt;
  if (zoneT_ <= 0 || zoneFor_ != next->id) {
    zoneT_ = A_.zoneEvery;
    zoneFor_ = next->id;
    zone_ = csoTakeoffZone(next->ob, in.speed, in.power, in.clearance, J_, A_);
    hasZone_ = true;
  }
  placeBand(view_.ok, zone_.hasPass, zone_.pass, *next, groundAt);
  placeBand(view_.good, zone_.hasGood, zone_.good, *next, groundAt);
  view_.good.y += A_.goodLift;  // (le web relève aussi la bande verte masquée)
}

}  // namespace strides
