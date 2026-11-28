// Essai de monte, voie A, étape 5 : sellerie du cheval WildMesh (StridesCore/HorseTack) hors moteur, contre l'oracle O1.
// Ce que ce test prouve sans le moteur (le cheval posé dans Unreal est prouvé par Strides.Parite.HorseSeat) :
//  1. données : Content/Data/pjl_horse_tack.json lu ; la pose de repos skinnée par la formule du web (groupe intérieur de
//     la vue · Σ w · q) redonne les ancres d'étrier au repos relevées dans la page (O1 setup.pjlRest) ;
//  2. horloge de réception (pjlHorse.js _snapshot) et postérieurs reposés (update) image par image contre hz.lT et hz.hd,
//     à partir de l'état du saut (hz.jT) et des hauteurs des os toes_02 (hz.hv) exportés par le web, tous scénarios ;
//  3. recentrage du siège : x de S dans le repère du cheval = lissage (12/s) du milieu des ancres d'étrier, recalculées
//     dans le repère du cheval depuis hz.an et hz.S, hz.H, à partir de la deuxième image ;
//  4. orientation du siège : S dans H = Euler 'YXZ' (−dPitch, 0, inclinaison de la vue mx.rz), tangage seul inconnu ;
//  5. moindres carrés affines (conversion d'axes du composant) sur une similitude connue, avec symétrie ;
//  6. (étape M3) phase de foulée lue par le cavalier (StridesCore/HorsePhase) : calage des clips (align, leadSwap) recalculé
//     depuis les appuis relevés dans le jeu (Content/Data/pjl_horse_phase.json) contre la sortie du calage du jeu ; puis,
//     à chaque image d'O1, horse.anim.phase retrouvée depuis le temps du clip d'allure du mélangeur (mx.a), l'allure, la
//     main, la vitesse et le saut (hz), contre hz.ph ; hors réécriture (arrêt, saut), écart de la phase tenue relevé.
// Usage : strides_horse_tack_tests <oracles/monte> <Content/Data>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

#include "StridesCore/HorsePhase.h"
#include "StridesCore/HorseTack.h"
#include "StridesCore/MiniJson.h"

using namespace strides::tack;

static int g_checks = 0, g_fail = 0;
#define CHECK(cond, ...)                                    \
  do {                                                      \
    g_checks++;                                             \
    if (!(cond)) {                                          \
      g_fail++;                                             \
      if (g_fail < 25) {                                    \
        std::printf("ÉCHEC %s:%d : ", __FILE__, __LINE__);  \
        std::printf(__VA_ARGS__);                           \
        std::printf("\n");                                  \
      }                                                     \
    }                                                       \
  } while (0)

static std::string ORA, DATA;
static const char* RUNS[] = {"E1", "E1b", "E2g", "E2d", "E3", "E3b", "E6t", "E6v"};

static V3 v3(const J& a) { return {a[0].num(), a[1].num(), a[2].num()}; }
static double dist(const V3& a, const V3& b) { return std::sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) + (a.z - b.z) * (a.z - b.z)); }
static Q4 qmul(const Q4& a, const Q4& b) {
  return {a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y, a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
          a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x, a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z};
}
static Q4 conj(const Q4& q) { return {-q.x, -q.y, -q.z, q.w}; }
// S dans H : position et orientation du siège dans le repère du cheval, depuis les deux poses monde de hz.
static void seatInHolder(const J& hz, V3& pos, Q4& q) {
  const J& S = hz["S"];
  const J& H = hz["H"];
  const Q4 qs{S[3].num(), S[4].num(), S[5].num(), S[6].num()}, qh{H[3].num(), H[4].num(), H[5].num(), H[6].num()};
  pos = rotate(conj(qh), {S[0].num() - H[0].num(), S[1].num() - H[1].num(), S[2].num() - H[2].num()});
  q = qmul(conj(qh), qs);
}
static double angleBetween(const Q4& a, const Q4& b) {
  const double d = std::fabs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  return 2 * std::acos(std::min(1.0, d));
}

