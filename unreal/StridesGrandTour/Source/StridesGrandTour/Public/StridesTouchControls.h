#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "StridesTouchControls.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API UStridesTouchControls : public UUserWidget
{
	GENERATED_BODY()

protected:
	virtual void NativeOnInitialized() override;

private:
	UFUNCTION() void Jump();
	UFUNCTION() void Interact();
	UFUNCTION() void GaitUp();
	UFUNCTION() void GaitDown();
	UFUNCTION() void Save();
	UFUNCTION() void Load();

	UPROPERTY() TObjectPtr<class AStridesPlayerController> Controller;
};
