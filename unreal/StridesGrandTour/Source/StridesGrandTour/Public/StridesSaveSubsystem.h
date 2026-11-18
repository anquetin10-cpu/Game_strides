// Sauvegarde native : le contenu est la sauvegarde versionnée du cœur (strides::SaveGame, JSON « strides.save »), rangée
// dans un USaveGame (emplacement « strides_main ») ; import d'une sauvegarde exportée du jeu web.
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "StridesSaveSubsystem.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API UStridesSaveGame : public USaveGame
{
	GENERATED_BODY()
public:
	UPROPERTY() FString Json;
	UPROPERTY() int32 Credits = 0;
	UPROPERTY() int32 Reputation = 0;
	UPROPERTY() FString ActiveMissionId;
	UPROPERTY() TArray<FString> CompletedMissions;
};

UCLASS()
class STRIDESGRANDTOUR_API UStridesSaveSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()
public:
	UFUNCTION(BlueprintCallable, Category = "Strides") bool SaveNow(class APlayerController* PC);
	UFUNCTION(BlueprintCallable, Category = "Strides") bool LoadNow(class APlayerController* PC);
	// Import du fichier exporté depuis Réglages du jeu web (chemin local) : devient la sauvegarde native.
	UFUNCTION(BlueprintCallable, Category = "Strides") bool ImportWebExport(const FString& Path);
	UPROPERTY(BlueprintReadOnly, Category = "Strides") FString LastMessage;
	static const FString Slot;
};
