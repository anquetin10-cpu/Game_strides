// Jalon J3 (correction après contrôle adverse) : missions de l'histoire (StridesCore/Career) contre le jeu web.
// Données lues par le même chemin que le jeu : Content/Data/story_missions.json ; oracle : tests/oracles/story_missions.json
// (offres calculées par la vraie MissionManager.refreshOffers du web, paliers par reputationTier ; export-missions.mjs).
// Usage : strides_carriere_tests <dossier des oracles> <Content/Data>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>

#include "StridesCore/Career.h"
#include "StridesCore/MiniJson.h"

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
  strides::StoryData d;
  std::string err;
  if (!strides::loadStory(readAll(data + "/story_missions.json"), d, err)) { std::printf("lecture : %s\n", err.c_str()); return 1; }
  const J oracle = loadJson(oracles + "/story_missions.json");

  // 1. Titres et sommes : ceux du web (contrôle adverse : m1 « Deux écuries, une matinée », 90 € / 60 ; m3 150 € / 200 ;
  //    fugueur 160 / 200 ; csi3 500 / 450). Valeurs relevées dans le code du web au 27/11 (story2.js CHAPTER1, story.js).
  struct Known { const char* id; const char* title; int pay, xp; const char* req; };
  const Known known[] = {{"tuto", "Premiers pas", 50, 60, ""}, {"m1", "Deux écuries, une matinée", 90, 60, "tuto"},
                         {"m2", "Un renfort avant le concours", 120, 100, "m1"}, {"m3", "Le premier concours en équipe", 150, 200, "m2"},
                         {"fugueur", "Le fugueur", 160, 200, "livraison"}, {"csi3", "Qualificative CSI 3★", 500, 450, "derby"},
                         {"gp", "Grand Prix CSI 5★", 1500, 900, "csi3"}};
  for (const Known& k : known) {
    const strides::StoryMission* m = d.find(k.id);
    CHECK(m, "mission %s absente", k.id);
    if (!m) continue;
    CHECK(m->title == k.title, "%s : titre « %s »", k.id, m->title.c_str());
    CHECK(m->pay == k.pay && m->xp == k.xp, "%s : %d € / %d (attendu %d / %d)", k.id, m->pay, m->xp, k.pay, k.xp);
    CHECK(*k.req == 0 ? m->prereqs.empty() : (!m->prereqs.empty() && m->prereqs[0] == k.req), "%s : prérequis", k.id);
  }
  CHECK(d.find("m3") && d.find("m3")->payLabel == "150 € + dotation", "m3 : libellé du paiement");

  // 2. Offres : celles de refreshOffers du web après chaque mission (ordre, verrous de palier).
  int probes = 0;
  for (const J& p : oracle["offersAfter"].a) {
    strides::CareerState s;
    for (const J& c : p["completed"].a) s.completed.push_back(c.s);
    s.reputation = (int)p["reputation"].n;
    const auto offers = strides::storyOffers(d, s, [](const std::string&) { return false; });
    std::string got, want;
    for (const auto& o : offers) got += o.mission->id + (o.locked ? "* " : " ");
    for (const J& o : p["offers"].a) want += o["id"].s + (o["locked"].b ? "* " : " ");
    CHECK(got == want, "offres après %zu missions à %d points : « %s » au lieu de « %s »", s.completed.size(), s.reputation, got.c_str(), want.c_str());
    probes++;
  }
  CHECK(probes >= 20, "relevés d'offres : %d", probes);
  for (const J& p : oracle["tierProbe"].a) {
    const auto t = strides::reputationTier(d, (int)p["points"].n);
    CHECK(t.level == (int)p["level"].n && t.tier && t.tier->title == p["title"].s, "palier à %d points", (int)p["points"].n);
    CHECK(std::fabs(std::round(t.progress * 100) / 100 - p["progress"].n) < 1e-9, "progression à %d points", (int)p["points"].n);
  }

  // 3. Itinéraires : aucune mission ne se termine sur place. Au départ de la partie (point d'apparition du web,
  //    world.spawn -104, 168), la première étape de chaque mission du chemin principal est hors de portée (le contrôle
  //    adverse a vu tuto et m1 se terminer 0,1 s après l'acceptation).
  for (const char* id : {"tuto", "m1", "m2", "m3", "groom", "transport"}) {
    const strides::StoryMission* m = d.find(id);
    CHECK(m && m->full, "%s : itinéraire relevé", id);
    if (!m) continue;
    const auto& s0 = m->route.front();
    CHECK(std::hypot(s0.x + 104, s0.z - 168) > s0.r, "%s : 1re étape à %.1f m du départ (rayon %.1f)", id, std::hypot(s0.x + 104, s0.z - 168), s0.r);
    double len = 0, px = -104, pz = 168;
    for (const auto& st : m->route) len += std::hypot(st.x - px, st.z - pz), px = st.x, pz = st.z;
    CHECK(len > 20, "%s : trajet de %.0f m seulement", id, len);
  }
  CHECK(d.find("m3")->route.size() == 4 && d.find("m3")->route[2].kind == "course", "m3 : épreuve du Pôle en 3e étape");

  // 4. Partie complète : chaque mission acceptée, chaque étape franchie, paiements du web cumulés.
  strides::CareerState s;
  s.credits = 100;  // le « Fer perdu » coûte 60 € : solde d'amorce
  int expectPay = 100, expectRep = 0, guard = 0;
  while (guard++ < 100) {
    const auto offers = strides::storyOffers(d, s, [](const std::string&) { return false; });
    if (offers.empty()) break;
    const std::string id = offers.front().mission->id;
    const auto res = strides::acceptMission(d, s, id);
    CHECK(res == strides::AcceptResult::Ok, "acceptation de %s : %d", id.c_str(), (int)res);
    if (res != strides::AcceptResult::Ok) break;
    CHECK(strides::acceptMission(d, s, id) != strides::AcceptResult::Ok, "double acceptation de %s", id.c_str());
    const strides::StoryMission* m = d.find(id);
    // Pas franchie de loin.
    CHECK(!strides::advanceStep(d, s, 9999, 9999, false), "%s : étape franchie de loin", id.c_str());
    for (size_t i = 0; i < m->route.size(); ++i) {
      const auto& st = m->route[i];
      if (st.kind == "course") {
        CHECK(!strides::advanceStep(d, s, st.x, st.z, false), "%s : épreuve franchie sans parcours", id.c_str());
        CHECK(strides::advanceStep(d, s, st.x, st.z, true), "%s : épreuve terminée", id.c_str());
      } else {
        CHECK(strides::advanceStep(d, s, st.x + st.r * 0.7, st.z, false), "%s : étape %zu", id.c_str(), i);
      }
    }
    CHECK(strides::currentStep(d, s) == nullptr, "%s : itinéraire fini", id.c_str());
    const auto r = strides::completeMission(d, s);
    CHECK(r.fresh && r.pay == m->pay && r.rep == m->xp, "%s : récompense", id.c_str());
    expectPay += m->pay - m->cost;
    expectRep += m->xp;
  }
  CHECK(s.completed.size() == d.missions.size(), "missions terminées : %zu / %zu", s.completed.size(), d.missions.size());
  CHECK(s.credits == expectPay && s.reputation == expectRep, "fin : %d crédits, %d points (attendu %d, %d)", s.credits, s.reputation, expectPay, expectRep);
  // Une mission de l'histoire ne paie qu'une fois (grantOnce).
  s.active = "tuto";
  const auto again = strides::completeMission(d, s);
  CHECK(!again.fresh && again.pay == 0 && again.rep == 0, "tuto payée deux fois");
  // Verrou de palier et solde insuffisant.
  strides::CareerState low;
  for (const char* c : {"tuto", "m1", "m2", "m3", "groom", "livraison", "fugueur"}) low.completed.push_back(c);
  CHECK(strides::acceptMission(d, low, "plage") == strides::AcceptResult::Locked, "plage acceptée sous le palier 2");
  strides::CareerState poor;
  for (const auto& m : d.missions) if (m.id != "fer") poor.completed.push_back(m.id);
  poor.reputation = 9999;
  CHECK(strides::acceptMission(d, poor, "fer") == strides::AcceptResult::Funds, "fer accepté sans les 60 €");

  std::printf("carriere : %d vérifications, %d échecs\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
