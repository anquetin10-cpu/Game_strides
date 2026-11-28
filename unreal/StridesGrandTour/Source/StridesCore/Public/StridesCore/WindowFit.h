// Recalage de la position d'une fenêtre plein écran connue de l'interface (J1b, contrôle adverse du 26/11) : sur Mac, en
// plein écran fenêtré, Slate peut garder une position périmée de la fenêtre de jeu ((0, 2159) au lieu de (0, 0)) ; le
// test de position d'un clic ne trouve alors aucun widget et aucun bouton de carte ne répond. Choix du portage (le jeu
// web n'a pas de fenêtre native) : la fenêtre plein écran couvre l'écran où se trouve le pointeur ; si cet écran a la
// taille de la fenêtre (à 2 px près) et que la position connue diffère de son origine, la fenêtre y est recalée.
// Coordonnées d'écran de l'interface (pixels, origine en haut à gauche, y vers le bas).
#pragma once
#include <optional>
#include <vector>
#include "StridesCore/Api.h"

namespace strides {

struct ScreenRect {
  int left = 0, top = 0, right = 0, bottom = 0;  // right et bottom exclus
};

struct WindowOrigin {
  int x = 0, y = 0;
};

// Origine où recaler la fenêtre, ou rien si elle est déjà juste, si le pointeur n'est sur aucun écran, ou si l'écran du
// pointeur n'a pas la taille de la fenêtre (fenêtre non plein écran, ou sur un autre écran : on ne devine pas).
STRIDESCORE_API std::optional<WindowOrigin> fullscreenWindowResync(double cursorX, double cursorY, double winX, double winY,
                                                                   double winW, double winH,
                                                                   const std::vector<ScreenRect>& screens);

// Jalon J5 : zones sûres d'iOS (encoche, coins arrondis, barre d'accueil) appliquées aux commandes à l'écran comme le
// web (styles.css:45-49) : --sl / --sr = max(16 px, inset gauche / droit), --st / --sb = max(10 px, inset haut / bas).
// Les boîtes relevées dans le navigateur le sont sans encoche (16 et 10 px) : le décalage à ajouter est l'excédent,
// max(marge, inset) − marge, côté par côté (px CSS, toujours ≥ 0).
struct SafeShift {
  double left = 0, top = 0, right = 0, bottom = 0;
};
STRIDESCORE_API SafeShift safeAreaShift(double insetLeft, double insetTop, double insetRight, double insetBottom);

// Jalon J5 : pixels rendus par point d'écran sur iOS (facteur de pixels des commandes en px CSS) : r.MobileContentScaleFactor
// demandé (> 0), borné par le facteur natif de l'écran ; 0 ou moins = facteur natif (comportement du moteur, IOSView).
STRIDESCORE_API double iosContentScale(double requested, double nativeScale);

}  // namespace strides
