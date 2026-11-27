// J1b (contrôle adverse) : recalage de la position d'une fenêtre plein écran (StridesCore/WindowFit). Cas relevé dans le
// paquet Mac : écran 1920 x 1080, fenêtre de jeu connue de Slate à (0, 2159), clic à (1156, 678) sur « Reprendre ».
// Usage : strides_window_fit_tests
#include <cstdio>

#include "StridesCore/WindowFit.h"

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

int main() {
  using strides::ScreenRect;
  const std::vector<ScreenRect> one{{0, 0, 1920, 1080}};
  // Cas du paquet : position périmée, recalée à l'origine de l'écran.
  auto r = strides::fullscreenWindowResync(1156, 678, 0, 2159, 1920, 1080, one);
  CHECK(r && r->x == 0 && r->y == 0, "position périmée (0, 2159) non recalée en (0, 0)");
  // Déjà juste : rien.
  CHECK(!strides::fullscreenWindowResync(1156, 678, 0, 0, 1920, 1080, one), "fenêtre juste recalée quand même");
  // Fenêtre plus petite que l'écran (fenêtrée) : rien, on ne devine pas.
  CHECK(!strides::fullscreenWindowResync(500, 400, 100, 2159, 1600, 900, one), "fenêtre non plein écran recalée");
  // Pointeur hors de tout écran : rien.
  CHECK(!strides::fullscreenWindowResync(-5, 678, 0, 2159, 1920, 1080, one), "pointeur hors écran : recalage inventé");
  // Bord droit exclu, bord gauche inclus.
  CHECK(!strides::fullscreenWindowResync(1920, 10, 0, 2159, 1920, 1080, one), "x = right compté dans l'écran");
  CHECK(strides::fullscreenWindowResync(0, 0, 0, 2159, 1920, 1080, one).has_value(), "x = left exclu de l'écran");
  // Tolérance de taille de 2 px (barre de menus, arrondis).
  CHECK(strides::fullscreenWindowResync(10, 10, 0, 30, 1919, 1078, one).has_value(), "tolérance de 2 px non appliquée");
  CHECK(!strides::fullscreenWindowResync(10, 10, 0, 30, 1920, 1077, one), "écart de 3 px accepté");
  // Deux écrans : l'écran du pointeur décide (second écran à droite, 2560 x 1440 décalé vers le haut).
  const std::vector<ScreenRect> two{{0, 0, 1920, 1080}, {1920, -360, 4480, 1080}};
  r = strides::fullscreenWindowResync(3000, 500, 0, 2159, 2560, 1440, two);
  CHECK(r && r->x == 1920 && r->y == -360, "second écran : origine (1920, -360) attendue");
  // Pointeur sur l'écran 1 mais fenêtre de la taille de l'écran 2 : rien (fenêtre ailleurs).
  CHECK(!strides::fullscreenWindowResync(500, 500, 1920, 2000, 2560, 1440, two), "recalage sur le mauvais écran");
  std::printf("%d vérifications, %d échec(s)\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
