#include "StridesAmbientLife.h"

#include "Camera/PlayerCameraManager.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "EngineUtils.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesPlayerController.h"
#include "StridesUnits.h"

namespace
{
FLinearColor Hex(const std::string& H, const FLinearColor& Fallback = FLinearColor(.5f, .5f, .5f))
{
	if (H.size() < 7 || H[0] != '#') return Fallback;
	return FLinearColor::FromSRGBColor(FColor::FromHex(UTF8_TO_TCHAR(H.c_str())));
}
}

AStridesAmbientLife::AStridesAmbientLife()
{
	PrimaryActorTick.bCanEverTick = true;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
}

UStaticMeshComponent* AStridesAmbientLife::MakePart(USceneComponent* Parent, UStaticMesh* Mesh, const FVector& Loc, const FVector& Size, const FLinearColor& Color, const FRotator& Rot)
{
	UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(this);
	C->SetStaticMesh(Mesh);
	C->SetMobility(EComponentMobility::Movable);
	C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	C->SetupAttachment(Parent);
	C->SetRelativeLocation(Loc);
	C->SetRelativeRotation(Rot);
	// Formes de base d'Unreal : cube et cylindre de 100 cm, sphère de 100 cm de diamètre.
	C->SetRelativeScale3D(Size / 100.0);
	if (BaseMaterial)
	{
		UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(BaseMaterial, this);
		M->SetVectorParameterValue(TEXT("Color"), Color);
		C->SetMaterial(0, M);
	}
	C->RegisterComponent();
	return C;
}

USceneComponent* AStridesAmbientLife::MakeFigure(const strides::LifeOutfit& O, const FString& Name)
{
	USceneComponent* Root = NewObject<USceneComponent>(this, *Name);
	Root->SetMobility(EComponentMobility::Movable);
	Root->SetupAttachment(RootComponent);
	Root->RegisterComponent();
	const FLinearColor Pants = Hex(O.pants, FLinearColor(.15f, .17f, .22f)), Top = Hex(O.top, FLinearColor(.4f, .4f, .45f));
	const FLinearColor Skin = Hex(O.skin, FLinearColor(.8f, .62f, .5f)), Hair = Hex(O.hair, FLinearColor(.2f, .14f, .1f));
	// 1,70 m : jambes (ou robe) jusqu'à 0,85 m, buste jusqu'à 1,45 m, tête de 22 cm, cheveux ou casquette.
	MakePart(Root, Cylinder, FVector(0, 0, 42.5), FVector(30, 34, 85), O.dress ? Top : Pants);
	MakePart(Root, Cylinder, FVector(0, 0, 115), FVector(30, 42, 60), Top);
	// Tête et cheveux en cylindres courts : la sphère de base (≈ 1 500 triangles) coûtait 96 000 triangles pour 64 têtes
	// (relevé de Strides.World.AmbientLife, budget iPhone).
	MakePart(Root, Cylinder, FVector(0, 0, 156), FVector(21, 21, 22), Skin);
	MakePart(Root, Cylinder, FVector(-2, 0, 166), FVector(23, 23, 8), O.cap.empty() ? Hair : Hex(O.cap));
	return Root;
}

