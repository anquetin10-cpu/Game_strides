// Sellerie du cheval WildMesh (voir HorseTack.h) : src/entities/pjlHorse.js et src/entities/pjl/view.js, ligne pour ligne.
// Les références « pjlHorse.js:N » renvoient au web v3. Les calculs de Three.js sont ceux de three 0.170.0.
#include "StridesCore/HorseTack.h"

#include <algorithm>
#include <cmath>
#include <stdexcept>

#include "StridesCore/MiniJson.h"

#if defined(__clang__)
#pragma float_control(push)
#pragma clang fp contract(off)
#endif

namespace strides::tack {
namespace {

// src/core/math.js : lerp, damp.
inline double lerp(double a, double b, double t) { return a + (b - a) * t; }
inline double damp(double a, double b, double lambda, double dt) { return lerp(a, b, 1 - std::exp(-lambda * dt)); }
// Math.round (moitiés vers +∞).
inline double jsRound(double x) { return std::floor(x + 0.5); }

const char* const kAnchors[AnchorCount] = {"seat", "barL", "barR", "bitL", "bitR", "withers", "crest", "kneeL", "kneeR", "ironL", "ironR"};

TackPoint readPoint(const J& a, int nBones) {
  if (a.t != J::Arr || a.a.empty() || a.a.size() % 5) throw std::runtime_error("pjl_horse_tack.json : influences mal formées");
  TackPoint p;
  for (size_t i = 0; i < a.a.size(); i += 5) {
    Influence f;
    f.bone = (int)a[i].num();
    if (f.bone < 0 || f.bone >= nBones) throw std::runtime_error("pjl_horse_tack.json : os hors des os utilisés");
    f.w = a[i + 1].num();
    f.q = {a[i + 2].num(), a[i + 3].num(), a[i + 4].num()};
    p.push_back(f);
  }
  return p;
}

}  // namespace

const char* anchorName(int a) { return a >= 0 && a < AnchorCount ? kAnchors[a] : ""; }

V3 apply(const Affine& a, const V3& p) {
  const double* m = a.m;
  return {m[0] * p.x + m[1] * p.y + m[2] * p.z + m[3], m[4] * p.x + m[5] * p.y + m[6] * p.z + m[7],
          m[8] * p.x + m[9] * p.y + m[10] * p.z + m[11]};
}

Affine compose(const Affine& a, const Affine& b) {
  Affine o;
  for (int r = 0; r < 3; r++) {
    for (int c = 0; c < 3; c++) o.m[r * 4 + c] = a.m[r * 4] * b.m[c] + a.m[r * 4 + 1] * b.m[4 + c] + a.m[r * 4 + 2] * b.m[8 + c];
    o.m[r * 4 + 3] = a.m[r * 4] * b.m[3] + a.m[r * 4 + 1] * b.m[7] + a.m[r * 4 + 2] * b.m[11] + a.m[r * 4 + 3];
  }
  return o;
}

double det3(const Affine& a) {
  const double* m = a.m;
  return m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);
}

Affine invert(const Affine& a) {
  const double* m = a.m;
  const double d = det3(a);
  Affine o;
  o.m[0] = (m[5] * m[10] - m[6] * m[9]) / d;
  o.m[1] = (m[2] * m[9] - m[1] * m[10]) / d;
  o.m[2] = (m[1] * m[6] - m[2] * m[5]) / d;
  o.m[4] = (m[6] * m[8] - m[4] * m[10]) / d;
  o.m[5] = (m[0] * m[10] - m[2] * m[8]) / d;
  o.m[6] = (m[2] * m[4] - m[0] * m[6]) / d;
  o.m[8] = (m[4] * m[9] - m[5] * m[8]) / d;
  o.m[9] = (m[1] * m[8] - m[0] * m[9]) / d;
  o.m[10] = (m[0] * m[5] - m[1] * m[4]) / d;
  for (int r = 0; r < 3; r++) o.m[r * 4 + 3] = -(o.m[r * 4] * m[3] + o.m[r * 4 + 1] * m[7] + o.m[r * 4 + 2] * m[11]);
  return o;
}

