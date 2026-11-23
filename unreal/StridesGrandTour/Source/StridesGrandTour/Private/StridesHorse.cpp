#include "StridesHorse.h"
#include "StridesCsoAudio.h"
#include "StridesPlayerController.h"
#include "Animation/AnimationAsset.h"
#include "Camera/CameraComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/GameInstance.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "StridesCore/CsoRide.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesFence.h"
#include "StridesHorseTack.h"
#include "StridesRider.h"
#include "StridesSaveSubsystem.h"
#include "StridesCore/HorseCoat.h"
#include "StridesUnits.h"

AStridesHorse::AStridesHorse()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	// Forme provisoire : tronc d'un cheval de 1,65 m au garrot (2,2 × 0,6 × 0,7 m), à remplacer par le cheval PJL importé.
	Body = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Body"));
	Body->SetupAttachment(Root);
	Body->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube")));
	Body->SetRelativeLocation(FVector(0, 0, 125));
	Body->SetRelativeScale3D(FVector(2.2, 0.6, 0.7));
	Body->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Mesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Mesh"));
	Mesh->SetupAttachment(Root);
	// Rig normalisé (scripts/unreal/normalize-horse-glb.py puis import-horse-glb.py) : maillage, squelette
	// et clips partagent l'échelle du GLB, ~100 fois trop grande ; l'échelle 0,01 ramène le cheval à 1,5 m
	// au bassin. L'ancien rig (horse_pjl_unreal) avait des os 100 fois plus loin que ses sommets.
	const TCHAR* HorseAssetRoot = TEXT("/Game/Characters/Horse/horse_pjl_normalized/horse_pjl_normalized/SkeletalMeshes/");
	// Robe du cheval engagé (C1) : corps porteur des masques de robe du jeu web (UV 1 à 3, scripts/unreal/coat-horse-glb.py
	// et import-horse-coat.py ; même squelette, mêmes clips) ; à défaut, corps d'origine (robe grise de la texture).
	USkeletalMesh* HorseBody = LoadObject<USkeletalMesh>(nullptr, TEXT("/Game/Characters/Horse/horse_pjl_coat/SK_HorseCoatBody.SK_HorseCoatBody"));
	bCoatBody = HorseBody != nullptr;
	if (!HorseBody) HorseBody = LoadObject<USkeletalMesh>(nullptr, *(FString(HorseAssetRoot) + TEXT("Object_426.Object_426")));
	if (HorseBody)
	{
		Mesh->SetSkeletalMesh(HorseBody);
		Mesh->SetRelativeScale3D(FVector(0.01f));
		Body->SetVisibility(false);
		Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	}
	EyesMesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("EyesMesh"));
	EyesMesh->SetupAttachment(Mesh);
	EyesMesh->SetSkeletalMesh(LoadObject<USkeletalMesh>(nullptr, *(FString(HorseAssetRoot) + TEXT("Object_427.Object_427"))));
	EyesMesh->SetLeaderPoseComponent(Mesh);
	HairMesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("HairMesh"));
	HairMesh->SetupAttachment(Mesh);
	HairMesh->SetSkeletalMesh(LoadObject<USkeletalMesh>(nullptr, *(FString(HorseAssetRoot) + TEXT("Object_428.Object_428"))));
	HairMesh->SetLeaderPoseComponent(Mesh);
	const FString AnimRoot = FString(HorseAssetRoot) + TEXT("Horse_");
	for (const TCHAR* Name : {TEXT("idle"), TEXT("walk"), TEXT("trot"), TEXT("canter"), TEXT("gallop")})
		GaitAnimations.Add(LoadObject<UAnimationAsset>(nullptr, *(AnimRoot + Name + TEXT(".Horse_") + Name)));
	JumpCanterAnimation = LoadObject<UAnimationAsset>(nullptr, *(AnimRoot + TEXT("jump_canter.Horse_jump_canter")));
	JumpGallopAnimation = LoadObject<UAnimationAsset>(nullptr, *(AnimRoot + TEXT("jump_gallop.Horse_jump_gallop")));
	Boom = CreateDefaultSubobject<USpringArmComponent>(TEXT("Boom"));
	Boom->SetupAttachment(Root);
	// Garder la caméra hors du volume du cheval importé pour éviter le clipping.
	Boom->TargetArmLength = 650.f;
	Boom->SetRelativeLocation(FVector(0, 0, 185));
	Boom->SetRelativeRotation(FRotator(-9, 0, 0));
	Boom->bEnableCameraLag = true;
	Boom->CameraLagSpeed = 6.f;
	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(Boom);
	Camera->FieldOfView = 55.f;
	// Caméra de concours (tranche T6) : inactive hors épreuve ; position et orientation posées en absolu à chaque image par
	// StepCourseCamera ; FieldOfView = champ VERTICAL du jeu web (camera.js : 58°). Mesuré sur la projection du moteur
	// (Strides.Cso.CameraInGame) : avec l'axe Y maintenu, UE 5.8 garde le champ vertical 2 atan(tan(FOV / 2) / AspectRatio)
	// (FieldOfView y reste horizontal au rapport AspectRatio de la caméra, 16:9 par défaut) ; d'où axe Y imposé ET
	// AspectRatio 1 (sans bandes : bConstrainAspectRatio faux), pour que FieldOfView soit le champ vertical à tout format.
	CourseCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("CourseCamera"));
	CourseCamera->SetupAttachment(Root);
	CourseCamera->SetUsingAbsoluteLocation(true);
	CourseCamera->SetUsingAbsoluteRotation(true);
	CourseCamera->bConstrainAspectRatio = false;
	CourseCamera->SetAspectRatio(1.f);
	CourseCamera->bOverrideAspectRatioAxisConstraint = true;
	CourseCamera->SetAspectRatioAxisConstraint(EAspectRatioAxisConstraint::AspectRatio_MaintainYFOV);
	CourseCamera->FieldOfView = 58.f;
	CourseCamera->SetAutoActivate(false);
}