bool AStridesAmbientLife::Build(const UStridesDataSubsystem& Data)
{
	const strides::AmbientData* A = Data.Ambient();
	if (!A) return false;
	DataRef = &Data;
	BaseMaterial = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	Cube = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
	Cylinder = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	Sphere = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	// Graine de la suite de Math.random des passants : celle de l'oracle « circulation libre » (2026) ; le web tire au
	// hasard du navigateur (aucune graine), toute graine fixe est donc aussi juste.
	Sim.init(*A, 2026);
	for (int32 I = 0; I < (int32)Sim.cars.size(); ++I)
	{
		const strides::TrafficCar& C = Sim.cars[I];
		const auto M = A->carModels.find(C.kind);
		const strides::LifeCarModel Spec = M != A->carModels.end() ? M->second : strides::LifeCarModel();
		USceneComponent* Root = NewObject<USceneComponent>(this, *FString::Printf(TEXT("Voiture_%d"), I));
		Root->SetMobility(EComponentMobility::Movable);
		Root->SetupAttachment(RootComponent);
		Root->RegisterComponent();
		const FLinearColor Paint = Hex(C.color);
		const double L = Spec.L * 100, W = Spec.W * 100, R = Spec.r * 100;
		// Caisse (du bas de caisse à la ceinture), habitacle vitré en retrait, 4 roues aux essieux (empattement du web).
		MakePart(Root, Cube, FVector(0, 0, R + 30), FVector(L, W, 62), Paint);
		MakePart(Root, Cube, FVector(-L * .08, 0, R + 85), FVector(L * .55, W * .9, 48), FLinearColor(.06f, .09f, .11f));
		for (int32 K = 0; K < 4; ++K)
		{
			const double X = (K < 2 ? 1 : -1) * Spec.wb * 50, Y = (K % 2 ? 1 : -1) * (W * .5 - 12);
			CarWheels.Add(MakePart(Root, Cylinder, FVector(X, Y, R), FVector(2 * R, 2 * R, 22), FLinearColor(.03f, .03f, .035f), FRotator(0, 0, 90)));
		}
		Cars.Add(Root);
	}
	for (int32 I = 0; I < (int32)A->walkers.size(); ++I) Walkers.Add(MakeFigure(A->walkers[I].outfit, FString::Printf(TEXT("Passant_%d"), I)));
	for (int32 I = 0; I < (int32)A->spectators.size(); ++I)
	{
		const strides::LifeSpectator& S = A->spectators[I];
		USceneComponent* F = MakeFigure(S.outfit, FString::Printf(TEXT("Spectateur_%d"), I));
		F->SetWorldLocationAndRotation(StridesUnits::WebToUE(S.x, Data.TerrainHeight(S.x, S.z), S.z), FRotator(0, StridesUnits::HeadingToYawDeg(S.heading), 0));
		Spectators.Add(F);
	}
	Pose();
	UE_LOG(LogTemp, Display, TEXT("Strides vie ambiante : %d voitures, %d passants, %d spectateurs"), Cars.Num(), Walkers.Num(), Spectators.Num());
	return true;
}

void AStridesAmbientLife::GatherInput()
{
	Input = strides::LifeInput();
	APawn* P = UGameplayStatics::GetPlayerPawn(GetWorld(), 0);
	// Monde de test (contrôleur créé sans joueur local) : le pion du contrôleur du jeu.
	if (!P) for (TActorIterator<AStridesPlayerController> It(GetWorld()); It && !P; ++It) P = It->GetPawn();
	double X = 0, Y = 0, Z = 0;
	if (P) StridesUnits::UEToWeb(P->GetActorLocation(), X, Y, Z);
	else X = Z = 1e6;
	Input.player = {X, Z};
	Input.riding = Cast<AStridesHorse>(P) != nullptr;
	for (TActorIterator<AStridesHorse> It(GetWorld()); It; ++It)
	{
		StridesUnits::UEToWeb(It->GetActorLocation(), X, Y, Z);
		Input.horses.push_back({X, Z});
	}
	Input.cam = Input.player;
	if (const APlayerCameraManager* Cam = UGameplayStatics::GetPlayerCameraManager(GetWorld(), 0))
	{
		StridesUnits::UEToWeb(Cam->GetCameraLocation(), X, Y, Z);
		Input.cam = {X, Z};
	}
}

void AStridesAmbientLife::StepWith(double Dt, const strides::LifeInput& In)
{
	Input = In;
	Sim.step(Dt, In);
	Pose();
}

