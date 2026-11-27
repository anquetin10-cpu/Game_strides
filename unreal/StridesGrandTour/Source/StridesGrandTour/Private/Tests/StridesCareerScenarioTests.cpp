// Jalon J4 (boucle produit) : scénario fonctionnel de bout en bout dans le moteur, joué par les touches du joueur
// (FeedKey) là où le jeu les lit, et deux mondes successifs pour la relance :
//  - Strides.Scenario.Career : monde 1 — écran titre sans sauvegarde (« Jouer »), création du personnage au clavier
//    (prénom effacé puis « Julie » tapé, « C'est parti ») → partie neuve écrite ; objectif d'accueil « Une mission
//    t'attend sur Strides » ; téléphone (P), app Strides, « Premiers pas » acceptée (deux touchers) ; étapes de la mission
//    franchies (cheval posé à chaque étape : trajet non joué ici) → +50 €, +60 ; « Deux écuries » et « Un renfort »
//    acceptées et franchies de même ; missions intermédiaires suivantes marquées faites (déjà prouvées par
//    Strides.Career.Story et le ctest « carriere ») ; cross de Saint-Gatien : dix obstacles sautés par le cœur (Espace
//    en bonne zone), arrivée → récompense ; sauvegarde. Monde 2 (relance) — écran titre avec « Continuer » choisi par
//    Entrée → reprise : prénom, crédits, réputation, missions faites, position, derby proposé.
// Ce n'est NI l'autopilote (F8) NI une partie jouée à la main : la partie par entrées système (paquet) le complète.
#include "Misc/AutomationTest.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "HAL/PlatformProcess.h"
#include "Kismet/GameplayStatics.h"
#include "StridesActivityPost.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCore/Epreuves.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesHUD.h"
#include "StridesPlayerController.h"
#include "StridesProgressionSubsystem.h"
#include "StridesRider.h"
#include "StridesSaveSubsystem.h"
#include "StridesTitleScreen.h"
#include "StridesUnits.h"
#include "StridesWorldDirector.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace StridesCareerScenario
{
const TCHAR* const Slot = TEXT("strides_test_j4_carriere");

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
		// Emplacement à part : la partie du joueur n'est jamais touchée ; reprise autorisée (« Continuer »).
		if (UStridesSaveSubsystem* S = GI->GetSubsystem<UStridesSaveSubsystem>())
		{
			S->SlotName = Slot;
			S->bAutoSave = true;
			S->ReloadSettings();
		}
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
	AStridesHUD* Hud = nullptr;
	AStridesWorldDirector* Dir = nullptr;
	UCanvas* Toile = nullptr;
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
		FActorSpawnParameters Sp;
		Sp.Owner = PC;
		Hud = World->SpawnActor<AStridesHUD>(Sp);
		if (!Hud) return false;
		Hud->PlayerOwner = PC;
		PC->MyHUD = Hud;
		Toile = NewObject<UCanvas>();
		Toile->SizeX = 1280;
		Toile->SizeY = 800;
		Dir = World->SpawnActor<AStridesWorldDirector>();
		Dir->PoleCourse = Course;
		return true;
	}
	void Frame()
	{
		PC->StepCommands(1.0 / 30);
		PC->PhoneTick();
		Horse->Tick(1.0 / 30);
		Hud->SetCanvasForTest(Toile);
		Hud->DrawHUD();
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
	int32 IndexOf(const FString& Id) const
	{
		for (int32 I = 0; I < Hud->PhoneItems().Num(); ++I) if (Hud->PhoneItems()[I].Id == Id) return I;
		return -1;
	}
	bool Choose(const FString& Id)
	{
		const int32 Want = IndexOf(Id);
		if (Want < 0) return false;
		for (int32 K = 0; K < 40 && PC->PhoneSelection() != Want; ++K) Tap(PC->PhoneSelection() < Want ? TEXT("ArrowRight") : TEXT("ArrowLeft"));
		if (PC->PhoneSelection() != Want) return false;
		Tap(TEXT("Enter"));
		return true;
	}
	FString Title() const { return PC->TitleWidget() ? FString::Join(PC->TitleWidget()->Describe(), TEXT(" ; ")) : FString(); }
};
}  // namespace StridesCareerScenario

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesScenarioCareerTest, "Strides.Scenario.Career", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesScenarioCareerTest::RunTest(const FString&)
{
	using namespace StridesCareerScenario;
	UGameplayStatics::DeleteGameInSlot(Slot, 0);
	auto Info = [this](const FString& M) { AddInfo(M); UE_LOG(LogTemp, Display, TEXT("Strides.Scenario.Career : %s"), *M); };
	double EndX = 0, EndZ = 0;
	int32 CreditsBefore = 0, RepBefore = 0;
	{
		FTestWorld W(TEXT("StridesCareer1"));
		const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
		UStridesProgressionSubsystem* P = W.GI->GetSubsystem<UStridesProgressionSubsystem>();
		UStridesSaveSubsystem* Save = W.GI->GetSubsystem<UStridesSaveSubsystem>();
		if (!TestTrue(TEXT("sous-systèmes"), Data && P && Save && Data->Story() && Data->Events())) return false;
		P->Restore(0, 0, FString(), {});
		FGame G;
		if (!TestTrue(TEXT("jeu monté"), G.Make(W.World, *Data))) return false;
		// 1. Écran titre sans sauvegarde : « Jouer » seul.
		bool bHas = true;
		FString Issue;
		Save->CheckSave(bHas, Issue);
		TestFalse(TEXT("aucune sauvegarde dans l'emplacement du test"), bHas);
		G.PC->ShowTitle(bHas, Issue);
		Info(FString::Printf(TEXT("titre : %s"), *G.Title()));
		TestTrue(TEXT("écran titre ouvert"), G.PC->IsTitleOpen());
		TestEqual(TEXT("menu sans sauvegarde : « Jouer »"), G.PC->TitleWidget()->Items(), TArray<FString>{TEXT("play")});
		TestTrue(TEXT("libellé « Jouer »"), G.Title().Contains(TEXT("*play=Jouer")));
		// Les commandes du jeu ne reçoivent rien pendant l'écran titre.
		G.Tap(TEXT("KeyW"));
		TestEqual(TEXT("Z / W : sélection (un seul bouton), pas de cadence"), G.Horse->CsoState().hasCadence ? G.Horse->CsoState().cadence : 0.0, 0.0);
		// 2. Création du personnage au clavier.
		G.Tap(TEXT("Enter"));
		TestEqual(TEXT("« Qui monte en selle ? »"), G.PC->TitleWidget()->Page(), FString(TEXT("setup")));
		TestEqual(TEXT("« C'est parti » choisi d'office"), G.PC->TitleWidget()->SelectedId(), FString(TEXT("start")));
		for (int32 K = 0; K < 3; ++K) G.Tap(TEXT("ArrowUp"));
		TestTrue(TEXT("champ du prénom choisi"), G.PC->TitleWidget()->NameFieldSelected());
		for (int32 K = 0; K < 4; ++K) G.Tap(TEXT("Backspace"));
		TestTrue(TEXT("prénom effacé"), G.PC->TitleWidget()->NameValue().IsEmpty());
		for (const TCHAR C : FString(TEXT("Julie"))) G.PC->TitleWidget()->TypeChar(C);
		G.Tap(TEXT("Enter"));
		TestEqual(TEXT("Entrée dans le prénom : « C'est parti » choisi"), G.PC->TitleWidget()->SelectedId(), FString(TEXT("start")));
		G.Tap(TEXT("Enter"));
		TestFalse(TEXT("écran titre fermé"), G.PC->IsTitleOpen());
		TestEqual(TEXT("prénom « Julie »"), Save->PlayerName, FString(TEXT("Julie")));
		TestTrue(TEXT("partie neuve écrite"), UGameplayStatics::DoesSaveGameExist(Slot, 0) && P->Credits == 0 && P->CompletedMissions.Num() == 0);
		G.Frame();
		Info(FString::Printf(TEXT("objectif d'accueil : %s"), *P->MissionStatus()));
		TestTrue(TEXT("objectif « Une mission t’attend sur Strides »"), P->MissionStatus().EndsWith(TEXT("Une mission t’attend sur Strides")));
		// 3. Première mission par le téléphone.
		G.Tap(TEXT("KeyP"));
		TestTrue(TEXT("téléphone ouvert"), G.PC->IsPhoneOpen());
		TestTrue(TEXT("app Strides"), G.Choose(TEXT("app:strides")));
		TestTrue(TEXT("demande « Premiers pas »"), G.Choose(TEXT("offer:tuto")));
		TestTrue(TEXT("premier toucher « Accepter »"), G.Choose(TEXT("accept")));
		FPlatformProcess::Sleep(0.4f);
		G.Tap(TEXT("Enter"));
		FPlatformProcess::Sleep(1.35f);
		G.Frame();
		TestEqual(TEXT("« Premiers pas » en cours"), P->ActiveMissionId, FString(TEXT("tuto")));
		auto Walk = [&](const TCHAR* Id)
		{
			const strides::StoryMission* M = Data->Story()->find(TCHAR_TO_UTF8(Id));
			if (!M) return false;
			for (const strides::MissionStep& St : M->route)
			{
				G.Horse->PlaceAt(St.x, St.z, PI, 0);
				G.Frame();
				G.Dir->Tick(0.3f);
			}
			return P->CompletedMissions.Contains(Id);
		};
		TestTrue(TEXT("« Premiers pas » terminée"), Walk(TEXT("tuto")));
		TestTrue(TEXT("+50 €, +60"), P->Credits == 50 && P->Reputation == 60);
		for (const TCHAR* Id : {TEXT("m1"), TEXT("m2")})
		{
			TestTrue(*FString::Printf(TEXT("%s acceptée"), Id), P->StartMission(Id));
			TestTrue(*FString::Printf(TEXT("%s terminée"), Id), Walk(Id));
		}
		Info(FString::Printf(TEXT("après m2 : %d €, %d réputation"), P->Credits, P->Reputation));
		// 4. Missions intermédiaires marquées faites (prouvées ailleurs), puis le cross joué au clavier.
		TArray<FString> Done = P->CompletedMissions;
		int32 Rep = P->Reputation;
		for (const TCHAR* Id : {TEXT("m3"), TEXT("groom"), TEXT("livraison"), TEXT("transport"), TEXT("fugueur"), TEXT("plage"), TEXT("fer")})
		{
			Done.Add(Id);
			Rep += Data->Story()->find(TCHAR_TO_UTF8(Id))->xp;
		}
		P->Restore(P->Credits, Rep, FString(), Done);
		TestTrue(TEXT("cross acceptée"), P->StartMission(TEXT("cross")));
		const strides::CrossData& X = Data->Events()->cross;
		G.Dir->Tick(0.3f);
		G.Horse->PlaceAt(X.startX + 2, X.startZ, -PI / 2, 0);
		for (int32 K = 0; K < 20 && !G.Course->DialogOpen(); ++K) G.Frame();
		G.Tap(TEXT("KeyE"));
		for (int32 K = 0; K < 200 && G.Course->Event() && G.Course->Event()->step() != strides::EventRun::Step::XcCourse; ++K) G.Frame();
		if (!TestTrue(TEXT("parcours du cross lancé"), G.Course->Event() && G.Course->Event()->step() == strides::EventRun::Step::XcCourse)) return false;
		for (const strides::EventFence& F : X.fences)
		{
			const int32 Idx = G.Course->CrossFenceStart() + F.num - 1;
			G.Horse->PlaceAt(F.x - FMath::Sin(F.rot) * 13, F.z - FMath::Cos(F.rot) * 13, F.rot, 6.2);
			bool bJ = false;
			for (int32 K = 0; K < 300; ++K)
			{
				const strides::CsoTarget Tg = strides::csoTarget(G.Course->Obstacles(), G.Horse->CsoState(), G.Horse->JumpPower(), 0.0, true, Data->Jump(), Data->HorseParams());
				if (!bJ && G.Horse->CsoState().jumpT < 0 && Tg.index == Idx && Tg.plan.zone == strides::Zone::Good && Tg.plan.ideal <= Tg.plan.L + 0.3) { bJ = true; G.Tap(TEXT("Space")); continue; }
				G.Frame();
				if (bJ && G.Horse->CsoState().jumpT < 0 && G.Course->Event() && G.Course->Event()->course().next > F.num) break;
			}
		}
		G.Horse->PlaceAt(X.finX + 2, X.finZ, -PI / 2, 2);
		for (int32 K = 0; K < 60 && !P->ActiveMissionId.IsEmpty(); ++K) G.Frame();
		Info(FString::Printf(TEXT("cross : %s"), *P->LastMessage));
		TestTrue(TEXT("cross terminée et payée"), P->CompletedMissions.Contains(TEXT("cross")) && P->LastMessage.Contains(TEXT("Cross de Saint-Gatien")));
		// 5. Sauvegarde (missions.complete : saveNow ; ici explicite, la sauvegarde du directeur ayant aussi lieu).
		TestTrue(TEXT("sauvegarde écrite"), Save->SaveNow(G.PC));
		CreditsBefore = P->Credits;
		RepBefore = P->Reputation;
		EndX = G.Horse->WebX();
		EndZ = G.Horse->WebZ();
		Info(FString::Printf(TEXT("avant la relance : %d €, %d réputation, %d missions, cheval en (%.1f, %.1f)"), CreditsBefore, RepBefore, P->CompletedMissions.Num(), EndX, EndZ));
	}
	// 6. Relance : nouveau monde, écran titre avec « Continuer ».
	{
		FTestWorld W(TEXT("StridesCareer2"));
		const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
		UStridesProgressionSubsystem* P = W.GI->GetSubsystem<UStridesProgressionSubsystem>();
		UStridesSaveSubsystem* Save = W.GI->GetSubsystem<UStridesSaveSubsystem>();
		P->Restore(0, 0, FString(), {});
		FGame G;
		if (!TestTrue(TEXT("jeu monté (relance)"), G.Make(W.World, *Data))) return false;
		bool bHas = false;
		FString Issue;
		Save->CheckSave(bHas, Issue);
		TestTrue(TEXT("sauvegarde lisible"), bHas && Issue.IsEmpty());
		G.PC->ShowTitle(bHas, Issue);
		Info(FString::Printf(TEXT("titre (relance) : %s"), *G.Title()));
		TestEqual(TEXT("menu : Continuer, Nouvelle partie"), G.PC->TitleWidget()->Items(), TArray<FString>({TEXT("continue"), TEXT("new")}));
		TestEqual(TEXT("« Continuer » choisi d'office"), G.PC->TitleWidget()->SelectedId(), FString(TEXT("continue")));
		G.Tap(TEXT("Enter"));
		TestFalse(TEXT("écran titre fermé"), G.PC->IsTitleOpen());
		Info(FString::Printf(TEXT("reprise : %s · %d € · %d · %d missions · cheval en (%.1f, %.1f)"), *Save->PlayerName, P->Credits, P->Reputation, P->CompletedMissions.Num(), G.Horse->WebX(), G.Horse->WebZ()));
		TestEqual(TEXT("prénom repris"), Save->PlayerName, FString(TEXT("Julie")));
		TestTrue(TEXT("crédits et réputation repris"), P->Credits == CreditsBefore && P->Reputation == RepBefore);
		TestTrue(TEXT("missions terminées reprises (tuto, m1, m2, cross)"), P->CompletedMissions.Contains(TEXT("tuto")) && P->CompletedMissions.Contains(TEXT("m2")) && P->CompletedMissions.Contains(TEXT("cross")));
		TestTrue(TEXT("position reprise (à 1 m près)"), FVector2D::Distance(FVector2D(G.Horse->WebX(), G.Horse->WebZ()), FVector2D(EndX, EndZ)) < 1.0);
		TestTrue(TEXT("derby proposé et acceptable"), P->OfferLock(TEXT("derby")).IsEmpty() && P->StartMission(TEXT("derby")));
		Save->bAutoSave = false;
	}
	UGameplayStatics::DeleteGameInSlot(Slot, 0);
	return true;
}

#endif
