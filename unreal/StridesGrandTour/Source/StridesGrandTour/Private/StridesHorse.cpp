#include "StridesHorse.h"
#include "Animation/AnimationAsset.h"
#include "Camera/CameraComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/GameInstance.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/SpringArmComponent.h"
#include "StridesCore/CsoRide.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesFence.h"
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
	if (USkeletalMesh* HorseBody = LoadObject<USkeletalMesh>(nullptr, *(FString(HorseAssetRoot) + TEXT("Object_426.Object_426"))))
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
}

void AStridesHorse::BeginPlay()
{
	Super::BeginPlay();
	SetActorTickEnabled(true);
	UpdateAnimation();
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

void AStridesHorse::PlaceAt(double WebX, double WebZ, double Heading)
{
	X = WebX; Z = WebZ; H = Heading;
	SetActorLocationAndRotation(StridesUnits::WebToUE(X, 0, Z), FRotator(0, StridesUnits::HeadingToYawDeg(H), 0));
}

double AStridesHorse::JumpPower() const
{
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	const FStridesHorseProfile* P = Data ? Data->FindHorse(ProfileId) : nullptr;
	// horse.js : jumpPower = HORSE.jumpPeak × jump du cheval × (1 + équipement) × état (équipement et état : tranches suivantes).
	return (Data ? Data->JumpPeak : 1.35) * (P ? P->JumpMul : 1.0);
}

void AStridesHorse::ChangeGait(int32 Delta)
{
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	const int32 N = Data ? Data->Gaits.Num() : 5;
	GaitIndex = FMath::Clamp(GaitIndex + Delta, 0, N - 1);
}

void AStridesHorse::ToggleDemoCourse()
{
	bDemoCourse = !bDemoCourse;
	DemoPoint = 1;
	if (bDemoCourse)
	{
		GaitIndex = 4;
		UE_LOG(LogTemp, Display, TEXT("Strides demo course started"));
	}
	else
	{
		Move = FVector2D::ZeroVector;
		UE_LOG(LogTemp, Display, TEXT("Strides demo course stopped"));
	}
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

void AStridesHorse::StartJump(AStridesFence* Fence)
{
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	const strides::JumpParams& P = Data ? Data->Jump() : strides::jumpDefaults();
	strides::JumpHorse JH{(double)SpeedMS, JumpPower(), 0.0, bCsoControls};
	if (Fence)
	{
		const strides::FenceGeo Geo = strides::railsAhead(Fence->CoreFence(), X, Z, FMath::Sin(H), FMath::Cos(H));
		Plan = strides::planJump(JH, &Geo, P);
		JumpDir = Geo.sign;
		LastTakeoff = UTF8_TO_TCHAR(strides::qualityName(strides::takeoffQuality(Plan)));
		if (Plan.zone == strides::Zone::Refuse)
		{
			// Plus de place pour enlever : refus (le cheval s'arrête net, le cavalier fait demi-tour).
			SpeedMS = 0; CadenceMS = 0; RefuseT = 1.2f;
			if (Course) Course->Refused(Fence, JumpDir);
			return;
		}
	}
	else Plan = strides::planJump(JH, nullptr, P);
	bJumping = true;
	JumpX = 0;
	JumpFence = Fence;
}

void AStridesHorse::Tick(float Dt)
{
	Super::Tick(Dt);
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	const strides::CsoRideParams& R = Data ? Data->Ride() : strides::csoRideDefaults();
	const strides::JumpParams& JP = Data ? Data->Jump() : strides::jumpDefaults();
	if (bDemoCourse && Course)
	{
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
			// Se recaler sur le point le plus proche devant nous évite de faire
			// demi-tour après avoir dépassé un échantillon de 50 cm à 8 m/s.
			int32 Nearest = DemoPoint;
			double NearestD2 = TNumericLimits<double>::Max();
			for (int32 I = DemoPoint; I <= FMath::Min(DemoPoint + 40, Total - 1); ++I)
			{
				const strides::TracePoint& P = PointAt(I);
				const double D2 = FMath::Square(P.x - X) + FMath::Square(P.z - Z);
				if (D2 < NearestD2) { NearestD2 = D2; Nearest = I; }
			}
			DemoPoint = FMath::Max(DemoPoint, Nearest);
			// Viser environ 6 m plus loin lisse le cap dans les grandes courbes.
			const int32 TargetIndex = FMath::Min(DemoPoint + 12, Total - 1);
			const strides::TracePoint& Target = PointAt(TargetIndex);
			const double Dx = Target.x - X, Dz = Target.z - Z;
			const double Desired = FMath::Atan2(Dx, Dz);
			const double Error = FMath::UnwindRadians(Desired - H);
			// steerRate inverse le signe de l'axe (joystick droit => cap qui
			// diminue) : une erreur de cap positive demande donc un axe négatif.
			Move = FVector2D(FMath::Clamp(-Error * 1.8, -1.0, 1.0), 1.0);
			GaitIndex = 4;
			if (!bJumping && RefuseT <= 0 && SpeedMS >= (Data ? Data->MinJumpSpeed : 3.2f)
				&& Course->FenceAhead(X, Z, H, JP.reach * 0.9)) bJumpRequested = true;
		}
		if (const strides::CourseJudge* J = Course->Judge(); J && (J->finished() || J->eliminated() != strides::Elim::None))
		{
			bDemoCourse = false;
			Move = FVector2D::ZeroVector;
			UE_LOG(LogTemp, Display, TEXT("Strides demo course completed: %s"), *Course->StatusText());
		}
	}
	const double X0 = X, Z0 = Z;
	if (RefuseT > 0) RefuseT -= Dt;
	// Vitesse : cadence de concours (csoRide.js) ou allure du monde ouvert (config.js), accélération bornée.
	double Target = 0;
	if (bCsoControls)
	{
		if (RefuseT <= 0) CadenceMS = (float)FMath::Clamp((double)CadenceMS + strides::cadenceDelta(Move.Y, Move.X, CadenceMS, R) * Dt, 0.0, R.maxSpeed);
		Target = CadenceMS;
	}
	else if (Data && Data->Gaits.IsValidIndex(GaitIndex)) Target = Data->Gaits[GaitIndex].Speed;
	if (!bJumping) SpeedMS = FMath::FInterpConstantTo(SpeedMS, (float)Target, Dt, 3.0f);
	// Direction : vitesse de rotation visée (droite du joystick → virage à droite), réponse yawTau, accélération yawAcc ;
	// en l'air, part réduite (airTurn).
	const double Want = strides::steerRate(Move.X, SpeedMS, R) * (bJumping ? R.airTurn : 1.0);
	const double Acc = FMath::Clamp((Want - YawRate) / FMath::Max(R.yawTau, 1e-3), -R.yawAcc, R.yawAcc);
	YawRate += Acc * Dt;
	H += YawRate * Dt;
	// Saut demandé : obstacle devant à portée, sinon saut libre (au-dessus de la vitesse minimale).
	if (bJumpRequested && !bJumping && RefuseT <= 0 && SpeedMS >= (Data ? Data->MinJumpSpeed : 3.2f))
		StartJump(Course ? Course->FenceAhead(X, Z, H, JP.reach) : nullptr);
	bJumpRequested = false;
	// Arrivé sur l'obstacle sans appel : refus si un saut ferait toucher la barre de plus de JUMP.late (jumpModel.js).
	if (!bJumping && Course && SpeedMS > 0.5 && RefuseT <= 0)
		if (AStridesFence* F = Course->FenceAhead(X, Z, H, JP.minFront + 0.4))
		{
			const strides::FenceGeo Geo = strides::railsAhead(F->CoreFence(), X, Z, FMath::Sin(H), FMath::Cos(H));
			if (!Geo.rails.empty() && Geo.rails.front().x < JP.minFront)
			{
				const strides::JumpPlan Try = strides::planJump(strides::JumpHorse{(double)SpeedMS, JumpPower(), 0.0, bCsoControls}, &Geo, JP);
				if (Try.zone == strides::Zone::Refuse || (Try.hasMargin && Try.margin < -JP.late)) { SpeedMS = 0; CadenceMS = 0; RefuseT = 1.2f; Course->Refused(F, Geo.sign); }
				else StartJump(F);
			}
		}
	// Déplacement (m) et hauteur du saut : même parabole que le jugement (arcY).
	const double Step = SpeedMS * Dt;
	X += FMath::Sin(H) * Step;
	Z += FMath::Cos(H) * Step;
	double Y = 0;
	if (bJumping)
	{
		JumpX += Step;
		Y = strides::arcY(Plan.H, Plan.L, JumpX);
		if (JumpX >= Plan.L)
		{
			bJumping = false;
			if (Course && JumpFence.IsValid()) Course->JumpLanded(JumpFence.Get(), Plan, JumpDir);
			// Perte d'élan à la réception si le saut a dû être recadré (csoRide.js, landingLoss).
			if (FMath::Abs(Plan.dev) > 0.02) SpeedMS *= (float)(1 - R.landingLoss);
		}
	}
	SetActorLocationAndRotation(StridesUnits::WebToUE(X, Y, Z), FRotator(0, StridesUnits::HeadingToYawDeg(H), 0));
	if (Course) Course->TrackHorse(X0, Z0, X, Z, H, Dt);
	const double Spd = SpeedMS;
	// En CSO la vitesse plafonne à 8 m/s : le seuil de grand galop doit donc
	// rester atteignable. Il est aligné avec le choix du clip de saut rapide.
	GaitIndex = bCsoControls ? (Spd < 0.2 ? 0 : Spd < 3.2 ? 1 : Spd < 5.5 ? 2 : Spd < 7.0 ? 3 : 4) : GaitIndex;
	UpdateAnimation();
}
