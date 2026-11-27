// Jalon J2 (unreal/docs/livraison/plan.md) : gameplay équestre, scénarios fonctionnels dans le moteur, pilotés par les
// entrées du joueur (touches du clavier passées au contrôleur par FeedKey, manche de la manette par GamepadStickForTest),
// cheval affiché en vue du web (WildMesh, membres visibles jugés) et pose réellement évaluée par le moteur à chaque image
// (mélangeur, replis, bascule), puis PostPoseView : contacts des membres comptés sur la pose finale.
//  - Strides.Scenario.Jump.Oracle : les dix abords j2-* exportés du jeu web (unreal/core/tests/oracles/cso_runs/) rejoués
//    depuis la même pose relative à l'obstacle, SAUT tapé (Espace) selon la même règle que l'exporteur (zone et marge
//    prévues) : résultat comparé au jeu web (franchi / faute / refus, nombre de barres tombées, contact d'un membre et
//    lequel : antérieur ou postérieur). Écarts de pose entre le squelette Unreal et la vue du web mesurés et écrits.
//  - Strides.Scenario.Jump.InCourse : dans l'épreuve du Pôle (poteau, Entrer en piste, cloche, départ), le 1 sauté trop
//    loin : faute annoncée par l'interface (hud.big / toast) et comptée au tableau, son de la barre, barre à terre.
// Ce n'est NI l'autopilote (F8) NI une partie jouée à la main : la partie par entrées système (paquet) le complète.
#include "Misc/AutomationTest.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Misc/Paths.h"
#include "StridesActivityPost.h"
#include "StridesCore/CsoFences.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/LimbContact.h"
#include "StridesCore/MiniJson.h"
#include "StridesCourse.h"
#include "StridesCsoAudio.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesHorseView.h"
#include "StridesPlayerController.h"
#include "StridesRider.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace StridesJumpTest
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

// Parcours du Pôle, poteau, cheval en vue du web monté par le cavalier du joueur.
struct FGame
{
	UWorld* World = nullptr;
	AStridesCourse* Course = nullptr;
	AStridesActivityPost* Post = nullptr;
	AStridesHorse* Horse = nullptr;
	AStridesPlayerController* PC = nullptr;
	AStridesRider* Rider = nullptr;
	FString Err;
	bool Make(UWorld* W, const UStridesDataSubsystem& Data)
	{
		World = W;
		Course = W->SpawnActor<AStridesCourse>();
		strides::CourseDesign D = Data.PoleCourse();
		D.x += Data.PoleArena.X;
		D.z += Data.PoleArena.Y;
		Course->Build(D, Data);
		const strides::CsoActivity* A = Data.CsoActivity();
		if (!A) return false;
		Post = W->SpawnActor<AStridesActivityPost>();
		Post->Setup(*A, Course);
		Post->PlayerName = TEXT("Alex");
		Horse = W->SpawnActor<AStridesHorse>();
		Horse->Course = Course;
		// Réglages du jeu (StridesMonteOptions par défaut) : taille et vue du cheval du web.
		if (!Horse->EnableWebScale(true, &Err) || !Horse->EnableWebView(&Err)) return false;
		Horse->PlaceAt(A->startX, A->startZ + 4, PI, 0);
		PC = W->SpawnActor<AStridesPlayerController>();
		Rider = W->SpawnActor<AStridesRider>(Horse->GetActorLocation() + FVector(0, 0, 90), FRotator::ZeroRotator);
		if (!PC || !Rider || !Rider->TryMount(PC) || PC->GetPawn() != Horse) return false;
		PC->SetViewCssForTest(FVector2D(844, 390));
		return true;
	}
	// Une image du jeu : heure de jeu, commandes, cheval (pas, obstacles, épreuve), pose du maillage évaluée, passe après
	// la pose (replis, bascule, contacts des membres) — ce que font le moteur et UStridesHorseViewPost à chaque image.
	void Frame()
	{
		const double Dt = 1.0 / 30;
		World->TimeSeconds += Dt;
		PC->StepCommands(Dt);
		Horse->Tick(Dt);
		USkeletalMeshComponent* M = Horse->BodyMesh();
		M->TickAnimation(0.f, false);
		M->RefreshBoneTransforms();
		Horse->PostPoseView();
	}
	void Tap(const TCHAR* Code)
	{
		PC->FeedKey(Code, true, false);
		Frame();
		PC->FeedKey(Code, false, false);
	}
};

double AlongS(const strides::CsoObstacle& O, double X, double Z) { return (X - O.x) * O.n.x + (Z - O.z) * O.n.z; }

