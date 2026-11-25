// Vue du cheval WildMesh (essai de monte, voie A, étape S4) : voir HorseView.h. Chaque fonction suit l'ordre des
// opérations du JS (une opération par instruction là où l'arrondi compte).
#include "StridesCore/HorseView.h"

#include <algorithm>
#include <cmath>
#include <stdexcept>

#include "StridesCore/MathUtil.h"
#include "StridesCore/MiniJson.h"

namespace strides::hview {
namespace {
// core/math.js
double clampv(double v, double a, double b) { return v < a ? a : v > b ? b : v; }
double lerp(double a, double b, double t) { return a + (b - a) * t; }
double damp(double a, double b, double lambda, double dt) { return lerp(a, b, 1 - std::exp(-lambda * dt)); }
double wrap01(double u) { return u - std::floor(u); }
double jsMod(double a, double b) { return std::fmod(a, b); }  // % de JS (même signe que a)
std::vector<double> nums(const J& a, const char* what) {
  if (a.t != J::Arr) throw std::runtime_error(std::string("pjl_horse_view.json : ") + what);
  std::vector<double> v;
  for (const J& x : a.a) v.push_back(x.num());
  return v;
}
const J& need(const J& j, const char* k) {
  const J& v = j[k];
  if (v.isNull()) throw std::runtime_error(std::string("pjl_horse_view.json : clé absente ") + k);
  return v;
}
bool isGaitFamily(const std::string& k) { return k == "walk" || k == "trot" || k == "canter" || k == "gallop"; }
std::string family(const std::string& name) {
  const size_t p = name.find('_');
  return p == std::string::npos ? name : name.substr(0, p);
}
}  // namespace

double jumpApex(const JumpClip& j) {
  const std::vector<double>& R = j.trunkRise.empty() ? j.pelvisRise : j.trunkRise;
  double best = j.toeOff, hi = -INFINITY;
  for (int f = (int)std::ceil(j.toeOff * 24); f <= (int)std::floor(j.foreLand * 24); f++) {
    if (f < 0 || f >= (int)R.size()) continue;  // R[f] === undefined
    const double r = R[f];
    if (r > hi) {
      hi = r;
      best = f / 24.0;
    }
  }
  return std::min(std::max(best, j.toeOff + 0.05), j.foreLand - 0.05);
}

double pelvisRise(const JumpClip& j, double t) {
  const std::vector<double>& R = j.trunkRise.empty() ? j.pelvisRise : j.trunkRise;
  if (R.empty()) return 0;
  const double f = clampv(t * 24, 0, (double)R.size() - 1);
  const int i = (int)std::floor(f);
  const double k = f - i;
  return lerp(R[i], R[std::min(i + 1, (int)R.size() - 1)], k);
}

ViewData viewDataFromJson(const J& j) {
  if (j["schema"].s != "strides.pjl_horse_view/1") throw std::runtime_error("pjl_horse_view.json : schéma inattendu");
  ViewData d;
  const J& c = need(j, "consts");
  const char* gk[3] = {"walk", "trot", "canter"};
  for (int i = 0; i < 3; i++) {
    const std::vector<double> v = nums(need(c, "CADENCE")[gk[i]], "CADENCE");
    if (v.size() != 2) throw std::runtime_error("pjl_horse_view.json : CADENCE");
    d.c.cadence[i][0] = v[0];
    d.c.cadence[i][1] = v[1];
  }
  d.c.push = need(c, "PUSH").num();
  d.c.pushRelease = need(c, "PUSH_RELEASE").num();
  d.c.hoofSole = need(c, "HOOF_SOLE").num();
  d.c.railR = need(c, "RAIL_R").num();
  d.c.hindClearMax = need(c, "HIND_CLEAR_MAX").num();
  d.c.hindTiltMax = need(c, "HIND_TILT_MAX").num();
  d.c.hindLiftMax = need(c, "HIND_LIFT_MAX").num();
  d.c.foreTiltMax = need(c, "FORE_TILT_MAX").num();
  d.c.tuckMax = need(c, "TUCK_MAX").num();
  d.c.com = need(j, "comCanterHeight").num();
  d.c.edgeWalk = need(j, "gaitEdges")["walk"].num();
  d.c.edgeTrot = need(j, "gaitEdges")["trot"].num();
  d.c.edgeCanter = need(j, "gaitEdges")["canter"].num();
  d.c.rub = need(j, "rub").num();
  d.scale = need(j, "scale").num();
  for (const auto& [k, v] : need(j, "gaitInfo").o) d.gaitInfo[k] = {v["stride"].num(), v["offset"].num()};
  for (const auto& [k, v] : need(j, "jumps").o) {
    JumpClip jc;
    jc.name = k;
    jc.toeOff = v["toeOff"].num();
    jc.foreLand = v["foreLand"].num();
    jc.hindLand = v["hindLand"].num();
    jc.nextFore = v["nextFore"].num();
    jc.end = v["end"].num();
    jc.pelvisRise = nums(v["pelvisRise"], "pelvisRise");
    jc.trunkRise = nums(v["trunkRise"], "trunkRise");
    jc.apex = jumpApex(jc);
    d.jumps[k] = jc;
  }
  for (const auto& [k, v] : need(j, "clips").o) d.clips[k] = v.num();
  for (const J& n : need(j, "clipOrder").a) d.clipOrder.push_back(n.s);
  if (d.clipOrder.size() != d.clips.size()) throw std::runtime_error("pjl_horse_view.json : clipOrder et clips diffèrent");
  for (const auto& [k, v] : need(j, "align").o)
    if (!v.isNull()) d.align[k] = v.num();
  d.leadSwap = j["leadSwap"].b;
  return d;
}

// ---------- horse/anim.js animateHorse (choix de l'allure, main, fréquence, phase) ----------
void locoStep(const Consts& c, Loco& A, const LocoIn& in) {
  const double dt = std::min(in.dt, 0.1);
  const double vn = in.speed;
  const double vel = in.vel;
  const bool jumping = in.jump >= 0;
  const double rear = in.rear;
  std::string target = vn < 0.25 ? "idle" : vn < c.edgeWalk ? "walk" : vn < c.edgeTrot ? "trot" : vn < c.edgeCanter ? "canter" : "gallop";
  if (A.gait == "walk" && target == "idle" && vn > 0.12) target = "walk";
  if (A.gait == "trot" && target == "walk" && vn > c.edgeWalk - 0.3) target = "trot";
  if (A.gait == "canter" && target == "trot" && vn > c.edgeTrot - 0.4) target = "canter";
  if (A.gait == "gallop" && target == "canter" && vn > c.edgeCanter - 0.7) target = "gallop";
  const double turn = in.turn;
  if (in.lead) A.lead = in.lead;
  else if (std::fabs(turn) > 0.25 && signd(turn) != A.lead) {
    A.leadHold += dt;
    if (A.leadHold > 0.5) {
      A.lead = (int)signd(turn);
      A.leadHold = 0;
    }
  } else
    A.leadHold = 0;
  A.gait = target;
  const bool moving = target != "idle" && !jumping && rear < 0.05;
  A.move = lerp(A.move, moving ? 1 : 0, 1 - std::exp(-dt * (moving ? 6 : 4)));
  if (target != "idle") {
    const double k = 1 - std::exp(-dt * 7);
    const double vw = std::max(vel, 0.6);
    double f = 0, du = 0;
    if (target == "walk") {
      f = clampv(0.62 + 0.18 * vw, 0.72, 1.12);
      du = clampv(0.66 - 0.035 * vw, 0.56, 0.68);
    } else if (target == "trot") {
      f = clampv(1.04 + 0.09 * vw, 1.22, 1.7);
      du = clampv(0.48 - 0.025 * (vw - 3.5), 0.36, 0.5);
    } else if (target == "canter") {
      f = clampv(1.32 + 0.068 * vw, 1.62, 2.12);
      du = clampv(0.55 - 0.022 * vw, 0.3, 0.46);
    } else {
      f = clampv(1.4 + 0.056 * vw, 1.95, 2.55);
      du = clampv(0.36 - 0.0095 * vw, 0.17, 0.3);
    }
    A.freq = lerp(A.freq, f, k);
    A.duty = lerp(A.duty, du, k);
    // Foulée bornée par l'amplitude des membres (Lmax = 1,35 m) : v et Lmax en unités du modèle dans le web, rapport égal.
    const double fmin = (vel * A.duty) / 1.35;
    if (A.freq < fmin) A.freq = fmin;
  }
  if (moving || A.move > 0.05) A.phase = wrap01(A.phase + dt * A.freq * std::max(A.move, 0.25));
}

// ---------- pjlHorse.js _snapshot, _jumpTime ----------
double jumpTimeOf(const ViewData& d, double tau, double T, double speed) {
  auto it = d.jumps.find(speed > 8 ? "jump_gallop" : "jump_canter");
  if (it == d.jumps.end()) it = d.jumps.find("jump_gallop");
  if (it == d.jumps.end()) return tau * (T + d.c.push) - d.c.push;
  const JumpClip& j = it->second;
  const double c0 = j.toeOff - d.c.push;
  const double c = tau < 0.5 ? c0 + (tau / 0.5) * (j.apex - c0) : j.apex + ((tau - 0.5) / 0.5) * (j.foreLand - j.apex);
  return c < j.toeOff ? c - j.toeOff : ((c - j.toeOff) / (j.foreLand - j.toeOff)) * T;
}

Snap snapshotStep(const ViewData& d, SnapState& st, const SnapIn& in, double& animPhase) {
  const double dt = in.dt;
  const double speed = in.speed;
  const std::string g = in.gait.empty() ? "idle" : in.gait;
  const bool jumping = in.jumpT >= 0;
  std::string gait = "halt";
  double target = 0;
  if (g == "walk") {
    gait = "walk";
    target = d.gaitInfo.at("walk").stride;
  } else if (g == "trot") {
    gait = "trot";
    target = d.gaitInfo.at("trot").stride;
  } else if (g == "canter" || g == "gallop") {
    gait = "canter";
    target = 3.42 + (4.5 - 3.42) * smoothstep(8.2, 11.5, speed);
  }
  if (gait == "halt" && jumping) gait = "canter";
  if (target) st.stride = damp(st.stride, target, 5, dt);
  const int ci = gait == "canter" ? 2 : gait == "trot" ? 1 : gait == "walk" ? 0 : -1;
  if (ci >= 0 && !jumping && speed > 0.2) {
    const double f = clampv(speed / std::max(0.5, st.stride), d.c.cadence[ci][0], d.c.cadence[ci][1]);
    st.ph = wrap01(st.ph + f * dt);
  }
  const char leadDest = in.lead > 0 ? 'L' : 'R';
  const char lead = d.leadSwap ? (leadDest == 'L' ? 'R' : 'L') : leadDest;
  const std::string key = g == "canter" || g == "gallop" ? std::string(speed > 9.8 ? "gallop" : "canter") + leadDest : g;
  const auto al = d.align.find(key);
  if (al != d.align.end() && !jumping && speed > 0.2) animPhase = wrap01(st.ph - al->second);
  const double turnRate = in.lastTurn;
  st.roll = damp(st.roll, -std::atan2(turnRate * speed, 9.81) * 0.9, 6, dt);
  const double T = std::max(0.3, in.jumpDur ? in.jumpDur : 0.8);
  if (st.wasJump && !jumping) st.landT = 0;
  st.wasJump = jumping;
  st.landT += dt;
  const bool refusing = in.brake > 0 || in.rearT > 0;
  Snap s;
  s.mode = jumping ? "air" : refusing ? "refusal" : st.landT < 0.45 ? "landing" : "ride";
  s.y = d.c.com;
  s.roll = st.roll;
  s.speed = speed;
  s.gait = gait;
  s.lead = lead;
  s.phase = st.ph;
  s.strideLen = st.stride;
  s.turnRate = turnRate;
  s.jt = jumping ? jumpTimeOf(d, in.jumpT, T, speed) : 0;
  s.jT = jumping ? T : 0;
  s.landingTimer = st.landT;
  return s;
}

// ---------- pjl/view.js update ----------
void viewInit(const ViewData& d, ViewState& v) {
  v = ViewState();
  for (const auto& [name, dur] : d.clips) {
    (void)dur;
    v.weights[name] = 0;
    v.times[name] = 0;
  }
  if (v.weights.count("idle")) v.weights["idle"] = 1;
}

bool actionEnabled(const ViewState& v, const std::string& name) {
  const auto it = v.weights.find(name);
  return it != v.weights.end() && it->second > 0.002;
}

void viewStep(const ViewData& d, ViewState& v, const Snap& s, double dt) {
  const bool jumping = s.mode == "takeoff" || s.mode == "air";
  std::map<std::string, double> target;
  for (const auto& [name, w] : v.weights) {
    (void)w;
    target[name] = 0;
  }
  auto add = [&](const std::string& k, double w) {
    auto it = target.find(k);
    if (it != target.end()) it->second = it->second + w;
  };
  auto has = [&](const std::string& k) { return v.weights.count(k) != 0; };
  const double wantRight = s.lead == 'R' ? 1 : 0;
  v.leadBlend = damp(v.leadBlend, wantRight, 10, dt);
  if (jumping && !v.wasJumping) {
    // ET : jump_gallop au-delà de 8 m/s ; à défaut, jump_gallop.
    const char* want = s.speed > 8 ? "jump_gallop" : "jump_canter";
    v.jumpClip = d.jumps.count(want) ? want : d.jumps.count("jump_gallop") ? "jump_gallop" : "";
    v.jumpMirror = s.lead == 'L';
    v.postLand = -1;
  }
  if (!jumping && v.wasJumping) v.postLand = 0;
  v.wasJumping = jumping;
  const JumpClip* j = v.jumpClip.empty() ? nullptr : &d.jumps.at(v.jumpClip);
  double rootY = 0;
  if (jumping && j) {
    const double T = std::max(0.3, s.jT);
    const double jt = s.jt;
    double ct;
    if (jt < 0)
      ct = j->toeOff + jt * 1.0;
    else
      ct = j->toeOff + (jt / T) * (j->foreLand - j->toeOff);
    v.jumpTime = clampv(ct, 0, j->end);
    v.lastJt = jt;
    v.jumpWeight = damp(v.jumpWeight, 1, 18, dt);
    const double rise = pelvisRise(*j, v.jumpTime);
    rootY = s.y - d.c.com - rise * d.scale;
  } else if (v.postLand >= 0 && j) {
    v.postLand += dt;
    v.jumpTime = j->foreLand + v.postLand;
    const double blendOut = smoothstep(j->nextFore - j->foreLand - 0.18, j->nextFore - j->foreLand + 0.05, v.postLand);
    v.jumpWeight = 1 - blendOut;
    const double rise = pelvisRise(*j, std::min(v.jumpTime, j->end));
    rootY = std::max(-0.08, -rise * d.scale) * v.jumpWeight;
    if (blendOut >= 1 || v.jumpTime >= j->end) {
      v.postLand = -1;
      v.jumpWeight = 0;
    }
  } else
    v.jumpWeight = damp(v.jumpWeight, 0, 12, dt);
  if (s.mode == "refusal") {
    if (v.refusalT < 0) v.refusalT = 0;
    v.refusalT += dt;
  } else if (v.refusalT >= 0)
    v.refusalT = -1;
  const double refusalW = v.refusalT >= 0 ? clampv(v.refusalT / 0.15, 0, 1) * (1 - smoothstep(1.6, 2.0, v.refusalT)) : 0;
  const double groundW = (1 - v.jumpWeight) * (1 - refusalW);
  double gwIdle = 0;
  std::map<std::string, double> gw = {{"walk", 0}, {"trot", 0}, {"canter", 0}, {"gallop", 0}};
  if (s.gait == "halt" || s.speed < 0.25)
    gwIdle = 1;
  else if (s.gait == "walk")
    gw["walk"] = 1;
  else if (s.gait == "trot")
    gw["trot"] = 1;
  else {
    const double g = smoothstep(3.55, 4.45, s.strideLen);
    gw["canter"] = 1 - g;
    gw["gallop"] = g;
  }
  const double turn = clampv(s.turnRate / 0.95, -1, 1);
  const double turnW = std::min(1.0, std::fabs(turn)) * 0.85;
  const std::string side = turn > 0 ? "L90" : "R90";
  for (const char* kc : {"walk", "trot", "canter", "gallop"}) {
    const std::string k = kc;
    const double w = gw[k] * groundW;
    if (w <= 0) continue;
    const bool hasMirror = has(k + "_M");
    const double rightW = hasMirror ? v.leadBlend : 1;
    const double leftW = hasMirror ? 1 - v.leadBlend : 0;
    const std::string straightR = k, turnR = k + "_" + side;
    const std::string straightL = k + "_M", turnL = k + "_" + side + "_M";
    add(straightR, w * rightW * (1 - turnW));
    add(has(turnR) ? turnR : straightR, w * rightW * turnW);
    if (leftW > 0) {
      add(straightL, w * leftW * (1 - turnW));
      add(has(turnL) ? turnL : straightL, w * leftW * turnW);
    }
  }
  add("idle", gwIdle * groundW);
  if (j) {
    const std::string jn = j->name + (v.jumpMirror ? "_M" : "");
    add(has(jn) ? jn : j->name, v.jumpWeight);
  }
  add("brake", refusalW);
  const double lambda = 14;
  for (auto& [name, wcur] : v.weights) {
    const double w = damp(wcur, target[name], lambda, dt);
    wcur = w;
    if (!(w > 0.002)) continue;
    const auto du = d.clips.find(name);
    const double dur = du == d.clips.end() ? 0 : du->second;
    const std::string k = family(name);
    if (name.rfind("jump", 0) == 0)
      v.times[name] = std::min(v.jumpTime, dur - 1e-3);
    else if (name == "brake")
      v.times[name] = std::min(v.refusalT * 1.15 + 0.2, dur - 1e-3);
    else if (name == "idle") {
      v.idleTime = jsMod(v.idleTime + dt, dur);
      v.times[name] = v.idleTime;
    } else if (isGaitFamily(k)) {
      const GaitInfo& info = d.gaitInfo.at(k);
      const double ph = jsMod(s.phase + info.offset, 1);
      v.times[name] = ph * dur;
    }
  }
  v.bodyBaseY = damp(v.hasBodyBaseY ? v.bodyBaseY : v.bodyY, rootY, 30, dt);
  v.hasBodyBaseY = true;
  if (std::fabs(v.bodyBaseY - rootY) > 0.25) v.bodyBaseY = rootY;
  v.bodyY = v.bodyBaseY + v.contactOff;
  const double lean = clampv(s.roll, -0.3, 0.3) * 0.75 * (1 - v.jumpWeight);
  v.rotZ = damp(v.rotZ, -lean, 8, dt);
}

// ---------- pjlHorse.js _pushContact, _setContact ----------
double pushStep(const Consts& c, PushState& P, const PushIn& in, double contactOff) {
  if (!(in.jumpT >= 0) || !in.hasClip) {
    P.jumping = false;
    return 0;
  }
  double off = 0;
  if (!P.jumping) {
    double k = 1;
    if (in.nearBar && in.hasD) k = smoothstep(-1.6, -2.6, in.d);
    P.off = 0;
    P.tau = in.jumpT;
    P.jumping = true;
    P.k = k;
  }
  if (in.jumpTime < in.toeOff) {
    const double cur = contactOff;
    P.off = std::min(0.0, cur - std::min(in.hind, std::max(0.0, in.fore)));
    P.tau = in.jumpT;
    off = P.off;
  } else
    off = P.off * (1 - smoothstep(P.tau, P.tau + c.pushRelease, in.jumpT));
  return off * P.k;
}

void setContact(ViewState& v, double off) {
  v.bodyY += off - v.contactOff;
  v.contactOff = off;
}

// ---------- pjlHorse.js _barNeed ----------
Need barNeed(const Consts& c, const Obst& o, const std::vector<Hoof>& hoofs, const V3& piv0, const V3& piv1, const std::string& tag, double time,
             double dtIn, PrevMap& prev) {
  const double dt = std::max(1e-3, dtIn ? dtIn : 1.0 / 60);
  struct W {
    double s, u, y, x, z;
  };
  auto ws = [&](const V3& p) {
    return W{(p.x - o.x) * o.nx + (p.z - o.z) * o.nz, (p.x - o.x) * o.tx + (p.z - o.z) * o.tz, p.y - o.ground - c.hoofSole, p.x, p.z};
  };
  const W fl = ws(piv0), fr = ws(piv1);
  double lift = 0, lever = 1, wmax = 0;
  const double sg = signd(o.sign ? o.sign : 1);
  for (const Hoof& h : hoofs) {
    const W hp = ws(h.p);
    const std::string key = tag + h.name;
    const auto qi = prev.find(key);
    const bool hasQ = qi != prev.end();
    const Prev q = hasQ ? qi->second : Prev();
    prev[key] = Prev{hp.y, hp.s, time, o.id};
    if (std::fabs(hp.u) > o.w / 2 + 0.2) continue;
    const bool ok = hasQ && q.o == o.id && time > q.t && time - q.t < 0.1 && std::fabs(hp.s - q.s) < 1;
    const double vy = ok ? clampv((hp.y - q.y) / dt, -10, 10) : 0, vs = ok ? std::fabs(hp.s - q.s) / dt : 0;
    for (const ObBar& bar : o.bars) {
      if (!bar.mesh || bar.fall) continue;
      int i = -1;
      for (size_t r = 0; r < o.rails.size(); r++)
        if (std::fabs(o.rails[r] - bar.s) < 1e-3) {
          i = (int)r;
          break;
        }
      if (i < 0 || i >= (int)o.margins.size()) continue;
      const double m = o.margins[i];
      if (m < -c.rub) continue;
      const double d = (hp.s - bar.s) * sg;
      const double w = smoothstep(-1.6, -0.5, d) * (1 - smoothstep(0.15, 0.6, d));
      const double tc = d < 0 && vs > 1 ? std::min(0.35, -d / vs) : 0;
      const double y = hp.y + std::min(0.0, vy) * tc;
      const double needv = (bar.h + c.railR + clampv(m, 0, c.hindClearMax) - y) * w;
      if (needv > 0) wmax = std::max(wmax, w);
      if (needv > lift) {
        lift = needv;
        lever = std::max(0.8, jsHypot(hp.x - (fl.x + fr.x) / 2, hp.z - (fl.z + fr.z) / 2));
      }
    }
  }
  Need r;
  r.lift = lift;
  r.lever = lever;
  r.w = wmax;
  r.pivot = V3{(fl.x + fr.x) / 2, (fl.y + fr.y) / 2 + o.ground + c.hoofSole, (fl.z + fr.z) / 2};
  return r;
}

V3 rotateAbout(const V3& p, const V3& o, const V3& ax, double a) {
  // Quaternion setFromAxisAngle (three.js), puis Vector3.applyQuaternion.
  const double hs = std::sin(a / 2);
  const double qx = ax.x * hs, qy = ax.y * hs, qz = ax.z * hs, qw = std::cos(a / 2);
  const double vx = p.x - o.x, vy = p.y - o.y, vz = p.z - o.z;
  const double tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
  return V3{o.x + (vx + qw * tx + qy * tz - qz * ty), o.y + (vy + qw * ty + qz * tx - qx * tz), o.z + (vz + qw * tz + qx * ty - qy * tx)};
}

// ---------- pjlHorse.js _limbTuck ----------
void tuckStep(const Consts& c, TuckState& T, const Obst& o, TuckIn& in, PrevMap& prev, double applied[4]) {
  static const char* kToe[4] = {"toes_02_l", "toes_02_r", "fingers_02_l", "fingers_02_r"};
  static const int kToeIdx[4] = {2, 3, 0, 1};
  const double dt = in.dt ? in.dt : 1.0 / 60;
  for (int i = 0; i < 4; i++) {
    applied[i] = 0;
    const bool fore = i >= 2;
    if (!in.hasUp[i] || (fore && !in.jumping)) {
      T.a[i] = 0;
      continue;
    }
    const V3* piv = fore ? &in.toe[2] : &in.toe[0];
    V3& toe = in.toe[kToeIdx[i]];
    const double needv = barNeed(c, o, {Hoof{kToe[i], toe}}, piv[0], piv[1], "tuck:", in.time, in.dt, prev).lift;
    const double y0 = toe.y;
    double want = 0, sg = T.s[i] ? T.s[i] : 1;
    if (needv > 0.005) {
      const V3 p1 = rotateAbout(toe, in.up[i], in.ax, 0.1);
      const V3 dd{p1.x - toe.x, p1.y - toe.y, p1.z - toe.z};
      sg = fore ? (dd.x * in.fw.x + dd.y * in.fw.y + dd.z * in.fw.z <= 0 ? 1 : -1) : dd.y >= 0 ? 1 : -1;
      double lo = 0, hi = c.tuckMax;
      for (int k = 0; k < 8; k++) {
        const double mid = (lo + hi) / 2;
        const double dy = rotateAbout(toe, in.up[i], in.ax, mid * sg).y - y0;
        if (dy < needv)
          lo = mid;
        else
          hi = mid;
      }
      want = hi;
    }
    T.s[i] = sg;
    const double cur = T.a[i];
    T.a[i] = want > cur ? damp(cur, want, 30, dt) : damp(cur, want, 10, dt);
    if (T.a[i] > 1e-3) {
      applied[i] = T.a[i] * sg;
      toe = rotateAbout(toe, in.up[i], in.ax, applied[i]);
    }
  }
}

// ---------- pjlHorse.js _barClear ----------
void barClearReset(const ClearState& st, ViewState& v) {
  if (st.clr) {
    v.rotX = 0;
    v.bodyZ = 0;
  }
}

void barClearStep(const Consts& c, ClearState& st, bool jumping, const Need* hind, const V3* pivHindParent, const Need* fore, const V3* pivForeParent,
                  ViewState& v, double dtIn) {
  const double dt = dtIn ? dtIn : 1.0 / 60;
  const double tiltH = hind ? std::min(c.hindTiltMax, std::asin(clampv(hind->lift / hind->lever, 0, 1))) : 0;
  const double restH = hind && jumping ? std::min(c.hindLiftMax, std::max(0.0, hind->lift - hind->lever * std::sin(tiltH))) : 0;
  const double tiltF = fore ? std::min(c.foreTiltMax, std::asin(clampv(fore->lift / fore->lever, 0, 1))) : 0;
  st.a = damp(st.a, tiltH, 24, dt);
  st.y = damp(st.y, restH, 24, dt);
  st.f = damp(st.f, tiltF, 30, dt);
  if (st.a < 1e-3 && st.y < 1e-3 && st.f < 1e-3) {
    st.a = st.y = st.f = 0;
    st.clr = false;
    return;
  }
  st.clr = true;
  if (hind && pivHindParent) {
    st.pivF = *pivHindParent;
    st.hasPivF = true;
  }
  if (fore && pivForeParent) {
    st.pivH = *pivForeParent;
    st.hasPivH = true;
  }
  auto rot = [](double& Oy, double& Oz, const V3& P, double a) {
    const double oy = Oy - P.y, oz = Oz - P.z;
    Oy = P.y + oy * std::cos(a) - oz * std::sin(a);
    Oz = P.z + oy * std::sin(a) + oz * std::cos(a);
  };
  double Oy = v.bodyY, Oz = v.bodyZ;
  if (st.a > 0 && st.hasPivF) rot(Oy, Oz, st.pivF, st.a);
  if (st.f > 0 && st.hasPivH) rot(Oy, Oz, st.pivH, -st.f);
  v.rotX = st.a - st.f;
  v.bodyY = Oy + st.y;
  v.bodyZ = Oz;
}

}  // namespace strides::hview
