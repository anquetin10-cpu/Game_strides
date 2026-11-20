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
//    disque au bit près ; mission terminée, simulation reprise. t11-trois-barres (contrôle adverse de T11 : trois barres,
//    joueur 14e, fautes sur deux lignes) : même rejeu, bilan affiché par le widget.
//  - Strides.Cso.ResultLayout : mise en page de la carte de bilan comparée au navigateur (voir ce test plus bas).
#include "Misc/AutomationTest.h"
#include "Blueprint/UserWidget.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
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
	for (const TCHAR* Id : {TEXT("t11-refus"), TEXT("t11-manche-2"), TEXT("t11-trois-barres")})
		for (const TCHAR* L : {TEXT("fr"), TEXT("en")}) TestTrue(FString::Printf(TEXT("exécution %s (%s) rejouée sans écart"), Id, L), Done.Contains(FString::Printf(TEXT("%s %s"), Id, L)));
	TestTrue(FString::Printf(TEXT("bilans comparés (%d), Recommencer (%d), meilleurs temps (%d)"), Bilans, Retries, Records), Bilans >= 8 && Retries == 2 && Records == 6);
	Info(FString::Printf(TEXT("%d exécutions sans écart, %d images, %d appels d'interface et %d sons comparés, %d bilans, %d Recommencer, %d meilleurs temps"), Done.Num(), Frames, HudCmp, AudioCmp, Bilans, Retries, Records));
	return true;
}

