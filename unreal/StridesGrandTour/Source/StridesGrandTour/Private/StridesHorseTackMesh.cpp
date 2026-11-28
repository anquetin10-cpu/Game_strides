#include "StridesHorseTackMesh.h"
#include "Camera/PlayerCameraManager.h"
#include "Components/PoseableMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Rendering/SkeletalMeshLODRenderData.h"
#include "Rendering/SkeletalMeshRenderData.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "HAL/PlatformTime.h"
#include "Materials/MaterialInterface.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "ProceduralMeshComponent.h"
#include "StridesCore/MiniJson.h"
#include "StridesHorse.h"
#include "StridesHorseTack.h"
#include "StridesRider.h"
#include "StridesRiderRig.h"

using namespace strides::straps;
using strides::tack::V3;

namespace
{
const TCHAR* TackRoot = TEXT("/Game/Characters/Horse/horse_pjl_tack/");
UMaterialInterface* TackMaterial(const TCHAR* Name)
{
	return LoadObject<UMaterialInterface>(nullptr, *(FString(TackRoot) + Name + TEXT(".") + Name));
}
}  // namespace

FBoxSphereBounds UStridesTackPieceComponent::CalcBounds(const FTransform& LocalToWorld) const
{
	const USkinnedMeshComponent* Leader = LeaderPoseComponent.Get();
	if (!Leader || LeaderBones.Num() == 0) return Super::CalcBounds(LocalToWorld);
	const TArray<FTransform>& CS = Leader->GetComponentSpaceTransforms();
	FBox Box(ForceInit);
	for (const int32 B : LeaderBones)
		if (CS.IsValidIndex(B)) Box += CS[B].GetLocation();
	if (!Box.IsValid) return Super::CalcBounds(LocalToWorld);
	return FBoxSphereBounds(Box.ExpandBy(Margin)).TransformBy(LocalToWorld);
}

UStridesHorseTackMesh::UStridesHorseTackMesh()
{
	// Après le cheval (sellerie, siège : TG_PostUpdateWork) et la cavalière (pose de la règle, tick placé après la sellerie) :
	// comme pjlHorse.js _straps, appelé une fois la pose de l'image connue.
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = false;
	PrimaryComponentTick.TickGroup = TG_LastDemotable;
	Irons[0] = Irons[1] = nullptr;
}

