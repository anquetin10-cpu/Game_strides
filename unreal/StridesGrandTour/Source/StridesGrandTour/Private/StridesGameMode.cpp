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
	// Sol de la carrière (120 × 76 m, POLE.arena) et un peu de marge.
	AStaticMeshActor* Ground = W->SpawnActor<AStaticMeshActor>();
	Ground->SetMobility(EComponentMobility::Movable);
	Ground->GetStaticMeshComponent()->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Plane.Plane")));
	Ground->SetActorScale3D(FVector(140, 96, 1));  // plan de base : 1 m de côté
	// Soleil (mobile : ombres en cascade limitées, DefaultEngine.ini) et lumière du ciel.
	ADirectionalLight* Sun = W->SpawnActor<ADirectionalLight>(FVector::ZeroVector, FRotator(-42, 35, 0));
	Sun->GetComponent()->SetIntensity(6.f);
	ASkyLight* Sky = W->SpawnActor<ASkyLight>();
	Sky->GetLightComponent()->SetIntensity(1.f);
	Sky->GetLightComponent()->bRealTimeCapture = false;
	// Parcours du Pôle, à 1,10 m (épreuve nationale).
	AStridesCourse* Course = W->SpawnActor<AStridesCourse>();
	if (Data) Course->Build(Data->PoleCourse(), *Data);
	// Cheval à l'entrée de piste (premier point de l'abord), cap du tracé.
	AStridesHorse* Horse = W->SpawnActor<AStridesHorse>();
	Horse->Course = Course;
	const strides::CourseTrace T = strides::traceCourse(Data ? Data->PoleCourse() : strides::poleDesign());
	const strides::TracePoint& P0 = T.leadIn.empty() ? T.pts.front() : T.leadIn.front();
	Horse->PlaceAt(P0.x, P0.z, P0.h);
	Super::StartPlay();
	// Cavalier à pied, 2 m à gauche du cheval (côté montoir).
	if (APlayerController* PC = UGameplayStatics::GetPlayerController(W, 0))
		if (APawn* Pawn = PC->GetPawn())
			Pawn->SetActorLocationAndRotation(Horse->GetActorLocation() - Horse->GetActorRightVector() * 200.0 + FVector(0, 0, 90), Horse->GetActorRotation());
}
