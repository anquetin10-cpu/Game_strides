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
#include "Misc/Paths.h"
#include "StridesCore/HorseTack.h"
#include "StridesCore/MiniJson.h"
#include "StridesHorse.h"
#include "StridesHorseTack.h"

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
