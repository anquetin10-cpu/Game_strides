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
	FString LastEvent;
	float EventT = 0.f;
};
