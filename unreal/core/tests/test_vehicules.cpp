// Jalon J3b : véhicules conduisibles (StridesCore/Vehicle) contre le jeu web.
// Données lues par le même chemin que le jeu : Content/Data/vehicles.json ; oracle : tests/oracles/vehicles.json
// (vraie TruckSim de src/entities/truckPhysics.js pilotée par des commandes scriptées ; export-vehicules.mjs).
// Usage : strides_vehicules_tests <dossier des oracles> <Content/Data>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>

#include "StridesCore/MiniJson.h"
#include "StridesCore/Vehicle.h"

static int g_checks = 0, g_fail = 0;
#define CHECK(cond, ...)                                   \
  do {                                                     \
    g_checks++;                                            \
    if (!(cond)) {                                         \
      g_fail++;                                            \
      if (g_fail < 40) {                                   \
        std::printf("ÉCHEC %s:%d : ", __FILE__, __LINE__); \
        std::printf(__VA_ARGS__);                          \
        std::printf("\n");                                 \
      }                                                    \
    }                                                      \
  } while (0)

static std::string readAll(const std::string& p) {
  std::ifstream f(p);
  std::stringstream ss;
  ss << f.rdbuf();
  return ss.str();
}

int main(int argc, char** argv) {
  if (argc < 3) { std::printf("usage : %s <oracles> <Content/Data>\n", argv[0]); return 2; }
  const std::string oracles = argv[1], data = argv[2];
  strides::VehicleData d;
  std::string err;
  if (!strides::loadVehicles(readAll(data + "/vehicles.json"), d, err)) { std::printf("lecture : %s\n", err.c_str()); return 1; }
  const J oracle = JParser(readAll(oracles + "/vehicles.json")).parse();

  // 1. Modèles et gabarits du web : 9 modèles (camion, 5 voitures, van, Defender, tracteur), 7 gabarits posés.
  CHECK(d.specs.size() == 9, "%zu modèles", d.specs.size());
  for (const char* k : {"truck", "clio", "golf", "p508", "p3008", "duster", "tractor"}) {
    CHECK(d.specs.count(k) && d.geometry.count(k), "%s absent", k);
  }
  CHECK(d.specs["truck"].massEmpty == 5500 && d.specs["truck"].limiter == 25 && d.specs["truck"].brakeRise == 2.6, "camion : 5 500 kg, 90 km/h, freins à air");
  CHECK(d.specs["clio"].gears.size() == 5 && d.specs["clio"].fuel == "petrol" && d.specs["clio"].drive == "front", "Clio : 5 rapports, essence, traction");
  CHECK(d.specs["duster"].awd && d.specs["tractor"].awd, "Duster et tracteur : 4 roues motrices");
  CHECK(std::fabs(d.truckX + 64) < 1e-9 && std::fabs(d.truckZ - 158) < 1e-9, "camion à l'Écurie du Val (HOME.truck)");
  CHECK(std::fabs(d.geometry["clio"].doorX - 1.649) < 1e-6 && d.geometry["tractor"].doorZ == -0.8, "portières (doorPoint du web)");
  CHECK(std::fabs(strides::torqueAt(d.specs["truck"], 1500) - 750) < 1e-9 && std::fabs(strides::torqueAt(d.specs["truck"], 900) - 585) < 1e-9, "courbe de couple");

  // 2. Trajectoires : TruckSim du portage contre celle du web, commandes scriptées, 1/60 s.
  int runs = 0, rows = 0;
  double worstPos = 0, worstV = 0, worstRpm = 0;
  for (const J& run : oracle["runs"].a) {
    const std::string kind = run["kind"].s;
    if (!d.specs.count(kind)) { CHECK(false, "modèle %s absent", kind.c_str()); continue; }
    strides::TruckSim s(d.specs[kind]);
    s.x = 10; s.z = -20; s.heading = 0.3;
    s.startEngine();
    s.horses = (int)run["horses"].n;
    const double dt = run["dt"].n;
    size_t ri = 0;
    int n = 0;
    for (const J& ph : run["script"].a) {
      s.slope = ph["slope"].t == J::Num ? ph["slope"].n : 0;
      s.soft = ph["soft"].t == J::Num ? ph["soft"].n : 0;
      strides::DriveInput in;
      in.throttle = ph["throttle"].n;
      in.steer = ph["steer"].n;
      in.park = ph["park"].t == J::Bool && ph["park"].b;
      const int steps = (int)std::lround(ph["t"].n / dt);
      for (int i = 0; i < steps; ++i) {
        s.step(dt, &in);
        if (++n % 6 != 0 || ri >= run["rows"].a.size()) continue;
        const J& w = run["rows"].a[ri++];
        const double ep = std::hypot(s.x - w.a[1].n, s.z - w.a[2].n);
        worstPos = std::max(worstPos, ep);
        worstV = std::max(worstV, std::fabs(s.vx - w.a[4].n));
        worstRpm = std::max(worstRpm, std::fabs(s.rpm - w.a[7].n));
        CHECK(ep < 1e-4 && std::fabs(s.heading - w.a[3].n) < 1e-5 && std::fabs(s.vx - w.a[4].n) < 1e-4, "%s pas %d : (%.6f ; %.6f) cap %.6f v %.6f au lieu de (%.6f ; %.6f) %.6f %.6f",
              kind.c_str(), n, s.x, s.z, s.heading, s.vx, w.a[1].n, w.a[2].n, w.a[3].n, w.a[4].n);
        CHECK(std::fabs(s.rpm - w.a[7].n) < 1e-2 && s.gear == (int)w.a[8].n && std::fabs(s.steer - w.a[9].n) < 1e-5, "%s pas %d : régime %.3f rapport %d braquage %.5f au lieu de %.3f %d %.5f",
              kind.c_str(), n, s.rpm, s.gear, s.steer, w.a[7].n, (int)w.a[8].n, w.a[9].n);
        CHECK(std::fabs(s.fuelL - w.a[12].n) < 1e-5 && s.gearLabel() == w.a[13].s, "%s pas %d : carburant %.6f « %s » au lieu de %.6f « %s »", kind.c_str(), n, s.fuelL, s.gearLabel().c_str(), w.a[12].n, w.a[13].s.c_str());
        rows++;
      }
    }
    const auto [al, ar] = s.ackermann();
    CHECK(std::fabs(al - run["final"]["ackL"].n) < 1e-5 && std::fabs(ar - run["final"]["ackR"].n) < 1e-5, "%s : Ackermann", kind.c_str());
    CHECK(std::fabs(s.tripM - run["final"]["tripM"].n) < 1e-3, "%s : compteur %.3f au lieu de %.3f", kind.c_str(), s.tripM, run["final"]["tripM"].n);
    runs++;
  }
  CHECK(runs == 5 && rows > 1000, "%d relevés, %d lignes", runs, rows);

  // 3. Comportements du web : sans conducteur, frein de parc ; panne sèche ; marche arrière seulement à l'arrêt.
  {
    strides::TruckSim s(d.specs["clio"]);
    s.vx = 5;
    s.step(1.0, nullptr);
    CHECK(s.vx == 0, "sans conducteur : arrêté (%.3f)", s.vx);
    s.startEngine();
    s.fuelL = 1e-6;
    strides::DriveInput full;
    full.throttle = 1;
    for (int i = 0; i < 60; ++i) s.step(1.0 / 60, &full);
    CHECK(s.dry && !s.engineOn, "panne sèche : moteur calé");
    s.startEngine();
    CHECK(!s.engineOn, "panne sèche : ne redémarre pas");
    CHECK(s.refuel(10) > 9.9 && !s.dry, "plein : redémarrage possible");
  }
  std::printf("vehicules : %d vérifications, %d échecs ; écart maximal position %.2e m, vitesse %.2e m/s, régime %.2e tr/min\n", g_checks, g_fail, worstPos, worstV, worstRpm);
  return g_fail ? 1 : 0;
}
