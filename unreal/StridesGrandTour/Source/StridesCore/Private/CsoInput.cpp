// Commandes (voir CsoInput.h) : src/core/input.js ligne pour ligne. Math.hypot = jsHypot (MathUtil.h) ; une opération
// par instruction là où le web enchaîne (pas de contraction en FMA).
#include "StridesCore/CsoInput.h"

#include <algorithm>
#include <map>

#include "StridesCore/MathUtil.h"

namespace strides {

bool CsoInput::inJoyZone(double x, double y, double viewW, double viewH) {
  // input.js:40-43
  const double zx = viewW * 0.45;
  const double zy = viewH * 0.3;
  return x < zx && y > zy;
}

void CsoInput::restJoy() {
  // _restJoy : classe active retirée, base rendue à sa place de repos (style vide), bouton centré.
  view.active = false;
  view.placed = false;
  view.left = view.top = 0;
  view.knobX = view.knobY = 0;
}

void CsoInput::pointerDown(std::int64_t id, CsoPointer type, double x, double y, double viewW, double viewH) {
  if (!enabled) return;
  if (type != CsoPointer::Mouse && !joy.on && inJoyZone(x, y, viewW, viewH)) {
    joy.on = true;
    joy.id = id;
    joy.ox = x;
    joy.oy = y;
    joy.x = x;
    joy.y = y;
    view.active = true;
    view.placed = true;
    view.left = x;
    view.top = y;
    updJoy();
    return;
  }
  if (!lookPtr.on) {
    lookPtr.on = true;
    lookPtr.id = id;
    lookPtr.x = x;
    lookPtr.y = y;
  }
}

void CsoInput::pointerMove(std::int64_t id, CsoPointer type, double x, double y, double now) {
  if (joy.on && id == joy.id) {
    joy.x = x;
    joy.y = y;
    updJoy();
  } else if (lookPtr.on && id == lookPtr.id) {
    const double k = type == CsoPointer::Mouse ? 1 : 1.25;
    const double ddx = (x - lookPtr.x) * k;
    const double ddy = (y - lookPtr.y) * k;
    look.dx += ddx;
    look.dy += ddy;
    lookPtr.x = x;
    lookPtr.y = y;
    lastLookTime = now;
  }
}

void CsoInput::pointerUp(std::int64_t id) {
  if (joy.on && id == joy.id) {
    joy.on = false;
    move.x = move.y = move.mag = 0;
    restJoy();
  }
  if (lookPtr.on && id == lookPtr.id) lookPtr.on = false;
}

void CsoInput::updJoy() {
  double dx = joy.x - joy.ox;
  double dy = joy.y - joy.oy;
  const double d = jsHypot(dx, dy);
  // La base suit le doigt si on dépasse le rayon (joystick flottant).
  if (d > R) {
    const double k = (d - R) / d;
    const double sx = dx * k;
    const double sy = dy * k;
    joy.ox += sx;
    joy.oy += sy;
    dx = joy.x - joy.ox;
    dy = joy.y - joy.oy;
    view.left = joy.ox;
    view.top = joy.oy;
  }
  const double mag = std::min(1.0, jsHypot(dx, dy) / R);
  move.x = dx / R;
  move.y = -dy / R;
  move.mag = mag;
  view.knobX = dx;
  view.knobY = dy;
}

void CsoInput::buttonDown(const std::string& name) {
  if (!enabled && name != "phone" && name != "pause") return;
  held.insert(name);
  pressed.insert(name);
}

void CsoInput::buttonUp(const std::string& name) { held.erase(name); }

std::string CsoInput::keyAction(const std::string& code) {
  static const std::map<std::string, std::string> map = {
      {"Space", "jump"},  {"ShiftLeft", "gallop"}, {"ShiftRight", "gallop"}, {"KeyE", "action"}, {"KeyF", "action"},
      {"Enter", "action"}, {"KeyQ", "whistle"},    {"KeyR", "whistle"},      {"KeyP", "phone"},  {"Tab", "phone"},
      {"KeyM", "map"},     {"Escape", "pause"},    {"KeyC", "camera"},       {"KeyH", "horn"},
  };
  const auto it = map.find(code);
  return it == map.end() ? std::string() : it->second;
}

void CsoInput::key(const std::string& code, bool down, bool repeat) {
  // Commandes désactivées (téléphone, pause, dialogue) : la touche n'est pas retenue, et sa répétition automatique ne la
  // fait pas compter après la fermeture.
  if (down) {
    if (enabled && (!repeat || keys.count(code))) keys.insert(code);
  } else
    keys.erase(code);
  const std::string name = keyAction(code);
  if (!name.empty()) {
    if (down && !repeat) {
      if (enabled || name == "phone" || name == "pause" || name == "map") pressed.insert(name);
    }
    if (down && enabled) held.insert(name);
    if (!down) held.erase(name);
  }
}

void CsoInput::poll() {
  // Déplacement venu du clavier (la conduite de concours y amène la direction progressivement).
  keyMove = false;
  if (!joy.on) {
    double x = 0, y = 0;
    if (keys.count("KeyW") || keys.count("ArrowUp")) y += 1;
    if (keys.count("KeyS") || keys.count("ArrowDown")) y -= 1;
    if (keys.count("KeyD") || keys.count("ArrowRight")) x += 1;
    if (keys.count("KeyA") || keys.count("ArrowLeft")) x -= 1;
    // Comme le joystick poussé à fond : galop par défaut ; Ctrl = trot, Alt = pas.
    const bool walk = keys.count("AltLeft") > 0;
    const bool trot = keys.count("ControlLeft") > 0;
    const double m = jsHypot(x, y);
    if (m > 0) {
      keyMove = true;
      const double s = walk ? 0.25 : trot ? 0.5 : 1;
      move.x = (x / m) * s;
      move.y = (y / m) * s;
      move.mag = s;
    } else if (move.mag != 0 && !std::isnan(move.mag) && !virtualMove) {
      move.x = move.y = move.mag = 0;
    }
  }
  if (!enabled) {
    move.x = move.y = move.mag = 0;
    look.dx = look.dy = 0;
  }
}

void CsoInput::setVirtualMove(double x, double y) {
  virtualMove = x != 0 || y != 0;
  const double m = std::min(1.0, jsHypot(x, y));
  move.x = x;
  move.y = y;
  move.mag = m;
}

void CsoInput::endFrame() {
  pressed.clear();
  look.dx = 0;
  look.dy = 0;
}

void CsoInput::releaseAll() {
  held.clear();
  keys.clear();
  joy.on = false;
  lookPtr.on = false;
  move.x = move.y = move.mag = 0;
  restJoy();
}

void CsoInput::setEnabled(bool v) {
  if (v != enabled) releaseAll();
  enabled = v;
}

std::string webCodeFromMacKeyCode(std::uint32_t keyCode) {
  // kVK_* (HIToolbox/Events.h) : positions physiques nommées d'après le clavier ANSI (QWERTY).
  static const std::map<std::uint32_t, std::string> map = {
      {0x00, "KeyA"},  {0x01, "KeyS"},       {0x02, "KeyD"},     {0x03, "KeyF"},       {0x04, "KeyH"},       {0x05, "KeyG"},
      {0x06, "KeyZ"},  {0x07, "KeyX"},       {0x08, "KeyC"},     {0x09, "KeyV"},       {0x0B, "KeyB"},       {0x0C, "KeyQ"},
      {0x0D, "KeyW"},  {0x0E, "KeyE"},       {0x0F, "KeyR"},     {0x10, "KeyY"},       {0x11, "KeyT"},       {0x1F, "KeyO"},
      {0x20, "KeyU"},  {0x22, "KeyI"},       {0x23, "KeyP"},     {0x24, "Enter"},      {0x25, "KeyL"},       {0x26, "KeyJ"},
      {0x28, "KeyK"},  {0x2D, "KeyN"},       {0x2E, "KeyM"},     {0x30, "Tab"},        {0x31, "Space"},      {0x35, "Escape"},
      {0x38, "ShiftLeft"}, {0x3A, "AltLeft"}, {0x3B, "ControlLeft"}, {0x3C, "ShiftRight"}, {0x3D, "AltRight"}, {0x3E, "ControlRight"},
      {0x7B, "ArrowLeft"}, {0x7C, "ArrowRight"}, {0x7D, "ArrowDown"}, {0x7E, "ArrowUp"},
      // Jalon J3 (correction) : Retour arrière (kVK_Delete) et Entrée du pavé (kVK_ANSI_KeypadEnter) : touches du téléphone
      // (choix n° 15) ; absentes, le Retour arrière n'arrivait jamais au jeu (contrôle adverse : Entrée suivante prise par
      // l'élément « Retour » de l'écran).
      {0x33, "Backspace"}, {0x4C, "NumpadEnter"},
  };
  const auto it = map.find(keyCode);
  return it == map.end() ? std::string() : it->second;
}

std::string webCodeFromKeyName(const std::string& keyName) {
  if (keyName.size() == 1 && keyName[0] >= 'A' && keyName[0] <= 'Z') return "Key" + keyName;
  static const std::map<std::string, std::string> map = {
      {"Up", "ArrowUp"},          {"Down", "ArrowDown"},       {"Left", "ArrowLeft"},     {"Right", "ArrowRight"},
      {"SpaceBar", "Space"},      {"Escape", "Escape"},        {"Tab", "Tab"},            {"Enter", "Enter"},
      {"LeftControl", "ControlLeft"}, {"RightControl", "ControlRight"}, {"LeftAlt", "AltLeft"}, {"RightAlt", "AltRight"},
      {"LeftShift", "ShiftLeft"}, {"RightShift", "ShiftRight"},
      {"BackSpace", "Backspace"},
  };
  const auto it = map.find(keyName);
  return it == map.end() ? std::string() : it->second;
}

}  // namespace strides
