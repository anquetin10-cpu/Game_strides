// Jalon J3b : véhicules conduisibles du jeu web, en C++ sans type Unreal. Portage de src/entities/truckPhysics.js
// (TruckSim : moteur et courbe de couple, boîte automatique, embrayage piloté, résistances, freins, frein moteur,
// direction asservie à la vitesse, modèle cinématique fondu dans un modèle bicyclette, carburant) et du gabarit de
// src/entities/vehicle.js / truck.js (portière conducteur, boîte de collision). Données : Content/Data/vehicles.json,
// exporté du web lui-même (scripts/unreal/export-vehicules.mjs) ; oracle : ctest « vehicules ».
// Repère du web : cap h (avant = (sin h, cos h)), gauche = (cos h, −sin h) ; lacet r > 0 : virage à gauche.
#pragma once
#include <map>
#include <string>
#include <utility>
#include <vector>
#include "StridesCore/Api.h"

namespace strides {

struct VehicleSpec {
  std::string name, fuel = "diesel", drive;
  bool awd = false;
  double massEmpty = 1200, massHorse = 0, zFront = 1.3, zRear = -1.3, track = 1.5, cgEmpty = 0.25, cgHeight = 0.55, wheelR = 0.31;
  double idle = 800, maxRpm = 6000, cutRpm = 6300;
  std::vector<std::pair<double, double>> torque;
  double maxTorque = 160;
  double tank = 60, idleLph = 0.8, bsfc = 210, refL100 = 8;
  std::vector<double> gears, gearTorque;
  double reverse = 3.5, finalDrive = 4, eff = 0.9, shiftTime = 0.4;
  double shiftUp[2] = {2000, 5000}, shiftDown[2] = {1200, 2500}, shiftDownBrake = 1500;
  int startGear = 1;
  double launch[2] = {1000, 1800}, engineBrake[2] = {12, 0.006}, holdRpm = 1500;
  double crr = 0.01, crrSoft = 0.045, cdA = 0.6, rho = 1.2, brakeDecel = 9.5, brakeRise = 2.6, mu = 1, muSoft = 0.6;
  double maxSteer = 0.5, steerRate = 1.8, aLatSteer = 7, limiter = 50, cornerF = 9.5, cornerR = 11;
};

// Gabarit (repère du véhicule, m) : portière conducteur (doorX à gauche, doorZ vers l'avant), boîte de collision
// (demi-largeur hw, demi-longueur hd, centrée à zc vers l'avant), caméra de conduite (camDist).
struct VehicleGeometry {
  double L = 4, W = 1.8, H = 1.6, zc = 0, wb = 2.6, r = 0.31, doorX = 1.6, doorZ = 0, camDist = 6.8, hw = 1, hd = 2.1;
};

struct VehicleData {
  std::map<std::string, VehicleSpec> specs;
  std::map<std::string, VehicleGeometry> geometry;
  double truckX = 0, truckZ = 0, truckHeading = 0;  // sites.js HOME.truck
};
STRIDESCORE_API bool loadVehicles(const std::string& jsonText, VehicleData& out, std::string& err);

STRIDESCORE_API double torqueAt(const VehicleSpec& s, double rpm);

struct DriveInput {
  double throttle = 0;  // −1..1 (bas = frein puis marche arrière)
  double steer = 0;     // −1..1 (droite +)
  bool park = false;
};

class STRIDESCORE_API TruckSim {
 public:
  explicit TruckSim(const VehicleSpec& spec);
  void reset();
  double mass() const { return spec.massEmpty + horses * spec.massHorse; }
  double cgZ() const;
  double ratio(int g) const;
  double ratio() const { return ratio(gear); }
  double steerLimit(double v) const;
  // input nul : personne au volant (frein de parc).
  void step(double dt, const DriveInput* input);
  void impact(double k = -0.25);
  std::pair<double, double> ackermann() const;
  std::string gearLabel() const;
  double refuel(double litres);
  void startEngine();  // vehicle.js startEngine (sans le son)

  VehicleSpec spec;
  double x = 0, z = 0, heading = 0;
  int horses = 0;
  double vx = 0, vy = 0, r = 0, steer = 0, rpm = 0;
  int gear = 1, shiftTo = 1;
  double shiftT = 0, clutch = 0, sinceShift = 10, throttle = 0, brake = 0, ax = 0, ay = 0, jerk = 0;
  bool engineOn = false;
  double slope = 0, soft = 0, revT = 0;
  int shifted = 0;
  double load = 0, wheelSpin = 0;
  bool braking = false;
  double fuelL = 60, fuelLph = 0, tripM = 0, tripL = 0;
  bool dry = false;

 private:
  void sub(double dt, const DriveInput* input);
  void shift(int g);
  void engage(int g);
};

// Portière conducteur au monde (vehicle.js / truck.js doorPoint(1)).
STRIDESCORE_API void vehicleDoor(const VehicleGeometry& g, double x, double z, double heading, double& outX, double& outZ);

}  // namespace strides