bool fitAffine(const std::vector<V3>& from, const std::vector<V3>& to, Affine& out, double& rms) {
  const size_t n = from.size();
  if (n < 4 || to.size() != n) return false;
  V3 mf, mt;
  for (size_t i = 0; i < n; i++) {
    mf.x += from[i].x, mf.y += from[i].y, mf.z += from[i].z;
    mt.x += to[i].x, mt.y += to[i].y, mt.z += to[i].z;
  }
  mf = {mf.x / n, mf.y / n, mf.z / n};
  mt = {mt.x / n, mt.y / n, mt.z / n};
  // Données centrées : (FᵀF) M_rᵀ = Fᵀ T_r pour chaque ligne r.
  double A[3][3] = {}, B[3][3] = {};
  for (size_t i = 0; i < n; i++) {
    const double f[3] = {from[i].x - mf.x, from[i].y - mf.y, from[i].z - mf.z};
    const double t[3] = {to[i].x - mt.x, to[i].y - mt.y, to[i].z - mt.z};
    for (int r = 0; r < 3; r++)
      for (int c = 0; c < 3; c++) A[r][c] += f[r] * f[c], B[r][c] += f[r] * t[c];
  }
  // Inverse de A (cofacteurs) ; B[k][r] = Σ f_k t_r.
  const double d = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
                   A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  double tr = A[0][0] + A[1][1] + A[2][2];
  if (!(std::fabs(d) > 1e-12 * tr * tr * tr)) return false;
  double I[3][3];
  I[0][0] = (A[1][1] * A[2][2] - A[1][2] * A[2][1]) / d;
  I[0][1] = (A[0][2] * A[2][1] - A[0][1] * A[2][2]) / d;
  I[0][2] = (A[0][1] * A[1][2] - A[0][2] * A[1][1]) / d;
  I[1][0] = (A[1][2] * A[2][0] - A[1][0] * A[2][2]) / d;
  I[1][1] = (A[0][0] * A[2][2] - A[0][2] * A[2][0]) / d;
  I[1][2] = (A[0][2] * A[1][0] - A[0][0] * A[1][2]) / d;
  I[2][0] = (A[1][0] * A[2][1] - A[1][1] * A[2][0]) / d;
  I[2][1] = (A[0][1] * A[2][0] - A[0][0] * A[2][1]) / d;
  I[2][2] = (A[0][0] * A[1][1] - A[0][1] * A[1][0]) / d;
  for (int r = 0; r < 3; r++) {
    for (int c = 0; c < 3; c++) out.m[r * 4 + c] = I[c][0] * B[0][r] + I[c][1] * B[1][r] + I[c][2] * B[2][r];
    out.m[r * 4 + 3] = (r == 0 ? mt.x : r == 1 ? mt.y : mt.z) - (out.m[r * 4] * mf.x + out.m[r * 4 + 1] * mf.y + out.m[r * 4 + 2] * mf.z);
  }
  double s = 0;
  for (size_t i = 0; i < n; i++) {
    const V3 p = apply(out, from[i]);
    s += (p.x - to[i].x) * (p.x - to[i].x) + (p.y - to[i].y) * (p.y - to[i].y) + (p.z - to[i].z) * (p.z - to[i].z);
  }
  rms = std::sqrt(s / n);
  return true;
}

