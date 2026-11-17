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
	UPROPERTY(BlueprintReadOnly, Category="Strides|World") class AStridesCourse* PoleCourse = nullptr;
private:
	class AStaticMeshActor* SpawnBlock(const FVector& Location, const FVector& Size, const FRotator& Rotation = FRotator::ZeroRotator);
};
