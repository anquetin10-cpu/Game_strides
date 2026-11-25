// Étape S1 : Strides.Parite.HorseTackMesh, sellerie complète affichée sur le cheval Unreal (UStridesHorseTackMesh).
//  1. Pièces skinnées (SK_Tack_<pièce>, importées du GLB de la sellerie du web) : présentes, même squelette que le cheval,
//     suiveuses du maillage du cheval (leader pose), rattachées à lui, visibles comme dans le web (setTackVisible, scénario
//     E1) ; nombre de triangles égal au web ; sommets témoins : position de repos retrouvée (scène du GLB → maillage, la
//     conversion d'axes du cheval) et os porteurs, par nom et poids, identiques au web.
//  2. Sommets témoins posés : cheval Unreal posé COMME LE WEB (contrôle du rejeu FStridesRiderOnHorseReplay), pièces
//     skinnées sur le processeur avec les os du maillage du cheval et les poids importés, dans S, contre le canal tk de
//     l'oracle sellerie/ (getVertexPosition du web, une image sur dix), scénarios E1 à E3b.
//  3. Étriers, étrivières, rênes (StridesCore/HorseStraps, prouvé par le ctest « monte-sellerie ») avec la cavalière posée
//     par la règle : étrier sous l'orteil de la pose de l'image à toeDrop · scale près (construction du web), contre
//     l'étrier du web recalculé sur O2 rider_f (règle du web, cheval du web, mêmes proportions) ; étrivière du
//     porte-étrivière à l'œil de l'étrier ; rênes du mors aux poings de l'image précédente ; tampons des rubans et position
//     des étriers affichés = sortie du cœur ; coût de l'image.
//  Sur le cheval du jeu (niveau B), M4, M5 et M18 sont calculés par rider-rules-niveau-b.mjs sur l'export de
//  Strides.Parite.RiderOnHorse, qui donne maintenant les étriers affichés.
#include "Misc/AutomationTest.h"
#include <cmath>
#include <map>
#include <string>
#include "Components/PoseableMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/SkinnedAsset.h"
#include "Engine/World.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "ProceduralMeshComponent.h"
#include "Rendering/SkeletalMeshLODModel.h"
#include "Rendering/SkeletalMeshModel.h"
#include "Rendering/SkeletalMeshRenderData.h"
#include "Rendering/SkeletalMeshLODRenderData.h"
#include "StridesCore/HorseStraps.h"
#include "StridesCore/HorseTack.h"
#include "StridesCore/MiniJson.h"
#include "StridesCore/RiderRules.h"
#include "StridesHorse.h"
#include "StridesHorseTack.h"
#include "StridesHorseTackMesh.h"
#include "StridesRider.h"
#include "StridesRiderReplay.h"
#include "StridesRiderRig.h"

namespace StridesHorseTackMeshTest
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
// Repère local Unreal du siège (cm) → S du web (m).
FVector ToS(const FVector& U) { return FVector(-U.Y / 100.0, U.Z / 100.0, U.X / 100.0); }
FVector V(const strides::tack::V3& P) { return FVector(P.x, P.y, P.z); }
FVector VJ(const J& A) { return FVector(A[0].num(), A[1].num(), A[2].num()); }

