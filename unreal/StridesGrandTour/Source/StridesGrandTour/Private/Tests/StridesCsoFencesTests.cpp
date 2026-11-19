// Obstacles de concours (tranche T3, unreal/docs/parite/cso-ecarts.md §4) dans le moteur :
//  - Strides.Parite.CsoFences : miroir de unreal/core/tests/test_core.cpp (testFenceRuns) — le cœur compilé par UBT
//    rejoue en chaîne (cheval, contacts des membres fournis, Obstacles.updateHorse, Obstacles.update) les scénarios de
//    cso_runs.json et compare chaque image : état du cheval, événements d'obstacle (marge, cause), barres ;
//  - Strides.Cso.FencesInGame : AStridesFence (transformée d'une barre calculée par le cœur → composante, vérifiée par
//    la géométrie), puis AStridesHorse / AStridesCourse réels dans un monde de test : abord à 70° du 4A (refus, jamais
//    franchi), sans-faute au 3 (obstacle:clear à la sortie), refus tout contre au 3 (barre emportée, affichée à la
//    transformée du cœur).
#include "Misc/AutomationTest.h"
#include "Components/StaticMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "StridesCore/CsoCourse.h"
#include "StridesCore/CsoFences.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesFence.h"
#include "StridesHorse.h"
#include "StridesPlayerController.h"

namespace StridesFenceTest
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

