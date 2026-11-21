// Classement simulé et bilan d'une manche de CSO (tranche T11) — portage de src/gameplay/ranking.js (simulateField,
// rankResults), du tirage mulberry32 de src/core/math.js:20-28 et de l'étape de bilan de courseSteps
// (src/gameplay/courses.js:372-424 : kicker, titre, grille, tableau du classement, boutons).
// Données : Content/Data/cso_ranking.json (FIRST_NAMES, LAST_NAMES de src/gameplay/data.js, HORSE_NAMES de ranking.js,
// exportés par scripts/unreal/export-data.mjs). Oracles : unreal/core/tests/oracles/cso_ranking.json (simulateField et
// rankResults appelés tels quels) et cso_result.json (cartes de bilan relevées dans le DOM du jeu web,
// scripts/unreal/export-cso-result.mjs) ; canal « bl » des exécutions de cso_runs/ (bilan d'une vraie partie).
// Dotation (prizes non vides : concours, trip.js) non portée : formatMoney et euros du web absents ; csoResultCard rejette
// une configuration avec dotation (exception), le Parcours du Pôle n'en a pas.
#pragma once
#include <cstdint>
#include <string>
#include <utility>
#include <vector>
#include "StridesCore/Api.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/Text.h"

struct J;

namespace strides {

// ToUint32 de l'ECMAScript (x >>> 0) : troncature vers zéro, modulo 2^32 ; NaN et infinis donnent 0.
STRIDESCORE_API uint32_t jsToUint32(double x);

// mulberry32(seed) de src/core/math.js : générateur à graine (entiers 32 bits, Math.imul), valeurs dans [0, 1[.
class STRIDESCORE_API Mulberry32 {
 public:
  explicit Mulberry32(double seed) : a_(jsToUint32(seed)) {}
  double next();

