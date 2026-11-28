// Décor du monde, reconstruit à partir de l'export du jeu web (scripts/unreal/world-export.js, import-world.py) :
// relief maillé à 2 m avec collisions et prolongé jusqu'à l'horizon, routes posées sur le relief, mer et étang,
// architecture (bâtiments, clôtures, mobilier, enseignes), haies et arbres instanciés. Le jeu web reste la référence
// du placement ; Unreal apporte les matériaux photo (CC0), l'éclairage et l'atmosphère.
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesScenery.generated.h"

class UStridesDataSubsystem;

UCLASS()
class STRIDESGRANDTOUR_API AStridesScenery : public AActor
{
	GENERATED_BODY()
public:
	AStridesScenery();
	void Build(const UStridesDataSubsystem& Data);

	// Comptes rendus (journal et tests) : ce qui a réellement été construit.
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") int32 TerrainTriangles = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") int32 ArchitectureMeshes = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") int32 TreeInstances = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") int32 HedgeMeshes = 0;
	// Mer (jalon J3-C : hauteur suivant la marée du web, AStridesWorldClock).
	UPROPERTY() TObjectPtr<class UStaticMeshComponent> SeaMesh;

private:
	void BuildTerrain(const UStridesDataSubsystem& Data, class UMaterialInterface* Material);
	void BuildRoads(const UStridesDataSubsystem& Data, class UMaterialInterface* Material);
	void BuildWater(const UStridesDataSubsystem& Data, class UMaterialInterface* Material);
	void BuildTrees(const UStridesDataSubsystem& Data, const TArray<FString>& Meshes);
	class UStaticMeshComponent* AddMesh(class UStaticMesh* Mesh, bool bCollide, bool bShadow);

	UPROPERTY() TObjectPtr<class UProceduralMeshComponent> Terrain;
	UPROPERTY() TObjectPtr<class UProceduralMeshComponent> Roads;
	UPROPERTY() TArray<TObjectPtr<class UHierarchicalInstancedStaticMeshComponent>> TreeComponents;
};
