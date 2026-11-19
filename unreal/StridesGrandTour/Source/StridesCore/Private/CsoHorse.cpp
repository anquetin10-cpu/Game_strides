// Portage ligne à ligne (voir CsoHorse.h). Chaque bloc cite sa source JS ; toute divergence est un défaut : les tests
// rejouent les oracles exportés du jeu web en cours d'exécution (cso_runs.json, cso_target.json).
#include "StridesCore/CsoHorse.h"
#include "StridesCore/MathUtil.h"

#include <algorithm>
#include <cmath>

namespace strides {

const CsoHorseParams& csoHorseDefaults() {
  static const CsoHorseParams P;
  return P;
}

namespace {
constexpr double kTau = kPi * 2;
// Math.round du JS : arrondi au plus proche, moitiés vers +∞ (std::round arrondit les moitiés négatives vers −∞).
double jsRound(double x) {
  double r = std::floor(x);
  if (x - r >= 0.5) r += 1;
  return r;
}
double damp(double a, double b, double lambda, double dt) { return a + (b - a) * (1 - std::exp(-lambda * dt)); }
double lerp(double a, double b, double t) { return a + (b - a) * t; }
}  // namespace

double wrapAngle(double a) {
  a = std::fmod(a + kPi, kTau);
  if (a < 0) a += kTau;
  return a - kPi;
}

// obstacles.js add() (valeurs par défaut, oxer à 1,2 m, repère n / t), _bars(), faces de _mesh().
CsoObstacle makeCsoObstacle(const std::string& kind, double x, double z, double rot, double h, double w, double spread,
                            const std::string& label, int num, const std::string& course, bool solid) {
  CsoObstacle ob;
  ob.kind = kind;
  ob.x = x;
  ob.z = z;
  ob.rot = rot;
  ob.h = h;
  ob.w = w;
  ob.spread = spread;
  ob.num = num;
  ob.course = course;
  ob.solid = solid;
  if (ob.kind == "o" && !ob.spread) ob.spread = 1.2;
  ob.label = label.empty() && num ? std::to_string(num) : label;
  ob.n = {std::sin(rot), std::cos(rot)};
  ob.t = {std::cos(rot), -std::sin(rot)};
  if (ob.kind == "o") ob.bars = {{-ob.spread / 2, ob.h - 0.05}, {ob.spread / 2, ob.h}};
  else ob.bars = {{0, ob.h}};
  const double hd = ob.kind == "log" ? ob.h / 2 : ob.kind == "brush" || ob.kind == "water" ? 0.55 : ob.kind == "w" ? 0.3 : 0.06;
  ob.front = ob.kind == "o" ? -ob.spread / 2 - 0.06 : -hd;
  ob.back = ob.kind == "o" ? ob.spread / 2 + 0.06 : hd;
  ob.depth = ob.back - ob.front;
  return ob;
}

const char* csoHorseEventName(CsoHorseEvent e) {
  switch (e) {
    case CsoHorseEvent::Jump: return "horse:jump";
    case CsoHorseEvent::JumpEarly: return "horse:jumpEarly";
    case CsoHorseEvent::TooSlow: return "horse:tooSlow";
    case CsoHorseEvent::Refuse: return "horse:refuse";
    case CsoHorseEvent::Land: return "horse:land";
  }
  return "";
}

// input.js poll() : déplacement venu du clavier (le joystick tactile n'est pas actif).
KeyboardMove keyboardMove(bool up, bool down, bool right, bool left, bool ctrlLeft, bool altLeft) {
  KeyboardMove m;
  double x = 0, y = 0;
  if (up) y += 1;
  if (down) y -= 1;
  if (right) x += 1;
  if (left) x -= 1;
  const bool walk = altLeft;
  const bool trot = ctrlLeft;
  const double mm = std::hypot(x, y);
  if (mm > 0) {
    m.keyMove = true;
    const double s = walk ? 0.25 : trot ? 0.5 : 1;
    m.x = (x / mm) * s;
    m.y = (y / mm) * s;
    m.mag = s;
  }
  return m;
}

// obstacles.js target() : le plus proche devant le point de référence (épaules), angle, portée, entre les chandeliers.
CsoTarget csoTarget(const std::vector<CsoObstacle>& obstacles, const CsoHorseState& s, double power, double clearance,
                    bool csoCourse, const JumpParams& J, const CsoHorseParams& P) {
  CsoTarget best;
  const double fx = std::sin(s.heading), fz = std::cos(s.heading);
  const double px = s.x + fx * P.ref, pz = s.z + fz * P.ref;
  const double R = J.reach + 4;
  for (size_t i = 0; i < obstacles.size(); i++) {
    const CsoObstacle& o = obstacles[i];
    if (o.off || std::abs(o.x - px) > R || std::abs(o.z - pz) > R) continue;
    FenceGeo geo = railsAhead(o.fence(), px, pz, fx, fz);
    if (geo.rails.empty() || geo.cosA < J.maxAngle) continue;
    const RailAhead& first = geo.rails.front();
    const RailAhead& last = geo.rails.back();
    if (last.x < -0.3 || first.x > J.reach) continue;
    if (std::abs((first.u + last.u) / 2) > o.w / 2 + 0.35) continue;
    if (best.index < 0 || first.x < best.geo.rails.front().x) {
      best.index = (int)i;
      best.geo = std::move(geo);
    }
  }
  if (best.index < 0) return best;
  best.plan = planJump(JumpHorse{s.speed, power, clearance, csoCourse}, &best.geo, J);
  return best;
}

// obstacles.js timing() : 'none' en l'air, en refus ou trop lent ; zone 'refuse' affichée 'near'.
Zone csoTiming(const std::vector<CsoObstacle>& obstacles, const CsoHorseState& s, double power, double clearance,
               bool csoCourse, const JumpParams& J, const CsoHorseParams& P) {
  if (s.jumpT >= 0 || s.refusing >= 0 || s.speed < P.minJumpSpeed) return Zone::None;
  const CsoTarget t = csoTarget(obstacles, s, power, clearance, csoCourse, J, P);
  if (t.index < 0) return Zone::None;
  return t.plan.zone == Zone::Refuse ? Zone::Near : t.plan.zone;
}

// horse.js brake(dist).
void csoBrake(CsoHorseState& s, double dist) {
  const double v = s.speed;
  s.brake = std::max((v * v) / (2 * std::max(dist, 0.02)), v / 0.5);
}

// horse.js refuse().
void csoRear(CsoHorseState& s, std::vector<CsoHorseEvent>& events) {
  s.speed = 0;
  s.brake = 0;
  s.rearAnim = 1;
  s.rearT = 1.1;
  s.jumpT = -1;
  s.jumpY = 0;
  events.push_back(CsoHorseEvent::Refuse);
}

// obstacles.js refuse(horse, o) : freinage pour s'arrêter devant l'obstacle (nez au plus à OVERRUN × 0,7 au-delà).
void csoRefuse(CsoHorseState& s, const std::vector<CsoObstacle>& obstacles, int index, const CsoHorseParams& P) {
  if (s.refusing >= 0 || index < 0 || index >= (int)obstacles.size()) return;
  const CsoObstacle& o = obstacles[index];
  const double fx = std::sin(s.heading), fz = std::cos(s.heading);
  const double sx = s.x + fx * P.ref, sz = s.z + fz * P.ref;
  const double ls = (sx - o.x) * o.n.x + (sz - o.z) * o.n.z;
  const double side = ls < 0 ? -1 : 1;
  const double fn = fx * o.n.x + fz * o.n.z;
  const double toward = std::max(0.3, -fn * side);
  const double nose = ls + fn * (P.nose - P.ref);
  const double gap = side < 0 ? o.front - nose : nose - o.back;
  s.refusing = index;
  csoBrake(s, std::max(0.35, gap + P.overrun * 0.7) / toward);
}

// obstacles.js updateHorse, boucle des obstacles : partie « refus à l'abord » seulement.
int csoApproachRefusal(const CsoHorseState& s, const std::vector<CsoObstacle>& obstacles, double power, double clearance,
                       bool csoCourse, double time, const JumpParams& J, const CsoHorseParams& P) {
  if (s.refusing >= 0) return -1;
  const double fx = std::sin(s.heading), fz = std::cos(s.heading);
  const double px = s.x + fx * P.ref, pz = s.z + fz * P.ref;
  const bool airborne = s.jumpT >= 0 || s.jt0 >= 0;
  for (size_t i = 0; i < obstacles.size(); i++) {
    const CsoObstacle& o = obstacles[i];
    if (o.off || std::abs(o.x - px) > 12 || std::abs(o.z - pz) > 12) continue;
    const double bs = (px - o.x) * o.n.x + (pz - o.z) * o.n.z;
    const double bu = (px - o.x) * o.t.x + (pz - o.z) * o.t.z;
    const bool inWidth = std::abs(bu) < o.w / 2 + 0.35;
    // Saut en cours, ou réception juste avant l'obstacle visé : jugement des barres (T3), pas de refus.
    const bool jumping = airborne || (s.hasLastJump && s.lastJumpObstacle == (int)i && s.lastLanded && time - s.lastLandTime < 0.6);
    if (jumping || !inWidth) continue;
    const double side = bs < 0 ? -1 : 1;
    const double fn = fx * o.n.x + fz * o.n.z;
    const double toward = -fn * side;
    if (toward > 0.3 && s.speed > 0.5) {
      const double nose = bs + fn * (P.nose - P.ref);
      const double gap = side < 0 ? o.front - nose : nose - o.back;
      const FenceGeo geo = railsAhead(o.fence(), px, pz, fx, fz);
      if (geo.cosA >= J.maxAngle) {
        const JumpPlan plan = planJump(JumpHorse{s.speed, power, clearance, csoCourse}, &geo, J);
        if (plan.zone == Zone::Refuse || (plan.margin < -J.late && plan.ideal <= plan.L) || (s.speed < P.minJumpSpeed && gap < 1.5)) return (int)i;
      } else if (gap < (s.speed * s.speed) / 16 + 0.3) return (int)i;
    }
  }
  return -1;
}

// horse.js startJump().
bool csoStartJump(CsoHorseState& s, const CsoFrameInput& in, const std::vector<CsoObstacle>& obstacles,
                  std::vector<CsoHorseEvent>& events, const JumpParams& J, const CsoHorseParams& P) {
  if (s.jumpT >= 0 || s.speed < P.minJumpSpeed) return false;
  // Refus engagé : trop tard pour sauter.
  if (s.refusing >= 0) return false;
  const double L0 = std::max(1.5, s.speed * P.jumpDuration);
  double peak = in.power * speedFactor(s.speed);
  double len = L0;
  CsoTarget tgt;
  if (in.playerHorse) tgt = csoTarget(obstacles, s, in.power, in.clearance, in.csoControls, J, P);
  const bool has = tgt.index >= 0;
  // Épreuve : on ne saute que vers l'obstacle à aborder, et pas bien trop tôt (> 1,9 × L0 avant la barre).
  if (in.playerHorse && in.csoControls && (!has || tgt.plan.zone == Zone::None || tgt.geo.rails.front().x > tgt.plan.L0 * 1.9)) {
    events.push_back(CsoHorseEvent::JumpEarly);
    return false;
  }
  if (has && tgt.plan.zone != Zone::None) {
    if (tgt.plan.zone == Zone::Refuse) {
      // Tout contre la barre avant : plus la place d'enlever, refus ; déjà dans l'obstacle : appui ignoré.
      if (tgt.geo.rails.front().x >= 0) csoRefuse(s, obstacles, tgt.index, P);
      return false;
    }
    peak = tgt.plan.H;
    len = tgt.plan.L;
    s.hasLastJump = true;
    s.lastJumpObstacle = tgt.index;
    s.lastPlan = tgt.plan;
    s.lastGeo = tgt.geo;
    s.lastJumpTime = in.time;
    s.lastLanded = false;
    s.lastLandTime = 0;
  } else {
    s.hasLastJump = false;
    s.lastJumpObstacle = -1;
    // Hors épreuve : obstacle du monde sur la trajectoire → freinage puis refus (Horse._jumpBlocked, fourni).
    const double block = in.jumpBlocked ? in.jumpBlocked(peak) : -1;
    if (block >= 0) {
      csoBrake(s, block - 1.45);
      return false;
    }
  }
  s.jumpPeak = peak;
  s.jumpLen = len;
  s.jumpDur = len / std::max(s.speed, 1.5);
  s.jumpT = 0;
  s.brake = 0;
  events.push_back(CsoHorseEvent::Jump);
  return true;
}

namespace {
// Commandes du cheval écrites par le joueur (horse.control) pour cette image.
struct Control {
  bool cso = false;  // c.turnRate !== undefined (commandes de concours posées par csoRideStep)
  double turnRate = 0, speedOverride = 0, yawTau = 0, yawAcc = 0, airTurn = 0, landingLoss = 0;
  double mag = 0;
  bool jump = false;
};
}  // namespace

void csoHorseStep(CsoHorseState& s, const CsoFrameInput& in, const std::vector<CsoObstacle>& obstacles,
                  std::vector<CsoHorseEvent>& events, const CsoRideParams& R, const JumpParams& J, const CsoHorseParams& P) {
  const double dt = in.dt;
  // ---- player.js (mode monté) : clearCsoControls, puis csoRideStep en épreuve ----
  Control c;
  if (!in.csoControls) s.hasCadence = false;
  if (in.csoControls && !in.locked) {
    // csoRideStep : cadence de départ = vitesse réelle arrondie au dixième.
    if (!s.hasCadence) {
      s.cadence = jsRound(clampd(s.speed, 0, R.maxSpeed) * 10) / 10;
      s.hasCadence = true;
    }
    // Clavier : direction amenée progressivement (× 2 en relâchant ou en inversant).
    double sx = in.moveX;
    if (in.keyMove) {
      const double k = s.kbdSteer;
      const double step = R.kbdRamp * dt * (std::abs(sx) < std::abs(k) || signd(sx) != signd(k) ? 2 : 1);
      s.kbdSteer = k + clampd(sx - k, -step, step);
      sx = s.kbdSteer;
    } else s.kbdSteer = 0;
    // Refus en cours (cabré, freinage) : la cadence ne se règle pas.
    const double dC = !(s.rearT > 0) && s.refusing < 0 ? cadenceDelta(in.moveY, sx, s.cadence, R) : 0;
    s.cadAdjust = dC != 0;
    s.cadence = clampd(s.cadence + dC * dt, 0, R.maxSpeed);
    c.cso = true;
    c.turnRate = steerRate(sx, s.speed, R);
    c.speedOverride = s.cadence;
    c.yawTau = R.yawTau;
    c.yawAcc = R.yawAcc;
    c.airTurn = R.airTurn;
    c.landingLoss = R.landingLoss;
    c.mag = 1;
    c.jump = in.jumpPressed;
  } else if (!in.locked) {
    // Monde ouvert : direction relative à la caméra (non portée ici) ; amplitude et appui seulement.
    c.mag = std::min(1.0, std::hypot(in.moveX, in.moveY));
    c.jump = in.jumpPressed;
  } else {
    c.mag = 0;
  }

  // ---- horse.js update ----
  if (s.rearT > 0) {
    s.rearT -= dt;
    s.rearAnim = std::max(0.0, std::sin(std::min(1.0, s.rearT / 1.1) * kPi));
  } else s.rearAnim = 0;

  double desired = 0;
  double turnInput = 0;
  if (c.cso && !in.frozen && !(s.rearT > 0)) {
    // Concours : vitesse de virage commandée, prise progressivement ; en l'air le cheval garde presque son cap.
    const double y0 = s.yawRate;
    double y1 = c.yawTau ? y0 + (c.turnRate - y0) * (1 - std::exp(-dt / c.yawTau)) : damp(y0, c.turnRate, 4, dt);
    if (c.yawAcc) y1 = y0 + clampd(y1 - y0, -c.yawAcc * dt, c.yawAcc * dt);
    s.yawRate = y1;
    const double r = s.yawRate * (s.jumpT >= 0 ? c.airTurn : 1);
    s.heading = wrapAngle(s.heading + r * dt);
    turnInput = r;
    desired = c.speedOverride;
  } else if (!in.frozen && c.mag > 0.12 && !(s.rearT > 0)) {
    // Monde ouvert (allures, cap visé à la caméra) : hors du périmètre de ce portage. Le lacet de concours retombe.
    s.yawRate = 0;
  }
  s.lastTurn = damp(s.lastTurn, turnInput, 8, dt);
  // Refus en cours : commandes de vitesse ignorées jusqu'à l'arrêt.
  if (s.brake > 0) desired = 0;
  // Eau et pente (valeurs fournies par l'appelant).
  const double depth = in.waterDepth;
  if (depth > 0.15) desired = std::min(desired, lerp(9, 3.5, clampd(depth / 1.1, 0, 1)));
  if (in.slope > 0.25) desired *= clampd(1 - (in.slope - 0.25) * 1.2, 0.35, 1);
  if (depth > 0.9 && desired > 0) {
    if (in.waterAhead > 1.35 && in.waterAhead > depth) desired = 0;
  }

  if (s.jumpT < 0) {
    const double acc = s.brake > 0 ? s.brake : desired > s.speed ? (s.speed < 5 ? 4.5 : 3.6) : 9;
    s.speed = s.speed + clampd(desired - s.speed, -acc * dt, acc * dt);
    if (s.brake > 0 && s.speed < 0.05) csoRear(s, events);
  }

  // Saut.
  if (c.jump) {
    if (s.jumpT < 0 && !in.frozen) {
      if (!csoStartJump(s, in, obstacles, events, J, P) && in.playerHorse && s.speed < P.minJumpSpeed)
        events.push_back(CsoHorseEvent::TooSlow);
    }
  }
  // Progression du saut avant et après cette image.
  s.jt0 = s.jumpT;
  if (s.jumpT >= 0) {
    s.jumpT += dt / (s.jumpDur ? s.jumpDur : P.jumpDuration);
    s.jt1 = s.jumpT;
    if (s.jumpT >= 1) {
      s.jumpT = -1;
      s.jumpY = 0;
      // Réception : en concours seul un saut recadré coûte un peu d'élan ; sinon perte selon l'écart de longueur.
      if (c.cso) {
        const double dev = s.hasLastJump ? s.lastPlan.dev : 0;
        s.speed *= 1 - std::min(c.landingLoss, std::abs(std::isnan(dev) ? 0 : dev) * 0.5);
      } else {
        const double dev = std::abs((s.jumpLen ? s.jumpLen : 0) / std::max(1.5, s.speed * P.jumpDuration) - 1);
        s.speed *= 0.94 - std::min(0.08, dev * 0.5);
      }
      if (s.hasLastJump) {
        s.lastLanded = true;
        s.lastLandTime = in.time;
      }
      events.push_back(CsoHorseEvent::Land);
    } else s.jumpY = 4 * s.jumpPeak * s.jumpT * (1 - s.jumpT);
  } else s.jt1 = -1;

  // Déplacement.
  s.x += std::sin(s.heading) * s.speed * dt;
  s.z += std::cos(s.heading) * s.speed * dt;
}

}  // namespace strides
