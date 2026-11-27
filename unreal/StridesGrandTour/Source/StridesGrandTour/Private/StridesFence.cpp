#include "StridesFence.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "StridesCsoScenery.h"
#include "StridesDataSubsystem.h"
#include "StridesUnits.h"
#include "Engine/GameInstance.h"

static UStaticMesh* BasicMesh(const TCHAR* Path)
{
	return LoadObject<UStaticMesh>(nullptr, Path);
}

AStridesFence::AStridesFence()
{
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
}

void AStridesFence::Setup(const FString& InLabel, const FString& InKind, double InHeightM, double SpreadM, double InWebX, double InWebZ, double RotRad, int32 InNum, double WidthM)
{
	Label = InLabel;
	Num = InNum;
	Kind = InKind;
	Spread = SpreadM;
	WebX = InWebX;
	WebZ = InWebZ;
	Rot = RotRad;
	Width = WidthM;
	// Pied de l'obstacle sur le sol de la carrière (relief exporté du jeu web ; 0 sans relief).
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	SetActorLocation(StridesUnits::WebToUE(WebX, Data ? Data->TerrainHeight(WebX, WebZ) : 0.0, WebZ));
	SetActorRotation(FRotator(0, StridesUnits::HeadingToYawDeg(Rot), 0));
	SetHeight(InHeightM);
}

void AStridesFence::SetHeight(double H)
{
	Height = H;
	HeightM = H;
	// Obstacle du cœur (obstacles.js add / _bars / faces) : repère n = (sin rot, cos rot) axe de saut, t = (cos rot,
	// −sin rot) le long des barres ; barres, faces avant / arrière (refus), largeur (visée entre les chandeliers).
	Obstacle = strides::makeCsoObstacle(TCHAR_TO_UTF8(*Kind), WebX, WebZ, Rot, H, Width, Spread, TCHAR_TO_UTF8(*Label), Num, TCHAR_TO_UTF8(*Course));
	Core = Obstacle.fence();
	ClearVisuals();
	if (!BuildExported()) BuildBasicShapes();
	SetHighlighted(bHighlighted);
}

void AStridesFence::ClearVisuals()
{
	for (UStaticMeshComponent* C : Pieces)
		if (C) C->DestroyComponent();
	for (UStaticMeshComponent* C : Bars)
		if (C && !Pieces.Contains(C)) C->DestroyComponent();
	Pieces.Reset();
	Bars.Reset();
	SignMaterial = nullptr;
	bExported = false;
}

bool AStridesFence::BuildExported()
{
	// Pièces construites par le jeu web à cette hauteur (manifeste cso_fences.json : numéro, libellé, hauteur).
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	if (!Data || !Data->CsoScenery().IsLoaded()) return false;
	const FStridesCsoScenery& S = Data->CsoScenery();
	// Paddock (jalon J2c) : obstacle de la course « warmup » par son rang ; parcours : par son numéro.
	const FStridesCsoFenceData* F = Course == TEXT("warmup") ? (S.Warmup.IsValidIndex(CourseIndex) ? &S.Warmup[CourseIndex] : nullptr) : S.Fence(Num);
	const FStridesCsoLook* Look = F && F->Label == Label && F->Kind == Kind ? F->LookAt(Height) : nullptr;
	if (!Look) return false;
	// Barres du haut : une par barre du cœur (même rang que ob.rails), posées à la position de repos du cœur.
	const std::vector<strides::CsoFenceState> Rest = strides::csoFenceStates({Obstacle});
	int32 RailPieces = 0;
	for (const FStridesCsoPiece& P : Look->Pieces) RailPieces += P.Rail >= 0;
	if (RailPieces != (int32)Rest[0].rails.size()) return false;
	Bars.SetNum(RailPieces);
	for (const FStridesCsoPiece& P : Look->Pieces)
	{
		UStaticMesh* M = S.LoadMesh(P.Mesh);
		if (!M) { ClearVisuals(); return false; }
		UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(this);
		C->SetupAttachment(Root);
		C->SetStaticMesh(M);
		C->ComponentTags.Add(FName(*P.Cat));
		C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		C->RegisterComponent();
		if (P.Rail >= 0 && P.Rail < RailPieces)
		{
			const strides::CsoRail& R = Rest[0].rails[P.Rail];
			C->SetRelativeTransform(RailMeshTransform(R.y, R.z, R.rx, R.rz));
			C->SetCollisionProfileName(TEXT("StridesFence"));
			Bars[P.Rail] = C;
		}
		else C->SetRelativeTransform(FStridesCsoScenery::PieceRelative(P));
		if (!P.Tex.IsEmpty())
		{
			// Panneau numéro : matériau sans éclairage de sa texture, teinte changée au surlignage.
			SignMaterial = UMaterialInstanceDynamic::Create(S.SignMaterial(P, TEXT("fr")), this);
			C->SetMaterial(0, SignMaterial);
		}
		Pieces.Add(C);
	}
	bExported = true;
	return true;
}

