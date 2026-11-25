// Essai de monte, voie A, étape M3 : Strides.Parite.RiderOnHorse, niveau B dans le moteur (plan-essai.md §5 et étape 12,
// adaptée à la voie A : option -StridesRider=regles, pas de MetaHuman).
//  AStridesHorse avec l'option -StridesHorseLead=web (mélangeur à couches, clips miroir cuits) et sa sellerie
//  (UStridesHorseTack) ; AStridesRider avec la règle (EnableRulesRig). Les scénarios E1, E1b, E2g, E2d, E3 et E3b d'O1 sont
//  rejoués sur le CHEVAL UNREAL (FStridesRiderOnHorseReplay : clips, poids et temps du mélangeur du web, maillage du jeu à
//  l'échelle du jeu ; siège, profils, postérieurs et phase de foulée calculés par Unreal), la cavalière est posée par la
//  chaîne du jeu, et ses articulations sont relues sur le maillage, dans S.
//  Vérifié ici, à chaque image :
//   - entrées de la règle venues du cheval Unreal : phase de foulée = hz.ph du web aux images où le web la réécrit depuis
//     ses clips (calage align et gaitInfo.offset, étape M3) ; bob = hauteur du siège Unreal de l'image précédente, contactOff,
//     horseY et postOffset nuls (exacts pour le cheval Unreal : voir UStridesRiderRig::SampleFromTack) ;
//   - borne que la règle garantit par construction : allonge du bras ≤ 0,97 (handReach) ; articulations finies ; la portée
//     de la jambe ρ, que la règle ne borne pas (O2 la dépasse aussi), est relevée.
//  Relevé (information) : écart des entrées Unreal à celles du web (bob, tangage, phase tenue au saut et à l'arrêt).
//  Les grandeurs M1 à M18 et les seuils du niveau B sont calculés par scripts/unreal/rider-rules-niveau-b.mjs sur l'export
//  (dossier -StridesMonteDir=, défaut Saved/StridesMonte, sous-dossier unreal-niveau-b), avec le code de métriques du web.
#include "Misc/AutomationTest.h"
#include <cmath>
#include <string>
#include "Components/PoseableMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/Engine.h"
#include "Engine/SkinnedAsset.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "HAL/FileManager.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "Rendering/SkeletalMeshLODModel.h"
#include "Rendering/SkeletalMeshModel.h"
#include "StridesCore/HorsePhase.h"
#include "StridesCore/HorseTack.h"
#include "StridesCore/MiniJson.h"
#include "StridesCore/RiderPose.h"
#include "StridesHorse.h"
#include "StridesMonteOptions.h"
#include "StridesHorseMirror.h"
#include "StridesHorseTack.h"
#include "StridesHorseTackMesh.h"
#include "Animation/AnimSequence.h"
#include "StridesRider.h"
#include "StridesRiderReplay.h"
#include "StridesRiderRig.h"

using namespace strides::rider;

