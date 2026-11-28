// Étape S1 (sellerie complète) : étriers, étrivières et rênes du cheval WildMesh (StridesCore/HorseStraps) hors moteur,
// contre l'oracle sellerie/ (scripts/unreal/export-rider-rules.mjs --sellerie : relevé à l'appel de pjlHorse.js _straps,
// image par image, les huit scénarios d'O1 rejoués à l'identique).
// Ce que ce test prouve sans le moteur :
//  1. données : constantes de Content/Data/pjl_horse_tack_mesh.json (relues dans le source du web) cohérentes avec la page
//     (segments et demi-largeur des lanières relevés sur les objets Strap) ;
//  2. étrier tenu par le pied (horse.js _stirrupsFollow) : os d'étrier = orteil du cavalier abaissé de toeDrop · scale ;
//  3. _straps : visibilité, position et orientation des étriers, sommets des deux étrivières et des deux rênes (Float32Array
//     du web : le calcul en double arrondi en flottant 32 bits doit tomber à 1 ulp au plus), à chaque image ;
//  4. instants de lecture du web, que l'adaptateur Unreal reproduit : l'orteil lu est celui de la pose du cavalier de la
//     MÊME image (O1 cl, repère S de l'image) ; les poings (modèle réaliste, gripPoint) sont ceux de la pose de l'image
//     PRÉCÉDENTE (O1 rz, arrondi au millionième), dans le repère S de l'image courante.
// Non départagé ici (déclaré) : les rênes posées sur l'encolure (crestSide, reinSagFree) : aucun scénario d'O1 sans cavalier.
// Usage : strides_horse_straps_tests <oracles/monte> <Content/Data>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "StridesCore/HorseStraps.h"
#include "StridesCore/MiniJson.h"

using namespace strides::straps;

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

static V3 v3(const J& a) { return {a[0].num(), a[1].num(), a[2].num()}; }
static double dist(const V3& a, const V3& b) { return std::sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) + (a.z - b.z) * (a.z - b.z)); }
static V3 rot(const J& S, const V3& p) {
  const strides::tack::Q4 q{S[3].num(), S[4].num(), S[5].num(), S[6].num()};
  const V3 r = strides::tack::rotate(q, p);
  return {S[0].num() + r.x, S[1].num() + r.y, S[2].num() + r.z};
}
// Écart en ulp de flottant 32 bits entre une valeur du Float32Array du web et le calcul en double arrondi.
static long ulps(double web, double got) {
  const float a = (float)web, b = (float)got;
  int32_t ia, ib;
  std::memcpy(&ia, &a, 4);
  std::memcpy(&ib, &b, 4);
  if ((ia < 0) != (ib < 0)) return a == b ? 0 : 1000000;
  return std::labs((long)ia - (long)ib);
}

