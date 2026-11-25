// Revue visuelle automatique (ligne de commande -StridesShots) : le jeu se place sur des points de vue fixes du monde
// (repère web), capture chacun dans <dossier de sortie>/<nom>.png, puis la vue de jeu, et quitte.
// Sert à comparer les décors d'une version à l'autre, toujours sous les mêmes angles. Ensuite, la cavalière monte et
// le cheval enchaîne le parcours de démonstration du Pôle sur le relief : une capture toutes les 4 s (10_galop_NN).
//
// -StridesShots=cso : captures jumelles du banc de parité CSO. Lit unreal/docs/parite/cso/poses.json (écrit par
// scripts/unreal/export-cso-runs.mjs --shots, ou -StridesPoses=<fichier>) ; pour chaque pose : cheval posé, cavalière
// en selle, caméra à l'œil / cible du web, FOV vertical du web converti en FOV horizontal Unreal pour le viewport de la
// pose, soleil orienté comme le soleil web à la même heure, HUD masqué ; capture haute résolution exactement à la taille
// du viewport web dans unreal/docs/parite/cso/<pose>-unreal.png, puis quitte. Outil de développement (hors jeu iOS).
//
// Dossier de sortie : -StridesShotsDir=<chemin> (absolu, ou relatif à la racine du dépôt), créé au besoin ; toutes les
// captures y vont (<nom>.png, ou <pose>-unreal.png en mode cso). Sans l'option : Saved/Screenshots/Strides en mode décor,
// chemins de poses.json en mode cso. Le mode refuse d'écrire (journal « Strides shots: REFUS », aucune capture, sortie)
// si le dossier retenu est un dossier de captures existantes (Saved/Screenshots/Strides ou MacEditor) non vide : les
// captures de Julien ne sont jamais écrasées. Mode d'emploi : unreal/docs/parite/README.md.
//
// Poses de la caméra de concours (tranche T6, champ camRun de poses.json) : la caméra n'est PAS posée à l'œil du web ;
// le cheval vu par la caméra et l'obstacle suivant sont relus image par image dans l'oracle du scénario (canal « cc »)
// et la caméra est calculée par le jeu (AStridesHorse::StepCourseCamera : cœur strides::csoCamStep, sonde par traces
// dans le décor chargé, sol du relief exporté), puis la capture est faite par la caméra du cheval. Le cadrage de
// tests/e2e/cso-framing.mjs (part de la hauteur de l'écran occupée par le couple) est mesuré avec la vue de rendu et
// écrit, avec l'écart à l'œil, au point visé et au FOV du web, dans <dossier des captures>/cadrage-unreal.json.
//
// Poses du HUD d'épreuve (tranche T7, champ hud de poses.json, écrit par scripts/unreal/export-hud-style.mjs --shots) :
// caméra posée comme les poses de la carrière ; le HUD d'épreuve (UStridesCsoHud) affiche un strides::CsoHud figé,
// obtenu en rejouant l'exécution de l'oracle jusqu'à l'image de la pose (StridesCsoHudReplay, même règle que le web) ;
// fenêtre mise à la taille de la pose (844 × 390 ou 667 × 308) et capture de la fenêtre AVEC l'interface
// (FScreenshotRequest) ; l'état rejoué est comparé à l'état du DOM relevé par le web (champ state) et l'affichage du
// widget est écrit dans <dossier des captures>/hud-unreal.json.
//
// -StridesShots=perf (essai de monte, voie A, étape 7) : mesure du coût, rendu GPU réel. Fenêtre de 844 × 390, cheval à
// l'entrée du tracé du Pôle, cavalière en selle (jeu par défaut, ou -StridesRider=regles), activité lancée au poteau
// (caméra de concours), puis deux phases : « arret » (cheval immobile, comme E1) et « galop » (parcours de démonstration,
// à partir du premier galop ; le galop à gauche d'E2g n'existe pas dans Unreal, voir unreal/docs/parite/monte/cout.md).
// Par phase : 120 images de chauffe puis 600 mesurées (-StridesPerfWarm=, -StridesPerfFrames=) ; par image : temps du
// jeu (GGameThreadTime), du rendu (GRenderThreadTime), du GPU (RHIGetGPUFrameCycles), pas de l'image, LOD prédit du
// maillage de la cavalière ; mémoire (UsedPhysical, PeakUsedPhysical) toutes les 30 images. Sortie
// <-StridesShotsDir>/perf-unreal.json (valeurs brutes, médiane et 95e centile par strides::perf), puis une capture par phase
// (perf-<phase>.png, après la mesure ; aucune avec -StridesPerfSansCapture). Exige -StridesShotsDir. Résumé des passes : scripts/unreal/perf-summary.py.
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesCore/CsoCamera.h"
#include "StridesCore/CsoHud.h"
#include "StridesCore/HorseMirror.h"
#include "StridesShots.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API AStridesShots : public AActor
{
	GENERATED_BODY()
public:
	AStridesShots();
	virtual void Tick(float DeltaSeconds) override;
	static bool Requested();
	// Mode demandé : "" (revue des décors et démonstration), "cso" (poses jumelles du banc de parité) ou "cso-jeu" (partie
	// réelle avec l'interface : épreuve du Pôle en démonstration automatique, captures et relevé de l'affichage).
	static FString Mode();
	// FOV horizontal (degrés) d'une caméra Unreal (axe X maintenu) qui montre le même champ vertical qu'une caméra
	// Three.js de FOV vertical FovV (degrés) dans un viewport Width × Height.
	static double HorizontalFov(double FovV, double Width, double Height);
	// Dossier de sortie retenu pour la ligne de commande CommandLine : -StridesShotsDir (relatif : à Root), sinon
	// DefaultDir (vide : chemins de poses.json). Rend false, motif dans Why, si ce dossier est l'un des dossiers
	// Protected et contient déjà des fichiers ; OutPath = chemin absolu normalisé (vide si DefaultDir vide sans option).
	static bool ResolveShotsDir(const TCHAR* CommandLine, const FString& Root, const FString& DefaultDir, const TArray<FString>& Protected, FString& OutPath, FString& Why);
	static FString RepoRoot();  // racine du dépôt (le projet est dans unreal/StridesGrandTour/)
	static FString DefaultShotsDir();  // Saved/Screenshots/Strides du projet
	static TArray<FString> ProtectedShotsDirs();  // Saved/Screenshots/Strides et Saved/Screenshots/MacEditor du projet
	static bool DirHasFiles(const FString& Dir);
	// Cadrage de tests/e2e/cso-framing.mjs:31-39 : ordonnée d'écran (0 = haut, 1 = bas) de chaque point de la silhouette
	// (Pts : [avance le long du cap, hauteur] en m, repère web) du couple posé en (X, Z), cap Heading, pieds à Y0, vu par
	// View dans un viewport Width × Height, projection du moteur avec la contrainte d'axe de la vue (sinon celle du
	// joueur local).
	static TArray<double> FramingYs(const struct FMinimalViewInfo& View, int32 Width, int32 Height, double X, double Z, double Heading, double Y0, const TArray<FVector2D>& Pts);
	// Rejoue par la caméra du cheval (StepCourseCamera) les appels du canal « cc » d'une exécution de l'oracle
	// (unreal/core/tests/oracles/cso_runs/<id>.<lang>.json) jusqu'à l'image LastFrame comprise (−1 : toutes) : cheval vu
	// par la caméra et obstacle suivant relus, sol sous le cheval pris dans le relief du jeu ; OnCall reçoit chaque appel
	// (image, sortie du jeu, appel relevé). Rend false, motif dans Why, si l'exécution n'a pas de canal caméra.
	// Résumé d'une série de mesures du mode perf (strides::perf::summarize) : n, median, p95, mean, min, max.
	static TSharedPtr<class FJsonObject> PerfSummaryJson(const TArray<double>& Values);
	static bool ReplayCourseCamera(class AStridesHorse* Horse, const TSharedPtr<class FJsonObject>& Run, int32 LastFrame,
		TFunctionRef<void(int32, const strides::CsoCamOut&, const TSharedPtr<class FJsonObject>&)> OnCall, FString& Why);

private:
	struct FShot { FString Name; FVector Eye; FVector Target; };
	TArray<FShot> Shots;
	int32 Index = -1;
	float Wait = 0.f;
	bool bCaptured = false;
	bool bOutResolved = false;
	bool bRefused = false;
	FString OutDir;  // dossier de sortie résolu (vide en mode cso sans option : chemins de poses.json)
	int32 RideShot = -1;
	float RideTime = 0.f;
	float JumpClock = -1.f;  // étape M2 (-StridesShots=miroir) : temps depuis le départ du saut
	// Essai de monte, étape 6 (mode "monte") : captures de la cavalière en selle, à l'arrêt puis au galop, caméra posée dans
	// le repère du cheval comme la capture du web (poses.json de export-rider-rules.mjs --shots).
	void TickMonte(float DeltaSeconds, class APlayerController* PC);
	// Étape M3 (mode "monte-b", niveau B, avec -StridesRider=regles et -StridesHorseLead=web) : captures APPARIÉES au web :
	// pour chaque pose de -StridesMontePoses (scénario et image d'O1), le cheval Unreal et la cavalière sont posés par le
	// rejeu de cette image (FStridesRiderOnHorseReplay, le code du test Strides.Parite.RiderOnHorse), ticks du cheval, de
	// sa sellerie et de la cavalière suspendus le temps de la capture ; même caméra que le web dans le repère du cheval.
	void TickMonteB(float DeltaSeconds, class APlayerController* PC);
	// Étape S2 (mode "monte-s2") : captures avant / après de la monte du web dans une partie jouée (parcours de démonstration),
	// pour la configuration de la ligne de commande (StridesMonteOptions) : arrêt, galop à droite, galop à gauche, saut à
	// main droite, saut à main gauche ; caméra du web dans le repère du cheval. La main est celle du cheval si la main du
	// web est active, sinon celle que la main du web aurait (strides::mirror::leadStep sur le même virage) : mêmes instants
	// du parcours dans les deux configurations.
	void TickMonteS2(float DeltaSeconds, class APlayerController* PC);
	TSet<FString> MonteS2Done;
	strides::mirror::LeadState MonteS2Lead;
	char MonteS2JumpLead = 0;  // main au départ du saut en cours (0 : pas de saut)
	int32 MonteS2LeadMismatch = 0, MonteS2LeadFrames = 0;
	TArray<FString> MonteS2Jumps;  // départs de saut relevés (temps, main, clip)
	TSharedPtr<class FStridesRiderOnHorseReplay> MonteReplay;
	int32 MonteShot = 0;
	int32 MonteStep = 0;
	float MonteWait = 0.f;
	TArray<TSharedPtr<class FJsonObject>> MontePoses;
	FDelegateHandle MonteEndOfFrame;  // relevé de la cavalière en fin d'image (après tous les groupes de tick)
	FString MonteLog;
	UPROPERTY() TObjectPtr<class ACameraActor> Camera;
	// Mesure du coût (mode "perf", étape 7).
	void TickPerf(float DeltaSeconds, class APlayerController* PC);
	struct FPerfPhase
	{
		FString Name;
		TArray<double> Game, Render, Gpu, Delta, Lod, Speed, RigMs, TackMs, StrapsMs, Used, Peak;
		int32 CourseCam = 0, Jumping = 0, Gallop = 0, Bones = 0;
		FString BodyMesh;
		double StartTime = 0;
	};
	TArray<FPerfPhase> PerfPhases;
	int32 PerfStep = 0, PerfFrame = 0, PerfWarm = 120, PerfFrames = 600, PerfResizeTries = 0;
	float PerfWait = 0.f, PerfClock = 0.f;
	FIntPoint PerfViewport = FIntPoint::ZeroValue;

	// Banc de parité CSO (mode "cso").
	struct FPose
	{
		FString Name;
		double HorseX = 0, HorseZ = 0, HorseH = 0;
		FVector Eye = FVector::ZeroVector, Target = FVector::ZeroVector;  // repère web (m, altitude absolue)
		FVector SunDir = FVector::UpVector;  // repère web, vers le soleil
		double FovV = 58;
		int32 Width = 844, Height = 390;
		FString Out;  // chemin absolu de la capture Unreal
		// Poses de chute de barre (tranche T3) : cheval en l'air (jumpY, m), barre renversée par le cœur (csoKnock) puis
		// Frames images de csoFencesUpdate (pas 1/30 s), affichée par AStridesFence::ApplyRails comme en jeu.
		bool bHasJumpY = false;
		double HorseJumpY = 0;
		bool bHasFence = false;
		FString FenceLabel;
		int32 FenceBar = 0, FenceFrames = 0;
		double FenceDir = 1, FenceSide = 0, FenceHit = 0.15;
		// Poses de la carrière (tranche T5) : hauteurs des obstacles et numéro surligné relevés dans le jeu web.
		bool bHasCourse = false;
		TArray<double> CourseHeights;
		int32 CourseHighlight = -1;
		// Caméra de concours (tranche T6) : exécution de l'oracle rejouée jusqu'à l'image CamRunFrame, mesure du cadrage
		// du web (part, haut, bas) et silhouette du test.
		bool bHasCamRun = false;
		FString CamRunFile;
		int32 CamRunFrame = 0;
		TArray<FVector2D> FramingPts;
		double WebPart = 0, WebTop = 0, WebBottom = 0;
		bool bFramingJump = false;
		// HUD d'épreuve (tranche T7) : exécution rejouée jusqu'à HudFrame, appels ajoutés (JSON [[fn, args]…]) à
		// HudExtraFrame, état du DOM du web (JSON).
		bool bHasHud = false;
		// Commandes d'épreuve (tranche T8) : page tactile du web (joystick dessiné), doigt posé puis glissé (px CSS),
		// carte Pause ouverte.
		bool bTactile = false, bHasTouch = false, bPause = false;
		int32 TouchId = 1;
		FVector2D TouchStart = FVector2D::ZeroVector, TouchMove = FVector2D::ZeroVector;
		FString HudRunFile, HudExtra, HudState;
		int32 HudFrame = 0, HudExtraFrame = -1;
		// Aides à l'appel (tranche T9) : canal « ai » d'une exécution rejoué jusqu'à AidsFrame dans les aides du parcours.
		bool bHasAids = false;
		FString AidsRunFile;
		int32 AidsFrame = 0;
		// Pause de l'horloge virtuelle du HUD après la dernière image (hw de la pose, tranche T10) ; −1 : celle de l'image.
		int64 HudHw = -1;
		// Entrée dans l'épreuve (tranche T10) : carte attendue (« presentation », « plan », vide : aucune), joueur et cheval
		// de l'exécution, carte et dialogue relevés dans le DOM du web (JSON).
		bool bHasEntree = false;
		FString EntreeScreen, EntreePlayer, EntreeHorseId, EntreeCard;
		// Bilan (tranche T11) : exécution de l'oracle rejouée par le jeu (activité lancée, StridesCsoRunReplay) jusqu'à
		// l'image de la pose, carte de bilan relevée dans le DOM du web (JSON).
		bool bHasBilan = false;
		FString BilanRunFile, BilanCard;
		int32 BilanFrame = 0;
		// Contrôle adverse de T11 : corps de la carte défilé (« end » : jusqu'en bas, sinon en px CSS) et mise en page de
		// la carte relevée dans le web corps en haut (boîtes, scrollHeight, classe more, scrollTop et more après le
		// défilement ; JSON), comparée aux boîtes du widget.
		bool bBilanScrollEnd = false;
		double BilanScroll = 0;
		FString BilanLayout;
	};
	void LoadPoses();
	void TickCso(float DeltaSeconds, class APlayerController* PC);
	void ApplyPose(const FPose& P, class APlayerController* PC);
	void ApplyCamRunPose(const FPose& P, class APlayerController* PC, class AStridesHorse* Horse);
	void MeasureFraming(const FPose& P, class APlayerController* PC);
	void ApplyHudPose(const FPose& P, class APlayerController* PC);
	void ApplyControlsPose(const FPose& P, class APlayerController* PC, class AStridesHorse* Horse);
	void ApplyAidsPose(const FPose& P, class AStridesHorse* Horse);
	// Tranche T10 : activité lancée au poteau par l'action du joueur (AStridesPlayerController::DoAction), carte ouverte par
	// le déroulé et boutons touchés par le widget (UStridesCsoScreens::ClickForTest) jusqu'à la carte de la pose ; relevé
	// comparé à la carte du web (entree-unreal.json).
	void ApplyEntreePose(const FPose& P, class APlayerController* PC, class AStridesHorse* Horse);
	TSharedPtr<class FJsonObject> EntreeResult;
	// Gestes faits pour la pose en cours, cumulés sur ses deux appels d'ApplyPose (PoseStep 0 puis 1) : le second rappel
	// ne refait rien et effaçait le relevé (gestures vide dans entree-unreal.json avant l'hygiène finale).
	TArray<FString> EntreeGestures;
	// Tranche T11 : activité lancée dans l'épreuve du niveau et exécution de l'oracle rejouée image par image par le chemin
	// du jeu jusqu'à l'image de la pose (bilan ouvert par le déroulé), carte comparée à celle du web (bilan-unreal.json).
	void ApplyBilanPose(const FPose& P, class APlayerController* PC, class AStridesHorse* Horse);
	TSharedPtr<class FJsonObject> BilanResult;
	// Exécution et image rejouées pour la dernière pose de bilan, et images rejouées : la pose suivante de même exécution
	// et même image (autre viewport, ou ApplyPose rappelée avant la capture) garde le bilan ouvert et ce décompte.
	FString BilanReplayKey;
	int32 BilanReplayCount = 0;
	// Démonstration (-StridesShots sans mode, cso-jeu) : activité lancée au poteau, « Entrer en piste » touché à l'ouverture
	// de la carte de présentation.
	bool StartActivityAtPost(class APlayerController* PC);
	void EnterWhenPresented(class APlayerController* PC);
	bool bEnterPending = false;
	TSharedPtr<class FJsonObject> AidsResult;  // relevé des aides de la pose en cours (aide-unreal.json)
	// Doigt envoyé à Slate comme un message tactile de la plateforme (Phase 0 posé, 1 glissé, 2 levé ; px CSS).
	bool SlateTouch(int32 Phase, int32 FingerIndex, const FVector2D& Css);
	int32 HeldTouch = -1;
	FVector2D HeldTouchAt = FVector2D::ZeroVector;
	// Partie réelle avec l'interface (mode "cso-jeu", contrôle adverse de T7) : captures de la fenêtre aux instants choisis
	// par l'état de l'épreuve, avec le relevé de ce qui est réellement affiché.
	void TickJeu(float DeltaSeconds, class APlayerController* PC);
	void JeuCapture(const FString& Name, const FString& What, class APlayerController* PC);
	void JeuRecord(class APlayerController* PC);
	int32 JeuStep = 0;
	float JeuWait = 20.f, JeuClock = 0.f, JeuSince = -1.f, JeuSeen = -1.f;
	FString JeuPendingName, JeuPendingWhat, JeuPendingFile;
	TArray<TSharedPtr<class FJsonValue>> JeuResults;
	strides::CsoHud PoseHud;
	TArray<TSharedPtr<class FJsonValue>> HudResults;
	int32 ResizeTries = 0;
	TSharedPtr<class FJsonObject> CamRunCache;
	FString CamRunCacheFile;
	TArray<TSharedPtr<class FJsonValue>> FramingResults;
	FString FramingOut;
	TArray<FPose> Poses;
	int32 PoseIndex = -1;
	int32 PoseStep = 0;
	bool bPoseMounted = false;
};
