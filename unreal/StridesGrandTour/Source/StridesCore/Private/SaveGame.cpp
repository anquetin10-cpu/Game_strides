// Sauvegarde native (voir SaveGame.h).
#include "StridesCore/SaveGame.h"
#include "StridesCore/MiniJson.h"

#include <cstdio>
#include <sstream>

namespace strides {

static std::string esc(const std::string& s) {
  std::string o = "\"";
  for (unsigned char c : s) {
    if (c == '"' || c == '\\') { o += '\\'; o += (char)c; }
    else if (c == '\n') o += "\\n";
    else if (c < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); o += b; }
    else o += (char)c;
  }
  return o + "\"";
}
static std::string num(double v) { char b[32]; std::snprintf(b, sizeof b, "%.17g", v); return b; }

std::string SaveGame::toJson() const {
  std::ostringstream o;
  o << "{\"schema\":\"strides.save\",\"version\":" << version << ",\"playerName\":" << esc(playerName) << ",\"avatar\":" << esc(avatar)
    << ",\"lang\":" << esc(lang) << ",\"money\":" << money << ",\"reputation\":" << reputation << ",\"gameTime\":" << num(gameTime)
    << ",\"activeHorse\":" << esc(activeHorse) << ",\"skills\":{";
  bool first = true;
  for (auto& [k, v] : skills) { o << (first ? "" : ",") << esc(k) << ":" << num(v); first = false; }
  o << "},\"horses\":[";
  for (size_t i = 0; i < horses.size(); i++) o << (i ? "," : "") << esc(horses[i]);
  o << "],\"records\":{";
  first = true;
  for (auto& [k, r] : records) {
    o << (first ? "" : ",") << esc(k) << ":{\"eliminated\":" << (r.eliminated ? "true" : "false") << ",\"penalties\":" << r.penalties << ",\"time\":" << num(r.time) << "}";
    first = false;
  }
  o << "},\"bestTimes\":{";
  first = true;
  for (auto& [k, v] : bestTimes) { o << (first ? "" : ",") << esc(k) << ":" << num(v); first = false; }
  o << "},\"settings\":{";
  first = true;
  for (auto& [k, v] : settings) { o << (first ? "" : ",") << esc(k) << ":" << esc(v); first = false; }
  o << "},\"pose\":";
  if (pose.valid) {
    o << "{\"mode\":" << esc(pose.mode) << ",\"x\":" << num(pose.x) << ",\"y\":" << num(pose.y) << ",\"z\":" << num(pose.z) << ",\"heading\":" << num(pose.heading);
    if (pose.horseValid) o << ",\"horse\":{\"x\":" << num(pose.horseX) << ",\"z\":" << num(pose.horseZ) << ",\"heading\":" << num(pose.horseHeading) << "}";
    else o << ",\"horse\":null";
    o << "}";
  }
  else o << "null";
  o << ",\"legacy\":" << (legacyJson.empty() ? std::string("null") : esc(legacyJson)) << "}";
  return o.str();
}

static bool parse(const std::string& text, J& j, std::string& error) {
  try {
    j = JParser(text).parse();
  } catch (const std::exception& e) {
    error = std::string("JSON illisible : ") + e.what();
    return false;
  }
  if (j.t != J::Obj) { error = "JSON illisible"; return false; }
  return true;
}

