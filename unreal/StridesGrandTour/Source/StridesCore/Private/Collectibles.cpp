// Jalon J3-D : voir Collectibles.h (collectibles.js porté).
#include "StridesCore/Collectibles.h"

#include <algorithm>
#include <cmath>
#include <stdexcept>

#include "StridesCore/MiniJson.h"

namespace strides {

bool loadHorseshoes(const std::string& text, HorseshoeData& out, std::string& err) {
  try {
    const J r = JParser(text).parse();
    if (r["schema"].t != J::Str || r["schema"].s != "strides.horseshoes.v1") { err = "schéma inattendu"; return false; }
    HorseshoeData d;
    d.pickupRadius = r["pickupRadius"].num();
    d.visibleDist = r["visibleDist"].num();
    d.blipDist = r["blipDist"].num();
    d.height = r["height"].num();
    d.reward = (int)std::lround(r["reward"].num());
    d.completeBonus = (int)std::lround(r["completeBonus"].num());
    for (const J& s : r["shoes"].a) d.shoes.push_back({s["x"].num(), s["z"].num()});
    if (d.shoes.empty()) { err = "aucun fer"; return false; }
    out = d;
    return true;
  } catch (const std::exception& e) {
    err = e.what();
    return false;
  }
}

std::vector<ShoePickup> collectShoes(const HorseshoeData& d, std::vector<int>& collected, double x, double z) {
  std::vector<ShoePickup> out;
  for (int i = (int)d.shoes.size() - 1; i >= 0; --i) {
    if (std::find(collected.begin(), collected.end(), i) != collected.end()) continue;
    if (std::hypot(x - d.shoes[(size_t)i].first, z - d.shoes[(size_t)i].second) >= d.pickupRadius) continue;
    collected.push_back(i);
    ShoePickup p;
    p.index = i;
    p.money = d.reward;
    p.count = (int)collected.size();
    p.complete = p.count == (int)d.shoes.size();
    if (p.complete) p.money += d.completeBonus;
    out.push_back(p);
  }
  return out;
}

}  // namespace strides