bool Moved(const strides::CsoRail& R) { return R.falling || R.rattle > 0 || R.y != R.restY || R.z != R.restZ || R.rx != R.restRx || R.rz != 0; }
}  // namespace StridesFenceTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesPariteCsoFencesTest, "Strides.Parite.CsoFences", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesPariteCsoFencesTest::RunTest(const FString&)
{
	using namespace StridesFenceTest;
	const TSharedPtr<FJsonObject> O = LoadJsonFile(RepoRoot() / TEXT("unreal/core/tests/oracles/cso_runs.json"));
	if (!TestTrue(TEXT("cso_runs.json lu"), O.IsValid())) return false;
	const TSet<FString> Required = {TEXT("t3-sans-faute"), TEXT("t3-oxer-loin"), TEXT("t3-pres-montee"), TEXT("t3-posterieurs"), TEXT("t3-effleurement"),
		TEXT("t3-faute-limite"), TEXT("t3-effleurement-haut"), TEXT("t3-refus-62"), TEXT("t3-tout-contre-remonte"), TEXT("t3-refus-lent"), TEXT("t3-refus-oblique"), TEXT("t3-refus-5s"), TEXT("t3-glissade"),
		TEXT("refus"), TEXT("abord-61")};
	TSet<FString> Clean;
	int32 Frames = 0, Events = 0, RailsCompared = 0;
	for (const TSharedPtr<FJsonValue>& RV : O->GetArrayField(TEXT("runs")))
	{
		const TSharedPtr<FJsonObject> R = RV->AsObject();
		const FString Id = R->GetStringField(TEXT("id"));
		if (!Required.Contains(Id)) continue;
		const TSharedPtr<FJsonObject> Ch0 = R->GetObjectField(TEXT("setup"))->GetObjectField(TEXT("ch0"));
		std::vector<strides::CsoObstacle> Obs = ObstaclesFrom(Ch0->GetArrayField(TEXT("obs")));
		std::vector<strides::CsoFenceState> St = strides::csoFenceStates(Obs);
		strides::CsoHorseState S;
		LoadState(S, Ch0->GetObjectField(TEXT("s")));
		int32 Bad = 0, EvBad = 0, RailBad = 0, Resync = 0, Cols = 0;
		for (const TSharedPtr<FJsonValue>& FV : R->GetArrayField(TEXT("frames")))
		{
			const TSharedPtr<FJsonObject> F = FV->AsObject();
			const TSharedPtr<FJsonObject> Ch = F->GetObjectField(TEXT("ch"));
			const TSharedPtr<FJsonObject> In = Ch->GetObjectField(TEXT("in"));
			// (aucun scénario requis n'a d'état changé avant player.update ; collisions du décor, non portées : recalage)
			const TSharedPtr<FJsonObject>* A = nullptr;
			if (Ch->TryGetObjectField(TEXT("a"), A)) { LoadState(S, *A); Resync++; }
			const double PrevX = S.x, PrevZ = S.z;
			strides::CsoFrameInput Fi;
			Fi.dt = NumOr(In, TEXT("hdt"), In->GetNumberField(TEXT("dt")));
			Fi.moveX = In->GetNumberField(TEXT("mx")); Fi.moveY = In->GetNumberField(TEXT("my"));
			Fi.keyMove = In->GetBoolField(TEXT("key")); Fi.jumpPressed = In->GetBoolField(TEXT("jp"));
			Fi.csoControls = In->GetBoolField(TEXT("cso")); Fi.locked = In->GetBoolField(TEXT("lk"));
			Fi.frozen = In->GetBoolField(TEXT("fz")); Fi.playerHorse = In->GetBoolField(TEXT("pl"));
			Fi.power = In->GetNumberField(TEXT("pow")); Fi.clearance = In->GetNumberField(TEXT("clr"));
			Fi.time = In->GetNumberField(TEXT("t")); Fi.slope = In->GetNumberField(TEXT("sl"));
			std::vector<strides::CsoHorseEvent> Ev;
			strides::csoHorseStep(S, Fi, Obs, Ev);
			bool bCol = false;
			if (Ch->TryGetBoolField(TEXT("col"), bCol) && bCol)
			{
				const TSharedPtr<FJsonObject>* B = nullptr;
				LoadState(S, Ch->TryGetObjectField(TEXT("b"), B) ? *B : Ch->GetObjectField(TEXT("s")));
				Cols++;
			}
			strides::CsoFenceOut Out;
			strides::CsoUpdateHorseInput U;
			U.prevX = PrevX; U.prevZ = PrevZ; U.time = NumOr(In, TEXT("ut"), Fi.time);
			bool Lj = false;
			In->TryGetBoolField(TEXT("lj"), Lj);
			U.limbJudged = Lj;
			U.power = Fi.power; U.clearance = Fi.clearance; U.csoCourse = Fi.csoControls;
			strides::csoFencesUpdateHorse(S, Obs, St, U, Out);
			strides::CsoFencesUpdateInput Ui;
			Ui.dt = NumOr(In, TEXT("odt"), In->GetNumberField(TEXT("dt")));
			Ui.time = NumOr(In, TEXT("ot"), Fi.time);
			bool Ma = false;
			In->TryGetBoolField(TEXT("ma"), Ma);
			Ui.missionActive = Ma;
			Ui.focusX = S.x; Ui.focusZ = S.z;
			strides::csoFencesUpdate(Obs, St, Ui, Out);
			// État du cheval en fin d'image.
			const TSharedPtr<FJsonObject> E = Ch->GetObjectField(TEXT("s"));
			const double D = FMath::Max3(FMath::Abs(S.x - E->GetNumberField(TEXT("x"))), FMath::Abs(S.z - E->GetNumberField(TEXT("z"))), FMath::Abs(S.speed - E->GetNumberField(TEXT("v"))));
			Bad += !(D <= 1e-6) || S.refusing != (int)NumOr(E, TEXT("rf"), -1);
			// Événements d'obstacle (pleine précision).
			const TArray<TSharedPtr<FJsonValue>>* Oe = nullptr;
			const int32 NWant = Ch->TryGetArrayField(TEXT("oe"), Oe) ? Oe->Num() : 0;
			if (NWant != (int32)Out.events.size()) EvBad++;
			else
				for (int32 K = 0; K < NWant; K++)
				{
					const TSharedPtr<FJsonObject> X = (*Oe)[K]->AsObject();
					const strides::CsoFenceEvent& G = Out.events[K];
					FString Cause;
					X->TryGetStringField(TEXT("c"), Cause);
					double M = 0;
					const bool bM = X->TryGetNumberField(TEXT("m"), M);
					const bool bMarginOk = G.kind == strides::CsoFenceEventKind::Refusal || (bM ? FMath::Abs(G.margin - M) <= 1e-6 : !FMath::IsFinite(G.margin));
					EvBad += !(X->GetStringField(TEXT("e")) == UTF8_TO_TCHAR(strides::csoFenceEventName(G.kind)) && G.obstacle == (int32)X->GetNumberField(TEXT("o")) &&
						G.dir == (int32)X->GetNumberField(TEXT("dir")) && Cause == UTF8_TO_TCHAR(G.cause.c_str()) && bMarginOk);
					Events++;
				}
			// Barres hors repos (ob.fs) : mêmes barres, transformées à 1e-6 m / rad.
			TMap<int32, TSharedPtr<FJsonObject>> Rec;
			for (const TSharedPtr<FJsonValue>& XV : Ch->GetObjectField(TEXT("ob"))->GetArrayField(TEXT("fs"))) Rec.Add((int32)XV->AsObject()->GetNumberField(TEXT("i")), XV->AsObject());
			for (int32 I = 0; I < (int32)St.size(); I++)
			{
				TArray<int32> MovedRails;
				for (int32 K = 0; K < (int32)St[I].rails.size(); K++) if (Moved(St[I].rails[K])) MovedRails.Add(K);
				const TSharedPtr<FJsonObject>* Want = Rec.Find(I);
				const TArray<TSharedPtr<FJsonValue>> None;
				const TArray<TSharedPtr<FJsonValue>>& Rails = Want ? (*Want)->GetArrayField(TEXT("r")) : None;
				if (Rails.Num() != MovedRails.Num()) { RailBad++; continue; }
				for (int32 K = 0; K < MovedRails.Num(); K++)
				{
					const TArray<TSharedPtr<FJsonValue>>& T = Rails[K]->AsArray();
					const strides::CsoRail& Q = St[I].rails[MovedRails[K]];
					const double Dev = FMath::Max(FMath::Max(FMath::Abs(Q.y - T[1]->AsNumber()), FMath::Abs(Q.z - T[2]->AsNumber())),
						FMath::Max(FMath::Abs(Q.rx - T[3]->AsNumber()), FMath::Abs(Q.rz - T[4]->AsNumber())));
					RailBad += (int32)T[0]->AsNumber() != MovedRails[K] || !(Dev <= 1e-6);
					RailsCompared++;
				}
			}
			Frames++;
		}
		// Seul t3-tout-contre-remonte frôle une aile (recalages de collision) ; les autres doivent n'en avoir aucun.
		const bool bColsOk = Id == TEXT("t3-tout-contre-remonte") || Cols == 0;
		TestTrue(FString::Printf(TEXT("%s : rejeu des obstacles (%d images cheval, %d événements, %d barres en écart, %d recalages, %d collisions)"), *Id, Bad, EvBad, RailBad, Resync, Cols),
			Bad == 0 && EvBad == 0 && RailBad == 0 && Resync == 0 && bColsOk);
		if (Bad == 0 && EvBad == 0 && RailBad == 0 && Resync == 0 && bColsOk) Clean.Add(Id);
	}
	for (const FString& Id : Required) TestTrue(FString::Printf(TEXT("scénario %s rejoué sans écart"), *Id), Clean.Contains(Id));
	AddInfo(FString::Printf(TEXT("obstacles : %d scénarios sans écart, %d images, %d événements d'obstacle, %d transformées de barres comparées"), Clean.Num(), Frames, Events, RailsCompared));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesCsoFencesInGameTest, "Strides.Cso.FencesInGame", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesCsoFencesInGameTest::RunTest(const FString&)
{
	using namespace StridesFenceTest;
	// 1) Transformée d'une barre (repère local web de l'obstacle → composante Unreal), vérifiée par la géométrie : les bouts
	//    du cylindre (axe Z du maillage, ±50 cm) tombent sur P · (position + M · (±w/2, 0, 0)) × 100, M = Rx(rx) · Rz(rz).
	{
		const double W = 3.8;
		const double Cases[][4] = {{1.1, 0, 0, 0}, {0.64, 0.42, 1.3, -0.08}, {0.05, 1.2, 23.9, 0.012}, {0.9, -0.3, -0.7, 0.25}};
		double MaxErr = 0;
		for (const auto& C : Cases)
		{
			FTransform T = AStridesFence::RailTransform(C[0], C[1], C[2], C[3]);
			T.SetScale3D(FVector(0.1, 0.1, W));
			const double cx = FMath::Cos(C[2]), sx = FMath::Sin(C[2]), cz = FMath::Cos(C[3]), sz = FMath::Sin(C[3]);
			for (const double Sgn : {-1.0, 1.0})
			{
				// Bout de la barre web : (±w/2, 0, 0) tourné par Rz puis Rx, puis posé en (0, y, z).
				const double Ex = Sgn * W / 2;
				const double X1 = cz * Ex, Y1 = sz * Ex, Z1 = 0;                       // Rz
				const double X2 = X1, Y2 = cx * Y1 - sx * Z1, Z2 = sx * Y1 + cx * Z1;  // Rx
				const FVector WantUE((C[1] + Z2) * 100.0, -X2 * 100.0, (C[0] + Y2) * 100.0);
				const FVector A = T.TransformPosition(FVector(0, 0, 50)), B = T.TransformPosition(FVector(0, 0, -50));
				MaxErr = FMath::Max(MaxErr, FMath::Min((A - WantUE).Size(), (B - WantUE).Size()));
			}
		}
		TestTrue(FString::Printf(TEXT("transformée des barres : bouts à %.3g cm de la géométrie du web"), MaxErr), MaxErr < 1e-6);
		const FTransform Rest = AStridesFence::RailTransform(1.1, -0.65, 0, 0);
		TestTrue(TEXT("barre au repos : (s, 0, h) en cm, cylindre couché le long des barres"),
			Rest.GetLocation().Equals(FVector(-65, 0, 110), 1e-9) && FMath::Abs(Rest.TransformVector(FVector(0, 0, 1)).Y) > 1 - 1e-12);
	}

	// 2) Monde de test, parcours du Pôle lu dans Content/Data (comme Strides.Cso.HorseInGame).
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
	UGameInstance* GI = NewObject<UGameInstance>(GEngine);
	GI->AddToRoot();
	GI->InitializeStandalone(TEXT("StridesCsoFencesTest"));
	UWorld* World = GI->GetWorld();
	auto Cleanup = [&]()
	{
		GI->Shutdown();
		if (World)
		{
			GEngine->DestroyWorldContext(World);
			World->DestroyWorld(false);
		}
		GI->RemoveFromRoot();
	};
	if (!TestNotNull(TEXT("monde de test"), World)) { Cleanup(); return false; }
	const UStridesDataSubsystem* Data = GI->GetSubsystem<UStridesDataSubsystem>();
	if (!TestNotNull(TEXT("sous-système de données"), Data)) { Cleanup(); return false; }
	TestTrue(TEXT("HIND_TRAIL lu dans cso_horse.json"), Data->FenceParams().hindTrail == HorseJ->GetNumberField(TEXT("hindTrail")));
	AStridesCourse* Course = World->SpawnActor<AStridesCourse>();
	Course->BuildWith(Design, 350.0 / 60.0, HorseJ->GetNumberField(TEXT("csoFenceWidth")));
	const std::vector<strides::CsoObstacle>& Obs = Course->Obstacles();
	int32 Three = -1, FourA = -1;
	for (int32 i = 0; i < (int32)Obs.size(); i++)
	{
		if (Obs[i].label == "3") Three = i;
		if (Obs[i].label == "4A") FourA = i;
	}
	if (!TestTrue(TEXT("obstacles 3 et 4A trouvés"), Three >= 0 && FourA >= 0)) { Cleanup(); return false; }
	AStridesHorse* Horse = World->SpawnActor<AStridesHorse>();
	Horse->Course = Course;
	AStridesPlayerController* PC = World->SpawnActor<AStridesPlayerController>();
	if (!TestNotNull(TEXT("contrôleur du joueur"), PC)) { Cleanup(); return false; }
	PC->Possess(Horse);
	const double Dt = 1.0 / 30;
	auto Logged = [&](const FString& Prefix) { int32 N = 0; for (const FString& L : Course->FenceEventLog()) N += L.StartsWith(Prefix); return N; };

	// 3) Abord du 4A à 70° de son axe, 6,2 m/s, ligne passant par son centre ; SAUT à 7 m du point de passage : pas de saut
	//    (aucun obstacle visé), refus quand le nez passe sous v²/16 + 0,3 m ; jamais compté franchi.
	{
		const strides::CsoObstacle& F = Obs[FourA];
		const double A = FMath::DegreesToRadians(70.0);
		const double Fx = F.n.x * FMath::Cos(A) + F.t.x * FMath::Sin(A), Fz = F.n.z * FMath::Cos(A) + F.t.z * FMath::Sin(A);
		Horse->PlaceAt(F.x - Fx * 10.4, F.z - Fz * 10.4, FMath::Atan2(Fx, Fz), 6.2);
		bool bPressed = false, bJumped = false, bRefused = false;
		for (int32 K = 0; K < 150; K++)
		{
			const strides::CsoHorseState& S = Horse->CsoState();
			const double D = (F.x - S.x) * Fx + (F.z - S.z) * Fz;
			if (!bPressed && D <= 7) { PC->TouchJump(); bPressed = true; }
			Horse->Tick(Dt);
			bJumped |= Horse->IsJumping();
			bRefused |= Horse->LastEvents().Contains(TEXT("horse:refuse"));
		}
		TestTrue(TEXT("abord à 70° : appui sans saut"), bPressed && !bJumped);
		TestTrue(TEXT("abord à 70° : refus (cabré) et obstacle:refusal du cœur"), bRefused && Logged(TEXT("obstacle:refusal 4A")) == 1);
		TestTrue(TEXT("abord à 70° : jamais compté franchi ni en faute"), Logged(TEXT("obstacle:clear")) == 0 && Logged(TEXT("obstacle:fault")) == 0);
	}
	// 4) Sans-faute au 3 (règle du pilote des tests web) : obstacle:clear annoncé par le cœur, barre en place.
	{
		const strides::CsoObstacle& F = Obs[Three];
		const double Head = FMath::Atan2(F.n.x, F.n.z);
		Horse->PlaceAt(F.x - F.n.x * 18, F.z - F.n.z * 18, Head, 6.2);
		bool bJumped = false;
		for (int32 K = 0; K < 150; K++)
		{
			const strides::CsoTarget T = strides::csoTarget(Obs, Horse->CsoState(), Horse->JumpPower(), 0, true, Data->Jump(), Data->HorseParams());
			if (!bJumped && !Horse->IsJumping() && T.index == Three && T.plan.zone == strides::Zone::Good && T.plan.ideal <= T.plan.L + 0.3) { PC->TouchJump(); bJumped = true; }
			Horse->Tick(Dt);
		}
		TestTrue(TEXT("sans-faute au 3 : obstacle:clear du cœur"), Logged(TEXT("obstacle:clear 3 1")) == 1 && Logged(TEXT("obstacle:fault")) == 0);
		const UStaticMeshComponent* Bar = Course->FenceAt(Three)->RailComponent(0);
		FTransform Want = AStridesFence::RailTransform(F.bars[0].h, F.bars[0].s, 0, 0);
		TestTrue(TEXT("sans-faute au 3 : barre au repos"), Bar && Bar->GetRelativeTransform().GetLocation().Equals(Want.GetLocation(), 1e-6));
	}
	// 5) Refus tout contre au 3 (6,2 m/s, sans appui) : barre avant emportée vers le cheval ; la composante affiche la
	//    transformée du cœur à chaque image.
	{
		const strides::CsoObstacle& F = Obs[Three];
		const double Head = FMath::Atan2(F.n.x, F.n.z);
		Horse->PlaceAt(F.x - F.n.x * 14, F.z - F.n.z * 14, Head, 6.2);
		const int32 Before = Logged(TEXT("obstacle:refusal 3"));
		double MaxDev = 0;
		bool bFell = false;
		for (int32 K = 0; K < 90; K++)
		{
			Horse->Tick(Dt);
			const strides::CsoRail& R = Course->FenceStates()[Three].rails[0];
			bFell |= R.falling;
			FTransform Want = AStridesFence::RailTransform(R.y, R.z, R.rx, R.rz);
			const FTransform Got = Course->FenceAt(Three)->RailComponent(0)->GetRelativeTransform();
			MaxDev = FMath::Max(MaxDev, (Got.GetLocation() - Want.GetLocation()).Size() + Got.GetRotation().AngularDistance(Want.GetRotation()));
		}
		const strides::CsoRail& R = Course->FenceStates()[Three].rails[0];
		// (obstacles.js:459 : sens +1 quand le cheval arrive du côté s < 0 — la barre part dans le sens de sa marche.)
		TestTrue(FString::Printf(TEXT("refus tout contre : refus compté (%d), barre avant emportée dans le sens de la marche (z %.3f m)"), Logged(TEXT("obstacle:refusal 3")) - Before, R.z),
			Logged(TEXT("obstacle:refusal 3")) == Before + 1 && bFell && R.z > F.bars[0].s && Course->FenceStates()[Three].knocked);
		TestTrue(FString::Printf(TEXT("barre affichée à la transformée du cœur (écart max %.3g)"), MaxDev), MaxDev < 1e-6);
	}
	AddInfo(FString::Printf(TEXT("obstacles en jeu : %d événements du cœur reçus par le parcours"), Course->FenceEventLog().Num()));
	PC->UnPossess();
	Cleanup();
	return true;
}
