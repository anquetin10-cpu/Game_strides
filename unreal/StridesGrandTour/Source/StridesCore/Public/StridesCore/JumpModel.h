// Modèle de saut d'obstacle (CSO) — portage C++ de src/gameplay/jumpModel.js (spécification : le code JS et ses tests ;
// oracles : unreal/core/tests/oracles/jump.json). C++17 standard, sans dépendance à Unreal : utilisé tel quel par le
// module Unreal (StridesGrandTour) et testé hors moteur (unreal/core/tests).
// Unités SI : mètres, secondes, m/s. Repère horizontal (x, z) du jeu web ; la conversion Unreal (cm, axes) est faite par
// l'appelant (voir unreal/docs/conventions.md).
#pragma once
#include <string>
#include <vector>

namespace strides {

struct JumpParams {
  double T = 0.8, lift = 0.2, adapt = 0.06, shorten = 0.12, adaptXc = 0.12, shortenXc = 0.24, minFront = 0.55,
         good = 0.15, rub = 0.06, late = 0.3, maxAngle = 0.5, reach = 13, clear = 0.32, spreadK = 0.18, T0 = 0.56,
         Tk = 0.1, Tmin = 0.6, Tmax = 0.74;
};
const JumpParams& jumpDefaults();

struct Vec2 { double x = 0, z = 0; };
struct Bar { double s = 0, h = 0; };
// Obstacle : position, axe de saut n, axe transversal t, barres (s le long de n, hauteur h), nature
// ('v' vertical, 'o' oxer, 'w' mur, autre : cross / saut libre).
struct Fence { Vec2 pos, n{0, 1}, t{1, 0}; std::vector<Bar> bars; std::string kind = "v"; };
struct RailAhead { double s = 0, h = 0, x = 0, u = 0; };
struct FenceGeo { double cosA = 1; int sign = 1; std::vector<RailAhead> rails; std::string kind; bool valid = false; };
struct JumpHorse { double v = 0, power = 1.5, clearance = 0; bool cso = false; };

enum class Zone { None, Good, Far, Near, Refuse };
enum class Cause { None, TooClose, Far, Near, Angle, Slow, Fast };
enum class Quality { None, Perfect, Good, BitFar, BitNear, Far, Near, Angle, Slow, TooClose, Fast };

struct JumpPlan {
  double L = 0, H = 0, L0 = 0, margin = 0, ideal = 0, cosA = 1, dev = 0;
  bool hasMargin = false, cso = false;
  std::vector<double> margins;
  Zone zone = Zone::None;
  Cause cause = Cause::None;
};

double speedFactor(double v);
double angleFactor(double cosA);
double arcY(double H, double L, double x);
FenceGeo railsAhead(const Fence& f, double px, double pz, double fx, double fz);
JumpPlan planJump(const JumpHorse& horse, const FenceGeo* geo, const JumpParams& P = jumpDefaults());
Quality takeoffQuality(const JumpPlan& plan);

const char* zoneName(Zone);
const char* causeName(Cause);
const char* qualityName(Quality);

}  // namespace strides
