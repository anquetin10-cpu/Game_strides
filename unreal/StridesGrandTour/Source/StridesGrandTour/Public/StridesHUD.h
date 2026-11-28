// HUD de débogage (texte : mode, allure, vitesse, cadence, chrono, fautes, appel, événements du parcours, sauvegarde,
// journal des données, minicarte), hors épreuve seulement : en épreuve, l'interface d'épreuve UMG (UStridesCsoHud,
// tranche T7) le remplace. L'interface UMG complète du jeu (HUD du web, téléphone Strides) vient ensuite.
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "Engine/Canvas.h"
#include "StridesCore/CsoHud.h"
#include "StridesCore/Minimap.h"
#include "StridesHUD.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API AStridesHUD : public AHUD
{
	GENERATED_BODY()
public:
	virtual void DrawHUD() override;
	virtual void BeginPlay() override;
	UFUNCTION() void OnCourseEvent(const FString& Kind, const FString& Text);
	// Lignes d'objectif du HUD de débogage : objectif de l'épreuve en cours (vide : aucune ligne), puis l'état de la
	// mission de carrière quand l'une est lancée ; hors épreuve, l'état des missions (« Aucune mission active »…).
	static TArray<FString> ObjectiveLines(bool bRunLive, const FString& RunObjective, const FString& ActiveMissionId, const FString& MissionStatus);
	// HUD de débogage (lignes, minicarte, téléphone de débogage) : seulement hors mode concours. En épreuve (classe
	// cso-ctl du jeu web, de l'entrée en piste à la sortie), l'interface d'épreuve UMG (UStridesCsoHud) le remplace et la
	// minicarte est masquée (styles.css:988).
	static bool DebugVisible(const strides::CsoHud* RaceHud) { return !RaceHud || !RaceHud->masked(strides::CsoHudElement::Minimap); }
	// Invite de l'action proposée hors tactile (lot J1-B : bulle d'interaction du web, interact.js) : « E · Chrono » au
	// clavier et à la manette (bouton X) ; vide sans action ou en mode tactile (le bouton d'action porte déjà le libellé).
	static FString ActionPrompt(const FString& Label, bool bTouch);
	// Minicarte (lot J1-C) : sens de la carte du web (src/ui/minimap.js:9-11 : x vers la droite, z vers le BAS) ; point du
	// repère web (x, z) projeté autour du joueur (CX, CZ) placé au centre, et cap (vecteur avant Unreal) en direction écran.
	static FVector2D MinimapPoint(const FVector2D& Center, double CX, double CZ, double PxPerM, const FVector2D& Web);
	static FVector2D MinimapHeading(const FVector& Forward);
	// Repère du chrono du Pôle (lot J1-D, choix signalé dans plan.md) : cible de guidage quand aucune mission de carrière ni
	// aucune épreuve n'est en cours ; texte « Chrono du Pôle · 420 m · à droite » (cap relatif du cavalier). Vide sinon.
	static FString PoleGuideText(double Distance, double RelAngleDeg, const TCHAR* Name = TEXT("Chrono du Pôle"));
	// Cap relatif (degrés) de la cible vue du cavalier : avant Unreal du pion, vecteur vers la cible dans le repère web.
	static double RelativeAngleDeg(const FVector& Forward, const FVector2D& ToGoalWeb);
	// Point de passage du guidage (repère web) : l'ouverture de la lice quand la cible est dans la carrière et le cavalier dehors.
	static FVector2D PoleWaypoint(const FVector2D& Me, const FVector2D& Goal, const FVector2D& Arena, double W, double D);
	// Guidage en épreuve (jalon J1, correction ; choix n° 7 de plan.md) : cible du GPS de l'étape de parcours du web
	// (courses.js target : abord de la ligne de départ, abord de l'obstacle attendu, arrivée), écrite sous le tableau :
	// « Obstacle 3 · 25 m · à droite ». Vide à moins de 4 m.
	// Point visé par la ligne « Chrono du Pôle » : entrée de la lice depuis l'extérieur (PoleWaypoint), puis, près de la
	// carrière (grille de guidage du parcours), autour des obstacles et des ailes. OutDist : longueur du chemin.
	// Point visé par la ligne « Paddock du Pôle » (jalon J2d) : coin est extérieur, puis ouverture est (5 m devant), puis le
	// centre ; R = (x, z, largeur, profondeur) du paddock (POLE.warmup du web). OutDist : longueur du chemin.
	static FVector2D PaddockWaypoint(const FVector2D& Me, const FVector2D& Goal, const FVector4& R, double& OutDist);
	// Ligne « Paddock du Pôle » complète : hors de la carrière par son ouverture sud, coin sud-ouest, allée, puis
	// PaddockWaypoint.
	static FVector2D PaddockGuideAim(const FVector2D& Me, const FVector2D& Goal, const class UStridesDataSubsystem* Dt, const class AStridesCourse* C, double& OutDist);
	static FVector2D PoleGuideAim(const FVector2D& Me, const FVector2D& Goal, const class UStridesDataSubsystem* Dt, const class AStridesCourse* C, double& OutDist);
	static FString CourseGuideText(const FString& Label, double Distance, double RelAngleDeg);
	// Jalon J2d (contrôle de J2c) : éléments du HUD du web gardés en mode concours hors épreuve (entraînement au paddock,
	// kind 'cso-train') : objectif, télémétrie (allure · km/h), invite d'action (« E · Terminer ») ; vides quand le modèle
	// du HUD les masque (cso-on, cso-sober, grand message).
	struct FRaceOverlay { FString Objective, Telemetry, Prompt; };
	static FRaceOverlay RaceOverlay(const strides::CsoHud& H, bool bMission, const FString& Objective, const FString& Gait, double SpeedMS, const FString& ActionLabel, bool bTouch);
	// Surcouche dessinée à la dernière image en mode concours (tests, relevé des captures) ; vide hors mode concours.
	const FRaceOverlay& LastOverlayShown() const { return LastOverlay; }
	// Dernier guidage d'épreuve affiché (tests, relevé des captures) ; vide si aucun.
	const FString& LastCourseGuideShown() const { return LastCourseGuide; }
	// Invite affichée à la dernière image (tests, relevé en partie réelle) ; vide si aucune.
	const FString& LastPromptShown() const { return LastPrompt; }
	// Vrai si le HUD de débogage a été dessiné à la dernière image (tests, relevé des captures en partie réelle).
	bool DrewDebugLastFrame() const { return bDrewDebug; }
	// ---- Jalon J3 : téléphone interactif et mini-carte tournée ----
	// Éléments touchables du téléphone dessinés à la dernière image (ordre de sélection au clavier) : identifiant de l'effet
	// (AStridesPlayerController::PhoneActivate) et boîte en px du viewport (souris, doigt).
	struct FPhoneItem { FString Id; FBox2D Box; };
	const TArray<FPhoneItem>& PhoneItems() const { return Phone; }
	int32 PhoneColumns() const { return PhoneCols; }
	FBox2D PhoneFrame() const { return PhoneBox; }
	// Textes du téléphone dessinés à la dernière image (tests, relevé des captures).
	const TArray<FString>& PhoneTexts() const { return PhoneLines; }
	static FString PhoneAppLabel(const FString& App);
	// Mini-carte de la dernière image : lacet de la carte (rad, celui du web), direction de la flèche et de la pastille N
	// à l'écran depuis le centre, repères dessinés (tests).
	double MinimapYaw() const { return MiniYaw; }
	FVector2D MinimapArrowDir() const { return LastArrowDir; }
	FVector2D MinimapNorthDir() const { return LastNorth; }
	const TArray<FString>& MinimapBlips() const { return LastBlips; }
	double MinimapRange() const { return MiniView.range; }
	// Ligne de guidage hors épreuve de la dernière image (« Chrono du Pôle · 145 m · à droite », mission, GPS), vide sinon.
	const FString& GuideLineShown() const { return LastGuideLine; }
	// Bouton de la carte du Grand Prix de Paris / de l'A13 sous ce point (px du viewport) ; vide : aucun.
	FString CardButtonAt(const FVector2D& ViewportPx) const;
	// Dernière carte dessinée (titre et boutons), pour les tests et le journal.
	FString LastCardShown;
	// Toile de dessin hors PostRender (tests : DrawHUD appelé dans un monde de test).
	void SetCanvasForTest(class UCanvas* C) { Canvas = C; }
private:
	// Dessin de base d'AHUD, sans effet sur une toile de test sans FCanvas (DrawHUD appelé hors rendu : la mise en page,
	// les éléments du téléphone et les textes restent calculés).
	void DrawText(const FString& Text, FLinearColor TextColor, float ScreenX, float ScreenY, UFont* Font = nullptr, float Scale = 1.f, bool bScalePosition = false)
	{
		if (Canvas && Canvas->Canvas) Super::DrawText(Text, TextColor, ScreenX, ScreenY, Font, Scale, bScalePosition);
	}
	void DrawLine(float X0, float Y0, float X1, float Y1, FLinearColor Color, float Thickness = 0.f)
	{
		if (Canvas && Canvas->Canvas) Super::DrawLine(X0, Y0, X1, Y1, Color, Thickness);
	}
	void DrawRect(FLinearColor Color, float X, float Y, float W, float H)
	{
		if (Canvas && Canvas->Canvas) Super::DrawRect(Color, X, Y, W, H);
	}
	// Minicarte du web : ronde, tournée selon le regard, centrée sur le joueur : zones, routes, lieux, obstacles, GPS, flèche, N.
	void DrawMinimap(const APawn* P, const class UStridesProgressionSubsystem* Progress);
	void DrawPhone(const class UStridesProgressionSubsystem* Progress);
	void DrawCourseGuide();
	void DrawRaceOverlay();
	// Jalon J4 (correction) : carte du Grand Prix de Paris ou de l'autoroute A13 (AStridesCourse::ActiveCard), au centre,
	// boutons mémorisés pour le toucher et le clic (CardButtonAt).
	void DrawActiveCard();
	TArray<TPair<FString, FBox2D>> CardButtons;
	// Texte du HUD de débogage : balises <b> de l'astuce retirées (le web les rend en gras), « ▸ » rendu « > » (glyphe
	// absent de la police par défaut du moteur ; l'interface d'épreuve UMG de la tranche T7 en aura une qui l'a).
	static FString DebugText(const FString& S);
	// Cible du guidage vers le chrono du Pôle (départ de l'activité, repère web x, z) ; faux si mission en cours.
	bool PoleGoal(FVector2D& Out) const;
	FString LastEvent;
	bool bDrewDebug = false;
	FString LastPrompt;
	FString LastCourseGuide;
	FRaceOverlay LastOverlay;
	float EventT = 0.f;
	TArray<FPhoneItem> Phone;
	TArray<FString> PhoneLines;
	int32 PhoneCols = 1;
	FBox2D PhoneBox = FBox2D(ForceInit);
	strides::MinimapView MiniView;
	double MiniYaw = 0;
	FVector2D LastArrowDir = FVector2D::ZeroVector, LastNorth = FVector2D::ZeroVector;
	TArray<FString> LastBlips;
public:
	// Jalon J3-C : « · 7:12 · Éclaircies · 19 °C » de la dernière image (tests).
	FString LastWeatherLine;
private:
	FString LastGuideLine;
	TWeakObjectPtr<class AStridesCourse> Course;  // épreuve du Pôle (objectif affiché tant qu'elle est en cours)
};
