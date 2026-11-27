// Jalon J3 : mini-carte du jeu web (src/ui/minimap.js, classe Minimap, méthode draw) portée en C++ : carte tournée
// selon le lacet de la caméra (le regard en haut), portée qui s'élargit avec la vitesse (150 m + 6 m par m/s jusqu'à
// 16 m/s, 260 m au volant) et lissée à 5 % par image dessinée, images limitées à 30 par seconde, itinéraire et repères
// projetés, repères « sticky » ramenés au bord, flèche du joueur, pastille du nord au bord.
// Coordonnées d'écran de la toile du web : origine en haut à gauche, y vers le bas, côté W (132 px de référence).
// Repère du monde : x, z au sol (m) ; lacet de la caméra du web : regard = (−sin yaw, −cos yaw) ; cap : (sin h, cos h).
// Oracle : unreal/core/tests/oracles/monde_vivant.json, champ minimap (ctest « monde-vivant »).
#pragma once
#include "StridesCore/Api.h"

namespace strides {

struct MinimapPoint {
  double x = 0, y = 0;
};

class STRIDESCORE_API MinimapView {
 public:
  double range = 170;  // m du centre au bord (this.range)
  // Image du web : faux tant que moins de 1/30 s s'est écoulé depuis la dernière (rien n'est redessiné, portée gardée).
  bool step(double dt, double speed, bool driving);
  // Projection d'un point du monde (toScreen de draw) pour une toile de côté W.
  static MinimapPoint toScreen(double W, double range, double fx, double fz, double yaw, double x, double z);
  MinimapPoint toScreen(double W, double fx, double fz, double yaw, double x, double z) const { return toScreen(W, range, fx, fz, yaw, x, z); }
  // Image de la carte (drawImage après translate(R, R) et rotate(yaw)) : coin haut gauche et côté, dans le repère tourné.
  struct Image {
    double x = 0, y = 0, size = 0;
  };
  Image image(double W, double fx, double fz) const;
  // Repère : position à l'écran, ramenée au bord (R − 10) si sticky ; faux : hors du cadre et non sticky (non dessiné).
  bool blip(double W, double fx, double fz, double yaw, double x, double z, bool sticky, MinimapPoint& out) const;
  // Rotation de la flèche du joueur (rad, sens de la toile) : −(cap − lacet + π).
  static double arrowRotation(double heading, double yaw);
  // Centre de la pastille « N » (au bord, R − 9, dans la direction du nord du monde : −z).
  MinimapPoint north(double W, double fx, double fz, double yaw) const;
  // Lacet de la caméra du web depuis la direction du regard au sol (x, z) : yaw = atan2(−x, −z).
  static double yawFromLook(double lookX, double lookZ);

 private:
  double acc = 0;
};

}  // namespace strides
