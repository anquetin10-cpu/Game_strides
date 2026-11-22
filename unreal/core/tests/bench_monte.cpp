// Banc de coût des règles de monte portées en C++ (essai de monte, voie A, étape 4 ; seuil du plan : médiane ≤ 0,22 ms par
// image, en Release).
//
// Une image mesurée = ce que le jeu fera à chaque image pour une cavalière : préparation des entrées depuis l'état du
// cheval (RideInputFilter::next), la règle (RiderRules::step : riding et lissage) et la pose du squelette dans S
// (RiderRules::skeleton : 25 matrices, plantes, poings). Entrées : les 8 scénarios d'O1 enchaînés en boucle (arrêt,
// allures, virages, obstacles de 1,10 et 1,40 m), état cheval relu dans le canal hz, rig rider_f (ou celui donné).
// Chaque image est chronométrée seule (std::chrono::steady_clock) ; l'état du cavalier est remis à neuf au début de chaque
// scénario (hors chronomètre). 500 images de mise en température non comptées, puis N images comptées.
// Usage : strides_monte_bench <oracles/monte> <Content/Data> [N = 10000] [rig = rider_f]
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

#include "StridesCore/MiniJson.h"
#include "StridesCore/RiderRules.h"

using namespace strides::rider;
using Clock = std::chrono::steady_clock;

struct Frame {
  RideHorseSample h;
  RideFitMeters fit;
  double dt = 0, turn = 0;
};
struct Run {
  RideInputs first;
  std::vector<Frame> frames;
};

static Vec3 v3(const J& a) { return Vec3{a[0].num(), a[1].num(), a[2].num()}; }

