// Parcours de CSO et jugement — portage de src/gameplay/csoCourse.js (tracé), src/gameplay/courses.js (temps accordé,
// fautes, refus, éliminations, résultat) et src/gameplay/challenge.js (pénalités de temps, classement).
// Oracles : unreal/core/tests/oracles/cso_course.json ; scénarios : tests/test_judge.cpp.
#pragma once
#include <map>
#include <string>
#include <vector>

namespace strides {

// Commande de tracé : F d (droite), L/R r a (courbe à gauche/droite, rayon r, a degrés), J label kind [spread] (obstacle),
// M name (ligne de départ / d'arrivée). Repère de la carrière : x est, z sud, cap h → direction (sin h, cos h).
struct CourseCmd { char op = 'F'; double a = 0, b = 0; std::string label, kind; double spread = 0; };
struct CourseDesign { double x = 0, z = 0, h = 0; std::vector<CourseCmd> cmds; std::map<std::string, double> profile; };
struct TracePoint { double x, z, h, s; };
struct TraceFence { std::string label, kind; double spread, x, z, rot, s; };
struct TraceMark { double x, z, rot, s; };
struct CourseTrace { std::vector<TracePoint> pts, leadIn; std::vector<TraceFence> fences; std::map<std::string, TraceMark> marks; double length = 0; };

CourseDesign poleDesign();  // tracé du Pôle International (csoCourse.js, CSO_DESIGN)
CourseTrace traceCourse(const CourseDesign& d, double step = 0.5);
std::vector<double> courseHeights(const CourseDesign& d, const CourseTrace& t, double h);

int timeAllowedFor(double length, double speedMPerMin);
int timeFaults(double t, double allowed, int perSecond = 1);

struct RunResult { bool eliminated = false; int penalties = 0; double time = 0; };
// < 0 si a est meilleur : terminé avant éliminé, puis moins de pénalités, puis meilleur chrono.
int compareResults(const RunResult& a, const RunResult& b);

// Juge d'une épreuve (CSO ou cross) : reçoit les événements du parcours et tient fautes, refus, chrono, élimination.
enum class Elim { None, Refusals, FenceRefusals, TimeLimit, Dismounted };
class CourseJudge {
 public:
  CourseJudge(std::vector<std::string> labels, double timeAllowed, bool cross = false, int maxRefusals = -1);
  void startCrossed();                            // ligne de départ franchie : le chrono part
  void tick(double dt);                           // temps qui passe (chrono si lancé)
  bool clear(int num, int dir);                   // obstacle franchi sans faute (num : 1..n) ; faux si erreur de parcours
  bool rail(int num, int dir);                    // barre tombée (+4) ; faux si erreur de parcours
  void refusal(int num, int dir);                 // refus (+4, cross +20) ; double : reprise au premier élément
  void dismounted();                              // cavalier descendu : éliminé
  bool finishCrossed();                           // arrivée (tous les obstacles passés) : vrai si l'épreuve se termine
  int points() const;                             // fautes + pénalités de temps (règle CSO ou cross)
  int next() const { return next_; }
  int faults() const { return faults_; }
  int refusals() const { return refusals_; }
  double time() const { return t_; }
  bool started() const { return started_; }
  bool finished() const { return finished_; }
  Elim eliminated() const { return elim_; }
  RunResult result() const;
  int wrongCourse() const { return wrong_; }

 private:
  void advance();
  bool active() const { return !finished_ && elim_ == Elim::None; }
  std::vector<std::string> labels_;
  double allowed_, t_ = 0;
  bool cross_, started_ = false, finished_ = false;
  int maxRef_, pen_, next_ = 1, faults_ = 0, refusals_ = 0, fenceRefusals_ = 0, wrong_ = 0;
  Elim elim_ = Elim::None;
};

}  // namespace strides
