// Aides visuelles d'un parcours de CSO (tranche T9) — portage de src/gameplay/courseAids.js : zone d'appel calculée
// par le modèle de saut (takeoffZone), tracé au sol en tirets (_marks, _range, update), bandes vert / ambre posées sous
// les antérieurs, repère au-dessus de l'obstacle suivant ; état de l'aide à l'appel vu par le bouton SAUT
// (game.course.jumpTiming de src/gameplay/courses.js:187 et :458). L'état du bouton lui-même (classes, signe, libellé,
// « Trop tôt » 600 ms : src/ui/hud.js:373-380, 433-442) est porté par CsoHud (CsoHud.h).
// État pur, sans rendu : le jeu (AStridesCourseAids) pose les maillages décrits par CsoAidsView. Le sol (terrain.getHeight
// du web) est fourni par l'appelant.
// Oracles : unreal/core/tests/oracles/cso_takeoff_zone.json (takeoffZone sur une grille, repères du tracé) et canal « ai »
// des exécutions t9-* de unreal/core/tests/oracles/cso_runs/ (appels de CourseAids.update rejoués image par image).
// Unités SI, repère web (x est, z sud, y haut, cap h -> direction (sin h, cos h)).
#pragma once
#include <functional>
#include <string>
#include <vector>
#include "StridesCore/Api.h"
#include "StridesCore/CsoCourse.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCore/JumpModel.h"

