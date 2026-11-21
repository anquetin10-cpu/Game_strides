// Lecteur JSON minimal du cœur Strides (oracles des tests, sauvegarde native).
// Utilisé aussi par la sauvegarde native (SaveGame) : format texte stable, sans dépendance à Unreal.
#pragma once
#include <cctype>
#include <cstdlib>
#include <fstream>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

struct J {
  enum T { Null, Bool, Num, Str, Arr, Obj } t = Null;
  bool b = false;
  double n = 0;
  std::string s;
  std::vector<J> a;
  std::map<std::string, J> o;
  const J& operator[](const std::string& k) const {
    static J null;
    auto it = o.find(k);
    return it == o.end() ? null : it->second;
  }
  const J& operator[](size_t i) const { return a.at(i); }
  bool isNull() const { return t == Null; }
  double num() const { if (t != Num) throw std::runtime_error("nombre attendu"); return n; }
};

class JParser {
 public:
  explicit JParser(const std::string& s) : s_(s) {}
  J parse() { J v = value(); ws(); return v; }
 private:
  const std::string& s_;
  size_t i_ = 0;
  void ws() { while (i_ < s_.size() && std::isspace((unsigned char)s_[i_])) i_++; }
  J value() {
    ws();
    J v;
    char c = s_.at(i_);
    if (c == '{') {
      v.t = J::Obj; i_++; ws();
      if (s_[i_] == '}') { i_++; return v; }
      for (;;) { ws(); std::string k = str(); ws(); i_++; v.o[k] = value(); ws(); if (s_[i_++] == '}') break; }
    } else if (c == '[') {
      v.t = J::Arr; i_++; ws();
      if (s_[i_] == ']') { i_++; return v; }
      for (;;) { v.a.push_back(value()); ws(); if (s_[i_++] == ']') break; }
    } else if (c == '"') { v.t = J::Str; v.s = str(); }
    else if (s_.compare(i_, 4, "true") == 0) { v.t = J::Bool; v.b = true; i_ += 4; }
    else if (s_.compare(i_, 5, "false") == 0) { v.t = J::Bool; i_ += 5; }
    else if (s_.compare(i_, 4, "null") == 0) { i_ += 4; }
    else { v.t = J::Num; char* e; v.n = std::strtod(s_.c_str() + i_, &e); i_ = e - s_.c_str(); }
    return v;
  }
  std::string str() {
    std::string out;
    i_++;  // "
    while (s_[i_] != '"') {
      if (s_[i_] == '\\') {
        i_++;
        char e = s_[i_];
        if (e == 'u') { unsigned cp = std::stoul(s_.substr(i_ + 1, 4), nullptr, 16); i_ += 4;
          if (cp < 0x80) out += (char)cp; else if (cp < 0x800) { out += (char)(0xC0 | (cp >> 6)); out += (char)(0x80 | (cp & 0x3F)); }
          else { out += (char)(0xE0 | (cp >> 12)); out += (char)(0x80 | ((cp >> 6) & 0x3F)); out += (char)(0x80 | (cp & 0x3F)); } }
        else out += e == 'n' ? '\n' : e == 't' ? '\t' : e;
      } else out += s_[i_];
      i_++;
    }
    i_++;
    return out;
  }
};

inline J loadJson(const std::string& path) {
  std::ifstream f(path);
  if (!f) throw std::runtime_error("fichier introuvable : " + path);
  std::stringstream ss;
  ss << f.rdbuf();
  std::string s = ss.str();
  return JParser(s).parse();
}
