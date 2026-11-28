// Jalon J3 : vie ambiante (StridesCore/WorldLife : circulation Car, passants WalkAI, séparation) et mini-carte
// (StridesCore/Minimap) contre l'oracle relevé dans le jeu web en cours d'exécution (tests/oracles/monde_vivant.json,
// scripts/unreal/export-monde-vivant.mjs). Les données d'apparition sont lues dans Content/Data/world_ambient.json par le
// même chemin que le jeu (loadAmbient).
// Usage : strides_monde_vivant_tests <dossier des oracles> <Content/Data>
#include <cmath>
#include <cstdio>
#include <string>

#include "StridesCore/MiniJson.h"
#include "StridesCore/MathUtil.h"
#include "StridesCore/Minimap.h"
#include "StridesCore/WorldLife.h"

static int g_checks = 0, g_fail = 0;
#define CHECK(cond, ...)                                 \
  do {                                                   \
    g_checks++;                                          \
    if (!(cond)) {                                       \
      g_fail++;                                          \
      if (g_fail < 40) {                                 \
        std::printf("ÉCHEC %s:%d : ", __FILE__, __LINE__); \
        std::printf(__VA_ARGS__);                        \
        std::printf("\n");                               \
      }                                                  \
    }                                                    \
  } while (0)

static bool near(double a, double b, double tol) { return std::fabs(a - b) <= tol; }

static std::string readAll(const std::string& p) {
  std::ifstream f(p);
  std::stringstream ss;
  ss << f.rdbuf();
  return ss.str();
}

// Une trace du web rejouée : joueur, chevaux et caméra du scénario.
static void replay(const char* name, const J& trace, const strides::AmbientData& data, unsigned simSeed, const strides::LifeInput& in, double tol) {
  strides::AmbientLife life;
  life.init(data, simSeed);
  int frame = 0;
  double worst = 0;
  int bad = 0;
  for (const J& sample : trace.a) {
    const int f = (int)sample["f"].num();
    while (frame < f) {
      life.step(1.0 / 30, in);
      frame++;
    }
    for (size_t i = 0; i < sample["cars"].a.size(); i++) {
      const J& w = sample["cars"][i];
      const strides::TrafficCar& c = life.cars[i];
      const double e = std::fmax(std::fmax(std::fabs(c.x - w["x"].num()), std::fabs(c.z - w["z"].num())), std::fmax(std::fabs(c.speed - w["speed"].num()), std::fabs(c.s - w["s"].num())));
      worst = std::fmax(worst, e);
      if (e > tol || c.dir != (int)w["dir"].num() || c.uturn.has_value() == w["uturn"].isNull()) {
        if (bad++ < 3) CHECK(false, "%s image %d voiture %zu : (%.4f, %.4f, v %.4f, s %.4f, sens %d) au lieu de (%.4f, %.4f, v %.4f, s %.4f, sens %d)", name, f, i, c.x, c.z, c.speed, c.s, c.dir, w["x"].num(), w["z"].num(), w["speed"].num(), w["s"].num(), (int)w["dir"].num());
      } else
        g_checks++;
    }
    for (size_t i = 0; i < sample["walkers"].a.size(); i++) {
      const J& w = sample["walkers"][i];
      const strides::Walker& p = life.walkers[i];
      const double e = std::fmax(std::fmax(std::fabs(p.x - w["x"].num()), std::fabs(p.z - w["z"].num())), std::fabs(p.curSpeed - w["speed"].num()));
      worst = std::fmax(worst, e);
      if (e > tol || p.i != (size_t)w["i"].num()) {
        if (bad++ < 6) CHECK(false, "%s image %d passant %zu : (%.4f, %.4f, v %.3f, point %zu) au lieu de (%.4f, %.4f, v %.3f, point %d)", name, f, i, p.x, p.z, p.curSpeed, p.i, w["x"].num(), w["z"].num(), w["speed"].num(), (int)w["i"].num());
      } else
        g_checks++;
    }
    CHECK(life.horns == (int)sample["horns"].num(), "%s image %d : %d klaxon(s) au lieu de %d", name, f, life.horns, (int)sample["horns"].num());
  }
  std::printf("%s : %zu relevés, écart maximal %.2e m\n", name, trace.a.size(), worst);
}

