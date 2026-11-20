#include "StridesShots.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Camera/CameraTypes.h"
#include "Camera/PlayerCameraManager.h"
#include "Engine/LocalPlayer.h"
#include "SceneView.h"
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
#include "StridesCsoHud.h"
#include "StridesCsoHudReplay.h"
#include "StridesPlayerController.h"
#include "StridesCore/MiniJson.h"
#include "Policies/CondensedJsonPrintPolicy.h"
#include "Serialization/JsonWriter.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesHUD.h"
#include "StridesRider.h"
#include "StridesTouchControls.h"
#include "StridesPauseMenu.h"
#include "StridesUnits.h"
#include "UnrealClient.h"
#include "UnrealEngine.h"
#include "Components/LightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/DirectionalLight.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Framework/Application/SlateApplication.h"
#include "GenericPlatform/GenericPlatformInputDeviceMapper.h"
#include "Widgets/SViewport.h"
#include "Widgets/SWindow.h"
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
		// Sans tenir compte de la casse : le volume APFS du Mac ne la distingue pas (…/Screenshots/strides désigne le vrai
		// dossier Strides), alors que FPaths::IsSamePath la distingue sur Mac. Sur un volume sensible à la casse, le refus
		// est seulement plus prudent.
		if (Dir.Equals(Q, ESearchCase::IgnoreCase) && DirHasFiles(Q))
		{
			Why = FString::Printf(TEXT("%s contient déjà des captures, jamais écrasées : passer -StridesShotsDir=<dossier dédié>"), *Q);
			return false;
		}
	}
	Out = Dir;
	return true;
}

TArray<double> AStridesShots::FramingYs(const FMinimalViewInfo& InView, int32 Width, int32 Height, double X, double Z, double Heading, double Y0, const TArray<FVector2D>& Pts)
{
	// Projection du moteur (celle du rendu : ULocalPlayer::GetProjectionData) pour un viewport Width × Height.
	FMinimalViewInfo View = InView;
	const FIntRect Rect(0, 0, Width, Height);
	FSceneViewProjectionData Proj;
	Proj.ViewOrigin = View.Location;
	Proj.ViewRotationMatrix = FInverseRotationMatrix(View.Rotation) * FMatrix(FPlane(0, 0, 1, 0), FPlane(1, 0, 0, 0), FPlane(0, 1, 0, 0), FPlane(0, 0, 0, 1));
	Proj.SetViewRectangle(Rect);
	const EAspectRatioAxisConstraint Axis = View.AspectRatioAxisConstraint.Get(GetDefault<ULocalPlayer>()->AspectRatioAxisConstraint);
	FMinimalViewInfo::CalculateProjectionMatrixGivenViewRectangle(View, Axis, Rect, Proj);
	const FMatrix VP = Proj.ComputeViewProjectionMatrix();
	TArray<double> Ys;
	for (const FVector2D& P : Pts)
	{
		FVector2D S;
		FSceneView::ProjectWorldToScreen(StridesUnits::WebToUE(X + FMath::Sin(Heading) * P.X, Y0 + P.Y, Z + FMath::Cos(Heading) * P.X), Rect, VP, S, true);
		Ys.Add(S.Y / Height);
	}
	return Ys;
}

bool AStridesShots::ReplayCourseCamera(AStridesHorse* Horse, const TSharedPtr<FJsonObject>& Run, int32 LastFrame,
	TFunctionRef<void(int32, const strides::CsoCamOut&, const TSharedPtr<FJsonObject>&)> OnCall, FString& Why)
{
	const TSharedPtr<FJsonObject>* Setup = nullptr;
	const TSharedPtr<FJsonObject>* C0 = nullptr;
	if (!Horse || !Run.IsValid() || !Run->TryGetObjectField(TEXT("setup"), Setup) || !(*Setup)->TryGetObjectField(TEXT("cc0"), C0))
	{
		Why = TEXT("exécution sans canal caméra (setup.cc0)");
		return false;
	}
	// Obstacles relevés par le banc (cc0.obs) → rang dans les obstacles du parcours du jeu (même centre à 1e-6 m près).
	static const std::vector<strides::CsoObstacle> NoObstacles;
	const std::vector<strides::CsoObstacle>& Obs = Horse->Course ? Horse->Course->Obstacles() : NoObstacles;
	TArray<int32> Map;
	for (const TSharedPtr<FJsonValue>& V : (*C0)->GetArrayField(TEXT("obs")))
	{
		const TArray<TSharedPtr<FJsonValue>>& A = V->AsArray();
		int32 Found = -1;
		for (int32 I = 0; I < (int32)Obs.size(); I++)
			if (FMath::Abs(Obs[I].x - A[0]->AsNumber()) < 1e-6 && FMath::Abs(Obs[I].z - A[1]->AsNumber()) < 1e-6) Found = I;
		Map.Add(Found);
	}
	auto Vec = [](const TArray<TSharedPtr<FJsonValue>>& A) { return strides::CsoVec3{A[0]->AsNumber(), A[1]->AsNumber(), A[2]->AsNumber()}; };
	Horse->LeaveCourseCamera();
	Horse->SetCameraBefore(Vec((*C0)->GetArrayField(TEXT("eye"))), (*C0)->GetNumberField(TEXT("fov")), (*C0)->GetNumberField(TEXT("camFov")));
	bool bFirst = true;
	auto Call = [&](int32 F, const TSharedPtr<FJsonObject>& C) -> bool
	{
		const TArray<TSharedPtr<FJsonValue>>& Hz = C->GetArrayField(TEXT("hz"));
		strides::CsoCamHorse V;
		V.x = Hz[0]->AsNumber();
		V.z = Hz[1]->AsNumber();
		V.heading = Hz[2]->AsNumber();
		V.yawRate = Hz[3]->IsNull() ? 0.0 : Hz[3]->AsNumber();
		V.jumpT = Hz[4]->AsNumber();
		V.jumpY = Hz[5]->AsNumber();
		V.groundY = Horse->GroundAt(V.x, V.z);  // sol du jeu (relief exporté), pas celui relevé dans le web
		const TArray<TSharedPtr<FJsonValue>>* E0 = nullptr;
		if (C->TryGetArrayField(TEXT("e0"), E0))
		{
			const TArray<TSharedPtr<FJsonValue>>& F0 = C->GetArrayField(TEXT("f0"));
			Horse->SetCameraBefore(Vec(*E0), F0[0]->AsNumber(), F0[1]->AsNumber());
		}
		else if (bFirst)
		{
			// Branche concours déjà active au début de l'exécution : son état interne (cc0.st) n'est pas rejoué par le jeu.
			Why = FString::Printf(TEXT("image %d : caméra de concours déjà active au départ (état cc0.st non rejouable par le jeu)"), F);
			return false;
		}
		bFirst = false;
		double Dt = 1.0 / 30;
		C->TryGetNumberField(TEXT("dt"), Dt);
		bool bInstant = false;
		C->TryGetBoolField(TEXT("i"), bInstant);
		int32 Next = -1;
		double Nx = -1;
		if (C->TryGetNumberField(TEXT("nx"), Nx) && Map.IsValidIndex((int32)Nx)) Next = Map[(int32)Nx];
		OnCall(F, Horse->StepCourseCamera(Dt, V, Next, bInstant), C);
		return true;
	};
	for (const TSharedPtr<FJsonValue>& FV : Run->GetArrayField(TEXT("frames")))
	{
		const TSharedPtr<FJsonObject> Fr = FV->AsObject();
		const int32 F = (int32)Fr->GetNumberField(TEXT("f"));
		if (LastFrame >= 0 && F > LastFrame) break;
		const TArray<TSharedPtr<FJsonValue>>* Pre = nullptr;
		if (Fr->TryGetArrayField(TEXT("ccp"), Pre))
			for (const TSharedPtr<FJsonValue>& C : *Pre)
				if (!Call(F, C->AsObject())) return false;
		const TSharedPtr<FJsonObject>* Cc = nullptr;
		if (Fr->TryGetObjectField(TEXT("cc"), Cc))
		{
			if (!Call(F, *Cc)) return false;
		}
		else Horse->LeaveCourseCamera();  // branche concours non prise à cette image (this._comp = null)
	}
	return true;
}

