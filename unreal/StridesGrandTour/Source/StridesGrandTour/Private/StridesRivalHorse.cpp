#include "StridesRivalHorse.h"
#include "Animation/AnimationAsset.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "StridesUnits.h"

AStridesRivalHorse::AStridesRivalHorse()
{
	PrimaryActorTick.bCanEverTick = false;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	const FString HorseRoot = TEXT("/Game/Characters/Horse/horse_pjl_normalized/horse_pjl_normalized/SkeletalMeshes/");
	HorseMesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("HorseMesh"));
	HorseMesh->SetupAttachment(Root);
	HorseMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	if (USkeletalMesh* M = LoadObject<USkeletalMesh>(nullptr, *(HorseRoot + TEXT("Object_426.Object_426"))))
	{
		HorseMesh->SetSkeletalMesh(M);
		HorseMesh->SetRelativeScale3D(FVector(0.01f));  // AStridesHorse::GameMeshScale
	}
	for (const TCHAR* N : {TEXT("idle"), TEXT("walk"), TEXT("trot"), TEXT("canter"), TEXT("gallop")})
		HorseGaits.Add(LoadObject<UAnimationAsset>(nullptr, *(HorseRoot + TEXT("Horse_") + N + TEXT(".Horse_") + N)));
	const FString RiderRoot = TEXT("/Game/Characters/Riders/Female/rider_f_animated/rider_f_animated/SkeletalMeshes/");
	RiderMesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("RiderMesh"));
	RiderMesh->SetupAttachment(Root);
	RiderMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	if (USkeletalMesh* R = LoadObject<USkeletalMesh>(nullptr, *(RiderRoot + TEXT("Body.Body"))))
	{
		RiderMesh->SetSkeletalMesh(R);
		// Assise au dos du cheval (os de selle à ~173 cm, cavalière au bassin à 88 cm : voir AStridesRider).
		RiderMesh->SetRelativeLocation(FVector(0, 0, 173 - 84));
		RiderMesh->SetRelativeRotation(FRotator(0, -90, 0));
	}
	for (const TCHAR* N : {TEXT("idle"), TEXT("walk"), TEXT("trot"), TEXT("canter"), TEXT("gallop")})
		RiderGaits.Add(LoadObject<UAnimationAsset>(nullptr, *(RiderRoot + TEXT("Rider_") + N + TEXT(".Rider_") + N)));
	// Casaque : dossard coloré sur le dos du jockey (couleurs de raceSteps).
	Silk = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Silk"));
	Silk->SetupAttachment(Root);
	Silk->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube")));
	Silk->SetRelativeLocation(FVector(-5, 0, 173 + 45));
	Silk->SetRelativeScale3D(FVector(0.26, 0.4, 0.5));
	Silk->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Silk->SetCastShadow(false);
}

void AStridesRivalHorse::Init(const FString& Name, const FString& SilkHex)
{
	RivalName = Name;
	if (UMaterialInterface* Base = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial")))
	{
		UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(Base, this);
		M->SetVectorParameterValue(TEXT("Color"), FLinearColor::FromSRGBColor(FColor::FromHex(SilkHex)));
		Silk->SetMaterial(0, M);
	}
}

void AStridesRivalHorse::Apply(double WebX, double WebZ, double Heading, double SpeedMS, double Ground)
{
	SetActorLocationAndRotation(StridesUnits::WebToUE(WebX, Ground, WebZ), FRotator(0, StridesUnits::HeadingToYawDeg(Heading), 0));
	// Seuils d'allure du cheval du joueur (AStridesHorse::TickCso).
	const int32 G = SpeedMS < 0.2 ? 0 : SpeedMS < 3.2 ? 1 : SpeedMS < 5.5 ? 2 : SpeedMS < 7.0 ? 3 : 4;
	if (G != LastGait)
	{
		LastGait = G;
		if (HorseGaits.IsValidIndex(G) && HorseGaits[G]) HorseMesh->PlayAnimation(HorseGaits[G], true);
		if (RiderGaits.IsValidIndex(G) && RiderGaits[G]) RiderMesh->PlayAnimation(RiderGaits[G], true);
	}
}
