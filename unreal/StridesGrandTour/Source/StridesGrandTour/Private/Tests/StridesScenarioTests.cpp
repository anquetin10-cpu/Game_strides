// Jalon J1 (unreal/docs/livraison/plan.md) : boucle de jeu du parcours du Pôle par le chemin du joueur, dans le moteur.
//  - Strides.Scenario.PoleLoop : poteau « Chrono » (touche E du web), présentation, « Entrer en piste », entrée, cloche,
//    départ, puis trois manches et une deuxième partie :
//      manche 1 : barre tombée au 1, refus au 2, erreur de parcours (le 5 franchi au lieu du 3), arrivée, bilan ;
//      « Recommencer » ; manche 2 : deux refus au 1 = élimination (règle du web : maxRefusals 2, courses.js:72-73), bilan ;
//      « Recommencer » ; manche 3 : sans faute, arrivée, bilan, « Quitter l'épreuve » (meilleur temps écrit) ;
//      retour au monde (mission terminée, plus de mode concours, poteau de nouveau proposé), puis une deuxième partie
//      lancée au poteau, partie neuve.
//    À chaque recommencement et à la nouvelle partie, l'état est vérifié champ par champ (fautes, refus, refus sur
//    l'obstacle, obstacle attendu, chrono, pénalités de temps, départ, arrivée, élimination, erreurs de parcours, journal,
//    points, barres remises, numéro surligné, manche).
//    Entrées : touches du web passées au contrôleur (FeedKey, comme le clavier), boutons de carte par
//    AStridesCourse::PressScreenButton (ce que fait le widget des cartes), cheval posé aux lignes de départ et d'arrivée
//    (AStridesHorse::PlaceAt) et événements d'obstacle passés à AStridesCourse::HandleFenceOut (ce que font les obstacles
//    au contact du cheval). Ce n'est NI l'autopilote (F8) NI une partie jouée : le pilotage du cheval entre deux lignes
//    n'est pas simulé ici (la partie manuelle par entrées système le prouve).
//  - Strides.Cso.ActivityPrompt : invite « E · Chrono » du HUD hors tactile, selon la distance au départ et la mission.
//  - Strides.Hud.MinimapFrame : minicarte dans le sens de la carte du web (z vers le bas), cap du cavalier, guidage.
#include "Misc/AutomationTest.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "StridesActivityPost.h"
#include "StridesCore/CsoFences.h"
#include "StridesCore/CsoRun.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesHUD.h"
#include "StridesPlayerController.h"
#include "StridesRider.h"
#include "StridesSaveSubsystem.h"
#include "StridesUnits.h"

namespace StridesScenarioTest
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

