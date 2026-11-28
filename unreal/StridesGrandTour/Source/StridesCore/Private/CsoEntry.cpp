#include "StridesCore/CsoEntry.h"

#include <cmath>
#include <limits>
#include <stdexcept>
#include "StridesCore/CoursePlan.h"
#include "StridesCore/MathUtil.h"
#include "StridesCore/MiniJson.h"

namespace strides {

// ---- Activité et poteau ----

CsoActivity csoActivityFromJson(const J& file) {
  const J& a = file["activity"];
  if (a.t != J::Obj) throw std::runtime_error("cso_activity.json : objet « activity » absent (export-cso-entry.mjs, tranche T10)");
  CsoActivity o;
  o.id = a["id"].s;
  o.name = a["name"].s;
  o.title = a["title"].s;
  o.className = a["className"].s;
  o.desc = a["desc"].s;
  o.kind = a["kind"].s;
  o.category = a["category"].s;
  o.vertical = a["vertical"].s;
  o.verticalLabel = a["verticalLabel"].s;
  o.startX = a["start"]["x"].num();
  o.startZ = a["start"]["z"].num();
  o.markerX = a["marker"]["x"].num();
  o.markerZ = a["marker"]["z"].num();
  const J& it = file["interact"];
  if (it.t != J::Obj) throw std::runtime_error("cso_activity.json : objet « interact » absent");
  o.r = it["r"].num();
  o.priority = (int)it["priority"].num();
  for (const J& m : it["modes"].a) o.modes.push_back(m.s);
  o.label = it["label"].s;
  o.icon = it["icon"].s;
  // Le centre de l'action est celui de l'activité (interact.add : x, z = a.start).
  if (it["x"].num() != o.startX || it["z"].num() != o.startZ) throw std::runtime_error("cso_activity.json : action hors du départ de l'activité");
  o.launchMs = (int)file["launch"]["ms"].num();
  o.appTitle = file["presentation"]["appTitle"].s;
  o.place = file["presentation"]["place"].s;
  // Tranche T11 : bilan (opts.result) et enregistrement du meilleur temps.
  const J& res = file["result"];
  if (res.t != J::Obj || res["cls"].t != J::Obj) throw std::runtime_error("cso_activity.json : objet « result » absent (export-cso-entry.mjs, tranche T11)");
  o.result.clsId = res["cls"]["id"].s;
  o.result.clsName = res["cls"]["name"].s;
  if (res["cls"]["ta"].t == J::Num) { o.result.hasClsTa = true; o.result.clsTa = res["cls"]["ta"].n; }
  for (const J& p : res["cls"]["prizes"].a) o.result.prizes.push_back(p.num());
  if (res["seed"].t == J::Num) { o.result.hasSeed = true; o.result.seed = res["seed"].n; }
  if (res["n"].t == J::Num) { o.result.hasN = true; o.result.n = (int)res["n"].n; }
  o.result.title = res["title"].s;
  o.result.continueLabel = res["continueLabel"].s;
  o.penalties = file["record"]["penalties"].b;
  o.noRecord = file["record"]["noRecord"].b;
  return o;
}

bool csoActivityFromFile(const std::string& text, CsoActivity& out, std::string& err) {
  try {
    out = csoActivityFromJson(JParser(text).parse());
    return true;
  } catch (const std::exception& e) {
    err = e.what();
    return false;
  }
}

bool csoActivityAvailable(const CsoActivity& a, double focusX, double focusZ, const std::string& mode, bool missionActive) {
  bool modeOk = false;
  for (const std::string& m : a.modes) modeOk = modeOk || m == mode;
  if (!modeOk) return false;
  if (jsHypot(a.startX - focusX, a.startZ - focusZ) > a.r) return false;
  return !missionActive;  // when: () => !g.missions.active
}

CsoCall csoActivityLaunchBig(const CsoActivity& a, const TextTable& tt, Lang lang) {
  CsoCall c;
  c.fn = "big";
  CsoArg t, s, d;
  t.s = jsUpper(tt.t(a.name, lang));  // offer.title.toUpperCase() (offer.title = a.name)
  s.s = tt.t(a.verticalLabel, lang) + " · " + tt.t(a.category, lang);
  d.isNum = true;
  d.n = a.launchMs;
  c.args = {t, s, d};
  return c;
}

// ---- Présentation et plan ----

bool csoClassHeight(const CsoPresentationInput& in, double& out) {
  if (in.hasHeight) {
    out = in.height;
    return true;
  }
  if (!in.hasHeights || in.heights.empty()) return false;
  // [...heights].sort((a, b) => effectif(b) − effectif(a))[0] : tri stable, le premier des plus fréquents.
  size_t best = 0;
  long bestN = -1;
  for (size_t i = 0; i < in.heights.size(); i++) {
    long n = 0;
    for (double x : in.heights) n += x == in.heights[i];
    if (n > bestN) {
      bestN = n;
      best = i;
    }
  }
  out = in.heights[best];
  return true;
}

const char* csoDifficultyKey(double h) { return h < 1.08 ? "Facile" : h < 1.18 ? "Moyenne" : h < 1.35 ? "Difficile" : "Très difficile"; }

std::string csoParcoursText(const std::vector<std::string>& labels, double length, const TextTable& tt, Lang lang) {
  std::vector<std::string> firsts;  // /A$/
  for (const std::string& l : labels)
    if (!l.empty() && l.back() == 'A') firsts.push_back(l);
  const long n = (long)labels.size() - (long)firsts.size();
  auto toB = [](std::string l) {
    l.back() = 'B';
    return l;
  };
  std::string dbl;
  if (firsts.size() > 1) {
    std::string pairs;
    for (const std::string& a : firsts) pairs += (pairs.empty() ? "" : ", ") + a + " – " + toB(a);
    dbl = tt.T(" dont {0} doubles ({1})", {jsInt((long long)firsts.size()), pairs}, lang);
  } else if (!firsts.empty()) dbl = tt.T(" dont un double ({0} – {1})", {firsts[0], toB(firsts[0])}, lang);
  return tt.T("{0} obstacles{1} · {2} m", {jsInt(n), dbl, jsNumber(length)}, lang);
}

namespace {
std::string titleOf(const CsoPresentationInput& in, const TextTable& tt, Lang lang) {
  return in.title.empty() ? tt.t("Parcours du Pôle International", lang) : tt.t(in.title, lang);
}
}  // namespace

CsoPresentation csoPresentation(const CsoPresentationInput& in, const TextTable& tt, Lang lang) {
  CsoPresentation p;
  p.kicker = in.appTitle + " · " + (in.place.empty() ? in.defaultPlace : in.place);
  p.title = titleOf(in, tt, lang);
  const std::string table = in.table.empty() ? tt.t("barème A au chrono", lang) : tt.t(in.table, lang);
  p.rows.push_back({tt.t("Épreuve", lang), (in.className.empty() ? std::string() : tt.t(in.className, lang) + " · ") + table});
  double classH = 0;
  const bool hasH = csoClassHeight(in, classH) && classH != 0 && !std::isnan(classH);  // classH ? … : '—'
  p.rows.push_back({tt.t("Hauteur", lang), hasH ? tt.T("{0} m · difficulté {1}", {dec(classH, 2, lang), jsLower(tt.t(csoDifficultyKey(classH), lang))}, lang) : "—"});
  p.rows.push_back({tt.t("Cheval engagé", lang), in.hasHorse ? in.horseName : "—"});
  p.rows.push_back({tt.t("Temps accordé", lang), jsInt(in.timeAllowed) + " s"});
  p.rows.push_back({tt.t("Parcours", lang), csoParcoursText(in.labels, in.length, tt, lang)});
  for (const std::string& l : in.intro) p.jury += (p.jury.empty() ? "" : " ") + l;
  p.rules = in.rulesText.empty() ? tt.t("Barre ou premier refus : 4 points · deuxième refus : élimination · 1 point par seconde entamée au-delà du temps accordé.", lang) : tt.t(in.rulesText, lang);
  p.planLabel = tt.t("Voir le plan", lang);
  p.enterLabel = tt.t("Entrer en piste", lang);
  return p;
}

CsoPlanCard csoPlanCard(const CsoPresentationInput& in, const CourseTrace& trace, const TextTable& tt, Lang lang) {
  CsoPlanCard c;
  c.kicker = tt.t("Plan du parcours", lang);
  c.title = titleOf(in, tt, lang);
  c.legend = coursePlanLegend(trace, tt, lang) + " · " + jsNumber(in.length) + " m · " + tt.T("temps accordé {0} s", {jsInt(in.timeAllowed)}, lang);
  c.backLabel = tt.t("Retour", lang);
  return c;
}

// ---- Capacité ----

CsoCapacity csoCapacity(const CsoCapacityInput& in, const TextTable& tt, Lang lang, const JumpParams& P) {
  CsoCapacity c;
  if (!in.hasHeights) return c;  // maxH = null : pas d'étape
  double maxH = -std::numeric_limits<double>::infinity();  // Math.max(...[]) = −Infinity
  for (double h : in.heights) maxH = std::isnan(h) || std::isnan(maxH) ? std::nan("") : std::max(maxH, h);
  c.maxH = maxH;
  c.step = maxH != 0 && !std::isnan(maxH);  // if (maxH)
  if (!c.step) return c;
  c.reach = in.hasHorse ? in.power + 0.2 + in.clearance : 99;
  if (!in.hasHorse || !in.cso) c.hopeless = c.reach < maxH + 0.04;
  else {
    c.hopeless = false;
    for (size_t i = 0; i < in.fences.size() && !c.hopeless; i++) {
      const CsoCapFence& o = in.fences[i];
      const double hh = i < in.heights.size() ? in.heights[i] : o.h;  // heights[i] ?? o.h
      Fence f;
      f.kind = o.kind;
      if (o.kind == "o") f.bars = {{-o.spread / 2, hh - 0.05}, {o.spread / 2, hh}};
      else f.bars = {{0, hh}};
      bool passes = false;
      for (double v : {6.2, 7.0, 7.8}) {
        for (double d = 0.6; d < 5 && !passes; d += 0.1) {
          JumpHorse h;
          h.v = v;
          h.power = in.power;
          h.clearance = in.clearance;
          h.cso = true;
          const FenceGeo g = railsAhead(f, 0, -d, 0, 1);
          const JumpPlan p = planJump(h, &g, P);
          if (p.zone != Zone::Refuse && p.margin >= -P.rub) passes = true;
        }
        if (passes) break;
      }
      c.hopeless = !passes;
    }
  }
  if (c.hopeless) {
    c.who = tt.t("Entraîneur", lang);
    c.initials = "EN";
    c.text = tt.T("Obstacles jusqu’à {0} m : avec {1} et cet équipement, tu plafonnes vers {2} m. Il faudra un cheval plus puissant ou une selle adaptée (Sellerie du Port, « Mes chevaux »), sinon les barres tomberont.",
                  {dec(maxH, 2, lang), in.horseName, dec(c.reach, 2, lang)}, lang);
  }
  return c;
}

}  // namespace strides
