#include "StridesShots.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "GameFramework/HUD.h"
#include "GameFramework/PlayerController.h"
#include "HAL/PlatformMisc.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/Paths.h"
#include "EngineUtils.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesRider.h"
#include "StridesUnits.h"
#include "UnrealClient.h"

bool AStridesShots::Requested() { return FParse::Param(FCommandLine::Get(), TEXT("StridesShots")); }

AStridesShots::AStridesShots()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PostUpdateWork;
	// Points de vue (x, hauteur au-dessus du sol, z) -> cible (x, hauteur au-dessus du sol, z), repère web en mètres.
	auto S = [this](const TCHAR* Name, double Ex, double Ey, double Ez, double Tx, double Ty, double Tz) { Shots.Add({Name, FVector(Ex, Ey, Ez), FVector(Tx, Ty, Tz)}); };
	S(TEXT("01_ecurie_cour"), -92, 1.8, 186, -122, 3, 152);
	S(TEXT("02_ecurie_vue"), -40, 22, 245, -115, 0, 170);
	S(TEXT("03_pole_carriere"), 278, 9, -178, 335, 0, -228);
	S(TEXT("04_ville_rue"), -30, 1.8, -170, -30, 4, -260);
	S(TEXT("05_plage"), 20, 6, -352, 70, 0, -460);
	S(TEXT("06_campagne"), 100, 30, 455, -40, 0, 150);
	S(TEXT("07_bocage"), -180, 2, 40, -260, 6, -10);
	S(TEXT("08_falaises"), -420, 18, -330, -520, 10, -420);
}

void AStridesShots::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0);
	if (!PC) return;
	Wait -= DeltaSeconds;
	if (Wait > 0) return;
	if (Index >= 0 && Index <= Shots.Num() && RideShot < 0 && !bCaptured)
	{
		const FString Name = Index < Shots.Num() ? Shots[Index].Name : FString(TEXT("09_jeu"));
		FScreenshotRequest::RequestScreenshot(FPaths::ProjectSavedDir() / TEXT("Screenshots/Strides") / (Name + TEXT(".png")), false, false);
		UE_LOG(LogTemp, Display, TEXT("Strides shot: %s"), *Name);
		bCaptured = true;
		Wait = 1.0f;
		return;
	}
	Index++;
	bCaptured = false;
	// Premier point de vue : laisser le temps aux shaders et aux tuiles de se préparer.
	Wait = Index == 0 ? 25.f : 4.f;
	if (Index < Shots.Num())
	{
		const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
		auto At = [Data](const FVector& P) { return StridesUnits::WebToUE(P.X, (Data ? Data->TerrainHeight(P.X, P.Z) : 0.0) + P.Y, P.Z); };
		const FShot& Shot = Shots[Index];
		const FVector Eye = At(Shot.Eye);
		if (!Camera)
		{
			Camera = GetWorld()->SpawnActor<ACameraActor>();
			Camera->GetCameraComponent()->SetFieldOfView(70.f);
			Camera->GetCameraComponent()->bConstrainAspectRatio = false;
		}
		Camera->SetActorLocationAndRotation(Eye, (At(Shot.Target) - Eye).Rotation());
		PC->SetViewTarget(Camera);
		if (PC->GetHUD()) PC->GetHUD()->bShowHUD = false;
	}
	else if (Index == Shots.Num())
	{
		PC->SetViewTarget(PC->GetPawn());
		if (PC->GetHUD()) PC->GetHUD()->bShowHUD = true;
	}
	else if (RideShot < 0)
	{
		// Parcours de démonstration : cheval à l'entrée du tracé, cavalière en selle, conduite automatique.
		AStridesHorse* Horse = TActorIterator<AStridesHorse>(GetWorld()) ? *TActorIterator<AStridesHorse>(GetWorld()) : nullptr;
		AStridesRider* Rider = Cast<AStridesRider>(PC->GetPawn());
		if (!Horse || !Rider || !Horse->Course) { FPlatformMisc::RequestExit(false); return; }
		const strides::CourseTrace& T = Horse->Course->CourseTraceData();
		const strides::TracePoint& P0 = T.leadIn.empty() ? T.pts.front() : T.leadIn.front();
		Horse->PlaceAt(P0.x, P0.z, P0.h);
		Rider->SetActorLocation(Horse->GetActorLocation() - Horse->GetActorRightVector() * 150.0 + FVector(0, 0, 90));
		const bool bMounted = Rider->TryMount(PC);
		Horse->ToggleDemoCourse();
		UE_LOG(LogTemp, Display, TEXT("Strides ride: monté=%d, départ (%.1f, %.1f), sol %.2f m"), bMounted, P0.x, P0.z, Horse->GroundAt(P0.x, P0.z));
		RideShot = 0;
		Wait = 3.f;
		Index--;  // reste sur cette étape
	}
	else
	{
		AStridesHorse* Horse = TActorIterator<AStridesHorse>(GetWorld()) ? *TActorIterator<AStridesHorse>(GetWorld()) : nullptr;
		const FString Name = FString::Printf(TEXT("10_galop_%02d"), RideShot++);
		FScreenshotRequest::RequestScreenshot(FPaths::ProjectSavedDir() / TEXT("Screenshots/Strides") / (Name + TEXT(".png")), false, false);
		if (Horse && Horse->Course) UE_LOG(LogTemp, Display, TEXT("Strides shot: %s — %s"), *Name, *Horse->Course->StatusText());
		Index--;
		Wait = 4.f;
		if (RideShot > 20 || (Horse && !Horse->IsDemoCourseActive() && RideShot > 2)) Index = Shots.Num() + 100;
	}
	if (Index > Shots.Num() + 50) FPlatformMisc::RequestExit(false);
}
