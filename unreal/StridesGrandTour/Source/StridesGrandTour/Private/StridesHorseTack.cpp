#include "StridesHorseTack.h"
#include "AnimationRuntime.h"
#include "Animation/AnimSequenceBase.h"
#include "Animation/AnimSingleNodeInstance.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "HAL/PlatformTime.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "StridesCore/MiniJson.h"
#include "StridesHorse.h"
#include "StridesUnits.h"

using namespace strides::tack;

UStridesHorseTack::UStridesHorseTack()
{
	// Lu après la pose de l'image (comme pjlHorse.js, appelé après la vue) ; inactif tant que rien ne l'active.
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = false;
	PrimaryComponentTick.TickGroup = TG_PostUpdateWork;
}

Affine UStridesHorseTack::ToAffine(const FMatrix& M)
{
	// FMatrix d'Unreal : vecteur ligne, p' = p · M (translation en M[3]).
	Affine A;
	for (int R = 0; R < 3; R++)
	{
		for (int C = 0; C < 3; C++) A.m[R * 4 + C] = M.M[C][R];
		A.m[R * 4 + 3] = M.M[3][R];
	}
	return A;
}

bool UStridesHorseTack::Init(USkeletalMeshComponent* InMesh, FString* Err)
{
	bReady = false;
	auto Fail = [Err](const FString& Why) {
		if (Err) *Err = Why;
		UE_LOG(LogTemp, Warning, TEXT("Strides sellerie : %s"), *Why);
		return false;
	};
	Mesh = InMesh;
	const USkeletalMesh* Asset = Mesh ? Mesh->GetSkeletalMeshAsset() : nullptr;
	if (!Asset) return Fail(TEXT("maillage du cheval absent"));
	FString Text;
	const FString Path = FPaths::ProjectContentDir() / TEXT("Data/pjl_horse_tack.json");
	if (!FFileHelper::LoadFileToString(Text, *Path)) return Fail(TEXT("Content/Data/pjl_horse_tack.json introuvable (scripts/unreal/export-horse-tack.mjs)"));
	try
	{
		const std::string Src(TCHAR_TO_UTF8(*Text));
		Model_ = tackModelFromJson(JParser(Src).parse());
	}
	catch (const std::exception& Ex)
	{
		return Fail(UTF8_TO_TCHAR(Ex.what()));
	}
	// Conversion d'axes : positions de repos des articulations (scène du GLB) contre la pose de référence du maillage.
	const FReferenceSkeleton& Ref = Asset->GetRefSkeleton();
	std::vector<V3> From, To;
	for (size_t I = 0; I < Model_.jointNames.size(); I++)
	{
		const int32 B = Ref.FindBoneIndex(FName(UTF8_TO_TCHAR(Model_.jointNames[I].c_str())));
		if (B == INDEX_NONE) continue;
		const FVector P = FAnimationRuntime::GetComponentSpaceTransformRefPose(Ref, B).GetLocation();
		From.push_back(Model_.jointRest[I]);
		To.push_back({P.X, P.Y, P.Z});
	}
	FitJoints = (int32)From.size();
	if (FitJoints < 400) return Fail(FString::Printf(TEXT("%d articulations retrouvées par nom dans le maillage (419 attendues)"), FitJoints));
	if (!fitAffine(From, To, Glb2Mesh, FitRms)) return Fail(TEXT("conversion d'axes dégénérée"));
	double Extent = 0;
	for (const V3& P : To) Extent = FMath::Max(Extent, FMath::Sqrt(P.x * P.x + P.y * P.y + P.z * P.z));
	if (!(FitRms <= 1e-3 * Extent)) return Fail(FString::Printf(TEXT("conversion d'axes : résidu %g pour une taille %g"), FitRms, Extent));
	BoneIndex.Reset();
	RestInv.clear();
	for (const std::string& Name : Model_.bones)
	{
		const int32 B = Ref.FindBoneIndex(FName(UTF8_TO_TCHAR(Name.c_str())));
		if (B == INDEX_NONE) return Fail(FString::Printf(TEXT("os %s absent du maillage"), UTF8_TO_TCHAR(Name.c_str())));
		BoneIndex.Add(B);
		const FMatrix RestM = FAnimationRuntime::GetComponentSpaceTransformRefPose(Ref, B).ToMatrixWithScale();
		RestInv.push_back(compose(ToAffine(RestM.Inverse()), Glb2Mesh));
	}
	Skin.assign(Model_.bones.size(), Affine());
	ResetState();
	return bReady = true;
}

