// Robe du cheval engagé (C1) : voir StridesCore/HorseCoat.h.
#include "StridesCore/HorseCoat.h"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace strides {

const HorseCoatDef* HorseCoatData::horse(const std::string& id) const {
  for (const HorseCoatDef& h : horses)
    if (h.id == id) return &h;
  return nullptr;
}

HorseCoatData horseCoatDataFromJson(const J& file) {
  HorseCoatData d;
  if (file["coats"].t != J::Arr || file["palette"].t != J::Obj || file["blaze"].t != J::Obj || file["horses"].t != J::Arr)
    throw std::runtime_error("horse_coats.json : coats, palette, blaze ou horses absent");
  for (const J& c : file["coats"].a) d.coats.push_back(c.s);
  for (const auto& [k, p] : file["palette"].o) {
    CoatPalette c;
    c.body = p["body"].s;
    c.points = p["points"].s;
    c.hair = p["hair"].s;
    c.pointsAmt = p["pointsAmt"].num();
    c.detail = p["detail"].num();
    d.palette[k] = c;
  }
  for (const auto& [k, b] : file["blaze"].o) {
    if (b.t != J::Arr || b.a.size() != 4) throw std::runtime_error("horse_coats.json : liste « " + k + " » sans 4 valeurs");
    d.blaze[k] = {b[0].num(), b[1].num(), b[2].num(), b[3].num()};
  }
  for (const J& h : file["horses"].a) {
    HorseCoatDef x;
    x.id = h["id"].s;
    x.name = h["name"].s;
    x.model = h["model"].t == J::Str ? h["model"].s : std::string();
    x.trial = h["trial"].t == J::Bool && h["trial"].b;
    x.coat = h["coat"];
    x.blaze = h["blaze"];
    x.socks = h["socks"];
    d.horses.push_back(x);
  }
  if (!d.palette.count("bay")) throw std::runtime_error("horse_coats.json : robe « bay » (repli) absente");
  d.bodyFragmentSha1 = file["shader"]["bodyFragmentSha1"].s;
  d.hairFragmentSha1 = file["shader"]["hairFragmentSha1"].s;
  return d;
}

bool horseCoatDataFromFile(const std::string& text, HorseCoatData& out, std::string& err) {
  try {
    out = horseCoatDataFromJson(JParser(text).parse());
    return true;
  } catch (const std::exception& e) {
    err = e.what();
    return false;
  }
}

namespace {

// Valeur de vérité de l'ECMAScript (champs absents : null).
bool truthy(const J& v) {
  switch (v.t) {
    case J::Null: return false;
    case J::Bool: return v.b;
    case J::Num: return v.n != 0 && !std::isnan(v.n);
    case J::Str: return !v.s.empty();
    default: return true;  // tableaux et objets
  }
}

}  // namespace

// pjlHorse.js:54-60.
Coat coatOf(const J& def, const HorseCoatData& data) {
  Coat c;
  const J& coat = def["coat"];
  c.colour = coat.t == J::Str && std::find(data.coats.begin(), data.coats.end(), coat.s) != data.coats.end() ? coat.s : "bay";
  const J& blaze = def["blaze"];
  c.blaze = blaze.t == J::Str ? blaze.s : truthy(blaze) ? "blaze" : "none";
  // (def.socks || [0, 0, 0, 0]).map(...) : un tableau garde sa longueur ; une autre valeur vraie n'a pas de map.
  std::vector<double> socks;
  const J& s = def["socks"];
  if (!truthy(s)) socks = {0, 0, 0, 0};
  else if (s.t != J::Arr) throw std::runtime_error("def.socks.map is not a function");
  else
    for (const J& x : s.a) socks.push_back(x.t == J::Bool && x.b ? 0.38 : x.t == J::Num ? x.n : 0.0);
  c.socks = socks;
  c.dapples = c.colour == "dapplegrey" ? 0.6 : 0.0;
  return c;
}

std::array<double, 3> srgbHexToLinear(const std::string& hex) {
  if (hex.size() != 7 || hex[0] != '#') throw std::runtime_error("couleur « " + hex + " » : #rrggbb attendu");
  const unsigned long v = std::stoul(hex.substr(1), nullptr, 16);
  std::array<double, 3> out{};
  for (int k = 0; k < 3; k++) {
    const double c = (double)((v >> (16 - 8 * k)) & 255) / 255;
    // three.js SRGBToLinear (math/ColorManagement.js).
    out[k] = c < 0.04045 ? c * 0.0773993808 : std::pow(c * 0.9478672986 + 0.0521327014, 2.4);
  }
  return out;
}

