#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "StridesProgressionSubsystem.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API UStridesProgressionSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()
public:
	UPROPERTY(BlueprintReadOnly, Category="Strides|Progression") int32 Credits = 0;
	UPROPERTY(BlueprintReadOnly, Category="Strides|Progression") int32 Reputation = 0;
	UPROPERTY(BlueprintReadOnly, Category="Strides|Progression") FString ActiveMissionId;
	UPROPERTY(BlueprintReadOnly, Category="Strides|Progression") TArray<FString> CompletedMissions;
	UPROPERTY(BlueprintReadOnly, Category="Strides|Progression") FString LastMessage;

	UFUNCTION(BlueprintCallable, Category="Strides|Progression") bool StartNextMission();
	UFUNCTION(BlueprintCallable, Category="Strides|Progression") bool CompleteActiveMission();
	UFUNCTION(BlueprintPure, Category="Strides|Progression") FString MissionStatus() const;
	UFUNCTION(BlueprintPure, Category="Strides|Progression") FString RankName() const;
	UFUNCTION(BlueprintPure, Category="Strides|Progression") FVector2D ActiveTarget() const;
	UFUNCTION(BlueprintPure, Category="Strides|Progression") bool HasActiveTarget() const;
	bool IsAvailable(const struct FStridesMissionDefinition& Mission) const;
	void Restore(int32 InCredits, int32 InReputation, const FString& InActiveMission, const TArray<FString>& InCompleted);
};