TackModel tackModelFromJson(const J& j) {
  if (j["schema"].s != "strides.pjl_horse_tack/1") throw std::runtime_error("pjl_horse_tack.json : schéma inattendu");
  TackModel m;
  const int used = (int)j["usedBones"].num();
  const J& joints = j["joints"];
  if (joints.t != J::Arr || (int)joints.a.size() < used || used <= 0) throw std::runtime_error("pjl_horse_tack.json : articulations");
  for (const J& r : joints.a) {
    m.jointNames.push_back(r[0].s);
    m.jointRest.push_back({r[1].num(), r[2].num(), r[3].num()});
  }
  m.bones.assign(m.jointNames.begin(), m.jointNames.begin() + used);
  m.innerScale = j["inner"]["scale"].num();
  m.innerGroundY = j["inner"]["groundY"].num();
  m.innerYaw = j["inner"]["yaw"].num();
  for (int a = 0; a < AnchorCount; a++) m.anchors[a] = readPoint(j["anchors"][kAnchors[a]], used);
  for (const J& v : j["flank"]["vertices"].a) m.flank.push_back(readPoint(v, used));
  for (const J& v : j["crest"]["vertices"].a) m.crest.push_back(readPoint(v, used));
  m.flankY0 = j["flank"]["profile"][0].num();
  m.flankStep = j["flank"]["profile"][1].num();
  m.flankSlices = (int)j["flank"]["slices"].num();
  m.crestZ0 = j["crest"]["profile"][0].num();
  m.crestStep = j["crest"]["profile"][1].num();
  m.crestSlices = (int)j["crest"]["profile"][2].num();
  m.recenterDamp = j["seat"]["recenterDamp"].num();
  m.pitchDamp = j["seat"]["pitchDamp"].num();
  m.hindDown = j["hind"]["down"].num();
  m.hindWithin = j["hind"]["within"].num();
  m.landT0 = j["hind"]["landT0"].num();
  m.spine04 = (int)j["bones"]["spine04"].num();
  m.pelvis = (int)j["bones"]["pelvis"].num();
  m.toeL = (int)j["bones"]["toeL"].num();
  m.toeR = (int)j["bones"]["toeR"].num();
  for (int b : {m.spine04, m.pelvis, m.toeL, m.toeR})
    if (b < 0 || b >= used) throw std::runtime_error("pjl_horse_tack.json : os du siège ou des postérieurs");
  if (m.flank.empty() || m.crest.empty() || m.flankSlices <= 0 || m.crestSlices <= 0) throw std::runtime_error("pjl_horse_tack.json : profils");
  return m;
}

TackModel tackModelFromFile(const std::string& path) { return tackModelFromJson(loadJson(path)); }

Affine innerAffine(const TackModel& m) {
  // pjl/view.js : inner.position.y = −groundY · scale, inner.rotation.y = −yaw, inner.scale = scale (makeRotationY).
  const double c = std::cos(-m.innerYaw), s = std::sin(-m.innerYaw), k = m.innerScale;
  Affine a;
  const double v[12] = {c * k, 0, s * k, 0, 0, k, 0, -m.innerGroundY * k, -s * k, 0, c * k, 0};
  for (int i = 0; i < 12; i++) a.m[i] = v[i];
  return a;
}

TackState freshState(const TackModel& m) {
  TackState s;
  s.landT = m.landT0;
  return s;
}

void landStep(TackState& s, bool jumping, double dt) {
  // pjlHorse.js:437-439
  if (s.wasJump && !jumping) s.landT = 0;
  s.wasJump = jumping;
  s.landT += dt;
}

V3 skinPoint(const TackPoint& p, const std::vector<Affine>& skin) {
  V3 o;
  for (const Influence& f : p) {
    const V3 v = apply(skin[f.bone], f.q);
    o.x += v.x * f.w, o.y += v.y * f.w, o.z += v.z * f.w;
  }
  return o;
}

Q4 eulerYXZ(double x, double y, double z) {
  // three.js Quaternion.setFromEuler, ordre 'YXZ'.
  const double c1 = std::cos(x / 2), c2 = std::cos(y / 2), c3 = std::cos(z / 2);
  const double s1 = std::sin(x / 2), s2 = std::sin(y / 2), s3 = std::sin(z / 2);
  return {s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3};
}

V3 rotate(const Q4& q, const V3& v) {
  // three.js Vector3.applyQuaternion.
  const double tx = 2 * (q.y * v.z - q.z * v.y), ty = 2 * (q.z * v.x - q.x * v.z), tz = 2 * (q.x * v.y - q.y * v.x);
  return {v.x + q.w * tx + q.y * tz - q.z * ty, v.y + q.w * ty + q.z * tx - q.x * tz, v.z + q.w * tz + q.x * ty - q.y * tx};
}

