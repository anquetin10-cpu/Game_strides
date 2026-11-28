// Jalon J3-C : heure du jeu, météo, marées et soleil (StridesCore/WorldClock) contre l'oracle calculé par les modules du
// web eux-mêmes (tests/oracles/meteo.json, scripts/unreal/export-meteo.mjs : weather.js, sun.js, config.js).
// Usage : strides_meteo_tests <dossier des oracles>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>

#include "StridesCore/MiniJson.h"
#include "StridesCore/WorldClock.h"

static int g_checks = 0, g_fail = 0;
#define CHECK(cond, ...)                                   \
  do {                                                     \
    g_checks++;                                            \
    if (!(cond)) {                                         \
      g_fail++;                                            \
      if (g_fail < 40) {                                   \
        std::printf("ÉCHEC %s:%d : ", __FILE__, __LINE__); \
        std::printf(__VA_ARGS__);                          \
        std::printf("\n");                                 \
      }                                                    \
    }                                                      \
  } while (0)

namespace C = strides::clock;

int main(int argc, char** argv) {
  if (argc < 2) { std::printf("usage : %s <oracles>\n", argv[0]); return 2; }
  std::ifstream f(std::string(argv[1]) + "/meteo.json");
  std::stringstream ss;
  ss << f.rdbuf();
  const J o = JParser(ss.str()).parse();
  CHECK(o["dayLength"].num() == C::kDayLength, "durée de la journée %g", o["dayLength"].num());
  double eW = 0, eT = 0, eS = 0;
  int textBad = 0;
  for (const J& w : o["weather"].a) {
    const int day = (int)w["day"].num();
    const double h = w["h"].num();
    eW = std::max({eW, std::fabs(C::coverAt(day, h) - w["cover"].num()), std::fabs(C::rainTarget(day, h) - w["rain"].num()), std::fabs(C::temperature(day, h) - w["temp"].num())});
    const C::Wind wd = C::wind(day, h);
    CHECK(wd.kmh == (int)w["kmh"].num() && std::fabs(wd.deg - w["deg"].num()) < 1e-9 && wd.dir == w["dir"].s, "vent jour %d %.2f h : %d %s / %g %s", day, h, wd.kmh, wd.dir.c_str(), w["kmh"].num(), w["dir"].s.c_str());
    if (C::conditionText(day, h) != w["text"].s) textBad++;
  }
  CHECK(eW < 1e-9, "météo : écart max %.3g", eW);
  CHECK(textBad == 0, "texte du temps : %d écarts", textBad);
  for (const J& t : o["tide"].a) {
    const double x = t["t"].num();
    const C::TideState s = C::tideState(x);
    eT = std::max({eT, std::fabs(C::tideLevel(x) - t["level"].num()), std::fabs(s.wet - t["wet"].num()), std::fabs(s.mark - t["mark"].num())});
    CHECK(C::tideCoef(x) == (int)t["coef"].num() && s.rising == t["rising"].b, "marée %.1f h : coef %d / %g", x, C::tideCoef(x), t["coef"].num());
  }
  CHECK(eT < 1e-9, "marée : écart max %.3g", eT);
  for (const J& s : o["sun"].a) {
    const double h = s["h"].num();
    const C::SunPos p = C::sunPosition(h);
    double x, y, z;
    C::sunDirection(h, x, y, z);
    eS = std::max({eS, std::fabs(p.alt - s["alt"].num()), std::fabs(p.az - s["az"].num()), std::fabs(x - s["x"].num()), std::fabs(y - s["y"].num()), std::fabs(z - s["z"].num())});
  }
  CHECK(eS < 1e-9, "soleil : écart max %.3g", eS);
  const C::SunTimes st = C::sunTimes();
  CHECK(std::fabs(st.sunrise - o["sunTimes"]["sunrise"].num()) < 1e-9 && std::fabs(st.sunset - o["sunTimes"]["sunset"].num()) < 1e-9, "lever %.4f, coucher %.4f", st.sunrise, st.sunset);
  // Écoulement du temps (game.js:1448) : 20 min réelles = une journée ; arrêté en pause ; heure et texte.
  CHECK(std::fabs(C::advance(7 * 3600, 1200, false) - (7 * 3600 + 86400)) < 1e-6, "journée de 1 200 s");
  CHECK(C::advance(7 * 3600, 5, true) == 7 * 3600, "temps arrêté en pause");
  CHECK(std::fabs(C::advance(0, 10, false, true) - 10) < 1e-9, "temps réel");
  CHECK(C::clockText(7 * 3600) == "7:00" && C::clockText(86400 + 13.5 * 3600 + 59) == "13:30" && C::dayOf(86400 * 2 + 5) == 2, "horloge");
  std::printf("meteo : %zu météo, %zu marée, %zu soleil ; écarts %.2g / %.2g / %.2g ; lever %.2f h, coucher %.2f h\n", o["weather"].a.size(), o["tide"].a.size(), o["sun"].a.size(), eW, eT, eS, st.sunrise, st.sunset);
  std::printf("meteo : %d vérifications, %d échecs\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
