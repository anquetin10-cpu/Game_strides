#include "StridesRider.h"
#include "Animation/AnimationAsset.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "EngineUtils.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "StridesCourse.h"
#include "StridesHorse.h"

AStridesRider::AStridesRider()
{
	PrimaryActorTick.bCanEverTick = true;
	GetCapsuleComponent()->InitCapsuleSize(25.f, 84.f);  // 1,68 m (cavalière du jeu web)
	Body = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Body"));
	Body->SetupAttachment(GetCapsuleComponent());
	Body->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cylinder.Cylinder")));
	Body->SetRelativeScale3D(FVector(0.45, 0.3, 1.68));
	Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	const FString RiderRoot = TEXT("/Game/Characters/Riders/Female/rider_f_unreal/SkeletalMeshes/");
	USkeletalMeshComponent* MainMesh = GetMesh();
	if (USkeletalMesh* RiderBody = LoadObject<USkeletalMesh>(nullptr, *(RiderRoot + TEXT("Body.Body"))))
	{
		MainMesh->SetSkeletalMesh(RiderBody);
		MainMesh->SetRelativeLocation(FVector(0, 0, -84));
		Body->SetVisibility(false);
	}
	for (const TCHAR* Part : {TEXT("Cloth_boots"), TEXT("Cloth_jacket"), TEXT("Cloth_jeans"), TEXT("Cloth_shirt"), TEXT("Eyebrows"), TEXT("Eyelashes"), TEXT("Eyes"), TEXT("Hair_ponytail01")})
	{
		USkeletalMeshComponent* PartMesh = CreateDefaultSubobject<USkeletalMeshComponent>(FName(FString(TEXT("Rider_")) + Part));
		PartMesh->SetupAttachment(MainMesh);
		PartMesh->SetSkeletalMesh(LoadObject<USkeletalMesh>(nullptr, *(RiderRoot + Part + TEXT(".") + Part)));
		PartMesh->SetLeaderPoseComponent(MainMesh);
		MeshParts.Add(PartMesh);
	}
	const FString AnimRoot = TEXT("/Game/Characters/Riders/Female/rider_f_unreal/AnimationsFBX/Rider_");
	for (const TCHAR* Name : {TEXT("idle"), TEXT("walk"), TEXT("trot"), TEXT("canter"), TEXT("gallop")})
		GaitAnimations.Add(LoadObject<UAnimationAsset>(nullptr, *(AnimRoot + Name + TEXT(".Rider_") + Name)));
	JumpCanterAnimation = LoadObject<UAnimationAsset>(nullptr, *(AnimRoot + TEXT("jump_canter.Rider_jump_canter")));
	JumpGallopAnimation = LoadObject<UAnimationAsset>(nullptr, *(AnimRoot + TEXT("jump_gallop.Rider_jump_gallop")));
	UCharacterMovementComponent* M = GetCharacterMovement();
	M->MaxWalkSpeed = 140.f;  // marche 1,4 m/s (anim.js, vitesse du joueur à pied ; course : tranche suivante)
	M->bOrientRotationToMovement = true;
	M->RotationRate = FRotator(0, 540, 0);
	bUseControllerRotationYaw = false;
	Boom = CreateDefaultSubobject<USpringArmComponent>(TEXT("Boom"));
	Boom->SetupAttachment(GetCapsuleComponent());
	Boom->TargetArmLength = 420.f;
	Boom->SetRelativeLocation(FVector(0, 0, 95));
	Boom->SetRelativeRotation(FRotator(-8, 0, 0));
	// La vue d'attente reste en poursuite fixe : la rotation de contrôle peut
	// conserver un pitch extrême après une reprise de possession.
	Boom->bUsePawnControlRotation = false;
	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(Boom);
	Camera->FieldOfView = 55.f;
}

void AStridesRider::BeginPlay()
{
	Super::BeginPlay();
	GetMesh()->PlayAnimation(GaitAnimations.IsValidIndex(0) ? GaitAnimations[0].Get() : nullptr, true);
}

