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
	if (Kind == TEXT("w"))
	{
		// Mur : bloc fixe (obstacles.js : box(w, h − 0,15, 0,5)) ; la barre posée dessus est la seule qui tombe.
		UStaticMeshComponent* Block = NewObject<UStaticMeshComponent>(this);
		Block->SetupAttachment(Root);
		Block->RegisterComponent();
		Block->SetStaticMesh(Cube);
		Block->SetRelativeLocation(FVector(0, 0, (InHeightM - 0.15) * 50.0));
		Block->SetRelativeScale3D(FVector(0.5, Width, InHeightM - 0.15));
		Block->SetCollisionProfileName(TEXT("StridesFence"));
	}
	// Barres du haut (celles qui tombent) : état de repos du cœur (obstacles.js _mesh), une composante par barre.
	const std::vector<strides::CsoFenceState> Rest = strides::csoFenceStates({Obstacle});
	for (const strides::CsoRail& R : Rest[0].rails)
	{
		// Barre de 10 cm de diamètre posée sur ses taquets (cylindre de base : 100 cm de haut, 100 cm de diamètre).
		UStaticMeshComponent* Bar = NewObject<UStaticMeshComponent>(this);
		Bar->SetupAttachment(Root);
		Bar->RegisterComponent();
		Bar->SetStaticMesh(Cyl);
		FTransform T = RailTransform(R.y, R.z, R.rx, R.rz);
		T.SetScale3D(FVector(0.1, 0.1, Width));
		Bar->SetRelativeTransform(T);
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

FTransform AStridesFence::RailTransform(double Y, double Z, double Rx, double Rz)
{
	// Rotation web locale (Three.js, ordre XYZ) : M = Rx(rx) · Rz(rz). Repère local Unreal de l'acteur : X = z web (axe de
	// saut), Y = −x web (le long des barres), Z = y web (StridesUnits) : M_ue = P · M · Pᵀ, image de chaque axe Unreal.
	const double Cx = FMath::Cos(Rx), Sx = FMath::Sin(Rx), Cz = FMath::Cos(Rz), Sz = FMath::Sin(Rz);
	const double M[3][3] = {{Cz, -Sz, 0}, {Cx * Sz, Cx * Cz, -Sx}, {Sx * Sz, Sx * Cz, Cx}};
	auto P = [](double Wx, double Wy, double Wz) { return FVector(Wz, -Wx, Wy); };
	const FVector XAxis = P(M[0][2], M[1][2], M[2][2]);     // Pᵀ eX = ez web
	const FVector YAxis = P(-M[0][0], -M[1][0], -M[2][0]);  // Pᵀ eY = −ex web
	const FVector ZAxis = P(M[0][1], M[1][1], M[2][1]);     // Pᵀ eZ = ey web
	const FQuat Q(FMatrix(XAxis, YAxis, ZAxis, FVector::ZeroVector));
	// Cylindre de base (axe Z du maillage) couché le long des barres.
	const FQuat Lying = FRotator(0, 0, 90).Quaternion();
	return FTransform(Q * Lying, FVector(Z * StridesUnits::CmPerM, 0, Y * StridesUnits::CmPerM));
}

void AStridesFence::ApplyRails(const strides::CsoFenceState& State)
{
	const double Width = Obstacle.w;
	for (int32 K = 0; K < Bars.Num() && K < (int32)State.rails.size(); K++)
	{
		const strides::CsoRail& R = State.rails[K];
		FTransform T = RailTransform(R.y, R.z, R.rx, R.rz);
		T.SetScale3D(FVector(0.1, 0.1, Width));
		Bars[K]->SetRelativeTransform(T);
	}
}
