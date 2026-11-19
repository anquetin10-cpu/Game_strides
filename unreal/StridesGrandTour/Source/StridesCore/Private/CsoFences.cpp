// Portage ligne à ligne de src/gameplay/obstacles.js (voir CsoFences.h). Chaque bloc cite sa source JS ; toute divergence
// est un défaut : les tests rejouent les scénarios exportés du jeu web en cours d'exécution (cso_runs.json, canal « ch »).
#include "StridesCore/CsoFences.h"
#include "StridesCore/MathUtil.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace strides {

const CsoFenceParams& csoFenceDefaults() {
  static const CsoFenceParams F;
  return F;
}

const char* csoFenceEventName(CsoFenceEventKind k) {
  switch (k) {
    case CsoFenceEventKind::Clear: return "obstacle:clear";
    case CsoFenceEventKind::Fault: return "obstacle:fault";
    case CsoFenceEventKind::Refusal: return "obstacle:refusal";
  }
  return "";
}

const char* csoFenceSoundName(CsoFenceSound s) {
  switch (s) {
    case CsoFenceSound::RailFall: return "railFall";
    case CsoFenceSound::RailTouch: return "railTouch";
    case CsoFenceSound::Thud: return "thud";
  }
  return "";
}

namespace {
constexpr double kInf = std::numeric_limits<double>::infinity();

// obstacles.js _localS : abscisse le long de l'axe de saut (s) et position le long des barres (u).
struct LocalS {
  double s = 0, u = 0;
};
LocalS localS(const CsoObstacle& o, double x, double z) {
  return {(x - o.x) * o.n.x + (z - o.z) * o.n.z, (x - o.x) * o.t.x + (z - o.z) * o.t.z};
}

// Math.sign(x) || 1.
double signOr1(double x) { return x > 0 ? 1 : x < 0 ? -1 : 1; }

CsoRail railAt(double y, double z) {
  CsoRail r;
  r.restY = r.y = y;
  r.restZ = r.z = z;
  return r;
}

// Plan du dernier saut s'il visait cet obstacle (lj && lj.o === o ? lj.plan : null).
const JumpPlan* lastPlanFor(const CsoHorseState& s, int oi) { return s.hasLastJump && s.lastJumpObstacle == oi ? &s.lastPlan : nullptr; }

// obstacles.js _finishPass.
void finishPass(CsoPass& p, CsoFenceOut& out) {
  if (p.done) return;
  p.done = true;
  CsoFenceEvent e;
  e.kind = p.fault ? CsoFenceEventKind::Fault : CsoFenceEventKind::Clear;
  e.obstacle = p.o;
  e.dir = p.dir;
  e.margin = p.margin;
  e.cause = p.cause;
  out.events.push_back(e);
}

CsoPass newPass(int oi, int dir) {
  CsoPass p;
  p.o = oi;
  p.dir = dir;
  p.margin = kInf;
  return p;
}

// obstacles.js _count : un refus n'est recompté que si le cheval s'est détourné, ou après 5 s.
void countRefusal(CsoHorseState& s, const std::vector<CsoObstacle>& obstacles, int oi, double time, CsoFenceOut& out) {
  const bool again = s.hasRefusal && s.refusal.o == oi && !s.refusal.away && time - s.refusal.t < 5;
  const double ls = localS(obstacles[oi], s.x, s.z).s;
  s.refusing = -1;
  s.hasRefusal = true;
  s.refusal = CsoRefusalMemo{oi, time, false};
  if (!again) {
    CsoFenceEvent e;
    e.kind = CsoFenceEventKind::Refusal;
    e.obstacle = oi;
    e.dir = ls < 0 ? 1 : -1;
    out.events.push_back(e);
  }
}

// obstacles.js _judge : chaque barre jugée quand les épaules passent son plan, à la hauteur de la trajectoire à cet
// instant (interpolée entre deux images) ; une faute par élément ; résultat à la sortie (ou différé, membres jugés).
void judge(CsoHorseState& s, const std::vector<CsoObstacle>& obstacles, std::vector<CsoFenceState>& states, int oi, const LocalS& a,
           const LocalS& b, bool inWidth, const CsoUpdateHorseInput& in, CsoFenceOut& out, const JumpParams& J) {
  if (a.s == b.s) return;
  const CsoObstacle& o = obstacles[oi];
  const int dir = b.s > a.s ? 1 : -1;
  if (!s.hasPass || s.pass.o != oi || s.pass.done) {
    const double entry = dir > 0 ? o.front : o.back;
    if (!((a.s - entry) * (b.s - entry) <= 0) || !inWidth) return;
    // Résultat précédent encore en attente (postérieurs) : annoncé avant d'aborder cet obstacle.
    if (s.hasPass && !s.pass.done) finishPass(s.pass, out);
    s.hasPass = true;
    s.pass = newPass(oi, dir);
  }
  CsoPass& pass = s.pass;
  for (size_t k = 0; k < o.bars.size(); k++) {
    const Bar& bar = o.bars[k];
    if ((a.s - bar.s) * (b.s - bar.s) > 0) continue;
    const double q = clampd((bar.s - a.s) / (b.s - a.s), 0, 1);
    // Progression du saut à l'instant du passage (0..1 ; hors de [0, 1] : au sol).
    const double t0 = s.jt0, t1 = s.jt1;
    const double tau = t0 >= 0 ? t0 + (t1 - t0) * q : -1;
    const double y = tau >= 0 ? arcY(s.jumpPeak, 1, tau) : 0;
    const double margin = y + J.lift + in.clearance - bar.h;
    pass.margin = std::min(pass.margin, margin);
    if (margin < -J.rub) {
      if (!o.solid) {
        // Contact en montée : la barre tombe tout de suite ; en descente (postérieurs) : ~1,1 m plus loin.
        const double side = signOr1(b.u);
        if (tau > 0.5) states[oi].pending.push_back(CsoPendingBar{(int)k, (double)dir, side, -margin, 1.1});
        else csoKnock(obstacles, states, oi, (int)k, dir, side, -margin, in.time, out);
      }
      if (!pass.fault) {
        pass.fault = true;
        const JumpPlan* plan = lastPlanFor(s, oi);
        // (plan.margin = +∞ ⇔ hasMargin faux : +∞ ≥ 0 en JS)
        pass.cause = tau < 0 ? "short" : plan && plan->cause != Cause::None ? causeName(plan->cause) : plan && (!plan->hasMargin || plan->margin >= 0) ? "angle" : "far";
        if (o.solid) s.speed *= 0.55;
      }
    } else if (margin < 0.04 && k < states[oi].rails.size() && !o.solid) {
      // Barre effleurée : elle tinte et vibre sur ses taquets, mais reste en place.
      states[oi].rails[k].rattle = 1;
      out.sounds.push_back(CsoFenceSound::RailTouch);
    }
  }
  const double exit = dir > 0 ? o.back : o.front;
  if (!pass.exitT && (a.s - exit) * (b.s - exit) <= 0 && (b.s - exit) * dir >= 0) {
    // Membres visibles jugés : le résultat attend que les postérieurs aient passé l'obstacle.
    if (in.limbJudged) pass.exitT = in.time;
    else finishPass(pass, out);
  }
}
}  // namespace

