// Entrée dans l'épreuve de CSO (tranche T10) : activité « Parcours du Pôle » lancée au poteau « Chrono »
// (src/gameplay/activities.js:31-40, 84-135 ; src/gameplay/missions.js:461-482 ; registre des actions
// src/gameplay/interact.js:18-47), contrôle de capacité (src/gameplay/courses.js:499-528), carte de présentation et carte
// du plan (courses.js:91-138, gabarit src/ui/screens.js:159-177). Le plan lui-même : StridesCore/CoursePlan.h ; le
// déroulé des étapes (attente de « Entrer en piste », du dialogue) : StridesCore/CsoRun.h.
// Données : Content/Data/cso_activity.json (relevées dans le jeu web en cours d'exécution, scripts/unreal/export-cso-entry.mjs).
// Oracle : unreal/core/tests/oracles/cso_entry.json (cartes relevées dans le DOM, dialogue de capacité, puissances de
// cheval, hauteurs et compositions variées, fr et en ; test_core.cpp, testCsoEntry).
#pragma once
#include <string>
#include <utility>
#include <vector>
#include "StridesCore/Api.h"
#include "StridesCore/CsoCourse.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/JumpModel.h"
#include "StridesCore/Text.h"

struct J;

namespace strides {

// Activité lancée depuis un poteau (Activities._markers, interact.add) : textes en clés françaises (t('…')).
struct CsoActivity {
  std::string id, name, title, className, desc, kind;  // a.id, a.name, titre et classe de l'épreuve (courseSteps), a.desc, a.kind
  std::string category, vertical, verticalLabel;      // offer.category (t(category)), offer.vertical, libellé (t('Événement'))
  double startX = 0, startZ = 0;                      // a.start : centre de la zone d'interaction
  double markerX = 0, markerZ = 0;                    // a.marker : poteau
  double r = 6;                                       // rayon de l'action
  int priority = 1;
  std::vector<std::string> modes;                     // « ride »
  std::string label, icon;                            // libellé du bouton Action (t('Chrono')), icône
  int launchMs = 2600;                                // durée du grand message du lancement (missions.js:476)
  std::string appTitle;                               // CONFIG.title (kicker de la présentation)
  std::string place;                                  // lieu par défaut de la présentation (opts.place || …, non traduit)
};
STRIDESCORE_API CsoActivity csoActivityFromJson(const J& file);
STRIDESCORE_API bool csoActivityFromFile(const std::string& text, CsoActivity& out, std::string& err);
// Action proposée (interact.update) : point suivi à moins de r du départ (Math.hypot), mode du joueur permis, condition
// « sans mission active » ; avec la descente de cheval (priorité 0, rayon illimité) en concurrence, l'action de
// priorité 1 l'emporte toujours (score priorité × 100 − distance).
STRIDESCORE_API bool csoActivityAvailable(const CsoActivity& a, double focusX, double focusZ, const std::string& mode, bool missionActive);
// Lancement (missions.start) : grand message (titre en capitales, « libellé · catégorie », durée) puis son « notify ».
STRIDESCORE_API CsoCall csoActivityLaunchBig(const CsoActivity& a, const TextTable& tt, Lang lang);

// ---- Présentation (showPresentation) et plan (showPlan) ----
struct CsoPresentationInput {
  std::vector<std::string> labels;   // libellés des obstacles du parcours, dans l'ordre (list())
  bool hasHeights = true;
  std::vector<double> heights;       // opts.heights
  bool hasHeight = false;            // opts.height donné
  double height = 0;
  // Clés françaises (traduites ici) ; vides : absentes (title : t('Parcours du Pôle International'), table :
  // t('barème A au chrono'), rulesText : règles par défaut ; place : appTitle · place de l'activité, non traduit).
  std::string title, className, table, rulesText, place;
  std::vector<std::string> intro;    // lignes du jury (textes déjà rédigés), jointes par une espace
  bool hasHorse = true;
  std::string horseName;
  int timeAllowed = 64;
  double length = 368;               // opts.length ?? COURSE_LENGTH.cso
  std::string appTitle = "EQUESTRIAN TOUR", defaultPlace = "Pôle International";
};
struct CsoPresentation {
  std::string kicker, title, jury, rules;
  std::vector<std::pair<std::string, std::string>> rows;  // grille clé / valeur (.cso-pres)
  std::string planLabel, enterLabel;                      // boutons (data-id plan, enter)
};
struct CsoPlanCard {
  std::string kicker, title, legend, backLabel;  // légende : coursePlanLegend · longueur m · temps accordé ; bouton plan-back
};
// Hauteur de l'épreuve : opts.height, sinon la plus fréquente des hauteurs (tri stable par effectif décroissant : à
// égalité, la première rencontrée) ; faux si aucune.
STRIDESCORE_API bool csoClassHeight(const CsoPresentationInput& in, double& out);
// difficultyOf (courses.js:51) : clé française (« Facile » sous 1,08 m, « Moyenne » sous 1,18, « Difficile » sous 1,35,
// sinon « Très difficile »).
STRIDESCORE_API const char* csoDifficultyKey(double h);
// parcoursText (courses.js:100-108) : « 8 obstacles dont 2 doubles (4A – 4B, 6A – 6B) · 368 m ».
STRIDESCORE_API std::string csoParcoursText(const std::vector<std::string>& labels, double length, const TextTable& tt, Lang lang);
STRIDESCORE_API CsoPresentation csoPresentation(const CsoPresentationInput& in, const TextTable& tt, Lang lang);
STRIDESCORE_API CsoPlanCard csoPlanCard(const CsoPresentationInput& in, const CourseTrace& trace, const TextTable& tt, Lang lang);

// ---- Contrôle de capacité (courses.js:499-528) ----
struct CsoCapFence { std::string kind; double spread = 0, h = 0; };  // obstacle du parcours (o.kind, o.spread, o.h)
struct CsoCapacityInput {
  std::vector<CsoCapFence> fences;  // list() dans l'ordre du parcours
  bool hasHeights = true;
  std::vector<double> heights;      // opts.heights (heights[i] ?? o.h)
  bool cso = true;                  // kind === 'cso'
  bool hasHorse = true;
  double power = 1.35;              // h.jumpPower
  double clearance = 0;             // h.mods?.clearance || 0
  std::string horseName;
};
struct CsoCapacity {
  bool step = false;      // étape présente (maxH non nul)
  double maxH = 0, reach = 0;
  bool hopeless = false;  // dialogue affiché
  std::string who, initials, text;  // hud.dialog([{ who, initials, text }])
};
STRIDESCORE_API CsoCapacity csoCapacity(const CsoCapacityInput& in, const TextTable& tt, Lang lang, const JumpParams& P = jumpDefaults());

}  // namespace strides
