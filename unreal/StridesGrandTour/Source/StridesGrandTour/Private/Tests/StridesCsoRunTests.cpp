// Déroulé d'épreuve (tranche T4, unreal/docs/parite/cso-ecarts.md §4) dans le moteur :
//  - Strides.Parite.CsoRun : miroir de unreal/core/tests/test_core.cpp (testCsoRuns) par le chemin du jeu — AStridesCourse
//    construit avec les données (Content/Data : règles, lignes, textes), puis chaque scénario t4-* et « droit » de
//    cso_runs.json (français et anglais) rejoué image par image : événements d'obstacle passés à HandleFenceOut (cause
//    traduite par le jeu), image passée à TickRun ; appels d'interface et sons journalisés par l'acteur comparés à ceux
//    de courses.js, état de l'épreuve comparé ;
//  - Strides.Cso.RunInGame : AStridesHorse, AStridesRider et AStridesCourse réels dans un monde de test : entrée de piste
//    rejointe à cheval, annonce, cloche, ligne de départ franchie (bip), puis descente de cheval (AStridesRider::Dismount)
//    pendant le parcours : éliminé.
#include "Misc/AutomationTest.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "StridesCore/CsoCourse.h"
#include "StridesCore/CsoFences.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/MiniJson.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesRider.h"
#include "StridesUnits.h"