V3 toSeat(const V3& p, const V3& seatPos, const Q4& seatQ) {
  // Inverse de compose(seatPos, seatQ, 1) : rotation conjuguée de p − seatPos.
  const Q4 c{-seatQ.x, -seatQ.y, -seatQ.z, seatQ.w};
  return rotate(c, {p.x - seatPos.x, p.y - seatPos.y, p.z - seatPos.z});
}

void seatStep(const TackModel& m, TackState& s, const std::vector<Affine>& skin, double roll, double dt, TackOut& out) {
  const double step = dt ? dt : 1.0 / 60;  // this._dt || 1 / 60
  for (int a = 0; a < AnchorCount; a++) out.anchorH[a] = skinPoint(m.anchors[a], skin);
  out.spine04 = apply(skin[m.spine04], m.jointRest[m.spine04]);
  out.pelvis = apply(skin[m.pelvis], m.jointRest[m.pelvis]);
  out.toe[0] = apply(skin[m.toeL], m.jointRest[m.toeL]);
  out.toe[1] = apply(skin[m.toeR], m.jointRest[m.toeR]);
  // _attachRider (pjlHorse.js:833-859) : siège recentré sur le milieu des ancres d'étrier, lissé.
  const V3& a = out.anchorH[IronL];
  const V3& b = out.anchorH[IronR];
  const double mid = (a.x + b.x) * 0.5;
  s.seatX = !s.hasSeatX ? mid : damp(s.seatX, mid, m.recenterDamp, step);
  s.hasSeatX = true;
  out.seatPos = {s.seatX, out.anchorH[Seat].y, out.anchorH[Seat].z};
  // Tangage du dos (garrot → bassin) par rapport au repos, lissé ; inclinaison de la vue.
  const double pitch = std::atan2(out.spine04.y - out.pelvis.y, out.spine04.z - out.pelvis.z);
  out.pitch = pitch;
  if (!s.hasPitch0) s.pitch0 = pitch, s.hasPitch0 = true;
  s.dPitch = damp(s.dPitch, pitch - s.pitch0, m.pitchDamp, step);
  out.seatQ = eulerYXZ(-s.dPitch, 0, roll);
  for (int k = 0; k < AnchorCount; k++) out.anchorS[k] = toSeat(out.anchorH[k], out.seatPos, out.seatQ);
  // _flankUpdate (pjlHorse.js:807-825) : plus grand écart à l'axe par tranche de hauteur, puis dessus de l'encolure.
  const int n = m.flankSlices;
  out.flankL.assign(2 + n, 0);
  out.flankR.assign(2 + n, 0);
  out.flankL[0] = out.flankR[0] = m.flankY0;
  out.flankL[1] = out.flankR[1] = m.flankStep;
  for (const TackPoint& v : m.flank) {
    const V3 p = toSeat(skinPoint(v, skin), out.seatPos, out.seatQ);
    const double k = jsRound((p.y - m.flankY0) / m.flankStep);
    if (k < 0 || k >= n) continue;
    const int i = 2 + (int)k;
    if (p.x > 0) out.flankL[i] = std::max(out.flankL[i], p.x);
    else out.flankR[i] = std::max(out.flankR[i], -p.x);
  }
  out.crest.assign(2 + m.crestSlices, -9);
  out.crest[0] = m.crestZ0;
  out.crest[1] = m.crestStep;
  for (const TackPoint& v : m.crest) {
    const V3 p = toSeat(skinPoint(v, skin), out.seatPos, out.seatQ);
    const double k = jsRound((p.z - m.crestZ0) / m.crestStep);
    if (k >= 0 && k < m.crestSlices) out.crest[2 + (int)k] = std::max(out.crest[2 + (int)k], p.y);
  }
}

void hindStep(const TackModel& m, TackState& s, bool jumping, const double toeHeight[2]) {
  // pjlHorse.js:763-769
  if (jumping) s.hindDown = false;
  else if (!s.hindDown && s.landT < m.hindWithin) {
    for (int k = 0; k < 2; k++)
      if (toeHeight[k] < m.hindDown) s.hindDown = true;
  }
}

}  // namespace strides::tack

#if defined(__clang__)
#pragma float_control(pop)
#endif