bool UStridesHorseTackMesh::Init(AStridesHorse* InHorse, FString* Err)
{
	bReady = false;
	auto Fail = [Err](const FString& Why) {
		if (Err) *Err = Why;
		UE_LOG(LogTemp, Warning, TEXT("Strides sellerie affichée : %s"), *Why);
		return false;
	};
	Horse = InHorse;
	USkeletalMeshComponent* Body = Horse ? Horse->BodyMesh() : nullptr;
	if (!Body || !Body->GetSkeletalMeshAsset()) return Fail(TEXT("maillage du cheval absent"));
	FString Text;
	const FString Path = FPaths::ProjectContentDir() / TEXT("Data/pjl_horse_tack_mesh.json");
	if (!FFileHelper::LoadFileToString(Text, *Path)) return Fail(TEXT("Content/Data/pjl_horse_tack_mesh.json introuvable (scripts/unreal/tack-horse-glb.py)"));
	J Data;
	try
	{
		const std::string Src(TCHAR_TO_UTF8(*Text));
		Data = JParser(Src).parse();
		Model_ = strapsModelFromJson(Data);
	}
	catch (const std::exception& Ex)
	{
		return Fail(UTF8_TO_TCHAR(Ex.what()));
	}
	// Pièces skinnées : suiveurs du maillage du cheval (mêmes os, même repère de composant).
	for (const J& P : Data["pieces"].a)
	{
		const FString Name = UTF8_TO_TCHAR(P["name"].s.c_str());
		const FString Asset = TEXT("SK_Tack_") + Name.RightChop(5);
		USkeletalMesh* Mesh = LoadObject<USkeletalMesh>(nullptr, *(FString(TackRoot) + Asset + TEXT(".") + Asset));
		if (!Mesh) return Fail(FString::Printf(TEXT("asset %s absent (scripts/unreal/import-horse-tack.py)"), *Asset));
		if (Mesh->GetSkeleton() != Body->GetSkeletalMeshAsset()->GetSkeleton()) return Fail(FString::Printf(TEXT("%s : squelette différent de celui du cheval"), *Asset));
		UStridesTackPieceComponent* C = NewObject<UStridesTackPieceComponent>(Horse, *(TEXT("Tack_") + Name.RightChop(5)));
		C->SetSkeletalMesh(Mesh);
		C->SetupAttachment(Body);
		C->SetRelativeTransform(FTransform::Identity);
		C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		C->SetLeaderPoseComponent(Body);
		// Bornes : os du meneur qui portent la pièce (UStridesTackPieceComponent::CalcBounds) ; contenance vérifiée image par
		// image par Strides.Parite.HorseTackMesh.
		if (const FSkeletalMeshRenderData* RD = Mesh->GetResourceForRendering())
			if (RD->LODRenderData.Num() > 0)
				for (const FBoneIndexType Bi : RD->LODRenderData[0].ActiveBoneIndices)
				{
					const int32 Lb = Body->GetSkeletalMeshAsset()->GetRefSkeleton().FindBoneIndex(Mesh->GetRefSkeleton().GetBoneName(Bi));
					if (Lb != INDEX_NONE) C->LeaderBones.Add(Lb);
				}
		if (C->LeaderBones.Num() == 0) return Fail(FString::Printf(TEXT("%s : aucun os du cheval ne porte la pièce"), *Asset));
		C->SetCastShadow(true);
		C->SetVisibility(P["visible"].b);
		// Matériau de la pièce (MI_Tack_<pièce>, valeurs du web) posé ici : l'affectation enregistrée dans l'asset importé n'est
		// pas relue (constaté le 25/11/2026 : WorldGridMaterial en jeu).
		UMaterialInterface* Mat = TackMaterial(*(TEXT("MI_Tack_") + Name.RightChop(5)));
		if (!Mat) return Fail(FString::Printf(TEXT("matériau MI_Tack_%s absent (scripts/unreal/import-horse-tack.py)"), *Name.RightChop(5)));
		C->SetMaterial(0, Mat);
		C->RegisterComponent();
		Pieces.Add(C);
		PieceNames.Add(Name);
		PieceVisible.Add(P["visible"].b);
	}
	// Étriers : géométrie du web (repère du holder : x à gauche, y vers le haut, z vers l'avant, m) → repère de l'acteur
	// (X = 100 z, Y = −100 x, Z = 100 y) ; la symétrie inverse le sens des triangles.
	const J& Iron = Data["iron"];
	TArray<FVector> IronV, IronN;
	TArray<int32> IronT;
	for (size_t I = 0; I + 2 < Iron["position"].a.size(); I += 3)
	{
		IronV.Add(FromWeb(V3{Iron["position"][I].num(), Iron["position"][I + 1].num(), Iron["position"][I + 2].num()}));
		IronN.Add(FromWeb(V3{Iron["normal"][I].num(), Iron["normal"][I + 1].num(), Iron["normal"][I + 2].num()}).GetSafeNormal());
	}
	for (size_t I = 0; I + 2 < Iron["index"].a.size(); I += 3)
	{
		IronT.Add((int32)Iron["index"][I].num());
		IronT.Add((int32)Iron["index"][I + 2].num());
		IronT.Add((int32)Iron["index"][I + 1].num());
	}
	UMaterialInterface* IronMat = TackMaterial(TEXT("MI_Tack_iron"));
	UMaterialInterface* LeatherMat = TackMaterial(TEXT("MI_Tack_leather"));
	UMaterialInterface* ReinMat = TackMaterial(TEXT("MI_Tack_rein"));
	if (!IronMat || !LeatherMat || !ReinMat) return Fail(TEXT("matériaux MI_Tack_iron, MI_Tack_leather ou MI_Tack_rein absents"));
	for (int32 K = 0; K < 2; K++)
	{
		UProceduralMeshComponent* C = NewObject<UProceduralMeshComponent>(Horse, K ? TEXT("TackIronR") : TEXT("TackIronL"));
		C->SetupAttachment(Horse->GetRootComponent());
		C->SetUsingAbsoluteLocation(true);
		C->SetUsingAbsoluteRotation(true);
		C->SetUsingAbsoluteScale(true);
		C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		C->CreateMeshSection(0, IronV, IronT, IronN, TArray<FVector2D>(), TArray<FColor>(), TArray<FProcMeshTangent>(), false);
		C->SetMaterial(0, IronMat);
		C->SetCastShadow(true);
		C->RegisterComponent();
		Irons[K] = C;
	}
	// Étrivières (sections 0 et 1) et rênes (2 et 3) : rubans dans le monde, recalculés à chaque image.
	Straps = NewObject<UProceduralMeshComponent>(Horse, TEXT("TackStraps"));
	Straps->SetupAttachment(Horse->GetRootComponent());
	Straps->SetUsingAbsoluteLocation(true);
	Straps->SetUsingAbsoluteRotation(true);
	Straps->SetUsingAbsoluteScale(true);
	Straps->SetWorldTransform(FTransform::Identity);
	Straps->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Straps->SetCastShadow(true);
	Straps->RegisterComponent();
	Straps->SetMaterial(0, LeatherMat);
	Straps->SetMaterial(1, LeatherMat);
	Straps->SetMaterial(2, ReinMat);
	Straps->SetMaterial(3, ReinMat);
	bSectionsMade = false;
	bHasPrevGrip = false;
	bReady = true;
	if (Err) Err->Reset();
	return true;
}

