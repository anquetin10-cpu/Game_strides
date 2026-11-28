// Jalon J4 (correction après contrôle adverse) : Grand Prix de Paris Indoor dans le moteur (StridesCore/Paris sur
// l'acteur du parcours, arène de Paris, autoroute A13, cartes du HUD), mission « gpparis » de bout en bout.
//  - Strides.Events.Paris : mission acceptée (plus « À venir ») → dialogue de Margot (E) → descendre, monter au volant
//    du camion (le cheval embarque) → bretelle de l'A13 → carte « Direction Paris » (Entrée) → camion à Paris (+2 h 10,
//    gazole) → descendre (le cheval descend) → accréditation (E à la tente) → dialogue → monter → deux sauts au paddock
//    → Sprint (porte des cavaliers, carte de présentation, entrée en piste, cloche, ligne de départ, obstacles sautés
//    par le cœur du cheval, arrivée) → classement du Sprint (carte) → présentation des cavaliers à 20 h → dialogue →
//    Grand Prix → barrage s'il y a lieu → podium (carte) → mission payée, réputation, histoire terminée.
// Test FONCTIONNEL : le cheval est posé devant chaque obstacle et chaque ligne (PlaceAt) et Espace est donnée au bon
// moment calculé par le cœur. Ce n'est NI l'autopilote (F8) NI une partie jouée : la partie par entrées système dans
// le paquet le complète.
#include "Misc/AutomationTest.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "StridesActivityPost.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCore/Paris.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesFence.h"
#include "StridesHorse.h"
#include "StridesPlayerController.h"
#include "StridesProgressionSubsystem.h"
#include "StridesRider.h"
#include "StridesSaveSubsystem.h"
#include "StridesUnits.h"
#include "StridesVehicle.h"
#include "StridesWorldDirector.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace StridesParisTest
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
	AStridesVehicle* Truck = nullptr;
	double Acc = 0;
	bool Make(UWorld* World, const UStridesDataSubsystem& Data)
	{
		Course = World->SpawnActor<AStridesCourse>();
		strides::CourseDesign D = Data.PoleCourse();
		D.x += Data.PoleArena.X;
		D.z += Data.PoleArena.Y;
		Course->Build(D, Data);
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
		Truck = World->SpawnActor<AStridesVehicle>();
		if (!Truck || !Truck->Init(Data, TEXT("truck"), -96, 160, 0.35, FLinearColor(.12f, .16f, .3f), -1)) return false;
		Dir = World->SpawnActor<AStridesWorldDirector>();
		if (!Dir) return false;
		Dir->PoleCourse = Course;
		return true;
	}
	// Une image : commandes, pion (cheval, camion), parcours (Grand Prix de Paris, A13), directeur toutes les 0,25 s.
	void Frame()
	{
		PC->StepCommands(1.0 / 30);
		if (PC->GetPawn() == Horse) Horse->Tick(1.0 / 30);
		else if (PC->GetPawn() == Truck) Truck->StepSim(1.0 / 30);
		Course->Tick(1.0 / 30);
		Acc += 1.0 / 30;
		if (Acc >= 0.25) { Acc = 0; Dir->Tick(0.3f); }
	}
	void Tap(const TCHAR* Code)
	{
		PC->FeedKey(Code, true, false);
		Frame();
		PC->FeedKey(Code, false, false);
		Frame();
	}
	const strides::ParisRun* R() const { return Course->Paris(); }
	FString Text() const { return R() ? FString(UTF8_TO_TCHAR(R()->text().c_str())) : FString(); }
	bool Until(TFunctionRef<bool()> Done, int32 Max)
	{
		for (int32 K = 0; K < Max; K++)
		{
			if (Done()) return true;
			Frame();
		}
		return Done();
	}
};

double Along(double Fx, double Fz, double Rot, double X, double Z) { return (X - Fx) * FMath::Sin(Rot) + (Z - Fz) * FMath::Cos(Rot); }

