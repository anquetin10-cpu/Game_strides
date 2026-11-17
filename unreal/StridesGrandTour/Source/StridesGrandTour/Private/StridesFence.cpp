#include "StridesFence.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "StridesUnits.h"
#include "UObject/ConstructorHelpers.h"

static UStaticMesh* BasicMesh(const TCHAR* Path)
{
	return LoadObject<UStaticMesh>(nullptr, Path);
}

AStridesFence::AStridesFence()
{
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
}

void AStridesFence::Setup(const FString& InLabel, const FString& Kind, float InHeightM, float SpreadM, double WebX, double WebZ, double RotRad, int32 InNum)
{
	Label = InLabel;
	Num = InNum;
	HeightM = InHeightM;
	// Repère de l'obstacle (obstacles.js) : n = (sin rot, cos rot) axe de saut, t = (cos rot, −sin rot) le long des barres.
	Core.pos = {WebX, WebZ};
	Core.n = {FMath::Sin(RotRad), FMath::Cos(RotRad)};
	Core.t = {FMath::Cos(RotRad), -FMath::Sin(RotRad)};
	Core.kind = TCHAR_TO_UTF8(*Kind);
	Core.bars.clear();
	if (Kind == TEXT("o")) { Core.bars.push_back({-SpreadM / 2.0, HeightM - 0.05}); Core.bars.push_back({SpreadM / 2.0, HeightM}); }
	else Core.bars.push_back({0.0, HeightM});
	SetActorLocation(StridesUnits::WebToUE(WebX, 0, WebZ));
	SetActorRotation(FRotator(0, StridesUnits::HeadingToYawDeg(RotRad), 0));
	UStaticMesh* Cyl = BasicMesh(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	UStaticMesh* Cube = BasicMesh(TEXT("/Engine/BasicShapes/Cube.Cube"));
	const float Width = 3.8f;  // m (parcours du Pôle, obstacles.js)
	for (const strides::Bar& B : Core.bars)
	{
		UStaticMeshComponent* Bar = NewObject<UStaticMeshComponent>(this);
		Bar->SetupAttachment(Root);
		Bar->RegisterComponent();
		if (Kind == TEXT("w"))
		{
			// Mur : bloc plein jusqu'à la hauteur (cube 1 m de base Unreal = 100 cm).
			Bar->SetStaticMesh(Cube);
			Bar->SetRelativeLocation(FVector(B.s * 100.0, 0, B.h * 50.0));
			Bar->SetRelativeScale3D(FVector(0.4, Width, B.h));
		}
		else
		{
			// Barre de 10 cm de diamètre posée sur ses taquets (cylindre de base : 100 cm de haut, 100 cm de diamètre).
			Bar->SetStaticMesh(Cyl);
			Bar->SetRelativeLocation(FVector(B.s * 100.0, 0, B.h * 100.0));
			Bar->SetRelativeRotation(FRotator(0, 0, 90));
			Bar->SetRelativeScale3D(FVector(0.1, 0.1, Width));
		}
		Bar->SetCollisionProfileName(TEXT("StridesFence"));
		Bars.Add(Bar);
	}
	// Chandeliers (montants) aux deux bouts.
	for (const float Side : {-1.f, 1.f})
	{
		UStaticMeshComponent* Post = NewObject<UStaticMeshComponent>(this);
		Post->SetupAttachment(Root);
		Post->RegisterComponent();
		Post->SetStaticMesh(Cube);
		Post->SetRelativeLocation(FVector(0, Side * (Width * 50.0 + 10.0), (HeightM + 0.3) * 50.0));
		Post->SetRelativeScale3D(FVector(0.12 + SpreadM, 0.12, HeightM + 0.3));
		Post->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	}
}

void AStridesFence::KnockTopBar()
{
	if (Bars.Num() == 0) return;
	UStaticMeshComponent* Top = Bars.Last();
	Top->SetRelativeLocation(FVector(Top->GetRelativeLocation().X + 40.0, 0, 6.0));
}
