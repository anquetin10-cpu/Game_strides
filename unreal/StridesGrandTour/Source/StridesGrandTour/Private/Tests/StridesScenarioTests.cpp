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
