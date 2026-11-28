// Jalon J3 (monde vivant de Deauville) : vie ambiante du jeu web portée en C++ (src/gameplay/npcs.js).
//  - Circulation : classe Car (voie de droite à 2,2 m de l'axe, 50 km/h en ville et 70 km/h hors agglomération à
//    l'allure propre de chaque voiture, couloir d'observation devant la voiture, freinage à 5 m de l'obstacle, cheval
//    croisé à 20 km/h, priorité à droite entre voitures, klaxon devant un piéton arrêté sur la chaussée, demi-tour en
//    bout de route, immédiat hors de vue).
//  - Passants : WalkAI (boucle de points, arrêts au hasard, arrêt face au joueur à moins de 2,2 m) et séparation des
//    passants d'Ambient (une image sur deux).
// Données : Content/Data/world_ambient.json (scripts/unreal/export-monde-vivant.mjs, relevé dans le jeu web en cours
// d'exécution). Oracle : unreal/core/tests/oracles/monde_vivant.json (ctest « monde-vivant »).
// Hors portage (aucun équivalent ici) : véhicule du joueur (camion, voitures conduites : pas de conduite dans le portage),
// tangage de la caisse et roues (visuel), collisions du monde des passants (colliders.resolve).
// Repère du web : x, z au sol (m) ; cap : avant = (sin h, cos h).
#pragma once
#include <map>
#include <optional>
#include <string>
#include <vector>
#include "StridesCore/Api.h"
#include "StridesCore/Ranking.h"  // Mulberry32 (mulberry32 de src/core/math.js)

namespace strides {

struct LifeVec2 {
  double x = 0, z = 0;
};

struct LifeRoad {
  std::string id;
  double w = 0;
  std::vector<LifeVec2> pts;
  double len = 0;  // polylineLength
};

struct LifeCarModel {
  double L = 4, W = 1.8, wb = 2.6, r = 0.31;
};

struct LifeCarSpawn {
  std::string road, kind, color;
  double s = 0, cruise = 1;
  int dir = 1;
};

struct LifeOutfit {
  std::string sex, top, sleeve, pants, boots, skin, hair, cap;
  bool dress = false;
};

struct LifeWalkerSpawn {
  std::vector<LifeVec2> points;
  double speed = 1.2;
  LifeOutfit outfit;
  std::string chatter;
};

struct LifeSpectator {
  double x = 0, z = 0, heading = 0;
  LifeOutfit outfit;
};

struct AmbientData {
  std::vector<LifeRoad> roads;
  std::vector<std::vector<double>> townBlocks;  // [x0, x1, z0, z1]
  double townX0 = 0, townX1 = 0, townZ0 = 0, townZ1 = 0;  // TOWN_BOX (îlots + 30 m)
  std::map<std::string, LifeCarModel> carModels;
  std::vector<LifeCarSpawn> cars;
  std::vector<LifeWalkerSpawn> walkers;
  std::vector<LifeSpectator> spectators;
  const LifeRoad* road(const std::string& id) const;
};

// Lecture de world_ambient.json (texte) ; faux et motif en cas d'erreur.
STRIDESCORE_API bool loadAmbient(const std::string& jsonText, AmbientData& out, std::string& err);

// Ce que la vie ambiante lit du monde à chaque image.
struct LifeInput {
  LifeVec2 player;                 // game.player.focus.pos (cheval monté, sinon le joueur à pied)
  bool riding = true;              // player.mode === 'ride'
  std::vector<LifeVec2> horses;    // game.horses (cheval du joueur compris)
  LifeVec2 cam;                    // position de la caméra (demi-tour immédiat hors de vue, au-delà de 160 m)
};

struct STRIDESCORE_API TrafficCar {
  const LifeRoad* road = nullptr;
  std::string kind, color;
  double len = 0, s = 0, speed = 0, accel = 0, cruise = 1, wait = 0, endWait = 0, spin = 0;
  int dir = 1;
  std::optional<double> uturn;  // angle parcouru du demi-tour (rad)
  double x = 0, z = 0, heading = 0;
  double L = 4, r = 0.31;
  bool visible = true, braking = false;
  void place();
};

struct STRIDESCORE_API Walker {
  std::vector<LifeVec2> points;
  size_t i = 0;
  double speed = 1.2;  // vitesse de marche (WalkAI.speed)
  double wait = 0, talking = 0;
  double x = 0, z = 0, heading = 0, curSpeed = 0;
  bool visible = true;
};

class STRIDESCORE_API AmbientLife {
 public:
  // Apparition (Ambient.spawn) : voitures et passants des données ; seed : graine de Math.random pour la suite.
  void init(const AmbientData& data, unsigned seed);
  // Une image : passants (ordre d'apparition), voitures (Car.update), séparation des passants une image sur deux.
  void step(double dt, const LifeInput& in);
  std::vector<TrafficCar> cars;
  std::vector<Walker> walkers;
  int horns = 0;  // klaxons donnés (audio.horn)
  const AmbientData* data = nullptr;

 private:
  Mulberry32 rnd{0};
  int sepTick = 0;
  void stepCar(TrafficCar& c, double dt, const LifeInput& in);
  void stepWalker(Walker& w, double dt, const LifeInput& in);
  void separate();
  bool inTown(double x, double z) const;
};

// Point à l'abscisse s d'une polyligne (pointAlong du web) ; dir : cap du segment.
STRIDESCORE_API LifeVec2 lifePointAlong(const std::vector<LifeVec2>& pts, double s, double* dir);
STRIDESCORE_API double lifeDampAngle(double a, double b, double lambda, double dt);

}  // namespace strides
