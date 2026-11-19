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
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "Components/StaticMeshComponent.h"
#include "StridesCsoScenery.h"
#include "StridesCourse.h"
#include "StridesFence.h"
#include "StridesHorse.h"
#include "StridesRider.h"

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

// Tranche T5 (unreal/docs/parite/cso-ecarts.md §4) : obstacles, lignes et poteau construits par le jeu web. Le test relit
// le manifeste exporté (Content/World/Cso/cso_fences.json, scripts/unreal/export-cso-runs.mjs --fences) et vérifie le
// parcours tel que le construit le jeu (AStridesCourse::Build, puis déroulé jusqu'à la cloche) :
//  - hauteurs hors épreuve = csoHeights(base hors épreuve) du manifeste, calculées par le cœur (strides::courseHeights)
//    et égales aux hauteurs relevées dans le jeu web ; en épreuve (après l'entrée en piste) = profil de CourseHeight,
//    égal à la base et aux hauteurs « epreuve » du manifeste ;
//  - pour chaque obstacle et chaque état : nombre de pièces par catégorie (chandeliers, ailes, barres, barres basses,
//    taquets, remplissage, jardinières, fanions, panneau) égal au relevé, chaque composante portant le maillage du
//    relevé, son pivot monde (posé par l'acteur depuis le tracé du cœur et le relief) au pivot monde relevé dans le jeu
//    web, sa boîte englobante centrée sur ce pivot, le barycentre des sommets de son maillage (qui fixe l'orientation)
//    au barycentre monde relevé ; barres du haut à la position de repos du cœur ;
//  - lignes de départ et d'arrivée (placées par les lignes du déroulé) et poteau « Chrono » : mêmes contrôles ;
//  - numéro attendu : panneau du 1 teinté de la couleur relevée (#7dffc4) après l'entrée en piste, les autres blancs.
namespace StridesSceneryTest
{
struct FWorld
{
	UGameInstance* GI = nullptr;
	UWorld* World = nullptr;
	FWorld()
	{
		GI = NewObject<UGameInstance>(GEngine);
		GI->AddToRoot();
		GI->InitializeStandalone(TEXT("StridesCsoSceneryTest"));
		World = GI->GetWorld();
	}
	~FWorld()
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

// Écarts d'un ensemble de composantes (étiquette de catégorie en dernier) au relevé : nombres par catégorie, maillage,
// pivot monde (cm) et centre de la boîte englobante. Dz (m) : sol Unreal − sol du jeu web sous le groupe (le relief
// Unreal est la grille de 2 m des hauteurs analytiques, le web pose ses objets sur son maillage de relief de 6 m) ; les
// hauteurs sont comparées au-dessus du sol de chaque jeu, l'écart de sol est relevé à part.
struct FCheck
{
	int32 Pieces = 0, CountErrors = 0, MeshErrors = 0;
	double MaxPivot = 0, MaxBounds = 0, MaxCentroid = 0, MaxGround = 0;
	TArray<FString> Notes;
	void Compare(const FString& Where, const TArray<const UStaticMeshComponent*>& Comps, const TArray<FStridesCsoPiece>& Want, const TMap<FString, int32>& Counts, const FStridesCsoScenery& S, double Dz = 0)
	{
		MaxGround = FMath::Max(MaxGround, FMath::Abs(Dz));
		TMap<FString, int32> Got;
		for (const UStaticMeshComponent* C : Comps) Got.FindOrAdd(C->ComponentTags.Last().ToString())++;
		for (const auto& KV : Counts)
			if (Got.FindRef(KV.Key) != KV.Value) { CountErrors++; Notes.Add(FString::Printf(TEXT("%s : %s %d au lieu de %d"), *Where, *KV.Key, Got.FindRef(KV.Key), KV.Value)); }
		if (Got.Num() != Counts.Num()) { CountErrors++; Notes.Add(FString::Printf(TEXT("%s : %d catégories au lieu de %d"), *Where, Got.Num(), Counts.Num())); }
		if (Comps.Num() != Want.Num()) { CountErrors++; Notes.Add(FString::Printf(TEXT("%s : %d pièces au lieu de %d"), *Where, Comps.Num(), Want.Num())); return; }
		for (int32 I = 0; I < Want.Num(); I++)
		{
			const UStaticMeshComponent* C = Comps[I];
			const FStridesCsoPiece& P = Want[I];
			Pieces++;
			const FString* Path = S.MeshPaths.Find(P.Mesh);
			if (C->ComponentTags.Last().ToString() != P.Cat || !Path || !C->GetStaticMesh() || C->GetStaticMesh()->GetPathName() != *Path)
			{
				MeshErrors++;
				Notes.Add(FString::Printf(TEXT("%s : pièce %d (%s) maillage %s"), *Where, I, *P.Cat, C->GetStaticMesh() ? *C->GetStaticMesh()->GetName() : TEXT("aucun")));
				continue;
			}
			const FVector WantUE = StridesUnits::WebToUE(P.W.X, P.W.Y + Dz, P.W.Z);
			MaxPivot = FMath::Max(MaxPivot, (C->GetComponentLocation() - WantUE).Size());
			MaxBounds = FMath::Max(MaxBounds, (C->Bounds.Origin - WantUE).Size());
			// Orientation : barycentre du maillage (repère web du maillage → X = x, Y = z, Z = y, import Interchange) placé
			// par la transformée de la composante, comparé au barycentre monde relevé dans le jeu web.
			const FVector Cm = S.MeshCentroids.FindRef(P.Mesh);
			const FVector GotC = C->GetComponentTransform().TransformPosition(FVector(Cm.X, Cm.Z, Cm.Y) * StridesUnits::CmPerM);
			MaxCentroid = FMath::Max(MaxCentroid, (GotC - StridesUnits::WebToUE(P.WC.X, P.WC.Y + Dz, P.WC.Z)).Size());
		}
	}
};

TArray<const UStaticMeshComponent*> Tagged(const TArray<TObjectPtr<UStaticMeshComponent>>& All, const TCHAR* Group)
{
	TArray<const UStaticMeshComponent*> Out;
	for (const UStaticMeshComponent* C : All)
		if (C && (!Group || C->ComponentTags.Contains(FName(Group)))) Out.Add(C);
	return Out;
}
}  // namespace StridesSceneryTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesPariteCsoSceneryTest, "Strides.Parite.CsoScenery", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesPariteCsoSceneryTest::RunTest(const FString&)
{
	using namespace StridesSceneryTest;
	// Manifeste relu tel qu'exporté (états et hauteurs), indépendamment du chargeur du jeu.
	FString Text;
	const FString File = FPaths::ProjectContentDir() / TEXT("World/Cso/cso_fences.json");
	if (!TestTrue(TEXT("cso_fences.json présent"), FFileHelper::LoadFileToString(Text, *File))) return false;
	TSharedPtr<FJsonObject> Root;
	if (!TestTrue(TEXT("manifeste lisible"), FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Root) && Root.IsValid())) return false;
	TMap<FString, TArray<double>> Heights;
	TMap<FString, double> Bases;
	for (const TSharedPtr<FJsonValue>& V : Root->GetArrayField(TEXT("states")))
	{
		const TSharedPtr<FJsonObject> O = V->AsObject();
		TArray<double>& H = Heights.Add(O->GetStringField(TEXT("id")));
		for (const TSharedPtr<FJsonValue>& X : O->GetArrayField(TEXT("heights"))) H.Add(X->AsNumber());
		Bases.Add(O->GetStringField(TEXT("id")), O->GetNumberField(TEXT("base")));
	}
	if (!TestTrue(TEXT("états hors-epreuve et epreuve exportés"), Heights.Contains(TEXT("hors-epreuve")) && Heights.Contains(TEXT("epreuve")))) return false;
	TestTrue(TEXT("bases relevées dans le jeu web : 1,15 hors épreuve, 1,10 en épreuve"), Bases[TEXT("hors-epreuve")] == 1.15 && Bases[TEXT("epreuve")] == 1.1);

