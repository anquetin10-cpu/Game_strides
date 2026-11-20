// Règles de monte (voir RiderRules.h) : src/entities/human/anim.js (pose « ride ») et src/entities/human.js
// animateRiding, ligne pour ligne. Les références « anim.js:N » renvoient au web v3 (c7268de). Les calculs de
// Three.js sont ceux de three 0.170.0 (Vector3, Quaternion, Matrix4), dans le même ordre d'opérations.
#include "StridesCore/RiderRules.h"

#include <cmath>
#include <limits>

#include "StridesCore/MathUtil.h"
#include "StridesCore/MiniJson.h"

// Pas de contraction a * b + c en FMA (Clang la fait par défaut, même sans optimisation) : le web arrondit chaque
// opération. Réglage rétabli en fin de fichier (compilation unifiée d'Unreal : il ne déborde pas sur les autres sources).
#if defined(__clang__)
#pragma float_control(push)
#pragma clang fp contract(off)
#endif

namespace strides::rider {
namespace {

constexpr double kTau = kPi * 2;  // TAU = Math.PI * 2
constexpr double kInf = std::numeric_limits<double>::infinity();
constexpr double kNaN = std::numeric_limits<double>::quiet_NaN();

// Math.min et Math.max (NaN propagé).
inline double jmin(double a, double b) { return std::isnan(a) || std::isnan(b) ? kNaN : (b < a ? b : a); }
inline double jmax(double a, double b) { return std::isnan(a) || std::isnan(b) ? kNaN : (b > a ? b : a); }
inline double lerp(double a, double b, double t) { return a + (b - a) * t; }
inline double frac(double x) { return x - std::floor(x); }
// `x || 0` en JavaScript : 0 pour NaN.
inline double orZero(double x) { return std::isnan(x) ? 0 : x; }

// ---------- Vector3 ----------
inline Vec3 vset(double x, double y, double z) { return Vec3{x, y, z}; }
inline Vec3 vadd(const Vec3& a, const Vec3& b) { return Vec3{a.x + b.x, a.y + b.y, a.z + b.z}; }
inline Vec3 vsub(const Vec3& a, const Vec3& b) { return Vec3{a.x - b.x, a.y - b.y, a.z - b.z}; }
inline Vec3 vmul(const Vec3& a, double s) { return Vec3{a.x * s, a.y * s, a.z * s}; }
inline Vec3 vdiv(const Vec3& a, double s) { return vmul(a, 1 / s); }  // divideScalar = multiplyScalar(1 / s)
inline Vec3 vaddScaled(const Vec3& a, const Vec3& v, double s) { return Vec3{a.x + v.x * s, a.y + v.y * s, a.z + v.z * s}; }
inline Vec3 vneg(const Vec3& a) { return Vec3{-a.x, -a.y, -a.z}; }
inline double vdot(const Vec3& a, const Vec3& b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
inline double vlenSq(const Vec3& a) { return a.x * a.x + a.y * a.y + a.z * a.z; }
inline double vlen(const Vec3& a) { return std::sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
inline Vec3 vnormalize(const Vec3& a) {
  const double l = vlen(a);
  return vdiv(a, l == 0 || std::isnan(l) ? 1 : l);  // divideScalar(this.length() || 1)
}
inline Vec3 vlerp(const Vec3& a, const Vec3& b, double t) {
  return Vec3{a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t};
}
inline Vec3 vcross(const Vec3& a, const Vec3& b) {
  return Vec3{a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}
inline double vdist(const Vec3& a, const Vec3& b) {
  const double dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return std::sqrt(dx * dx + dy * dy + dz * dz);
}
inline Vec3 applyQ(const Vec3& v, const Quat& q) {
  const double tx = 2 * (q.y * v.z - q.z * v.y);
  const double ty = 2 * (q.z * v.x - q.x * v.z);
  const double tz = 2 * (q.x * v.y - q.y * v.x);
  return Vec3{v.x + q.w * tx + q.y * tz - q.z * ty, v.y + q.w * ty + q.z * tx - q.x * tz, v.z + q.w * tz + q.x * ty - q.y * tx};
}

// ---------- Quaternion ----------
inline Quat qmul(const Quat& a, const Quat& b) {
  return Quat{a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y, a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
              a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x, a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z};
}
inline Quat qconj(const Quat& q) { return Quat{q.x * -1, q.y * -1, q.z * -1, q.w}; }  // invert() = conjugate()
inline Quat qAxis(const Vec3& axis, double angle) {
  const double half = angle / 2, s = std::sin(half);
  return Quat{axis.x * s, axis.y * s, axis.z * s, std::cos(half)};
}
// setFromEuler, ordre YXZ (qEuler d'anim.js).
inline Quat qEuler(double x, double y, double z) {
  const double c1 = std::cos(x / 2), c2 = std::cos(y / 2), c3 = std::cos(z / 2);
  const double s1 = std::sin(x / 2), s2 = std::sin(y / 2), s3 = std::sin(z / 2);
  return Quat{s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3};
}
// Matrix4.makeBasis(X, Y, Z) puis Quaternion.setFromRotationMatrix.
Quat qFromBasis(const Vec3& X, const Vec3& Y, const Vec3& Z) {
  const double m11 = X.x, m12 = Y.x, m13 = Z.x, m21 = X.y, m22 = Y.y, m23 = Z.y, m31 = X.z, m32 = Y.z, m33 = Z.z;
  const double trace = m11 + m22 + m33;
  Quat q;
  if (trace > 0) {
    const double s = 0.5 / std::sqrt(trace + 1.0);
    q.w = 0.25 / s;
    q.x = (m32 - m23) * s;
    q.y = (m13 - m31) * s;
    q.z = (m21 - m12) * s;
  } else if (m11 > m22 && m11 > m33) {
    const double s = 2.0 * std::sqrt(1.0 + m11 - m22 - m33);
    q.w = (m32 - m23) / s;
    q.x = 0.25 * s;
    q.y = (m12 + m21) / s;
    q.z = (m13 + m31) / s;
  } else if (m22 > m33) {
    const double s = 2.0 * std::sqrt(1.0 + m22 - m11 - m33);
    q.w = (m13 - m31) / s;
    q.x = (m12 + m21) / s;
    q.y = 0.25 * s;
    q.z = (m23 + m32) / s;
  } else {
    const double s = 2.0 * std::sqrt(1.0 + m33 - m11 - m22);
    q.w = (m21 - m12) / s;
    q.x = (m13 + m31) / s;
    q.y = (m23 + m32) / s;
    q.z = 0.25 * s;
  }
  return q;
}
inline Quat qNormalize(const Quat& q) {
  double l = std::sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (l == 0) return Quat{0, 0, 0, 1};
  l = 1 / l;
  return Quat{q.x * l, q.y * l, q.z * l, q.w * l};
}
// Quaternion.slerp(qb, t) : this = a. Trois branches selon cosHalfTheta, reproduites telles quelles (o2.md §1).
Quat qSlerp(const Quat& a, const Quat& qb, double t) {
  if (t == 0) return a;
  if (t == 1) return qb;
  const double x = a.x, y = a.y, z = a.z, w = a.w;
  double cosHalfTheta = w * qb.w + x * qb.x + y * qb.y + z * qb.z;
  Quat r;
  if (cosHalfTheta < 0) {
    r = Quat{-qb.x, -qb.y, -qb.z, -qb.w};
    cosHalfTheta = -cosHalfTheta;
  } else {
    r = qb;
  }
  if (cosHalfTheta >= 1.0) return Quat{x, y, z, w};
  const double sqrSinHalfTheta = 1.0 - cosHalfTheta * cosHalfTheta;
  if (sqrSinHalfTheta <= std::numeric_limits<double>::epsilon()) {
    const double s = 1 - t;
    return qNormalize(Quat{s * x + t * r.x, s * y + t * r.y, s * z + t * r.z, s * w + t * r.w});
  }
  const double sinHalfTheta = std::sqrt(sqrSinHalfTheta);
  const double halfTheta = std::atan2(sinHalfTheta, cosHalfTheta);
  const double ratioA = std::sin((1 - t) * halfTheta) / sinHalfTheta, ratioB = std::sin(t * halfTheta) / sinHalfTheta;
  return Quat{x * ratioA + r.x * ratioB, y * ratioA + r.y * ratioB, z * ratioA + r.z * ratioB, w * ratioA + r.w * ratioB};
}

// ---------- Matrix4 (compose, multiplyMatrices, Vector3.applyMatrix4) ----------
struct M4 {
  double e[16];
};
M4 compose(const Vec3& p, const Quat& q, double sx, double sy, double sz) {
  const double x = q.x, y = q.y, z = q.z, w = q.w;
  const double x2 = x + x, y2 = y + y, z2 = z + z;
  const double xx = x * x2, xy = x * y2, xz = x * z2;
  const double yy = y * y2, yz = y * z2, zz = z * z2;
  const double wx = w * x2, wy = w * y2, wz = w * z2;
  M4 m;
  double* te = m.e;
  te[0] = (1 - (yy + zz)) * sx;
  te[1] = (xy + wz) * sx;
  te[2] = (xz - wy) * sx;
  te[3] = 0;
  te[4] = (xy - wz) * sy;
  te[5] = (1 - (xx + zz)) * sy;
  te[6] = (yz + wx) * sy;
  te[7] = 0;
  te[8] = (xz + wy) * sz;
  te[9] = (yz - wx) * sz;
  te[10] = (1 - (xx + yy)) * sz;
  te[11] = 0;
  te[12] = p.x;
  te[13] = p.y;
  te[14] = p.z;
  te[15] = 1;
  return m;
}
M4 mmul(const M4& A, const M4& B) {
  const double* ae = A.e;
  const double* be = B.e;
  const double a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
  const double a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
  const double a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
  const double a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];
  const double b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12];
  const double b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13];
  const double b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14];
  const double b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15];
  M4 m;
  double* te = m.e;
  te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
  te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
  te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
  te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;
  te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
  te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
  te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
  te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;
  te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
  te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
  te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
  te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;
  te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
  te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
  te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
  te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
  return m;
}
Vec3 applyM4(const Vec3& v, const M4& m) {
  const double* e = m.e;
  const double w = 1 / (e[3] * v.x + e[7] * v.y + e[11] * v.z + e[15]);
  return Vec3{(e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12]) * w, (e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13]) * w,
              (e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14]) * w};
}

