// Portage de src/entities/truckPhysics.js (TruckSim) ; voir Vehicle.h.
#include "StridesCore/Vehicle.h"

#include <algorithm>
#include <cmath>
#include <exception>
#include "StridesCore/MiniJson.h"

namespace strides {

namespace {
constexpr double G = 9.81;
constexpr double kPi = 3.14159265358979323846;
const double RPM_K = 60 / (2 * kPi);
double clampd(double v, double a, double b) { return v < a ? a : v > b ? b : v; }
double lerp(double a, double b, double t) { return a + (b - a) * t; }
double smooth(double e0, double e1, double x) {
  const double t = clampd((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
double sgn(double v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
double fuelDensity(const std::string& f) { return f == "petrol" ? 0.745 : 0.835; }
double numOr(const J& v, double d) { return v.t == J::Num ? v.n : d; }
}  // namespace

bool loadVehicles(const std::string& text, VehicleData& out, std::string& err) {
  try {
    const J root = JParser(text).parse();
    if (root["schema"].s != "strides.vehicles.v1") { err = "schéma inattendu"; return false; }
    out = VehicleData();
    for (const auto& [k, o] : root["specs"].o) {
      VehicleSpec s;
      s.name = o["name"].s;
      if (o["fuel"].t == J::Str) s.fuel = o["fuel"].s;
      s.drive = o["drive"].s;
      s.awd = o["awd"].t == J::Bool && o["awd"].b;
      s.massEmpty = numOr(o["massEmpty"], s.massEmpty); s.massHorse = numOr(o["massHorse"], 0);
      s.zFront = numOr(o["zFront"], s.zFront); s.zRear = numOr(o["zRear"], s.zRear); s.track = numOr(o["track"], s.track);
      s.cgEmpty = numOr(o["cgEmpty"], s.cgEmpty); s.cgHeight = numOr(o["cgHeight"], s.cgHeight); s.wheelR = numOr(o["wheelR"], s.wheelR);
      s.idle = numOr(o["idle"], s.idle); s.maxRpm = numOr(o["maxRpm"], s.maxRpm); s.cutRpm = numOr(o["cutRpm"], s.cutRpm);
      for (const J& p : o["torque"].a) s.torque.push_back({p.a[0].num(), p.a[1].num()});
      s.maxTorque = numOr(o["maxTorque"], s.maxTorque);
      // truckPhysics.js : spec.tank || 60, idleLph || 0.8, bsfc || 210 (valeurs de repli du web).
      s.tank = numOr(o["tank"], 60); s.idleLph = numOr(o["idleLph"], 0.8); s.bsfc = numOr(o["bsfc"], 210); s.refL100 = numOr(o["refL100"], 8);
      for (const J& g : o["gears"].a) s.gears.push_back(g.num());
      for (const J& g : o["gearTorque"].a) s.gearTorque.push_back(g.num());
      s.reverse = numOr(o["reverse"], s.reverse); s.finalDrive = numOr(o["final"], s.finalDrive); s.eff = numOr(o["eff"], s.eff);
      s.shiftTime = numOr(o["shiftTime"], s.shiftTime);
      if (o["shiftUp"].a.size() == 2) { s.shiftUp[0] = o["shiftUp"].a[0].num(); s.shiftUp[1] = o["shiftUp"].a[1].num(); }
      if (o["shiftDown"].a.size() == 2) { s.shiftDown[0] = o["shiftDown"].a[0].num(); s.shiftDown[1] = o["shiftDown"].a[1].num(); }
      s.shiftDownBrake = numOr(o["shiftDownBrake"], s.shiftDownBrake);
      s.startGear = (int)numOr(o["startGear"], 1);
      if (o["launch"].a.size() == 2) { s.launch[0] = o["launch"].a[0].num(); s.launch[1] = o["launch"].a[1].num(); }
      if (o["engineBrake"].a.size() == 2) { s.engineBrake[0] = o["engineBrake"].a[0].num(); s.engineBrake[1] = o["engineBrake"].a[1].num(); }
      s.holdRpm = numOr(o["holdRpm"], s.holdRpm);
      s.crr = numOr(o["crr"], s.crr); s.crrSoft = numOr(o["crrSoft"], s.crrSoft); s.cdA = numOr(o["cdA"], s.cdA); s.rho = numOr(o["rho"], s.rho);
      s.brakeDecel = numOr(o["brakeDecel"], s.brakeDecel);
      s.brakeRise = numOr(o["brakeRise"], 2.6);  // s.brakeRise || 2.6 (freins à air du camion)
      s.mu = numOr(o["mu"], s.mu); s.muSoft = numOr(o["muSoft"], s.muSoft);
      s.maxSteer = numOr(o["maxSteer"], s.maxSteer); s.steerRate = numOr(o["steerRate"], s.steerRate); s.aLatSteer = numOr(o["aLatSteer"], s.aLatSteer);
      s.limiter = numOr(o["limiter"], s.limiter); s.cornerF = numOr(o["cornerF"], s.cornerF); s.cornerR = numOr(o["cornerR"], s.cornerR);
      if (s.gears.empty() || s.torque.empty()) { err = "modèle " + k + " incomplet"; return false; }
      while (s.gearTorque.size() < s.gears.size()) s.gearTorque.push_back(1);
      out.specs[k] = s;
    }
    for (const auto& [k, o] : root["geometry"].o) {
      VehicleGeometry g;
      g.L = numOr(o["L"], g.L); g.W = numOr(o["W"], g.W); g.H = numOr(o["H"], g.H); g.zc = numOr(o["zc"], 0); g.wb = numOr(o["wb"], g.wb);
      g.r = numOr(o["r"], g.r); g.doorX = numOr(o["doorX"], g.doorX); g.doorZ = numOr(o["doorZ"], g.doorZ); g.camDist = numOr(o["camDist"], g.camDist);
      g.hw = numOr(o["hw"], g.hw); g.hd = numOr(o["hd"], g.hd);
      out.geometry[k] = g;
    }
    out.truckX = numOr(root["truckHome"]["x"], 0);
    out.truckZ = numOr(root["truckHome"]["z"], 0);
    out.truckHeading = numOr(root["truckHome"]["heading"], 0);
    if (out.specs.empty()) { err = "aucun modèle"; return false; }
    return true;
  } catch (const std::exception& e) {
    err = e.what();
    return false;
  }
}

double torqueAt(const VehicleSpec& s, double rpm) {
  const auto& c = s.torque;
  if (c.empty()) return 0;
  if (rpm <= c[0].first) return c[0].second;
  for (size_t i = 1; i < c.size(); ++i)
    if (rpm <= c[i].first) {
      const auto [r0, t0] = c[i - 1];
      const auto [r1, t1] = c[i];
      return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0);
    }
  return 0;
}

TruckSim::TruckSim(const VehicleSpec& s) : spec(s) { reset(); }

void TruckSim::reset() {
  vx = vy = r = steer = rpm = 0;
  gear = shiftTo = spec.startGear;
  shiftT = clutch = 0;
  sinceShift = 10;
  throttle = brake = ax = ay = jerk = 0;
  engineOn = false;
  slope = soft = revT = 0;
  shifted = 0;
  load = wheelSpin = 0;
  braking = false;
  fuelL = spec.tank;
  fuelLph = tripM = tripL = 0;
  dry = false;
}

double TruckSim::cgZ() const {
  const double me = spec.massEmpty, mh = horses * spec.massHorse;
  return (me * spec.cgEmpty + mh * (spec.zRear + 0.35)) / (me + mh);
}

double TruckSim::ratio(int g) const {
  const double gr = g < 0 ? spec.reverse : spec.gears[(size_t)std::clamp(g - 1, 0, (int)spec.gears.size() - 1)];
  return gr * spec.finalDrive;
}

double TruckSim::steerLimit(double v) const {
  const double L = spec.zFront - spec.zRear;
  const double v2 = std::max(v * v, 1e-3);
  return std::min(spec.maxSteer, std::atan((L * spec.aLatSteer) / v2));
}

void TruckSim::startEngine() {
  if (engineOn || dry) return;
  engineOn = true;
  rpm = spec.idle * 0.6;
  gear = spec.startGear;
}

double TruckSim::refuel(double litres) {
  const double room = std::max(0.0, spec.tank - fuelL);
  const double add = std::min(room, litres);
  fuelL += add;
  if (fuelL > 0.5) dry = false;
  return add;
}

std::string TruckSim::gearLabel() const {
  if (!engineOn) return "P";
  if (gear < 0) return "R";
  if (std::fabs(vx) < 0.15 && throttle < 0.02) return "N";
  return "D" + std::to_string(gear);
}

void TruckSim::step(double dt, const DriveInput* input) {
  const int n = std::max(1, (int)std::ceil(dt / (1.0 / 120)));
  const double h = dt / n;
  shifted = 0;
  const double ax0 = ax;
  for (int i = 0; i < n; ++i) sub(h, input);
  jerk = (ax - ax0) / std::max(dt, 1e-4);
  tripM += std::fabs(vx) * dt;
  wheelSpin += (vx / spec.wheelR) * dt;
  if (wheelSpin > 1e4 || wheelSpin < -1e4) wheelSpin = std::fmod(wheelSpin, kPi * 2);
}

void TruckSim::sub(double dt, const DriveInput* input) {
  const VehicleSpec& s = spec;
  const double m = mass();
  const double L = s.zFront - s.zRear;
  const double t = input ? clampd(input->throttle, -1, 1) : 0;
  const bool park = !input || input->park;
  const double v = vx;
  const double av = std::fabs(v);

  // Sélecteur : avant / frein / marche arrière (inversion seulement à l'arrêt).
  double thr = 0, brk = 0;
  if (park || !engineOn) {
    brk = 1;
  } else if (gear > 0) {
    if (t > 0.05) thr = t;
    else if (t < -0.05) {
      if (v > 0.35) brk = -t;
      else {
        brk = 1;
        revT += dt;
        if (revT > 0.45 && av < 0.2) engage(-1);
      }
    }
  } else {
    if (t < -0.05) thr = -t;
    else if (t > 0.05) {
      if (v < -0.35) brk = t;
      else {
        brk = 1;
        revT += dt;
        if (revT > 0.2 && av < 0.2) engage(1);
      }
    }
  }
  if (std::fabs(t) <= 0.05 || (gear > 0 ? t > 0.05 : t < -0.05)) revT = 0;
  if (std::fabs(t) <= 0.05 && av < 0.25) brk = std::max(brk, 1.0);
  throttle += clampd(thr - throttle, -4 * dt, 2.2 * dt);
  if (!engineOn) throttle = 0;
  if (av < 0.25 && brk >= 1) brake = 1;
  else brake += clampd(brk - brake, -5 * dt, s.brakeRise * dt);
  brk = brake;
  braking = brk > 0.05 && av > 0.3;

  // Moteur et transmission.
  double Tw = 0;
  if (engineOn) {
    const double rt = ratio();
    const double wheelRpm = (av / s.wheelR) * rt * RPM_K;
    const int startGear = slope > 0.07 ? 1 : s.startGear;
    sinceShift += dt;
    if (shiftT > 0) {
      shiftT -= dt;
      if (shiftT <= 0) gear = shiftTo;
    } else if (gear > 0) {
      if (av < 0.6 && gear != startGear) gear = shiftTo = startGear;
      else if (sinceShift > 1.0) {
        const double th = throttle;
        const double up = lerp(s.shiftUp[0], s.shiftUp[1], th);
        const double down = brake > 0.2 ? s.shiftDownBrake : lerp(s.shiftDown[0], s.shiftDown[1], th);
        if (wheelRpm > up && gear < (int)s.gears.size()) shift(gear + 1);
        else if (wheelRpm < down && gear > startGear) shift(gear - 1);
      }
    }
    const double launch = lerp(s.launch[0], s.launch[1], throttle);
    double rpmTarget, transmit;
    if (throttle <= 0.02 && av < 0.3) clutch = 0;
    if (shiftT > 0) {
      const double r2 = ratio(shiftTo);
      rpmTarget = std::max(s.idle, (av / s.wheelR) * r2 * RPM_K);
      transmit = 0;
    } else if (wheelRpm < launch && throttle > 0.02) {
      clutch = std::min(1.0, clutch + dt * 1.3);
      rpmTarget = launch;
      transmit = clutch * clutch;
    } else if (wheelRpm < s.idle) {
      rpmTarget = s.idle + throttle * s.holdRpm;
      transmit = throttle > 0.02 ? clutch : 0;
    } else {
      rpmTarget = wheelRpm;
      transmit = 1;
      clutch = 1;
    }
    rpm += (rpmTarget - rpm) * std::min(1.0, dt * (shiftT > 0 ? 9 : 14));
    rpm = clampd(rpm, s.idle * 0.92, s.cutRpm);
    double th = throttle;
    if (av > s.limiter - 0.6) th *= clampd((s.limiter + 0.2 - av) / 0.8, 0, 1);
    const double gov = clampd((s.cutRpm - rpm) / (s.cutRpm - s.maxRpm), 0, 1);
    const double cap = gear < 0 ? 0.5 : s.gearTorque[(size_t)std::clamp(gear - 1, 0, (int)s.gearTorque.size() - 1)];
    double Te = std::min(torqueAt(s, rpm), s.maxTorque * cap) * th * gov;
    if (th < 0.02 && wheelRpm > s.idle + 80 && shiftT <= 0) Te = -(s.engineBrake[0] + s.engineBrake[1] * (rpm - s.idle));
    load = clampd(th * gov, 0, 1);
    Tw = Te * transmit * rt * s.eff * (gear < 0 ? -1 : 1);
    const double P = std::max(0.0, Te) * (rpm / RPM_K) / 1000;
    fuelLph = Te < 0 ? 0 : s.idleLph * (rpm / s.idle) + (P * s.bsfc) / (fuelDensity(s.fuel) * 1000);
    fuelL -= (fuelLph * dt) / 3600;
    tripL += (fuelLph * dt) / 3600;
    if (fuelL <= 0) {
      fuelL = 0;
      dry = true;
      engineOn = false;
    }
  } else {
    rpm = std::max(0.0, rpm - dt * 900);
    load = 0;
    fuelLph = 0;
  }

  // Efforts longitudinaux.
  const double mu = lerp(s.mu, s.muSoft, soft);
  const double zcg = cgZ();
  const double a = s.zFront - zcg, b = zcg - s.zRear;
  const double Fzr = (m * G * a) / L;
  const double Fzf = (m * G * b) / L;
  double Fx = Tw / s.wheelR;
  const double Fzd = s.awd ? Fzf + Fzr : s.drive == "front" ? Fzf : Fzr;
  Fx = clampd(Fx, -mu * Fzd, mu * Fzd);
  const double crr = lerp(s.crr, s.crrSoft, soft);
  const double roll = crr * m * G * std::tanh(v / 0.4);
  const double aero = 0.5 * s.rho * s.cdA * v * av;
  const double grade = -m * G * slope;
  const double brakeF = brk * m * s.brakeDecel * std::min(1.0, mu / 0.8);
  const double meff = m * 1.06;
  const double acc = (Fx - roll - aero + grade) / meff;
  double nv = v + acc * dt;
  const double bdv = (brakeF / meff) * dt;
  if (std::fabs(nv) <= bdv) nv = 0;
  else nv -= sgn(nv) * bdv;
  if (Tw == 0 && v != 0 && sgn(nv) != sgn(v)) nv = 0;
  ax += ((nv - v) / dt - ax) * std::min(1.0, dt * 30);
  vx = nv;

  // Direction.
  const double st = input ? clampd(input->steer, -1, 1) : 0;
  const double target = -st * steerLimit(std::fabs(vx));
  const double rate = s.steerRate * (std::fabs(target) < std::fabs(steer) ? 1.25 : 1);
  steer += clampd(target - steer, -rate * dt, rate * dt);

  // Latéral : cinématique (lent) fondu dans le modèle bicyclette (rapide).
  const double vxs = vx;
  const double d = steer;
  const double rKin = (vxs * std::tan(d)) / L;
  const double vyKin = rKin * b;
  const double k = vxs > 0 ? smooth(3, 6.5, vxs) : 0;
  const double vyPrev = vy;
  if (k > 0) {
    const double Iz = 1.25 * m * a * b;
    const double Cf = s.cornerF * Fzf, Cr = s.cornerR * Fzr;
    const double af = std::atan2(vy + a * r, vxs) - d;
    const double ar = std::atan2(vy - b * r, vxs);
    const double Fyf = -mu * Fzf * std::tanh((Cf * af) / (mu * Fzf));
    const double Fyr = -mu * Fzr * std::tanh((Cr * ar) / (mu * Fzr));
    const double cd = std::cos(d);
    const double dvy = (Fyf * cd + Fyr) / m - vxs * r;
    const double dr = (a * Fyf * cd - b * Fyr) / Iz;
    vy += dvy * dt;
    r += dr * dt;
  }
  vy = lerp(vyKin, vy, k);
  r = lerp(rKin, r, k);
  ay += ((vy - vyPrev) / dt + vxs * r - ay) * std::min(1.0, dt * 20);

  // Intégration : centre de gravité puis centre du véhicule.
  const double hd = heading;
  const double fx = std::sin(hd), fz = std::cos(hd);
  const double lx = std::cos(hd), lz = -std::sin(hd);
  const double cx = x + fx * zcg + (vxs * fx + vy * lx) * dt;
  const double cz = z + fz * zcg + (vxs * fz + vy * lz) * dt;
  heading = hd + r * dt;
  x = cx - std::sin(heading) * zcg;
  z = cz - std::cos(heading) * zcg;
}

void TruckSim::shift(int g) {
  shiftTo = g;
  shiftT = spec.shiftTime;
  sinceShift = 0;
  shifted = g > gear ? 1 : -1;
}

void TruckSim::engage(int g) {
  gear = shiftTo = g;
  shiftT = 0;
  sinceShift = 0;
  revT = 0;
  shifted = 2;
}

void TruckSim::impact(double k) {
  vx *= k;
  vy *= 0.3;
  r *= 0.3;
}

std::pair<double, double> TruckSim::ackermann() const {
  const double L = spec.zFront - spec.zRear;
  const double d = steer;
  if (std::fabs(d) < 1e-4) return {d, d};
  const double R = L / std::tan(d);
  return {std::atan(L / (R - spec.track / 2)), std::atan(L / (R + spec.track / 2))};
}

void vehicleDoor(const VehicleGeometry& g, double x, double z, double h, double& ox, double& oz) {
  ox = x + std::sin(h) * g.doorZ + std::cos(h) * g.doorX;
  oz = z + std::cos(h) * g.doorZ - std::sin(h) * g.doorX;
}

}  // namespace strides
