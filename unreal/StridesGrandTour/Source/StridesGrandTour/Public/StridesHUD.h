// HUD provisoire de la première tranche (texte : mode, allure, vitesse, cadence, chrono, fautes, appel, événements du
// parcours, sauvegarde, journal des données). L'interface UMG du jeu (HUD du web, téléphone Strides) vient ensuite.
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "StridesHUD.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API AStridesHUD : public AHUD
{
	GENERATED_BODY()
public:
	virtual void DrawHUD() override;
	virtual void BeginPlay() override;
	UFUNCTION() void OnCourseEvent(const FString& Kind, const FString& Text);
private:
	// Minicarte nord en haut, centrée sur le joueur : zones, routes, lieux, obstacles, cheval, cap et GPS.
	void DrawMinimap(const APawn* P, const class UStridesProgressionSubsystem* Progress);
	// Texte du HUD de débogage : balises <b> de l'astuce retirées (le web les rend en gras), « ▸ » rendu « > » (glyphe
	// absent de la police par défaut du moteur ; l'interface d'épreuve UMG de la tranche T7 en aura une qui l'a).
	static FString DebugText(const FString& S);
	FString LastEvent;
	float EventT = 0.f;
	TWeakObjectPtr<class AStridesCourse> Course;  // épreuve du Pôle (objectif affiché tant qu'elle est en cours)
};