void AStridesHorse::BeginPlay()
{
	Super::BeginPlay();
	SetActorTickEnabled(true);
	UpdateAnimation();
	ApplyEngagedCoat();
	// Essai de monte (voie A) : sellerie lue par les règles de monte, seulement avec -StridesRider=regles.
	FString RiderOption;
	if (FParse::Value(FCommandLine::Get(), TEXT("StridesRider="), RiderOption) && RiderOption == TEXT("regles") && Mesh)
	{
		Tack = NewObject<UStridesHorseTack>(this, TEXT("HorseTack"));
		Tack->RegisterComponent();
		Tack->AddTickPrerequisiteComponent(Mesh);
		if (Tack->Init(Mesh)) Tack->SetComponentTickEnabled(true);
	}
}

bool AStridesHorse::ApplyEngagedCoat()
{
	const UGameInstance* GI = GetGameInstance();
	const UStridesDataSubsystem* Data = GI ? GI->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	const UStridesSaveSubsystem* Save = GI ? GI->GetSubsystem<UStridesSaveSubsystem>() : nullptr;
	const strides::HorseCoatData* Coats = Data ? Data->HorseCoats() : nullptr;
	if (!Coats || !Mesh || !HairMesh) return bCoatApplied = false;
	strides::CoatUniforms U;
	strides::EngagedHorse E;
	try
	{
		// game.js spawnMainHorse(activeHorseId(d)) : HORSES[id] || HORSES.comete, robe coatOf(def) (pjlHorse.js).
		const std::string Id = Save ? strides::activeHorseId(Save->StableHorses(), Save->SavedActiveHorse(), *Coats) : std::string("comete");
		E = strides::engagedHorse(Id, *Coats);
		U = strides::coatUniforms(E.coat, *Coats);
	}
	catch (const std::exception& Ex)
	{
		UE_LOG(LogTemp, Warning, TEXT("Strides robe : %s, robe d'origine du modèle gardée"), UTF8_TO_TCHAR(Ex.what()));
		return bCoatApplied = false;
	}
	ProfileId = UTF8_TO_TCHAR(E.id.c_str());
	UMaterialInterface* CoatBase = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Characters/Horse/horse_pjl_coat/M_HorseCoat.M_HorseCoat"));
	UMaterialInterface* HairBase = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Characters/Horse/horse_pjl_coat/M_HorseHair.M_HorseHair"));
	if (!bCoatBody || !CoatBase || !HairBase)
	{
		UE_LOG(LogTemp, Warning, TEXT("Strides robe : corps à masques ou matériaux de robe absents (scripts/unreal/import-horse-coat.py), robe d'origine du modèle gardée"));
		return bCoatApplied = false;
	}
	if (!CoatMID || CoatMID->Parent != CoatBase) CoatMID = UMaterialInstanceDynamic::Create(CoatBase, this);
	if (!HairMID || HairMID->Parent != HairBase) HairMID = UMaterialInstanceDynamic::Create(HairBase, this);
	auto Col = [](const std::array<double, 3>& C) { return FLinearColor((float)C[0], (float)C[1], (float)C[2], 1.f); };
	auto V4 = [](const std::array<double, 4>& C) { return FLinearColor((float)C[0], (float)C[1], (float)C[2], (float)C[3]); };
	CoatMID->SetVectorParameterValue(TEXT("CoatColor"), Col(U.coat));
	CoatMID->SetVectorParameterValue(TEXT("PointsColor"), Col(U.points));
	CoatMID->SetVectorParameterValue(TEXT("Socks"), V4(U.socks));
	CoatMID->SetVectorParameterValue(TEXT("Blaze"), V4(U.blaze));
	CoatMID->SetScalarParameterValue(TEXT("PointsAmt"), (float)U.pointsAmt);
	CoatMID->SetScalarParameterValue(TEXT("Detail"), (float)U.detail);
	CoatMID->SetScalarParameterValue(TEXT("Roughness"), (float)U.roughness);
	// Robe mouillée (pjlHorse.js : uWet = max(pluie, sueur × 0,6) du cheval du jeu) : pluie et sueur non portées, 0.
	CoatMID->SetScalarParameterValue(TEXT("Wet"), (float)U.wet);
	HairMID->SetVectorParameterValue(TEXT("HairColor"), Col(U.hair));
	HairMID->SetScalarParameterValue(TEXT("Roughness"), (float)U.hairRoughness);
	for (int32 I = 0; I < Mesh->GetNumMaterials(); I++) Mesh->SetMaterial(I, CoatMID);
	for (int32 I = 0; I < HairMesh->GetNumMaterials(); I++) HairMesh->SetMaterial(I, HairMID);
	bCoatApplied = true;
	UE_LOG(LogTemp, Display, TEXT("Strides robe : cheval engagé %s, robe %s, liste %s, balzanes (%g %g %g %g)%s"), *ProfileId, UTF8_TO_TCHAR(E.coat.colour.c_str()),
		E.coat.blaze ? UTF8_TO_TCHAR(E.coat.blaze->c_str()) : TEXT("-"), U.socks[0], U.socks[1], U.socks[2], U.socks[3],
		E.model.empty() ? TEXT("") : *FString::Printf(TEXT(" ; le web l'affiche avec le modèle %s, non porté"), UTF8_TO_TCHAR(E.model.c_str())));
	return true;
}