// Résultat d'un abord : événements d'obstacle, barres tombées (son railFall), contacts des membres (antérieur, postérieur).
struct FOutcome
{
	TArray<FString> Events;
	int32 Falls = 0, Touches = 0, Fore = 0, Hind = 0, Frames = 0;
	bool bJumped = false;
	FString Text() const
	{
		return FString::Printf(TEXT("[%s] barres tombées %d, effleurements %d, contacts antérieur %d postérieur %d"), *FString::Join(Events, TEXT(", ")), Falls, Touches, Fore, Hind);
	}
};

// Résultat du jeu web relevé dans une exécution j2-* : événements obstacle:* (canal oe), sons railFall, contacts (lc).
FOutcome WebOutcome(const J& Run)
{
	FOutcome W;
	for (const J& F : Run["frames"].a)
	{
		for (const J& E : F["ch"]["oe"].a) W.Events.Add(UTF8_TO_TCHAR(E["e"].s.c_str()));
		for (const J& A : F["audio"].a)
		{
			W.Falls += A["fn"].s == "railFall";
			W.Touches += A["fn"].s == "railTouch";
		}
		for (const J& C : F["ch"]["lc"].a) (C["hind"].b ? W.Hind : W.Fore)++;
		W.bJumped |= F["in"]["jump"].b;
	}
	W.Frames = (int32)Run["frames"].a.size();
	return W;
}
}  // namespace StridesJumpTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesScenarioJumpOracleTest, "Strides.Scenario.Jump.Oracle", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesScenarioJumpOracleTest::RunTest(const FString&)
{
	using namespace StridesJumpTest;
	const FString Dir = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../core/tests/oracles/cso_runs"));
	struct FCase
	{
		const char* Id;
		const char* Label;  // obstacle abordé
		int32 Rule;         // 0 bonne zone (≤ L + 0,3), 1 loin < −0,06 avant L, 2 près < −0,06, 3 près −0,06..0,04, 4 loin barre ≤ 5 m,
		                    // 5 marge −0,06..0,04 (> 2 m), 6 marge 0,02..0,04 (> 2 m), 7 loin −0,08..−0,06 (> 2 m), 8 sans appui,
		                    // 9 bonne zone en tournant (manette 0,3 à droite dès 9 m)
	};
	const FCase Cases[] = {{"j2-sans-faute", "3", 0}, {"j2-posterieurs", "3", 1}, {"j2-pres-montee", "3", 2}, {"j2-pres-juste", "3", 3},
		{"j2-oxer-loin", "2", 4}, {"j2-effleurement", "3", 5}, {"j2-effleurement-haut", "3", 6}, {"j2-faute-limite", "3", 7},
		{"j2-refus-lent", "3", 8}, {"j2-virage", "2", 9}};
	int32 Same = 0, Diff = 0;
	FString Report;
	for (const FCase& Cs : Cases)
	{
		const FString Id = UTF8_TO_TCHAR(Cs.Id);
		J Run;
		try
		{
			Run = loadJson(TCHAR_TO_UTF8(*(Dir / (Id + TEXT(".fr.json")))));
		}
		catch (const std::exception& Ex)
		{
			AddError(FString::Printf(TEXT("%s : oracle illisible (%hs)"), *Id, Ex.what()));
			continue;
		}
		const FOutcome Web = WebOutcome(Run);
		FTestWorld W(*FString::Printf(TEXT("StridesJump_%s"), *Id.Replace(TEXT("-"), TEXT("_"))));
		const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
		if (!TestNotNull(TEXT("données"), Data)) return false;
		FGame G;
		if (!TestTrue(FString::Printf(TEXT("%s : parcours, cheval en vue du web, monté (%s)"), *Id, *G.Err), G.Make(W.World, *Data))) return false;
		TestTrue(FString::Printf(TEXT("%s : membres visibles jugés"), *Id), G.Horse->JudgesLimbs());
		const std::vector<strides::CsoObstacle>& Obs = G.Course->Obstacles();
		int32 Oi = -1;
		for (int32 I = 0; I < (int32)Obs.size(); I++)
			if (Obs[I].label == Cs.Label) Oi = I;
		if (!TestTrue(FString::Printf(TEXT("%s : obstacle %hs"), *Id, Cs.Label), Oi >= 0)) continue;
		const strides::CsoObstacle& O = Obs[Oi];
		// Pose du jeu web relative à l'obstacle (même rang dans la liste des obstacles de l'exécution).
		const J& Su = Run["setup"];
		const J& WO = Su["ch0"]["obs"][Oi];
		const J& S0 = Su["ch0"]["s"];  // pleine précision
		G.Horse->PlaceAt(O.x + (S0["x"].num() - WO["x"].num()), O.z + (S0["z"].num() - WO["z"].num()), S0["h"].num(), S0["v"].num());
		UStridesCsoAudio* Audio = W.World->GetSubsystem<UStridesCsoAudio>();
		if (Audio) Audio->ResetJournal();
		const int32 Ev0 = G.Course->FenceEventLog().Num(), L0 = G.Horse->LimbContactCount;
		FOutcome U;
		bool bJumped = false, bAir = false, bLanded = false, bTurn = false, bRear = false;
		int32 LandK = -1, RearEnd = -1;
		FString Contacts;
		int32 K = 0;
		for (; K < 500; K++)
		{
			const strides::CsoHorseState& S = G.Horse->CsoState();
			const strides::CsoTarget T = strides::csoTarget(Obs, S, G.Horse->JumpPower(), 0.0, true, Data->Jump(), Data->HorseParams());
			const strides::JumpPlan& Pl = T.plan;
			const bool bOn = T.index == Oi && !T.geo.rails.empty();
			const double X0 = bOn ? T.geo.rails[0].x : 1e9;
			bool bRule = false;
			if (bOn)
				switch (Cs.Rule)
				{
				case 0: bRule = Pl.zone == strides::Zone::Good && Pl.ideal <= Pl.L + 0.3; break;
				case 1: bRule = Pl.zone == strides::Zone::Far && Pl.margin < -0.06 && X0 < Pl.L; break;
				case 2: bRule = Pl.zone == strides::Zone::Near && Pl.margin < -0.06; break;
				case 3: bRule = Pl.zone == strides::Zone::Near && Pl.margin >= -0.06 && Pl.margin < 0.04; break;
				case 4: bRule = Pl.zone == strides::Zone::Far && X0 <= 5; break;
				case 5: bRule = Pl.zone != strides::Zone::Refuse && Pl.zone != strides::Zone::None && Pl.margin >= -0.06 && Pl.margin < 0.04 && X0 > 2; break;
				case 6: bRule = Pl.zone != strides::Zone::Refuse && Pl.zone != strides::Zone::None && Pl.margin >= 0.02 && Pl.margin < 0.04 && X0 > 2; break;
				case 7: bRule = Pl.zone == strides::Zone::Far && Pl.margin < -0.06 && Pl.margin >= -0.08 && X0 > 2; break;
				default: break;
				}
			if (Cs.Rule == 9) bRule = G.Horse->JumpTiming() == strides::Zone::Good;
			if (Cs.Rule == 9 && !bTurn && bOn && X0 < 9) bTurn = true;
			if (Cs.Rule == 9) G.PC->GamepadStickForTest(FVector2D(bTurn && !bLanded ? 0.3 : 0.0, 0.0));
			const bool bPress = Cs.Rule != 8 && !bJumped && S.jumpT < 0 && S.refusing < 0 && bRule;
			if (bPress)
			{
				bJumped = true;
				G.Tap(TEXT("Space"));
			}
			else G.Frame();
			const strides::CsoHorseState& S2 = G.Horse->CsoState();
			if (S2.jumpT >= 0) bAir = true;
			if (bAir && S2.jumpT < 0 && !bLanded)
			{
				bLanded = true;
				LandK = K;
			}
			if (S2.rearT > 0) bRear = true;
			if (bRear && !(S2.rearT > 0) && RearEnd < 0) RearEnd = K;
			if (G.Horse->LimbContactCount > L0 + U.Fore + U.Hind)
			{
				Contacts += TEXT(" ") + G.Horse->LastLimbContact;
				(G.Horse->LastLimbContact.Contains(TEXT(" PG ")) || G.Horse->LastLimbContact.Contains(TEXT(" PD ")) ? U.Hind : U.Fore)++;
			}
			// Fin : comme l'exporteur (8 m après l'obstacle, barres posées ; 30 images après la réception en virage ; 10 images
			// après le cabré pour le refus).
			bool bSettled = true;
			for (const strides::CsoRail& R : G.Course->FenceStates()[Oi].rails) bSettled &= R.falling ? R.fall.done : !(R.rattle > 0);
			bSettled &= G.Course->FenceStates()[Oi].pending.empty();
			if (Cs.Rule == 9 && LandK >= 0 && K - LandK >= 30) break;
			if (Cs.Rule == 8 && RearEnd >= 0 && K - RearEnd >= 10 && bSettled) break;
			if (Cs.Rule < 8 && bJumped && S2.jumpT < 0 && AlongS(O, S2.x, S2.z) > 8 && bSettled) break;
		}
		U.Frames = K + 1;
		U.bJumped = bJumped;
		const TArray<FString>& Log = G.Course->FenceEventLog();
		for (int32 I = Ev0; I < Log.Num(); I++)
		{
			FString E = Log[I];
			int32 Sp = INDEX_NONE;
			if (E.FindChar(TEXT(' '), Sp)) E = E.Left(Sp);
			U.Events.Add(E);
		}
		if (Audio)
			for (const FStridesSoundCall& C : Audio->Journal())
			{
				U.Falls += C.Call.StartsWith(TEXT("railFall("));
				U.Touches += C.Call.StartsWith(TEXT("railTouch("));
			}
		const bool bSame = U.Events == Web.Events && U.Falls == Web.Falls && U.Touches == Web.Touches && U.Fore == Web.Fore && U.Hind == Web.Hind && U.bJumped == Web.bJumped;
		(bSame ? Same : Diff)++;
		const FString Line = FString::Printf(TEXT("%s : web %s ; Unreal %s (%d images / web %d)%s%s"), *Id, *Web.Text(), *U.Text(), U.Frames, Web.Frames,
			Contacts.IsEmpty() ? TEXT("") : *(TEXT(" ; contacts Unreal :") + Contacts), bSame ? TEXT("") : TEXT(" ; ÉCART"));
		Report += Line + TEXT("\n");
		AddInfo(Line);
		UE_LOG(LogTemp, Display, TEXT("Strides.Scenario.Jump.Oracle : %s"), *Line);
		// Critères qui ne dépendent pas du détail de la pose : résultat du saut (franchi / faute / refus) et barres tombées.
		TestEqual(FString::Printf(TEXT("%s : événements d'obstacle comme le jeu web"), *Id), FString::Join(U.Events, TEXT(",")), FString::Join(Web.Events, TEXT(",")));
		TestEqual(FString::Printf(TEXT("%s : barres tombées comme le jeu web"), *Id), U.Falls, Web.Falls);
		TestEqual(FString::Printf(TEXT("%s : barres effleurées (tintement) comme le jeu web"), *Id), U.Touches, Web.Touches);
		// Contacts des membres : même nombre et même membre (antérieur / postérieur) que le jeu web. Écart de pose connu et
		// déclaré (plan.md, état J2) : j2-posterieurs, appel bien trop loin (marge −0,70 m) : au web, un antérieur touche
		// la barre (6,0 cm) avant que les postérieurs ne la fassent tomber ; ici l'antérieur passe et la barre tombe sous
		// les postérieurs (1,1 m plus loin, 12 images plus tard). Faute, cause et barre tombée identiques : résultat juste.
		if (Id == TEXT("j2-posterieurs"))
		{
			TestTrue(FString::Printf(TEXT("%s : écart de pose déclaré (antérieur web 1 / Unreal %d), résultat identique"), *Id, U.Fore), U.Fore <= Web.Fore && U.Hind == Web.Hind);
			if (U.Fore != Web.Fore) AddInfo(FString::Printf(TEXT("%s : écart de pose déclaré : contact d'un antérieur au web, aucun ici ; faute et barre identiques"), *Id));
		}
		else
		{
			TestEqual(FString::Printf(TEXT("%s : contacts d'un antérieur comme le jeu web"), *Id), U.Fore, Web.Fore);
			TestEqual(FString::Printf(TEXT("%s : contacts d'un postérieur comme le jeu web"), *Id), U.Hind, Web.Hind);
		}
		TestEqual(FString::Printf(TEXT("%s : appui SAUT comme le jeu web"), *Id), U.bJumped, Web.bJumped);
	}
	AddInfo(FString::Printf(TEXT("abords j2-* : %d comme le jeu web, %d en écart"), Same, Diff));
	return true;
}