// obstacles.js _mesh (barres du haut, celles qui tombent) : mur → barre posée à h − 0,05 ; troncs, haies, eau → aucune.
std::vector<CsoFenceState> csoFenceStates(const std::vector<CsoObstacle>& obstacles) {
  std::vector<CsoFenceState> v(obstacles.size());
  for (size_t i = 0; i < obstacles.size(); i++) {
    const CsoObstacle& o = obstacles[i];
    if (o.kind == "log" || o.kind == "brush" || o.kind == "water") continue;
    if (o.kind == "w") v[i].rails.push_back(railAt(o.h - 0.05, 0));
    else
      for (const Bar& b : o.bars) v[i].rails.push_back(railAt(b.h, b.s));
  }
  return v;
}

// obstacles.js _rest.
void csoRestFence(CsoFenceState& st) {
  st.knocked = false;
  st.rebuild = 0;
  st.pending.clear();
  for (CsoRail& r : st.rails) {
    r.y = r.restY;
    r.z = r.restZ;
    r.rx = r.restRx;
    r.rz = 0;
    r.falling = false;
    r.fall = CsoRailFall{};
    r.rattle = 0;
  }
}

// obstacles.js knock.
void csoKnock(const std::vector<CsoObstacle>& obstacles, std::vector<CsoFenceState>& states, int oi, int bar, double dir, double side,
              double hit, double time, CsoFenceOut& out) {
  if (oi < 0 || oi >= (int)obstacles.size()) return;
  const CsoObstacle& o = obstacles[oi];
  CsoFenceState& st = states[oi];
  const int bi = bar >= 0 ? bar : (int)o.bars.size() - 1;
  st.knocked = true;
  // Entraînement : la barre est remontée dès que le cheval s'est éloigné.
  if (o.course == "warmup" || o.course == "home" || o.course == "paris_warm") st.rebuild = time + 2.5;
  if (bi < 0 || bi >= (int)st.rails.size()) return;
  CsoRail& r = st.rails[bi];
  if (r.falling) return;
  r.falling = true;
  r.fall = CsoRailFall{};
  r.fall.dir = dir;
  r.fall.side = side;
  r.fall.hit = clampd(hit, 0.02, 0.5);
  out.sounds.push_back(CsoFenceSound::RailFall);
}