void AStridesHorse::UpdateAnimation()
{
	if (!Mesh || !Mesh->GetSkeletalMeshAsset()) return;
	if (bJumping != bLastAnimationJumping || (!bJumping && GaitIndex != LastAnimationGait))
	{
		UAnimationAsset* Next = bJumping
			? (SpeedMS >= 7.f ? JumpGallopAnimation.Get() : JumpCanterAnimation.Get())
			: (GaitAnimations.IsValidIndex(GaitIndex) ? GaitAnimations[GaitIndex].Get() : nullptr);
		if (Next)
		{
			Mesh->PlayAnimation(Next, !bJumping);
			Mesh->SetPlayRate(1.f);
		}
		LastAnimationGait = GaitIndex;
		bLastAnimationJumping = bJumping;
	}
}

void AStridesHorse::PlaceAt(double WebX, double WebZ, double Heading, double InSpeedMS)
{
	X = WebX; Z = WebZ; H = Heading;
	// horse.js setPosition : arrêt, saut, freinage, refus et dernier saut oubliés.
	Sim.x = WebX; Sim.z = WebZ; Sim.heading = Heading;
	Sim.speed = InSpeedMS;
	Sim.jumpT = -1; Sim.jumpY = 0; Sim.brake = 0; Sim.refusing = -1;
	Sim.hasLastJump = false; Sim.lastJumpObstacle = -1;
	Sim.jt0 = Sim.jt1 = -1;
	// (horse._pass oublié ; le dernier refus compté, horse._refusal, est gardé comme dans le jeu web)
	Sim.hasPass = false;
	// Cadence de concours reprise de la vitesse réelle à l'image suivante (csoRide.js:65).
	Sim.hasCadence = false;
	SpeedMS = (float)InSpeedMS;
	bJumping = false;
	JumpFence = nullptr;
	SetActorLocationAndRotation(StridesUnits::WebToUE(X, GroundAt(X, Z), Z), FRotator(0, StridesUnits::HeadingToYawDeg(H), 0));
}

void AStridesHorse::Halt()
{
	Sim.speed = 0; Sim.hasCadence = false; Sim.kbdSteer = 0;
	SpeedMS = 0; CadenceMS = 0;
	Move = FVector2D::ZeroVector;
}

const UStridesDataSubsystem* AStridesHorse::DataSub() const
{
	const UGameInstance* GI = GetGameInstance();
	return GI ? GI->GetSubsystem<UStridesDataSubsystem>() : nullptr;
}

strides::CsoRunFrame AStridesHorse::RunFrame(double Dt, double Time) const
{
	// Entrées de l'épreuve vues par missions.update : cheval du joueur, point suivi (cheval monté, sinon le cavalier
	// à pied), mode monté ou non (descente = élimination à tout moment du parcours, courses.js:329).
	strides::CsoRunFrame F;
	F.dt = Dt;
	F.time = Time;
	F.x = X;
	F.z = Z;
	F.heading = H;
	F.riding = Rider != nullptr;
	// (au volant : F.driving, F.inTruck, F.vehicle restent faux, le jeu Unreal n'a ni camion ni véhicule conduit)
	F.focusX = X;
	F.focusZ = Z;
	if (!F.riding)
		if (const APawn* Pawn = GetWorld() ? GetWorld()->GetFirstPlayerController() ? GetWorld()->GetFirstPlayerController()->GetPawn() : nullptr : nullptr)
		{
			double Y;
			StridesUnits::UEToWeb(Pawn->GetActorLocation(), F.focusX, Y, F.focusZ);
		}
	return F;
}