static void testRest(const TackModel& m) {
  CHECK(m.bones.size() >= 4 && m.jointNames.size() == 419, "%zu os utilisés, %zu articulations", m.bones.size(), m.jointNames.size());
  CHECK(m.flank.size() == 450 && m.crest.size() == 288, "%zu + %zu sommets", m.flank.size(), m.crest.size());
  const J o = loadJson(ORA + "/o1/E1.json");
  const J& rest = o["setup"]["pjlRest"];
  std::vector<Affine> skin(m.bones.size(), innerAffine(m));
  double worst = 0;
  for (int a : {IronL, IronR}) {
    const V3 got = skinPoint(m.anchors[a], skin), want = v3(rest[anchorName(a)]);
    worst = std::max(worst, dist(got, want));
    CHECK(dist(got, want) < 1e-9, "repos %s : %.3e m de pjlRest", anchorName(a), dist(got, want));
  }
  // Articulations : la transformée de peau appliquée à la position de repos donne la position posée (ici : repos).
  const V3 sp = apply(skin[m.spine04], m.jointRest[m.spine04]);
  CHECK(sp.y > 1.0 && sp.y < 2.0, "garrot au repos à %.3f m du sol (repère du cheval du web)", sp.y);
  std::printf("repos : ancres d'étrier à %.2e m de pjlRest d'O1 ; garrot (spine_04) à %.4f m, bassin à %.4f m du sol du web\n", worst, sp.y,
              apply(skin[m.pelvis], m.jointRest[m.pelvis]).y);
}

static void testLandHind(const TackModel& m) {
  int frames = 0, hdTrue = 0, hdFirst = 0;
  double landWorst = 0;
  for (const char* id : RUNS) {
    const J o = loadJson(ORA + "/o1/" + id + ".json");
    const double dt = o["setup"]["dt"].num();
    TackState s = freshState(m);
    // Image de mise en place (non exportée) : cheval WildMesh neuf, au sol (pjlHorse.js constructeur : landT = 9).
    landStep(s, false, dt);
    bool prevHd = false;
    for (const J& f : o["frames"].a) {
      const J& hz = f["hz"];
      const bool jumping = hz["jT"].num() >= 0;
      landStep(s, jumping, dt);
      const double toes[2] = {hz["hv"][2].num(), hz["hv"][3].num()};
      hindStep(m, s, jumping, toes);
      const double e = std::fabs(s.landT - hz["lT"].num());
      landWorst = std::max(landWorst, e);
      CHECK(e < 1e-9, "%s image %d : landT %.9f, web %.9f", id, (int)f["f"].num(), s.landT, hz["lT"].num());
      CHECK(s.hindDown == (hz["hd"].t == J::Bool && hz["hd"].b), "%s image %d : hindDown %d, web %d", id, (int)f["f"].num(), s.hindDown, hz["hd"].b);
      if (s.hindDown && !prevHd) hdFirst++;
      prevHd = s.hindDown;
      hdTrue += s.hindDown;
      frames++;
    }
  }
  CHECK(hdFirst >= 2, "postérieurs reposés détectés dans %d scénarios (E3 et E3b attendus)", hdFirst);
  std::printf("réception et postérieurs : %d images, landT à %.1e s, hindDown identique à chaque image (%d images vraies, %d poses)\n", frames, landWorst, hdTrue,
              hdFirst);
}

