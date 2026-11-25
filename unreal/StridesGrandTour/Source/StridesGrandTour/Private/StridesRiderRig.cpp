#include "StridesRiderRig.h"
#include "StridesHorse.h"
#include "StridesHorseView.h"
#include "Components/PoseableMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/SkinnedAsset.h"
#include "HAL/PlatformTime.h"
#include "Misc/Paths.h"
#include "ReferenceSkeleton.h"
#include "StridesCore/HorseTack.h"
#include "StridesCore/MiniJson.h"
#include "StridesHorse.h"
#include "StridesHorseTack.h"
#include "TwoBoneIK.h"

using namespace strides::rider;

namespace
{
FVector V(const Vec3& P) { return FVector(P.x, P.y, P.z); }
FVector Mul(const FMatrix& M, const FVector& P)  // M · p (colonnes de M = images des axes)
{
	return FVector(M.M[0][0] * P.X + M.M[0][1] * P.Y + M.M[0][2] * P.Z, M.M[1][0] * P.X + M.M[1][1] * P.Y + M.M[1][2] * P.Z,
		M.M[2][0] * P.X + M.M[2][1] * P.Y + M.M[2][2] * P.Z);
}
}  // namespace

UStridesRiderRig::UStridesRiderRig()
{
	PrimaryComponentTick.bCanEverTick = false;
	for (int32& B : RuleToMesh) B = INDEX_NONE;
}

FVector UStridesRiderRig::ModelToMesh(const Vec3& P) const { return Mul(Axes, V(P)) * Scale + Offset; }

// Rotation du repère du modèle exprimée dans l'espace du maillage : conjugaison par la permutation signée (axe image par
// Axes ; si Axes est une symétrie, Det = −1 et l'angle change de signe).
FQuat UStridesRiderRig::ModelToMesh(const Quat& Q) const
{
	const FVector A = Mul(Axes, FVector(Q.x, Q.y, Q.z)) * Det;
	return FQuat(A.X, A.Y, A.Z, Q.w);
}

