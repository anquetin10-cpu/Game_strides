// Portage de csoCourse.js / courses.js / challenge.js (voir CsoCourse.h).
#include "StridesCore/CsoCourse.h"
#include "StridesCore/MathUtil.h"

#include <algorithm>
#include <cmath>
#include <set>

namespace strides {

CourseDesign poleDesign() {
  // POLE (src/world/sites.js) : entrée x 330 (carrière x 330) → start.x = 0 ; carrière d = 76 → start.z = 76/2 − 5.
  CourseDesign d;
  d.x = 0; d.z = 76.0 / 2 - 5; d.h = kPi;
  auto F = [&](double v) { d.cmds.push_back({'F', v, 0, "", "", 0}); };
  auto L = [&](double r, double a) { d.cmds.push_back({'L', r, a, "", "", 0}); };
  auto R = [&](double r, double a) { d.cmds.push_back({'R', r, a, "", "", 0}); };
  auto J = [&](const char* l, const char* k, double sp = 0) { d.cmds.push_back({'J', 0, 0, l, k, sp}); };
  auto M = [&](const char* n) { d.cmds.push_back({'M', 0, 0, n, "", 0}); };
  L(13, 45); F(7); M("start"); F(11); J("1", "v"); F(14);
  R(17.7, 135);
  F(18); J("2", "o", 1.3); F(22.0); J("3", "v"); F(12);
  R(14.5, 180);
  F(18); J("4A", "v"); F(11.4); J("4B", "o", 1.3); F(18.4); J("5", "w"); F(29);
  L(14, 180);
  F(18); J("6A", "v"); F(7.8); J("6B", "o", 1.2); F(25.6); J("7", "v"); F(22.0); J("8", "o", 1.5);
  F(10); M("finish");
  d.profile = {{"1", -0.05}, {"4A", -0.05}, {"8", 0.05}};
  return d;
}

CourseTrace traceCourse(const CourseDesign& d, double step) {
  double x = d.x, z = d.z, h = d.h, s = 0;
  std::vector<TracePoint> pts{{x, z, h, s}};
  std::vector<TraceFence> fences;
  std::map<std::string, TraceMark> marks;
  for (const auto& c : d.cmds) {
    if (c.op == 'F') {
      const int n = std::max(1, (int)std::lround(c.a / step));
      for (int i = 0; i < n; i++) {
        x += std::sin(h) * c.a / n;
        z += std::cos(h) * c.a / n;
        s += c.a / n;
        pts.push_back({x, z, h, s});
      }
    } else if (c.op == 'L' || c.op == 'R') {
      const double a = c.b * kPi / 180, len = c.a * a;
      const int n = std::max(2, (int)std::lround(len / step));
      const double sgn = c.op == 'L' ? 1 : -1;
      for (int i = 0; i < n; i++) {
        h += sgn * a / n;
        x += std::sin(h) * len / n;
        z += std::cos(h) * len / n;
        s += len / n;
        pts.push_back({x, z, h, s});
      }
    } else if (c.op == 'J') fences.push_back({c.label, c.kind, c.spread, x, z, h, s});
    else if (c.op == 'M') marks[c.label] = {x, z, h, s};
  }
  const double s0 = marks.count("start") ? marks["start"].s : 0;
  const double eps = 1e-6;
  CourseTrace t;
  for (const auto& p : pts) {
    if (p.s >= s0 - eps) t.pts.push_back({p.x, p.z, p.h, p.s - s0});
    if (p.s <= s0 + eps) t.leadIn.push_back({p.x, p.z, p.h, p.s - s0});
  }
  for (auto f : fences) { f.s -= s0; t.fences.push_back(f); }
  for (auto& [k, m] : marks) { m.s -= s0; t.marks[k] = m; }
  t.length = t.marks.count("finish") ? t.marks["finish"].s : s - s0;
  return t;
}

std::vector<double> courseHeights(const CourseDesign& d, const CourseTrace& t, double h) {
  std::vector<double> out;
  for (const auto& f : t.fences) {
    auto it = d.profile.find(f.label);
    out.push_back(std::round((h + (it == d.profile.end() ? 0 : it->second)) * 100) / 100);
  }
  return out;
}

int timeAllowedFor(double length, double speed) { return (int)std::ceil(length / speed * 60); }
int timeFaults(double t, double allowed, int perSecond) {
  const double over = t - allowed;
  return over > 1e-9 ? (int)std::ceil(over - 1e-9) * perSecond : 0;
}
int compareResults(const RunResult& a, const RunResult& b) {
  if (a.eliminated != b.eliminated) return a.eliminated ? 1 : -1;
  if (a.eliminated) return 0;
  if (a.penalties != b.penalties) return a.penalties - b.penalties;
  return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
}

CourseJudge::CourseJudge(std::vector<std::string> labels, double timeAllowed, bool cross, int maxRefusals)
    : labels_(std::move(labels)), allowed_(timeAllowed), cross_(cross), maxRef_(maxRefusals >= 0 ? maxRefusals : cross ? 4 : 2), pen_(cross ? 20 : 4) {}

void CourseJudge::startCrossed() { if (!started_) started_ = true; }
void CourseJudge::tick(double dt) {
  if (!started_ || !active()) return;
  t_ += dt;
  if (t_ > allowed_ * 2) elim_ = Elim::TimeLimit;  // temps limite : le double du temps accordé
}
void CourseJudge::advance() { next_++; fenceRefusals_ = 0; }
bool CourseJudge::clear(int num, int dir) {
  if (!active() || !started_ || dir <= 0) return true;
  if (num == next_) { advance(); return true; }
  wrong_++;
  return false;
}
bool CourseJudge::rail(int num, int dir) {
  if (!active() || !started_ || dir <= 0) return true;
  if (num == next_) { faults_ += 4; advance(); return true; }
  wrong_++;
  return false;
}
void CourseJudge::refusal(int num, int dir) {
  if (!active() || !started_ || dir < 0 || num != next_) return;
  refusals_++;
  fenceRefusals_++;
  faults_ += pen_;
  // Refus dans une combinaison (élément « B ») : reprise au premier élément (« A »).
  const std::string& lab = labels_[num - 1];
  if (!lab.empty() && lab.back() == 'B') {
    const std::string a = lab.substr(0, lab.size() - 1) + "A";
    for (size_t i = 0; i < labels_.size(); i++) if (labels_[i] == a) { next_ = (int)i + 1; break; }
  }
  if (refusals_ >= maxRef_) elim_ = Elim::Refusals;
  else if (cross_ && fenceRefusals_ >= 3) elim_ = Elim::FenceRefusals;
}
void CourseJudge::dismounted() { if (active()) elim_ = Elim::Dismounted; }
bool CourseJudge::finishCrossed() {
  if (!active() || !started_ || next_ <= (int)labels_.size()) return false;
  finished_ = true;
  return true;
}
int CourseJudge::points() const {
  const double over = std::max(0.0, t_ - allowed_);
  return faults_ + (!cross_ ? (int)std::ceil(over - 1e-9) : (int)std::lround(over * 0.4));
}
RunResult CourseJudge::result() const { return {elim_ != Elim::None, elim_ != Elim::None ? 0 : points(), std::round(t_ * 100) / 100}; }

}  // namespace strides
