// Robe du cheval engagé (C1) dans le moteur :
//  - Strides.Horse.CoatMesh : le corps importé (/Game/Characters/Horse/horse_pjl_coat/SK_HorseCoatBody) utilise le squelette
//    du cheval (mêmes clips) et porte, sommet par sommet, les masques de robe du jeu web : chaque sommet du modèle importé
//    (LOD 0) a UV0 et les canaux 1 à 3 d'un sommet de unreal/core/tests/oracles/horse_coat_vertices.json (écrit par
//    scripts/unreal/coat-horse-glb.py depuis coatMask / coatRegion d'asset.js et les bruits du shader évalués sur le GPU),
//    et chaque sommet de l'oracle est présent ; UV en pleine précision dans les données de rendu (4 canaux) ;
//  - Strides.Horse.Coat : AStridesHorse dans un monde de test : monture engagée = activeHorseId de la sauvegarde (écurie
//    neuve : Comète), paramètres des instances dynamiques des matériaux de robe et de crins = uniformes du jeu web pour la
//    robe de ce cheval (oracle horse_coat.json : cheval engagé de la sauvegarde neuve, puis uniformes de makeCoatMaterial /
//    makeHairMaterial pour cette robe) ; même chose après un changement de monture (Ulysse, gris) ; matériaux posés sur le
//    corps et les crins. Les valeurs sont comparées à celles du web (float des paramètres du matériau).
#include "Misc/AutomationTest.h"
#include <cstdio>
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/World.h"
#include "Components/SkeletalMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Misc/Paths.h"
#include "Rendering/SkeletalMeshRenderData.h"
#if WITH_EDITORONLY_DATA
#include "Rendering/SkeletalMeshModel.h"
#endif
#include "StridesCore/HorseCoat.h"
#include "StridesCore/MiniJson.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesSaveSubsystem.h"

