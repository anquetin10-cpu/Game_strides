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
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesCore/CsoCamera.h"
#include "StridesCore/CsoHud.h"
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
	UPROPERTY() TObjectPtr<class ACameraActor> Camera;

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
		FString HudRunFile, HudExtra, HudState;
		int32 HudFrame = 0, HudExtraFrame = -1;
	};
	void LoadPoses();
	void TickCso(float DeltaSeconds, class APlayerController* PC);
	void ApplyPose(const FPose& P, class APlayerController* PC);
	void ApplyCamRunPose(const FPose& P, class APlayerController* PC, class AStridesHorse* Horse);
	void MeasureFraming(const FPose& P, class APlayerController* PC);
	void ApplyHudPose(const FPose& P, class APlayerController* PC);
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
