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
#include "Components/LightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/DirectionalLight.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Engine/SkyLight.h"
#include "HAL/FileManager.h"
#include "HighResScreenshot.h"
#include "Misc/FileHelper.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

bool AStridesShots::Requested() { return FParse::Param(FCommandLine::Get(), TEXT("StridesShots")) || !Mode().IsEmpty(); }

FString AStridesShots::Mode()
{
	FString M;
	FParse::Value(FCommandLine::Get(), TEXT("StridesShots="), M);
	return M.ToLower();
}

double AStridesShots::HorizontalFov(double FovV, double Width, double Height)
{
	return FMath::RadiansToDegrees(2.0 * FMath::Atan(FMath::Tan(FMath::DegreesToRadians(FovV) * 0.5) * Width / Height));
}

FString AStridesShots::RepoRoot()
{
	FString Root = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../.."));
	FPaths::CollapseRelativeDirectories(Root);
	return Root;
}

FString AStridesShots::DefaultShotsDir() { return FPaths::ConvertRelativePathToFull(FPaths::ProjectSavedDir() / TEXT("Screenshots/Strides")); }

TArray<FString> AStridesShots::ProtectedShotsDirs()
{
	const FString S = FPaths::ConvertRelativePathToFull(FPaths::ProjectSavedDir() / TEXT("Screenshots"));
	return {S / TEXT("Strides"), S / TEXT("MacEditor")};
}

bool AStridesShots::DirHasFiles(const FString& Dir)
{
	bool bAny = false;
	IFileManager::Get().IterateDirectory(*Dir, [&bAny](const TCHAR*, bool) { bAny = true; return false; });
	return bAny;
}

bool AStridesShots::ResolveShotsDir(const TCHAR* CommandLine, const FString& Root, const FString& DefaultDir, const TArray<FString>& Protected, FString& Out, FString& Why)
{
	auto Norm = [](FString P) {
		P = FPaths::ConvertRelativePathToFull(P);
		FPaths::RemoveDuplicateSlashes(P);
		FPaths::CollapseRelativeDirectories(P);
		FPaths::NormalizeDirectoryName(P);
		return P;
	};
	Out.Reset();
	Why.Reset();
	FString Dir;
	if (FParse::Value(CommandLine, TEXT("StridesShotsDir="), Dir, false) && !Dir.IsEmpty())
	{
		if (FPaths::IsRelative(Dir)) Dir = Root / Dir;
	}
	else Dir = DefaultDir;
	if (Dir.IsEmpty()) return true;
	Dir = Norm(Dir);
	for (const FString& P : Protected)
	{
		const FString Q = Norm(P);
		if (FPaths::IsSamePath(Dir, Q) && DirHasFiles(Q))
		{
			Why = FString::Printf(TEXT("%s contient déjà des captures, jamais écrasées : passer -StridesShotsDir=<dossier dédié>"), *Q);
			return false;
		}
	}
	Out = Dir;
	return true;
}

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
	if (!bOutResolved)
	{
		// Dossier de sortie résolu une fois, avant toute capture ; refus = sortie sans rien écrire.
		bOutResolved = true;
		FString Why;
		if (!ResolveShotsDir(FCommandLine::Get(), RepoRoot(), Mode() == TEXT("cso") ? FString() : DefaultShotsDir(), ProtectedShotsDirs(), OutDir, Why))
		{
			bRefused = true;
			UE_LOG(LogTemp, Error, TEXT("Strides shots: REFUS, aucune capture écrite : %s"), *Why);
			FPlatformMisc::RequestExit(false);
			return;
		}
		if (!OutDir.IsEmpty()) IFileManager::Get().MakeDirectory(*OutDir, true);
		UE_LOG(LogTemp, Display, TEXT("Strides shots: captures dans %s"), OutDir.IsEmpty() ? TEXT("les chemins de poses.json") : *OutDir);
	}
	if (bRefused) return;
	APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0);
	if (!PC) return;
	if (Mode() == TEXT("cso"))
	{
		TickCso(DeltaSeconds, PC);
		return;
	}
	Wait -= DeltaSeconds;
	if (Wait > 0) return;
	if (Index >= 0 && Index <= Shots.Num() && RideShot < 0 && !bCaptured)
	{
		const FString Name = Index < Shots.Num() ? Shots[Index].Name : FString(TEXT("09_jeu"));
		FScreenshotRequest::RequestScreenshot(OutDir / (Name + TEXT(".png")), false, false);
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
		FScreenshotRequest::RequestScreenshot(OutDir / (Name + TEXT(".png")), false, false);
		if (Horse && Horse->Course) UE_LOG(LogTemp, Display, TEXT("Strides shot: %s — %s"), *Name, *Horse->Course->StatusText());
		Index--;
		Wait = 4.f;
		if (RideShot > 20 || (Horse && !Horse->IsDemoCourseActive() && RideShot > 2)) Index = Shots.Num() + 100;
	}
	if (Index > Shots.Num() + 50) FPlatformMisc::RequestExit(false);
}