namespace StridesCoatTest
{
const FString OracleDir() { return FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../core/tests/oracles")); }
// Écriture canonique d'une valeur JSON (clés triées, nombres en %.17g) : comparaison de deux robes.
std::string Canon(const J& X)
{
	switch (X.t)
	{
		case J::Null: return "null";
		case J::Bool: return X.b ? "true" : "false";
		case J::Num: { char B[40]; std::snprintf(B, sizeof B, "%.17g", X.n); return B; }
		case J::Str: return "\"" + X.s + "\"";
		case J::Arr: { std::string R = "["; for (const J& Y : X.a) R += Canon(Y) + ","; return R + "]"; }
		default: { std::string R = "{"; for (const auto& [K, Y] : X.o) R += K + ":" + Canon(Y) + ","; return R + "}"; }
	}
}
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
}  // namespace StridesCoatTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesHorseCoatMeshTest, "Strides.Horse.CoatMesh", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FStridesHorseCoatMeshTest::RunTest(const FString&)
{
	USkeletalMesh* Body = LoadObject<USkeletalMesh>(nullptr, TEXT("/Game/Characters/Horse/horse_pjl_coat/SK_HorseCoatBody.SK_HorseCoatBody"));
	USkeletalMesh* Orig = LoadObject<USkeletalMesh>(nullptr, TEXT("/Game/Characters/Horse/horse_pjl_normalized/horse_pjl_normalized/SkeletalMeshes/Object_426.Object_426"));
	if (!TestNotNull(TEXT("corps à masques de robe importé"), Body) || !TestNotNull(TEXT("corps d'origine"), Orig)) return false;
	TestTrue(TEXT("même squelette que le cheval (mêmes clips)"), Body->GetSkeleton() == Orig->GetSkeleton());
	const FSkeletalMeshRenderData* RD = Body->GetResourceForRendering();
	if (!TestTrue(TEXT("données de rendu"), RD && RD->LODRenderData.Num() > 0)) return false;
	const FStaticMeshVertexBuffer& VB = RD->LODRenderData[0].StaticVertexBuffers.StaticMeshVertexBuffer;
	TestTrue(FString::Printf(TEXT("rendu : 4 canaux d'UV (%u), pleine précision"), VB.GetNumTexCoords()), VB.GetNumTexCoords() == 4 && VB.GetUseFullPrecisionUVs());
#if WITH_EDITORONLY_DATA
	const J O = loadJson(TCHAR_TO_UTF8(*(StridesCoatTest::OracleDir() / TEXT("horse_coat_vertices.json"))));
	const std::vector<J>& V = O["verts"].a;
	if (!TestTrue(TEXT("oracle des sommets lu"), V.size() > 10000)) return false;
	// Index par UV0 (grille de 1e-5) → sommets de l'oracle.
	TMap<FIntPoint, TArray<int32>> ByUv;
	auto Key = [](double U, double W) { return FIntPoint((int32)FMath::RoundToDouble(U * 1e5), (int32)FMath::RoundToDouble(W * 1e5)); };
	for (int32 I = 0; I < (int32)V.size(); I++) ByUv.FindOrAdd(Key(V[I][0].num(), V[I][1].num())).Add(I);
	TArray<bool> Seen;
	Seen.Init(false, (int32)V.size());
	const FSkeletalMeshLODModel& Lod = Body->GetImportedModel()->LODModels[0];
	int32 NSoft = 0, Bad = 0;
	double Worst = 0;
	for (const FSkelMeshSection& S : Lod.Sections)
		for (const FSoftSkinVertex& SV : S.SoftVertices)
		{
			NSoft++;
			int32 Best = INDEX_NONE;
			double BestErr = 1e30;
			for (int32 Dx = -1; Dx <= 1; Dx++)
				for (int32 Dy = -1; Dy <= 1; Dy++)
					if (const TArray<int32>* C = ByUv.Find(Key(SV.UVs[0].X, SV.UVs[0].Y) + FIntPoint(Dx, Dy)))
						for (int32 I : *C)
						{
							const J& R = V[I];
							const double Got[8] = {SV.UVs[0].X, SV.UVs[0].Y, SV.UVs[1].X, SV.UVs[1].Y, SV.UVs[2].X, SV.UVs[2].Y, SV.UVs[3].X, SV.UVs[3].Y};
							double E = 0;
							for (int32 K = 0; K < 8; K++) E = FMath::Max(E, FMath::Abs(Got[K] - R[K].num()));
							if (E < BestErr) { BestErr = E; Best = I; }
							// Sommets de l'oracle aux mêmes UV et canaux (coutures : positions ou normales seules différentes) :
							// tous retrouvés par ce sommet importé.
							if (E <= 1e-5) Seen[I] = true;
						}
			if (Best == INDEX_NONE || BestErr > 1e-5)
			{
				if (++Bad <= 5) AddError(FString::Printf(TEXT("sommet importé (%f, %f) sans équivalent dans l'oracle (écart %g)"), SV.UVs[0].X, SV.UVs[0].Y, BestErr));
				continue;
			}
			Worst = FMath::Max(Worst, BestErr);
		}
	int32 Missing = 0;
	for (bool B : Seen) Missing += B ? 0 : 1;
	TestTrue(FString::Printf(TEXT("%d sommets importés, tous dans l'oracle (écart max %g)"), NSoft, Worst), Bad == 0 && NSoft >= (int32)V.size());
	TestTrue(FString::Printf(TEXT("%d sommets de l'oracle, %d absents du maillage importé"), (int32)V.size(), Missing), Missing == 0);
	AddInfo(FString::Printf(TEXT("corps importé : %d sommets (LOD 0), %d sommets de l'oracle retrouvés, écart max %g"), NSoft, (int32)V.size() - Missing, Worst));
#endif
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesHorseCoatTest, "Strides.Horse.Coat", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesHorseCoatTest::RunTest(const FString&)
{
	using namespace StridesCoatTest;
	FTestWorld W(TEXT("StridesHorseCoatTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	UStridesSaveSubsystem* Save = W.GI->GetSubsystem<UStridesSaveSubsystem>();
	if (!TestNotNull(TEXT("données"), Data) || !TestNotNull(TEXT("sauvegarde"), Save) || !TestNotNull(TEXT("horse_coats.json lu"), Data->HorseCoats())) return false;
	const J O = loadJson(TCHAR_TO_UTF8(*(OracleDir() / TEXT("horse_coat.json"))));
	// Uniformes du web pour la robe rendue par coatOf (même robe dans la liste « uniforms » de l'oracle).
	auto WebUniforms = [&O](const J& Coat) -> const J* {
		for (const J& U : O["uniforms"].a)
			if (Canon(U["coat"]) == Canon(Coat)) return &U["out"];
		return nullptr;
	};
	auto Check = [&](AStridesHorse* Horse, const J& Engaged, const TCHAR* What) {
		const J* U = WebUniforms(Engaged["coat"]);
		if (!TestNotNull(*FString::Printf(TEXT("%s : uniformes du web pour cette robe"), What), U)) return;
		TestEqual(*FString::Printf(TEXT("%s : cheval engagé"), What), Horse->ProfileId, FString(UTF8_TO_TCHAR(Engaged["id"].s.c_str())));
		UMaterialInstanceDynamic* C = Horse->CoatMaterial();
		UMaterialInstanceDynamic* H = Horse->HairMaterial();
		if (!TestTrue(*FString::Printf(TEXT("%s : robe posée"), What), Horse->HasEngagedCoat() && C && H)) return;
		TestTrue(*FString::Printf(TEXT("%s : matériau de robe sur le corps, de crins sur les crins"), What),
			Horse->BodyMesh()->GetMaterial(0) == C && Horse->ManeMesh()->GetMaterial(0) == H);
		auto Vec = [&](UMaterialInstanceDynamic* M, const TCHAR* Name, const J& Want, int32 N) {
			FLinearColor Got;
			if (!TestTrue(*FString::Printf(TEXT("%s : paramètre %s"), What, Name), M->GetVectorParameterValue(FHashedMaterialParameterInfo(FName(Name)), Got))) return;
			const float G[4] = {Got.R, Got.G, Got.B, Got.A};
			bool Ok = (int32)Want.a.size() == N;
			for (int32 K = 0; Ok && K < N; K++) Ok = G[K] == (float)Want[K].num();
			TestTrue(*FString::Printf(TEXT("%s : %s = (%g %g %g %g), web %s"), What, Name, G[0], G[1], G[2], G[3], UTF8_TO_TCHAR(Canon(Want).c_str())), Ok);
		};
		auto Scal = [&](UMaterialInstanceDynamic* M, const TCHAR* Name, double Want) {
			float Got = -1;
			TestTrue(*FString::Printf(TEXT("%s : %s = %g, web %g"), What, Name, Got, Want), M->GetScalarParameterValue(FHashedMaterialParameterInfo(FName(Name)), Got) && Got == (float)Want);
		};
		Vec(C, TEXT("CoatColor"), (*U)["coat"], 3);
		Vec(C, TEXT("PointsColor"), (*U)["points"], 3);
		Vec(C, TEXT("Socks"), (*U)["socks"], 4);
		Vec(C, TEXT("Blaze"), (*U)["blaze"], 4);
		Scal(C, TEXT("PointsAmt"), (*U)["pointsAmt"].num());
		Scal(C, TEXT("Detail"), (*U)["detail"].num());
		Scal(C, TEXT("Roughness"), (*U)["roughness"].num());
		Scal(C, TEXT("Wet"), (*U)["wet"].num());
		Vec(H, TEXT("HairColor"), (*U)["hair"], 3);
		Scal(H, TEXT("Roughness"), (*U)["hairRoughness"].num());
	};
	// Cas de l'oracle : sauvegarde neuve ({}) et écurie Comète + Ulysse, monture Ulysse.
	const J* Fresh = nullptr;
	const J* Ulysse = nullptr;
	for (const J& E : O["engaged"].a)
	{
		if (E["save"].o.empty()) Fresh = &E;
		if (E["save"]["activeHorse"].s == "ulysse" && E["id"].s == "ulysse") Ulysse = &E;
	}
	if (!TestTrue(TEXT("cas de l'oracle : sauvegarde neuve, monture Ulysse"), Fresh && Ulysse)) return false;
	AStridesHorse* Horse = W.World->SpawnActor<AStridesHorse>();
	if (!TestNotNull(TEXT("cheval"), Horse)) return false;
	TestTrue(TEXT("corps à masques de robe chargé"), Horse->HasCoatBody());
	const strides::SaveGame Neuve = strides::SaveGame::fresh();
	Save->SetStable(Neuve.horses, Neuve.activeHorse);
	TestTrue(TEXT("robe posée (sauvegarde neuve)"), Horse->ApplyEngagedCoat());
	Check(Horse, *Fresh, TEXT("sauvegarde neuve"));
	std::vector<std::string> Hs;
	for (const J& X : (*Ulysse)["save"]["horses"].a) Hs.push_back(X.s);
	Save->SetStable(Hs, (*Ulysse)["save"]["activeHorse"].s);
	TestTrue(TEXT("robe posée (monture Ulysse)"), Horse->ApplyEngagedCoat());
	Check(Horse, *Ulysse, TEXT("monture Ulysse"));
	Save->SetStable(Neuve.horses, Neuve.activeHorse);
	Horse->Destroy();
	return true;
}
