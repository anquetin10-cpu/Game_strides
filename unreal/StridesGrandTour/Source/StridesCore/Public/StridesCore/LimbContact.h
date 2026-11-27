// Contacts des membres visibles du cheval avec les barres (jalon J2, unreal/docs/livraison/plan.md), en C++20 standard,
// sans type Unreal. Portage de :
//  - src/gameplay/limbContact.js (géométrie seule) : toLocal, segAxis, capsuleRail, sweepRail (barre = cylindre de rayon
//    RAIL_R d'axe parallèle à t, membre = capsule [a, b] de rayon r, passage entre deux images balayé en `steps` positions) ;
//  - src/entities/pjlHorse.js _limbContacts (choix de l'obstacle et du moment, pose précédente gardée, contact le plus
//    profond par barre au-delà de CONTACT_TOL) : LIMBS (canon et paturon-sabot de chaque membre), R_CANON, R_HOOF.
// L'effet d'un contact sur le jugement (barre qui tombe, faute, cause) reste dans CsoFences (csoLimbContact).
// Le moteur fournit les positions monde des os de la pose finale de l'image (replis et bascule compris), dans le repère
// du web (x est, z sud, y haut, m), et le sol au pied de l'obstacle.
// Oracles : unreal/core/tests/oracles/limb_contact.json (fonctions géométriques, scripts/unreal/export-limb-contact.mjs)
// et le canal « lb » des scénarios j2-* de unreal/core/tests/oracles/cso_runs/ (points relevés dans le jeu web, contacts
// « lc » signalés), rejoués par unreal/core/tests/test_core.cpp (testLimbContact, testFenceRuns).
#pragma once
#include <array>
#include <functional>
#include <vector>

#include "StridesCore/Api.h"
#include "StridesCore/CsoFences.h"
#include "StridesCore/CsoHorse.h"

namespace strides::limb {

// Point dans le repère d'un obstacle : s le long de l'axe de saut n, u le long des barres t, y au-dessus du sol.
struct P3 {
  double s = 0, u = 0, y = 0;
};

// Constantes du web (limbContact.js, pjlHorse.js).
struct Params {
  double railR = 0.05;                     // RAIL_R
  double rCanon = 0.045, rHoof = 0.055;    // R_CANON, R_HOOF
  double tol = 0.01;                       // CONTACT_TOL
  int steps = 6;                           // sweepRail(…, 6)
  double preRoll = 4;                      // pose gardée dès l'abord : première barre à moins de 4 m
  double window = 0.8;                     // jugement jusqu'à 0,8 s après la réception
  double maxGap = 0.1;                     // pose précédente plus vieille : pas de balayage
};
STRIDESCORE_API const Params& defaults();

// Os des membres (pjlHorse.js LIMBS), dans l'ordre AG, AD, PG, PD : canon, paturon, bout du sabot.
STRIDESCORE_API const std::array<std::array<const char*, 3>, 4>& limbBones();
STRIDESCORE_API const std::array<const char*, 4>& limbKeys();  // "AG", "AD", "PG", "PD"

STRIDESCORE_API P3 toLocal(const CsoObstacle& o, double ground, double x, double y, double z);

struct SegAxis {
  double dist = 0, u = 0, k = 0;
};
STRIDESCORE_API SegAxis segAxis(const P3& a, const P3& b, double barS, double barH);

// Contact d'une capsule de rayon r : faux hors de la largeur de la barre ; depth > 0 si contact.
struct Contact {
  bool valid = false;
  double depth = 0, dist = 0, u = 0, t = 0;
};
STRIDESCORE_API Contact capsuleRail(const P3& a, const P3& b, double r, double barS, double barH, double halfW,
                                    const Params& P = defaults());
// Contact le plus profond (depth > 0) entre la capsule [a0, b0] de l'image précédente et [a1, b1] de celle-ci, ou invalide.
STRIDESCORE_API Contact sweepRail(const P3& a0, const P3& b0, const P3& a1, const P3& b1, double r, double barS, double barH,
                                  double halfW, int steps, const Params& P = defaults());

// Obstacle dont les membres sont relevés à cette image (pjlHorse.js _limbContacts, début) : jugé = obstacle du dernier
// saut, en vol ou moins de 0,8 s après la réception ; sinon, à l'abord, obstacle visé dont la première barre est à moins
// de 4 m (pose gardée, pas de contact). obstacle = −1 : rien (pose oubliée).
struct Choice {
  int obstacle = -1;
  bool judging = false;
};
// `target` : obstacle visé (Obstacles.target), calculé par l'appelant seulement si nécessaire (voir needsTarget).
STRIDESCORE_API bool judgingNow(const CsoHorseState& s, const std::vector<CsoObstacle>& obstacles, bool playerHorse, double time,
                                const Params& P = defaults());
STRIDESCORE_API Choice choose(const CsoHorseState& s, const std::vector<CsoObstacle>& obstacles, bool playerHorse, double time,
                              const CsoTarget* target, const Params& P = defaults());

// Pose des membres d'une image dans le repère de l'obstacle choisi : [membre][os].
using Pose = std::array<std::array<P3, 3>, 4>;
// Pose précédente (this._limbPrev).
struct State {
  bool has = false;
  int obstacle = -1;
  double time = 0;
  Pose pose{};
};
// Contact retenu pour une barre (le plus profond de tous les segments), avec le membre.
struct Hit {
  int bar = 0;
  double depth = 0, u = 0, t = 0;
  int limb = 0;  // rang dans limbKeys()
  bool hind = false;
};
// Une image : choix fait (choose), pose de l'image (ignorée si choice.obstacle < 0), heure de jeu ; barres de l'obstacle
// et leur état (barre sans maillage ou qui tombe : ignorée), lu à chaque barre. Comme le web, chaque contact est remis à
// `onHit` dès que sa barre est examinée (l'appelant appelle csoLimbContact, qui peut faire tomber la barre), dans l'ordre
// des barres (o.bars) ; la liste des contacts est aussi renvoyée.
STRIDESCORE_API std::vector<Hit> step(State& st, const Choice& choice, const Pose& pose, double time, const CsoObstacle* o,
                                      const CsoFenceState* fence, const std::function<void(const Hit&)>& onHit = nullptr,
                                      const Params& P = defaults());
// Contact tel que csoLimbContact l'attend.
STRIDESCORE_API CsoLimbHit toFenceHit(const Hit& h, int obstacle);

}  // namespace strides::limb
