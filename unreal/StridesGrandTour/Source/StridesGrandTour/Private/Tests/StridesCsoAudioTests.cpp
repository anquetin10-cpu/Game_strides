// Sons de l'épreuve (tranche T12, unreal/docs/parite/cso-ecarts.md §4) dans le moteur :
//  - Strides.Cso.AudioAssets : chaque son du manifeste Content/Data/cso_sounds.json (rendu hors ligne par
//    scripts/unreal/export-cso-sounds.mjs) est un USoundWave sous /Game/Audio/Cso dont le PCM importé
//    (GetImportedSoundWaveData) a la SHA-1 du rendu exporté, 48 kHz mono, le nombre d'échantillons du manifeste ; la
//    boucle du bus du public est en lecture bouclée et jouée même silencieuse ;
//  - Strides.Cso.Audio : AStridesHorse, AStridesCourse, AStridesPlayerController et AStridesActivityPost réels dans un monde
//    de test : le journal de UStridesCsoAudio reçoit, par le chemin du jeu, le son du lancement (notify), de l'entrée en
//    piste (applause 0,5 / 2,2), de la cloche, de la ligne de départ, de l'appel (snort puis hoof « sand » 1,4, même
//    image), de la réception (landing 1) et de l'obstacle franchi (tone 990), du cabré (neigh), de la descente (click) et de
//    l'élimination (bell 2), chacun avec son WAV ; bus du public : niveau 0,6 dans les 90 m de la carrière ou en épreuve,
//    0 au-delà hors épreuve ; gain établi à 0,6 × 0,08 ; cheer à 0,28. L'identité du journal au canal « audio » de toutes
//    les exécutions de cso_runs/ est prouvée par le cœur (testCsoSounds) : ici, le câblage des sources dans le jeu.
#include "Misc/AutomationTest.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/SecureHash.h"
#include "Sound/SoundWave.h"
#include "StridesActivityPost.h"
#include "StridesCore/CsoAudio.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCourse.h"
#include "StridesCsoAudio.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesPlayerController.h"
#include "StridesRider.h"
#include "StridesUnits.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesCsoAudioAssetsTest, "Strides.Cso.AudioAssets", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesCsoAudioAssetsTest::RunTest(const FString&)
{
	FString Text;
	std::string Err;
	strides::CsoSoundBank Bank;
	if (!TestTrue(TEXT("cso_sounds.json lu"), FFileHelper::LoadFileToString(Text, *(FPaths::ProjectContentDir() / TEXT("Data/cso_sounds.json"))) &&
		strides::csoSoundBankFromFile(std::string(TCHAR_TO_UTF8(*Text)), Bank, Err))) return false;
	int32 Ok = 0;
	for (const strides::CsoSoundEntry& E : Bank.sounds)
	{
		const FString Asset = UTF8_TO_TCHAR(E.asset.c_str());
		USoundWave* W = LoadObject<USoundWave>(nullptr, *Asset);
		if (!TestNotNull(*FString::Printf(TEXT("actif %s"), *Asset), W)) continue;
#if WITH_EDITOR
		TArray<uint8> Pcm;
		uint32 Rate = 0;
		uint16 Channels = 0;
		const bool bData = W->GetImportedSoundWaveData(Pcm, Rate, Channels);
		const FString Sha = FSHA1::HashBuffer(Pcm.GetData(), Pcm.Num()).ToString();
		const bool bSame = bData && Sha.Equals(UTF8_TO_TCHAR(E.pcmSha1.c_str()), ESearchCase::IgnoreCase) && Rate == (uint32)Bank.rate && Channels == 1 && Pcm.Num() == E.samples * 2;
		TestTrue(*FString::Printf(TEXT("%hs : PCM importé %d échantillons, %u Hz, %u voie(s), SHA-1 %s (manifeste %hs)"), E.key.c_str(), Pcm.Num() / 2, Rate, Channels, *Sha, E.pcmSha1.c_str()), bSame);
#endif
		TestTrue(*FString::Printf(TEXT("%hs : lecture bouclée %d (manifeste %d)"), E.key.c_str(), W->bLooping ? 1 : 0, E.loop ? 1 : 0), W->bLooping == E.loop);
		if (E.loop) TestTrue(TEXT("boucle du public jouée même silencieuse"), W->VirtualizationMode == EVirtualizationMode::PlayWhenSilent);
		TestTrue(*FString::Printf(TEXT("%hs : lecture en PCM (sans compression avec perte)"), E.key.c_str()), W->GetSoundAssetCompressionType() == ESoundAssetCompressionType::PCM);
		Ok++;
	}
	TestTrue(FString::Printf(TEXT("%d sons (dont la boucle du public)"), Ok), Ok == (int32)Bank.sounds.size() && Ok >= 15);
	AddInfo(FString::Printf(TEXT("%d sons de /Game/Audio/Cso identiques au rendu du jeu web (SHA-1 du PCM 16 bits)"), Ok));
	return true;
}