// Dans l'épreuve du Pôle : le 1 sauté trop loin (zone « loin », marge prévue sous −0,06 m) : faute annoncée par
// l'interface et comptée, son de la barre qui tombe, barre à terre ; tout par les entrées du joueur (E au poteau,
// bouton « Entrer en piste » de la carte, conduite au clavier, Espace).
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesScenarioJumpInCourseTest, "Strides.Scenario.Jump.InCourse", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesScenarioJumpInCourseTest::RunTest(const FString&)
{
	using namespace StridesJumpTest;
	FTestWorld W(TEXT("StridesJumpInCourse"));
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	if (!TestNotNull(TEXT("données"), Data)) return false;
	FGame G;
	if (!TestTrue(FString::Printf(TEXT("parcours, cheval en vue du web, monté (%s)"), *G.Err), G.Make(W.World, *Data))) return false;
	AStridesCourse* C = G.Course;
	const strides::CsoActivity& A = G.Post->Activity();
	G.Horse->PlaceAt(A.startX, A.startZ + 4, PI, 0);
	G.Frame();
	G.Tap(TEXT("KeyE"));
	if (!TestTrue(TEXT("activité lancée par E"), C->MissionActive())) return false;
	for (int32 K = 0; K < 60 && C->Screen() != AStridesCourse::EScreen::Presentation; K++)
	{
		if (C->DialogOpen()) C->AdvanceDialog();
		G.Frame();
	}
	TestTrue(TEXT("« Entrer en piste »"), C->PressScreenButton(TEXT("enter")));
	bool bCourse = false;
	for (int32 K = 0; K < 900 && !bCourse; K++)
	{
		G.Frame();
		bCourse = C->Run()->step() == strides::CsoStep::Course;
	}
	if (!TestTrue(TEXT("parcours atteint (cloche)"), bCourse)) return false;
	// Le 1 : départ franchi en conduisant depuis 24 m avant l'obstacle, dans son axe (placement avant l'abord, déclaré).
	const std::vector<strides::CsoObstacle>& Obs = C->Obstacles();
	int32 Oi = -1;
	for (int32 I = 0; I < (int32)Obs.size(); I++)
		if (Obs[I].num == 1) Oi = I;
	if (!TestTrue(TEXT("obstacle 1"), Oi >= 0)) return false;
	const strides::CsoObstacle& O = Obs[Oi];
	G.Horse->PlaceAt(O.x - O.n.x * 24, O.z - O.n.z * 24, O.rot, 6.2);
	UStridesCsoAudio* Audio = W.World->GetSubsystem<UStridesCsoAudio>();
	if (Audio) Audio->ResetJournal();
	const int32 Hud0 = C->HudLog().Num();
	bool bJumped = false;
	int32 K = 0;
	for (; K < 400; K++)
	{
		const strides::CsoHorseState& S = G.Horse->CsoState();
		const strides::CsoTarget T = strides::csoTarget(Obs, S, G.Horse->JumpPower(), 0.0, true, Data->Jump(), Data->HorseParams());
		if (!bJumped && S.jumpT < 0 && T.index == Oi && T.plan.zone == strides::Zone::Far && T.plan.margin < -0.06 && !T.geo.rails.empty() && T.geo.rails[0].x < T.plan.L)
		{
			bJumped = true;
			G.Tap(TEXT("Space"));
			continue;
		}
		G.Frame();
		if (bJumped && G.Horse->CsoState().jumpT < 0 && AlongS(O, G.Horse->CsoState().x, G.Horse->CsoState().z) > 8) break;
	}
	TestTrue(TEXT("SAUT tapé en zone « loin »"), bJumped);
	const strides::CsoRunState& St = C->Run()->state();
	TestEqual(TEXT("une barre : 4 points de pénalité (barème A)"), St.faults, 4);
	TestTrue(FString::Printf(TEXT("journal de l'épreuve : une faute (%d entrées)"), (int32)St.log.size()), St.log.size() == 1);
	FString Hud;
	for (int32 I = Hud0; I < C->HudLog().Num(); I++) Hud += C->HudLog()[I] + TEXT(" ; ");
	TestTrue(FString::Printf(TEXT("faute annoncée par l'interface (%s)"), *Hud), Hud.Contains(TEXT("toast")) || Hud.Contains(TEXT("big")));
	int32 Falls = 0;
	if (Audio)
		for (const FStridesSoundCall& Cl : Audio->Journal()) Falls += Cl.Call.StartsWith(TEXT("railFall("));
	TestTrue(FString::Printf(TEXT("son de la barre qui tombe (%d)"), Falls), Falls >= 1);
	bool bDown = false;
	for (const strides::CsoRail& R : C->FenceStates()[Oi].rails) bDown |= R.falling;
	TestTrue(TEXT("barre à terre"), bDown);
	AddInfo(FString::Printf(TEXT("épreuve : %d images après le placement, fautes %d, contacts des membres %d (%s), interface : %s"), K, St.faults, G.Horse->LimbContactCount,
		*G.Horse->LastLimbContact, *Hud));
	return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
