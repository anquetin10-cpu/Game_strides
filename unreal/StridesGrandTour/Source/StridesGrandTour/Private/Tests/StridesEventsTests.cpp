// Jalon J4 (boucle produit, unreal/docs/livraison/plan.md) : épreuves des missions cross et derby dans le moteur,
// pilotées par les entrées du joueur (touches passées au contrôleur par FeedKey : E, Espace, Z, Q, D, Maj).
//  - Strides.Events.Cross : mission « cross » acceptée → épreuve lancée par le directeur du monde ; objectif et GPS du web ;
//    arrivée au départ → dialogue de Paul fermé par E → compte à rebours (cheval bloqué) → tableau du cross ; les dix
//    obstacles fixes de Saint-Gatien sautés par le cœur du cheval (Espace en bonne zone) et jugés par les obstacles du
//    cœur (course « xc ») ; arrivée → mission payée (320 € + pourboire 5★) et réputation.
//  - Strides.Events.CrossRefusals : trois refus au trot devant le 1 → éliminé (« 3e refus sur le même obstacle ») →
//    mission échouée, rien payé, offre rendue.
//  - Strides.Events.Derby : mission « derby » → piste, dialogue de Victor, stalles (cheval placé, 5 adversaires
//    affichés), compte à rebours, course au clavier (Z tenu, Maj par à-coups, direction suivie au clavier) ; adversaires
//    déplacés par le cœur (PathAI) ; arrivée, place, dotation au prorata, réputation.
// Ce n'est NI l'autopilote (F8) NI une partie jouée à la main : la partie par entrées système (paquet) le complète.
#include "Misc/AutomationTest.h"
#include "StridesCore/SaveGame.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Engine/Canvas.h"
#include "Kismet/GameplayStatics.h"
#include "StridesActivityPost.h"
#include "StridesCore/Epreuves.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCourse.h"
#include "StridesCourseAids.h"
#include "StridesDataSubsystem.h"
#include "StridesFence.h"
#include "StridesHorse.h"
#include "StridesHUD.h"
#include "StridesPlayerController.h"
#include "StridesProgressionSubsystem.h"
#include "StridesRider.h"
#include "StridesRivalHorse.h"
#include "StridesSaveSubsystem.h"
#include "StridesUnits.h"
#include "StridesWorldDirector.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace StridesEventsTest
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

struct FGame
{
	AStridesCourse* Course = nullptr;
	AStridesHorse* Horse = nullptr;
	AStridesPlayerController* PC = nullptr;
	AStridesRider* Rider = nullptr;
	AStridesWorldDirector* Dir = nullptr;
	double Acc = 0;
	bool Make(UWorld* World, const UStridesDataSubsystem& Data)
	{
		Course = World->SpawnActor<AStridesCourse>();
		strides::CourseDesign D = Data.PoleCourse();
		D.x += Data.PoleArena.X;
		D.z += Data.PoleArena.Y;
		Course->Build(D, Data);
		// Poteau « Chrono » (le contrôleur trouve l'acteur du parcours par lui, comme en jeu).
		const strides::CsoActivity* A = Data.CsoActivity();
		if (!A) return false;
		AStridesActivityPost* Post = World->SpawnActor<AStridesActivityPost>();
		Post->Setup(*A, Course);
		Horse = World->SpawnActor<AStridesHorse>();
		Horse->Course = Course;
		Horse->PlaceAt(-104, 168, 0.35, 0);
		PC = World->SpawnActor<AStridesPlayerController>();
		Rider = World->SpawnActor<AStridesRider>(Horse->GetActorLocation() + FVector(0, 0, 90), FRotator::ZeroRotator);
		if (!PC || !Rider || !Rider->TryMount(PC) || PC->GetPawn() != Horse) return false;
		PC->SetViewCssForTest(FVector2D(844, 390));
		Dir = World->SpawnActor<AStridesWorldDirector>();
		if (!Dir) return false;
		Dir->PoleCourse = Course;
		return true;
	}
	// Une image du jeu : commandes, cheval (épreuve comprise), directeur du monde toutes les 0,25 s.
	void Frame()
	{
		PC->StepCommands(1.0 / 30);
		Horse->Tick(1.0 / 30);
		Acc += 1.0 / 30;
		if (Acc >= 0.25) { Acc = 0; Dir->Tick(0.3f); }
	}
	void Key(const TCHAR* Code, bool bDown) { PC->FeedKey(Code, bDown, false); }
	void Tap(const TCHAR* Code)
	{
		Key(Code, true);
		Frame();
		Key(Code, false);
		Frame();
	}
	const strides::EventRun* Ev() const { return Course->Event(); }
};