strides::Zone AStridesHorse::JumpTiming() const
{
	if (!Course || !bCsoControls) return strides::Zone::None;
	const UStridesDataSubsystem* Data = DataSub();
	return strides::csoTiming(Course->Obstacles(), Sim, JumpPower(), 0.0, true, Data ? Data->Jump() : strides::jumpDefaults(),
		Data ? Data->HorseParams() : strides::csoHorseDefaults());
}

double AStridesHorse::GroundAt(double WebX, double WebZ) const
{
	// Sol du relief exporté du jeu web (Content/Data/World) ; la parabole du saut s'y ajoute.
	const UGameInstance* GI = GetGameInstance();
	const UStridesDataSubsystem* Data = GI ? GI->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	return Data ? Data->TerrainHeight(WebX, WebZ) : 0.0;
}

double AStridesHorse::JumpPower() const
{
	const UStridesDataSubsystem* Data = DataSub();
	const FStridesHorseProfile* P = Data ? Data->FindHorse(ProfileId) : nullptr;
	// horse.js : jumpPower = HORSE.jumpPeak × jump du cheval × (1 + équipement) × état (équipement et état : tranches suivantes).
	return (Data ? Data->JumpPeak : 1.35) * (P ? P->JumpMul : 1.0);
}

void AStridesHorse::ChangeGait(int32 Delta)
{
	const UStridesDataSubsystem* Data = DataSub();
	const int32 N = Data ? Data->Gaits.Num() : 5;
	GaitIndex = FMath::Clamp(GaitIndex + Delta, 0, N - 1);
}

void AStridesHorse::ToggleDemoCourse()
{
#if UE_BUILD_SHIPPING
	// Démonstration automatique (F8, -StridesShots) : outil de développement, absente des versions publiées.
	UE_LOG(LogTemp, Display, TEXT("Strides demo course unavailable in shipping builds"));
#else
	bDemoCourse = !bDemoCourse;
	DemoPoint = 1;
	if (bDemoCourse)
	{
		UE_LOG(LogTemp, Display, TEXT("Strides demo course started"));
	}
	else
	{
		Move = FVector2D::ZeroVector;
		UE_LOG(LogTemp, Display, TEXT("Strides demo course stopped"));
	}
#endif
}

FTransform AStridesHorse::SeatTransform() const
{
	// Le cheval PJL fournit un repère de monte et un os de selle. Les lire sur
	// le composant animé synchronise le cavalier avec chaque foulée et le saut.
	if (Mesh && Mesh->GetSkeletalMeshAsset())
	{
		// `mountpoint_01_0179` part du bas du squelette (environ 65 cm) : ce
		// n'est pas l'assise malgré son nom. L'os de selle est au vrai contact
		// du dos (environ 173 cm) et conserve le rebond animé des allures.
		for (const FName SeatBone : {FName(TEXT("saddle_0168")), FName(TEXT("mountpoint_01_0179")), FName(TEXT("SaddleSeat"))})
			// Position de l'os seulement : le maillage est à l'échelle 0,01 et l'axe local de l'os
			// n'est pas celui du cavalier ; l'orientation suit l'acteur cheval.
			if (Mesh->DoesSocketExist(SeatBone)) return FTransform(GetActorRotation(), Mesh->GetSocketLocation(SeatBone));
	}
	return FTransform(GetActorRotation(), GetActorLocation() + FVector(0, 0, 175 + (Body ? Body->GetRelativeLocation().Z - 125 : 0)));
}

