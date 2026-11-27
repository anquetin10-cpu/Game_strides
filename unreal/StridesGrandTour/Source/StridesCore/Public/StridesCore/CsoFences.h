// Obstacles de concours (tranche T3) — portage ligne à ligne de src/gameplay/obstacles.js, partie « jeu » :
//   - updateHorse : détour après un refus, résultat différé (membres jugés), barres en attente des postérieurs (1,1 m ou
//     cheval à plus de 8 m), comptage du refus à l'arrêt, refus décidé à l'abord, barre emportée sur un refus tout contre
//     (remontée 3 s plus tard), garde-fou du nez, glissade (refus sur place) ;
//   - _judge (jugement de chaque barre au passage des épaules, interpolé entre deux images, seuils −0,06 / 0,04, une
//     faute par élément, causes short / angle / far / cause du plan), _finishPass, _count, limbContact (effet d'un contact
//     de membre signalé par l'appelant), knock, _rest ;
//   - update : chute déterministe des barres (taquets, élan, rebonds, glisse, roulement, inclinaison), vibration
//     d'effleurement, remise par le jury (refus tout contre, entraînement) ou hors mission à plus de 60 m.
// Oracle : unreal/core/tests/oracles/cso_runs/, canal « ch » (lc, oe, ob), rejoué image par image par
// unreal/core/tests/test_core.cpp (testFenceRuns). Ce qui n'est PAS ici : la détection des contacts des membres (pose
// animée du cheval WildMesh, pjlHorse.js / limbContact.js : StridesCore/LimbContact, jalon J2 ; l'appelant passe le
// contact à csoLimbContact), l'affichage et les sons (l'appelant reçoit les événements et les transformées).
// Repère web : x est, z sud, y haut ; transformées des barres dans le repère local de l'obstacle (x le long des barres,
// y vers le haut depuis le pied de l'obstacle, z le long de l'axe de saut n), angles en radians (Euler XYZ de Three.js).
#pragma once
#include <string>
#include <vector>
#include "StridesCore/Api.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCore/JumpModel.h"

