#include "StridesWorldDirector.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/StaticMeshActor.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesProgressionSubsystem.h"
#include "StridesUnits.h"
#include "Kismet/GameplayStatics.h"

AStridesWorldDirector::AStridesWorldDirector() { PrimaryActorTick.bCanEverTick = true; PrimaryActorTick.TickInterval = .25f; }

AStaticMeshActor* AStridesWorldDirector::SpawnBlock(const FVector& Location, const FVector& Size, const FRotator& Rotation, const FLinearColor& Color)
{
	AStaticMeshActor* A = GetWorld()->SpawnActor<AStaticMeshActor>(Location, Rotation);
	A->SetMobility(EComponentMobility::Movable);
	A->GetStaticMeshComponent()->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube")));
	if (UMaterialInterface* Base = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial")))
	{
		UMaterialInstanceDynamic* Material = UMaterialInstanceDynamic::Create(Base, A);
		Material->SetVectorParameterValue(TEXT("Color"), Color);
		A->GetStaticMeshComponent()->SetMaterial(0, Material);
	}
	A->SetActorScale3D(Size / 100.f);
	return A;
}

void AStridesWorldDirector::BuildWorld()
{
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	if (!Data) return;
	// Socle de 1,2 km². Ces volumes garantissent l'échelle, les coordonnées et les collisions avant les décors finaux.
	SpawnBlock(FVector(0, 0, -50), FVector(Data->WorldSize * 100.f, Data->WorldSize * 100.f, 100.f), FRotator::ZeroRotator, FLinearColor(.16f, .33f, .14f));
	for (const FStridesRoad& Road : Data->Roads)
		for (int32 I = 1; I < Road.Points.Num(); ++I)
		{
			const FVector A = StridesUnits::WebToUE(Road.Points[I - 1].X, .03, Road.Points[I - 1].Y);
			const FVector B = StridesUnits::WebToUE(Road.Points[I].X, .03, Road.Points[I].Y);
			const FVector D = B - A;
			SpawnBlock((A + B) * .5f, FVector(D.Size(), Road.Width * 100.f, 8.f), FRotator(0, FMath::RadiansToDegrees(FMath::Atan2(D.Y, D.X)), 0), FLinearColor(.12f, .13f, .15f));
		}
	for (const FStridesWorldRegion& R : Data->WorldRegions)
	{
		if (R.Kind == TEXT("nature") || R.Id == TEXT("town")) continue;
		const FVector P = StridesUnits::WebToUE(R.Center.X, .05, R.Center.Y);
		const FLinearColor RegionColor = R.Kind == TEXT("competition") ? FLinearColor(.3f, .38f, .3f) : R.Kind == TEXT("stable") ? FLinearColor(.24f, .4f, .2f) : FLinearColor(.34f, .34f, .31f);
		SpawnBlock(P, FVector(R.Size.X * 100.f, R.Size.Y * 100.f, 10.f), FRotator::ZeroRotator, RegionColor);
	}
	for (const FStridesPoi& Poi : Data->PointsOfInterest)
	{
		const bool Event = Poi.Icon == TEXT("event"), Shop = Poi.Icon == TEXT("shop") || Poi.Icon == TEXT("pro");
		const FLinearColor Color = Event ? FLinearColor(.18f, .35f, .62f) : Shop ? FLinearColor(.65f, .36f, .12f) : FLinearColor(.42f, .24f, .14f);
		const FVector Center = StridesUnits::WebToUE(Poi.Position.X, 2., Poi.Position.Y);
		SpawnBlock(Center, FVector(Event ? 1800.f : 1000.f, Event ? 900.f : 750.f, Event ? 400.f : 600.f), FRotator::ZeroRotator, Color);
		SpawnBlock(Center + FVector(0, 0, Event ? 500.f : 700.f), FVector(Event ? 900.f : 700.f, Event ? 1000.f : 800.f, 120.f), FRotator::ZeroRotator, Color * .8f);
	}
	MissionBeacon = SpawnBlock(FVector(0, 0, -5000), FVector(120.f, 120.f, 1800.f), FRotator::ZeroRotator, FLinearColor(1.f, .63f, .05f));
	MissionBeacon->SetActorHiddenInGame(true);
	MissionBeacon->SetActorEnableCollision(false);
	PoleCourse = GetWorld()->SpawnActor<AStridesCourse>();
	strides::CourseDesign PoleDesign = Data->PoleCourse();
	if (const FStridesPoi* Pole = Data->PointsOfInterest.FindByPredicate([](const FStridesPoi& P) { return P.Id == TEXT("pole"); }))
	{
		PoleDesign.x += Pole->Position.X;
		PoleDesign.z += Pole->Position.Y;
	}
	PoleCourse->Build(PoleDesign, *Data);
}

void AStridesWorldDirector::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	MissionCheckTimer += DeltaSeconds;
	if (MissionCheckTimer < .25f) return;
	MissionCheckTimer = 0.f;
	UStridesProgressionSubsystem* Progress = GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>();
	APawn* Pawn = UGameplayStatics::GetPlayerPawn(GetWorld(), 0);
	if (!Progress || !Pawn || !Progress->HasActiveTarget())
	{
		if (MissionBeacon) MissionBeacon->SetActorHiddenInGame(true);
		return;
	}
	const FVector2D Target = Progress->ActiveTarget();
	if (MissionBeacon)
	{
		MissionBeacon->SetActorHiddenInGame(false);
		MissionBeacon->SetActorLocation(StridesUnits::WebToUE(Target.X, 9., Target.Y));
		MissionBeacon->AddActorLocalRotation(FRotator(0, 20.f, 0));
	}
	double X, Y, Z;
	StridesUnits::UEToWeb(Pawn->GetActorLocation(), X, Y, Z);
	if (FVector2D::Distance(FVector2D(X, Z), Target) <= 18.f)
		Progress->CompleteActiveMission();
}