// Démonstration automatique du parcours (outil de développement : F8, captures -StridesShots) : suit le tracé, garde la
// cadence de référence et appuie sur SAUT selon la règle du pilote des tests web (tests/e2e/autopilot.js : bonne zone et
// sommet du saut sur l'obstacle). Le saut lui-même passe par le cœur, comme un appui du joueur.
void AStridesHorse::TickDemo()
{
#if !UE_BUILD_SHIPPING
	const UStridesDataSubsystem* Data = DataSub();
	const strides::CsoRideParams& R = Data ? Data->Ride() : strides::csoRideDefaults();
	const strides::CourseTrace& T = Course->CourseTraceData();
	const int32 LeadCount = static_cast<int32>(T.leadIn.size());
	const int32 Total = LeadCount + static_cast<int32>(T.pts.size());
	auto PointAt = [&T, LeadCount](int32 Index) -> const strides::TracePoint&
	{
		return Index < LeadCount ? T.leadIn[Index] : T.pts[Index - LeadCount];
	};
	if (Total > 1)
	{
		DemoPoint = FMath::Clamp(DemoPoint, 0, Total - 1);
		// Se recaler sur le point le plus proche devant nous évite de faire demi-tour après avoir dépassé un échantillon.
		int32 Nearest = DemoPoint;
		double NearestD2 = TNumericLimits<double>::Max();
		for (int32 I = DemoPoint; I <= FMath::Min(DemoPoint + 40, Total - 1); ++I)
		{
			const strides::TracePoint& P = PointAt(I);
			const double D2 = FMath::Square(P.x - Sim.x) + FMath::Square(P.z - Sim.z);
			if (D2 < NearestD2) { NearestD2 = D2; Nearest = I; }
		}
		DemoPoint = FMath::Max(DemoPoint, Nearest);
		// Viser environ 6 m plus loin lisse le cap dans les grandes courbes.
		const strides::TracePoint& Target = PointAt(FMath::Min(DemoPoint + 12, Total - 1));
		const double Error = FMath::UnwindRadians(FMath::Atan2(Target.x - Sim.x, Target.z - Sim.z) - Sim.heading);
		// steerRate : joystick à droite => cap qui diminue ; une erreur de cap positive demande donc un axe négatif.
		Move = FVector2D(FMath::Clamp(-Error * 1.8, -1.0, 1.0), Sim.hasCadence && Sim.cadence >= R.cadence ? 0.0 : 1.0);
		bKeyMove = false;
		const strides::CsoTarget Tg = strides::csoTarget(Course->Obstacles(), Sim, JumpPower(), 0.0, true,
			Data ? Data->Jump() : strides::jumpDefaults(), Data ? Data->HorseParams() : strides::csoHorseDefaults());
		if (Sim.jumpT < 0 && Tg.index >= 0 && Tg.plan.zone == strides::Zone::Good && Tg.plan.ideal <= Tg.plan.L + 0.3) bJumpRequested = true;
	}
	if (const strides::CsoRun* Run = Course->Run(); Run && (Run->state().finished || Run->state().eliminated))
	{
		bDemoCourse = false;
		Move = FVector2D::ZeroVector;
		UE_LOG(LogTemp, Display, TEXT("Strides demo course completed: %s"), *Course->StatusText());
	}
#endif
}

void AStridesHorse::Tick(float Dt)
{
	Super::Tick(Dt);
	// Tranche T8 : en pause (game.state « paused »), la boucle du web n'appelle plus update() : ni pas du cheval, ni
	// obstacles, ni caméra, ni épreuve (le jeu est aussi suspendu par SetGamePaused ; ce garde vaut sans lui, tests
	// compris) ; l'image d'Échap avance encore (PauseGame : SkipsUpdate faux à cette image). Téléphone ouvert en tête
	// d'image (game.simPaused relevé par StepCommands avant les boutons globaux) : cheval et chrono figés.
	const AStridesPlayerController* PC = Cast<AStridesPlayerController>(GetController());
	if (PC && PC->SkipsUpdate()) return;
	const bool bSimPaused = PC && PC->IsSimPaused();
	// Interface d'épreuve (tranche T7) : temporisations du HUD échues avant les appels de l'image (horloge murale).
	if (Course) Course->BeginHudFrame();
	if (bCsoControls) TickCso(Dt, bSimPaused);
	else TickOpenWorld(Dt, bSimPaused);
	UpdateAnimation();
}