// ---------- Banc de parité CSO : poses jumelles (-StridesShots=cso) ----------

void AStridesShots::LoadPoses()
{
	const FString Root = RepoRoot();
	FString File = Root / TEXT("unreal/docs/parite/cso/poses.json");
	FParse::Value(FCommandLine::Get(), TEXT("StridesPoses="), File);
	FString Text;
	TSharedPtr<FJsonObject> J;
	if (!FFileHelper::LoadFileToString(Text, *File) || !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), J) || !J.IsValid())
	{
		UE_LOG(LogTemp, Error, TEXT("Strides parite: poses illisibles (%s)"), *File);
		return;
	}
	auto Vec = [](const TSharedPtr<FJsonObject>& O, const TCHAR* K) {
		const TArray<TSharedPtr<FJsonValue>>& A = O->GetArrayField(K);
		return A.Num() == 3 ? FVector(A[0]->AsNumber(), A[1]->AsNumber(), A[2]->AsNumber()) : FVector::ZeroVector;
	};
	for (const TSharedPtr<FJsonValue>& V : J->GetArrayField(TEXT("poses")))
	{
		const TSharedPtr<FJsonObject> O = V->AsObject();
		FPose P;
		P.Name = O->GetStringField(TEXT("name"));
		const TSharedPtr<FJsonObject> H = O->GetObjectField(TEXT("horse"));
		P.HorseX = H->GetNumberField(TEXT("x"));
		P.HorseZ = H->GetNumberField(TEXT("z"));
		P.HorseH = H->GetNumberField(TEXT("h"));
		P.Eye = Vec(O, TEXT("eye"));
		P.Target = Vec(O, TEXT("target"));
		P.SunDir = Vec(O, TEXT("sunDir"));
		P.FovV = O->GetNumberField(TEXT("fovV"));
		const TSharedPtr<FJsonObject> VP = O->GetObjectField(TEXT("viewport"));
		P.Width = (int32)VP->GetNumberField(TEXT("w"));
		P.Height = (int32)VP->GetNumberField(TEXT("h"));
		// Capture Unreal : chemin de poses.json, ou même nom de fichier dans le dossier de -StridesShotsDir.
		const FString Unreal = O->GetStringField(TEXT("unreal"));
		P.Out = OutDir.IsEmpty() ? Root / Unreal : OutDir / FPaths::GetCleanFilename(Unreal);
		P.bHasJumpY = H->TryGetNumberField(TEXT("jumpY"), P.HorseJumpY);
		const TSharedPtr<FJsonObject>* Fe = nullptr;
		if (O->TryGetObjectField(TEXT("fence"), Fe))
		{
			P.bHasFence = true;
			P.FenceLabel = (*Fe)->GetStringField(TEXT("label"));
			P.FenceBar = (int32)(*Fe)->GetNumberField(TEXT("bar"));
			P.FenceDir = (*Fe)->GetNumberField(TEXT("dir"));
			P.FenceSide = (*Fe)->GetNumberField(TEXT("side"));
			P.FenceHit = (*Fe)->GetNumberField(TEXT("hit"));
			P.FenceFrames = (int32)(*Fe)->GetNumberField(TEXT("frames"));
		}
		// -StridesPose=<préfixe> : seulement les poses dont le nom commence ainsi.
		FString Only;
		if (FParse::Value(FCommandLine::Get(), TEXT("StridesPose="), Only) && !P.Name.StartsWith(Only)) continue;
		Poses.Add(P);
	}
	UE_LOG(LogTemp, Display, TEXT("Strides parite: %d pose(s) lue(s) dans %s"), Poses.Num(), *File);
}