bool UStridesRiderRig::Init(UPoseableMeshComponent* InMesh, FString* Err)
{
	bReady = false;
	Mesh = InMesh;
	const auto Fail = [&](const FString& Why) {
		if (Err) *Err = Why;
		return false;
	};
	const USkinnedAsset* Asset = Mesh ? Mesh->GetSkinnedAsset() : nullptr;
	if (!Asset) return Fail(TEXT("maillage de la cavalière absent"));
	const FString Dir = FPaths::ConvertRelativePathToFull(FPaths::ProjectContentDir() / TEXT("Data"));
	RideParams Params;
	Rig R;
	J Data;
	try
	{
		std::string E;
		if (!rideParamsFromJson(loadJson(TCHAR_TO_UTF8(*(Dir / TEXT("rider_rules.json")))), Params, E)) return Fail(TEXT("rider_rules.json : ") + FString(UTF8_TO_TCHAR(E.c_str())));
		Data = loadJson(TCHAR_TO_UTF8(*(Dir / TEXT("monte_rider_f.json"))));
		if (Data["schema"].s != "strides.monte_rider/1") return Fail(TEXT("monte_rider_f.json : schéma inattendu"));
		if (!rigFromJson(Data["rig"], R, E)) return Fail(TEXT("monte_rider_f.json : ") + FString(UTF8_TO_TCHAR(E.c_str())));
		const J& F = Data["fit0"];
		Fit0 = RideFitMeters{};
		Fit0.stirrupX = F["stirrupX"].num();
		Fit0.stirrupY = F["stirrupY"].num();
		Fit0.stirrupZ = F["stirrupZ"].num();
		Fit0.kneeOut = F["kneeOut"].num();
		Fit0.handX = F["handX"].num();
		Fit0.handY = F["handY"].num();
		Fit0.handZ = F["handZ"].num();
		Fit0.legClear = F["legClear"].t == J::Num ? F["legClear"].num() : 0;
		Fit0.hasMountKneeOut = F["mountKneeOut"].t == J::Num;
		Fit0.mountKneeOut = Fit0.hasMountKneeOut ? F["mountKneeOut"].num() : 0;
	}
	catch (const std::exception& Ex)
	{
		return Fail(FString(TEXT("données de monte illisibles : ")) + UTF8_TO_TCHAR(Ex.what()));
	}
	if (R.scale != 1) return Fail(TEXT("rig de règle à une échelle différente de 1 (le maillage est à sa taille naturelle)"));
	const FReferenceSkeleton& Ref = Asset->GetRefSkeleton();
	const int32 N = Ref.GetNum();
	const auto Find = [&](const std::string& Name) { return Ref.FindBoneIndex(FName(UTF8_TO_TCHAR(Name.c_str()))); };
	// Os appariés (realistic.js MAP) ; lFing, rFing : middle_01 (direction de la main au calage seulement).
	for (int32& B : RuleToMesh) B = INDEX_NONE;
	MeshToRule.Init(INDEX_NONE, N);
	for (const J& P : Data["map"].a)
	{
		int Rb = -1;
		for (int B = 0; B < BoneCount; B++)
			if (P[0].s == boneName(B)) Rb = B;
		const int32 Mb = Find(P[1].s);
		if (Rb < 0 || Mb == INDEX_NONE) return Fail(FString::Printf(TEXT("os apparié introuvable : %hs → %hs"), P[0].s.c_str(), P[1].s.c_str()));
		RuleToMesh[Rb] = Mb;
		MeshToRule[Mb] = Rb;
	}
	RuleToMesh[LFing] = Find("middle_01_l");
	RuleToMesh[RFing] = Find("middle_01_r");
	// Étape S1 : creux du poing (realistic.js gripPoint), quatre os par côté ; à défaut, poing de la règle (FistPoint).
	for (int32 Sd = 0; Sd < 2; Sd++)
	{
		GripBones[Sd].Reset();
		for (const char* Nm : {"index_02", "middle_02", "pinky_02", "middle_01"})
		{
			const int32 B = Find(std::string(Nm) + (Sd ? "_r" : "_l"));
			if (B != INDEX_NONE) GripBones[Sd].Add(B);
		}
	}
	Pelvis = RuleToMesh[Hips];
	if (Pelvis == INDEX_NONE || RuleToMesh[LFing] == INDEX_NONE || RuleToMesh[RFing] == INDEX_NONE) return Fail(TEXT("pelvis ou middle_01 introuvable"));
	// Pose de référence du maillage, espace du composant.
	Parent.SetNum(N);
	RefT.SetNum(N);
	RefS.SetNum(N);
	CalLocal.SetNum(N);
	TArray<FTransform> RefCS;
	RefCS.SetNum(N);
	for (int32 I = 0; I < N; I++)
	{
		Parent[I] = Ref.GetParentIndex(I);
		const FTransform& L = Ref.GetRefBonePose()[I];
		RefT[I] = L.GetTranslation();
		RefS[I] = L.GetScale3D();
		CalLocal[I] = L.GetRotation();
		RefCS[I] = Parent[I] >= 0 ? L * RefCS[Parent[I]] : L;
	}
	// Repos du squelette de règle (rotations nulles) : positions dans le repère du modèle.
	Vec3 Rest[BoneCount];
	for (int B = 0; B < BoneCount; B++)
	{
		const int P = boneParent(B);
		Rest[B] = P < 0 ? R.rest[B] : Vec3{Rest[P].x + R.rest[B].x, Rest[P].y + R.rest[B].y, Rest[P].z + R.rest[B].z};
	}
	// Espace du maillage : permutation signée, échelle et décalage par moindres carrés sur le tronc et les racines des
	// membres (positions que le calage ne change pas).
	const int FitBones[9] = {Hips, Spine, Chest, Neck, Head, LClav, RClav, LThigh, RThigh};
	FVector MA = FVector::ZeroVector, MB = FVector::ZeroVector;
	for (int B : FitBones)
	{
		if (RuleToMesh[B] == INDEX_NONE) return Fail(TEXT("os du tronc non apparié"));
		MA += V(Rest[B]);
		MB += RefCS[RuleToMesh[B]].GetTranslation();
	}
	MA /= 9;
	MB /= 9;
	double Best = 1e30;
	const int Perm[6][3] = {{0, 1, 2}, {0, 2, 1}, {1, 0, 2}, {1, 2, 0}, {2, 0, 1}, {2, 1, 0}};
	for (const auto& Pm : Perm)
		for (int Sg = 0; Sg < 8; Sg++)
		{
			FMatrix M(EForceInit::ForceInitToZero);
			for (int Row = 0; Row < 3; Row++) M.M[Row][Pm[Row]] = (Sg >> Row) & 1 ? -1 : 1;
			M.M[3][3] = 1;
			double Num = 0, Den = 0;
			for (int B : FitBones)
			{
				const FVector A = Mul(M, V(Rest[B]) - MA), Bm = RefCS[RuleToMesh[B]].GetTranslation() - MB;
				Num += FVector::DotProduct(A, Bm);
				Den += A.SizeSquared();
			}
			const double S = Num / Den;
			if (S <= 0) continue;
			double Res = 0;
			for (int B : FitBones) Res += (Mul(M, V(Rest[B]) - MA) * S - (RefCS[RuleToMesh[B]].GetTranslation() - MB)).SizeSquared();
			Res = FMath::Sqrt(Res / 9);
			if (Res < Best)
			{
				Best = Res;
				Axes = M;
				Scale = S;
			}
		}
	FitRms = Best;
	Det = Axes.Determinant() < 0 ? -1 : 1;
	Offset = MB - Mul(Axes, MA) * Scale;
	if (FitRms > 0.05) return Fail(FString::Printf(TEXT("espace du maillage : résidu %.4f cm (> 0,05 cm)"), FitRms));
	// Calage (realistic.js _calibrate) : chaque membre tourné sur la direction de repos du classique, dans l'ordre ALIGN.
	TArray<FTransform> Cal = RefCS;
	const auto Refresh = [&]() {
		for (int32 I = 0; I < N; I++)
		{
			const FTransform L(CalLocal[I], RefT[I], RefS[I]);
			Cal[I] = Parent[I] >= 0 ? L * Cal[Parent[I]] : L;
		}
	};
	const auto SetWorld = [&](int32 I, const FQuat& W) {
		CalLocal[I] = Parent[I] >= 0 ? Cal[Parent[I]].GetRotation().Inverse() * W : W;
		CalLocal[I].Normalize();
		Refresh();
	};
	for (const J& A : Data["align"].a)
	{
		const int32 T = Find(A[0].s), Tc = Find(A[1].s);
		int O = -1, Oc = -1;
		for (int B = 0; B < BoneCount; B++)
		{
			if (A[2].s == boneName(B)) O = B;
			if (A[3].s == boneName(B)) Oc = B;
		}
		if (T == INDEX_NONE || Tc == INDEX_NONE || O < 0 || Oc < 0) return Fail(FString::Printf(TEXT("chaîne de calage introuvable : %hs"), A[0].s.c_str()));
		const FVector DT = (Cal[Tc].GetTranslation() - Cal[T].GetTranslation()).GetSafeNormal();
		const FVector DO = Mul(Axes, V(Rest[Oc]) - V(Rest[O])).GetSafeNormal();
		SetWorld(T, FQuat::FindBetweenNormals(DT, DO) * Cal[T].GetRotation());
	}
	// Doigts fléchis (realistic.js : rotation monde autour de l'axe du modèle, angle signe × flexion).
	const J& Curl = Data["curl"];
	const FVector CurlAxis = Mul(Axes, FVector(Curl["axis"][0].num(), Curl["axis"][1].num(), Curl["axis"][2].num())).GetSafeNormal();
	for (const char* Side : {"_l", "_r"})
		for (const J& Fg : Curl["fingers"].a)
			for (int K = 1; K <= 3; K++)
			{
				const int32 B = Find(Fg.s + "_0" + std::to_string(K) + Side);
				if (B == INDEX_NONE) continue;
				const double Ang = Curl["sign"][Side].num() * Curl["angles"][Fg.s][K - 1].num() * Det;
				SetWorld(B, FQuat(CurlAxis, Ang) * Cal[B].GetRotation());
			}
	CalCS.SetNum(N);
	for (int32 I = 0; I < N; I++) CalCS[I] = Cal[I].GetRotation();
	// Points sans os (plante, anim.js:771 ; poing, rig.fist) : repère de l'os du pied ou de la main au calage.
	for (int Side = 0; Side < 2; Side++)
	{
		const int Foot = Side ? RFoot : LFoot, Hand = Side ? RHand : LHand;
		const Vec3 SoleM{Rest[Foot].x, Rest[Foot].y - R.info.ankleY + 0.012, Rest[Foot].z + R.info.toe.z - 0.005};
		const Vec3& Fo = Side && R.hasFistR ? R.fistR : R.fist;
		const Vec3 FistM{Rest[Hand].x + Fo.x, Rest[Hand].y + Fo.y, Rest[Hand].z + Fo.z};
		SoleLocal[Side] = Cal[RuleToMesh[Foot]].InverseTransformPosition(ModelToMesh(SoleM));
		FistLocal[Side] = Cal[RuleToMesh[Hand]].InverseTransformPosition(ModelToMesh(FistM));
	}
	// Maillage dans le repère local Unreal du siège : p_siège = SeatToUnreal(p_modèle), p_modèle = Axesᵀ (p_maillage − Offset) / Scale.
	{
		FVector Img[3];
		for (int I = 0; I < 3; I++)
		{
			FVector E = FVector::ZeroVector;
			E[I] = 1;
			const FVector Pm = Mul(Axes.GetTransposed(), E) / Scale;
			Img[I] = SeatToUnreal(Vec3{Pm.X, Pm.Y, Pm.Z});
		}
		const FVector O0 = Mul(Axes.GetTransposed(), -Offset) / Scale;
		const FMatrix M(Img[0], Img[1], Img[2], SeatToUnreal(Vec3{O0.X, O0.Y, O0.Z}));
		if (M.Determinant() <= 0) return Fail(TEXT("espace du maillage : repère du siège indirect"));
		MeshInSeatT = FTransform(M);
	}
	Rot.SetNum(N);
	CS = Cal;
	Drv = std::make_unique<RideDriver>(R, Params);
	bReady = true;
	if (Err) Err->Reset();
	return true;
}

