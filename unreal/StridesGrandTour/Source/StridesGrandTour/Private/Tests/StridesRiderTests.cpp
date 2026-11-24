// Essai de monte, voie A, étape 5 (R0) : le cheval Unreal fournit ce que la règle de monte lit.
//  Strides.Parite.HorseSeat : AStridesHorse dans un monde de test (maillage et clips du jeu) ; UStridesHorseTack initialisé
//  sur son maillage. Puis, aux images de l'oracle O1 (unreal/core/tests/oracles/monte/o1) où un seul clip du mélangeur
//  WildMesh pèse au moins 0,99 ET existe dans Unreal (« idle » : E1 entier, fin d'E1b ; les clips en miroir du web, à main
//  gauche, n'existent pas dans Unreal), le clip Unreal est échantillonné au temps du canal mx et le composant calcule, avec
//  le groupe intérieur de la vue du web (échelle, sol, lacet) et le corps (hauteur, inclinaison) de cette image : siège S
//  dans le repère du cheval, ancres dans S, profils du flanc et de l'encolure, hauteurs des postérieurs, postérieurs
//  reposés. Comparaison au canal hz, conversion X = 100 z, Y = −100 x, Z = 100 y pour l'affichage. Tolérances du plan
//  (étape 5) : ancres ≤ 0,5 cm, orientation du siège ≤ 0,5°, chaque tranche de profil ≤ 0,5 cm, coût ≤ 0,1 ms par image.
//  Mesure préalable (plan, étape 5) : spine_04_09 et saddle_0168 au-dessus du sol, cheval posé comme dans le jeu Unreal
//  (échelle 0,01, sans lacet ni décalage du sol) contre le même cheval posé comme le web, au clip idle à 0,5 s
//  (pjl/asset.js : calibrage de l'échelle sur spine_04 à 1,48 m au-dessus des articulations des sabots).
#include "Misc/AutomationTest.h"
#include <cmath>
#include <cstdio>
#include <vector>
#include "AnimationRuntime.h"
#include "Animation/AnimSequence.h"
#include "Animation/AnimationPoseData.h"
#include "Animation/AttributesRuntime.h"
#include "BonePose.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/World.h"
#include "HAL/PlatformTime.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "StridesCore/HorseTack.h"
#include "StridesCore/MiniJson.h"
#include "StridesHorse.h"
#include "StridesHorseTack.h"
#include "StridesHorseMirror.h"
#include "StridesCore/HorseMirror.h"

using namespace strides::tack;

