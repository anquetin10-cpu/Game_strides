#include "StridesScenery.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "ProceduralMeshComponent.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "StridesDataSubsystem.h"
#include "StridesUnits.h"

namespace
{
	TSharedPtr<FJsonObject> ReadJson(const FString& File)
	{
		FString Text;
		TSharedPtr<FJsonObject> J;
		if (!FFileHelper::LoadFileToString(Text, *(FPaths::ProjectContentDir() / TEXT("Data/World") / File))) return nullptr;
		const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
		return FJsonSerializer::Deserialize(Reader, J) ? J : nullptr;
	}

	// Normale du relief (repère Unreal) par différences centrées sur la fonction de hauteur.
	FVector GroundNormal(const UStridesDataSubsystem& D, double X, double Z, double E)
	{
		const double Dx = (D.TerrainHeight(X + E, Z) - D.TerrainHeight(X - E, Z)) / (2 * E);
		const double Dz = (D.TerrainHeight(X, Z + E) - D.TerrainHeight(X, Z - E)) / (2 * E);
		return FVector(-Dx, -Dz, 1.0).GetSafeNormal();
	}
}

AStridesScenery::AStridesScenery()
{
	USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	Root->SetMobility(EComponentMobility::Static);
	SetRootComponent(Root);
	Terrain = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Terrain"));
	Terrain->SetupAttachment(Root);
	Terrain->bUseAsyncCooking = false;
	Roads = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Roads"));
	Roads->SetupAttachment(Root);
	Roads->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

void AStridesScenery::Build(const UStridesDataSubsystem& Data)
{
	const TSharedPtr<FJsonObject> Manifest = ReadJson(TEXT("world_assets.json"));
	if (!Data.HasTerrain() || !Manifest)
	{
		UE_LOG(LogTemp, Error, TEXT("Strides scenery: relief ou manifeste absent (scripts/unreal/import-world.py)"));
		return;
	}
	auto Mat = [&Manifest](const TCHAR* Key) { return LoadObject<UMaterialInterface>(nullptr, *Manifest->GetStringField(Key)); };
	BuildTerrain(Data, Mat(TEXT("terrainMaterial")));
	BuildRoads(Data, Mat(TEXT("roadMaterial")));
	BuildWater(Data, Mat(TEXT("waterMaterial")));
	for (const TSharedPtr<FJsonValue>& V : Manifest->GetArrayField(TEXT("architecture")))
	{
		const TSharedPtr<FJsonObject> O = V->AsObject();
		if (UStaticMesh* M = LoadObject<UStaticMesh>(nullptr, *O->GetStringField(TEXT("mesh"))))
		{
			UStaticMeshComponent* C = AddMesh(M, O->GetBoolField(TEXT("collide")), O->GetBoolField(TEXT("shadow")));
			// Petits détails, vitres et enseignes : inutiles au-delà de quelques centaines de mètres.
			if (!O->GetBoolField(TEXT("collide"))) C->SetCachedMaxDrawDistance(45000.f);
			ArchitectureMeshes++;
		}
	}
	for (const TSharedPtr<FJsonValue>& V : Manifest->GetArrayField(TEXT("hedges")))
	{
		const TSharedPtr<FJsonObject> O = V->AsObject();
		if (UStaticMesh* M = LoadObject<UStaticMesh>(nullptr, *O->GetStringField(TEXT("mesh"))))
		{
			AddMesh(M, O->GetBoolField(TEXT("collide")), true);
			HedgeMeshes++;
		}
	}
	TArray<FString> TreeMeshes;
	for (const TSharedPtr<FJsonValue>& V : Manifest->GetArrayField(TEXT("trees"))) TreeMeshes.Add(V->AsObject()->GetStringField(TEXT("mesh")));
	BuildTrees(Data, TreeMeshes);
	UE_LOG(LogTemp, Display, TEXT("Strides scenery: %d triangles de relief, %d maillages d'architecture, %d haies, %d arbres"), TerrainTriangles, ArchitectureMeshes, HedgeMeshes, TreeInstances);
}

UStaticMeshComponent* AStridesScenery::AddMesh(UStaticMesh* Mesh, bool bCollide, bool bShadow)
{
	UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(this);
	C->SetMobility(EComponentMobility::Static);
	C->SetStaticMesh(Mesh);
	C->SetupAttachment(GetRootComponent());
	C->SetCastShadow(bShadow);
	if (bCollide) C->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
	else C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	C->RegisterComponent();
	return C;
}

void AStridesScenery::BuildTerrain(const UStridesDataSubsystem& D, UMaterialInterface* Material)
{
	const int32 N = D.TerrainN;
	const double S = D.TerrainStep;
	const FVector2D O = D.TerrainOrigin;
	const double Size = (N - 1) * S;
	const int32 Q = 50;  // quadrilatères par côté de tuile (100 m)
	const int32 Tiles = (N - 1) / Q;
	int32 Section = 0;
	auto Uv1 = [&](double X, double Z) { return FVector2D((X - O.X) / Size, (Z - O.Y) / Size); };
	// Tuiles du carré du monde : relief exact, collisions (cavalier à pied, caméra).
	for (int32 Ty = 0; Ty < Tiles; Ty++)
		for (int32 Tx = 0; Tx < Tiles; Tx++)
		{
			TArray<FVector> V, Nrm;
			TArray<int32> T;
			TArray<FVector2D> UV0, UV1;
			TArray<FProcMeshTangent> Tan;
			for (int32 J = 0; J <= Q; J++)
				for (int32 I = 0; I <= Q; I++)
				{
					const double X = O.X + (Tx * Q + I) * S, Z = O.Y + (Ty * Q + J) * S;
					V.Add(StridesUnits::WebToUE(X, D.TerrainHeight(X, Z), Z));
					Nrm.Add(GroundNormal(D, X, Z, S));
					UV0.Add(FVector2D(X, Z));
					UV1.Add(Uv1(X, Z));
					Tan.Add(FProcMeshTangent(1, 0, 0));
				}
			for (int32 J = 0; J < Q; J++)
				for (int32 I = 0; I < Q; I++)
				{
					const int32 A = J * (Q + 1) + I, B = A + 1, C = A + Q + 1, Dd = C + 1;
					T.Append({A, C, B, B, C, Dd});
				}
			Terrain->CreateMeshSection(Section, V, T, Nrm, UV0, UV1, UV0, UV0, TArray<FColor>(), Tan, true);
			Terrain->SetMaterial(Section++, Material);
			TerrainTriangles += T.Num() / 3;
		}
	// Au-delà du carré : collines prolongées jusqu'à l'horizon au sud, à l'est et à l'ouest, fond marin au nord.
	// Bord intérieur enfoncé d'un mètre sous le relief exact, plus un rideau vertical : aucune fente vers le ciel.
	auto Far = [&](double X, double Z)
	{
		const double Half = Size * 0.5;
		const double Cx = FMath::Clamp(X, -Half, Half), Cz = FMath::Clamp(Z, -Half, Half);
		const double H0 = D.TerrainHeight(Cx, Cz);
		const double Dist = FMath::Max3(FMath::Abs(X) - Half, FMath::Abs(Z) - Half, 0.0);
		if (H0 < 0.5) return FMath::Min(H0, -12.0) - Dist * 0.004;
		const double Wave = 0.65 + 0.35 * FMath::Sin(X * 0.0023 + 1.3) * FMath::Cos(Z * 0.0019 - 0.4);
		const double Hill = H0 - 1.0 + 55.0 * (1.0 - FMath::Exp(-Dist / 1100.0)) * Wave;
		// Jalon J4 (correction) : région de Paris (4 km à l'est) : collines aplanies sous la dalle de Paris (sites.js
		// PARIS.y), raccordées sur 300 m autour de la zone (bounds + 40 m).
		if (const strides::ParisGpData* PD = D.Paris())
		{
			const strides::ParisSite& P = PD->site;
			const double Dx = FMath::Max3(P.x - 255 - X, X - (P.x + 112), 0.0), Dz = FMath::Max(FMath::Abs(Z - P.z) - 132, 0.0);
			const double K = FMath::SmoothStep(0.0, 300.0, FMath::Sqrt(Dx * Dx + Dz * Dz));
			return FMath::Lerp(P.y - 1.5, Hill, K);
		}
		return Hill;
	};
	{
		const double Step = 60.0, Ext = 4200.0;
		const int32 M = FMath::RoundToInt(2 * Ext / Step);
		TArray<FVector> V, Nrm;
		TArray<int32> T;
		TArray<FVector2D> UV0, UV1;
		TArray<FProcMeshTangent> Tan;
		for (int32 J = 0; J <= M; J++)
			for (int32 I = 0; I <= M; I++)
			{
				const double X = -Ext + I * Step, Z = -Ext + J * Step;
				const double H = Far(X, Z);
				V.Add(StridesUnits::WebToUE(X, H, Z));
				const double Hx = Far(X + Step, Z) - Far(X - Step, Z), Hz = Far(X, Z + Step) - Far(X, Z - Step);
				Nrm.Add(FVector(-Hx / (2 * Step), -Hz / (2 * Step), 1.0).GetSafeNormal());
				UV0.Add(FVector2D(X, Z));
				UV1.Add(Uv1(X, Z));
				Tan.Add(FProcMeshTangent(1, 0, 0));
			}
		const double Half = Size * 0.5;
		for (int32 J = 0; J < M; J++)
			for (int32 I = 0; I < M; I++)
			{
				const double X0 = -Ext + I * Step, Z0 = -Ext + J * Step;
				if (X0 >= -Half && X0 + Step <= Half && Z0 >= -Half && Z0 + Step <= Half) continue;
				const int32 A = J * (M + 1) + I, B = A + 1, C = A + M + 1, Dd = C + 1;
				T.Append({A, C, B, B, C, Dd});
			}
		// Rideau sous le bord du relief exact (vu de l'intérieur).
		const int32 Base = V.Num();
		int32 K = 0;
		for (int32 Side = 0; Side < 4; Side++)
			for (int32 I = 0; I < N; I++)
			{
				const double U = O.X + I * S;
				const double X = Side == 0 ? U : Side == 1 ? O.X + Size : Side == 2 ? O.X + Size - (U - O.X) : O.X;
				const double Z = Side == 0 ? O.Y : Side == 1 ? U - O.X + O.Y : Side == 2 ? O.Y + Size : O.Y + Size - (U - O.X);
				const double H = D.TerrainHeight(X, Z);
				V.Add(StridesUnits::WebToUE(X, H, Z));
				V.Add(StridesUnits::WebToUE(X, H - 8.0, Z));
				for (int32 R = 0; R < 2; R++) { Nrm.Add(FVector::UpVector); UV0.Add(FVector2D(X, Z)); UV1.Add(Uv1(X, Z)); Tan.Add(FProcMeshTangent(1, 0, 0)); }
				if (I > 0)
				{
					const int32 P = Base + (K - 1) * 2, Cc = Base + K * 2;
					T.Append({P, P + 1, Cc, Cc, P + 1, Cc + 1, P, Cc, P + 1, Cc, Cc + 1, P + 1});
				}
				K++;
			}
		Terrain->CreateMeshSection(Section, V, T, Nrm, UV0, UV1, UV0, UV0, TArray<FColor>(), Tan, false);
		Terrain->SetMaterial(Section++, Material);
		TerrainTriangles += T.Num() / 3;
	}
	Terrain->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
	Terrain->SetCastShadow(true);
}

void AStridesScenery::BuildRoads(const UStridesDataSubsystem& D, UMaterialInterface* Material)
{
	// Même construction que buildRoads (world.js) : échantillons tous les 3 m au plus, trois sommets en travers
	// (rive, axe, rive), UV0 = (travers, long de la route) en mètres, UV1.x = largeur ; posée 6 cm au-dessus du relief.
	TArray<FVector> V, Nrm;
	TArray<int32> T;
	TArray<FVector2D> UV0, UV1;
	TArray<FProcMeshTangent> Tan;
	for (const FStridesRoad& Road : D.SceneRoads)
	{
		TArray<FVector2D> Samples;
		for (int32 I = 0; I + 1 < Road.Points.Num(); I++)
		{
			const FVector2D A = Road.Points[I], B = Road.Points[I + 1];
			const int32 Count = FMath::Max(1, FMath::CeilToInt(FVector2D::Distance(A, B) / 3.0));
			for (int32 K = 0; K < Count; K++) Samples.Add(A + (B - A) * (double(K) / Count));
		}
		if (Road.Points.Num()) Samples.Add(Road.Points.Last());
		const int32 Base = V.Num();
		const double Half = Road.Width * 0.5;
		double Dist = 0;
		for (int32 I = 0; I < Samples.Num(); I++)
		{
			const FVector2D P = Samples[FMath::Max(0, I - 1)], Qn = Samples[FMath::Min(Samples.Num() - 1, I + 1)];
			const FVector2D Dir = (Qn - P).GetSafeNormal();
			const FVector2D Nn(-Dir.Y, Dir.X);
			if (I > 0) Dist += FVector2D::Distance(Samples[I], Samples[I - 1]);
			for (int32 K = -1; K <= 1; K++)
			{
				const FVector2D Pt = Samples[I] + Nn * Half * K;
				V.Add(StridesUnits::WebToUE(Pt.X, D.TerrainHeight(Pt.X, Pt.Y) + 0.06, Pt.Y));
				Nrm.Add(GroundNormal(D, Pt.X, Pt.Y, 1.5));
				UV0.Add(FVector2D((K + 1) * 0.5 * Road.Width, Dist));
				UV1.Add(FVector2D(Road.Width, 0));
				Tan.Add(FProcMeshTangent(FVector(Nn.X, Nn.Y, 0), false));
			}
			if (I > 0)
			{
				const int32 A = Base + (I - 1) * 3, B = Base + I * 3;
				T.Append({A, A + 1, B, A + 1, B + 1, B, A + 1, A + 2, B + 1, A + 2, B + 2, B + 1});
			}
		}
	}
	Roads->CreateMeshSection(0, V, T, Nrm, UV0, UV1, UV0, UV0, TArray<FColor>(), Tan, false);
	Roads->SetMaterial(0, Material);
	Roads->SetCastShadow(false);
}

void AStridesScenery::BuildWater(const UStridesDataSubsystem& D, UMaterialInterface* Material)
{
	UStaticMesh* Plane = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Plane.Plane"));
	// Mer au niveau moyen (0 m) jusqu'à l'horizon ; elle passe sous les terres (toutes au-dessus de 2,8 m).
	UStaticMeshComponent* Sea = AddMesh(Plane, false, false);
	Sea->SetMaterial(0, Material);
	Sea->SetRelativeLocation(StridesUnits::WebToUE(0, 0, -2600));
	Sea->SetRelativeScale3D(FVector(10000, 10000, 1));
	SeaMesh = Sea;
	UStaticMeshComponent* PondWater = AddMesh(Plane, false, false);
	PondWater->SetMaterial(0, Material);
	PondWater->SetRelativeLocation(StridesUnits::WebToUE(D.Pond.X, D.PondLevel, D.Pond.Y));
	const double W = (D.Pond.Z * 2 + 8) / 1.0;
	PondWater->SetRelativeScale3D(FVector(W, W, 1));
}

void AStridesScenery::BuildTrees(const UStridesDataSubsystem& D, const TArray<FString>& Meshes)
{
	const TSharedPtr<FJsonObject> J = ReadJson(TEXT("trees.json"));
	if (!J) return;
	const TArray<TSharedPtr<FJsonValue>>& Variants = J->GetArrayField(TEXT("variants"));
	for (int32 I = 0; I < Meshes.Num(); I++)
	{
		UHierarchicalInstancedStaticMeshComponent* H = NewObject<UHierarchicalInstancedStaticMeshComponent>(this);
		H->SetMobility(EComponentMobility::Static);
		H->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, *Meshes[I]));
		H->SetupAttachment(GetRootComponent());
		H->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		H->NumCustomDataFloats = 3;
		const bool bBush = Variants.IsValidIndex(I) && Variants[I]->AsObject()->GetStringField(TEXT("kind")) == TEXT("bush");
		H->SetCullDistances(0, bBush ? 35000 : 160000);
		H->RegisterComponent();
		TreeComponents.Add(H);
	}
	// Troncs : cylindres invisibles pour les collisions du cavalier à pied (rayon 0,45 m x échelle, comme le jeu web).
	UHierarchicalInstancedStaticMeshComponent* Trunks = NewObject<UHierarchicalInstancedStaticMeshComponent>(this);
	Trunks->SetMobility(EComponentMobility::Static);
	Trunks->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cylinder.Cylinder")));
	Trunks->SetupAttachment(GetRootComponent());
	Trunks->SetVisibility(false);
	Trunks->SetCastShadow(false);
	Trunks->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
	Trunks->RegisterComponent();
	TArray<TArray<FTransform>> PerVariant;
	TArray<TArray<float>> PerVariantData;
	PerVariant.SetNum(Meshes.Num());
	PerVariantData.SetNum(Meshes.Num());
	TArray<FTransform> TrunkXf;
	for (const TSharedPtr<FJsonValue>& V : J->GetArrayField(TEXT("instances")))
	{
		const TArray<TSharedPtr<FJsonValue>>& A = V->AsArray();
		const int32 Vi = (int32)A[0]->AsNumber();
		if (!PerVariant.IsValidIndex(Vi)) continue;
		const double X = A[1]->AsNumber(), Z = A[3]->AsNumber(), Rot = A[4]->AsNumber(), S = A[5]->AsNumber(), Sy = A[6]->AsNumber();
		// Pied posé sur le relief Unreal (légèrement enfoncé, comme le jeu web).
		const double Y = FMath::Min(A[2]->AsNumber(), D.TerrainHeight(X, Z) - 0.12);
		PerVariant[Vi].Add(FTransform(FRotator(0, -FMath::RadiansToDegrees(Rot), 0), StridesUnits::WebToUE(X, Y, Z), FVector(S, S, S * Sy)));
		PerVariantData[Vi].Append({(float)A[7]->AsNumber(), (float)A[8]->AsNumber(), (float)A[9]->AsNumber()});
		if (A.Num() > 10 && A[10]->AsNumber() > 0)
			TrunkXf.Add(FTransform(FRotator::ZeroRotator, StridesUnits::WebToUE(X, D.TerrainHeight(X, Z) + 1.5, Z), FVector(0.9 * S, 0.9 * S, 3.0)));
		TreeInstances++;
	}
	for (int32 I = 0; I < TreeComponents.Num(); I++)
	{
		UHierarchicalInstancedStaticMeshComponent* H = TreeComponents[I];
		H->AddInstances(PerVariant[I], false, true);
		for (int32 K = 0; K < PerVariant[I].Num(); K++)
			H->SetCustomData(K, TArrayView<const float>(PerVariantData[I].GetData() + K * 3, 3), false);
		H->MarkRenderStateDirty();
	}
	Trunks->AddInstances(TrunkXf, false, true);
}
