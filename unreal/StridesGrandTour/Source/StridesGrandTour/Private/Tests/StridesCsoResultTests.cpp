// Arrivée, bilan, classement simulé, Recommencer, meilleur temps (tranche T11, unreal/docs/parite/cso-ecarts.md §4) dans
// le moteur, par le chemin du jeu :
//  - Strides.Cso.Result : activité lancée (AStridesCourse::StartActivity, puissance de saut du cheval du joueur, Comète :
//    pas de dialogue de l'entraîneur), exécutions t11-refus et t11-manche-2 de unreal/core/tests/oracles/cso_runs/ (fr
//    et en) rejouées image par image (StridesCsoRunReplay) ; boutons des cartes (Entrer en piste, Recommencer, Quitter
//    l'épreuve) touchés par le widget des cartes (UStridesCsoScreens, 844 × 390) aux images où le jeu web les touche.
//    Comparés au jeu web : étape après chaque image, appels d'interface et sons (courses.js, lancement et fin de la
//    mission : big, notify, clearHint, closeDialog) ; carte de bilan à son ouverture (canal « bl » : kicker, titre,
//    grille, tableau, boutons) et affichée par le widget (carte 3, titre, ligne du joueur) ; meilleur temps (ep.bt).
//    Recommencer : carte fermée, barre du 2 renversée avant le geste remise sur ses taquets à l'entrée en piste (barres
//    remises par le jeu : AStridesCourse::FlushRunCalls), annonce du dossard, cloche, manche 2. Quitter l'épreuve :
//    meilleur temps (chrono + pénalités) écrit dans l'emplacement de sauvegarde du test SANS SaveNow (F5), relu sur le
//    disque au bit près ; mission terminée, simulation reprise.
#include "Misc/AutomationTest.h"
#include "Blueprint/UserWidget.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/FileHelper.h"
#include "StridesCore/CsoFences.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/MiniJson.h"
#include "StridesCore/Ranking.h"
#include "StridesCore/SaveGame.h"
#include "StridesCourse.h"
#include "StridesCsoRunReplay.h"
#include "StridesCsoScreens.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesOracleRuns.h"
#include "StridesSaveSubsystem.h"