// Mise en page du bilan (contrôle adverse de T11) dans le moteur : carte du cœur pour chaque état posé de
// unreal/core/tests/oracles/cso_result.json (entrées du bilan lues par le chemin du jeu : AStridesCourse::StartRun puis
// strides::csoResultInputOf, état de la manche, joueur et cheval de l'état), posée dans le widget des cartes
// (UStridesCsoScreens::SetResultForTest) à 844 × 390 et 667 × 308, en français et en anglais, et comparée à la mise en
// page du navigateur (cso_result_layout.json, scripts/unreal/export-cso-result.mjs --screens) : lignes de chaque case de
// la grille mesurées par le moteur (police étalonnée sur le relevé de base) ; boîtes du kicker, du titre, de la grille,
// du tableau, de la ligne du joueur et des cellules (positions verticales et hauteurs exigées au dixième de px ; colonnes
// du tableau, réparties sur des largeurs de texte estimées : écart borné) ; hauteur de défilement, classe more en haut et
// le corps défilé jusqu'en bas.
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesCsoResultLayoutTest, "Strides.Cso.ResultLayout", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesCsoResultLayoutTest::RunTest(const FString&)
{
	using namespace StridesResultTest;
	const FString Ora = FPaths::GetPath(StridesOracleRuns::Dir());
	FString LayText, CardText;
	if (!TestTrue(TEXT("cso_result_layout.json lu"), FFileHelper::LoadFileToString(LayText, *(Ora / TEXT("cso_result_layout.json")))) ||
		!TestTrue(TEXT("cso_result.json lu"), FFileHelper::LoadFileToString(CardText, *(Ora / TEXT("cso_result.json"))))) return false;
	const std::string LayUtf8 = TCHAR_TO_UTF8(*LayText), CardUtf8 = TCHAR_TO_UTF8(*CardText);
	const J Lay = JParser(LayUtf8).parse();
	const J Cards = JParser(CardUtf8).parse();
	FTestWorld W(TEXT("StridesCsoResultLayoutTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	if (!TestNotNull(TEXT("sous-système des données"), Data) || !TestNotNull(TEXT("noms des engagés"), Data->RankNames()) || !TestTrue(TEXT("styles du bilan"), Data->CsoResultStyle().IsValid())) return false;
	UStridesCsoScreens* S = CreateWidget<UStridesCsoScreens>(W.World, UStridesCsoScreens::StaticClass());
	if (!TestNotNull(TEXT("widget des cartes"), S)) return false;
	auto Info = [this](const FString& M) { AddInfo(M); UE_LOG(LogTemp, Display, TEXT("Strides.Cso.ResultLayout : %s"), *M); };
	int32 Views = 0, LinesSame = 0, Boxes = 0, FlowBad = 0, ScrollBad = 0, Wrapped = 0, Nine = 0;
	double WorstY = 0, WorstX = 0;
	TArray<FString> LineDiffs, ColWorst;
	for (const char* Lang : {"fr", "en"})
	{
		AStridesCourse* Course = W.World->SpawnActor<AStridesCourse>();
		strides::CourseDesign D = Data->PoleCourse();
		D.x += Data->PoleArena.X;
		D.z += Data->PoleArena.Y;
		Course->Build(D, *Data);
		Course->Lang = U(Lang);
		if (!TestTrue(TEXT("épreuve lancée"), Course->StartRun(TEXT("Test"), TEXT("Comète")))) return false;
		for (const J& L : Lay[Lang].a)
		{
			const J* Cj = nullptr;
			for (const J& Cv : Cards[Lang].a)
				if (Cv["id"].s == L["id"].s) Cj = &Cv;
			if (!TestNotNull(TEXT("état de cso_result.json"), Cj)) continue;
			const J& St = (*Cj)["state"];
			strides::CsoResultInput In = strides::csoResultInputOf(*Course->Run());
			In.state.t = St["t"].num();
			In.state.faults = (int)St["faults"].num();
			In.state.timeFaults = (int)St["timeFaults"].num();
			In.state.attempt = (int)St["attempt"].num();
			In.state.eliminated = !St["eliminated"].isNull();
			In.state.eliminatedReason = In.state.eliminated ? St["eliminated"].s : std::string();
			In.state.log.clear();
			for (const J& Lg : (*Cj)["log"].a) In.state.log.push_back({Lg[0].s, Lg[1].s, Lg[2].isNull() ? "" : Lg[2].s, Lg[3].isNull() ? "" : Lg[3].s});
			In.playerName = (*Cj)["playerName"].s;
			In.hasHorse = !(*Cj)["horseName"].isNull();
			In.horseName = In.hasHorse ? (*Cj)["horseName"].s : std::string();
			const strides::CsoResultCard Card = strides::csoResultCard(In, *Data->RankNames(), Course->Texts(), Course->RunLang());
			const FString Id = FString::Printf(TEXT("%hs (%hs, %dx%d)"), L["id"].s.c_str(), Lang, (int32)L["viewport"][0].num(), (int32)L["viewport"][1].num());
			const FString Why = CardDiff(Card, L["dom"]);
			if (!Why.IsEmpty()) { AddError(Id + TEXT(" : carte du cœur différente du DOM : ") + Why); continue; }
			S->SetResultForTest(Card, U(Lang));
			S->SetViewCssForTest(FVector2D(L["viewport"][0].num(), L["viewport"][1].num()));
			S->Refresh();
			const strides::CsoResultLayout* Ul = S->ResultLayoutShown();
			const strides::CsoResultLayoutIn* Ui = S->ResultLayoutInput();
			if (!TestTrue(Id + TEXT(" : bilan affiché, mise en page calculée"), S->CardShown() == 3 && Ul && Ui)) continue;
			Views++;
			// Lignes de chaque case de la grille : moteur / web (hauteur de la boîte du web / hauteur d'une ligne du relevé).
			bool bLines = Ui->kickerLines == FMath::RoundToInt(L["kicker"][3].num() / (Ul->kicker.h / Ui->kickerLines)) && Ui->titleLines == FMath::RoundToInt(L["title"][3].num() / (Ul->title.h / Ui->titleLines));
			FString Lu, Lw;
			for (size_t I = 0; I < Ul->values.size() && I < L["values"].a.size(); I++)
			{
				const int32 Nu = FMath::Max(Ui->keyLines[I], Ui->valueLines[I]);
				const int32 Nw = FMath::RoundToInt(L["values"][I][3].num() / (Ul->values[I].h / Nu));
				Lu += FString::Printf(TEXT("%s%d"), I ? TEXT(",") : TEXT(""), Nu);
				Lw += FString::Printf(TEXT("%s%d"), I ? TEXT(",") : TEXT(""), Nw);
				bLines &= Nu == Nw;
				Wrapped += Nw > 1 && I == 1;
			}
			Nine += L["rows"].a.size() == 9;
			if (bLines) LinesSame++;
			else LineDiffs.Add(FString::Printf(TEXT("%s : lignes de la grille %s / web %s (titre %d, kicker %d)"), *Id, *Lu, *Lw, Ui->titleLines, Ui->kickerLines));
			// Boîtes : flux (y, hauteur) exigé au dixième de px près quand les lignes sont les mêmes ; colonnes (x,
			// largeur) relevées (police du moteur).
			double VY = 0, VX = 0;
			FString VXAt;
			auto Cmp = [&](const FString& Part, const J& R)
			{
				const FVector4 B = S->BoxOf(Part);
				VY = FMath::Max(VY, FMath::Max(FMath::Abs(B.Y - R[1].num()), FMath::Abs(B.W - R[3].num())));
				const double Dx = FMath::Max(FMath::Abs(B.X - R[0].num()), FMath::Abs(B.Z - R[2].num()));
				if (Dx > VX) { VX = Dx; VXAt = FString::Printf(TEXT("%s x %.1f / %.1f, largeur %.1f / %.1f"), *Part, B.X, R[0].num(), B.Z, R[2].num()); }
				Boxes++;
			};
			Cmp(TEXT("kicker"), L["kicker"]);
			Cmp(TEXT("title"), L["title"]);
			for (size_t I = 0; I < L["keys"].a.size(); I++) { Cmp(FString::Printf(TEXT("k%d"), (int32)I), L["keys"][I]); Cmp(FString::Printf(TEXT("v%d"), (int32)I), L["values"][I]); }
			Cmp(TEXT("table"), L["table"]);
			for (size_t I = 0; I < L["rows"].a.size(); I++)
			{
				if (L["rows"][I]["me"].b) Cmp(TEXT("me"), L["rows"][I]["rect"]);
				for (size_t K = 0; K < L["rows"][I]["cells"].a.size(); K++) Cmp(FString::Printf(TEXT("r%d.%d"), (int32)I, (int32)K), L["rows"][I]["cells"][K]);
			}
			if (bLines)
			{
				WorstY = FMath::Max(WorstY, VY);
				if (VY > 0.15) { FlowBad++; AddError(FString::Printf(TEXT("%s : flux à %.2f px du navigateur"), *Id, VY)); }
				// Défilement : hauteur, classe more en haut, défilé jusqu'en bas (scrollTop maximal du navigateur).
				const bool bTop = S->CardMore() == L["more"].b;
				S->ScrollCardForTest(1e6);
				const bool bScroll = Ul->scrollHeight == (int)L["body"]["scrollHeight"].num() && S->CardScrollOffset() == L["bottom"]["scrollTop"].num() && S->CardMore() == L["bottom"]["more"].b && bTop;
				if (!bScroll) { ScrollBad++; AddError(FString::Printf(TEXT("%s : défilement %d / %g, bas %.1f / %g, more %d / %d"), *Id, Ul->scrollHeight, L["body"]["scrollHeight"].num(), S->CardScrollOffset(), L["bottom"]["scrollTop"].num(), S->CardMore(), L["bottom"]["more"].b)); }
			}
			WorstX = FMath::Max(WorstX, VX);
			ColWorst.Add(FString::Printf(TEXT("%s : colonnes à %.2f px (%s)"), *Id, VX, *VXAt));
		}
		S->ClearResultForTest();
		S->Refresh();
		Course->Destroy();
	}
	for (const FString& Ld : LineDiffs) Info(Ld);
	for (const FString& Cw : ColWorst) UE_LOG(LogTemp, Display, TEXT("Strides.Cso.ResultLayout : %s"), *Cw);
	Info(FString::Printf(TEXT("%d vues : %d avec les mêmes lignes que le navigateur (dont %d avec les fautes sur plusieurs lignes, %d avec le joueur au-delà du 8e) ; %d boîtes ; flux à %.3f px au plus du navigateur ; colonnes à %.2f px au plus (police du moteur)"),
		Views, LinesSame, Wrapped, Nine, Boxes, WorstY, WorstX));
	TestTrue(TEXT("vues comparées (60 attendues)"), Views == 60);
	// Lignes : valeurs passées à la ligne à la largeur de leur colonne divisée par le rapport Geist / police du moteur
	// étalonné sur le relevé de base (60 vues sur 60 comme le navigateur à l'export du 20/11/2026).
	TestTrue(TEXT("lignes de chaque case de la grille identiques au navigateur dans toutes les vues"), LinesSame == Views);
	TestTrue(TEXT("flux et défilement identiques au navigateur quand les lignes sont les mêmes"), FlowBad == 0 && ScrollBad == 0);
	// Colonnes du tableau : réparties comme le navigateur sur des largeurs de texte estimées (police du moteur étalonnée sur
	// le relevé de base) ; écart déclaré (inventaire cso.bilan), borné ici pour détecter une régression.
	TestTrue(FString::Printf(TEXT("colonnes du tableau à moins de 9 px du navigateur (%.2f px)"), WorstX), WorstX < 9.0);
	return true;
}