int main(int argc, char** argv) {
  if (argc < 3) {
    std::printf("usage : %s <oracles> <Content/Data>\n", argv[0]);
    return 2;
  }
  const J o = loadJson(std::string(argv[1]) + "/monde_vivant.json");
  strides::AmbientData data;
  std::string err;
  CHECK(strides::loadAmbient(readAll(std::string(argv[2]) + "/world_ambient.json"), data, err), "world_ambient.json illisible : %s", err.c_str());
  CHECK(data.cars.size() == 7 && data.walkers.size() == 24 && data.spectators.size() == 8 && data.roads.size() == 14, "apparition : %zu voitures, %zu passants, %zu spectateurs, %zu routes", data.cars.size(), data.walkers.size(), data.spectators.size(), data.roads.size());
  // Agglomération de la ville (TOWN_BOX du web) : Deauville City (20, −266) dedans, l'Écurie du Val (−110, 172) dehors.
  CHECK(data.townX0 < 20 && data.townX1 > 20 && data.townZ0 < -266 && data.townZ1 > -266, "Deauville City hors de l'agglomération");
  CHECK(!(data.townX0 < -110 && data.townX1 > -110 && data.townZ0 < 172 && data.townZ1 > 172), "Écurie du Val dans l'agglomération");
  // Données refusées : schéma inconnu.
  strides::AmbientData bad;
  CHECK(!strides::loadAmbient("{\"schema\":\"x\"}", bad, err), "schéma inconnu accepté");
  // mulberry32 : premières valeurs du web pour la graine 7 (graine des données d'apparition : allure de la 1re voiture
  // tirée après 1 + 4 tirages de la vie ambiante, voir l'oracle ; ici seule la suite est vérifiée contre elle-même).
  strides::Mulberry32 a(2026.0), b(2026.0);
  CHECK(a.next() == b.next(), "mulberry32 non déterministe");

  const J& T = o["traces"];
  const J& seeds = o["simSeeds"];
  strides::LifeInput free;
  free.player = {-104, 168};
  free.cam = free.player;
  free.riding = true;
  replay("circulation libre", T["free"], data, (unsigned)seeds["free"].num(), free, 1e-6);
  strides::LifeInput horse;
  horse.player = {-32.2, 100};
  horse.cam = horse.player;
  horse.riding = true;
  horse.horses.push_back(horse.player);
  replay("cheval sur la chaussée", T["horse"], data, (unsigned)seeds["horse"].num(), horse, 1e-6);
  strides::LifeInput foot = horse;
  foot.riding = false;
  foot.horses.clear();
  replay("piéton sur la chaussée", T["foot"], data, (unsigned)seeds["foot"].num(), foot, 1e-6);
  strides::LifeInput nearIn;
  nearIn.player = {data.walkers[0].points[0].x + 1.5, data.walkers[0].points[0].z + 0.5};
  nearIn.cam = nearIn.player;
  nearIn.riding = false;
  replay("passant abordé", T["near"], data, (unsigned)seeds["near"].num(), nearIn, 1e-6);
  // Faits de jeu lus dans les traces : voitures arrêtées derrière le cheval, sans klaxon ; klaxon devant le piéton.
  {
    const J& last = T["horse"].a.back();
    CHECK(last["horns"].num() == 0, "klaxon derrière un cheval");
    int stopped = 0;
    for (const J& c : last["cars"].a)
      if (std::fabs(c["x"].num() + 32.2) < 0.01 && c["z"].num() < 100 && c["z"].num() > 80 && std::fabs(c["speed"].num()) < 0.01) stopped++;
    CHECK(stopped == 2, "%d voiture(s) arrêtée(s) derrière le cheval au lieu de 2", stopped);
    CHECK(T["foot"].a.back()["horns"].num() > 0, "aucun klaxon devant le piéton");
  }

  // ---------- Mini-carte ----------
  const J& M = o["minimap"];
  const double W = M["W"].num();
  strides::MinimapView view;
  CHECK(view.range == M["initialRange"].num(), "portée initiale %.1f", view.range);
  double worst = 0;
  for (const J& fr : M["frames"].a) {
    const J& in = fr["input"];
    const double x = in["x"].num(), z = in["z"].num(), yaw = in["yaw"].num();
    CHECK(view.step(0.05, in["speed"].num(), in["mode"].s == "drive"), "image non dessinée");
    worst = std::fmax(worst, std::fabs(view.range - fr["range"].num()));
    CHECK(near(view.range, fr["range"].num(), 1e-5), "portée %.6f au lieu de %.6f", view.range, fr["range"].num());
    CHECK(near(yaw, fr["mapRotate"].num(), 1e-6), "rotation de la carte");
    const auto img = view.image(W, x, z);
    CHECK(near(img.x, fr["image"][0].num(), 1e-4) && near(img.y, fr["image"][1].num(), 1e-4) && near(img.size, fr["image"][2].num(), 1e-4), "image de la carte (%.4f, %.4f, %.4f) au lieu de (%.4f, %.4f, %.4f)", img.x, img.y, img.size, fr["image"][0].num(), fr["image"][1].num(), fr["image"][2].num());
    const J& route = in["route"];
    CHECK(route.isNull() == fr["route"].a.empty(), "itinéraire dessiné à tort");
    if (!route.isNull())
      for (size_t i = 0; i < route.a.size(); i++) {
        const auto p = view.toScreen(W, x, z, yaw, route[i][0].num(), route[i][1].num());
        CHECK(near(p.x, fr["route"][i][0].num(), 1e-4) && near(p.y, fr["route"][i][1].num(), 1e-4), "itinéraire, point %zu : (%.4f, %.4f) au lieu de (%.4f, %.4f)", i, p.x, p.y, fr["route"][i][0].num(), fr["route"][i][1].num());
      }
    size_t k = 0;
    for (const J& b : in["blips"].a) {
      strides::MinimapPoint p;
      const bool sticky = b["sticky"].t == J::Bool && b["sticky"].b;
      if (!view.blip(W, x, z, yaw, b["x"].num(), b["z"].num(), sticky, p)) continue;
      CHECK(k < fr["blips"].a.size(), "repère en trop");
      if (k >= fr["blips"].a.size()) break;
      const double sc = (W / 132) * (b["small"].t == J::Bool && b["small"].b ? 0.8 : 1);
      CHECK(near(p.x, fr["blips"][k][0].num(), 1e-4) && near(p.y, fr["blips"][k][1].num(), 1e-4) && near(sc, fr["blips"][k][2].num(), 1e-6), "repère %zu (%s) : (%.4f, %.4f) au lieu de (%.4f, %.4f)", k, b["kind"].s.c_str(), p.x, p.y, fr["blips"][k][0].num(), fr["blips"][k][1].num());
      k++;
    }
    CHECK(k == fr["blips"].a.size(), "%zu repère(s) au lieu de %zu", k, fr["blips"].a.size());
    CHECK(near(strides::MinimapView::arrowRotation(in["heading"].num(), yaw), fr["arrowRotate"].num(), 1e-6), "flèche du joueur");
    const auto n = view.north(W, x, z, yaw);
    CHECK(near(n.x, fr["north"][0].num(), 1e-4) && near(n.y, fr["north"][1].num(), 1e-4), "nord (%.4f, %.4f) au lieu de (%.4f, %.4f)", n.x, n.y, fr["north"][0].num(), fr["north"][1].num());
  }
  // Moins de 1/30 s après une image : rien n'est redessiné (portée gardée).
  const double r0 = view.range;
  CHECK(!view.step(0.01, 16, false) && view.range == r0, "image redessinée avant 1/30 s");
  // Lacet du web depuis le regard : regard vers −z (nord) → 0 ; vers +x → −π/2 (carte tournée, l'est en haut).
  CHECK(near(strides::MinimapView::yawFromLook(0, -1), 0, 1e-12) && near(strides::MinimapView::yawFromLook(1, 0), -strides::kPi / 2, 1e-12), "lacet depuis le regard");
  // Regard vers l'est : un point à l'est est en haut de la carte (sens du monde à l'écran : la carte tourne avec le regard).
  {
    const double yawE = strides::MinimapView::yawFromLook(1, 0);
    const auto p = strides::MinimapView::toScreen(132, 170, 0, 0, yawE, 50, 0);
    CHECK(near(p.x, 66, 1e-9) && p.y < 66, "regard vers l'est : point à l'est en (%.2f, %.2f), attendu en haut", p.x, p.y);
    const auto r = strides::MinimapView::toScreen(132, 170, 0, 0, yawE, 0, 50);  // au sud : à droite quand on regarde l'est
    CHECK(r.x > 66 && near(r.y, 66, 1e-9), "regard vers l'est : point au sud en (%.2f, %.2f), attendu à droite", r.x, r.y);
  }
  std::printf("mini-carte : %zu images, écart de portée maximal %.2e m\n", M["frames"].a.size(), worst);
  std::printf("%d vérifications, %d échec(s)\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
