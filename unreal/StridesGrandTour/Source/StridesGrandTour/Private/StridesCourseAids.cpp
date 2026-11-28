#include "StridesCourseAids.h"

#include "Dom/JsonObject.h"
#include "Engine/GameInstance.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "ProceduralMeshComponent.h"
#include "StridesDataSubsystem.h"
#include "StridesUnits.h"

namespace
{
const TCHAR* const kOneSided = TEXT("/Game/World/Cso/Materials/M_CsoAid.M_CsoAid");
const TCHAR* const kTwoSided = TEXT("/Game/World/Cso/Materials/M_CsoAidTwoSided.M_CsoAidTwoSided");
// Ordre des maillages : tracé, suite du tracé, bande ambre, bande verte, repère (clés de cso_aids.json).
const TCHAR* const kParts[] = {TEXT("line"), TEXT("after"), TEXT("ok"), TEXT("good"), TEXT("mark")};

// Rotation y d'un Object3D three.js (Euler XYZ, seul l'angle y non nul) appliquée à (x, z) : x' = x cos + z sin,
// z' = −x sin + z cos.
FVector RotY(double X, double Y, double Z, double A)
{
	const double C = FMath::Cos(A), S = FMath::Sin(A);
	return FVector(X * C + Z * S, Y, -X * S + Z * C);
}

TArray<double> Numbers(const TSharedPtr<FJsonObject>& O, const TCHAR* K)
{
	TArray<double> Out;
	const TArray<TSharedPtr<FJsonValue>>* A = nullptr;
	if (O.IsValid() && O->TryGetArrayField(K, A))
		for (const TSharedPtr<FJsonValue>& V : *A) Out.Add(V->AsNumber());
	return Out;
}
}  // namespace

AStridesCourseAids::AStridesCourseAids()
{
	PrimaryActorTick.bCanEverTick = false;
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));
	LineMesh = NewMesh(TEXT("Line"));
	AfterMesh = NewMesh(TEXT("After"));
	OkMesh = NewMesh(TEXT("Ok"));
	GoodMesh = NewMesh(TEXT("Good"));
	MarkMesh = NewMesh(TEXT("Mark"));
}

UProceduralMeshComponent* AStridesCourseAids::NewMesh(const TCHAR* Name)
{
	UProceduralMeshComponent* M = CreateDefaultSubobject<UProceduralMeshComponent>(Name);
	M->SetupAttachment(GetRootComponent());
	M->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	M->SetCastShadow(false);
	M->bUseAsyncCooking = false;
	M->SetVisibility(false);
	return M;
}

void AStridesCourseAids::BuildMaterials()
{
	if (bMaterials) return;
	bMaterials = true;
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	const TSharedPtr<FJsonObject> D = Data ? Data->CsoAids() : nullptr;
	if (!D.IsValid())
	{
		UE_LOG(LogTemp, Warning, TEXT("Strides aides : Content/Data/cso_aids.json absent, aides invisibles"));
		return;
	}
	UMaterialInterface* One = LoadObject<UMaterialInterface>(nullptr, kOneSided);
	UMaterialInterface* Two = LoadObject<UMaterialInterface>(nullptr, kTwoSided);
	if (!One || !Two) UE_LOG(LogTemp, Warning, TEXT("Strides aides : matériaux M_CsoAid absents (scripts/unreal/import-cso-aids.py)"));
	UProceduralMeshComponent* Meshes[] = {LineMesh, AfterMesh, OkMesh, GoodMesh, MarkMesh};
	const TSharedPtr<FJsonObject> Mats = D->GetObjectField(TEXT("materials"));
	const TSharedPtr<FJsonObject> Order = D->GetObjectField(TEXT("renderOrder"));
	Materials.Reset();
	for (int32 I = 0; I < 5; I++)
	{
		const TSharedPtr<FJsonObject> M = Mats->GetObjectField(kParts[I]);
		// side 2 = THREE.DoubleSide ; couleur linéaire de three.js (ColorManagement), opacité de la transparence.
		UMaterialInterface* Base = M->GetIntegerField(TEXT("side")) == 2 ? Two : One;
		UMaterialInstanceDynamic* Mid = Base ? UMaterialInstanceDynamic::Create(Base, this) : nullptr;
		if (Mid)
		{
			const TArray<double> C = Numbers(M, TEXT("colorLinear"));
			Mid->SetVectorParameterValue(TEXT("Color"), FLinearColor((float)C[0], (float)C[1], (float)C[2], 1.f));
			Mid->SetScalarParameterValue(TEXT("Opacity"), (float)M->GetNumberField(TEXT("opacity")));
			Meshes[I]->SetMaterial(0, Mid);
		}
		Materials.Add(Mid);
		// renderOrder du web : tri des translucides (tracé et bandes à 2, repère à 0).
		Meshes[I]->SetTranslucentSortPriority(Order->GetIntegerField(kParts[I]));
	}
	auto Geo = [&D](const TCHAR* K, TArray<double>& Pos, TArray<int32>& Idx)
	{
		const TSharedPtr<FJsonObject> G = D->GetObjectField(K);
		Pos = Numbers(G, TEXT("position"));
		Idx.Reset();
		for (double V : Numbers(G, TEXT("index"))) Idx.Add((int32)V);
	};
	Geo(TEXT("mark"), ConePos, ConeIdx);
	Geo(TEXT("band"), BandPos, BandIdx);
}

