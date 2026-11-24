// Phase de foulée du cheval WildMesh lue par le cavalier (essai de monte, voie A, étape M3), en C++20 standard, sans type
// Unreal. Port de :
//  - src/entities/pjlHorse.js circularOffset et _calibrate (calage des clips sur les allures du jeu : align, leadSwap) ;
//  - src/entities/pjl/view.js (temps d'un clip d'allure k = ((ph + gaitInfo[k].offset) % 1) · durée) : ici, inversé, la
//    phase ph des clips est retrouvée depuis le temps du clip joué : ph = wrap01(temps / durée − gaitInfo[k].offset) ;
//  - src/entities/pjlHorse.js _snapshot (H.anim.phase = wrap01(ph − align[clé].off) sans saut au-delà de minSpeed ; clé :
//    allure du jeu, au galop (speed > gallopAbove ? gallop : canter) + main du jeu) ;
//  - src/entities/human.js animateRiding (phase du cavalier = h.anim.phase + riderPostOffset, jamais affecté dans src/).
//
// Données : Content/Data/pjl_horse_phase.json (scripts/unreal/export-horse-phase.mjs, relevé dans le jeu web : appuis des
// clips, GAIT_OFFSETS, gaitInfo, sortie du calage du jeu pour la preuve).
//
// Hors de la réécriture (arrêt, pas encore lancé, saut), la phase du web est celle de la locomotion procédurale
// (horse/anim.js : st.phase avance à la fréquence de l'allure lissée), NON PORTÉE : la phase est alors tenue à sa dernière
// valeur (écart mesuré contre O1 par le ctest « monte-cheval », déclaré).
//
// Preuves : unreal/core/tests/test_horse_tack.cpp (ctest « monte-cheval » : calage contre la sortie du jeu, phase contre
// hz.ph d'O1 à partir des temps de clips mx.a) ; Strides.Parite.RiderOnHorse (cheval Unreal posé par ses couches).
#pragma once
#include <map>
#include <string>
#include <vector>

#include "StridesCore/Api.h"

struct J;  // StridesCore/MiniJson.h

namespace strides::phase {

struct CircularFit {
  double off = 0, res = 0;
  bool ok = false;
};
// pjlHorse.js circularOffset : écart circulaire moyen (0..1) entre deux séries de phases, et résidu.
STRIDESCORE_API CircularFit circularOffset(const std::vector<double>& a, const std::vector<double>& b);

struct GaitContact {
  std::vector<double> touch, duty;
  double duration = 0;
};

struct PhaseModel {
  std::map<std::string, double> infoOffset;            // gaitInfo[k].offset (walk, trot, canter, gallop)
  std::map<std::string, std::vector<double>> gaitOff;  // GAIT_OFFSETS (walk, trot, canterL, …)
  std::map<std::string, GaitContact> contacts;         // asset.gaitContacts (walk, trot, canter, …, canter_M, …)
  double gallopAbove = 9.8, minSpeed = 0.2;            // relus dans pjlHorse.js par le script d'export
  int postAssignments = 0;                             // affectations de riderPostOffset dans src/ (0 : décalage nul)
  // Sortie du calage (calibrate) : clé (walk, trot, canterR, canterL, gallopR, gallopL) → décalage.
  std::map<std::string, CircularFit> align;
  bool leadSwap = false;
  // Sortie du calage du jeu web relevée dans la page (preuve).
  std::map<std::string, CircularFit> webAlign;
  bool webLeadSwap = false;
};
// Lecture des données (sans calage) ; exception si une clé manque.
STRIDESCORE_API PhaseModel phaseModelFromJson(const J& j);
// pjlHorse.js _calibrate : leadSwap, puis align des 6 clés (sim = wrap01(touch − info.offset), circularOffset contre GAIT_OFFSETS).
STRIDESCORE_API void calibrate(PhaseModel& m);

// Famille d'allure d'un nom de clip (view.js : name.split('_')[0]) : walk, trot, canter ou gallop ; vide sinon.
STRIDESCORE_API std::string clipFamily(const std::string& clipName);

struct PhaseState {
  double animPhase = 0;  // horse.anim.phase du web (0 à la création du cheval)
  bool rewritten = false;  // vrai si la dernière image a réécrit la phase depuis le clip
};
// Une image : gait = allure du jeu (idle, walk, trot, canter, gallop) ; clipName et clipPhase (temps / durée, 0..1) : clip
// d'allure joué (le premier de la famille de l'allure, vide si aucun) ; lead : main du jeu ('L' ou 'R', avant leadSwap) ;
// rend horse.anim.phase (tenue hors réécriture). Le cavalier la lit telle quelle (RideHorseSample::phase), avec
// postOffset = 0 : riderPostOffset n'est affecté nulle part dans src/ (postAssignments, vérifié par le ctest).
STRIDESCORE_API double phaseStep(const PhaseModel& m, PhaseState& st, const std::string& gait, const std::string& clipName, double clipPhase,
                                 double speed, char lead, bool jumping);

}  // namespace strides::phase
