// Sauvegarde native versionnée (schéma "strides.save", version 1) — reprise de la sauvegarde web (src/core/save.js,
// version 2) pour les champs déjà portés ; tout le reste de la sauvegarde web importée est gardé tel quel (legacyJson)
// pour les tranches suivantes : rien n'est perdu à l'import.
// Une application iOS ne lit pas le localStorage du site : le transfert passe par l'export de Réglages du jeu web
// (fichier JSON) importé par l'application (fromWebExport).
#pragma once
#include <map>
#include <string>
#include <vector>

namespace strides {

struct SaveRecord { bool eliminated = false; int penalties = 0; double time = 0; };
struct SavePose { std::string mode = "foot"; double x = 0, y = 0, z = 0, heading = 0; bool valid = false; };

struct SaveGame {
  static constexpr int kVersion = 1;
  int version = kVersion;
  std::string playerName = "Alex", avatar = "f", activeHorse = "comete", lang = "fr";
  long long money = 0, reputation = 0;
  double gameTime = 7 * 3600;
  std::map<std::string, double> skills{{"preparation", 0}, {"equitation", 0}, {"transport", 0}, {"organisation", 0}};
  std::vector<std::string> horses{"comete"};
  std::map<std::string, SaveRecord> records;
  std::map<std::string, std::string> settings{{"quality", "auto"}, {"jumpAid", "full"}, {"characters", "auto"}};
  SavePose pose;
  std::string legacyJson;  // sauvegarde web d'origine (import), intacte

  static SaveGame fresh() { return SaveGame(); }
  std::string toJson() const;
  // Faux (avec la raison) si le texte n'est pas une sauvegarde lisible : version future, schéma inconnu, JSON abîmé.
  static bool fromJson(const std::string& text, SaveGame& out, std::string& error);
  // Import d'une sauvegarde du jeu web (export de Réglages, version 1 ou 2).
  static bool fromWebExport(const std::string& text, SaveGame& out, std::string& error);
};

}  // namespace strides
