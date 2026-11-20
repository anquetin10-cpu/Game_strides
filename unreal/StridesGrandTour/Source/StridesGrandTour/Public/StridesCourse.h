// Épreuve de CSO : tracé (strides::traceCourse, données Content/Data/cso_course_pole.json), obstacles, déroulé de
// l'épreuve (strides::CsoRun, tranche T4 : entrée de piste, entrée en piste, cloche, lignes, chrono, points en direct,
// refus, erreurs de parcours, éliminations, arrivée, sortie de piste, textes fr / en de Content/Data/strings_cso.json),
// géométrie exportée du jeu web (tranche T5 : obstacles, lignes de départ et d'arrivée, poteau « Chrono », hauteurs
// hors épreuve puis de l'épreuve, numéro attendu surligné ; Content/World/Cso/cso_fences.json) ; interface d'épreuve
// (tranche T7 : strides::CsoHud nourri par les appels de l'épreuve et l'état de chaque image, affiché par
// UStridesCsoHud) ; aides à l'appel (tranche T9 : tracé au sol, zone d'appel, repère, AStridesCourseAids ; bouton SAUT
// coloré par l'état de CsoHud) ; entrée dans l'épreuve (tranche T10 : activité lancée au poteau « Chrono », grand message
// du lancement, contrôle de capacité et dialogue de l'entraîneur, carte de présentation, carte du plan, « Entrer en
// piste » ; affichés par UStridesCsoScreens).
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesCore/CourseAids.h"
#include "StridesCore/CoursePlan.h"
#include "StridesCore/CsoEntry.h"
#include "StridesCore/CsoCourse.h"
#include "StridesCore/CsoFences.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCore/CsoHud.h"
#include "StridesCore/CsoRun.h"
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
	bool MissionActive() const { return RunPtr && !RunPtr->finished(); }
	// Carte modale ouverte (overlay du web : simulation en pause, boutons globaux et action coupés).
	enum class EScreen : uint8 { None, Presentation, Plan };
	EScreen Screen() const { return ScreenNow; }
	// Bouton d'une carte (data-id du web) : « plan » (Voir le plan), « plan-back » (Retour), « enter » (Entrer en piste) ;
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
	void BuildProps(const class UStridesDataSubsystem& Data);
	void RefreshPropSigns();
	strides::CourseTrace Trace;
	std::vector<strides::CsoObstacle> CoreObstacles;
	std::vector<strides::CsoFenceState> CoreStates;
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
	// Entrée dans l'épreuve (tranche T10).
	bool bAutoEnter = false;         // StartRun : présentation validée d'office
	int32 ScreenStep = -1;           // rang de l'étape de présentation dont la carte a été ouverte
	EScreen ScreenNow = EScreen::None;
	bool bDialog = false;
	strides::CsoCall DialogLine;
	std::string RunHorseName;
};