void AStridesShots::ApplyPose(const FPose& P, APlayerController* PC)
{
	AStridesHorse* Horse = TActorIterator<AStridesHorse>(GetWorld()) ? *TActorIterator<AStridesHorse>(GetWorld()) : nullptr;
	if (Horse)
	{
		Horse->PlaceAt(P.HorseX, P.HorseZ, P.HorseH);
		if (P.bHasFence && Horse->Course)
		{
			// Chute de barre : cheval figé à la pose (en l'air), barre renversée et tombée par le cœur, comme en jeu.
			Horse->SetActorTickEnabled(false);
			if (P.bHasJumpY) Horse->SetActorLocation(StridesUnits::WebToUE(P.HorseX, Horse->GroundAt(P.HorseX, P.HorseZ) + P.HorseJumpY, P.HorseZ));
			AStridesCourse* C = Horse->Course;
			const std::vector<strides::CsoObstacle>& Obs = C->Obstacles();
			for (int32 I = 0; I < (int32)Obs.size(); I++)
			{
				if (UTF8_TO_TCHAR(Obs[I].label.c_str()) != P.FenceLabel) continue;
				strides::csoRestFence(C->FenceStates()[I]);
				strides::CsoFenceOut Out;
				strides::csoKnock(Obs, C->FenceStates(), I, P.FenceBar, P.FenceDir, P.FenceSide, P.FenceHit, 0, Out);
				for (int32 K = 0; K < P.FenceFrames; K++) C->UpdateFences(1.0 / 30, 0, P.HorseX, P.HorseZ);
				const strides::CsoRail& R = C->FenceStates()[I].rails[P.FenceBar];
				UE_LOG(LogTemp, Display, TEXT("Strides parite: barre %s/%d après %d images : y %.6f z %.6f rx %.6f rz %.6f t %.4f"), *P.FenceLabel, P.FenceBar, P.FenceFrames, R.y, R.z, R.rx, R.rz, R.fall.t);
			}
		}
		if (!bPoseMounted)
		{
			if (AStridesRider* Rider = Cast<AStridesRider>(PC->GetPawn()))
			{
				Rider->SetActorLocation(Horse->GetActorLocation() - Horse->GetActorRightVector() * 150.0 + FVector(0, 0, 90));
				bPoseMounted = Rider->TryMount(PC);
			}
		}
	}
	if (!Camera)
	{
		Camera = GetWorld()->SpawnActor<ACameraActor>();
		UCameraComponent* C = Camera->GetCameraComponent();
		C->bConstrainAspectRatio = false;
		// Le joueur local d'UE 5.8 maintient l'axe Y par défaut (BaseEngine.ini, [/Script/Engine.LocalPlayer]
		// AspectRatioAxisConstraint=AspectRatio_MaintainYFOV) : la première capture, sans ce réglage, montrait un champ
		// nettement plus large que le web. Axe X imposé : FieldOfView est alors bien le FOV horizontal calculé ici.
		C->bOverrideAspectRatioAxisConstraint = true;
		C->SetAspectRatioAxisConstraint(EAspectRatioAxisConstraint::AspectRatio_MaintainXFOV);
	}
	// Altitudes absolues du web (le relief Unreal est exporté du web) ; FOV vertical web → FOV horizontal Unreal.
	const FVector Eye = StridesUnits::WebToUE(P.Eye.X, P.Eye.Y, P.Eye.Z);
	const FVector Target = StridesUnits::WebToUE(P.Target.X, P.Target.Y, P.Target.Z);
	const double FovH = HorizontalFov(P.FovV, P.Width, P.Height);
	Camera->SetActorLocationAndRotation(Eye, (Target - Eye).Rotation());
	Camera->GetCameraComponent()->SetFieldOfView((float)FovH);
	PC->SetViewTarget(Camera);
	if (PC->GetHUD()) PC->GetHUD()->bShowHUD = false;
	// Soleil : la lumière va du soleil vers la scène (sens opposé à sunDir, direction web → axes Unreal).
	const FVector LightDir = -FVector(P.SunDir.X, P.SunDir.Z, P.SunDir.Y).GetSafeNormal();
	for (TActorIterator<ADirectionalLight> It(GetWorld()); It; ++It) It->SetActorRotation(LightDir.Rotation());
	for (TActorIterator<ASkyLight> It(GetWorld()); It; ++It) It->GetLightComponent()->RecaptureSky();
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	auto G = [Data](double X, double Z) { return Data ? Data->TerrainHeight(X, Z) : 0.0; };
	UE_LOG(LogTemp, Display, TEXT("Strides parite: pose %s, cheval (%.3f ; %.3f) cap %.4f monté=%d, FOV %.4f° vertical -> %.4f° horizontal (%dx%d), soleil %s -> rotation %s, sol Unreal oeil %.3f cible %.3f cheval %.3f"),
		*P.Name, P.HorseX, P.HorseZ, P.HorseH, bPoseMounted, P.FovV, FovH, P.Width, P.Height, *P.SunDir.ToString(), *LightDir.Rotation().ToString(),
		G(P.Eye.X, P.Eye.Z), G(P.Target.X, P.Target.Z), G(P.HorseX, P.HorseZ));
}

