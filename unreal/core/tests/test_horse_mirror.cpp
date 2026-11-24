// Étape M2 de l'essai de monte (voie A) : clips miroir du cheval WildMesh (StridesCore/HorseMirror) contre le jeu web.
//  - oracle miroir (tests/oracles/monte/miroir, scripts/unreal/export-horse-mirror.mjs) : squelette, pose idle à 0,5 s,
//    poses des 11 clips source posées par le mélangeur three.js, clips « _M » cuits par le jeu ; la cuisson C++ est
//    nourrie des poses source du web et doit redonner les clips du jeu ;
//  - oracle O1 (tests/oracles/monte/o1) : main au galop (hz.lead) depuis le virage lissé (mx.s.turnRate), fondu de main
//    (mx.lb) depuis la main des clips (mx.s.lead), saut en miroir (mx.jm) au départ du saut.
// Tolérances (justification) : le web range les clips cuits en Float32Array ; un écart d'arrondi des fonctions de la
// bibliothèque mathématique (sqrt et divisions : aucune ; seules les additions et produits suivent l'ordre du web) ne
// peut changer qu'un ulp flottant 32 bits. Seuils : 1e-6 sur les quaternions (≈ 16 ulp à 1) et 1e-6 m sur les positions
// (≈ 25 ulp des plus longues translations locales, ~50 unités de la scène du GLB à 0,0104 m par unité). On compte aussi
// les valeurs identiques au bit près.
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <set>
#include <string>
#include <vector>

#include "StridesCore/HorseMirror.h"
#include "StridesCore/MiniJson.h"

using namespace strides::mirror;

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

static std::string ORA;
// Échelle du web (m par unité de la scène du GLB, asset.scale relu dans la page : Content/Data/pjl_horse_tack.json
// inner.scale), pour exprimer les écarts en mètres.
static double g_scale = 0;

template <typename T>
static std::vector<T> readBin(const std::string& path) {
  std::ifstream f(path, std::ios::binary);
  if (!f) throw std::runtime_error("fichier illisible : " + path);
  f.seekg(0, std::ios::end);
  const size_t n = static_cast<size_t>(f.tellg());
  f.seekg(0);
  std::vector<T> v(n / sizeof(T));
  f.read(reinterpret_cast<char*>(v.data()), static_cast<std::streamsize>(v.size() * sizeof(T)));
  if (n % sizeof(T)) throw std::runtime_error("taille inattendue : " + path);
  return v;
}

static Xf xf(const J& j) {
  Xf x;
  for (int k = 0; k < 3; k++) x.p[k] = j["p"][k].num(), x.s[k] = j["s"][k].num();
  for (int k = 0; k < 4; k++) x.q[k] = j["q"][k].num();
  return x;
}

static Rig rigFrom(const J& R) {
  Rig rig;
  const size_t n = R["names"].a.size();
  for (size_t i = 0; i < n; i++) {
    rig.names.push_back(R["names"][i].s);
    rig.parent.push_back(static_cast<int>(R["parent"][i].num()));
    rig.rest.push_back(xf(R["rest"][i]));
    Mat4 m;
    if (!R["parentWorld"][i].isNull())
      for (int k = 0; k < 16; k++) m.e[k] = R["parentWorld"][i][k].num();
    rig.parentWorld.push_back(m);
  }
  return rig;
}