// Monde de l'entrée (comme Strides.Cso.Entry) : parcours du Pôle, poteau, cheval monté par le cavalier du joueur.
struct FGame
{
	AStridesCourse* Course = nullptr;
	AStridesActivityPost* Post = nullptr;
	AStridesHorse* Horse = nullptr;
	AStridesPlayerController* PC = nullptr;
	AStridesRider* Rider = nullptr;
	bool Make(UWorld* World, const UStridesDataSubsystem& Data)
	{
		Course = World->SpawnActor<AStridesCourse>();
		strides::CourseDesign D = Data.PoleCourse();
		D.x += Data.PoleArena.X;
		D.z += Data.PoleArena.Y;
		Course->Build(D, Data);
		const strides::CsoActivity* A = Data.CsoActivity();
		if (!A) return false;
		Post = World->SpawnActor<AStridesActivityPost>();
		Post->Setup(*A, Course);
		Post->PlayerName = TEXT("Alex");
		Horse = World->SpawnActor<AStridesHorse>();
		Horse->Course = Course;
		Horse->PlaceAt(A->startX, A->startZ + 4, PI, 0);
		PC = World->SpawnActor<AStridesPlayerController>();
		Rider = World->SpawnActor<AStridesRider>(Horse->GetActorLocation() + FVector(0, 0, 90), FRotator::ZeroRotator);
		if (!PC || !Rider || !Rider->TryMount(PC) || PC->GetPawn() != Horse) return false;
		PC->SetViewCssForTest(FVector2D(844, 390));
		return true;
	}
	void Frame() { PC->StepCommands(1.0 / 30); Horse->Tick(1.0 / 30); }
	void Tap(const TCHAR* Code)
	{
		PC->FeedKey(Code, true, false);
		Frame();
		PC->FeedKey(Code, false, false);
	}
	// Événement d'obstacle (rang 1..n) comme les obstacles le passent au parcours au contact du cheval.
	void Fence(strides::CsoFenceEventKind K, int32 Num)
	{
		strides::CsoFenceOut Out;
		strides::CsoFenceEvent E;
		E.kind = K;
		E.obstacle = Num - 1;
		E.dir = 1;
		E.margin = K == strides::CsoFenceEventKind::Fault ? -0.05 : 0.2;
		Out.events.push_back(E);
		strides::CsoCadence Cad;
		Course->HandleFenceOut(Out, Cad);
	}
	// Ligne orientée (départ ou arrivée) franchie au pas, dans son sens : 3 m avant, puis 1 m après.
	void CrossLine(const strides::CsoRunLine& L)
	{
		const double Nx = FMath::Sin(L.rot), Nz = FMath::Cos(L.rot);
		Horse->PlaceAt(L.x - 3 * Nx, L.z - 3 * Nz, L.rot, 0);
		Frame();
		Horse->PlaceAt(L.x + 1 * Nx, L.z + 1 * Nz, L.rot, 0);
		Frame();
	}
	// Cheval ramené 10 m avant la ligne de départ : sans quoi, s'il est encore dans les 12 m après elle et dans son sens
	// quand le parcours commence, le départ est lancé d'office (règle du web, courses.js:182-285, CsoRun::startStep).
	void AwayFromStart(const strides::CsoRunLine& L)
	{
		Horse->PlaceAt(L.x - 10 * FMath::Sin(L.rot), L.z - 10 * FMath::Cos(L.rot), L.rot, 0);
	}
	// Étapes avancées jusqu'à Pred (au plus N images).
	template <typename F> bool Until(F Pred, int32 N = 600)
	{
		for (int32 K = 0; K < N; K++)
		{
			if (Pred()) return true;
			Frame();
		}
		return Pred();
	}
};
}  // namespace StridesScenarioTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesScenarioPoleLoopTest, "Strides.Scenario.PoleLoop", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesScenarioPoleLoopTest::RunTest(const FString&)
{
	using namespace StridesScenarioTest;
	using strides::CsoStep;
	using K = strides::CsoFenceEventKind;
	FTestWorld W(TEXT("StridesScenarioPoleLoop"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	if (!TestNotNull(TEXT("activité du Pôle"), Data ? Data->CsoActivity() : nullptr)) return false;
	// Emplacement de sauvegarde du test : la partie du joueur n'est jamais touchée.
	UStridesSaveSubsystem* Save = W.GI->GetSubsystem<UStridesSaveSubsystem>();
	if (!TestNotNull(TEXT("sauvegarde"), Save)) return false;
	Save->SlotName = TEXT("strides_test_j1_scenario");
	Save->MutableBestTimes().clear();
	FGame G;
	if (!TestTrue(TEXT("parcours, poteau, cheval monté"), G.Make(W.World, *Data))) return false;
	AStridesCourse* C = G.Course;
	auto Info = [this](const FString& M) { AddInfo(M); UE_LOG(LogTemp, Display, TEXT("Strides.Scenario.PoleLoop : %s"), *M); };

	// État neuf d'une manche, champ par champ (après « Recommencer » ou une nouvelle partie, au début du parcours).
	auto CheckFresh = [&](const TCHAR* When, int32 Attempt)
	{
		const strides::CsoRun* R = C->Run();
		if (!TestNotNull(When, R)) return;
		const strides::CsoRunState& S = R->state();
		TestEqual(FString::Printf(TEXT("%s : manche"), When), S.attempt, Attempt);
		TestEqual(FString::Printf(TEXT("%s : fautes"), When), S.faults, 0);
		TestEqual(FString::Printf(TEXT("%s : refus"), When), S.refusals, 0);
		TestEqual(FString::Printf(TEXT("%s : refus sur l'obstacle"), When), S.fenceRefusals, 0);
		TestEqual(FString::Printf(TEXT("%s : obstacle attendu"), When), S.next, 1);
		TestEqual(FString::Printf(TEXT("%s : pénalités de temps"), When), S.timeFaults, 0);
		TestEqual(FString::Printf(TEXT("%s : chrono"), When), S.t, 0.0);
		TestFalse(FString::Printf(TEXT("%s : départ non franchi"), When), S.started);
		TestFalse(FString::Printf(TEXT("%s : arrivée non franchie"), When), S.finished);
		TestFalse(FString::Printf(TEXT("%s : pas éliminé"), When), S.eliminated);
		TestTrue(FString::Printf(TEXT("%s : aucune erreur de parcours"), When), S.wrong.empty());
		TestTrue(FString::Printf(TEXT("%s : journal vide"), When), S.log.empty());
		TestEqual(FString::Printf(TEXT("%s : points"), When), R->points(), 0);
		int32 Knocked = 0;
		for (const strides::CsoFenceState& F : C->FenceStates()) Knocked += F.knocked;
		TestEqual(FString::Printf(TEXT("%s : barres sur leurs taquets"), When), Knocked, 0);
		TestEqual(FString::Printf(TEXT("%s : n° 1 surligné"), When), C->Highlight(), 1);
		TestEqual(FString::Printf(TEXT("%s : chrono affiché (ElapsedTime)"), When), C->ElapsedTime(), 0.f);
		TestEqual(FString::Printf(TEXT("%s : fautes affichées (Faults)"), When), C->Faults(), 0);
	};
	const int32 N = (int32)C->Obstacles().size();
	auto Labels = [&]() { TArray<FString> L; for (const strides::CsoRunFence& F : C->Run()->config().fences) L.Add(UTF8_TO_TCHAR(F.label.c_str())); return L; };
	// Entrée par le poteau : E, présentation, « Entrer en piste », jusqu'au parcours.
	auto EnterFromPost = [&](const TCHAR* When) -> bool
	{
		const strides::CsoActivity& A = G.Post->Activity();
		G.Horse->PlaceAt(A.startX, A.startZ + 4, PI, 0);
		G.Frame();
		if (!TestEqual(FString::Printf(TEXT("%s : poteau proposé (libellé)"), When), G.PC->ActionLabel(), FString(TEXT("Chrono")))) return false;
		G.Tap(TEXT("KeyE"));
		if (!TestTrue(FString::Printf(TEXT("%s : activité lancée par E"), When), C->MissionActive())) return false;
		G.Until([&] { return C->Screen() == AStridesCourse::EScreen::Presentation || C->DialogOpen(); }, 60);
		if (C->DialogOpen()) C->AdvanceDialog();
		G.Until([&] { return C->Screen() == AStridesCourse::EScreen::Presentation; }, 60);
		if (!TestTrue(FString::Printf(TEXT("%s : présentation affichée"), When), C->Screen() == AStridesCourse::EScreen::Presentation)) return false;
		TestTrue(FString::Printf(TEXT("%s : « Entrer en piste »"), When), C->PressScreenButton(TEXT("enter")));
		return TestTrue(FString::Printf(TEXT("%s : parcours atteint (entrée, cloche)"), When), G.Until([&] { return C->Run()->step() == CsoStep::Course; }));
	};
	// Arrivée puis bilan.
	auto Finish = [&](const TCHAR* When) -> bool
	{
		G.CrossLine(C->Run()->config().finish);
		return TestTrue(FString::Printf(TEXT("%s : bilan affiché"), When), G.Until([&] { return C->Screen() == AStridesCourse::EScreen::Result; }));
	};

	// ---- Partie 1, manche 1 : barre, refus, erreur de parcours, arrivée ----
	if (!EnterFromPost(TEXT("partie 1"))) return false;
	CheckFresh(TEXT("partie 1, manche 1 (début)"), 1);
	TestTrue(TEXT("mode concours (commandes de concours)"), G.PC->InRace() || C->Run()->course().active);
	TestTrue(TEXT("poteau plus proposé en épreuve"), G.PC->ActionLabel().IsEmpty());
	const TArray<FString> L = Labels();
	Info(FString::Printf(TEXT("%d obstacles : %s"), N, *FString::Join(L, TEXT(" "))));
	// Avant le départ : un obstacle sauté ne compte pas (chrono non lancé).
	G.Fence(K::Clear, 1);
	TestEqual(TEXT("obstacle avant le départ : non compté"), C->Run()->state().next, 1);
	G.CrossLine(C->Run()->config().start);
	TestTrue(TEXT("départ franchi : chrono lancé"), C->Run()->state().started);
	for (int32 K2 = 0; K2 < 60; K2++) G.Frame();
	TestTrue(FString::Printf(TEXT("chrono qui tourne (%.2f s après 60 images)"), C->Run()->state().t), C->Run()->state().t > 1.5);
	// Barre au 1 : la barre tombe (état des obstacles) et la faute est comptée.
	{
		strides::CsoFenceOut Knock;
		strides::csoKnock(C->Obstacles(), C->FenceStates(), 0, -1, 1, 0, 0.15, 10.0, Knock);
	}
	G.Fence(K::Fault, 1);
	TestTrue(TEXT("barre du 1 à terre"), C->FenceStates()[0].knocked);
	TestEqual(TEXT("barre au 1 : 4 points"), C->Run()->state().faults, 4);
	TestEqual(TEXT("obstacle suivant : 2"), C->Run()->state().next, 2);
	// Refus au 2 (simple : « 2 »).
	G.Fence(K::Refusal, 2);
	TestEqual(TEXT("refus au 2 : 8 points"), C->Run()->state().faults, 8);
	TestEqual(TEXT("refus compté"), C->Run()->state().refusals, 1);
	TestFalse(TEXT("un refus : pas d'élimination"), C->Run()->state().eliminated);
	G.Fence(K::Clear, 2);
	TestEqual(TEXT("2 franchi après le refus"), C->Run()->state().next, 3);
	// Erreur de parcours : le 5 sauté alors que le 3 est attendu.
	const int32 Wrong = FMath::Min(5, N);
	G.Fence(K::Clear, Wrong);
	TestTrue(TEXT("erreur de parcours relevée"), C->Run()->state().wrong.count(Wrong) == 1);
	TestEqual(TEXT("erreur de parcours : obstacle attendu inchangé"), C->Run()->state().next, 3);
	TestTrue(TEXT("erreur de parcours : message du web"), C->HudLog().ContainsByPredicate([](const FString& S) { return S.StartsWith(TEXT("toast | Erreur de parcours")); }));
	for (int32 I = 3; I <= N; I++) G.Fence(K::Clear, I);
	TestEqual(TEXT("tous les obstacles franchis"), C->Run()->state().next, N + 1);
	if (!Finish(TEXT("manche 1"))) return false;
	const strides::CsoRunState S1 = C->Run()->state();
	TestTrue(TEXT("manche 1 : arrivée"), S1.finished && !S1.eliminated);
	TestEqual(TEXT("manche 1 : 8 points (barre + refus)"), S1.faults, 8);
	TestTrue(TEXT("manche 1 : carte de bilan remplie"), !C->ResultCard().title.empty());
	Info(FString::Printf(TEXT("manche 1 : %.2f s, %d fautes, %d refus, bilan « %hs »"), S1.t, S1.faults, S1.refusals, C->ResultCard().title.c_str()));

	// ---- « Recommencer » : manche 2, élimination par deux refus ----
	TestTrue(TEXT("« Recommencer » (bilan 1)"), C->PressScreenButton(TEXT("cso-retry")));
	G.AwayFromStart(C->Run()->config().start);
	TestTrue(TEXT("manche 2 : parcours atteint"), G.Until([&] { return C->Run()->step() == CsoStep::Course; }));
	CheckFresh(TEXT("partie 1, manche 2 (après Recommencer)"), 2);
	G.CrossLine(C->Run()->config().start);
	G.Fence(K::Refusal, 1);
	G.Fence(K::Refusal, 1);
	G.Frame();
	TestTrue(TEXT("deux refus : éliminé (règle du web)"), C->Run()->state().eliminated);
	TestTrue(TEXT("élimination annoncée"), C->HudLog().ContainsByPredicate([](const FString& S) { return S.StartsWith(TEXT("big | ÉLIMINÉ")); }));
	TestTrue(TEXT("manche 2 : bilan après élimination"), G.Until([&] { return C->Screen() == AStridesCourse::EScreen::Result; }));

	// ---- « Recommencer » : manche 3, sans faute, puis « Quitter l'épreuve » ----
	TestTrue(TEXT("« Recommencer » (bilan 2)"), C->PressScreenButton(TEXT("cso-retry")));
	G.AwayFromStart(C->Run()->config().start);
	TestTrue(TEXT("manche 3 : parcours atteint"), G.Until([&] { return C->Run()->step() == CsoStep::Course; }));
	CheckFresh(TEXT("partie 1, manche 3 (après le 2e Recommencer)"), 3);
	G.CrossLine(C->Run()->config().start);
	for (int32 K2 = 0; K2 < 90; K2++) G.Frame();
	for (int32 I = 1; I <= N; I++) G.Fence(K::Clear, I);
	if (!Finish(TEXT("manche 3"))) return false;
	const strides::CsoRunState S3 = C->Run()->state();
	TestTrue(FString::Printf(TEXT("manche 3 : sans faute (%d points, %.2f s)"), C->Run()->points(), S3.t), S3.faults == 0 && S3.finished && !S3.eliminated);
	TestTrue(TEXT("« Quitter l'épreuve »"), C->PressScreenButton(TEXT("cso-done")));
	TestTrue(TEXT("mission terminée"), G.Until([&] { return !C->MissionActive(); }, 60));
	double Best = 0;
	TestTrue(FString::Printf(TEXT("meilleur temps écrit sans F5 (%.2f s)"), Best), Save->BestTime(TEXT("cso_train"), Best) && FMath::IsNearlyEqual(Best, S3.t, 1e-6));
	G.Frame();
	TestEqual(TEXT("retour au monde : aucune carte"), C->Screen(), AStridesCourse::EScreen::None);
	TestFalse(TEXT("retour au monde : plus de mode concours"), G.PC->InRace());
	TestFalse(TEXT("retour au monde : simulation non suspendue"), G.PC->IsSimPaused());

	// ---- Partie 2 : relancée au poteau, état neuf ----
	if (!EnterFromPost(TEXT("partie 2"))) return false;
	CheckFresh(TEXT("partie 2, manche 1"), 1);
	TestTrue(TEXT("partie 2 : meilleur temps connu au lancement"), C->Run()->config().hasBest && FMath::IsNearlyEqual(C->Run()->config().best, Best, 1e-6));
	G.CrossLine(C->Run()->config().start);
	for (int32 I = 1; I <= N; I++) G.Fence(K::Clear, I);
	if (!Finish(TEXT("partie 2"))) return false;
	TestTrue(TEXT("partie 2 : « Quitter l'épreuve »"), C->PressScreenButton(TEXT("cso-done")));
	TestTrue(TEXT("partie 2 terminée"), G.Until([&] { return !C->MissionActive(); }, 60));
	Info(FString::Printf(TEXT("%d appels d'interface, %d sons, %d remises de barres"), C->HudLog().Num(), C->AudioLog().Num(), C->RailResets()));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesCsoActivityPromptTest, "Strides.Cso.ActivityPrompt", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesCsoActivityPromptTest::RunTest(const FString&)
{
	using namespace StridesScenarioTest;
	FTestWorld W(TEXT("StridesActivityPrompt"));
	const UStridesDataSubsystem* Data = W.World ? W.GI->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	if (!TestNotNull(TEXT("données"), Data)) return false;
	FGame G;
	if (!TestTrue(TEXT("parcours, poteau, cheval monté"), G.Make(W.World, *Data))) return false;
	const strides::CsoActivity& A = G.Post->Activity();
	G.Horse->PlaceAt(A.startX, A.startZ + 5, PI, 0);
	const FString L5 = G.PC->ActionLabel();
	TestEqual(TEXT("à 5 m du départ : invite clavier"), AStridesHUD::ActionPrompt(L5, false), FString(TEXT("E  ·  Chrono")));
	TestEqual(TEXT("à 5 m, mode tactile : pas de bulle (le bouton d'action porte le libellé)"), AStridesHUD::ActionPrompt(L5, true), FString());
	G.Horse->PlaceAt(A.startX, A.startZ + 7, PI, 0);
	TestEqual(TEXT("à 7 m : aucune invite"), AStridesHUD::ActionPrompt(G.PC->ActionLabel(), false), FString());
	G.Horse->PlaceAt(A.startX, A.startZ + 4, PI, 0);
	G.Tap(TEXT("KeyE"));
	TestTrue(TEXT("épreuve lancée"), G.Course->MissionActive());
	TestEqual(TEXT("mission en cours : aucune invite"), AStridesHUD::ActionPrompt(G.PC->ActionLabel(), false), FString());
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesHudMinimapFrameTest, "Strides.Hud.MinimapFrame", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesHudMinimapFrameTest::RunTest(const FString&)
{
	// Carte du web (src/ui/minimap.js:9-11) : px = (x + half)·S, pz = (z + half)·S, x vers la droite, z vers le bas.
	const FVector2D C(100, 100);
	const double Px = 2.0;
	TestEqual(TEXT("joueur au centre"), AStridesHUD::MinimapPoint(C, 10, 20, Px, FVector2D(10, 20)), C);
	TestEqual(TEXT("x + 10 m : à droite"), AStridesHUD::MinimapPoint(C, 10, 20, Px, FVector2D(20, 20)), FVector2D(120, 100));
	TestEqual(TEXT("z + 10 m : en bas"), AStridesHUD::MinimapPoint(C, 10, 20, Px, FVector2D(10, 30)), FVector2D(100, 120));
	TestEqual(TEXT("x − 5 m, z − 5 m : en haut à gauche"), AStridesHUD::MinimapPoint(C, 10, 20, Px, FVector2D(5, 15)), FVector2D(90, 90));
	// Cap : avant Unreal = direction web (x, z) (StridesUnits) ; cap web h : (sin h, cos h).
	auto Fwd = [](double H) { const FVector U = StridesUnits::WebToUE(FMath::Sin(H), 0, FMath::Cos(H)); return U.GetSafeNormal(); };
	TestTrue(TEXT("cap 0 (z +) : flèche vers le bas"), AStridesHUD::MinimapHeading(Fwd(0)).Equals(FVector2D(0, 1), 1e-6));
	TestTrue(TEXT("cap π/2 (x +) : flèche vers la droite"), AStridesHUD::MinimapHeading(Fwd(HALF_PI)).Equals(FVector2D(1, 0), 1e-6));
	// Un point droit devant reste devant sur la carte (flèche et point dans la même direction).
	const double H = 0.7;
	const FVector2D Ahead = AStridesHUD::MinimapPoint(C, 0, 0, Px, FVector2D(FMath::Sin(H) * 30, FMath::Cos(H) * 30)) - C;
	TestTrue(TEXT("point devant : dans le sens de la flèche"), FVector2D::DotProduct(Ahead.GetSafeNormal(), AStridesHUD::MinimapHeading(Fwd(H))) > 0.999);
	// Guidage.
	TestEqual(TEXT("guidage loin, devant"), AStridesHUD::PoleGuideText(420.4, 5), FString(TEXT("Chrono du Pôle · 420 m · tout droit")));
	TestEqual(TEXT("guidage à droite"), AStridesHUD::PoleGuideText(80, 60), FString(TEXT("Chrono du Pôle · 80 m · à droite")));
	TestEqual(TEXT("guidage à gauche"), AStridesHUD::PoleGuideText(80, -60), FString(TEXT("Chrono du Pôle · 80 m · à gauche")));
	TestEqual(TEXT("guidage derrière"), AStridesHUD::PoleGuideText(1260, 170), FString(TEXT("Chrono du Pôle · 1,3 km · demi-tour")));
	TestEqual(TEXT("au départ : plus de guidage (invite à la place)"), AStridesHUD::PoleGuideText(4, 0), FString());
	return true;
}

namespace StridesScenarioTest
{
// Pilote au clavier : codes de touches du web passés au contrôleur (FeedKey, comme le clavier du joueur), cap vers un
// point visé et cadence voulue. Pas de téléportation pendant la conduite, pas d'autopilote du jeu (F8).
struct FDriver
{
	FGame& G;
	TSet<FString> Down;
	explicit FDriver(FGame& InG) : G(InG) {}
	void Set(const TCHAR* Code, bool bOn)
	{
		if (bOn == Down.Contains(Code)) return;
		G.PC->FeedKey(Code, bOn, false);
		if (bOn) Down.Add(Code);
		else Down.Remove(Code);
	}
	void Release()
	{
		for (const FString& C : Down.Array()) G.PC->FeedKey(C, false, false);
		Down.Reset();
	}
	// Une image : cap vers (Tx, Tz), cadence visée Cad (m/s).
	void Toward(double Tx, double Tz, double Cad)
	{
		const strides::CsoHorseState& S = G.Horse->CsoState();
		const double Want = FMath::Atan2(Tx - S.x, Tz - S.z);
		const double Err = FMath::UnwindRadians(Want - S.heading);
		// Droite (KeyD) : vitesse de lacet négative (steerRate du web), le cap diminue.
		Set(TEXT("KeyD"), Err < -0.05);
		Set(TEXT("KeyA"), Err > 0.05);
		const double C = S.hasCadence ? S.cadence : S.speed;
		const bool bStraight = FMath::Abs(Err) < 0.05;
		Set(TEXT("KeyW"), bStraight && C < Cad - 0.2);
		Set(TEXT("KeyS"), bStraight && C > Cad + 0.2);
		G.Frame();
	}
	void TapJump() { G.Tap(TEXT("Space")); }
};

// Position dans le repère de l'obstacle : s le long de l'axe de saut (n), depuis son centre.
double AlongS(const strides::CsoObstacle& O, double X, double Z) { return (X - O.x) * O.n.x + (Z - O.z) * O.n.z; }
}  // namespace StridesScenarioTest

// Jalon J1 (correction après contrôle) : le parcours du Pôle conduit au clavier, dans le moteur, avec les obstacles
// réels (AStridesHorse::TickCso → csoFencesUpdateHorse) : aucun événement d'obstacle injecté.
//   manche 1 : départ franchi en conduisant ; 1 abordé sans sauter → refus (le cheval ne traverse pas) ; 1 sauté
//   (SAUT dans la zone d'appel) ; 2 sauté hors de la bonne zone → barre ; le 5 sauté à la place du 3 → erreur de parcours ;
//   3 à N sautés dans l'ordre (doubles enchaînés) ; arrivée en conduisant ; bilan.
//   « Recommencer » : état remis à zéro champ par champ ; 1 sauté, deux refus au 2 → élimination (règle du web) ; bilan.
//   « Recommencer » : état remis à zéro ; « Quitter l'épreuve » ; retour au monde.
// Placements (PlaceAt) seulement entre deux abords, écrits comme tels ; jamais pendant un abord ni un saut.
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesScenarioPoleRunTest, "Strides.Scenario.PoleRun", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesScenarioPoleRunTest::RunTest(const FString&)
{
	using namespace StridesScenarioTest;
	using strides::CsoStep;
	FTestWorld W(TEXT("StridesScenarioPoleRun"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	if (!TestNotNull(TEXT("activité du Pôle"), Data ? Data->CsoActivity() : nullptr)) return false;
	UStridesSaveSubsystem* Save = W.GI->GetSubsystem<UStridesSaveSubsystem>();
	if (!TestNotNull(TEXT("sauvegarde"), Save)) return false;
	Save->SlotName = TEXT("strides_test_j1_polerun");
	Save->MutableBestTimes().clear();
	FGame G;
	if (!TestTrue(TEXT("parcours, poteau, cheval monté"), G.Make(W.World, *Data))) return false;
	AStridesCourse* C = G.Course;
	FDriver D(G);
	auto Info = [this](const FString& M) { AddInfo(M); UE_LOG(LogTemp, Display, TEXT("Strides.Scenario.PoleRun : %s"), *M); };
	const std::vector<strides::CsoObstacle>& Obs = C->Obstacles();
	const int32 N = (int32)Obs.size();
	auto St = [&]() -> const strides::CsoRunState& { return C->Run()->state(); };
	auto Events = [&]() { return FString::Join(C->FenceEventLog(), TEXT(" ; ")); };
	auto Enter = [&](const TCHAR* When) -> bool
	{
		const strides::CsoActivity& A = G.Post->Activity();
		G.Horse->PlaceAt(A.startX, A.startZ + 4, PI, 0);
		G.Frame();
		G.Tap(TEXT("KeyE"));
		if (!TestTrue(FString::Printf(TEXT("%s : activité lancée par E"), When), C->MissionActive())) return false;
		G.Until([&] { return C->Screen() == AStridesCourse::EScreen::Presentation || C->DialogOpen(); }, 60);
		if (C->DialogOpen()) C->AdvanceDialog();
		G.Until([&] { return C->Screen() == AStridesCourse::EScreen::Presentation; }, 60);
		TestTrue(FString::Printf(TEXT("%s : « Entrer en piste »"), When), C->PressScreenButton(TEXT("enter")));
		return TestTrue(FString::Printf(TEXT("%s : parcours atteint"), When), G.Until([&] { return C->Run()->step() == CsoStep::Course; }));
	};
	// Placement entre deux abords : 24 m avant l'obstacle I (0..N-1), dans son axe, au galop de travail.
	// Le recul est réduit (24 → 12 m) tant qu'un autre obstacle se trouve dans le couloir d'abord (4 m de part et d'autre)
	// ou que le point de départ sort de la carrière.
	auto LineUp = [&](int32 I, double Back = 24)
	{
		D.Release();
		const strides::CsoObstacle& O = Obs[I];
		for (; Back > 12; Back -= 2)
		{
			bool bFree = true;
			for (int32 J = 0; J < N; J++)
			{
				if (J == I) continue;
				const double Sj = AlongS(O, Obs[J].x, Obs[J].z);
				const double Uj = (Obs[J].x - O.x) * O.t.x + (Obs[J].z - O.z) * O.t.z;
				if (Sj < 0 && Sj > -Back - 2 && FMath::Abs(Uj) < O.w / 2 + 4) bFree = false;
			}
			// Départ dans la carrière (la lice arrête le cheval) : 2,5 m au moins de la clôture.
			const double Px = O.x - O.n.x * Back, Pz = O.z - O.n.z * Back;
			bFree &= FMath::Abs(Px - Data->PoleArena.X) < Data->PlanArena().w / 2 - 2.5 && FMath::Abs(Pz - Data->PoleArena.Y) < Data->PlanArena().d / 2 - 2.5;
			if (bFree) break;
		}
		G.Horse->PlaceAt(O.x - O.n.x * Back, O.z - O.n.z * Back, O.rot, O.kind == "o" ? 6.5 : 5.0);
		G.Frame();
	};
	// Abord et saut de l'obstacle I : SAUT tapé à la première image où la zone d'appel vaut Want ; s'arrête quand
	// l'obstacle attendu change, à la réception, ou au bout de 8 s. Renvoie vrai si le cheval a sauté.
	// Want = Near : SAUT à la première image (zone « loin » ou « près ») où la marge prévue est négative sans être hors
	// d'atteinte (−0,28 à −0,08 m) : barre touchée.
	auto JumpAt = [&](int32 I, strides::Zone Want) -> bool
	{
		const strides::CsoObstacle& O = Obs[I];
		bool bJumped = false;
		FString Trace;
		int32 LastZone = -1;
		for (int32 K = 0; K < 240; K++)
		{
			const strides::CsoHorseState& S = G.Horse->CsoState();
			const strides::CsoTarget T = strides::csoTarget(Obs, S, G.Horse->JumpPower(), 0.0, true, Data->Jump(), Data->HorseParams());
			const int32 Zn = (int32)G.Horse->JumpTiming() * 100 + T.index;
			if (Zn != LastZone)
			{
				Trace += FString::Printf(TEXT(" [s %.1f u %.1f v %.1f zone %d cible %d marge %.2f]"), AlongS(O, S.x, S.z), (S.x - O.x) * O.t.x + (S.z - O.z) * O.t.z, S.speed,
					(int32)G.Horse->JumpTiming(), T.index, T.plan.margin);
				LastZone = Zn;
			}
			const bool bZone = Want == strides::Zone::Near ? T.index == I && (T.plan.zone == strides::Zone::Near || T.plan.zone == strides::Zone::Far) &&
															   T.plan.margin < -0.08 && T.plan.margin > -0.28
														   : G.Horse->JumpTiming() == Want;
			if (!bJumped && S.jumpT < 0 && bZone)
			{
				D.TapJump();
				bJumped = true;
				continue;
			}
			// Oxer : plus d'élan (à 5,3 m/s, l'oxer du 8 passe de « loin » à « près » sans zone bonne).
			D.Toward(O.x + O.n.x * 8, O.z + O.n.z * 8, O.kind == "o" ? 7.0 : 5.5);
			if (bJumped && S.jumpT < 0 && AlongS(O, S.x, S.z) > O.back + 3) break;
		}
		if (!bJumped) Info(FString::Printf(TEXT("%hs (%hs) : pas de SAUT ;%s"), O.label.c_str(), O.kind.c_str(), *Trace));
		return bJumped;
	};
	auto CheckFresh = [&](const TCHAR* When, int32 Attempt)
	{
		const strides::CsoRunState& S = St();
		TestEqual(FString::Printf(TEXT("%s : manche"), When), S.attempt, Attempt);
		TestEqual(FString::Printf(TEXT("%s : fautes"), When), S.faults, 0);
		TestEqual(FString::Printf(TEXT("%s : refus"), When), S.refusals, 0);
		TestEqual(FString::Printf(TEXT("%s : refus sur l'obstacle"), When), S.fenceRefusals, 0);
		TestEqual(FString::Printf(TEXT("%s : obstacle attendu"), When), S.next, 1);
		TestEqual(FString::Printf(TEXT("%s : pénalités de temps"), When), S.timeFaults, 0);
		TestEqual(FString::Printf(TEXT("%s : chrono"), When), S.t, 0.0);
		TestFalse(FString::Printf(TEXT("%s : départ non franchi"), When), S.started);
		TestFalse(FString::Printf(TEXT("%s : arrivée non franchie"), When), S.finished);
		TestFalse(FString::Printf(TEXT("%s : pas éliminé"), When), S.eliminated);
		TestTrue(FString::Printf(TEXT("%s : aucune erreur de parcours"), When), S.wrong.empty());
		TestTrue(FString::Printf(TEXT("%s : journal vide"), When), S.log.empty());
		int32 Knocked = 0;
		for (const strides::CsoFenceState& F : C->FenceStates()) Knocked += F.knocked;
		TestEqual(FString::Printf(TEXT("%s : barres sur leurs taquets"), When), Knocked, 0);
		TestEqual(FString::Printf(TEXT("%s : n° 1 surligné"), When), C->Highlight(), 1);
	};

	// ---- Manche 1 ----
	if (!Enter(TEXT("partie"))) return false;
	CheckFresh(TEXT("manche 1 (début)"), 1);
	const strides::CsoRunLine& Start = C->Run()->config().start;
	const strides::CsoRunLine& Fin = C->Run()->config().finish;
	const double SNx = FMath::Sin(Start.rot), SNz = FMath::Cos(Start.rot);
	// Placé 12 m avant la ligne de départ (entre deux abords), puis conduit : départ, abord du 1 sans SAUT.
	D.Release();
	G.Horse->PlaceAt(Start.x - SNx * 12, Start.z - SNz * 12, Start.rot, 0);
	G.Frame();
	const strides::CsoObstacle& O1 = Obs[0];
	double MaxS1 = -1e9;
	for (int32 K = 0; K < 900 && St().refusals == 0; K++)
	{
		const strides::CsoHorseState& S = G.Horse->CsoState();
		// Ligne de départ franchie en son milieu, puis l'abord du 1 (7 m avant, comme la cible du web), puis le 1.
		if (!St().started) D.Toward(Start.x + SNx * 3, Start.z + SNz * 3, 5.0);
		else if (AlongS(O1, S.x, S.z) < -9) D.Toward(O1.x - O1.n.x * 7, O1.z - O1.n.z * 7, 5.0);
		else D.Toward(O1.x + O1.n.x * 8, O1.z + O1.n.z * 8, 5.0);
		MaxS1 = FMath::Max(MaxS1, AlongS(O1, G.Horse->CsoState().x, G.Horse->CsoState().z));
	}
	TestTrue(TEXT("départ franchi en conduisant : chrono lancé"), St().started);
	TestEqual(FString::Printf(TEXT("1 abordé sans SAUT : refus compté (%s)"), *Events()), St().refusals, 1);
	TestEqual(TEXT("refus au 1 : 4 points"), St().faults, 4);
	TestEqual(TEXT("refus : obstacle attendu toujours 1"), St().next, 1);
	TestTrue(FString::Printf(TEXT("refus : le cheval ne traverse pas le 1 (centre au plus à s = %.2f m, face arrière %.2f m)"), MaxS1, O1.back), MaxS1 < O1.back);
	Info(FString::Printf(TEXT("refus au 1 : %s"), *Events()));
	// 1 sauté dans la zone d'appel.
	LineUp(0);
	TestTrue(TEXT("1 : SAUT dans la zone d'appel"), JumpAt(0, strides::Zone::Good));
	TestEqual(FString::Printf(TEXT("1 sauté : obstacle suivant 2 (%s)"), *Events()), St().next, 2);
	// 2 sauté avec une marge négative : barre.
	LineUp(1);
	JumpAt(1, strides::Zone::Near);
	TestEqual(FString::Printf(TEXT("2 sauté : obstacle suivant 3 (%s)"), *Events()), St().next, 3);
	const bool bRail = St().log.size() > 0 && St().log.back().kind == "rail";
	TestTrue(FString::Printf(TEXT("2 sauté hors de la bonne zone : barre comptée (fautes %d, %s)"), St().faults, *Events()), bRail && St().faults == 8);
	int32 Knocked = 0;
	for (const strides::CsoFenceState& F : C->FenceStates()) Knocked += F.knocked;
	TestTrue(TEXT("barre à terre (état des obstacles)"), Knocked > 0);
	// Erreur de parcours : un obstacle simple plus loin dans l'ordre (hors double) sauté alors que le 3 est attendu.
	int32 WrongI = N - 1;
	for (int32 I = 3; I < N; I++)
		if (!Obs[I].label.empty() && FChar::IsDigit(Obs[I].label.back())) { WrongI = I; break; }
	LineUp(WrongI);
	JumpAt(WrongI, strides::Zone::Good);
	TestTrue(FString::Printf(TEXT("erreur de parcours relevée au %hs (%s)"), Obs[WrongI].label.c_str(), *Events()), St().wrong.count(Obs[WrongI].num) == 1);
	TestEqual(TEXT("erreur de parcours : obstacle attendu inchangé"), St().next, 3);
	TestTrue(TEXT("erreur de parcours : message du web"), C->HudLog().ContainsByPredicate([](const FString& S) { return S.StartsWith(TEXT("toast | Erreur de parcours")); }));
	// 3 à N dans l'ordre ; l'élément B d'un double est enchaîné depuis la réception du A, sans placement.
	for (int32 I = 2; I < N; I++)
	{
		const bool bB = Obs[I].label.size() > 1 && Obs[I].label.back() == 'B';
		if (!bB) LineUp(I);
		JumpAt(I, strides::Zone::Good);
		TestEqual(FString::Printf(TEXT("%hs sauté : obstacle attendu %d (%s)"), Obs[I].label.c_str(), I + 2, *Events()), St().next, I + 2);
		if (St().next != I + 2) break;
	}
	// Arrivée en conduisant : ligne d'arrivée franchie en son milieu, dans son sens.
	{
		const double FNx = FMath::Sin(Fin.rot), FNz = FMath::Cos(Fin.rot);
		D.Release();
		// Recul réduit tant qu'un obstacle (le dernier, en général) se trouve dans le couloir avant la ligne.
		double Back = 14;
		for (; Back > 4; Back -= 1)
		{
			bool bFree = true;
			for (const strides::CsoObstacle& O : Obs)
			{
				const double Sj = (O.x - Fin.x) * FNx + (O.z - Fin.z) * FNz, Uj = (O.x - Fin.x) * FNz - (O.z - Fin.z) * FNx;
				if (Sj < 1 && Sj > -Back - 3 && FMath::Abs(Uj) < O.w / 2 + 3) bFree = false;
			}
			if (bFree) break;
		}
		G.Horse->PlaceAt(Fin.x - FNx * Back, Fin.z - FNz * Back, Fin.rot, 5.0);
		for (int32 K = 0; K < 300 && !St().finished; K++) D.Toward(Fin.x + FNx * 6, Fin.z + FNz * 6, 5.5);
		D.Release();
	}
	TestTrue(TEXT("arrivée franchie"), St().finished && !St().eliminated);
	TestTrue(TEXT("bilan affiché"), G.Until([&] { return C->Screen() == AStridesCourse::EScreen::Result; }));
	const strides::CsoRunState S1 = St();
	Info(FString::Printf(TEXT("manche 1 : %.2f s, %d points, %d refus, erreurs de parcours %d, bilan « %hs » ; %s"), S1.t, C->Run()->points(), S1.refusals,
		(int32)S1.wrong.size(), C->ResultCard().title.c_str(), *Events()));

	// ---- « Recommencer » : manche 2, 1 sauté puis deux refus au 2 = élimination ----
	TestTrue(TEXT("« Recommencer » (bilan 1)"), C->PressScreenButton(TEXT("cso-retry")));
	G.AwayFromStart(Start);
	TestTrue(TEXT("manche 2 : parcours atteint"), G.Until([&] { return C->Run()->step() == CsoStep::Course; }));
	CheckFresh(TEXT("manche 2 (après Recommencer)"), 2);
	G.CrossLine(Start);
	TestTrue(TEXT("manche 2 : départ"), St().started);
	LineUp(0);
	JumpAt(0, strides::Zone::Good);
	TestEqual(TEXT("manche 2 : 1 sauté"), St().next, 2);
	for (int32 R = 1; R <= 2 && !St().eliminated; R++)
	{
		LineUp(1);
		const strides::CsoObstacle& O = Obs[1];
		for (int32 K = 0; K < 300 && St().refusals < R; K++) D.Toward(O.x + O.n.x * 8, O.z + O.n.z * 8, 5.0);
		TestEqual(FString::Printf(TEXT("manche 2 : refus n° %d au 2"), R), St().refusals, R);
	}
	G.Frame();
	TestTrue(FString::Printf(TEXT("deux refus : éliminé (%hs)"), St().eliminatedReason.c_str()), St().eliminated);
	D.Release();
	TestTrue(TEXT("manche 2 : bilan après élimination"), G.Until([&] { return C->Screen() == AStridesCourse::EScreen::Result; }));

	// ---- « Recommencer » : manche 3, état neuf, puis « Quitter l'épreuve » ----
	TestTrue(TEXT("« Recommencer » (bilan 2)"), C->PressScreenButton(TEXT("cso-retry")));
	G.AwayFromStart(Start);
	TestTrue(TEXT("manche 3 : parcours atteint"), G.Until([&] { return C->Run()->step() == CsoStep::Course; }));
	CheckFresh(TEXT("manche 3 (après le 2e Recommencer)"), 3);
	// Lice de la carrière (world.js rectFence, colliders du web) : cheval conduit droit dessus au galop, il reste dedans.
	{
		const double Ex = Data->PoleArena.X + Data->PlanArena().w / 2;
		double Lz = Data->PoleArena.Y;
		for (double Dz = -30; Dz <= 30; Dz += 5)
		{
			bool bFree = true;
			for (const strides::CsoObstacle& O : Obs) bFree &= FMath::Abs(O.z - (Data->PoleArena.Y + Dz)) > 7 || O.x < Ex - 16;
			if (bFree) { Lz = Data->PoleArena.Y + Dz; break; }
		}
		D.Release();
		G.Horse->PlaceAt(Ex - 10, Lz, HALF_PI, 6.0);
		const int32 C0 = G.Horse->CollisionCount;
		double MaxX = -1e9;
		for (int32 K = 0; K < 150; K++)
		{
			D.Toward(Ex + 40, Lz, 7.0);
			MaxX = FMath::Max(MaxX, G.Horse->CsoState().x);
		}
		D.Release();
		TestTrue(FString::Printf(TEXT("lice : contact (%d)"), G.Horse->CollisionCount - C0), G.Horse->CollisionCount > C0);
		TestTrue(FString::Printf(TEXT("lice : le cheval reste dans la carrière (x max %.2f, lice à %.2f)"), MaxX, Ex), MaxX < Ex);
	}
	// Chandelier : abord du 1 décalé d'une demi-largeur (cheval droit sur l'aile) : repoussé, jamais au travers.
	{
		const strides::CsoObstacle& O = Obs[0];
		if (O.kind == "v" || O.kind == "o")
		{
			const double U = O.w / 2 + 0.8;
			D.Release();
			G.Horse->PlaceAt(O.x - O.n.x * 14 + O.t.x * U, O.z - O.n.z * 14 + O.t.z * U, O.rot, 5.0);
			const int32 C0 = G.Horse->CollisionCount;
			double MaxS = -1e9;
			for (int32 K = 0; K < 150; K++)
			{
				D.Toward(O.x + O.n.x * 10 + O.t.x * U, O.z + O.n.z * 10 + O.t.z * U, 5.0);
				const strides::CsoHorseState& S = G.Horse->CsoState();
				const double Ux = (S.x - O.x) * O.t.x + (S.z - O.z) * O.t.z;
				if (FMath::Abs(Ux - U) < 0.6) MaxS = FMath::Max(MaxS, AlongS(O, S.x, S.z));
			}
			D.Release();
			TestTrue(FString::Printf(TEXT("aile du 1 : contact (%d)"), G.Horse->CollisionCount - C0), G.Horse->CollisionCount > C0);
			TestTrue(FString::Printf(TEXT("aile du 1 : pas traversée dans son axe (s max %.2f)"), MaxS), MaxS < 0.5);
		}
	}
	Info(FString::Printf(TEXT("barres remises %d fois, contacts lice / ailes %d"), C->RailResets(), G.Horse->CollisionCount));
	return true;
}

// Lot J1-D (contrôle) : depuis l'écurie (point d'apparition du jeu), en ne suivant QUE le mot de la ligne de guidage du
// HUD (« à gauche » → gauche, « à droite » → droite, « tout droit » / « demi-tour » comme le ferait un joueur), au galop
// tenu au clavier, le cheval arrive à l'invite « E · Chrono » en moins de 2 min de jeu, distance décroissante.
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesWorldPoleTargetTest, "Strides.World.PoleTarget", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesWorldPoleTargetTest::RunTest(const FString&)
{
	using namespace StridesScenarioTest;
	FTestWorld W(TEXT("StridesPoleTarget"));
	const UStridesDataSubsystem* Data = W.World ? W.GI->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	if (!TestNotNull(TEXT("données"), Data)) return false;
	FGame G;
	if (!TestTrue(TEXT("parcours, poteau, cheval monté"), G.Make(W.World, *Data))) return false;
	const strides::CsoActivity& A = G.Post->Activity();
	// Écurie du Val (StridesGameMode : Data->WorldSpawn), cap nord (dos au Pôle n'est pas exigé : cap quelconque).
	G.Horse->PlaceAt(Data->WorldSpawn.X, Data->WorldSpawn.Y, 0, 0);
	G.Frame();
	FDriver D(G);
	const FVector2D Goal(A.startX, A.startZ);
	auto Dist = [&]() { return FVector2D::Distance(FVector2D(G.Horse->CsoState().x, G.Horse->CsoState().z), Goal); };
	const double D0 = Dist();
	double Worst = 0, Prev = 0;
	FVector2D PrevWay(0, 0);
	int32 Frames = 0, Turns = 0;
	bool bAligned = false;
	FString Last;
	for (; Frames < 120 * 30 && G.PC->ActionLabel().IsEmpty(); Frames++)
	{
		const FVector F = G.Horse->GetActorForwardVector();
		const FVector2D Me(G.Horse->CsoState().x, G.Horse->CsoState().z);
		const FVector2D To = Goal - Me;
		// Même calcul que le HUD (AStridesHUD::DrawHUD) : point de passage à l'entrée de la carrière, distance totale.
		const FVector2D Way = AStridesHUD::PoleWaypoint(Me, Goal, Data->PoleArena, Data->PlanArena().w, Data->PlanArena().d);
		const FString Text = AStridesHUD::PoleGuideText(FVector2D::Distance(Me, Way) + FVector2D::Distance(Way, Goal), AStridesHUD::RelativeAngleDeg(F, Way - Me));
		const bool bRight = Text.EndsWith(TEXT("à droite")), bLeft = Text.EndsWith(TEXT("à gauche")), bBack = Text.EndsWith(TEXT("demi-tour"));
		if (Text != Last && (bRight || bLeft || bBack)) Turns++;
		Last = Text;
		D.Set(TEXT("KeyD"), bRight || bBack);
		D.Set(TEXT("KeyA"), bLeft);
		const strides::CsoHorseState& S = G.Horse->CsoState();
		const double Cad = S.hasCadence ? S.cadence : S.speed;
		// Près du poteau, au pas (le cheval doit s'arrêter à l'invite) ; sinon au galop de travail.
		const double Want = To.Size() < 25 ? 2.0 : 6.5;
		D.Set(TEXT("KeyW"), !bLeft && !bRight && Cad < Want - 0.3);
		D.Set(TEXT("KeyS"), !bLeft && !bRight && Cad > Want + 0.3);
		// Distance du guidage (par l'entrée de la carrière), relevée avant le pas de l'image.
		const double Dn = FVector2D::Distance(Me, Way) + FVector2D::Distance(Way, Goal);
		bAligned |= Text.EndsWith(TEXT("tout droit"));
		if (bAligned && Frames > 0 && To.Size() > 8 && Way == PrevWay) Worst = FMath::Max(Worst, Dn - Prev);
		Prev = Dn;
		PrevWay = Way;
		G.Frame();
	}
	D.Release();
	const double Secs = Frames / 30.0;
	AddInfo(FString::Printf(TEXT("écurie → poteau : %.0f m à vol d'oiseau, %.1f s de jeu, %d changements de consigne, contacts %d"), D0, Secs, Turns, G.Horse->CollisionCount));
	UE_LOG(LogTemp, Display, TEXT("Strides.World.PoleTarget : %.0f m, %.1f s de jeu, %d consignes, contacts %d"), D0, Secs, Turns, G.Horse->CollisionCount);
	TestEqual(TEXT("invite « E · Chrono » atteinte"), G.PC->ActionLabel(), FString(TEXT("Chrono")));
	TestTrue(FString::Printf(TEXT("en moins de 2 min de jeu (%.1f s)"), Secs), Secs < 120);
	TestTrue(FString::Printf(TEXT("distance décroissante une fois le cap pris (pire remontée %.3f m par image)"), Worst), Worst < 0.05);
	return true;
}