// Sommet d'une pièce importée (modèle importé, LOD 0) : position de référence (espace du maillage) et influences (os du
// squelette de la pièce, poids 0..1).
struct FTackVert
{
	FVector P;
	TArray<TPair<int32, double>> W;
};
TArray<FTackVert> ImportedVerts(const USkeletalMesh* Mesh)
{
	TArray<FTackVert> Out;
#if WITH_EDITORONLY_DATA
	const FSkeletalMeshModel* Model = Mesh ? Mesh->GetImportedModel() : nullptr;
	if (!Model || Model->LODModels.Num() == 0) return Out;
	for (const FSkelMeshSection& Sec : Model->LODModels[0].Sections)
		for (const FSoftSkinVertex& Sv : Sec.SoftVertices)
		{
			FTackVert Vx;
			Vx.P = FVector(Sv.Position);
			for (int32 K = 0; K < MAX_TOTAL_INFLUENCES; K++)
				if (Sv.InfluenceWeights[K] > 0) Vx.W.Add({(int32)Sec.BoneMap[Sv.InfluenceBones[K]], Sv.InfluenceWeights[K] / 65535.0});
			Out.Add(Vx);
		}
#endif
	return Out;
}
int32 ImportedTriangles(const USkeletalMesh* Mesh)
{
#if WITH_EDITORONLY_DATA
	const FSkeletalMeshModel* Model = Mesh ? Mesh->GetImportedModel() : nullptr;
	if (!Model || Model->LODModels.Num() == 0) return -1;
	int32 N = 0;
	for (const FSkelMeshSection& Sec : Model->LODModels[0].Sections) N += Sec.NumTriangles;
	return N;
#else
	return -1;
#endif
}
}  // namespace StridesHorseTackMeshTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesHorseTackMeshTest, "Strides.Parite.HorseTackMesh", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FStridesHorseTackMeshTest::RunTest(const FString&)
{
	using namespace StridesHorseTackMeshTest;
	using namespace strides::rider;
	// Vérification dont le chiffre est aussi écrit au rapport (une vérification réussie n'y laisse sinon aucune trace).
	const auto Check = [this](const FString& Msg, bool bOk) {
		AddInfo(Msg);
		return TestTrue(Msg, bOk);
	};
	FTestWorld Wd(TEXT("StridesHorseTackMeshTest"));
	if (!TestNotNull(TEXT("monde de test"), Wd.World)) return false;
	AStridesHorse* Horse = Wd.World->SpawnActor<AStridesHorse>(FVector::ZeroVector, FRotator::ZeroRotator);
	AStridesRider* Rider = Wd.World->SpawnActor<AStridesRider>(FVector::ZeroVector, FRotator::ZeroRotator);
	if (!TestNotNull(TEXT("cheval"), Horse) || !TestNotNull(TEXT("cavalière"), Rider)) return false;
	TestNull(TEXT("monde non commencé (BeginPlay non distribué) : pas de sellerie affichée"), Horse->TackMesh());
	FString Err;
	UStridesHorseTack* Tack = NewObject<UStridesHorseTack>(Horse);
	if (!Check(FString::Printf(TEXT("sellerie lue par la règle initialisée (%s)"), *Err), Tack->Init(Horse->BodyMesh(), &Err))) return false;
	UStridesHorseTackMesh* TM = NewObject<UStridesHorseTackMesh>(Horse);
	if (!Check(FString::Printf(TEXT("sellerie affichée initialisée (%s)"), *Err), TM->Init(Horse, &Err))) return false;
	if (!Check(FString::Printf(TEXT("option -StridesHorseLead=web activée (%s)"), *Err), Horse->EnableWebLead(&Err))) return false;
	if (!Check(FString::Printf(TEXT("règles de monte activées (%s)"), *Err), Rider->EnableRulesRig(&Err))) return false;
	UStridesRiderRig* Rig = Rider->RulesRig();
	UPoseableMeshComponent* M = Rider->RulesMesh();
	Rider->SetActorTransform(FTransform::Identity);
	M->SetRelativeTransform(Rig->MeshInSeat());
	M->UpdateComponentToWorld();

	J Data;
	{
		FString Text;
		if (!TestTrue(TEXT("Content/Data/pjl_horse_tack_mesh.json lu"), FFileHelper::LoadFileToString(Text, *(FPaths::ProjectContentDir() / TEXT("Data/pjl_horse_tack_mesh.json"))))) return false;
		const std::string Src(TCHAR_TO_UTF8(*Text));
		Data = JParser(Src).parse();
	}
	USkeletalMeshComponent* Body = Horse->BodyMesh();
	const FReferenceSkeleton& BodyRef = Body->GetSkeletalMeshAsset()->GetRefSkeleton();

	// ---- 1. Pièces skinnées ----
	TestEqual(TEXT("pièces : autant que dans le web"), TM->NumPieces(), (int32)Data["pieces"].a.size());
	int32 VisibleWeb = 0, BadAttach = 0, BadBones = 0, Samples = 0, BadTri = 0;
	FWorst WRest, WWeight;
	std::map<std::string, std::pair<const J*, TArray<int32>>> Match;  // pièce → (données, sommet importé de chaque témoin)
	for (int32 I = 0; I < TM->NumPieces(); I++)
	{
		USkeletalMeshComponent* C = TM->Piece(I);
		const J& P = Data["pieces"][I];
		const FString Name = TM->PieceName(I);
		if (!TestNotNull(*FString::Printf(TEXT("%s : composant"), *Name), C)) continue;
		USkeletalMesh* Mesh = C->GetSkeletalMeshAsset();
		VisibleWeb += P["visible"].b;
		BadAttach += !Mesh || Mesh->GetSkeleton() != Body->GetSkeletalMeshAsset()->GetSkeleton() || C->LeaderPoseComponent.Get() != Body || C->GetAttachParent() != Body ||
					 !C->GetRelativeTransform().Equals(FTransform::Identity) || C->IsVisible() != P["visible"].b;
		const int32 Tri = ImportedTriangles(Mesh);
		if (Tri != (int32)P["triangles"].num())
		{
			BadTri++;
			AddError(FString::Printf(TEXT("%s : %d triangles importés, %d dans le web"), *Name, Tri, (int32)P["triangles"].num()));
		}
		const TArray<FTackVert> Vs = ImportedVerts(Mesh);
		const FReferenceSkeleton& Ref = Mesh->GetRefSkeleton();
		TArray<int32> Idx;
		for (const J& Sm : P["samples"].a)
		{
			Samples++;
			const strides::tack::V3 Rm = strides::tack::apply(Tack->GlbToMesh(), strides::tack::V3{Sm["rest"][0].num(), Sm["rest"][1].num(), Sm["rest"][2].num()});
			const FVector Want(Rm.x, Rm.y, Rm.z);
			int32 Best = INDEX_NONE;
			double Bd = 1e30;
			for (int32 K = 0; K < Vs.Num(); K++)
			{
				const double D = FVector::DistSquared(Vs[K].P, Want);
				if (D < Bd) Bd = D, Best = K;
			}
			Idx.Add(Best);
			WRest.See(FMath::Sqrt(Bd), FString::Printf(TEXT("%s sommet %d"), *Name, (int32)Sm["i"].num()));
			if (Best == INDEX_NONE) continue;
			// Os porteurs : mêmes noms, mêmes poids (16 bits ; renormalisés à l'import).
			TMap<FString, double> Got;
			for (const TPair<int32, double>& Wt : Vs[Best].W) Got.FindOrAdd(Ref.GetBoneName(Wt.Key).ToString()) += Wt.Value;
			double Sum = 0;
			for (const J& Bn : Sm["bones"].a) Sum += Bn[1].num();
			bool bOk = true;
			for (const J& Bn : Sm["bones"].a)
			{
				const double Wn = Bn[1].num() / Sum;
				const double* G = Got.Find(UTF8_TO_TCHAR(Bn[0].s.c_str()));
				if (Wn > 1e-3 && !G) bOk = false;
				WWeight.See(FMath::Abs((G ? *G : 0) - Wn), FString::Printf(TEXT("%s sommet %d, os %hs"), *Name, (int32)Sm["i"].num(), Bn[0].s.c_str()));
			}
			for (const TPair<FString, double>& G : Got)
			{
				bool bKnown = false;
				for (const J& Bn : Sm["bones"].a) bKnown |= G.Key == UTF8_TO_TCHAR(Bn[0].s.c_str());
				if (!bKnown && G.Value > 1e-3) bOk = false;
			}
			BadBones += !bOk;
		}
		Match[TCHAR_TO_UTF8(*Name)] = {&P, Idx};
	}
	TestEqual(TEXT("pièces : même squelette que le cheval, suiveuses du maillage du cheval, rattachées à lui, visibilité du web"), BadAttach, 0);
	TestEqual(TEXT("pièces visibles dans le web (setTackVisible, E1) : 7 sur 8 (bonnet masqué)"), VisibleWeb, 7);
	TestEqual(TEXT("triangles importés = triangles du web, chaque pièce"), BadTri, 0);
	Check(FString::Printf(TEXT("sommets témoins retrouvés à la pose de repos : %d témoins, écart max %.4g unité du maillage (%s)"), Samples, WRest.V, *WRest.Where), Samples > 90 && WRest.V >= 0 && WRest.V <= 0.01);
	Check(FString::Printf(TEXT("sommets témoins : mêmes os porteurs que le web (%d écarts), poids à %.2g près (%s)"), BadBones, WWeight.V, *WWeight.Where), BadBones == 0 && WWeight.V <= 2e-4);

	// Os du maillage des pièces → os du cheval (le suiveur lit les os du meneur par nom).
	std::map<std::string, TArray<int32>> ToBody;
	int32 Unmapped = 0;
	for (int32 I = 0; I < TM->NumPieces(); I++)
	{
		const FReferenceSkeleton& Ref = TM->Piece(I)->GetSkeletalMeshAsset()->GetRefSkeleton();
		TArray<int32>& Map = ToBody[TCHAR_TO_UTF8(*TM->PieceName(I))];
		for (int32 B = 0; B < Ref.GetNum(); B++)
		{
			Map.Add(BodyRef.FindBoneIndex(Ref.GetBoneName(B)));
			Unmapped += Map.Last() == INDEX_NONE;
		}
	}
	TestEqual(TEXT("os des pièces : tous présents dans le squelette du maillage du cheval"), Unmapped, 0);

	// ---- 2 et 3. Rejeu (contrôle : cheval posé comme le web, phase du web) ----
	FStridesRiderOnHorseReplay Replay;
	if (!Check(FString::Printf(TEXT("rejeu prêt (%s)"), *Err), Replay.Setup(Horse, Tack, Rig, &Err))) return false;
	const FString Ora = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../core/tests/oracles/monte"));
	const strides::straps::StrapsModel& Sm = TM->Model();
	const TCHAR* Ids[] = {TEXT("E1"), TEXT("E1b"), TEXT("E2g"), TEXT("E2d"), TEXT("E3"), TEXT("E3b")};
	FWorst WSide, WGrip, WSkinSec, WAnchorSec, WBonnet, WSkin, WSkinGround, WIronToe, WIronO2, WIronO2Before, WLeather, WRein, WBuf, WIronComp, WCost, WReinLen;
	int32 BoundsOut = 0, BadMat = 0, SkinSec = 0, SkinPts = 0, Frames = 0, Hidden = 0, Before = 0;
	std::map<std::string, FWorst> WPiece, WPieceE;
	double CostSum = 0;
	for (int32 Pass = 0; Pass < 2; Pass++)
	{
		// Pass 0 : contrôle (cheval posé comme le web, phase du web) : témoins skinnés et étriers contre le web ;
		// pass 1 : cheval du jeu (niveau B) : construction des étriers et des lanières, tampons affichés, coût.
		Replay.SetWebPose(Pass == 0);
		Replay.SetWebPhase(Pass == 0);
		for (const TCHAR* Id : Ids)
		{
			J O1, O2, St;
			try
			{
				O1 = loadJson(TCHAR_TO_UTF8(*(Ora / TEXT("o1") / Id + TEXT(".json"))));
				O2 = loadJson(TCHAR_TO_UTF8(*(Ora / TEXT("o2/rider_f") / Id + TEXT(".json"))));
				St = loadJson(TCHAR_TO_UTF8(*(Ora / TEXT("sellerie") / Id + TEXT(".json"))));
			}
			catch (const std::exception& Ex)
			{
				AddError(FString::Printf(TEXT("%s : oracle illisible (%hs)"), Id, Ex.what()));
				continue;
			}
			if (!Replay.Begin(O1, &Err)) { AddError(Err); continue; }
			TM->ResetStraps();
			int32 ToeIdx[2] = {-1, -1};
			for (size_t B = 0; B < O2["setup"]["bones"].a.size(); B++)
			{
				if (O2["setup"]["bones"][B].s == "lToe") ToeIdx[0] = (int32)B;
				if (O2["setup"]["bones"][B].s == "rToe") ToeIdx[1] = (int32)B;
			}
			const double ScaleO2 = O2["setup"]["scale"].num();
			bool bJumped = false;
			UStridesHorseTackMesh::FRiderPoints PrevRp;
			for (int32 I = 0; I < Replay.Num(); I++)
			{
				const FString At = FString::Printf(TEXT("%s %s image %d"), Pass ? TEXT("jeu") : TEXT("contrôle"), Id, I);
				if (!Replay.Step(I, &Err)) { AddError(FString::Printf(TEXT("%s : %s"), *At, *Err)); break; }
				bJumped |= O1["frames"][I]["hz"]["jT"].num() >= 0;
				const strides::tack::TackOut& O = Tack->Out();
				const FTransform SeatW = Tack->SeatWorld();
				UStridesHorseTackMesh::FRiderPoints Rp;
				if (!UStridesHorseTackMesh::RiderPointsFromRig(Rig, M->GetComponentTransform(), Rp)) { AddError(TEXT("points de la cavalière")); break; }
				TM->StepStraps(SeatW, O, &Rp, nullptr);
				Frames++;
				// Creux du poing (realistic.js gripPoint) : milieu des os index_02, middle_02, pinky_02 et middle_01, relus sur le
				// maillage posé par leur nom (calcul indépendant de UStridesRiderRig::GripPoint).
				for (int32 K = 0; K < 2; K++)
				{
					FVector G = FVector::ZeroVector;
					for (const TCHAR* Nm : {TEXT("index_02"), TEXT("middle_02"), TEXT("pinky_02"), TEXT("middle_01")})
						G += M->GetBoneLocation(FName(FString(Nm) + (K ? TEXT("_r") : TEXT("_l"))), EBoneSpaces::WorldSpace) / 4.0;
					WGrip.See((G - Rp.Grip[K]).Size(), FString::Printf(TEXT("%s, poing %d"), *At, K));
				}
				CostSum += TM->LastCostMs();
				WCost.See(TM->LastCostMs(), At);
				const strides::straps::StrapsOut& So = TM->Out();
				if (!So.show) { Hidden++; continue; }
				for (int32 K = 0; K < 2; K++)
				{
					// Étrier dans S (web) : sous l'orteil de la pose de l'image, abaissé de toeDrop · scale (verticale du monde).
					const FVector IronS = ToS(SeatW.InverseTransformPosition(TM->IronWorld(K)));
					const FVector ToeS = ToS(Rp.Toe[K]);
					const FVector UpS = ToS(SeatW.InverseTransformVector(FVector(0, 0, 100)));
					WIronToe.See(100 * (IronS - (ToeS - UpS * Sm.toeDrop * Rp.Scale)).Size(), At);
					// Contre l'étrier du web recalculé sur O2 rider_f : orteil d'O2 abaissé selon la verticale du monde du web (hz.S).
					if (Pass == 0 && ToeIdx[K] >= 0)
					{
						const J& Sw = O1["frames"][I]["hz"]["S"];
						const strides::tack::Q4 Qs{-Sw[3].num(), -Sw[4].num(), -Sw[5].num(), Sw[6].num()};
						const FVector UpW = V(strides::tack::rotate(Qs, strides::tack::V3{0, 1, 0}));
						const FVector Ref = VJ(O2["frames"][I]["cl"][ToeIdx[K]]) - UpW * Sm.toeDrop * ScaleO2;
						const double D = 100 * (IronS - Ref).Size();
						WIronO2.See(D, At);
						if (!bJumped) WIronO2Before.See(D, At), Before++;
					}
					// Étrivière : porte-étrivière → œil de l'étrier (premier et dernier centres du ruban).
					const std::vector<strides::tack::V3>& Le = So.leather[K];
					const FVector Bar = SeatW.TransformPosition(UStridesHorseTack::HolderToActor(O.anchorS[K ? strides::tack::BarR : strides::tack::BarL]));
					const FVector C0 = (UStridesHorseTackMesh::FromWeb(Le[0]) + UStridesHorseTackMesh::FromWeb(Le[1])) / 2;
					const FVector C1 = (UStridesHorseTackMesh::FromWeb(Le[Le.size() - 2]) + UStridesHorseTackMesh::FromWeb(Le.back())) / 2;
					WLeather.See(FMath::Max((C0 - Bar).Size(), (C1 - (TM->IronWorld(K) + FVector(0, 0, 100 * Sm.ironEye))).Size()), At);
					// Rênes : mors → poing de l'image précédente (dans le siège de cette image).
					const std::vector<strides::tack::V3>& Re = So.rein[K];
					const FVector Bit = SeatW.TransformPosition(UStridesHorseTack::HolderToActor(O.anchorS[K ? strides::tack::BitR : strides::tack::BitL]));
					const FVector R0 = (UStridesHorseTackMesh::FromWeb(Re[0]) + UStridesHorseTackMesh::FromWeb(Re[1])) / 2;
					const FVector R1 = (UStridesHorseTackMesh::FromWeb(Re[Re.size() - 2]) + UStridesHorseTackMesh::FromWeb(Re.back())) / 2;
					const FVector Hand = SeatW.TransformPosition(I > 0 ? PrevRp.Grip[K] : Rp.Grip[K]);
					WRein.See(FMath::Max((R0 - Bit).Size(), (R1 - Hand).Size()), At);
					if (Pass == 0 && St["frames"][I]["st"]["in"]["hands"].t == J::Arr) WReinLen.See(FMath::Abs((Bit - Hand).Size() / 100.0 - FVector::Dist(VJ(St["frames"][I]["st"]["in"]["an"][K ? "bitR" : "bitL"]), VJ(St["frames"][I]["st"]["in"]["hands"][K]))) * 100, At);
					// Affichage : étrier et tampons du ruban = sortie du cœur.
					WIronComp.See((TM->IronMesh(K)->GetComponentLocation() - TM->IronWorld(K)).Size(), At);
				}
				// Largeur des rubans : étrivières dans l'axe du cheval (à plat sur le quartier), rênes à la verticale du monde.
				for (int32 S = 0; S < 4; S++)
				{
					const std::vector<strides::tack::V3>& P = S < 2 ? So.leather[S] : So.rein[S - 2];
					const FVector WidthDir = (UStridesHorseTackMesh::FromWeb(P[1]) - UStridesHorseTackMesh::FromWeb(P[0])).GetSafeNormal();
					const FVector Want = S < 2 ? Horse->GetActorForwardVector() : FVector(0, 0, 1);
					WSide.See((WidthDir - Want).Size(), At);
				}
				for (int32 S = 0; S < 4; S++)
				{
					const FProcMeshSection* Sec = TM->StrapsMesh()->GetProcMeshSection(S);
					const std::vector<strides::tack::V3>& P = S < 2 ? So.leather[S] : So.rein[S - 2];
					if (!Sec || Sec->ProcVertexBuffer.Num() != (int32)P.size()) { WBuf.See(1e9, At); continue; }
					for (int32 Vx = 0; Vx < Sec->ProcVertexBuffer.Num(); Vx++) WBuf.See((Sec->ProcVertexBuffer[Vx].Position - UStridesHorseTackMesh::FromWeb(P[Vx])).Size(), At);
				}
				PrevRp = Rp;
				// 2. Témoins skinnés (contrôle, images du canal tk).
				const J& Tk = St["frames"][I]["tk"];
				// Cheval du jeu (pass 1), E1 image 0 : témoins skinnés avec les os réels du maillage du cheval, dans S (diagnostic
				// du rendu : position attendue des pièces sur le cheval affiché), et os des suiveurs = os du meneur.
				if (Pass == 1)
				{
					const TArray<FTransform>& CS = Body->GetComponentSpaceTransforms();
					const FTransform B2S = Body->GetComponentTransform() * SeatW.Inverse();
					for (int32 Pc = 0; Pc < TM->NumPieces(); Pc++)
					{
						USkeletalMeshComponent* C = TM->Piece(Pc);
						const std::string Name = TCHAR_TO_UTF8(*TM->PieceName(Pc));
						const USkeletalMesh* Mesh = C->GetSkeletalMeshAsset();
						const TArray<FMatrix44f>& Inv = Mesh->GetRefBasesInvMatrix();
						const TArray<FTackVert> Vs = ImportedVerts(Mesh);
						const TArray<int32>& Idx = Match[Name].second;
						const TArray<int32>& Map = ToBody[Name];
						FVector Mn(1e9), Mx(-1e9);
						for (int32 Sx = 0; Sx < Idx.Num(); Sx++)
						{
							if (!Vs.IsValidIndex(Idx[Sx])) continue;
							FVector P = FVector::ZeroVector;
							for (const TPair<int32, double>& Wt : Vs[Idx[Sx]].W)
								if (CS.IsValidIndex(Map[Wt.Key])) P += (FMatrix(Inv[Wt.Key]) * CS[Map[Wt.Key]].ToMatrixWithScale()).TransformPosition(Vs[Idx[Sx]].P) * Wt.Value;
							const FVector Ps = ToS(B2S.TransformPosition(P));
							Mn = Mn.ComponentMin(Ps), Mx = Mx.ComponentMax(Ps);
						}
						double BoneGap = 0;
						const FReferenceSkeleton& Ref = Mesh->GetRefSkeleton();
						for (int32 Bn = 0; Bn < Ref.GetNum(); Bn++)
							BoneGap = FMath::Max(BoneGap, (C->GetBoneLocation(Ref.GetBoneName(Bn)) - Body->GetBoneLocation(Ref.GetBoneName(Bn))).Size());
						if (I == 0 && FString(Id) == TEXT("E1")) AddInfo(FString::Printf(TEXT("cheval du jeu, E1 image 0, %hs : témoins dans S de %s à %s (m) ; os du suiveur contre os du meneur %.3g cm ; composant %s, visible %d"),
							Name.c_str(), *Mn.ToString(), *Mx.ToString(), BoneGap, *C->GetComponentLocation().ToString(), (int32)C->IsVisible()));
						// Chemin du rendu : matrices référence → local du composant (suiveur : os du meneur), sommets du rendu.
						FVector Rn(1e9), Rx(-1e9);
						int32 NR = 0;
						if (FSkeletalMeshRenderData* RD = Mesh->GetResourceForRendering())
						{
							if (RD->LODRenderData.Num() > 0)
							{
								FSkeletalMeshLODRenderData& LD = RD->LODRenderData[0];
								TArray<FMatrix44f> R2L;
								C->CacheRefToLocalMatrices(R2L);
								TArray<FVector3f> Pos;
								USkinnedMeshComponent::ComputeSkinnedPositions(C, Pos, R2L, LD, LD.SkinWeightVertexBuffer);
								const FTransform C2S = C->GetComponentTransform() * SeatW.Inverse();
								for (const FVector3f& Q : Pos)
								{
									const FVector Ps = ToS(C2S.TransformPosition(FVector(Q)));
									Rn = Rn.ComponentMin(Ps), Rx = Rx.ComponentMax(Ps);
								}
								NR = Pos.Num();
								// Rendu : bornes du composant qui contiennent les sommets posés (sinon la pièce est écartée du champ), matériau du web.
								const FBox Box = C->Bounds.GetBox().ExpandBy(1.0);
								int32 Out = 0;
								for (const FVector3f& Q : Pos) Out += !Box.IsInside(C->GetComponentTransform().TransformPosition(FVector(Q)));
								BoundsOut += C->IsVisible() ? Out : 0;
								const FString Want = TEXT("MI_Tack_") + TM->PieceName(Pc).RightChop(5);
								BadMat += GetNameSafe(C->GetMaterial(0)) != Want;
								if (I == 0 && FString(Id) == TEXT("E1")) AddInfo(FString::Printf(TEXT("    rendu %hs : %d sommets, %d sections, %d os actifs, S de %s à %s"), Name.c_str(), NR, LD.RenderSections.Num(), LD.ActiveBoneIndices.Num(), *Rn.ToString(), *Rx.ToString()));
							}
						}
					}
				}
				if (Pass == 0 && Tk.t == J::Obj)
				{
					const TArray<FTransform>& CS = Replay.LastPose();
					const strides::tack::Affine& ToH = Replay.LastToHolder();
					const bool bGround = O1["frames"][I]["hz"]["jT"].num() < 0;
					// Mouvements secondaires du web (bascule face aux barres, levée de tête : SecondaryMotion, _barClear) : non portés
					// (étape S4), le contrôle ne les pose pas ; ces images sont relevées à part, avec l'écart des ancres du cheval.
					const J& Sec = O1["frames"][I]["mx"]["sec"];
					// Images posées par les seuls clips : hors saut (jT < 0) et 10 images après la réception, sans bascule ni levée de
					// tête ; le bonnet (oreilles : earPrick, non porté) est relevé à part.
					const J& Hz1 = O1["frames"][I]["hz"];
					const bool bSec = (Sec.t == J::Obj && (FMath::Abs(Sec["bascule"].num()) > 1e-9 || FMath::Abs(Sec["headLift"].num()) > 1e-9)) || Hz1["jT"].num() >= 0 || Hz1["lT"].num() <= 10 * Replay.Dt();
					if (bSec)
						for (int32 A = 0; A < strides::tack::AnchorCount; A++)
							WAnchorSec.See(100 * (V(O.anchorS[A]) - VJ(O1["frames"][I]["hz"]["an"][strides::tack::anchorName(A)])).Size(), FString::Printf(TEXT("%s, ancre %hs"), *At, strides::tack::anchorName(A)));
					for (int32 Pc = 0; Pc < TM->NumPieces(); Pc++)
					{
						const std::string Name = TCHAR_TO_UTF8(*TM->PieceName(Pc));
						const J& Web = Tk[Name];
						const USkeletalMesh* Mesh = TM->Piece(Pc)->GetSkeletalMeshAsset();
						const TArray<FMatrix44f>& Inv = Mesh->GetRefBasesInvMatrix();
						const TArray<FTackVert> Vs = ImportedVerts(Mesh);
						const TArray<int32>& Idx = Match[Name].second;
						const TArray<int32>& Map = ToBody[Name];
						for (int32 Sx = 0; Sx < Idx.Num() && Sx < (int32)Web.a.size(); Sx++)
						{
							if (!Vs.IsValidIndex(Idx[Sx])) continue;
							const FTackVert& Vx = Vs[Idx[Sx]];
							FVector P = FVector::ZeroVector;
							for (const TPair<int32, double>& Wt : Vx.W)
							{
								const int32 Bb = Map[Wt.Key];
								if (!CS.IsValidIndex(Bb)) continue;
								const FMatrix Sk = FMatrix(Inv[Wt.Key]) * CS[Bb].ToMatrixWithScale();
								P += Sk.TransformPosition(Vx.P) * Wt.Value;
							}
							const strides::tack::V3 Ph = strides::tack::apply(ToH, strides::tack::V3{P.X, P.Y, P.Z});
							const FVector Ps = V(strides::tack::toSeat(Ph, O.seatPos, O.seatQ));
							const double D = 100 * (Ps - VJ(Web[Sx])).Size();
							if (bSec || Name == "tack_bonnet")
							{
								if (Name == "tack_bonnet" && !bSec) WBonnet.See(D, FString::Printf(TEXT("%s, témoin %d"), *At, Sx));
								SkinSec++;
								WSkinSec.See(D, FString::Printf(TEXT("%s, %hs témoin %d"), *At, Name.c_str(), Sx));
								continue;
							}
							SkinPts++;
							WSkin.See(D, FString::Printf(TEXT("%s, %hs témoin %d"), *At, Name.c_str(), Sx));
							WPiece[Name].See(D, FString::Printf(TEXT("%s témoin %d"), *At, Sx));
							WPieceE[Name + " " + TCHAR_TO_UTF8(Id)].See(D, FString::Printf(TEXT("image %d témoin %d"), I, Sx));
							if (bGround) WSkinGround.See(D, FString::Printf(TEXT("%s, %hs témoin %d"), *At, Name.c_str(), Sx));
						}
					}
				}
			}
		}
	}
	Replay.SetWebPose(false);
	Replay.SetWebPhase(false);
	for (const auto& [K, Wp] : WPiece) AddInfo(FString::Printf(TEXT("témoins skinnés, %hs : écart max %.3f cm (%s)"), K.c_str(), Wp.V, *Wp.Where));
	for (const auto& [K, Wp] : WPieceE) AddInfo(FString::Printf(TEXT("témoins skinnés, %hs : écart max %.3f cm (%s)"), K.c_str(), Wp.V, *Wp.Where));
	AddInfo(FString::Printf(TEXT("bonnet (masqué dans le web ; oreilles : earPrick non porté), images posées par les clips : écart max %.3f cm (%s), information"), WBonnet.V, *WBonnet.Where));
	AddInfo(FString::Printf(TEXT("images au saut, à la réception (10 images) ou avec bascule ou levée de tête du web (corps au saut, mouvements secondaires : non portés, étape S4) : %d points, écart max des témoins %.3f cm (%s) ; écart des ancres du cheval aux mêmes images %.3f cm (%s), information"),
		SkinSec, WSkinSec.V, *WSkinSec.Where, WAnchorSec.V, *WAnchorSec.Where));
	Check(FString::Printf(TEXT("témoins skinnés (7 pièces affichées), cheval posé comme le web, images posées par les seuls clips : %d points contre l'oracle sellerie/ (tk), écart max %.3f cm (%s) ; au sol %.3f cm (%s)"), SkinPts, WSkin.V, *WSkin.Where, WSkinGround.V, *WSkinGround.Where),
		SkinPts > 2500 && WSkin.V >= 0 && WSkin.V <= 0.5);
	TestEqual(TEXT("sellerie affichée à chaque image (caméra proche)"), Hidden, 0);
	Check(FString::Printf(TEXT("étrier sous l'orteil de la pose de l'image, abaissé de toeDrop · scale : écart max %.2g cm (%s)"), WIronToe.V, *WIronToe.Where), Frames > 1000 && WIronToe.V >= 0 && WIronToe.V <= 1e-4);
	Check(FString::Printf(TEXT("étrier contre celui du web recalculé sur O2 rider_f (contrôle) : avant le premier saut %.3f cm (%s, %d), toutes images %.3f cm (%s) ; tolérance M4 2 cm"),
		WIronO2Before.V, *WIronO2Before.Where, Before, WIronO2.V, *WIronO2.Where), Before > 800 && WIronO2Before.V >= 0 && WIronO2Before.V <= 2.0);
	Check(FString::Printf(TEXT("étrivière : porte-étrivière → œil de l'étrier (écart max %.2g cm, %s)"), WLeather.V, *WLeather.Where), WLeather.V >= 0 && WLeather.V <= 1e-4);
	Check(FString::Printf(TEXT("rênes : mors → poing de l'image précédente (écart max %.2g cm, %s)"), WRein.V, *WRein.Where), WRein.V >= 0 && WRein.V <= 1e-4);
	TestEqual(TEXT("rendu : bornes de chaque pièce contenant ses sommets posés (cheval du jeu, chaque image des six scénarios)"), BoundsOut, 0);
	TestEqual(TEXT("rendu : matériau de chaque pièce = MI_Tack_<pièce> (valeurs du web), chaque image"), BadMat, 0);
	Check(FString::Printf(TEXT("largeur des rubans : étrivières dans l'axe du cheval, rênes à la verticale (écart max %.2g)"), WSide.V), WSide.V >= 0 && WSide.V <= 1e-6);
	Check(FString::Printf(TEXT("creux du poing = milieu de index_02, middle_02, pinky_02, middle_01 (écart max %.2g cm, %s)"), WGrip.V, *WGrip.Where), WGrip.V >= 0 && WGrip.V <= 1e-3);
	{
		// Étriers : géométrie du web (repère du holder) dans le repère de l'acteur (X = 100 z, Y = −100 x, Z = 100 y).
		const J& Ip = Data["iron"]["position"];
		const FProcMeshSection* Sec = TM->IronMesh(0)->GetProcMeshSection(0);
		double Wi = Sec && Sec->ProcVertexBuffer.Num() * 3 == (int32)Ip.a.size() ? 0 : 1e9;
		for (int32 Vx = 0; Sec && Wi < 1e9 && Vx < Sec->ProcVertexBuffer.Num(); Vx++)
			Wi = FMath::Max(Wi, (Sec->ProcVertexBuffer[Vx].Position - FVector(100 * Ip[3 * Vx + 2].num(), -100 * Ip[3 * Vx].num(), 100 * Ip[3 * Vx + 1].num())).Size());
		Check(FString::Printf(TEXT("géométrie des étriers = celle du web (%d sommets, écart max %.2g cm)"), Sec ? Sec->ProcVertexBuffer.Num() : 0, Wi), Wi <= 1e-4);
	}
	Check(FString::Printf(TEXT("affichage : étriers et tampons des rubans = sortie du cœur (écart max %.2g cm, étrier %.2g cm)"), WBuf.V, WIronComp.V), WBuf.V >= 0 && WBuf.V <= 1e-3 && WIronComp.V <= 1e-3);
	AddInfo(FString::Printf(TEXT("longueur des rênes (mors → poing), contrôle contre le web (O1, cavalier du web) : écart max %.2f cm (%s), information"), WReinLen.V, *WReinLen.Where));
	AddInfo(FString::Printf(TEXT("coût de StepStraps (lanières, étriers, rubans) : moyenne %.4f ms, max %.4f ms (%s), %d images"), Frames ? CostSum / Frames : 0.0, WCost.V, *WCost.Where, Frames));
	return true;
}