static void testSeatFromO1(const TackModel& m) {
  int frames = 0;
  double recWorst = 0, rollWorst = 0;
  for (const char* id : RUNS) {
    const J o = loadJson(ORA + "/o1/" + id + ".json");
    const double dt = o["setup"]["dt"].num();
    double seatX = 0;
    bool has = false;
    for (const J& f : o["frames"].a) {
      const J& hz = f["hz"];
      V3 p;
      Q4 q;
      seatInHolder(hz, p, q);
      // Ancres d'étrier de cette image, repère du cheval : S · an.
      const V3 a = rotate(q, v3(hz["an"]["ironL"])), b = rotate(q, v3(hz["an"]["ironR"]));
      const double mid = ((a.x + p.x) + (b.x + p.x)) * 0.5;
      if (has) {
        seatX = seatX + (mid - seatX) * (1 - std::exp(-m.recenterDamp * dt));
        const double e = std::fabs(seatX - p.x);
        recWorst = std::max(recWorst, e);
        CHECK(e < 1e-9, "%s image %d : x du siège %.9f, web %.9f", id, (int)f["f"].num(), seatX, p.x);
      }
      // Seed : x de S à la première image (l'état de l'image de mise en place n'est pas exporté).
      seatX = has ? seatX : p.x;
      has = true;
      // Orientation : S dans H = Euler YXZ (−dPitch, 0, rz) ; tangage tiré de q, inclinaison de la vue imposée.
      const double rz = f["mx"]["rz"].num();
      const double pitchHalf = std::atan2(q.x, q.w);  // q = (s1 c3, −s1 s3, c1 s3, c1 c3) : x/w = tan(x/2) si y = 0
      const Q4 want = eulerYXZ(2 * pitchHalf, 0, rz);
      const double e = angleBetween(q, want);
      rollWorst = std::max(rollWorst, e);
      CHECK(e < 1e-7, "%s image %d : orientation du siège à %.3e rad de Euler YXZ (tangage, 0, rz)", id, (int)f["f"].num(), e);
      frames++;
    }
  }
  std::printf("siège depuis O1 : %d images ; recentrage (lissage %.0f/s) à %.1e m ; orientation = Euler YXZ (tangage, 0, inclinaison) à %.1e rad\n", frames,
              m.recenterDamp, recWorst, rollWorst);
}

static void testFit() {
  // Similitude connue (échelle 0,37, rotation, symétrie x ↔ −x, translation) sur des points quelconques.
  const double c = std::cos(0.7), s = std::sin(0.7), k = 0.37;
  Affine A;
  const double v[12] = {-k * c, -k * s, 0, 3.5, -k * s, k * c, 0, -1.25, 0, 0, k, 0.5};  // déterminant −k³
  for (int i = 0; i < 12; i++) A.m[i] = v[i];
  std::vector<V3> from, to;
  for (int i = 0; i < 50; i++) {
    const V3 p{std::sin(i * 1.3) * 40, std::cos(i * 0.7) * 25, std::sin(i * 0.31 + 1) * 60};
    from.push_back(p);
    to.push_back(apply(A, p));
  }
  Affine B;
  double rms = 1;
  CHECK(fitAffine(from, to, B, rms), "moindres carrés affines");
  double e = 0;
  for (int i = 0; i < 12; i++) e = std::max(e, std::fabs(A.m[i] - B.m[i]));
  CHECK(e < 1e-9 && rms < 1e-9, "affine retrouvée à %.2e (rms %.2e)", e, rms);
  CHECK(det3(B) < 0, "symétrie détectée (déterminant %.4f)", det3(B));
  const Affine I = compose(invert(B), A);
  double ei = 0;
  for (int i = 0; i < 12; i++) ei = std::max(ei, std::fabs(I.m[i] - (i % 5 == 0 ? 1.0 : 0.0)));
  CHECK(ei < 1e-12, "inverse : B⁻¹ ∘ A = identité à %.2e", ei);
  std::vector<V3> flat(from.begin(), from.begin() + 3);
  CHECK(!fitAffine(flat, flat, B, rms), "système dégénéré refusé");
  std::printf("moindres carrés affines : similitude avec symétrie retrouvée à %.1e\n", e);
}

// Écart circulaire entre deux phases (0..0,5).
static double phaseGap(double a, double b) {
  double d = std::fmod(std::fabs(a - b), 1.0);
  return d > 0.5 ? 1 - d : d;
}