	FWorld W;
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	if (!TestNotNull(TEXT("sous-système de données"), Data)) return false;
	const FStridesCsoScenery& S = Data->CsoScenery();
	if (!TestTrue(TEXT("géométrie du parcours chargée (cso_fences.json, cso_assets.json)"), S.IsLoaded())) return false;
	AStridesCourse* Course = W.World->SpawnActor<AStridesCourse>();
	strides::CourseDesign D = Data->PoleCourse();
	D.x += Data->PoleArena.X;
	D.z += Data->PoleArena.Y;
	Course->Build(D, *Data);
	const int32 N = Course->Obstacles().size();
	if (!TestEqual(TEXT("obstacles du parcours = obstacles du manifeste"), N, S.Fences.Num())) return false;

	// Un état : hauteurs du jeu, pièces de chaque obstacle comparées au relevé de cet état.
	auto CheckState = [&](const FString& State, FCheck& K)
	{
		const std::vector<double> Got = Course->FenceHeights();
		const TArray<double>& Want = Heights[State];
		int32 Bad = 0;
		for (int32 I = 0; I < N; I++) Bad += I >= Want.Num() || Got[I] != Want[I];
		TestEqual(FString::Printf(TEXT("%s : hauteurs du jeu = hauteurs relevées dans le jeu web"), *State), Bad, 0);
		for (int32 I = 0; I < N; I++)
		{
			const AStridesFence* F = Course->FenceAt(I);
			const FStridesCsoFenceData* FD = S.Fence(F->Num);
			const FStridesCsoLook* L = FD ? FD->LookAt(Got[I]) : nullptr;
			if (!FD || !L || L->State != State || FD->Label != F->Label || !F->UsesExportedGeometry())
			{
				K.CountErrors++;
				K.Notes.Add(FString::Printf(TEXT("%s : obstacle %s sans pièces exportées"), *State, *F->Label));
				continue;
			}
			K.Compare(FString::Printf(TEXT("%s %s"), *State, *F->Label), Tagged(F->PieceComponents(), nullptr), L->Pieces, L->Counts, S, Data->TerrainHeight(FD->X, FD->Z) - FD->Ground);
			// Barres du haut : pivot du relevé = position de repos du cœur (obstacles.js _bars).
			const strides::CsoFenceState& St = Course->FenceStates()[I];
			for (const FStridesCsoPiece& P : L->Pieces)
				if (P.Rail >= 0 && (P.Rail >= (int32)St.rails.size() || FMath::Abs(St.rails[P.Rail].restY - P.P.Y) > 1e-6 || FMath::Abs(St.rails[P.Rail].restZ - P.P.Z) > 1e-6))
				{
					K.CountErrors++;
					K.Notes.Add(FString::Printf(TEXT("%s %s : barre %d hors de la position de repos du cœur"), *State, *F->Label, P.Rail));
				}
		}
	};
	auto Report = [&](const FString& What, const FCheck& K)
	{
		for (int32 I = 0; I < FMath::Min(K.Notes.Num(), 12); I++) AddError(K.Notes[I]);
		TestTrue(FString::Printf(TEXT("%s : %d pièces, nombres par catégorie identiques au relevé"), *What, K.Pieces), K.CountErrors == 0 && K.Pieces > 0);
		TestEqual(FString::Printf(TEXT("%s : maillages du relevé"), *What), K.MeshErrors, 0);
		TestTrue(FString::Printf(TEXT("%s : pivots au relevé (écart max %.4f cm)"), *What, K.MaxPivot), K.MaxPivot < 0.1);
		TestTrue(FString::Printf(TEXT("%s : boîtes englobantes centrées sur les pivots relevés (écart max %.4f cm)"), *What, K.MaxBounds), K.MaxBounds < 0.1);
		TestTrue(FString::Printf(TEXT("%s : orientation, barycentres des maillages au relevé (écart max %.4f cm)"), *What, K.MaxCentroid), K.MaxCentroid < 0.1);
		AddInfo(FString::Printf(TEXT("%s : %d pièces, pivots à %.4f cm, boîtes à %.4f cm, barycentres à %.4f cm du relevé (hauteurs au-dessus du sol de chaque jeu ; écart de sol max %.2f cm)"), *What, K.Pieces, K.MaxPivot, K.MaxBounds, K.MaxCentroid, K.MaxGround * 100));
	};

