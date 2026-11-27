#include "StridesWorldDirector.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/StaticMeshActor.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "StridesAmbientLife.h"
#include "StridesCourse.h"
#include "StridesCore/CsoEntry.h"
#include "StridesDataSubsystem.h"
#include "StridesProgressionSubsystem.h"
#include "StridesSaveSubsystem.h"
#include "StridesScenery.h"
#include "StridesPlayerController.h"
#include "EngineUtils.h"
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
	// Décor complet exporté du jeu web (relief, routes, mer, architecture, haies, arbres), habillé de matériaux photo.
	Scenery = GetWorld()->SpawnActor<AStridesScenery>();
	Scenery->Build(*Data);
	// Jalon J3 : circulation, passants et spectateurs du web (src/gameplay/npcs.js Ambient), silhouettes provisoires.
	Ambient = GetWorld()->SpawnActor<AStridesAmbientLife>();
	if (Ambient && !Ambient->Build(*Data)) UE_LOG(LogTemp, Warning, TEXT("Strides vie ambiante : données absentes"));
	MissionBeacon = SpawnBlock(FVector(0, 0, -5000), FVector(120.f, 120.f, 1800.f), FRotator::ZeroRotator, FLinearColor(1.f, .63f, .05f));
	MissionBeacon->SetActorHiddenInGame(true);
	MissionBeacon->SetActorEnableCollision(false);
	PoleCourse = GetWorld()->SpawnActor<AStridesCourse>();
	// Le tracé est donné dans le repère de la carrière du Pôle (centre de la piste, cso_course_pole.json : arena).
	strides::CourseDesign PoleDesign = Data->PoleCourse();
	PoleDesign.x += Data->PoleArena.X;
	PoleDesign.z += Data->PoleArena.Y;
	PoleCourse->Build(PoleDesign, *Data);
	if (const strides::CsoActivity* A = Data->CsoActivity())
	{
		// Colonne de 1 m × 30 m, sans collision, à côté du poteau (hors du chemin du cheval : 1,5 m à l'est).
		PoleBeacon = SpawnBlock(StridesUnits::WebToUE(A->startX + 1.5, Data->TerrainHeight(A->startX + 1.5, A->startZ) + 15.0, A->startZ), FVector(100.f, 100.f, 3000.f),
			FRotator::ZeroRotator, FLinearColor(.49f, 1.f, .77f));
		PoleBeacon->SetActorEnableCollision(false);
		PoleBeacon->GetStaticMeshComponent()->SetCastShadow(false);
	}
}

void AStridesWorldDirector::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	MissionCheckTimer += DeltaSeconds;
	if (MissionCheckTimer < .25f) return;
	MissionCheckTimer = 0.f;
	UStridesProgressionSubsystem* Progress = GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>();
	APawn* Pawn = UGameplayStatics::GetPlayerPawn(GetWorld(), 0);
	// Monde de test (contrôleur créé sans joueur local) : le pion du contrôleur du jeu.
	if (!Pawn) for (TActorIterator<AStridesPlayerController> It(GetWorld()); It && !Pawn; ++It) Pawn = It->GetPawn();
	if (PoleBeacon)
	{
		// Visible sans mission de carrière ni épreuve, et seulement de loin (à moins de 12 m, l'invite « E · Chrono » prend le relais).
		bool bShow = Pawn && !(Progress && (Progress->HasActiveTarget() || Progress->HasGps())) && !(PoleCourse && PoleCourse->MissionActive());
		if (bShow)
		{
			double X, Y, Z;
			StridesUnits::UEToWeb(Pawn->GetActorLocation(), X, Y, Z);
			double BX, BY, BZ;
			StridesUnits::UEToWeb(PoleBeacon->GetActorLocation(), BX, BY, BZ);
			bShow = FVector2D::Distance(FVector2D(X, Z), FVector2D(BX, BZ)) > 12.0;
		}
		PoleBeacon->SetActorHiddenInGame(!bShow);
	}
	// Balise du GPS (gps.js marker) : cible de la mission en cours, sinon le GPS posé à la main (app Activités, J3).
	FVector2D Target;
	FString Label;
	if (!Progress || !Pawn || !Progress->GuideTarget(Target, Label))
	{
		if (MissionBeacon) MissionBeacon->SetActorHiddenInGame(true);
		return;
	}
	if (MissionBeacon)
	{
		MissionBeacon->SetActorHiddenInGame(false);
		MissionBeacon->SetActorLocation(StridesUnits::WebToUE(Target.X, GetGameInstance()->GetSubsystem<UStridesDataSubsystem>()->TerrainHeight(Target.X, Target.Y) + 9., Target.Y));
		MissionBeacon->AddActorLocalRotation(FRotator(0, 20.f, 0));
	}
	double X, Y, Z;
	StridesUnits::UEToWeb(Pawn->GetActorLocation(), X, Y, Z);
	const double D = FVector2D::Distance(FVector2D(X, Z), Target);
	if (Progress->HasActiveTarget())
	{
		if (D <= 18.f && Progress->CompleteActiveMission())
		{
			// missions.complete : sauvegarde tout de suite (saveNow), comme à l'acceptation.
			if (UStridesSaveSubsystem* Save = GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>())
				if (Save->bAutoSave) Save->SaveNow(Cast<APlayerController>(Pawn->GetController()));
		}
	}
	else if (D <= 6.0)
	{
		UE_LOG(LogTemp, Display, TEXT("Strides GPS : arrivé à %s"), *Label);
		Progress->ClearGps();
	}
}
