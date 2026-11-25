// Essai de monte, voie A, étape 6 : Strides.Parite.RiderRules, niveau A dans le moteur (plan-essai.md §5).
//  AStridesRider dans un monde de test, EnableRulesRig (ce que fait -StridesRider=regles) : maillage posé de rider_f_animated
//  et UStridesRiderRig. Pour E1, E1b, E2g, E2d, E3 et E3b : la chaîne du jeu est rejouée depuis l'oracle O1 (première image
//  par son canal in, puis état brut du cheval hz et mx, lu avec le retard d'une image), la règle pose le maillage Unreal
//  (reciblage et deux os par membre), et les articulations sont relues SUR LE MAILLAGE (GetBoneLocation, monde), ramenées
//  dans S par la conversion inverse écrite ici (x = −Y/100, y = Z/100, z = X/100), puis comparées à O2 rider_f.
//  Tolérances du niveau A (§5) vérifiées ici, à chaque image : articulations ≤ 1,0 cm (M1, M2 : plante) ; portée de la
//  jambe ρ ±0,005 (M6) ; genou, hanche, cheville ±2° (M11) ; coude ±2° et allonge ≤ 0,97 (M10) ; ouverture du genou ±3°
//  (M12) ; buste ±1° (M13) ; assise ±0,5 cm (M14) ; talon et pointe ±2° (M15) ; continuité ≤ O2 + 2° par image (M16).
//  M7 (flanc), M9 (encolure) et M17 (phases) dépendent des profils et des phases de l'oracle : calculés par
//  scripts/unreal/rider-rules-niveau-a.mjs sur l'export de ce test (format O2, dossier -StridesMonteDir=, défaut
//  Saved/StridesMonte), avec le même code de métriques que le web (rider-rules-metrics.mjs).
#include "Misc/AutomationTest.h"
#include <cmath>
#include <string>
#include "Components/PoseableMeshComponent.h"
#include "Engine/Engine.h"
#include "Engine/SkinnedAsset.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "HAL/FileManager.h"
#include "HAL/PlatformTime.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "StridesCore/MiniJson.h"
#include "StridesCore/RiderPose.h"
#include "StridesRider.h"
#include "StridesRiderRig.h"

using namespace strides::rider;