// V8 Math.hypot à trois arguments (somme compensée, comme jsHypot de MathUtil.h).
double jsHypot3(double a, double b, double c) {
  if (std::isinf(a) || std::isinf(b) || std::isinf(c)) return kInf;
  if (std::isnan(a) || std::isnan(b) || std::isnan(c)) return kNaN;
  const double x = std::fabs(a), y = std::fabs(b), z = std::fabs(c);
  double m = x > y ? x : y;
  m = z > m ? z : m;
  if (m == 0) return 0;
  double sum = 0, comp = 0;
  for (const double v : {x, y, z}) {
    const double n = v / m;
    const double sq = n * n;
    const double summand = sq - comp;
    const double pre = sum + summand;
    const double grow = pre - sum;
    comp = grow - summand;
    sum = pre;
  }
  return std::sqrt(sum) * m;
}

const Vec3 kX{1, 0, 0}, kZv{0, 0, 1};
const int kClav[2] = {LClav, RClav}, kArm[2] = {LArm, RArm}, kFore[2] = {LFore, RFore}, kHand[2] = {LHand, RHand};
const int kFing[2] = {LFing, RFing}, kThigh[2] = {LThigh, RThigh}, kShin[2] = {LShin, RShin}, kFoot[2] = {LFoot, RFoot};
const int kToe[2] = {LToe, RToe};
inline double sideSign(int side) { return side == 0 ? 1 : -1; }

// ---------- anim.js:56-70 : cinématique directe du tronc et des racines de membres ----------
void forwardTrunk(const Rig& rig, RidePose& P) {
  const auto& rest = rig.rest;
  P.mqHips = P.q[Hips];
  P.mqSpine = qmul(P.mqHips, P.q[Spine]);
  P.mqChest = qmul(P.mqSpine, P.q[Chest]);
  P.mqNeck = qmul(P.mqChest, P.q[Neck]);
  P.mpSpine = vadd(applyQ(rest[Spine], P.mqHips), P.tg.hips);
  P.mpChest = vadd(applyQ(rest[Chest], P.mqSpine), P.mpSpine);
  for (int s = 0; s < 2; s++) {
    P.mqClav[s] = qmul(P.mqChest, P.q[kClav[s]]);
    P.mpClav[s] = vadd(applyQ(rest[kClav[s]], P.mqChest), P.mpChest);
    P.mpArm[s] = vadd(applyQ(rest[kArm[s]], P.mqClav[s]), P.mpClav[s]);
    P.mpThigh[s] = vadd(applyQ(rest[kThigh[s]], P.mqHips), P.tg.hips);
  }
}

