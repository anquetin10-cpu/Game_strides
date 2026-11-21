#include "StridesCore/Text.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <stdexcept>
#include "StridesCore/MiniJson.h"

namespace strides {

const char* langName(Lang l) { return l == Lang::En ? "en" : "fr"; }
Lang langFromName(const std::string& s) { return s == "en" ? Lang::En : Lang::Fr; }

std::string jsToFixed(double x, int k) {
  if (std::isnan(x)) return "NaN";
  if (std::isinf(x)) return x < 0 ? "-Infinity" : "Infinity";
  if (k < 0) k = 0;
  std::string sign;
  if (x < 0) {  // −0 n'est pas < 0 : pas de signe (spécification de toFixed)
    sign = "-";
    x = -x;
  }
  if (x >= 1e21) {  // toFixed rend alors String(x)
    char b[40];
    std::snprintf(b, sizeof b, "%.17g", x);
    return sign + b;
  }
  // Développement décimal exact du double (au plus 1 074 chiffres après la virgule), puis arrondi « au plus proche,
  // égalité vers le haut » au k-ième chiffre : c'est le n de toFixed (« si deux n conviennent, le plus grand »).
  static thread_local char buf[1400];
  std::snprintf(buf, sizeof buf, "%.1100f", x);
  const std::string s = buf;
  const size_t dot = s.find('.');
  std::string ip = s.substr(0, dot), fp = s.substr(dot + 1);
  std::string digits = ip + fp.substr(0, (size_t)k);
  if (fp.size() > (size_t)k && fp[(size_t)k] >= '5') {
    int i = (int)digits.size() - 1;
    while (i >= 0 && digits[(size_t)i] == '9') digits[(size_t)i--] = '0';
    if (i < 0) {
      digits.insert(digits.begin(), '1');
      ip.insert(ip.begin(), '1');  // un chiffre de plus à la partie entière
    } else digits[(size_t)i]++;
  }
  const size_t ni = digits.size() - (size_t)k;
  std::string out = digits.substr(0, ni);
  if (k > 0) out += "." + digits.substr(ni);
  return sign + out;
}

std::string jsInt(long long n) { return std::to_string(n); }

std::string jsNumber(double x) {
  if (std::isnan(x)) return "NaN";
  if (std::isinf(x)) return x < 0 ? "-Infinity" : "Infinity";
  if (x == 0) return "0";
  std::string sign;
  if (x < 0) {
    sign = "-";
    x = -x;
  }
  // Plus petit nombre de chiffres significatifs k qui redonne x (Number::toString, étape 5) : écriture correctement
  // arrondie à k chiffres (la plus proche de x), k croissant.
  char b[64];
  for (int p = 1; p <= 17; p++) {
    std::snprintf(b, sizeof b, "%.*e", p - 1, x);
    if (std::strtod(b, nullptr) == x) break;
  }
  const std::string m = b;
  const size_t e = m.find('e');
  const int exp10 = std::atoi(m.c_str() + e + 1);
  std::string digits;
  for (size_t i = 0; i < e; i++)
    if (m[i] != '.') digits += m[i];
  while (digits.size() > 1 && digits.back() == '0') digits.pop_back();
  const int k = (int)digits.size(), n = exp10 + 1;  // x = 0,d1…dk × 10^n
  std::string out;
  if (k <= n && n <= 21) out = digits + std::string((size_t)(n - k), '0');
  else if (0 < n && n <= 21) out = digits.substr(0, (size_t)n) + "." + digits.substr((size_t)n);
  else if (-6 < n && n <= 0) out = "0." + std::string((size_t)-n, '0') + digits;
  else {
    out = digits.substr(0, 1);
    if (k > 1) out += "." + digits.substr(1);
    out += (n - 1 >= 0 ? "e+" : "e-") + std::to_string(std::abs(n - 1));
  }
  return sign + out;
}

// Casse : ASCII, Latin-1 (U+00C0–U+00DE ↔ U+00E0–U+00FE hors × et ÷ ; UTF-8 C3 80–9E ↔ C3 A0–BE), ÿ (C3 BF) ↔ Ÿ (C5 B8),
// œ (C5 93) ↔ Œ (C5 92).
std::string jsUpper(const std::string& s) {
  std::string o;
  o.reserve(s.size());
  for (size_t i = 0; i < s.size(); i++) {
    const unsigned char c = (unsigned char)s[i];
    if (c >= 'a' && c <= 'z') o += (char)(c - 32);
    else if (c == 0xC3 && i + 1 < s.size()) {
      const unsigned char d = (unsigned char)s[++i];
      if (d == 0xBF) o += "\xC5\xB8";
      else if (d >= 0xA0 && d <= 0xBE && d != 0xB7) { o += (char)0xC3; o += (char)(d - 0x20); }
      else { o += (char)c; o += (char)d; }
    } else if (c == 0xC5 && i + 1 < s.size() && (unsigned char)s[i + 1] == 0x93) {
      o += "\xC5\x92";
      i++;
    } else o += (char)c;
  }
  return o;
}

std::string jsLower(const std::string& s) {
  std::string o;
  o.reserve(s.size());
  for (size_t i = 0; i < s.size(); i++) {
    const unsigned char c = (unsigned char)s[i];
    if (c >= 'A' && c <= 'Z') o += (char)(c + 32);
    else if (c == 0xC3 && i + 1 < s.size()) {
      const unsigned char d = (unsigned char)s[++i];
      if (d >= 0x80 && d <= 0x9E && d != 0x97) { o += (char)0xC3; o += (char)(d + 0x20); }
      else { o += (char)c; o += (char)d; }
    } else if (c == 0xC5 && i + 1 < s.size() && ((unsigned char)s[i + 1] == 0x92 || (unsigned char)s[i + 1] == 0xB8)) {
      o += (unsigned char)s[i + 1] == 0x92 ? "\xC5\x93" : "\xC3\xBF";
      i++;
    } else o += (char)c;
  }
  return o;
}

std::string dec(double n, int k, Lang lang) {
  std::string s = jsToFixed(n, k);
  if (lang == Lang::Fr) {
    const size_t p = s.find('.');
    if (p != std::string::npos) s[p] = ',';
  }
  return s;
}

std::string enOrdinal(long long n) {
  static const char* S[] = {"th", "st", "nd", "rd"};
  const long long v = n % 100;
  const long long a = (v - 20) % 10;  // reste du JS : du signe du dividende
  const char* suf = a >= 0 && a < 4 ? S[a] : v >= 0 && v < 4 ? S[v] : S[0];
  return std::to_string(n) + suf;
}
std::string ordinal(long long n, Lang lang) { return lang == Lang::Fr ? (n == 1 ? std::string("1re") : std::to_string(n) + "e") : enOrdinal(n); }
std::string nth(long long n, Lang lang) { return lang == Lang::Fr ? std::to_string(n) + "e" : enOrdinal(n); }

std::string fillTemplate(const std::string& s, const std::vector<std::string>& vals) {
  if (vals.empty()) return s;
  std::string out;
  size_t i = 0;
  while (i < s.size()) {
    if (s[i] == '{') {
      size_t j = i + 1;
      while (j < s.size() && s[j] >= '0' && s[j] <= '9') j++;
      if (j > i + 1 && j < s.size() && s[j] == '}') {
        const size_t idx = (size_t)std::stoul(s.substr(i + 1, j - i - 1));
        if (idx < vals.size()) {
          out += vals[idx];
          i = j + 1;
          continue;
        }
      }
    }
    out += s[i++];
  }
  return out;
}

bool TextTable::parse(const std::string& text, std::string& err) {
  try {
    load(JParser(text).parse());
    return true;
  } catch (const std::exception& e) {
    err = e.what();
    return false;
  }
}

void TextTable::load(const J& o) {
  if (o["schema"].s != "strides.strings_cso/1") throw std::runtime_error("strings_cso : schéma inattendu « " + o["schema"].s + " »");
  en_.clear();
  causes_.clear();
  for (const auto& [k, v] : o["strings"].o) en_[k] = v.s;
  for (const auto& [k, v] : o["causes"].o) causes_[k] = v.s;
  if (en_.empty()) throw std::runtime_error("strings_cso : table vide");
}

std::string TextTable::t(const std::string& key, Lang lang) const {
  if (key.empty()) return key;
  const auto it = en_.find(key);
  if (it == en_.end()) {
    missing_.insert(key);
    return key;
  }
  return lang == Lang::En ? it->second : key;
}

std::string TextTable::T(const std::string& key, const std::vector<std::string>& vals, Lang lang) const { return fillTemplate(t(key, lang), vals); }

std::string TextTable::cause(const std::string& id, Lang lang) const {
  const auto it = causes_.find(id);
  return it == causes_.end() ? std::string() : t(it->second, lang);
}

std::string ptsText(long long n, Lang lang, const TextTable& tt) {
  return n > 1 || (n == 0 && lang != Lang::Fr) ? tt.T("{0} pts", {jsInt(n)}, lang) : tt.T("{0} pt", {jsInt(n)}, lang);
}

}  // namespace strides