namespace StridesRiderRulesTest
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
// Monde (cm, axes Unreal ; acteur à l'origine, donc repère local du siège) → S (m, axes du web).
FVector ToSeat(const FVector& W) { return FVector(-W.Y / 100.0, W.Z / 100.0, W.X / 100.0); }
FVector Jv(const J& A) { return FVector(A[0].num(), A[1].num(), A[2].num()); }
double Ang(const FVector& A, const FVector& B) { return FMath::RadiansToDegrees(FMath::Acos(FMath::Clamp(FVector::DotProduct(A.GetSafeNormal(), B.GetSafeNormal()), -1.0, 1.0))); }
double Ang3(const FVector& O, const FVector& A, const FVector& B) { return Ang(A - O, B - O); }
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
}  // namespace StridesRiderRulesTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesRiderRulesTest, "Strides.Parite.RiderRules", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FStridesRiderRulesTest::RunTest(const FString&)
{
	using namespace StridesRiderRulesTest;
	FTestWorld W(TEXT("StridesRiderRulesTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	AStridesRider* Rider = W.World->SpawnActor<AStridesRider>(FVector::ZeroVector, FRotator::ZeroRotator);
	if (!TestNotNull(TEXT("cavalière"), Rider)) return false;
	// Monde non commencé (BeginPlay non distribué) : rien de la règle n'est créé avant EnableRulesRig (effet des options par
	// BeginPlay : Strides.Monte.Options).
	TestNull(TEXT("sans BeginPlay : composant de règle absent"), Rider->RulesRig());
	TestNull(TEXT("sans BeginPlay : maillage posé absent"), Rider->RulesMesh());
	FString Err;
	if (!TestTrue(FString::Printf(TEXT("règles de monte activées (%s)"), *Err), Rider->EnableRulesRig(&Err))) return false;
	UStridesRiderRig* Rig = Rider->RulesRig();
	UPoseableMeshComponent* M = Rider->RulesMesh();
	if (!TestNotNull(TEXT("composant"), Rig) || !TestNotNull(TEXT("maillage posé"), M)) return false;
	TestFalse(TEXT("deux os par membre : étirement désactivé (bEnableStretch faux, comme TwoBoneIKSimplePerItem par défaut)"), UStridesRiderRig::bEnableStretch);
	TestTrue(FString::Printf(TEXT("espace du maillage : résidu %.4f cm ≤ 0,05 cm"), Rig->AxisFitRms()), Rig->AxisFitRms() >= 0 && Rig->AxisFitRms() <= 0.05);
	Rider->SetActorTransform(FTransform::Identity);
	M->SetRelativeTransform(Rig->MeshInSeat());
	M->UpdateComponentToWorld();

	const FString Ora = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../core/tests/oracles/monte"));
	FString OutDir;
	if (!FParse::Value(FCommandLine::Get(), TEXT("StridesMonteDir="), OutDir)) OutDir = FPaths::ProjectSavedDir() / TEXT("StridesMonte");
	OutDir = FPaths::ConvertRelativePathToFull(OutDir / TEXT("unreal-rider_f"));
	IFileManager::Get().MakeDirectory(*OutDir, true);
	const USkinnedAsset* Asset = M->GetSkinnedAsset();
	const FReferenceSkeleton& Ref = Asset->GetRefSkeleton();
	FWorst WJ, WRho, WKnee, WHip, WAnkle, WElbow, WReach, WReachD, WOpen, WTrunk, WSeat, WFoot, WCont, WIK, WCost;
	int32 Images = 0;
	double CostSum = 0;
	FString Index = TEXT("{\"schema\":\"strides.oracle.rider_rules/1\",\"generator\":\"Strides.Parite.RiderRules\",\"runs\":[");
	const TCHAR* Ids[] = {TEXT("E1"), TEXT("E1b"), TEXT("E2g"), TEXT("E2d"), TEXT("E3"), TEXT("E3b")};
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
		const J& S1 = O1["setup"];
		const J& F1 = O1["frames"];
		const J& F2 = O2["frames"];
		const double K = O2["setup"]["fitScale"].num();
		const double Leg = O2["setup"]["rig"]["thighLen"].num() + O2["setup"]["rig"]["shinLen"].num();
		const double ArmLen = O2["setup"]["rig"]["upperArmLen"].num() + O2["setup"]["rig"]["foreArmLen"].num();
		if (!TestEqual(FString::Printf(TEXT("%s : images O1 et O2"), *Id), (int32)F1.a.size(), (int32)F2.a.size())) continue;
		FString Out = FString::Printf(TEXT("{\"id\":\"%s\",\"frames\":["), *Id);
		TArray<FVector> PrevU, PrevO;
		for (int32 I = 0; I < (int32)F1.a.size(); I++)
		{
			const RideHorseSample H = horseSampleFromJson(F1[I]["hz"], F1[I]["mx"]);
			const RideFitMeters Fm = fitMetersFromJson(S1["fit0"], F1[I]["hz"]);
			const double T0 = FPlatformTime::Seconds();
			RideInputs A;
			if (I == 0)
			{
				A = rideInputsFromJson(F1[0]["in"], K);
				Rig->Seed(A, H, Fm);
			}
			else
			{
				A = Rig->Prepare(H, Fm, F1[I]["in"]["dt"].num());
				A.turn = F1[I]["in"]["turn"].num();  // h.lastTurn non exporté dans O1
				Rig->Apply(A);
			}
			Rig->PoseMesh();
			const double Cost = (FPlatformTime::Seconds() - T0) * 1000.0;
			CostSum += Cost;
			WCost.See(Cost, FString::Printf(TEXT("%s image %d"), *Id, I));
			WIK.See(Rig->LastIKCorrection(), FString::Printf(TEXT("%s image %d"), *Id, I));
			// Articulations relues sur le maillage.
			TArray<FVector> U, O;
			U.SetNum(BoneCount + 4);
			O.SetNum(BoneCount + 4);
			const J& Cl = F2[I]["cl"];
			for (int32 B = 0; B < BoneCount + 4; B++) O[B] = Jv(Cl[B]);
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
			const FString At = FString::Printf(TEXT("%s image %d"), *Id, I);
			for (int32 B = Hips; B < BoneCount + 4; B++)
			{
				if (B == HairTail) continue;  // sans os (confondu avec la tête dans le rig rider_f)
				const double D = (U[B] - O[B]).Size() * 100;
				WJ.See(D, At + TEXT(" ") + (B < BoneCount ? FString(boneName(B)) : FString::Printf(TEXT("point %d"), B - BoneCount)));
				if (D > 1.0) AddError(FString::Printf(TEXT("%s : %s à %.2f cm (> 1,0 cm)"), *At, B < BoneCount ? UTF8_TO_TCHAR(boneName(B)) : TEXT("point"), D));
			}
			for (int32 Sd = 0; Sd < 2; Sd++)
			{
				const int Th = Sd ? RThigh : LThigh, Sh = Sd ? RShin : LShin, Ft = Sd ? RFoot : LFoot, To = Sd ? RToe : LToe;
				const int Ar = Sd ? RArm : LArm, Fo = Sd ? RFore : LFore, Hd = Sd ? RHand : LHand;
				const auto Chk = [&](FWorst& Wr, double Du, double Do, double Tol, const TCHAR* What) {
					const double D = FMath::Abs(Du - Do);
					Wr.See(D, At);
					if (D > Tol) AddError(FString::Printf(TEXT("%s : %s %s à %.3f (> %.3f)"), *At, What, Sd ? TEXT("droit") : TEXT("gauche"), D, Tol));
				};
				Chk(WRho, (U[Th] - U[Ft]).Size() / Leg, (O[Th] - O[Ft]).Size() / Leg, 0.005, TEXT("M6 portée de la jambe"));
				Chk(WKnee, Ang3(U[Sh], U[Th], U[Ft]), Ang3(O[Sh], O[Th], O[Ft]), 2, TEXT("M11 genou (°)"));
				Chk(WHip, Ang3(U[Th], U[Neck], U[Sh]), Ang3(O[Th], O[Neck], O[Sh]), 2, TEXT("M11 hanche (°)"));
				Chk(WAnkle, Ang3(U[Ft], U[Sh], U[To]), Ang3(O[Ft], O[Sh], O[To]), 2, TEXT("M11 cheville (°)"));
				Chk(WElbow, Ang3(U[Fo], U[Ar], U[Hd]), Ang3(O[Fo], O[Ar], O[Hd]), 2, TEXT("M10 coude (°)"));
				// Allonge : la règle la borne à handReach 0,97, qu'O2 atteint exactement ; marge d'arrondi 1e-5 (0,005 mm sur le bras).
				const double Reach = (U[Hd] - U[Ar]).Size() / ArmLen;
				WReach.See(Reach, At);
				if (Reach > 0.97 + 1e-5) AddError(FString::Printf(TEXT("%s : M10 allonge du bras %.6f (> 0,97)"), *At, Reach));
				Chk(WReachD, Reach, (O[Hd] - O[Ar]).Size() / ArmLen, 1e-4, TEXT("M10 allonge contre O2"));
				// M12 : direction du genou autour de l'axe hanche–cheville (angle entre les deux directions, même axe).
				const auto KneeDir = [&](const TArray<FVector>& P) {
					const FVector Ax = (P[Ft] - P[Th]).GetSafeNormal();
					const FVector Kv = P[Sh] - P[Th];
					return (Kv - Ax * FVector::DotProduct(Kv, Ax)).GetSafeNormal();
				};
				Chk(WOpen, Ang(KneeDir(U), KneeDir(O)), 0, 3, TEXT("M12 ouverture du genou (°)"));
				Chk(WFoot, Ang(U[To] - U[Ft], O[To] - O[Ft]), 0, 2, TEXT("M15 talon et pointe (°)"));
			}
			{
				const double D = Ang(U[Neck] - U[Hips], O[Neck] - O[Hips]);
				WTrunk.See(D, At);
				if (D > 1) AddError(FString::Printf(TEXT("%s : M13 buste à %.3f° (> 1°)"), *At, D));
				const double Ds = FMath::Abs(U[Hips].Y - O[Hips].Y) * 100;
				WSeat.See(Ds, At);
				if (Ds > 0.5) AddError(FString::Printf(TEXT("%s : M14 assise à %.3f cm (> 0,5 cm)"), *At, Ds));
			}
			// M16 : rotation par image de la direction des segments (cuisse, jambe, pied, bras, avant-bras), Unreal ≤ O2 + 2°.
			if (PrevU.Num())
			{
				const int Seg[10][2] = {{LThigh, LShin}, {LShin, LFoot}, {LFoot, LToe}, {LArm, LFore}, {LFore, LHand}, {RThigh, RShin}, {RShin, RFoot}, {RFoot, RToe}, {RArm, RFore}, {RFore, RHand}};
				for (const auto& Sg : Seg)
				{
					const double Ru = Ang(U[Sg[1]] - U[Sg[0]], PrevU[Sg[1]] - PrevU[Sg[0]]), Ro = Ang(O[Sg[1]] - O[Sg[0]], PrevO[Sg[1]] - PrevO[Sg[0]]);
					WCont.See(Ru - Ro, At);
					if (Ru > Ro + 2) AddError(FString::Printf(TEXT("%s : M16 continuité %.2f° par image (O2 %.2f°)"), *At, Ru, Ro));
				}
			}
			PrevU = U;
			PrevO = O;
			// Export au format O2 (cl : 25 os puis plantes et poings).
			FString Row = FString::Printf(TEXT("%s{\"f\":%d,\"cl\":["), I ? TEXT(",") : TEXT(""), (int32)F1[I]["f"].num());
			for (int32 B = 0; B < BoneCount + 4; B++)
			{
				const FVector P = B == HairTail ? U[Head] : U[B];
				Row += FString::Printf(TEXT("%s[%.9f,%.9f,%.9f]"), B ? TEXT(",") : TEXT(""), P.X, P.Y, P.Z);
			}
			// Entrées calculées par la chaîne Unreal et état de la règle (M1, M17).
			const RideState& St = Rig->Driver()->rules().state();
			Row += FString::Printf(TEXT("],\"in\":{\"hs\":%.9f,\"ph\":%.9f,\"jump\":%.9f,\"landT\":%s,\"hindDown\":%s,\"bob\":%.9f,\"pitch\":%.9f},\"dg\":{\"post\":%.9f,\"two\":%.9f,\"jumpK\":%.9f,\"hd\":%.9f,\"rel\":%.9f}"),
				A.horseSpeed, A.gaitPhase, A.jump, A.hasLandT ? *FString::Printf(TEXT("%.9f"), A.landT) : TEXT("null"), A.hindDown ? TEXT("true") : TEXT("false"), A.bob, A.pitch,
				St.post, St.two, St.jumpK, St.hd, St.rel);
			Out += Row + TEXT("}");
			Images++;
		}
		Out += TEXT("]}\n");
		FFileHelper::SaveStringToFile(Out, *(OutDir / Id + TEXT(".json")), FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
		Index += FString::Printf(TEXT("%s{\"id\":\"%s\",\"file\":\"%s.json\"}"), Run ? TEXT(",") : TEXT(""), *Id, *Id);
	}
	Index += TEXT("]}\n");
	FFileHelper::SaveStringToFile(Index, *(OutDir / TEXT("index.json")), FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
	TestTrue(TEXT("images rejouées"), Images > 400);
	AddInfo(FString::Printf(TEXT("niveau A, %d images (E1, E1b, E2g, E2d, E3, E3b) : articulations relues sur le maillage contre O2 rider_f, écart max %.4f cm (%s)"), Images, WJ.V, *WJ.Where));
	AddInfo(FString::Printf(TEXT("M6 ρ %.5f ; M11 genou %.3f°, hanche %.3f°, cheville %.3f° ; M10 coude %.3f°, allonge max %.6f (écart à O2 %.2e) ; M12 %.3f° ; M13 %.3f° ; M14 %.3f cm ; M15 %.3f° ; M16 Unreal − O2 max %.3f° par image"),
		WRho.V, WKnee.V, WHip.V, WAnkle.V, WElbow.V, WReach.V, WReachD.V, WOpen.V, WTrunk.V, WSeat.V, WFoot.V, WCont.V));
	AddInfo(FString::Printf(TEXT("espace du maillage : résidu %.5f cm ; deux os par membre : correction max %.4f cm (%s) ; coût moyen %.4f ms par image (max %.4f ms) ; export %s"),
		Rig->AxisFitRms(), WIK.V, *WIK.Where, Images ? CostSum / Images : 0.0, WCost.V, *OutDir));
	return true;
}