// Saute l'obstacle d'indice Idx du cœur : abord à 13 m dans l'axe au galop de concours, Espace quand le cœur donne la
// bonne zone ; rend vrai si le saut a eu lieu.
bool JumpFence(FGame& G, const UStridesDataSubsystem& Data, int32 Idx)
{
	const strides::CsoObstacle& O = G.Course->Obstacles()[(size_t)Idx];
	// Second élément d'une combinaison (« 2B ») : le cheval enchaîne depuis le « A » (une ou deux foulées), sans être posé.
	const bool bB = !O.label.empty() && O.label.back() == 'B';
	if (!bB) G.Horse->PlaceAt(O.x - FMath::Sin(O.rot) * 13, O.z - FMath::Cos(O.rot) * 13, O.rot, 6.4);
	bool bJ = false;
	double Prev = -1e9;
	for (int32 K = 0; K < 300; ++K)
	{
		const strides::CsoTarget Tg = strides::csoTarget(G.Course->Obstacles(), G.Horse->CsoState(), G.Horse->JumpPower(), 0.0, true, Data.Jump(), Data.HorseParams());
		// Bonne zone ; sinon (obstacle au-delà de la bonne zone du cheval) l'appel à la meilleure marge (elle redescend).
		const bool bAim = Tg.index == Idx && Tg.plan.zone != strides::Zone::Refuse && Tg.plan.zone != strides::Zone::None;
		const bool bGo = bAim && (Tg.plan.zone == strides::Zone::Good ? Tg.plan.ideal <= Tg.plan.L + 0.3 : (Tg.plan.hasMargin && Tg.plan.margin < Prev));
		if (bAim && Tg.plan.hasMargin) Prev = Tg.plan.margin;
		if (!bJ && G.Horse->CsoState().jumpT < 0 && bGo) { bJ = true; G.Tap(TEXT("Space")); continue; }
		G.Frame();
		if (bJ && G.Horse->CsoState().jumpT < 0 && Along(O.x, O.z, O.rot, G.Horse->CsoState().x, G.Horse->CsoState().z) > 1.5) break;
	}
	return bJ;
}

// Franchit une ligne orientée (départ, arrivée) : cheval posé 6 m avant, au galop dans le sens de la ligne.
bool CrossLine(FGame& G, const strides::CsoRunLine& L, TFunctionRef<bool()> Done)
{
	G.Horse->PlaceAt(L.x - FMath::Sin(L.rot) * 6, L.z - FMath::Cos(L.rot) * 6, L.rot, 5.5);
	return G.Until(Done, 120);
}