void UStridesRiderRig::ResetRide()
{
	if (Drv) Drv->reset();
}

void UStridesRiderRig::Seed(const RideInputs& First, const RideHorseSample& H, const RideFitMeters& Fit)
{
	if (Drv) Drv->seed(First, H, Fit);
}

RideInputs UStridesRiderRig::Prepare(const RideHorseSample& H, const RideFitMeters& Fit, double Dt)
{
	return Drv ? Drv->prepare(H, Fit, Dt) : RideInputs{};
}

void UStridesRiderRig::Apply(const RideInputs& In)
{
	if (Drv) Drv->apply(In);
}

RideHorseSample UStridesRiderRig::SampleFromTack(const UStridesHorseTack& Tack, double Speed, double JumpT, double LastTurn)
{
	// État du cheval de cette image (le cavalier le lira à l'image suivante : RideDriver). human.js animateRiding :
	// bob = e[13] − h.pos.y − contactOff (hauteur monde de l'os d'attache au-dessus du cheval, abaissement d'appel retiré),
	// pitch = −asin(e[9]), phase = h.anim.phase + riderPostOffset.
	const strides::tack::TackOut& O = Tack.Out();
	RideHorseSample H;
	const strides::tack::V3 Z = strides::tack::rotate(O.seatQ, strides::tack::V3{0, 0, 1});
	// Repère du cheval Unreal (acteur : origine au sol sous le cheval, ou à la hauteur du saut ; cap seul, ni tangage de
	// pente ni roulis) : ses axes sont ceux du monde à un lacet près, donc hauteur et axe z de S y valent ceux du monde
	// relatifs à h.pos du web : horseY = 0. (Le cheval du web suit la pente du terrain ; Unreal non : écart du cheval,
	// mesuré par Strides.Parite.RiderOnHorse et le ctest « monte-cheval », pas de cette conversion.)
	H.attachY = O.seatPos.y;
	H.attachZ = Vec3{Z.x, Z.y, Z.z};
	H.horseY = 0;
	// contactOff du web (pjlHorse.js _pushContact : corps abaissé à l'appel pendant que les postérieurs poussent) : avec la
	// vue du web (-StridesHorseView=web, étape S4), celui de la vue du cheval Unreal ; sans elle, le cheval Unreal n'abaisse
	// pas son corps : 0 exact.
	const AStridesHorse* Hr = Cast<AStridesHorse>(Tack.GetOwner());
	H.contactOff = Hr && Hr->UsesWebView() && Hr->HorseView() ? Hr->HorseView()->GetView().contactOff : 0;
	H.speed = Speed;
	// Phase de foulée, convention du web (étape M3 : calage des clips, UStridesHorseTack::StepPhase).
	H.phase = Tack.RiderPhase();
	// riderPostOffset : affecté nulle part dans src/ (pjl_horse_phase.json, vérifié par le ctest « monte-cheval ») : 0.
	H.postOffset = 0;
	H.jumpT = JumpT;
	H.hindDown = const_cast<UStridesHorseTack&>(Tack).State().hindDown;
	H.lastTurn = LastTurn;
	return H;
}

