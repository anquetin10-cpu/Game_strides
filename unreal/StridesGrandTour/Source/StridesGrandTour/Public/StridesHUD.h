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
	// Vrai si le HUD de débogage a été dessiné à la dernière image (tests, relevé des captures en partie réelle).
	bool DrewDebugLastFrame() const { return bDrewDebug; }
	// Toile de dessin hors PostRender (tests : DrawHUD appelé dans un monde de test).
	void SetCanvasForTest(class UCanvas* C) { Canvas = C; }
private:
	// Minicarte nord en haut, centrée sur le joueur : zones, routes, lieux, obstacles, cheval, cap et GPS.
	void DrawMinimap(const APawn* P, const class UStridesProgressionSubsystem* Progress);
	void DrawPhone(const class UStridesProgressionSubsystem* Progress);
	// Texte du HUD de débogage : balises <b> de l'astuce retirées (le web les rend en gras), « ▸ » rendu « > » (glyphe
	// absent de la police par défaut du moteur ; l'interface d'épreuve UMG de la tranche T7 en aura une qui l'a).
	static FString DebugText(const FString& S);
	FString LastEvent;
	bool bDrewDebug = false;
	float EventT = 0.f;
	TWeakObjectPtr<class AStridesCourse> Course;  // épreuve du Pôle (objectif affiché tant qu'elle est en cours)
};
