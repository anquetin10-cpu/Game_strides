// Épreuve de CSO : tracé (strides::traceCourse, données Content/Data/cso_course_pole.json), obstacles, déroulé de
// l'épreuve (strides::CsoRun, tranche T4 : entrée de piste, entrée en piste, cloche, lignes, chrono, points en direct,
// refus, erreurs de parcours, éliminations, arrivée, sortie de piste, textes fr / en de Content/Data/strings_cso.json),
// géométrie exportée du jeu web (tranche T5 : obstacles, lignes de départ et d'arrivée, poteau « Chrono », hauteurs
// hors épreuve puis de l'épreuve, numéro attendu surligné ; Content/World/Cso/cso_fences.json) ; interface d'épreuve
// (tranche T7 : strides::CsoHud nourri par les appels de l'épreuve et l'état de chaque image, affiché par
// UStridesCsoHud) ; aides à l'appel (tranche T9 : tracé au sol, zone d'appel, repère, AStridesCourseAids ; bouton SAUT
// coloré par l'état de CsoHud) ; entrée dans l'épreuve (tranche T10 : activité lancée au poteau « Chrono », grand message
// du lancement, contrôle de capacité et dialogue de l'entraîneur, carte de présentation, carte du plan, « Entrer en
// piste » ; affichés par UStridesCsoScreens) ; arrivée et bilan (tranche T11 : carte de bilan du cœur, strides::
// csoResultCard ; Recommencer, S'entraîner, Quitter l'épreuve ; meilleur temps de l'activité écrit dans la sauvegarde à
// l'étape d'enregistrement ; fin de la mission).
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesCore/Colliders.h"
#include "StridesCore/CsoGuide.h"
#include "StridesCore/CourseAids.h"
#include "StridesCore/CoursePlan.h"
#include "StridesCore/CsoEntry.h"
#include "StridesCore/CsoCourse.h"
#include "StridesCore/CsoFences.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCore/CsoHud.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/CsoTraining.h"
#include "StridesCore/Ranking.h"
#include "StridesCore/Text.h"
#include "StridesCore/JumpModel.h"
#include <memory>
#include "StridesCourse.generated.h"

class AStridesFence;
class AStridesCourseAids;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FStridesCourseEvent, const FString&, Kind, const FString&, Text);