// obstacles.js limbContact.
void csoLimbContact(CsoHorseState& s, const std::vector<CsoObstacle>& obstacles, std::vector<CsoFenceState>& states, const CsoLimbHit& hit,
                    double time, CsoFenceOut& out) {
  if (hit.obstacle < 0 || hit.obstacle >= (int)obstacles.size()) return;
  const CsoObstacle& o = obstacles[hit.obstacle];
  if (o.off || hit.bar < 0 || hit.bar >= (int)o.bars.size()) return;
  const CsoFenceState& st = states[hit.obstacle];
  if (hit.bar < (int)st.rails.size() && st.rails[hit.bar].falling) return;
  if (!s.hasPass || s.pass.o != hit.obstacle || s.pass.done) {
    // Antérieurs sur la barre avant, avant que les épaules aient franchi l'entrée (résultat précédent annoncé d'abord).
    if (s.hasPass && !s.pass.done) finishPass(s.pass, out);
    const double fn = std::sin(s.heading) * o.n.x + std::cos(s.heading) * o.n.z;
    s.hasPass = true;
    s.pass = newPass(hit.obstacle, fn >= 0 ? 1 : -1);
  }
  s.pass.margin = std::min(s.pass.margin, -hit.depth);
  if (!o.solid) csoKnock(obstacles, states, hit.obstacle, hit.bar, s.pass.dir, signOr1(hit.u), std::max(0.05, hit.depth), time, out);
  if (!s.pass.fault) {
    s.pass.fault = true;
    const JumpPlan* plan = lastPlanFor(s, hit.obstacle);
    s.pass.cause = plan && plan->cause != Cause::None ? causeName(plan->cause)
                   : plan && plan->zone == Zone::Far     ? "far"
                   : plan && plan->zone == Zone::Near    ? "near"
                   : hit.hind                            ? "hindRail"
                                                         : "foreRail";
    if (o.solid) s.speed *= 0.55;
  }
}