namespace StridesRiderTest
{
const FString MonteDir() { return FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../core/tests/oracles/monte")); }
struct FTestWorld
{
	UGameInstance* GI = nullptr;
	UWorld* World = nullptr;
	FTestWorld(const TCHAR* Name)
	{
		GI = NewObject<UGameInstance>(GEngine);
		GI->AddToRoot();
		GI->InitializeStandalone(Name);
		World = GI->GetWorld();
	}
	~FTestWorld()
	{
		GI->Shutdown();
		if (World)
		{
			GEngine->DestroyWorldContext(World);
			World->DestroyWorld(false);
		}
		GI->RemoveFromRoot();
	}
};
// Pose locale d'un clip à un instant (squelette de référence du maillage). bWebRoots : os dont le web retire les pistes
// (pjl/asset.js : root_04, _rootJoint, rootmountpoint_01_0289) laissés à la pose de référence, comme dans le web ; sinon,
// pose du clip telle que le jeu Unreal la joue (Interchange y a cuit la rotation de 90° de la racine de la scène).
bool SampleLocal(const UAnimSequence* Seq, const USkeletalMesh* SkM, double T, bool bWebRoots, TArray<FTransform>& L, bool bRaw = false)
{
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
		for (const TCHAR* Root : {TEXT("root_04"), TEXT("_rootJoint"), TEXT("rootmountpoint_01_0289")})
		{
			const int32 B = Ref.FindBoneIndex(FName(Root));
			if (B != INDEX_NONE) L[B] = Ref.GetRefBonePose()[B];
		}
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
bool SamplePose(const UAnimSequence* Seq, const USkeletalMesh* SkM, double T, bool bWebRoots, TArray<FTransform>& CS)
{
	TArray<FTransform> L;
	if (!SampleLocal(Seq, SkM, T, bWebRoots, L)) return false;
	LocalToComponent(SkM->GetRefSkeleton(), L, CS);
	return true;
}
// three.js Quaternion.slerpFlat (three 0.170.0).
FQuat SlerpFlat(const FQuat& A, const FQuat& B, double T)
{
	if (T == 0) return A;
	if (T == 1) return B;
	double S = 1 - T;
	const double Cos = A.X * B.X + A.Y * B.Y + A.Z * B.Z + A.W * B.W, Dir = Cos >= 0 ? 1 : -1, SqrSin = 1 - Cos * Cos;
	if (SqrSin > 2.220446049250313e-16)
	{
		const double Sin = FMath::Sqrt(SqrSin), Len = FMath::Atan2(Sin, Cos * Dir);
		S = FMath::Sin(S * Len) / Sin;
		T = FMath::Sin(T * Len) / Sin;
	}
	const double TDir = T * Dir;
	FQuat Q(A.X * S + B.X * TDir, A.Y * S + B.Y * TDir, A.Z * S + B.Z * TDir, A.W * S + B.W * TDir);
	if (S == 1 - T)
	{
		const double F = 1 / FMath::Sqrt(Q.X * Q.X + Q.Y * Q.Y + Q.Z * Q.Z + Q.W * Q.W);
		Q = FQuat(Q.X * F, Q.Y * F, Q.Z * F, Q.W * F);
	}
	return Q;
}
// three.js PropertyMixer : accumulate (première action copiée, puis mélange au poids relatif), apply (pose d'origine pour
// le complément à 1). Positions et échelles : lerp ; rotations : slerpFlat. Os par os, en repère local.
void Mix(TArray<FTransform>& Acc, const TArray<FTransform>& In, double T)
{
	for (int32 I = 0; I < Acc.Num(); I++)
		Acc[I] = FTransform(SlerpFlat(Acc[I].GetRotation(), In[I].GetRotation(), T), Acc[I].GetTranslation() * (1 - T) + In[I].GetTranslation() * T,
			Acc[I].GetScale3D() * (1 - T) + In[I].GetScale3D() * T);
}
V3 V(const J& A) { return {A[0].num(), A[1].num(), A[2].num()}; }
double Dist(const V3& A, const V3& B) { return FMath::Sqrt((A.x - B.x) * (A.x - B.x) + (A.y - B.y) * (A.y - B.y) + (A.z - B.z) * (A.z - B.z)); }
Q4 Mul(const Q4& A, const Q4& B)
{
	return {A.x * B.w + A.w * B.x + A.y * B.z - A.z * B.y, A.y * B.w + A.w * B.y + A.z * B.x - A.x * B.z, A.z * B.w + A.w * B.z + A.x * B.y - A.y * B.x,
		A.w * B.w - A.x * B.x - A.y * B.y - A.z * B.z};
}
Q4 Conj(const Q4& Q) { return {-Q.x, -Q.y, -Q.z, Q.w}; }
// S dans H (repère du cheval) depuis les poses monde de hz.
void SeatInHolder(const J& Hz, V3& Pos, Q4& Q)
{
	const J& S = Hz["S"];
	const J& H = Hz["H"];
	const Q4 Qs{S[3].num(), S[4].num(), S[5].num(), S[6].num()}, Qh{H[3].num(), H[4].num(), H[5].num(), H[6].num()};
	Pos = rotate(Conj(Qh), {S[0].num() - H[0].num(), S[1].num() - H[1].num(), S[2].num() - H[2].num()});
	Q = Mul(Conj(Qh), Qs);
}
double AngleDeg(const Q4& A, const Q4& B)
{
	const double D = FMath::Abs(A.x * B.x + A.y * B.y + A.z * B.z + A.w * B.w);
	return FMath::RadiansToDegrees(2 * FMath::Acos(FMath::Min(1.0, D)));
}
// Corps de la vue (pjl/view.js : body.position.y, body.rotation.z) ∘ groupe intérieur : scène du GLB → repère du cheval.
Affine WebBody(const TackModel& M, double By, double Rz)
{
	const double C = FMath::Cos(Rz), S = FMath::Sin(Rz);
	Affine B;
	const double Vv[12] = {C, -S, 0, 0, S, C, 0, By, 0, 0, 1, 0};
	for (int I = 0; I < 12; I++) B.m[I] = Vv[I];
	return compose(B, innerAffine(M));
}
struct FWorst
{
	double V = -1;
	FString Where;
	void See(double X, const FString& W)
	{
		if (FMath::IsNaN(X)) X = 1e30;
		if (X > V) V = X, Where = W;
	}
};
}  // namespace StridesRiderTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesHorseSeatTest, "Strides.Parite.HorseSeat", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FStridesHorseSeatTest::RunTest(const FString&)
{
	using namespace StridesRiderTest;
	FTestWorld W(TEXT("StridesHorseSeatTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	AStridesHorse* Horse = W.World->SpawnActor<AStridesHorse>(FVector::ZeroVector, FRotator::ZeroRotator);
	if (!TestNotNull(TEXT("cheval"), Horse)) return false;
	TestNull(TEXT("jeu par défaut : sellerie non créée sans -StridesRider=regles"), Horse->HorseTack());
	USkeletalMeshComponent* Mesh = Horse->BodyMesh();
	const USkeletalMesh* SkM = Mesh ? Mesh->GetSkeletalMeshAsset() : nullptr;
	if (!TestNotNull(TEXT("maillage du cheval"), SkM)) return false;
	const UAnimSequence* Idle = LoadObject<UAnimSequence>(nullptr, TEXT("/Game/Characters/Horse/horse_pjl_normalized/horse_pjl_normalized/SkeletalMeshes/Horse_idle.Horse_idle"));
	if (!TestNotNull(TEXT("clip idle du cheval"), Idle)) return false;
	UStridesHorseTack* Tack = NewObject<UStridesHorseTack>(Horse);
	FString Err;
	if (!TestTrue(FString::Printf(TEXT("sellerie initialisée (%s)"), *Err), Tack->Init(Mesh, &Err))) return false;
	const TackModel& M = Tack->Model();
	const Affine Glb2Mesh = Tack->GlbToMesh();
	const double Det = det3(Glb2Mesh), K = std::cbrt(FMath::Abs(Det));
	TestTrue(FString::Printf(TEXT("conversion d'axes GLB → maillage : %d articulations, résidu %.3g (unités du maillage), échelle %.6g, déterminant %s"), Tack->AxisFitJoints(),
				 Tack->AxisFitRms(), K, Det < 0 ? TEXT("négatif (symétrie)") : TEXT("positif")),
		Tack->AxisFitJoints() == 419);
	AddInfo(FString::Printf(TEXT("conversion GLB → maillage : %d articulations, résidu %.4g ; lignes [%.5g %.5g %.5g | %.5g] [%.5g %.5g %.5g | %.5g] [%.5g %.5g %.5g | %.5g]"),
		Tack->AxisFitJoints(), Tack->AxisFitRms(), Glb2Mesh.m[0], Glb2Mesh.m[1], Glb2Mesh.m[2], Glb2Mesh.m[3], Glb2Mesh.m[4], Glb2Mesh.m[5], Glb2Mesh.m[6], Glb2Mesh.m[7],
		Glb2Mesh.m[8], Glb2Mesh.m[9], Glb2Mesh.m[10], Glb2Mesh.m[11]));
	const Affine Mesh2Glb = invert(Glb2Mesh);
	auto NoGround = [](const V3& P) { return P.y; };
	TArray<FTransform> CS;

	// ---- Mesure préalable : hauteurs de spine_04_09 et saddle_0168, cheval du jeu Unreal contre cheval posé comme le web.
	{
		const FReferenceSkeleton& Ref = SkM->GetRefSkeleton();
		TArray<FTransform> Game, Web;
		if (!TestTrue(TEXT("pose idle à 0,5 s"), SamplePose(Idle, SkM, 0.5, false, Game) && SamplePose(Idle, SkM, 0.5, true, Web))) return false;
		// La pose échantillonnée est celle que le maillage du jeu évalue (mode à un seul clip, même instant).
		Mesh->PlayAnimation(const_cast<UAnimSequence*>(Idle), false);
		Mesh->SetPosition(0.5f, false);
		Mesh->TickAnimation(0.f, false);
		Mesh->RefreshBoneTransforms();
		const TArray<FTransform>& Live = Mesh->GetComponentSpaceTransforms();
		double PoseGap = -1;
		for (int32 B = 0; B < Game.Num() && B < Live.Num(); B++) PoseGap = FMath::Max(PoseGap, (double)FVector::Dist(Game[B].GetLocation(), Live[B].GetLocation()));
		TestTrue(FString::Printf(TEXT("pose échantillonnée = pose évaluée par le maillage du jeu (idle à 0,5 s) : %d os, écart max %.4g unités du maillage (%.4g cm dans le jeu)"), Live.Num(),
					 PoseGap, PoseGap * Mesh->GetRelativeScale3D().X),
			Live.Num() == Game.Num() && PoseGap * Mesh->GetRelativeScale3D().X < 0.05);
		const FTransform G = Game[0] * Web[0].Inverse();
		FVector Axis;
		float Angle;
		G.GetRotation().ToAxisAndAngle(Axis, Angle);
		AddInfo(FString::Printf(TEXT("racine %s du clip idle importé : rotation de %.3f° autour de (%.3f, %.3f, %.3f) par rapport à la pose de référence (le web retire cette piste)"),
			*Ref.GetBoneName(0).ToString(), FMath::RadiansToDegrees(Angle), Axis.X, Axis.Y, Axis.Z));
		const Affine ToGame = Tack->GameMeshToHolder();
		const Affine ToWeb = compose(innerAffine(M), Mesh2Glb);
		for (const TCHAR* Bn : {TEXT("spine_04_09"), TEXT("saddle_0168"), TEXT("pelvis_05")})
		{
			const int32 B = Ref.FindBoneIndex(FName(Bn));
			if (!TestTrue(FString::Printf(TEXT("os %s"), Bn), B != INDEX_NONE)) continue;
			const FVector Pg = Game[B].GetLocation(), Pw = Web[B].GetLocation();
			const V3 Gm = apply(ToGame, {Pg.X, Pg.Y, Pg.Z}), Wb = apply(ToWeb, {Pw.X, Pw.Y, Pw.Z});
			AddInfo(FString::Printf(TEXT("mesure : %s à %.2f cm du sol dans le jeu Unreal, %.2f cm posé comme le web (écart %+.2f cm) ; avance %+.2f / %+.2f cm, côté gauche %+.2f / %+.2f cm"),
				Bn, 100 * Gm.y, 100 * Wb.y, 100 * (Gm.y - Wb.y), 100 * Gm.z, 100 * Wb.z, 100 * Gm.x, 100 * Wb.x));
		}
		AddInfo(FString::Printf(TEXT("mesure : échelle du web %.6g m par unité de la scène du GLB, jeu Unreal %.6g (rapport %.4f) ; lacet du modèle web %+.4f rad (yaw − π/2), jeu 0 ; sol du web %.4f m sous l'origine du modèle, jeu 0"),
			M.innerScale, K * Mesh->GetRelativeScale3D().X / 100.0, K * Mesh->GetRelativeScale3D().X / 100.0 / M.innerScale, M.innerYaw - UE_DOUBLE_HALF_PI, M.innerGroundY * M.innerScale));
	}

	// ---- Images d'O1 : cheval posé comme le web (clips d'Unreal mélangés comme le mélangeur WildMesh), aux images dont
	// tous les clips actifs existent dans Unreal (pas de clip en miroir) et sans bascule ni levée de tête (SecondaryMotion :
	// seules ces deux couches tournent des os lus ici ; crinière, queue et oreilles ne portent ni ancre ni sommet retenu).
	const FString ClipRoot = TEXT("/Game/Characters/Horse/horse_pjl_normalized/horse_pjl_normalized/SkeletalMeshes/Horse_");
	TMap<FString, const UAnimSequence*> Clips;
	auto Clip = [&](const std::string& Name) -> const UAnimSequence* {
		const FString N = UTF8_TO_TCHAR(Name.c_str());
		if (const UAnimSequence* const* C = Clips.Find(N)) return *C;
		const UAnimSequence* C = N.EndsWith(TEXT("_M")) ? nullptr : LoadObject<UAnimSequence>(nullptr, *(ClipRoot + N + TEXT(".Horse_") + N));
		Clips.Add(N, C);
		return C;
	};
	const FReferenceSkeleton& Ref = SkM->GetRefSkeleton();
	bool bRaw = false;  // passe : données brutes ou compressées des clips (voir plus bas)
	// Pose du mélangeur d'une image (mx.a, dans l'ordre des actions du mélangeur) ; faux si un clip manque dans Unreal.
	auto MixerPose = [&](const J& Mx, TArray<FTransform>& Out) {
		TArray<FTransform> Acc, In;
		double W = 0;
		for (const J& A : Mx["a"].a)
		{
			const UAnimSequence* C = Clip(A[0].s);
			if (!C || !SampleLocal(C, SkM, A[2].num(), true, In, bRaw)) return false;
			const double Wa = A[1].num();
			if (W == 0) Acc = In, W = Wa;
			else
			{
				W += Wa;
				Mix(Acc, In, Wa / W);
			}
		}
		if (W == 0) return false;
		if (W < 1) Mix(Acc, Ref.GetRefBonePose(), 1 - W);
		LocalToComponent(Ref, Acc, Out);
		return true;
	};
	auto Eligible = [&](const J& F) {
		const J& Sec = F["mx"]["sec"];
		if (FMath::Abs(Sec["bascule"].num()) > 1e-6 || FMath::Abs(Sec["headLift"].num()) > 1e-6) return false;
		for (const J& A : F["mx"]["a"].a)
			if (!Clip(A[0].s)) return false;
		return true;
	};
	// Deux passes : données brutes de l'import (éditeur seulement, information), puis données compressées des clips (celles
	// que le jeu joue, critères) : la comparaison sépare l'écart dû à la compression d'animation de celui du composant.
	for (int32 Pass = 0; Pass < 2; Pass++)
	{
	bRaw = Pass == 0;
	FWorst WAnchor, WSeatPos, WSeatRot, WFlank, WCrest, WToe, WAnchorP, WFlankP, WCrestP, WSeatRotP;
	int32 Frames = 0, Pure = 0, CrestMiss = 0, HindMiss = 0, Runs = 0, Scen = 0, Over = 0, Slices = 0;
	TArray<double> Costs;
	FString PerRun;
	for (const TCHAR* Id : {TEXT("E1"), TEXT("E1b"), TEXT("E2g"), TEXT("E2d"), TEXT("E3"), TEXT("E3b"), TEXT("E6t"), TEXT("E6v")})
	{
		J O;
		try
		{
			O = loadJson(TCHAR_TO_UTF8(*(MonteDir() / TEXT("o1") / (FString(Id) + TEXT(".json")))));
		}
		catch (const std::exception& Ex)
		{
			AddError(FString::Printf(TEXT("O1 %s illisible : %s"), Id, UTF8_TO_TCHAR(Ex.what())));
			continue;
		}
		const double Dt = O["setup"]["dt"].num();
		const std::vector<J>& Fr = O["frames"].a;
		// Cheval WildMesh neuf ; image de mise en place (non exportée) : clip idle seul au premier pas (idleTime = dt).
		Tack->ResetState();
		if (!SamplePose(Idle, SkM, Dt, true, CS)) return false;
		Tack->StepPose(CS, compose(WebBody(M, 0, 0), Mesh2Glb), Dt, 0, false, NoGround);
		const double Pitch0 = Tack->State().pitch0;
		bool bInRun = false;
		int32 N0 = Frames;
		for (size_t I = 0; I < Fr.size(); I++)
		{
			const J& F = Fr[I];
			if (!Eligible(F) || !MixerPose(F["mx"], CS)) { bInRun = false; continue; }
			const J& Hz = F["hz"];
			if (!bInRun && I > 0)
			{
				// Entrée dans une plage d'images retenues après d'autres images : état des lissages repris du web à l'image
				// précédente (x et tangage de S dans H), tangage de repos de la mise en place ; réception et postérieurs.
				V3 P;
				Q4 Q;
				SeatInHolder(Fr[I - 1]["hz"], P, Q);
				TackState& S = Tack->State();
				S.seatX = P.x;
				S.dPitch = -2 * FMath::Atan2(Q.x, Q.w);
				S.pitch0 = Pitch0;
				S.landT = Fr[I - 1]["hz"]["lT"].num();
				S.wasJump = Fr[I - 1]["hz"]["jT"].num() >= 0;
				S.hindDown = Fr[I - 1]["hz"]["hd"].b;
				Runs++;
			}
			else if (!bInRun) Runs++;
			bInRun = true;
			const double Rz = F["mx"]["rz"].num(), By = F["mx"]["by"].num();  // by = body.position.y, abaissement d'appel compris
			Tack->StepPose(CS, compose(WebBody(M, By, Rz), Mesh2Glb), Dt, Rz, Hz["jT"].num() >= 0, NoGround);
			Costs.Add(Tack->LastCostMs());
			const TackOut& Out = Tack->Out();
			double Top = 0;
			for (const J& A : F["mx"]["a"].a) Top = FMath::Max(Top, A[1].num());
			const bool bPure = Top >= 0.99;
			const FString Where = FString::Printf(TEXT("%s image %d"), Id, (int32)F["f"].num());
			V3 Sp;
			Q4 Sq;
			SeatInHolder(Hz, Sp, Sq);
			WSeatPos.See(Dist(Out.seatPos, Sp), Where);
			WSeatRot.See(AngleDeg(Out.seatQ, Sq), Where);
			if (bPure) WSeatRotP.See(AngleDeg(Out.seatQ, Sq), Where);
			for (int A = 0; A < AnchorCount; A++)
			{
				const double E = Dist(Out.anchorS[A], V(Hz["an"][anchorName(A)]));
				WAnchor.See(E, Where + TEXT(" ") + UTF8_TO_TCHAR(anchorName(A)));
				if (bPure) WAnchorP.See(E, Where + TEXT(" ") + UTF8_TO_TCHAR(anchorName(A)));
			}
			for (int Side = 0; Side < 2; Side++)
			{
				const J& WebP = Hz[Side ? "fr" : "fl"];
				const std::vector<double>& Got = Side ? Out.flankR : Out.flankL;
				for (size_t S = 2; S < Got.size() && S < WebP.a.size(); S++)
				{
					const double E = FMath::Abs(Got[S] - WebP[S].num());
					const FString W2 = Where + FString::Printf(TEXT(" flanc %s tranche %d"), Side ? TEXT("droit") : TEXT("gauche"), (int32)S - 2);
					WFlank.See(E, W2);
					if (bPure) WFlankP.See(E, W2);
					Slices++;
					Over += E > 0.005;
				}
			}
			const J& Cr = Hz["cr"];
			for (size_t S = 2; S < Out.crest.size() && S < Cr.a.size(); S++)
			{
				const bool A = Out.crest[S] > -9, B = Cr[S].num() > -9;
				if (A != B) { CrestMiss++; continue; }
				if (!A) continue;
				const double E = FMath::Abs(Out.crest[S] - Cr[S].num());
				const FString W2 = Where + FString::Printf(TEXT(" encolure tranche %d"), (int32)S - 2);
				WCrest.See(E, W2);
				if (bPure) WCrestP.See(E, W2);
			}
			for (int Toe = 0; Toe < 2; Toe++) WToe.See(FMath::Abs(Out.toe[Toe].y - Hz["hv"][2 + Toe].num()), Where);
			HindMiss += Tack->State().hindDown != Hz["hd"].b;
			Frames++;
			Pure += bPure;
		}
		if (Frames > N0) Scen++;
		PerRun += FString::Printf(TEXT(" %s %d"), Id, Frames - N0);
	}
	const FString Tag = bRaw ? TEXT("données brutes des clips (import, éditeur)") : TEXT("données compressées des clips (celles du jeu)");
	AddInfo(FString::Printf(TEXT("%s : %d images d'O1 rejouées dans %d scénarios (%s), %d plages, dont %d où un clip pèse au moins 0,99"), *Tag, Frames, Scen, *PerRun, Runs, Pure));
	AddInfo(FString::Printf(TEXT("%s, toutes les images : ancres %.4f cm (%s), siège %.4f cm (%s), orientation %.4f° (%s), flanc %.4f cm (%s ; %d tranches sur %d au-delà de 0,5 cm), encolure %.4f cm (%s)"),
		*Tag, 100 * WAnchor.V, *WAnchor.Where, 100 * WSeatPos.V, *WSeatPos.Where, WSeatRot.V, *WSeatRot.Where, 100 * WFlank.V, *WFlank.Where, Over, Slices, 100 * WCrest.V, *WCrest.Where));
	AddInfo(FString::Printf(TEXT("%s, images à un clip ≥ 0,99 (sélection du plan) : ancres %.4f cm (%s), orientation %.4f° (%s), flanc %.4f cm (%s), encolure %.4f cm (%s)"), *Tag,
		100 * WAnchorP.V, *WAnchorP.Where, WSeatRotP.V, *WSeatRotP.Where, 100 * WFlankP.V, *WFlankP.Where, 100 * WCrestP.V, *WCrestP.Where));
	if (bRaw) continue;
	// Critères du plan (étape 5) sur sa sélection d'images (un clip ≥ 0,99) ; en plus, sur toutes les images rejouées, ce qui y
	// tient : ancres, siège, encolure. Flanc aux allures mélangées : déclaré ci-dessus (information), voir le compte rendu.
	TestTrue(FString::Printf(TEXT("images d'O1 rejouées : %d (dont %d à un clip ≥ 0,99)"), Frames, Pure), Frames >= 400 && Pure >= 90);
	TestTrue(TEXT("plan : ancres ≤ 0,5 cm (un clip ≥ 0,99)"), WAnchorP.V >= 0 && WAnchorP.V <= 0.005);
	TestTrue(TEXT("plan : orientation du siège ≤ 0,5° (un clip ≥ 0,99)"), WSeatRotP.V >= 0 && WSeatRotP.V <= 0.5);
	TestTrue(TEXT("plan : chaque tranche de profil du flanc ≤ 0,5 cm (un clip ≥ 0,99)"), WFlankP.V >= 0 && WFlankP.V <= 0.005);
	TestTrue(TEXT("plan : chaque tranche du dessus de l'encolure ≤ 0,5 cm (un clip ≥ 0,99)"), WCrestP.V >= 0 && WCrestP.V <= 0.005);
	TestTrue(TEXT("toutes les images : ancres ≤ 0,5 cm"), WAnchor.V <= 0.005);
	TestTrue(TEXT("toutes les images : position du siège ≤ 0,5 cm"), WSeatPos.V <= 0.005);
	TestTrue(TEXT("toutes les images : orientation du siège ≤ 0,5°"), WSeatRot.V <= 0.5);
	TestTrue(TEXT("toutes les images : dessus de l'encolure ≤ 0,5 cm"), WCrest.V <= 0.005);
	TestEqual(TEXT("tranches d'encolure mesurées des deux côtés ou d'aucun"), CrestMiss, 0);
	TestEqual(TEXT("postérieurs reposés : même état que le web à chaque image"), HindMiss, 0);
	AddInfo(FString::Printf(TEXT("hauteur des os toes_02 au-dessus du plan du cheval contre hz.hv (sol du relief) : écart max %.3f cm (%s), information"), 100 * WToe.V, *WToe.Where));
	Costs.Sort();
	if (Costs.Num())
	{
		const double Med = Costs[Costs.Num() / 2], Max = Costs.Last();
		const FString Msg = FString::Printf(TEXT("coût du composant : médiane %.4f ms, p99 %.4f ms, maximum %.4f ms par image (%d images), seuil 0,1 ms"), Med,
			Costs[FMath::Min(Costs.Num() - 1, (int32)(Costs.Num() * 0.99))], Max, Costs.Num());
		AddInfo(Msg);
		TestTrue(Msg, Med <= 0.1);
	}
	}
	for (const TPair<FString, const UAnimSequence*>& C : Clips)
		if (C.Value)
			AddInfo(FString::Printf(TEXT("clip Unreal %s : %.5f s, %d clés échantillonnées, %.3f images/s"), *C.Key, C.Value->GetPlayLength(), C.Value->GetNumberOfSampledKeys(),
				C.Value->GetSamplingFrameRate().AsDecimal()));
	Horse->Destroy();
	return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// Étape M2 de l'essai de monte (voie A) : Strides.Parite.HorseMirror. Clips miroir du cheval Unreal (FStridesHorseMirrorSet :
// cuisson de StridesCore/HorseMirror, prouvée au bit près contre le web par le ctest « monte-miroir », nourrie ici des
// clips importés d'Unreal) contre les clips « _M » cuits par le jeu web (oracle unreal/core/tests/oracles/monte/miroir).
//  1. Jeu par défaut : sans l'option -StridesHorseLead=web, le cheval garde le mode à un clip (rien de changé).
//  2. Entrées de la cuisson : noms et durées des clips, paires d'os (par nom) identiques au web ; plan de symétrie.
//  3. Pour chaque clip et chaque clé : positions des 419 articulations (repère de la scène du GLB, via la conversion d'axes
//     de UStridesHorseTack), pose source d'Unreal contre pose source du web (écart d'import : rééchantillonnage), puis clip
//     miroir d'Unreal contre clip miroir du web ; racines du web à la pose de référence.
//  4. Images d'O1 dont au moins un clip actif est un clip miroir : cheval Unreal posé par le mélangeur WildMesh avec les
//     clips miroir d'Unreal ; ancres dans S, siège, encolure, postérieurs contre le canal hz (critères de l'étape 5).
//  5. Jeu avec l'option : le mélangeur à couches du cheval (UStridesHorseAnimInstance) pose le maillage comme la lecture du
//     clip miroir (couche miroir seule, puis mélange 50/50 avec le clip d'origine).
namespace StridesRiderTest
{
bool LoadBytes(const FString& Path, TArray<uint8>& Out) { return FFileHelper::LoadFileToArray(Out, *Path); }
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesHorseMirrorTest, "Strides.Parite.HorseMirror", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FStridesHorseMirrorTest::RunTest(const FString&)
{
	using namespace StridesRiderTest;
	namespace M = strides::mirror;
	FTestWorld W(TEXT("StridesHorseMirrorTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	AStridesHorse* Horse = W.World->SpawnActor<AStridesHorse>(FVector::ZeroVector, FRotator::ZeroRotator);
	if (!TestNotNull(TEXT("cheval"), Horse)) return false;
	USkeletalMeshComponent* Mesh = Horse->BodyMesh();
	const USkeletalMesh* SkM = Mesh ? Mesh->GetSkeletalMeshAsset() : nullptr;
	if (!TestNotNull(TEXT("maillage du cheval"), SkM)) return false;
	// 1. Jeu par défaut.
	TestFalse(TEXT("jeu par défaut : option -StridesHorseLead=web absente, clips d'origine"), Horse->UsesWebLead());
	TestNull(TEXT("jeu par défaut : pas de mélangeur à couches sur le maillage"), Cast<UStridesHorseAnimInstance>(Mesh->GetAnimInstance()));
	TestNull(TEXT("jeu par défaut : aucun clip miroir cuit"), Horse->MirrorSet());

	UStridesHorseTack* Tack = NewObject<UStridesHorseTack>(Horse);
	FString Err;
	if (!TestTrue(FString::Printf(TEXT("sellerie initialisée (%s)"), *Err), Tack->Init(Mesh, &Err))) return false;
	const TackModel& TM = Tack->Model();
	const Affine Mesh2Glb = invert(Tack->GlbToMesh());
	const double CmPerGlb = 100 * TM.innerScale;
	const FReferenceSkeleton& Ref = SkM->GetRefSkeleton();

	// Oracle miroir du web.
	J H;
	try
	{
		H = loadJson(TCHAR_TO_UTF8(*(MonteDir() / TEXT("miroir/index.json"))));
	}
	catch (const std::exception& Ex)
	{
		AddError(FString::Printf(TEXT("oracle miroir illisible : %s"), UTF8_TO_TCHAR(Ex.what())));
		return false;
	}
	M::Rig WebRig;
	{
		const J& R = H["rig"];
		for (size_t I = 0; I < R["names"].a.size(); I++)
		{
			WebRig.names.push_back(R["names"][I].s);
			WebRig.parent.push_back((int)R["parent"][I].num());
			M::Xf X;
			for (int K = 0; K < 3; K++) X.p[K] = R["rest"][I]["p"][K].num(), X.s[K] = R["rest"][I]["s"][K].num();
			for (int K = 0; K < 4; K++) X.q[K] = R["rest"][I]["q"][K].num();
			WebRig.rest.push_back(X);
			M::Mat4 Pw;
			if (!R["parentWorld"][I].isNull())
				for (int K = 0; K < 16; K++) Pw.e[K] = R["parentWorld"][I][K].num();
			WebRig.parentWorld.push_back(Pw);
		}
	}
	const int32 NW = (int32)WebRig.names.size();
	// Os qui portent un sommet d'un maillage skinné du cheval (rig.skinned, relevé dans le web) : seuls leurs écarts se voient.
	TArray<bool> Skinned;
	int32 NSkinned = 0;
	for (int32 I = 0; I < NW; I++)
	{
		Skinned.Add(H["rig"]["skinned"][(size_t)I].num() > 0);
		NSkinned += Skinned.Last();
	}
	// Os du web → os du maillage Unreal (par nom).
	TArray<int32> ToUE;
	int32 Missing = 0;
	for (int32 I = 0; I < NW; I++)
	{
		ToUE.Add(Ref.FindBoneIndex(FName(UTF8_TO_TCHAR(WebRig.names[I].c_str()))));
		Missing += ToUE.Last() == INDEX_NONE;
	}
	if (!TestEqual(TEXT("os du web retrouvés par nom dans le maillage Unreal"), Missing, 0)) return false;

	// 2. Cuisson Unreal (même code que le jeu avec l'option).
	FStridesHorseMirrorSet Set;
	const FString ClipRoot = TEXT("/Game/Characters/Horse/horse_pjl_normalized/horse_pjl_normalized/SkeletalMeshes/Horse_");
	if (!TestTrue(FString::Printf(TEXT("cuisson des clips miroir dans Unreal (%s)"), *Err), Set.Build(SkM, ClipRoot, &Err))) return false;
	AddInfo(FString::Printf(TEXT("cuisson Unreal : %d clips miroir en %.1f ms"), Set.Num(), Set.BuildMs()));
	{
		const std::vector<int> WebPairs = M::pairIndices(WebRig);
		int32 Diff = 0;
		for (int32 I = 0; I < NW; I++)
			Diff += ToUE[WebPairs[I]] != Set.Pairs()[ToUE[I]];
		TestEqual(TEXT("paires d'os gauche/droite d'Unreal = paires du web (par nom, 419 os)"), Diff, 0);
	}
	// Plan : bras du web (pose idle du web) contre bras d'Unreal (pose idle d'Unreal), dans la scène du GLB.
	{
		std::vector<M::Xf> Idle;
		for (const J& B : H["idle"]["local"].a)
		{
			M::Xf X;
			for (int K = 0; K < 3; K++) X.p[K] = B["p"][K].num(), X.s[K] = B["s"][K].num();
			for (int K = 0; K < 4; K++) X.q[K] = B["q"][K].num();
			Idle.push_back(X);
		}
		M::Plane WebPl;
		M::symmetryPlane(WebRig, Idle, WebPl);
		const M::Plane& UePl = Set.Plane();
		const V3 Mid = apply(Mesh2Glb, {UePl.mid[0], UePl.mid[1], UePl.mid[2]});
		const V3 Tip = apply(Mesh2Glb, {UePl.mid[0] + 100 * UePl.n[0], UePl.mid[1] + 100 * UePl.n[1], UePl.mid[2] + 100 * UePl.n[2]});
		V3 N{Tip.x - Mid.x, Tip.y - Mid.y, Tip.z - Mid.z};
		const double Ln = FMath::Sqrt(N.x * N.x + N.y * N.y + N.z * N.z);
		const double Cos = (N.x * WebPl.n[0] + N.y * WebPl.n[1] + N.z * WebPl.n[2]) / Ln;
		const double MidGap = Dist(Mid, {WebPl.mid[0], WebPl.mid[1], WebPl.mid[2]}) * CmPerGlb;
		const double AngGap = FMath::RadiansToDegrees(FMath::Acos(FMath::Min(1.0, Cos)));
		AddInfo(FString::Printf(TEXT("plan de symétrie d'Unreal contre celui du web : normale à %.4f°, milieu des bras à %.4f cm"), AngGap, MidGap));
		TestTrue(TEXT("plan de symétrie : normale à moins de 0,1°, milieu à moins de 0,1 cm du web"), AngGap < 0.1 && MidGap < 0.1);
	}

	// 3. Clés des clips : source et miroir.
	auto ToXfT = [](const FTransform& T) {
		M::Xf X;
		const FVector P = T.GetTranslation();
		const FQuat Q = T.GetRotation();
		X.p[0] = P.X, X.p[1] = P.Y, X.p[2] = P.Z;
		X.q[0] = Q.X, X.q[1] = Q.Y, X.q[2] = Q.Z, X.q[3] = Q.W;
		return X;
	};
	(void)ToXfT;
	// Deux passes : données brutes de l'import (éditeur seulement, information), puis données compressées (celles du jeu,
	// critères) ; la cuisson attend la compression de chaque clip (FStridesHorseMirrorSet::Build).
	FStridesHorseMirrorSet SetRaw;
	TestTrue(TEXT("cuisson sur les données brutes de l'import (information)"), SetRaw.Build(SkM, ClipRoot, &Err, true));
	for (int32 Pass = 0; Pass < 2; Pass++)
	{
	const bool bRaw = Pass == 0;
	const FStridesHorseMirrorSet& Cur = bRaw ? SetRaw : Set;
	const FString Tag = bRaw ? TEXT("données brutes") : TEXT("données compressées (jeu)");
	FWorst WSrc, WMir, W24Src, W24Mir, WSkSrc, WSkMir;
	int32 Keys = 0, ClipsSeen = 0, Clips24 = 0;
	FString PerClip, Off24;
	bool bNamesOk = true, bDurOk = true;
	for (const J& S : H["src"].a)
	{
		const std::string Src = S["name"].s, MName = M::mirroredName(Src);
		const J* Web = nullptr;
		for (const J& Mm : H["mirrored"].a)
			if (Mm["name"].s == MName) Web = &Mm;
		const int32 UI = Cur.Find(UTF8_TO_TCHAR(MName.c_str()));
		if (!Web || UI == INDEX_NONE) { bNamesOk = false; continue; }
		const M::Clip& UC = Cur.Clip(UI);
		bDurOk &= UC.duration == S["duration"].num() && UC.times.size() == (*Web)["times"].a.size();
		TArray<uint8> SrcBytes, MirBytes;
		if (!LoadBytes(MonteDir() / TEXT("miroir") / UTF8_TO_TCHAR(S["file"].s.c_str()), SrcBytes) ||
			!LoadBytes(MonteDir() / TEXT("miroir") / UTF8_TO_TCHAR((*Web)["file"].s.c_str()), MirBytes))
		{
			AddError(TEXT("fichiers de l'oracle miroir illisibles"));
			return false;
		}
		const double* SV = reinterpret_cast<const double*>(SrcBytes.GetData());
		const float* MV = reinterpret_cast<const float*>(MirBytes.GetData());
		const std::vector<J>& An = S["animated"].a;
		size_t Per = 0;
		for (const J& A : An) Per += A[1].s == "q" ? 4 : 3;
		const size_t NK = (*Web)["times"].a.size(), NB = (*Web)["bones"].a.size();
		FWorst CSrc, CMir;
		// Clip source importé à 24 images/s (cadence de la cuisson du web) : ses clés tombent aux instants de la cuisson.
		const bool b24 = FMath::IsNearlyEqual(Cur.Source(UI)->GetSamplingFrameRate().AsDecimal(), (double)M::kBakeFps, 1e-6);
		Clips24 += b24;
		if (!b24) Off24 += FString::Printf(TEXT(" %s (%.0f images/s)"), UTF8_TO_TCHAR(MName.c_str()), Cur.Source(UI)->GetSamplingFrameRate().AsDecimal());
		// Diagnostic : décision « l'os partenaire bouge » de la conservation des longueurs (bakeMirror), web contre Unreal.
		TArray<TArray<FVector3f>> WebSp, UeSp;
		WebSp.SetNum(NW);
		UeSp.SetNum(NW);
		const std::vector<int> WP = M::pairIndices(WebRig);
		for (size_t F = 0; F < NK && F < UC.times.size(); F++)
		{
			const FString Where = FString::Printf(TEXT("%s clé %d"), UTF8_TO_TCHAR(MName.c_str()), (int32)F);
			// Web : pose source et clé miroir, monde de la scène du GLB.
			std::vector<M::Xf> PS = WebRig.rest, PM = WebRig.rest;
			size_t K = F * Per;
			for (const J& A : An)
			{
				M::Xf& X = PS[(size_t)A[0].num()];
				double* D = A[1].s == "p" ? X.p : A[1].s == "q" ? X.q : X.s;
				for (int C = 0; C < (A[1].s == "q" ? 4 : 3); C++) D[C] = SV[K++];
			}
			for (size_t Jb = 0; Jb < NB; Jb++)
			{
				M::Xf& X = PM[(size_t)(*Web)["bones"][Jb].num()];
				const float* V = &MV[(F * NB + Jb) * 7];
				for (int C = 0; C < 3; C++) X.p[C] = V[C];
				for (int C = 0; C < 4; C++) X.q[C] = V[3 + C];
			}
			const std::vector<M::Mat4> WS = M::worldMatrices(WebRig, PS), WM = M::worldMatrices(WebRig, PM);
			// Unreal : pose source au temps de clip du web, clé miroir d'Unreal.
			TArray<FTransform> LS, LM, CS_, CM_;
			const double ClipT = S["clipTime"][F].num();
			if (!StridesHorseAnim::SampleLocal(Cur.Source(UI), SkM, ClipT, true, LS, bRaw) || !Cur.SampleLocal(UI, UC.times[F], true, LM))
			{
				AddError(TEXT("échantillonnage Unreal"));
				return false;
			}
			StridesHorseAnim::LocalToComponent(Ref, LS, CS_);
			StridesHorseAnim::LocalToComponent(Ref, LM, CM_);
			for (int32 I = 0; I < NW; I++)
			{
				const M::Xf& Pw = PS[WP[I]];
				WebSp[I].Add(FVector3f((float)Pw.p[0], (float)Pw.p[1], (float)Pw.p[2]));
				UeSp[I].Add(FVector3f(LS[ToUE[WP[I]]].GetTranslation()));
			}
			for (int32 I = 0; I < NW; I++)
			{
				const FVector A = CS_[ToUE[I]].GetLocation(), B = CM_[ToUE[I]].GetLocation();
				const V3 Ga = apply(Mesh2Glb, {A.X, A.Y, A.Z}), Gb = apply(Mesh2Glb, {B.X, B.Y, B.Z});
				const FString Wb = Where + TEXT(" ") + UTF8_TO_TCHAR(WebRig.names[I].c_str());
				const double Es = Dist(Ga, {WS[I].e[12], WS[I].e[13], WS[I].e[14]}) * CmPerGlb;
				const double Em = Dist(Gb, {WM[I].e[12], WM[I].e[13], WM[I].e[14]}) * CmPerGlb;
				CSrc.See(Es, Wb);
				CMir.See(Em, Wb);
				WSrc.See(Es, Wb);
				WMir.See(Em, Wb);
				if (b24 && Skinned[I]) W24Src.See(Es, Wb), W24Mir.See(Em, Wb);
				if (Skinned[I]) WSkSrc.See(Es, Wb), WSkMir.See(Em, Wb);
			}
			Keys++;
		}
		{
			auto Moving = [](const TArray<FVector3f>& Sp) {
				for (int32 F = 1; F < Sp.Num(); F++)
				{
					const double Dx = (double)Sp[F].X - Sp[0].X, Dy = (double)Sp[F].Y - Sp[0].Y, Dz = (double)Sp[F].Z - Sp[0].Z;
					if (FMath::Sqrt(Dx * Dx + Dy * Dy + Dz * Dz) > 1e-3 * (FMath::Sqrt((double)Sp[0].X * Sp[0].X + (double)Sp[0].Y * Sp[0].Y + (double)Sp[0].Z * Sp[0].Z) + 1e-6)) return true;
				}
				return false;
			};
			int32 Flip = 0;
			FString Ex;
			for (int32 I = 0; I < NW; I++)
			{
				const std::string Base = M::baseName(WebRig.names[I]);
				if (Base == "root" || Base == "pelvis" || WebRig.names[I] == "root_04" || WebRig.names[I] == "_rootJoint") continue;
				if (Moving(WebSp[I]) != Moving(UeSp[I]))
				{
					if (Flip < 4) Ex += FString::Printf(TEXT(" %s (web %s)"), UTF8_TO_TCHAR(WebRig.names[I].c_str()), Moving(WebSp[I]) ? TEXT("bouge") : TEXT("fixe"));
					Flip++;
				}
			}
			AddInfo(FString::Printf(TEXT("%s, %s : décision « partenaire en mouvement » (conservation des longueurs) différente du web pour %d os%s"), *Tag, UTF8_TO_TCHAR(MName.c_str()), Flip, *Ex));
		}
		ClipsSeen++;
		PerClip += FString::Printf(TEXT(" %s : source %.3f, miroir %.3f ;"), UTF8_TO_TCHAR(MName.c_str()), CSrc.V, CMir.V);
		AddInfo(FString::Printf(TEXT("%s, %s (%d clés Unreal du clip source, %.3f images/s) : articulations, source Unreal − web %.4f cm (%s), miroir Unreal − web %.4f cm (%s)"),
			*Tag, UTF8_TO_TCHAR(MName.c_str()), Cur.Source(UI)->GetNumberOfSampledKeys(), Cur.Source(UI)->GetSamplingFrameRate().AsDecimal(), CSrc.V, *CSrc.Where, CMir.V, *CMir.Where));
	}
	AddInfo(FString::Printf(TEXT("%s : %d clés comparées ; pire écart des 419 articulations : source %.4f cm (%s), miroir %.4f cm (%s) ; des %d os skinnés : source %.4f cm (%s), miroir %.4f cm (%s)"),
		*Tag, Keys, WSrc.V, *WSrc.Where, WMir.V, *WMir.Where, NSkinned, WSkSrc.V, *WSkSrc.Where, WSkMir.V, *WSkMir.Where));
	if (bRaw) continue;
	TestTrue(TEXT("11 clips miroir d'Unreal, mêmes noms que le web (virages renommés)"), bNamesOk && ClipsSeen == 11);
	TestTrue(TEXT("durées et nombres de clés des clips miroir d'Unreal = web"), bDurOk);
	// Critères, sur les os skinnés (168 : ceux qui portent un sommet ; les autres, aides de l'export et points de fixation
	// comme mountpoint_01, ne se voient pas) des clips dont la source Unreal est à 24 images/s (ses clés tombent aux instants
	// de la cuisson) : le miroir
	// n'ajoute pas d'écart au-delà de celui de l'import (la réflexion est une isométrie) : miroir ≤ source + 0,05 cm, et
	// ≤ 0,5 cm (seuil de l'étape 5). Les clips importés à 30 images/s sont rééchantillonnés : leur écart (source et miroir)
	// est relevé ci-dessus et déclaré, sans critère (voir unreal/docs/parite/monte/README.md, étape M2).
	AddInfo(FString::Printf(TEXT("clips à 24 images/s : %d ; importés à une autre cadence, sans critère :%s"), Clips24, *Off24));
	AddInfo(FString::Printf(TEXT("clips à 24 images/s, os skinnés : source Unreal − web %.4f cm (%s), miroir Unreal − web %.4f cm (%s)"), W24Src.V, *W24Src.Where, W24Mir.V, *W24Mir.Where));
	TestTrue(FString::Printf(TEXT("clips à 24 images/s, os skinnés : miroir Unreal − web (%.4f cm, %s) ≤ écart d'import des sources (%.4f cm) + 0,05 cm"), W24Mir.V, *W24Mir.Where, W24Src.V),
		Clips24 >= 7 && W24Mir.V >= 0 && W24Mir.V <= W24Src.V + 0.05);
	TestTrue(FString::Printf(TEXT("clips à 24 images/s, os skinnés : miroir Unreal − web ≤ 0,5 cm à toutes les clés (%.4f cm)"), W24Mir.V), W24Mir.V >= 0 && W24Mir.V <= 0.5);
	}

	// 4. Images d'O1 avec clips miroir.
	TMap<FString, const UAnimSequence*> Clips;
	auto ClipSeq = [&](const std::string& Name) -> const UAnimSequence* {
		const FString N = UTF8_TO_TCHAR(Name.c_str());
		if (const UAnimSequence* const* C = Clips.Find(N)) return *C;
		const UAnimSequence* C = N.EndsWith(TEXT("_M")) ? nullptr : LoadObject<UAnimSequence>(nullptr, *(ClipRoot + N + TEXT(".Horse_") + N));
		Clips.Add(N, C);
		return C;
	};
	auto Available = [&](const std::string& Name) { return Set.Find(UTF8_TO_TCHAR(Name.c_str())) != INDEX_NONE || ClipSeq(Name) != nullptr; };
	auto Sample = [&](const std::string& Name, double T, TArray<FTransform>& L) {
		const int32 I = Set.Find(UTF8_TO_TCHAR(Name.c_str()));
		return I != INDEX_NONE ? Set.SampleLocal(I, T, true, L) : StridesHorseAnim::SampleLocal(ClipSeq(Name), SkM, T, true, L);
	};
	auto MixerPose = [&](const J& Mx, TArray<FTransform>& Out) {
		TArray<FTransform> Acc, In;
		double Wt = 0;
		for (const J& A : Mx["a"].a)
		{
			if (!Sample(A[0].s, A[2].num(), In)) return false;
			const double Wa = A[1].num();
			if (Wt == 0) Acc = In, Wt = Wa;
			else
			{
				Wt += Wa;
				Mix(Acc, In, Wa / Wt);
			}
		}
		if (Wt == 0) return false;
		if (Wt < 1) Mix(Acc, Ref.GetRefBonePose(), 1 - Wt);
		LocalToComponent(Ref, Acc, Out);
		return true;
	};
	auto Eligible = [&](const J& F, bool& bHasMirror) {
		const J& Sec = F["mx"]["sec"];
		if (FMath::Abs(Sec["bascule"].num()) > 1e-6 || FMath::Abs(Sec["headLift"].num()) > 1e-6) return false;
		bHasMirror = false;
		for (const J& A : F["mx"]["a"].a)
		{
			if (!Available(A[0].s)) return false;
			bHasMirror |= FString(UTF8_TO_TCHAR(A[0].s.c_str())).EndsWith(TEXT("_M"));
		}
		return true;
	};
	const UAnimSequence* Idle = ClipSeq("idle");
	auto NoGround = [](const V3& P) { return P.y; };
	FWorst WAnchor, WSeatPos, WSeatRot, WCrest, WCrestP, WAnchorP, WJumpAnchor, WThirty, WAnchorH;
	int32 Frames = 0, Pure = 0, JumpFrames = 0, ThirtyFrames = 0, CrestMiss = 0, HindMiss = 0, SkippedSec = 0;
	FString PerRun;
	TArray<FTransform> CS;
	for (const TCHAR* Id : {TEXT("E1"), TEXT("E1b"), TEXT("E2g"), TEXT("E2d"), TEXT("E3"), TEXT("E3b"), TEXT("E6t"), TEXT("E6v")})
	{
		J O;
		try
		{
			O = loadJson(TCHAR_TO_UTF8(*(MonteDir() / TEXT("o1") / (FString(Id) + TEXT(".json")))));
		}
		catch (const std::exception& Ex)
		{
			AddError(FString::Printf(TEXT("O1 %s illisible : %s"), Id, UTF8_TO_TCHAR(Ex.what())));
			continue;
		}
		const double Dt = O["setup"]["dt"].num();
		const std::vector<J>& Fr = O["frames"].a;
		Tack->ResetState();
		if (!SamplePose(Idle, SkM, Dt, true, CS)) return false;
		Tack->StepPose(CS, compose(WebBody(TM, 0, 0), Mesh2Glb), Dt, 0, false, NoGround);
		const double Pitch0 = Tack->State().pitch0;
		bool bInRun = false;
		const int32 N0 = Frames;
		for (size_t I = 0; I < Fr.size(); I++)
		{
			const J& F = Fr[I];
			bool bHasMirror = false;
			const bool bOk = Eligible(F, bHasMirror);
			// Les images sans clip miroir sont celles de Strides.Parite.HorseSeat ; on les rejoue aussi pour tenir l'état
			// des lissages, sans les compter ici.
			if (!bOk || !MixerPose(F["mx"], CS))
			{
				SkippedSec += bHasMirror;
				bInRun = false;
				continue;
			}
			const J& Hz = F["hz"];
			if (!bInRun && I > 0)
			{
				V3 P;
				Q4 Q;
				SeatInHolder(Fr[I - 1]["hz"], P, Q);
				TackState& St = Tack->State();
				St.seatX = P.x;
				St.dPitch = -2 * FMath::Atan2(Q.x, Q.w);
				St.pitch0 = Pitch0;
				St.landT = Fr[I - 1]["hz"]["lT"].num();
				St.wasJump = Fr[I - 1]["hz"]["jT"].num() >= 0;
				St.hindDown = Fr[I - 1]["hz"]["hd"].b;
			}
			bInRun = true;
			const double Rz = F["mx"]["rz"].num(), By = F["mx"]["by"].num();
			Tack->StepPose(CS, compose(WebBody(TM, By, Rz), Mesh2Glb), Dt, Rz, Hz["jT"].num() >= 0, NoGround);
			if (!bHasMirror) continue;
			const TackOut& Out = Tack->Out();
			double Top = 0;
			bool bJump = false, bThirty = false;
			for (const J& A : F["mx"]["a"].a)
			{
				Top = FMath::Max(Top, A[1].num());
				const FString An = UTF8_TO_TCHAR(A[0].s.c_str());
				bJump |= An.StartsWith(TEXT("jump"));
				const UAnimSequence* Src = ClipSeq(An.EndsWith(TEXT("_M")) ? A[0].s.substr(0, A[0].s.size() - 2) : A[0].s);
				bThirty |= An.EndsWith(TEXT("_M")) && Src && !FMath::IsNearlyEqual(Src->GetSamplingFrameRate().AsDecimal(), (double)M::kBakeFps, 1e-6);
			}
			// Saut : la vue du web fait basculer le corps face aux barres (pjlHorse.js _barClear : body.rotation.x et
			// body.position.z), ce qu'O1 n'exporte pas (mx : by et rz seulement) ; images relevées à part, sans critère.
			// Clips miroir dont la source Unreal n'est pas à 24 images/s (trot : 30) : relevées à part, sans critère.
			if (bJump || bThirty)
			{
				for (int A = 0; A < AnchorCount; A++)
					(bJump ? WJumpAnchor : WThirty).See(Dist(Out.anchorS[A], V(Hz["an"][anchorName(A)])), FString::Printf(TEXT("%s image %d %s"), Id, (int32)F["f"].num(), UTF8_TO_TCHAR(anchorName(A))));
				(bJump ? JumpFrames : ThirtyFrames)++;
				continue;
			}
			const FString Where = FString::Printf(TEXT("%s image %d"), Id, (int32)F["f"].num());
			V3 Sp;
			Q4 Sq;
			SeatInHolder(Hz, Sp, Sq);
			WSeatPos.See(Dist(Out.seatPos, Sp), Where);
			WSeatRot.See(AngleDeg(Out.seatQ, Sq), Where);
			for (int A = 0; A < AnchorCount; A++)
			{
				const double E = Dist(Out.anchorS[A], V(Hz["an"][anchorName(A)]));
				WAnchor.See(E, Where + TEXT(" ") + UTF8_TO_TCHAR(anchorName(A)));
				if (Top >= 0.99) WAnchorP.See(E, Where + TEXT(" ") + UTF8_TO_TCHAR(anchorName(A)));
				// Ancre dans le repère du cheval (sans le siège S) : le web la donne par S dans H.
				const V3 An = V(Hz["an"][anchorName(A)]), R = rotate(Sq, An), Wh{Sp.x + R.x, Sp.y + R.y, Sp.z + R.z};
				WAnchorH.See(Dist(Out.anchorH[A], Wh), Where + TEXT(" ") + UTF8_TO_TCHAR(anchorName(A)));
			}
			const J& Cr = Hz["cr"];
			for (size_t S = 2; S < Out.crest.size() && S < Cr.a.size(); S++)
			{
				const bool A = Out.crest[S] > -9, B = Cr[S].num() > -9;
				if (A != B) { CrestMiss++; continue; }
				if (!A) continue;
				const double Ec = FMath::Abs(Out.crest[S] - Cr[S].num());
				WCrest.See(Ec, Where + FString::Printf(TEXT(" encolure tranche %d"), (int32)S - 2));
				if (Top >= 0.99) WCrestP.See(Ec, Where + FString::Printf(TEXT(" encolure tranche %d"), (int32)S - 2));
			}
			HindMiss += Tack->State().hindDown != Hz["hd"].b;
			Frames++;
			Pure += Top >= 0.99;
		}
		PerRun += FString::Printf(TEXT(" %s %d"), Id, Frames - N0);
	}
	AddInfo(FString::Printf(TEXT("O1 : %d images avec clip miroir (source à 24 images/s, hors saut) rejouées (%s), dont %d à un clip ≥ 0,99 ; à part : %d images de saut, %d images de trot en miroir (source à 30 images/s) ; %d images avec clip miroir écartées (bascule ou levée de tête non portées)"),
		Frames, *PerRun, Pure, JumpFrames, ThirtyFrames, SkippedSec));
	AddInfo(FString::Printf(TEXT("O1, images retenues : ancres %.4f cm (%s), siège %.4f cm (%s), orientation %.4f° (%s), encolure %.4f cm (%s), ancres dans le repère du cheval %.4f cm (%s) ; un clip ≥ 0,99 : ancres %.4f cm (%s)"),
		100 * WAnchor.V, *WAnchor.Where, 100 * WSeatPos.V, *WSeatPos.Where, WSeatRot.V, *WSeatRot.Where, 100 * WCrest.V, *WCrest.Where, 100 * WAnchorH.V, *WAnchorH.Where, 100 * WAnchorP.V, *WAnchorP.Where));
	AddInfo(FString::Printf(TEXT("O1, à part (sans critère) : saut, ancres dans S %.4f cm (%s) ; trot en miroir, ancres dans S %.4f cm (%s)"), 100 * WJumpAnchor.V, *WJumpAnchor.Where, 100 * WThirty.V, *WThirty.Where));
	TestTrue(FString::Printf(TEXT("images d'O1 avec clip miroir rejouées : %d"), Frames), Frames >= 150);
	TestTrue(TEXT("ancres ≤ 0,5 cm (images avec clip miroir)"), WAnchor.V >= 0 && WAnchor.V <= 0.005);
	TestTrue(TEXT("position du siège ≤ 0,5 cm"), WSeatPos.V >= 0 && WSeatPos.V <= 0.005);
	TestTrue(TEXT("orientation du siège ≤ 0,5°"), WSeatRot.V >= 0 && WSeatRot.V <= 0.5);
	// Encolure : critère de l'étape 5 sur sa sélection (un clip ≥ 0,99) ; aux allures mêlées, relevé (le maximum d'une tranche
	// change de sommet pour un déplacement de quelques millimètres, comme le flanc de Strides.Parite.HorseSeat).
	TestTrue(FString::Printf(TEXT("dessus de l'encolure ≤ 0,5 cm (un clip ≥ 0,99 : %.4f cm)"), 100 * WCrestP.V), WCrestP.V >= 0 && WCrestP.V <= 0.005);
	TestEqual(TEXT("tranches d'encolure mesurées des deux côtés ou d'aucun"), CrestMiss, 0);
	TestEqual(TEXT("postérieurs reposés : même état que le web à chaque image"), HindMiss, 0);

	// 5. Jeu avec l'option : mélangeur à couches du maillage.
	if (!TestTrue(FString::Printf(TEXT("option -StridesHorseLead=web activée sur le cheval (%s)"), *Err), Horse->EnableWebLead(&Err))) return false;
	UStridesHorseAnimInstance* Anim = Cast<UStridesHorseAnimInstance>(Mesh->GetAnimInstance());
	if (!TestNotNull(TEXT("mélangeur à couches du cheval"), Anim)) return false;
	TestEqual(TEXT("main initiale du web : à gauche (A.lead = 1)"), Horse->LeadState().lead, 1);
	{
		const int32 CI = Horse->MirrorSet()->Find(TEXT("canter_M"));
		const UAnimSequence* Canter = ClipSeq("canter");
		if (!TestTrue(TEXT("canter_M et canter"), CI != INDEX_NONE && Canter)) return false;
		double WorstOnly = -1, WorstMix = -1;
		for (const double T : {0.0, 0.1, 0.25, 0.4, 0.6})
		{
			for (int32 Pass = 0; Pass < 2; Pass++)
			{
				FStridesHorseLayer Lm;
				Lm.Mirror = CI, Lm.Time = T, Lm.Weight = Pass ? 0.7 : 1;
				Anim->Layers.Reset();
				if (Pass)
				{
					FStridesHorseLayer Lo;
					Lo.Seq = Canter, Lo.Time = T, Lo.Weight = 0.3;
					Anim->Layers.Add(Lo);
				}
				Anim->Layers.Add(Lm);
				Mesh->TickAnimation(0.f, false);
				Mesh->RefreshBoneTransforms();
				const TArray<FTransform>& Live = Mesh->GetComponentSpaceTransforms();
				TArray<FTransform> Lmir, Lori, Want;
				Horse->MirrorSet()->SampleLocal(CI, T, false, Lmir);
				if (Pass)
				{
					StridesHorseAnim::SampleLocal(Canter, SkM, T, false, Lori);
					Mix(Lori, Lmir, 0.7);
					Lmir = Lori;
				}
				LocalToComponent(Ref, Lmir, Want);
				double G = 0;
				for (int32 B = 0; B < Want.Num() && B < Live.Num(); B++) G = FMath::Max(G, (double)FVector::Dist(Want[B].GetLocation(), Live[B].GetLocation()));
				(Pass ? WorstMix : WorstOnly) = FMath::Max(Pass ? WorstMix : WorstOnly, G * Mesh->GetRelativeScale3D().X);
			}
		}
		AddInfo(FString::Printf(TEXT("jeu avec l'option : maillage posé par le mélangeur à couches contre la lecture du clip miroir : couche miroir seule %.5f cm, mélange 0,3 canter + 0,7 canter_M %.5f cm"), WorstOnly, WorstMix));
		TestTrue(TEXT("jeu avec l'option : pose du maillage = lecture du clip miroir (≤ 0,01 cm), seule et mêlée au clip d'origine"), WorstOnly >= 0 && WorstOnly <= 0.01 && WorstMix >= 0 && WorstMix <= 0.01);
		// Couches posées par le cheval au galop (allure 3), sans virage : main initiale à gauche, fondu leadBlend du web
		// depuis 1 (pjl/view.js) ; clip d'origine au poids leadBlend, clip miroir au poids 1 − leadBlend, même temps de clip.
		Horse->GaitIndex = 3;
		double Lb = 1, Tc = 0, WorstW = 0;
		bool bLayersOk = true;
		const float Dt = 1.f / 30.f;
		for (int32 K = 0; K < 40; K++)
		{
			Horse->StepAnimation(Dt);
			Lb = M::leadBlendStep(Lb, 'L', Dt);
			if (K > 0) Tc += Dt;
			const TArray<FStridesHorseLayer>& Ls = Anim->Layers;
			bLayersOk &= Ls.Num() == 2 && Ls[0].Seq == Canter && Ls[0].Mirror == INDEX_NONE && Ls[1].Mirror == CI && Ls[1].Seq == nullptr;
			if (Ls.Num() == 2)
			{
				WorstW = FMath::Max(WorstW, FMath::Abs(Ls[0].Weight - Lb) + FMath::Abs(Ls[1].Weight - (1 - Lb)));
				bLayersOk &= Ls[0].Time == Ls[1].Time && FMath::IsNearlyEqual(Ls[0].Time, M::loopClipTime(Tc, Canter->GetPlayLength()), 1e-6);
			}
		}
		AddInfo(FString::Printf(TEXT("jeu avec l'option, galop sans virage : 40 images, leadBlend final %.6f, écart des poids %.3g"), Lb, WorstW));
		TestTrue(TEXT("jeu avec l'option : couches canter (poids leadBlend) et canter_M (poids 1 − leadBlend) au même temps de clip"), bLayersOk && WorstW < 1e-9);
		TestEqual(TEXT("jeu avec l'option : main gardée à gauche sans virage"), Horse->LeadState().lead, 1);
	}
	Horse->Destroy();
	return true;
}
