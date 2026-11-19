// Cheval de concours (tranche T2, unreal/docs/parite/cso-ecarts.md §4) dans le moteur :
//  - Strides.Parite.CsoHorse : miroir de unreal/core/tests/test_core.cpp (testHorseRuns) — le cœur compilé par UBT
//    rejoue le canal « ch » de unreal/core/tests/oracles/cso_runs.json (scénarios exportés du jeu web) ;
//  - Strides.Cso.HorseInGame : AStridesHorse et AStridesCourse réels (monde de jeu créé pour le test, parcours du Pôle lu
//    dans Content/Data) : un appui à 10 m de l'obstacle ne déclenche pas de saut, un appui dans la bonne zone si, un
//    cheval qui arrive sur l'obstacle sans appel refuse (plus de saut automatique).
#include "Misc/AutomationTest.h"
#include "Dom/JsonObject.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "StridesCore/CsoCourse.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCourse.h"
#include "StridesHorse.h"

namespace
{
FString RepoRoot()
{
	FString Root = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../.."));
	FPaths::CollapseRelativeDirectories(Root);
	return Root;
}

TSharedPtr<FJsonObject> LoadJsonFile(const FString& Path)
{
	FString Text;
	TSharedPtr<FJsonObject> O;
	if (FFileHelper::LoadFileToString(Text, *Path)) FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), O);
	return O;
}

double NumOr(const TSharedPtr<FJsonObject>& O, const TCHAR* K, double Def)
{
	double V = Def;
	return O->TryGetNumberField(K, V) ? V : Def;
}

std::vector<strides::CsoObstacle> ObstaclesFrom(const TArray<TSharedPtr<FJsonValue>>& A)
{
	std::vector<strides::CsoObstacle> V;
	for (const TSharedPtr<FJsonValue>& E : A)
	{
		const TSharedPtr<FJsonObject> O = E->AsObject();
		FString Course;
		O->TryGetStringField(TEXT("course"), Course);
		strides::CsoObstacle B = strides::makeCsoObstacle(TCHAR_TO_UTF8(*O->GetStringField(TEXT("kind"))), O->GetNumberField(TEXT("x")), O->GetNumberField(TEXT("z")),
			O->GetNumberField(TEXT("rot")), O->GetNumberField(TEXT("h")), O->GetNumberField(TEXT("w")), O->GetNumberField(TEXT("spread")),
			TCHAR_TO_UTF8(*O->GetStringField(TEXT("label"))), (int)NumOr(O, TEXT("num"), 0), TCHAR_TO_UTF8(*Course), O->GetBoolField(TEXT("solid")));
		B.off = O->GetBoolField(TEXT("off"));
		V.push_back(B);
	}
	return V;
}