// Une manche (Sprint, Grand Prix, barrage) : porte des cavaliers, présentation (Entrée), entrée en piste, cloche,
// départ, obstacles du tracé en piste, arrivée.
bool PlayRound(FAutomationTestBase& T, FGame& G, const UStridesDataSubsystem& Data, const strides::ParisCourseData& C, bool bPresent, const TCHAR* Name)
{
	const strides::ParisGpData& PD = *Data.Paris();
	G.Horse->PlaceAt(PD.site.gate.x - 3, PD.site.gate.z, PI / 2, 0);
	// Contrôle de capacité (dialogue de l'entraîneur si les obstacles sont hors de portée du cheval engagé) : E.
	G.Until([&] { return G.Course->ParisCardOpen() || G.Course->DialogOpen() || (G.R()->round() && G.R()->round()->step() == strides::CsoStep::Entrance); }, 120);
	if (G.Course->DialogOpen())
	{
		T.AddInfo(FString::Printf(TEXT("%s : entraîneur « %s »"), Name, UTF8_TO_TCHAR(G.Course->DialogCall().args[2].s.c_str())));
		G.Tap(TEXT("KeyE"));
	}
	if (bPresent)
	{
		if (!T.TestTrue(FString::Printf(TEXT("%s : carte de présentation"), Name), G.Until([&] { return G.Course->ParisCardOpen(); }, 120))) return false;
		const strides::ParisCard* Card = G.Course->ParisCard();
		T.AddInfo(FString::Printf(TEXT("%s : présentation « %s » · %s"), Name, UTF8_TO_TCHAR(Card->title.c_str()), Card->rows.size() > 4 ? UTF8_TO_TCHAR(Card->rows[4].second.c_str()) : TEXT("")));
		G.Tap(TEXT("Enter"));
		T.TestFalse(FString::Printf(TEXT("%s : Entrée → en piste"), Name), G.Course->ParisCardOpen());
	}
	// Entrée en piste (2,4 s), cloche, puis l'étape de parcours.
	if (!T.TestTrue(FString::Printf(TEXT("%s : étape de parcours"), Name), G.Until([&] { return G.R()->round() && G.R()->round()->step() == strides::CsoStep::Course; }, 200))) return false;
	T.TestTrue(FString::Printf(TEXT("%s : mode de concours (caméra, commandes)"), Name), G.Course->CourseMode().active && G.Course->Run() == G.R()->round());
	if (!T.TestTrue(FString::Printf(TEXT("%s : ligne de départ franchie"), Name), CrossLine(G, C.start, [&] { return G.R()->round() && G.R()->round()->state().started; }))) return false;
	const int32 First = G.Course->ParisFenceStart(UTF8_TO_TCHAR(C.id.c_str()));
	for (int32 I = 0; I < (int32)C.fences.size(); I++)
	{
		if (!G.R()->round()) break;
		const bool bJ = JumpFence(G, Data, First + I);
		const strides::CsoRun* Rd = G.R()->round();
		T.TestTrue(FString::Printf(TEXT("%s : obstacle %s sauté (suivant %d, fautes %d)"), Name, UTF8_TO_TCHAR(C.fences[(size_t)I].label.c_str()), Rd ? Rd->state().next : -1, Rd ? Rd->state().faults : -1), bJ && Rd && Rd->state().next == I + 2);
	}
	const strides::CsoRun* Rd = G.R()->round();
	if (Rd) T.AddInfo(FString::Printf(TEXT("%s : fautes %d, refus %d, chrono %.2f s"), Name, Rd->state().faults, Rd->state().refusals, Rd->state().t));
	return T.TestTrue(FString::Printf(TEXT("%s : arrivée franchie"), Name), CrossLine(G, C.finish, [&] { return !G.R()->round() || G.R()->round()->state().finished; }));
}
}  // namespace StridesParisTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesEventsParisTest, "Strides.Events.Paris", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesEventsParisTest::RunTest(const FString&)
{
	using namespace StridesParisTest;
	FTestWorld W(TEXT("StridesEventsParis"));
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	UStridesProgressionSubsystem* P = W.GI->GetSubsystem<UStridesProgressionSubsystem>();
	UStridesSaveSubsystem* Save = W.GI->GetSubsystem<UStridesSaveSubsystem>();
	if (!TestTrue(TEXT("sous-systèmes et données de Paris"), Data && P && Save && Data->Paris() && Data->Events())) return false;
	Save->SlotName = TEXT("strides_test_j4_paris");
	Save->bAutoSave = false;
	const strides::ParisGpData& PD = *Data->Paris();
	FGame G;
	if (!TestTrue(TEXT("jeu monté (cheval, cavalier, camion)"), G.Make(W.World, *Data))) return false;
	TestEqual(TEXT("obstacles de Paris posés (7 + 9 + 2)"), G.Course->ParisFenceCount(), 18);
	TestEqual(TEXT("tracé du Grand Prix en piste hors épreuve"), G.Course->ParisShownCourse(), FString(TEXT("paris_gp")));
	TestTrue(TEXT("sol de Paris plat (dalle à 12 m, sable de la piste + 9 cm)"), FMath::Abs(Data->TerrainHeight(PD.site.x, PD.site.z) - (PD.site.y + 0.09)) < 1e-6);
	TArray<FString> Done = {TEXT("tuto"), TEXT("m1"), TEXT("m2"), TEXT("m3"), TEXT("groom"), TEXT("livraison"), TEXT("transport"), TEXT("fugueur"), TEXT("plage"), TEXT("fer"), TEXT("cross"), TEXT("pension"), TEXT("derby"), TEXT("csi3"), TEXT("gp")};
	P->Restore(1000, 30000, FString(), Done);
	TestTrue(TEXT("Grand Prix de Paris proposé (plus « À venir »)"), P->OfferLock(TEXT("gpparis")).IsEmpty());
	if (!TestTrue(TEXT("mission « gpparis » acceptée"), P->StartMission(TEXT("gpparis")))) return false;
	G.Dir->Tick(0.3f);
	if (!TestNotNull(TEXT("Grand Prix lancé par le directeur du monde"), G.R())) return false;
	// Invitation : trois répliques de Margot, E à chaque fois.
	int32 Lines = 0;
	for (int32 K = 0; K < 5 && G.Course->DialogOpen(); K++)
	{
		if (Lines == 0) TestTrue(TEXT("Margot Delaunay"), G.Course->DialogCall().args.size() == 3 && G.Course->DialogCall().args[0].s == "Margot Delaunay · Grand Prix de Paris Indoor");
		Lines++;
		G.Tap(TEXT("KeyE"));
	}
	TestEqual(TEXT("3 répliques d'invitation"), Lines, 3);
	G.Frame();
	AddInfo(FString::Printf(TEXT("après l'invitation : « %s »"), *G.Text()));
	TestTrue(TEXT("consigne de chargement (à cheval)"), G.Text().StartsWith(TEXT("Descends de ")));
	// Descendre (E à l'arrêt), puis monter au volant du camion : le cheval laissé à moins de 15 m embarque.
	G.Tap(TEXT("KeyE"));
	TestTrue(TEXT("à pied"), G.PC->GetPawn() == G.Rider);
	G.Frame();
	TestTrue(TEXT("consigne « Monte au volant du camion : … embarque avec toi »"), G.Text().StartsWith(TEXT("Monte au volant du camion : ")));
	// Cheval laissé à 7 m de la portière (hors de portée de « Monter » à cheval, à moins de 15 m du camion).
	const FVector2D Door = G.Truck->DoorWeb();
	const FVector2D Away = Door + (Door - G.Truck->WebPos()).GetSafeNormal() * 7.0;
	G.Horse->PlaceAt(Away.X, Away.Y, 0, 0);
	G.Rider->SetActorLocation(StridesUnits::WebToUE(Door.X, Data->TerrainHeight(Door.X, Door.Y) + 0.9, Door.Y));
	G.Tap(TEXT("KeyE"));
	if (!TestTrue(TEXT("au volant, cheval embarqué"), G.PC->GetPawn() == G.Truck && G.Truck->CarriesHorse())) return false;
	G.Frame();
	AddInfo(FString::Printf(TEXT("au volant : « %s »"), *G.Text()));
	TestTrue(TEXT("« Roule jusqu’à l’autoroute A13 — au bout de la route Est-Ouest »"), G.Text() == TEXT("Roule jusqu’à l’autoroute A13 — au bout de la route Est-Ouest"));
	// Bretelle de l'A13 : camion arrêté dessus → proposition de trajet.
	G.Truck->PlaceAt(PD.a13.deauville.x - 2, PD.a13.deauville.z, PI / 2);
	G.Until([&] { return G.Course->ActiveCardOpen(); }, 30);
	AStridesCourse::FCardView V;
	if (!TestTrue(TEXT("carte « Direction Paris »"), G.Course->ActiveCard(V) && V.Title == TEXT("Direction Paris"))) return false;
	AddInfo(FString::Printf(TEXT("A13 : %s"), *V.Body));
	TestEqual(TEXT("bouton choisi : « Partir pour Paris »"), G.Course->CardSelectedId(), FString(TEXT("travel-go")));
	const double Time0 = Save->GameTime;
	const double Fuel0 = G.Truck->Sim.fuelL;
	G.Tap(TEXT("Enter"));
	TestTrue(TEXT("camion au parking de Paris"), Data->InParis(G.Truck->WebPos().X) && FVector2D::Distance(G.Truck->WebPos(), FVector2D(PD.a13.arriveParis.x, PD.a13.arriveParis.z)) < 1.0);
	TestTrue(TEXT("+2 h 10 de route, 46 l de gazole"), FMath::Abs(Save->GameTime - Time0 - 130 * 60) < 1 && FMath::Abs(Fuel0 - G.Truck->Sim.fuelL - 46) < 0.5);
	TestTrue(TEXT("carte « Bienvenue à Paris »"), G.Course->ActiveCard(V) && V.Title == TEXT("Bienvenue à Paris"));
	G.Tap(TEXT("Enter"));
	TestFalse(TEXT("carte refermée"), G.Course->ActiveCardOpen());
	G.Until([&] { return G.Text().StartsWith(TEXT("Gare-toi et descends du camion")); }, 30);
	TestTrue(TEXT("« Gare-toi et descends du camion (ACTION à l’arrêt) »"), G.Text().StartsWith(TEXT("Gare-toi et descends du camion")));
	G.Tap(TEXT("KeyE"));
	TestTrue(TEXT("à pied à Paris, cheval descendu"), G.PC->GetPawn() == G.Rider && !G.Truck->CarriesHorse());
	G.Until([&] { return G.Text().StartsWith(TEXT("Accréditations")); }, 30);
	AddInfo(FString::Printf(TEXT("accréditation : « %s »"), *G.Text()));
	TestTrue(TEXT("« Accréditations — retire ton dossard (entrée du parking) »"), G.Text().StartsWith(TEXT("Accréditations — retire ton dossard (entrée du parking)")));
	G.Rider->SetActorLocation(StridesUnits::WebToUE(PD.site.secretariat.x + 2, PD.site.y + 0.9, PD.site.secretariat.z));
	TestEqual(TEXT("action proposée « Accréditation »"), G.PC->ActionLabel(), FString(TEXT("Accréditation")));
	G.Tap(TEXT("KeyE"));
	G.Until([&] { return G.Course->DialogOpen(); }, 30);
	TestTrue(TEXT("dialogue d'accueil (dossard)"), G.Course->DialogOpen() && FString(UTF8_TO_TCHAR(G.Course->DialogCall().args[2].s.c_str())).Contains(TEXT("dossard n°")));
	for (int32 K = 0; K < 4 && G.Course->DialogOpen(); K++) G.Tap(TEXT("KeyE"));
	G.Frame();
	TestTrue(TEXT("« Selle et monte … »"), G.Text().StartsWith(TEXT("Selle et monte ")));
	G.Rider->SetActorLocation(G.Horse->GetActorLocation() + FVector(0, 120, 90));
	G.Tap(TEXT("KeyE"));
	if (!TestTrue(TEXT("à cheval"), G.PC->GetPawn() == G.Horse)) return false;
	G.Frame();
	TestTrue(TEXT("« Échauffe-toi au paddock de Paris : sauts 0/2 »"), G.Text() == TEXT("Échauffe-toi au paddock de Paris : sauts 0/2"));
	const int32 WarmFirst = G.Course->ParisFenceStart(TEXT("paris_warm"));
	for (int32 K = 0; K < 2; K++) TestTrue(*FString::Printf(TEXT("paddock : saut %d"), K + 1), JumpFence(G, *Data, WarmFirst + K));
	G.Frame();
	AddInfo(FString::Printf(TEXT("après l'échauffement : « %s »"), *G.Text()));
	TestEqual(TEXT("tracé du Sprint en piste"), G.Course->ParisShownCourse(), FString(TEXT("paris_sprint")));
	if (!PlayRound(*this, G, *Data, PD.sprint, true, TEXT("Sprint"))) return false;
	// Classement du Sprint.
	if (!TestTrue(TEXT("carte du classement du Sprint"), G.Until([&] { return G.Course->ParisCardOpen(); }, 200))) return false;
	AddInfo(FString::Printf(TEXT("Sprint : « %s » (%d e, départ %d)"), UTF8_TO_TCHAR(G.Course->ParisCard()->title.c_str()), G.R()->sprintRank(), G.R()->order()));
	G.Tap(TEXT("Enter"));
	// Soirée : présentation des cavaliers (20 h), dialogue de l'ordre de départ.
	TestTrue(TEXT("présentation des cavaliers"), G.Until([&] { return G.Text() == TEXT("Présentation des cavaliers…"); }, 30));
	TestTrue(TEXT("20 h"), FMath::Abs(FMath::Fmod(Save->GameTime, 86400.0) / 3600 - 20) < 0.01 || FMath::Fmod(Save->GameTime, 86400.0) / 3600 > 20);
	TestTrue(TEXT("dialogue de l'ordre de départ"), G.Until([&] { return G.Course->DialogOpen(); }, 400));
	AddInfo(FString::Printf(TEXT("Margot : « %s »"), UTF8_TO_TCHAR(G.Course->DialogCall().args[2].s.c_str())));
	G.Tap(TEXT("KeyE"));
	if (!PlayRound(*this, G, *Data, PD.gp, true, TEXT("Grand Prix"))) return false;
	G.Until([&] { return G.Course->ParisCardOpen() || (G.R()->round() && G.R()->roundKind() == strides::ParisRun::Round::Barrage); }, 200);
	if (G.R()->barrage())
	{
		AddInfo(TEXT("barrage des sans-faute"));
		if (!PlayRound(*this, G, *Data, PD.gp, false, TEXT("Barrage"))) return false;
	}
	if (!TestTrue(TEXT("carte du podium"), G.Until([&] { return G.Course->ParisCardOpen(); }, 200))) return false;
	const strides::ParisCard* Pod = G.Course->ParisCard();
	FString Rows;
	for (const auto& R : Pod->rows) Rows += FString::Printf(TEXT(" · %s : %s"), UTF8_TO_TCHAR(R.first.c_str()), UTF8_TO_TCHAR(R.second.c_str()));
	AddInfo(FString::Printf(TEXT("podium : « %s »%s"), UTF8_TO_TCHAR(Pod->title.c_str()), *Rows));
	// missions.complete : dotation (payOverride) et pourboire de 10 % à 5 étoiles (1er à 3e).
	const int32 Dot = G.R()->hasPayOverride() ? G.R()->payOverride() : 0;
	const int32 Fin = G.R()->finalRank();
	const int32 Pay = Dot + (Fin <= 3 && Dot > 0 ? FMath::RoundToInt(Dot * 0.1) : 0);
	G.Tap(TEXT("Enter"));
	for (int32 K = 0; K < 30 && !P->ActiveMissionId.IsEmpty(); K++) G.Frame();
	TestTrue(TEXT("mission terminée"), P->ActiveMissionId.IsEmpty() && P->CompletedMissions.Contains(TEXT("gpparis")));
	AddInfo(FString::Printf(TEXT("fin : %d crédits (+%d), %d réputation · %s"), P->Credits, P->Credits - 1000, P->Reputation, *P->LastMessage));
	TestEqual(TEXT("+1 500 réputation"), P->Reputation, 31500);
	TestEqual(TEXT("montant versé = dotation et pourboire du cœur"), P->Credits, 1000 + Pay);
	TestTrue(TEXT("Grand Prix retiré"), G.R() == nullptr && !G.Course->MissionActive());
	UGameplayStatics::DeleteGameInSlot(Save->SlotName, 0);
	return true;
}

#endif
