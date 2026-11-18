#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesWorldDirector.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API AStridesWorldDirector : public AActor
{
	GENERATED_BODY()
public:
	AStridesWorldDirector();
	void BuildWorld();
	virtual void Tick(float DeltaSeconds) override;
	UPROPERTY(BlueprintReadOnly, Category="Strides|World") class AStridesCourse* PoleCourse = nullptr;
	UPROPERTY(BlueprintReadOnly, Category="Strides|World") class AStridesScenery* Scenery = nullptr;
private:
	class AStaticMeshActor* SpawnBlock(const FVector& Location, const FVector& Size, const FRotator& Rotation = FRotator::ZeroRotator, const FLinearColor& Color = FLinearColor(.45f, .48f, .5f));
	float MissionCheckTimer = 0.f;
	UPROPERTY() TObjectPtr<class AStaticMeshActor> MissionBeacon;
};
