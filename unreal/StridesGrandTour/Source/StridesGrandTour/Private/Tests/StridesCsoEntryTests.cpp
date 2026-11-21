// Entrée dans l'épreuve (tranche T10, unreal/docs/parite/cso-ecarts.md §4) dans le moteur, par le chemin du jeu :
//  - Strides.Cso.Entry : poteau « Chrono » (AStridesActivityPost posé avec Content/Data/cso_activity.json) : action
//    proposée ou non aux 84 positions × modes × mission de l'oracle unreal/core/tests/oracles/cso_entry.json (fr et en,
//    libellé) ; action du joueur (touche E des commandes du web → AStridesPlayerController::DoAction) à cheval à 4 m au
//    sud de l'entrée (geste de la recette tests/e2e/cso-shots.mjs) : grand message du lancement et son « notify », étapes
//    jusqu'à la présentation ; carte ouverte (UStridesCsoScreens, 844 × 390) : contenu identique au DOM relevé dans le web
//    (kicker, titre, grille, règles, boutons ; plan : kicker, titre, légende, primitives, bouton), boîtes du relevé ;
//    simulation suspendue et commandes gelées tant que la carte est ouverte (cheval immobile malgré la touche W) ; Voir
//    le plan, Retour, Entrer en piste touchés par le widget ; entrée en piste : annonce « N° … · Alex / et Comète », cloche ;
//  - Strides.Cso.EntryDialog : cheval trop faible pour les hauteurs de l'épreuve (cas de l'oracle) : dialogue de
//    l'entraîneur (qui, initiales, texte identiques à l'oracle), affiché par le widget, simulation suspendue ; fermé par
//    l'action (touche E) ; présentation ensuite.
#include "Misc/AutomationTest.h"
#include "Blueprint/UserWidget.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "StridesActivityPost.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/MiniJson.h"
#include "StridesCourse.h"
#include "StridesCsoScreens.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesPlayerController.h"
#include "StridesRider.h"
#include "StridesUnits.h"

namespace StridesEntryTest
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

// Monde du jeu pour l'entrée : parcours du Pôle (comme AStridesWorldDirector), poteau de l'activité (comme
// AStridesGameMode), cheval monté par le cavalier du contrôleur du joueur, posé 4 m au sud de l'entrée, cap π.
struct FEntry
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
	// Touche du web (code physique) enfoncée pour une image puis relâchée.
	void Tap(const TCHAR* Code)
	{
		PC->FeedKey(Code, true, false);
		Frame();
		PC->FeedKey(Code, false, false);
	}
};