// ---------- anim.js:75-102 : IK deux segments ----------
void ik2(const Vec3& root, const Quat& parentQ, const Vec3& upperRest, const Vec3& lowerRest, const Vec3& target,
         const Vec3& pole, double poleLocalZ, double bendSign, Quat& outUpper, Quat& outLower, Quat* outLowerModel) {
  const double a = vlen(upperRest), b = vlen(lowerRest);
  const Vec3 D = vsub(target, root);
  const double d = vlen(D);
  const double dc = clampd(d, std::abs(a - b) + 1e-4, (a + b) * 0.9995);
  const Vec3 u = d > 1e-6 ? vdiv(D, d) : vset(0, -1, 0);
  Vec3 v = vaddScaled(pole, u, -vdot(pole, u));
  if (vlenSq(v) < 1e-8) v = vaddScaled(vset(0, 0, poleLocalZ), u, -u.z * poleLocalZ);
  v = vnormalize(v);
  const double cosA = clampd((a * a + dc * dc - b * b) / (2 * a * dc), -1, 1);
  const double sinA = std::sqrt(1 - cosA * cosA);
  const Vec3 dir = vaddScaled(vmul(u, cosA), v, sinA);
  const Vec3 pdir = vaddScaled(vmul(u, -sinA), v, cosA);
  const Vec3 ly = vneg(dir);
  const Vec3 lz = vmul(pdir, poleLocalZ);
  const Vec3 lx = vcross(ly, lz);
  const Quat q1 = qFromBasis(lx, ly, lz);
  outUpper = qmul(qconj(parentQ), q1);
  const double cosK = clampd((a * a + b * b - dc * dc) / (2 * a * b), -1, 1);
  const double bend = kPi - std::acos(cosK);
  outLower = qAxis(kX, bend * bendSign);
  if (outLowerModel) *outLowerModel = qmul(q1, outLower);
}

// anim.js:105-111 : rotation modèle à partir de deux axes (avant = +Z local, haut = +Y local).
Quat lookQ(const Vec3& fwd, const Vec3& up) {
  const Vec3 z = vnormalize(fwd);
  const Vec3 x = vnormalize(vcross(up, z));
  const Vec3 y = vcross(z, x);
  return qFromBasis(x, y, z);
}

// anim.js:114-121
void solveLeg(const Rig& rig, RidePose& P, int s, const Vec3& footPos, const Quat& footQ, double toeAngle, const Vec3& pole) {
  ik2(P.mpThigh[s], P.mqHips, rig.rest[kShin[s]], rig.rest[kFoot[s]], footPos, pole, 1, 1, P.q[kThigh[s]], P.q[kShin[s]], &P.mqShin[s]);
  P.q[kFoot[s]] = qmul(qconj(P.mqShin[s]), footQ);
  P.q[kToe[s]] = qAxis(kX, -toeAngle);
}

// anim.js:123-128
void solveArm(const Rig& rig, RidePose& P, int s, const Vec3& handPos, const Vec3& pole, const Quat* handQ) {
  ik2(P.mpArm[s], P.mqClav[s], rig.rest[kFore[s]], rig.rest[kHand[s]], handPos, pole, -1, -1, P.q[kArm[s]], P.q[kFore[s]], &P.mqFore[s]);
  if (handQ) P.q[kHand[s]] = qmul(qconj(P.mqFore[s]), *handQ);
}

// anim.js:510-518 : dessus de l'encolure.
double crestAt(const std::vector<double>& crest, double z) {
  const double n = static_cast<double>(crest.size()) - 2;
  const double u = (z - crest[0]) / crest[1];
  if (u < 0 || u > n - 1) return -kInf;
  const double i = jmin(n - 2, std::floor(u));
  const size_t k = static_cast<size_t>(i);
  const double a = crest[2 + k], b = crest[3 + k];
  if (a < -8 || b < -8) return jmax(a, b) < -8 ? -kInf : jmax(a, b);
  return a + (b - a) * (u - i);
}

// anim.js:522-527 : demi-largeur du tronc à la hauteur y.
double flankAt(const std::vector<double>& flank, double y) {
  const double n = static_cast<double>(flank.size()) - 2;
  const double u = jmin(n - 1, jmax(0, (y - flank[0]) / flank[1]));
  const double i = jmin(n - 2, std::floor(u));
  const size_t k = static_cast<size_t>(i);
  return flank[2 + k] + (flank[3 + k] - flank[2 + k]) * (u - i);
}

// anim.js:530-540 : genou que donnera ik2 pour la hanche, la cheville et le pôle donnés.
Vec3 kneeOf(const Vec3& hip, const Vec3& foot, const Vec3& pole, double a, double b) {
  const Vec3 hd = vsub(foot, hip);
  double d = vlen(hd);
  if (d == 0 || std::isnan(d)) d = 1e-6;  // _hd.length() || 1e-6
  const double dc = clampd(d, std::abs(a - b) + 1e-4, (a + b) * 0.9995);
  const Vec3 hu = vdiv(hd, d);
  Vec3 hv = vaddScaled(pole, hu, -vdot(pole, hu));
  if (vlenSq(hv) < 1e-8) hv = vset(0, 0, 1);
  hv = vnormalize(hv);
  const double cosA = clampd((a * a + dc * dc - b * b) / (2 * a * dc), -1, 1);
  return vadd(vaddScaled(vmul(hu, cosA * a), hv, std::sqrt(1 - cosA * cosA) * a), hip);
}

// anim.js:542 : profil du côté de la jambe (flankL / flankR), sinon flank ; nul sans profil.
const std::vector<double>* flankOf(const RideFit& fit, double sg) {
  const std::vector<double>& side = sg > 0 ? fit.flankL : fit.flankR;
  if (!side.empty()) return &side;
  if (!fit.flank.empty()) return &fit.flank;
  return nullptr;
}

// anim.js:553 : cuisse à mi-longueur et aux trois quarts.
template <class Gap>
double thighGap(const Gap& gap, const Vec3& hip, const Vec3& knee, double margin) {
  return jmin(gap(vlerp(hip, knee, 0.5)), gap(vlerp(hip, knee, 0.75))) - margin;
}