void UStridesHorseTack::ResetState()
{
	State_ = freshState(Model_);
	Out_ = TackOut();
}

Affine UStridesHorseTack::GameMeshToHolder() const
{
	// Repère local de l'acteur (cm ; X avant, Y droite, Z haut) → repère du cheval du web (m ; x gauche, y haut, z avant).
	Affine D;
	const double V[12] = {0, -0.01, 0, 0, 0, 0, 0.01, 0, 0.01, 0, 0, 0};
	for (int I = 0; I < 12; I++) D.m[I] = V[I];
	const AActor* Owner = GetOwner();
	if (!Mesh || !Owner) return D;
	const FTransform Rel = Mesh->GetComponentTransform().GetRelativeTransform(Owner->GetActorTransform());
	return compose(D, ToAffine(Rel.ToMatrixWithScale()));
}

void UStridesHorseTack::StepPose(const TArray<FTransform>& CS, const Affine& MeshToHolder, double Dt, double Roll, bool bJumping,
	const std::function<double(const V3&)>& HeightAboveGround)
{
	if (!bReady) return;
	const double T0 = FPlatformTime::Seconds();
	for (int32 K = 0; K < BoneIndex.Num(); K++)
	{
		const int32 B = BoneIndex[K];
		if (!CS.IsValidIndex(B)) return;
		Skin[K] = compose(MeshToHolder, compose(ToAffine(CS[B].ToMatrixWithScale()), RestInv[K]));
	}
	// pjlHorse.js : horloge de réception (_snapshot), siège et profils (_attachRider, _flankUpdate), postérieurs (update).
	landStep(State_, bJumping, Dt);
	seatStep(Model_, State_, Skin, Roll, Dt, Out_);
	const double Toes[2] = {HeightAboveGround(Out_.toe[0]), HeightAboveGround(Out_.toe[1])};
	hindStep(Model_, State_, bJumping, Toes);
	CostMs = (FPlatformTime::Seconds() - T0) * 1000.0;
}

void UStridesHorseTack::Step(float Dt)
{
	if (!bReady || !Mesh) return;
	const AStridesHorse* Horse = Cast<AStridesHorse>(GetOwner());
	const AActor* Owner = GetOwner();
	const FTransform Actor = Owner ? Owner->GetActorTransform() : FTransform::Identity;
	// Hauteur au-dessus du sol du relief (H.groundAt du web) ; sans cheval du jeu : au-dessus du plan de l'acteur.
	auto Height = [Horse, &Actor](const V3& P) {
		double X, Y, Z;
		StridesUnits::UEToWeb(Actor.TransformPosition(HolderToActor(P)), X, Y, Z);
		return Horse ? Y - Horse->GroundAt(X, Z) : P.y;
	};
	// (roulis de la vue : le cheval Unreal ne s'incline pas dans les virages, inclinaison nulle)
	StepPose(Mesh->GetComponentSpaceTransforms(), GameMeshToHolder(), Dt, 0.0, Horse && Horse->IsJumping(), Height);
}

void UStridesHorseTack::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	Step(DeltaTime);
}

FTransform UStridesHorseTack::SeatInActor() const
{
	// Rotation du repère S (axes du web) exprimée dans les axes de l'acteur : conjugaison par la symétrie X = z, Y = −x, Z = y.
	const Q4& Q = Out_.seatQ;
	const V3 Ax = rotate(Q, {0, 0, 1}), Ay = rotate(Q, {-1, 0, 0}), Az = rotate(Q, {0, 1, 0});
	const FVector X = HolderToActor(Ax) / 100.0, Y = HolderToActor(Ay) / 100.0, Z = HolderToActor(Az) / 100.0;
	const FMatrix M(X, Y, Z, FVector::ZeroVector);
	return FTransform(M.ToQuat(), HolderToActor(Out_.seatPos));
}

FTransform UStridesHorseTack::SeatWorld() const
{
	const AActor* Owner = GetOwner();
	return Owner ? SeatInActor() * Owner->GetActorTransform() : SeatInActor();
}

double UStridesHorseTack::PlayedClipPhase() const
{
	const UAnimSingleNodeInstance* Single = Mesh ? Mesh->GetSingleNodeInstance() : nullptr;
	const UAnimSequenceBase* Seq = Single ? Cast<UAnimSequenceBase>(Single->GetAnimationAsset()) : nullptr;
	if (!Seq || Seq->GetPlayLength() <= 0) return -1;
	return FMath::Frac(Single->GetCurrentTime() / Seq->GetPlayLength());
}