void AStridesRider::UpdateMountedAnimation()
{
	if (!MountedOn || !GetMesh()->GetSkeletalMeshAsset()) return;
	const bool bJumping = MountedOn->IsJumping();
	const int32 Gait = MountedOn->GaitIndex;
	if (bJumping == bLastAnimationJumping && (bJumping || Gait == LastAnimationGait)) return;
	UAnimationAsset* Next = bJumping
		? (MountedOn->SpeedMS >= 7.f ? JumpGallopAnimation.Get() : JumpCanterAnimation.Get())
		: (GaitAnimations.IsValidIndex(Gait) ? GaitAnimations[Gait].Get() : nullptr);
	if (Next)
	{
		GetMesh()->PlayAnimation(Next, !bJumping);
		GetMesh()->SetPlayRate(1.f);
	}
	LastAnimationGait = Gait;
	bLastAnimationJumping = bJumping;
}

bool AStridesRider::TryMount(APlayerController* PC)
{
	if (MountedOn) return false;
	AStridesHorse* Best = nullptr;
	double BestD = 300.0;  // cm
	for (TActorIterator<AStridesHorse> It(GetWorld()); It; ++It)
	{
		const double D = FVector::Dist2D(It->GetActorLocation(), GetActorLocation());
		if (D < BestD) { BestD = D; Best = *It; }
	}
	if (!Best) return false;
	MountedOn = Best;
	Best->Rider = this;
	GetCharacterMovement()->DisableMovement();
	SetActorEnableCollision(false);
	MountFrom = GetActorTransform();
	MountT = 0.f;
	LastAnimationGait = INDEX_NONE;
	bLastAnimationJumping = false;
	UpdateMountedAnimation();
	if (PC) PC->Possess(Best);
	return true;
}

void AStridesRider::Dismount(APlayerController* PC)
{
	AStridesHorse* H = MountedOn;
	if (!H || H->IsJumping()) return;
	if (H->Course) H->Course->RiderDismounted();
	MountedOn = nullptr;
	H->Rider = nullptr;
	H->SpeedMS = 0; H->CadenceMS = 0;
	DetachFromActor(FDetachmentTransformRules::KeepWorldTransform);
	// Côté montoir : gauche du cheval (−Y local Unreal), 0,9 m du flanc, au sol.
	const FVector Left = -H->GetActorRightVector();
	SetActorLocationAndRotation(H->GetActorLocation() + Left * 120.0 + FVector(0, 0, 90), H->GetActorRotation());
	SetActorEnableCollision(true);
	GetCharacterMovement()->SetMovementMode(MOVE_Walking);
	MountT = -1.f;
	LastAnimationGait = INDEX_NONE;
	bLastAnimationJumping = false;
	if (GaitAnimations.IsValidIndex(0) && GaitAnimations[0]) GetMesh()->PlayAnimation(GaitAnimations[0], true);
	if (PC) PC->Possess(this);
}

void AStridesRider::Tick(float Dt)
{
	Super::Tick(Dt);
	if (!MountedOn) return;
	UpdateMountedAnimation();
	FTransform Seat = MountedOn->SeatTransform();
	// La forme du cavalier est déjà en pose montée. Une inclinaison globale
	// légère accompagne la vitesse ; au saut elle avance le buste avec le cheval.
	const float LeanDeg = MountedOn->IsJumping() ? -14.f : FMath::GetMappedRangeValueClamped(FVector2D(5.f, 8.f), FVector2D(0.f, -5.f), MountedOn->SpeedMS);
	Seat.ConcatenateRotation(FQuat(FRotator(LeanDeg, 0.f, 0.f)));
	if (MountedOn->IsJumping()) Seat.AddToTranslation(MountedOn->GetActorForwardVector() * 8.f + FVector(0, 0, 4.f));
	if (MountT >= 0.f && MountT < 0.8f)
	{
		MountT += Dt;
		const float K = FMath::SmoothStep(0.f, 1.f, FMath::Min(1.f, MountT / 0.8f));
		FTransform T;
		T.Blend(MountFrom, Seat, K);
		SetActorTransform(T);
	}
	else SetActorTransform(Seat);
}