 private:
  uint32_t a_;
};

struct RankNames {
  std::vector<std::string> first, last, horses;  // FIRST_NAMES, LAST_NAMES (data.js), HORSE_NAMES (ranking.js)
};
STRIDESCORE_API RankNames rankNamesFromJson(const J& file);
STRIDESCORE_API bool rankNamesFromFile(const std::string& text, RankNames& out, std::string& err);

// Classe de l'épreuve (cls) : identifiant (« am2 » : 25 % de chances de 4 points de moins) et temps accordé.
struct RankClass {
  std::string id;
  double ta = 64;
};
// Engagé : « C. Martin » · cheval, points (fautes + pénalités de temps), chrono arrondi au centième, joueur (me).
struct RankEntry {
  std::string rider, horse;
  int faults = 0;
  double time = 0;
  bool me = false;
};
// simulateField(cls, seed, n) : n concurrents tirés par mulberry32(seed) (graine ≥ 0 : l'indice du cheval
// (i + floor(seed)) % 14 n'est pas défini au-dessous).
STRIDESCORE_API std::vector<RankEntry> simulateField(const RankClass& cls, double seed, int n, const RankNames& names);
// rankResults : tri stable (Array.prototype.sort de V8) par points puis chrono.
STRIDESCORE_API std::vector<RankEntry> rankResults(const std::vector<RankEntry>& list);

struct CsoResultInput {
  CsoRunState state;                // run.data.course au début du bilan
  std::string playerName;           // game.save.data.playerName
  bool hasHorse = true;             // horse()?.name || t('Cheval')
  std::string horseName;
  int timeAllowed = 64;
  std::string courseTitle;          // opts.title (clé) : repli de res.title
  CsoResultConfig result;
  bool rewarded = false;            // r.data.rewarded (dotation déjà reçue)
};
struct CsoResultRow {
  int rank = 0;                     // <td>k</td>
  std::string name, pts, time, prize;  // « rider · horse », ptsText, « dec(time, 2) s », dotation (vide)
  bool me = false;                  // <tr class="me">
};
struct CsoResultButton {
  std::string id, label;
  bool primary = false;
};
struct CsoResultCard {
  std::string kicker, title;
  std::vector<std::pair<std::string, std::string>> rows;  // grille .cso-pres (clé, valeur)
  std::vector<CsoResultRow> table;                        // tableau .cso-rank
  std::vector<CsoResultButton> buttons;                   // cso-retry, cso-train, cso-done
  bool out = false;                 // éliminé
  int rank = 0;                     // 0 : éliminé (rank null du web)
  int total = 0;                    // fautes + pénalités de temps
  int fieldSize = 0;                // ranked.length
  std::vector<RankEntry> ranked;
};
STRIDESCORE_API CsoResultCard csoResultCard(const CsoResultInput& in, const RankNames& names, const TextTable& tt, Lang lang);
// Entrées du bilan lues dans le déroulé (état de la manche, joueur et cheval, temps accordé, opts.result de la
// configuration) ; dotation jamais reçue (r.data.rewarded : sans dotation, toujours faux).
STRIDESCORE_API CsoResultInput csoResultInputOf(const CsoRun& run);

// Mise en page de la carte de bilan (contrôle adverse de T11) : flux CSS du corps défilable (src/styles.css:246-254,
// 350-355 ; classe more : src/ui/screens.js:151) reproduit à partir du relevé de base d'une langue et d'un viewport
// (Content/Data/cso_result_style.json : une ligne de texte par bloc, 8 lignes de tableau). Chaque bloc (kicker, titre,
// rangée de la grille, tableau) garde sa distance au bloc précédent du relevé ; sa hauteur suit son nombre de lignes de
// texte (rangée de la grille : sa case la plus haute) ; le tableau a une ligne de la hauteur relevée par engagé affiché ;
// ses colonnes se partagent la largeur du tableau en proportion de leur largeur maximale (texte le plus large +
// padding : table-layout auto quand la somme tient dans la largeur). scrollHeight = bas du tableau + padding-bottom du
// corps, arrondi au pixel ; more(scrollTop) : scrollHeight − scrollTop − clientHeight > 4. Boîtes en px CSS (x, y,
// largeur, hauteur). Contrôlé sur unreal/core/tests/oracles/cso_result_layout.json (testCsoResultLayout).
struct CsoBox {
  double x = 0, y = 0, w = 0, h = 0;
};
struct CsoResultLayoutBase {
  CsoBox body;                        // corps défilable (.card-body)
  double padBottom = 0;               // son padding-bottom
  double clientHeight = 0;            // sa hauteur visible
  CsoBox kicker, title;               // une ligne chacun
  std::vector<CsoBox> keys, values;   // cases de la grille, une ligne chacune
  CsoBox table;
  std::vector<CsoBox> rows;           // lignes relevées (contiguës, même hauteur)
  std::vector<double> cellPad;        // padding gauche + droit des cellules, par colonne
};
struct CsoResultLayoutIn {
  int kickerLines = 1, titleLines = 1;
  std::vector<int> keyLines, valueLines;      // lignes de chaque case de la grille
  std::vector<std::vector<double>> cellText;  // largeur du texte de chaque cellule, par ligne affichée du tableau
};
struct CsoResultLayout {
  CsoBox kicker, title, table;
  std::vector<CsoBox> keys, values, rows;
  std::vector<std::vector<CsoBox>> cells;
  int scrollHeight = 0;
  double clientHeight = 0;
  // Somme des largeurs maximales au-delà de la largeur du tableau : le navigateur répartit alors entre largeurs minimale
  // et maximale (non porté : répartition proportionnelle gardée).
  bool tooWide = false;
  double maxScroll() const;           // scrollTop maximal
  bool more(double scrollTop) const;  // classe more de la barre d'actions
};
STRIDESCORE_API CsoResultLayout csoResultLayout(const CsoResultLayoutBase& base, const CsoResultLayoutIn& in);

}  // namespace strides