void AStridesAmbientLife::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!DataRef || !DataRef->Ambient()) return;
	// Jeu suspendu (pause, téléphone, carte) : le monde ambiant s'arrête comme la simulation du web (game.update).
	if (DeltaSeconds <= 0) return;
	GatherInput();
	// Pas du web plafonné à 0,05 s (game.js frame : dt = min(0,05, …)).
	Sim.step(FMath::Min<double>(DeltaSeconds, 0.05), Input);
	if (Sim.horns != LastHorns)
	{
		LastHorns = Sim.horns;
		UE_LOG(LogTemp, Display, TEXT("Strides vie ambiante : klaxon (%d)"), LastHorns);
	}
	Pose();
#if !UE_BUILD_SHIPPING
	// Relevé pour les parties jouées par entrées système (journal du jeu) : voiture et passant les plus proches du joueur.
	LogT += DeltaSeconds;
	if (LogT >= 5.f)
	{
		LogT = 0.f;
		double NearCar = 1e9, CarV = 0, Walk = 1e9;
		int32 Shown = 0, Near = 0;
		for (const strides::TrafficCar& C : Sim.cars)
		{
			const double D = FVector2D::Distance(FVector2D(C.x, C.z), FVector2D(Input.player.x, Input.player.z));
			if (D < NearCar) { NearCar = D; CarV = C.speed; }
			Shown += C.visible ? 1 : 0;
		}
		for (const strides::Walker& W : Sim.walkers)
		{
			const double D = FVector2D::Distance(FVector2D(W.x, W.z), FVector2D(Input.player.x, Input.player.z));
			Walk = FMath::Min(Walk, D);
			Near += D < 80 ? 1 : 0;
		}
		UE_LOG(LogTemp, Display, TEXT("Strides vie ambiante : joueur (%.0f ; %.0f), voiture la plus proche %.0f m à %.1f m/s, %d voiture(s) affichée(s), passant le plus proche %.0f m, %d passant(s) à moins de 80 m"),
			Input.player.x, Input.player.z, NearCar, CarV, Shown, Walk, Near);
	}
#endif
}

void AStridesAmbientLife::Pose()
{
	if (!DataRef) return;
	for (int32 I = 0; I < Cars.Num() && I < (int32)Sim.cars.size(); ++I)
	{
		const strides::TrafficCar& C = Sim.cars[I];
		Cars[I]->SetVisibility(C.visible, true);
		if (!C.visible) continue;
		Cars[I]->SetWorldLocationAndRotation(StridesUnits::WebToUE(C.x, DataRef->TerrainHeight(C.x, C.z), C.z), FRotator(0, StridesUnits::HeadingToYawDeg(C.heading), 0));
		for (int32 K = 0; K < 4 && I * 4 + K < CarWheels.Num(); ++K)
			CarWheels[I * 4 + K]->SetRelativeRotation(FRotator(-FMath::RadiansToDegrees(C.spin), 0, 90));
	}
	for (int32 I = 0; I < Walkers.Num() && I < (int32)Sim.walkers.size(); ++I)
	{
		const strides::Walker& W = Sim.walkers[I];
		const bool bNear = FVector2D::Distance(FVector2D(W.x, W.z), FVector2D(Input.cam.x, Input.cam.z)) < 300.0;
		Walkers[I]->SetVisibility(bNear, true);
		if (!bNear) continue;
		Walkers[I]->SetWorldLocationAndRotation(StridesUnits::WebToUE(W.x, DataRef->TerrainHeight(W.x, W.z), W.z), FRotator(0, StridesUnits::HeadingToYawDeg(W.heading), 0));
	}
}

FVector AStridesAmbientLife::CarLocation(int32 I) const { return Cars.IsValidIndex(I) ? Cars[I]->GetComponentLocation() : FVector::ZeroVector; }
FVector AStridesAmbientLife::WalkerLocation(int32 I) const { return Walkers.IsValidIndex(I) ? Walkers[I]->GetComponentLocation() : FVector::ZeroVector; }