void AStridesShots::TickCso(float DeltaSeconds, APlayerController* PC)
{
	if (PoseIndex < 0)
	{
		LoadPoses();
		if (Poses.Num() == 0) { FPlatformMisc::RequestExit(false); return; }
		PoseIndex = 0;
		PoseStep = 0;
		Wait = 25.f;  // shaders et tuiles du décor
		return;
	}
	Wait -= DeltaSeconds;
	if (Wait > 0) return;
	if (PoseIndex >= Poses.Num()) { FPlatformMisc::RequestExit(false); return; }
	const FPose& P = Poses[PoseIndex];
	if (PoseStep == 0)
	{
		ApplyPose(P, PC);
		PoseStep = 1;
		Wait = 6.f;  // éclairage recapturé, tuiles autour de la caméra
	}
	else if (PoseStep == 1)
	{
		ApplyPose(P, PC);  // vue de la caméra de pose (la montée en selle peut l'avoir rendue au cheval)
		IFileManager::Get().Delete(*P.Out, false, true, true);
		FHighResScreenshotConfig& HR = GetHighResScreenshotConfig();
		HR.SetResolution(P.Width, P.Height);
		HR.SetFilename(P.Out);
		HR.SetMaskEnabled(false);
		HR.SetHDRCapture(false);
		HR.bDateTimeBasedNaming = false;
		const bool bOk = GEngine && GEngine->GameViewport && GEngine->GameViewport->Viewport && GEngine->GameViewport->Viewport->TakeHighResScreenShot();
		UE_LOG(LogTemp, Display, TEXT("Strides parite: capture %s demandée (%dx%d) : %d"), *P.Out, P.Width, P.Height, bOk);
		PoseStep = 2;
		Wait = 4.f;
	}
	else
	{
		UE_LOG(LogTemp, Display, TEXT("Strides parite: %s %s"), *P.Out, IFileManager::Get().FileExists(*P.Out) ? TEXT("écrite") : TEXT("ABSENTE"));
		PoseIndex++;
		PoseStep = 0;
		Wait = 0.5f;
	}
}
