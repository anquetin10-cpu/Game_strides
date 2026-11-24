// Phase de foulée du cheval WildMesh lue par le cavalier (essai de monte, voie A, étape M3) : voir HorsePhase.h.
#include "StridesCore/HorsePhase.h"

#include <cmath>
#include <stdexcept>

#include "StridesCore/MiniJson.h"

namespace strides::phase {
namespace {
constexpr double kPi = 3.14159265358979323846;
// pjlHorse.js : const wrap01 = (u) => u - Math.floor(u);
double wrap01(double u) { return u - std::floor(u); }
std::vector<double> nums(const J& a, const char* what) {
  if (a.t != J::Arr) throw std::runtime_error(std::string("pjl_horse_phase.json : ") + what);
  std::vector<double> v;
  for (const J& x : a.a) v.push_back(x.num());
  return v;
}
}  // namespace

CircularFit circularOffset(const std::vector<double>& a, const std::vector<double>& b) {
  CircularFit r;
  if (a.empty() || a.size() != b.size()) return r;
  double sx = 0, sy = 0;
  for (size_t i = 0; i < a.size(); i++) {
    const double d = (a[i] - b[i]) * kPi * 2;
    sx += std::cos(d);
    sy += std::sin(d);
  }
  r.off = wrap01(std::atan2(sy, sx) / (kPi * 2));
  double res = 0;
  for (size_t i = 0; i < a.size(); i++) {
    double d = wrap01(a[i] - b[i] - r.off);
    if (d > 0.5) d -= 1;
    res += std::fabs(d);
  }
  r.res = res / (double)a.size();
  r.ok = true;
  return r;
}

PhaseModel phaseModelFromJson(const J& j) {
  if (j["schema"].s != "strides.pjl_horse_phase/1") throw std::runtime_error("pjl_horse_phase.json : schéma inattendu");
  PhaseModel m;
  for (const auto& [k, v] : j["gaitInfo"].o) m.infoOffset[k] = v["offset"].num();
  for (const auto& [k, v] : j["gaitOffsets"].o) m.gaitOff[k] = nums(v, "gaitOffsets");
  for (const auto& [k, v] : j["gaitContacts"].o) {
    GaitContact c;
    c.touch = nums(v["touch"], "touch");
    c.duty = nums(v["duty"], "duty");
    c.duration = v["duration"].num();
    m.contacts[k] = c;
  }
  m.gallopAbove = j["rules"]["gallopAbove"].num();
  m.minSpeed = j["rules"]["minSpeed"].num();
  m.postAssignments = (int)j["riderPostOffset"]["assignments"].num();
  for (const auto& [k, v] : j["web"]["align"].o) {
    CircularFit f;
    if (!v.isNull()) f = {v["off"].num(), v["res"].num(), true};
    m.webAlign[k] = f;
  }
  m.webLeadSwap = j["web"]["leadSwap"].b;
  if (m.infoOffset.empty() || m.gaitOff.empty() || m.contacts.empty()) throw std::runtime_error("pjl_horse_phase.json : données incomplètes");
  return m;
}

void calibrate(PhaseModel& m) {
  // pjlHorse.js _calibrate : fit(clip, key, info) = circularOffset(touch − info.offset, GAIT_OFFSETS[key]) ; null si le clip
  // ou la clé manque.
  const auto fit = [&](const std::string& clip, const std::string& key, const std::string& info) {
    CircularFit none;
    const auto c = m.contacts.find(clip);
    const auto off = m.gaitOff.find(key);
    const auto inf = m.infoOffset.find(info);
    if (c == m.contacts.end() || off == m.gaitOff.end() || inf == m.infoOffset.end()) return none;
    std::vector<double> sim;
    for (double x : c->second.touch) sim.push_back(wrap01(x - inf->second));
    return circularOffset(sim, off->second);
  };
  const CircularFit r = fit("canter", "canterR", "canter"), l = fit("canter", "canterL", "canter");
  m.leadSwap = r.ok && l.ok && l.res + 0.02 < r.res;
  const std::string right = m.leadSwap ? "L" : "R", left = m.leadSwap ? "R" : "L";
  m.align.clear();
  m.align["walk"] = fit("walk", "walk", "walk");
  m.align["trot"] = fit("trot", "trot", "trot");
  m.align["canter" + right] = fit("canter", "canter" + right, "canter");
  m.align["canter" + left] = fit("canter_M", "canter" + left, "canter");
  m.align["gallop" + right] = fit("gallop", "gallop" + right, "gallop");
  m.align["gallop" + left] = fit("gallop_M", "gallop" + left, "gallop");
}

std::string clipFamily(const std::string& clipName) {
  const std::string k = clipName.substr(0, clipName.find('_'));
  return k == "walk" || k == "trot" || k == "canter" || k == "gallop" ? k : std::string();
}

double phaseStep(const PhaseModel& m, PhaseState& st, const std::string& gait, const std::string& clipName, double clipPhase, double speed,
                 char lead, bool jumping) {
  st.rewritten = false;
  // pjlHorse.js _snapshot : const key = g === 'canter' || g === 'gallop' ? (speed > 9.8 ? 'gallop' : 'canter') + leadDest : g;
  const std::string key = gait == "canter" || gait == "gallop" ? std::string(speed > m.gallopAbove ? "gallop" : "canter") + (lead == 'L' ? "L" : "R") : gait;
  const auto al = m.align.find(key);
  const std::string fam = clipFamily(clipName);
  const auto inf = m.infoOffset.find(fam);
  // if (al && !jumping && speed > 0.2) H.anim.phase = wrap01(this.ph - al.off) ; ph retrouvée depuis le temps du clip joué
  // (view.js : temps = ((ph + offset) % 1) · durée).
  if (al != m.align.end() && al->second.ok && !jumping && speed > m.minSpeed && inf != m.infoOffset.end()) {
    const double ph = wrap01(clipPhase - inf->second);
    st.animPhase = wrap01(ph - al->second.off);
    st.rewritten = true;
  }
  return st.animPhase;
}

}  // namespace strides::phase
