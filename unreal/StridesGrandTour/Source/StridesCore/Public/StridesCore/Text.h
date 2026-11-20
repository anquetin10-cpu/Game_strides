// Textes et formats du jeu web, portés pour l'épreuve de CSO (tranche T4) : t / T de src/core/i18n.js (clé = texte
// français exact, gabarits {0}, {1}…), dec de src/core/math.js (Number.prototype.toFixed, virgule en français),
// ordinaux et pluriels de src/gameplay/courses.js (ordinal, enOrdinal, nth, ptsText).
// Table des traductions : Content/Data/strings_cso.json (scripts/unreal/export-data.mjs, clés extraites du code, anglais
// donné par i18n.js) ; oracle : unreal/core/tests/oracles/cso_text.json.
#pragma once
#include <map>
#include <set>
#include <string>
#include <vector>
#include "StridesCore/Api.h"

struct J;  // StridesCore/MiniJson.h

namespace strides {

enum class Lang { Fr, En };
STRIDESCORE_API const char* langName(Lang l);
STRIDESCORE_API Lang langFromName(const std::string& s);  // « en » → anglais, sinon français (i18n.js : langue par défaut)

// Number.prototype.toFixed(k) : arrondi de la valeur décimale exacte du double, égalité vers la plus grande valeur
// absolue ; signe « - » seulement si x < 0 (−0 donne « 0 »).
STRIDESCORE_API std::string jsToFixed(double x, int k);
// String(n) d'un nombre entier (gabarits ${n}).
STRIDESCORE_API std::string jsInt(long long n);
// String(x) d'un nombre quelconque (Number::toString de l'ECMAScript, tranche T10 : gabarits ${x} du plan du parcours) :
// plus courte écriture décimale qui redonne le même double, notation exponentielle hors de [1e-6, 1e21[ ; NaN,
// Infinity, -Infinity ; −0 donne « 0 ». Oracle : cas « str » de cso_text.json.
STRIDESCORE_API std::string jsNumber(double x);
// String.prototype.toUpperCase / toLowerCase (UTF-8) sur l'ASCII, le bloc Latin-1 (à … þ, À … Þ, hors × et ÷ ; ÿ ↔ Ÿ) et
// œ ↔ Œ : suffisant pour les textes de l'épreuve (oracle : cas « upper » / « lower » de cso_text.json, toutes les
// clés) ; ß et les autres écritures ne sont pas portés (laissés tels quels).
STRIDESCORE_API std::string jsUpper(const std::string& s);
STRIDESCORE_API std::string jsLower(const std::string& s);
// math.js dec(n, k) : toFixed, virgule décimale en français.
STRIDESCORE_API std::string dec(double n, int k, Lang lang);
// courses.js : enOrdinal (1st, 2nd, 3rd, 4th, 11th, 21st…), ordinal (« 1re », « 2e » / anglais), nth (« 2e » / « 2nd »).
STRIDESCORE_API std::string enOrdinal(long long n);
STRIDESCORE_API std::string ordinal(long long n, Lang lang);
STRIDESCORE_API std::string nth(long long n, Lang lang);
// Valeurs d'un gabarit, remplacées dans l'ordre de {0}, {1}… (i18n.js fill : une marque sans valeur reste telle quelle).
STRIDESCORE_API std::string fillTemplate(const std::string& s, const std::vector<std::string>& vals);

class STRIDESCORE_API TextTable {
 public:
  // Fichier strings_cso.json (texte) : faux et message si illisible.
  bool parse(const std::string& jsonText, std::string& err);
  void load(const J& file);
  // t('…') et T`…` : en français la clé elle-même ; en anglais la traduction de la table (une clé absente de la table
  // est rendue telle quelle, comme i18n.js, et notée dans missing()).
  std::string t(const std::string& key, Lang lang) const;
  std::string T(const std::string& key, const std::vector<std::string>& vals, Lang lang) const;
  bool has(const std::string& key) const { return en_.count(key) > 0; }
  size_t size() const { return en_.size(); }
  // Texte d'une cause de faute (jumpModel.js CAUSES[id], traduit) ; vide si inconnue.
  std::string cause(const std::string& id, Lang lang) const;
  const std::set<std::string>& missing() const { return missing_; }

 private:
  std::map<std::string, std::string> en_, causes_;
  mutable std::set<std::string> missing_;
};

// courses.js ptsText : « 0 pt », « 1 pt », « 4 pts » (anglais : « 0 faults », « 1 fault »…).
STRIDESCORE_API std::string ptsText(long long n, Lang lang, const TextTable& tt);

}  // namespace strides