int main(int argc, char** argv) {
  if (argc < 3) {
    std::printf("usage : %s <oracles/monte> <Content/Data>\n", argv[0]);
    return 2;
  }
  const std::string ORA = argv[1], DATA = argv[2];
  try {
    const J data = loadJson(DATA + "/pjl_horse_tack_mesh.json");
    const StrapsModel m = strapsModelFromJson(data);
    CHECK(m.leather.n == (int)data["leather"]["n"].num() && m.leather.w == data["leather"]["w"].num(), "étrivières : source %d/%g, page %g/%g", m.leather.n, m.leather.w,
          data["leather"]["n"].num(), data["leather"]["w"].num());
    CHECK(m.rein.n == (int)data["rein"]["n"].num() && m.rein.w == data["rein"]["w"].num(), "rênes : source %d/%g, page %g/%g", m.rein.n, m.rein.w, data["rein"]["n"].num(),
          data["rein"]["w"].num());
    const J index = loadJson(ORA + "/sellerie/index.json");
    int frames = 0, shown = 0, held = 0, withHands = 0;
    long maxUlp = 0, exact = 0, values = 0;
    double dStir = 0, dIron = 0, dQ = 0, dToeNow = 0, dToePrev = 0, dHandPrev = 0, dHandNow = 0;
    for (const J& e : index["runs"].a) {
      const std::string id = e["id"].s;
      const J run = loadJson(ORA + "/sellerie/" + e["file"].s);
      const J o1 = loadJson(ORA + "/o1/" + id + ".json");
      const J& F = run["frames"];
      CHECK(F.a.size() == o1["frames"].a.size(), "%s : %zu images, O1 %zu", id.c_str(), F.a.size(), o1["frames"].a.size());
      const J& bones = o1["setup"]["bones"];
      int toeIdx[2] = {-1, -1};
      for (size_t b = 0; b < bones.a.size(); b++) {
        if (bones[b].s == "lToe") toeIdx[0] = (int)b;
        if (bones[b].s == "rToe") toeIdx[1] = (int)b;
      }
      const int nReal = o1["setup"]["real"].t == J::Obj ? (int)o1["setup"]["real"]["bones"].a.size() : -1;
      CHECK(toeIdx[0] >= 0 && toeIdx[1] >= 0 && nReal > 0, "%s : os lToe, rToe ou modèle réaliste absents d'O1", id.c_str());
      StrapsOut out;
      for (size_t i = 0; i < F.a.size(); i++) {
        const J& st = F[i]["st"];
        CHECK(st.t == J::Obj, "%s image %zu : relevé de _straps absent", id.c_str(), i);
        if (st.t != J::Obj) continue;
        frames++;
        const J& in = st["in"];
        const J& fo = in["follow"];
        StrapsIn s;
        s.saddle = in["saddle"].b;
        s.hasCam = in["cam"].t == J::Arr;
        if (s.hasCam) s.cam = v3(in["cam"]);
        s.horseX = in["hp"][0].num();
        s.horseZ = in["hp"][1].num();
        s.holder = {in["hq"][0].num(), in["hq"][1].num(), in["hq"][2].num(), in["hq"][3].num()};
        const J& an = in["an"];
        const char* sd[2] = {"L", "R"};
        for (int k = 0; k < 2; k++) {
          s.bar[k] = v3(an[std::string("bar") + sd[k]]);
          s.bit[k] = v3(an[std::string("bit") + sd[k]]);
          s.ironAnchor[k] = v3(an[std::string("iron") + sd[k]]);
          s.inStirrup[k] = in["inS"].t == J::Arr && in["inS"][k].b && in["stir"][k].t == J::Arr;
          if (in["stir"][k].t == J::Arr) s.stirrup[k] = v3(in["stir"][k]);
          // 2. Étrier tenu par le pied : os d'étrier = orteil abaissé (dernier _stirrupsFollow avant l'appel).
          if (s.inStirrup[k]) {
            held++;
            CHECK(fo.t == J::Obj && fo["toe"][k].t == J::Arr, "%s image %zu : orteil non relevé", id.c_str(), i);
            if (fo.t == J::Obj && fo["toe"][k].t == J::Arr) {
              const V3 toe = v3(fo["toe"][k]);
              dStir = std::max(dStir, dist(stirrupUnderToe(m, toe, fo["scale"].num()), s.stirrup[k]));
              // 4. Orteil de la pose de cette image (O1 cl dans S de l'image) ; pour mémoire, celui de l'image précédente.
              dToeNow = std::max(dToeNow, dist(toe, rot(o1["frames"][i]["hz"]["S"], v3(o1["frames"][i]["cl"][toeIdx[k]]))));
              if (i > 0) dToePrev = std::max(dToePrev, dist(toe, rot(o1["frames"][i]["hz"]["S"], v3(o1["frames"][i - 1]["cl"][toeIdx[k]]))));
            }
          }
        }
        s.crest = v3(an["crest"]);
        // Image 0 : poings et rênes non exportés (non déterministes dans le web) : rênes non comparées à cette image.
        const bool noRein = i == 0 && in["hands"].isNull() && st["out"]["re"].isNull();
        s.hasHands = in["hands"].t == J::Arr;
        if (s.hasHands) {
          withHands++;
          for (int k = 0; k < 2; k++) {
            s.hand[k] = v3(in["hands"][k]);
            // 4. Poings : gripPoint du modèle réaliste à la pose de l'image précédente, repère S de l'image courante.
            if (i > 0 && o1["frames"][i - 1]["rz"].t == J::Arr) {
              const V3 g = v3(o1["frames"][i - 1]["rz"][nReal + k]);
              dHandPrev = std::max(dHandPrev, dist(s.hand[k], rot(o1["frames"][i]["hz"]["S"], g)));
              dHandNow = std::max(dHandNow, dist(s.hand[k], rot(o1["frames"][i]["hz"]["S"], v3(o1["frames"][i]["rz"][nReal + k]))));
            }
          }
        }
        // 3. _straps.
        strapsStep(m, s, out);
        const J& o = st["out"];
        CHECK(out.show == o["show"].b, "%s image %zu : visibilité %d, web %d", id.c_str(), i, out.show, o["show"].b);
        if (!o["show"].b) continue;
        shown++;
        for (int k = 0; k < 2; k++) {
          dIron = std::max(dIron, dist(out.iron[k], v3(o["ir"][k])));
          const J& q = o["iq"][k];
          dQ = std::max({dQ, std::fabs(out.ironQ[k].x - q[0].num()), std::fabs(out.ironQ[k].y - q[1].num()), std::fabs(out.ironQ[k].z - q[2].num()),
                         std::fabs(out.ironQ[k].w - q[3].num())});
          for (int which = 0; which < 2; which++) {
            const std::vector<V3>& got = which ? out.rein[k] : out.leather[k];
            if (which && noRein) continue;
            const J& web = (which ? o["re"] : o["le"])[k];
            CHECK(web.a.size() == 3 * got.size(), "%s image %zu : %zu valeurs, %zu sommets", id.c_str(), i, web.a.size(), got.size());
            if (web.a.size() != 3 * got.size()) continue;
            for (size_t v = 0; v < got.size(); v++) {
              const double g3[3] = {got[v].x, got[v].y, got[v].z};
              for (int c = 0; c < 3; c++) {
                const long u = ulps(web[3 * v + c].num(), g3[c]);
                values++;
                exact += u == 0;
                if (u > maxUlp) maxUlp = u;
                if (u > 1) CHECK(false, "%s image %zu, %s %d, sommet %zu : %ld ulp (web %.9g, C++ %.9g)", id.c_str(), i, which ? "rêne" : "étrivière", k, v, u,
                                 web[3 * v + c].num(), g3[c]);
              }
            }
          }
        }
      }
    }
    CHECK(frames == 929, "%d images relevées (929 dans O1)", frames);
    CHECK(shown > 900 && held > 1800 && withHands >= 921, "images affichées %d, étriers tenus %d, poings %d", shown, held, withHands);
    CHECK(dStir <= 1e-12, "os d'étrier = orteil abaissé de toeDrop · scale : écart %.3g m", dStir);
    CHECK(dIron <= 1e-12 && dQ <= 1e-15, "étriers : position %.3g m, orientation %.3g", dIron, dQ);
    CHECK(maxUlp <= 1, "lanières : %ld ulp au plus (flottants 32 bits du web)", maxUlp);
    CHECK(dToeNow <= 1e-9, "orteil lu = pose du cavalier de la même image : écart %.3g m", dToeNow);
    CHECK(dToePrev > 1e-3, "contrôle : l'orteil de l'image précédente s'écarte (%.3g m)", dToePrev);
    CHECK(dHandPrev <= 2e-6, "poings lus = gripPoint de l'image précédente dans S de l'image courante : écart %.3g m (rz au millionième)", dHandPrev);
    CHECK(dHandNow > 1e-3, "contrôle : les poings de la même image s'écartent (%.3g m)", dHandNow);
    std::printf("sellerie : %d images (%d affichées), %d étriers tenus, %d images avec poings ; étrier : os à %.2g m de l'orteil abaissé, position %.2g m, orientation %.2g ; "
                "lanières : %ld valeurs, %ld identiques au bit, %ld ulp au plus ; orteil lu à %.2g m de la pose de l'image (%.3g m de la précédente) ; "
                "poings à %.2g m de la pose précédente (%.3g m de celle de l'image)\n",
                frames, shown, held, withHands, dStir, dIron, dQ, values, exact, maxUlp, dToeNow, dToePrev, dHandPrev, dHandNow);
  } catch (const std::exception& ex) {
    std::printf("ÉCHEC : exception %s\n", ex.what());
    return 1;
  }
  std::printf("monte-sellerie : %d vérifications, %d échecs\n", g_checks, g_fail);
  return g_fail ? 1 : 0;
}
