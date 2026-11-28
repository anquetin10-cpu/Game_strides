// Plan du parcours de CSO (tranche T10) — portage de coursePlanSvg et coursePlanLegend (src/ui/coursePlan.js:11-66),
// affiché par la carte « Plan du parcours » de la présentation (courses.js:111-118). Venue du Pôle International :
// carrière (sable, lice), ouverture d'entrée au sud et mot ENTRÉE, bande des tribunes au nord et mot TRIBUNES, abord
// entrée → départ et ligne du cavalier en pointillés, lignes de départ et d'arrivée et leurs mots, obstacles (vertical :
// un trait, oxer : deux, mur : trait brique épais), flèche du sens de saut, pastille numérotée, hauteur sous la pastille ;
// nord en haut, repère du viewBox = repère local de la carrière (m, x est, y = z web sud).
// Chaque primitive garde l'élément SVG exact que le jeu web écrit ; ses nombres (géométrie dessinée) sont relus dans ses
// attributs : ce qui est dessiné est ce que le SVG décrit. Oracle : unreal/core/tests/oracles/cso_plan.json (sortie de
// coursePlanSvg et coursePlanLegend, comparée caractère pour caractère par test_core.cpp, testCoursePlan).
// Non porté : arène de Paris (venue « paris », mission finale absente du portage).
#pragma once
#include <string>
#include <vector>
#include "StridesCore/Api.h"
#include "StridesCore/CsoCourse.h"
#include "StridesCore/Text.h"

namespace strides {

struct PlanPrim {
  enum class Kind { Rect, Line, Polyline, Path, Circle, Text };
  Kind kind = Kind::Rect;
  // Rect : x, y, largeur, hauteur, rx ; Line : x1, y1, x2, y2 ; Circle : cx, cy, r ; Polyline / Path : x0, y0, x1, y1… ;
  // Text : x, y (ligne de base).
  std::vector<double> v;
  std::string fill, stroke;  // « #rrggbb », « none », ou vide (attribut absent)
  double fillOpacity = 1, strokeOpacity = 1, strokeWidth = 0;
  double dash[2] = {0, 0};   // stroke-dasharray (0 0 : trait plein)
  bool roundCap = false;     // stroke-linecap="round"
  double fontSize = 0;
  bool bold = false;         // font-weight="700"
  std::string anchor;        // text-anchor (« start », « middle »)
  std::string text;          // contenu d'un texte
  std::string svg;           // élément SVG exact (coursePlan.js)
};

struct CoursePlanArena { double w = 120, d = 76, standsW = 78; };  // POLE.arena.w, .d ; POLE.stands.w

struct CoursePlan {
  double vb[4] = {0, 0, 0, 0};  // viewBox : x, y, largeur, hauteur
  std::string viewBox, aria;    // attribut viewBox et aria-label (t('Plan du parcours'))
  std::vector<PlanPrim> prims;  // dans l'ordre du dessin
};

// coursePlanSvg({ heights, next, trace }) : trace = tracé local (traceCourse du design non décalé) ; heights : hauteurs
// des éléments dans l'ordre du parcours, ou nul (pas de hauteurs écrites) ; next : numéro (1..n) surligné, 0 : aucun.
STRIDESCORE_API CoursePlan coursePlan(const CourseTrace& trace, const CoursePlanArena& arena, const std::vector<double>* heights, int next, const TextTable& tt, Lang lang);
// Élément <svg> complet (chaîne exacte du jeu web).
STRIDESCORE_API std::string coursePlanSvg(const CoursePlan& plan);
// coursePlanLegend(trace) : « 1 vertical · 2 oxer · … ».
STRIDESCORE_API std::string coursePlanLegend(const CourseTrace& trace, const TextTable& tt, Lang lang);

}  // namespace strides