void LoadState(strides::CsoHorseState& S, const TSharedPtr<FJsonObject>& J)
{
	S.x = J->GetNumberField(TEXT("x")); S.z = J->GetNumberField(TEXT("z")); S.heading = J->GetNumberField(TEXT("h")); S.speed = J->GetNumberField(TEXT("v"));
	S.yawRate = NumOr(J, TEXT("yr"), 0); S.lastTurn = J->GetNumberField(TEXT("lt"));
	S.jumpT = J->GetNumberField(TEXT("jT")); S.jumpY = J->GetNumberField(TEXT("jY"));
	S.jumpPeak = NumOr(J, TEXT("jP"), 0); S.jumpLen = NumOr(J, TEXT("jL"), 0); S.jumpDur = NumOr(J, TEXT("jD"), 0);
	S.jt0 = NumOr(J, TEXT("j0"), -1); S.jt1 = NumOr(J, TEXT("j1"), -1);
	S.rearT = NumOr(J, TEXT("rT"), 0); S.rearAnim = J->GetNumberField(TEXT("ra")); S.brake = J->GetNumberField(TEXT("bk"));
	S.refusing = (int)NumOr(J, TEXT("rf"), -1);
	const int Lj = (int)NumOr(J, TEXT("lj"), -1);
	if (Lj < 0) { S.hasLastJump = false; S.lastJumpObstacle = -1; }
	else if (!S.hasLastJump || S.lastJumpObstacle != Lj) { S.hasLastJump = true; S.lastJumpObstacle = Lj; }
	double Cad = 0;
	S.hasCadence = J->TryGetNumberField(TEXT("cad"), Cad);
	S.cadence = Cad;
	S.kbdSteer = NumOr(J, TEXT("ks"), 0);
	S.cadAdjust = J->GetBoolField(TEXT("ca"));
}
}  // namespace

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesPariteCsoHorseTest, "Strides.Parite.CsoHorse", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesPariteCsoHorseTest::RunTest(const FString&)
{
	const TSharedPtr<FJsonObject> O = LoadJsonFile(RepoRoot() / TEXT("unreal/core/tests/oracles/cso_runs.json"));
	if (!TestTrue(TEXT("cso_runs.json lu"), O.IsValid())) return false;
	const TSet<FString> Required = {TEXT("droit"), TEXT("bonne-zone"), TEXT("virage-serre"), TEXT("rampe-clavier"), TEXT("ctrl-alt"), TEXT("appui-10m"), TEXT("appui-3ms"), TEXT("abord-70")};
	TSet<FString> Clean;
	int32 Frames = 0;
	for (const TSharedPtr<FJsonValue>& RV : O->GetArrayField(TEXT("runs")))
	{
		const TSharedPtr<FJsonObject> R = RV->AsObject();
		const FString Id = R->GetStringField(TEXT("id"));
		const TSharedPtr<FJsonObject> Ch0 = R->GetObjectField(TEXT("setup"))->GetObjectField(TEXT("ch0"));
		std::vector<strides::CsoObstacle> Obs = ObstaclesFrom(Ch0->GetArrayField(TEXT("obs")));
		strides::CsoHorseState S;
		LoadState(S, Ch0->GetObjectField(TEXT("s")));
		int32 Bad = 0, Resync = 0, EvBad = 0;
		double MaxDev = 0;
		for (const TSharedPtr<FJsonValue>& FV : R->GetArrayField(TEXT("frames")))
		{
			const TSharedPtr<FJsonObject> F = FV->AsObject();
			const TSharedPtr<FJsonObject> Ch = F->GetObjectField(TEXT("ch"));
			const TSharedPtr<FJsonObject> In = Ch->GetObjectField(TEXT("in"));
			const TSharedPtr<FJsonObject>* A = nullptr;
			if (Ch->TryGetObjectField(TEXT("a"), A)) { LoadState(S, *A); Resync++; }
			strides::CsoFrameInput Fi;
			Fi.dt = NumOr(In, TEXT("hdt"), In->GetNumberField(TEXT("dt")));
			Fi.moveX = In->GetNumberField(TEXT("mx")); Fi.moveY = In->GetNumberField(TEXT("my"));
			Fi.keyMove = In->GetBoolField(TEXT("key")); Fi.jumpPressed = In->GetBoolField(TEXT("jp"));
			Fi.csoControls = In->GetBoolField(TEXT("cso")); Fi.locked = In->GetBoolField(TEXT("lk"));
			Fi.frozen = In->GetBoolField(TEXT("fz")); Fi.playerHorse = In->GetBoolField(TEXT("pl"));
			Fi.power = In->GetNumberField(TEXT("pow")); Fi.clearance = In->GetNumberField(TEXT("clr"));
			Fi.time = In->GetNumberField(TEXT("t")); Fi.slope = In->GetNumberField(TEXT("sl"));
			Fi.waterDepth = NumOr(In, TEXT("wd"), 0); Fi.waterAhead = NumOr(In, TEXT("wa"), 0);
			std::vector<strides::CsoHorseEvent> Ev;
			strides::csoHorseStep(S, Fi, Obs, Ev);
			FString Got, Want;
			for (const strides::CsoHorseEvent E : Ev) Got += FString(UTF8_TO_TCHAR(strides::csoHorseEventName(E))) + TEXT(" ");
			for (const TSharedPtr<FJsonValue>& EV : F->GetArrayField(TEXT("ev")))
			{
				const FString E = EV->AsObject()->GetStringField(TEXT("e"));
				if (E == TEXT("horse:jump") || E == TEXT("horse:jumpEarly") || E == TEXT("horse:tooSlow") || E == TEXT("horse:refuse") || E == TEXT("horse:land")) Want += E + TEXT(" ");
			}
			EvBad += Got != Want;
			const TSharedPtr<FJsonObject>* B = nullptr;
			const bool bExternal = Ch->TryGetObjectField(TEXT("b"), B) || Ch->HasField(TEXT("col"));
			const TSharedPtr<FJsonObject> E = B ? *B : Ch->GetObjectField(TEXT("s"));
			if (!Ch->HasField(TEXT("col")))
			{
				double Cad = 0;
				const bool bCad = E->TryGetNumberField(TEXT("cad"), Cad);
				const double D = FMath::Max3(FMath::Abs(S.x - E->GetNumberField(TEXT("x"))), FMath::Abs(S.z - E->GetNumberField(TEXT("z"))),
					FMath::Abs(strides::wrapAngle(S.heading - E->GetNumberField(TEXT("h")))));
				const double D2 = FMath::Max3(FMath::Abs(S.speed - E->GetNumberField(TEXT("v"))), FMath::Abs(S.jumpT - E->GetNumberField(TEXT("jT"))),
					FMath::Abs(S.jumpY - E->GetNumberField(TEXT("jY"))));
				const double D3 = bCad == S.hasCadence ? (bCad ? FMath::Abs(S.cadence - Cad) : 0.0) : 1.0;
				MaxDev = FMath::Max(MaxDev, FMath::Max3(D, D2, D3));
				Bad += !(FMath::Max3(D, D2, D3) <= 1e-6);
			}
			if (bExternal) { LoadState(S, Ch->GetObjectField(TEXT("s"))); Resync++; }
			const TArray<TSharedPtr<FJsonValue>>* NewObs = nullptr;
			if (Ch->TryGetArrayField(TEXT("obs"), NewObs)) Obs = ObstaclesFrom(*NewObs);
			Frames++;
		}
		TestTrue(FString::Printf(TEXT("%s (%s) : rejeu du cœur (écart max %.2g, %d images en écart, %d suites d'événements, %d recalages)"),
			*Id, *R->GetStringField(TEXT("lang")), MaxDev, Bad, EvBad, Resync), Bad == 0 && EvBad == 0);
		if (Bad == 0 && EvBad == 0 && Resync == 0) Clean.Add(Id);
	}
	for (const FString& Id : Required) TestTrue(FString::Printf(TEXT("scénario %s rejoué sans recalage"), *Id), Clean.Contains(Id));
	AddInfo(FString::Printf(TEXT("cheval de concours : %d images rejouées, %d scénarios requis sans écart"), Frames, Clean.Intersect(Required).Num()));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesCsoHorseInGameTest, "Strides.Cso.HorseInGame", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesCsoHorseInGameTest::RunTest(const FString&)
{
	// Parcours du Pôle tel que le jeu le lit (Content/Data), décalé sur la carrière (StridesWorldDirector).
	FString Text;
	const FString DataDir = FPaths::ProjectContentDir() / TEXT("Data");
	if (!TestTrue(TEXT("cso_course_pole.json lu"), FFileHelper::LoadFileToString(Text, *(DataDir / TEXT("cso_course_pole.json"))))) return false;
	strides::CourseDesign Design;
	std::string Err;
	if (!TestTrue(TEXT("tracé lu"), strides::parseCourseFile(std::string(TCHAR_TO_UTF8(*Text)), Design, Err))) return false;
	const TSharedPtr<FJsonObject> PoleJ = LoadJsonFile(DataDir / TEXT("cso_course_pole.json"));
	const TSharedPtr<FJsonObject> HorseJ = LoadJsonFile(DataDir / TEXT("cso_horse.json"));
	if (!TestTrue(TEXT("cso_horse.json lu"), PoleJ.IsValid() && HorseJ.IsValid())) return false;
	const TSharedPtr<FJsonObject> Arena = PoleJ->GetObjectField(TEXT("arena"));
	Design.x += Arena->GetNumberField(TEXT("x"));
	Design.z += Arena->GetNumberField(TEXT("z"));

	UWorld* World = UWorld::CreateWorld(EWorldType::Game, false, TEXT("StridesCsoHorseTest"));
	if (!TestNotNull(TEXT("monde de test"), World)) return false;
	AStridesCourse* Course = World->SpawnActor<AStridesCourse>();
	Course->BuildWith(Design, 350.0 / 60.0, HorseJ->GetNumberField(TEXT("csoFenceWidth")));
	const std::vector<strides::CsoObstacle>& Obs = Course->Obstacles();
	TestEqual(TEXT("obstacles du parcours"), (int32)Obs.size(), 10);
	int32 Three = -1;
	for (int32 i = 0; i < (int32)Obs.size(); i++) if (Obs[i].label == "3") Three = i;
	if (!TestTrue(TEXT("obstacle 3 trouvé"), Three >= 0)) { World->DestroyWorld(false); World->RemoveFromRoot(); return false; }
	const strides::CsoObstacle& F3 = Obs[Three];
	TestTrue(TEXT("largeur des obstacles = cso_horse.json"), F3.w == HorseJ->GetNumberField(TEXT("csoFenceWidth")));
	AStridesHorse* Horse = World->SpawnActor<AStridesHorse>();
	Horse->Course = Course;
	const double Dt = 1.0 / 30;
	const double Head = FMath::Atan2(F3.n.x, F3.n.z);
	// Distance de la première barre aux épaules (visée du cœur, comme le jeu web).
	auto FirstBar = [&]() { const strides::CsoTarget T = strides::csoTarget(Obs, Horse->CsoState(), 1.35, 0, true); return T.index == Three ? T.geo.rails.front().x : 1e9; };
	auto Has = [&](const TCHAR* E) { return Horse->LastEvents().Contains(E); };

	// 1) Galop de concours (6,2 m/s), 18 m avant le 3 dans son axe ; SAUT à 10 m : aucun saut, « trop tôt ».
	Horse->PlaceAt(F3.x - F3.n.x * 18, F3.z - F3.n.z * 18, Head, 6.2);
	int32 Guard = 0;
	while (FirstBar() > 10 && Guard++ < 200) Horse->Tick(Dt);
	const double At = FirstBar();
	Horse->RequestJump();
	Horse->Tick(Dt);
	TestTrue(FString::Printf(TEXT("appui à %.2f m : pas de saut"), At), !Horse->IsJumping() && At <= 10 && At > 9);
	TestTrue(TEXT("appui à 10 m : événement horse:jumpEarly"), Has(TEXT("horse:jumpEarly")));
	// 2) Même abord : SAUT dans la bonne zone (règle du pilote des tests web) → saut, puis réception.
	bool bJumped = false, bLanded = false;
	for (Guard = 0; Guard < 200 && !bLanded; Guard++)
	{
		const strides::CsoTarget T = strides::csoTarget(Obs, Horse->CsoState(), 1.35, 0, true);
		if (!bJumped && !Horse->IsJumping() && T.index == Three && T.plan.zone == strides::Zone::Good && T.plan.ideal <= T.plan.L + 0.3) Horse->RequestJump();
		Horse->Tick(Dt);
		bJumped |= Has(TEXT("horse:jump"));
		bLanded |= Has(TEXT("horse:land"));
	}
	TestTrue(TEXT("appui dans la bonne zone : saut puis réception"), bJumped && bLanded);
	// 3) Sans appel jusqu'à l'obstacle : refus (freinage, arrêt devant la barre, cabré), jamais de saut automatique.
	Horse->PlaceAt(F3.x - F3.n.x * 14, F3.z - F3.n.z * 14, Head, 6.2);
	bool bAnyJump = false, bRefused = false;
	double Closest = 1e9;
	for (Guard = 0; Guard < 150; Guard++)
	{
		Horse->Tick(Dt);
		bAnyJump |= Horse->IsJumping() || Has(TEXT("horse:jump"));
		bRefused |= Has(TEXT("horse:refuse"));
		const strides::CsoHorseState& S = Horse->CsoState();
		Closest = FMath::Min(Closest, (F3.x - S.x) * F3.n.x + (F3.z - S.z) * F3.n.z);
	}
	TestTrue(TEXT("sans appel : aucun saut automatique"), !bAnyJump);
	TestTrue(FString::Printf(TEXT("sans appel : refus, arrêt à %.2f m de l'axe de l'obstacle (origine du cheval)"), Closest), bRefused && Closest > 0);
	World->DestroyWorld(false);
	World->RemoveFromRoot();
	return true;
}