bool UStridesHorseTackMesh::RiderPointsFromRig(const UStridesRiderRig* Rig, const FTransform& MeshToSeat, FRiderPoints& Out)
{
	if (!Rig || !Rig->IsReady() || !Rig->Driver()) return false;
	for (int32 S = 0; S < 2; S++)
	{
		Out.Toe[S] = MeshToSeat.TransformPosition(Rig->ToePoint(S));
		Out.Grip[S] = MeshToSeat.TransformPosition(Rig->GripPoint(S));
	}
	Out.Scale = Rig->Driver()->rules().rig().scale;
	return true;
}

void UStridesHorseTackMesh::StepStraps(const FTransform& SeatWorld, const strides::tack::TackOut& O, const FRiderPoints* Rider, const FVector* CamWorld)
{
	if (!bReady) return;
	const double T0 = FPlatformTime::Seconds();
	const auto AnchorWorld = [&](int A) { return ToWebV(SeatWorld.TransformPosition(UStridesHorseTack::HolderToActor(O.anchorS[A]))); };
	StrapsIn& In = In_;
	In.saddle = true;  // cfg.saddle : cheval sellé (cheval du joueur)
	In.hasCam = CamWorld != nullptr;
	if (CamWorld) In.cam = ToWebV(*CamWorld);
	const AActor* Owner = Horse ? (const AActor*)Horse : GetOwner();
	const FTransform H = Owner ? Owner->GetActorTransform() : FTransform::Identity;
	const V3 Hp = ToWebV(H.GetLocation());
	In.horseX = Hp.x;
	In.horseZ = Hp.z;
	// Orientation monde du holder dans les axes du web : colonnes = images des axes x (gauche : −Y de l'acteur), y (haut :
	// Z) et z (avant : X), exprimées dans le monde du web.
	{
		const FVector3d Lat = ToWeb(H.GetRotation().RotateVector(FVector(0, -100, 0)));
		const FVector3d Up = ToWeb(H.GetRotation().RotateVector(FVector(0, 0, 100)));
		const FVector3d Fw = ToWeb(H.GetRotation().RotateVector(FVector(100, 0, 0)));
		const FQuat Q = FMatrix(FVector(Lat), FVector(Up), FVector(Fw), FVector::ZeroVector).ToQuat();
		In.holder = strides::tack::Q4{Q.X, Q.Y, Q.Z, Q.W};
	}
	In.bar[0] = AnchorWorld(strides::tack::BarL), In.bar[1] = AnchorWorld(strides::tack::BarR);
	In.bit[0] = AnchorWorld(strides::tack::BitL), In.bit[1] = AnchorWorld(strides::tack::BitR);
	In.ironAnchor[0] = AnchorWorld(strides::tack::IronL), In.ironAnchor[1] = AnchorWorld(strides::tack::IronR);
	In.crest = AnchorWorld(strides::tack::Crest);
	In.hasHands = Rider != nullptr;
	for (int32 K = 0; K < 2; K++)
	{
		// horse.js _stirrupsFollow : étrier sous l'orteil de la pose de cette image.
		In.inStirrup[K] = Rider != nullptr;
		if (Rider) In.stirrup[K] = stirrupUnderToe(Model_, ToWebV(SeatWorld.TransformPosition(Rider->Toe[K])), Rider->Scale);
		// Poings : ceux de la pose précédente, dans le siège de cette image (le web lit le modèle réaliste avant sa mise à jour).
		if (Rider) In.hand[K] = ToWebV(SeatWorld.TransformPosition(bHasPrevGrip ? PrevGrip[K] : Rider->Grip[K]));
	}
	if (Rider)
	{
		PrevGrip[0] = Rider->Grip[0], PrevGrip[1] = Rider->Grip[1];
		bHasPrevGrip = true;
	}
	else bHasPrevGrip = false;
	strapsStep(Model_, In, Out_);
	UpdateRibbons();
	RefreshPieceBounds();
	CostMs = (FPlatformTime::Seconds() - T0) * 1000.0;
}

