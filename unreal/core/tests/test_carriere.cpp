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
#include "StridesCore/Collectibles.h"
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
    // Choix n° 25 : les offres « À venir » (épreuve non portée) ne s'acceptent pas ; on prend la première autre.
    std::string id;
    for (const auto& o : offers) {
      if (o.upcoming) {
        CHECK(!o.locked && o.lockText.rfind("À venir : ", 0) == 0, "%s : mention « À venir » (%s)", o.mission->id.c_str(), o.lockText.c_str());
        CHECK(strides::acceptMission(d, s, o.mission->id) == strides::AcceptResult::Upcoming, "%s acceptée alors que son épreuve n'est pas portée", o.mission->id.c_str());
        continue;
      }
      if (id.empty() && !o.locked) id = o.mission->id;
    }
    if (id.empty()) break;
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
  // Choix n° 25 : cross, derby et gpparis « À venir » ; csi3 (prérequis : derby) puis gp ne sont pas encore atteignables.
  {
    std::string blocked;
    for (const auto& m : d.missions) if (!s.done(m.id)) blocked += m.id + " ";
    CHECK(blocked == "cross derby csi3 gp gpparis ", "missions non terminées : « %s »", blocked.c_str());
    for (const char* u : {"cross", "derby", "gpparis"}) CHECK(d.find(u) && !d.find(u)->upcoming.empty(), "%s : non marquée « À venir »", u);
    int nUp = 0;
    for (const auto& m : d.missions) nUp += !m.upcoming.empty();
    CHECK(nUp == 3, "%d missions « À venir » (attendu 3)", nUp);
    // Le verrou n'est pas une règle de résultat : avec les prérequis remplis, csi3 et gp restent acceptables.
    strides::CareerState late = s;
    late.completed.push_back("cross");
    late.completed.push_back("derby");
    CHECK(strides::acceptMission(d, late, "csi3") == strides::AcceptResult::Ok, "csi3 refusée une fois le derby terminé");
  }
  CHECK(s.completed.size() == d.missions.size() - 5, "missions terminées : %zu / %zu", s.completed.size(), d.missions.size() - 5);
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

  // 5. Deuxième correction après contrôle adverse : comptes à rebours et règles de résultat du web.
  {
    auto after = [&](const char* id) {
      strides::CareerState c;
      c.reputation = 9999;
      for (const auto& m : d.missions) if (m.id != id) for (const auto& r : d.find(id)->prereqs) if (m.id == r) c.completed.push_back(m.id);
      return c;
    };
    std::string why;
    strides::CourseOutcome none;
    // Selle sur-mesure (story.js:197, r.timer = 105) : le compte à rebours part à l'étape de Clara.
    strides::CareerState c = after("livraison");
    CHECK(strides::acceptMission(d, c, "livraison") == strides::AcceptResult::Ok && c.timeLeft < 0, "livraison : pas de compte à rebours au comptoir");
    const strides::StoryMission* liv = d.find("livraison");
    CHECK(liv && liv->route.size() == 2, "livraison : 2 étapes (comptoir, Clara)");
    if (liv && liv->route.size() == 2) {
      CHECK(strides::updateStep(d, c, liv->route[0].x, liv->route[0].z, none, 0.25, why) == strides::StepUpdate::Advanced && c.timeLeft == 105, "livraison : 105 s au départ de la Sellerie (%.1f)", c.timeLeft);
      CHECK(strides::updateStep(d, c, 9999, 9999, none, 104, why) == strides::StepUpdate::None && c.timeLeft > 0.9 && c.timeLeft < 1.1, "livraison : 1 s restante");
      CHECK(strides::updateStep(d, c, liv->route[1].x, liv->route[1].z, none, 0.25, why) == strides::StepUpdate::Advanced && c.timeLeft < 0 && !strides::currentStep(d, c), "livraison : livrée à temps, compte à rebours arrêté");
      strides::CareerState late = after("livraison");
      strides::acceptMission(d, late, "livraison");
      strides::updateStep(d, late, liv->route[0].x, liv->route[0].z, none, 0.25, why);
      why.clear();
      CHECK(strides::updateStep(d, late, 9999, 9999, none, 105.5, why) == strides::StepUpdate::Failed, "livraison : échec à 0 s");
      CHECK(why == liv->timeoutText && why == "Trop tard : l’épreuve a commencé sans la selle.", "livraison : raison du web (%s)", why.c_str());
      CHECK(late.active.empty() && late.checkpoint.empty() && late.credits == 0 && !late.done("livraison"), "livraison : rien payé, mission arrêtée");
      bool again = false;
      for (const auto& o : strides::storyOffers(d, late, [](const std::string&) { return false; })) again = again || o.mission->id == "livraison";
      CHECK(again, "livraison : reproposée après l'échec");
    }
    // Galop sur la plage : 95 s du 1er anneau au retour aux Dunes.
    const strides::StoryMission* pl = d.find("plage");
    CHECK(pl && pl->route.size() == 9 && pl->route[1].timer == 95 && pl->route[8].stopTimer, "plage : Dunes, 7 anneaux, retour ; 95 s");
    // Le fugueur : 130 s pour rattraper Tonnerre.
    const strides::StoryMission* fu = d.find("fugueur");
    CHECK(fu && fu->route.size() == 3 && fu->route[1].timer == 130 && fu->route[1].stopTimer && fu->timeoutText == "Tonnerre s’est enfui trop loin…", "fugueur : 130 s");
    // Qualificative CSI 3★ : « p > 8 » échoue (story.js:717).
    strides::CareerState q = after("csi3");
    strides::acceptMission(d, q, "csi3");
    const strides::MissionStep* qs = strides::currentStep(d, q);
    CHECK(qs && qs->kind == "course" && qs->maxPenalties == 8, "csi3 : épreuve, 8 pénalités au plus");
    strides::CourseOutcome o9{true, 9, 70, false}, o8{true, 8, 70, false};
    why.clear();
    CHECK(strides::updateStep(d, q, 0, 0, o9, 0.25, why) == strides::StepUpdate::Failed && why == "9 pénalités : non qualifié(e). Il en faut 8 au maximum.", "csi3 : 9 pénalités (%s)", why.c_str());
    strides::acceptMission(d, q, "csi3");
    CHECK(strides::updateStep(d, q, 0, 0, o8, 0.25, why) == strides::StepUpdate::Advanced, "csi3 : qualifié à 8");
    // Grand Prix CSI 5★ : Van Dijk 4 points en 52,4 s (timeAllowedFor(cso, 400) − 3,6).
    strides::CareerState g = after("gp");
    strides::acceptMission(d, g, "gp");
    const strides::MissionStep* gs = strides::currentStep(d, g);
    CHECK(gs && gs->beatFaults == 4 && gs->beatName == "K. Van Dijk" && gs->beatTime > 40 && gs->beatTime < 70, "gp : meilleur adversaire du web (%.1f s)", gs ? gs->beatTime : 0.0);
    if (gs) {
      const double bt = gs->beatTime;
      strides::CourseOutcome slow{true, 4, bt + 0.1, false}, fast{true, 4, bt - 0.1, false}, clear{true, 0, 99, false}, out{true, 0, 10, true};
      why.clear();
      CHECK(strides::updateStep(d, g, 0, 0, slow, 0.25, why) == strides::StepUpdate::Failed && why.find("K. Van Dijk reste devant") != std::string::npos, "gp : 4 points plus lent (%s)", why.c_str());
      strides::acceptMission(d, g, "gp");
      CHECK(strides::updateStep(d, g, 0, 0, fast, 0.25, why) == strides::StepUpdate::Advanced, "gp : 4 points plus vite");
      strides::CareerState g2 = after("gp");
      strides::acceptMission(d, g2, "gp");
      CHECK(strides::updateStep(d, g2, 0, 0, clear, 0.25, why) == strides::StepUpdate::Advanced, "gp : sans-faute");
      strides::acceptMission(d, g2, "gp");
      strides::CareerState g3 = after("gp");
      strides::acceptMission(d, g3, "gp");
      why.clear();
      CHECK(strides::updateStep(d, g3, 0, 0, out, 0.25, why) == strides::StepUpdate::Failed, "gp : élimination");
    }
    // Missions encore réduites (épreuve non portée) : listées, pour l'arbitrage de Julien.
    int reducedCount = 0;
    for (const auto& m : d.missions) if (!m.full) { reducedCount++; std::printf("carriere : %s encore réduite (lieu seul)\n", m.id.c_str()); }
    CHECK(reducedCount == 3, "3 missions réduites (cross, derby, gpparis) : %d", reducedCount);
  }

  // 6. Jalon J3-D : fers d'or (collectibles.js) lus dans Content/Data/world_horseshoes.json comme le jeu.
  {
    strides::HorseshoeData hs;
    CHECK(strides::loadHorseshoes(readAll(data + "/world_horseshoes.json"), hs, err), "fers d'or : %s", err.c_str());
    CHECK(hs.shoes.size() == 20 && hs.shoes[0].first == -498 && hs.shoes[0].second == -392 && hs.shoes[19].first == -160, "20 fers du web");
    std::vector<int> got;
    CHECK(strides::collectShoes(hs, got, hs.shoes[3].first + 2.7, hs.shoes[3].second).empty(), "fer à 2,7 m : pas ramassé");
    auto p = strides::collectShoes(hs, got, hs.shoes[3].first + 2.5, hs.shoes[3].second);
    CHECK(p.size() == 1 && p[0].index == 3 && p[0].money == 25 && p[0].count == 1 && got == std::vector<int>{3}, "fer n°4 ramassé : +25 €");
    CHECK(strides::collectShoes(hs, got, hs.shoes[3].first, hs.shoes[3].second).empty(), "fer déjà ramassé : rien");
    int money = 25;
    for (size_t i = 0; i < hs.shoes.size(); ++i)
      for (const auto& q : strides::collectShoes(hs, got, hs.shoes[i].first, hs.shoes[i].second)) money += q.money;
    CHECK(got.size() == 20 && money == 20 * 25 + 500, "collection complète : %d € (attendu 1 000)", money);
  }

  std::printf("carriere : %d vérifications, %d échecs\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
