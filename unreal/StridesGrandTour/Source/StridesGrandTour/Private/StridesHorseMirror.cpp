// Clips miroir du cheval Unreal (voir StridesHorseMirror.h) : cuisson par StridesCore/HorseMirror, lecture et mélange.
#include "StridesHorseMirror.h"

#include "Animation/AnimSequence.h"
#include "Animation/AnimationPoseData.h"
#include "Animation/AttributesRuntime.h"
#include "BonePose.h"
#include "Engine/SkeletalMesh.h"
#include "HAL/PlatformTime.h"

using namespace strides::mirror;

namespace
{
Xf ToXf(const FTransform& T)
{
	Xf X;
	const FVector P = T.GetTranslation(), S = T.GetScale3D();
	const FQuat Q = T.GetRotation();
	X.p[0] = P.X, X.p[1] = P.Y, X.p[2] = P.Z;
	X.q[0] = Q.X, X.q[1] = Q.Y, X.q[2] = Q.Z, X.q[3] = Q.W;
	X.s[0] = S.X, X.s[1] = S.Y, X.s[2] = S.Z;
	return X;
}
// three.js Quaternion.slerpFlat (three 0.170.0), via le cœur.
FQuat SlerpFlatQ(const FQuat& A, const FQuat& B, double T)
{
	const double a[4] = {A.X, A.Y, A.Z, A.W}, b[4] = {B.X, B.Y, B.Z, B.W};
	double o[4];
	slerpFlat(a, b, T, o);
	return FQuat(o[0], o[1], o[2], o[3]);
}
}  // namespace

namespace StridesHorseAnim
{
bool IsWebRoot(const FName& Bone)
{
	static const FName R0(TEXT("root_04")), R1(TEXT("_rootJoint")), R2(TEXT("rootmountpoint_01_0289"));
	return Bone == R0 || Bone == R1 || Bone == R2;
}

bool SampleLocal(const UAnimSequence* Seq, const USkeletalMesh* SkM, double T, bool bWebRoots, TArray<FTransform>& L, bool bRaw)
{
	if (!Seq || !SkM) return false;
	FMemMark Mark(FMemStack::Get());
	const FReferenceSkeleton& Ref = SkM->GetRefSkeleton();
	const int32 N = Ref.GetNum();
	TArray<FBoneIndexType> Req;
	for (int32 I = 0; I < N; I++) Req.Add((FBoneIndexType)I);
	FBoneContainer BC(Req, UE::Anim::FCurveFilterSettings(UE::Anim::ECurveFilterMode::DisallowAll), *const_cast<USkeletalMesh*>(SkM));
	FCompactPose Pose;
	Pose.SetBoneContainer(&BC);
	Pose.ResetToRefPose();
	FBlendedCurve Curve;
	Curve.InitFrom(BC);
	UE::Anim::FStackAttributeContainer Attr;
	FAnimationPoseData PD(Pose, Curve, Attr);
	Seq->GetBonePose(PD, FAnimExtractContext(T, false), bRaw);
	L.SetNum(N);
	for (int32 I = 0; I < N; I++)
	{
		const FCompactPoseBoneIndex CI = BC.MakeCompactPoseIndex(FMeshPoseBoneIndex(I));
		if (!CI.IsValid()) return false;
		L[I] = Pose[CI];
	}
	if (bWebRoots)
		for (int32 I = 0; I < N; I++)
			if (IsWebRoot(Ref.GetBoneName(I))) L[I] = Ref.GetRefBonePose()[I];
	return true;
}

void LocalToComponent(const FReferenceSkeleton& Ref, const TArray<FTransform>& L, TArray<FTransform>& CS)
{
	CS.SetNum(L.Num());
	for (int32 I = 0; I < L.Num(); I++)
	{
		const int32 P = Ref.GetParentIndex(I);
		CS[I] = P >= 0 ? L[I] * CS[P] : L[I];
	}
}

void Mix(TArray<FTransform>& Acc, const TArray<FTransform>& In, double T)
{
	for (int32 I = 0; I < Acc.Num(); I++)
		Acc[I] = FTransform(SlerpFlatQ(Acc[I].GetRotation(), In[I].GetRotation(), T), Acc[I].GetTranslation() * (1 - T) + In[I].GetTranslation() * T,
			Acc[I].GetScale3D() * (1 - T) + In[I].GetScale3D() * T);
}
}  // namespace StridesHorseAnim