void AStridesCourseAids::Begin(const std::vector<strides::TracePoint>& Line, std::function<double(double, double)> Ground)
{
	BuildMaterials();
	GroundFn = MoveTemp(Ground);
	strides::CsoAidsParams A = strides::csoAidsDefaults();
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	if (const TSharedPtr<FJsonObject> D = Data ? Data->CsoAids() : nullptr)
	{
		// LINE_MARK relu dans la scène du web (les autres réglages sont des littéraux de courseAids.js).
		const TSharedPtr<FJsonObject> L = D->GetObjectField(TEXT("lineMark"));
		A.dash = L->GetNumberField(TEXT("dash"));
		A.width = L->GetNumberField(TEXT("width"));
		A.every = L->GetNumberField(TEXT("every"));
		A.after = L->GetNumberField(TEXT("after"));
		A.hideNear = L->GetNumberField(TEXT("hideNear"));
	}
	Core = MakeUnique<strides::CsoCourseAids>(Line, A, Data ? Data->Jump() : strides::jumpDefaults());
	// _strip : chaque coin posé sur le sol + 0,04.
	MarkCorners.Reset();
	for (const strides::CsoLineMark& M : Core->marks())
		for (int32 J = 0; J < 4; J++)
		{
			const double X = M.c[J][0], Z = M.c[J][1];
			MarkCorners.Add(FVector(X, (GroundFn ? GroundFn(X, Z) : 0.0) + A.lineLift, Z));
		}
	LineShown = AfterShown = FIntPoint(-1, -1);
	for (UProceduralMeshComponent* M : {LineMesh.Get(), AfterMesh.Get(), OkMesh.Get(), GoodMesh.Get(), MarkMesh.Get()})
	{
		M->ClearAllMeshSections();
		M->SetVisibility(false);
	}
	OkWeb.Reset();
	GoodWeb.Reset();
	MarkWeb.Reset();
}

void AStridesCourseAids::Step(const strides::CsoAidsInput& In)
{
	if (!Core) return;
	Core->update(In, GroundFn);
	Apply();
}

void AStridesCourseAids::End()
{
	Core.Reset();
	for (UProceduralMeshComponent* M : {LineMesh.Get(), AfterMesh.Get(), OkMesh.Get(), GoodMesh.Get(), MarkMesh.Get()})
	{
		M->ClearAllMeshSections();
		M->SetVisibility(false);
	}
	LineShown = AfterShown = FIntPoint(-1, -1);
	OkWeb.Reset();
	GoodWeb.Reset();
	MarkWeb.Reset();
}

void AStridesCourseAids::SetLine(UProceduralMeshComponent* Mesh, FIntPoint& Shown, bool bVisible, int32 First, int32 Count)
{
	const FIntPoint Want = bVisible ? FIntPoint(First, Count) : FIntPoint(-1, -1);
	if (Want == Shown) return;
	Shown = Want;
	Mesh->ClearAllMeshSections();
	Mesh->SetVisibility(bVisible && Count > 0);
	if (!bVisible || Count <= 0) return;
	// setDrawRange(first × 6, count × 6) : tirets first à first + count − 1, triangles (k, k+1, k+2) et (k, k+2, k+3).
	TArray<FVector> V, N;
	TArray<int32> T;
	for (int32 Q = First; Q < First + Count && Q * 4 + 3 < MarkCorners.Num(); Q++)
	{
		const int32 K = V.Num();
		for (int32 J = 0; J < 4; J++)
		{
			const FVector& P = MarkCorners[Q * 4 + J];
			V.Add(StridesUnits::WebToUE(P.X, P.Y, P.Z));
			N.Add(FVector::UpVector);
		}
		T.Append({K, K + 1, K + 2, K, K + 2, K + 3});
	}
	Mesh->CreateMeshSection(0, V, T, N, TArray<FVector2D>(), TArray<FColor>(), TArray<FProcMeshTangent>(), false);
}