// Concours : une image du cœur (csoRideStep + Horse.update), puis Obstacles.updateHorse et Obstacles.update du cœur
// (jugement des barres au passage, refus, chute des barres : tranche T3).
void AStridesHorse::TickCso(float Dt, bool bSimPaused)
{
	// hdt (cheval, en épreuve et en commandes de concours) et sdt (chrono de l'épreuve) : nuls simulation suspendue.
	const float HDt = bSimPaused ? 0.f : Dt;
	const float SDt = bSimPaused ? 0.f : Dt;
	const UStridesDataSubsystem* Data = DataSub();
	const strides::CsoRideParams& R = Data ? Data->Ride() : strides::csoRideDefaults();
	const strides::JumpParams& JP = Data ? Data->Jump() : strides::jumpDefaults();
	const strides::CsoHorseParams& HP = Data ? Data->HorseParams() : strides::csoHorseDefaults();
	static const std::vector<strides::CsoObstacle> NoObstacles;
	const std::vector<strides::CsoObstacle>& Obs = Course ? Course->Obstacles() : NoObstacles;
	if (bDemoCourse && Course) TickDemo();
	strides::CsoFrameInput In;
	In.dt = HDt;
	In.moveX = Move.X;
	In.moveY = Move.Y;
	In.keyMove = bKeyMove;
	In.jumpPressed = bJumpRequested;
	In.csoControls = true;
	In.power = JumpPower();
	In.time = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0;
	// Pente devant le cheval (horse.js : sol à ±1,1 m sur le cap).
	const double Fx = FMath::Sin(Sim.heading), Fz = FMath::Cos(Sim.heading);
	In.slope = (GroundAt(Sim.x + Fx * 1.1, Sim.z + Fz * 1.1) - GroundAt(Sim.x - Fx * 1.1, Sim.z - Fz * 1.1)) / 2.2;
	bJumpRequested = false;
	const double X0 = Sim.x, Z0 = Sim.z;
	Events.clear();
	strides::csoHorseStep(Sim, In, Obs, Events, R, JP, HP);
	FrameEvents.Reset();
	// Sons (tranche T12) : écouteurs de game.js:716-728, cheval du joueur, commandes de concours, sol de la carrière.
	UStridesCsoAudio* Audio = GetWorld() ? GetWorld()->GetSubsystem<UStridesCsoAudio>() : nullptr;
	for (const strides::CsoHorseEvent E : Events)
	{
		if (Audio) Audio->HorseEvent(E, In.playerHorse, In.csoControls, "sand");
		FrameEvents.Add(UTF8_TO_TCHAR(strides::csoHorseEventName(E)));
		if (E == strides::CsoHorseEvent::Jump && Sim.hasLastJump) LastTakeoff = UTF8_TO_TCHAR(strides::qualityName(strides::takeoffQuality(Sim.lastPlan)));
		// game.js:727 : horse:jumpEarly → hud.jumpEarly() (bouton « Trop tôt » 600 ms, tranche T9).
		if (E == strides::CsoHorseEvent::JumpEarly && Course) Course->HudModel().jumpEarly();
	}
	// Obstacles.updateHorse (tranche T3, cœur) : jugement de chaque barre au passage des épaules, refus (décision à
	// l'abord, comptage à l'arrêt, barre emportée tout contre, garde-fou du nez, glissade), barres des postérieurs ; puis
	// Obstacles.update (chute des barres, vibration, remise par le jury) et affichage des barres. Pas de cheval WildMesh :
	// membres non jugés, résultat annoncé à la sortie des épaules (comme le web en personnages classiques).
	if (Course)
	{
		strides::CsoUpdateHorseInput U;
		U.prevX = X0;
		U.prevZ = Z0;
		U.time = In.time;
		U.limbJudged = false;
		U.power = In.power;
		U.clearance = In.clearance;
		U.csoCourse = true;
		strides::CsoFenceOut Out;
		strides::csoFencesUpdateHorse(Sim, Obs, Course->FenceStates(), U, Out, JP, HP, Data ? Data->FenceParams() : strides::csoFenceDefaults());
		// Dernier saut (horse._lastJump), lu par le mot d'appel des écouteurs d'obstacle (tranche T7).
		Course->NoteLastJump(Sim.hasLastJump, Sim.lastJumpObstacle, Sim.lastPlan, Sim.lastJumpTime);
		// Sons des barres (knock, _judge) puis cabré de la glissade (horse:refuse → neigh), avant les écouteurs de courses.js.
		if (Audio)
		{
			for (const strides::CsoFenceSound S : Out.sounds) Audio->FenceSound(S);
			for (const strides::CsoHorseEvent E : Out.horse) Audio->HorseEvent(E, In.playerHorse, In.csoControls, "sand");
		}
		for (const strides::CsoHorseEvent E : Out.horse) FrameEvents.Add(UTF8_TO_TCHAR(strides::csoHorseEventName(E)));
		// Événements d'obstacle vus par l'épreuve (courses.js) : un refus compté remet la cadence à 0.
		strides::CsoCadence Cad{Sim.hasCadence, Sim.cadence};
		Course->HandleFenceOut(Out, Cad);
		Sim.hasCadence = Cad.has;
		Sim.cadence = Cad.v;
		Course->UpdateFences(Dt, In.time, Sim.x, Sim.z);
	}
	X = Sim.x; Z = Sim.z; H = Sim.heading;
	SpeedMS = (float)Sim.speed;
	CadenceMS = Sim.hasCadence ? (float)Sim.cadence : 0.f;
	bJumping = Sim.jumpT >= 0;
	SetActorLocationAndRotation(StridesUnits::WebToUE(X, GroundAt(X, Z) + Sim.jumpY, Z), FRotator(0, StridesUnits::HeadingToYawDeg(H), 0));
	// Caméra après le cheval et les obstacles, avant le déroulé de l'épreuve (ordre de src/game.js:1489-1507).
	UpdateCourseCamera(Dt);
	if (Course)
	{
		// Déroulé de l'épreuve (Run.update) après le cheval et les obstacles ; la sortie de piste ramène la cadence vers
		// 1,9 m/s.
		strides::CsoCadence Cad{Sim.hasCadence, Sim.cadence};
		const strides::CsoRunFrame RF = RunFrame(SDt, In.time);
		Course->TickRun(RF, Cad);
		Sim.hasCadence = Cad.has;
		Sim.cadence = Cad.v;
		// Aides du parcours (tranche T9) : mises à jour par l'étape de parcours, après son déroulé de l'image.
		Course->UpdateAids(SDt, Sim.x, Sim.z, Sim.speed, In.power, In.clearance, RF.riding, In.time);
		// hud.update du jeu web (fin de l'image) : tableau, classes, crans de cadence (réglage au joystick), bouton SAUT.
		Course->UpdateHud(Dt, Sim.hasCadence, Sim.cadence, Sim.cadAdjust, JumpTiming());
	}
	CadenceMS = Sim.hasCadence ? (float)Sim.cadence : 0.f;
	// En CSO la vitesse plafonne à 8 m/s : le seuil de grand galop reste atteignable (aligné sur le clip de saut rapide).
	const double Spd = SpeedMS;
	GaitIndex = Spd < 0.2 ? 0 : Spd < 3.2 ? 1 : Spd < 5.5 ? 2 : Spd < 7.0 ? 3 : 4;
}

