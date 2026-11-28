// Aides visuelles du parcours de CSO (tranche T9) : tracé au sol en tirets (jusqu'à l'obstacle suivant puis, plus pâle,
// 12 m après lui), bandes de la zone d'appel (ambre : le saut passe, verte : bonne zone) et repère conique au-dessus de
// l'obstacle suivant — rendu de strides::CsoCourseAids (portage de src/gameplay/courseAids.js). Géométries, couleurs,
// opacités, faces et ordre de rendu relus dans la scène du jeu web (Content/Data/cso_aids.json, scripts/unreal/
// export-cso-runs.mjs --aids) ; matériaux translucides sans éclairage /Game/World/Cso/Materials/M_CsoAid (une face) et
// M_CsoAidTwoSided (deux faces), créés par scripts/unreal/import-cso-aids.py.
// Chaque sommet est calculé dans le repère du web (positions, rotation y et échelle des maillages three.js), puis converti
// par StridesUnits::WebToUE ; l'ordre des sommets des triangles est celui du web.
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesCore/CourseAids.h"
#include <functional>
#include <memory>
#include "StridesCourseAids.generated.h"

class UProceduralMeshComponent;
class UMaterialInstanceDynamic;

UCLASS()
class STRIDESGRANDTOUR_API AStridesCourseAids : public AActor
{
	GENERATED_BODY()
public:
	AStridesCourseAids();
	// new CourseAids(game, courseId) : ligne du cavalier dans le repère du monde (vide : pas de tracé), sol
	// (terrain.getHeight). Tout est masqué jusqu'au premier Step.
	void Begin(const std::vector<strides::TracePoint>& Line, std::function<double(double, double)> Ground);
	// CourseAids.update : cœur puis maillages.
	void Step(const strides::CsoAidsInput& In);
	// dispose : plus d'aides (fin du parcours).
	void End();
	bool Active() const { return Core.IsValid(); }
	const strides::CsoCourseAids* CoreAids() const { return Core.Get(); }
	// Captures : état posé par AStridesShots (rejeu de l'oracle), l'épreuve ne le change plus.
	bool bFrozen = false;

	// Relevé de l'affichage (tests, captures) : tirets affichés de chaque maillage du tracé, sections visibles, sommets
	// (repère web, m) des bandes et du repère.
	int32 LineQuads() const { return LineShown.Y; }
	int32 AfterQuads() const { return AfterShown.Y; }
	bool IsShown(const FString& Part) const;  // « line », « after », « ok », « good », « mark »
	TArray<FVector> WebVertices(const FString& Part) const;
	UMaterialInterface* PartMaterial(const FString& Part) const;
	int32 SortPriority(const FString& Part) const;

private:
	void Apply();
	void BuildMaterials();
	void SetLine(UProceduralMeshComponent* Mesh, FIntPoint& Shown, bool bVisible, int32 First, int32 Count);
	void SetBand(UProceduralMeshComponent* Mesh, TArray<FVector>& Web, const strides::CsoAidsBand& B);
	UProceduralMeshComponent* NewMesh(const TCHAR* Name);

	UPROPERTY() TObjectPtr<UProceduralMeshComponent> LineMesh;
	UPROPERTY() TObjectPtr<UProceduralMeshComponent> AfterMesh;
	UPROPERTY() TObjectPtr<UProceduralMeshComponent> OkMesh;
	UPROPERTY() TObjectPtr<UProceduralMeshComponent> GoodMesh;
	UPROPERTY() TObjectPtr<UProceduralMeshComponent> MarkMesh;
	UPROPERTY() TArray<TObjectPtr<UMaterialInstanceDynamic>> Materials;
	TUniquePtr<strides::CsoCourseAids> Core;
	std::function<double(double, double)> GroundFn;
	TArray<FVector> MarkCorners;          // coins des tirets (repère web : x, sol + 0,04, z), 4 par tiret
	TArray<double> ConePos, BandPos;      // géométries du web (positions locales)
	TArray<int32> ConeIdx, BandIdx;
	FIntPoint LineShown = FIntPoint(-1, -1), AfterShown = FIntPoint(-1, -1);  // (premier, nombre) affichés, -1 : masqué
	TArray<FVector> OkWeb, GoodWeb, MarkWeb;
	bool bMaterials = false;
};