UCLASS()
class STRIDESGRANDTOUR_API AStridesCourse : public AActor
{
	GENERATED_BODY()
public:
	AStridesCourse();
	// Hauteur de l'épreuve (m) et niveau de vitesse ("national" 350 m/min, "csi", "gp").
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Strides") float CourseHeight = 1.1f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Strides") FString SpeedLevel = TEXT("national");
	// Langue des textes de l'épreuve (« fr » ou « en », comme la sauvegarde : strides::SaveGame::lang).
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Strides") FString Lang = TEXT("fr");
	// Aide à l'appel (réglage jumpAid du jeu web : « full », « button » ou « off ») : mot d'appel coupé sur « off ».
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Strides") FString JumpAid = TEXT("full");
	UPROPERTY(BlueprintAssignable, Category = "Strides") FStridesCourseEvent OnCourseEvent;

	void Build(const strides::CourseDesign& Design, const class UStridesDataSubsystem& Data);
	// Même construction sans le sous-système de données : vitesse du niveau (m/s) et largeur des obstacles (m). Aucune
	// épreuve n'est préparée (règles, lignes et textes viennent des données).
	void BuildWith(const strides::CourseDesign& Design, double CourseSpeedMS, double FenceWidthM);
	// Lancement direct du déroulé (premier pas : rejoindre l'entrée de la carrière) avec les règles et textes préparés par
	// Build, sans activité : ni grand message du lancement, ni contrôle de capacité, présentation validée d'office (sans
	// carte) — chemin des tests du déroulé et des outils ; le jeu passe par StartActivity. Faux si aucune donnée. Joueur
	// et cheval : textes de l'annonce (N° … · joueur / et cheval).
	bool StartRun(const FString& PlayerName, const FString& HorseName);
	// ---- Entrée dans l'épreuve (tranche T10) ----
	// Activity.start du poteau « Chrono » (activities.js:98-135, missions.start) : grand message « PARCOURS DU PÔLE » et
	// son « notify », puis le déroulé ; contrôle de capacité du cheval (puissance du saut, bonus de franchissement ;
	// obstacles posés et hauteurs de l'épreuve) ; la présentation attend « Entrer en piste ». Faux sans données.
	bool StartActivity(const FString& PlayerName, const FString& HorseName, double JumpPower, double Clearance);
	// Mission en cours (g.missions.active) : déroulé lancé et pas terminé.
	// Jalon J2c : l'entraînement à l'abord est aussi une mission (g.missions.active), de son lancement à sa fin.
	bool MissionActive() const { return (RunPtr && !RunPtr->finished()) || TrainingActive(); }
	// ---- Entraînement à l'abord au paddock du Pôle (jalon J2c, lot J2-D ; activities.js startTraining) ----
	// Lancé 300 ms après la fin de la mission quand « S'entraîner » a été choisi au bilan (courses.js:434-439), ou
	// directement (StartTraining) ; refusé si une mission est en cours ou sans paddock (cso_course_pole.json « warmup »).
	bool StartTraining();
	bool TrainingActive() const { return TrainingPtr && !TrainingPtr->finished(); }
	const strides::CsoTraining* Training() const { return TrainingPtr.get(); }
	// Action « Terminer » (interact train:end, priorité 2 : l'emporte sur le poteau et la descente) : proposée pendant
	// l'étape d'entraînement, à cheval comme à pied ; PressTrainingEnd la déclenche (faux si elle n'est pas proposée).
	bool TrainingEndAvailable() const { return TrainingPtr && TrainingPtr->endAvailable(); }
	FString TrainingEndLabel() const;
	bool PressTrainingEnd();
	// Mode de concours (game.course) : celui de l'épreuve tant qu'elle l'a, sinon celui de l'entraînement, dont
	// l'obstacle suivant (game.course.next) est l'obstacle visé par le cheval s'il est du paddock (SetTrainingNext).
	strides::CsoCourseMode CourseMode() const;
	void SetTrainingNext(int32 Index) { TrainingNext = Index; }
	// Objectif affiché (missions.objectiveText : Run.text de la mission active), vide sans mission.
	FString ObjectiveText() const;
	// Obstacles du parcours dans Obstacles() (les premiers) ; ceux du paddock suivent (course « warmup »).
	int32 CourseFenceCount() const { return NumCourseFences; }
	// Dernière carte de fin d'entraînement (missions.complete : titre, kicker, texte), affichée en grand message.
	const strides::CsoTrainingResult& LastTrainingResult() const { return TrainingResult; }
	int32 TrainingsStarted() const { return TrainingCount; }
	// Carte modale ouverte (overlay du web : simulation en pause, boutons globaux et action coupés).
	enum class EScreen : uint8 { None, Presentation, Plan, Result };
	EScreen Screen() const { return ScreenNow; }
	// Bouton d'une carte (data-id du web) : « plan » (Voir le plan), « plan-back » (Retour), « enter » (Entrer en piste) ;
	// bilan (tranche T11) : « cso-retry » (Recommencer), « cso-train » (S'entraîner), « cso-done » (Quitter l'épreuve) ;
	// faux si ce bouton n'est pas affiché.
	bool PressScreenButton(const FString& Id);
	// Dialogue de l'entraîneur (hud.dialog) affiché et sa fermeture (advanceDialog : une seule ligne).
	bool DialogOpen() const { return bDialog; }
	const strides::CsoCall& DialogCall() const { return DialogLine; }
	bool AdvanceDialog();
	// Contenu des cartes (cœur : CsoEntry, CoursePlan) dans la langue de l'épreuve.
	strides::CsoPresentationInput PresentationInput() const;
	strides::CsoPresentation Presentation() const;
	strides::CsoPlanCard PlanCard() const;
	strides::CoursePlan Plan() const;
	// Carte de bilan calculée à l'ouverture du bilan (courses.js:375, start : état de la manche à ce moment).
	const strides::CsoResultCard& ResultCard() const { return ResultCardData; }
	// Meilleur temps écrit à la dernière étape d'enregistrement (activities.js:120) : vrai et le score s'il y en a eu un.
	bool LastRecord(double& OutScore) const { OutScore = LastRecordScore; return bLastRecord; }
	strides::Lang RunLang() const { return strides::langFromName(TCHAR_TO_UTF8(*Lang)); }
	const strides::TextTable& Texts() const { return RunText; }
	// Réglage jumpAid changé (carte Pause, tranche T8) : gardé pour la prochaine épreuve et appliqué à celle en cours.
	void SetJumpAid(const FString& Aid);
	// Même lancement avec des règles et une table de textes données (tests).
	void StartRunWith(const strides::CsoRunConfig& Config, const strides::TextTable& Text);
	// Une image de l'épreuve (Run.update du jeu web), appelée par le cheval après le pas du cœur, les obstacles et leurs
	// événements (même ordre que src/game.js:1489-1507). La cadence de concours peut être réécrite (refus compté,
	// sortie de piste).
	void TickRun(const strides::CsoRunFrame& Frame, strides::CsoCadence& Cadence);
	const strides::CsoRun* Run() const { return RunPtr.get(); }
	strides::CsoRun* Run() { return RunPtr.get(); }
	// Obstacles vus par le cheval (visée, aide à l'appel, refus : strides::csoTarget / csoTiming / csoApproachRefusal),
	// dans l'ordre du parcours ; l'indice d'un obstacle du cœur est celui de son acteur (FenceAt).
	const std::vector<strides::CsoObstacle>& Obstacles() const { return CoreObstacles; }
	AStridesFence* FenceAt(int32 Index) const { return Fences.IsValidIndex(Index) ? Fences[Index].Get() : nullptr; }
	// État des obstacles du cœur (barres, remises, barres en attente), même ordre que Obstacles() : écrit par
	// strides::csoFencesUpdateHorse (appelé par le cheval) et par UpdateFences.
	std::vector<strides::CsoFenceState>& FenceStates() { return CoreStates; }
	// Collisions du monde autour du parcours (jalon J1, correction) : lice de la carrière du Pôle (world.js rectFence,
	// ouverture de 7 m au sud) et chandeliers / ailes des droits et oxers (obstacles.js add), comme les colliders du web.
	const strides::Colliders& WorldColliders() const { return WorldCol; }
	// Cible du GPS de l'étape de parcours (courses.js:174-179 target) : abord de la ligne de départ (8 m avant) tant que le
	// départ n'est pas franchi, abord de l'obstacle attendu (7 m avant), puis la ligne d'arrivée ; faux hors parcours.
	// Me : position du cavalier (repère web) ; abord passé dans l'axe, la cible devient l'obstacle.
	// Jalon J1 (2e correction) : le point visé contourne obstacles, ailes et lice (strides::guideAim, choix n° 7 révisé) ;
	// abord à 10 m (au lieu de 7) pour arriver dans l'axe ; lignes de départ / d'arrivée visées 8 m avant puis franchies
	// tout droit. OutDistance : longueur du chemin jusqu'à la cible (et non jusqu'au point visé).
	// Forward (repère web, unitaire) et Speed (m/s) : dans les 3 derniers mètres avant la face, l'obstacle reste visé si
	// le cheval y va (cap vers lui et vitesse ≥ 2,5 m/s) ; arrêté (refus) ou détourné, c'est l'abord (demi-tour).
	bool CourseGuide(FVector2D& OutWeb, FString& OutLabel, const FVector2D& Me, double* OutDistance = nullptr, const FVector2D& Forward = FVector2D::ZeroVector, double Speed = 0) const;
	// Point visé depuis Me vers Goal, autour des obstacles, ailes et lice (grille de guidage) ; Goal hors de la carrière
	// et de ses abords (30 m) ou sans chemin : Goal. OutDistance : longueur du chemin.
	FVector2D GuideAim(const FVector2D& Me, const FVector2D& Goal, double* OutDistance = nullptr) const;
	const strides::GuideGrid& GuideMap() const { return GuideGridMap; }
	strides::GuideMode LastCourseGuideMode() const { return LastGuideMode; }
	// Événements des obstacles du cœur (obstacle:clear / fault / refusal) : journal, puis écouteurs de l'épreuve
	// (courses.js : obstacle attendu, sens, chrono lancé ; refus compté : cadence remise à 0).
	void HandleFenceOut(const strides::CsoFenceOut& Out, strides::CsoCadence& Cadence);
	// Obstacles.update(dt) du jeu web (chute des barres, vibration, remises) puis affichage des barres. FocusX / FocusZ :
	// position suivie (cheval monté), repère web.
	void UpdateFences(double Dt, double Time, double FocusX, double FocusZ);
	const TArray<FString>& FenceEventLog() const { return FenceLog; }
	// Appels de l'interface (hud.big / toast / hint / clearHint) et sons (audio.*) demandés par l'épreuve, dans l'ordre :
	// « fn | arg | arg… ». Les sons ne sont pas joués (tranche T12) ; l'interface les reçoit aussi (HudModel).
	const TArray<FString>& HudLog() const { return HudCalls; }
	const TArray<FString>& AudioLog() const { return AudioCalls; }
	// Remises des barres demandées par l'épreuve (entrée en piste, obstacles.js resetRails) et appliquées aux obstacles.
	int32 RailResets() const { return RailResetCount; }

	// Interface d'épreuve (tranche T7) : état du HUD du jeu web (toasts, astuce, grand message, mot d'appel, tableau,
	// crans de cadence, classes et masquages). Une image : BeginHudFrame (temporisations échues, avant les événements
	// d'obstacle), appels de l'épreuve (FlushRunCalls), puis UpdateHud après TickRun (hud.update du jeu web).
	const strides::CsoHud& HudModel() const { return Hud; }
	strides::CsoHud& HudModel() { return Hud; }
	// Horloge des temporisations du HUD (setTimeout du web) : horloge murale, qui court aussi en pause et ne suit ni le
	// ralenti ni l'accéléré du jeu (UWorld::GetRealTimeSeconds), et non le pas du cheval. Avancée en début d'image par le
	// cheval (avant les événements d'obstacle) et par le widget d'épreuve (images sans pas du cheval : pause). Now :
	// secondes murales ; origine à l'heure du lancement de l'épreuve ; un retour en arrière est ignoré.
	void SyncHudClock(double Now);
	double WallSeconds() const;
	void BeginHudFrame() { SyncHudClock(WallSeconds()); }
	// Timing : aide à l'appel du cheval du joueur (obstacles.timing, csoTiming) ; le bouton SAUT lit
	// csoJumpTiming(game.course, entrée en piste, réglage jumpAid, Timing) (tranche T9).
	void UpdateHud(double Dt, bool bHasCadence, double Cadence, bool bCadAdjust, strides::Zone Timing = strides::Zone::None);
	// Aides du parcours (tranche T9, courses.js:188, 311-320, 355) : créées au début de l'étape de parcours, mises à jour
	// après le déroulé de l'image (obstacle suivant, début du tronçon, réglages courseLine et jumpAid), supprimées à la
	// fin de l'étape. Cheval du joueur : position, vitesse, puissance, bonus de franchissement, monté ou non ; Time =
	// game.time (repère).
	void UpdateAids(double Dt, double HorseX, double HorseZ, double Speed, double Power, double Clearance, bool bRiding, double Time);
	AStridesCourseAids* CourseAids() const { return Aids; }
	// Acteur des aides (créé au besoin), sans le démarrer : captures et tests.
	AStridesCourseAids* EnsureAids();
	// Réglage courseLine (Tracé au sol) : relu dans la sauvegarde à chaque image (settings().courseLine du web) ; sans
	// sauvegarde, cette valeur.
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Strides") bool bCourseLine = true;
	bool CourseLineShown() const;
	// Obstacles du parcours tels que les lit CourseAids.update (sol, abscisse du tracé lineS).
	std::vector<strides::CsoAidsFence> AidFences() const;
	// Ligne du cavalier (CSO_LINE : tracé du design local décalé de la carrière point par point, obstacles.js:44).
	std::vector<strides::TracePoint> AidLine() const;
	// Dernier saut du cheval du joueur (horse._lastJump, mot d'appel) : présent ou non (effacé quand le cheval est posé),
	// obstacle (indice du cœur, −1 : aucun obstacle du parcours), qualité de l'appel et instant ; transmis à l'épreuve
	// quand il change.
	void NoteLastJump(bool bHas, int32 ObstacleIndex, const strides::JumpPlan& Plan, double JumpTime);

	UFUNCTION(BlueprintPure, Category = "Strides") float ElapsedTime() const;
	UFUNCTION(BlueprintPure, Category = "Strides") int32 Faults() const;
	UFUNCTION(BlueprintPure, Category = "Strides") int32 NextFence() const;
	UFUNCTION(BlueprintPure, Category = "Strides") int32 TimeAllowed() const { return Allowed; }
	// Tableau de chrono (textes de hud.js) pendant le parcours, sinon objectif de l'étape (Run.text).
	UFUNCTION(BlueprintPure, Category = "Strides") FString StatusText() const;
	const strides::CourseTrace& CourseTraceData() const { return Trace; }

	// Hauteurs des obstacles (m, ordre du parcours) posées sur le cœur et sur les pièces (Obstacles.setHeights), barres
	// au repos. Build pose les hauteurs hors épreuve (manifeste : csoHeights(base) de obstacles.js _build), l'entrée en
	// piste celles de l'épreuve (CourseHeight, courses.js:453).
	void ApplyHeights(const std::vector<double>& Heights);
	// Hauteurs du profil du parcours pour une hauteur de base (csoHeights : base + profil, arrondi au centimètre).
	std::vector<double> HeightsFor(double Base) const { return strides::courseHeights(DesignData, Trace, Base); }
	std::vector<double> FenceHeights() const;
	// Numéro attendu mis en évidence (Obstacles.highlight du parcours, suivi du déroulé) ; -1 : aucun.
	void SetHighlight(int32 InNum);
	int32 Highlight() const { return HighlightNum; }
	// Composantes des lignes de départ et d'arrivée et du poteau « Chrono » (étiquettes : groupe « start », « finish » ou
	// « cso_train », puis catégorie de la pièce).
	const TArray<TObjectPtr<class UStaticMeshComponent>>& PropComponents() const { return Props; }