namespace strides {

// Constantes du jeu web lues par le portage (les tests les comparent à celles que scripts/unreal/export-data.mjs extrait
// du source dans Content/Data/cso_horse.json).
struct CsoFenceParams {
  double hindTrail = 2.2;  // obstacles.js HIND_TRAIL : épaules → postérieurs, avec marge (m)
};
STRIDESCORE_API const CsoFenceParams& csoFenceDefaults();

// Chute d'une barre (rail.userData.fall) : bouts [y, vy, départ], position le long de l'axe de saut, élan, roulement.
struct CsoRailEnd {
  double y = 0, vy = 0, t0 = 0;
};
struct CsoRailFall {
  double t = 0, dir = 1, side = 0, hit = 0.15;
  bool started = false;  // f.ends posés (première image de chute)
  CsoRailEnd ends[2];
  double z = 0, vz = 0, roll = 0;
  bool clonk = false, done = false;
};
// Barre affichée (obstacles.js : maillage ob.rails[i] = ob.bars[i].mesh) : position de repos, transformée courante.
struct CsoRail {
  double restY = 0, restZ = 0, restRx = 0;
  double y = 0, z = 0, rx = 0, rz = 0;  // position.y, position.z, rotation.x, rotation.z
  double rattle = 0;
  bool falling = false;  // userData.fall défini
  CsoRailFall fall;
};
// Barre touchée par les postérieurs, en attente (o._pending) : rang de la barre, sens, côté, profondeur, reste (m).
struct CsoPendingBar {
  int bar = 0;
  double dir = 1, side = 1, hit = 0, left = 1.1;
};
// État d'un obstacle : renversé, remise prévue (heure de jeu, 0 : aucune), barres en attente, barres affichées
// (vide pour les obstacles sans barre mobile : troncs, haies, eau).
struct CsoFenceState {
  bool knocked = false;
  double rebuild = 0;
  std::vector<CsoPendingBar> pending;
  std::vector<CsoRail> rails;
};

// Événements du bus émis par les obstacles : franchi, faute (marge, cause), refus (compté une fois).
enum class CsoFenceEventKind { Clear, Fault, Refusal };
struct CsoFenceEvent {
  CsoFenceEventKind kind = CsoFenceEventKind::Clear;
  int obstacle = -1;
  int dir = 1;
  double margin = 0;   // Clear / Fault (+∞ si aucune barre jugée)
  std::string cause;   // Fault : clé du jeu web, vide sinon
};
STRIDESCORE_API const char* csoFenceEventName(CsoFenceEventKind);  // "obstacle:clear", …
// Sons demandés par les obstacles (game.audio) : barre qui tombe, barre effleurée, premier choc au sol.
enum class CsoFenceSound { RailFall, RailTouch, Thud };
STRIDESCORE_API const char* csoFenceSoundName(CsoFenceSound);  // "railFall", …

// Sorties d'une étape, dans l'ordre d'émission.
struct CsoFenceOut {
  std::vector<CsoFenceEvent> events;
  std::vector<CsoFenceSound> sounds;
  std::vector<CsoHorseEvent> horse;  // horse:refuse de la glissade
};

// obstacles.js _mesh : barres au repos (v / o : hauteur et position de chaque barre ; mur : barre du dessus à h − 0,05).
STRIDESCORE_API std::vector<CsoFenceState> csoFenceStates(const std::vector<CsoObstacle>& obstacles);
// obstacles.js _rest : barres remises sur leurs taquets.
STRIDESCORE_API void csoRestFence(CsoFenceState& st);
// obstacles.js knock : barre `bar` (−1 : la plus haute) renversée dans le sens `dir`, bout `side` touché le premier,
// profondeur `hit` ; entraînement (warmup, home, paris_warm) : remise 2,5 s plus tard.
STRIDESCORE_API void csoKnock(const std::vector<CsoObstacle>& obstacles, std::vector<CsoFenceState>& states, int obstacle,
                              int bar, double dir, double side, double hit, double time, CsoFenceOut& out);

// Contact d'un membre visible signalé par l'appelant (obstacles.js limbContact) : profondeur, position le long de la
// barre, postérieur ou antérieur.
struct CsoLimbHit {
  int obstacle = -1, bar = 0;
  double depth = 0, u = 0;
  bool hind = false;
};
STRIDESCORE_API void csoLimbContact(CsoHorseState& s, const std::vector<CsoObstacle>& obstacles, std::vector<CsoFenceState>& states,
                                    const CsoLimbHit& hit, double time, CsoFenceOut& out);

// Entrées de Obstacles.updateHorse : position du cheval avant l'image (origine), heure de jeu, membres visibles jugés
// (cheval WildMesh du joueur : résultat différé), puissance et bonus de franchissement, épreuve de CSO (modèle v2).
struct CsoUpdateHorseInput {
  double prevX = 0, prevZ = 0, time = 0;
  bool limbJudged = false;
  double power = 1.35, clearance = 0;
  bool csoCourse = true;
};
// obstacles.js updateHorse, appelé après le déplacement du cheval (csoHorseStep) et les contacts des membres.
STRIDESCORE_API void csoFencesUpdateHorse(CsoHorseState& s, const std::vector<CsoObstacle>& obstacles, std::vector<CsoFenceState>& states,
                                          const CsoUpdateHorseInput& in, CsoFenceOut& out, const JumpParams& J = jumpDefaults(),
                                          const CsoHorseParams& P = csoHorseDefaults(), const CsoFenceParams& F = csoFenceDefaults());

// Entrées de Obstacles.update : pas, heure de jeu, mission en cours (pas de remise hors mission), position suivie par
// la caméra (cheval monté).
struct CsoFencesUpdateInput {
  double dt = 1.0 / 30, time = 0;
  bool missionActive = true;
  double focusX = 0, focusZ = 0;
};
// obstacles.js update(dt) : remises, vibration, chute des barres.
STRIDESCORE_API void csoFencesUpdate(const std::vector<CsoObstacle>& obstacles, std::vector<CsoFenceState>& states,
                                     const CsoFencesUpdateInput& in, CsoFenceOut& out);

}  // namespace strides
