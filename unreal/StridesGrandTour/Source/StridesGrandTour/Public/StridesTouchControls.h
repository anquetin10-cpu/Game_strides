#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "StridesCore/CsoHud.h"
#include "StridesTouchControls.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API UStridesTouchControls : public UUserWidget
{
	GENERATED_BODY()

public:
	// Bouton visible selon l'état du HUD d'épreuve (tranche T7) : en mode concours, seuls restent ceux que le jeu web
	// garde (SAUT ; styles.css:988-995 : action, BOOST, téléphone masqués) ; SAUVER, CHARGER et MISSION, sans équivalent
	// dans le HUD du web, sont masqués aussi. Hors épreuve (RaceHud nul ou sans cso-ctl) : tous visibles.
	static bool ButtonVisible(const FString& Name, const strides::CsoHud* RaceHud);
	// Noms des boutons visibles (tests).
	TArray<FString> VisibleButtons() const;

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	UFUNCTION() void Jump();
	UFUNCTION() void Interact();
	UFUNCTION() void GaitUp();
	UFUNCTION() void GaitDown();
	UFUNCTION() void Save();
	UFUNCTION() void Load();
	UFUNCTION() void Phone();
	UFUNCTION() void Mission();

	UPROPERTY() TObjectPtr<class AStridesPlayerController> Controller;
	UPROPERTY() TArray<TObjectPtr<class UButton>> Buttons;
	TWeakObjectPtr<class AStridesCourse> Course;
};
