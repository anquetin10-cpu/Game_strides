// Collisions 2D du monde (plan XZ, avec hauteur) — portage de src/world/colliders.js (addCircle, addBox, addSegment,
// resolve), des clôtures de src/world/world.js (fence, rectFence), des chandeliers et ailes de src/gameplay/obstacles.js
// (add : boîtes « wing ») et de la résolution du cheval de src/entities/horse.js:344-360 (sonde 0,45 m devant, rayon 0,85,
// pieds au-dessus du sommet = franchi, vitesse amortie selon l'angle d'impact, horse:bump).
// Écart assumé : pas de grille spatiale (une liste parcourue dans l'ordre d'insertion ; le web parcourt les cellules
// puis l'ordre d'insertion) : identique tant qu'un seul obstacle touche le cercle, ce qui est le cas des clôtures et ailes
// du Pôle (les seules posées par le portage au jalon J1).
// Unités SI, repère web (x est, z sud).
#pragma once
#include <functional>
#include <limits>
#include <string>
#include <vector>
#include "StridesCore/Api.h"

namespace strides {

struct Collider {
  char type = 'b';  // 'c' cercle, 'b' boîte orientée
  double x = 0, z = 0, r = 0, hw = 0, hd = 0, rot = 0, c = 1, s = 0;
  double top = std::numeric_limits<double>::infinity();  // sommet absolu (infini : infranchissable)
  std::string tag;
  bool enabled = true;
};

struct ColliderHit {
  bool hit = false;
  int index = -1;  // collider touché (le dernier qui a repoussé, comme le web)
  double nx = 0, nz = 0;
};

class STRIDESCORE_API Colliders {
 public:
  int addCircle(double x, double z, double r, double top = std::numeric_limits<double>::infinity(), const std::string& tag = "");
  int addBox(double x, double z, double hw, double hd, double rot = 0, double top = std::numeric_limits<double>::infinity(), const std::string& tag = "");
  // Segment épais (clôture) : boîte de demi-largeur thick / 2 le long du segment.
  int addSegment(double x1, double z1, double x2, double z2, double thick, double top, const std::string& tag = "");
  // Repousse le cercle (x, z, r) hors des obstacles plus hauts que feetY (feetY > top − 0,05 : passé au-dessus).
  ColliderHit resolve(double& x, double& z, double r, double feetY = -std::numeric_limits<double>::infinity(), const std::string& ignoreTag = "") const;
  // Point à l'intérieur d'un obstacle plus haut que y (colliders.blocked).
  bool blocked(double x, double z, double y = 0) const;
  void removeTag(const std::string& tag);
  const std::vector<Collider>& all() const { return list_; }
  size_t size() const { return list_.size(); }

 private:
  std::vector<Collider> list_;
};

// Clôture (world.js fence) : un segment de 0,35 m par paire de points, sommet = sol le plus haut des bouts et du milieu
// + height (solid : infranchissable).
STRIDESCORE_API void addFence(Colliders& C, const std::vector<std::pair<double, double>>& points, bool closed, double height, bool solid,
                              const std::string& tag, const std::function<double(double, double)>& ground);
// Rectangle de clôture avec une ouverture (world.js rectFence) : points du tracé (côté 'n' | 's' | 'e' | 'w', autre : fermé).
STRIDESCORE_API std::vector<std::pair<double, double>> rectFencePoints(double x, double z, double w, double d, char gapSide, double gap, double gapPos);

// Chandeliers et ailes d'un obstacle droit ('v') ou oxer ('o') (obstacles.js add) : deux boîtes « wing » hors de la
// largeur des barres, de u0 = w/2 + 0,5 à u1 = w/2 + 1,06, profondeur spread/2 + 0,12, sommet sol + h + 0,75.
// Renvoie le nombre de boîtes posées (0 pour les autres types).
STRIDESCORE_API int addObstacleWings(Colliders& C, const std::string& kind, double x, double z, double rot, double w, double h, double spread,
                                     double ground, const std::string& tag = "wing");

// Cheval contre le monde (horse.js:344-360), après son déplacement de l'image.
struct HorseCollideInput {
  double heading = 0, jumpY = 0, jumpT = -1, clearance = 0;
  double groundNow = 0;  // sol sous le cheval
  double radius = 0.85;  // horse.js this.radius
  double dt = 0, time = 0;
  bool frozen = false;
};
struct HorseCollideOut {
  bool hit = false, bump = false;
  int index = -1;
};
// x, z : position du cheval (modifiée) ; speed amortie ; lastBump : instant du dernier horse:bump (modifié).
STRIDESCORE_API HorseCollideOut horseCollide(const Colliders& C, double& x, double& z, double& speed, double& lastBump, const HorseCollideInput& in);

}  // namespace strides