double FStridesHorseMirrorSet::WebDuration(const UAnimSequence* Seq)
{
	// Durée d'un clip du web : dernier temps de clé glTF, flottant 32 bits (17/24 s → 0,7083333134651184). GetPlayLength
	// rend déjà un float (UE 5.8) : l'arrondi est un garde-fou, sans effet aujourd'hui.
	return Seq ? (double)(float)Seq->GetPlayLength() : 0;
}

bool FStridesHorseMirrorSet::Build(const USkeletalMesh* SkM, const FString& ClipRoot, FString* Err, bool bRaw)
{
	const double T0 = FPlatformTime::Seconds();
	auto Fail = [Err](const FString& M) {
		if (Err) *Err = M;
		return false;
	};
	Clips.Reset();
	Sources.Reset();
	Names.Reset();
	if (!SkM) return Fail(TEXT("maillage absent"));
	SkMesh = SkM;
	const FReferenceSkeleton& Ref = SkM->GetRefSkeleton();
	const int32 N = Ref.GetNum();
	MRig = Rig();
	for (int32 I = 0; I < N; I++)
	{
		MRig.names.push_back(TCHAR_TO_UTF8(*Ref.GetBoneName(I).ToString()));
		MRig.parent.push_back(Ref.GetParentIndex(I));
		MRig.rest.push_back(ToXf(Ref.GetRefBonePose()[I]));
		MRig.parentWorld.push_back(Mat4());  // espace du composant
	}
	MPairs = pairIndices(MRig);
	bRawData = bRaw;
	auto Load = [&ClipRoot](const FString& Name) {
		UAnimSequence* Seq = LoadObject<UAnimSequence>(nullptr, *(ClipRoot + Name + TEXT(".Horse_") + Name));
#if WITH_EDITOR
		if (Seq) Seq->WaitOnExistingCompression();
#endif
		return Seq;
	};
	// Plan de symétrie : bras au clip idle à 0,5 s (pjl/asset.js : pose('idle', 0.5)).
	const UAnimSequence* Idle = Load(TEXT("idle"));
	TArray<FTransform> L;
	if (!StridesHorseAnim::SampleLocal(Idle, SkM, 0.5, true, L, bRaw)) return Fail(TEXT("clip idle absent"));
	std::vector<Xf> Pose(N);
	for (int32 I = 0; I < N; I++) Pose[I] = ToXf(L[I]);
	if (!symmetryPlane(MRig, Pose, MPlane)) return Fail(TEXT("bras upperarm_l ou upperarm_r absents"));
	const Mat4 S = reflection(MPlane);
	for (const std::string& Src : mirroredSources())
	{
		const FString SrcName = UTF8_TO_TCHAR(Src.c_str());
		const UAnimSequence* Seq = Load(SrcName);
		if (!Seq) return Fail(FString::Printf(TEXT("clip %s absent"), *SrcName));
		const SourcePose Source = [&](int, double ClipT, std::vector<Xf>& P) {
			if (!StridesHorseAnim::SampleLocal(Seq, SkM, ClipT, true, L, bRaw)) return false;
			for (int32 I = 0; I < N; I++) P[I] = ToXf(L[I]);
			return true;
		};
		strides::mirror::Clip C;
		if (!bakeMirror(MRig, MPairs, S, WebDuration(Seq), Source, C)) return Fail(FString::Printf(TEXT("cuisson de %s"), *SrcName));
		C.name = mirroredName(Src);
		Clips.Add(MoveTemp(C));
		Sources.Add(Seq);
		Names.Add(UTF8_TO_TCHAR(Clips.Last().name.c_str()));
	}
	BuildTimeMs = (FPlatformTime::Seconds() - T0) * 1000.0;
	return true;
}

int32 FStridesHorseMirrorSet::Find(const FString& MirrorName) const { return Names.IndexOfByKey(MirrorName); }