void UStridesHorseTackMesh::RefreshPieceBounds()
{
	// Bornes des pièces recalculées à chaque image (repère du composant suivi : bornes fixes de la pièce, voir Init) : sans
	// elles, selle, tapis, sangle, filet et mors étaient absents des captures, guêtres seules visibles (constaté le 25/11/2026).
	for (USkeletalMeshComponent* C : Pieces)
	{
		if (!C || !C->IsVisible()) continue;
		C->InvalidateCachedBounds();
		C->UpdateBounds();
		C->MarkRenderTransformDirty();
	}
}

void UStridesHorseTackMesh::UpdateRibbons()
{
	for (int32 K = 0; K < 2; K++)
		if (Irons[K]) Irons[K]->SetVisibility(Out_.show);
	if (Straps) Straps->SetVisibility(Out_.show);
	if (!Out_.show) return;
	const FQuat HQ = (Horse ? Horse->GetActorQuat() : FQuat::Identity);
	for (int32 K = 0; K < 2; K++)
		if (Irons[K]) Irons[K]->SetWorldLocationAndRotation(IronWorld(K), HQ);
	// Rubans : sommets du web (2 (n + 1)), triangles du web (a, a+1, a+2 ; a+1, a+3, a+2) en sens inverse (symétrie des axes).
	for (int32 S = 0; S < 4; S++)
	{
		const std::vector<V3>& P = S < 2 ? Out_.leather[S] : Out_.rein[S - 2];
		const int32 N = (int32)P.size() / 2 - 1;
		TArray<FVector> V;
		TArray<FVector> Nrm;
		V.SetNum(P.size());
		Nrm.SetNum(P.size());
		for (int32 I = 0; I < (int32)P.size(); I++) V[I] = FromWeb(P[I]);
		for (int32 I = 0; I <= N; I++)
		{
			const FVector Along = V[2 * FMath::Min(I + 1, N)] - V[2 * FMath::Max(I - 1, 0)];
			const FVector Side = V[2 * I + 1] - V[2 * I];
			const FVector Nv = FVector::CrossProduct(Side, Along).GetSafeNormal();
			Nrm[2 * I] = Nrm[2 * I + 1] = Nv;
		}
		if (!bSectionsMade)
		{
			TArray<int32> T;
			for (int32 I = 0; I < N; I++)
			{
				const int32 A = 2 * I;
				T.Append({A, A + 2, A + 1, A + 1, A + 2, A + 3});
			}
			Straps->CreateMeshSection(S, V, T, Nrm, TArray<FVector2D>(), TArray<FColor>(), TArray<FProcMeshTangent>(), false);
		}
		else Straps->UpdateMeshSection(S, V, Nrm, TArray<FVector2D>(), TArray<FColor>(), TArray<FProcMeshTangent>());
	}
	bSectionsMade = true;
}

void UStridesHorseTackMesh::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	const UStridesHorseTack* Tack = Horse ? Horse->HorseTack() : nullptr;
	if (!bReady || !Tack || !Tack->IsReady()) return;
	// Cavalière posée par la règle (en selle) : orteils et poings relus sur son maillage posé, dans le siège de l'image.
	FRiderPoints RP;
	const AStridesRider* R = Horse->Rider;
	const FTransform SeatW = Tack->SeatWorld();
	bool bRider = false;
	if (R && R->RulesActive() && R->RulesMesh() && R->RulesRig())
	{
		const FTransform MeshToSeat = R->RulesMesh()->GetComponentTransform().GetRelativeTransform(SeatW);
		bRider = RiderPointsFromRig(R->RulesRig(), MeshToSeat, RP);
	}
	FVector Cam;
	const APlayerController* PC = GetWorld() ? GetWorld()->GetFirstPlayerController() : nullptr;
	const bool bCam = PC && PC->PlayerCameraManager;
	if (bCam) Cam = PC->PlayerCameraManager->GetCameraLocation();
	StepStraps(SeatW, Tack->Out(), bRider ? &RP : nullptr, bCam ? &Cam : nullptr);
}
