// Sauvegarde native versionnée (schéma "strides.save", version 1) — reprise de la sauvegarde web (src/core/save.js,
// version 2) pour les champs déjà portés ; tout le reste de la sauvegarde web importée est gardé tel quel (legacyJson)
// pour les tranches suivantes : rien n'est perdu à l'import.
// Une application iOS ne lit pas le localStorage du site : le transfert passe par l'export de Réglages du jeu web
// (fichier JSON) importé par l'application (fromWebExport).
#pragma once
#include <map>
#include <string>
#include <vector>
#include "StridesCore/Api.h"

namespace strides {

struct SaveRecord { bool eliminated = false; int penalties = 0; double time = 0; };
struct SavePose { std::string mode = "foot"; double x = 0, y = 0, z = 0, heading = 0; bool valid = false; };

struct STRIDESCORE_API SaveGame {
  static constexpr int kVersion = 1;
  int version = kVersion;
  std::string playerName = "Alex", avatar = "f", activeHorse = "comete", lang = "fr";
  long long money = 0, reputation = 0;
  double gameTime = 7 * 3600;
  std::map<std::string, double> skills{{"preparation", 0}, {"equitation", 0}, {"transport", 0}, {"organisation", 0}};
  std::vector<std::string> horses{"comete"};
  std::map<std::string, SaveRecord> records;
  // Meilleur temps des activités chronométrées (save.js:34 bestTimes : identifiant → secondes, chrono + pénalités pour
  // le Parcours du Pôle ; activities.js:120, tranche T11). Importé de la sauvegarde web.
  std::map<std::string, double> bestTimes;
  // Réglages (save.js:37) : valeurs en texte ; courseLine « true » / « false » (booléen du web, tranche T8).
  std::map<std::string, std::string> settings{{"quality", "auto"}, {"jumpAid", "full"}, {"characters", "auto"}, {"courseLine", "true"}};
  SavePose pose;
  std::string legacyJson;  // sauvegarde web d'origine (import), intacte

  static SaveGame fresh() { return SaveGame(); }
  std::string toJson() const;
  // Faux (avec la raison) si le texte n'est pas une sauvegarde lisible : version future, schéma inconnu, JSON abîmé.
  static bool fromJson(const std::string& text, SaveGame& out, std::string& error);
  // Import d'une sauvegarde du jeu web (export de Réglages, version 1 ou 2).
  static bool fromWebExport(const std::string& text, SaveGame& out, std::string& error);
};

// Réglages de la carte Pause en épreuve (src/ui/screens.js:224-243, tranche T8) sur la table des réglages : tracé au sol
// affiché sauf si courseLine vaut « false » (st.courseLine !== false) ; un clic le bascule (st.courseLine =
// st.courseLine === false) ; aide au saut = jumpAid, « full » si absente ou vide (st.jumpAid || 'full') ; un clic passe à
// la suivante de full → button → off → full (indexOf : une valeur inconnue repart à « full ») ; aide imposée par
// l'épreuve : clic sans effet. Libellés : clés « line.true », « line.false », « aid.full », « aid.button », « aid.off »,
// « aid.locked » de Content/Data/cso_controls_style.json (labels, relevés dans le DOM).
using Settings = std::map<std::string, std::string>;
STRIDESCORE_API bool courseLineShown(const Settings& s);
STRIDESCORE_API void toggleCourseLine(Settings& s);
STRIDESCORE_API std::string jumpAidOf(const Settings& s);
STRIDESCORE_API void cycleJumpAid(Settings& s, bool locked = false);
STRIDESCORE_API std::string pauseLineLabelKey(const Settings& s);
STRIDESCORE_API std::string pauseAidLabelKey(const Settings& s, bool locked);

}  // namespace strides