AStridesShots::AStridesShots()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PostUpdateWork;
	// Les poses de la carte Pause suspendent le jeu (SetGamePaused) : les captures continuent.
	PrimaryActorTick.bTickEvenWhenPaused = true;
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
		const FString Default = Mode() == TEXT("cso") ? FString() : Mode() == TEXT("cso-jeu") ? RepoRoot() / TEXT("unreal/docs/parite/cso") : DefaultShotsDir();
		if (!ResolveShotsDir(FCommandLine::Get(), RepoRoot(), Default, ProtectedShotsDirs(), OutDir, Why))
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
	if (Mode() == TEXT("cso-jeu"))
	{
		TickJeu(DeltaSeconds, PC);
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

// ---------- Partie réelle avec l'interface (-StridesShots=cso-jeu, contrôle adverse de T7) ----------
// Jeu tel qu'il tourne (HUD de débogage, interface d'épreuve UMG, commandes tactiles si -TouchControls) : cavalier à pied
// au départ du jeu (hors épreuve), puis cheval posé à l'entrée du tracé, cavalière en selle, démonstration automatique de
// l'épreuve ; captures de la fenêtre avec l'interface (FScreenshotRequest, bShowUI) aux instants choisis par l'état de
// l'épreuve ; à l'image suivant chaque capture (celle-ci rendue), relevé de ce qui a été affiché : boutons tactiles
// visibles (UStridesTouchControls::VisibleButtons, après NativeTick), HUD de débogage dessiné ou non à l'image
// (AStridesHUD::DrewDebugLastFrame, retour anticipé de DrawHUD), éléments de l'interface d'épreuve (Describe), classes
// du HUD et état de l'épreuve ; écrit dans <dossier>/jeu-unreal.json.

void AStridesShots::JeuCapture(const FString& Name, const FString& What, APlayerController* PC)
{
	JeuPendingName = Name;
	JeuPendingWhat = What;
	JeuPendingFile = OutDir / (Name + TEXT(".png"));
	IFileManager::Get().Delete(*JeuPendingFile, false, true, true);
	FScreenshotRequest::RequestScreenshot(JeuPendingFile, true, false);
	UE_LOG(LogTemp, Display, TEXT("Strides jeu: capture %s demandée (%s)"), *JeuPendingFile, *What);
}

void AStridesShots::JeuRecord(APlayerController* PC)
{
	const TSharedPtr<FJsonObject> R = MakeShared<FJsonObject>();
	R->SetStringField(TEXT("name"), JeuPendingName);
	R->SetStringField(TEXT("moment"), JeuPendingWhat);
	R->SetStringField(TEXT("file"), FPaths::GetCleanFilename(JeuPendingFile));
	const FIntPoint Size = GEngine && GEngine->GameViewport && GEngine->GameViewport->Viewport ? GEngine->GameViewport->Viewport->GetSizeXY() : FIntPoint::ZeroValue;
	R->SetStringField(TEXT("window"), FString::Printf(TEXT("%dx%d"), Size.X, Size.Y));
	const AStridesHUD* DebugHud = Cast<AStridesHUD>(PC->GetHUD());
	R->SetBoolField(TEXT("debugHudShown"), DebugHud && DebugHud->bShowHUD);
	R->SetBoolField(TEXT("debugDrawn"), DebugHud && DebugHud->DrewDebugLastFrame());
	AStridesPlayerController* SPC = Cast<AStridesPlayerController>(PC);
	TArray<TSharedPtr<FJsonValue>> B, D;
	if (const UStridesTouchControls* T = SPC ? SPC->TouchWidget() : nullptr)
		for (const FString& N : T->VisibleButtons()) B.Add(MakeShared<FJsonValueString>(N));
	R->SetBoolField(TEXT("touchControls"), SPC && SPC->TouchWidget());
	R->SetArrayField(TEXT("visibleButtons"), B);
	if (const UStridesCsoHud* W = SPC ? SPC->CsoHudWidget() : nullptr)
		for (const FString& L : W->Describe()) D.Add(MakeShared<FJsonValueString>(L));
	R->SetArrayField(TEXT("raceHud"), D);
	const AStridesHorse* Horse = TActorIterator<AStridesHorse>(GetWorld()) ? *TActorIterator<AStridesHorse>(GetWorld()) : nullptr;
	if (const AStridesCourse* C = Horse ? Horse->Course : nullptr)
	{
		const strides::CsoHud& H = C->HudModel();
		R->SetStringField(TEXT("classes"), FString::Printf(TEXT("%s%s%s%s"), H.csoCtl() ? TEXT("cso-ctl ") : TEXT(""), H.csoSober() ? TEXT("cso-sober ") : TEXT(""), H.csoOn() ? TEXT("cso-on ") : TEXT(""), H.bigOn() ? TEXT("big-on") : TEXT("")).TrimEnd());
		R->SetBoolField(TEXT("minimapMasked"), H.masked(strides::CsoHudElement::Minimap));
		R->SetStringField(TEXT("status"), C->StatusText());
	}
	const bool bWritten = IFileManager::Get().FileExists(*JeuPendingFile);
	R->SetBoolField(TEXT("written"), bWritten);
	JeuResults.Add(MakeShared<FJsonValueObject>(R));
	UE_LOG(LogTemp, Display, TEXT("Strides jeu: %s %s ; débogage dessiné %d ; boutons %s ; épreuve %s"), *JeuPendingName, bWritten ? TEXT("écrite") : TEXT("ABSENTE"),
		(int32)R->GetBoolField(TEXT("debugDrawn")), *FString::JoinBy(B, TEXT(","), [](const TSharedPtr<FJsonValue>& V) { return V->AsString(); }),
		*FString::JoinBy(D, TEXT(" ; "), [](const TSharedPtr<FJsonValue>& V) { return V->AsString(); }));
	JeuPendingName.Reset();
}

void AStridesShots::TickJeu(float DeltaSeconds, APlayerController* PC)
{
	JeuClock += DeltaSeconds;
	// Relevé de la capture demandée à l'image précédente (rendue depuis), après la sauvegarde du fichier.
	if (!JeuPendingName.IsEmpty())
	{
		if (!IFileManager::Get().FileExists(*JeuPendingFile) && JeuClock - JeuSince < 3.f) return;
		JeuRecord(PC);
	}
	JeuWait -= DeltaSeconds;
	if (JeuWait > 0) return;
	AStridesHorse* Horse = TActorIterator<AStridesHorse>(GetWorld()) ? *TActorIterator<AStridesHorse>(GetWorld()) : nullptr;
	const AStridesCourse* Course = Horse ? Horse->Course : nullptr;
	const strides::CsoRun* Run = Course ? Course->Run() : nullptr;
	if (!Horse || !Run) { UE_LOG(LogTemp, Error, TEXT("Strides jeu: pas d'épreuve")); JeuStep = 99; }
	const strides::CsoHud* H = Course ? &Course->HudModel() : nullptr;
	auto Shot = [&](const TCHAR* Name, const TCHAR* What) { JeuSince = JeuClock; JeuSeen = -1.f; JeuCapture(Name, What, PC); JeuStep++; JeuWait = 1.f; };
	switch (JeuStep)
	{
	case 0:  // départ du jeu : cavalier à pied à l'Écurie du Val, épreuve à l'étape « rejoindre l'entrée »
		Shot(TEXT("jeu-1-hors-epreuve"), TEXT("hors épreuve : cavalier à pied au départ du jeu (étape « rejoindre l'entrée de la carrière »)"));
		break;
	case 1:
	{
		AStridesRider* Rider = Cast<AStridesRider>(PC->GetPawn());
		const strides::CourseTrace& T = Course->CourseTraceData();
		const strides::TracePoint& P0 = T.leadIn.empty() ? T.pts.front() : T.leadIn.front();
		Horse->PlaceAt(P0.x, P0.z, P0.h);
		if (Rider) Rider->SetActorLocation(Horse->GetActorLocation() - Horse->GetActorRightVector() * 150.0 + FVector(0, 0, 90));
		const bool bMounted = Rider && Rider->TryMount(PC);
		Horse->ToggleDemoCourse();
		UE_LOG(LogTemp, Display, TEXT("Strides jeu: monté=%d, démonstration lancée"), bMounted);
		JeuStep++;
		JeuWait = 0.f;
		break;
	}
	case 2:  // cloche : grand message affiché depuis 0,7 s (animation d'apparition finie)
		if (H && H->csoCtl() && !H->bigHidden() && H->bigTitle() == "CLOCHE" && H->bigPopSeconds() >= .7)
			Shot(TEXT("jeu-2-cloche"), TEXT("épreuve : cloche (classes cso-ctl cso-sober cso-on)"));
		break;
	case 3:  // premier mot d'appel affiché depuis 0,5 s
		if (H && H->csoCtl() && !H->fbOff())
		{
			if (JeuSeen < 0) JeuSeen = JeuClock;
			if (JeuClock - JeuSeen >= .5f) Shot(TEXT("jeu-3-mot"), TEXT("épreuve : premier mot d'appel"));
		}
		else JeuSeen = -1.f;
		break;
	case 4:  // en course, obstacle suivant « ▸ 6A »
		if (H && H->csoCtl() && Run->state().started && H->boardText(3).rfind("▸ 6A", 0) == 0) Shot(TEXT("jeu-4-course"), TEXT("épreuve : en course, obstacle suivant 6A"));
		break;
	case 5:  // bilan : arrivée (ou élimination), 3 s après (sortie de piste de 2,6 s finie)
		if (Run->state().finished || Run->state().eliminated)
		{
			if (JeuSeen < 0) JeuSeen = JeuClock;
			if (JeuClock - JeuSeen >= 3.f) Shot(TEXT("jeu-5-bilan"), TEXT("après l'arrivée : bilan, mode concours quitté"));
		}
		else JeuSeen = -1.f;
		break;
	default:
	{
		if (!JeuPendingName.IsEmpty()) return;
		const TSharedPtr<FJsonObject> Doc = MakeShared<FJsonObject>();
		Doc->SetStringField(TEXT("schema"), TEXT("strides.parite.cso_jeu/1"));
		Doc->SetStringField(TEXT("generator"), TEXT("-StridesShots=cso-jeu -TouchControls (AStridesShots::TickJeu)"));
		Doc->SetStringField(TEXT("doc"), TEXT("partie réelle, interface comprise : par capture, moment, fenêtre, HUD de débogage dessiné à l'image (retour anticipé de DrawHUD en épreuve), boutons tactiles visibles après NativeTick, éléments de l'interface d'épreuve affichés, classes du HUD, minicarte masquée, tableau ou objectif"));
		Doc->SetArrayField(TEXT("captures"), JeuResults);
		FString Out;
		FJsonSerializer::Serialize(Doc.ToSharedRef(), TJsonWriterFactory<>::Create(&Out));
		const FString File = OutDir / TEXT("jeu-unreal.json");
		FFileHelper::SaveStringToFile(Out + TEXT("\n"), *File, FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
		UE_LOG(LogTemp, Display, TEXT("Strides jeu: relevé écrit dans %s (%d captures)"), *File, JeuResults.Num());
		FPlatformMisc::RequestExit(false);
		JeuStep = 100;
		return;
	}
	}
	if (JeuClock > 300.f && JeuStep < 99) { UE_LOG(LogTemp, Error, TEXT("Strides jeu: délai dépassé à l'étape %d"), JeuStep); JeuStep = 99; }
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
		const TSharedPtr<FJsonObject>* Co = nullptr;
		if (O->TryGetObjectField(TEXT("course"), Co))
		{
			P.bHasCourse = true;
			for (const TSharedPtr<FJsonValue>& Hv : (*Co)->GetArrayField(TEXT("heights"))) P.CourseHeights.Add(Hv->AsNumber());
			P.CourseHighlight = (int32)(*Co)->GetNumberField(TEXT("highlight"));
		}
		// Caméra de concours (tranche T6) : exécution de l'oracle rejouée par le jeu, mesure du cadrage du web.
		const TSharedPtr<FJsonObject>* Cr = nullptr;
		if (O->TryGetObjectField(TEXT("camRun"), Cr))
		{
			P.bHasCamRun = true;
			P.CamRunFile = (*Cr)->GetStringField(TEXT("file"));
			P.CamRunFrame = (int32)(*Cr)->GetNumberField(TEXT("frame"));
		}
		const TSharedPtr<FJsonObject>* Fm = nullptr;
		if (O->TryGetObjectField(TEXT("framing"), Fm))
		{
			for (const TSharedPtr<FJsonValue>& Pt : (*Fm)->GetArrayField(TEXT("pts")))
				P.FramingPts.Add(FVector2D(Pt->AsArray()[0]->AsNumber(), Pt->AsArray()[1]->AsNumber()));
			P.WebPart = (*Fm)->GetNumberField(TEXT("part"));
			P.WebTop = (*Fm)->GetNumberField(TEXT("top"));
			P.WebBottom = (*Fm)->GetNumberField(TEXT("bottom"));
			P.bFramingJump = (*Fm)->GetBoolField(TEXT("jump"));
		}
		// HUD d'épreuve (tranche T7) : exécution de l'oracle rejouée dans le HUD jusqu'à l'image de la pose.
		const TSharedPtr<FJsonObject>* Hu = nullptr;
		if (O->TryGetObjectField(TEXT("hud"), Hu))
		{
			P.bHasHud = true;
			P.HudRunFile = (*Hu)->GetStringField(TEXT("run"));
			P.HudFrame = (int32)(*Hu)->GetNumberField(TEXT("frame"));
			const TSharedPtr<FJsonObject>* Ex = nullptr;
			if ((*Hu)->TryGetObjectField(TEXT("extra"), Ex))
			{
				P.HudExtraFrame = (int32)(*Ex)->GetNumberField(TEXT("frame"));
				TSharedRef<TJsonWriter<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>> W = TJsonWriterFactory<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>::Create(&P.HudExtra);
				FJsonSerializer::Serialize((*Ex)->GetArrayField(TEXT("calls")), W);
			}
			const TSharedPtr<FJsonObject>* St = nullptr;
			if (O->TryGetObjectField(TEXT("state"), St))
			{
				TSharedRef<TJsonWriter<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>> W = TJsonWriterFactory<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>::Create(&P.HudState);
				FJsonSerializer::Serialize(St->ToSharedRef(), W);
			}
		}
		// Commandes d'épreuve (tranche T8) : page tactile, doigt sur le joystick, carte Pause.
		O->TryGetBoolField(TEXT("tactile"), P.bTactile);
		O->TryGetBoolField(TEXT("pause"), P.bPause);
		const TSharedPtr<FJsonObject>* To = nullptr;
		if (O->TryGetObjectField(TEXT("touch"), To))
		{
			P.bHasTouch = true;
			P.TouchId = (int32)(*To)->GetNumberField(TEXT("id"));
			const TArray<TSharedPtr<FJsonValue>>& A = (*To)->GetArrayField(TEXT("start"));
			const TArray<TSharedPtr<FJsonValue>>& B = (*To)->GetArrayField(TEXT("move"));
			P.TouchStart = FVector2D(A[0]->AsNumber(), A[1]->AsNumber());
			P.TouchMove = FVector2D(B[0]->AsNumber(), B[1]->AsNumber());
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
		if (P.bHasCourse && Horse->Course)
		{
			// État des obstacles du jeu web à la capture : hauteurs (Obstacles.setHeights) et numéro surligné.
			std::vector<double> H(P.CourseHeights.GetData(), P.CourseHeights.GetData() + P.CourseHeights.Num());
			if (Horse->Course->FenceHeights() != H) Horse->Course->ApplyHeights(H);
			Horse->Course->SetHighlight(P.CourseHighlight);
			UE_LOG(LogTemp, Display, TEXT("Strides parite: obstacles %d hauteurs posées, n° %d surligné"), P.CourseHeights.Num(), P.CourseHighlight);
		}
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
	const double FovH = HorizontalFov(P.FovV, P.Width, P.Height);
	if (P.bHasCamRun && Horse)
	{
		// Caméra de concours (tranche T6) : calculée par le jeu, capture par la caméra du cheval.
		ApplyCamRunPose(P, PC, Horse);
	}
	else
	{
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
		Camera->SetActorLocationAndRotation(Eye, (Target - Eye).Rotation());
		Camera->GetCameraComponent()->SetFieldOfView((float)FovH);
		PC->SetViewTarget(Camera);
	}
	if (PC->GetHUD()) PC->GetHUD()->bShowHUD = false;
	if (AStridesPlayerController* SPC = Cast<AStridesPlayerController>(PC))
		if (UStridesCsoHud* W = SPC->CsoHudWidget()) W->SetFrozen(P.bHasHud ? &PoseHud : nullptr);
	if (P.bHasHud) ApplyHudPose(P, PC);
	ApplyControlsPose(P, PC, Horse);
	// Soleil : la lumière va du soleil vers la scène (sens opposé à sunDir, direction web → axes Unreal).
	const FVector LightDir = -FVector(P.SunDir.X, P.SunDir.Z, P.SunDir.Y).GetSafeNormal();
	for (TActorIterator<ADirectionalLight> It(GetWorld()); It; ++It) It->SetActorRotation(LightDir.Rotation());
	for (TActorIterator<ASkyLight> It(GetWorld()); It; ++It) It->GetLightComponent()->RecaptureSky();
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	auto G = [Data](double X, double Z) { return Data ? Data->TerrainHeight(X, Z) : 0.0; };
	UE_LOG(LogTemp, Display, TEXT("Strides parite: pose %s, cheval (%.3f ; %.3f) cap %.4f monté=%d, FOV %.4f° vertical -> %s (%dx%d), soleil %s -> rotation %s, sol Unreal oeil %.3f cible %.3f cheval %.3f"),
		*P.Name, P.HorseX, P.HorseZ, P.HorseH, bPoseMounted, P.FovV,
		P.bHasCamRun ? TEXT("caméra du cheval (axe Y maintenu)") : *FString::Printf(TEXT("%.4f° horizontal"), FovH), P.Width, P.Height, *P.SunDir.ToString(), *LightDir.Rotation().ToString(),
		G(P.Eye.X, P.Eye.Z), G(P.Target.X, P.Target.Z), G(P.HorseX, P.HorseZ));
}

// Commandes d'épreuve (tranche T8) : mode tactile comme la page du web (joystick dessiné), doigt posé puis glissé (mêmes
// px CSS que le geste du web) par le chemin d'un vrai doigt : messages tactiles de la plateforme reçus par Slate
// (FSlateApplication::OnTouchStarted / OnTouchMoved, ceux qu'envoie iOS), routés jusqu'au viewport du jeu
// (SViewport, UGameViewportClient::InputTouch) puis à AStridesPlayerController::InputTouch ; cheval figé à la pose (le
// web ne fait plus de pas) ; carte Pause ouverte par le contrôleur (jeu suspendu).
bool AStridesShots::SlateTouch(int32 Phase, int32 FingerIndex, const FVector2D& Css)
{
	UGameViewportClient* VC = GetWorld() ? GetWorld()->GetGameViewport() : nullptr;
	if (!VC || !FSlateApplication::IsInitialized()) return false;
	const TSharedPtr<SViewport> VW = VC->GetGameViewportWidget();
	const TSharedPtr<SWindow> Win = VC->GetWindow();
	if (!VW.IsValid() || !Win.IsValid()) return false;
	// Position du doigt sur l'écran : px CSS → px du viewport (facteur de pixels) → unités Slate du widget du viewport
	// (UGameViewportClient reçoit AbsoluteToLocal(écran) × Scale : les px du viewport).
	const FGeometry& G = VW->GetCachedGeometry();
	const FVector2D Screen = FVector2D(G.LocalToAbsolute(FVector2f(Css * UStridesCsoHud::PixelRatio() / FMath::Max(1e-3f, G.Scale))));
	FSlateApplication& S = FSlateApplication::Get();
	const FPlatformUserId User = IPlatformInputDeviceMapper::Get().GetPrimaryPlatformUser();
	const FInputDeviceId Dev = IPlatformInputDeviceMapper::Get().GetDefaultInputDevice();
	if (Phase == 0) return S.OnTouchStarted(Win->GetNativeWindow(), Screen, 1.f, FingerIndex, User, Dev);
	if (Phase == 1) return S.OnTouchMoved(Screen, 1.f, FingerIndex, User, Dev);
	return S.OnTouchEnded(Screen, FingerIndex, User, Dev);
}

void AStridesShots::ApplyControlsPose(const FPose& P, APlayerController* PC, AStridesHorse* Horse)
{
	AStridesPlayerController* SPC = Cast<AStridesPlayerController>(PC);
	if (!SPC) return;
	if (UStridesTouchControls* T = SPC->TouchWidget()) T->SetTouchMode(P.bTactile);
	// Reprise d'abord (pose précédente en pause : commandes désactivées, le geste serait ignoré).
	if (!P.bPause && SPC->IsGamePausedState()) SPC->ResumeGame();
	// Doigt de la pose précédente levé.
	if (HeldTouch >= 0) SlateTouch(2, HeldTouch, HeldTouchAt);
	HeldTouch = -1;
	strides::CsoInput& Cmd = SPC->Commands();
	Cmd.releaseAll();
	if (P.bHasTouch)
	{
		if (Horse) Horse->SetActorTickEnabled(false);
		SPC->ClearTouchLog();
		const bool bDown = SlateTouch(0, P.TouchId, P.TouchStart);
		const bool bMove = SlateTouch(1, P.TouchId, P.TouchMove);
		HeldTouch = P.TouchId;
		HeldTouchAt = P.TouchMove;
		const FVector2D V = SPC->ViewCss();
		const FString Events = FString::Join(SPC->TouchLog(), TEXT(" "));
		UE_LOG(LogTemp, Display, TEXT("Strides parite: commandes %s : doigt par Slate (posé %d, glissé %d), reçu par InputTouch : %s ; viewport %.1f x %.1f px CSS, facteur de pixels %.2f, joystick %s base (%.1f ; %.1f) bouton (%+.1f ; %+.1f), move (%.6f ; %.6f ; %.6f)"),
			*P.Name, bDown, bMove, Events.IsEmpty() ? TEXT("RIEN") : *Events, V.X, V.Y, UStridesCsoHud::PixelRatio(),
			Cmd.joy.on ? TEXT("tenu") : TEXT("LIBRE"), Cmd.view.left, Cmd.view.top, Cmd.view.knobX, Cmd.view.knobY, Cmd.move.x, Cmd.move.y, Cmd.move.mag);
		if (HudResults.Num())
		{
			TSharedPtr<FJsonObject> To = MakeShared<FJsonObject>();
			To->SetStringField(TEXT("via"), TEXT("FSlateApplication::OnTouchStarted / OnTouchMoved -> SViewport -> UGameViewportClient::InputTouch -> AStridesPlayerController::InputTouch"));
			TArray<TSharedPtr<FJsonValue>> Ev;
			for (const FString& E : SPC->TouchLog()) Ev.Add(MakeShared<FJsonValueString>(E));
			To->SetArrayField(TEXT("events"), Ev);
			To->SetNumberField(TEXT("pixelRatio"), UStridesCsoHud::PixelRatio());
			To->SetArrayField(TEXT("move"), {MakeShared<FJsonValueNumber>(Cmd.move.x), MakeShared<FJsonValueNumber>(Cmd.move.y), MakeShared<FJsonValueNumber>(Cmd.move.mag)});
			HudResults.Last()->AsObject()->SetObjectField(TEXT("touch"), To);
		}
		if (!Cmd.joy.on) UE_LOG(LogTemp, Error, TEXT("Strides parite: commandes %s : le doigt n'a pas atteint le joystick par Slate"), *P.Name);
	}
	if (P.bPause && !SPC->IsGamePausedState()) SPC->PauseGame();
}

void AStridesShots::ApplyHudPose(const FPose& P, APlayerController* PC)
{
	// Exécution de l'oracle rejouée dans un HUD neuf (même règle que la page du web), appels ajoutés compris.
	FString Text;
	PoseHud = strides::CsoHud();
	PoseHud.setViewportHeight(P.Height);
	if (!FFileHelper::LoadFileToString(Text, *(RepoRoot() / P.HudRunFile)))
	{
		UE_LOG(LogTemp, Error, TEXT("Strides parite: HUD %s : exécution illisible (%s)"), *P.Name, *P.HudRunFile);
		return;
	}
	const std::string Utf8 = TCHAR_TO_UTF8(*Text);
	const J RunJ = JParser(Utf8).parse();
	const std::string ExtraUtf8 = TCHAR_TO_UTF8(*P.HudExtra);
	const J Extra = P.HudExtra.IsEmpty() ? J() : JParser(ExtraUtf8).parse();
	const int N = StridesCsoHudReplay::Run(PoseHud, RunJ, P.HudFrame, P.HudExtraFrame, P.HudExtra.IsEmpty() ? nullptr : &Extra);
	// État rejoué comparé à l'état du DOM du web à la même image (toasts, astuce, grand message, mot d'appel, crans,
	// tableau, classes) et textes du tableau.
	TArray<FString> Diffs;
	if (!P.HudState.IsEmpty())
	{
		const std::string StUtf8 = TCHAR_TO_UTF8(*P.HudState);
		const J W = JParser(StUtf8).parse();
		const strides::CsoHud& H = PoseHud;
		auto Check = [&](const TCHAR* What, bool bSame) { if (!bSame) Diffs.Add(What); };
		bool bTo = W["to"].a.size() == H.toasts().size();
		for (size_t I = 0; bTo && I < H.toasts().size(); I++) bTo = W["to"][I][0].s == H.toasts()[I].text && W["to"][I][1].s == H.toasts()[I].kind;
		Check(TEXT("toasts"), bTo);
		Check(TEXT("astuce"), W["hi"][0].b == H.hintOff() && W["hi"][1].s == H.hintHtml() && W["hi"][2].b == H.hintInline());
		Check(TEXT("grand message"), W["bg"][0].b == H.bigHidden() && W["bg"][1].s == H.bigTitle() && W["bg"][2].s == H.bigSub() && W["bg"][3].b == H.bigOn());
		Check(TEXT("mot d'appel"), W["fb"][0].s == H.fbText() && W["fb"][1].s == H.fbClass());
		Check(TEXT("crans"), (int)W["cad"][0].num() == H.cadOn() && W["cad"][1].b == H.cadShow());
		Check(TEXT("tableau"), W["bd"][0].b == H.boardHidden() && W["bd"][1].b == H.boardOver() && W["bd"][2].b == H.boardFaults());
		Check(TEXT("classes"), W["cl"][0].b == H.csoOn() && W["cl"][1].b == H.csoCtl() && W["cl"][2].b == H.csoSober());
		bool bTxt = true;
		for (int K = 0; K < 4; K++) bTxt = bTxt && W["board"][(size_t)K].s == H.boardText(K);
		Check(TEXT("textes du tableau"), bTxt);
	}
	else Diffs.Add(TEXT("état du web absent"));
	UE_LOG(LogTemp, Display, TEXT("Strides parite: HUD %s : %d images rejouées de %s, état %s"), *P.Name, N, *P.HudRunFile,
		Diffs.Num() ? *(TEXT("DIFFÉRENT du web : ") + FString::Join(Diffs, TEXT(", "))) : TEXT("identique au web"));
	TSharedPtr<FJsonObject> R = MakeShared<FJsonObject>();
	R->SetStringField(TEXT("name"), P.Name);
	R->SetNumberField(TEXT("frames"), N);
	TArray<TSharedPtr<FJsonValue>> D;
	for (const FString& X : Diffs) D.Add(MakeShared<FJsonValueString>(X));
	R->SetArrayField(TEXT("diffs"), D);
	// ApplyPose est rappelée juste avant la capture : un relevé par pose.
	if (HudResults.Num() && HudResults.Last()->AsObject()->GetStringField(TEXT("name")) == P.Name) HudResults.Last() = MakeShared<FJsonValueObject>(R);
	else HudResults.Add(MakeShared<FJsonValueObject>(R));
}

void AStridesShots::ApplyCamRunPose(const FPose& P, APlayerController* PC, AStridesHorse* Horse)
{
	// Cheval figé à la pose de l'image (en l'air s'il saute) : son pas et sa caméra ne tournent plus d'eux-mêmes.
	Horse->SetActorTickEnabled(false);
	if (P.bHasJumpY) Horse->SetActorLocation(StridesUnits::WebToUE(P.HorseX, Horse->GroundAt(P.HorseX, P.HorseZ) + P.HorseJumpY, P.HorseZ));
	if (!CamRunCache.IsValid() || CamRunCacheFile != P.CamRunFile)
	{
		FString Text;
		CamRunCache.Reset();
		if (FFileHelper::LoadFileToString(Text, *(RepoRoot() / P.CamRunFile))) FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), CamRunCache);
		CamRunCacheFile = P.CamRunFile;
	}
	double DevPos = 0, DevFov = 0, DevGround = 0;
	int32 Calls = 0;
	FString Why;
	const bool bOk = ReplayCourseCamera(Horse, CamRunCache, P.CamRunFrame, [&](int32, const strides::CsoCamOut& Out, const TSharedPtr<FJsonObject>& C)
	{
		const TArray<TSharedPtr<FJsonValue>>& E = C->GetArrayField(TEXT("eye"));
		const TArray<TSharedPtr<FJsonValue>>& L = C->GetArrayField(TEXT("look"));
		const TArray<TSharedPtr<FJsonValue>>& Hz = C->GetArrayField(TEXT("hz"));
		DevPos = FMath::Max(DevPos, FMath::Max3(FMath::Abs(Out.eye.x - E[0]->AsNumber()), FMath::Abs(Out.eye.y - E[1]->AsNumber()), FMath::Abs(Out.eye.z - E[2]->AsNumber())));
		DevPos = FMath::Max(DevPos, FMath::Max3(FMath::Abs(Out.look.x - L[0]->AsNumber()), FMath::Abs(Out.look.y - L[1]->AsNumber()), FMath::Abs(Out.look.z - L[2]->AsNumber())));
		DevFov = FMath::Max(DevFov, FMath::Abs(Out.fov - C->GetNumberField(TEXT("fov"))));
		DevGround = FMath::Max(DevGround, FMath::Abs(Horse->GroundAt(Hz[0]->AsNumber(), Hz[1]->AsNumber()) - Hz[6]->AsNumber()));
		Calls++;
	}, Why);
	PC->SetViewTarget(Horse);
	const strides::CsoCamState& S = Horse->CourseCameraState();
	UE_LOG(LogTemp, Display, TEXT("Strides parite: caméra de concours rejouée par le jeu (%s, image %d) : %s, %d appels, écart max au web œil/visée %.3g m, FOV %.3g°, sol sous le cheval %.3g m ; œil (%.4f ; %.4f ; %.4f), FOV vertical appliqué %.4f°, recul %.3f m"),
		*P.CamRunFile, P.CamRunFrame, bOk ? TEXT("ok") : *Why, Calls, DevPos, DevFov, DevGround, S.eye.x, S.eye.y, S.eye.z, S.camFov, S.back);
}

void AStridesShots::MeasureFraming(const FPose& P, APlayerController* PC)
{
	AStridesHorse* Horse = TActorIterator<AStridesHorse>(GetWorld()) ? *TActorIterator<AStridesHorse>(GetWorld()) : nullptr;
	if (!Horse || !PC->PlayerCameraManager || P.FramingPts.Num() == 0) return;
	// Vue de rendu (cache du gestionnaire de caméra) au moment de la capture.
	const FMinimalViewInfo View = PC->PlayerCameraManager->GetCameraCacheView();
	const double Y0 = Horse->GroundAt(P.HorseX, P.HorseZ) + (P.bHasJumpY ? P.HorseJumpY : 0.0);
	const TArray<double> Ys = FramingYs(View, P.Width, P.Height, P.HorseX, P.HorseZ, P.HorseH, Y0, P.FramingPts);
	double Top = 1e9, Bot = -1e9;
	for (const double Y : Ys)
	{
		Top = FMath::Min(Top, Y);
		Bot = FMath::Max(Bot, Y);
	}
	Top = FMath::Max(0.0, Top);
	Bot = FMath::Min(1.0, Bot);
	double Ex, Ey, Ez;
	StridesUnits::UEToWeb(View.Location, Ex, Ey, Ez);
	const EAspectRatioAxisConstraint Axis = View.AspectRatioAxisConstraint.Get(GetDefault<ULocalPlayer>()->AspectRatioAxisConstraint);
	const TCHAR* AxisName = Axis == EAspectRatioAxisConstraint::AspectRatio_MaintainYFOV ? TEXT("MaintainYFOV") : Axis == EAspectRatioAxisConstraint::AspectRatio_MaintainXFOV ? TEXT("MaintainXFOV") : TEXT("MajorAxisFOV");
	const double EyeDev = FVector(Ex - P.Eye.X, Ey - P.Eye.Y, Ez - P.Eye.Z).Size();
	UE_LOG(LogTemp, Display, TEXT("Strides parite: cadrage %s : couple sur %.4f de la hauteur (haut %.4f, bas %.4f) ; web %.4f (haut %.4f, bas %.4f) ; écart %.4f ; œil de rendu à %.3g m de l'œil web, FOV %.4f° (%s)"),
		*P.Name, Bot - Top, Top, Bot, P.WebPart, P.WebTop, P.WebBottom, (Bot - Top) - P.WebPart, EyeDev, View.FOV, AxisName);
	TSharedPtr<FJsonObject> R = MakeShared<FJsonObject>();
	R->SetStringField(TEXT("name"), P.Name);
	R->SetNumberField(TEXT("frame"), P.CamRunFrame);
	R->SetBoolField(TEXT("jump"), P.bFramingJump);
	R->SetNumberField(TEXT("part"), Bot - Top);
	R->SetNumberField(TEXT("top"), Top);
	R->SetNumberField(TEXT("bottom"), Bot);
	R->SetNumberField(TEXT("webPart"), P.WebPart);
	R->SetNumberField(TEXT("webTop"), P.WebTop);
	R->SetNumberField(TEXT("webBottom"), P.WebBottom);
	R->SetNumberField(TEXT("fovV"), View.FOV);
	R->SetStringField(TEXT("axis"), AxisName);
	R->SetNumberField(TEXT("eyeDev"), EyeDev);
	TArray<TSharedPtr<FJsonValue>> Yv;
	for (const double Y : Ys) Yv.Add(MakeShared<FJsonValueNumber>(Y));
	R->SetArrayField(TEXT("ys"), Yv);
	FramingResults.Add(MakeShared<FJsonValueObject>(R));
	FramingOut = FPaths::GetPath(P.Out) / TEXT("cadrage-unreal.json");
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
	if (PoseIndex >= Poses.Num())
	{
		if (HudResults.Num())
		{
			// Poses du HUD : état rejoué comparé au web et textes affichés par le widget (Describe, relevé à la capture).
			TSharedPtr<FJsonObject> Doc = MakeShared<FJsonObject>();
			Doc->SetStringField(TEXT("schema"), TEXT("strides.parite_hud/1"));
			Doc->SetStringField(TEXT("generator"), TEXT("-StridesShots=cso (AStridesShots::ApplyHudPose, UStridesCsoHud::Describe)"));
			Doc->SetStringField(TEXT("doc"), TEXT("par pose : images rejouées, parties de l'état du HUD différentes de l'état du DOM du web (vide : identique), éléments affichés par le widget à la capture (partie=texte)"));
			Doc->SetArrayField(TEXT("poses"), HudResults);
			FString Out;
			FJsonSerializer::Serialize(Doc.ToSharedRef(), TJsonWriterFactory<>::Create(&Out));
			// Un relevé par famille de poses (hud-* : tranche T7, cmd-* : tranche T8), nommé d'après la première pose relevée.
			FString Family = HudResults[0]->AsObject()->GetStringField(TEXT("name"));
			Family = Family.Left(Family.Find(TEXT("-")));
			const FString File = FPaths::GetPath(Poses.Last().Out) / (Family + TEXT("-unreal.json"));
			FFileHelper::SaveStringToFile(Out + TEXT("\n"), *File, FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
			UE_LOG(LogTemp, Display, TEXT("Strides parite: HUD écrit dans %s"), *File);
			HudResults.Reset();
		}
		if (FramingResults.Num() && !FramingOut.IsEmpty())
		{
			TSharedPtr<FJsonObject> Doc = MakeShared<FJsonObject>();
			Doc->SetStringField(TEXT("schema"), TEXT("strides.parite_cadrage/1"));
			Doc->SetStringField(TEXT("generator"), TEXT("-StridesShots=cso (AStridesShots::MeasureFraming)"));
			Doc->SetStringField(TEXT("measure"), TEXT("tests/e2e/cso-framing.mjs:31-39 : silhouette du couple projetée par la vue de rendu Unreal (projection du moteur, viewport de la pose) ; part = bas - haut (0 = haut de l'écran) ; web* = mesure du jeu web à la même image (poses.json)"));
			Doc->SetArrayField(TEXT("poses"), FramingResults);
			FString Out;
			FJsonSerializer::Serialize(Doc.ToSharedRef(), TJsonWriterFactory<>::Create(&Out));
			FFileHelper::SaveStringToFile(Out + TEXT("\n"), *FramingOut, FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
			UE_LOG(LogTemp, Display, TEXT("Strides parite: mesures du cadrage écrites dans %s"), *FramingOut);
			FramingResults.Reset();
		}
		FPlatformMisc::RequestExit(false);
		return;
	}
	const FPose& P = Poses[PoseIndex];
	if (PoseStep == 0 && P.bHasHud)
	{
		// Capture de la fenêtre avec l'interface : la fenêtre doit avoir la taille du viewport de la pose.
		const FIntPoint Size = GEngine && GEngine->GameViewport && GEngine->GameViewport->Viewport ? GEngine->GameViewport->Viewport->GetSizeXY() : FIntPoint::ZeroValue;
		if (Size != FIntPoint(P.Width, P.Height) && ResizeTries < 4)
		{
			ResizeTries++;
			FSystemResolution::RequestResolutionChange(P.Width, P.Height, EWindowMode::Windowed);
			UE_LOG(LogTemp, Display, TEXT("Strides parite: fenêtre %dx%d -> %dx%d demandée"), Size.X, Size.Y, P.Width, P.Height);
			Wait = 2.f;
			return;
		}
		ResizeTries = 0;
	}
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
		if (P.bHasHud)
		{
			// HUD d'épreuve : capture de la fenêtre AVEC l'interface (UMG), à la taille de la fenêtre.
			const FIntPoint Size = GEngine->GameViewport->Viewport->GetSizeXY();
			FScreenshotRequest::RequestScreenshot(P.Out, true, false);
			if (AStridesPlayerController* SPC = Cast<AStridesPlayerController>(PC))
				if (UStridesCsoHud* W = SPC->CsoHudWidget(); W && HudResults.Num())
				{
					TArray<TSharedPtr<FJsonValue>> D;
					for (const FString& L : W->Describe()) D.Add(MakeShared<FJsonValueString>(L));
					HudResults.Last()->AsObject()->SetArrayField(TEXT("shown"), D);
					HudResults.Last()->AsObject()->SetStringField(TEXT("window"), FString::Printf(TEXT("%dx%d"), Size.X, Size.Y));
					UE_LOG(LogTemp, Display, TEXT("Strides parite: HUD %s affiché : %s"), *P.Name, *FString::Join(W->Describe(), TEXT(" ; ")));
					// Commandes affichées (tranche T8) : boutons visibles, boîtes (px CSS) de SAUT, pause et joystick, opacité du
					// joystick ; carte Pause (éléments affichés).
					if (UStridesTouchControls* T = SPC->TouchWidget())
					{
						T->Sync();
						TArray<TSharedPtr<FJsonValue>> Bn;
						for (const FString& N : T->VisibleButtons()) Bn.Add(MakeShared<FJsonValueString>(N));
						TSharedPtr<FJsonObject> C = MakeShared<FJsonObject>();
						C->SetArrayField(TEXT("buttons"), Bn);
						for (const TCHAR* N : {TEXT("Jump"), TEXT("Pause"), TEXT("Joystick"), TEXT("Knob")})
						{
							const FVector4 B = T->BoxOf(N);
							C->SetArrayField(N, {MakeShared<FJsonValueNumber>(B.X), MakeShared<FJsonValueNumber>(B.Y), MakeShared<FJsonValueNumber>(B.Z), MakeShared<FJsonValueNumber>(B.W)});
						}
						C->SetNumberField(TEXT("joystickOpacity"), T->JoystickOpacity());
						C->SetBoolField(TEXT("tactile"), T->IsTouchMode());
						HudResults.Last()->AsObject()->SetObjectField(TEXT("controls"), C);
						UE_LOG(LogTemp, Display, TEXT("Strides parite: commandes %s affichées : %s"), *P.Name, *FString::Join(T->VisibleButtons(), TEXT(", ")));
					}
					if (const UStridesPauseMenu* M = SPC->PauseMenuWidget(); M && M->IsOpen())
					{
						TArray<TSharedPtr<FJsonValue>> Pm;
						for (const FString& L : M->Describe()) Pm.Add(MakeShared<FJsonValueString>(L));
						HudResults.Last()->AsObject()->SetArrayField(TEXT("pauseMenu"), Pm);
					}
				}
			UE_LOG(LogTemp, Display, TEXT("Strides parite: capture %s demandée avec l'interface (fenêtre %dx%d)"), *P.Out, Size.X, Size.Y);
			PoseStep = 2;
			Wait = 4.f;
			return;
		}
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
		if (P.bHasCamRun) MeasureFraming(P, PC);
		PoseIndex++;
		PoseStep = 0;
		Wait = 0.5f;
	}
}
