// Sellerie du cheval WildMesh : ce que la règle de monte lit du cheval (essai de monte, voie A, étape 5, R0), en C++20
// standard, sans type Unreal. Port de src/entities/pjlHorse.js (_snapshot : horloge de réception ; _attachRider : siège
// S recentré, tangage du dos, inclinaison ; update : postérieurs reposés ; _flankUpdate : profils du flanc et du dessus
// de l'encolure) et de src/entities/pjl/view.js anchorWorld (ancres skinnées à 4 influences).
//
// Données : Content/Data/pjl_horse_tack.json, écrit par scripts/unreal/export-horse-tack.mjs depuis le GLB du web
// (points des ancres et des sommets retenus, par os, en espace de la scène du GLB à la pose de repos des nœuds).
// Le moteur fournit, pour chaque os utilisé, sa « transformée de peau » : l'application affine qui envoie un point de la
// pose de repos (espace de la scène du GLB) à sa position posée dans le repère du cheval (holder du web : x à gauche,
// y vers le haut, z vers l'avant, mètres, origine au sol sous le cheval). Tout le reste est calculé ici, comme le web.
//
// Preuves : unreal/core/tests/test_horse_tack.cpp (ctest « monte-cheval » : pose de repos contre pjlRest d'O1, horloge
// de réception et postérieurs contre O1, conversion d'axes) ; Strides.Parite.HorseSeat (cheval Unreal posé aux images
// d'O1, ancres, siège et profils contre le canal hz). Mutations : scripts/unreal/mutations-horse-tack.py.
#pragma once
#include <array>
#include <string>
#include <vector>

#include "StridesCore/Api.h"

struct J;  // StridesCore/MiniJson.h

namespace strides::tack {

struct V3 {
  double x = 0, y = 0, z = 0;
};
struct Q4 {
  double x = 0, y = 0, z = 0, w = 1;
};
// Application affine p' = M p + t (lignes : m[0..3] → x', m[4..7] → y', m[8..11] → z').
struct Affine {
  double m[12] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0};
};
STRIDESCORE_API V3 apply(const Affine& a, const V3& p);
STRIDESCORE_API Affine compose(const Affine& a, const Affine& b);  // a ∘ b
STRIDESCORE_API double det3(const Affine& a);
STRIDESCORE_API Affine invert(const Affine& a);  // a⁻¹ (a inversible)
// Moindres carrés : affine A telle que A·from[i] ≈ to[i] ; rms = écart quadratique moyen (unités de to). Faux si le
// système est dégénéré (moins de 4 points non coplanaires).
STRIDESCORE_API bool fitAffine(const std::vector<V3>& from, const std::vector<V3>& to, Affine& out, double& rms);

// Ancres de sellerie (pjl/tack.js), dans l'ordre du canal hz.an d'O1.
enum Anchor : int { Seat, BarL, BarR, BitL, BitR, Withers, Crest, KneeL, KneeR, IronL, IronR, AnchorCount };
STRIDESCORE_API const char* anchorName(int a);

struct Influence {
  int bone = 0;  // rang de l'os dans TackModel::bones
  double w = 0;
  V3 q;  // point de repos (scène du GLB) vu par cet os
};
using TackPoint = std::vector<Influence>;

struct TackModel {
  std::vector<std::string> bones;       // os utilisés (nom du nœud, ex. « spine_04_09 »), rang = indice
  std::vector<std::string> jointNames;  // toutes les articulations (les os utilisés d'abord)
  std::vector<V3> jointRest;            // leur position de repos (scène du GLB)
  double innerScale = 1, innerGroundY = 0, innerYaw = 0;  // groupe intérieur de la vue (pjl/view.js)
  std::array<TackPoint, AnchorCount> anchors;
  std::vector<TackPoint> flank, crest;
  double flankY0 = -1, flankStep = 0.05;
  int flankSlices = 20;
  double crestZ0 = 0.15, crestStep = 0.05;
  int crestSlices = 18;
  double recenterDamp = 12, pitchDamp = 18;
  double hindDown = 0.1, hindWithin = 1.5, landT0 = 9;
  int spine04 = -1, pelvis = -1, toeL = -1, toeR = -1;  // rangs dans bones
};
// Lit pjl_horse_tack.json ; lève std::runtime_error si le fichier est incomplet.
STRIDESCORE_API TackModel tackModelFromJson(const J& j);
STRIDESCORE_API TackModel tackModelFromFile(const std::string& path);
// Groupe intérieur de la vue du web (translation du sol, lacet −yaw, échelle) : scène du GLB → repère du cheval.
STRIDESCORE_API Affine innerAffine(const TackModel& m);

// État d'un cheval (pjlHorse.js) : un par cheval, remis à neuf avec le cheval WildMesh.
struct TackState {
  bool hasSeatX = false;  // this.seatX === undefined
  double seatX = 0;
  bool hasPitch0 = false;  // this.pitch0 === undefined
  double pitch0 = 0;
  double dPitch = 0;
  double landT = 9;  // this.landT (constructeur : landT0)
  bool wasJump = false;
  bool hindDown = false;
};
STRIDESCORE_API TackState freshState(const TackModel& m);

struct TackOut {
  V3 seatPos;  // siège S dans le repère du cheval (m)
  Q4 seatQ;
  double pitch = 0;                     // tangage du dos mesuré (rad), avant retrait du repos
  std::array<V3, AnchorCount> anchorH;  // ancres, repère du cheval
  std::array<V3, AnchorCount> anchorS;  // ancres, repère S
  V3 spine04, pelvis, toe[2];           // articulations, repère du cheval
  std::vector<double> flankL, flankR;   // [y0, pas, d0…] (pjlHorse.js fit.flankL / flankR), repère S
  std::vector<double> crest;            // [z0, pas, h0…] (fit.crest), repère S, −9 sans mesure
};

// _snapshot (pjlHorse.js:437-439) : horloge depuis la réception des antérieurs, avant la pose de la vue.
STRIDESCORE_API void landStep(TackState& s, bool jumping, double dt);
// _attachRider (siège, :831-861) puis _flankUpdate (:777-826) : skin[k] = transformée de peau de l'os de rang k (voir en
// tête) ; roll = inclinaison de la vue (V.body.rotation.z) ; dt = pas de l'image (this._dt || 1/60).
STRIDESCORE_API void seatStep(const TackModel& m, TackState& s, const std::vector<Affine>& skin, double roll, double dt, TackOut& out);
// update (:763-769) : postérieurs reposés ; toeHeight = hauteur au-dessus du sol des os toes_02_l et toes_02_r (m).
STRIDESCORE_API void hindStep(const TackModel& m, TackState& s, bool jumping, const double toeHeight[2]);
// Point skinné (anchorWorld) : Σ w · skin[os] · q.
STRIDESCORE_API V3 skinPoint(const TackPoint& p, const std::vector<Affine>& skin);
// Point du repère du cheval exprimé dans S, et quaternion (three.js : Euler 'YXZ', produit, inverse).
STRIDESCORE_API V3 toSeat(const V3& p, const V3& seatPos, const Q4& seatQ);
STRIDESCORE_API Q4 eulerYXZ(double x, double y, double z);
STRIDESCORE_API V3 rotate(const Q4& q, const V3& v);

}  // namespace strides::tack