private:
	void FlushRunCalls();
	void FlushTrainingCalls();
	void TickTraining(const strides::CsoRunFrame& Frame);
	void BuildWarmup(const class UStridesDataSubsystem& Data);
	std::unique_ptr<strides::CsoTraining> TrainingPtr;
	strides::CsoRunFrame LastTrainFrame;
	strides::CsoTrainingResult TrainingResult;
	int32 TrainingNext = -1, NumCourseFences = 0, TrainingCount = 0;
	double TrainingAt = -1;               // heure murale du lancement demandé par « S'entraîner » (300 ms après la fin)
	int32 RunSerial = 0, TrainingAskedSerial = -1;  // épreuve (rang de lancement) dont la demande a déjà été prise
	void BuildProps(const class UStridesDataSubsystem& Data);
	void RefreshPropSigns();
	strides::CourseTrace Trace;
	std::vector<strides::CsoObstacle> CoreObstacles;
	std::vector<strides::CsoFenceState> CoreStates;
	strides::Colliders WorldCol;
	strides::GuideGrid GuideGridMap;
	mutable strides::GuideMode LastGuideMode = strides::GuideMode::Approach;
	void RebuildColliders();
	TArray<FString> FenceLog, HudCalls, AudioCalls;
	int32 Allowed = 64, RailResetCount = 0;
	bool bRunConfig = false;
	strides::CsoRunConfig RunConfig;
	strides::TextTable RunText;  // copie : CsoRun en garde une référence
	std::unique_ptr<strides::CsoRun> RunPtr;
	UPROPERTY() TArray<TObjectPtr<AStridesFence>> Fences;
	strides::CourseDesign DesignData;
	std::vector<double> CourseHeightsV;  // hauteurs de l'épreuve (CourseHeight + profil)
	int32 HighlightNum = -1, RunHighlight = -1;
	UPROPERTY() TArray<TObjectPtr<class UStaticMeshComponent>> Props;
	TArray<FString> PropTex, PropTexEn;  // textures des panneaux des lignes (vide : autre pièce)
	strides::CsoHud Hud;
	double HudWall = 0;     // dernière heure murale vue par SyncHudClock
	bool bHudWall = false;  // origine fixée
	double LastJumpTime = -1;
	UPROPERTY() TObjectPtr<AStridesCourseAids> Aids;
	// Jalon J2b (B9) : tribunes du Pôle pleines pour le cavalier à pied (boîte invisible, même emprise que le collider
	// « stands » du cheval, comme le collider unique du web pour le cheval et le piéton).
	UPROPERTY() TObjectPtr<class UBoxComponent> StandsBlock;
public:
	const class UBoxComponent* StandsBlocker() const { return StandsBlock; }
#if WITH_DEV_AUTOMATION_TESTS
	// Contrôle du test Strides.World.Stands (mutation « sans tribunes ») : collider « stands » du cheval retiré ou remis.
	void SetStandsForTest(bool bOn) { bStandsForTest = bOn; RebuildColliders(); }
	bool bStandsForTest = true;
#endif
private:
	// Entrée dans l'épreuve (tranche T10).
	bool bAutoEnter = false;         // StartRun : présentation validée d'office
	int32 ScreenStep = -1;           // rang de l'étape de présentation dont la carte a été ouverte
	EScreen ScreenNow = EScreen::None;
	bool bDialog = false;
	strides::CsoCall DialogLine;
	std::string RunHorseName;
	// Bilan (tranche T11).
	strides::CsoResultCard ResultCardData;
	bool bLastRecord = false;
	double LastRecordScore = 0;
	void ApplyActivityResult(strides::CsoRunConfig& C, bool bRecord) const;
};