	// 1) Hors épreuve : csoHeights(1,15) (obstacles.js _build), calculées par le cœur.
	{
		const std::vector<double> Core = Course->HeightsFor(Bases[TEXT("hors-epreuve")]);
		int32 Bad = 0;
		for (int32 I = 0; I < N; I++) Bad += Core[I] != Heights[TEXT("hors-epreuve")][I];
		TestEqual(TEXT("hors épreuve : strides::courseHeights(1,15) = hauteurs du jeu web"), Bad, 0);
		FCheck K;
		CheckState(TEXT("hors-epreuve"), K);
		Report(TEXT("obstacles hors épreuve"), K);
		int32 Lit = 0;
		for (int32 I = 0; I < N; I++) Lit += !Course->FenceAt(I)->SignTint().Equals(S.HighlightOff, 1e-6);
		TestEqual(TEXT("hors épreuve : aucun numéro surligné"), Lit, 0);
	}
	// 2) Lignes de départ et d'arrivée, poteau « Chrono ».
	{
		FCheck K;
		for (const FStridesCsoGroup& L : S.Lines) K.Compare(FString::Printf(TEXT("ligne %s"), *L.Id), Tagged(Course->PropComponents(), *L.Id), L.Pieces, L.Counts, S, Data->TerrainHeight(L.X, L.Z) - L.Ground);
		K.Compare(TEXT("poteau"), Tagged(Course->PropComponents(), *S.Marker.Id), S.Marker.Pieces, S.Marker.Counts, S, Data->TerrainHeight(S.Marker.X, S.Marker.Z) - S.Marker.Ground);
		Report(TEXT("lignes et poteau"), K);
	}
	// 3) Épreuve : cheval posé à l'entrée de la carrière, cavalier en selle, déroulé jusqu'à la cloche (entrée en piste :
	//    hauteurs posées, barres remises, 1 surligné).
	{
		if (!TestTrue(TEXT("épreuve lancée"), Course->StartRun(TEXT("Alex"), TEXT("Comète")))) return false;
		const strides::CsoRunConfig& Cfg = Course->Run()->config();
		AStridesHorse* Horse = W.World->SpawnActor<AStridesHorse>();
		Horse->Course = Course;
		Horse->PlaceAt(Cfg.gateX, Cfg.gateZ, Cfg.start.rot, 0);
		AStridesRider* Rider = W.World->SpawnActor<AStridesRider>(Horse->GetActorLocation() + FVector(0, 0, 90), FRotator::ZeroRotator);
		if (!TestTrue(TEXT("cavalier en selle"), Rider && Rider->TryMount(nullptr))) return false;
		for (int32 K = 0; K < 90 && Course->Run()->step() != strides::CsoStep::Course; K++) Horse->Tick(1.0 / 30);
		TestTrue(TEXT("parcours atteint (cloche)"), Course->Run()->step() == strides::CsoStep::Course);
		TestTrue(TEXT("épreuve : CourseHeight = base relevée en épreuve"), FMath::IsNearlyEqual((double)Course->CourseHeight, Bases[TEXT("epreuve")], 1e-6));
		FCheck K;
		CheckState(TEXT("epreuve"), K);
		Report(TEXT("obstacles en épreuve"), K);
		int32 Wrong = 0;
		for (int32 I = 0; I < N; I++)
		{
			const AStridesFence* F = Course->FenceAt(I);
			Wrong += !F->SignTint().Equals(F->Num == 1 ? S.HighlightOn : S.HighlightOff, 1e-6);
		}
		TestTrue(TEXT("épreuve : n° 1 surligné (couleur relevée), les autres blancs"), Course->Highlight() == 1 && Wrong == 0);
	}
	return true;
}
