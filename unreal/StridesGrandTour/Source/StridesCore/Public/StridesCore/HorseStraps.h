// Sellerie affichée du cheval WildMesh (étape S1, sellerie complète) : étriers, étrivières et rênes, en C++20 standard, sans
// type Unreal. Port de src/entities/pjlHorse.js (Strap.set : ruban de n segments entre deux points, flèche en sinus ;
// _straps : étrier sous le pied du cavalier ou pendant à l'ancre d'étrier, étrivière du porte-étrivière à l'œil de
// l'étrier, rênes du mors aux poings ou posées sur l'encolure, rien au-delà de DETAIL_DIST de la caméra) et de
// src/entities/horse.js _stirrupsFollow (étrier tenu par le pied : os de l'orteil du cavalier, abaissé de 0,015 · scale).
// Les pièces skinnées (selle, tapis, filet, mors, guêtres) ne passent pas par ici : ce sont des maillages importés,
// déformés par le squelette du cheval (UStridesHorseTackMesh).
//
// Repère : monde du web (y vers le haut, mètres). L'adaptateur Unreal convertit (UStridesHorseTackMesh : x = −Y/100,
// y = Z/100, z = X/100, la même symétrie que le repère du cheval, UStridesHorseTack::HolderToActor).
//
// Données : Content/Data/pjl_horse_tack_mesh.json (constants : relues dans le source du web par
// scripts/unreal/tack-horse-glb.py). Preuve : unreal/core/tests/test_horse_straps.cpp (ctest « monte-sellerie ») contre
// l'oracle unreal/core/tests/oracles/monte/sellerie (relevé à l'appel de _straps, image par image, scénarios d'O1) ;
// dans le moteur : Strides.Parite.HorseTackMesh. Mutations : scripts/unreal/mutations-horse-straps.py.
#pragma once
#include <string>
#include <vector>

#include "StridesCore/Api.h"
#include "StridesCore/HorseTack.h"

struct J;  // StridesCore/MiniJson.h

namespace strides::straps {

using tack::Q4;
using tack::V3;

struct StrapParams {
  int n = 0;       // segments (Strap : n + 1 paires de sommets)
  double w = 0;    // demi-largeur (m)
};

struct StrapsModel {
  StrapParams leather, rein;
  double ironEye = 0;       // œil de l'étrier au-dessus de l'étrier (m, verticale du monde)
  double toeDrop = 0;       // étrier sous l'os de l'orteil (m, × scale du cavalier)
  double reinSagMax = 0;    // flèche des rênes tenues : min(reinSagMax, longueur × reinSagPerLen)
  double reinSagPerLen = 0;
  double reinSagFree = 0;   // flèche des rênes posées sur l'encolure
  double crestSide = 0;     // rênes posées : ancre « crest » ± crestSide le long de l'axe latéral du cheval
  double detailDist = 0;    // au-delà (distance au sol caméra – cheval), rien n'est affiché
};
// Lit la clé « constants » de pjl_horse_tack_mesh.json ; lève std::runtime_error si une constante manque.
STRIDESCORE_API StrapsModel strapsModelFromJson(const J& j);
STRIDESCORE_API StrapsModel strapsModelFromFile(const std::string& path);

// Strap.set(a, b, sag, side) : 2 (n + 1) sommets, dans l'ordre du web (pour i = 0..n : centre − side·w, centre + side·w).
STRIDESCORE_API void strapSet(const StrapParams& p, const V3& a, const V3& b, double sag, const V3& side, std::vector<V3>& out);
// Os d'étrier tenu par le pied (horse.js _stirrupsFollow) : orteil du cavalier abaissé de toeDrop · scale.
STRIDESCORE_API V3 stirrupUnderToe(const StrapsModel& m, const V3& toe, double riderScale);

// Ce que _straps lit, à l'appel.
struct StrapsIn {
  bool saddle = true;          // cfg.saddle
  bool hasCam = false;         // caméra présente (sinon : proche)
  V3 cam;                      // position de la caméra
  double horseX = 0, horseZ = 0;
  Q4 holder;                   // orientation monde du repère du cheval (holder)
  V3 bar[2], bit[2], ironAnchor[2], crest;  // ancres skinnées (monde) : porte-étrivières, mors, étriers qui pendent, encolure
  bool inStirrup[2] = {false, false};       // pied dans l'étrier (R.inStirrup) et os d'étrier présent
  V3 stirrup[2];               // os d'étrier du cheval du jeu (placé sous le pied par stirrupUnderToe)
  bool hasHands = false;       // cavalier en selle qui donne ses poings (H.rider.getHandWorldPositions)
  V3 hand[2];
};
struct StrapsOut {
  bool show = false;
  V3 iron[2];
  Q4 ironQ[2];
  std::vector<V3> leather[2], rein[2];
};
// pjlHorse.js _straps.
STRIDESCORE_API void strapsStep(const StrapsModel& m, const StrapsIn& in, StrapsOut& out);

}  // namespace strides::straps
