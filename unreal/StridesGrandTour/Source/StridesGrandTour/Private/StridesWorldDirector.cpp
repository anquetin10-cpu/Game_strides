#include "StridesWorldDirector.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/StaticMeshActor.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesUnits.h"

AStridesWorldDirector::AStridesWorldDirector() { PrimaryActorTick.bCanEverTick = false; }

AStaticMeshActor* AStridesWorldDirector::SpawnBlock(const FVector& Location, const FVector& Size, const FRotator& Rotation)
{
	AStaticMeshActor* A = GetWorld()->SpawnActor<AStaticMeshActor>(Location, Rotation);
	A->SetMobility(EComponentMobility::Movable);
	A->GetStaticMeshComponent()->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube")));
	A->SetActorScale3D(Size / 100.f);
	return A;
}

void AStridesWorldDirector::BuildWorld()
{
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	if (!Data) return;
	// Socle de 1,2 km². Ces volumes garantissent l'échelle, les coordonnées et les collisions avant les décors finaux.
	SpawnBlock(FVector(0, 0, -50), FVector(Data->WorldSize * 100.f, Data->WorldSize * 100.f, 100.f));
	for (const FStridesRoad& Road : Data->Roads)
		for (int32 I = 1; I < Road.Points.Num(); ++I)
		{
			const FVector A = StridesUnits::WebToUE(Road.Points[I - 1].X, .03, Road.Points[I - 1].Y);
			const FVector B = StridesUnits::WebToUE(Road.Points[I].X, .03, Road.Points[I].Y);
			const FVector D = B - A;
			SpawnBlock((A + B) * .5f, FVector(D.Size(), Road.Width * 100.f, 8.f), FRotator(0, FMath::RadiansToDegrees(FMath::Atan2(D.Y, D.X)), 0));
		}
	for (const FStridesWorldRegion& R : Data->WorldRegions)
	{
		if (R.Kind == TEXT("nature") || R.Id == TEXT("town")) continue;
		const FVector P = StridesUnits::WebToUE(R.Center.X, .05, R.Center.Y);
		SpawnBlock(P, FVector(R.Size.X * 100.f, R.Size.Y * 100.f, 10.f));
	}
	for (const FStridesPoi& Poi : Data->PointsOfInterest)
		SpawnBlock(StridesUnits::WebToUE(Poi.Position.X, 2., Poi.Position.Y), FVector(300.f, 300.f, 400.f));
	PoleCourse = GetWorld()->SpawnActor<AStridesCourse>();
	PoleCourse->Build(Data->PoleCourse(), *Data);
}
