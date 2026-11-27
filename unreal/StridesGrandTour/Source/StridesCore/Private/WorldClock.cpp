// Jalon J3-C : voir WorldClock.h (weather.js, sun.js, game.js portés ligne à ligne).
#include "StridesCore/WorldClock.h"

#include <algorithm>
#include <cmath>
#include <cstdio>

namespace strides::clock {

static constexpr double kPi = 3.14159265358979323846;
static double mod(double a, double n) { return std::fmod(std::fmod(a, n) + n, n); }
// Produits et sommes en instructions séparées : sans cela le compilateur fusionne n · 127,1 + 311,7 en une seule opération
// (FMA, arrondi différent du JavaScript) et l'écart, multiplié par 43 758, change le vent du jour.
static double hashN(double n) {
  const double m = n * 127.1;
  const double a = m + 311.7;
  const double s = std::sin(a) * 43758.5453;
  return s - std::floor(s);
}
// core/math.js smoothstep(a, b, x) : t = clamp((x − a) / (b − a), 0, 1), t² (3 − 2t).
static double smoothstep(double a, double b, double x) {
  const double t = std::clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3 - 2 * t);
}
static const double COVERS[] = {0.38, 0.55, 0.28, 0.72, 0.46, 0.62, 0.33, 0.8, 0.5};

double dayCover(int day) { return COVERS[(int)mod(day, 9)]; }

double coverAt(int day, double hour) { return dayCover(day) + (dayCover(day + 1) - dayCover(day)) * smoothstep(21, 24, hour); }

double rainTarget(int day, double hour) {
  if (dayCover(day) < 0.72) return 0;
  return smoothstep(0.35, 0.7, std::sin(hour * 1.3 + day * 2.1) * 0.5 + 0.5) * smoothstep(0, 2, hour) * smoothstep(24, 22, hour);
}

static double tMax(int day) { return 22.5 - dayCover(day) * 6.5 + (hashN(day) - 0.5) * 3; }
static double tMin(int day) { return 12 + dayCover(day) * 2.5 + (hashN(day + 50) - 0.5) * 2; }

double temperature(int day, double hour) {
  const double x = mod(hour - 6, 24);
  double t;
  if (x < 9) t = tMin(day) + (tMax(day) - tMin(day)) * (0.5 - 0.5 * std::cos((kPi * x) / 9));
  else {
    const int d = hour < 6 ? day - 1 : day;
    t = tMin(d + 1) + (tMax(d) - tMin(d + 1)) * (0.5 + 0.5 * std::cos((kPi * (x - 9)) / 15));
  }
  return t - rainTarget(day, hour) * 2.5;
}

Wind wind(int day, double hour) {
  static const char* DIRS[] = {"N", "NE", "E", "SE", "S", "SO", "O", "NO"};
  const double c = dayCover(day);
  // Math.round : arrondi vers +∞ à 0,5 (floor(x + 0,5)).
  const int kmh = (int)std::floor(8 + c * 22 + hashN(day + 7) * 8 + 4 * std::sin((hour - 9) * 0.26) + 0.5);
  const double deg = mod(250 + (hashN(day + 13) - 0.5) * 90 + c * 20, 360);
  Wind w;
  w.kmh = std::max(3, kmh);
  w.deg = deg;
  w.dir = DIRS[(int)std::floor(deg / 45 + 0.5) % 8];
  return w;
}

std::string conditionText(int day, double hour) {
  const bool night = hour < 6 || hour > 21.5;
  const double c = coverAt(day, hour), r = rainTarget(day, hour);
  if (r > 0.5) return "Averses";
  if (r > 0.08) return "Pluie faible";
  if (night) return c < 0.5 ? "Nuit claire" : "Nuit couverte";
  if (c < 0.35) return "Ensoleillé";
  if (c < 0.55) return "Éclaircies";
  if (c < 0.7) return "Nuageux";
  return "Couvert";
}

static constexpr double M2 = 12.4206012, S2 = 12;
static constexpr double W2 = (2 * kPi) / M2, WS = (2 * kPi) / S2;
static constexpr double PHASE = 4.2;
static constexpr double A2 = 2.7, AS = 0.84, A4 = 0.42;

