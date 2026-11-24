#include "StridesRider.h"
#include "Animation/AnimationAsset.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/PoseableMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "EngineUtils.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "StridesCourse.h"
#include "StridesHorse.h"
#include "StridesHorseTack.h"
#include "StridesRiderRig.h"

AStridesRider::AStridesRider()
{
	PrimaryActorTick.bCanEverTick = true;
	GetCapsuleComponent()->InitCapsuleSize(25.f, 84.f);  // 1,68 m (cavalière du jeu web)
	Body = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Body"));
	Body->SetupAttachment(GetCapsuleComponent());
	Body->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cylinder.Cylinder")));
	Body->SetRelativeScale3D(FVector(0.45, 0.3, 1.68));
	Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	// Maillages et clips issus d'un même GLB Blender (scripts/unreal/export-rider-animations.py puis
	// import-rider-animations.py) : une seule convention d'os, Root à l'échelle 1, bassin à 88 cm.
	const FString RiderRoot = TEXT("/Game/Characters/Riders/Female/rider_f_animated/rider_f_animated/SkeletalMeshes/");
	USkeletalMeshComponent* MainMesh = GetMesh();
	if (USkeletalMesh* RiderBody = LoadObject<USkeletalMesh>(nullptr, *(RiderRoot + TEXT("Body.Body"))))
	{
		MainMesh->SetSkeletalMesh(RiderBody);
		MainMesh->SetRelativeLocation(FVector(0, 0, -84));
		// Le GLB regarde vers +Y une fois importé ; l'acteur avance selon +X.
		MainMesh->SetRelativeRotation(FRotator(0, -90, 0));
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
	const FString AnimRoot = RiderRoot + TEXT("Rider_");
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
	// Essai de monte (voie A, étape 6) : cavalière montée par les règles du web, seulement avec -StridesRider=regles.
	FString RiderOption;
	if (FParse::Value(FCommandLine::Get(), TEXT("StridesRider="), RiderOption) && RiderOption == TEXT("regles"))
	{
		FString Err;
		if (!EnableRulesRig(&Err)) UE_LOG(LogTemp, Warning, TEXT("StridesRider=regles : règles de monte indisponibles (%s)"), *Err);
	}
}

bool AStridesRider::EnableRulesRig(FString* Err)
{
	if (Rules) return Rules->IsReady();
	USkeletalMeshComponent* Main = GetMesh();
	USkeletalMesh* Asset = Main ? Main->GetSkeletalMeshAsset() : nullptr;
	if (!Asset)
	{
		if (Err) *Err = TEXT("maillage de la cavalière absent");
		return false;
	}
	RulesBody = NewObject<UPoseableMeshComponent>(this, TEXT("RulesBody"));
	RulesBody->SetupAttachment(GetCapsuleComponent());
	RulesBody->SetSkinnedAssetAndUpdate(Asset);
	RulesBody->SetRelativeTransform(Main->GetRelativeTransform());
	RulesBody->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	RulesBody->SetVisibility(false);
	RulesBody->RegisterComponent();
	Rules = NewObject<UStridesRiderRig>(this, TEXT("RulesRig"));
	Rules->RegisterComponent();
	return Rules->Init(RulesBody, Err);
}

bool AStridesRider::RulesReady() const
{
	const UStridesHorseTack* Tack = MountedOn ? MountedOn->HorseTack() : nullptr;
	return Rules && Rules->IsReady() && Tack && Tack->IsReady();
}

// En selle avec la règle : clips cuits coupés, maillage posé visible et meneur des vêtements ; à pied : l'inverse.
void AStridesRider::SetRulesActive(bool bOn)
{
	if (bOn == bRulesActive || !RulesBody) return;
	bRulesActive = bOn;
	USkeletalMeshComponent* Main = GetMesh();
	UStridesHorseTack* Tack = MountedOn ? MountedOn->HorseTack() : nullptr;
	if (bOn)
	{
		Rules->ResetRide();
		Main->Stop();
		Main->SetVisibility(false);
		RulesBody->SetRelativeTransform(Rules->MeshInSeat());
		RulesBody->SetVisibility(true);
		// Vêtements rattachés au maillage posé : un suiveur lit les os du meneur dans SON propre repère de composant.
		// Bornes : un suiveur d'un UPoseableMeshComponent garde les bornes de SA pose de référence (cavalière debout) ; la
		// queue de cheval, les yeux, les sourcils et les cils, petits et placés à la tête, ont alors leurs bornes 75 à 100 cm
		// au-dessus de la tête assise et le rendu les écarte (hors du champ). Ils prennent les bornes du maillage posé
		// (mesuré par Strides.Monte.EnJeu).
		for (USkeletalMeshComponent* Part : MeshParts)
		{
			Part->AttachToComponent(RulesBody, FAttachmentTransformRules::SnapToTargetNotIncludingScale);
			Part->SetLeaderPoseComponent(RulesBody, true);
			Part->bUseBoundsFromLeaderPoseComponent = true;
			Part->InvalidateCachedBounds();
			Part->UpdateBounds();
			Part->MarkRenderTransformDirty();
		}
		// Après le cheval (déplacement de l'acteur) et sa sellerie (siège S de l'image) : sinon la cavalière est posée sur le
		// siège de l'image précédente (constaté au galop : 7 cm de retard). La sellerie tique en TG_PostUpdateWork (après
		// l'animation du cheval) : le moteur repousse donc le tick de la cavalière dans ce groupe. En fin d'image, l'acteur
		// est sur le siège de l'image (écart nul, Strides.Monte.EnJeu) ; un relevé fait plus tôt dans l'image (tick d'un
		// autre acteur en TG_PrePhysics, comme AStridesShots) voit encore la cavalière de l'image précédente.
		if (Tack) AddTickPrerequisiteComponent(Tack);
		if (MountedOn) AddTickPrerequisiteActor(MountedOn);
	}
	else
	{
		for (USkeletalMeshComponent* Part : MeshParts)
		{
			Part->AttachToComponent(Main, FAttachmentTransformRules::SnapToTargetNotIncludingScale);
			Part->SetLeaderPoseComponent(Main, true);
			Part->bUseBoundsFromLeaderPoseComponent = false;  // comme le jeu par défaut
			Part->InvalidateCachedBounds();
			Part->UpdateBounds();
			Part->MarkRenderTransformDirty();
		}
		RulesBody->SetVisibility(false);
		Main->SetVisibility(true);
		if (Tack) RemoveTickPrerequisiteComponent(Tack);
		if (MountedOn) RemoveTickPrerequisiteActor(MountedOn);
	}
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
	if (RulesReady()) SetRulesActive(true);
	else UpdateMountedAnimation();
	if (PC) PC->Possess(Best);
	return true;
}

void AStridesRider::Dismount(APlayerController* PC)
{
	AStridesHorse* H = MountedOn;
	if (!H || H->IsJumping()) return;
	SetRulesActive(false);
	// Plus d'appel au parcours : l'épreuve lit à chaque image si le cavalier est en selle (AStridesHorse::RunFrame) et
	// élimine à tout moment du parcours, avant le départ compris (courses.js:329).
	MountedOn = nullptr;
	H->Rider = nullptr;
	H->Halt();
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
	if (bRulesActive)
	{
		// Règles de monte : pose de la règle à chaque image, cavalière posée au siège S de la sellerie (sans inclinaison
		// globale : le buste suit la règle).
		Rules->StepFromHorse(MountedOn, Dt);
		const FTransform RulesSeat = MountedOn->HorseTack()->SeatWorld();
		if (MountT >= 0.f && MountT < 0.8f)
		{
			MountT += Dt;
			FTransform T;
			T.Blend(MountFrom, RulesSeat, FMath::SmoothStep(0.f, 1.f, FMath::Min(1.f, MountT / 0.8f)));
			SetActorTransform(T);
		}
		else SetActorTransform(RulesSeat);
		// Bornes des suiveurs reprises au maillage posé à chaque image : un UPoseableMeshComponent ne les rafraîchit pas (le
		// cache des bornes locales d'un suiveur n'est invalidé que par un meneur USkeletalMeshComponent).
		for (USkeletalMeshComponent* Part : MeshParts)
		{
			Part->InvalidateCachedBounds();
			Part->UpdateBounds();
			Part->MarkRenderTransformDirty();
		}
		return;
	}
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