static void testPhase() {
  using namespace strides::phase;
  PhaseModel m = phaseModelFromJson(loadJson(DATA + "/pjl_horse_phase.json"));
  calibrate(m);
  CHECK(m.postAssignments == 0, "riderPostOffset affecté %d fois dans src/ (0 attendu : décalage nul)", m.postAssignments);
  CHECK(m.leadSwap == m.webLeadSwap, "leadSwap %d, jeu %d", (int)m.leadSwap, (int)m.webLeadSwap);
  CHECK(m.align.size() == 6 && m.webAlign.size() == m.align.size(), "%zu clés calées, %zu dans le jeu", m.align.size(), m.webAlign.size());
  double alignWorst = 0;
  for (const auto& [k, w] : m.webAlign) {
    const auto it = m.align.find(k);
    const bool have = it != m.align.end();
    CHECK(have && it->second.ok == w.ok, "align[%s] : présence %d, jeu %d", k.c_str(), have && it->second.ok, (int)w.ok);
    if (!have || !w.ok || !it->second.ok) continue;
    const double d = std::max(std::fabs(it->second.off - w.off), std::fabs(it->second.res - w.res));
    alignWorst = std::max(alignWorst, d);
    CHECK(d <= 1e-12, "align[%s] : off %.15g (jeu %.15g), res %.15g (jeu %.15g)", k.c_str(), it->second.off, w.off, it->second.res, w.res);
  }
  std::printf("phase : calage des clips recalculé depuis les appuis du jeu, écart à la sortie du jeu %.2e (6 clés, leadSwap %d)\n", alignWorst, (int)m.leadSwap);
  int frames = 0, rewritten = 0, noClip = 0;
  double worst = 0, heldWorst = 0;
  std::string worstAt, heldAt;
  int heldN = 0;
  for (const char* run : RUNS) {
    const J o = loadJson(ORA + "/o1/" + run + ".json");
    const std::vector<J>& F = o["frames"].a;
    PhaseState st;
    // Phase avant la première image exportée (mise en place du web) : celle de l'image 0 (état repris, déclaré).
    st.animPhase = F.at(0)["hz"]["ph"].num();
    for (size_t i = 0; i < F.size(); i++) {
      const J& hz = F[i]["hz"];
      const J& mx = F[i]["mx"];
      std::string clip;
      double cp = 0;
      for (const J& a : mx["a"].a) {
        const std::string& n = a[0].s;
        const std::string fam = clipFamily(n);
        const auto c = m.contacts.find(n);
        // Clip d'allure de durée connue (clips d'origine et miroirs ; les variantes de virage ont leur propre durée).
        if (fam.empty() || c == m.contacts.end()) continue;
        clip = n;
        cp = a[2].num() / c->second.duration;
        break;
      }
      noClip += clip.empty() && hz["gait"].s != "idle";
      // Main du jeu : hz.lead = A.lead de la locomotion (> 0 : à gauche), leadDest de pjlHorse.js.
      const double got = phaseStep(m, st, hz["gait"].s, clip, cp, hz["v"].num(), hz["lead"].num() > 0 ? 'L' : 'R', hz["jT"].num() >= 0);
      const double want = hz["ph"].num(), d = phaseGap(got, want);
      char at[64];
      std::snprintf(at, sizeof at, "%s image %d", run, (int)F[i]["f"].num());
      if (st.rewritten) {
        rewritten++;
        if (d > worst) worst = d, worstAt = at;
        CHECK(d <= 1e-9, "%s : phase %.12f, web %.12f (%s, %s)", at, got, want, hz["gait"].s.c_str(), clip.c_str());
      } else {
        heldN++;
        if (d > heldWorst) heldWorst = d, heldAt = at;
        st.animPhase = got;  // phase tenue (locomotion procédurale du web non portée)
      }
      frames++;
    }
  }
  CHECK(rewritten > 500, "%d images réécrites sur %d", rewritten, frames);
  std::printf("phase : %d images d'O1 (8 scénarios), %d réécrites depuis le temps du clip : écart max %.2e (%s) ; %d tenues (arrêt, saut, allure "
              "sans calage) : écart max de la phase tenue à hz.ph %.4f (%s, information) ; %d images d'allure sans clip de base\n",
              frames, rewritten, worst, worstAt.c_str(), heldN, heldWorst, heldAt.c_str(), noClip);
}

int main(int argc, char** argv) {
  if (argc < 3) {
    std::printf("usage : %s <oracles/monte> <Content/Data>\n", argv[0]);
    return 2;
  }
  ORA = argv[1];
  DATA = argv[2];
  try {
    const TackModel m = tackModelFromFile(DATA + "/pjl_horse_tack.json");
    testRest(m);
    testLandHind(m);
    testSeatFromO1(m);
    testFit();
    testPhase();
  } catch (const std::exception& ex) {
    std::printf("ÉCHEC : exception %s\n", ex.what());
    return 1;
  }
  std::printf("monte-cheval : %d vérifications, %d échecs\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