// obstacles.js updateHorse.
void csoFencesUpdateHorse(CsoHorseState& s, const std::vector<CsoObstacle>& obstacles, std::vector<CsoFenceState>& states,
                          const CsoUpdateHorseInput& in, CsoFenceOut& out, const JumpParams& J, const CsoHorseParams& P, const CsoFenceParams& F) {
  const double fx = std::sin(s.heading), fz = std::cos(s.heading);
  const double px = s.x + fx * P.ref, pz = s.z + fz * P.ref;
  const double ppx = in.prevX + fx * P.ref, ppz = in.prevZ + fz * P.ref;
  // Après un refus, le cheval doit se détourner ou reprendre du champ avant qu'un nouveau refus compte.
  if (s.hasRefusal && !s.refusal.away && s.refusal.o >= 0 && s.refusal.o < (int)obstacles.size()) {
    const CsoObstacle& ro = obstacles[s.refusal.o];
    const double ls = localS(ro, s.x, s.z).s;
    if ((fx * ro.n.x + fz * ro.n.z) * signd(ls) > 0 || std::abs(ls) > ro.depth / 2 + 6) s.refusal.away = true;
  }
  // Résultat en attente (membres jugés) : annoncé quand les postérieurs ont passé l'obstacle, ou 1,2 s après la sortie.
  if (s.hasPass && !s.pass.done && s.pass.exitT && s.pass.o >= 0 && s.pass.o < (int)obstacles.size()) {
    const CsoObstacle& po = obstacles[s.pass.o];
    const double exit = s.pass.dir > 0 ? po.back : po.front;
    const double ls = localS(po, px, pz).s;
    if ((ls - exit) * s.pass.dir > F.hindTrail || in.time - s.pass.exitT > 1.2) finishPass(s.pass, out);
  }
  // Barres touchées par les postérieurs : elles tombent quand le cheval a avancé d'environ 1,1 m (ou s'est éloigné).
  const double step = std::hypot(s.x - in.prevX, s.z - in.prevZ);
  for (size_t i = 0; i < obstacles.size(); i++) {
    CsoFenceState& st = states[i];
    if (st.pending.empty()) continue;
    const CsoObstacle& o = obstacles[i];
    const bool far = std::hypot(o.x - s.x, o.z - s.z) > 8;
    for (int k = (int)st.pending.size() - 1; k >= 0; k--) {
      CsoPendingBar& pk = st.pending[k];
      pk.left -= step;
      if (pk.left <= 0 || far) {
        const CsoPendingBar p = pk;
        st.pending.erase(st.pending.begin() + k);
        csoKnock(obstacles, states, (int)i, p.bar, p.dir, p.side, p.hit, in.time, out);
      }
    }
  }
  // Refus en cours (freinage) : à l'arrêt, le refus est compté.
  if (s.refusing >= 0 && !(s.brake > 0)) countRefusal(s, obstacles, s.refusing, in.time, out);
  const bool airborne = s.jumpT >= 0 || s.jt0 >= 0;
  for (size_t i = 0; i < obstacles.size(); i++) {
    const CsoObstacle& o = obstacles[i];
    const int oi = (int)i;
    if (o.off || std::abs(o.x - px) > 12 || std::abs(o.z - pz) > 12) continue;
    const LocalS a = localS(o, ppx, ppz);
    const LocalS b = localS(o, px, pz);
    const bool inWidth = std::abs(b.u) < o.w / 2 + 0.35;
    // Saut en cours, ou réception juste avant l'obstacle visé (appel bien trop loin : il atterrit dedans).
    const bool jumping = airborne || (s.hasLastJump && s.lastJumpObstacle == oi && s.lastLanded && in.time - s.lastLandTime < 0.6);
    if (jumping) {
      judge(s, obstacles, states, oi, a, b, inWidth, in, out, J);
      continue;
    }
    if (!inWidth) continue;
    const double side = b.s < 0 ? -1 : 1;
    const double fn = fx * o.n.x + fz * o.n.z;
    const double toward = -fn * side;  // part de la marche dirigée vers l'obstacle
    if (toward > 0.3 && s.speed > 0.5) {
      const double nose = b.s + fn * (P.nose - P.ref);
      const double gap = side < 0 ? o.front - nose : nose - o.back;
      if (s.refusing < 0) {
        // Le cheval ne refuse que lorsque l'appel n'est plus possible (même décision que csoApproachRefusal).
        const FenceGeo geo = railsAhead(o.fence(), px, pz, fx, fz);
        if (geo.cosA >= J.maxAngle) {
          const JumpPlan plan = planJump(JumpHorse{s.speed, in.power, in.clearance, in.csoCourse}, &geo, J);
          if (plan.zone == Zone::Refuse || (plan.margin < -J.late && plan.ideal <= plan.L) || (s.speed < P.minJumpSpeed && gap < 1.5)) csoRefuse(s, obstacles, oi, P);
        } else if (gap < (s.speed * s.speed) / 16 + 0.3) csoRefuse(s, obstacles, oi, P);
      }
      if (gap < -P.overrun * 0.4 && s.refusing == oi && !states[i].knocked && !o.solid) {
        // Refus tout contre : le cheval pile dans l'obstacle et emporte la barre avant (refus, pas de faute de barre ;
        // le jury remonte l'obstacle).
        csoKnock(obstacles, states, oi, 0, side < 0 ? 1 : -1, 0, 0.15, in.time, out);
        states[i].rebuild = in.time + 3;
      }
      if (gap < -P.overrun) {
        // Garde-fou : le nez ne va jamais plus loin (poussée limitée par image).
        const double push = std::min(-P.overrun - gap, 0.3) * side;
        s.x += o.n.x * push;
        s.z += o.n.z * push;
      }
    }
    const double depth = o.depth / 2 + 0.1;
    const double mid = (o.front + o.back) / 2;
    if ((a.s - mid < -depth && b.s - mid >= -depth) || (a.s - mid > depth && b.s - mid <= depth)) {
      // Cheval qui glisse presque parallèlement aux barres, ou au pas de fourmi : refus sur place, ramené devant.
      const double back = mid + (a.s < mid ? -depth : depth);
      s.x = o.x + o.n.x * back + o.t.x * b.u - fx * P.ref;
      s.z = o.z + o.n.z * back + o.t.z * b.u - fz * P.ref;
      csoRear(s, out.horse);
      countRefusal(s, obstacles, oi, in.time, out);
    }
  }
}