RideFitMeters UStridesRiderRig::FitFromTack(const UStridesHorseTack& Tack) const
{
	const strides::tack::TackOut& O = Tack.Out();
	RideFitMeters F = Fit0;
	F.flankL = O.flankL;
	F.flankR = O.flankR;
	F.crest = O.crest;
	return F;
}

bool UStridesRiderRig::StepFromHorse(const AStridesHorse* Horse, double Dt)
{
	const UStridesHorseTack* Tack = Horse ? Horse->HorseTack() : nullptr;
	if (!bReady || !Tack || !Tack->IsReady()) return false;
	const double T0 = FPlatformTime::Seconds();
	const RideHorseSample H = SampleFromTack(*Tack, Horse->SpeedMS, Horse->CsoState().jumpT, Horse->CsoState().lastTurn);
	const RideInputs In = Drv->prepare(H, FitFromTack(*Tack), Dt);
	Drv->apply(In);
	PoseMesh();
	CostMs = (FPlatformTime::Seconds() - T0) * 1000.0;
	return true;
}

// Pose de composant : os appariés à rotation absolue (Rot), autres os à leur rotation locale du calage ; positions par
// les translations de référence, bassin posé.
void UStridesRiderRig::Compose(const TArray<bool>& bAbs)
{
	const int32 N = Parent.Num();
	for (int32 I = 0; I < N; I++)
	{
		const int32 P = Parent[I];
		const FQuat Q = bAbs[I] ? Rot[I] : (P >= 0 ? CS[P].GetRotation() * CalLocal[I] : CalLocal[I]);
		FVector T = P >= 0 ? CS[P].TransformPosition(RefT[I]) : RefT[I];
		if (I == Pelvis) T = PelvisPos;
		CS[I] = FTransform(Q, T, RefS[I]);
	}
}

