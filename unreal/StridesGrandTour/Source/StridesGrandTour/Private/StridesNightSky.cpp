#include "StridesNightSky.h"

#include "Camera/PlayerCameraManager.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "EngineUtils.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "StridesCore/NightSky.h"
#include "StridesUnits.h"
#include "StridesWorldClock.h"

namespace
{
constexpr double kDomeCm = 90000.0;  // 900 m : en deçà du brouillard le plus dense, au-delà du décor
const TCHAR* const kUnlit = TEXT("/Game/World/Cso/Materials/M_CsoAidTwoSided.M_CsoAidTwoSided");
constexpr int32 kDrops = 900;
}

AStridesNightSky::AStridesNightSky()
{
	PrimaryActorTick.bCanEverTick = true;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent->SetMobility(EComponentMobility::Movable);
}

void AStridesNightSky::BeginPlay()
{
	Super::BeginPlay();
	Build();
}

void AStridesNightSky::Build()
{
	if (bBuilt) return;
	bBuilt = true;
	UStaticMesh* Plane = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Plane.Plane"));
	UStaticMesh* Cube = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
	UMaterialInterface* Base = LoadObject<UMaterialInterface>(nullptr, kUnlit);
	auto MakeIsm = [&](const TCHAR* Name, UStaticMesh* Mesh) {
		UInstancedStaticMeshComponent* C = NewObject<UInstancedStaticMeshComponent>(this, Name);
		C->SetStaticMesh(Mesh);
		C->SetMobility(EComponentMobility::Movable);
		C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		C->SetCastShadow(false);
		C->SetupAttachment(RootComponent);
		C->RegisterComponent();
		return C;
	};
	// Étoiles : trois classes d'éclat (0,25 à 0,45 ; 0,45 à 0,65 ; 0,65 à 0,85), carrés de 3,5 m tournés vers la caméra
	// (une cellule de sky.js : 1/300 rad à 900 m ≈ 3 m).
	const std::vector<strides::sky::Star> Stars = strides::sky::stars();
	for (int32 B = 0; B < 3; ++B)
	{
		UInstancedStaticMeshComponent* C = MakeIsm(*FString::Printf(TEXT("Etoiles_%d"), B), Plane);
		if (Base)
		{
			UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(Base, this);
			const float K = .35f + .2f * B;
			M->SetVectorParameterValue(TEXT("Color"), FLinearColor(K * 1.6f, K * 1.65f, K * 1.8f));
			M->SetScalarParameterValue(TEXT("Opacity"), 0.f);
			C->SetMaterial(0, M);
			StarMats.Add(M);
		}
		TArray<FTransform> Xf;
		for (const strides::sky::Star& S : Stars)
		{
			const int32 Band = S.bright < .45f ? 0 : S.bright < .65f ? 1 : 2;
			if (Band != B) continue;
			const FVector Dir = StridesUnits::WebToUE(S.x, S.y, S.z).GetSafeNormal();
			Xf.Add(FTransform(FRotationMatrix::MakeFromZ(-Dir).Rotator(), Dir * kDomeCm, FVector(3.5)));
		}
		C->AddInstances(Xf, false);
		C->SetVisibility(false);
		StarBands.Add(C);
	}
	// Lune : disque (carré) de 12 m à 900 m, ≈ 0,8° (sky.js : smoothstep(0,99965 ; 0,9998) ≈ 1,4° de rayon flou).
	Moon = NewObject<UStaticMeshComponent>(this, TEXT("Lune"));
	Moon->SetStaticMesh(Plane);
	Moon->SetMobility(EComponentMobility::Movable);
	Moon->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Moon->SetCastShadow(false);
	Moon->SetupAttachment(RootComponent);
	Moon->SetRelativeScale3D(FVector(14.0));
	if (Base)
	{
		MoonMat = UMaterialInstanceDynamic::Create(Base, this);
		MoonMat->SetVectorParameterValue(TEXT("Color"), FLinearColor(.75f * 2.f, .78f * 2.f, .85f * 2.f));
		MoonMat->SetScalarParameterValue(TEXT("Opacity"), 0.f);
		Moon->SetMaterial(0, MoonMat);
	}
	Moon->RegisterComponent();
	Moon->SetVisibility(false);
	// Pluie : traînées de 2 × 2 cm sur 60 cm (rain.js : extrémité haute 0,55 à 0,8 m au-dessus), teinte du web.
	Drops = MakeIsm(TEXT("Pluie"), Cube);
	Drops->SetAbsolute(true, true, true);
	if (Base)
	{
		UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(Base, this);
		M->SetVectorParameterValue(TEXT("Color"), FLinearColor(.59f, .62f, .67f));
		M->SetScalarParameterValue(TEXT("Opacity"), .3f);
		Drops->SetMaterial(0, M);
	}
	const auto Base0 = strides::sky::rainDrops(kDrops);
	for (const auto& D : Base0)
	{
		DropX.Add(D.x); DropY.Add(D.y); DropZ.Add(D.z); DropSeed.Add(D.seed);
	}
	Drops->SetVisibility(false);
}