// coat.js:26-45 (makeCoatMaterial : uniformes, rugosité, métal) et 111-119 (makeHairMaterial).
CoatUniforms coatUniforms(const Coat& coat, const HorseCoatData& data) {
  auto it = data.palette.find(coat.colour);
  const CoatPalette& pal = it != data.palette.end() ? it->second : data.palette.at("bay");  // PALETTE[c] ?? PALETTE.bay
  CoatUniforms u;
  u.coat = srgbHexToLinear(pal.body);
  u.points = srgbHexToLinear(pal.points);
  u.pointsAmt = pal.pointsAmt;
  u.detail = pal.detail;
  // new THREE.Vector4(...(coat.socks ?? [0, 0, 0, 0])) : composantes absentes = valeurs par défaut (0, 0, 0, 1).
  const std::vector<double> socks = coat.socks ? *coat.socks : std::vector<double>{0, 0, 0, 0};
  u.socks = {0, 0, 0, 1};
  for (size_t k = 0; k < 4 && k < socks.size(); k++) u.socks[k] = socks[k];
  // new THREE.Vector4(...BLAZE[coat.blaze ?? 'none']) : liste inconnue → TypeError dans le web.
  const std::string b = coat.blaze ? *coat.blaze : "none";
  auto bz = data.blaze.find(b);
  if (bz == data.blaze.end()) throw std::runtime_error("BLAZE[" + b + "] is not iterable");
  u.blaze = bz->second;
  u.dapples = coat.dapples ? *coat.dapples : coat.colour == "dapplegrey" ? 1.0 : 0.0;
  u.wet = 0;
  u.roughness = coat.colour == "grey" || coat.colour == "dapplegrey" ? 0.6 : 0.48;
  u.metalness = 0;
  u.hair = srgbHexToLinear(pal.hair);
  u.hairRoughness = 0.62;
  u.alphaTest = 0.35;
  u.doubleSided = true;
  return u;
}

// data.js:38-44.
std::vector<std::string> ownedHorses(const J& saveData, const HorseCoatData& data) {
  std::vector<std::string> out, seen;
  const J& hs = saveData["horses"];
  if (hs.t == J::Arr) {
    for (size_t i = 0; i < hs.a.size(); i++) {
      const J& id = hs.a[i];
      // a.indexOf(id) === i : première occurrence seulement (comparaison stricte).
      bool first = true;
      for (size_t k = 0; k < i && first; k++) {
        const J& o = hs.a[k];
        if (o.t == id.t && ((o.t == J::Str && o.s == id.s) || (o.t == J::Num && o.n == id.n) || (o.t == J::Bool && o.b == id.b) || o.t == J::Null)) first = false;
      }
      if (!first || id.t != J::Str) continue;
      const HorseCoatDef* h = data.horse(id.s);
      if (h && !h->trial) out.push_back(id.s);
    }
  }
  if (out.empty()) out.push_back("comete");
  std::vector<std::string> trial;
  for (const HorseCoatDef& h : data.horses)
    if (h.trial) trial.push_back(h.id);
  out.insert(out.begin() + std::min<size_t>(1, out.size()), trial.begin(), trial.end());
  return out;
}

// data.js:46-48.
std::string activeHorseId(const J& saveData, const HorseCoatData& data) {
  const J& a = saveData["activeHorse"];
  if (a.t != J::Str) return "comete";
  const std::vector<std::string> own = ownedHorses(saveData, data);
  return std::find(own.begin(), own.end(), a.s) != own.end() ? a.s : "comete";
}

std::string activeHorseId(const std::vector<std::string>& horses, const std::string& activeHorse, const HorseCoatData& data) {
  J d;
  d.t = J::Obj;
  J list;
  list.t = J::Arr;
  for (const std::string& h : horses) {
    J s;
    s.t = J::Str;
    s.s = h;
    list.a.push_back(s);
  }
  d.o["horses"] = list;
  J a;
  a.t = J::Str;
  a.s = activeHorse;
  d.o["activeHorse"] = a;
  return activeHorseId(d, data);
}

// game.js spawnMainHorse : HORSES[id] || HORSES.comete, robe de PjlHorse (coatOf(horse.def)).
EngagedHorse engagedHorse(const std::string& horseId, const HorseCoatData& data) {
  const HorseCoatDef* h = data.horse(horseId);
  if (!h) h = data.horse("comete");
  if (!h) throw std::runtime_error("horse_coats.json : cheval « comete » absent");
  J def;
  def.t = J::Obj;
  def.o["coat"] = h->coat;
  def.o["blaze"] = h->blaze;
  def.o["socks"] = h->socks;
  EngagedHorse e;
  e.id = h->id;
  e.model = h->model;
  e.coat = coatOf(def, data);
  return e;
}

}  // namespace strides
