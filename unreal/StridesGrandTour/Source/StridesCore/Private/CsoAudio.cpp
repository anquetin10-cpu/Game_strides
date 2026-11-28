// Sons de l'épreuve du Pôle (tranche T12) : voir CsoAudio.h.
#include "StridesCore/CsoAudio.h"
#include "StridesCore/MathUtil.h"
#include "StridesCore/MiniJson.h"
#include "StridesCore/Text.h"
#include <algorithm>
#include <cmath>

namespace strides {

std::string csoSoundKey(const CsoCall& c) {
  // export-cso-sounds.mjs : [fn, ...args.map(String)].join('_').replace(/\./g, 'p').replace(/[^A-Za-z0-9_-]/g, '_')
  std::string k = c.fn;
  for (const CsoArg& a : c.args) k += "_" + (a.isNum ? jsNumber(a.n) : a.s);
  for (char& ch : k) {
    const unsigned char u = (unsigned char)ch;
    if (ch == '.') ch = 'p';
    else if (!((u >= 'A' && u <= 'Z') || (u >= 'a' && u <= 'z') || (u >= '0' && u <= '9') || ch == '_' || ch == '-')) ch = '_';
  }
  return k;
}

const char* csoRunSoundSrc(const CsoCall& c) { return c.fn == "notify" ? "gameplay/missions.js" : "gameplay/courses.js"; }

static CsoCall call0(const char* fn) { return CsoCall{fn, {}}; }
static CsoArg num(double v) { CsoArg a; a.isNum = true; a.n = v; return a; }
static CsoArg str(const std::string& s) { CsoArg a; a.s = s; return a; }

void csoHorseSounds(CsoHorseEvent e, bool playerHorse, bool csoControls, const std::string& surface, std::vector<CsoCall>& out) {
  switch (e) {
    case CsoHorseEvent::Land:
      // b.on('horse:land', (h) => a.landing(h.isPlayerHorse ? 1 : 0.5))
      out.push_back(CsoCall{"landing", {num(playerHorse ? 1 : 0.5)}});
      return;
    case CsoHorseEvent::Jump:
      // if (!h.isPlayerHorse) return; a.snort(); if (this.course?.controls === 'cso') a.hoof?.(surfaceAt(h.pos), 1.4)
      if (!playerHorse) return;
      out.push_back(call0("snort"));
      if (csoControls) out.push_back(CsoCall{"hoof", {str(surface), num(1.4)}});
      return;
    case CsoHorseEvent::Refuse:
      // b.on('horse:refuse', () => a.neigh())
      out.push_back(call0("neigh"));
      return;
    default:
      return;  // horse:jumpEarly (hud.jumpEarly), horse:tooSlow (astuce) : pas de son
  }
}

CsoCall csoFenceSoundCall(CsoFenceSound s) { return call0(csoFenceSoundName(s)); }
CsoCall csoClickCall() { return call0("click"); }

// ---------- AudioParam ----------
void WebAudioParam::insert(const Ev& e) {
  // Après les événements de même instant (spécification : « placed in the list after them »).
  const auto it = std::upper_bound(pending_.begin(), pending_.end(), e.t, [](double t, const Ev& x) { return t < x.t; });
  pending_.insert(it, e);
}
void WebAudioParam::setValueAtTime(double v, double t) { insert(Ev{Kind::Set, t, v, 0}); }
void WebAudioParam::setTargetAtTime(double target, double t, double tau) { insert(Ev{Kind::Target, t, target, tau}); }
void WebAudioParam::cancelScheduledValues(double t) {
  pending_.erase(std::remove_if(pending_.begin(), pending_.end(), [t](const Ev& x) { return x.t >= t; }), pending_.end());
}
double WebAudioParam::curAt(double t) const {
  if (!hasCur_) return value_;
  if (cur_.k == Kind::Set) return cur_.v;
  return cur_.v + (v0_ - cur_.v) * std::exp(-(t - cur_.t) / cur_.tau);
}
double WebAudioParam::valueAt(double t) {
  while (!pending_.empty() && pending_.front().t <= t) {
    const Ev e = pending_.front();
    pending_.erase(pending_.begin());
    const double v = curAt(e.t);
    cur_ = e;
    v0_ = e.k == Kind::Set ? e.v : v;
    hasCur_ = true;
  }
  return curAt(t);
}

// ---------- Bus du public ----------
const CsoCrowdParams& csoCrowdDefaults() {
  static const CsoCrowdParams P;
  return P;
}

double csoCrowdLevel(double fx, double fz, double arenaX, double arenaZ, bool courseCso, const CsoCrowdParams& P) {
  // Math.hypot(f.x - POLE.arena.x, f.z - POLE.arena.z) < 90 || this.course?.kind === 'cso' ? 0.6 : 0
  return jsHypot(fx - arenaX, fz - arenaZ) < P.radius || courseCso ? P.level : 0;
}

void CsoCrowd::ambience(double crowd, double now) {
  // this.crowd.g.gain.setTargetAtTime(crowd * 0.08, t, 0.5)
  g_.setTargetAtTime(crowd * P_.scale, now, P_.tau);
}
void CsoCrowd::cheer(double now) {
  // cancelScheduledValues(t) ; setValueAtTime(0.28, t) ; setTargetAtTime(0.0, t + 1.6, 0.8)
  g_.cancelScheduledValues(now);
  g_.setValueAtTime(P_.cheerPeak, now);
  g_.setTargetAtTime(P_.cheerTarget, now + P_.cheerHold, P_.cheerTau);
}
void CsoCrowd::onCall(const CsoCall& c, double now) {
  // applause() se termine par this.cheer() (audio.js:391).
  if (c.fn == "cheer" || c.fn == "applause") cheer(now);
}

// ---------- Manifeste ----------
const CsoSoundEntry* CsoSoundBank::find(const std::string& key) const {
  for (const CsoSoundEntry& e : sounds)
    if (e.key == key) return &e;
  return nullptr;
}

bool csoSoundBankFromFile(const std::string& text, CsoSoundBank& out, std::string& err) {
  try {
    const J j = JParser(text).parse();
    if (j["schema"].s != "strides.cso_sounds/1") { err = "schéma inattendu : " + j["schema"].s; return false; }
    CsoSoundBank b;
    b.rate = (int)j["rate"].num();
    for (const J& x : j["sounds"].a) {
      CsoSoundEntry e;
      e.key = x["nom"].s;  // champ « nom » (et non « key » : faux positif de gitleaks)
      e.asset = x["asset"].s;
      e.file = x["file"].s;
      e.pcmSha1 = x["pcmSha1"].s;
      e.samples = (long)x["samples"].num();
      e.loop = x["loop"].b;
      if (e.key.empty() || e.asset.empty() || e.pcmSha1.size() != 40 || e.samples <= 0) { err = "entrée incomplète : " + e.key; return false; }
      if (e.loop) b.crowdLoop = e.key;
      b.sounds.push_back(e);
    }
    const J& c = j["crowd"];
    b.crowd.radius = c["level"]["radius"].num();
    b.crowd.level = c["level"]["value"].num();
    b.crowd.scale = c["ambience"]["scale"].num();
    b.crowd.tau = c["ambience"]["tau"].num();
    b.crowd.cheerPeak = c["cheer"]["peak"].num();
    b.crowd.cheerTarget = c["cheer"]["target"].num();
    b.crowd.cheerHold = c["cheer"]["hold"].num();
    b.crowd.cheerTau = c["cheer"]["tau"].num();
    if (b.crowdLoop.empty() || b.crowdLoop != c["asset"].s) { err = "boucle du public absente"; return false; }
    out = std::move(b);
    return true;
  } catch (const std::exception& e) {
    err = e.what();
    return false;
  }
}

}  // namespace strides
