// Jalon J2c (lot J2-D) : entraînement à l'abord au paddock du Pôle (StridesCore/CsoTraining) contre l'oracle relevé dans
// le jeu web réel (scripts/unreal/export-cso-training.mjs : activité cso_warmup lancée par startTraining, objectif à
// chaque pas, appels de l'interface, son notify, mode de concours, action « Terminer », carte de fin), en français et
// en anglais. Les événements d'obstacle de l'oracle sont rejoués tels quels (course, marge, cause traduite).
// Usage : strides_training_tests <dossier des oracles> <Content/Data>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <sstream>

#include "StridesCore/CsoTraining.h"
#include "StridesCore/MiniJson.h"

using namespace strides;

static int g_checks = 0, g_fail = 0;
#define CHECK(cond, ...)                                 \
  do {                                                   \
    g_checks++;                                          \
    if (!(cond)) {                                       \
      g_fail++;                                          \
      std::printf("ÉCHEC %s:%d : ", __FILE__, __LINE__); \
      std::printf(__VA_ARGS__);                          \
      std::printf("\n");                                 \
    }                                                    \
  } while (0)

static std::string readFile(const std::string& p) {
  std::ifstream f(p);
  std::stringstream ss;
  ss << f.rdbuf();
  return ss.str();
}

// Appel rendu comme dans l'oracle : « hud.fn | arg | arg » (nombres en entier).
static std::string callLine(const std::string& ns, const CsoCall& c) {
  std::string s = ns + "." + c.fn;
  for (const CsoArg& a : c.args) s += " | " + (a.isNum ? std::to_string((long long)std::llround(a.n)) : a.s);
  return s;
}
static std::string oracleLine(const J& c) {
  std::string s = c[0].s;
  for (size_t i = 1; i < c.a.size(); i++) s += " | " + (c[i].t == J::Num ? std::to_string((long long)std::llround(c[i].num())) : c[i].s);
  return s;
}

static CsoObstacleEventKind kindOf(const std::string& k) {
  return k == "clear" ? CsoObstacleEventKind::Clear : k == "fault" ? CsoObstacleEventKind::Fault : CsoObstacleEventKind::Refusal;
}