namespace StridesRiderOnHorseTest
{
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
FVector ToSeat(const FVector& W) { return FVector(-W.Y / 100.0, W.Z / 100.0, W.X / 100.0); }
double PhaseGap(double A, double B)
{
	double D = FMath::Fmod(FMath::Abs(A - B), 1.0);
	return D > 0.5 ? 1 - D : D;
}
double Ang3(const FVector& O, const FVector& A, const FVector& B)
{
	return FMath::RadiansToDegrees(FMath::Acos(FMath::Clamp(FVector::DotProduct((A - O).GetSafeNormal(), (B - O).GetSafeNormal()), -1.0, 1.0)));
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
FString Num(double V) { return FMath::IsFinite(V) ? FString::Printf(TEXT("%.9f"), V) : TEXT("null"); }
FString Arr(const std::vector<double>& V)
{
	FString S = TEXT("[");
	for (size_t I = 0; I < V.size(); I++) S += (I ? TEXT(",") : TEXT("")) + Num(V[I]);
	return S + TEXT("]");
}
FString V3s(const strides::tack::V3& P) { return FString::Printf(TEXT("[%s,%s,%s]"), *Num(P.x), *Num(P.y), *Num(P.z)); }
FString Vec(const Vec3& P) { return FString::Printf(TEXT("[%s,%s,%s]"), *Num(P.x), *Num(P.y), *Num(P.z)); }

// Étape S1, M8 : pénétration de l'axe des os de la cavalière dans le maillage du cheval, méthode des 6 rayons de la page web
// (export-rider-rules.mjs penetration, d'après rider-audit.mjs:80-150) : pour chaque point, distance au premier triangle
// rencontré (deux faces : le matériau de robe du web est DoubleSide) le long des axes du monde, portée 1,5 m ; 0 si l'un
// des six rayons ne rencontre rien ; profondeur = la plus petite des six. Corps du cheval : modèle importé (LOD 0) du maillage
// du jeu, skinné sur le processeur avec les os posés du composant.
struct FBodyGeo
{
	TArray<FVector> P;                           // positions de référence (espace du maillage)
	TArray<TArray<TPair<int32, double>>> W;      // influences (os du squelette du maillage, poids)
	TArray<uint32> Idx;
	TArray<FMatrix> Inv;
	bool Load(const USkeletalMesh* Mesh)
	{
#if WITH_EDITORONLY_DATA
		const FSkeletalMeshModel* Model = Mesh ? Mesh->GetImportedModel() : nullptr;
		if (!Model || Model->LODModels.Num() == 0) return false;
		const FSkeletalMeshLODModel& L = Model->LODModels[0];
		P.SetNum(L.NumVertices);
		W.SetNum(L.NumVertices);
		for (const FSkelMeshSection& Sec : L.Sections)
			for (int32 K = 0; K < Sec.SoftVertices.Num(); K++)
			{
				const FSoftSkinVertex& Sv = Sec.SoftVertices[K];
				const int32 Vi = Sec.BaseVertexIndex + K;
				if (!P.IsValidIndex(Vi)) return false;
				P[Vi] = FVector(Sv.Position);
				for (int32 I = 0; I < MAX_TOTAL_INFLUENCES; I++)
					if (Sv.InfluenceWeights[I] > 0) W[Vi].Add({(int32)Sec.BoneMap[Sv.InfluenceBones[I]], Sv.InfluenceWeights[I] / 65535.0});
			}
		Idx = L.IndexBuffer;
		for (const FMatrix44f& M : Mesh->GetRefBasesInvMatrix()) Inv.Add(FMatrix(M));
		return Idx.Num() > 0;
#else
		return false;
#endif
	}
};
double FirstHit(const TArray<FVector>& V, const TArray<uint32>& Idx, const FVector& O, const FVector& D, double Far)
{
	double Best = -1;
	for (int32 T = 0; T + 2 < Idx.Num(); T += 3)
	{
		const FVector& A = V[Idx[T]];
		const FVector E1 = V[Idx[T + 1]] - A, E2 = V[Idx[T + 2]] - A;
		const FVector Pv = FVector::CrossProduct(D, E2);
		const double Det = FVector::DotProduct(E1, Pv);
		if (FMath::Abs(Det) < 1e-14) continue;
		const double Inv = 1.0 / Det;
		const FVector Tv = O - A;
		const double U = FVector::DotProduct(Tv, Pv) * Inv;
		if (U < 0 || U > 1) continue;
		const FVector Qv = FVector::CrossProduct(Tv, E1);
		const double Vv = FVector::DotProduct(D, Qv) * Inv;
		if (Vv < 0 || U + Vv > 1) continue;
		const double Dist = FVector::DotProduct(E2, Qv) * Inv;
		if (Dist >= 0 && Dist <= Far && (Best < 0 || Dist < Best)) Best = Dist;
	}
	return Best;
}
}  // namespace StridesRiderOnHorseTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesRiderOnHorseTest, "Strides.Parite.RiderOnHorse", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FStridesRiderOnHorseTest::RunTest(const FString&)
{
	using namespace StridesRiderOnHorseTest;
	FTestWorld W(TEXT("StridesRiderOnHorseTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	AStridesHorse* Horse = W.World->SpawnActor<AStridesHorse>(FVector::ZeroVector, FRotator::ZeroRotator);
	AStridesRider* Rider = W.World->SpawnActor<AStridesRider>(FVector::ZeroVector, FRotator::ZeroRotator);
	if (!TestNotNull(TEXT("cheval"), Horse) || !TestNotNull(TEXT("cavalière"), Rider)) return false;
	FString Err;
	// Étape S3 : taille du cheval du web avec -StridesHorseScale=web (le monde du test n'est pas commencé : appliquée ici).
	if (StridesMonteOptions::WebHorseScaleFromCommandLine())
		if (!TestTrue(FString::Printf(TEXT("taille du cheval du web (%s)"), *Err), Horse->EnableWebScale(true, &Err))) return false;
	AddInfo(FString::Printf(TEXT("taille du cheval : %s, échelle du maillage %.9g"), Horse->UsesWebScale() ? TEXT("web") : TEXT("jeu"), Horse->BodyMesh()->GetRelativeScale3D().X));
	UStridesHorseTack* Tack = NewObject<UStridesHorseTack>(Horse);
	if (!TestTrue(FString::Printf(TEXT("sellerie initialisée (%s)"), *Err), Tack->Init(Horse->BodyMesh(), &Err))) return false;
	// Étape S1 : sellerie affichée (étriers sous les pieds, étrivières, rênes) : l'export donne les étriers affichés (hz.ir).
	UStridesHorseTackMesh* TackMesh = NewObject<UStridesHorseTackMesh>(Horse);
	if (!TestTrue(FString::Printf(TEXT("sellerie affichée initialisée (%s)"), *Err), TackMesh->Init(Horse, &Err))) return false;
	FBodyGeo BodyGeo;
	if (!TestTrue(TEXT("M8 : maillage du corps du cheval lu (modèle importé, LOD 0)"), BodyGeo.Load(Horse->BodyMesh()->GetSkeletalMeshAsset()))) return false;
	FWorst WPen;
	int32 PenFrames = 0;
	double PenCtl = 1e9, PenCtlMax = 0;
	int32 PenCtlIn = 0;
	if (!TestTrue(FString::Printf(TEXT("option -StridesHorseLead=web activée (%s)"), *Err), Horse->EnableWebLead(&Err))) return false;
	if (!TestTrue(FString::Printf(TEXT("règles de monte activées (%s)"), *Err), Rider->EnableRulesRig(&Err))) return false;
	UStridesRiderRig* Rig = Rider->RulesRig();
	UPoseableMeshComponent* M = Rider->RulesMesh();
	Rider->SetActorTransform(FTransform::Identity);
	M->SetRelativeTransform(Rig->MeshInSeat());
	M->UpdateComponentToWorld();
	FStridesRiderOnHorseReplay Replay;
	if (!TestTrue(FString::Printf(TEXT("rejeu prêt (%s)"), *Err), Replay.Setup(Horse, Tack, Rig, &Err))) return false;
	{
		const strides::phase::PhaseModel& Pm = Tack->PhaseCalib();
		TestEqual(TEXT("riderPostOffset : aucune affectation dans src/ (décalage nul)"), Pm.postAssignments, 0);
		TestEqual(TEXT("calage des clips : 6 clés"), (int32)Pm.align.size(), 6);
		double Gap = 0;
		for (const auto& [K, V] : Pm.webAlign)
		{
			const auto It = Pm.align.find(K);
			Gap = FMath::Max(Gap, It == Pm.align.end() ? 1.0 : FMath::Abs(It->second.off - V.off));
		}
		TestTrue(FString::Printf(TEXT("calage des clips du composant = calage du jeu web (écart %.3g)"), Gap), Gap <= 1e-12);
	}

	const FString Ora = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../core/tests/oracles/monte"));
	FString OutDir;
	if (!FParse::Value(FCommandLine::Get(), TEXT("StridesMonteDir="), OutDir)) OutDir = FPaths::ProjectSavedDir() / TEXT("StridesMonte");
	OutDir = FPaths::ConvertRelativePathToFull(OutDir / TEXT("unreal-niveau-b"));
	IFileManager::Get().MakeDirectory(*OutDir, true);
	const FReferenceSkeleton& Ref = M->GetSkinnedAsset()->GetRefSkeleton();
	const strides::rider::Rig& RR = Rig->Driver()->rules().rig();
	const double Leg = (RR.info.thighLen + RR.info.shinLen) * RR.scale, ArmLen = (RR.info.upperArmLen + RR.info.foreArmLen) * RR.scale;
	FWorst WPhase, WHeld, WBob, WBobWeb, WPitchWeb, WRho, WReach, WSeatWeb, WCost;
	int32 Images = 0, Rewritten = 0, Held = 0, MirrorFrames = 0, BadInputs = 0, NonFinite = 0, AdapterFrames = 0, AdapterBad = 0;
	double CostSum = 0;
	FString Index = FString::Printf(TEXT("{\"schema\":\"strides.monte.niveau_b_unreal/1\",\"generator\":\"Strides.Parite.RiderOnHorse\",\"meshScale\":%.9g,\"runs\":["), Horse->BodyMesh()->GetRelativeScale3D().X);
	const TCHAR* Ids[] = {TEXT("E1"), TEXT("E1b"), TEXT("E2g"), TEXT("E2d"), TEXT("E3"), TEXT("E3b")};
	for (int32 Run = 0; Run < 6; Run++)
	{
		const FString Id = Ids[Run];
		J O1;
		try
		{
			O1 = loadJson(TCHAR_TO_UTF8(*(Ora / TEXT("o1") / Id + TEXT(".json"))));
		}
		catch (const std::exception& Ex)
		{
			AddError(FString::Printf(TEXT("%s : oracle illisible (%hs)"), *Id, Ex.what()));
			continue;
		}
		if (!TestTrue(FString::Printf(TEXT("%s : rejeu commencé (%s)"), *Id, *Err), Replay.Begin(O1, &Err))) continue;
		TackMesh->ResetStraps();
		const J& F1 = O1["frames"];
		FString Out = FString::Printf(TEXT("{\"id\":\"%s\",\"frames\":["), *Id);
		double PrevSeatY = 0, PrevPhase = 0;
		// Référence indépendante de l'adaptateur Unreal : le cœur (StridesCore/HorsePhase, prouvé par le ctest) nourri du
		// premier clip d'allure de mx.a du web (temps / durée relevée par le web) ; l'adaptateur (clip relu sur le maillage)
		// doit réécrire aux mêmes images et donner la même phase.
		strides::phase::PhaseState RefSt;
		RefSt.animPhase = F1[0]["hz"]["ph"].num();
		for (int32 I = 0; I < Replay.Num(); I++)
		{
			const FString At = FString::Printf(TEXT("%s image %d"), *Id, I);
			if (!Replay.Step(I, &Err))
			{
				AddError(FString::Printf(TEXT("%s : %s"), *At, *Err));
				break;
			}
			const J& Hz = F1[I]["hz"];
			const RideInputs& A = Replay.LastInputs();
			const RideHorseSample& H = Replay.LastSample();
			CostSum += Replay.LastCostMs();
			WCost.See(Replay.LastCostMs(), At);
			MirrorFrames += Replay.LastMirrorCount() > 0;
			{
				const strides::phase::PhaseModel& Pm = Tack->PhaseCalib();
				std::string Clip;
				double Cp = 0;
				for (const J& Ac : F1[I]["mx"]["a"].a)
				{
					const auto C = Pm.contacts.find(Ac[0].s);
					if (strides::phase::clipFamily(Ac[0].s).empty() || C == Pm.contacts.end()) continue;
					Clip = Ac[0].s;
					Cp = Ac[2].num() / C->second.duration;
					break;
				}
				strides::phase::phaseStep(Pm, RefSt, Hz["gait"].s, Clip, Cp, Hz["v"].num(), Hz["lead"].num() > 0 ? 'L' : 'R', Hz["jT"].num() >= 0);
				if (!Clip.empty() || Hz["gait"].s == "idle")
				{
					AdapterFrames++;
					if (RefSt.rewritten != Tack->PhaseRewritten() || PhaseGap(RefSt.animPhase, Tack->RiderPhase()) > 1e-5) AdapterBad++;
				}
				RefSt.animPhase = Tack->RiderPhase();  // même phase tenue des deux côtés
			}
			// Phase : réécrite depuis le clip d'allure du maillage Unreal ; contre hz.ph aux images que le web réécrit.
			const double Ph = Tack->RiderPhase(), Dw = PhaseGap(Ph, Hz["ph"].num());
			if (Tack->PhaseRewritten())
			{
				Rewritten++;
				WPhase.See(Dw, At);
			}
			else
			{
				Held++;
				WHeld.See(Dw, At);
			}
			// Entrées de la règle : état du cheval Unreal de l'image précédente (retard d'une image ; image 0 : canal in).
			const strides::tack::TackOut& O = Tack->Out();
			if (H.contactOff != 0 || H.horseY != 0 || H.postOffset != 0 || H.attachY != O.seatPos.y || H.phase != Ph) BadInputs++;
			if (I > 0)
			{
				WBob.See(FMath::Abs(A.bob - PrevSeatY), At);
				if (PhaseGap(A.gaitPhase, PrevPhase) > 1e-12) BadInputs++;
				WBobWeb.See(FMath::Abs(A.bob - F1[I]["in"]["bob"].num()), At);
				WPitchWeb.See(FMath::RadiansToDegrees(FMath::Abs(A.pitch - F1[I]["in"]["pitch"].num())), At);
			}
			PrevSeatY = O.seatPos.y;
			PrevPhase = Ph;
			{
				// Siège Unreal contre siège du web dans le repère du cheval (cheval 3,7 % plus petit : information).
				const J& S = Hz["S"];
				const J& Hh = Hz["H"];
				const FQuat Qh(Hh[3].num(), Hh[4].num(), Hh[5].num(), Hh[6].num());
				const FVector Sw = Qh.Inverse().RotateVector(FVector(S[0].num() - Hh[0].num(), S[1].num() - Hh[1].num(), S[2].num() - Hh[2].num()));
				WSeatWeb.See(100 * (Sw - FVector(O.seatPos.x, O.seatPos.y, O.seatPos.z)).Size(), At);
			}
			// Articulations relues sur le maillage (dans S : la cavalière est à l'origine, repère local du siège).
			TArray<FVector> U;
			U.SetNum(BoneCount + 4);
			for (int32 B = 0; B < BoneCount; B++)
			{
				const int32 Mb = Rig->MeshBone(B == HairTail ? Head : B);
				U[B] = Mb == INDEX_NONE ? (B == Root ? ToSeat(M->GetBoneLocation(Ref.GetBoneName(0), EBoneSpaces::WorldSpace)) : FVector::ZeroVector)
										 : ToSeat(M->GetBoneLocation(Ref.GetBoneName(Mb), EBoneSpaces::WorldSpace));
			}
			const FTransform C2W = M->GetComponentTransform();
			for (int32 Sd = 0; Sd < 2; Sd++)
			{
				U[BoneCount + Sd] = ToSeat(C2W.TransformPosition(Rig->SolePoint(Sd)));
				U[BoneCount + 2 + Sd] = ToSeat(C2W.TransformPosition(Rig->FistPoint(Sd)));
			}
			for (const FVector& P : U) NonFinite += !P.ContainsNaN() ? 0 : 1;
			for (int32 Sd = 0; Sd < 2; Sd++)
			{
				const int Th = Sd ? RThigh : LThigh, Ft = Sd ? RFoot : LFoot, Ar = Sd ? RArm : LArm, Hd = Sd ? RHand : LHand;
				WRho.See((U[Th] - U[Ft]).Size() / Leg, At);
				WReach.See((U[Hd] - U[Ar]).Size() / ArmLen, At);
			}
			// Export au format d'O1 (cl, in, dg, tg, et le repère du cheval Unreal dans hz).
			FString Row = FString::Printf(TEXT("%s{\"f\":%d,\"cl\":["), I ? TEXT(",") : TEXT(""), (int32)F1[I]["f"].num());
			for (int32 B = 0; B < BoneCount + 4; B++)
			{
				const FVector P = B == HairTail ? U[Head] : U[B];
				Row += FString::Printf(TEXT("%s[%.9f,%.9f,%.9f]"), B ? TEXT(",") : TEXT(""), P.X, P.Y, P.Z);
			}
			const RideFit& Fi = A.fit;
			Row += FString::Printf(TEXT("],\"in\":{\"dt\":%s,\"hs\":%s,\"ph\":%s,\"turn\":%s,\"jump\":%s,\"landT\":%s,\"hindDown\":%s,\"bob\":%s,\"pitch\":%s,\"fit\":{\"stirrupX\":%s,\"stirrupY\":%s,\"stirrupZ\":%s,\"kneeOut\":%s,\"handX\":%s,\"handY\":%s,\"handZ\":%s,\"legClear\":%s,\"mountKneeOut\":%s,\"flankL\":%s,\"flankR\":%s,\"crest\":%s}}"),
				*Num(A.dt), *Num(A.horseSpeed), *Num(A.gaitPhase), *Num(A.turn), *Num(A.jump), A.hasLandT ? *Num(A.landT) : TEXT("null"), A.hindDown ? TEXT("true") : TEXT("false"), *Num(A.bob), *Num(A.pitch),
				*Num(Fi.stirrupX), *Num(Fi.stirrupY), *Num(Fi.stirrupZ), *Num(Fi.kneeOut), *Num(Fi.handX), *Num(Fi.handY), *Num(Fi.handZ), *Num(Fi.legClear), Fi.hasMountKneeOut ? *Num(Fi.mountKneeOut) : TEXT("null"),
				*Arr(Fi.flankL), *Arr(Fi.flankR), *Arr(Fi.crest));
			const RideState& St = Rig->Driver()->rules().state();
			Row += FString::Printf(TEXT(",\"dg\":{\"post\":%s,\"two\":%s,\"jumpK\":%s,\"hd\":%s,\"rel\":%s}"), *Num(St.post), *Num(St.two), *Num(St.jumpK), *Num(St.hd), *Num(St.rel));
			const RideTargets& Tg = Rig->Driver()->rules().targets();
			Row += FString::Printf(TEXT(",\"tg\":{\"fL\":%s,\"fR\":%s,\"xL\":%s,\"xR\":%s,\"hL\":%s,\"hR\":%s,\"hp\":%s}"), *Vec(Tg.foot[0]), *Vec(Tg.foot[1]),
				Tg.hasXMax[0] ? *Num(Tg.xMax[0]) : TEXT("null"), Tg.hasXMax[1] ? *Num(Tg.xMax[1]) : TEXT("null"), *Vec(Tg.hand[0]), *Vec(Tg.hand[1]), *Vec(Tg.hips));
			// Étape S1, M8 : pénétration (images où le web la mesure : fenêtre de mesure, O1 pe non nul), dans S.
			FString Pe = TEXT("null");
			if (F1[I]["pe"].t == J::Arr)
			{
				const TArray<FTransform>& CS = Horse->BodyMesh()->GetComponentSpaceTransforms();
				const FTransform ToS = Horse->BodyMesh()->GetComponentTransform() * Tack->SeatWorld().Inverse();
				TArray<FVector> Vs;
				Vs.SetNum(BodyGeo.P.Num());
				for (int32 Vi = 0; Vi < BodyGeo.P.Num(); Vi++)
				{
					FVector Q = FVector::ZeroVector;
					for (const TPair<int32, double>& Wt : BodyGeo.W[Vi])
						if (CS.IsValidIndex(Wt.Key)) Q += (BodyGeo.Inv[Wt.Key] * CS[Wt.Key].ToMatrixWithScale()).TransformPosition(BodyGeo.P[Vi]) * Wt.Value;
					Vs[Vi] = ToSeat(ToS.TransformPosition(Q));
				}
				if (PenFrames == 0)
				{
					FBox Bx(ForceInit);
					for (const FVector& Vv : Vs) Bx += Vv;
					AddInfo(FString::Printf(TEXT("M8 : corps du cheval dans S, %d sommets, %d triangles, boîte %s"), Vs.Num(), BodyGeo.Idx.Num() / 3, *Bx.ToString()));
				}
				// Axes du monde du web dans S : verticale et axes horizontaux du monde Unreal, tournés dans le siège.
				FVector Dirs[6];
				const FVector Wx(0, -100, 0), Wy(0, 0, 100), Wz(100, 0, 0);  // x, y, z du web dans le monde Unreal
				const FVector Ax = ToSeat(Tack->SeatWorld().InverseTransformVector(Wx)), Ay = ToSeat(Tack->SeatWorld().InverseTransformVector(Wy)), Az = ToSeat(Tack->SeatWorld().InverseTransformVector(Wz));
				Dirs[0] = Ay, Dirs[1] = -Ay, Dirs[2] = Ax, Dirs[3] = -Ax, Dirs[4] = Az, Dirs[5] = -Az;
				const auto Depth = [&](const FVector& Q) {
					double D = 9;
					for (const FVector& Dir : Dirs)
					{
						const double H = FirstHit(Vs, BodyGeo.Idx, Q, Dir.GetSafeNormal(), 1.5);
						if (H < 0) return 0.0;
						D = FMath::Min(D, H);
					}
					return D;
				};
				double Pen = 0;
				FString PenAt = TEXT("null");
				for (int32 Sd = 0; Sd < 2; Sd++)
				{
					const int Ch[4] = {Sd ? RThigh : LThigh, Sd ? RShin : LShin, Sd ? RFoot : LFoot, Sd ? RToe : LToe};
					const TCHAR* Lab[3] = {TEXT("cuisse"), TEXT("jambe"), TEXT("pied")};
					for (int32 K = 0; K < 3; K++)
						for (const double T : {0.25, 0.5, 0.75, 1.0})
						{
							const double D = Depth(FMath::Lerp(U[Ch[K]], U[Ch[K + 1]], T));
							if (D > Pen) Pen = D, PenAt = FString(Sd ? TEXT("r") : TEXT("l")) + Lab[K];
						}
					const int Arm[3] = {Sd ? RFore : LFore, Sd ? RHand : LHand, Sd ? RFing : LFing};
					const TCHAR* ALab[2] = {TEXT("avant-bras"), TEXT("main")};
					for (int32 K = 0; K < 2; K++)
						for (const double T : {0.5, 1.0})
						{
							const double D = Depth(FMath::Lerp(U[Arm[K]], U[Arm[K + 1]], T));
							if (D > Pen) Pen = D, PenAt = FString(Sd ? TEXT("r") : TEXT("l")) + ALab[K];
						}
				}
				const int Tr[4] = {Hips, Spine, Chest, Neck};
				for (int32 K = 0; K < 3; K++)
					for (const double T : {0.0, 0.5, 1.0})
					{
						const double D = Depth(FMath::Lerp(U[Tr[K]], U[Tr[K + 1]], T));
						if (D > Pen) Pen = D, PenAt = TEXT("buste");
					}
				// Témoin positif : point du tronc 30 cm sous le siège, dans le corps du cheval (profondeur attendue de plusieurs cm).
				{
					const double Dc = Depth(FVector(0, -0.3, 0));
					PenCtl = FMath::Min(PenCtl, Dc);
					PenCtlMax = FMath::Max(PenCtlMax, Dc);
					PenCtlIn += Dc > 0;
				}
				Pe = FString::Printf(TEXT("[%s,%s]"), *Num(Pen), PenAt == TEXT("null") ? TEXT("null") : *(TEXT("\"") + PenAt + TEXT("\"")));
				WPen.See(Pen, At + TEXT(" ") + PenAt);
				PenFrames++;
			}
			// Étape S1 : étriers affichés (UStridesHorseTackMesh : sous l'orteil de la pose de l'image), dans S ; avant S1, ancres
			// ironL, ironR (étriers qui pendent).
			FVector IronS[2];
			{
				UStridesHorseTackMesh::FRiderPoints Rp;
				UStridesHorseTackMesh::RiderPointsFromRig(Rig, M->GetComponentTransform(), Rp);
				const FTransform SeatW = Tack->SeatWorld();
				TackMesh->StepStraps(SeatW, O, &Rp, nullptr);
				for (int32 K = 0; K < 2; K++) IronS[K] = ToSeat(SeatW.InverseTransformPosition(TackMesh->IronWorld(K)));
			}
			// Repère du cheval Unreal : S dans le repère du cheval (H = identité : axes du monde à un lacet près), ancres,
			// étriers affichés, postérieurs, réception, phase.
			FString An = TEXT("{");
			for (int32 Ak = 0; Ak < strides::tack::AnchorCount; Ak++) An += FString::Printf(TEXT("%s\"%hs\":%s"), Ak ? TEXT(",") : TEXT(""), strides::tack::anchorName(Ak), *V3s(O.anchorS[Ak]));
			An += TEXT("}");
			const double Lift = Hz["p"][1].num() - Hz["gy"].num();
			Row += FString::Printf(TEXT(",\"hz\":{\"S\":[%s,%s,%s,%s,%s,%s,%s],\"H\":[0,0,0,0,0,0,1],\"an\":%s,\"ir\":[%s,%s],\"hv\":[%s,%s,%s,%s],\"jT\":%s,\"cT\":%s,\"lT\":%s,\"hd\":%s,\"v\":%s,\"ph\":%s,\"phw\":%d,\"mirror\":%d}"),
				*Num(O.seatPos.x), *Num(O.seatPos.y), *Num(O.seatPos.z), *Num(O.seatQ.x), *Num(O.seatQ.y), *Num(O.seatQ.z), *Num(O.seatQ.w), *An,
				*FString::Printf(TEXT("[%s,%s,%s]"), *Num(IronS[0].X), *Num(IronS[0].Y), *Num(IronS[0].Z)), *FString::Printf(TEXT("[%s,%s,%s]"), *Num(IronS[1].X), *Num(IronS[1].Y), *Num(IronS[1].Z)), *Num(Hz["hv"][0].num()), *Num(Hz["hv"][1].num()), *Num(O.toe[0].y + Lift),
				*Num(O.toe[1].y + Lift), *Num(Hz["jT"].num()), Hz["cT"].isNull() ? TEXT("null") : *Num(Hz["cT"].num()), *Num(Tack->State().landT), Tack->State().hindDown ? TEXT("true") : TEXT("false"),
				*Num(Hz["v"].num()), *Num(Ph), (int32)Tack->PhaseRewritten(), Replay.LastMirrorCount());
			Row += TEXT(",\"pe\":") + Pe;
			Out += Row + TEXT("}");
			Images++;
		}
		Out += TEXT("]}\n");
		FFileHelper::SaveStringToFile(Out, *(OutDir / Id + TEXT(".json")), FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
		Index += FString::Printf(TEXT("%s{\"id\":\"%s\",\"file\":\"%s.json\"}"), Run ? TEXT(",") : TEXT(""), *Id, *Id);
	}
	Index += TEXT("]}\n");
	FFileHelper::SaveStringToFile(Index, *(OutDir / TEXT("index.json")), FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
	TestTrue(FString::Printf(TEXT("images rejouées sur le cheval Unreal : %d (dont %d avec un clip miroir)"), Images, MirrorFrames), Images > 600 && MirrorFrames > 100);
	AddInfo(FString::Printf(TEXT("M8 (étape S1) : pénétration des axes d'os dans le maillage du cheval Unreal, %d images (fenêtre de mesure d'O1) : max %.2f cm (%s), information (seuil : rider-rules-niveau-b.mjs)"), PenFrames, 100 * WPen.V, *WPen.Where));
	TestTrue(TEXT("M8 mesuré sur les images de la fenêtre"), PenFrames > 400);
	TestTrue(FString::Printf(TEXT("M8, témoin positif : point 30 cm sous le siège vu dans le corps du cheval à %d images sur %d (profondeur max %.1f cm) : le lancer de rayons rencontre bien le maillage"), PenCtlIn, PenFrames, 100 * PenCtlMax), PenCtlIn >= PenFrames * 0.95 && PenCtlMax > 0.05 && PenCtlMax < 1.0);
	AddInfo(FString::Printf(TEXT("M8, témoin positif : profondeur min %.1f cm, max %.1f cm, %d images sur %d dans le corps"), 100 * PenCtl, 100 * PenCtlMax, PenCtlIn, PenFrames));
	TestTrue(FString::Printf(TEXT("phase de foulée réécrite depuis le clip Unreal = hz.ph du web : %d images, écart max %.3g (%s)"), Rewritten, WPhase.V, *WPhase.Where),
		Rewritten > 400 && WPhase.V >= 0 && WPhase.V <= 1e-5);
	TestTrue(FString::Printf(TEXT("adaptateur (clip relu sur le maillage Unreal) = cœur nourri des clips du web : mêmes images réécrites, même phase (%d images comparées, %d écarts)"), AdapterFrames, AdapterBad),
		AdapterFrames > 600 && AdapterBad == 0);
	AddInfo(FString::Printf(TEXT("phase tenue (arrêt, saut : locomotion procédurale du web non portée) : %d images, écart max à hz.ph %.4f (%s), information"), Held, WHeld.V, *WHeld.Where));
	TestEqual(TEXT("entrées : contactOff, horseY, postOffset nuls, bob = siège Unreal, phase du composant, retard d'une image"), BadInputs, 0);
	TestTrue(FString::Printf(TEXT("bob lu = hauteur du siège Unreal de l'image précédente (écart max %.3g m)"), WBob.V), WBob.V >= 0 && WBob.V <= 1e-12);
	TestEqual(TEXT("articulations finies"), NonFinite, 0);
	// ρ n'est pas borné par la règle (O2 rider_f, cheval du web : jusqu'à 0,9556 en E3b) : seuils du niveau B jugés par
	// rider-rules-niveau-b.mjs, ici relevé seulement.
	AddInfo(FString::Printf(TEXT("portée de la jambe ρ : max %.5f (%s), information (seuils du niveau B : rider-rules-niveau-b.mjs)"), WRho.V, *WRho.Where));
	TestTrue(TEXT("portée de la jambe ρ relevée"), WRho.V > 0.5 && WRho.V < 1.0);
	TestTrue(FString::Printf(TEXT("allonge du bras ≤ 0,97 (max %.6f, %s)"), WReach.V, *WReach.Where), WReach.V > 0.5 && WReach.V <= 0.97 + 1e-5);
	AddInfo(FString::Printf(TEXT("cheval Unreal contre cheval du web (information) : bob %.2f cm (%s), tangage %.2f° (%s), siège dans le repère du cheval %.2f cm (%s)"),
		100 * WBobWeb.V, *WBobWeb.Where, WPitchWeb.V, *WPitchWeb.Where, WSeatWeb.V, *WSeatWeb.Where));
	AddInfo(FString::Printf(TEXT("coût du rejeu (cheval, sellerie, règle, pose) : moyenne %.4f ms par image, max %.4f ms (%s) ; export %s"), Images ? CostSum / Images : 0.0, WCost.V, *WCost.Where, *OutDir));

	// Contrôle : le même rejeu, cheval Unreal posé COMME LE WEB (échelle, lacet, sol, corps et inclinaison de la vue) : la
	// cavalière doit redonner O2 rider_f (la règle sur le cheval du web, mêmes proportions), aux écarts connus du cheval
	// près (clips à 30 images/s rééchantillonnés, bascule _barClear non exportée au saut, phase tenue au saut).
	// Chemin du jeu (UStridesHorseTack::Step, appelé par le tick du composant) : allure lue sur GaitIndex, main sur la main du
	// web (option) ; couche d'allure posée à un temps connu, phase attendue recalculée ici depuis les données du calage.
	{
		UStridesHorseAnimInstance* Anim = Cast<UStridesHorseAnimInstance>(Horse->BodyMesh()->GetAnimInstance());
		const strides::phase::PhaseModel& Pm = Tack->PhaseCalib();
		struct FCase { int32 Gait; float Speed; int32 Lead; const TCHAR* Clip; const char* Key; const char* Fam; };
		const FCase Cases[] = {{3, 7.f, 1, TEXT("canter_M"), "canterL", "canter"}, {3, 7.f, -1, TEXT("canter"), "canterR", "canter"}, {4, 11.f, 1, TEXT("gallop_M"), "gallopL", "gallop"},
			{4, 11.f, -1, TEXT("gallop"), "gallopR", "gallop"}, {2, 4.f, 1, TEXT("trot"), "trot", "trot"}, {1, 1.5f, -1, TEXT("walk"), "walk", "walk"}, {3, 9.9f, 1, TEXT("canter_M"), "gallopL", "canter"}};
		double Worst = 0;
		int32 Bad = 0;
		for (const FCase& Cs : Cases)
			for (const double U : {0.13, 0.61})
			{
				FStridesHorseLayer L;
				const UAnimSequence* Seq = nullptr;
				double Len = 0;
				if (FString(Cs.Clip).EndsWith(TEXT("_M")))
				{
					L.Mirror = Horse->MirrorSet()->Find(Cs.Clip);
					Len = L.Mirror != INDEX_NONE ? Horse->MirrorSet()->Clip(L.Mirror).duration : 0;
				}
				else
				{
					Seq = LoadObject<UAnimSequence>(nullptr, *FString::Printf(TEXT("/Game/Characters/Horse/horse_pjl_normalized/horse_pjl_normalized/SkeletalMeshes/Horse_%s.Horse_%s"), Cs.Clip, Cs.Clip));
					L.Seq = Seq;
					Len = Seq ? Seq->GetPlayLength() : 0;
				}
				if (Len <= 0) { Bad++; continue; }
				L.Time = U * Len;
				L.Weight = 1;
				Anim->Layers = {L};
				Horse->GaitIndex = Cs.Gait;
				Horse->SpeedMS = Cs.Speed;
				Horse->SetLeadForTests(Cs.Lead);
				Tack->Step(1.f / 30.f);
				const double Want = FMath::Frac(FMath::Frac(U - Pm.infoOffset.at(Cs.Fam)) - Pm.align.at(Cs.Key).off);
				const double D = PhaseGap(Tack->RiderPhase(), Want);
				Worst = FMath::Max(Worst, D);
				Bad += !Tack->PhaseRewritten() || D > 1e-6;
			}
		// Couche qui n'est pas d'allure en premier (idle) : l'adaptateur prend le premier clip D'ALLURE (le jeu ne pose pas ce
		// cas, et les mélanges d'O1 mettent toujours un clip d'allure en tête : sans ce cas, rien ne le départage).
		{
			const UAnimSequence* Idle = LoadObject<UAnimSequence>(nullptr, TEXT("/Game/Characters/Horse/horse_pjl_normalized/horse_pjl_normalized/SkeletalMeshes/Horse_idle.Horse_idle"));
			FStridesHorseLayer Li, Lm;
			Li.Seq = Idle, Li.Time = 0.2, Li.Weight = 0.4;
			Lm.Mirror = Horse->MirrorSet()->Find(TEXT("canter_M"));
			const double Len = Lm.Mirror != INDEX_NONE ? Horse->MirrorSet()->Clip(Lm.Mirror).duration : 0;
			Lm.Time = 0.37 * Len, Lm.Weight = 0.6;
			Anim->Layers = {Li, Lm};
			Horse->GaitIndex = 3;
			Horse->SpeedMS = 7.f;
			Horse->SetLeadForTests(1);
			Tack->Step(1.f / 30.f);
			const double Want = FMath::Frac(FMath::Frac(0.37 - Pm.infoOffset.at("canter")) - Pm.align.at("canterL").off);
			const double D = PhaseGap(Tack->RiderPhase(), Want);
			Worst = FMath::Max(Worst, D);
			Bad += !Idle || Len <= 0 || !Tack->PhaseRewritten() || D > 1e-6;
		}
		TestTrue(FString::Printf(TEXT("chemin du jeu (UStridesHorseTack::Step) : allure, main et clip joué → phase du web (15 cas, écart max %.3g)"), Worst), Bad == 0);
		Horse->GaitIndex = 0;
		Horse->SpeedMS = 0;
		Horse->SetLeadForTests(1);
	}

	for (int32 Ctl = 0; Ctl < 2; Ctl++)
	{
		// Ctl 0 : cheval posé comme le web, phase du cheval Unreal ; Ctl 1 : en plus, phase du web (hz.ph).
		Replay.SetWebPose(true);
		Replay.SetWebPhase(Ctl == 1);
		const FString CtlDir = FPaths::GetPath(OutDir) / (Ctl ? TEXT("unreal-niveau-b-web-phase") : TEXT("unreal-niveau-b-web"));
		IFileManager::Get().MakeDirectory(*CtlDir, true);
		FWorst WAll, WGround, WGait, WBefore;
		int32 NGround = 0, NBefore = 0;
		FString CtlIndex = TEXT("{\"schema\":\"strides.monte.niveau_b_unreal/1\",\"generator\":\"Strides.Parite.RiderOnHorse (contrôle : cheval posé comme le web)\",\"runs\":[");
		for (int32 Run = 0; Run < 6; Run++)
		{
			const FString Id = Ids[Run];
			J O1, O2;
			try
			{
				O1 = loadJson(TCHAR_TO_UTF8(*(Ora / TEXT("o1") / Id + TEXT(".json"))));
				O2 = loadJson(TCHAR_TO_UTF8(*(Ora / TEXT("o2/rider_f") / Id + TEXT(".json"))));
			}
			catch (const std::exception& Ex)
			{
				AddError(FString::Printf(TEXT("%s : oracle illisible (%hs)"), *Id, Ex.what()));
				continue;
			}
			if (!Replay.Begin(O1, &Err)) { AddError(Err); continue; }
			FString Out = FString::Printf(TEXT("{\"id\":\"%s\",\"frames\":["), *Id);
			bool bJumped = false;
			for (int32 I = 0; I < Replay.Num(); I++)
			{
				if (!Replay.Step(I, &Err)) { AddError(Err); break; }
				bJumped |= O1["frames"][I]["hz"]["jT"].num() >= 0;
				const J& F = O1["frames"][I];
				const J& Cl = O2["frames"][I]["cl"];
				const FTransform C2W = M->GetComponentTransform();
				double D = 0;
				FString Row = FString::Printf(TEXT("%s{\"f\":%d,\"cl\":["), I ? TEXT(",") : TEXT(""), (int32)F["f"].num());
				for (int32 B = 0; B < BoneCount + 4; B++)
				{
					FVector P;
					if (B < BoneCount)
					{
						const int32 Mb = Rig->MeshBone(B == HairTail ? Head : B);
						P = Mb == INDEX_NONE ? FVector::ZeroVector : ToSeat(M->GetBoneLocation(Ref.GetBoneName(Mb), EBoneSpaces::WorldSpace));
					}
					else P = ToSeat(C2W.TransformPosition(B < BoneCount + 2 ? Rig->SolePoint(B - BoneCount) : Rig->FistPoint(B - BoneCount - 2)));
					if (B >= Hips && B != HairTail) D = FMath::Max(D, 100 * (P - FVector(Cl[B][0].num(), Cl[B][1].num(), Cl[B][2].num())).Size());
					Row += FString::Printf(TEXT("%s[%.9f,%.9f,%.9f]"), B ? TEXT(",") : TEXT(""), P.X, P.Y, P.Z);
				}
				{
					const RideInputs& A = Replay.LastInputs();
					Row += FString::Printf(TEXT("],\"in\":{\"hs\":%s,\"ph\":%s,\"turn\":%s,\"jump\":%s,\"landT\":%s,\"hindDown\":%s,\"bob\":%s,\"pitch\":%s,\"t\":%s,\"crest\":%s,\"flankL\":%s,\"flankR\":%s"),
						*Num(A.horseSpeed), *Num(A.gaitPhase), *Num(A.turn), *Num(A.jump), A.hasLandT ? *Num(A.landT) : TEXT("null"), A.hindDown ? TEXT("true") : TEXT("false"), *Num(A.bob), *Num(A.pitch), *Num(A.t),
						*Arr(A.fit.crest), *Arr(A.fit.flankL), *Arr(A.fit.flankR));
				}
				Out += Row + TEXT("}}");
				const FString At = FString::Printf(TEXT("%s image %d"), *Id, I);
				WAll.See(D, At);
				if (!bJumped) WBefore.See(D, At), NBefore++;
				// Au sol (hors saut et 10 images après la réception) : écarts du cheval connus seulement aux allures rééchantillonnées.
				const bool bGround = F["hz"]["jT"].num() < 0 && F["hz"]["lT"].num() > 10 * Replay.Dt();
				if (bGround) WGround.See(D, At), NGround++;
				bool bTrot = false;
				for (const J& A : F["mx"]["a"].a) bTrot |= A[0].s.rfind("trot", 0) == 0 || A[0].s.rfind("jump_gallop", 0) == 0;
				if (bGround && !bTrot) WGait.See(D, At);
			}
			Out += TEXT("]}\n");
			FFileHelper::SaveStringToFile(Out, *(CtlDir / Id + TEXT(".json")), FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
			CtlIndex += FString::Printf(TEXT("%s{\"id\":\"%s\",\"file\":\"%s.json\"}"), Run ? TEXT(",") : TEXT(""), *Id, *Id);
		}
		FFileHelper::SaveStringToFile(CtlIndex + TEXT("]}\n"), *(CtlDir / TEXT("index.json")), FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
		Replay.SetWebPose(false);
		Replay.SetWebPhase(false);
		const TCHAR* Tag = Ctl ? TEXT("contrôle, cheval posé comme le web et phase du web") : TEXT("contrôle, cheval posé comme le web");
		AddInfo(FString::Printf(TEXT("%s : articulations contre O2 rider_f, toutes images %.3f cm (%s) ; avant le premier saut %.4f cm (%s, %d images) ; au sol %.3f cm (%s, %d images) ; au sol sans clip à 30 images/s %.3f cm (%s) ; export %s"),
			Tag, WAll.V, *WAll.Where, WBefore.V, *WBefore.Where, NBefore, WGround.V, *WGround.Where, NGround, WGait.V, *WGait.Where, *CtlDir));
		TestTrue(FString::Printf(TEXT("%s : avant le premier saut, la cavalière redonne O2 à 1 cm près (%.4f cm, %d images)"), Tag, WBefore.V, NBefore), WBefore.V >= 0 && WBefore.V <= 1.0 && NBefore > 400);
	}
	return true;
}
