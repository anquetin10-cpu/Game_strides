// HUD de débogage (texte : mode, allure, vitesse, cadence, chrono, fautes, appel, événements du parcours, sauvegarde,
// journal des données, minicarte), hors épreuve seulement : en épreuve, l'interface d'épreuve UMG (UStridesCsoHud,
// tranche T7) le remplace. L'interface UMG complète du jeu (HUD du web, téléphone Strides) vient ensuite.
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "StridesCore/CsoHud.h"
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
	static FVector2D PoleGuideAim(const FVector2D& Me, const FVector2D& Goal, const class UStridesDataSubsystem* Dt, const class AStridesCourse* C, double& OutDist);
	static FString CourseGuideText(const FString& Label, double Distance, double RelAngleDeg);
	// Dernier guidage d'épreuve affiché (tests, relevé des captures) ; vide si aucun.
	const FString& LastCourseGuideShown() const { return LastCourseGuide; }
	// Invite affichée à la dernière image (tests, relevé en partie réelle) ; vide si aucune.
	const FString& LastPromptShown() const { return LastPrompt; }
	// Vrai si le HUD de débogage a été dessiné à la dernière image (tests, relevé des captures en partie réelle).
	bool DrewDebugLastFrame() const { return bDrewDebug; }
	// Toile de dessin hors PostRender (tests : DrawHUD appelé dans un monde de test).
	void SetCanvasForTest(class UCanvas* C) { Canvas = C; }
private:
	// Minicarte nord en haut, centrée sur le joueur : zones, routes, lieux, obstacles, cheval, cap et GPS.
	void DrawMinimap(const APawn* P, const class UStridesProgressionSubsystem* Progress);
	void DrawPhone(const class UStridesProgressionSubsystem* Progress);
	void DrawCourseGuide();
	// Texte du HUD de débogage : balises <b> de l'astuce retirées (le web les rend en gras), « ▸ » rendu « > » (glyphe
	// absent de la police par défaut du moteur ; l'interface d'épreuve UMG de la tranche T7 en aura une qui l'a).
	static FString DebugText(const FString& S);
	// Cible du guidage vers le chrono du Pôle (départ de l'activité, repère web x, z) ; faux si mission en cours.
	bool PoleGoal(FVector2D& Out) const;
	FString LastEvent;
	bool bDrewDebug = false;
	FString LastPrompt;
	FString LastCourseGuide;
	float EventT = 0.f;
	TWeakObjectPtr<class AStridesCourse> Course;  // épreuve du Pôle (objectif affiché tant qu'elle est en cours)
};
