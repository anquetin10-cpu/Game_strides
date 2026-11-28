// Sellerie affichée du cheval WildMesh (étape S1) : voir StridesCore/HorseStraps.h.
#include "StridesCore/HorseStraps.h"

#include <cmath>
#include <stdexcept>

#include "StridesCore/MiniJson.h"

namespace strides::straps {

namespace {
const double kPi = 3.14159265358979323846;

double num(const J& o, const char* k) {
  const J& v = o[k];
  if (v.t != J::Num) throw std::runtime_error(std::string("pjl_horse_tack_mesh.json : constante ") + k + " absente");
  return v.n;
}
StrapParams strap(const J& o, const char* k) {
  const J& s = o[k];
  if (s.t != J::Obj) throw std::runtime_error(std::string("pjl_horse_tack_mesh.json : lanière ") + k + " absente");
  StrapParams p;
  p.n = (int)num(s, "n");
  p.w = num(s, "w");
  if (p.n < 1 || p.w <= 0) throw std::runtime_error(std::string("pjl_horse_tack_mesh.json : lanière ") + k + " invalide");
  return p;
}
// three.js Vector3.applyQuaternion.
V3 applyQ(const V3& v, const Q4& q) {
  const double tx = 2 * (q.y * v.z - q.z * v.y), ty = 2 * (q.z * v.x - q.x * v.z), tz = 2 * (q.x * v.y - q.y * v.x);
  return V3{v.x + q.w * tx + q.y * tz - q.z * ty, v.y + q.w * ty + q.z * tx - q.x * tz, v.z + q.w * tz + q.x * ty - q.y * tx};
}
}  // namespace

StrapsModel strapsModelFromJson(const J& j) {
  const J& c = j["constants"];
  if (c.t != J::Obj) throw std::runtime_error("pjl_horse_tack_mesh.json : clé constants absente");
  StrapsModel m;
  m.leather = strap(c, "leather");
  m.rein = strap(c, "rein");
  m.ironEye = num(c, "ironEye");
  m.toeDrop = num(c, "toeDrop");
  m.reinSagMax = num(c, "reinSagMax");
  m.reinSagPerLen = num(c, "reinSagPerLen");
  m.reinSagFree = num(c, "reinSagFree");
  m.crestSide = num(c, "crestSide");
  m.detailDist = num(c, "detailDist");
  return m;
}

StrapsModel strapsModelFromFile(const std::string& path) { return strapsModelFromJson(loadJson(path)); }

void strapSet(const StrapParams& p, const V3& a, const V3& b, double sag, const V3& side, std::vector<V3>& out) {
  out.resize(2 * (p.n + 1));
  for (int i = 0; i <= p.n; i++) {
    const double t = (double)i / p.n;
    const double x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    const double y = a.y + (b.y - a.y) * t - std::sin(kPi * t) * sag;
    out[2 * i] = V3{x - side.x * p.w, y - side.y * p.w, z - side.z * p.w};
    out[2 * i + 1] = V3{x + side.x * p.w, y + side.y * p.w, z + side.z * p.w};
  }
}

V3 stirrupUnderToe(const StrapsModel& m, const V3& toe, double riderScale) {
  V3 s = toe;
  s.y -= m.toeDrop * riderScale;
  return s;
}

void strapsStep(const StrapsModel& m, const StrapsIn& in, StrapsOut& out) {
  const bool far = in.hasCam ? std::hypot(in.horseX - in.cam.x, in.horseZ - in.cam.z) > m.detailDist : false;
  out.show = in.saddle && !far;
  if (!out.show) return;  // le web laisse étriers et lanières tels quels, masqués
  const V3 lat = applyQ(V3{1, 0, 0}, in.holder), fw = applyQ(V3{0, 0, 1}, in.holder);
  for (int k = 0; k < 2; k++) {
    // Étrier : sous le pied du cavalier quand il y est (os d'étrier du cheval du jeu, placé au pied), sinon pendant.
    const V3 iron = in.inStirrup[k] ? in.stirrup[k] : in.ironAnchor[k];
    out.iron[k] = iron;
    out.ironQ[k] = in.holder;
    // Étrivière : du porte-étrivière à l'œil de l'étrier, à plat sur le quartier (largeur dans l'axe du cheval).
    V3 eye = iron;
    eye.y += m.ironEye;
    strapSet(m.leather, in.bar[k], eye, 0, fw, out.leather[k]);
  }
  // Rênes : du mors aux poings ; sans cavalier, sur l'encolure (devant le garrot).
  for (int k = 0; k < 2; k++) {
    const V3& bit = in.bit[k];
    V3 b;
    if (in.hasHands) b = in.hand[k];
    else {
      const double s = k ? -m.crestSide : m.crestSide;
      b = V3{in.crest.x + lat.x * s, in.crest.y + lat.y * s, in.crest.z + lat.z * s};
    }
    const double dx = bit.x - b.x, dy = bit.y - b.y, dz = bit.z - b.z;
    const double len = std::sqrt(dx * dx + dy * dy + dz * dz);
    strapSet(m.rein, bit, b, in.hasHands ? std::fmin(m.reinSagMax, len * m.reinSagPerLen) : m.reinSagFree, V3{0, 1, 0}, out.rein[k]);
  }
}

}  // namespace strides::straps
