// Jalon J2c (lot J2-D, unreal/docs/livraison/plan.md) : entraînement à l'abord au paddock du Pôle dans le moteur, piloté
// par les entrées du joueur (touches passées au contrôleur par FeedKey, manche de la manette par GamepadStickForTest).
//  - Strides.Scenario.Training : épreuve lancée au poteau (E), éliminée au temps limite (S tenu), « S'entraîner » au
//    bilan ; l'entraînement part 300 ms plus tard (grand message, objectif « Rejoins le paddock… ») ; le cheval, posé
//    devant l'ouverture est du paddock, y entre au stick ; étape d'entraînement (astuce, mode de concours, action
//    « Terminer », obstacle suivant = le vertical visé) ; le vertical sauté en bonne zone (toast « Sans faute · N cm de
//    marge »), l'oxer sauté bien trop tôt (toast « Barre · <cause> », barre remontée 2,5 s plus tard), un refus au trot
//    lent (toast « Refus… ») ; « Terminer » par E : fin (grand message « Entraînement terminé », 1 saut sans faute sur 2),
//    plus de mission, poteau de nouveau proposé ; barres du parcours non touchées par l'entraînement.
// Ce n'est NI l'autopilote (F8) NI une partie jouée à la main : la partie par entrées système (paquet) le complète.
#include "Misc/AutomationTest.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "StridesActivityPost.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/CsoTraining.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesFence.h"
#include "StridesHorse.h"
#include "StridesPlayerController.h"
#include "StridesRider.h"
#include "StridesUnits.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace StridesTrainingTest
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
		if (!Horse->EnableWebScale(true, &Err) || !Horse->EnableWebView(&Err)) return false;
		Horse->PlaceAt(A->startX, A->startZ + 4, PI, 0);
		PC = W->SpawnActor<AStridesPlayerController>();
		Rider = W->SpawnActor<AStridesRider>(Horse->GetActorLocation() + FVector(0, 0, 90), FRotator::ZeroRotator);
		if (!PC || !Rider || !Rider->TryMount(PC) || PC->GetPawn() != Horse) return false;
		PC->SetViewCssForTest(FVector2D(844, 390));
		return true;
	}
	// Une image : heure de jeu et heure murale (temporisations du HUD, « S'entraîner » 300 ms), commandes, cheval, pose.
	void Frame()
	{
		const double Dt = 1.0 / 30;
		World->TimeSeconds += Dt;
		World->RealTimeSeconds += Dt;
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
FString Since(const TArray<FString>& L, int32 From)
{
	FString S;
	for (int32 I = From; I < L.Num(); I++) S += L[I] + TEXT(" ; ");
	return S;
}
}  // namespace StridesTrainingTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesScenarioTrainingTest, "Strides.Scenario.Training", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesScenarioTrainingTest::RunTest(const FString&)
{
	using namespace StridesTrainingTest;
	auto Wrap = [](double A) { return FMath::Atan2(FMath::Sin(A), FMath::Cos(A)); };
	auto SteerTo = [&](const strides::CsoHorseState& S, double Wx, double Wz) { return FMath::Clamp(-Wrap(FMath::Atan2(Wx, Wz) - S.heading) * 2.2, -1.0, 1.0); };
	FTestWorld W(TEXT("StridesTraining"));
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	if (!TestNotNull(TEXT("données"), Data)) return false;
	FGame G;
	if (!TestTrue(FString::Printf(TEXT("parcours, cheval, monté (%s)"), *G.Err), G.Make(W.World, *Data))) return false;
	AStridesCourse* C = G.Course;
	if (!TestTrue(TEXT("paddock lu (cso_course_pole.json « warmup »)"), Data->PoleWarmup.Z > 0)) return false;
	// Obstacles du paddock posés après ceux du parcours, pièces exportées du jeu web.
	const std::vector<strides::CsoObstacle>& Obs = C->Obstacles();
	int32 IV = -1, IO = -1;
	for (int32 I = 0; I < (int32)Obs.size(); I++)
		if (Obs[I].course == "warmup") (Obs[I].kind == "v" ? IV : IO) = I;
	if (!TestTrue(FString::Printf(TEXT("vertical et oxer du paddock (%d obstacles, %d du parcours)"), (int32)Obs.size(), C->CourseFenceCount()), IV >= C->CourseFenceCount() && IO >= C->CourseFenceCount())) return false;
	TestTrue(TEXT("pièces exportées du jeu web pour le paddock"), C->FenceAt(IV)->IsExported() && C->FenceAt(IO)->IsExported());
	TestTrue(TEXT("vertical 1,10 m, oxer 1,00 m (obstacles.js:200-201)"), FMath::IsNearlyEqual(Obs[IV].h, 1.1) && FMath::IsNearlyEqual(Obs[IO].h, 1.0) && FMath::IsNearlyEqual(Obs[IO].spread, 1.2));
	const strides::CsoObstacle OV = Obs[IV], OO = Obs[IO];
	auto Target = [&]() { return strides::csoTarget(C->Obstacles(), G.Horse->CsoState(), G.Horse->JumpPower(), 0.0, true, Data->Jump(), Data->HorseParams()); };

	// 1. Épreuve lancée au poteau, éliminée au temps limite, « S'entraîner ».
	const strides::CsoActivity& A = G.Post->Activity();
	G.Horse->PlaceAt(A.startX, A.startZ + 4, PI, 0);
	G.Frame();
	G.Tap(TEXT("KeyE"));
	if (!TestTrue(TEXT("épreuve lancée par E"), C->Run() && C->MissionActive())) return false;
	for (int32 K = 0; K < 60 && C->Screen() != AStridesCourse::EScreen::Presentation; K++)
	{
		if (C->DialogOpen()) C->AdvanceDialog();
		G.Frame();
	}
	TestTrue(TEXT("« Entrer en piste »"), C->PressScreenButton(TEXT("enter")));
	G.PC->FeedKey(TEXT("KeyS"), true, false);
	for (int32 K = 0; K < 6000 && !C->Run()->state().eliminated; K++) G.Frame();
	G.PC->FeedKey(TEXT("KeyS"), false, false);
	TestTrue(TEXT("éliminé (temps limite)"), C->Run()->state().eliminated);
	for (int32 K = 0; K < 600 && C->Screen() != AStridesCourse::EScreen::Result; K++) G.Frame();
	if (!TestTrue(TEXT("bilan ouvert"), C->Screen() == AStridesCourse::EScreen::Result)) return false;
	const int32 Hud0 = C->HudLog().Num();
	if (!TestTrue(TEXT("« S'entraîner » touché"), C->PressScreenButton(TEXT("cso-train")))) return false;
	int32 K = 0;
	for (; K < 120 && !C->TrainingActive(); K++) G.Frame();
	TestTrue(FString::Printf(TEXT("entraînement lancé après le bilan (%d images, 300 ms attendues)"), K), C->TrainingActive() && K >= 8 && K <= 30);
	FString Hud = Since(C->HudLog(), Hud0);
	TestTrue(FString::Printf(TEXT("grand message du lancement (%s)"), *Hud), Hud.Contains(TEXT("big | ENTRAÎNEMENT À L’ABORD | Événement · Entraînement")));
	TestTrue(FString::Printf(TEXT("objectif « Rejoins le paddock » (%s)"), *C->ObjectiveText()), C->ObjectiveText().StartsWith(TEXT("Rejoins le paddock d’échauffement du Pôle")));
	TestFalse(TEXT("pas de mode de concours pendant l'étape goto"), C->CourseMode().active);
	TestTrue(TEXT("poteau du Pôle non proposé (mission en cours)"), !G.Post->Available(A.startX, A.startZ, TEXT("ride")));

	// 2. Entrée au stick par l'ouverture est du paddock (lice « fence » du web, 6 m), depuis l'allée de 10 m entre la lice
	// de la carrière (x = 270) et celle du paddock (x = 260).
	const FVector4 Wu = Data->PoleWarmup;
	G.Horse->PlaceAt(Wu.X + Wu.Z / 2 + 6, Wu.Y, -PI / 2, 3);
	for (K = 0; K < 900 && C->Training()->step() == strides::CsoTrainingStep::Goto; K++)
	{
		const strides::CsoHorseState& H = G.Horse->CsoState();
		G.PC->GamepadStickForTest(FVector2D(SteerTo(H, Wu.X - H.x, Wu.Y - H.z), (H.hasCadence ? H.cadence : 0) < 3 ? 1 : 0));
		G.Frame();
	}
	G.PC->GamepadStickForTest(FVector2D::ZeroVector);
	AddInfo(FString::Printf(TEXT("entrée au paddock : cheval en (%.2f, %.2f), cap %.2f, vitesse %.2f m/s, cadence %.2f, %d images"), G.Horse->CsoState().x, G.Horse->CsoState().z,
		G.Horse->CsoState().heading, G.Horse->CsoState().speed, G.Horse->CsoState().cadence, K));
	TestTrue(FString::Printf(TEXT("paddock atteint au stick (%d images)"), K), C->Training()->step() == strides::CsoTrainingStep::Train);
	Hud = Since(C->HudLog(), Hud0);
	TestTrue(TEXT("astuce de l'entraînement (7 s)"), Hud.Contains(TEXT("hint | Vertical au nord")) && Hud.Contains(TEXT("| 7000")));
	TestTrue(TEXT("mode de concours (game.course.camera, commandes de concours)"), C->CourseMode().active && !C->CourseMode().board);
	TestEqual(TEXT("action « Terminer » proposée"), G.PC->ActionLabel(), FString(TEXT("Terminer")));
	TestTrue(FString::Printf(TEXT("objectif « 0 saut sans faute sur 0 » (%s)"), *C->ObjectiveText()), C->ObjectiveText() == TEXT("Entraînement : 0 saut sans faute sur 0"));

	// 3. Vertical (sauté vers l'est) en bonne zone depuis 13 m (abord droit de 14 m au plus dans le paddock, obstacles.js:194).
	int32 H1 = C->HudLog().Num();
	G.Horse->PlaceAt(OV.x - OV.n.x * 13, OV.z - OV.n.z * 13, OV.rot, 6.2);
	bool bJ = false, bNext = false;
	for (K = 0; K < 400; K++)
	{
		const strides::CsoTarget T = Target();
		if (!bJ && G.Horse->CsoState().jumpT < 0 && T.index == IV && T.plan.zone == strides::Zone::Good && T.plan.ideal <= T.plan.L + 0.3) { bJ = true; G.Tap(TEXT("Space")); continue; }
		G.Frame();
		bNext |= C->CourseMode().next == IV;
		if (bJ && G.Horse->CsoState().jumpT < 0 && AlongS(OV, G.Horse->CsoState().x, G.Horse->CsoState().z) > 6) break;
	}
	Hud = Since(C->HudLog(), H1);
	AddInfo(FString::Printf(TEXT("vertical : SAUT %d, cheval en (%.2f, %.2f) à %.2f m/s, %d images ; obstacles %s"), bJ, G.Horse->CsoState().x, G.Horse->CsoState().z, G.Horse->CsoState().speed, K, *Since(C->FenceEventLog(), 0)));
	TestTrue(TEXT("obstacle suivant = le vertical visé (game.course.next)"), bNext);
	TestTrue(FString::Printf(TEXT("vertical sauté sans faute, marge en cm (%s ; %s)"), *Hud, *Since(C->FenceEventLog(), 0)), bJ && Hud.Contains(TEXT("toast | Sans faute · ")) && Hud.Contains(TEXT(" cm de marge")) && C->Training()->clean() == 1);
	TestTrue(TEXT("objectif « 1 saut sans faute sur 1 »"), C->ObjectiveText() == TEXT("Entraînement : 1 saut sans faute sur 1"));
	AddInfo(FString::Printf(TEXT("vertical : %s"), *Hud));

	// 4. Oxer (sauté vers l'ouest) en zone « loin » (marge prévue sous −6 cm, règle du test Jump.InCourse) : barre,
	// cause expliquée, barre remontée 2,5 s plus tard.
	H1 = C->HudLog().Num();
	G.Horse->PlaceAt(OO.x - OO.n.x * 13, OO.z - OO.n.z * 13, OO.rot, 6.2);
	bJ = false;
	for (K = 0; K < 300; K++)
	{
		const strides::CsoTarget T = Target();
		if (!bJ && G.Horse->CsoState().jumpT < 0 && T.index == IO && T.plan.zone == strides::Zone::Far && T.plan.margin < -0.06 && !T.geo.rails.empty() && T.geo.rails[0].x < T.plan.L) { bJ = true; G.Tap(TEXT("Space")); continue; }
		G.Frame();
		if (bJ && G.Horse->CsoState().jumpT < 0 && AlongS(OO, G.Horse->CsoState().x, G.Horse->CsoState().z) > 6) break;
	}
	AddInfo(FString::Printf(TEXT("oxer : SAUT %d, cheval en (%.2f, %.2f) à %.2f m/s, %d images ; obstacles %s"), bJ, G.Horse->CsoState().x, G.Horse->CsoState().z, G.Horse->CsoState().speed, K, *Since(C->FenceEventLog(), 0)));
	G.PC->FeedKey(TEXT("KeyS"), true, false);
	for (K = 0; K < 30; K++) G.Frame();
	G.PC->FeedKey(TEXT("KeyS"), false, false);
	Hud = Since(C->HudLog(), H1);
	const bool bKnocked = C->FenceStates()[IO].knocked;
	TestTrue(FString::Printf(TEXT("oxer : barre et cause (%s)"), *Hud), bJ && Hud.Contains(TEXT("toast | Barre · ")) && C->Training()->jumps() == 2 && C->Training()->clean() == 1);
	TestTrue(TEXT("barre de l'oxer à terre"), bKnocked);
	for (K = 0; K < 150 && C->FenceStates()[IO].knocked; K++) G.Frame();
	TestFalse(FString::Printf(TEXT("barre remontée (remise de l'entraînement, %d images)"), K), C->FenceStates()[IO].knocked);
	AddInfo(FString::Printf(TEXT("oxer : %s"), *Hud));

	// 5. Refus au trot lent (2,6 m/s, sans SAUT) devant le vertical.
	H1 = C->HudLog().Num();
	G.Horse->PlaceAt(OV.x - OV.n.x * 8, OV.z - OV.n.z * 8, OV.rot, 2.6);
	for (K = 0; K < 150 && !Since(C->HudLog(), H1).Contains(TEXT("Refus")); K++) G.Frame();
	Hud = Since(C->HudLog(), H1);
	TestTrue(FString::Printf(TEXT("refus expliqué (%s)"), *Hud), Hud.Contains(TEXT("toast | Refus : trop près, appelle plus tôt")) && C->Training()->jumps() == 2);
	for (K = 0; K < 60; K++) G.Frame();

	// 6. « Terminer » (E, priorité 2) : fin de la mission.
	H1 = C->HudLog().Num();
	G.Tap(TEXT("KeyE"));
	for (K = 0; K < 10; K++) G.Frame();
	Hud = Since(C->HudLog(), H1);
	TestTrue(TEXT("entraînement terminé par E"), C->Training()->finished() && !C->MissionActive());
	TestTrue(FString::Printf(TEXT("carte de fin en grand message (%s)"), *Hud), Hud.Contains(TEXT("big | Entraînement terminé | 1 saut sans faute sur 2.")));
	TestEqual(TEXT("kicker de la carte"), FString(UTF8_TO_TCHAR(C->LastTrainingResult().kicker.c_str())), FString(TEXT("Entraînement à l’abord · Strides")));
	TestFalse(TEXT("mode de concours rendu"), C->CourseMode().active);
	TestTrue(TEXT("toujours à cheval (« Terminer » l'emporte sur la descente)"), G.Rider->MountedOn == G.Horse);
	G.Horse->PlaceAt(A.startX, A.startZ + 2, PI, 0);
	G.Frame();
	TestTrue(TEXT("poteau du Pôle de nouveau proposé"), G.Post->Available(A.startX, A.startZ + 2, TEXT("ride")));
	// Barres du parcours : aucune remise demandée par l'entraînement (resetRails('warmup') seulement).
	int32 CourseKnocked = 0;
	for (int32 I = 0; I < C->CourseFenceCount(); I++) CourseKnocked += C->FenceStates()[I].knocked;
	AddInfo(FString::Printf(TEXT("parcours : %d obstacles à terre à la fin (épreuve éliminée sans saut)"), CourseKnocked));
	TestTrue(TEXT("aucun obstacle du parcours touché par l'entraînement"), CourseKnocked == 0);

	// 7. Poteau « Chrono » du paddock (activité cso_warmup, posé comme StridesGameMode) : E lance l'entraînement, déjà
	// dans le paddock (étape goto validée à l'image suivante), puis « Terminer ».
	AStridesActivityPost* Warm = W.World->SpawnActor<AStridesActivityPost>();
	Warm->Setup(strides::csoWarmupActivity(strides::CsoPaddock{Wu.X, Wu.Y, Wu.Z, Wu.W}), C);
	const strides::CsoActivity& WA = Warm->Activity();
	TestTrue(TEXT("poteau du paddock en a.start + 3 m (252, -232) → (255, -232)"), WA.startX == Wu.X + 12 && WA.markerX == WA.startX + 3 && WA.startZ == Wu.Y);
	G.Horse->PlaceAt(WA.startX + 2, WA.startZ, -PI / 2, 0);
	G.Frame();
	TestEqual(TEXT("action « Chrono » du paddock proposée"), G.PC->ActionLabel(), FString(TEXT("Chrono")));
	const int32 N0 = C->TrainingsStarted();
	G.Tap(TEXT("KeyE"));
	for (K = 0; K < 5; K++) G.Frame();
	TestTrue(TEXT("entraînement lancé au poteau du paddock, étape d'entraînement"), C->TrainingsStarted() == N0 + 1 && C->TrainingActive() && C->Training()->step() == strides::CsoTrainingStep::Train);
	TestFalse(TEXT("poteau du paddock non proposé pendant l'entraînement"), Warm->Available(WA.startX, WA.startZ, TEXT("ride")));
	G.Tap(TEXT("KeyE"));
	for (K = 0; K < 5; K++) G.Frame();
	TestTrue(TEXT("second entraînement terminé (0 saut sans faute sur 0)"), !C->MissionActive() && C->LastTrainingResult().body == "0 saut sans faute sur 0.");
	return true;
}

#endif