// ---------- anim.js:555-626 : jambe collée au flanc sans le traverser ----------
void hugFlank(const RideParams& C, const RidePose& P, int side, double sg, Vec3& foot, Vec3& pole, const std::vector<double>& flank,
              double clr, const RigInfo& info, double xMax) {
  const Vec3& hip = P.mpThigh[side];
  const double a = info.thighLen, b = info.shinLen;
  const double POLE_OPEN = C.poleOpen;
  // < 0 : dans le flanc (1 cm de marge).
  const auto gap = [&](const Vec3& p) { return p.x * sg - (flankAt(flank, p.y) + clr + 0.01); };
  struct Gaps {
    double gk, gs;
  };
  const auto gaps = [&]() {
    const Vec3 hk = kneeOf(hip, foot, pole, a, b);
    double gs = 0;
    for (const double t : {0.35, 0.65}) gs = jmin(gs, gap(vlerp(hk, foot, t)));
    return Gaps{jmin(gap(hk), thighGap(gap, hip, hk, C.thighMargin)), gs};
  };
  Gaps g = gaps();
  if (g.gs >= -1e-4 && g.gk >= -1e-4) return;
  // 1. Genou : pôle tourné vers l'extérieur, sans que le genou dépasse la cheville ni au-delà de POLE_OPEN.
  const double py = pole.y;
  const auto setPole = [&](double px) { pole = vset(sg * px, py, std::sqrt(jmax(0.0001, 1 - px * px - py * py))); };
  const double px0 = jmin(pole.x * sg, POLE_OPEN);
  const auto room = [&](double px) {
    setPole(px);
    return kneeOf(hip, foot, pole, a, b).x * sg < foot.x * sg + 0.01;
  };
  double pxMax = POLE_OPEN;
  if (!room(pxMax)) {
    double lo = px0, hi = POLE_OPEN;
    if (!room(lo)) {
      hi = lo;
    } else {
      for (int i = 0; i < 14; i++) {
        const double m = (lo + hi) / 2;
        if (room(m)) lo = m;
        else hi = m;
      }
    }
    pxMax = lo;
  }
  const auto ok = [](const Gaps& r, bool atMax) { return r.gs >= -1e-4 && (r.gk >= -1e-4 || atMax); };
  setPole(px0);
  if (g.gk < -1e-4 && pxMax > px0 + 1e-4) {
    setPole(pxMax);
    if (gaps().gk >= -1e-4) {
      double lo = px0, hi = pxMax;
      for (int i = 0; i < 14; i++) {
        const double m = (lo + hi) / 2;
        setPole(m);
        if (gaps().gk >= -1e-4) hi = m;
        else lo = m;
      }
      setPole(hi);
    }
  }
  g = gaps();
  const bool atMax = pole.x * sg >= POLE_OPEN - 1e-3;
  if (ok(g, atMax)) return;
  // 2. Tibia : le pied s'écarte du strict nécessaire, jusqu'à xMax.
  const double x0 = foot.x * sg, room2 = jmax(0, jmin(xMax, x0 + 0.12) - x0);
  if (room2 > 1e-5) {
    foot.x = sg * (x0 + room2);
    if (ok(gaps(), atMax)) {
      double lo = 0, hi = room2;
      for (int i = 0; i < 14; i++) {
        const double m = (lo + hi) / 2;
        foot.x = sg * (x0 + m);
        if (ok(gaps(), atMax)) hi = m;
        else lo = m;
      }
      foot.x = sg * (x0 + hi);
      return;
    }
  }
  // 3. Pied à sa limite, tibia encore dans le flanc : le genou s'ouvre davantage, dans les mêmes limites.
  const double pxNow = pole.x * sg;
  double lim = POLE_OPEN;
  if (!room(lim)) {
    double lo = pxNow, hi = POLE_OPEN;
    for (int i = 0; i < 14; i++) {
      const double m = (lo + hi) / 2;
      if (room(m)) lo = m;
      else hi = m;
    }
    lim = lo;
  }
  if (lim <= pxNow + 1e-4) {
    setPole(pxNow);
    return;
  }
  setPole(lim);
  if (gaps().gs < -1e-4) return;
  double lo = pxNow, hi = lim;
  for (int i = 0; i < 14; i++) {
    const double m = (lo + hi) / 2;
    setPole(m);
    if (gaps().gs >= -1e-4) hi = m;
    else lo = m;
  }
  setPole(hi);
}

// ---------- anim.js:636-659 : continuité dans le temps de la jambe collée au flanc ----------
void hugMemory(const RideParams& C, RideState& R, const RidePose& P, int side, double sg, Vec3& foot, Vec3& pole,
               const std::vector<double>& flank, double clr, const RigInfo& info, double dt, double t) {
  R.hasHugMap = true;  // R.hug ||= {}
  const double py = pole.y;
  const double px = pole.x * sg, fx = foot.x * sg;
  if (R.hasHug[side] && t - R.hugT[side] < 0.25 && dt > 0) {
    const double mpx = R.hugPx[side], mfx = R.hugFx[side];
    const double apx = px < mpx ? jmax(px, mpx - C.hugRelax * dt) : jmin(px, mpx + C.hugOpen * dt);
    const double afx = fx < mfx ? jmax(fx, mfx - C.footRelax * dt) : jmin(fx, mfx + C.footOpen * dt);
    const double cpx = jmin(apx, 0.97);
    pole = vset(sg * cpx, py, std::sqrt(jmax(0.0001, 1 - cpx * cpx - py * py)));
    foot.x = sg * afx;
    // Contrôle : genou et tibia (35 et 65 %) hors du flanc à 1 cm près ; sinon, solution exacte.
    const Vec3& hip = P.mpThigh[side];
    const Vec3 hk = kneeOf(hip, foot, pole, info.thighLen, info.shinLen);
    const auto gap = [&](const Vec3& p) { return p.x * sg - (flankAt(flank, p.y) + clr); };
    double g = jmin(gap(hk), thighGap(gap, hip, hk, C.thighMargin));
    for (const double k : {0.35, 0.65}) g = jmin(g, gap(vlerp(hk, foot, k)));
    if (g < -0.01) {
      pole = vset(sg * px, py, std::sqrt(jmax(0.0001, 1 - px * px - py * py)));
      foot.x = sg * fx;
    }
  }
  R.hasHug[side] = true;
  R.hugPx[side] = pole.x * sg;
  R.hugFx[side] = foot.x * sg;
  R.hugT[side] = t;
}

}  // namespace

// ---------------------------------------------------------------------------------------------------------------
int boneParent(int bone) {
  static const int kParent[BoneCount] = {-1,    Root,   Hips,   Spine, Chest, Neck,   Head,   Chest,  LClav,
                                         LArm,  LFore,  LHand,  Chest, RClav, RArm,   RFore,  RHand,  Hips,
                                         LThigh, LShin, LFoot,  Hips,  RThigh, RShin, RFoot};
  return bone >= 0 && bone < BoneCount ? kParent[bone] : -1;
}
const char* boneName(int bone) {
  static const char* const kNames[BoneCount] = {"root",  "hips",  "spine", "chest", "neck",  "head",   "hairTail", "lClav", "lArm",
                                                "lFore", "lHand", "lFing", "rClav", "rArm",  "rFore",  "rHand",    "rFing", "lThigh",
                                                "lShin", "lFoot", "lToe",  "rThigh", "rShin", "rFoot", "rToe"};
  return bone >= 0 && bone < BoneCount ? kNames[bone] : "";
}