void AStridesFence::BuildBasicShapes()
{
	UStaticMesh* Cyl = BasicMesh(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	UStaticMesh* Cube = BasicMesh(TEXT("/Engine/BasicShapes/Cube.Cube"));
	if (Kind == TEXT("w"))
	{
		// Mur : bloc fixe (obstacles.js : box(w, h − 0,15, 0,5)) ; la barre posée dessus est la seule qui tombe.
		UStaticMeshComponent* Block = NewObject<UStaticMeshComponent>(this);
		Block->SetupAttachment(Root);
		Block->RegisterComponent();
		Block->SetStaticMesh(Cube);
		Block->SetRelativeLocation(FVector(0, 0, (Height - 0.15) * 50.0));
		Block->SetRelativeScale3D(FVector(0.5, Width, Height - 0.15));
		Block->SetCollisionProfileName(TEXT("StridesFence"));
		Pieces.Add(Block);
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
		Bar->SetRelativeTransform(RailDisplayTransform(R.y, R.z, R.rx, R.rz));
		Bar->SetCollisionProfileName(TEXT("StridesFence"));
		Bars.Add(Bar);
		Pieces.Add(Bar);
	}
	// Chandeliers (montants) aux deux bouts.
	for (const float Side : {-1.f, 1.f})
	{
		UStaticMeshComponent* Post = NewObject<UStaticMeshComponent>(this);
		Post->SetupAttachment(Root);
		Post->RegisterComponent();
		Post->SetStaticMesh(Cube);
		Post->SetRelativeLocation(FVector(0, Side * (Width * 50.0 + 10.0), (Height + 0.3) * 50.0));
		Post->SetRelativeScale3D(FVector(0.12 + Obstacle.spread, 0.12, Height + 0.3));
		Post->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Pieces.Add(Post);
	}
}

static FQuat RailRotation(double Rx, double Rz)
{
	// Rotation web locale (Three.js, ordre XYZ) : M = Rx(rx) · Rz(rz). Repère local Unreal de l'acteur : X = z web (axe de
	// saut), Y = −x web (le long des barres), Z = y web (StridesUnits) : M_ue = P · M · Pᵀ, image de chaque axe Unreal.
	const double Cx = FMath::Cos(Rx), Sx = FMath::Sin(Rx), Cz = FMath::Cos(Rz), Sz = FMath::Sin(Rz);
	const double M[3][3] = {{Cz, -Sz, 0}, {Cx * Sz, Cx * Cz, -Sx}, {Sx * Sz, Sx * Cz, Cx}};
	auto P = [](double Wx, double Wy, double Wz) { return FVector(Wz, -Wx, Wy); };
	const FVector XAxis = P(M[0][2], M[1][2], M[2][2]);     // Pᵀ eX = ez web
	const FVector YAxis = P(-M[0][0], -M[1][0], -M[2][0]);  // Pᵀ eY = −ex web
	const FVector ZAxis = P(M[0][1], M[1][1], M[2][1]);     // Pᵀ eZ = ey web
	return FQuat(FMatrix(XAxis, YAxis, ZAxis, FVector::ZeroVector));
}

FTransform AStridesFence::RailTransform(double Y, double Z, double Rx, double Rz)
{
	// Cylindre de base (axe Z du maillage) couché le long des barres.
	const FQuat Lying = FRotator(0, 0, 90).Quaternion();
	return FTransform(RailRotation(Rx, Rz) * Lying, FVector(Z * StridesUnits::CmPerM, 0, Y * StridesUnits::CmPerM));
}

FTransform AStridesFence::RailMeshTransform(double Y, double Z, double Rx, double Rz)
{
	// Maillage exporté (import Interchange : x, y, z web → X, Z, Y) : un lacet de −90° amène l'axe x web de la barre sur
	// l'axe −Y de l'acteur (= x web local), comme FStridesCsoScenery::PieceRelative.
	const FQuat Base = FRotator(0, -90, 0).Quaternion();
	return FTransform(RailRotation(Rx, Rz) * Base, FVector(Z * StridesUnits::CmPerM, 0, Y * StridesUnits::CmPerM));
}

FTransform AStridesFence::RailDisplayTransform(double Y, double Z, double Rx, double Rz) const
{
	if (bExported) return RailMeshTransform(Y, Z, Rx, Rz);
	FTransform T = RailTransform(Y, Z, Rx, Rz);
	T.SetScale3D(FVector(0.1, 0.1, Obstacle.w));
	return T;
}

void AStridesFence::ApplyRails(const strides::CsoFenceState& State)
{
	for (int32 K = 0; K < Bars.Num() && K < (int32)State.rails.size(); K++)
	{
		const strides::CsoRail& R = State.rails[K];
		if (Bars[K]) Bars[K]->SetRelativeTransform(RailDisplayTransform(R.y, R.z, R.rx, R.rz));
	}
}

void AStridesFence::SetHighlighted(bool bOn)
{
	bHighlighted = bOn;
	if (!SignMaterial) return;
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	if (!Data) return;
	SignMaterial->SetVectorParameterValue(TEXT("Tint"), bOn ? Data->CsoScenery().HighlightOn : Data->CsoScenery().HighlightOff);
}

FLinearColor AStridesFence::SignTint() const
{
	FLinearColor C = FLinearColor::White;
	if (SignMaterial) SignMaterial->GetVectorParameterValue(FHashedMaterialParameterInfo(TEXT("Tint")), C);
	return C;
}