int main(int argc, char** argv) {
  if (argc < 3) {
    std::printf("usage : %s <oracles/monte> <Content/Data> [images] [rig]\n", argv[0]);
    return 2;
  }
  const std::string ora = argv[1], data = argv[2];
  const int N = argc > 3 ? std::atoi(argv[3]) : 10000;
  const std::string rigName = argc > 4 ? argv[4] : "rider_f";
  RideParams params;
  std::string err;
  if (!rideParamsFromJson(loadJson(data + "/rider_rules.json"), params, err)) {
    std::printf("rider_rules.json : %s\n", err.c_str());
    return 1;
  }
  const J rj = loadJson(ora + "/rigs/" + rigName + ".json");
  Rig rig;
  for (int b = 0; b < BoneCount; b++) rig.rest[b] = v3(rj["rest"][boneName(b)]);
  const J& info = rj["info"];
  rig.info.thighLen = info["thighLen"].num();
  rig.info.shinLen = info["shinLen"].num();
  rig.info.upperArmLen = info["upperArmLen"].num();
  rig.info.foreArmLen = info["foreArmLen"].num();
  rig.info.ankleY = info["ankleY"].num();
  rig.info.seatToHips = info["seatToHips"].num();
  rig.info.toe = v3(info["toe"]);
  rig.fist = v3(rj["fist"]);
  rig.hasFistR = rj["fistR"].t == J::Arr;
  if (rig.hasFistR) rig.fistR = v3(rj["fistR"]);
  rig.scale = rj["scale"].num();

  // Entrées : état du cheval de chaque image d'O1 (hz, mx.co), réglages de la mise en selle (fit0, mètres).
  std::vector<Run> runs;
  const J idx = loadJson(ora + "/o1/index.json");
  for (const J& e : idx["runs"].a) {
    const J o1 = loadJson(ora + "/o1/" + e["file"].s);
    const J& F = o1["frames"];
    const J& fit0 = o1["setup"]["fit0"];
    const double k = o1["setup"]["scale"].num() / rig.scale;  // réglages d'O1 ramenés aux unités de ce rig
    Run r;
    const J& I0 = F[0]["in"];
    RideInputs& a = r.first;
    a.dt = I0["dt"].num();
    a.t = I0["t"].num();
    a.horseSpeed = I0["hs"].num();
    a.gaitPhase = I0["ph"].num();
    a.turn = I0["turn"].num();
    a.jump = I0["jump"].num();
    a.hasLandT = !I0["landT"].isNull();
    a.landT = a.hasLandT ? I0["landT"].num() : -1;
    a.hindDown = I0["hindDown"].b;
    a.bob = I0["bob"].num();
    a.pitch = I0["pitch"].num();
    const J& Fi = I0["fit"];
    a.fit.stirrupX = Fi["stirrupX"].num() * k;
    a.fit.stirrupY = Fi["stirrupY"].num() * k;
    a.fit.stirrupZ = Fi["stirrupZ"].num() * k;
    a.fit.kneeOut = Fi["kneeOut"].num();
    a.fit.handX = Fi["handX"].num() * k;
    a.fit.handY = Fi["handY"].num() * k;
    a.fit.handZ = Fi["handZ"].num() * k;
    a.fit.legClear = Fi["legClear"].num() * k;
    for (const J& x : Fi["flankL"].a) a.fit.flankL.push_back(x.num() * k);
    for (const J& x : Fi["flankR"].a) a.fit.flankR.push_back(x.num() * k);
    for (const J& x : Fi["crest"].a) a.fit.crest.push_back(x.num() * k);
    for (size_t i = 1; i < F.a.size(); i++) {
      const J& hz = F[i - 1]["hz"];
      const J& S = hz["S"];
      Frame fr;
      const double x = S[3].num(), y = S[4].num(), z = S[5].num(), w = S[6].num();
      fr.h.attachY = S[1].num();
      fr.h.attachZ = Vec3{x * (z + z) + w * (y + y), y * (z + z) - w * (x + x), 1 - (x * (x + x) + y * (y + y))};
      fr.h.horseY = hz["p"][1].num();
      fr.h.contactOff = F[i - 1]["mx"]["co"].isNull() ? 0 : F[i - 1]["mx"]["co"].num();
      fr.h.speed = hz["v"].num();
      fr.h.phase = hz["ph"].num();
      fr.h.jumpT = hz["jT"].num();
      fr.h.hindDown = hz["hd"].b;
      fr.fit.stirrupX = fit0["stirrupX"].num();
      fr.fit.stirrupY = fit0["stirrupY"].num();
      fr.fit.stirrupZ = fit0["stirrupZ"].num();
      fr.fit.kneeOut = fit0["kneeOut"].num();
      fr.fit.handX = fit0["handX"].num();
      fr.fit.handY = fit0["handY"].num();
      fr.fit.handZ = fit0["handZ"].num();
      fr.fit.legClear = fit0["legClear"].num();
      for (const J& v : hz["fl"].a) fr.fit.flankL.push_back(v.num());
      for (const J& v : hz["fr"].a) fr.fit.flankR.push_back(v.num());
      for (const J& v : hz["cr"].a) fr.fit.crest.push_back(v.num());
      fr.dt = F[i]["in"]["dt"].num();
      fr.turn = F[i]["in"]["turn"].num();
      r.frames.push_back(std::move(fr));
    }
    runs.push_back(std::move(r));
  }

  // Résolution et coût du chronomètre lui-même (deux lectures successives).
  std::vector<double> overhead;
  for (int i = 0; i < 2000; i++) {
    const auto t0 = Clock::now();
    const auto t1 = Clock::now();
    overhead.push_back(std::chrono::duration<double, std::milli>(t1 - t0).count());
  }
  std::sort(overhead.begin(), overhead.end());

  RiderRules rr(rig, params);
  RideInputFilter filt(params);
  const int WARM = 500;
  std::vector<double> ms;
  ms.reserve(N);
  double sink = 0;
  int done = 0;
  size_t ri = 0, fi = 0;
  bool fresh = true;
  while (static_cast<int>(ms.size()) < N) {
    const Run& r = runs[ri];
    if (fresh) {
      rr.reset();
      filt.seed(r.first);
      rr.step(r.first);
      fresh = false;
      fi = 0;
    }
    const Frame& fr = r.frames[fi];
    const auto t0 = Clock::now();
    RideInputs in = filt.next(fr.h, fr.fit, rig.scale, fr.dt, fr.dt, false);
    in.turn = fr.turn;  // h.lastTurn absent d'O1 : virage repris du canal in
    rr.step(in);
    const RideSkeleton sk = rr.skeleton();
    const auto t1 = Clock::now();
    sink += sk.joints[LFoot].y + sk.fist[1].z;
    if (done >= WARM) ms.push_back(std::chrono::duration<double, std::milli>(t1 - t0).count());
    done++;
    if (++fi >= r.frames.size()) {
      ri = (ri + 1) % runs.size();
      fresh = true;
    }
  }
  std::vector<double> sorted = ms;
  std::sort(sorted.begin(), sorted.end());
  const auto pct = [&](double p) { return sorted[static_cast<size_t>(std::min<double>(sorted.size() - 1, std::floor(p * (sorted.size() - 1) + 0.5)))]; };
  double sum = 0;
  for (const double v : ms) sum += v;
  std::printf("banc règles de monte : rig %s, %d images comptées (+%d de mise en température), %zu scénarios d'O1 en boucle\n", rigName.c_str(), N, WARM, runs.size());
  std::printf("  par image (ms) : médiane %.5f ; moyenne %.5f ; p90 %.5f ; p99 %.5f ; max %.5f ; min %.5f\n", pct(0.5), sum / ms.size(), pct(0.9), pct(0.99), sorted.back(), sorted.front());
  std::printf("  chronomètre seul (ms) : médiane %.6f ; max %.6f\n", overhead[overhead.size() / 2], overhead.back());
  std::printf("  seuil du plan 0,22 ms : %s (contrôle %.6g)\n", pct(0.5) <= 0.22 ? "respecté" : "DÉPASSÉ", sink);
  return pct(0.5) <= 0.22 ? 0 : 1;
}
