// Jalon J3-C (monde vivant de Deauville) : heure du jeu, météo et marées du web, portées telles quelles.
//  - src/world/weather.js : couverture nuageuse (cycle de 9 jours), averses, température, vent, texte du temps, marée
//    (ondes M2, S2, M4), coefficient, état de la marée ;
//  - src/world/sun.js : position du soleil sur la Côte Fleurie (algorithme de la NOAA, 23 août, UTC + 2), direction ;
//  - src/game.js:1448 : écoulement du temps (journée de 1 200 s, CONFIG.dayLength, ou temps réel), arrêté quand la
//    simulation est en pause (téléphone ouvert, carte, dialogue) ; game.js:823 hour(), clockText().
// Prouvé contre l'oracle tests/oracles/meteo.json (scripts/unreal/export-meteo.mjs, modules du web importés sous Node) :
// ctest « meteo ». Aucun type Unreal.
#pragma once
#include <string>
#include "StridesCore/Api.h"

namespace strides::clock {

constexpr double kDayLength = 1200;  // config.js dayLength (s réelles par journée de jeu)

STRIDESCORE_API double dayCover(int day);
STRIDESCORE_API double coverAt(int day, double hour);
STRIDESCORE_API double rainTarget(int day, double hour);
STRIDESCORE_API double temperature(int day, double hour);
struct Wind { int kmh = 0; double deg = 0; std::string dir; };
STRIDESCORE_API Wind wind(int day, double hour = 12);
// Texte français du web (« Ensoleillé », « Éclaircies », « Nuageux », « Couvert », « Nuit claire », « Nuit couverte »,
// « Pluie faible », « Averses ») ; nuit : heure < 6 ou > 21,5.
STRIDESCORE_API std::string conditionText(int day, double hour);

// t : heures de jeu écoulées depuis le début (gameTime / 3600).
STRIDESCORE_API double tideLevel(double t);
STRIDESCORE_API int tideCoef(double t);
struct TideState { double level = 0, wet = 0, mark = 0; bool rising = false; };
STRIDESCORE_API TideState tideState(double t);

struct SunPos { double alt = 0, az = 0, decl = 0, eqTime = 0; };
STRIDESCORE_API SunPos sunPosition(double hour);
struct SunTimes { double sunrise = 0, noon = 0, sunset = 0; };
STRIDESCORE_API SunTimes sunTimes();
// Direction du soleil dans le repère du web (nord = −z, est = +x, haut = +y), unitaire.
STRIDESCORE_API void sunDirection(double hour, double& x, double& y, double& z);

// game.js : heure (0..24) et texte « h:mm » ; jour = floor(gameTime / 86400).
STRIDESCORE_API double hourOf(double gameTime);
STRIDESCORE_API int dayOf(double gameTime);
STRIDESCORE_API std::string clockText(double gameTime);
// game.js:1448 : gameTime += sdt · 86400 / (réel ? 86400 : dayLength) ; sdt = 0 en pause.
STRIDESCORE_API double advance(double gameTime, double dt, bool paused, bool realTime = false);

}  // namespace strides::clock