void UStridesRiderRig::PoseMesh()
{
	if (!bReady || !Drv) return;
	const RidePoseS P = poseInSeat(Drv->rules());
	const int32 N = Parent.Num();
	TArray<bool> bAbs;
	bAbs.Init(false, N);
	// realistic.js update : rotation monde de l'os classique × décalage du calage ; bassin = bassin classique (hipScale 1 :
	// le rig de règle a les proportions du modèle).
	for (int32 I = 0; I < N; I++)
		if (MeshToRule[I] != INDEX_NONE)
		{
			bAbs[I] = true;
			Rot[I] = ModelToMesh(P.world[MeshToRule[I]]) * CalCS[I];
			Rot[I].Normalize();
		}
	PelvisPos = ModelToMesh(P.joints[Hips]);
	Compose(bAbs);
	// Deux os par membre (équivalent de TwoBoneIKSimplePerItem) : cible = articulation d'extrémité de la règle, pôle en
	// position = genou ou coude de la règle (kneeOf), étirement désactivé.
	IKCorrection = 0;
	for (const Limb& L : kRideLimbs)
	{
		const int32 A = RuleToMesh[L.root], B = RuleToMesh[L.joint], C = RuleToMesh[L.end];
		const FVector PA = CS[A].GetTranslation(), PB = CS[B].GetTranslation(), PC = CS[C].GetTranslation();
		const FVector Effector = ModelToMesh(P.joints[L.end]);
		const FVector Pole = ModelToMesh(P.joints[L.joint]);
		FVector OutB, OutC;
		AnimationCore::SolveTwoBoneIK(PA, PB, PC, Pole, Effector, OutB, OutC, bEnableStretch, StretchStartRatio, StretchMaximumRatio);
		IKCorrection = FMath::Max(IKCorrection, FMath::Max((OutB - PB).Size(), (OutC - PC).Size()));
		Rot[A] = FQuat::FindBetweenVectors(PB - PA, OutB - PA) * Rot[A];
		Compose(bAbs);
		const FVector PB2 = CS[B].GetTranslation(), PC2 = CS[C].GetTranslation();
		Rot[B] = FQuat::FindBetweenVectors(PC2 - PB2, OutC - PB2) * Rot[B];
		Compose(bAbs);
	}
	if (Mesh)
	{
		Mesh->BoneSpaceTransforms.SetNum(N);
		for (int32 I = 0; I < N; I++) Mesh->BoneSpaceTransforms[I] = Parent[I] >= 0 ? CS[I].GetRelativeTransform(CS[Parent[I]]) : CS[I];
		Mesh->MarkRefreshTransformDirty();
		Mesh->RefreshBoneTransforms();
	}
}