int32 AStridesNightSky::StarCount() const
{
	int32 N = 0;
	for (const UInstancedStaticMeshComponent* C : StarBands) N += C ? C->GetInstanceCount() : 0;
	return N;
}

bool AStridesNightSky::StarsVisible() const { return StarBands.Num() && StarBands[0] && StarBands[0]->IsVisible(); }

void AStridesNightSky::Apply(const FVector& Cam, double Night, double RainK, const FVector& MoonDir, double Dt)
{
	Build();
	T += Dt;
	SetActorLocation(Cam);
	// sky.js : étoiles et lune × night ; masquées de jour (aucun coût de dessin).
	const bool bStars = Night > 0.02;
	for (int32 B = 0; B < StarBands.Num(); ++B)
	{
		StarBands[B]->SetVisibility(bStars);
		if (StarMats.IsValidIndex(B)) StarMats[B]->SetScalarParameterValue(TEXT("Opacity"), (float)Night);
	}
	Moon->SetVisibility(bStars);
	if (bStars)
	{
		Moon->SetRelativeLocationAndRotation(MoonDir.GetSafeNormal() * kDomeCm, FRotationMatrix::MakeFromZ(-MoonDir.GetSafeNormal()).Rotator());
		if (MoonMat) MoonMat->SetScalarParameterValue(TEXT("Opacity"), (float)Night);
	}
	// rain.js : une goutte gardée si sa graine < intensité ; visible au-dessus de 0,01.
	Shown = 0;
	if (RainK > 0.01)
	{
		double Wx, Wy, Wz;
		StridesUnits::UEToWeb(Cam, Wx, Wy, Wz);
		TArray<FTransform> Xf;
		Xf.Reserve(kDrops);
		for (int32 I = 0; I < kDrops; ++I)
		{
			const bool bKeep = DropSeed[I] < RainK;
			double X = 0, Y = -1000, Z = 0;
			if (bKeep)
			{
				strides::sky::RainDrop D{DropX[I], DropY[I], DropZ[I], DropSeed[I]};
				strides::sky::rainAt(D, T, Wx, Wy, Wz, X, Y, Z);
				++Shown;
			}
			Xf.Add(FTransform(FRotator::ZeroRotator, StridesUnits::WebToUE(X, Y + .3, Z), bKeep ? FVector(.02, .02, .6) : FVector::ZeroVector));
		}
		if (Drops->GetInstanceCount() != kDrops)
		{
			Drops->ClearInstances();
			Drops->AddInstances(Xf, false, true);
		}
		else Drops->BatchUpdateInstancesTransforms(0, Xf, true, true, true);
	}
	Drops->SetVisibility(Shown > 0);
}

void AStridesNightSky::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	const APlayerCameraManager* Cam = UGameplayStatics::GetPlayerCameraManager(GetWorld(), 0);
	const AStridesWorldClock* Clock = nullptr;
	for (TActorIterator<AStridesWorldClock> It(GetWorld()); It; ++It) Clock = *It;
	if (!Cam || !Clock) return;
	const double Night = strides::sky::nightFactor(FMath::Sin(FMath::DegreesToRadians(Clock->SunAltitude)));
	Apply(Cam->GetCameraLocation(), Night, Clock->Rain, Clock->MoonDir, DeltaSeconds);
}
