// Jalon J3b : ciel de nuit du web (src/world/sky.js, fragment du ciel : étoiles et lune ; src/world/rain.js : pluie), en
// C++ sans type Unreal.
//  - étoiles : cellules floor(d × 300) de la sphère des directions, étoile si hash13(cellule) > 0,9972, éclat
//    0,25 + 0,6 × hash13(cellule + 3), estompées sous l'horizon (smoothstep(0,02 ; 0,2 ; d.y)) ; hash13 du web calculé en
//    simple précision comme le GLSL (le tirage peut différer d'une cellule près du seuil : écart visuel assumé) ;
//  - nightFactor de sky.js : smoothstep(0,03 ; −0,16 ; sun.y) ;
//  - pluie : boîte de 46 × 26 × 46 m qui suit la caméra, chute de 9 à 12 m/s, une goutte gardée si sa graine < intensité.
#pragma once
#include <cstdint>
#include <vector>
#include "StridesCore/Api.h"

namespace strides::sky {

STRIDESCORE_API float hash13(float x, float y, float z);
struct Star {
  float x, y, z;  // direction unitaire (repère web, y vers le haut)
  float bright;   // 0,25 à 0,85, déjà estompé près de l'horizon
};
STRIDESCORE_API std::vector<Star> stars();
STRIDESCORE_API double nightFactor(double sunY);

struct RainDrop {
  float x, y, z, seed;
};
// Gouttes de base (rain.js : Math.random, ici une suite fixe) ; position au temps t autour de la caméra (cx, cy, cz).
STRIDESCORE_API std::vector<RainDrop> rainDrops(int count, uint32_t seed = 2026);
STRIDESCORE_API void rainAt(const RainDrop& d, double t, double cx, double cy, double cz, double& x, double& y, double& z);

}  // namespace strides::sky