// Monde ouvert (hors épreuve) : allures du joueur, code d'origine (le monde ouvert du jeu web, dirigé par rapport à la
// caméra, n'est pas porté). Visée : obstacle du cœur (target), sinon saut libre.
void AStridesHorse::StartOpenWorldJump()
{
	const UStridesDataSubsystem* Data = DataSub();
	const strides::JumpParams& P = Data ? Data->Jump() : strides::jumpDefaults();
	strides::CsoHorseState Probe = Sim;
	Probe.x = X; Probe.z = Z; Probe.heading = H; Probe.speed = SpeedMS;
	const strides::CsoTarget T = Course ? strides::csoTarget(Course->Obstacles(), Probe, JumpPower(), 0.0, false, P,
		Data ? Data->HorseParams() : strides::csoHorseDefaults()) : strides::CsoTarget();
	Plan = T.index >= 0 ? T.plan : strides::planJump(strides::JumpHorse{(double)SpeedMS, JumpPower(), 0.0, false}, nullptr, P);
	if (T.index >= 0 && Plan.zone == strides::Zone::Refuse) return;
	bJumping = true;
	JumpX = 0;
	JumpFence = T.index >= 0 && Course ? Course->FenceAt(T.index) : nullptr;
	JumpDir = T.geo.sign;
}

void AStridesHorse::TickOpenWorld(float Dt, bool bSimPaused)
{
	const float SDt = bSimPaused ? 0.f : Dt;
	const UStridesDataSubsystem* Data = DataSub();
	const strides::CsoRideParams& R = Data ? Data->Ride() : strides::csoRideDefaults();
	const double Target = Data && Data->Gaits.IsValidIndex(GaitIndex) ? Data->Gaits[GaitIndex].Speed : 0.0;
	if (!bJumping) SpeedMS = FMath::FInterpConstantTo(SpeedMS, (float)Target, Dt, 3.0f);
	const double Want = strides::steerRate(Move.X, SpeedMS, R) * (bJumping ? R.airTurn : 1.0);
	const double Acc = FMath::Clamp((Want - YawRate) / FMath::Max(R.yawTau, 1e-3), -R.yawAcc, R.yawAcc);
	YawRate += Acc * Dt;
	H += YawRate * Dt;
	if (bJumpRequested && !bJumping && SpeedMS >= (Data ? Data->MinJumpSpeed : 3.2f)) StartOpenWorldJump();
	bJumpRequested = false;
	const double Step = SpeedMS * Dt;
	X += FMath::Sin(H) * Step;
	Z += FMath::Cos(H) * Step;
	double Y = 0;
	if (bJumping)
	{
		JumpX += Step;
		Y = strides::arcY(Plan.H, Plan.L, JumpX);
		if (JumpX >= Plan.L) { bJumping = false; JumpFence = nullptr; }
	}
	Sim.x = X; Sim.z = Z; Sim.heading = H; Sim.speed = SpeedMS; Sim.jumpT = bJumping ? 0 : -1; Sim.hasCadence = false;
	SetActorLocationAndRotation(StridesUnits::WebToUE(X, GroundAt(X, Z) + Y, Z), FRotator(0, StridesUnits::HeadingToYawDeg(H), 0));
	UpdateCourseCamera(Dt);
	if (Course)
	{
		strides::CsoCadence Cad;
		const strides::CsoRunFrame RF = RunFrame(SDt, GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0);
		Course->TickRun(RF, Cad);
		Course->UpdateAids(SDt, X, Z, SpeedMS, JumpPower(), 0.0, RF.riding, RF.time);
		Course->UpdateHud(Dt, false, 0.0, false);
		// Obstacles.update tourne à chaque image dans le jeu web : les barres finissent de tomber.
		Course->UpdateFences(Dt, GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0, X, Z);
	}
}

// ---------- Caméra de concours (tranche T6) ----------

strides::CsoCamHorse AStridesHorse::CameraHorse() const
{
	strides::CsoCamHorse V;
	V.x = Sim.x;
	V.z = Sim.z;
	V.heading = Sim.heading;
	V.yawRate = Sim.yawRate;
	V.jumpT = Sim.jumpT;
	V.jumpY = Sim.jumpY;
	V.groundY = GroundAt(Sim.x, Sim.z);
	return V;
}