namespace StridesRunTest
{
FString RepoRoot()
{
	FString Root = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../.."));
	FPaths::CollapseRelativeDirectories(Root);
	return Root;
}

// Monde de test autonome (instance de jeu, sous-système de données lu dans Content/Data).
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

// Parcours du Pôle tel que le construit AStridesWorldDirector (tracé des données décalé de la carrière).
AStridesCourse* SpawnPoleCourse(UWorld* World, const UStridesDataSubsystem& Data)
{
	AStridesCourse* Course = World->SpawnActor<AStridesCourse>();
	strides::CourseDesign D = Data.PoleCourse();
	D.x += Data.PoleArena.X;
	D.z += Data.PoleArena.Y;
	Course->Build(D, Data);
	return Course;
}

// Format du journal d'AStridesCourse (« fn | arg | arg ») appliqué aux appels relevés dans le jeu web.
FString CallLine(const J& C)
{
	FString L = UTF8_TO_TCHAR(C["fn"].s.c_str());
	for (const J& A : C["args"].a) L += TEXT(" | ") + (A.t == J::Num ? FString::SanitizeFloat(A.n) : FString(UTF8_TO_TCHAR(A.s.c_str())));
	return L;
}
}  // namespace StridesRunTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesPariteCsoRunTest, "Strides.Parite.CsoRun", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesPariteCsoRunTest::RunTest(const FString&)
{
	using namespace StridesRunTest;
	FString Text;
	if (!TestTrue(TEXT("oracle cso_runs.json lu"), FFileHelper::LoadFileToString(Text, *(RepoRoot() / TEXT("unreal/core/tests/oracles/cso_runs.json"))))) return false;
	FTestWorld W(TEXT("StridesCsoRunTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	if (!TestNotNull(TEXT("sous-système de données"), Data) || !TestNotNull(TEXT("textes de l'épreuve (strings_cso.json)"), Data->CsoText())) return false;
	// Une exécution par ligne d'en-tête (« {"id":… ») suivie de ses images, une par ligne, jusqu'à « ]} » : chaque
	// exécution est lue seule (le fichier entier ne tient pas en un seul arbre sans peine).
	const std::string All = TCHAR_TO_UTF8(*Text);
	Text.Empty();
	TArray<FString> Done;
	int32 Frames = 0, HudCmp = 0, AudioCmp = 0, Bad = 0;
	size_t Pos = 0;
	while ((Pos = All.find("\n{\"id\":\"", Pos)) != std::string::npos)
	{
		const size_t Begin = Pos + 1;
		const size_t End = All.find("\n]}", Begin);
		if (End == std::string::npos) break;
		Pos = End;
		const std::string Head = All.substr(Begin, 64);
		if (Head.rfind("{\"id\":\"t4-", 0) != 0 && Head.rfind("{\"id\":\"droit\"", 0) != 0) continue;
		const J R = JParser(All.substr(Begin, End + 3 - Begin)).parse();
		const std::string Id = R["id"].s, Lang = R["lang"].s;
		const J& Su = R["setup"];
		AStridesCourse* Course = SpawnPoleCourse(W.World, *Data);
		Course->Lang = UTF8_TO_TCHAR(Lang.c_str());
		if (!TestTrue(TEXT("épreuve préparée par les données"), Course->StartRun(UTF8_TO_TCHAR(Su["playerName"].s.c_str()), UTF8_TO_TCHAR(Su["horseName"].s.c_str())))) return false;
		int32 HudAt = 0, AudioAt = 0, RunBad = 0;
		auto Compare = [&](const J& Calls, bool bHud, int32 F)
		{
			TArray<FString> Want;
			for (const J& C : Calls.a)
			{
				const std::string& Src = C["src"].s;
				const std::string& Fn = C["fn"].s;
				const bool Keep = bHud ? (Src == "gameplay/courses.js" && Fn != "jumpFeedback") || (Src == "gameplay/missions.js" && Fn == "clearHint") : Src == "gameplay/courses.js";
				if (Keep) Want.Add(CallLine(C));
			}
			const TArray<FString>& Log = bHud ? Course->HudLog() : Course->AudioLog();
			int32& At = bHud ? HudAt : AudioAt;
			TArray<FString> Got;
			for (; At < Log.Num(); At++) Got.Add(Log[At]);
			(bHud ? HudCmp : AudioCmp) += Want.Num();
			if (Got != Want)
			{
				if (++RunBad < 4) AddError(FString::Printf(TEXT("%hs (%hs) image %d : %s « %s » / web « %s »"), Id.c_str(), Lang.c_str(), F, bHud ? TEXT("interface") : TEXT("sons"), *FString::Join(Got, TEXT(" ; ")), *FString::Join(Want, TEXT(" ; "))));
			}
		};
		Compare(Su["calls"]["hud"], true, -1);
		AudioAt = Course->AudioLog().Num();
		for (const J& Fr : R["frames"].a)
		{
			const int32 F = (int32)Fr["f"].num();
			const J& Ep = Fr["ep"];
			if (Ep.isNull()) continue;
			strides::CsoFenceOut Out;
			for (size_t K = 0; K < (size_t)Ep["e0"].num() && K < Fr["ev"].a.size(); K++)
			{
				const J& E = Fr["ev"][K];
				const std::string& En = E["e"].s;
				if ((En != "obstacle:clear" && En != "obstacle:fault" && En != "obstacle:refusal") || E["d"]["obstacle"]["course"].s != "cso") continue;
				strides::CsoFenceEvent Ev;
				Ev.kind = En == "obstacle:clear" ? strides::CsoFenceEventKind::Clear : En == "obstacle:fault" ? strides::CsoFenceEventKind::Fault : strides::CsoFenceEventKind::Refusal;
				Ev.obstacle = (int)E["d"]["obstacle"]["num"].num() - 1;
				Ev.dir = (int)E["d"]["dir"].num();
				if (!E["d"]["cause"].isNull()) Ev.cause = E["d"]["cause"].s;
				Out.events.push_back(Ev);
			}
			strides::CsoCadence Cad{!Ep["cad"].isNull(), Ep["cad"].isNull() ? 0 : Ep["cad"].num()};
			if (!Out.events.empty()) Course->HandleFenceOut(Out, Cad);
			strides::CsoRunFrame In;
			In.dt = Ep["dt"].num();
			In.time = Ep["gt"].num();
			In.x = Ep["x"].num();
			In.z = Ep["z"].num();
			In.heading = Ep["h"].num();
			In.focusX = Ep["fx"].isNull() ? In.x : Ep["fx"].num();
			In.focusZ = Ep["fz"].isNull() ? In.z : Ep["fz"].num();
			In.riding = Ep["mode"].s == "ride";
			strides::CsoCadence Cad2{!Ep["cad"].isNull(), Ep["cad"].isNull() ? 0 : Ep["cad"].num()};
			Course->TickRun(In, Cad2);
			Frames++;
			Compare(Fr["hud"], true, F);
			Compare(Fr["audio"], false, F);
			const J& C = Fr["run"]["course"];
			const strides::CsoRunState& S = Course->Run()->state();
			const bool bElim = !C["eliminated"].isNull();
			if (C["started"].b != S.started || (int)C["next"].num() != S.next || (int)C["faults"].num() != S.faults || bElim != S.eliminated || (bElim && C["eliminated"].s != S.eliminatedReason) ||
				FMath::Abs(C["t"].num() - S.t) > 1e-6 || Fr["run"]["text"].s != Course->Run()->text())
			{
				if (++RunBad < 4) AddError(FString::Printf(TEXT("%hs (%hs) image %d : état de l'épreuve"), Id.c_str(), Lang.c_str(), F));
			}
		}
		Bad += RunBad;
		Done.Add(FString::Printf(TEXT("%hs %hs"), Id.c_str(), Lang.c_str()));
		Course->Destroy();
	}
	const TCHAR* Required[] = {TEXT("droit"), TEXT("t4-sans-faute"), TEXT("t4-depart-lance"), TEXT("t4-cloche"), TEXT("t4-erreur-parcours"), TEXT("t4-deux-refus"),
		TEXT("t4-temps-limite"), TEXT("t4-descente"), TEXT("t4-saute-avant-depart"), TEXT("t4-arrivee-barre"), TEXT("t4-lignes")};
	for (const TCHAR* Id : Required)
		for (const TCHAR* L : {TEXT("fr"), TEXT("en")}) TestTrue(FString::Printf(TEXT("scénario %s (%s) rejoué"), Id, L), Done.Contains(FString::Printf(TEXT("%s %s"), Id, L)));
	TestEqual(TEXT("écarts au jeu web (interface, sons, état)"), Bad, 0);
	AddInfo(FString::Printf(TEXT("déroulé d'épreuve dans le jeu : %d exécutions, %d images, %d appels d'interface et %d sons comparés"), Done.Num(), Frames, HudCmp, AudioCmp));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesCsoRunInGameTest, "Strides.Cso.RunInGame", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesCsoRunInGameTest::RunTest(const FString&)
{
	using namespace StridesRunTest;
	FTestWorld W(TEXT("StridesCsoRunInGameTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	if (!TestNotNull(TEXT("sous-système de données"), Data)) return false;
	AStridesCourse* Course = SpawnPoleCourse(W.World, *Data);
	if (!TestTrue(TEXT("épreuve lancée (règles et textes des données)"), Course->StartRun(TEXT("Alex"), TEXT("Comète")))) return false;
	const strides::CsoRunConfig& Cfg = Course->Run()->config();
	AStridesHorse* Horse = W.World->SpawnActor<AStridesHorse>();
	Horse->Course = Course;
	const double Dt = 1.0 / 30;
	auto Logged = [&](const FString& Line) { return Course->HudLog().Contains(Line) || Course->AudioLog().Contains(Line); };
	// 1) Cheval posé à l'entrée de la carrière, cavalier en selle (AStridesRider::TryMount) : entrée, annonce, cloche.
	Horse->PlaceAt(Cfg.gateX, Cfg.gateZ, Cfg.start.rot, 0);
	AStridesRider* Rider = W.World->SpawnActor<AStridesRider>(Horse->GetActorLocation() + FVector(0, 0, 90), FRotator::ZeroRotator);
	if (!TestTrue(TEXT("cavalier en selle"), Rider && Rider->TryMount(nullptr) && Horse->Rider == Rider)) return false;
	for (int32 K = 0; K < 90 && Course->Run()->step() != strides::CsoStep::Course; K++) Horse->Tick(Dt);
	TestTrue(TEXT("parcours atteint (entrée de piste, capacité, présentation, entrée en piste, cloche)"), Course->Run()->step() == strides::CsoStep::Course);
	TestTrue(TEXT("annonce du dossard"), Course->HudLog().ContainsByPredicate([](const FString& L) { return L.StartsWith(TEXT("big | N° ")) && L.EndsWith(TEXT(" · Alex | et Comète | 2400.0")); }));
	TestTrue(TEXT("cloche : grand message et son"), Logged(TEXT("big | CLOCHE | Tu as 45 s pour franchir la ligne de départ | 2000.0")) && Logged(TEXT("bell")));
	TestTrue(TEXT("chrono pas lancé avant la ligne"), !Course->Run()->state().started);
	// 2) Cheval posé 6 m avant la ligne de départ, dans son axe, au trot : ligne franchie, bip, chrono lancé.
	Horse->PlaceAt(Cfg.start.x - FMath::Sin(Cfg.start.rot) * 6, Cfg.start.z - FMath::Cos(Cfg.start.rot) * 6, Cfg.start.rot, 4.6);
	for (int32 K = 0; K < 60 && !Course->Run()->state().started; K++) Horse->Tick(Dt);
	TestTrue(TEXT("ligne de départ franchie : chrono lancé, bip"), Course->Run()->state().started && Logged(TEXT("tone | 1568.0 | 0.1 | sine | 0.08")));
	for (int32 K = 0; K < 10; K++) Horse->Tick(Dt);
	TestTrue(TEXT("chrono qui tourne"), Course->Run()->state().t > 0.3);
	// 3) Descente de cheval pendant le parcours (le 1 n'est pas encore atteint) : éliminé à l'image suivante
	//    (courses.js:329), bilan.
	Rider->Dismount(nullptr);
	TestTrue(TEXT("cavalier à pied"), Horse->Rider == nullptr);
	Horse->Tick(Dt);
	const strides::CsoRunState& S = Course->Run()->state();
	TestTrue(FString::Printf(TEXT("descente : éliminé (« %hs »)"), S.eliminatedReason.c_str()), S.eliminated && S.eliminatedReason == "Tu es descendu de cheval : éliminé.");
	TestTrue(TEXT("descente : grand message ÉLIMINÉ et cloche double"), Logged(TEXT("big | ÉLIMINÉ | Tu es descendu de cheval : éliminé. | 2600.0")) && Logged(TEXT("bell | 2.0")));
	TestTrue(TEXT("bilan (étape suivante)"), Course->Run()->step() == strides::CsoStep::Result);
	AddInfo(FString::Printf(TEXT("épreuve en jeu : %d appels d'interface, %d sons ; %s"), Course->HudLog().Num(), Course->AudioLog().Num(), *Course->StatusText()));
	return true;
}
