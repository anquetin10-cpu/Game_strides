#include "StridesGameMode.h"
#include "StridesSaveSubsystem.h"
#include "StridesCore/SaveGame.h"
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
#include "StridesActivityPost.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesHUD.h"
#include "StridesHorse.h"
#include "StridesPlayerController.h"
#include "StridesRider.h"
#include "StridesShots.h"
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
	// Ombres portées nettes jusqu'à 250 m (cascades), au-delà ombres lointaines : le relief et les arbres se lisent.
	SunLight->SetDynamicShadowDistanceMovableLight(25000.f);
	SunLight->SetDynamicShadowCascades(3);
	SunLight->SetCascadeDistributionExponent(2.4f);
	W->SpawnActor<ASkyAtmosphere>();
	AExponentialHeightFog* Fog = W->SpawnActor<AExponentialHeightFog>();
	UExponentialHeightFogComponent* FogComponent = Fog->GetComponent();
	FogComponent->SetFogDensity(.0035f);
	FogComponent->SetFogHeightFalloff(.12f);
	FogComponent->SetFogInscatteringColor(FLinearColor(.45f, .58f, .75f));
	ASkyLight* Sky = W->SpawnActor<ASkyLight>();
	USkyLightComponent* SkyLight = Sky->GetLightComponent();
	SkyLight->SetMobility(EComponentMobility::Movable);
	SkyLight->bRealTimeCapture = false;
	SkyLight->SetIntensity(1.5f);
	SkyLight->RecaptureSky();
	APostProcessVolume* Post = W->SpawnActor<APostProcessVolume>();
	Post->bUnbound = true;
	FPostProcessSettings& PP = Post->Settings;
	PP.bOverride_AutoExposureMethod = true;
	PP.AutoExposureMethod = AEM_Manual;
	PP.bOverride_AutoExposureApplyPhysicalCameraExposure = true;
	PP.AutoExposureApplyPhysicalCameraExposure = false;
	PP.bOverride_AutoExposureBias = true;
	PP.AutoExposureBias = -1.f;
	// Occlusion ambiante d'écran (rendu Mac ; le rendu mobile l'ignore) et léger halo, comme une photo de plein jour.
	PP.bOverride_AmbientOcclusionIntensity = true;
	PP.AmbientOcclusionIntensity = .65f;
	PP.bOverride_AmbientOcclusionRadius = true;
	PP.AmbientOcclusionRadius = 180.f;
	PP.bOverride_BloomIntensity = true;
	PP.BloomIntensity = .35f;
	PP.bOverride_VignetteIntensity = true;
	PP.VignetteIntensity = .25f;
	PP.bOverride_ColorSaturation = true;
	PP.ColorSaturation = FVector4(1.04f, 1.04f, 1.04f, 1.f);
	PP.bOverride_ColorContrast = true;
	PP.ColorContrast = FVector4(1.06f, 1.06f, 1.06f, 1.f);
	// Le jeu commence à l'Écurie du Val, comme la version Strides complète. Le parcours reste au Pôle.
	AStridesCourse* Course = WorldDirector->PoleCourse;
	AStridesHorse* Horse = W->SpawnActor<AStridesHorse>();
	Horse->Course = Course;
	// Épreuve du Pôle (tranche T10) : rien n'est lancé au démarrage, comme le jeu web. Le poteau « Chrono » de l'activité
	// cso_train (AStridesActivityPost, Content/Data/cso_activity.json) propose son action à cheval à moins de 6 m du départ,
	// sans mission en cours ; elle lance l'activité (grand message, contrôle de capacité, présentation, puis rejoindre
	// l'entrée de la carrière…). Joueur et langue : ceux d'une sauvegarde neuve (strides::SaveGame, comme save.js) ; cheval :
	// profil du cheval du joueur (lu au déclenchement).
	if (Course)
	{
		const strides::SaveGame Fresh;
		Course->Lang = UTF8_TO_TCHAR(Fresh.lang.c_str());
		// Aide à l'appel : réglage de la sauvegarde (carte Pause, tranche T8), sinon celui d'une sauvegarde neuve.
		const UStridesSaveSubsystem* Save = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>() : nullptr;
		Course->JumpAid = UTF8_TO_TCHAR(strides::jumpAidOf(Save ? Save->GetSettings() : Fresh.settings).c_str());
		if (const strides::CsoActivity* A = Data ? Data->CsoActivity() : nullptr)
		{
			AStridesActivityPost* Pole = W->SpawnActor<AStridesActivityPost>();
			Pole->Setup(*A, Course);
			Pole->PlayerName = UTF8_TO_TCHAR(Fresh.playerName.c_str());
		}
		else UE_LOG(LogTemp, Warning, TEXT("Strides : activité du Pôle absente (cso_activity.json) : pas de poteau actif"));
		// Jalon J2c : poteau « Chrono » de l'entraînement à l'abord (activité cso_warmup, Activities._markers : a.start + 3 m).
		if (Data && Data->PoleWarmup.Z > 0)
		{
			AStridesActivityPost* Warm = W->SpawnActor<AStridesActivityPost>();
			Warm->Setup(strides::csoWarmupActivity(strides::CsoPaddock{Data->PoleWarmup.X, Data->PoleWarmup.Y, Data->PoleWarmup.Z, Data->PoleWarmup.W}), Course);
			Warm->PlayerName = UTF8_TO_TCHAR(Fresh.playerName.c_str());
		}
	}
	const FVector Spawn = Data ? Data->WorldSpawn : FVector(-104.f, 168.f, .35f);
	Horse->PlaceAt(Spawn.X, Spawn.Y, Spawn.Z);
	Super::StartPlay();
	// Cavalier à pied, 2 m à gauche du cheval (côté montoir).
	if (APlayerController* PC = UGameplayStatics::GetPlayerController(W, 0))
		if (APawn* Pawn = PC->GetPawn())
			Pawn->SetActorLocationAndRotation(Horse->GetActorLocation() - Horse->GetActorRightVector() * 200.0 + FVector(0, 0, 90), Horse->GetActorRotation());
	if (AStridesShots::Requested()) W->SpawnActor<AStridesShots>();
	// Jalon J3 : reprise de la partie sauvegardée (position, cheval, crédits, réputation, missions terminées, mission à
	// reprendre), comme « Continuer » au web ; jamais pendant les tests ni en mode de capture.
	else if (UStridesSaveSubsystem* Save = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>() : nullptr)
		Save->ResumeAtStart(UGameplayStatics::GetPlayerController(W, 0));
}