int main(int argc, char** argv) {
  if (argc < 3) {
    std::printf("usage : strides_training_tests <oracles> <Content/Data>\n");
    return 2;
  }
  const std::string ORA = argv[1], DATA = argv[2];
  const J o = JParser(readFile(ORA + "/cso_training.json")).parse();
  CHECK(o["schema"].s == "strides.oracle.cso_training/1", "schéma « %s »", o["schema"].s.c_str());
  TextTable tt;
  std::string err;
  CHECK(tt.parse(readFile(DATA + "/strings_cso.json"), err), "strings_cso.json : %s", err.c_str());
  // Paddock lu comme le jeu (cso_course_pole.json « warmup »).
  const J pole = JParser(readFile(DATA + "/cso_course_pole.json")).parse();
  const J& W = pole["warmup"];
  CHECK(W.t == J::Obj, "cso_course_pole.json : « warmup » absent");
  const CsoPaddock P{W["x"].num(), W["z"].num(), W["w"].num(), W["d"].num()};
  // Mutation (contrôle du test) : STRIDES_TRAINING_MUTATION=r → rayon du goto 13 m.
  const char* mut = std::getenv("STRIDES_TRAINING_MUTATION");
  int frames = 0, calls = 0, evs = 0;
  for (const char* lname : {"fr", "en"}) {
    const Lang lang = langFromName(lname);
    const J& L = o["langs"][lname];
    CHECK(L.t == J::Obj, "langue %s absente", lname);
    // Obstacles du paddock relevés dans le jeu (obstacles.js:199-201) : centre du paddock cohérent.
    CHECK(L["warm"].a.size() == 2, "%s : %zu obstacles du paddock", lname, L["warm"].a.size());
    if (L["warm"].a.size() == 2) {
      CHECK(L["warm"][0]["x"].num() == P.x + 2 && L["warm"][0]["z"].num() == P.z - 10 && L["warm"][0]["kind"].s == "v", "%s : vertical du paddock", lname);
      CHECK(L["warm"][1]["x"].num() == P.x - 2 && L["warm"][1]["z"].num() == P.z + 10 && L["warm"][1]["kind"].s == "o", "%s : oxer du paddock", lname);
    }
    CsoTrainingConfig cfg = csoTrainingConfig(P, tt, lang);
    if (mut && std::string(mut) == "r") cfg.gotoR = 13;
    CsoTraining T(cfg, tt);
    T.begin();
    CsoRunFrame f;
    f.x = f.focusX = 330;
    f.z = f.focusZ = -224;
    f.riding = true;
    const J& steps = o["steps"];
    const J& fr = L["frames"];
    CHECK(fr.a.size() == steps.a.size() + 1, "%s : %zu relevés pour %zu pas", lname, fr.a.size(), steps.a.size());
    auto compare = [&](const J& e) {
      frames++;
      std::vector<std::string> got;
      for (const CsoCall& c : T.takeHud()) got.push_back(callLine("hud", c));
      for (const CsoCall& c : T.takeAudio()) got.push_back(callLine("audio", c));
      std::vector<std::string> want;
      for (const J& c : e["calls"].a) {
        const std::string fn = c[0].s;
        // setObjective (affichage de l'objectif, fait par le HUD du jeu), carte de fin (CsoTrainingResult) : hors appels.
        if (fn == "hud.setObjective" || fn == "screens.missionResult") continue;
        want.push_back(oracleLine(c));
      }
      // Le cœur émet aussi hud.closeDialog (run.cleanup), que l'oracle ne relève pas (méthode non espionnée).
      std::vector<std::string> g2;
      for (const std::string& s : got)
        if (s != "hud.closeDialog") g2.push_back(s);
      // Ordre : big, notify, clearHint (missions.start) : le son est rendu à part par le cœur ; comparaison sans ordre
      // entre interface et son, dans l'ordre pour chaque canal.
      auto only = [](const std::vector<std::string>& v, const char* p) {
        std::vector<std::string> r;
        for (const std::string& s : v)
          if (s.rfind(p, 0) == 0) r.push_back(s);
        return r;
      };
      for (const char* ch : {"hud.", "audio."}) {
        const auto a = only(g2, ch), b = only(want, ch);
        calls += (int)b.size();
        CHECK(a == b, "%s / %s : appels %s différents (%zu / %zu)%s%s", lname, e["id"].s.c_str(), ch, a.size(), b.size(),
              a.empty() ? "" : (" ; portage : " + a[0]).c_str(), b.empty() ? "" : (" ; web : " + b[0]).c_str());
      }
      const std::string wantText = e["text"].isNull() ? std::string() : e["text"].s;
      CHECK(T.text(f) == wantText, "%s / %s : objectif « %s » au lieu de « %s »", lname, e["id"].s.c_str(), T.text(f).c_str(), wantText.c_str());
      const bool wantCourse = !e["course"].isNull();
      CHECK(T.course().active == wantCourse, "%s / %s : mode de concours %d", lname, e["id"].s.c_str(), T.course().active);
      if (wantCourse) CHECK(e["course"]["kind"].s == "cso-train" && e["course"]["camera"].b && e["course"]["controls"].s == "cso" && !e["course"]["running"].b, "%s : game.course du web", lname);
      const bool wantEnd = !e["end"].isNull();
      CHECK(T.endAvailable() == wantEnd, "%s / %s : action Terminer %d", lname, e["id"].s.c_str(), T.endAvailable());
      if (wantEnd) {
        CHECK(T.endLabel() == e["end"]["label"].s, "%s : libellé « %s »", lname, T.endLabel().c_str());
        CHECK((int)e["end"]["priority"].num() == CsoTraining::kEndPriority, "%s : priorité", lname);
      }
      if (!e["training"].isNull()) {
        CHECK(T.jumps() == (int)e["training"]["jumps"].num() && T.clean() == (int)e["training"]["clean"].num(), "%s / %s : %d / %d sauts", lname, e["id"].s.c_str(), T.clean(), T.jumps());
      }
    };
    compare(fr[0]);
    bool resetSeen = false;
    for (size_t i = 0; i < steps.a.size() && i + 1 < fr.a.size(); i++) {
      const J& s = steps[i];
      if (!s["p"].isNull()) {
        f.x = f.focusX = s["p"][0].num();
        f.z = f.focusZ = s["p"][1].num();
        f.riding = !(s["foot"].t == J::Bool && s["foot"].b);
      }
      if (!s["ev"].isNull()) {
        evs++;
        const J& ev = s["ev"];
        const std::string cause = ev["cause"].isNull() ? std::string() : ev["cause"].s;
        T.obstacleEvent(kindOf(ev["kind"].s), ev["course"].s, ev["margin"].isNull() ? -0.05 : ev["margin"].num(), cause.empty() ? std::string() : tt.cause(cause, lang));
      }
      if (s["end"].t == J::Bool && s["end"].b) CHECK(T.finish(), "%s : Terminer refusé", lname);
      for (int k = 0; k < (int)s["ticks"].num(); k++) T.update(f);
      resetSeen |= T.takeResetRails();
      compare(fr[i + 1]);
    }
    CHECK(resetSeen, "%s : barres du paddock remises au début de l'entraînement", lname);
    const CsoTrainingResult R = T.takeResult();
    const J& wr = L["result"];
    CHECK(R.taken, "%s : carte de fin absente", lname);
    CHECK(R.title == wr["title"].s && R.kicker == wr["kicker"].s && R.body == wr["body"].s, "%s : carte « %s » / « %s » / « %s »", lname, R.title.c_str(), R.kicker.c_str(), R.body.c_str());
    CHECK(T.finished(), "%s : entraînement terminé", lname);
    CHECK(!T.finish(), "%s : Terminer après la fin", lname);
  }
  // Pluriel du web : « 0 saut », « 1 saut », « 2 sauts » (st.clean > 1).
  {
    CsoTraining T(csoTrainingConfig(P, tt, Lang::Fr), tt);
    T.begin();
    CsoRunFrame f;
    f.focusX = P.x;
    f.focusZ = P.z;
    T.update(f);
    T.obstacleEvent(CsoObstacleEventKind::Clear, "warmup", 0.2, "");
    CHECK(T.text(f) == "Entraînement : 1 saut sans faute sur 1", "singulier : %s", T.text(f).c_str());
    T.obstacleEvent(CsoObstacleEventKind::Refusal, "cso", 0, "");
    CHECK(T.jumps() == 1, "refus du parcours ignoré");
  }
  CHECK(tt.missing().empty(), "textes absents de strings_cso.json (%zu)", tt.missing().size());
  std::printf("entraînement : %d relevés, %d appels, %d événements ; %d vérifications, %d échecs\n", frames, calls, evs, g_checks, g_fail);
  return g_fail ? 1 : 0;
}
