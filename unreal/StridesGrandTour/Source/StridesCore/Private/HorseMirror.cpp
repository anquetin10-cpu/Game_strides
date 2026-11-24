// Clips miroir du cheval WildMesh et main au galop (voir HorseMirror.h) : src/entities/pjl/asset.js (prepare, bakeMirror),
// src/entities/horse/anim.js, src/entities/pjl/view.js, ligne pour ligne ; calculs de three.js 0.170.0 dans l'ordre de ses
// opérations (doubles, une opération par instruction, sans contraction en FMA) ; tableaux Float32Array du web en float.
#include "StridesCore/HorseMirror.h"

#include <algorithm>
#include <cmath>
#include <map>

#include "StridesCore/MathUtil.h"

#if defined(__clang__)
#pragma float_control(push)
#pragma clang fp contract(off)
#endif

namespace strides::mirror {
namespace {
// Math.hypot(a, b, c) de V8 (même algorithme que strides::jsHypot à deux termes).
double hypot3(double a, double b, double c) {
  const double x = std::fabs(a), y = std::fabs(b), z = std::fabs(c);
  double m = x > y ? x : y;
  m = m > z ? m : z;
  if (m == INFINITY) return INFINITY;
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
// Quaternion.setFromRotationMatrix (haut 3×3 sans échelle).
void quatFromRotation(const double* te, double q[4]) {
  const double m11 = te[0], m12 = te[4], m13 = te[8];
  const double m21 = te[1], m22 = te[5], m23 = te[9];
  const double m31 = te[2], m32 = te[6], m33 = te[10];
  const double trace = m11 + m22 + m33;
  if (trace > 0) {
    const double s = 0.5 / std::sqrt(trace + 1.0);
    q[3] = 0.25 / s;
    q[0] = (m32 - m23) * s;
    q[1] = (m13 - m31) * s;
    q[2] = (m21 - m12) * s;
  } else if (m11 > m22 && m11 > m33) {
    const double s = 2.0 * std::sqrt(1.0 + m11 - m22 - m33);
    q[3] = (m32 - m23) / s;
    q[0] = 0.25 * s;
    q[1] = (m12 + m21) / s;
    q[2] = (m13 + m31) / s;
  } else if (m22 > m33) {
    const double s = 2.0 * std::sqrt(1.0 + m22 - m11 - m33);
    q[3] = (m13 - m31) / s;
    q[0] = (m12 + m21) / s;
    q[1] = 0.25 * s;
    q[2] = (m23 + m32) / s;
  } else {
    const double s = 2.0 * std::sqrt(1.0 + m33 - m11 - m22);
    q[3] = (m21 - m12) / s;
    q[0] = (m13 + m31) / s;
    q[1] = (m23 + m32) / s;
    q[2] = 0.25 * s;
  }
}
bool hasSide(const std::string& s, const std::string& tag, size_t& at) {
  // /tag(_|$)/ : première occurrence de tag suivie de « _ » ou de la fin.
  for (size_t p = s.find(tag); p != std::string::npos; p = s.find(tag, p + 1)) {
    const size_t e = p + tag.size();
    if (e == s.size() || s[e] == '_') {
      at = p;
      return true;
    }
  }
  return false;
}
}  // namespace

Mat4 compose(const Xf& t) {
  Mat4 m;
  double* te = m.e;
  const double x = t.q[0], y = t.q[1], z = t.q[2], w = t.q[3];
  const double x2 = x + x, y2 = y + y, z2 = z + z;
  const double xx = x * x2, xy = x * y2, xz = x * z2;
  const double yy = y * y2, yz = y * z2, zz = z * z2;
  const double wx = w * x2, wy = w * y2, wz = w * z2;
  const double sx = t.s[0], sy = t.s[1], sz = t.s[2];
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
  te[12] = t.p[0];
  te[13] = t.p[1];
  te[14] = t.p[2];
  te[15] = 1;
  return m;
}

Mat4 mul(const Mat4& A, const Mat4& B) {
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
  Mat4 r;
  double* te = r.e;
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
  return r;
}

Mat4 inverse(const Mat4& M) {
  const double* te = M.e;
  const double n11 = te[0], n21 = te[1], n31 = te[2], n41 = te[3];
  const double n12 = te[4], n22 = te[5], n32 = te[6], n42 = te[7];
  const double n13 = te[8], n23 = te[9], n33 = te[10], n43 = te[11];
  const double n14 = te[12], n24 = te[13], n34 = te[14], n44 = te[15];
  const double t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44;
  const double t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44;
  const double t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44;
  const double t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;
  const double det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
  Mat4 r;
  double* o = r.e;
  if (det == 0) {
    for (int i = 0; i < 16; i++) o[i] = 0;
    return r;
  }
  const double detInv = 1 / det;
  o[0] = t11 * detInv;
  o[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * detInv;
  o[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * detInv;
  o[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * detInv;
  o[4] = t12 * detInv;
  o[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * detInv;
  o[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * detInv;
  o[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * detInv;
  o[8] = t13 * detInv;
  o[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * detInv;
  o[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * detInv;
  o[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * detInv;
  o[12] = t14 * detInv;
  o[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * detInv;
  o[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * detInv;
  o[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * detInv;
  return r;
}

double determinant(const Mat4& M) {
  const double* te = M.e;
  const double n11 = te[0], n12 = te[4], n13 = te[8], n14 = te[12];
  const double n21 = te[1], n22 = te[5], n23 = te[9], n24 = te[13];
  const double n31 = te[2], n32 = te[6], n33 = te[10], n34 = te[14];
  const double n41 = te[3], n42 = te[7], n43 = te[11], n44 = te[15];
  return n41 * (+n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34) +
         n42 * (+n11 * n23 * n34 - n11 * n24 * n33 + n14 * n21 * n33 - n13 * n21 * n34 + n13 * n24 * n31 - n14 * n23 * n31) +
         n43 * (+n11 * n24 * n32 - n11 * n22 * n34 - n14 * n21 * n32 + n12 * n21 * n34 + n14 * n22 * n31 - n12 * n24 * n31) +
         n44 * (-n13 * n22 * n31 - n11 * n23 * n32 + n11 * n22 * n33 + n13 * n21 * n32 - n12 * n21 * n33 + n12 * n23 * n31);
}

void decompose(const Mat4& M, double p[3], double q[4], double s[3]) {
  const double* te = M.e;
  double sx = std::sqrt(te[0] * te[0] + te[1] * te[1] + te[2] * te[2]);
  const double sy = std::sqrt(te[4] * te[4] + te[5] * te[5] + te[6] * te[6]);
  const double sz = std::sqrt(te[8] * te[8] + te[9] * te[9] + te[10] * te[10]);
  const double det = determinant(M);
  if (det < 0) sx = -sx;
  p[0] = te[12];
  p[1] = te[13];
  p[2] = te[14];
  double m1[16];
  for (int i = 0; i < 16; i++) m1[i] = te[i];
  const double invSX = 1 / sx, invSY = 1 / sy, invSZ = 1 / sz;
  m1[0] *= invSX;
  m1[1] *= invSX;
  m1[2] *= invSX;
  m1[4] *= invSY;
  m1[5] *= invSY;
  m1[6] *= invSY;
  m1[8] *= invSZ;
  m1[9] *= invSZ;
  m1[10] *= invSZ;
  quatFromRotation(m1, q);
  s[0] = sx;
  s[1] = sy;
  s[2] = sz;
}

void slerpFlat(const double a[4], const double b[4], double t, double out[4]) {
  double x0 = a[0], y0 = a[1], z0 = a[2], w0 = a[3];
  const double x1 = b[0], y1 = b[1], z1 = b[2], w1 = b[3];
  if (t == 0) {
    out[0] = x0, out[1] = y0, out[2] = z0, out[3] = w0;
    return;
  }
  if (t == 1) {
    out[0] = x1, out[1] = y1, out[2] = z1, out[3] = w1;
    return;
  }
  if (w0 != w1 || x0 != x1 || y0 != y1 || z0 != z1) {
    double s = 1 - t;
    const double cos = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1;
    const double dir = cos >= 0 ? 1 : -1;
    const double sqrSin = 1 - cos * cos;
    if (sqrSin > 2.220446049250313e-16) {
      const double sin = std::sqrt(sqrSin);
      const double len = std::atan2(sin, cos * dir);
      s = std::sin(s * len) / sin;
      t = std::sin(t * len) / sin;
    }
    const double tDir = t * dir;
    x0 = x0 * s + x1 * tDir;
    y0 = y0 * s + y1 * tDir;
    z0 = z0 * s + z1 * tDir;
    w0 = w0 * s + w1 * tDir;
    if (s == 1 - t) {
      const double f = 1 / std::sqrt(x0 * x0 + y0 * y0 + z0 * z0 + w0 * w0);
      x0 *= f;
      y0 *= f;
      z0 *= f;
      w0 *= f;
    }
  }
  out[0] = x0, out[1] = y0, out[2] = z0, out[3] = w0;
}

std::vector<Mat4> worldMatrices(const Rig& rig, const std::vector<Xf>& local) {
  const size_t n = rig.names.size();
  std::vector<Mat4> w(n);
  std::vector<char> done(n, 0);
  std::function<const Mat4&(int)> get = [&](int i) -> const Mat4& {
    if (!done[i]) {
      const Mat4 m = compose(local[i]);
      w[i] = rig.parent[i] >= 0 ? mul(get(rig.parent[i]), m) : mul(rig.parentWorld[i], m);
      done[i] = 1;
    }
    return w[i];
  };
  for (size_t i = 0; i < n; i++) get(static_cast<int>(i));
  return w;
}

std::string baseName(const std::string& name) {
  // name.replace(/_\d+$/, '')
  size_t e = name.size();
  while (e > 0 && name[e - 1] >= '0' && name[e - 1] <= '9') e--;
  if (e < name.size() && e > 0 && name[e - 1] == '_') return name.substr(0, e - 1);
  return name;
}

int boneByBase(const Rig& rig, const std::string& base) {
  int found = -1;
  for (size_t i = 0; i < rig.names.size(); i++)
    if (baseName(rig.names[i]) == base) found = static_cast<int>(i);  // byBase.set : le dernier l'emporte
  return found;
}

std::vector<int> pairIndices(const Rig& rig) {
  std::map<std::string, int> byBase;
  for (size_t i = 0; i < rig.names.size(); i++) byBase[baseName(rig.names[i])] = static_cast<int>(i);
  std::vector<int> out(rig.names.size());
  for (size_t i = 0; i < rig.names.size(); i++) {
    const std::string base = baseName(rig.names[i]);
    std::string other;
    size_t at = 0;
    if (hasSide(base, "_l", at)) other = base.substr(0, at) + "_r" + base.substr(at + 2);
    else if (hasSide(base, "_r", at)) other = base.substr(0, at) + "_l" + base.substr(at + 2);
    else if (hasSide(base, "_left", at)) other = base.substr(0, at) + "_right" + base.substr(at + 5);
    else if (hasSide(base, "_right", at)) other = base.substr(0, at) + "_left" + base.substr(at + 6);
    const auto it = other.empty() ? byBase.end() : byBase.find(other);
    out[i] = it != byBase.end() ? it->second : static_cast<int>(i);
  }
  return out;
}

const std::vector<std::string>& mirroredSources() {
  static const std::vector<std::string> k = {"canter", "canter_L90", "canter_R90", "gallop", "gallop_L90", "gallop_R90",
                                             "jump_canter", "jump_gallop", "trot", "trot_L90", "trot_R90"};
  return k;
}

std::string mirroredName(const std::string& name) {
  const auto swap = [&](const std::string& a, const std::string& b) {
    const size_t p = name.find(a);
    return name.substr(0, p) + b + name.substr(p + a.size()) + "_M";
  };
  if (name.find("_L90") != std::string::npos) return swap("_L90", "_R90");
  if (name.find("_R90") != std::string::npos) return swap("_R90", "_L90");
  return name + "_M";
}

bool symmetryPlane(const Rig& rig, const std::vector<Xf>& pose, Plane& out) {
  const int l = boneByBase(rig, "upperarm_l"), r = boneByBase(rig, "upperarm_r");
  if (l < 0 || r < 0) return false;
  const std::vector<Mat4> w = worldMatrices(rig, pose);
  const double L[3] = {w[l].e[12], w[l].e[13], w[l].e[14]}, R[3] = {w[r].e[12], w[r].e[13], w[r].e[14]};
  // lateral = (L − R).normalize() : divideScalar(length() || 1) = multiplyScalar(1 / longueur)
  double n[3] = {L[0] - R[0], L[1] - R[1], L[2] - R[2]};
  double len = std::sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
  if (len == 0) len = 1;
  const double inv = 1 / len;
  for (int k = 0; k < 3; k++) out.n[k] = n[k] * inv;
  for (int k = 0; k < 3; k++) out.mid[k] = (L[k] + R[k]) * 0.5;
  out.d = out.n[0] * out.mid[0] + out.n[1] * out.mid[1] + out.n[2] * out.mid[2];
  return true;
}

Mat4 reflection(const Plane& pl) {
  const double nx = pl.n[0], ny = pl.n[1], nz = pl.n[2], d = pl.d;
  // Matrix4.set(lignes) → colonnes
  const double rows[16] = {1 - 2 * nx * nx, -2 * nx * ny, -2 * nx * nz, 2 * d * nx,  //
                           -2 * ny * nx, 1 - 2 * ny * ny, -2 * ny * nz, 2 * d * ny,  //
                           -2 * nz * nx, -2 * nz * ny, 1 - 2 * nz * nz, 2 * d * nz,  //
                           0, 0, 0, 1};
  Mat4 S;
  for (int r = 0; r < 4; r++)
    for (int c = 0; c < 4; c++) S.e[c * 4 + r] = rows[r * 4 + c];
  return S;
}

std::vector<double> bakeTimes(double duration, int fps) {
  const int n = std::max(2, static_cast<int>(std::floor(duration * fps + 0.5)) + 1);  // Math.round (valeurs positives)
  std::vector<double> t(n);
  for (int f = 0; f < n; f++) t[f] = std::min(duration, static_cast<double>(f) / fps);
  return t;
}

double loopClipTime(double t, double duration) {
  if (t >= duration || t < 0) {
    const double loopDelta = std::floor(t / duration);
    t -= duration * loopDelta;
  }
  return t;
}

void Clip::sample(double t, std::vector<Xf>& pose) const {
  const size_t n = times.size(), nb = bones.size();
  if (!n) return;
  size_t k0 = 0, k1 = 0;
  double w1 = 0;
  if (t >= times[n - 1]) k0 = k1 = n - 1;
  else if (t < times[0]) k0 = k1 = 0;
  else {
    k1 = static_cast<size_t>(std::upper_bound(times.begin(), times.end(), t, [](double a, float b) { return a < static_cast<double>(b); }) - times.begin());
    k0 = k1 - 1;
    const double t0 = times[k0], t1 = times[k1];
    w1 = (t - t0) / (t1 - t0);
  }
  for (size_t j = 0; j < nb; j++) {
    const float* a = &values[(k0 * nb + j) * 7];
    const float* b = &values[(k1 * nb + j) * 7];
    Xf& x = pose[bones[j]];
    if (k0 == k1) {
      for (int c = 0; c < 3; c++) x.p[c] = a[c];
      for (int c = 0; c < 4; c++) x.q[c] = a[3 + c];
      continue;
    }
    const double w0 = 1 - w1;
    for (int c = 0; c < 3; c++) x.p[c] = static_cast<double>(a[c]) * w0 + static_cast<double>(b[c]) * w1;
    const double qa[4] = {a[3], a[4], a[5], a[6]}, qb[4] = {b[3], b[4], b[5], b[6]};
    slerpFlat(qa, qb, w1, x.q);
  }
}

bool bakeMirror(const Rig& rig, const std::vector<int>& pairIdx, const Mat4& S, double duration, const SourcePose& source, Clip& out, int fps) {
  const size_t nb = rig.names.size();
  const std::vector<Mat4> restWorld = worldMatrices(rig, rig.rest);
  // C_b = (S W_b_rest)^-1 W_p_rest
  std::vector<Mat4> C(nb);
  for (size_t i = 0; i < nb; i++) C[i] = mul(inverse(mul(S, restWorld[i])), restWorld[pairIdx[i]]);
  const std::vector<double> times = bakeTimes(duration, fps);
  const size_t n = times.size();
  std::vector<float> pos(nb * n * 3), srcPos(nb * n * 3), quat(nb * n * 4);
  std::vector<Mat4> mirroredW(nb);
  std::vector<Xf> pose;
  for (size_t f = 0; f < n; f++) {
    pose = rig.rest;
    const double clipT = f == 0 ? times[0] : loopClipTime(times[f], duration);  // setTime(0) : pas de bouclage (deltaTime nul)
    if (!source(static_cast<int>(f), clipT, pose)) return false;
    const std::vector<Mat4> worldM = worldMatrices(rig, pose);
    for (size_t i = 0; i < nb; i++) {
      const Xf& sp = pose[pairIdx[i]];
      for (int k = 0; k < 3; k++) srcPos[(i * n + f) * 3 + k] = static_cast<float>(sp.p[k]);
    }
    // mirrored world of pair(i) = S W_i C_i
    for (size_t i = 0; i < nb; i++) mirroredW[pairIdx[i]] = mul(mul(S, worldM[i]), C[i]);
    for (size_t i = 0; i < nb; i++) {
      const Mat4& parentW = rig.parent[i] >= 0 ? mirroredW[rig.parent[i]] : rig.parentWorld[i];
      const Mat4 tmp = mul(inverse(parentW), mirroredW[i]);
      double P[3], Q[4], Sc[3];
      decompose(tmp, P, Q, Sc);
      for (int k = 0; k < 3; k++) pos[(i * n + f) * 3 + k] = static_cast<float>(P[k]);
      for (int k = 0; k < 4; k++) quat[(i * n + f) * 4 + k] = static_cast<float>(Q[k]);
    }
  }
  // fix quaternion sign continuity
  for (size_t i = 0; i < nb; i++) {
    float* q = &quat[i * n * 4];
    for (size_t f = 1; f < n; f++) {
      const double dot = static_cast<double>(q[f * 4]) * q[f * 4 - 4] + static_cast<double>(q[f * 4 + 1]) * q[f * 4 - 3] +
                         static_cast<double>(q[f * 4 + 2]) * q[f * 4 - 2] + static_cast<double>(q[f * 4 + 3]) * q[f * 4 - 1];
      if (dot < 0)
        for (int k = 0; k < 4; k++) q[f * 4 + k] *= -1;
    }
  }
  out = Clip();
  out.duration = duration;
  out.times.resize(n);
  for (size_t f = 0; f < n; f++) out.times[f] = static_cast<float>(times[f]);
  for (size_t i = 0; i < nb; i++) {
    const std::string& nm = rig.names[i];
    if (nm == "root_04" || nm == "_rootJoint") continue;
    const std::string base = baseName(nm);
    float* P = &pos[i * n * 3];
    if (base != "root" && base != "pelvis") {
      const float* sp = &srcPos[i * n * 3];
      bool moving = false;
      for (size_t f = 1; f < n && !moving; f++) {
        const double dx = static_cast<double>(sp[f * 3]) - sp[0], dy = static_cast<double>(sp[f * 3 + 1]) - sp[1], dz = static_cast<double>(sp[f * 3 + 2]) - sp[2];
        if (hypot3(dx, dy, dz) > 1e-3 * (hypot3(sp[0], sp[1], sp[2]) + 1e-6)) moving = true;
      }
      if (!moving) {
        const Xf& r = rig.rest[i];
        for (size_t f = 0; f < n; f++)
          for (int k = 0; k < 3; k++) P[f * 3 + k] = static_cast<float>(r.p[k]);
      } else {
        for (size_t f = 0; f < n; f++) {
          const double L = hypot3(P[f * 3], P[f * 3 + 1], P[f * 3 + 2]);
          const double want = hypot3(sp[f * 3], sp[f * 3 + 1], sp[f * 3 + 2]);
          if (L > 1e-9)
            for (int k = 0; k < 3; k++) P[f * 3 + k] = static_cast<float>(static_cast<double>(P[f * 3 + k]) * (want / L));
        }
      }
    }
    out.bones.push_back(static_cast<int>(i));
  }
  const size_t no = out.bones.size();
  out.values.resize(n * no * 7);
  for (size_t f = 0; f < n; f++)
    for (size_t j = 0; j < no; j++) {
      const size_t i = out.bones[j];
      float* v = &out.values[(f * no + j) * 7];
      for (int k = 0; k < 3; k++) v[k] = pos[(i * n + f) * 3 + k];
      for (int k = 0; k < 4; k++) v[3 + k] = quat[(i * n + f) * 4 + k];
    }
  return true;
}

void leadStep(LeadState& A, double turn, double dt) {
  dt = std::min(dt, 0.1);
  if (std::fabs(turn) > 0.25 && signd(turn) != A.lead) {
    A.hold += dt;
    if (A.hold > 0.5) {
      A.lead = static_cast<int>(signd(turn));
      A.hold = 0;
    }
  } else
    A.hold = 0;
}

char clipLead(int lead, bool leadSwap) {
  const char dest = lead > 0 ? 'L' : 'R';
  return leadSwap ? (dest == 'L' ? 'R' : 'L') : dest;
}

double leadBlendStep(double lb, char lead, double dt) {
  const double want = lead == 'R' ? 1 : 0;
  const double t = 1 - std::exp(-10 * dt);
  return lb + (want - lb) * t;
}

JumpChoice jumpChoice(double speed, char lead) {
  JumpChoice c;
  c.gallop = speed > 8;
  c.mirror = lead == 'L';
  return c;
}

std::string jumpClipName(const JumpChoice& c) { return std::string(c.gallop ? "jump_gallop" : "jump_canter") + (c.mirror ? "_M" : ""); }

bool jumpViewStep(JumpView& v, bool jumping, double speed, char lead) {
  const bool start = jumping && !v.wasJumping;
  if (start) {
    v.clip = jumpChoice(speed, lead);
    v.hasClip = true;
  }
  v.wasJumping = jumping;
  return start;
}

}  // namespace strides::mirror

#if defined(__clang__)
#pragma float_control(pop)
#endif
