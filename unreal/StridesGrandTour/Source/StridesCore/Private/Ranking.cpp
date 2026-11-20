// Classement simulé et bilan d'une manche de CSO (voir Ranking.h). Une opération flottante par instruction : pas de
// contraction en FMA (-ffp-contract=on par défaut), les chronos tirés sont arrondis au centième comme dans le web.
#include "StridesCore/Ranking.h"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include "StridesCore/CsoHud.h"
#include "StridesCore/MiniJson.h"

namespace strides {

uint32_t jsToUint32(double x) {
  if (!std::isfinite(x)) return 0;
  const double t = std::trunc(x);
  double m = std::fmod(t, 4294967296.0);
  if (m < 0) m += 4294967296.0;
  return (uint32_t)m;
}

double Mulberry32::next() {
  // a = (a + 0x6d2b79f5) | 0 ; t = imul(a ^ a >>> 15, 1 | a) ; t = (t + imul(t ^ t >>> 7, 61 | t)) ^ t ;
  // ((t ^ t >>> 14) >>> 0) / 2^32 — arithmétique modulo 2^32 (Math.imul, ToInt32).
  a_ = a_ + 0x6d2b79f5u;
  uint32_t t = (a_ ^ (a_ >> 15)) * (1u | a_);
  t = (t + (t ^ (t >> 7)) * (61u | t)) ^ t;
  return (double)(t ^ (t >> 14)) / 4294967296.0;
}

RankNames rankNamesFromJson(const J& file) {
  RankNames n;
  auto list = [&](const char* k, std::vector<std::string>& out) {
    if (file[k].t != J::Arr || file[k].a.empty()) throw std::runtime_error(std::string("cso_ranking.json : liste « ") + k + " » absente");
    for (const J& x : file[k].a) out.push_back(x.s);
  };
  list("first", n.first);
  list("last", n.last);
  list("horses", n.horses);
  return n;
}

bool rankNamesFromFile(const std::string& text, RankNames& out, std::string& err) {
  try {
    out = rankNamesFromJson(JParser(text).parse());
    return true;
  } catch (const std::exception& e) {
    err = e.what();
    return false;
  }
}

namespace {
// Premier caractère d'un prénom (FIRST_NAMES[k][0] : première unité UTF-16 ; les prénoms commencent par une lettre du
// plan multilingue de base, rendue entière en UTF-8).
std::string firstChar(const std::string& s) {
  if (s.empty()) return std::string();
  const unsigned char c = (unsigned char)s[0];
  const size_t n = c < 0x80 ? 1 : (c >> 5) == 0x6 ? 2 : (c >> 4) == 0xE ? 3 : 4;
  if (n == 4) throw std::runtime_error("cso_ranking.json : prénom hors du plan multilingue de base");
  return s.substr(0, n);
}
size_t pick(Mulberry32& rnd, size_t len) {
  const double r = rnd.next();
  const double x = r * (double)len;
  return (size_t)std::floor(x);
}
}  // namespace

std::vector<RankEntry> simulateField(const RankClass& cls, double seed, int n, const RankNames& names) {
  if (seed < 0) throw std::runtime_error("simulateField : graine négative non portée");
  Mulberry32 rnd(seed);
  std::vector<RankEntry> out;
  const double fs = std::floor(seed);
  for (int i = 0; i < n; i++) {
    const double r = rnd.next();
    int faults = r < 0.34 ? 0 : r < 0.68 ? 4 : r < 0.86 ? 8 : r < 0.95 ? 12 : 16;
    if (cls.id == "am2" && faults > 0 && rnd.next() < 0.25) faults -= 4;
    // t = cls.ta - 4 + (rnd() + rnd() + rnd() - 1.5) * 4.2 + faults * 0.15 (évaluation de gauche à droite)
    const double a = cls.ta - 4;
    const double r1 = rnd.next();
    const double r2 = rnd.next();
    double s = r1 + r2;
    const double r3 = rnd.next();
    s = s + r3;
    s = s - 1.5;
    const double e = s * 4.2;
    double t = a + e;
    const double g = faults * 0.15;
    t = t + g;
    // timeFaults = max(0, ceil(t - cls.ta - 1e-9))
    double over = t - cls.ta;
    over = over - 1e-9;
    const int timeFaults = std::max(0, (int)std::ceil(over));
    RankEntry x;
    const std::string first = firstChar(names.first[pick(rnd, names.first.size())]);
    x.rider = first + ". " + names.last[pick(rnd, names.last.size())];
    const double hi = (double)i + fs;
    x.horse = names.horses[(size_t)std::fmod(hi, (double)names.horses.size())];
    x.faults = faults + timeFaults;
    const double c = t * 100;
    x.time = jsRound(c) / 100;
    out.push_back(x);
  }
  return out;
}

std::vector<RankEntry> rankResults(const std::vector<RankEntry>& list) {
  std::vector<RankEntry> v = list;
  std::stable_sort(v.begin(), v.end(), [](const RankEntry& a, const RankEntry& b) { return a.faults != b.faults ? a.faults < b.faults : a.time < b.time; });
  return v;
}

CsoResultCard csoResultCard(const CsoResultInput& in, const RankNames& names, const TextTable& tt, Lang lang) {
  const CsoRunState& st = in.state;
  const CsoResultConfig& res = in.result;
  if (!res.prizes.empty()) throw std::runtime_error("bilan : dotation (prizes) non portée");
  auto t = [&](const char* k) { return tt.t(k, lang); };
  auto T = [&](const char* k, const std::vector<std::string>& v) { return tt.T(k, v, lang); };
  CsoResultCard c;
  c.out = st.eliminated;
  c.total = st.faults + st.timeFaults;
  // me = { rider: playerName, horse: horse()?.name || t('Cheval'), faults: total, time: Math.round(st.t * 100) / 100 }
  RankEntry me;
  me.rider = in.playerName;
  me.horse = in.hasHorse && !in.horseName.empty() ? in.horseName : t("Cheval");
  me.faults = c.total;
  const double tc = st.t * 100;
  me.time = jsRound(tc) / 100;
  me.me = true;
  // cls = { ta: timeAllowed, ...res.cls } ; simulateField(cls, (res.seed ?? 7) + st.attempt * 31, res.n ?? 14)
  RankClass cls;
  cls.id = res.clsId;
  cls.ta = res.hasClsTa ? res.clsTa : (double)in.timeAllowed;
  const double seed = (res.hasSeed ? res.seed : 7.0) + (double)st.attempt * 31;
  std::vector<RankEntry> field = simulateField(cls, seed, res.hasN ? res.n : 14, names);
  if (!c.out) field.push_back(me);
  c.ranked = rankResults(field);
  c.fieldSize = (int)c.ranked.size();
  int meAt = -1;
  for (size_t i = 0; i < c.ranked.size(); i++)
    if (c.ranked[i].me) meAt = (int)i;
  c.rank = c.out ? 0 : meAt + 1;
  const std::string reward = c.out ? t("aucune (éliminé)") : t("hors dotation");  // prizes vides : !prizes[rank - 1]
  // faultsTxt : journal sans les sans-faute (refus au X, barre au X (cause en minuscules))
  std::vector<std::string> faultsTxt;
  for (const CsoRunLog& l : st.log) {
    if (l.kind == "clear") continue;
    if (l.kind == "refusal") faultsTxt.push_back(T("refus au {0}", {l.label}));
    else faultsTxt.push_back(T("barre au {0}{1}", {l.label, l.causeText.empty() ? std::string() : " (" + jsLower(l.causeText) + ")"}));
  }
  std::string joined;
  for (size_t i = 0; i < faultsTxt.size(); i++) joined += (i ? ", " : "") + faultsTxt[i];
  // Tableau : 8 premiers, plus le joueur s'il est au-delà.
  std::vector<size_t> rows;
  for (size_t i = 0; i < c.ranked.size() && i < 8; i++) rows.push_back(i);
  if (c.rank && meAt >= 8) rows.push_back((size_t)meAt);
  for (size_t i : rows) {
    const RankEntry& x = c.ranked[i];
    CsoResultRow r;
    r.rank = (int)i + 1;
    r.name = x.rider + " · " + x.horse;
    r.pts = ptsText(x.faults, lang, tt);
    r.time = dec(x.time, 2, lang) + " s";
    r.me = x.me;
    c.table.push_back(r);
  }
  c.rows = {
      {t("Chrono"), c.out ? std::string("—") : T("{0} s (accordé {1} s)", {dec(st.t, 2, lang), jsInt(in.timeAllowed)})},
      {t("Fautes aux obstacles"), faultsTxt.empty() ? t("0 · aucune") : T("{0} pts : {1}", {jsInt(st.faults), joined})},
      {t("Pénalités de temps"), c.out ? std::string("—") : ptsText(st.timeFaults, lang, tt)},
      {t("Total"), c.out ? t("Éliminé") : ptsText(c.total, lang, tt)},
      {t("Classement"), c.out ? T("éliminé · {0}", {st.eliminatedReason}) : T("{0} sur {1}", {ordinal(c.rank, lang), jsInt(c.fieldSize)})},
      {t("Récompense"), reward},
  };
  const std::string title = res.title.empty() ? tt.t(in.courseTitle, lang) : tt.t(res.title, lang);
  c.kicker = T("Résultats · {0}{1}", {title, st.attempt > 1 ? T(" · manche {0}", {jsInt(st.attempt)}) : std::string()});
  c.title = c.out ? t("Éliminé")
            : c.rank == 1 ? (c.total == 0 ? t("Victoire, sans faute !") : t("Victoire !"))
            : c.total == 0 ? T("Sans faute · {0}", {ordinal(c.rank, lang)})
                           : T("{0} place", {ordinal(c.rank, lang)});
  c.buttons = {{"cso-retry", t("Recommencer"), false},
               {"cso-train", t("S’entraîner"), false},
               {"cso-done", res.continueLabel.empty() ? t("Continuer") : tt.t(res.continueLabel, lang), true}};
  return c;
}

CsoResultInput csoResultInputOf(const CsoRun& run) {
  const CsoRunConfig& cfg = run.config();
  CsoResultInput in;
  in.state = run.state();
  in.playerName = cfg.playerName;
  in.hasHorse = !cfg.horseName.empty();
  in.horseName = cfg.horseName;
  in.timeAllowed = cfg.timeAllowed;
  in.courseTitle = cfg.courseTitle;
  in.result = cfg.resultCfg;
  return in;
}

}  // namespace strides
