// Jalon J4 (correction) : Grand Prix de Paris Indoor (StridesCore/Paris) contre le jeu web. Oracle :
// tests/oracles/paris_gp.json, produit par la vraie MissionManager du web (PARIS_MISSION de parisGP.js, courseSteps de
// courses.js pour le Sprint, le Grand Prix et le barrage, loadStep / driveStep / unloadStep de trip.js) dans une partie
// factice (scripts/unreal/export-paris.mjs). Chaque scénario est rejoué image par image (1/30 s) avec les mêmes entrées
// (cheval, point suivi, mode, camion, région, événements d'obstacle, dialogues fermés, boutons, action) ; sont comparés
// à chaque image relevée : type d'étape, texte de l'objectif, état de la manche, grands messages, toasts, dialogues et
// cartes (en-tête, titre, lignes, classement, boutons), puis l'issue (montant, note, réputation, titre, texte) et les
// grandeurs du déroulé (rang au Sprint, ordre de départ, barrage, place finale).
// Usage : strides_paris_tests <dossier des oracles> <Content/Data>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <algorithm>
#include <map>
#include <sstream>
#include <string>

#include "StridesCore/MiniJson.h"
#include "StridesCore/Paris.h"

static int g_checks = 0, g_fail = 0;
#define CHECK(cond, ...)                                   \
  do {                                                     \
    g_checks++;                                            \
    if (!(cond)) {                                         \
      g_fail++;                                            \
      if (g_fail < 60) {                                   \
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
static double r4(double v) { return strides::jsRoundHalfUp(v * 1e4) / 1e4; }
static std::string num(double v) {
  char b[64];
  std::snprintf(b, sizeof b, "%.10g", r4(v));
  return b;
}
static std::string callText(const strides::CsoCall& c) {
  std::string s = "hud." + c.fn;
  for (const strides::CsoArg& a : c.args) s += "|" + (a.isNum ? num(a.n) : a.s);
  return s;
}
static std::string oracleCall(const J& c) {
  std::string s;
  for (size_t i = 0; i < c.a.size(); ++i) {
    if (i) s += "|";
    s += c.a[i].t == J::Num ? num(c.a[i].n) : c.a[i].s;
  }
  return s;
}
static std::string cardText(const strides::ParisCard& c) {
  std::string s = "card|" + c.kicker + "|" + c.title;
  for (const auto& r : c.rows) s += "|" + r.first + "=" + r.second;
  for (const auto& r : c.table) {
    s += "|[" + std::string(r.me ? "1" : "0");
    for (const std::string& x : r.cells) s += "," + x;
    s += "]";
  }
  for (const std::string& b : c.buttons) s += "|b:" + b;
  return s;
}
static std::string oracleCard(const J& c) {
  std::string s = "card|" + c["kicker"].s + "|" + c["title"].s;
  for (const J& r : c["rows"].a) s += "|" + r[0].s + "=" + r[1].s;
  for (const J& r : c["table"].a) {
    s += "|[" + std::string(r[0].n ? "1" : "0");
    for (size_t i = 1; i < r.a.size(); ++i) s += "," + r[i].s;
    s += "]";
  }
  for (const J& b : c["buttons"].a) s += "|b:" + b.s;
  return s;
}

int main(int argc, char** argv) {
  if (argc < 3) {
    std::printf("usage : strides_paris_tests <oracles> <Content/Data>\n");
    return 2;
  }
  const std::string dir = argv[1], data = argv[2];
  std::string err;
  strides::ParisGpData pd;
  CHECK(strides::loadParisGp(readAll(data + "/paris_gp.json"), pd, err), "paris_gp.json : %s", err.c_str());
  strides::MissionEvents ev;
  CHECK(strides::loadMissionEvents(readAll(data + "/mission_events.json"), ev, err), "mission_events.json : %s", err.c_str());
  strides::TextTable text;
  CHECK(text.parse(readAll(data + "/strings_cso.json"), err), "strings_cso.json : %s", err.c_str());
  // Données : parcours et règles lus comme le jeu.
  CHECK(pd.sprint.fences.size() == 7 && pd.gp.fences.size() == 9, "obstacles : %zu / %zu", pd.sprint.fences.size(), pd.gp.fences.size());
  CHECK(pd.sprintTa == 54 && pd.gpTa == 54 && pd.joTa == 47, "temps accordés %d %d %d", pd.sprintTa, pd.gpTa, pd.joTa);
  CHECK(pd.warm.size() == 2 && pd.prizes.size() == 10, "paddock %zu, dotation %zu", pd.warm.size(), pd.prizes.size());
  {
    // Tracés : traceCourse du cœur sur le dessin exporté = obstacles posés par le web (repère de la piste + arène).
    for (const strides::ParisCourseData* c : {&pd.sprint, &pd.gp}) {
      const strides::CourseTrace T = strides::traceCourse(c->design);
      CHECK(T.fences.size() == c->fences.size(), "%s : %zu obstacles tracés", c->id.c_str(), T.fences.size());
      for (size_t i = 0; i < T.fences.size() && i < c->fences.size(); i++) {
        CHECK(std::fabs(T.fences[i].x + pd.site.arena.x - c->fences[i].x) < 1e-6 && std::fabs(T.fences[i].z + pd.site.arena.z - c->fences[i].z) < 1e-6,
              "%s obstacle %s : tracé (%.4f ; %.4f) / web (%.4f ; %.4f)", c->id.c_str(), c->fences[i].label.c_str(), T.fences[i].x + pd.site.arena.x, T.fences[i].z + pd.site.arena.z, c->fences[i].x, c->fences[i].z);
        CHECK(T.fences[i].label == c->fences[i].label, "%s libellé %zu", c->id.c_str(), i);
      }
      CHECK(std::fabs(std::round(T.length) - c->length) < 1e-9, "%s longueur %.3f / %.0f", c->id.c_str(), T.length, c->length);
      const std::vector<double> h = c->heights(1.45);
      for (size_t i = 0; i < h.size(); i++) CHECK(std::fabs(h[i] - c->fences[i].h) < 1e-9, "%s hauteur %zu", c->id.c_str(), i);
      // Aides au sol des manches (courseAids.js:45 : PARIS_COURSES[courseId].line) : ligne du cœur = ligne du web point par
      // point (exportée au 1/10 000 de mètre), abscisse des obstacles (lineS du web) prise sur cette ligne.
      const std::vector<strides::TracePoint> L = strides::parisAidLine(pd, *c);
      CHECK(L.size() == c->line.size() && !L.empty(), "%s : ligne des aides %zu points / web %zu", c->id.c_str(), L.size(), c->line.size());
      double worst = 0;
      for (size_t i = 0; i < L.size() && i < c->line.size(); i++) worst = std::max(worst, std::max(std::fabs(L[i].x - c->line[i].first), std::fabs(L[i].z - c->line[i].second)));
      CHECK(worst <= 5e-5 + 1e-9, "%s : ligne des aides, écart maximal %.6f m au web", c->id.c_str(), worst);
      for (size_t i = 0; i < T.fences.size() && i < c->fences.size(); i++)
        CHECK(std::fabs(T.fences[i].s - c->fences[i].lineS) < 1e-6, "%s obstacle %s : lineS %.4f / web %.4f", c->id.c_str(), c->fences[i].label.c_str(), T.fences[i].s, c->fences[i].lineS);
    }
  }

  const J O = loadJson(dir + "/paris_gp.json");
  int frames = 0;
  for (const auto& [id, run] : O["runs"].o) {
    // Dossard et graine tirés par le web (run.data.bib, run.data.seed).
    const int bib = (int)run["bib"].num();
    CHECK(bib >= 100 && bib < 140, "%s : dossard %d", id.c_str(), bib);
    strides::ParisRun R(pd, ev, text, "Alex", "Comète", run["seed"].num(), bib, "off");
    std::map<int, const J*> inputs;
    for (const J& in : run["inputs"].a) inputs[(int)in["f"].num()] = &in;
    std::map<int, const J*> rows;
    for (const J& fr : run["frames"].a) rows[(int)fr["f"].num()] = &fr;
    const int last = rows.empty() ? 0 : rows.rbegin()->first;
    strides::ParisFrame F;
    F.dt = 1.0 / 30;
    F.time = 100;
    strides::CsoCadence cad;
    R.begin();
    {
      // Lancement : dialogue d'invitation de Margot (première étape), avant la première image.
      std::vector<std::string> mine, theirs;
      for (const strides::CsoCall& c : R.takeHud())
        if (c.fn == "big" || c.fn == "toast" || c.fn == "dialog") mine.push_back(callText(c));
      for (const J& c : run["begin"].a) theirs.push_back(oracleCall(c));
      CHECK(mine == theirs && !mine.empty(), "%s : lancement %s / %s", id.c_str(), mine.empty() ? "" : mine[0].c_str(), theirs.empty() ? "" : theirs[0].c_str());
    }
    int fails0 = g_fail;
    for (int f = 0; f <= last; f++) {
      std::vector<std::string> mine;
      if (inputs.count(f)) {
        const J& in = *inputs[f];
        const J& p = in["p"];
        F.hx = p[0].num(); F.hz = p[1].num(); F.heading = p[2].num(); F.fx = p[3].num(); F.fz = p[4].num();
        F.mode = p[5].s; F.inTruck = p[6].num() != 0; F.horseAboard = p[7].num() > 0;
        F.tkx = p[8].num(); F.tkz = p[9].num(); F.tkSpeed = p[10].num(); F.inParis = p[11].num() != 0; F.gameTime = p[12].num();
        if (!in["dlg"].isNull()) R.closeDialog();
        if (!in["btn"].isNull()) CHECK(R.pressButton(in["btn"].s), "%s f%d : bouton %s refusé", id.c_str(), f, in["btn"].s.c_str());
        if (!in["act"].isNull()) {
          CHECK(R.interactAvailable(F), "%s f%d : accréditation non proposée", id.c_str(), f);
          R.interact(F);
        }
        for (const J& e : in["ev"].a) {
          const std::string k = e[0].t == J::Str ? e[2].s : e[1].s;
          const strides::CsoObstacleEventKind K = k == "clear" ? strides::CsoObstacleEventKind::Clear : k == "fault" ? strides::CsoObstacleEventKind::Fault : strides::CsoObstacleEventKind::Refusal;
          if (e[0].t == J::Str) R.warmEvent(K);
          else R.obstacleEvent(K, e[2].s, (int)e[0].num(), 1, k == "fault" ? "short" : "", k == "fault" ? "Appel trop loin" : "", cad);
        }
      }
      // L'heure du soir posée par la mission est relue dans les entrées suivantes (game.save.data.gameTime).
      R.update(F, cad);
      double gt;
      if (R.takeGameTime(gt)) F.gameTime = gt;
      for (const strides::CsoCall& c : R.takeHud())
        if (c.fn == "big" || c.fn == "toast" || c.fn == "dialog") mine.push_back(callText(c));
      strides::ParisCard card;
      if (R.takeCard(card)) mine.push_back(cardText(card));
      if (!rows.count(f)) {
        CHECK(mine.empty(), "%s f%d : appels hors oracle : %s", id.c_str(), f, mine.empty() ? "" : mine[0].c_str());
        continue;
      }
      frames++;
      const J& fr = *rows[f];
      CHECK(fr["k"].s == R.kindName(), "%s f%d : étape « %s » / « %s »", id.c_str(), f, R.kindName(), fr["k"].s.c_str());
      CHECK(fr["txt"].s == R.text(), "%s f%d : objectif « %s » / « %s »", id.c_str(), f, R.text().c_str(), fr["txt"].s.c_str());
      if (!fr["cs"].isNull()) {
        const strides::CsoRun* rd = R.round();
        strides::CsoRunState st;
        // run.data.course : manche en cours ou dernière manche créée.
        if (rd) st = rd->state();
        else if (R.step() != strides::ParisRun::Step::Round) {
          // (entre deux manches : la dernière manche jouée, ou l'état neuf du Sprint avant qu'il commence)
        }
        const J& cs = fr["cs"];
        if (rd) {
          int rails = 0;
          for (const strides::CsoRunLog& l : st.log) rails += l.kind == "rail";
          const bool ok = cs[0].num() == st.faults && cs[1].num() == st.refusals && cs[2].num() == st.next && std::fabs(cs[3].num() - r4(st.t)) < 1e-9 &&
                          (cs[4].num() != 0) == st.started && (cs[5].num() != 0) == st.finished && (cs[6].num() != 0) == st.eliminated && cs[7].num() == st.timeFaults && cs[8].num() == rails;
          CHECK(ok, "%s f%d : manche %d %d %d %.4f %d %d %d %d %d / oracle %s", id.c_str(), f, st.faults, st.refusals, st.next, r4(st.t), st.started, st.finished, st.eliminated, st.timeFaults, rails, oracleCall(cs).c_str());
        }
      }
      std::vector<std::string> theirs;
      for (const J& c : fr["calls"].a) theirs.push_back(c[0].s == "card" ? oracleCard(JParser(c[1].s).parse()) : oracleCall(c));
      CHECK(mine == theirs, "%s f%d : appels\n  cœur   : %s\n  oracle : %s", id.c_str(), f, mine.empty() ? "" : [&] { std::string s; for (auto& x : mine) s += x + " ¶ "; return s; }().c_str(),
            theirs.empty() ? "" : [&] { std::string s; for (auto& x : theirs) s += x + " ¶ "; return s; }().c_str());
      if (!fr["out"].isNull()) {
        const J& o = fr["out"];
        CHECK(R.finished(), "%s f%d : mission non terminée", id.c_str(), f);
        CHECK(o["pay"].num() == R.pay() && o["xp"].num() == R.xp() && o["stars"].num() == R.stars(), "%s : issue %d € %d pts %d★ / %s € %s %s★", id.c_str(), R.pay(), R.xp(), R.stars(),
              num(o["pay"].num()).c_str(), num(o["xp"].num()).c_str(), num(o["stars"].num()).c_str());
        CHECK(o["title"].s == R.resultTitle() && o["body"].s == R.resultBody(), "%s : « %s » « %s » / « %s » « %s »", id.c_str(), R.resultTitle().c_str(), R.resultBody().c_str(), o["title"].s.c_str(), o["body"].s.c_str());
      }
      if (g_fail - fails0 > 8) break;
    }
    const J& dd = run["data"];
    CHECK(dd["sprintRank"].num() == R.sprintRank() && dd["order"].num() == R.order() && dd["barrage"].b == R.barrage() && dd["final"].num() == R.finalRank(),
          "%s : Sprint %d, ordre %d, barrage %d, place %d", id.c_str(), R.sprintRank(), R.order(), R.barrage(), R.finalRank());
    CHECK(dd["pay"].isNull() ? !R.hasPayOverride() : dd["pay"].num() == R.payOverride(), "%s : dotation %d", id.c_str(), R.payOverride());
    std::printf("%s : %d images, issue %d € %d★ « %s »\n", id.c_str(), (int)run["frames"].a.size(), R.pay(), R.stars(), R.resultTitle().c_str());
  }
  std::printf("paris : %d vérifications, %d échecs, %d images comparées\n", g_checks, g_fail, frames);
  return g_fail ? 1 : 0;
}
