#include "StridesGameMode.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyLight.h"
#include "Engine/StaticMesh.h"
#include "Engine/StaticMeshActor.h"
#include "Kismet/GameplayStatics.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesHUD.h"
#include "StridesHorse.h"
#include "StridesPlayerController.h"
#include "StridesRider.h"
#include "StridesUnits.h"
#include "StridesWorldDirector.h"

AStridesGameMode::AStridesGameMode()
{
	DefaultPawnClass = AStridesRider::StaticClass();
	PlayerControllerClass = AStridesPlayerController::StaticClass();
	HUDClass = AStridesHUD::StaticClass();
}

void AStridesGameMode::StartPlay()
{
	UWorld* W = GetWorld();
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	AStridesWorldDirector* WorldDirector = W->SpawnActor<AStridesWorldDirector>();
	WorldDirector->BuildWorld();
	// Soleil (mobile : ombres en cascade limitées, DefaultEngine.ini) et lumière du ciel.
	ADirectionalLight* Sun = W->SpawnActor<ADirectionalLight>(FVector::ZeroVector, FRotator(-42, 35, 0));
	Sun->GetLightComponent()->SetIntensity(6.f);
	ASkyLight* Sky = W->SpawnActor<ASkyLight>();
	Sky->GetLightComponent()->SetIntensity(1.f);
	Sky->GetLightComponent()->bRealTimeCapture = false;
	// Le jeu commence à l'Écurie du Val, comme la version Strides complète. Le parcours reste au Pôle.
	AStridesCourse* Course = WorldDirector->PoleCourse;
	AStridesHorse* Horse = W->SpawnActor<AStridesHorse>();
	Horse->Course = Course;
	const FVector Spawn = Data ? Data->WorldSpawn : FVector(-104.f, 168.f, .35f);
	Horse->PlaceAt(Spawn.X, Spawn.Y, Spawn.Z);
	Super::StartPlay();
	// Cavalier à pied, 2 m à gauche du cheval (côté montoir).
	if (APlayerController* PC = UGameplayStatics::GetPlayerController(W, 0))
		if (APawn* Pawn = PC->GetPawn())
			Pawn->SetActorLocationAndRotation(Horse->GetActorLocation() - Horse->GetActorRightVector() * 200.0 + FVector(0, 0, 90), Horse->GetActorRotation());
}
