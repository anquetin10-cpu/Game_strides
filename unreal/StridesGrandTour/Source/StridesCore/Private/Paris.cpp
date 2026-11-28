// Grand Prix de Paris Indoor (StridesCore/Paris.h) : déroulé de PARIS_MISSION (src/gameplay/parisGP.js:85-336), étapes
// de trajet (src/gameplay/trip.js loadStep / driveStep / unloadStep), étapes génériques (src/gameplay/missions.js
// makeSteps : dialog, interact) et manches (courseSteps de src/gameplay/courses.js, par CsoRun intégré).
#include "StridesCore/Paris.h"

#include <algorithm>
#include <cmath>
#include <memory>

#include "StridesCore/CsoCourse.h"
#include "StridesCore/MathUtil.h"
#include "StridesCore/MiniJson.h"

namespace strides {

namespace {
const char* kWho = "Margot Delaunay · Grand Prix de Paris Indoor";
const char* kInitials = "MD";
std::string fill(const std::string& s, const std::vector<std::string>& v) { return fillTemplate(s, v); }
std::string d2(double v) { return dec(v, 2, Lang::Fr); }
std::string ord(int n) { return ordinal(n, Lang::Fr); }
double r100(double v) { return jsRoundHalfUp(v * 100) / 100; }
ParisPoint pt3(const J& o) {
  ParisPoint p;
  p.x = o["x"].num();
  p.z = o["z"].num();
  if (!o["r"].isNull()) p.r = o["r"].num();
  if (!o["h"].isNull()) p.h = o["h"].num();
  if (!o["rot"].isNull()) p.h = o["rot"].num();
  return p;
}
ParisRect rect(const J& o) {
  ParisRect r;
  r.x = o["x"].num();
  r.z = o["z"].num();
  if (!o["w"].isNull()) r.w = o["w"].num();
  if (!o["d"].isNull()) r.d = o["d"].num();
  if (!o["h"].isNull()) r.h = o["h"].num();
  if (!o["rot"].isNull()) r.rot = o["rot"].num();
  return r;
}
CsoRunLine line(const J& o) {
  CsoRunLine l;
  l.x = o["x"].num();
  l.z = o["z"].num();
  l.rot = o["rot"].num();
  l.w = o["w"].isNull() ? 7 : o["w"].num();
  return l;
}
ParisCourseData course(const J& c) {
  ParisCourseData o;
  o.id = c["id"].s;
  o.length = c["length"].num();
  o.start = line(c["start"]);
  o.finish = line(c["finish"]);
  for (const J& f : c["fences"].a) {
    ParisFenceData x;
    x.num = (int)f["num"].num();
    x.label = f["label"].s;
    x.kind = f["kind"].s;
    x.spread = f["spread"].isNull() ? 0 : f["spread"].num();
    x.x = f["x"].num();
    x.z = f["z"].num();
    x.rot = f["rot"].num();
    x.h = f["h"].num();
    x.lineS = f["lineS"].isNull() ? 0 : f["lineS"].num();
    o.fences.push_back(x);
  }
  for (const J& p : c["line"].a) o.line.push_back({p[0].num(), p[1].num()});
  o.design = courseDesignFromJson(c["design"]);
  return o;
}
}  // namespace

std::vector<double> ParisCourseData::heights(double h) const {
  std::vector<double> out;
  for (const ParisFenceData& f : fences) {
    const auto it = design.profile.find(f.label);
    out.push_back(jsRoundHalfUp((h + (it == design.profile.end() ? 0.0 : it->second)) * 100) / 100);
  }
  return out;
}

bool loadParisGp(const std::string& jsonText, ParisGpData& out, std::string& err) {
  try {
    const J r = JParser(jsonText).parse();
    const J& s = r["site"];
    ParisSite& S = out.site;
    S.x = s["x"].num();
    S.z = s["z"].num();
    S.y = s["y"].num();
    S.arena = rect(s["arena"]);
    S.hall = rect(s["hall"]);
    S.warmup = rect(s["warmup"]);
    S.stables = rect(s["stables"]);
    for (const J& st : s["stands"].a) S.stands.push_back(rect(st));
    S.door = pt3(s["door"]);
    S.doorW = s["door"]["w"].num();
    S.gate = pt3(s["gate"]);
    S.park = pt3(s["park"]);
    S.exit = pt3(s["exit"]);
    S.secretariat = pt3(s["secretariat"]);
    const J& a = r["a13"];
    out.a13.deauville = pt3(a["deauville"]);
    out.a13.paris = pt3(a["paris"]);
    out.a13.arriveDeauville = pt3(a["deauville"]["arrive"]);
    out.a13.arriveParis = pt3(a["paris"]["arrive"]);
    out.a13.km = (int)a["trip"]["km"].num();
    out.a13.minutes = (int)a["trip"]["minutes"].num();
    out.a13.fuelL = (int)a["trip"]["fuelL"].num();
    out.a13.aireDiesel = a["aire"]["prices"]["diesel"].num();
    const J& g = r["gp"];
    out.riders = (int)g["riders"].num();
    out.sprintPrize = (int)g["sprintPrize"].num();
    out.gpHour = (int)g["gpHour"].num();
    out.sprintTa = (int)g["sprint"]["ta"].num();
    out.sprintH = g["sprint"]["h"].num();
    out.railSeconds = g["sprint"]["railSeconds"].num();
    out.gpTa = (int)g["gp"]["ta"].num();
    out.gpH = g["gp"]["h"].num();
    out.joTa = (int)g["joTa"].num();
    out.xp = (int)g["xp"].num();
    out.bellDelay = (int)g["bellDelay"].num();
    out.gateR = g["gateR"].num();
    out.prizes.clear();
    for (const J& p : g["prizes"].a) out.prizes.push_back((int)p.num());
    out.sprint = course(r["courses"]["paris_sprint"]);
    out.gp = course(r["courses"]["paris_gp"]);
    out.warm.clear();
    for (const J& w : r["warm"].a) {
      ParisFenceData f;
      f.kind = w["kind"].s;
      f.x = w["x"].num();
      f.z = w["z"].num();
      f.rot = w["rot"].num();
      f.h = w["h"].num();
      out.warm.push_back(f);
    }
    return true;
  } catch (const std::exception& e) {
    err = e.what();
    return false;
  }
}

ParisRun::ParisRun(const ParisGpData& d, const MissionEvents& ev, const TextTable& text, std::string playerName, std::string horseName, double seed, int bib, std::string aid)
    : d_(d), ev_(ev), text_(text), player_(std::move(playerName)), horse_(std::move(horseName)), aid_(std::move(aid)), seed_(seed), bib_(bib) {
  if (horse_.empty()) horse_ = "ton cheval";
  rivals_ = parisRivals(ev_.paris, seed_);
  // parisGP.js steps : la liste du web (les étapes du Grand Prix et du barrage sont insérées pendant le déroulé).
  for (Step s : {Step::Invite, Step::Load, Step::Drive, Step::Ramp, Step::Unload, Step::Official, Step::Accred, Step::Welcome, Step::Mount, Step::Warm, Step::ShowSprint})
    steps_.push_back({s});
  steps_.push_back({Step::Round, Round::Sprint});
  for (Step s : {Step::SprintCard, Step::Presentation, Step::OrderDialog, Step::GpStart, Step::GpResults, Step::Podium}) steps_.push_back({s});
}

std::vector<CsoCall> ParisRun::takeHud() {
  std::vector<CsoCall> v;
  v.swap(hud_);
  return v;
}
std::vector<CsoCall> ParisRun::takeAudio() {
  std::vector<CsoCall> v;
  v.swap(audio_);
  return v;
}
bool ParisRun::takeCard(ParisCard& c) {
  if (!cardNew_) return false;
  cardNew_ = false;
  c = card_;
  return true;
}
bool ParisRun::takeResetWarm() {
  const bool r = resetWarm_;
  resetWarm_ = false;
  return r;
}
bool ParisRun::takeGameTime(double& t) {
  if (!newTime_) return false;
  newTime_ = false;
  t = gameTime_;
  return true;
}
std::string ParisRun::pt(int n) const { return jsInt(n) + " pt"; }  // « 4 pt » (invariable en français)

void ParisRun::openCard(ParisCard c) {
  card_ = std::move(c);
  cardOpen_ = true;
  cardNew_ = true;
}

void ParisRun::say(std::vector<std::string> lines) {
  // S.dialog (missions.js:39-53) : player.locked, hud.dialog, attente de la fermeture.
  dialog_.clear();
  CsoCall c;
  c.fn = "dialog";
  for (const std::string& l : lines) {
    dialog_.push_back({kWho, kInitials, l});
    c.args.push_back(S(std::string(kWho) + "|" + kInitials + "|" + l));
  }
  hud_.push_back(c);
  dialogOpen_ = true;
  dlgDone_ = false;
}

void ParisRun::begin() {
  // missions.start (missions.js:476-480) : grand message (titre en capitales, « Événement · Grand Prix »), son, puis la
  // première étape.
  hud("big", {S(jsUpper("Grand Prix de Paris Indoor")), S("Événement · Grand Prix"), N(2600)});
  audio("notify", {});
  next();
}

void ParisRun::next() {
  // Run.next (missions.js:189-203) : fin de l'étape, consigne effacée, étape suivante, GPS, astuce.
  hud("clearHint", {});
  i_++;
  stepT_ = 0;
  if (i_ >= (int)steps_.size()) {
    // missions.complete (missions.js:558-624) : note (def.rate), montant (payOverride ?? offer.pay ?? def.pay = 0),
    // pourboire de 10 % à 5 étoiles.
    stars_ = final_ == 1 ? 5 : final_ <= 3 ? 5 : final_ <= 10 ? 4 : 3;
    int pay = hasPay_ ? payOverride_ : 0;
    tip_ = stars_ == 5 && pay > 0 ? (int)jsRoundHalfUp(pay * 0.1) : 0;
    pay_ = pay + tip_;
    if (tip_) hud("toast", {S("Pourboire 5★ : +" + formatMoneyFr(tip_)), S("money")});
    // run.cleanup : consigne effacée, dialogue fermé.
    hud("clearHint", {});
    hud("closeDialog", {});
    dialogOpen_ = false;
    done_ = true;
    return;
  }
  startStep();
}

CsoRunConfig ParisRun::roundConfig(Round r) const {
  // courseSteps (parisGP.js:95-112) : porte des cavaliers, temps accordé, refus (2), barres (+4), entrée en piste
  // annoncée (dossard, Écurie du Val), cloche, ligne de départ, arrivée ; sans bilan (pas de opts.result) ; souple
  // (opts.soft : l'élimination arrête la manche, la mission continue).
  const ParisCourseData& c = r == Round::Sprint ? d_.sprint : d_.gp;
  CsoRunConfig cfg;
  for (const ParisFenceData& f : c.fences) cfg.fences.push_back({f.label, f.num});
  cfg.start = c.start;
  cfg.finish = c.finish;
  cfg.gateX = d_.site.gate.x;
  cfg.gateZ = d_.site.gate.z;
  cfg.gateR = d_.gateR;
  cfg.gateText = r == Round::Sprint ? "Entre en piste : passe la porte des cavaliers, à l’ouest de l’arène" : "Entre en piste : passe la porte des cavaliers";
  cfg.timeAllowed = r == Round::Sprint ? d_.sprintTa : r == Round::Gp ? d_.gpTa : d_.joTa;
  cfg.bellDelay = d_.bellDelay;
  cfg.soft = true;
  cfg.result = false;
  cfg.present = r != Round::Barrage;
  cfg.capacity = true;
  cfg.hopeless = r == Round::Sprint ? hopelessSprint_ : hopelessGp_;
  cfg.playerName = player_;
  cfg.horseName = horse_;
  cfg.stable = "Écurie du Val";
  cfg.bib = bib_;
  cfg.lang = Lang::Fr;
  cfg.aid = aid_;
  cfg.embedded = true;
  return cfg;
}

std::string ParisRun::loadState() const {
  // trip.js loadStep state() : rampe toujours relevée tant que le cheval n'est pas à bord (tk.rampClosed) ; chargement
  // sans séquence (tp.seq nul).
  if (cur_.horseAboard) return "done";
  if (cur_.mode == "drive") return "exit";
  if (jsHypot(cur_.hx - cur_.tkx, cur_.hz - cur_.tkz) > 30) return "bring";
  if (cur_.mode == "ride") return "dismount";
  return "open";
}
std::string ParisRun::unloadState() const {
  if (!cur_.horseAboard) return "done";
  if (cur_.mode == "drive") return "exit";
  if (!cur_.rampOpen) return "open";
  return "unload";
}

std::string ParisRun::farText(const std::string& txt, double px, double pz, double r) const {
  // missions.js far / withDist : au-delà de max(45, r + 30) m, « … · 120 m » ou « … · 1,2 km ».
  const double d = jsHypot(cur_.fx - px, cur_.fz - pz);
  if (d > std::max(45.0, r + 30)) return txt + " · " + (d >= 1000 ? dec(d / 1000, 1, Lang::Fr) + " km" : jsInt((long long)std::floor(d / 10 + 0.5) * 10) + " m");
  return std::string();
}

std::string ParisRun::text() const {
  if (done_ || i_ < 0 || i_ >= (int)steps_.size()) return std::string();
  const bool inParis = cur_.inParis;
  switch (step()) {
    case Step::Invite:
    case Step::Welcome:
    case Step::OrderDialog: return "…";
    case Step::Load: {
      if (inParis) return std::string();
      const std::string st = loadState();
      if (st == "exit") return "Arrête le camion et descends (ACTION)";
      if (st == "dismount") return fill("Descends de {0} pour le charger", {horse_});
      if (st == "open") return rampless_ ? fill("Monte au volant du camion : {0} embarque avec toi", {horse_}) : std::string("Ouvre la rampe arrière du camion");
      if (st == "bring") return fill("Ramène {0} jusqu’au camion (monte-le ou mène-le en main)", {horse_});
      return std::string();
    }
    case Step::Drive: {
      if (inParis) return std::string();
      if (!cur_.inTruck) return cur_.mode == "drive" ? "Gare-toi et monte au volant du camion" : "Monte au volant du camion";
      const double dd = jsHypot(cur_.tkx - d_.a13.deauville.x, cur_.tkz - d_.a13.deauville.z);
      return dd < d_.a13.deauville.r + 4 ? "Gare le camion et arrête-toi" : "Roule jusqu’à l’autoroute A13 — au bout de la route Est-Ouest";
    }
    case Step::Ramp: return inParis ? std::string() : "Arrêté sur la bretelle : prends l’autoroute vers Paris (bouton « Autoroute A13 »)";
    case Step::Unload: {
      const std::string st = unloadState();
      if (st == "exit") return "Gare-toi et descends du camion (ACTION à l’arrêt)";
      if (st == "open") return rampless_ ? std::string("Gare-toi et descends du camion (ACTION à l’arrêt)") : std::string("Ouvre la rampe arrière");
      if (st == "unload") return fill("Fais descendre {0}", {horse_});
      return std::string();
    }
    case Step::Official:
    case Step::ShowSprint:
    case Step::GpStart: return std::string();
    case Step::Accred: {
      const std::string base = "Accréditations — retire ton dossard (entrée du parking)";
      if (cur_.mode == "foot" || cur_.mode == "ride") return base;
      const std::string far = farText(base, d_.site.secretariat.x, d_.site.secretariat.z, 3.6);
      if (!far.empty()) return far;
      // modeHint('foot') au volant.
      return cur_.vehicle && !cur_.inTruck ? "Sors du véhicule (ACTION à l’arrêt)." : "Sors du camion (ACTION à l’arrêt).";
    }
    case Step::Mount: return cur_.mode == "ride" ? std::string() : fill("Selle et monte {0}", {horse_});
    case Step::Warm: return fill("Échauffe-toi au paddock de Paris : sauts {0}/2", {jsInt(std::min(2, warm_))});
    case Step::Round: return cso_ ? cso_->text() : std::string();
    case Step::SprintCard: return "Classement du Sprint…";
    case Step::Presentation: return "Présentation des cavaliers…";
    case Step::GpResults: return "Résultats du Grand Prix…";
    case Step::Podium: return "Podium…";
  }
  return std::string();
}

const char* ParisRun::kindName() const {
  if (done_) return "end";
  if (i_ < 0 || i_ >= (int)steps_.size()) return "";
  switch (step()) {
    case Step::Invite:
    case Step::Welcome:
    case Step::OrderDialog: return "dialog";
    case Step::Load: return "tload";
    case Step::Drive: return "tdrive";
    case Step::Unload: return "tunload";
    case Step::Accred: return "interact";
    case Step::Round:
      if (!cso_) return "";
      switch (cso_->step()) {
        case CsoStep::Goto: return "goto";
        case CsoStep::Course: return "course";
        default: return "";
      }
    default: return "";
  }
}

bool ParisRun::target(double& x, double& z) const {
  // Cibles du GPS des étapes (target).
  if (done_ || i_ < 0) return false;
  switch (step()) {
    case Step::Load:
      if (cur_.inParis) return false;
      if (loadState() == "dismount" || loadState() == "bring") { x = cur_.hx; z = cur_.hz; return true; }
      x = cur_.tkx; z = cur_.tkz; return true;
    case Step::Drive:
      if (cur_.inTruck) { x = d_.a13.deauville.x; z = d_.a13.deauville.z; }
      else { x = cur_.tkx; z = cur_.tkz; }
      return true;
    case Step::Ramp: x = d_.a13.deauville.x; z = d_.a13.deauville.z; return true;
    case Step::Unload: x = cur_.tkx; z = cur_.tkz; return true;
    case Step::Accred: x = d_.site.secretariat.x; z = d_.site.secretariat.z; return true;
    case Step::Mount: x = cur_.hx; z = cur_.hz; return true;
    case Step::Warm: x = d_.site.warmup.x; z = d_.site.warmup.z; return true;
    case Step::Round:
      if (cso_ && cso_->step() == CsoStep::Goto) { x = d_.site.gate.x; z = d_.site.gate.z; return true; }
      return false;
    default: return false;
  }
}

void ParisRun::closeDialog() {
  if (!dialogOpen_) return;
  dialogOpen_ = false;
  dlgDone_ = true;
}

bool ParisRun::interactAvailable(const ParisFrame& f) const {
  // S.interact(() => official.pos, …, { modes: ['foot', 'ride'], r: 3.6 }) : action proposée à moins de 3,6 m.
  if (done_ || step() != Step::Accred || interacted_) return false;
  if (f.mode != "foot" && f.mode != "ride") return false;
  return jsHypot(f.fx - d_.site.secretariat.x, f.fz - d_.site.secretariat.z) < 3.6;
}
bool ParisRun::interact(const ParisFrame& f) {
  if (step() != Step::Accred || interacted_) return false;
  (void)f;
  interacted_ = true;
  return true;
}

bool ParisRun::pressButton(const std::string& id) {
  if (cardOpen_ && card_.presentation && id == "enter") {
    cardOpen_ = false;
    if (cso_) cso_->enter();
    return true;
  }
  if (cardOpen_ && !card_.presentation && (id == "sprint-ok" || id == "gpparis-ok")) {
    cardOpen_ = false;
    ok_ = true;
    return true;
  }
  return false;
}

void ParisRun::warmEvent(CsoObstacleEventKind k) {
  // Écouteurs obstacle:clear et obstacle:fault de l'échauffement (obstacle.course === PARIS_WARM) ; le refus ne compte pas.
  if (!done_ && step() == Step::Warm && k != CsoObstacleEventKind::Refusal) warm_++;
}

void ParisRun::obstacleEvent(CsoObstacleEventKind k, const std::string& course, int num, int dir, const std::string& cause, const std::string& causeText, CsoCadence& cad) {
  if (course != (roundKind_ == Round::Sprint ? d_.sprint.id : d_.gp.id)) return;
  if (CsoRun* r = mutableRound()) r->obstacleEvent(k, num, dir, cause, causeText, cad);
}

void ParisRun::capacityClosed() {
  if (CsoRun* r = mutableRound()) r->closeCapacityDialog();
}

void ParisRun::startStep() {
  const StepDef sd = steps_[(size_t)i_];
  switch (sd.step) {
    case Step::Invite:
      say({fill("{0}, après ta victoire au Grand Prix CSI 5★, le Grand Prix de Paris Indoor t’invite : 40 couples d’élite, une arène couverte et un format pensé comme une course de Formule 1.", {player_}),
           "Le principe : un Sprint à 1,50 m, au chrono pur, décide de la grille de départ. Le soir, le Grand Prix à 1,60 m : le plus rapide du Sprint part en dernier. Barrage pour les sans-faute.",
           fill("Charge {0} dans le camion et prends l’autoroute A13, au bout de la route Est-Ouest. On t’attend au parking des camions.", {horse_})});
      break;
    case Step::Load:
      hud("hint", {S("À pied derrière le camion : <b>Ouvrir la rampe</b>, puis <b>Mener en main</b> et <b>Faire monter le cheval</b>."), N(7000)});
      break;
    case Step::Drive:
      hud("hint", {S("Accélère et freine en douceur, ralentis dans les virages : le <b>confort du cheval</b> compte."), N(6000)});
      break;
    case Step::Official:
      screen_ = {"GRAND PRIX DE PARIS INDOOR", "CE SOIR · 20 H", "40 couples · Sprint puis Grand Prix", ""};
      break;
    case Step::Accred: interacted_ = false; break;
    case Step::Welcome:
      say({fill("Bienvenue à Paris ! {0}, dossard n° {1}. Ton box est sous la tente des écuries provisoires.", {horse_, jsInt(bib_)}),
           "Échauffement au paddock, à l’ouest de l’arène : deux sauts, puis passe la porte des cavaliers. Le Sprint commence dès que tu entres en piste."});
      break;
    case Step::Warm:
      warm_ = 0;
      resetWarm_ = true;
      hud("hint", {S("Saute le vertical et l’oxer du paddock (au galop), puis rejoins la porte des cavaliers."), N(6000)});
      break;
    case Step::ShowSprint:
      shown_ = "paris_sprint";
      screen_ = {"SPRINT · 1,50 M", player_ + " · " + horse_, "Barème C · grille du Grand Prix", ""};
      break;
    case Step::Round: {
      roundKind_ = sd.round;
      cso_ = std::make_unique<CsoRun>(roundConfig(sd.round), text_);
      CsoRunFrame f;
      f.time = cur_.time;
      f.x = cur_.hx;
      f.z = cur_.hz;
      f.heading = cur_.heading;
      f.focusX = cur_.fx;
      f.focusZ = cur_.fz;
      f.riding = cur_.mode == "ride";
      f.driving = cur_.mode == "drive";
      f.inTruck = cur_.inTruck;
      f.vehicle = cur_.vehicle;
      cso_->prime(f);
      cso_->begin();
      break;
    }
    case Step::SprintCard: {
      // parisGP.js:162-191 : classement du Sprint (barème C), grille inverse, prime du vainqueur.
      const CsoRunState& st = sprintSt_;
      int rails = 0;
      for (const CsoRunLog& l : st.log) rails += l.kind == "rail";
      const double time = r100(st.t);
      const double score = st.eliminated ? 999 : r100(time + rails * d_.railSeconds);
      const std::vector<ParisSprint> field = sprintField(ev_.paris, rivals_, seed_);
      std::vector<double> scores;
      for (const ParisSprint& s : field) scores.push_back(s.score);
      scores.push_back(score);
      const int meIdx = (int)field.size();
      const std::vector<int> ranked = rankSprint(scores);
      const int rank = (int)(std::find(ranked.begin(), ranked.end(), meIdx) - ranked.begin()) + 1;
      sprintRank_ = rank;
      order_ = d_.riders + 1 - rank;
      if (rank == 1) {
        payOverride_ += d_.sprintPrize;
        hasPay_ = true;
        audio("cheer", {});
      }
      ok_ = false;
      ParisCard c;
      c.kicker = "Sprint · Grand Prix de Paris Indoor";
      c.title = st.eliminated ? "Éliminé du Sprint" : rank == 1 ? "Vainqueur du Sprint !" : fill("{0} du Sprint", {ord(rank)});
      c.rows = {{"Chrono", st.eliminated ? "—" : d2(time) + " s"},
                {"Barres", jsInt(rails) + " (+" + jsInt((long long)(rails * d_.railSeconds)) + " s)"},
                {"Temps retenu", st.eliminated ? "éliminé" : d2(score) + " s"},
                {"Grille du Grand Prix", fill("départ en {0} position sur {1}{2}", {ord(order_), jsInt(d_.riders), rank == 1 ? " (le dernier : la meilleure place)" : ""})}};
      std::vector<int> rows(ranked.begin(), ranked.begin() + std::min<size_t>(8, ranked.size()));
      if (std::find(rows.begin(), rows.end(), meIdx) == rows.end()) rows.push_back(meIdx);
      int n = 0;
      for (int idx : ranked) {
        if (std::find(rows.begin(), rows.end(), idx) == rows.end()) continue;
        ParisCardRow row;
        row.me = idx == meIdx;
        const std::string who = row.me ? player_ + " · " + horse_ : rivals_[(size_t)idx].rider + " · " + rivals_[(size_t)idx].horse;
        const int rl = row.me ? rails : field[(size_t)idx].rails;
        const double sc = scores[(size_t)idx];
        row.cells = {jsInt(++n), who, jsInt(rl) + " b.", sc > 900 ? "élim." : d2(sc) + " s"};
        c.table.push_back(row);
      }
      c.buttons = {"sprint-ok"};
      openCard(c);
      const double best = scores[(size_t)ranked[0]];
      const std::string bestName = ranked[0] == meIdx ? player_ : rivals_[(size_t)ranked[0]].rider;
      screen_ = {"SPRINT · RÉSULTATS", "1. " + bestName + " · " + d2(best) + " s", player_ + " : " + ord(rank), ""};
      break;
    }
    case Step::Presentation: {
      // parisGP.js:194-226 : soirée (20 h), tracé du Grand Prix, public, présentation de 3 cavaliers puis du joueur.
      const double day = std::floor(cur_.gameTime / 86400);
      const double hour = std::fmod(cur_.gameTime, 86400) / 3600;
      if (hour < d_.gpHour) {
        gameTime_ = day * 86400 + d_.gpHour * 3600;
        newTime_ = true;
      }
      shown_ = "paris_gp";
      audio("applause", {N(1.2), N(5)});
      intro_ = 0;
      names_.clear();
      for (size_t k = 0; k < 3 && k < rivals_.size(); k++) names_.push_back(rivals_[k].rider + " · " + rivals_[k].horse);
      names_.push_back(player_ + " · " + horse_);
      hud("big", {S("GRAND PRIX DE PARIS INDOOR"), S("20 h · Présentation des 40 cavaliers"), N(2600)});
      break;
    }
    case Step::OrderDialog: {
      const std::vector<ParisGpRow> gp = gpField(ev_.paris, rivals_, seed_);
      const int nb = std::max(0, std::min((int)gp.size(), order_ - 1));
      int nc = 0;
      for (int k = 0; k < nb; k++) nc += gp[(size_t)k].faults == 0;
      const std::string passed = nb > 1 ? fill("{0} couples sont passés", {jsInt(nb)}) : fill("{0} couple est passé", {jsInt(nb)});
      const std::string clears = nc > 1 ? fill("{0} sans-fautes", {jsInt(nc)}) : fill("{0} sans-faute", {jsInt(nc)});
      say({fill("Tu pars en {0} position. {1} Un sans-faute et tu es au barrage.", {ord(order_), nb ? passed + " : " + clears + " pour le barrage." : "Tu ouvres le bal !"})});
      break;
    }
    case Step::GpStart:
      screen_ = {"GRAND PRIX · 1,60 M", player_ + " · " + horse_, fill("Départ n° {0} sur {1}", {jsInt(order_), jsInt(d_.riders)}), ""};
      steps_.insert(steps_.begin() + i_ + 1, StepDef{Step::Round, Round::Gp});
      break;
    case Step::GpResults: {
      const CsoRunState& st = gpSt_;
      me_.faults = st.eliminated ? 99 : st.faults + st.timeFaults;
      me_.time = r100(st.t);
      field_ = gpField(ev_.paris, rivals_, seed_);
      int nc = 0;
      for (const ParisGpRow& r : field_) nc += r.faults == 0;
      if (me_.faults == 0 && nc) {
        barrage_ = true;
        hud("big", {S("BARRAGE !"), S(fill("{0} sans-faute · au chrono", {jsInt(nc + 1)})), N(2600)});
        audio("cheer", {});
        screen_ = {"BARRAGE", fill("{0} couples sans faute", {jsInt(nc + 1)}), "Le chrono décide", ""};
        steps_.insert(steps_.begin() + i_ + 1, StepDef{Step::Round, Round::Barrage});
      }
      break;
    }
    case Step::Podium: {
      // parisGP.js:256-300 : classement final (barrage d'abord), dotation des 10 premiers, podium, carte.
      struct Row { int idx; int faults; double time; bool jo = false; int joFaults = 0; double joTime = 0; };
      const int meIdx = (int)field_.size();
      std::vector<Row> ranked;
      if (barrage_) {
        const CsoRunState& st = joSt_;
        me_.joFaults = st.eliminated ? 99 : st.faults + st.timeFaults;
        me_.joTime = r100(st.t);
        std::vector<Row> jo, rest;
        size_t nClear = 0;
        for (const ParisGpRow& r : field_) nClear += r.faults == 0;
        const std::vector<ParisJoRow> j = barrageField(ev_.paris, nClear, seed_);
        size_t k = 0;
        for (size_t i = 0; i < field_.size(); i++) {
          if (field_[i].faults == 0) jo.push_back({(int)i, 0, field_[i].time, true, j[k].faults, j[k++].time});
          else rest.push_back({(int)i, field_[i].faults, field_[i].time});
        }
        jo.push_back({meIdx, me_.faults, me_.time, true, me_.joFaults, me_.joTime});
        std::stable_sort(jo.begin(), jo.end(), [](const Row& a, const Row& b) { return a.joFaults != b.joFaults ? a.joFaults < b.joFaults : a.joTime < b.joTime; });
        std::stable_sort(rest.begin(), rest.end(), [](const Row& a, const Row& b) { return a.faults != b.faults ? a.faults < b.faults : a.time < b.time; });
        ranked = jo;
        ranked.insert(ranked.end(), rest.begin(), rest.end());
      } else {
        for (size_t i = 0; i < field_.size(); i++) ranked.push_back({(int)i, field_[i].faults, field_[i].time});
        ranked.push_back({meIdx, me_.faults, me_.time});
        std::stable_sort(ranked.begin(), ranked.end(), [](const Row& a, const Row& b) { return a.faults != b.faults ? a.faults < b.faults : a.time < b.time; });
      }
      int rank = 0;
      for (size_t i = 0; i < ranked.size(); i++)
        if (ranked[i].idx == meIdx) rank = (int)i + 1;
      final_ = rank;
      const int prize = rank >= 1 && rank <= (int)d_.prizes.size() ? d_.prizes[(size_t)rank - 1] : 0;
      if (prize) {
        payOverride_ += prize;
        hasPay_ = true;
      }
      const bool top = rank <= 3;
      if (top) hud("big", {S(rank == 1 ? "VAINQUEUR DU GRAND PRIX DE PARIS" : fill("{0} PLACE · PODIUM", {ord(rank)})), S(fill("{0} et {1}", {player_, horse_})), N(3600)});
      const auto nameOf = [&](int idx) { return idx == meIdx ? player_ : rivals_[(size_t)idx].rider; };
      const auto horseOf = [&](int idx) { return idx == meIdx ? horse_ : rivals_[(size_t)idx].horse; };
      screen_ = {rank == 1 ? "VAINQUEUR" : "GRAND PRIX · CLASSEMENT", "1. " + nameOf(ranked[0].idx) + " · " + horseOf(ranked[0].idx), player_ + " : " + ord(rank), rank == 1 ? "PARIS !" : ""};
      const int dot = hasPay_ ? payOverride_ : 0;
      resultTitle_ = rank == 1 ? "Vainqueur du Grand Prix de Paris Indoor !" : fill("{0} du Grand Prix de Paris Indoor", {ord(rank)});
      resultBody_ = (barrage_ ? "Barrage : " + (me_.joFaults > 90 ? std::string("éliminé") : pt(me_.joFaults) + " en " + d2(me_.joTime) + " s") + " · " : std::string()) +
                    "Manche : " + (me_.faults > 90 ? std::string("éliminé") : pt(me_.faults) + " en " + d2(me_.time) + " s") + " · dotation " + formatMoneyFr(dot);
      ok_ = false;
      ParisCard c;
      c.kicker = "Grand Prix de Paris Indoor · 1,60 m";
      c.title = rank == 1 ? "Victoire à Paris !" : rank <= 3 ? fill("{0} place : sur le podium !", {ord(rank)}) : fill("{0} place", {ord(rank)});
      c.rows.push_back({"Grille", fill("départ en {0} position (Sprint : {1})", {ord(order_), ord(sprintRank_)})});
      c.rows.push_back({"Manche", me_.faults > 90 ? "éliminé" : pt(me_.faults) + " · " + d2(me_.time) + " s"});
      if (barrage_) c.rows.push_back({"Barrage", me_.joFaults > 90 ? "éliminé" : pt(me_.joFaults) + " · " + d2(me_.joTime) + " s"});
      c.rows.push_back({"Dotation", formatMoneyFr(dot)});
      std::vector<size_t> rows;
      for (size_t i = 0; i < ranked.size() && i < 10; i++) rows.push_back(i);
      if ((size_t)rank > 10) rows.push_back((size_t)rank - 1);
      int n = 0;
      for (size_t i : rows) {
        const Row& r = ranked[i];
        ParisCardRow row;
        row.me = r.idx == meIdx;
        row.cells = {jsInt(++n), nameOf(r.idx) + " · " + horseOf(r.idx), r.jo ? "JO " + pt(r.joFaults) + " " + d2(r.joTime) + " s" : r.faults > 90 ? "élim." : pt(r.faults), d2(r.time) + " s"};
        c.table.push_back(row);
      }
      c.buttons = {"gpparis-ok"};
      openCard(c);
      break;
    }
    default: break;
  }
}

bool ParisRun::updateStep(double dt, CsoCadence& cad) {
  (void)dt;
  const bool inParis = cur_.inParis;
  switch (step()) {
    case Step::Invite:
    case Step::Welcome:
    case Step::OrderDialog:
      if (dlgDone_) {
        dlgDone_ = false;
        return true;
      }
      return false;
    case Step::Load: return inParis || loadState() == "done";
    case Step::Drive:
      return inParis || (cur_.inTruck && jsHypot(cur_.tkx - d_.a13.deauville.x, cur_.tkz - d_.a13.deauville.z) < d_.a13.deauville.r && std::abs(cur_.tkSpeed) < 0.3);
    case Step::Ramp: return inParis;
    case Step::Unload: return unloadState() == "done";
    case Step::Official: return true;
    case Step::Accred: return interacted_;
    case Step::Mount: return cur_.mode == "ride";
    case Step::Warm: return warm_ >= 2;
    case Step::ShowSprint:
    case Step::GpStart:
    case Step::GpResults: return true;
    case Step::Round: {
      CsoRunFrame f;
      f.dt = dt;
      f.time = cur_.time;
      f.x = cur_.hx;
      f.z = cur_.hz;
      f.heading = cur_.heading;
      f.focusX = cur_.fx;
      f.focusZ = cur_.fz;
      f.riding = cur_.mode == "ride";
      f.driving = cur_.mode == "drive";
      f.inTruck = cur_.inTruck;
      f.vehicle = cur_.vehicle;
      const int before = cso_->stepIndex();
      // Le pas de la mission est déjà compté par Run.update : la manche reçoit le même dt.
      cso_->update(f, cad);
      for (CsoCall& c : cso_->takeHud()) hud_.push_back(c);
      for (CsoCall& c : cso_->takeAudio()) audio_.push_back(c);
      // Présentation de la manche (courses.js:116-138 showPresentation) : carte ouverte au début de l'étape.
      if (!cso_->finished() && cso_->step() == CsoStep::Presentation && cso_->stepIndex() != before) {
        const bool sprint = roundKind_ == Round::Sprint;
        const ParisCourseData& c = sprint ? d_.sprint : d_.gp;
        const double h = sprint ? d_.sprintH : d_.gpH;
        int firsts = 0;
        std::vector<std::string> pairs;
        for (const ParisFenceData& x : c.fences)
          if (!x.label.empty() && x.label.back() == 'A') {
            firsts++;
            pairs.push_back(x.label + " – " + x.label.substr(0, x.label.size() - 1) + "B");
          }
        std::string dbl;
        if (firsts > 1) {
          std::string j;
          for (size_t k = 0; k < pairs.size(); k++) j += (k ? ", " : "") + pairs[k];
          dbl = " dont " + jsInt(firsts) + " doubles (" + j + ")";
        } else if (firsts == 1) dbl = " dont un double (" + pairs[0] + ")";
        const std::string diff = h < 1.08 ? "facile" : h < 1.18 ? "moyenne" : h < 1.35 ? "difficile" : "très difficile";
        ParisCard pc;
        pc.presentation = true;
        pc.kicker = "EQUESTRIAN TOUR · Grand Prix de Paris Indoor";
        pc.title = sprint ? "Sprint · Grand Prix de Paris Indoor" : "Grand Prix de Paris Indoor";
        pc.rows = {{"Épreuve", sprint ? "Sprint 1,50 m · barème C (vitesse)" : "Grand Prix 1,60 m · barème A au chrono, barrage"},
                   {"Hauteur", d2(h) + " m · difficulté " + diff},
                   {"Cheval engagé", horse_},
                   {"Temps accordé", jsInt(cso_->config().timeAllowed) + " s"},
                   {"Parcours", jsInt((long long)c.fences.size() - firsts) + " obstacles" + dbl + " · " + jsInt((long long)c.length) + " m"}};
        pc.buttons = {"plan", "enter"};
        openCard(pc);
      }
      if (!cso_->finished()) return false;
      (roundKind_ == Round::Sprint ? sprintSt_ : roundKind_ == Round::Gp ? gpSt_ : joSt_) = cso_->state();
      return true;
    }
    case Step::SprintCard:
    case Step::Podium: return ok_;
    case Step::Presentation: {
      const int k = (int)std::floor(stepT_ / 1.6);
      if (k != intro_ && k >= 1 && k <= (int)names_.size()) {
        intro_ = k;
        const std::string& n = names_[(size_t)k - 1];
        const size_t sep = n.find(" · ");
        screen_ = {"PRÉSENTATION DES CAVALIERS", n, k == (int)names_.size() ? fill("Départ en {0} position", {ord(order_)}) : "", ""};
        hud("big", {S(jsUpper(n.substr(0, sep))), S(sep == std::string::npos ? std::string() : n.substr(sep + 4)), N(1500)});
        audio("applause", {N(0.7), N(1.4)});
      }
      return stepT_ > 1.6 * ((double)names_.size() + 1);
    }
  }
  return false;
}

void ParisRun::update(const ParisFrame& f, CsoCadence& cad) {
  if (done_) return;
  cur_ = f;
  t_ += f.dt;
  stepT_ += f.dt;
  if (i_ < 0 || i_ >= (int)steps_.size()) return;
  if (updateStep(f.dt, cad)) next();
}

}  // namespace strides