FVector UStridesRiderRig::SolePoint(int32 Side) const
{
	const int32 B = RuleToMesh[Side ? RFoot : LFoot];
	return B != INDEX_NONE && CS.IsValidIndex(B) ? CS[B].TransformPosition(SoleLocal[Side]) : FVector::ZeroVector;
}

FVector UStridesRiderRig::FistPoint(int32 Side) const
{
	const int32 B = RuleToMesh[Side ? RHand : LHand];
	return B != INDEX_NONE && CS.IsValidIndex(B) ? CS[B].TransformPosition(FistLocal[Side]) : FVector::ZeroVector;
}

FVector UStridesRiderRig::ToePoint(int32 Side) const
{
	const int32 B = RuleToMesh[Side ? RToe : LToe];
	return B != INDEX_NONE && CS.IsValidIndex(B) ? CS[B].GetTranslation() : FVector::ZeroVector;
}

FVector UStridesRiderRig::GripPoint(int32 Side) const
{
	const TArray<int32>& G = GripBones[Side ? 1 : 0];
	if (G.Num() != 4) return FistPoint(Side);
	FVector P = FVector::ZeroVector;
	for (int32 B : G) P += CS.IsValidIndex(B) ? CS[B].GetTranslation() : FVector::ZeroVector;
	return P / 4.0;
}
