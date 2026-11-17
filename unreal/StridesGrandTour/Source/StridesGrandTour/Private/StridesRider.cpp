#include "StridesRider.h"
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
	if (PC) PC->Possess(this);
}

void AStridesRider::Tick(float Dt)
{
	Super::Tick(Dt);
	if (!MountedOn) return;
	const FTransform Seat = MountedOn->SeatTransform();
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