double tideLevel(double t) {
  const double a = W2 * (t - PHASE);
  return A2 * std::cos(a) + AS * std::cos(WS * (t - PHASE)) - A4 * std::cos(2 * a) + A4 * 0.5;
}

int tideCoef(double t) {
  const double amp = std::hypot(A2 + AS * std::cos((WS - W2) * (t - PHASE)), AS * std::sin((WS - W2) * (t - PHASE)));
  return (int)std::floor(std::clamp(30 + (85 * (amp - (A2 - AS))) / (2 * AS), 20.0, 120.0) + 0.5);
}

TideState tideState(double t) {
  TideState s;
  s.level = tideLevel(t);
  s.wet = s.level;
  for (double k = 0.5; k <= 6; k += 0.5) s.wet = std::max(s.wet, tideLevel(t - k));
  s.mark = s.level;
  for (double k = 0; k <= 26; k += 0.5) s.mark = std::max(s.mark, tideLevel(t - k));
  s.rising = tideLevel(t + 0.1) > s.level;
  return s;
}

static constexpr double RAD = kPi / 180;
static constexpr double LAT = 49.36, LON = 0.07, UTC = 2, DOY = 235;  // sun.js SUN_SITE

SunPos sunPosition(double hour) {
  const double g = ((2 * kPi) / 365) * (DOY - 1 + (hour - UTC - 12) / 24);
  const double eqTime = 229.18 * (0.000075 + 0.001868 * std::cos(g) - 0.032077 * std::sin(g) - 0.014615 * std::cos(2 * g) - 0.040849 * std::sin(2 * g));
  const double decl = 0.006918 - 0.399912 * std::cos(g) + 0.070257 * std::sin(g) - 0.006758 * std::cos(2 * g) + 0.000907 * std::sin(2 * g) -
                      0.002697 * std::cos(3 * g) + 0.00148 * std::sin(3 * g);
  const double trueSolar = hour * 60 + eqTime + 4 * LON - 60 * UTC;
  const double ha = (trueSolar / 4 - 180) * RAD;
  const double lat = LAT * RAD;
  const double cosZen = std::sin(lat) * std::sin(decl) + std::cos(lat) * std::cos(decl) * std::cos(ha);
  const double zen = std::acos(std::max(-1.0, std::min(1.0, cosZen)));
  double az = std::atan2(std::sin(ha), std::cos(ha) * std::sin(lat) - std::tan(decl) * std::cos(lat)) / RAD + 180;
  az = std::fmod(std::fmod(az, 360) + 360, 360);
  return {90 - zen / RAD, az, decl / RAD, eqTime};
}

SunTimes sunTimes() {
  const SunPos p = sunPosition(12);
  const double noon = (720 - 4 * LON - p.eqTime + 60 * UTC) / 60;
  const double lat = LAT * RAD, d = p.decl * RAD;
  const double cosH = (std::cos(90.833 * RAD) - std::sin(lat) * std::sin(d)) / (std::cos(lat) * std::cos(d));
  const double half = (std::acos(std::max(-1.0, std::min(1.0, cosH))) / RAD) * 4 / 60;
  return {noon - half, noon, noon + half};
}

void sunDirection(double hour, double& x, double& y, double& z) {
  const SunPos p = sunPosition(hour);
  const double a = p.alt * RAD, zz = p.az * RAD;
  x = std::sin(zz) * std::cos(a);
  y = std::sin(a);
  z = -std::cos(zz) * std::cos(a);
}

double hourOf(double gameTime) { return std::fmod(gameTime / 3600, 24); }
int dayOf(double gameTime) { return (int)std::floor(gameTime / 86400); }

std::string clockText(double gameTime) {
  const double h = hourOf(gameTime);
  const int hh = (int)std::floor(h), mm = (int)std::floor((h - hh) * 60);
  char b[16];
  std::snprintf(b, sizeof b, "%d:%02d", hh, mm);
  return b;
}

double advance(double gameTime, double dt, bool paused, bool realTime) {
  const double sdt = paused ? 0 : dt;
  return gameTime + (sdt * 86400) / (realTime ? 86400 : kDayLength);
}

}  // namespace strides::clock
