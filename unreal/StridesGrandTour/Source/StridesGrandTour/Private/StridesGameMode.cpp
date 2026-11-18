#include "StridesGameMode.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/PostProcessVolume.h"
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
	// Ciel lisible : soleil lié à une atmosphère physique, brouillard de hauteur léger, lumière du ciel
	// capturée sur cette atmosphère, exposition fixe. Sans atmosphère ni capture, le ciel restait noir
	// et les faces à l'ombre n'avaient aucune lumière ambiante. Tout est compatible avec le rendu mobile.
	ADirectionalLight* Sun = W->SpawnActor<ADirectionalLight>();
	UDirectionalLightComponent* SunLight = CastChecked<UDirectionalLightComponent>(Sun->GetLightComponent());
	SunLight->SetMobility(EComponentMobility::Movable);
	Sun->SetActorRotation(FRotator(-42, 35, 0));
	SunLight->SetIntensity(10.f);  // lux
	SunLight->SetAtmosphereSunLight(true);
	W->SpawnActor<ASkyAtmosphere>();
	AExponentialHeightFog* Fog = W->SpawnActor<AExponentialHeightFog>();
	UExponentialHeightFogComponent* FogComponent = Fog->GetComponent();
	FogComponent->SetFogDensity(.006f);
	FogComponent->SetFogHeightFalloff(.12f);
	FogComponent->SetFogInscatteringColor(FLinearColor(.45f, .58f, .75f));
	ASkyLight* Sky = W->SpawnActor<ASkyLight>();
	USkyLightComponent* SkyLight = Sky->GetLightComponent();
	SkyLight->SetMobility(EComponentMobility::Movable);
	SkyLight->bRealTimeCapture = false;
	SkyLight->SetIntensity(1.f);
	SkyLight->RecaptureSky();
	APostProcessVolume* Post = W->SpawnActor<APostProcessVolume>();
	Post->bUnbound = true;
	FPostProcessSettings& PP = Post->Settings;
	PP.bOverride_AutoExposureMethod = true;
	PP.AutoExposureMethod = AEM_Manual;
	PP.bOverride_AutoExposureApplyPhysicalCameraExposure = true;
	PP.AutoExposureApplyPhysicalCameraExposure = false;
	PP.bOverride_AutoExposureBias = true;
	PP.AutoExposureBias = -.6f;
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