bool FStridesHorseMirrorSet::SampleLocal(int32 I, double T, bool bWebRoots, TArray<FTransform>& L) const
{
	if (!SkMesh || !Clips.IsValidIndex(I)) return false;
	const FReferenceSkeleton& Ref = SkMesh->GetRefSkeleton();
	const int32 N = Ref.GetNum();
	L = Ref.GetRefBonePose();
	if (!bWebRoots)
	{
		// Racines : pose du clip source au même instant (le jeu joue ainsi les clips d'origine).
		TArray<FTransform> Src;
		if (!StridesHorseAnim::SampleLocal(Sources[I], SkMesh, T, false, Src)) return false;
		for (int32 B = 0; B < N; B++)
			if (StridesHorseAnim::IsWebRoot(Ref.GetBoneName(B))) L[B] = Src[B];
	}
	std::vector<Xf> P(N);
	const strides::mirror::Clip& C = Clips[I];
	C.sample(T, P);
	for (const int B : C.bones)
		L[B] = FTransform(FQuat(P[B].q[0], P[B].q[1], P[B].q[2], P[B].q[3]), FVector(P[B].p[0], P[B].p[1], P[B].p[2]), L[B].GetScale3D());
	return true;
}

void FStridesHorseAnimProxy::PreUpdate(UAnimInstance* InAnimInstance, float DeltaSeconds)
{
	FAnimInstanceProxy::PreUpdate(InAnimInstance, DeltaSeconds);
	if (const UStridesHorseAnimInstance* A = Cast<UStridesHorseAnimInstance>(InAnimInstance))
	{
		Layers = A->Layers;
		Set = A->Set;
	}
}

bool FStridesHorseAnimProxy::Evaluate(FPoseContext& Output)
{
	FCompactPose& Pose = Output.Pose;
	const FBoneContainer& BC = Pose.GetBoneContainer();
	Pose.ResetToRefPose();
	const int32 NC = Pose.GetNumBones();
	TArray<FTransform> Acc, In, MeshL;
	In.SetNum(NC);
	double W = 0;
	for (const FStridesHorseLayer& Ly : Layers)
	{
		if (Ly.Weight <= 0) continue;
		if (Ly.Mirror != INDEX_NONE)
		{
			if (!Set.IsValid() || !Set->SampleLocal(Ly.Mirror, Ly.Time, false, MeshL)) continue;
			for (const FCompactPoseBoneIndex CI : Pose.ForEachBoneIndex()) In[CI.GetInt()] = MeshL[BC.MakeMeshPoseIndex(CI).GetInt()];
		}
		else if (Ly.Seq)
		{
			FMemMark Mark(FMemStack::Get());
			FCompactPose Tmp;
			Tmp.SetBoneContainer(&BC);
			Tmp.ResetToRefPose();
			FBlendedCurve Curve;
			Curve.InitFrom(BC);
			UE::Anim::FStackAttributeContainer Attr;
			FAnimationPoseData PD(Tmp, Curve, Attr);
			Ly.Seq->GetBonePose(PD, FAnimExtractContext(Ly.Time, false));
			for (const FCompactPoseBoneIndex CI : Tmp.ForEachBoneIndex()) In[CI.GetInt()] = Tmp[CI];
		}
		else continue;
		if (W == 0) Acc = In, W = Ly.Weight;
		else
		{
			W += Ly.Weight;
			StridesHorseAnim::Mix(Acc, In, Ly.Weight / W);
		}
	}
	if (W == 0) return true;
	if (W < 1)
	{
		for (const FCompactPoseBoneIndex CI : Pose.ForEachBoneIndex()) In[CI.GetInt()] = BC.GetRefPoseTransform(CI);
		StridesHorseAnim::Mix(Acc, In, 1 - W);
	}
	for (const FCompactPoseBoneIndex CI : Pose.ForEachBoneIndex()) Pose[CI] = Acc[CI.GetInt()];
	return true;
}

double UStridesHorseAnimInstance::Phase() const
{
	for (const FStridesHorseLayer& Ly : Layers)
	{
		const double Len = Ly.Seq ? Ly.Seq->GetPlayLength() : Set.IsValid() && Ly.Mirror != INDEX_NONE ? Set->Clip(Ly.Mirror).duration : 0;
		if (Len > 0) return FMath::Frac(Ly.Time / Len);
	}
	return -1;
}