bool rideParamsFromJson(const J& data, RideParams& out, std::string& err) {
  RideParams p;
  const auto num = [&](const J& o, const char* k, double& v) {
    const J& x = o[k];
    if (x.t != J::Num) {
      if (err.empty()) err = std::string("valeur absente : ") + k;
      return;
    }
    v = x.n;
  };
  const auto vec = [&](const J& o, const char* k, Vec3& v) {
    const J& x = o[k];
    if (x.t != J::Arr || x.a.size() != 3) {
      if (err.empty()) err = std::string("vecteur absent : ") + k;
      return;
    }
    v = Vec3{x.a[0].n, x.a[1].n, x.a[2].n};
  };
  err.clear();
  const J& r = data["RIDE"];
  num(r, "postLift", p.postLift);
  num(r, "twoLift", p.twoLift);
  num(r, "jumpLift", p.jumpLift);
  num(r, "seatReach", p.seatReach);
  num(r, "riseReach", p.riseReach);
  num(r, "foldIn", p.foldIn);
  if (r["releaseIn"].t == J::Arr && r["releaseIn"].a.size() == 2) {
    p.releaseIn0 = r["releaseIn"].a[0].n;
    p.releaseIn1 = r["releaseIn"].a[1].n;
  } else if (err.empty()) {
    err = "valeur absente : releaseIn";
  }
  num(r, "holdMax", p.holdMax);
  num(r, "recover", p.recover);
  num(r, "handBack", p.handBack);
  num(r, "landFold", p.landFold);
  num(r, "hindFold", p.hindFold);
  num(r, "breathRate", p.breathRate);
  num(r, "breathChest", p.breathChest);
  num(r, "breathShoulder", p.breathShoulder);
  num(r, "idleShift", p.idleShift);
  num(r, "handSpread", p.handSpread);
  num(r, "handReach", p.handReach);
  num(r, "handClear", p.handClear);
  const J& a = data["anim"];
  num(a, "THIGH_MARGIN", p.thighMargin);
  num(a, "POLE_OPEN", p.poleOpen);
  num(a, "HUG_OPEN", p.hugOpen);
  num(a, "HUG_RELAX", p.hugRelax);
  num(a, "FOOT_OPEN", p.footOpen);
  num(a, "FOOT_RELAX", p.footRelax);
  const J& df = a["DEFAULT_FIT"];
  num(df, "stirrupX", p.defaultFit.stirrupX);
  num(df, "stirrupY", p.defaultFit.stirrupY);
  num(df, "stirrupZ", p.defaultFit.stirrupZ);
  num(df, "kneeOut", p.defaultFit.kneeOut);
  num(df, "handX", p.defaultFit.handX);
  num(df, "handY", p.defaultFit.handY);
  num(df, "handZ", p.defaultFit.handZ);
  const J& h = data["human"];
  num(h, "FLANK_RELAX", p.flankRelax);
  num(h, "FLANK_LEAD", p.flankLead);
  const J& rf = h["RIDER_FIT"];
  num(rf, "stirrupX", p.riderFitStirrupX);
  num(rf, "stirrupY", p.riderFitStirrupY);
  num(rf, "stirrupZ", p.riderFitStirrupZ);
  num(rf, "kneeOut", p.riderFitKneeOut);
  num(rf, "handX", p.riderFitHandX);
  num(rf, "handY", p.riderFitHandY);
  num(rf, "handZ", p.riderFitHandZ);
  vec(h["RIDER_SEAT"], "saddle", p.seatSaddle);
  vec(h["RIDER_SEAT"], "body", p.seatBody);
  vec(h, "FIST", p.fist);
  const J& pj = data["pjlHorse"];
  num(pj, "LEG_THICK", p.legThick);
  num(pj, "HIND_DOWN", p.hindDown);
  if (!err.empty()) return false;
  out = p;
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
RiderRules::RiderRules(const Rig& rig, const RideParams& params, bool hair) : rig_(rig), C_(params), hair_(hair) { reset(); }

void RiderRules::reset() {
  for (int b = 0; b < BoneCount; b++) boneQ_[b] = Quat{};
  hipsPos_ = rig_.rest[Hips];
  P_ = RidePose{};
  R_ = RideState{};
  init_ = false;
  hairStarted_ = false;
  hairA_ = hairV_ = hairB_ = hairW_ = 0;
}

// ---------- anim.js:661-874 : équitation ----------
void RiderRules::riding(const RideInputs& in, double dt) {
  RidePose& P = P_;
  RideState& R = R_;
  const RigInfo& info = rig_.info;
  const RideParams& RIDE = C_;
  const RideFit& fit = in.hasFit ? in.fit : C_.defaultFit;
  const double hs = orZero(in.horseSpeed);
  const double ph = orZero(in.gaitPhase);
  const double t = orZero(in.t);
  // bobAvg amorcé sur la première hauteur de selle.
  if (!R.started) {
    R = RideState{};
    R.started = true;
    R.bobAvg = orZero(in.bob);
  }
  const double walk = smoothstep(0.4, 1.2, hs) * (1 - smoothstep(2.8, 3.6, hs));
  const double trot = smoothstep(2.8, 3.6, hs) * (1 - smoothstep(5.2, 5.9, hs));
  const double canter = smoothstep(5.2, 5.9, hs) * (1 - smoothstep(9.8, 11.8, hs));
  const double gallop = smoothstep(9.8, 11.8, hs);
  // Changement de diagonal.
  const double turn = orZero(in.turn);
  if (std::abs(turn) > 0.25) R.wantDiag = turn > 0 ? 0 : 0.5;
  if (R.wantDiag != R.diag) {
    R.diagT += dt;
    if (R.diagT > 1.2) {
      R.diag = R.wantDiag;
      R.diagT = 0;
    }
  } else {
    R.diagT = 0;
  }
  // Trot enlevé.
  const double u = frac(ph + R.diag);
  const double rise = smoothstep(0.02, 0.2, u) * (1 - smoothstep(0.34, 0.5, u));
  R.post = lerp(R.post, rise * trot, 1 - std::exp(-30 * dt));
  // Obstacle : phases données par le cheval.
  const double jump = in.jump >= 0 ? in.jump : -1;
  const double landT = in.hasLandT ? in.landT : -1;
  if (jump >= 0) R.hd = -1;
  else if (landT >= 0 && R.hd < 0 && (in.hindDown || landT >= RIDE.holdMax)) R.hd = landT;
  double jk = 0, release = 0;
  if (jump >= 0) {
    jk = smoothstep(0, RIDE.foldIn, jump) * (1 - (1 - RIDE.landFold) * smoothstep(0.5, 1, jump));
    release = smoothstep(RIDE.releaseIn0, RIDE.releaseIn1, jump);
  } else if (landT >= 0 && R.wasJump) {
    const double atHd = R.hd < 0 ? landT : R.hd;
    const double jHd = RIDE.landFold - (RIDE.landFold - RIDE.hindFold) * smoothstep(0, RIDE.holdMax, atHd);
    jk = R.hd < 0 ? jHd : jHd * (1 - smoothstep(0, RIDE.recover, landT - R.hd));
    release = 1 - smoothstep(0, RIDE.handBack, landT);
    if (jk <= 0 && release <= 0) R.wasJump = false;
  }
  if (jump >= 0) R.wasJump = true;
  R.jumpK = lerp(R.jumpK, jk, 1 - std::exp(-14 * dt));
  const double twoTarget = jmax(jmax(canter * 0.55, gallop * 1.0), R.jumpK);
  R.two = lerp(R.two, twoTarget, 1 - std::exp(-5 * dt));
  const double two = R.two;
  R.rel = lerp(R.rel, release, 1 - std::exp(-10 * dt));
  // Mouvement vertical du dos du cheval.
  const double bob = orZero(in.bob);
  R.bobAvg = lerp(R.bobAvg, bob, 1 - std::exp(-2 * dt));
  const double bobHP = bob - R.bobAvg;
  // Bassin.
  const double canterRock = canter * (1 - two) * std::sin(kTau * ph + 0.6);
  const double walkRock = walk * std::sin(kTau * 2 * ph);
  const double lift = R.post * RIDE.postLift + two * RIDE.twoLift + R.jumpK * RIDE.jumpLift;
  const double offSeat = clampd(lift / 0.04, 0, 1);
  const double dy = jmax(0, lift - bobHP * (0.4 + two * 0.5) * offSeat);
  const double hz = R.post * 0.06 - two * 0.035 - R.jumpK * 0.02;
  P.tg.hips = vset(0, info.seatToHips, hz);
  // Buste.
  const double pitchW = orZero(in.pitch);
  const double torso = 0.04 + trot * 0.06 + R.post * 0.14 + two * 0.52 + R.jumpK * 0.62 + canterRock * 0.03;
  const double comp = -pitchW * 0.85 * (1 - (pitchW < 0 ? 0.75 : 0.25) * R.jumpK);
  // Attente vivante.
  const double still = (1 - smoothstep(0.3, 1.6, hs)) * (1 - R.jumpK);
  const double idle = still + 0.35 * walk;
  const double breath = std::sin(t * RIDE.breathRate * kTau);
  const double shiftW = std::sin(t * 0.11 * kTau + 1.3) * still;
  if (!R.hasLook) {
    R.hasLook = true;
    R.lookA = R.lookTo = R.lookT = 0;
  }
  R.lookT -= dt;
  if (R.lookT <= 0) {
    R.lookT = 2.5 + 3.5 * frac(std::sin(t * 12.9898) * 43758.5);
    R.lookTo = (frac(std::sin(t * 78.233) * 12345.6) - 0.5) * 0.6;
  }
  R.lookA = lerp(R.lookA, R.lookTo * still, 1 - std::exp(-1.8 * dt));
  P.q[Hips] = qEuler(0.08 + two * 0.35 + R.jumpK * 0.15 + comp * 0.5 + walkRock * 0.04 + canterRock * 0.07, 0,
                     -turn * 0.06 + shiftW * RIDE.idleShift);
  P.q[Spine] = qEuler(torso * 0.35 + comp * 0.25 - canterRock * 0.04 + breath * 0.006 * idle, 0,
                      -turn * 0.04 - shiftW * RIDE.idleShift * 0.8);
  P.q[Chest] = qEuler(torso * 0.3 + comp * 0.25 - breath * RIDE.breathChest * idle, R.lookA * 0.15, 0);
  for (int side = 0; side < 2; side++) P.q[kClav[side]] = qEuler(0, 0, sideSign(side) * breath * RIDE.breathShoulder * idle);
  // Regard devant, entre les oreilles.
  const double totalPitch = 0.08 + two * 0.35 + R.jumpK * 0.15 + torso * 0.65 + comp;
  P.q[Neck] = qEuler(-totalPitch * 0.45, R.lookA * 0.35, 0);
  P.q[Head] = qEuler(-totalPitch * 0.42 + 0.06 - R.jumpK * 0.08, R.lookA * 0.5, turn * 0.08);
  forwardTrunk(rig_, P);
  // Jambes : pied dans l'étrier (plante), talon bas, genou contre la selle ; étrivières de longueur fixe.
  const double legLen = info.thighLen + info.shinLen;
  const double maxReach = legLen * RIDE.seatReach;
  double lowerSeat = 0;
  for (int side = 0; side < 2; side++) {
    const double sg = sideSign(side);
    Vec3& fpos = P.tg.foot[side];
    Quat& fq = P.tg.footQ[side];
    const double heel = 0.14 + two * 0.06 + R.jumpK * 0.04;
    fq = qEuler(-heel, sg * 0.10, 0);
    // la plante sur la grille de l'étrier → cheville
    const Vec3 v1 = applyQ(vset(0, -info.ankleY + 0.012, info.toe.z - 0.005), fq);
    fpos = vsub(vset(sg * fit.stirrupX, fit.stirrupY + R.post * 0.012 + two * 0.02, fit.stirrupZ - two * 0.02), v1);
    const std::vector<double>* fl = flankOf(fit, sg);
    if (fl) {
      fpos.x = sg * jmax(std::abs(fpos.x), flankAt(*fl, fpos.y) + orZero(fit.legClear));
      // Place naturelle du pied : le tibia ne l'écarte que de 4 cm au plus.
      P.tg.hasXMax[side] = true;
      P.tg.xMax[side] = std::abs(fpos.x) + 0.04 * (fit.legClear != 0 && !std::isnan(fit.legClear) ? fit.legClear / 0.05 : 1);
      Vec3 pole0 = vnormalize(vset(sg * fit.kneeOut, -0.05, 1));
      hugFlank(C_, P, side, sg, fpos, pole0, *fl, orZero(fit.legClear), info, P.tg.xMax[side]);
    }
    const Vec3& hip = P.mpThigh[side];
    const double lateral2 = (hip.x - fpos.x) * (hip.x - fpos.x) + (hip.z - fpos.z) * (hip.z - fpos.z);
    const double maxDrop = std::sqrt(jmax(0, maxReach * maxReach - lateral2));
    lowerSeat = jmax(lowerSeat, hip.y - fpos.y - maxDrop);
  }
  // Cheval large (profil de flanc fourni) : le bassin ne descend que de quelques centimètres.
  const bool wide = flankOf(fit, 1) != nullptr || flankOf(fit, -1) != nullptr;
  if (wide) lowerSeat = jmin(lowerSeat, 0.035 * legLen / 0.9);
  if (lowerSeat > 0) {
    P.tg.hips.y -= lowerSeat;
    forwardTrunk(rig_, P);
  }
  if (wide) {
    for (int side = 0; side < 2; side++) {
      Vec3& fpos = P.tg.foot[side];
      const Vec3& hip = P.mpThigh[side];
      const double lateral2 = (hip.x - fpos.x) * (hip.x - fpos.x) + (hip.z - fpos.z) * (hip.z - fpos.z);
      const double minY = hip.y - std::sqrt(jmax(0, maxReach * maxReach - lateral2));
      if (fpos.y < minY) fpos.y = minY;
    }
  }
  // Bassin soulevé de dy au plus, dans la limite de la portée des jambes.
  if (dy > 0) {
    const double seated = P.tg.hips.y;
    const double riseReach = legLen * RIDE.riseReach;
    double top = seated + dy;
    for (int side = 0; side < 2; side++) {
      const Vec3& fpos = P.tg.foot[side];
      const Vec3& hip = P.mpThigh[side];
      const double lateral2 = (hip.x - fpos.x) * (hip.x - fpos.x) + (hip.z - fpos.z) * (hip.z - fpos.z);
      top = jmin(top, fpos.y + std::sqrt(jmax(0, riseReach * riseReach - lateral2)) - (hip.y - P.tg.hips.y));
    }
    P.tg.hips.y = jmax(seated, top);
    forwardTrunk(rig_, P);
  }
  const double reachNow = legLen * (dy > 0 ? RIDE.riseReach : RIDE.seatReach);
  for (int side = 0; side < 2; side++) {
    const double sg = sideSign(side);
    Vec3& fpos = P.tg.foot[side];
    Vec3 pole = vnormalize(vset(sg * fit.kneeOut, -0.05, 1));
    const std::vector<double>* fl = flankOf(fit, sg);
    if (fl) {
      // Pied hors d'atteinte après l'écart du tibia : il remonte ; genou, tibia et cheville recontrôlés à chaque passe.
      const Vec3& hip = P.mpThigh[side];
      for (int pass = 0; pass < 3; pass++) {
        hugFlank(C_, P, side, sg, fpos, pole, *fl, orZero(fit.legClear), info, P.tg.hasXMax[side] ? P.tg.xMax[side] : kInf);
        bool raised = false;
        for (int k = 0; k < 4; k++) {
          const double lateral2 = (hip.x - fpos.x) * (hip.x - fpos.x) + (hip.z - fpos.z) * (hip.z - fpos.z);
          const double minY = hip.y - std::sqrt(jmax(0, reachNow * reachNow - lateral2));
          if (fpos.y < minY - 1e-4) {
            fpos.y = minY;
            raised = true;
          }
          fpos.x = sg * jmax(std::abs(fpos.x), flankAt(*fl, fpos.y) + orZero(fit.legClear) + 0.005);
        }
        if (!raised) break;
      }
      hugMemory(C_, R, P, side, sg, fpos, pole, *fl, orZero(fit.legClear), info, dt, t);
    }
    solveLeg(rig_, P, side, fpos, P.tg.footQ[side], 0, pole);
  }
  // Bras : mains au-dessus du garrot, rênes ajustées ; rendre la main à l'obstacle.
  const double nod = (walk * 0.025 + canter * 0.035 + gallop * 0.03) * std::sin(kTau * (walk > 0.5 ? 2 : 1) * ph + 1.2);
  for (int side = 0; side < 2; side++) {
    const double sg = sideSign(side);
    double hx = sg * (fit.handX + RIDE.handSpread);
    const double hY = fit.handY - two * 0.07 - R.rel * 0.12;
    const double hZ = fit.handZ + two * 0.13 + R.rel * 0.22 + nod + R.post * 0.02;
    if (in.wave && side == 0) hx = 0.01;
    Vec3& hp = P.tg.hand[side];
    hp = vset(hx, hY - bobHP * 0.3, hZ);
    // Poignet au-dessus de l'encolure.
    if (!fit.crest.empty()) hp.y = jmax(hp.y, crestAt(fit.crest, hp.z + 0.06) + RIDE.handClear);
    // Bras jamais verrouillé.
    const Vec3& sh = P.mpArm[side];
    const double armMax = (info.upperArmLen + info.foreArmLen) * RIDE.handReach;
    const double dh = vdist(hp, sh);
    if (dh > armMax) hp = vadd(vmul(vsub(hp, sh), armMax / dh), sh);
    if (in.wave && side == 1) {
      const double w = std::sin(t * 8.5);
      P.q[RArm] = qEuler(-0.35, 0, -(2.5));
      P.q[RFore] = qEuler(-0.25, 0, 0.35 + 0.35 * w);
      P.q[RFing] = qAxis(kZv, -0.2);
      continue;
    }
    // poing fermé, pouce dessus, ongles vers l'intérieur
    P.handQ[side] = lookQ(vset(-sg * 0.25, -0.6, 1), vset(-sg * 0.15, 1, 0.35));
    // l'axe de la main (doigts = −Y local) doit pointer vers l'avant
    const Quat q2 = qmul(P.handQ[side], qAxis(kX, -kPi / 2));
    solveArm(rig_, P, side, hp, vnormalize(vset(sg * 0.45, -0.75, -0.5)), &q2);
    P.q[kFing[side]] = qAxis(kZv, -sg * 1.25);
  }
}

// anim.js:914-922 : queue de cheval, ressort amorti.
void RiderRules::hairSpring(double dt, double driveX, double driveZ) {
  if (!hairStarted_) {
    hairStarted_ = true;
    hairA_ = hairV_ = hairB_ = hairW_ = 0;
  }
  const double k = 60, c = 7;
  hairV_ += (-k * (hairA_ - driveX) - c * hairV_) * dt;
  hairA_ += hairV_ * dt;
  hairW_ += (-k * (hairB_ - driveZ) - c * hairW_) * dt;
  hairB_ += hairW_ * dt;
  P_.q[HairTail] = qEuler(clampd(hairA_, -0.6, 0.9), 0, clampd(hairB_, -0.5, 0.5));
}

// anim.js:925-975 : point d'entrée, pose « ride ».
void RiderRules::step(const RideInputs& in) {
  const double dt = in.dt;
  RidePose& P = P_;
  if (!P.rideStarted) {
    P.rideStarted = true;
    P.blendT = 0;
  }
  P.blendT += dt;
  for (int n = Hips; n < BoneCount; n++) P.q[n] = Quat{};
  riding(in, dt);
  const double hsN = jmin(1, orZero(in.horseSpeed) / 12);
  const double driveX = 0.15 + hsN * 0.55 + std::sin(kTau * 2 * orZero(in.gaitPhase)) * 0.15 * hsN;
  const double driveZ = orZero(in.turn) * 0.2;
  if (hair_) hairSpring(dt, driveX, driveZ);
  // Application avec lissage (transitions entre poses).
  const double rate = P.blendT < 0.45 ? 9 : 40;
  const double k = init_ ? 1 - std::exp(-rate * dt) : 1;
  init_ = true;
  // En selle sur un cheval qui fournit son profil de flanc, transition finie : bassin et jambes appliqués tels que résolus.
  const RideFit& fit = in.fit;
  const bool exact = P.blendT >= 0.45 && in.hasFit && (!fit.flankL.empty() || !fit.flankR.empty() || !fit.flank.empty());
  for (int n = Hips; n < BoneCount; n++) {
    const bool legChain = n == Hips || n == LThigh || n == LShin || n == LFoot || n == LToe || n == RThigh || n == RShin ||
                          n == RFoot || n == RToe;
    if (k >= 1 || (exact && legChain)) boneQ_[n] = P.q[n];
    else boneQ_[n] = qSlerp(boneQ_[n], P.q[n], k);
  }
  if (k >= 1 || exact) hipsPos_ = P.tg.hips;
  else hipsPos_ = vlerp(hipsPos_, P.tg.hips, k);
}

// Positions dans S : maillage à l'échelle du cavalier, os en cascade (Object3D.updateMatrixWorld), getWorldPosition et
// localToWorld.
RideSkeleton RiderRules::skeleton() const {
  RideSkeleton out;
  const double s = rig_.scale;
  const M4 group = compose(Vec3{}, Quat{}, s, s, s);
  std::array<M4, BoneCount> world;
  for (int b = 0; b < BoneCount; b++) {
    const Vec3& pos = b == Hips ? hipsPos_ : rig_.rest[b];
    const M4 local = compose(pos, boneQ_[b], 1, 1, 1);
    const int p = boneParent(b);
    world[b] = mmul(p < 0 ? group : world[p], local);
    out.joints[b] = Vec3{world[b].e[12], world[b].e[13], world[b].e[14]};
  }
  const RigInfo& info = rig_.info;
  for (int side = 0; side < 2; side++) {
    out.sole[side] = applyM4(vset(0, -info.ankleY + 0.012, info.toe.z - 0.005), world[kFoot[side]]);
    const Vec3& f = side == 1 && rig_.hasFistR ? rig_.fistR : rig_.fist;
    out.fist[side] = applyM4(f, world[kHand[side]]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// human.js:317-383 : entrées de la règle.
void RideInputFilter::seed(const RideInputs& last) {
  t_ = last.t;
  hasLandT_ = last.hasLandT;
  landT_ = last.landT;
  wasJump_ = last.jump >= 0;
  hasPrev_ = true;
  rf_ = last.fit;
  for (int i = 0; i < 3; i++) {
    hasRaw_[i] = false;
    raw_[i].clear();
  }
}

RideInputs RideInputFilter::next(const RideHorseSample& h, const RideFitMeters& f, double scale, double dt, double step, bool wave) {
  t_ += dt;
  RideInputs a;
  a.dt = step;
  a.t = t_;
  // Mouvement du dos du cheval au niveau de la selle : rebond vertical et tangage.
  double fl = jsHypot3(h.attachZ.x, h.attachZ.y, h.attachZ.z);
  if (fl == 0 || std::isnan(fl)) fl = 1;
  a.bob = h.attachY - h.horseY - orZero(h.contactOff);
  a.pitch = -std::asin(clampd(h.attachZ.y / fl, -1, 1));
  a.horseSpeed = h.speed;
  a.gaitPhase = std::fmod(h.phase + orZero(h.postOffset) + 1, 1.0);
  a.jump = h.jumpT;
  // Réception : temps depuis le poser des antérieurs.
  if (h.jumpT >= 0) {
    hasLandT_ = true;
    landT_ = -1;
  } else if (wasJump_) {
    hasLandT_ = true;
    landT_ = 0;
  } else if (hasLandT_ && landT_ >= 0) {
    landT_ += step;
  }
  a.hasLandT = hasLandT_;
  a.landT = hasLandT_ ? landT_ : -1;
  wasJump_ = h.jumpT >= 0;
  a.hindDown = h.hindDown;
  a.turn = clampd(orZero(h.lastTurn) * 1.4, -1, 1);
  a.wave = wave;
  // Réglages en mètres → unités du modèle.
  const double k = 1 / scale;
  RideFit& rf = rf_;
  rf.stirrupX = f.stirrupX * k;
  rf.stirrupY = f.stirrupY * k;
  rf.stirrupZ = f.stirrupZ * k;
  rf.kneeOut = f.kneeOut;  // direction
  rf.handX = f.handX * k;
  rf.handY = f.handY * k;
  rf.handZ = f.handZ * k;
  rf.legClear = f.legClear * k;
  rf.hasMountKneeOut = f.hasMountKneeOut;
  rf.mountKneeOut = f.mountKneeOut;  // direction
  const std::vector<double>* src[4] = {&f.flankL, &f.flankR, &f.flank, &f.crest};
  std::vector<double>* dst[4] = {&rf.flankL, &rf.flankR, &rf.flank, &rf.crest};
  for (int key = 0; key < 4; key++) {
    const std::vector<double>& v = *src[key];
    std::vector<double>& arr = *dst[key];
    if (v.empty()) {  // réglage retiré : plus de profil
      arr.clear();
      continue;
    }
    const bool keep = hasPrev_ && arr.size() == v.size();
    if (!keep) arr.assign(v.size(), 0);
    // Profil du flanc : il s'élargit tout de suite, mais ne se resserre que de FLANK_RELAX m/s au plus ; élargissement
    // en cours prolongé d'une image (FLANK_LEAD). Le cavalier lit le profil de l'image précédente du cheval.
    const bool env = keep && key < 3;
    if (env && !hasRaw_[key]) {
      hasRaw_[key] = true;
      raw_[key] = v;
    }
    for (size_t i = 0; i < v.size(); i++) {
      if (!env || i < 2) {
        arr[i] = v[i] * k;
        continue;
      }
      std::vector<double>& raw = raw_[key];
      const double grow = jmax(0, v[i] - raw[i]) * C_.flankLead;
      arr[i] = jmax((v[i] + grow) * k, arr[i] - C_.flankRelax * k * step);
      raw[i] = v[i];
    }
  }
  hasPrev_ = true;
  a.hasFit = true;
  a.fit = rf;
  return a;
}

}  // namespace strides::rider

#if defined(__clang__)
#pragma float_control(pop)
#endif