bool SaveGame::fromJson(const std::string& text, SaveGame& out, std::string& error) {
  J j;
  if (!parse(text, j, error)) return false;
  if (j["schema"].s != "strides.save") { error = "pas une sauvegarde Strides"; return false; }
  const int v = j["version"].isNull() ? 0 : (int)j["version"].n;
  if (v < 1 || v > kVersion) { error = "version " + std::to_string(v) + " non prise en charge"; return false; }
  SaveGame s;
  s.version = kVersion;
  if (!j["playerName"].isNull()) s.playerName = j["playerName"].s;
  if (!j["avatar"].isNull()) s.avatar = j["avatar"].s;
  if (!j["lang"].isNull()) s.lang = j["lang"].s;
  s.money = (long long)j["money"].n;
  s.reputation = (long long)j["reputation"].n;
  if (!j["gameTime"].isNull()) s.gameTime = j["gameTime"].n;
  if (!j["activeHorse"].isNull()) s.activeHorse = j["activeHorse"].s;
  for (auto& [k, v2] : j["skills"].o) s.skills[k] = v2.n;
  if (j["horses"].t == J::Arr) { s.horses.clear(); for (auto& h : j["horses"].a) s.horses.push_back(h.s); }
  for (auto& [k, r] : j["records"].o) s.records[k] = {r["eliminated"].b, (int)r["penalties"].n, r["time"].n};
  for (auto& [k, v2] : j["bestTimes"].o) if (v2.t == J::Num) s.bestTimes[k] = v2.n;
  for (auto& [k, v2] : j["settings"].o) s.settings[k] = v2.s;
  if (j["pose"].t == J::Obj) s.pose = {j["pose"]["mode"].s, j["pose"]["x"].n, j["pose"]["y"].n, j["pose"]["z"].n, j["pose"]["heading"].n, true};
  if (j["pose"].t == J::Obj && j["pose"]["horse"].t == J::Obj) {
    const J& h = j["pose"]["horse"];
    s.pose.horseValid = true;
    s.pose.horseX = h["x"].n;
    s.pose.horseZ = h["z"].n;
    s.pose.horseHeading = h["heading"].n;
  }
  if (j["legacy"].t == J::Str) s.legacyJson = j["legacy"].s;
  out = s;
  return true;
}

bool SaveGame::fromWebExport(const std::string& text, SaveGame& out, std::string& error) {
  J j;
  if (!parse(text, j, error)) return false;
  const int v = j["version"].isNull() ? 0 : (int)j["version"].n;
  if (v < 1 || v > 2) { error = "sauvegarde web de version " + std::to_string(v) + " non prise en charge"; return false; }
  SaveGame s;
  if (j["playerName"].t == J::Str) s.playerName = j["playerName"].s;
  if (j["avatar"].t == J::Str) s.avatar = j["avatar"].s;
  s.money = (long long)j["money"].n;
  s.reputation = v >= 2 ? (long long)j["reputation"].n : (long long)j["xp"].n;  // migration 1 → 2 du jeu web
  if (j["gameTime"].t == J::Num) s.gameTime = j["gameTime"].n;
  if (j["activeHorse"].t == J::Str) s.activeHorse = j["activeHorse"].s;
  for (auto& [k, v2] : j["skills"].o) s.skills[k] = v2.n;
  if (j["horses"].t == J::Arr) { s.horses.clear(); for (auto& h : j["horses"].a) if (h.t == J::Str) s.horses.push_back(h.s); }
  for (auto& [k, v2] : j["settings"].o) if (v2.t == J::Str) s.settings[k] = v2.s; else if (v2.t == J::Bool) s.settings[k] = v2.b ? "true" : "false";
  for (auto& [k, v2] : j["bestTimes"].o) if (v2.t == J::Num) s.bestTimes[k] = v2.n;
  for (auto& [k, r] : j["challenges"]["records"].o) {
    const J& b = r["best"].t == J::Obj ? r["best"] : r;
    s.records[k] = {!b["eliminated"].isNull(), (int)b["penalties"].n, b["time"].n};
  }
  s.legacyJson = text;
  out = s;
  return true;
}

bool courseLineShown(const Settings& s) {
  const auto it = s.find("courseLine");
  return !(it != s.end() && it->second == "false");
}

void toggleCourseLine(Settings& s) {
  const auto it = s.find("courseLine");
  s["courseLine"] = it != s.end() && it->second == "false" ? "true" : "false";
}

std::string jumpAidOf(const Settings& s) {
  const auto it = s.find("jumpAid");
  return it == s.end() || it->second.empty() ? std::string("full") : it->second;
}

void cycleJumpAid(Settings& s, bool locked) {
  if (locked) return;
  static const char* order[] = {"full", "button", "off"};
  const std::string cur = jumpAidOf(s);
  int i = -1;
  for (int k = 0; k < 3; k++)
    if (cur == order[k]) i = k;
  s["jumpAid"] = order[(i + 1) % 3];
}

std::string pauseLineLabelKey(const Settings& s) { return courseLineShown(s) ? "line.true" : "line.false"; }

std::string pauseAidLabelKey(const Settings& s, bool locked) {
  if (locked) return "aid.locked";
  // aids[st.jumpAid || 'full'] : une valeur hors liste n'a pas de libellé (texte vide dans le web).
  const std::string a = jumpAidOf(s);
  return a == "full" || a == "button" || a == "off" ? "aid." + a : std::string();
}

}  // namespace strides