bool LoadOracle(J& Out, FString& Why)
{
	const FString File = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../core/tests/oracles/cso_entry.json"));
	FString Text;
	if (!FFileHelper::LoadFileToString(Text, *File)) { Why = File; return false; }
	static std::string Keep;
	Keep = TCHAR_TO_UTF8(*Text);
	Out = JParser(Keep).parse();
	return true;
}
FString U(const std::string& S) { return UTF8_TO_TCHAR(S.c_str()); }
}  // namespace StridesEntryTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesCsoEntryTest, "Strides.Cso.Entry", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesCsoEntryTest::RunTest(const FString&)
{
	using namespace StridesEntryTest;
	J Ora;
	FString Why;
	if (!TestTrue(FString::Printf(TEXT("oracle cso_entry.json lu (%s)"), *Why), LoadOracle(Ora, Why))) return false;
	FTestWorld W(TEXT("StridesCsoEntryTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	if (!TestNotNull(TEXT("sous-système de données"), Data) || !TestNotNull(TEXT("activité du Pôle (cso_activity.json)"), Data->CsoActivity()) ||
		!TestTrue(TEXT("styles des cartes (cso_screens_style.json)"), Data->CsoScreensStyle().IsValid())) return false;
	FEntry E;
	if (!TestTrue(TEXT("parcours, poteau, cheval monté par le contrôleur du joueur"), E.Make(W.World, *Data))) return false;
	AStridesCourse* Course = E.Course;
	auto Info = [this](const FString& M) { AddInfo(M); UE_LOG(LogTemp, Display, TEXT("Strides.Cso.Entry : %s"), *M); };

	// 1) Action proposée par le poteau (interact.update) : positions de l'oracle sans mission, fr et en (libellé).
	int32 Checked = 0, Bad = 0;
	for (const char* L : {"fr", "en"})
	{
		Course->Lang = UTF8_TO_TCHAR(L);
		for (const J& C : Ora[L]["interact"].a)
		{
			if (C["mission"].b) continue;
			const bool bWant = C["id"].t == J::Str && C["id"].s == "act:cso_train";
			const bool bGot = E.Post->Available(C["fx"].num(), C["fz"].num(), U(C["mode"].s));
			Checked++;
			if (bGot != bWant || (bWant && E.Post->Label() != U(C["label"].s)))
			{
				Bad++;
				AddError(FString::Printf(TEXT("%hs (%g ; %g) %hs : action %d / web %d, libellé « %s » / « %hs »"), L, C["fx"].num(), C["fz"].num(), C["mode"].s.c_str(), bGot, bWant, *E.Post->Label(), C["label"].s.c_str()));
			}
		}
	}
	Course->Lang = TEXT("fr");
	TestTrue(FString::Printf(TEXT("action du poteau sans mission : %d positions (fr et en), %d écarts"), Checked, Bad), Checked > 0 && Bad == 0);
	TestEqual(TEXT("libellé du bouton d'action (contrôleur)"), E.PC->ActionLabel(), FString(TEXT("Chrono")));
	TestFalse(TEXT("aucune épreuve au départ (rien de lancé au démarrage)"), Course->MissionActive());

	// 2) Action du joueur (touche E) : activité lancée, grand message du lancement et son « notify ».
	E.Tap(TEXT("KeyE"));
	if (!TestTrue(TEXT("activité lancée par l'action du poteau"), Course->MissionActive())) return false;
	TestTrue(TEXT("lancement : grand message « PARCOURS DU PÔLE » (Événement · Entraînement, 2600 ms) puis notify"),
		Course->HudLog().Num() > 0 && Course->HudLog()[0] == TEXT("big | PARCOURS DU PÔLE | Événement · Entraînement | 2600.0") && Course->AudioLog().Contains(TEXT("notify")));
	// Positions avec mission en cours : action jamais proposée par le poteau (descente de cheval du web à la place).
	int32 MChecked = 0, MBad = 0;
	for (const J& C : Ora["fr"]["interact"].a)
	{
		if (!C["mission"].b) continue;
		MChecked++;
		const bool bWebPost = C["id"].t == J::Str && C["id"].s == "act:cso_train";
		if (E.Post->Available(C["fx"].num(), C["fz"].num(), U(C["mode"].s)) != bWebPost) MBad++;
	}
	TestTrue(FString::Printf(TEXT("mission en cours : %d positions, %d écarts"), MChecked, MBad), MChecked > 0 && MBad == 0);
	for (int32 K = 0; K < 30 && Course->Screen() == AStridesCourse::EScreen::None; K++) E.Frame();
	if (!TestTrue(TEXT("carte de présentation ouverte (étapes rejoindre l'entrée et capacité franchies)"), Course->Screen() == AStridesCourse::EScreen::Presentation)) return false;
	TestFalse(TEXT("Comète à 1,10 m : pas de dialogue de l'entraîneur"), Course->DialogOpen());

	// 3) Carte ouverte : simulation suspendue, commandes gelées (W tenu : le cheval ne bouge pas, chrono non lancé).
	const FVector P0 = E.Horse->GetActorLocation();
	E.PC->FeedKey(TEXT("KeyW"), true, false);
	for (int32 K = 0; K < 15; K++) E.Frame();
	E.PC->FeedKey(TEXT("KeyW"), false, false);
	TestTrue(FString::Printf(TEXT("carte ouverte : simulation suspendue, cheval immobile (%.3f cm)"), FVector::Dist(P0, E.Horse->GetActorLocation())), E.PC->IsSimPaused() && FVector::Dist(P0, E.Horse->GetActorLocation()) < 0.01);
	TestTrue(TEXT("présentation attendue tant que « Entrer en piste » n'est pas touché"), Course->Run()->step() == strides::CsoStep::Presentation && E.PC->CardOpen());
	// Boutons globaux coupés sous la carte (game.js:1461-1466 : !overlayOpen) : P, M, Échap sans effet ; E non plus.
	E.Tap(TEXT("KeyP"));
	E.Tap(TEXT("KeyM"));
	E.Tap(TEXT("Escape"));
	E.Tap(TEXT("KeyE"));
	TestTrue(TEXT("carte ouverte : téléphone, carte, pause et action sans effet"), !E.PC->IsPhoneOpen() && !E.PC->IsGamePausedState() && Course->Screen() == AStridesCourse::EScreen::Presentation && E.Horse->Rider == E.Rider);

	// 4) Widget des cartes : contenu identique au DOM du web (cas cso_train, Comète), boîtes du relevé.
	UStridesCsoScreens* S = CreateWidget<UStridesCsoScreens>(W.World, UStridesCsoScreens::StaticClass());
	if (!TestNotNull(TEXT("widget des cartes"), S)) return false;
	S->Bind(Course);
	S->SetViewCssForTest(FVector2D(844, 390));
	S->Refresh();
	const J& Pres = Ora["fr"]["presentation"][0];
	TestTrue(TEXT("oracle : cas cso_train, Comète"), Pres["id"].s == "cso_train" && Pres["horse"]["name"].s == "Comète");
	const J& Dom = Pres["presentation"]["dom"];
	const strides::CsoPresentation Pr = Course->Presentation();
	bool bRows = Dom["rows"].a.size() == Pr.rows.size();
	for (size_t I = 0; bRows && I < Pr.rows.size(); I++) bRows = Dom["rows"][I][0].s == Pr.rows[I].first && Dom["rows"][I][1].s == Pr.rows[I].second;
	TestTrue(TEXT("présentation : kicker, titre, grille, règles, boutons identiques au DOM du web"), Dom["kicker"].s == Pr.kicker && Dom["title"].s == Pr.title && bRows && Dom["rules"].s == Pr.rules &&
		Dom["buttons"][0][1].s == Pr.planLabel && Dom["buttons"][1][1].s == Pr.enterLabel);
	const TArray<FString> D1 = S->Describe();
	Info(FString::Printf(TEXT("présentation affichée : %s"), *FString::Join(D1, TEXT(" ; "))));
	TestTrue(TEXT("présentation affichée par le widget (titre, valeur Parcours, bouton primaire)"), S->CardShown() == 1 &&
		D1.Contains(TEXT("title=Prix STRIDES · Parcours du Pôle")) && D1.Contains(TEXT("v4=8 obstacles dont 2 doubles (4A – 4B, 6A – 6B) · 368 m")) &&
		D1.Contains(TEXT("bouton enter=Entrer en piste (primary)")) && D1.Contains(TEXT("kicker=EQUESTRIAN TOUR · PÔLE INTERNATIONAL")));
	const FVector4 Card = S->BoxOf(TEXT("card")), Enter = S->BoxOf(TEXT("enter"));
	TestTrue(FString::Printf(TEXT("boîtes du relevé : carte (%.1f ; %.1f ; %.1f ; %.1f), Entrer en piste (%.1f ; %.1f)"), Card.X, Card.Y, Card.Z, Card.W, Enter.X, Enter.Y),
		FMath::IsNearlyEqual(Card.X, 142.0) && FMath::IsNearlyEqual(Card.Y, 26.8) && FMath::IsNearlyEqual(Card.Z, 560.0) && FMath::IsNearlyEqual(Card.W, 336.3) && FMath::IsNearlyEqual(Enter.X, 427.0) && FMath::IsNearlyEqual(Enter.Y, 296.1));

	// 5) Voir le plan : carte du plan (contenu du DOM, primitives du cœur), Retour, Entrer en piste.
	TestTrue(TEXT("« Voir le plan » touché"), S->ClickForTest(TEXT("plan")));
	TestTrue(TEXT("carte du plan ouverte"), Course->Screen() == AStridesCourse::EScreen::Plan && S->CardShown() == 2);
	const J& PDom = Pres["plan"]["dom"];
	const strides::CsoPlanCard Pc = Course->PlanCard();
	TestTrue(TEXT("plan : kicker, titre, légende, bouton identiques au DOM du web"), PDom["kicker"].s == Pc.kicker && PDom["title"].s == Pc.title && PDom["legend"].s == Pc.legend && PDom["buttons"][0][1].s == Pc.backLabel);
	// Élément svg de la carte : chaîne exacte du jeu web (args.html de screens.card, avant la légende).
	const std::string& Html = Pres["plan"]["args"]["html"].s;
	const std::string Svg = strides::coursePlanSvg(Course->Plan());
	TestTrue(FString::Printf(TEXT("plan : élément svg identique au caractère près à celui de la carte du web (%d caractères)"), (int32)Svg.size()), Html.rfind(Svg, 0) == 0);
	const TArray<FString> D2 = S->Describe();
	Info(FString::Printf(TEXT("plan affiché : %s"), *FString::Join(D2, TEXT(" ; "))));
	TestTrue(TEXT("plan affiché par le widget (vue du plan, légende, Retour)"), S->PlanView() != nullptr && D2.Contains(TEXT("bouton plan-back=Retour (primary)")) && D2.Contains(TEXT("legend=") + U(Pc.legend)));
	TestTrue(TEXT("« Retour » : présentation rouverte"), S->ClickForTest(TEXT("plan-back")) && Course->Screen() == AStridesCourse::EScreen::Presentation && S->Describe() == D1);
	TestFalse(TEXT("« Retour » absent de la présentation"), S->ClickForTest(TEXT("plan-back")));
	TestTrue(TEXT("« Entrer en piste » touché : carte fermée"), S->ClickForTest(TEXT("enter")) && Course->Screen() == AStridesCourse::EScreen::None && S->CardShown() == 0);

	// 6) Entrée en piste, annonce du dossard, cloche.
	for (int32 K = 0; K < 120 && Course->Run()->step() != strides::CsoStep::Course; K++) E.Frame();
	TestTrue(TEXT("annonce « N° … · Alex / et Comète » (2400 ms)"), Course->HudLog().ContainsByPredicate([](const FString& L) { return L.StartsWith(TEXT("big | N° ")) && L.EndsWith(TEXT(" · Alex | et Comète | 2400.0")); }));
	TestTrue(TEXT("cloche : grand message et son"), Course->HudLog().Contains(TEXT("big | CLOCHE | Tu as 45 s pour franchir la ligne de départ | 2000.0")) && Course->AudioLog().Contains(TEXT("bell")));
	TestTrue(TEXT("parcours atteint, simulation reprise"), Course->Run()->step() == strides::CsoStep::Course && !E.PC->IsSimPaused());
	TestTrue(TEXT("mission en cours : plus d'action du poteau"), E.PC->ActionLabel().IsEmpty());
	Info(FString::Printf(TEXT("%d appels d'interface, %d sons ; %s"), Course->HudLog().Num(), Course->AudioLog().Num(), *Course->StatusText()));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesCsoEntryDialogTest, "Strides.Cso.EntryDialog", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesCsoEntryDialogTest::RunTest(const FString&)
{
	using namespace StridesEntryTest;
	J Ora;
	FString Why;
	if (!TestTrue(FString::Printf(TEXT("oracle cso_entry.json lu (%s)"), *Why), LoadOracle(Ora, Why))) return false;
	FTestWorld W(TEXT("StridesCsoEntryDialogTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	if (!TestNotNull(TEXT("sous-système de données"), Data)) return false;
	FEntry E;
	if (!TestTrue(TEXT("parcours, poteau, cheval monté par le contrôleur du joueur"), E.Make(W.World, *Data))) return false;
	AStridesCourse* Course = E.Course;
	// Cas de l'oracle aux hauteurs de l'épreuve du Pôle (csoHeights(1,10)), Comète, puissance 0,8 : dialogue affiché.
	const std::vector<double> H = Course->HeightsFor(Course->CourseHeight);
	const J* Case = nullptr;
	for (const J& C : Ora["fr"]["capacity"].a)
	{
		if (C["dialog"].isNull() || C["horse"]["name"].s != "Comète" || C["heights"].a.size() != H.size() || C["horse"]["clearance"].num() != 0) continue;
		bool bSame = true;
		for (size_t I = 0; bSame && I < H.size(); I++) bSame = FMath::Abs(C["heights"][I].num() - H[I]) < 1e-9;
		if (bSame) { Case = &C; break; }
	}
	if (!TestNotNull(TEXT("cas de l'oracle aux hauteurs de l'épreuve avec dialogue"), Case)) return false;
	const double Power = (*Case)["horse"]["jumpPower"].num();
	if (!TestTrue(TEXT("activité lancée (cheval trop faible)"), Course->StartActivity(TEXT("Alex"), TEXT("Comète"), Power, 0.0))) return false;
	for (int32 K = 0; K < 30 && !Course->DialogOpen(); K++) E.Frame();
	if (!TestTrue(FString::Printf(TEXT("dialogue de l'entraîneur affiché (puissance %.4f)"), Power), Course->DialogOpen())) return false;
	const strides::CsoCall& Dc = Course->DialogCall();
	const J& Want = (*Case)["dialog"][0];
	TestTrue(FString::Printf(TEXT("dialogue identique à l'oracle : « %s » (%s) « %s »"), *U(Dc.args[0].s), *U(Dc.args[1].s), *U(Dc.args[2].s)),
		Dc.args.size() == 3 && Dc.args[0].s == Want[0].s && Dc.args[1].s == Want[1].s && Dc.args[2].s == Want[2].s);
	UStridesCsoScreens* S = CreateWidget<UStridesCsoScreens>(W.World, UStridesCsoScreens::StaticClass());
	if (!TestNotNull(TEXT("widget des cartes"), S)) return false;
	S->Bind(Course);
	S->SetViewCssForTest(FVector2D(844, 390));
	S->Refresh();
	const TArray<FString> D = S->Describe();
	AddInfo(FString::Printf(TEXT("dialogue affiché : %s"), *FString::Join(D, TEXT(" ; "))));
	TestTrue(TEXT("dialogue affiché par le widget (nom, initiales, « Toucher pour fermer », texte), sans carte"), S->DialogShown() && S->CardShown() == 0 &&
		D.Contains(TEXT("av=EN")) && D.Contains(TEXT("who=ENTRAÎNEUR")) && D.Contains(TEXT("next=TOUCHER POUR FERMER")) && D.Contains(TEXT("line=") + U(Want[2].s)));
	// Dialogue ouvert : simulation suspendue, commandes gelées, étape de capacité en attente.
	const FVector P0 = E.Horse->GetActorLocation();
	E.PC->FeedKey(TEXT("KeyW"), true, false);
	for (int32 K = 0; K < 10; K++) E.Frame();
	E.PC->FeedKey(TEXT("KeyW"), false, false);
	TestTrue(TEXT("dialogue : simulation suspendue, cheval immobile, étape de capacité en attente"), E.PC->IsSimPaused() && FVector::Dist(P0, E.Horse->GetActorLocation()) < 0.01 &&
		Course->Run()->step() == strides::CsoStep::Capacity && Course->DialogOpen());
	// Action (touche E) : dialogue fermé (advanceDialog avant interact.trigger), puis présentation.
	E.Tap(TEXT("KeyE"));
	TestFalse(TEXT("dialogue fermé par l'action"), Course->DialogOpen());
	for (int32 K = 0; K < 10 && Course->Screen() == AStridesCourse::EScreen::None; K++) E.Frame();
	TestTrue(TEXT("présentation après le dialogue"), Course->Screen() == AStridesCourse::EScreen::Presentation);
	S->Refresh();
	TestTrue(TEXT("widget : carte de présentation, plus de dialogue"), S->CardShown() == 1 && !S->DialogShown());
	return true;
}