namespace StridesAudioTest
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
// Appels du journal depuis l'entrée K (écriture « fn(arguments)@fichier »).
TArray<FString> Since(const UStridesCsoAudio& A, int32 K)
{
	TArray<FString> R;
	for (int32 I = K; I < A.Journal().Num(); I++) R.Add(A.Journal()[I].Call);
	return R;
}
}  // namespace StridesAudioTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesCsoAudioTest, "Strides.Cso.Audio", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesCsoAudioTest::RunTest(const FString&)
{
	using namespace StridesAudioTest;
	FTestWorld W(TEXT("StridesCsoAudioTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	UStridesCsoAudio* Audio = W.World->GetSubsystem<UStridesCsoAudio>();
	if (!TestNotNull(TEXT("sous-système de données"), Data) || !TestNotNull(TEXT("sous-système des sons"), Audio)) return false;
	TestTrue(TEXT("manifeste des sons lu"), Audio->BankLoaded());
	const double Dt = 1.0 / 30;
	const strides::CsoCrowdParams& P = Audio->Bank().crowd;
	const strides::CsoActivity* Act = Data->CsoActivity();
	if (!TestNotNull(TEXT("activité du Pôle (cso_activity.json)"), Act)) return false;
	// Parcours du Pôle et poteau « Chrono » (comme StridesGameMode), cheval monté par le cavalier du joueur près du poteau.
	AStridesCourse* Course = W.World->SpawnActor<AStridesCourse>();
	{
		strides::CourseDesign D = Data->PoleCourse();
		D.x += Data->PoleArena.X;
		D.z += Data->PoleArena.Y;
		Course->Build(D, *Data);
	}
	AStridesActivityPost* Post = W.World->SpawnActor<AStridesActivityPost>();
	Post->Setup(*Act, Course);
	Post->PlayerName = TEXT("Alex");
	AStridesHorse* Horse = W.World->SpawnActor<AStridesHorse>();
	Horse->Course = Course;
	Horse->PlaceAt(Act->startX, Act->startZ + 4, PI, 0);
	AStridesPlayerController* PC = W.World->SpawnActor<AStridesPlayerController>();
	AStridesRider* Rider = W.World->SpawnActor<AStridesRider>(Horse->GetActorLocation() + FVector(0, 0, 90), FRotator::ZeroRotator);
	if (!TestTrue(TEXT("cavalier en selle, cheval possédé par le contrôleur"), PC && Rider && Rider->TryMount(PC) && PC->GetPawn() == Horse)) return false;
	auto Frame = [&]()
	{
		PC->StepCommands(Dt);
		Horse->Tick(Dt);
		Audio->Tick(Dt);  // fin d'image : ambience, horloge audio
	};
	auto Tap = [&](const TCHAR* Code)
	{
		PC->FeedKey(Code, true, false);
		Frame();
		PC->FeedKey(Code, false, false);
	};
	// Niveau du public au point suivi (position de l'acteur possédé), position rendue ensuite.
	bool bUpd = false;
	auto LevelAt = [&](double X, double Z)
	{
		const FVector Keep = Horse->GetActorLocation();
		Horse->SetActorLocation(StridesUnits::WebToUE(X, 0, Z));
		const double L = Audio->CrowdLevelAt(W.World, bUpd);
		Horse->SetActorLocation(Keep);
		return L;
	};
	// 1) Bus du public hors épreuve : niveau selon la distance au centre de la carrière (game.js:1553), gain établi.
	const double In50 = LevelAt(Data->PoleArena.X + 50, Data->PoleArena.Y), Out120 = LevelAt(Data->PoleArena.X + 120, Data->PoleArena.Y);
	TestTrue(FString::Printf(TEXT("niveau du public : %.2f à 50 m, %.2f à 120 m (hors épreuve)"), In50, Out120), bUpd && In50 == P.level && Out120 == 0);
	{
		const double Here = LevelAt(Act->startX, Act->startZ + 4);
		TestTrue(FString::Printf(TEXT("au poteau « Chrono » : niveau %.2f"), Here), Here == P.level);
	}
	// Point suivi au poteau (l'acteur du cheval n'est déplacé qu'à son pas) : 6 s d'images (ambience, horloge audio).
	Horse->SetActorLocation(StridesUnits::WebToUE(Act->startX, 0, Act->startZ + 4));
	for (int32 K = 0; K < 180; K++) Audio->Tick(Dt);
	TestTrue(FString::Printf(TEXT("dans les 90 m depuis 6 s : gain %.6f = 0,6 × 0,08 = %.3f (volume appliqué %.6f)"), Audio->CrowdGain(), P.level * P.scale, Audio->CrowdVolumeApplied()),
		FMath::Abs(Audio->CrowdGain() - P.level * P.scale) < 1e-4 && FMath::Abs(Audio->CrowdVolumeApplied() - Audio->CrowdGain()) < 1e-6);
	// 2) Action du joueur au poteau (touche E) : lancement (notify) puis click de l'action ; carte, Entrer en piste,
	//    applause de l'entrée et cloche.
	Audio->ResetJournal();
	Tap(TEXT("KeyE"));
	TestTrue(FString::Printf(TEXT("action au poteau : %s"), *FString::Join(Since(*Audio, 0), TEXT(" "))),
		Since(*Audio, 0) == (TArray<FString>{TEXT("notify()@gameplay/missions.js"), TEXT("click()@gameplay/interact.js")}));
	for (int32 K = 0; K < 60 && Course->Screen() == AStridesCourse::EScreen::None; K++) Frame();
	TestTrue(TEXT("carte de présentation ouverte, Entrer en piste"), Course->Screen() != AStridesCourse::EScreen::None && Course->PressScreenButton(TEXT("enter")));
	for (int32 K = 0; K < 120 && Course->Run()->step() != strides::CsoStep::Course; K++) Frame();
	const TArray<FString> Entry = Since(*Audio, 2);
	TestTrue(FString::Printf(TEXT("entrée en piste et cloche : %s"), *FString::Join(Entry, TEXT(" "))),
		Entry == (TArray<FString>{TEXT("applause(0.5, 2.2000000000000002)@gameplay/courses.js"), TEXT("bell()@gameplay/courses.js")}));
	const double Cheered = Audio->CrowdGain();
	TestTrue(FString::Printf(TEXT("applause (cheer) : gain du public %.4f après l'entrée (0,28 au plus)"), Cheered), Cheered > P.level * P.scale && Cheered <= P.cheerPeak + 1e-9);
	// Loin de la carrière mais en épreuve (game.course.kind === 'cso') : niveau 0,6.
	const double Far = LevelAt(Data->PoleArena.X + 300, Data->PoleArena.Y);
	TestTrue(FString::Printf(TEXT("en épreuve à 300 m : niveau %.2f"), Far), Far == P.level);
	const strides::CsoRunConfig& Cfg = Course->Run()->config();
	// 3) Ligne de départ franchie : bip.
	int32 K0 = Audio->Journal().Num();
	Horse->PlaceAt(Cfg.start.x - FMath::Sin(Cfg.start.rot) * 6, Cfg.start.z - FMath::Cos(Cfg.start.rot) * 6, Cfg.start.rot, 4.6);
	for (int32 K = 0; K < 60 && !Course->Run()->state().started; K++) Frame();
	TestTrue(FString::Printf(TEXT("départ : %s"), *FString::Join(Since(*Audio, K0), TEXT(" "))), Since(*Audio, K0).Contains(TEXT("tone(1568, 0.10000000000000001, \"sine\", 0.080000000000000002)@gameplay/courses.js")));
	// 4) Obstacle 1 : abord au galop dans son axe, SAUT dans la bonne zone : souffle et sabot à l'appel (même image), réception,
	//    obstacle franchi (tone 990).
	const std::vector<strides::CsoObstacle>& Obs = Course->Obstacles();
	int32 One = -1;
	for (int32 I = 0; I < (int32)Obs.size(); I++) if (Obs[I].label == "1") One = I;
	if (!TestTrue(TEXT("obstacle 1"), One >= 0)) return false;
	const strides::CsoObstacle& F1 = Obs[One];
	const double Head = FMath::Atan2(F1.n.x, F1.n.z);
	Horse->PlaceAt(F1.x - F1.n.x * 18, F1.z - F1.n.z * 18, Head, 6.2);
	K0 = Audio->Journal().Num();
	int64 JumpFrame = -1;
	bool bJumped = false, bLanded = false;
	for (int32 G = 0; G < 200 && !(bLanded && Course->Run()->state().next > 1); G++)
	{
		const strides::CsoTarget T = strides::csoTarget(Obs, Horse->CsoState(), Horse->JumpPower(), 0, true, Data->Jump(), Data->HorseParams());
		if (!bJumped && !Horse->IsJumping() && T.index == One && T.plan.zone == strides::Zone::Good && T.plan.ideal <= T.plan.L + 0.3) PC->TouchJump();
		Frame();
		if (!bJumped && Horse->LastEvents().Contains(TEXT("horse:jump"))) { bJumped = true; JumpFrame = (int64)GFrameCounter; }
		bLanded |= Horse->LastEvents().Contains(TEXT("horse:land"));
	}
	const TArray<FString> Jump = Since(*Audio, K0);
	const int32 Snort = Jump.IndexOfByKey(TEXT("snort()@game.js"));
	TestTrue(FString::Printf(TEXT("saut du 1 : %s"), *FString::Join(Jump, TEXT(" "))), bJumped && bLanded && Snort >= 0 && Jump.IsValidIndex(Snort + 1) &&
		Jump[Snort + 1] == TEXT("hoof(\"sand\", 1.3999999999999999)@game.js") && Jump.Contains(TEXT("landing(1)@game.js")) &&
		Jump.Contains(TEXT("tone(990, 0.059999999999999998, \"sine\", 0.059999999999999998)@gameplay/courses.js")));
	// Chaque appel du journal qui n'est pas cheer a trouvé son WAV.
	int32 Missing = 0;
	for (const FStridesSoundCall& L : Audio->Journal()) Missing += !L.bPlayed && !L.Call.StartsWith(TEXT("cheer("));
	TestEqual(TEXT("appels sans WAV"), Missing, 0);
	// 5) Cabré : abord sans appel du 2 → refus (neigh), compté (fault, crowdOoh).
	int32 Two = -1;
	for (int32 I = 0; I < (int32)Obs.size(); I++) if (Obs[I].label == "2") Two = I;
	if (Two >= 0)
	{
		const strides::CsoObstacle& F2 = Obs[Two];
		Horse->PlaceAt(F2.x - F2.n.x * 14, F2.z - F2.n.z * 14, FMath::Atan2(F2.n.x, F2.n.z), 6.2);
		K0 = Audio->Journal().Num();
		for (int32 G = 0; G < 150; G++) Frame();
		const TArray<FString> Ref = Since(*Audio, K0);
		TestTrue(FString::Printf(TEXT("refus au 2 : %s"), *FString::Join(Ref, TEXT(" "))), Ref.Contains(TEXT("neigh()@game.js")) && Ref.Contains(TEXT("fault()@gameplay/courses.js")) &&
			Ref.Contains(TEXT("crowdOoh()@gameplay/courses.js")));
	}
	// 6) Descente par l'action du joueur (interact.trigger : click), puis élimination (bell 2).
	K0 = Audio->Journal().Num();
	Tap(TEXT("KeyE"));
	Frame();
	const TArray<FString> Out = Since(*Audio, K0);
	TestTrue(FString::Printf(TEXT("descente : %s"), *FString::Join(Out, TEXT(" "))), Out.Num() >= 2 && Out[0] == TEXT("click()@gameplay/interact.js") && Out.Contains(TEXT("bell(2)@gameplay/courses.js")));
	// 7) cheer : gain du bus à 0,28 tout de suite.
	Audio->Call(strides::CsoCall{"cheer", {}}, "gameplay/courses.js");
	TestTrue(FString::Printf(TEXT("cheer : gain %.4f"), Audio->CrowdGain()), FMath::Abs(Audio->CrowdGain() - P.cheerPeak) < 1e-12);
	AddInfo(FString::Printf(TEXT("journal des sons en jeu : %d appels, image du saut %lld"), Audio->Journal().Num(), JumpFrame));
	return true;
}
