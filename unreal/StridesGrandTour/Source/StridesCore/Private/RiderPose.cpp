// Monte de la cavalière par les règles du web, côté jeu (essai de monte, voie A, étape 6). Voir RiderPose.h.
#include "StridesCore/RiderPose.h"

#include <cmath>
#include <cstring>

#include "StridesCore/MiniJson.h"

namespace strides::rider {

namespace {
Vec3 v3(const J& a) { return Vec3{a[0].num(), a[1].num(), a[2].num()}; }
// three.js Quaternion.multiplyQuaternions (a × b : b d'abord, puis a).
Quat qmul(const Quat& a, const Quat& b) {
  return Quat{a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y, a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
              a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x, a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z};
}
}  // namespace

bool rigFromJson(const J& setup, Rig& rig, std::string& err) {
  rig = Rig{};
  const J& rest = setup["rest"];
  if (rest.t != J::Obj) {
    err = "rest absent";
    return false;
  }
  for (int b = 0; b < BoneCount; b++) {
    const J& r = rest[boneName(b)];
    if (r.t != J::Arr || r.a.size() != 3) {
      err = std::string("repos absent : ") + boneName(b);
      return false;
    }
    rig.rest[b] = v3(r);
  }
  const J& info = setup["info"].t == J::Obj ? setup["info"] : setup["rig"];
  const char* keys[6] = {"thighLen", "shinLen", "upperArmLen", "foreArmLen", "ankleY", "seatToHips"};
  for (const char* k : keys)
    if (info[k].t != J::Num) {
      err = std::string("rigInfo : ") + k + " absent";
      return false;
    }
  if (info["toe"].t != J::Arr || setup["fist"].t != J::Arr || setup["scale"].t != J::Num) {
    err = "toe, fist ou scale absent";
    return false;
  }
  rig.info.thighLen = info["thighLen"].num();
  rig.info.shinLen = info["shinLen"].num();
  rig.info.upperArmLen = info["upperArmLen"].num();
  rig.info.foreArmLen = info["foreArmLen"].num();
  rig.info.ankleY = info["ankleY"].num();
  rig.info.seatToHips = info["seatToHips"].num();
  rig.info.toe = v3(info["toe"]);
  rig.fist = v3(setup["fist"]);
  rig.hasFistR = setup["fistR"].t == J::Arr;
  if (rig.hasFistR) rig.fistR = v3(setup["fistR"]);
  rig.scale = setup["scale"].num();
  return true;
}

RideFit fitFromJson(const J& F, double k) {
  RideFit fit;
  const auto sc = [&](const char* key, double v) { return (k == 1 || !std::strcmp(key, "kneeOut") || !std::strcmp(key, "mountKneeOut")) ? v : v * k; };
  const auto arr = [&](const char* key) {
    std::vector<double> out;
    const J& a = F[key];
    if (a.t != J::Arr) return out;
    for (const J& x : a.a) out.push_back(k == 1 ? x.num() : x.num() * k);
    return out;
  };
  if (F["stirrupX"].t == J::Num) fit.stirrupX = sc("stirrupX", F["stirrupX"].num());
  if (F["stirrupY"].t == J::Num) fit.stirrupY = sc("stirrupY", F["stirrupY"].num());
  if (F["stirrupZ"].t == J::Num) fit.stirrupZ = sc("stirrupZ", F["stirrupZ"].num());
  if (F["kneeOut"].t == J::Num) fit.kneeOut = sc("kneeOut", F["kneeOut"].num());
  if (F["handX"].t == J::Num) fit.handX = sc("handX", F["handX"].num());
  if (F["handY"].t == J::Num) fit.handY = sc("handY", F["handY"].num());
  if (F["handZ"].t == J::Num) fit.handZ = sc("handZ", F["handZ"].num());
  if (F["legClear"].t == J::Num) fit.legClear = sc("legClear", F["legClear"].num());
  if (F["mountKneeOut"].t == J::Num) {
    fit.hasMountKneeOut = true;
    fit.mountKneeOut = F["mountKneeOut"].num();
  }
  fit.flankL = arr("flankL");
  fit.flankR = arr("flankR");
  fit.flank = arr("flank");
  fit.crest = arr("crest");
  return fit;
}

RideInputs rideInputsFromJson(const J& I, double k) {
  RideInputs a;
  a.dt = I["dt"].num();
  a.t = I["t"].num();
  a.horseSpeed = I["hs"].num();
  a.gaitPhase = I["ph"].num();
  a.turn = I["turn"].num();
  a.jump = I["jump"].num();
  a.hasLandT = !I["landT"].isNull();
  a.landT = a.hasLandT ? I["landT"].num() : -1;
  a.hindDown = I["hindDown"].b;
  a.bob = I["bob"].num();
  a.pitch = I["pitch"].num();
  const J& w = I["wave"];
  a.wave = w.t == J::Bool ? w.b : (w.t == J::Num && w.n != 0);
  a.hasFit = I["fit"].t == J::Obj;
  if (a.hasFit) a.fit = fitFromJson(I["fit"], k);
  return a;
}

RideHorseSample horseSampleFromJson(const J& hz, const J& mx) {
  RideHorseSample h;
  const J& S = hz["S"];
  // Os d'attache : matrice monde recomposée à l'échelle 1 (repère S d'O1) ; colonne z = (e[8], e[9], e[10]) de compose.
  const double x = S[3].num(), y = S[4].num(), z = S[5].num(), w = S[6].num();
  const double x2 = x + x, y2 = y + y, z2 = z + z;
  const double xx = x * x2, xz = x * z2, yy = y * y2, yz = y * z2, wx = w * x2, wy = w * y2;
  h.attachY = S[1].num();
  h.attachZ = Vec3{xz + wy, yz - wx, 1 - (xx + yy)};
  h.horseY = hz["p"][1].num();
  h.contactOff = mx["co"].isNull() ? 0 : mx["co"].num();
  h.speed = hz["v"].num();
  h.phase = hz["ph"].num();
  h.postOffset = 0;  // Comète : pas de riderPostOffset
  h.jumpT = hz["jT"].num();
  h.hindDown = hz["hd"].b;
  return h;
}

RideFitMeters fitMetersFromJson(const J& fit0, const J& hz) {
  RideFitMeters f;
  f.stirrupX = fit0["stirrupX"].num();
  f.stirrupY = fit0["stirrupY"].num();
  f.stirrupZ = fit0["stirrupZ"].num();
  f.kneeOut = fit0["kneeOut"].num();
  f.handX = fit0["handX"].num();
  f.handY = fit0["handY"].num();
  f.handZ = fit0["handZ"].num();
  f.legClear = fit0["legClear"].t == J::Num ? fit0["legClear"].num() : 0;
  f.hasMountKneeOut = fit0["mountKneeOut"].t == J::Num;
  f.mountKneeOut = f.hasMountKneeOut ? fit0["mountKneeOut"].num() : 0;
  for (const J& x : hz["fl"].a) f.flankL.push_back(x.num());
  for (const J& x : hz["fr"].a) f.flankR.push_back(x.num());
  for (const J& x : hz["cr"].a) f.crest.push_back(x.num());
  return f;
}

RidePoseS poseInSeat(const RiderRules& r) {
  RidePoseS out;
  for (int b = 0; b < BoneCount; b++) {
    const int p = boneParent(b);
    out.world[b] = p < 0 ? r.boneQuat(b) : qmul(out.world[p], r.boneQuat(b));
  }
  const RideSkeleton sk = r.skeleton();
  out.joints = sk.joints;
  for (int s = 0; s < 2; s++) {
    out.sole[s] = sk.sole[s];
    out.fist[s] = sk.fist[s];
  }
  return out;
}

RideDriver::RideDriver(const Rig& rig, const RideParams& params, bool hair) : C_(params), rules_(rig, params, hair), filt_(params) {}

void RideDriver::reset() {
  rules_.reset();
  filt_ = RideInputFilter(C_);
  hasPrev_ = false;
  prev_ = RideHorseSample{};
  prevFit_ = RideFitMeters{};
  frames_ = 0;
}

void RideDriver::seed(const RideInputs& first, const RideHorseSample& h, const RideFitMeters& fit) {
  reset();
  filt_.seed(first);
  rules_.step(first);
  prev_ = h;
  prevFit_ = fit;
  hasPrev_ = true;
  frames_ = 1;
}

RideInputs RideDriver::prepare(const RideHorseSample& hNow, const RideFitMeters& fitNow, double dt, bool wave) {
  // Retard d'une image : le cavalier lit le cheval tel qu'il était avant sa mise à jour de cette image.
  const RideHorseSample& h = hasPrev_ ? prev_ : hNow;
  const RideFitMeters& f = hasPrev_ ? prevFit_ : fitNow;
  const RideInputs a = filt_.next(h, f, rules_.rig().scale, dt, dt, wave);
  prev_ = hNow;
  prevFit_ = fitNow;
  hasPrev_ = true;
  return a;
}

void RideDriver::apply(const RideInputs& in) {
  rules_.step(in);
  frames_++;
}

}  // namespace strides::rider
