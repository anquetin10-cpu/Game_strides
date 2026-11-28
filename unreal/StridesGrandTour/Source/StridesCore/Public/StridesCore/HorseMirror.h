// Clips miroir du cheval WildMesh (main gauche) et main au galop (essai de monte, voie A, étape M2), en C++20 standard,
// sans type Unreal. Port de :
//  - src/entities/pjl/asset.js : choix des clips cuits en miroir et renommage des virages (prepare, « Mirrored (left-lead)
//    clips »), plan de symétrie (bras upperarm_l et upperarm_r au clip idle à 0,5 s), bakeMirror (paires d'os gauche et
//    droite, réflexion S, matrices C de la pose de repos, pose monde miroir S·W·C, retour en local, longueurs d'os
//    conservées, continuité du signe des quaternions, pistes des racines omises) ;
//  - three.js 0.170.0, pour ce que bakeMirror et la lecture d'un clip en utilisent : Matrix4 (compose, multiplyMatrices,
//    invert, determinant, decompose), Quaternion (setFromRotationMatrix, slerpFlat), Vector3 (length, normalize),
//    AnimationAction (temps bouclé, LoopRepeat), LinearInterpolant et QuaternionLinearInterpolant (lecture des pistes) ;
//    Math.hypot tel que V8 le calcule (StridesCore/MathUtil.h) ;
//  - src/entities/horse/anim.js (main au galop : changement après 0,5 s de virage de plus de 0,25 rad/s de l'autre côté)
//    et src/entities/pjl/view.js (fondu de main leadBlend, 10/s ; saut en miroir pour la main gauche).
//
// Le moteur fournit le squelette (noms, parents, pose de repos locale, matrice monde des parents qui ne sont pas des os) et,
// pour chaque instant de la cuisson, la pose locale du clip source ; tout le reste est calculé ici. Le calcul est écrit
// dans le repère du squelette fourni : la réflexion S et les matrices C sont construites dans ce repère (le web : scène
// du GLB ; Unreal : espace du composant), ce qui rend le résultat indépendant de la convention d'axes.
//
// Preuves : unreal/core/tests/test_horse_mirror.cpp (ctest « monte-miroir », contre l'oracle exporté du jeu web par
// scripts/unreal/export-horse-mirror.mjs) ; dans le moteur, Strides.Parite.HorseMirror. Mutations :
// scripts/unreal/mutations-horse-mirror.py.
#pragma once
#include <functional>
#include <string>
#include <vector>

#include "StridesCore/Api.h"