bool AStridesHorse::CameraBlockedAt(double WebX, double WebY, double WebZ) const
{
	const UWorld* W = GetWorld();
	if (!W) return false;
	FCollisionQueryParams Q(SCENE_QUERY_STAT(StridesCourseCamera), false, this);
	if (Rider) Q.AddIgnoredActor(Rider.Get());
	return W->OverlapBlockingTestByChannel(StridesUnits::WebToUE(WebX, WebY, WebZ), FQuat::Identity, ECC_Camera, FCollisionShape::MakeSphere(45.f), Q);
}

void AStridesHorse::SetCameraBefore(const strides::CsoVec3& Eye, double Fov, double CamFov)
{
	CamState.eye = Eye;
	CamState.fov = Fov;
	CamState.camFov = CamFov;
	bCameraBefore = true;
}

void AStridesHorse::UpdateCourseCamera(float Dt)
{
	// camera.js:74 : branche concours quand le joueur est à cheval et que l'épreuve est en mode concours
	// (game.course.camera : de l'entrée en piste à la fin de la sortie de piste).
	const strides::CsoRun* Run = Course ? Course->Run() : nullptr;
	if (!Run || !Run->course().active || !Rider)
	{
		LeaveCourseCamera();
		return;
	}
	StepCourseCamera(Dt, CameraHorse(), Run->course().next, false);
}

void AStridesHorse::LeaveCourseCamera()
{
	if (CamState.active) strides::csoCamLeave(CamState);
	if (CourseCamera && CourseCamera->IsActive())
	{
		CourseCamera->Deactivate();
		if (Camera) Camera->Activate();
	}
}

strides::CsoCamOut AStridesHorse::StepCourseCamera(double Dt, const strides::CsoCamHorse& HorseView, int32 NextIndex, bool bInstant)
{
	const UStridesDataSubsystem* Data = DataSub();
	const strides::CsoCamParams& P = Data ? Data->CameraParams() : strides::csoCamDefaults();
	if (!CamState.active && !bCameraBefore && Camera)
	{
		// Entrée (camera.js:191-204) : la caméra de concours part de la perche du monde ouvert, position et FOV. Champ
		// vertical de la perche : axe Y maintenu par le joueur local d'UE 5.8 (BaseEngine.ini [/Script/Engine.LocalPlayer])
		// au rapport AspectRatio de la perche, soit 2 atan(tan(FieldOfView / 2) / AspectRatio).
		double Ex, Ey, Ez;
		StridesUnits::UEToWeb(Camera->GetComponentLocation(), Ex, Ey, Ez);
		CamState.eye = strides::CsoVec3{Ex, Ey, Ez};
		const double HalfV = FMath::Atan(FMath::Tan(FMath::DegreesToRadians((double)Camera->FieldOfView) / 2) / FMath::Max(0.1, (double)Camera->AspectRatio));
		CamState.fov = CamState.camFov = FMath::RadiansToDegrees(2 * HalfV);
	}
	bCameraBefore = false;
	// Obstacles survolés (camera.js:233-238 : game.obstacles.list) : ceux du parcours, au sol du relief.
	CamFences.clear();
	static const std::vector<strides::CsoObstacle> NoObstacles;
	const std::vector<strides::CsoObstacle>& Obs = Course ? Course->Obstacles() : NoObstacles;
	for (const strides::CsoObstacle& O : Obs)
	{
		strides::CsoCamFence F;
		F.x = O.x; F.z = O.z; F.nx = O.n.x; F.nz = O.n.z; F.tx = O.t.x; F.tz = O.t.z;
		F.w = O.w; F.depth = O.depth; F.ground = GroundAt(O.x, O.z); F.h = O.h; F.off = O.off;
		CamFences.push_back(F);
	}
	strides::CsoCamInput In;
	In.dt = Dt;
	In.instant = bInstant;
	In.horse = HorseView;
	if (NextIndex >= 0 && NextIndex < (int32)Obs.size())
	{
		In.hasNext = true;
		In.nextX = Obs[NextIndex].x;
		In.nextZ = Obs[NextIndex].z;
	}
	In.fences = &CamFences;
	In.blocked = [this](double Bx, double By, double Bz) { return CameraBlockedAt(Bx, By, Bz); };
	In.ground = [this](double Gx, double Gz) { return GroundAt(Gx, Gz); };
	const strides::CsoCamOut Out = strides::csoCamStep(CamState, In, P);
	const FVector Eye = StridesUnits::WebToUE(Out.eye.x, Out.eye.y, Out.eye.z);
	const FVector Look = StridesUnits::WebToUE(Out.look.x, Out.look.y, Out.look.z);
	CourseCamera->SetWorldLocationAndRotation(Eye, (Look - Eye).Rotation());
	CourseCamera->SetFieldOfView((float)Out.fov);
	if (!CourseCamera->IsActive())
	{
		if (Camera) Camera->Deactivate();
		CourseCamera->Activate();
	}
	return Out;
}
