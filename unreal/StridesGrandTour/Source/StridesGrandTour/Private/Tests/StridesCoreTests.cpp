// Tests d'automatisation Unreal (Session Frontend > Automation, ou ligne de commande, voir unreal/docs/relais-mac.md) :
// rejouent dans le moteur les mêmes contrôles que unreal/core (tracé, jugement, sauvegarde, conversions d'axes).
#include "Misc/AutomationTest.h"
#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "StridesCore/CsoCourse.h"
#include "StridesCore/JumpModel.h"
#include "StridesCore/SaveGame.h"
#include "StridesUnits.h"
#include "StridesDataSubsystem.h"
#include "StridesShots.h"
#include "Engine/StaticMesh.h"
#include "UObject/Package.h"
#include "Engine/GameInstance.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesCoreCourseTest, "Strides.Core.Course", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesCoreCourseTest::RunTest(const FString&)
{
	const strides::CourseTrace T = strides::traceCourse(strides::poleDesign());
	TestEqual(TEXT("10 obstacles"), (int32)T.fences.size(), 10);
	TestTrue(TEXT("longueur 368,44 m (oracle du jeu web)"), FMath::IsNearlyEqual(T.length, 368.44003310371414, 1e-6));
	TestEqual(TEXT("temps accordé national"), strides::timeAllowedFor(FMath::RoundToDouble(T.length), 350), 64);
	strides::JumpHorse H{6.2, 1.35, 0.0, true};
	strides::Fence F;
	F.bars.push_back({0, 1.1});
	const strides::FenceGeo G = strides::railsAhead(F, 0, -2.0, 0, 1);
	const strides::JumpPlan P = strides::planJump(H, &G);
	TestTrue(TEXT("vertical 1,10 m appelé à 2 m au galop de concours : franchi"), P.hasMargin && P.margin > -strides::jumpDefaults().rub);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesUnitsTest, "Strides.Units", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesUnitsTest::RunTest(const FString&)
{
	const FVector V = StridesUnits::WebToUE(1.0, 2.0, 3.0);
	TestEqual(TEXT("x web → X UE (cm)"), V.X, 100.0);
	TestEqual(TEXT("z web → Y UE (cm)"), V.Y, 300.0);
	TestEqual(TEXT("y web → Z UE (cm)"), V.Z, 200.0);
	// Cap h = 0 (vers +z web) → lacet 90° (vers +Y UE) ; aller-retour.
	TestTrue(TEXT("cap 0 → lacet 90°"), FMath::IsNearlyEqual(StridesUnits::HeadingToYawDeg(0), 90.0));
	TestTrue(TEXT("aller-retour du cap"), FMath::IsNearlyEqual(StridesUnits::YawDegToHeading(StridesUnits::HeadingToYawDeg(1.234)), 1.234, 1e-9));
	const FVector Dir = FRotator(0, StridesUnits::HeadingToYawDeg(0.7), 0).Vector();
	TestTrue(TEXT("direction du cap conservée"), FMath::IsNearlyEqual(Dir.X, FMath::Sin(0.7), 1e-6) && FMath::IsNearlyEqual(Dir.Y, FMath::Cos(0.7), 1e-6));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesSaveTest, "Strides.Core.Save", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesSaveTest::RunTest(const FString&)
{
	strides::SaveGame S;
	S.pose = {"ride", 1.5, 0, -2.5, 0.3, true};
	strides::SaveGame R;
	std::string Err;
	TestTrue(TEXT("relecture"), strides::SaveGame::fromJson(S.toJson(), R, Err));
	TestTrue(TEXT("position relue"), R.pose.valid && R.pose.mode == "ride" && FMath::IsNearlyEqual(R.pose.z, -2.5));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesWorldArchitectureTest, "Strides.World.Architecture", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesWorldArchitectureTest::RunTest(const FString&)
{
	FString Text;
	TestTrue(TEXT("world_architecture.json présent"), FFileHelper::LoadFileToString(Text, *(FPaths::ProjectContentDir() / TEXT("Data/world_architecture.json"))));
	TSharedPtr<FJsonObject> Root;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
	TestTrue(TEXT("architecture lisible"), FJsonSerializer::Deserialize(Reader, Root) && Root.IsValid());
	if (!Root.IsValid()) return false;
	TestEqual(TEXT("carte 1,2 km"), Root->GetObjectField(TEXT("world"))->GetNumberField(TEXT("size")), 1200.0);
	TestEqual(TEXT("8 régions structurantes"), Root->GetArrayField(TEXT("regions")).Num(), 8);
	TestEqual(TEXT("14 lieux nommés"), Root->GetArrayField(TEXT("poi")).Num(), 14);
	TestEqual(TEXT("16 missions de carrière"), Root->GetArrayField(TEXT("missions")).Num(), 16);
	TestEqual(TEXT("5 rangs de progression"), Root->GetArrayField(TEXT("progression")).Num(), 5);
	TestEqual(TEXT("10 applications du téléphone"), Root->GetArrayField(TEXT("phoneApps")).Num(), 10);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesCareerGraphTest, "Strides.World.CareerGraph", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesCareerGraphTest::RunTest(const FString&)
{
	FString Text;
	TestTrue(TEXT("architecture présente"), FFileHelper::LoadFileToString(Text, *(FPaths::ProjectContentDir() / TEXT("Data/world_architecture.json"))));
	TSharedPtr<FJsonObject> Root;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) return false;
	TSet<FString> KnownPlaces;
	for (const TSharedPtr<FJsonValue>& Value : Root->GetArrayField(TEXT("poi"))) KnownPlaces.Add(Value->AsObject()->GetStringField(TEXT("id")));
	for (const TSharedPtr<FJsonValue>& Value : Root->GetArrayField(TEXT("regions"))) KnownPlaces.Add(Value->AsObject()->GetStringField(TEXT("id")));
	TSet<FString> SeenMissions;
	int32 TotalPay = 0, TotalXp = 0;
	for (const TSharedPtr<FJsonValue>& Value : Root->GetArrayField(TEXT("missions")))
	{
		const TSharedPtr<FJsonObject> Mission = Value->AsObject();
		const FString Id = Mission->GetStringField(TEXT("id"));
		const FString Place = Mission->GetStringField(TEXT("place"));
		TestTrue(*FString::Printf(TEXT("lieu de %s connu"), *Id), KnownPlaces.Contains(Place) || Place == TEXT("paris"));
		for (const TSharedPtr<FJsonValue>& Required : Mission->GetArrayField(TEXT("requires")))
			TestTrue(*FString::Printf(TEXT("prérequis de %s déjà défini"), *Id), SeenMissions.Contains(Required->AsString()));
		SeenMissions.Add(Id);
		TotalPay += Mission->GetIntegerField(TEXT("pay"));
		TotalXp += Mission->GetIntegerField(TEXT("xp"));
	}
	TestEqual(TEXT("chaîne complète de 16 missions"), SeenMissions.Num(), 16);
	TestEqual(TEXT("récompenses de carrière"), TotalPay, 7520);
	TestEqual(TEXT("réputation de carrière"), TotalXp, 5980);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesWorldSceneryTest, "Strides.World.Scenery", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesWorldSceneryTest::RunTest(const FString&)
{
	// Relief exporté du jeu web : mêmes hauteurs qu'analyticHeight (src/world/terrain.js) aux nœuds de la grille.
	UGameInstance* GI = NewObject<UGameInstance>(GetTransientPackage());
	UStridesDataSubsystem* Data = NewObject<UStridesDataSubsystem>(GI);
	Data->LoadScene();
	TestTrue(TEXT("relief chargé (601 x 601, pas de 2 m)"), Data->HasTerrain() && Data->TerrainN == 601 && Data->TerrainStep == 2.f);
	TestTrue(TEXT("Écurie du Val à 3 m"), FMath::IsNearlyEqual(Data->TerrainHeight(-110, 180), 3.0, 1e-3));
	TestTrue(TEXT("carrière du Pôle à 3 m"), FMath::IsNearlyEqual(Data->TerrainHeight(330, -224), 3.0, 1e-3));
	TestTrue(TEXT("fond marin au nord (-13,98 m)"), FMath::IsNearlyEqual(Data->TerrainHeight(0, -560), -13.9775, 1e-3));
	TestTrue(TEXT("Colline Strides (59,28 m)"), FMath::IsNearlyEqual(Data->TerrainHeight(120, 520), 59.2831, 1e-3));
	TestEqual(TEXT("14 routes du jeu web"), Data->SceneRoads.Num(), 14);
	TestTrue(TEXT("étang au-dessus de la mer"), Data->PondLevel > 10.f);
	// Manifeste des décors importés : chaque maillage référencé existe.
	FString Text;
	TestTrue(TEXT("world_assets.json présent"), FFileHelper::LoadFileToString(Text, *(FPaths::ProjectContentDir() / TEXT("Data/World/world_assets.json"))));
	TSharedPtr<FJsonObject> Root;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
	if (!TestTrue(TEXT("manifeste lisible"), FJsonSerializer::Deserialize(Reader, Root) && Root.IsValid())) return false;
	int32 Missing = 0, Total = 0;
	for (const TCHAR* Key : {TEXT("architecture"), TEXT("trees"), TEXT("hedges")})
		for (const TSharedPtr<FJsonValue>& V : Root->GetArrayField(Key))
		{
			Total++;
			if (!LoadObject<UStaticMesh>(nullptr, *V->AsObject()->GetStringField(TEXT("mesh")))) Missing++;
		}
	TestEqual(TEXT("maillages de décor introuvables"), Missing, 0);
	TestTrue(TEXT("au moins 200 maillages de décor"), Total >= 200);
	return true;
}

// Banc de parité CSO dans le moteur : tracé lu par le jeu (Content/Data/cso_course_pole.json, strides::parseCourseFile)
// comparé à l'oracle du JS (unreal/core/tests/oracles/cso_course.json), conversion du FOV vertical web en FOV horizontal
// Unreal utilisée par -StridesShots=cso, et forme de unreal/docs/parite/cso/poses.json.
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesPariteCsoTest, "Strides.Parite.Cso", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesPariteCsoTest::RunTest(const FString&)
{
	FString Root = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../.."));
	FPaths::CollapseRelativeDirectories(Root);
	FString Text;
	TestTrue(TEXT("cso_course_pole.json lu"), FFileHelper::LoadFileToString(Text, *(FPaths::ProjectContentDir() / TEXT("Data/cso_course_pole.json"))));
	strides::CourseDesign D;
	std::string Err;
	TestTrue(TEXT("tracé du fichier de données"), strides::parseCourseFile(std::string(TCHAR_TO_UTF8(*Text)), D, Err));
	const strides::CourseTrace T = strides::traceCourse(D);
	FString OText;
	TSharedPtr<FJsonObject> O;
	TestTrue(TEXT("oracle cso_course.json lu"), FFileHelper::LoadFileToString(OText, *(Root / TEXT("unreal/core/tests/oracles/cso_course.json"))) && FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(OText), O) && O.IsValid());
	if (O.IsValid() && T.marks.count("start") && T.marks.count("finish"))
	{
		TestTrue(TEXT("longueur = oracle"), FMath::IsNearlyEqual(T.length, O->GetNumberField(TEXT("length")), 1e-7));
		const TArray<TSharedPtr<FJsonValue>>& F = O->GetArrayField(TEXT("fences"));
		TestEqual(TEXT("nombre d'obstacles = oracle"), (int32)T.fences.size(), F.Num());
		for (int32 i = 0; i < F.Num() && i < (int32)T.fences.size(); i++)
		{
			const TSharedPtr<FJsonObject> E = F[i]->AsObject();
			TestTrue(FString::Printf(TEXT("obstacle %d = oracle"), i), FMath::IsNearlyEqual(T.fences[i].x, E->GetNumberField(TEXT("x")), 1e-7) && FMath::IsNearlyEqual(T.fences[i].z, E->GetNumberField(TEXT("z")), 1e-7) && FMath::IsNearlyEqual(T.fences[i].rot, E->GetNumberField(TEXT("rot")), 1e-9));
		}
		for (const char* M : {"start", "finish"})
		{
			const TSharedPtr<FJsonObject> E = O->GetObjectField(TEXT("marks"))->GetObjectField(UTF8_TO_TCHAR(M));
			const strides::TraceMark& K = T.marks.at(M);
			TestTrue(FString::Printf(TEXT("repère %s = oracle (x, z, cap, s)"), UTF8_TO_TCHAR(M)), FMath::IsNearlyEqual(K.x, E->GetNumberField(TEXT("x")), 1e-7) && FMath::IsNearlyEqual(K.z, E->GetNumberField(TEXT("z")), 1e-7) && FMath::IsNearlyEqual(K.rot, E->GetNumberField(TEXT("rot")), 1e-9) && FMath::IsNearlyEqual(K.s, E->GetNumberField(TEXT("s")), 1e-7));
		}
	}
	// FOV : 58° vertical en 844 × 390 → environ 100,36° horizontal ; la projection Unreal (axe X maintenu) redonne 58°.
	const double FovH = AStridesShots::HorizontalFov(58, 844, 390);
	const double FovVBack = FMath::RadiansToDegrees(2.0 * FMath::Atan(FMath::Tan(FMath::DegreesToRadians(FovH) * 0.5) * 390.0 / 844.0));
	TestTrue(FString::Printf(TEXT("FOV horizontal %.4f° (≈ 100,36°)"), FovH), FMath::Abs(FovH - 100.36) < 0.01);
	TestTrue(TEXT("FOV vertical retrouvé"), FMath::IsNearlyEqual(FovVBack, 58.0, 1e-9));
	TestTrue(TEXT("format carré : FOV inchangé"), FMath::IsNearlyEqual(AStridesShots::HorizontalFov(70, 1, 1), 70.0, 1e-9));
	// Poses jumelles écrites par le banc web.
	FString PText;
	TSharedPtr<FJsonObject> P;
	if (FFileHelper::LoadFileToString(PText, *(Root / TEXT("unreal/docs/parite/cso/poses.json"))) && FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(PText), P) && P.IsValid())
	{
		TestEqual(TEXT("poses : schéma"), P->GetStringField(TEXT("schema")), FString(TEXT("strides.parite_poses/1")));
		for (const TSharedPtr<FJsonValue>& V : P->GetArrayField(TEXT("poses")))
		{
			const TSharedPtr<FJsonObject> E = V->AsObject();
			const TSharedPtr<FJsonObject> VP = E->GetObjectField(TEXT("viewport"));
			TestTrue(TEXT("pose : viewport 844 × 390"), VP->GetNumberField(TEXT("w")) == 844 && VP->GetNumberField(TEXT("h")) == 390);
			TestTrue(TEXT("pose : œil, cible, soleil"), E->GetArrayField(TEXT("eye")).Num() == 3 && E->GetArrayField(TEXT("target")).Num() == 3 && E->GetArrayField(TEXT("sunDir")).Num() == 3);
			TestTrue(TEXT("pose : FOV vertical"), E->GetNumberField(TEXT("fovV")) > 10 && E->GetNumberField(TEXT("fovV")) < 120);
		}
	}
	else AddError(TEXT("unreal/docs/parite/cso/poses.json illisible"));
	return true;
}