namespace StridesResultTest
{
const TCHAR* TestSlot = TEXT("strides_test_t11");

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

FString CallLine(const J& C)
{
	FString L = UTF8_TO_TCHAR(C["fn"].s.c_str());
	for (const J& A : C["args"].a) L += TEXT(" | ") + (A.t == J::Num ? FString::SanitizeFloat(A.n) : FString(UTF8_TO_TCHAR(A.s.c_str())));
	return L;
}
FString U(const std::string& S) { return UTF8_TO_TCHAR(S.c_str()); }

// Carte de bilan du jeu comparée à la carte relevée dans le DOM du web : vide si identique, sinon la première différence.
FString CardDiff(const strides::CsoResultCard& C, const J& D)
{
	if (C.kicker != D["kicker"].s) return FString::Printf(TEXT("kicker « %s » / « %s »"), *U(C.kicker), *U(D["kicker"].s));
	if (C.title != D["title"].s) return FString::Printf(TEXT("titre « %s » / « %s »"), *U(C.title), *U(D["title"].s));
	if (C.rows.size() != D["rows"].a.size()) return TEXT("lignes de la grille");
	for (size_t I = 0; I < C.rows.size(); I++)
		if (C.rows[I].first != D["rows"][I][0].s || C.rows[I].second != D["rows"][I][1].s) return FString::Printf(TEXT("grille « %s » / « %s »"), *U(C.rows[I].second), *U(D["rows"][I][1].s));
	if (C.table.size() != D["table"].a.size()) return TEXT("lignes du tableau");
	for (size_t I = 0; I < C.table.size(); I++)
	{
		const strides::CsoResultRow& R = C.table[I];
		const J& Td = D["table"][I]["td"];
		const std::vector<std::string> Got = {std::to_string(R.rank), R.name, R.pts, R.time, R.prize};
		bool bSame = Td.a.size() == Got.size() && R.me == D["table"][I]["me"].b;
		for (size_t K = 0; bSame && K < Got.size(); K++) bSame = Td[K].s == Got[K];
		if (!bSame) return FString::Printf(TEXT("ligne %d du tableau (%s)"), (int32)I + 1, *U(R.name));
	}
	if (C.buttons.size() != D["buttons"].a.size()) return TEXT("boutons");
	for (size_t I = 0; I < C.buttons.size(); I++)
		if (C.buttons[I].id != D["buttons"][I][0].s || C.buttons[I].label != D["buttons"][I][1].s || C.buttons[I].primary != (D["buttons"][I][2].s.find("primary") != std::string::npos))
			return FString::Printf(TEXT("bouton %s"), *U(C.buttons[I].id));
	return FString();
}
}  // namespace StridesResultTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesCsoResultTest, "Strides.Cso.Result", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesCsoResultTest::RunTest(const FString&)
{
	using namespace StridesResultTest;
	const TArray<StridesOracleRuns::FEntry> Runs = StridesOracleRuns::List();
	if (!TestTrue(TEXT("index des oracles cso_runs lu"), Runs.Num() > 0)) return false;
	FTestWorld W(TEXT("StridesCsoResultTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	UStridesSaveSubsystem* Save = W.GI->GetSubsystem<UStridesSaveSubsystem>();
	if (!TestNotNull(TEXT("sous-systèmes"), Data) || !TestNotNull(TEXT("sauvegarde"), Save) || !TestNotNull(TEXT("activité du Pôle"), Data->CsoActivity()) ||
		!TestNotNull(TEXT("noms des engagés (cso_ranking.json)"), Data->RankNames()) || !TestTrue(TEXT("styles du bilan (cso_result_style.json)"), Data->CsoResultStyle().IsValid())) return false;
	// Emplacement de sauvegarde du test (jamais celui du joueur).
	Save->SlotName = TestSlot;
	UStridesCsoScreens* S = CreateWidget<UStridesCsoScreens>(W.World, UStridesCsoScreens::StaticClass());
	AStridesHorse* Horse = W.World->SpawnActor<AStridesHorse>();
	if (!TestNotNull(TEXT("widget des cartes"), S) || !TestNotNull(TEXT("cheval du joueur"), Horse)) return false;
	const double Power = Horse->JumpPower();
	auto Info = [this](const FString& M) { AddInfo(M); UE_LOG(LogTemp, Display, TEXT("Strides.Cso.Result : %s"), *M); };
	TArray<FString> Done;
	int32 Frames = 0, Bilans = 0, Records = 0, Retries = 0, HudCmp = 0, AudioCmp = 0;
	for (const StridesOracleRuns::FEntry& Entry : Runs)
	{
		if (!Entry.Id.StartsWith(TEXT("t11-"))) continue;
		FString Text;
		if (!TestTrue(FString::Printf(TEXT("cso_runs/%s lu"), *Entry.File), FFileHelper::LoadFileToString(Text, *StridesOracleRuns::Path(Entry)))) return false;
		const std::string Utf8 = TCHAR_TO_UTF8(*Text);
		const J R = JParser(Utf8).parse();
		const std::string Id = R["id"].s, Lang = R["lang"].s;
		const bool bFr = Lang == "fr";
		const J& Su = R["setup"];
		// Sauvegarde neuve (page d'export du web : aucun meilleur temps au lancement).
		UGameplayStatics::DeleteGameInSlot(TestSlot, 0);
		Save->MutableBestTimes().clear();
		AStridesCourse* Course = W.World->SpawnActor<AStridesCourse>();
		strides::CourseDesign D = Data->PoleCourse();
		D.x += Data->PoleArena.X;
		D.z += Data->PoleArena.Y;
		Course->Build(D, *Data);
		Course->Lang = U(Lang);
		S->Bind(Course);
		S->SetViewCssForTest(FVector2D(844, 390));
		if (!TestTrue(TEXT("activité lancée"), Course->StartActivity(U(Su["playerName"].s), U(Su["horseName"].s), Power, 0.0))) return false;
		int32 HudAt = 0, AudioAt = 0, RunBad = 0;
		auto Fail = [&](int32 F, const FString& What) { if (++RunBad < 5) AddError(FString::Printf(TEXT("%hs (%hs) image %d : %s"), Id.c_str(), Lang.c_str(), F, *What)); };
		// Appels de l'interface et sons : ceux de courses.js, et ceux de missions.js que le déroulé du cœur porte (lancement :
		// grand message et « notify » ; étapes : clearHint ; fin de la mission : clearHint, closeDialog).
		auto Compare = [&](const J& Calls, bool bHud, int32 F, bool bLaunch)
		{
			TArray<FString> Want;
			for (const J& C : Calls.a)
			{
				const bool bMis = C["src"].s == "gameplay/missions.js";
				const std::string& Fn = C["fn"].s;
				const bool bKeep = C["src"].s == "gameplay/courses.js" ||
					(bHud ? bMis && (Fn == "clearHint" || Fn == "closeDialog" || (bLaunch && Fn == "big")) : bLaunch && bMis && Fn == "notify");
				if (bKeep) Want.Add(CallLine(C));
			}
			const TArray<FString>& Log = bHud ? Course->HudLog() : Course->AudioLog();
			int32& At = bHud ? HudAt : AudioAt;
			TArray<FString> Got;
			for (; At < Log.Num(); At++) Got.Add(Log[At]);
			(bHud ? HudCmp : AudioCmp) += Want.Num();
			if (Got != Want) Fail(F, FString::Printf(TEXT("%s « %s » / web « %s »"), bHud ? TEXT("interface") : TEXT("sons"), *FString::Join(Got, TEXT(" ; ")), *FString::Join(Want, TEXT(" ; "))));
		};
		Compare(Su["calls"]["hud"], true, -1, true);
		Compare(Su["calls"]["audio"], false, -1, true);
		int32 HudRetry = -1, AudioRetry = -1, RailsRetry = -1, AttemptEnd = 0;
		bool bRailBack = false, bBestOnDisk = false;
		for (const J& Fr : R["frames"].a)
		{
			const int32 F = (int32)Fr["f"].num();
			const std::string Ui = Fr["in"]["ui"].t == J::Str ? Fr["in"]["ui"].s : std::string();
			if (Ui == "cso-retry")
			{
				// Barre du 2 renversée (cœur, comme une vraie faute) avant « Recommencer » : l'entrée en piste doit la remettre.
				strides::CsoFenceOut KO;
				strides::csoKnock(Course->Obstacles(), Course->FenceStates(), 1, 0, 1, 1, 0.19, 0, KO);
				if (!Course->FenceStates()[1].knocked) Fail(F, TEXT("barre du 2 non renversée avant Recommencer"));
				HudRetry = Course->HudLog().Num();
				AudioRetry = Course->AudioLog().Num();
				RailsRetry = Course->RailResets();
			}
			bool bUi = true;
			strides::CsoCadence Cad;
			if (!StridesCsoRunReplay::Frame(Course, Fr, S, bUi, Cad))
			{
				if (Course->MissionActive()) Fail(F, TEXT("mission terminée dans le web, en cours dans le jeu"));
				continue;
			}
			Frames++;
			if (!bUi) Fail(F, FString::Printf(TEXT("bouton « %hs » absent de la carte affichée"), Ui.c_str()));
			if (Ui == "cso-retry" || Ui == "cso-done")
			{
				S->Refresh();
				if (S->CardShown() != 0) Fail(F, TEXT("carte de bilan encore affichée après le bouton"));
				Retries += Ui == "cso-retry";
			}
			Compare(Fr["hud"], true, F, false);
			Compare(Fr["audio"], false, F, false);
			const J& Ep = Fr["ep"];
			const strides::CsoRun& Run = *Course->Run();
			if ((int)Ep["i1"].num() != Run.stepIndex()) Fail(F, FString::Printf(TEXT("étape %d / %d"), Run.stepIndex(), (int)Ep["i1"].num()));
			if (!Fr["run"].isNull()) AttemptEnd = (int32)Fr["run"]["course"]["attempt"].num();
			// Bilan ouvert à cette image : carte du jeu identique au DOM du web, affichée par le widget.
			if (!Fr["bl"].isNull())
			{
				Bilans++;
				const FString Why = CardDiff(Course->ResultCard(), Fr["bl"]);
				if (Course->Screen() != AStridesCourse::EScreen::Result) Fail(F, TEXT("bilan non ouvert"));
				if (!Why.IsEmpty()) Fail(F, TEXT("carte de bilan : ") + Why);
				S->Refresh();
				const TArray<FString> Shown = S->Describe();
				const strides::CsoResultCard& Rc = Course->ResultCard();
				const bool bMeRow = Shown.ContainsByPredicate([](const FString& L) { return L.StartsWith(TEXT("ligne ")) && L.EndsWith(TEXT(" (me)")); });
				// (kicker affiché en capitales, text-transform: uppercase du relevé ; son texte est comparé au DOM ci-dessus)
				const bool bKicker = Shown.ContainsByPredicate([](const FString& L) { return L.StartsWith(TEXT("kicker=")) && L.Len() > 7; });
				if (S->CardShown() != 3 || !Shown.Contains(TEXT("title=") + U(Rc.title)) || !bKicker || !bMeRow)
					Fail(F, TEXT("carte de bilan non affichée par le widget : ") + FString::Join(Shown, TEXT(" ; ")));
				Info(FString::Printf(TEXT("%hs (%hs) image %d : bilan « %s » · « %s » identique au DOM du web, %d lignes au tableau"), Id.c_str(), Lang.c_str(), F, *U(Rc.kicker), *U(Rc.title), (int32)Rc.table.size()));
			}
			// Meilleur temps écrit par l'étape d'enregistrement : dans l'emplacement du test, relu sur le disque.
			if (Ep.o.count("bt"))
			{
				Records++;
				const double Want = Ep["bt"].num();
				double Mem = -1, Last = -1;
				strides::SaveGame Disk;
				std::string Err;
				const UStridesSaveGame* Sv = Cast<UStridesSaveGame>(UGameplayStatics::LoadGameFromSlot(TestSlot, 0));
				const bool bRead = Sv && strides::SaveGame::fromJson(TCHAR_TO_UTF8(*Sv->Json), Disk, Err);
				bBestOnDisk = bRead && Disk.bestTimes.count("cso_train") && Disk.bestTimes["cso_train"] == Want;
				if (!bBestOnDisk || !Save->BestTime(TEXT("cso_train"), Mem) || Mem != Want || !Course->LastRecord(Last) || Last != Want)
					Fail(F, FString::Printf(TEXT("meilleur temps : disque %s, mémoire %.17g, jeu %.17g / web %.17g"), bRead ? TEXT("lu") : TEXT("illisible"), Mem, Last, Want));
				Info(FString::Printf(TEXT("%hs (%hs) image %d : bestTimes.cso_train = %.17g s écrit dans %s sans SaveNow, relu sur le disque"), Id.c_str(), Lang.c_str(), F, Want, TestSlot));
			}
			if (RailsRetry >= 0 && !bRailBack && Course->RailResets() > RailsRetry && !Course->FenceStates()[1].knocked) bRailBack = true;
		}
		if (HudRetry >= 0)
		{
			TArray<FString> After;
			for (int32 K = HudRetry; K < Course->HudLog().Num(); K++) After.Add(Course->HudLog()[K]);
			const FString Bib = bFr ? TEXT(" · Test | et Comète | 2400.0") : TEXT(" · Test | and Comète | 2400.0");
			const bool bAnnounce = After.ContainsByPredicate([&](const FString& L) { return L.StartsWith(TEXT("big | N")) && L.EndsWith(Bib); });
			const bool bBell = After.ContainsByPredicate([&](const FString& L) { return L.StartsWith(bFr ? TEXT("big | CLOCHE |") : TEXT("big | BELL |")); });
			bool bBellSound = false;
			for (int32 K = AudioRetry; K < Course->AudioLog().Num(); K++) bBellSound |= Course->AudioLog()[K] == TEXT("bell");
			TestTrue(FString::Printf(TEXT("%hs (%hs) : Recommencer : barres remises (%d remises, barre du 2 sur ses taquets), annonce du dossard, cloche, manche %d"), Id.c_str(), Lang.c_str(), Course->RailResets() - RailsRetry, AttemptEnd),
				bRailBack && bAnnounce && bBell && bBellSound && AttemptEnd == 2);
		}
		TestTrue(FString::Printf(TEXT("%hs (%hs) : mission terminée après « Quitter l'épreuve », meilleur temps sur le disque"), Id.c_str(), Lang.c_str()), !Course->MissionActive() && Course->Run()->finished() && bBestOnDisk);
		if (RunBad == 0) Done.Add(FString::Printf(TEXT("%hs %hs"), Id.c_str(), Lang.c_str()));
		S->Bind(nullptr);
		Course->Destroy();
	}
	UGameplayStatics::DeleteGameInSlot(TestSlot, 0);
	for (const TCHAR* Id : {TEXT("t11-refus"), TEXT("t11-manche-2")})
		for (const TCHAR* L : {TEXT("fr"), TEXT("en")}) TestTrue(FString::Printf(TEXT("exécution %s (%s) rejouée sans écart"), Id, L), Done.Contains(FString::Printf(TEXT("%s %s"), Id, L)));
	TestTrue(FString::Printf(TEXT("bilans comparés (%d), Recommencer (%d), meilleurs temps (%d)"), Bilans, Retries, Records), Bilans >= 6 && Retries == 2 && Records == 4);
	Info(FString::Printf(TEXT("%d exécutions sans écart, %d images, %d appels d'interface et %d sons comparés, %d bilans, %d Recommencer, %d meilleurs temps"), Done.Num(), Frames, HudCmp, AudioCmp, Bilans, Retries, Records));
	return true;
}