namespace strides::mirror {

// Matrice 4×4 en colonnes (Matrix4.elements de three.js).
struct Mat4 {
  double e[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
};
// Transformée locale d'un os : position, quaternion (x, y, z, w), échelle.
struct Xf {
  double p[3] = {0, 0, 0};
  double q[4] = {0, 0, 0, 1};
  double s[3] = {1, 1, 1};
};
struct Rig {
  std::vector<std::string> names;  // noms complets des os
  std::vector<int> parent;         // indice de l'os parent, -1 si le parent n'est pas un os
  std::vector<Xf> rest;            // pose de repos locale
  std::vector<Mat4> parentWorld;   // matrice monde du parent non-os (si parent == -1), constante
};

// three.js
STRIDESCORE_API Mat4 compose(const Xf& x);
STRIDESCORE_API Mat4 mul(const Mat4& a, const Mat4& b);  // multiplyMatrices(a, b)
STRIDESCORE_API Mat4 inverse(const Mat4& m);             // invert()
STRIDESCORE_API double determinant(const Mat4& m);
STRIDESCORE_API void decompose(const Mat4& m, double p[3], double q[4], double s[3]);
STRIDESCORE_API void slerpFlat(const double a[4], const double b[4], double t, double out[4]);
// Matrices monde de tous les os d'une pose locale (Object3D.updateMatrixWorld : parent.matrixWorld × matrix).
STRIDESCORE_API std::vector<Mat4> worldMatrices(const Rig& rig, const std::vector<Xf>& local);

// pjl/names.js : nom de base (suffixe numérique de l'export retiré : « spine_04_017 » → « spine_04 »).
STRIDESCORE_API std::string baseName(const std::string& name);
// bakeMirror pairOf : indice de l'os symétrique de chaque os (lui-même s'il n'en a pas).
STRIDESCORE_API std::vector<int> pairIndices(const Rig& rig);
// Indice de l'os de nom de base donné (dernier de ce nom, comme byBase dans asset.js), -1 s'il n'existe pas.
STRIDESCORE_API int boneByBase(const Rig& rig, const std::string& base);
// asset.js prepare : liste des clips cuits en miroir (ordre du web).
STRIDESCORE_API const std::vector<std::string>& mirroredSources();
// asset.js prepare : nom du clip miroir (un virage à gauche cuit en miroir tourne à droite) : « canter_L90 » → « canter_R90_M ».
STRIDESCORE_API std::string mirroredName(const std::string& source);

struct Plane {
  double n[3] = {1, 0, 0};    // lateral : de upperarm_r vers upperarm_l, normé
  double mid[3] = {0, 0, 0};  // milieu des deux bras
  double d = 0;               // n · mid
};
// Plan de symétrie : bras upperarm_l et upperarm_r de la pose donnée (le web : clip idle à 0,5 s). Faux si un bras manque.
STRIDESCORE_API bool symmetryPlane(const Rig& rig, const std::vector<Xf>& pose, Plane& out);
// Réflexion S à travers le plan (n · x = d), Matrix4.set de bakeMirror.
STRIDESCORE_API Mat4 reflection(const Plane& pl);

constexpr int kBakeFps = 24;  // asset.js FPS
// Instants de la cuisson : n = max(2, round(durée × FPS) + 1), t = min(durée, f / FPS).
STRIDESCORE_API std::vector<double> bakeTimes(double duration, int fps = kBakeFps);
// Temps du clip lu par le mélangeur au temps t depuis le départ (AnimationAction._updateTime, LoopRepeat, sens positif) :
// t ≥ durée → t − durée × ⌊t / durée⌋.
STRIDESCORE_API double loopClipTime(double t, double duration);

// Clip cuit : pistes position et quaternion des os « bones », clés aux temps « times » (Float32Array du web).
struct Clip {
  std::string name;
  double duration = 0;
  std::vector<float> times;
  std::vector<int> bones;
  std::vector<float> values;  // pour chaque clé, pour chaque os de bones : position (3), quaternion (4)
  // Pose du clip au temps de clip t (LinearInterpolant, QuaternionLinearInterpolant) : écrit les os du clip dans pose,
  // laisse les autres.
  STRIDESCORE_API void sample(double t, std::vector<Xf>& pose) const;
};

// Pose locale du clip source à la clé f (temps de clip clipTime) : le moteur remplit pose (initialisée à la pose de
// repos par l'appelant de son choix) ; vrai si la pose est valide.
using SourcePose = std::function<bool(int f, double clipTime, std::vector<Xf>& pose)>;
// bakeMirror : clip miroir de durée « duration », pistes de tous les os sauf root_04 et _rootJoint. Faux si une pose source
// manque.
STRIDESCORE_API bool bakeMirror(const Rig& rig, const std::vector<int>& pairIdx, const Mat4& S, double duration, const SourcePose& source, Clip& out,
                                int fps = kBakeFps);

// ---- Main au galop (horse/anim.js) et fondu de main (pjl/view.js).
struct LeadState {
  int lead = 1;     // A.lead : > 0 à gauche (état initial du web : 1)
  double hold = 0;  // A.leadHold
};
// anim.js:287-294 (st.lead n'est jamais posé par le jeu) : virage |turn| > 0,25 de l'autre côté tenu plus de 0,5 s ; pas
// borné à 0,1 s comme dans animateHorse (anim.js:267, dt = Math.min(dt, 0.1)).
STRIDESCORE_API void leadStep(LeadState& st, double turn, double dt);
// pjlHorse.js : main des clips joués (leadSwap : clips d'origine à main gauche) ; 'L' ou 'R'.
STRIDESCORE_API char clipLead(int lead, bool leadSwap);
// view.js : leadBlend = damp(leadBlend, main droite ? 1 : 0, 10, dt) (1 = clips d'origine, 0 = clips miroir).
STRIDESCORE_API double leadBlendStep(double leadBlend, char lead, double dt);


// ---- Clip de saut de la vue WildMesh (pjl/view.js:229-233).
// Au premier instant de saut (jumping && !wasJumping) : clip « jump_gallop » si s.speed > 8 m/s, sinon « jump_canter » ;
// miroir si la main des clips est à gauche (s.lead === 'L'). Le choix est gardé jusqu'au saut suivant (la vue ne l'efface
// pas à la réception). Non porté : le repli « ?? jump_gallop » quand jump_canter manque (les deux clips existent).
struct JumpChoice {
  bool gallop = false;
  bool mirror = false;
};
STRIDESCORE_API JumpChoice jumpChoice(double speed, char lead);
// Nom du clip joué : « jump_canter », « jump_gallop », suivis de « _M » en miroir (view.js:317).
STRIDESCORE_API std::string jumpClipName(const JumpChoice& c);
struct JumpView {
  bool wasJumping = false;
  bool hasClip = false;  // jumpClip !== null
  JumpChoice clip;
};
// Une image de la vue : jumping = mode « takeoff » ou « air ». Vrai au départ d'un saut (choix refait à cette image).
STRIDESCORE_API bool jumpViewStep(JumpView& v, bool jumping, double speed, char lead);

}  // namespace strides::mirror