void PrepCareer(UStridesProgressionSubsystem* P, std::initializer_list<const TCHAR*> Done)
{
	TArray<FString> C;
	for (const TCHAR* D : Done) C.Add(D);
	P->Restore(1000, 2000, FString(), C);
}
const std::initializer_list<const TCHAR*> UpToFer = {TEXT("tuto"), TEXT("m1"), TEXT("m2"), TEXT("m3"), TEXT("groom"), TEXT("livraison"), TEXT("transport"), TEXT("fugueur"), TEXT("plage"), TEXT("fer")};

// Distance le long de l'axe de saut d'un obstacle du cross.
double Along(const strides::EventFence& F, double X, double Z) { return (X - F.x) * FMath::Sin(F.rot) + (Z - F.z) * FMath::Cos(F.rot); }
}  // namespace StridesEventsTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesEventsCrossTest, "Strides.Events.Cross", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesEventsCrossTest::RunTest(const FString&)
{
	using namespace StridesEventsTest;
	FTestWorld W(TEXT("StridesEventsCross"));
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	UStridesProgressionSubsystem* P = W.GI->GetSubsystem<UStridesProgressionSubsystem>();
	UStridesSaveSubsystem* Save = W.GI->GetSubsystem<UStridesSaveSubsystem>();
	if (!TestTrue(TEXT("sous-systèmes"), Data && P && Save && Data->Events())) return false;
	Save->SlotName = TEXT("strides_test_j4_cross");
	FGame G;
	if (!TestTrue(TEXT("jeu monté"), G.Make(W.World, *Data))) return false;
	const strides::CrossData& X = Data->Events()->cross;
	TestEqual(TEXT("10 obstacles du cross posés (course « xc »)"), G.Course->CrossFenceCount(), 10);
	for (int32 I = 0; I < G.Course->CrossFenceCount(); ++I)
	{
		AStridesFence* F = G.Course->FenceAt(G.Course->CrossFenceStart() + I);
		TestTrue(*FString::Printf(TEXT("obstacle %d : fixe, course xc"), I + 1), F && F->Course == TEXT("xc") && F->CoreObstacle().solid && F->CoreObstacle().num == I + 1);
	}
	PrepCareer(P, UpToFer);
	TestTrue(TEXT("mission « cross » acceptée (plus « À venir »)"), P->StartMission(TEXT("cross")));
	G.Dir->Tick(0.3f);
	if (!TestNotNull(TEXT("épreuve lancée par le directeur du monde"), G.Ev())) return false;
	G.Frame();
	G.Dir->Tick(0.3f);
	AddInfo(FString::Printf(TEXT("objectif « %s »"), *P->MissionStatus()));
	TestTrue(TEXT("objectif du web « Rejoins le départ du cross · … »"), P->MissionStatus().StartsWith(TEXT("Rejoins le départ du cross · ")));
	FVector2D T;
	FString L;
	TestTrue(TEXT("GPS vers le départ"), P->GuideTarget(T, L) && FVector2D::Distance(T, FVector2D(X.startX, X.startZ)) < 0.01);
	// Arrivée au départ (rayon 7 m, à cheval).
	G.Horse->PlaceAt(X.startX + 2, X.startZ, -PI / 2, 0);
	for (int32 K = 0; K < 10 && !G.Course->DialogOpen(); ++K) G.Frame();
	TestTrue(TEXT("dialogue de Paul ouvert"), G.Course->DialogOpen() && G.Course->DialogCall().args.size() == 3 && G.Course->DialogCall().args[0].s == "Paul Faure");
	TestTrue(TEXT("joueur bloqué pendant le dialogue"), G.Course->EventLocksPlayer());
	G.Tap(TEXT("KeyE"));
	TestFalse(TEXT("E : dialogue fermé"), G.Course->DialogOpen());
	// « Prends ton élan… », compte à rebours de 3 s (joueur bloqué), puis le parcours.
	int32 K = 0;
	bool bLockedCd = false;
	for (; K < 200 && G.Ev() && G.Ev()->step() != strides::EventRun::Step::XcCourse; ++K) { G.Frame(); bLockedCd |= G.Ev() && G.Ev()->step() == strides::EventRun::Step::Countdown && G.Course->EventLocksPlayer(); }
	TestTrue(TEXT("compte à rebours : joueur bloqué"), bLockedCd);
	if (!TestTrue(FString::Printf(TEXT("parcours lancé après %d images"), K), G.Ev() && G.Ev()->step() == strides::EventRun::Step::XcCourse)) return false;
	TestTrue(TEXT("chrono lancé sans ligne de départ (cross)"), G.Ev()->course().started);
	strides::CsoBoard B;
	TestTrue(TEXT("tableau du cross (accordé 110 s)"), G.Ev()->board(B) && B.ta == 110 && B.txt[1] == "/ 110 s");
	TestEqual(TEXT("objectif « Obstacle n°1 sur 10 »"), FString(UTF8_TO_TCHAR(G.Ev()->text().c_str())), FString(TEXT("Obstacle n°1 sur 10")));
	// Les dix obstacles : abord à 13 m dans l'axe au galop de concours, Espace en bonne zone (aide à l'appel du cœur).
	// Aides du cross (courses.js:188 CourseAids(game, 'xc') : pas de PARIS_COURSES.xc ni de CSO_LINE, donc pas de tracé ;
	// repère au-dessus de l'obstacle suivant et zone d'appel si l'aide au saut est « Complète »), relevées à chaque image.
	bool bAidsXc = true, bAidsSeen = false, bMark = false, bZone = false, bLine = false;
	for (const strides::EventFence& F : X.fences)
	{
		const int32 Idx = G.Course->CrossFenceStart() + F.num - 1;
		G.Horse->PlaceAt(F.x - FMath::Sin(F.rot) * 13, F.z - FMath::Cos(F.rot) * 13, F.rot, 6.2);
		bool bJ = false;
		for (K = 0; K < 300; ++K)
		{
			const strides::CsoTarget Tg = strides::csoTarget(G.Course->Obstacles(), G.Horse->CsoState(), G.Horse->JumpPower(), 0.0, true, Data->Jump(), Data->HorseParams());
			if (!bJ && G.Horse->CsoState().jumpT < 0 && Tg.index == Idx && Tg.plan.zone == strides::Zone::Good && Tg.plan.ideal <= Tg.plan.L + 0.3) { bJ = true; G.Tap(TEXT("Space")); continue; }
			G.Frame();
			if (const AStridesCourseAids* A = G.Course->CourseAids(); A && A->Active())
			{
				bAidsSeen = true;
				bAidsXc &= G.Course->AidsCourse() == TEXT("xc");
				bMark |= A->IsShown(TEXT("mark"));
				bZone |= A->IsShown(TEXT("ok")) || A->IsShown(TEXT("good"));
				bLine |= A->IsShown(TEXT("line")) || A->LineQuads() > 0;
			}
			if (bJ && G.Horse->CsoState().jumpT < 0 && Along(F, G.Horse->CsoState().x, G.Horse->CsoState().z) > 5) break;
		}
		TestTrue(*FString::Printf(TEXT("obstacle %d (%s) sauté : suivant %d, fautes %d"), F.num, UTF8_TO_TCHAR(F.kind.c_str()), G.Ev()->course().next, G.Ev()->course().faults), bJ && G.Ev()->course().next == F.num + 1);
	}
	TestTrue(TEXT("aides du cross en place pendant le parcours (course « xc »)"), bAidsSeen && bAidsXc);
	TestTrue(TEXT("aides du cross : repère au-dessus de l'obstacle suivant"), bMark);
	TestTrue(TEXT("aides du cross : zone d'appel (aide « Complète »)"), bZone);
	TestFalse(TEXT("aides du cross : pas de tracé au sol (le web n'en a pas pour 'xc')"), bLine);
	AddInfo(FString::Printf(TEXT("cross : fautes %d, refus %d, chrono %.2f s ; obstacles %s"), G.Ev()->course().faults, G.Ev()->course().refusals, G.Ev()->course().t, *FString::Join(G.Course->FenceEventLog(), TEXT(", "))));
	TestEqual(TEXT("objectif « Passe la ligne d’arrivée ! »"), FString(UTF8_TO_TCHAR(G.Ev()->text().c_str())), FString(TEXT("Passe la ligne d’arrivée !")));
	const int32 Faults = G.Ev()->course().faults;
	// Arrivée (à moins de 7 m du point d'arrivée).
	G.Horse->PlaceAt(X.finX + 2, X.finZ, -PI / 2, 2);
	for (K = 0; K < 60 && !P->ActiveMissionId.IsEmpty(); ++K) G.Frame();
	AddInfo(FString::Printf(TEXT("fin : %s"), *P->LastMessage));
	TestTrue(TEXT("mission terminée"), P->ActiveMissionId.IsEmpty() && P->CompletedMissions.Contains(TEXT("cross")));
	const int32 Pay = Faults == 0 ? 352 : 320;
	TestEqual(FString::Printf(TEXT("payée %d € (320 € %s)"), Pay, Faults == 0 ? TEXT("+ pourboire 5★") : TEXT("sans pourboire")), P->Credits, 1000 + Pay);
	TestEqual(TEXT("+350 réputation"), P->Reputation, 2350);
	TestTrue(TEXT("épreuve retirée"), G.Ev() == nullptr && !G.Course->MissionActive());
	TestTrue(TEXT("aides du cross retirées après l'épreuve"), !G.Course->CourseAids() || !G.Course->CourseAids()->Active());
	TestTrue(TEXT("derby proposé ensuite"), P->OfferLock(TEXT("derby")).IsEmpty());
	UGameplayStatics::DeleteGameInSlot(Save->SlotName, 0);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesEventsCrossRefusalsTest, "Strides.Events.CrossRefusals", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesEventsCrossRefusalsTest::RunTest(const FString&)
{
	using namespace StridesEventsTest;
	FTestWorld W(TEXT("StridesEventsCrossRefusals"));
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	UStridesProgressionSubsystem* P = W.GI->GetSubsystem<UStridesProgressionSubsystem>();
	if (!TestTrue(TEXT("sous-systèmes"), Data && P && Data->Events())) return false;
	FGame G;
	if (!TestTrue(TEXT("jeu monté"), G.Make(W.World, *Data))) return false;
	const strides::CrossData& X = Data->Events()->cross;
	PrepCareer(P, UpToFer);
	TestTrue(TEXT("mission « cross » acceptée"), P->StartMission(TEXT("cross")));
	G.Dir->Tick(0.3f);
	G.Horse->PlaceAt(X.startX + 2, X.startZ, -PI / 2, 0);
	for (int32 K = 0; K < 20 && !G.Course->DialogOpen(); ++K) G.Frame();
	G.Tap(TEXT("KeyE"));
	for (int32 K = 0; K < 200 && G.Ev() && G.Ev()->step() != strides::EventRun::Step::XcCourse; ++K) G.Frame();
	if (!TestTrue(TEXT("parcours lancé"), G.Ev() && G.Ev()->step() == strides::EventRun::Step::XcCourse)) return false;
	// Trois présentations au trot lent (2,6 m/s) devant le tronc n° 1 : refus du cœur (obstacles.js), +20 chacun.
	const strides::EventFence& F = X.fences[0];
	FString Last;
	for (int32 R = 0; R < 3 && G.Ev(); ++R)
	{
		const int32 Before = G.Ev()->course().refusals;
		G.Horse->PlaceAt(F.x - FMath::Sin(F.rot) * 8, F.z - FMath::Cos(F.rot) * 8, F.rot, 2.6);
		for (int32 K = 0; K < 200 && G.Ev() && G.Ev()->course().refusals == Before && !G.Ev()->finished(); ++K) G.Frame();
		if (G.Ev()) AddInfo(FString::Printf(TEXT("présentation %d : refus %d, fautes %d"), R + 1, G.Ev()->course().refusals, G.Ev()->course().faults));
	}
	for (int32 K = 0; K < 30 && !P->ActiveMissionId.IsEmpty(); ++K) G.Frame();
	AddInfo(FString::Printf(TEXT("fin : %s ; obstacles %s"), *P->LastMessage, *FString::Join(G.Course->FenceEventLog(), TEXT(", "))));
	TestTrue(TEXT("mission échouée"), P->ActiveMissionId.IsEmpty() && !P->CompletedMissions.Contains(TEXT("cross")) && P->FailCount == 1);
	TestTrue(TEXT("raison du web « 3e refus sur le même obstacle : éliminé du parcours. »"), P->LastMessage.Contains(TEXT("3e refus sur le même obstacle : éliminé du parcours.")));
	TestEqual(TEXT("rien payé"), P->Credits, 1000);
	TestTrue(TEXT("offre rendue (acceptable à nouveau)"), P->OfferLock(TEXT("cross")).IsEmpty() && P->StartMission(TEXT("cross")));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesEventsDerbyTest, "Strides.Events.Derby", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesEventsDerbyTest::RunTest(const FString&)
{
	using namespace StridesEventsTest;
	FTestWorld W(TEXT("StridesEventsDerby"));
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	UStridesProgressionSubsystem* P = W.GI->GetSubsystem<UStridesProgressionSubsystem>();
	if (!TestTrue(TEXT("sous-systèmes"), Data && P && Data->Events())) return false;
	FGame G;
	if (!TestTrue(TEXT("jeu monté"), G.Make(W.World, *Data))) return false;
	const strides::RaceData& R = Data->Events()->race;
	PrepCareer(P, {TEXT("tuto"), TEXT("m1"), TEXT("m2"), TEXT("m3"), TEXT("groom"), TEXT("livraison"), TEXT("transport"), TEXT("fugueur"), TEXT("plage"), TEXT("fer"), TEXT("cross")});
	TestTrue(TEXT("mission « derby » acceptée"), P->StartMission(TEXT("derby")));
	G.Dir->Tick(0.3f);
	if (!TestNotNull(TEXT("épreuve lancée"), G.Ev())) return false;
	G.Horse->PlaceAt(R.meetX + 2, R.meetZ, PI / 2, 0);
	for (int32 K = 0; K < 20 && !G.Course->DialogOpen(); ++K) G.Frame();
	TestTrue(TEXT("dialogue de Victor"), G.Course->DialogOpen() && G.Course->DialogCall().args[0].s == "Victor Girard");
	G.Tap(TEXT("KeyE"));
	for (int32 K = 0; K < 10 && G.Ev()->step() != strides::EventRun::Step::RaceSetup; ++K) G.Frame();
	G.Frame();
	const double StallZ = R.hippo.z - strides::stallRadius(R.hippo, R.playerStall);
	AddInfo(FString::Printf(TEXT("stalles : cheval en (%.2f, %.2f), %d adversaires affichés"), G.Horse->WebX(), G.Horse->WebZ(), G.Course->RivalActors().Num()));
	TestTrue(TEXT("cheval placé dans la stalle n° 3"), FMath::Abs(G.Horse->WebZ() - StallZ) < 0.05);
	TestEqual(TEXT("5 adversaires affichés"), G.Course->RivalActors().Num(), 5);
	int32 K = 0;
	for (; K < 300 && G.Ev() && G.Ev()->step() != strides::EventRun::Step::Race; ++K) G.Frame();
	if (!TestTrue(TEXT("départ donné"), G.Ev() && G.Ev()->step() == strides::EventRun::Step::Race)) return false;
	// Course au clavier : Z tenu (cadence), direction vers un point 14 m devant sur l'ovale du couloir, Maj par à-coups
	// (BOOST tant que l'endurance dépasse 40 %, relâché sous 10 %).
	const double Lane = strides::stallRadius(R.hippo, R.playerStall);
	G.Key(TEXT("KeyW"), true);
	bool bBoost = false, bKeyL = false, bKeyR = false;
	double MaxSpeed = 0;
	for (K = 0; K < 30 * 150 && G.Ev() && !G.Ev()->finished(); ++K)
	{
		double S, Off;
		strides::ovalProject(R.hippo, G.Horse->WebX(), G.Horse->WebZ(), S, Off);
		double Ax, Az;
		strides::ovalPoint(R.hippo, S + 14, Lane, Ax, Az);
		const double Want = FMath::Atan2(Ax - G.Horse->WebX(), Az - G.Horse->WebZ());
		const double D = strides::wrapAngle(Want - G.Horse->Heading());
		// Direction (steerRate du web : x > 0 tourne vers les caps décroissants).
		const bool L = D > 0.04, Rr = D < -0.04;
		if (L != bKeyL) { G.Key(TEXT("KeyA"), L); bKeyL = L; }
		if (Rr != bKeyR) { G.Key(TEXT("KeyD"), Rr); bKeyR = Rr; }
		const double St = G.Horse->Stamina().v;
		const bool Want2 = bBoost ? St > 10 : St > 40;
		if (Want2 != bBoost) { G.Key(TEXT("ShiftLeft"), Want2); bBoost = Want2; }
		G.Frame();
		MaxSpeed = FMath::Max(MaxSpeed, G.Horse->CsoState().speed);
	}
	G.Key(TEXT("KeyW"), false);
	G.Key(TEXT("ShiftLeft"), false);
	G.Key(TEXT("KeyA"), false);
	G.Key(TEXT("KeyD"), false);
	for (int32 J = 0; J < 30 && !P->ActiveMissionId.IsEmpty(); ++J) G.Frame();
	AddInfo(FString::Printf(TEXT("course : %d images, vitesse max %.1f m/s, fin « %s »"), K, MaxSpeed, *P->LastMessage));
	TestTrue(TEXT("grand galop atteint (BOOST)"), MaxSpeed > 12.0);
	TestTrue(TEXT("mission finie (réussie ou échouée selon la place)"), P->ActiveMissionId.IsEmpty());
	if (P->CompletedMissions.Contains(TEXT("derby")))
	{
		TestTrue(TEXT("dotation au prorata de la place (420 / 250 / 150 €, pourboire 5★ aux deux premières places)"), P->Credits == 1000 + 462 || P->Credits == 1000 + 275 || P->Credits == 1000 + 150);
		TestEqual(TEXT("+400 réputation"), P->Reputation, 2400);
	}
	else TestTrue(TEXT("échec expliqué (« Il faut finir dans le top 3 » ou « Course terminée sans toi »)"), P->LastMessage.Contains(TEXT("top 3")) || P->LastMessage.Contains(TEXT("sans toi")));
	TestTrue(TEXT("adversaires retirés"), G.Course->RivalActors().Num() == 0);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesChallengePoleTest, "Strides.Challenge.Pole", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesChallengePoleTest::RunTest(const FString&)
{
	// Jalon J4-D : défi du Pôle (v6) lancé par l'app Activités du téléphone (« Règles et départ », touches du joueur) ;
	// départ derrière la ligne, à cheval, cheval fourni (saut 1,06), heure du défi tenue ; ligne de départ, obstacles du
	// parcours sautés (Espace en bonne zone), ligne d'arrivée → résultat, record écrit dans la sauvegarde (emplacement de
	// test), carte du défi mise à jour ; 2e tentative éliminée (cavalier descendu) : pas de record, 2 tentatives.
	using namespace StridesEventsTest;
	FTestWorld W(TEXT("StridesChallengePole"));
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	UStridesProgressionSubsystem* P = W.GI->GetSubsystem<UStridesProgressionSubsystem>();
	UStridesSaveSubsystem* Save = W.GI->GetSubsystem<UStridesSaveSubsystem>();
	if (!TestTrue(TEXT("sous-systèmes"), Data && P && Save && Data->Challenges())) return false;
	Save->SlotName = TEXT("strides_test_j4_defi");
	UGameplayStatics::DeleteGameInSlot(Save->SlotName, 0);
	Save->ChallengeRecords.clear();
	P->Restore(0, 0, FString(), {});
	FGame G;
	if (!TestTrue(TEXT("jeu monté"), G.Make(W.World, *Data))) return false;
	FActorSpawnParameters Sp;
	Sp.Owner = G.PC;
	AStridesHUD* Hud = W.World->SpawnActor<AStridesHUD>(Sp);
	Hud->PlayerOwner = G.PC;
	G.PC->MyHUD = Hud;
	UCanvas* Toile = NewObject<UCanvas>();
	Toile->SizeX = 1280;
	Toile->SizeY = 800;
	auto Draw = [&] { Hud->SetCanvasForTest(Toile); Hud->DrawHUD(); };
	auto Index = [&](const FString& Id) { for (int32 I = 0; I < Hud->PhoneItems().Num(); ++I) if (Hud->PhoneItems()[I].Id == Id) return I; return -1; };
	auto Choose = [&](const FString& Id)
	{
		Draw();
		const int32 Want = Index(Id);
		if (Want < 0) return false;
		for (int32 K = 0; K < 40 && G.PC->PhoneSelection() != Want; ++K) { G.Tap(G.PC->PhoneSelection() < Want ? TEXT("ArrowRight") : TEXT("ArrowLeft")); Draw(); }
		if (G.PC->PhoneSelection() != Want) return false;
		G.Tap(TEXT("Enter"));
		Draw();
		return true;
	};
	const strides::ChallengeConfig* Cfg = Data->Challenges()->find(Data->Challenges()->current);
	if (!TestNotNull(TEXT("défi courant"), Cfg)) return false;
	const FString Item = FString(TEXT("challenge:")) + UTF8_TO_TCHAR(Cfg->id.c_str());
	auto Launch = [&]
	{
		G.Tap(TEXT("KeyP"));
		Draw();
		return Choose(TEXT("app:activities")) && Index(Item) >= 0 && Choose(Item);
	};
	TestTrue(TEXT("app Activités : carte du défi, « Règles et départ »"), Launch());
	TestTrue(TEXT("défi lancé, téléphone rangé"), G.Course->ChallengeActive() && !G.PC->IsPhoneOpen());
	TestTrue(TEXT("cheval fourni : saut 1,06"), FMath::Abs(G.Horse->JumpMulOverride - 1.06) < 1e-9);
	const strides::CsoRunConfig& RC = G.Course->Run()->config();
	TestTrue(TEXT("règles du défi : 64 s accordées, 2 refus, sans présentation ni bilan"), RC.timeAllowed == Cfg->timeAllowed && RC.maxRefusals == 2 && !RC.present && !RC.result);
	// Entrée en piste et cloche.
	int32 K = 0;
	for (; K < 400 && G.Course->Run()->step() != strides::CsoStep::Course; ++K) G.Frame();
	if (!TestTrue(TEXT("parcours du défi (cloche passée)"), G.Course->Run()->step() == strides::CsoStep::Course)) return false;
	TestTrue(TEXT("heure du défi tenue (jour 2, 11 h)"), FMath::Abs(Save->GameTime - (2 * 86400.0 + 11 * 3600.0)) < 1e-6);
	TestTrue(TEXT("hauteur unique 1,10 m"), G.Course->FenceHeights().size() > 0 && FMath::Abs(G.Course->FenceHeights()[0] - 1.1) < 1e-9);
	// Ligne de départ franchie au galop, dans son sens.
	const strides::CsoRunLine& S0 = RC.start;
	G.Horse->PlaceAt(S0.x - FMath::Sin(S0.rot) * 4, S0.z - FMath::Cos(S0.rot) * 4, S0.rot, 6.2);
	for (K = 0; K < 60 && !G.Course->Run()->state().started; ++K) G.Frame();
	TestTrue(TEXT("chrono lancé à la ligne de départ"), G.Course->Run()->state().started);
	// Obstacles du parcours dans l'ordre (cœur : abord à 13 m dans l'axe, Espace en bonne zone).
	for (int32 I = 0; I < G.Course->CourseFenceCount(); ++I)
	{
		const strides::CsoObstacle& O = G.Course->Obstacles()[I];
		// Élément B d'une combinaison : enchaîné depuis l'élément A, sans replacer le cheval.
		if (O.label.empty() || O.label.back() != 'B') G.Horse->PlaceAt(O.x - O.n.x * 13, O.z - O.n.z * 13, O.rot, 6.2);
		bool bJ = false;
		for (K = 0; K < 300; ++K)
		{
			const strides::CsoTarget Tg = strides::csoTarget(G.Course->Obstacles(), G.Horse->CsoState(), G.Horse->JumpPower(), 0.0, true, Data->Jump(), Data->HorseParams());
			if (!bJ && G.Horse->CsoState().jumpT < 0 && Tg.index == I && Tg.plan.zone == strides::Zone::Good && Tg.plan.ideal <= Tg.plan.L + 0.3) { bJ = true; G.Tap(TEXT("Space")); continue; }
			G.Frame();
			if (bJ && G.Horse->CsoState().jumpT < 0 && G.Course->Run()->state().next > O.num) break;
		}
	}
	AddInfo(FString::Printf(TEXT("défi : suivant %d / %d, fautes %d, chrono %.2f s ; obstacles %s"), G.Course->Run()->state().next, G.Course->CourseFenceCount(), G.Course->Run()->state().faults, G.Course->Run()->state().t, *FString::Join(G.Course->FenceEventLog(), TEXT(", "))));
	const strides::CsoRunLine& F0 = RC.finish;
	G.Horse->PlaceAt(F0.x - FMath::Sin(F0.rot) * 4, F0.z - FMath::Cos(F0.rot) * 4, F0.rot, 6.2);
	for (K = 0; K < 200 && G.Course->ChallengeActive(); ++K) G.Frame();
	TestFalse(TEXT("tentative terminée"), G.Course->ChallengeActive());
	AddInfo(FString::Printf(TEXT("fin : %s"), *P->LastMessage));
	const auto It = Save->ChallengeRecords.find(Cfg->id);
	TestTrue(TEXT("record écrit"), It != Save->ChallengeRecords.end() && It->second.hasBest && It->second.attempts == 1 && P->LastMessage.Contains(TEXT("Nouveau record")));
	TestTrue(TEXT("cheval du joueur rendu"), G.Horse->JumpMulOverride < 0);
	{
		strides::SaveGame Core;
		UStridesSaveGame* SG = Cast<UStridesSaveGame>(UGameplayStatics::LoadGameFromSlot(Save->SlotName, 0));
		std::string E;
		TestTrue(TEXT("record relu dans l'emplacement"), SG && strides::SaveGame::fromJson(TCHAR_TO_UTF8(*SG->Json), Core, E) && Core.challenges.count(Cfg->id) && Core.challenges[Cfg->id].hasBest);
	}
	G.Tap(TEXT("KeyP"));
	Draw();
	Choose(TEXT("app:activities"));
	Draw();
	const FString Texts = FString::Join(Hud->PhoneTexts(), TEXT(" | "));
	TestTrue(FString::Printf(TEXT("carte : « Record : … » (%s)"), *Texts.Left(300)), Texts.Contains(TEXT("Record : ")) && Texts.Contains(TEXT("1 tentative")));
	// 2e tentative : cavalier descendu → éliminé, pas de record.
	TestTrue(TEXT("2e tentative lancée"), Index(Item) >= 0 && Choose(Item) && G.Course->ChallengeActive());
	for (K = 0; K < 400 && G.Course->Run()->step() != strides::CsoStep::Course; ++K) G.Frame();
	G.Tap(TEXT("KeyE"));  // descendre (à l'arrêt)
	for (K = 0; K < 200 && G.Course->ChallengeActive(); ++K) G.Frame();
	AddInfo(FString::Printf(TEXT("2e tentative : %s"), *P->LastMessage));
	TestTrue(TEXT("2e tentative : éliminé, record gardé, 2 tentatives"), !G.Course->ChallengeActive() && Save->ChallengeRecords[Cfg->id].attempts == 2 && Save->ChallengeRecords[Cfg->id].hasBest && P->LastMessage.Contains(TEXT("Éliminé")));
	UGameplayStatics::DeleteGameInSlot(Save->SlotName, 0);
	return true;
}

#endif