static void testMirror() {
  const J H = loadJson(ORA + "/miroir/index.json");
  CHECK(H["schema"].s == "strides.oracle.horse_mirror/1", "schéma %s", H["schema"].s.c_str());
  CHECK(static_cast<int>(H["fps"].num()) == kBakeFps, "FPS du web %g, port %d", H["fps"].num(), kBakeFps);
  // Liste des clips cuits (relue dans asset.js par l'exporteur) = liste du port, dans le même ordre.
  const std::vector<std::string>& src = mirroredSources();
  CHECK(H["sources"].a.size() == src.size(), "%zu clips cuits par le web, %zu dans le port", H["sources"].a.size(), src.size());
  for (size_t i = 0; i < src.size() && i < H["sources"].a.size(); i++) CHECK(H["sources"][i].s == src[i], "clip %zu : %s / %s", i, H["sources"][i].s.c_str(), src[i].c_str());

  const Rig rig = rigFrom(H["rig"]);
  CHECK(rig.names.size() == 419 && static_cast<int>(H["boneCount"].num()) == 419, "%zu os", rig.names.size());
  const std::vector<int> pairs = pairIndices(rig);
  int paired = 0, invol = 0;
  for (size_t i = 0; i < pairs.size(); i++) {
    paired += pairs[i] != static_cast<int>(i);
    invol += pairs[pairs[i]] == static_cast<int>(i);
  }
  CHECK(invol == static_cast<int>(pairs.size()), "paires réciproques : %d sur %zu", invol, pairs.size());
  std::printf("squelette : %zu os, %d os appariés gauche/droite (%d paires), %d os sur le plan\n", rig.names.size(), paired, paired / 2,
              static_cast<int>(rig.names.size()) - paired);

  // Plan de symétrie depuis la pose idle à 0,5 s du web ; positions monde des bras contre three.js.
  std::vector<Xf> idle;
  for (const J& b : H["idle"]["local"].a) idle.push_back(xf(b));
  Plane pl;
  CHECK(symmetryPlane(rig, idle, pl), "bras upperarm_l et upperarm_r trouvés");
  const std::vector<Mat4> w = worldMatrices(rig, idle);
  double armGap = 0;
  int arms = 0;
  for (const auto& kv : H["idle"]["upperarm"].o) {
    for (size_t i = 0; i < rig.names.size(); i++)
      if (rig.names[i] == kv.first) {
        for (int k = 0; k < 3; k++) armGap = std::max(armGap, std::fabs(w[i].e[12 + k] - kv.second[k].num()));
        arms++;
      }
  }
  CHECK(arms == 2 && armGap == 0, "positions monde des bras = three.js au bit près (%d bras, écart %.3g)", arms, armGap);
  std::printf("plan de symétrie : n = (%.9f, %.9f, %.9f), d = %.6f unités ; bras identiques à three.js (écart %.1g)\n", pl.n[0], pl.n[1], pl.n[2], pl.d, armGap);
  const Mat4 S = reflection(pl);

  // Clips miroir du web, par nom.
  std::set<std::string> webNames, portNames;
  for (const J& m : H["mirrored"].a) webNames.insert(m["name"].s);
  int clips = 0;
  double worstP = 0, worstQ = 0;
  long exact = 0, total = 0;
  std::string worstPWhere, worstQWhere;
  for (const J& s : H["src"].a) {
    const std::string name = s["name"].s;
    const std::string mName = mirroredName(name);
    portNames.insert(mName);
    const J* web = nullptr;
    for (const J& m : H["mirrored"].a)
      if (m["name"].s == mName) web = &m;
    CHECK(web != nullptr, "%s : clip miroir %s absent du web", name.c_str(), mName.c_str());
    if (!web) continue;
    const double dur = s["duration"].num();
    CHECK((*web)["duration"].num() == dur, "%s : durée du clip miroir %.9g, source %.9g", mName.c_str(), (*web)["duration"].num(), dur);
    // Instants et temps bouclés.
    const std::vector<double> t = bakeTimes(dur);
    CHECK(t.size() == s["times"].a.size(), "%s : %zu instants, web %zu", name.c_str(), t.size(), s["times"].a.size());
    for (size_t f = 0; f < t.size() && f < s["times"].a.size(); f++) {
      CHECK(t[f] == s["times"][f].num(), "%s : instant %zu", name.c_str(), f);
      const double ct = f == 0 ? t[0] : loopClipTime(t[f], dur);
      CHECK(ct == s["clipTime"][f].num(), "%s : temps du clip à l'instant %zu : %.9g, web %.9g", name.c_str(), f, ct, s["clipTime"][f].num());
    }
    // Poses source du web.
    const std::vector<double> vals = readBin<double>(ORA + "/miroir/" + s["file"].s);
    const std::vector<J>& an = s["animated"].a;
    size_t per = 0;
    for (const J& a : an) per += a[1].s == "q" ? 4 : 3;
    CHECK(vals.size() == per * t.size(), "%s : %zu valeurs source, %zu attendues", name.c_str(), vals.size(), per * t.size());
    if (vals.size() != per * t.size()) continue;
    const SourcePose source = [&](int f, double, std::vector<Xf>& pose) {
      size_t k = static_cast<size_t>(f) * per;
      for (const J& a : an) {
        Xf& x = pose[static_cast<size_t>(a[0].num())];
        double* d = a[1].s == "p" ? x.p : a[1].s == "q" ? x.q : x.s;
        const int n = a[1].s == "q" ? 4 : 3;
        for (int c = 0; c < n; c++) d[c] = vals[k++];
      }
      return true;
    };
    Clip out;
    CHECK(bakeMirror(rig, pairs, S, dur, source, out), "%s : cuisson", name.c_str());
    // Comparaison au clip du jeu.
    const std::vector<float> wv = readBin<float>(ORA + "/miroir/" + (*web)["file"].s);
    CHECK(out.times.size() == (*web)["times"].a.size(), "%s : %zu clés, web %zu", mName.c_str(), out.times.size(), (*web)["times"].a.size());
    for (size_t f = 0; f < out.times.size() && f < (*web)["times"].a.size(); f++)
      CHECK(static_cast<double>(out.times[f]) == (*web)["times"][f].num(), "%s : temps de la clé %zu", mName.c_str(), f);
    bool sameBones = out.bones.size() == (*web)["bones"].a.size();
    for (size_t j = 0; sameBones && j < out.bones.size(); j++) sameBones = out.bones[j] == static_cast<int>((*web)["bones"][j].num());
    CHECK(sameBones, "%s : os à pistes (%zu, web %zu)", mName.c_str(), out.bones.size(), (*web)["bones"].a.size());
    CHECK(wv.size() == out.values.size(), "%s : %zu valeurs, web %zu", mName.c_str(), out.values.size(), wv.size());
    if (!sameBones || wv.size() != out.values.size()) continue;
    const size_t nb = out.bones.size();
    for (size_t f = 0; f < out.times.size(); f++) {
      double eP = 0, eQ = 0;
      size_t bP = 0, bQ = 0;
      for (size_t j = 0; j < nb; j++) {
        const float* a = &out.values[(f * nb + j) * 7];
        const float* b = &wv[(f * nb + j) * 7];
        for (int c = 0; c < 7; c++) {
          const double e = std::fabs(static_cast<double>(a[c]) - b[c]);
          exact += std::memcmp(&a[c], &b[c], sizeof(float)) == 0;
          total++;
          if (c < 3 && e > eP) eP = e, bP = j;
          if (c >= 3 && e > eQ) eQ = e, bQ = j;
        }
      }
      const double eM = eP * g_scale;
      CHECK(eM <= 1e-6, "%s clé %zu : position à %.3g m (os %s)", mName.c_str(), f, eM, rig.names[out.bones[bP]].c_str());
      CHECK(eQ <= 1e-6, "%s clé %zu : quaternion à %.3g (os %s)", mName.c_str(), f, eQ, rig.names[out.bones[bQ]].c_str());
      if (eM > worstP) worstP = eM, worstPWhere = mName + " clé " + std::to_string(f) + " " + rig.names[out.bones[bP]];
      if (eQ > worstQ) worstQ = eQ, worstQWhere = mName + " clé " + std::to_string(f) + " " + rig.names[out.bones[bQ]];
    }
    // Lecture du clip cuit : aux temps des clés, la pose est la clé (LinearInterpolant, poids nul).
    std::vector<Xf> pose = rig.rest;
    double eKey = 0;
    for (size_t f = 0; f < out.times.size(); f++) {
      out.sample(out.times[f], pose);
      for (size_t j = 0; j < nb; j++)
        for (int c = 0; c < 7; c++) eKey = std::max(eKey, std::fabs((c < 3 ? pose[out.bones[j]].p[c] : pose[out.bones[j]].q[c - 3]) - out.values[(f * nb + j) * 7 + c]));
    }
    CHECK(eKey == 0, "%s : lecture aux temps des clés = clés (écart %.3g)", mName.c_str(), eKey);
    clips++;
  }
  CHECK(webNames == portNames, "noms des clips miroir : %zu dans le web, %zu dans le port, mêmes noms", webNames.size(), portNames.size());
  CHECK(clips == 11, "%d clips miroir comparés", clips);
  std::printf("clips miroir : %d clips comparés au jeu web, %ld valeurs dont %ld identiques au bit près (%.4f %%) ; écart max position %.3g m (%s), quaternion %.3g (%s)\n", clips,
              total, exact, total ? 100.0 * exact / total : 0.0, worstP, worstPWhere.c_str(), worstQ, worstQWhere.c_str());
}

