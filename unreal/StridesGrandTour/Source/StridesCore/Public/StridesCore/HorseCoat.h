// Robe du cheval engagé (C1) — portage de coatOf (src/entities/pjlHorse.js:52-60), des uniformes et réglages de
// makeCoatMaterial / makeHairMaterial (src/entities/pjl/coat.js:26-45 et 111-119 : couleurs THREE.Color converties de
// sRGB en linéaire, balzanes, liste, pommelage, rugosité ; le code GLSL lui-même est porté en HLSL dans le matériau
// Unreal, scripts/unreal/import-horse-coat.py), de ownedHorses / activeHorseId (src/gameplay/data.js:38-48) et du choix
// du cheval engagé de game.js spawnMainHorse (HORSES[id] || HORSES.comete).
// Données : Content/Data/horse_coats.json (robes de COATS, palette de coatColours, listes de BLAZE, chevaux de data.js),
// exportées par scripts/unreal/export-horse-coat.mjs. Oracle : unreal/core/tests/oracles/horse_coat.json (fonctions du
// web appelées telles quelles), rejoué par testHorseCoat.
#pragma once
#include <array>
#include <map>
#include <optional>
#include <string>
#include <vector>
#include "StridesCore/Api.h"
#include "StridesCore/MiniJson.h"

namespace strides {

// Palette d'une robe (coat.js PALETTE) : hexadécimal sRGB tel qu'écrit dans le source.
struct CoatPalette {
  std::string body, points, hair;
  double pointsAmt = 1, detail = 1;
};
// Cheval du jeu (data.js HORSES) : champs de la robe gardés tels qu'écrits (valeurs JSON brutes : coat peut être un
// objet, blaze un booléen ou une chaîne, socks un tableau de booléens ou de nombres).
struct HorseCoatDef {
  std::string id, name, model;
  J coat, blaze, socks;
  bool trial = false;
};
struct STRIDESCORE_API HorseCoatData {
  std::vector<std::string> coats;                          // COATS (pjlHorse.js), ordre du source
  std::map<std::string, CoatPalette> palette;              // coatColours
  std::map<std::string, std::array<double, 4>> blaze;      // BLAZE (uBlaze)
  std::vector<HorseCoatDef> horses;                        // HORSES, ordre de Object.values
  std::string bodyFragmentSha1, hairFragmentSha1;          // empreintes du GLSL porté
  const HorseCoatDef* horse(const std::string& id) const;
};
STRIDESCORE_API HorseCoatData horseCoatDataFromJson(const J& file);
STRIDESCORE_API bool horseCoatDataFromFile(const std::string& text, HorseCoatData& out, std::string& err);

// Robe telle que coatOf la rend (et telle que makeCoatMaterial la reçoit : champs absents possibles).
struct Coat {
  std::string colour = "bay";
  std::optional<std::string> blaze;            // coat.blaze ?? 'none'
  std::optional<std::vector<double>> socks;    // AG, AD, PG, PD (hauteur de balzane, 0 : aucune)
  std::optional<double> dapples;
};
// coatOf(def) : robe connue de COATS sinon « bay » ; liste : chaîne gardée, sinon vrai → « blaze », faux → « none » ;
// balzanes : vrai → 0,38, nombre gardé, autre → 0 ; pommelage 0,6 pour « dapplegrey ». Lève std::runtime_error là où
// le web lève (socks vrai sans être un tableau).
STRIDESCORE_API Coat coatOf(const J& def, const HorseCoatData& data);

// Uniformes du shader de robe et réglages des deux matériaux (couleurs en espace linéaire).
struct CoatUniforms {
  std::array<double, 3> coat{}, points{}, hair{};
  double pointsAmt = 1, detail = 1, dapples = 0, wet = 0, roughness = 0.48, metalness = 0;
  std::array<double, 4> socks{}, blaze{};
  double hairRoughness = 0.62, alphaTest = 0.35;
  bool doubleSided = true;  // side du matériau de base (GLB : doubleSided), gardé par clone()
};
// makeCoatMaterial / makeHairMaterial : lève std::runtime_error comme le web pour une liste inconnue de BLAZE.
STRIDESCORE_API CoatUniforms coatUniforms(const Coat& coat, const HorseCoatData& data);
// THREE.Color('#rrggbb') : composantes sRGB / 255 converties en linéaire (ColorManagement, SRGBToLinear).
STRIDESCORE_API std::array<double, 3> srgbHexToLinear(const std::string& hex);

// ownedHorses(d) et activeHorseId(d) de data.js, sur save.data (JSON brut : horses peut ne pas être un tableau).
STRIDESCORE_API std::vector<std::string> ownedHorses(const J& saveData, const HorseCoatData& data);
STRIDESCORE_API std::string activeHorseId(const J& saveData, const HorseCoatData& data);
// Même chose sur la sauvegarde native (SaveGame : horses, activeHorse).
STRIDESCORE_API std::string activeHorseId(const std::vector<std::string>& horses, const std::string& activeHorse, const HorseCoatData& data);

// Cheval engagé : HORSES[id] || HORSES.comete (game.js spawnMainHorse), sa robe (coatOf) et son modèle (« model » : le
// web l'affiche avec un autre modèle que le cheval WildMesh, non porté).
struct EngagedHorse {
  std::string id, model;
  Coat coat;
};
STRIDESCORE_API EngagedHorse engagedHorse(const std::string& horseId, const HorseCoatData& data);

}  // namespace strides
