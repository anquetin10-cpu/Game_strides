// Jalon J3-D : fers d'or Strides à collectionner (src/gameplay/collectibles.js), données exportées du web
// (Content/Data/world_horseshoes.json, scripts/unreal/export-fers.mjs). Aucun type Unreal ; ctest « carriere ».
#pragma once
#include <string>
#include <vector>
#include "StridesCore/Api.h"

namespace strides {

struct HorseshoeData {
  double pickupRadius = 2.6, visibleDist = 220, blipDist = 70, height = 1.3;
  int reward = 25, completeBonus = 500;
  std::vector<std::pair<double, double>> shoes;  // (x, z) web
};
STRIDESCORE_API bool loadHorseshoes(const std::string& jsonText, HorseshoeData& out, std::string& err);

struct ShoePickup {
  int index = -1;   // rang dans HORSESHOES
  int money = 0;    // crédits gagnés (25, ou 525 pour le dernier)
  int count = 0;    // fers ramassés après celui-ci
  bool complete = false;
};
// collectibles.js update : chaque fer pas encore ramassé à moins de pickupRadius (distance au sol) est ramassé, dans
// l'ordre du web (items parcourus de la fin vers le début) ; collected reçoit son rang (save.data.horseshoes).
STRIDESCORE_API std::vector<ShoePickup> collectShoes(const HorseshoeData& d, std::vector<int>& collected, double x, double z);

}  // namespace strides
