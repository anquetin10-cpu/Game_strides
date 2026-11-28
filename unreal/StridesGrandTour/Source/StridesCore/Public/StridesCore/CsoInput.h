// Commandes (tranche T8) — portage de la classe Input du jeu web (src/core/input.js) : joystick tactile flottant (rayon
// 58 px, zone x < 45 % de la largeur et y > 30 % de la hauteur ; la base suit le doigt au-delà du rayon), pointeur de
// regard (glisser hors zone, × 1,25 au doigt, × 1 à la souris), boutons tactiles (bindButton : SAUT, pause…), clavier
// par CODES PHYSIQUES (KeyboardEvent.code : « KeyW » est la touche Z d'un clavier AZERTY), amplitude du clavier réduite
// par Ctrl gauche (0,5) et Alt gauche (0,25), commandes désactivées (téléphone, pause, dialogue : seules phone, pause et
// map comptent), relâchement complet (releaseAll).
// État pur, sans rendu ni type Unreal : le jeu (AStridesPlayerController) y verse les gestes et les touches reçus, lit
// move / pressed / held à chaque image et dessine le joystick d'après l'état de son élément (view).
// Coordonnées des pointeurs en px CSS (le jeu divise les pixels du viewport par le facteur de pixels de la plateforme).
// Oracle : unreal/core/tests/oracles/cso_input.json (vraie classe Input du web soumise à des événements tactiles,
// souris et clavier synthétiques dans le navigateur, scripts/unreal/export-cso-input.mjs) ; rejoué par testCsoInput.
#pragma once
#include <cstdint>
#include <set>
#include <string>
#include "StridesCore/Api.h"

namespace strides {

// PointerEvent.pointerType : seule la souris est exclue du joystick.
enum class CsoPointer { Mouse, Touch, Pen };

class STRIDESCORE_API CsoInput {
 public:
  double R = 58;  // rayon du joystick (px)
  struct Move { double x = 0, y = 0, mag = 0; } move;  // y > 0 : avant
  struct Look { double dx = 0, dy = 0; } look;
  std::set<std::string> held, pressed, keys;  // noms d'action ; codes physiques des touches enfoncées
  bool enabled = true;
  bool keyMove = false;      // move vient du clavier à cette image (poll)
  bool virtualMove = false;  // _virtual : déplacement imposé par setVirtualMove (tests)
  struct Joy { bool on = false; std::int64_t id = 0; double ox = 0, oy = 0, x = 0, y = 0; } joy;  // on : joy.id !== null
  struct LookPtr { bool on = false; std::int64_t id = 0; double x = 0, y = 0; } lookPtr;
  double lastLookTime = -1e9;  // performance.now() du dernier regard (ms) : fourni par l'appelant
  // Élément du joystick (joyEl) : classe active, base placée au doigt (style left / top, sinon place de repos du CSS),
  // translation du bouton par rapport au centre de la base (px).
  struct View { bool active = false, placed = false; double left = 0, top = 0, knobX = 0, knobY = 0; } view;

  // Pointeur posé sur la surface de jeu (_down) ; ViewW × ViewH : taille de la fenêtre (window.innerWidth / Height).
  void pointerDown(std::int64_t id, CsoPointer type, double x, double y, double viewW, double viewH);
  // Déplacement d'un pointeur (_moveEvt, écouté sur la fenêtre) ; Now : horodatage (ms) du regard.
  void pointerMove(std::int64_t id, CsoPointer type, double x, double y, double now = 0);
  // Pointeur levé ou annulé (_up : pointerup, pointercancel).
  void pointerUp(std::int64_t id);
  // Touche (_key) : code physique (KeyboardEvent.code), enfoncée ou relâchée, répétition automatique.
  void key(const std::string& code, bool down, bool repeat);
  // Bouton relié par bindButton (pointerdown ; pointerup, pointercancel, lostpointercapture).
  void buttonDown(const std::string& name);
  void buttonUp(const std::string& name);
  // Début d'image (game.update) : déplacement du clavier si le joystick est libre ; rien si désactivé.
  void poll();
  void setVirtualMove(double x, double y);
  bool wasPressed(const std::string& name) const { return pressed.count(name) > 0; }
  bool isHeld(const std::string& name) const { return held.count(name) > 0; }
  // Fin d'image : appuis et regard oubliés.
  void endFrame();
  void releaseAll();
  void setEnabled(bool v);

  static bool inJoyZone(double x, double y, double viewW, double viewH);
  // Action d'une touche (table de _key) : « jump », « gallop », « action », « whistle », « phone », « map », « pause »,
  // « camera », « horn » ; vide si la touche n'en porte pas.
  static std::string keyAction(const std::string& code);

 private:
  void restJoy();
  void updJoy();
};

// Codes physiques (KeyboardEvent.code) des touches du Mac : codes virtuels matériels de macOS (kVK_* de
// HIToolbox/Events.h, transmis tels quels par Unreal dans FKeyEvent::GetKeyCode sur Mac) ; vide si la touche n'est pas
// lue par le jeu. Table de la plateforme (pas d'oracle web : le navigateur ne voit pas ces codes).
STRIDESCORE_API std::string webCodeFromMacKeyCode(std::uint32_t keyCode);
// Repli des autres plateformes : nom de touche Unreal (FKey, liée au caractère produit) → code ; « W » → « KeyW ».
STRIDESCORE_API std::string webCodeFromKeyName(const std::string& keyName);

}  // namespace strides
