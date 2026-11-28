// Guidage du portage (choix n° 7 et n° 5 du plan J1, hors jeu web) : point visé par la pastille « Obstacle n · m ·
// direction » et par la ligne « Chrono du Pôle », qui contourne les obstacles, leurs ailes et la lice au lieu de mener
// tout droit à travers (relevé au contrôle J1 du 26/11 : joueur bloqué contre un obstacle pris de dos pendant que les
// pénalités de temps montent). Le jeu web n'a pas de pastille de guidage : rien n'y est repris, tout est choix du portage.
//
// Méthode (la plus simple qui suffit) : grille de 1 m sur la carrière et ses abords, cases bloquées à moins de
// `inflate` d'un collider (lice, ailes) ou d'une boîte d'obstacle (barres comprises) ; chemin A* 8-voisins de la case du
// cavalier à celle du but ; point visé = le point le plus loin du chemin (au plus `lookahead` m) vu en ligne droite
// depuis le cavalier. Hors grille, ou sans chemin : le but lui-même (comportement d'avant).
// Unités SI, repère web (x est, z sud).
#pragma once
#include <cstdint>
#include <vector>
#include "StridesCore/Api.h"
#include "StridesCore/Colliders.h"
#include "StridesCore/CsoHorse.h"

namespace strides {

struct STRIDESCORE_API GuideGrid {
  double minX = 0, minZ = 0, cell = 1;
  int nx = 0, nz = 0;
  std::vector<uint8_t> blocked;  // nx * nz : 0 libre, 1 marge (gonflé), 2 cœur (0,5 m du collider)
  int levelAt(double x, double z) const;
  bool inside(double x, double z) const;
  bool blockedAt(double x, double z) const;
};

struct GuideBounds { double minX = 0, minZ = 0, maxX = 0, maxZ = 0; };

// Boîte d'un obstacle pour le guidage : sur la largeur des barres et des ailes (w / 2 + 1,06, obstacles.js add), sur la
// profondeur de ses faces (front .. back le long de n) + 0,2 m.
STRIDESCORE_API void guideObstacleBox(const CsoObstacle& o, double& cx, double& cz, double& hw, double& hd);

// Grille bloquée : colliders (boîtes et cercles) et obstacles, gonflés de `inflate` (rayon du cheval + marge).
STRIDESCORE_API GuideGrid buildGuideGrid(const GuideBounds& b, const Colliders& cols, const std::vector<CsoObstacle>& obstacles,
                                         double inflate = 1.8, double cell = 1.0);

// Point visé depuis (mx, mz) vers le but (gx, gz). Renvoie vrai si un chemin a été trouvé dans la grille (aim posé) ;
// faux si le cavalier ou le but sont hors grille ou sans chemin (aim = but).
STRIDESCORE_API bool guideAim(const GuideGrid& g, double mx, double mz, double gx, double gz, double& ax, double& az,
                              double lookahead = 18.0, double* pathLength = nullptr);

// Segment libre dans la grille (pas de case bloquée traversée), extrémités comprises.
STRIDESCORE_API bool guideClear(const GuideGrid& g, double x0, double z0, double x1, double z1);

// Abord d'un axe de saut ou de franchissement (obstacle, ligne de départ ou d'arrivée) : centre (x, z), axe n (sens de
// franchissement), axe transversal t, face avant (s le long de n, négatif), demi-largeur utile, distance de l'abord.
struct GuideAxis {
  double x = 0, z = 0, nx = 0, nz = 1, tx = 1, tz = 0, front = 0, halfW = 2, approach = 12;
};
enum class GuideMode { Pursue, Center, Approach, RideOut };
STRIDESCORE_API const char* guideModeName(GuideMode m);
// Cible de l'abord vue du cavalier (mx, mz), cap (fx, fz) unitaire, vitesse speed :
//  - couloir (16 m devant la face, demi-largeur + 6 m), cavalier tourné vers l'axe : poursuite de l'axe, point de l'axe
//    7 m plus loin que sa projection (Pursue), puis le centre dans les 3 derniers mètres s'il y va (Center) ;
//  - couloir mais dos à l'obstacle (refus, abord dépassé) : sortir à 18 m, un peu de côté, pour revenir (RideOut) ;
//  - ailleurs : l'abord, `approach` m devant, par un chemin qui contourne les obstacles (Approach : usePath vrai).
STRIDESCORE_API GuideMode guideAxisTarget(const GuideAxis& a, double mx, double mz, double fx, double fz, double speed, double& tx, double& tz, bool& usePath);

}  // namespace strides