static void testLead() {
  const char* RUNS[] = {"E1", "E1b", "E2g", "E2d", "E3", "E3b", "E6t", "E6v"};
  int frames = 0, switches = 0, jumps = 0;
  double eLb = 0;
  for (const char* id : RUNS) {
    const J O = loadJson(ORA + "/o1/" + id + ".json");
    const double dt = O["setup"]["dt"].num();
    const std::vector<J>& Fr = O["frames"].a;
    // Cheval remis à neuf par l'exporteur (état de l'animation neuf : A.lead = 1, A.leadHold = 0, anim.js:188) ; l'image
    // de mise en place (à l'arrêt, non exportée) ne change ni l'un ni l'autre ; le virage est H.lastTurn (mx.s.turnRate).
    LeadState st;
    bool wasJump = Fr[0]["hz"]["jT"].num() >= 0;
    for (size_t i = 0; i < Fr.size(); i++) {
      const J& F = Fr[i];
      const int before = st.lead;
      leadStep(st, F["mx"]["s"]["turnRate"].num(), dt);
      switches += st.lead != before;
      CHECK(st.lead == static_cast<int>(F["hz"]["lead"].num()), "%s image %zu : main %d, web %g", id, i, st.lead, F["hz"]["lead"].num());
      const char lead = clipLead(st.lead, false);
      CHECK(std::string(1, lead) == F["mx"]["s"]["lead"].s, "%s image %zu : main des clips %c, web %s", id, i, lead, F["mx"]["s"]["lead"].s.c_str());
      if (i == 0) continue;
      // Fondu : depuis la valeur du web à l'image précédente, avec la main des clips de cette image.
      const double lb = leadBlendStep(Fr[i - 1]["mx"]["lb"].num(), F["mx"]["s"]["lead"].s[0], dt);
      eLb = std::max(eLb, std::fabs(lb - F["mx"]["lb"].num()));
      CHECK(lb == F["mx"]["lb"].num(), "%s image %zu : leadBlend %.17g, web %.17g", id, i, lb, F["mx"]["lb"].num());
      // Saut en miroir choisi au départ du saut (view.js : jumping && !wasJumping).
      const std::string mode = F["mx"]["s"]["mode"].s;
      const bool jumping = mode == "takeoff" || mode == "air";
      if (jumping && !wasJump) {
        CHECK(F["mx"]["jm"].b == (F["mx"]["s"]["lead"].s == "L"), "%s image %zu : saut en miroir %d, main %s", id, i, F["mx"]["jm"].b, F["mx"]["s"]["lead"].s.c_str());
        jumps++;
      }
      wasJump = jumping;
      frames++;
    }
  }
  CHECK(jumps >= 2, "%d départs de saut vérifiés", jumps);
  std::printf("main au galop : %d images d'O1 rejouées, %d changements de main, leadBlend au bit près (écart %.3g), %d départs de saut (miroir selon la main)\n", frames,
              switches, eLb, jumps);
}

int main(int argc, char** argv) {
  if (argc < 3) {
    std::printf("usage : %s <oracles/monte> <Content/Data>\n", argv[0]);
    return 2;
  }
  ORA = argv[1];
  try {
    g_scale = loadJson(std::string(argv[2]) + "/pjl_horse_tack.json")["inner"]["scale"].num();
    CHECK(g_scale > 0.009 && g_scale < 0.012, "échelle du web %.7g m par unité", g_scale);
    testMirror();
    testLead();
  } catch (const std::exception& ex) {
    std::printf("ÉCHEC : exception %s\n", ex.what());
    return 1;
  }
  std::printf("monte-miroir : %d vérifications, %d échecs\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