void AStridesCourseAids::SetBand(UProceduralMeshComponent* Mesh, TArray<FVector>& Web, const strides::CsoAidsBand& B)
{
	Mesh->SetVisibility(B.visible);
	if (!B.visible) return;
	// Plan 1 × 1 couché (PlaneGeometry(1, 1).rotateX(−π/2)) : échelle (sx, 1, sz), rotation y, position.
	TArray<FVector> W, V, N;
	for (int32 I = 0; I + 2 < BandPos.Num(); I += 3)
	{
		const FVector R = RotY(BandPos[I] * B.sx, BandPos[I + 1], BandPos[I + 2] * B.sz, B.rot);
		W.Add(FVector(B.x + R.X, B.y + R.Y, B.z + R.Z));
	}
	if (W == Web && Mesh->GetNumSections() > 0) return;
	Web = W;
	for (const FVector& P : W)
	{
		V.Add(StridesUnits::WebToUE(P.X, P.Y, P.Z));
		N.Add(FVector::UpVector);
	}
	if (Mesh->GetNumSections() > 0) Mesh->UpdateMeshSection(0, V, N, TArray<FVector2D>(), TArray<FColor>(), TArray<FProcMeshTangent>());
	else Mesh->CreateMeshSection(0, V, BandIdx, N, TArray<FVector2D>(), TArray<FColor>(), TArray<FProcMeshTangent>(), false);
}

void AStridesCourseAids::Apply()
{
	if (!Core) return;
	const strides::CsoAidsView& Vw = Core->view();
	SetLine(LineMesh, LineShown, Vw.lineVisible, Vw.lineFirst, Vw.lineCount);
	SetLine(AfterMesh, AfterShown, Vw.lineVisible, Vw.afterFirst, Vw.afterCount);
	SetBand(OkMesh, OkWeb, Vw.ok);
	SetBand(GoodMesh, GoodWeb, Vw.good);
	if (!Vw.ok.visible) OkWeb.Reset();
	if (!Vw.good.visible) GoodWeb.Reset();
	// Repère : cône à trois faces retourné (ConeGeometry(0,16 ; 0,3 ; 3).rotateX(π)), rotation y du cap de l'obstacle.
	MarkMesh->SetVisibility(Vw.markVisible);
	if (!Vw.markVisible)
	{
		MarkWeb.Reset();
		return;
	}
	TArray<FVector> W, V, N;
	for (int32 I = 0; I + 2 < ConePos.Num(); I += 3)
	{
		const FVector R = RotY(ConePos[I], ConePos[I + 1], ConePos[I + 2], Vw.markRot);
		W.Add(FVector(Vw.markX + R.X, Vw.markY + R.Y, Vw.markZ + R.Z));
	}
	MarkWeb = W;
	for (const FVector& P : W)
	{
		V.Add(StridesUnits::WebToUE(P.X, P.Y, P.Z));
		N.Add(FVector::UpVector);
	}
	if (MarkMesh->GetNumSections() > 0) MarkMesh->UpdateMeshSection(0, V, N, TArray<FVector2D>(), TArray<FColor>(), TArray<FProcMeshTangent>());
	else MarkMesh->CreateMeshSection(0, V, ConeIdx, N, TArray<FVector2D>(), TArray<FColor>(), TArray<FProcMeshTangent>(), false);
}

bool AStridesCourseAids::IsShown(const FString& Part) const
{
	const UProceduralMeshComponent* M = Part == TEXT("line") ? LineMesh.Get() : Part == TEXT("after") ? AfterMesh.Get() : Part == TEXT("ok") ? OkMesh.Get()
		: Part == TEXT("good") ? GoodMesh.Get() : Part == TEXT("mark") ? MarkMesh.Get() : nullptr;
	return M && M->IsVisible() && M->GetNumSections() > 0;
}

TArray<FVector> AStridesCourseAids::WebVertices(const FString& Part) const
{
	if (Part == TEXT("ok")) return OkWeb;
	if (Part == TEXT("good")) return GoodWeb;
	if (Part == TEXT("mark")) return MarkWeb;
	const FIntPoint S = Part == TEXT("line") ? LineShown : Part == TEXT("after") ? AfterShown : FIntPoint(-1, -1);
	TArray<FVector> Out;
	for (int32 Q = S.X; S.X >= 0 && Q < S.X + S.Y && Q * 4 + 3 < MarkCorners.Num(); Q++)
		for (int32 J = 0; J < 4; J++) Out.Add(MarkCorners[Q * 4 + J]);
	return Out;
}

UMaterialInterface* AStridesCourseAids::PartMaterial(const FString& Part) const
{
	for (int32 I = 0; I < 5; I++)
		if (Part == kParts[I] && Materials.IsValidIndex(I)) return Materials[I];
	return nullptr;
}

int32 AStridesCourseAids::SortPriority(const FString& Part) const
{
	const UProceduralMeshComponent* M = Part == TEXT("line") ? LineMesh.Get() : Part == TEXT("after") ? AfterMesh.Get() : Part == TEXT("ok") ? OkMesh.Get()
		: Part == TEXT("good") ? GoodMesh.Get() : Part == TEXT("mark") ? MarkMesh.Get() : nullptr;
	return M ? M->TranslucencySortPriority : 0;
}
