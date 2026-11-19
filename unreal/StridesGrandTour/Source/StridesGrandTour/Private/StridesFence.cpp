#include "StridesFence.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "StridesDataSubsystem.h"
#include "StridesUnits.h"
#include "Engine/GameInstance.h"
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

void AStridesFence::Setup(const FString& InLabel, const FString& Kind, double InHeightM, double SpreadM, double WebX, double WebZ, double RotRad, int32 InNum, double WidthM)
{
	Label = InLabel;
	Num = InNum;
	HeightM = InHeightM;
	// Obstacle du cœur (obstacles.js add / _bars / faces) : repère n = (sin rot, cos rot) axe de saut, t = (cos rot,
	// −sin rot) le long des barres ; barres, faces avant / arrière (refus), largeur (visée entre les chandeliers).
	Obstacle = strides::makeCsoObstacle(TCHAR_TO_UTF8(*Kind), WebX, WebZ, RotRad, InHeightM, WidthM, SpreadM, TCHAR_TO_UTF8(*InLabel), InNum, "cso");
	Core = Obstacle.fence();
	// Pied de l'obstacle sur le sol de la carrière (relief exporté du jeu web ; 0 sans relief).
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	SetActorLocation(StridesUnits::WebToUE(WebX, Data ? Data->TerrainHeight(WebX, WebZ) : 0.0, WebZ));
	SetActorRotation(FRotator(0, StridesUnits::HeadingToYawDeg(RotRad), 0));
	UStaticMesh* Cyl = BasicMesh(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	UStaticMesh* Cube = BasicMesh(TEXT("/Engine/BasicShapes/Cube.Cube"));
	const double Width = Obstacle.w;  // m (cso_horse.json : largeur des obstacles du parcours, obstacles.js)
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
		Post->SetRelativeScale3D(FVector(0.12 + Obstacle.spread, 0.12, HeightM + 0.3));
		Post->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	}
}

void AStridesFence::KnockTopBar()
{
	if (Bars.Num() == 0) return;
	UStaticMeshComponent* Top = Bars.Last();
	Top->SetRelativeLocation(FVector(Top->GetRelativeLocation().X + 40.0, 0, 6.0));
}