namespace strides {

// Constantes de courseAids.js (valeurs par défaut = source ; LINE_MARK est relu dans Content/Data/cso_aids.json par les
// tests, les autres littéraux sont départagés par le rejeu du canal « ai » et les mutations).
struct CsoAidsParams {
  // LINE_MARK (courseAids.js:19) : longueur et largeur d'un tiret, pas, longueur affichée après l'obstacle suivant,
  // tirets masqués sous le cheval.
  double dash = 0.7, width = 0.26, every = 1.5, after = 12, hideNear = 1.5;
  double lineLift = 0.04;     // _strip : sol + 0,04 (:67)
  double firstMark = 1;       // _marks : premier tiret à s ≥ 1 (:82)
  double farFromLine = 15;    // update : au-delà, tout le tronçon depuis l'obstacle précédent (:124)
  double lineBack = 2;        // update : points du tracé cherchés à partir de prevS − 2 (:120)
  double zoneMaxDist = 26;    // zone affichée à 26 m au plus de l'obstacle suivant (:144)
  double zoneEvery = 0.25;    // zone recalculée toutes les 0,25 s (:147)
  double zoneMinSpeed = 5.5;  // takeoffZone : v = max(vitesse, 5,5) (:26)
  double zoneFrom = 8, zoneStep = 0.1;  // takeoffZone : d de 8 à 0 m par pas de 0,1 (:28)
  double bandShift = 0.4, bandMinLen = 0.2, bandMaxWidth = 2.2, bandLift = 0.035, goodLift = 0.005;  // place (:156-166)
  double markLift = 1.15, markAmp = 0.06, markFreq = 2.4;  // repère (:136)
};
STRIDESCORE_API const CsoAidsParams& csoAidsDefaults();

// Plages de distances d'appel (m, du point d'appel au centre de l'obstacle, abord droit) où le saut passe (marge ≥ −rub,
// zone autre que refuse) et passe bien (zone good) ; absentes si aucune distance ne convient.
struct CsoTakeoffZone {
  bool hasPass = false, hasGood = false;
  double pass[2] = {0, 0}, good[2] = {0, 0};
};
// takeoffZone(o, horse) (courseAids.js:25-34) : cheval à max(vitesse, 5,5) m/s, puissance et bonus de franchissement
// donnés, modèle de concours (cso: true).
STRIDESCORE_API CsoTakeoffZone csoTakeoffZone(const CsoObstacle& o, double speed, double power, double clearance,
                                              const JumpParams& J = jumpDefaults(), const CsoAidsParams& A = csoAidsDefaults());

// Tiret du tracé (_marks, courseAids.js:80-92) : indice de tracé s et quatre coins [x, z] dans l'ordre du web.
struct CsoLineMark {
  double s = 0;
  double c[4][2] = {{0, 0}, {0, 0}, {0, 0}, {0, 0}};
};
// Tirets posés tous les `every` m le long d'un tracé (points x, z, cap h, abscisse s ; dernier point exclu).
STRIDESCORE_API std::vector<CsoLineMark> csoLineMarks(const std::vector<TracePoint>& pts, const CsoAidsParams& A = csoAidsDefaults());
// _range (:95-101) : premier tiret d'indice ≥ s0 et nombre de tirets jusqu'au dernier d'indice ≤ s1 (setDrawRange).
STRIDESCORE_API void csoMarkRange(const std::vector<CsoLineMark>& marks, double s0, double s1, int& first, int& count);

// État de l'aide à l'appel lu par le bouton SAUT (game.course?.jumpTiming?.() || 'none', hud.js:374) : hors épreuve
// (game.course nul) → « none » ; entrée en piste et cloche (game.course.pre, courses.js:458) → « none » ; parcours
// (courses.js:187) : aide « off » → « none », sinon obstacles.timing (timing = csoTiming du cheval, « refuse » déjà
// rendu « near »).
STRIDESCORE_API Zone csoJumpTiming(bool course, bool pre, const std::string& aid, Zone timing);

// Obstacle suivant tel que le lit CourseAids.update (champs de l'obstacle du web : x, z, rot, n, w, h, sol, lineS).
struct CsoAidsFence {
  int id = -1;            // identité (this._zoneFor !== next) : rang dans la liste du parcours
  CsoObstacle ob;         // géométrie (barres, n, w, h) pour takeoffZone
  double ground = 0;      // o.ground (sol au pied de l'obstacle)
  bool hasLineS = true;   // o.lineS défini (obstacle du tracé)
  double lineS = 0;
};

// Entrées d'un appel de CourseAids.update (courses.js:311, 314-320).
struct CsoAidsInput {
  double dt = 0;
  const CsoAidsFence* next = nullptr;  // obstacle suivant, nul : aucun
  double prevS = 0;                    // début du tronçon (lineS de l'obstacle précédent, 0 avant le départ)
  bool showLine = true, showZone = true;
  bool hasHorse = true;                // g.player.horse non nul
  double hx = 0, hz = 0, speed = 0, power = 1.35, clearance = 0;  // cheval (pos, speed, jumpPower, mods.clearance)
  bool riding = true;                  // g.player.mode === 'ride'
  double time = 0;                     // g.time (repère)
};

// Bande au sol (maillage good ou ok : plan 1 × 1 couché, mis à l'échelle) : visible, position, cap, échelle (x, z).
struct CsoAidsBand {
  bool visible = false;
  double x = 0, y = 0, z = 0, rot = 0, sx = 1, sz = 1;
};
// Ce qu'affichent les maillages d'aide après update.
struct CsoAidsView {
  bool lineVisible = false;        // tracé (deux maillages : jusqu'à l'obstacle suivant, puis après lui)
  int lineFirst = 0, lineCount = 0;    // tirets affichés du premier maillage (opacité 0,85)
  int afterFirst = 0, afterCount = 0;  // tirets affichés du second (opacité 0,35)
  bool markVisible = false;        // repère au-dessus de l'obstacle suivant
  double markX = 0, markY = 0, markZ = 0, markRot = 0;
  CsoAidsBand ok, good;            // zone d'appel : ambre (passe), verte (bonne zone)
};

class STRIDESCORE_API CsoCourseAids {
 public:
  // Ligne du cavalier (CSO_LINE : points du tracé dans le repère du monde) ; vide : pas de tracé (this.line nul).
  explicit CsoCourseAids(std::vector<TracePoint> line, const CsoAidsParams& A = csoAidsDefaults(),
                         const JumpParams& J = jumpDefaults());
  // update(dt, { next, prevS, showLine, showZone }) ; groundAt = terrain.getHeight (sol des bandes).
  void update(const CsoAidsInput& in, const std::function<double(double, double)>& groundAt);

  const CsoAidsView& view() const { return view_; }
  const std::vector<CsoLineMark>& marks() const { return marks_; }  // mêmes tirets pour les deux maillages
  const std::vector<TracePoint>& line() const { return line_; }
  bool hasLine() const { return !line_.empty(); }
  // Dernière zone calculée (this._zone), délai avant le prochain calcul (this._zoneT), obstacle de ce calcul.
  const CsoTakeoffZone& zone() const { return zone_; }
  double zoneTimer() const { return zoneT_; }
  int zoneFor() const { return zoneFor_; }

 private:
  void placeBand(CsoAidsBand& m, bool has, const double r[2], const CsoAidsFence& next, const std::function<double(double, double)>& groundAt);
  CsoAidsParams A_;
  JumpParams J_;
  std::vector<TracePoint> line_;
  std::vector<CsoLineMark> marks_;
  CsoAidsView view_;
  CsoTakeoffZone zone_;
  bool hasZone_ = false;
  double zoneT_ = 0;
  int zoneFor_ = -1;  // this._zoneFor (−1 : null)
};

}  // namespace strides