// obstacles.js update(dt).
void csoFencesUpdate(const std::vector<CsoObstacle>& obstacles, std::vector<CsoFenceState>& states, const CsoFencesUpdateInput& in, CsoFenceOut& out) {
  const double G = 9.81, R = 0.05;
  const double dt = in.dt;
  for (size_t i = 0; i < obstacles.size(); i++) {
    const CsoObstacle& o = obstacles[i];
    CsoFenceState& st = states[i];
    // Hors mission, une barre tombée est remise une fois le joueur éloigné de plus de 60 m.
    if (!in.missionActive && st.knocked && (std::abs(o.x - in.focusX) > 60 || std::abs(o.z - in.focusZ) > 60) &&
        std::all_of(st.rails.begin(), st.rails.end(), [](const CsoRail& r) { return !r.falling || r.fall.done; }))
      csoRestFence(st);
    if (st.rebuild && in.time > st.rebuild && std::hypot(o.x - in.focusX, o.z - in.focusZ) > 5) csoRestFence(st);
    for (CsoRail& r : st.rails) {
      if (r.rattle > 0 && !r.falling) {
        r.rattle = std::max(0.0, r.rattle - dt * 2.5);
        r.rx = r.restRx + std::sin(r.rattle * 40) * 0.05 * r.rattle;
        r.y = r.restY + std::abs(std::sin(r.rattle * 31)) * 0.012 * r.rattle;
      }
      if (!r.falling || r.fall.done) continue;
      CsoRailFall& f = r.fall;
      if (!f.started) {
        // Le bout touché quitte son taquet le premier ; l'autre suit d'autant plus vite que le contact était franc.
        const double y0 = r.restY;
        const double lag = 0.2 - 0.3 * clampd(f.hit, 0, 0.4);
        f.ends[0] = CsoRailEnd{y0, 0, 0};
        f.ends[1] = CsoRailEnd{y0, 0, std::max(0.06, lag)};
        if ((f.side ? f.side : 1) > 0) std::swap(f.ends[0], f.ends[1]);
        f.z = r.restZ;
        f.vz = f.dir * (0.7 + 2.2 * clampd(f.hit, 0, 0.4));
        f.roll = 0;
        f.started = true;
      }
      f.t += dt;
      bool resting = true;
      for (CsoRailEnd& e : f.ends) {
        if (f.t < e.t0) {
          resting = false;
          continue;
        }
        e.vy -= G * dt;
        e.y += e.vy * dt;
        if (e.y <= R) {
          e.y = R;
          if (std::abs(e.vy) > 0.6) {
            e.vy = -e.vy * 0.28;
            if (!f.clonk) {
              f.clonk = true;
              out.sounds.push_back(CsoFenceSound::Thud);
            }
          } else e.vy = 0;
        }
        if (e.y > R + 1e-3 || e.vy != 0) resting = false;
      }
      // Glisse / roule vers l'avant, freinée par le sable.
      if (f.ends[0].y <= R + 0.02 && f.ends[1].y <= R + 0.02) {
        f.vz *= std::exp(-2.6 * dt);
        if (std::abs(f.vz) > 0.02) resting = false;
      }
      f.z += f.vz * dt;
      f.roll += (f.vz * dt) / R;
      r.y = (f.ends[0].y + f.ends[1].y) / 2;
      r.z = f.z;
      r.rz = std::atan2(f.ends[1].y - f.ends[0].y, o.w);
      r.rx = f.roll;
      if (resting && f.t > 0.5) f.done = true;
    }
  }
}

}  // namespace strides
