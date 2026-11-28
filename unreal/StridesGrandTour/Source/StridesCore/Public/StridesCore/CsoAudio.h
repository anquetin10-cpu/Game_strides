// Sons de l'épreuve du Pôle (tranche T12, unreal/docs/parite/cso-ecarts.md §4), logique pure portée du jeu web :
//   - src/game.js:716-728 : écouteurs du bus qui jouent les sons du cheval (réception, appel, cabré) ;
//   - src/gameplay/interact.js:52 : « click » d'une action déclenchée ;
//   - src/core/audio.js : clé des sons rendus hors ligne (scripts/unreal/export-cso-sounds.mjs), bus du public (gain
//     piloté par ambience à chaque image et par cheer / applause) avec la sémantique des AudioParam du Web Audio
//     (setValueAtTime, setTargetAtTime, cancelScheduledValues) ;
//   - src/game.js:1553 : niveau du public (0,6 dans les 90 m de la carrière du Pôle ou en épreuve CSO, 0 sinon).
// La synthèse elle-même n'est pas portée : chaque son est un WAV rendu par la classe Audio du jeu web (Content/Audio/Cso).
#pragma once
#include "StridesCore/Api.h"
#include "StridesCore/CsoFences.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCore/CsoRun.h"
#include <string>
#include <vector>

namespace strides {

// Clé d'un appel (nom du WAV et de l'actif) : nom puis arguments (nombres écrits comme String(n) de JS), joints par
// « _ » ; « . » → « p », tout autre caractère hors [A-Za-z0-9_-] → « _ » (soundKey de export-cso-sounds.mjs).
STRIDESCORE_API std::string csoSoundKey(const CsoCall& c);

// Fichier du jeu web qui fait l'appel (champ src du canal « audio » de cso_runs/) pour un son demandé par le déroulé
// d'épreuve (CsoRun) : « notify » vient de missions.start (gameplay/missions.js), les autres de gameplay/courses.js.
STRIDESCORE_API const char* csoRunSoundSrc(const CsoCall& c);

// game.js:716-728 (fichier « game.js ») : horse:land → landing(joueur ? 1 : 0.5) ; horse:jump → rien pour un autre
// cheval que celui du joueur, sinon snort() puis, avec les commandes de concours (game.course.controls === 'cso'),
// hoof(sol, 1.4) ; horse:refuse → neigh() (tout cheval). horse:jumpEarly et horse:tooSlow : aucun son. Les appels sont
// ajoutés à `out`.
STRIDESCORE_API void csoHorseSounds(CsoHorseEvent e, bool playerHorse, bool csoControls, const std::string& surface,
                                    std::vector<CsoCall>& out);
// Sons des obstacles (gameplay/obstacles.js : knock, _judge, chute) : appel sans argument.
STRIDESCORE_API CsoCall csoFenceSoundCall(CsoFenceSound s);
// interact.js:52 (trigger) : action déclenchée → click().
STRIDESCORE_API CsoCall csoClickCall();

// AudioParam du Web Audio (spécification, § AudioParam) réduit aux appels du bus du public : événements datés gardés
// dans l'ordre des temps (un événement ajouté à un instant déjà occupé passe après ceux de cet instant) ;
// setTargetAtTime part de la valeur du paramètre à son instant de départ : v(t) = cible + (v0 − cible)·exp(−(t − t0)/τ) ;
// cancelScheduledValues(t) retire les événements d'instant ≥ t (celui en cours continue). valueAt : t non décroissant
// d'un appel à l'autre.
class STRIDESCORE_API WebAudioParam {
 public:
  explicit WebAudioParam(double value = 0) : value_(value) {}
  void setValueAtTime(double v, double t);
  void setTargetAtTime(double target, double t, double tau);
  void cancelScheduledValues(double t);
  double valueAt(double t);
  size_t pending() const { return pending_.size(); }

 private:
  enum class Kind { Set, Target };
  struct Ev { Kind k = Kind::Set; double t = 0, v = 0, tau = 0; };
  void insert(const Ev& e);
  double curAt(double t) const;
  std::vector<Ev> pending_;
  bool hasCur_ = false;
  Ev cur_;
  double v0_ = 0, value_ = 0;
};

// Constantes du bus du public (lues dans le source par export-cso-sounds.mjs, champ « crowd » de cso_sounds.json).
struct CsoCrowdParams {
  double radius = 90, level = 0.6;      // game.js:1553
  double scale = 0.08, tau = 0.5;       // audio.js:95 (ambience)
  double cheerPeak = 0.28, cheerTarget = 0, cheerHold = 1.6, cheerTau = 0.8;  // audio.js:366-372 (cheer)
};
STRIDESCORE_API const CsoCrowdParams& csoCrowdDefaults();

// game.js:1553 : niveau du public passé à ambience : 0,6 si le point suivi est à moins de 90 m du centre de la carrière
// du Pôle ou si une épreuve CSO est en cours (game.course.kind === 'cso'), 0 sinon (intérieur des commerces : non porté).
STRIDESCORE_API double csoCrowdLevel(double fx, double fz, double arenaX, double arenaZ, bool courseCso,
                                     const CsoCrowdParams& P = csoCrowdDefaults());

// Bus du public (audio.js : this.crowd.g.gain, part de 0) : ambience(crowd) à chaque image ; cheer() (et applause(), qui
// l'appelle à la fin) : valeur 0,28 tout de suite, cible 0 à +1,6 s (τ 0,8) ; les images suivantes reprennent la cible
// de l'ambience. onCall : appel de premier niveau du journal (« cheer » ou « applause » → cheer).
class STRIDESCORE_API CsoCrowd {
 public:
  explicit CsoCrowd(const CsoCrowdParams& P = csoCrowdDefaults()) : P_(P) {}
  void ambience(double crowd, double now);
  void cheer(double now);
  void onCall(const CsoCall& c, double now);
  double gainAt(double t) { return g_.valueAt(t); }
  const CsoCrowdParams& params() const { return P_; }

 private:
  CsoCrowdParams P_;
  WebAudioParam g_;
};

// Manifeste des sons rendus (Content/Data/cso_sounds.json, export-cso-sounds.mjs) : une entrée par WAV (clé, actif
// Unreal, fichier, échantillons, SHA-1 du PCM 16 bits, boucle) ; constantes du bus du public lues dans le source.
struct CsoSoundEntry {
  std::string key, asset, file, pcmSha1;
  long samples = 0;
  bool loop = false;
};
struct STRIDESCORE_API CsoSoundBank {
  int rate = 0;
  std::vector<CsoSoundEntry> sounds;
  CsoCrowdParams crowd;
  std::string crowdLoop;  // clé de la boucle du bus du public
  const CsoSoundEntry* find(const std::string& key) const;
};
// Faux (et err renseigné) si le texte n'est pas un manifeste complet.
STRIDESCORE_API bool csoSoundBankFromFile(const std::string& text, CsoSoundBank& out, std::string& err);

}  // namespace strides
