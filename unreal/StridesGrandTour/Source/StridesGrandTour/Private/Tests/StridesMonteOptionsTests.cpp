// Étape S2 de la voie A : Strides.Monte.Options, la monte du web lue comme UN ensemble (StridesMonteOptions).
//  1. Résolution de la ligne de commande : défaut du jeu (épinglé ici, indépendamment de la constante du jeu), ensemble
//     -StridesMonte=web | ancien, options précises -StridesRider=, -StridesHorseLead=, -StridesTack= qui l'emportent sur
//     l'ensemble, sellerie qui suit la cavalière de la règle (comportement de l'étape S1), valeurs inconnues ignorées et
//     signalées.
//  1 bis. Taille du cheval (étape S3) : -StridesHorseScale=web | jeu, défaut épinglé, -StridesMonte=ancien, inconnues.
//  2. Effet réel par BeginPlay, dans un monde commencé comme le jeu : pour chaque ligne de commande, le cheval et la
//     cavalière créés ont exactement ce que la résolution annonce (main du web et clips miroir cuits, sellerie lue par la
//     règle, sellerie affichée, règle de la cavalière) ; avec l'ensemble « web », en selle, la règle est active, le
//     maillage du jeu caché et la sellerie affichée prête.
#include "Misc/AutomationTest.h"
#include "Components/PoseableMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "GameFramework/WorldSettings.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "StridesHorse.h"
#include "StridesHorseView.h"
#include "StridesHorseTack.h"
#include "StridesHorseTackMesh.h"
#include "StridesMonteOptions.h"
#include "StridesRider.h"
#include "StridesRiderRig.h"

namespace StridesMonteOptionsTest
{
// Défaut attendu du jeu sans option (étape S2 b : monte du web ; S2 a : ancien comportement). Épinglé ici : changer le
// défaut du jeu exige de changer ce test, dans le même commit que les preuves refaites.
constexpr bool bExpectedWebByDefault = true;
// Étape S3 : taille du cheval du web par défaut (S3 b : oui ; S3 a : non). Épinglée de même.
constexpr bool bExpectedWebScaleByDefault = true;
// Étape S4 a : vue du cheval du web derrière -StridesHorseView=web (jeu par défaut inchangé).
constexpr bool bExpectedWebViewByDefault = false;

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
	bool Begin()
	{
		World->InitializeActorsForPlay(FURL());
		World->GetWorldSettings()->NotifyBeginPlay();
		return World->GetBegunPlay();
	}
	~FTestWorld()
	{
		if (World && World->GetBegunPlay()) World->EndPlay(EEndPlayReason::Quit);
		GI->Shutdown();
		if (World)
		{
			GEngine->DestroyWorldContext(World);
			World->DestroyWorld(false);
		}
		GI->RemoveFromRoot();
	}
};
struct FCommandLineScope
{
	FString Saved;
	explicit FCommandLineScope(const FString& Extra) : Saved(FCommandLine::Get()) { FCommandLine::Set(*(Saved + TEXT(" ") + Extra)); }
	~FCommandLineScope() { FCommandLine::Set(*Saved); }
};
StridesMonteOptions::FMonte Make(bool R, bool L, bool T)
{
	StridesMonteOptions::FMonte M;
	M.bRiderRules = R;
	M.bWebLead = L;
	M.bTackMesh = T;
	return M;
}
FString Str(const StridesMonteOptions::FMonte& M)
{
	return FString::Printf(TEXT("règle %d, main du web %d, sellerie %d"), (int32)M.bRiderRules, (int32)M.bWebLead, (int32)M.bTackMesh);
}
}  // namespace StridesMonteOptionsTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesMonteOptionsTest, "Strides.Monte.Options", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FStridesMonteOptionsTest::RunTest(const FString&)
{
	using namespace StridesMonteOptionsTest;
	using StridesMonteOptions::FMonte;
	using StridesMonteOptions::Resolve;
	FString Opt;
	for (const TCHAR* K : {TEXT("StridesMonte="), TEXT("StridesRider="), TEXT("StridesHorseLead="), TEXT("StridesTack="), TEXT("StridesHorseScale="), TEXT("StridesHorseView=")})
		if (!TestFalse(FString::Printf(TEXT("ligne de commande du test sans -%s (sinon le défaut ne serait pas testé)"), K), FParse::Value(FCommandLine::Get(), K, Opt))) return false;

	// ---- 1. Résolution.
	const bool D = bExpectedWebByDefault;
	TestEqual(TEXT("défaut du jeu épinglé par le test"), StridesMonteOptions::bWebByDefault, D);
	struct FCase { const TCHAR* Cmd; FMonte Want; };
	const FCase Cases[] = {
		{TEXT(""), Make(D, D, D)},
		{TEXT("-StridesMonte=web"), Make(true, true, true)},
		{TEXT("-StridesMonte=ancien"), Make(false, false, false)},
		{TEXT("-StridesRider=regles"), Make(true, D, true)},
		{TEXT("-StridesRider=ancien"), Make(false, D, D)},
		{TEXT("-StridesHorseLead=web"), Make(D, true, D)},
		{TEXT("-StridesHorseLead=droite"), Make(D, false, D)},
		{TEXT("-StridesTack=web"), Make(D, D, true)},
		{TEXT("-StridesTack=aucune"), Make(D, D, false)},
		{TEXT("-StridesMonte=ancien -StridesRider=regles"), Make(true, false, true)},
		{TEXT("-StridesMonte=ancien -StridesRider=regles -StridesTack=aucune"), Make(true, false, false)},
		{TEXT("-StridesMonte=ancien -StridesRider=regles -StridesHorseLead=web"), Make(true, true, true)},
		{TEXT("-StridesMonte=ancien -StridesHorseLead=web"), Make(false, true, false)},
		{TEXT("-StridesMonte=ancien -StridesTack=web"), Make(false, false, true)},
		{TEXT("-StridesMonte=web -StridesRider=ancien"), Make(false, true, true)},
		{TEXT("-StridesMonte=web -StridesHorseLead=droite"), Make(true, false, true)},
		{TEXT("-StridesMonte=web -StridesTack=aucune"), Make(true, true, false)},
		{TEXT("-StridesMonte=web -StridesRider=ancien -StridesHorseLead=droite -StridesTack=aucune"), Make(false, false, false)},
		{TEXT("-StridesMonte=ancien -StridesRider=regles -StridesHorseLead=web -StridesTack=web"), Make(true, true, true)},
		// Clés voisines : -StridesMonteDir= et -StridesMontePoses= ne sont pas l'ensemble.
		{TEXT("-StridesMonteDir=/x -StridesMontePoses=/y.json"), Make(D, D, D)},
		{TEXT("-StridesMonteDir=/x -StridesMonte=web"), Make(true, true, true)},
	};
	for (const FCase& C : Cases)
	{
		TArray<FString> Unknown;
		const FMonte Got = Resolve(C.Cmd, &Unknown);
		TestTrue(FString::Printf(TEXT("« %s » : %s (attendu %s)"), C.Cmd, *Str(Got), *Str(C.Want)), Got == C.Want);
		TestEqual(FString::Printf(TEXT("« %s » : aucune valeur inconnue"), C.Cmd), Unknown.Num(), 0);
	}
	{
		TArray<FString> Unknown;
		const FMonte Got = Resolve(TEXT("-StridesMonte=oui -StridesRider=web -StridesHorseLead=gauche -StridesTack=complete"), &Unknown);
		TestTrue(FString::Printf(TEXT("valeurs inconnues ignorées : défaut (%s)"), *Str(Got)), Got == Make(D, D, D));
		TestEqual(TEXT("valeurs inconnues signalées, une par option"), Unknown.Num(), 4);
	}
	{
		// Valeurs inconnues sous un ensemble connu : chaque option garde la valeur de l'ensemble (ni « oui » ni « non »).
		TArray<FString> Unknown;
		const FMonte Web = Resolve(TEXT("-StridesMonte=web -StridesRider=web -StridesHorseLead=gauche -StridesTack=complete"), &Unknown);
		TestTrue(FString::Printf(TEXT("ensemble web, valeurs inconnues : ensemble gardé (%s)"), *Str(Web)), Web == Make(true, true, true));
		const FMonte Old = Resolve(TEXT("-StridesMonte=ancien -StridesRider=oui -StridesHorseLead=gauche -StridesTack=complete"), &Unknown);
		TestTrue(FString::Printf(TEXT("ensemble ancien, valeurs inconnues : ensemble gardé (%s)"), *Str(Old)), Old == Make(false, false, false));
		TestEqual(TEXT("valeurs inconnues signalées (3 + 3)"), Unknown.Num(), 6);
	}
	// ---- 1 bis. Taille du cheval (étape S3) : -StridesHorseScale=web | jeu ; sans elle, non avec -StridesMonte=ancien, sinon
	// le défaut.
	{
		const bool SD = bExpectedWebScaleByDefault;
		TestEqual(TEXT("taille du cheval par défaut épinglée par le test"), StridesMonteOptions::bWebHorseScaleByDefault, SD);
		struct FScaleCase { const TCHAR* Cmd; bool Want; int32 Unknown; };
		const FScaleCase ScaleCases[] = {
			{TEXT(""), SD, 0},
			{TEXT("-StridesHorseScale=web"), true, 0},
			{TEXT("-StridesHorseScale=jeu"), false, 0},
			{TEXT("-StridesMonte=web"), SD, 0},
			{TEXT("-StridesMonte=ancien"), false, 0},
			{TEXT("-StridesMonte=ancien -StridesHorseScale=web"), true, 0},
			{TEXT("-StridesMonte=web -StridesHorseScale=jeu"), false, 0},
			{TEXT("-StridesMonte=web -StridesHorseScale=web"), true, 0},
			{TEXT("-StridesRider=ancien -StridesHorseLead=droite -StridesTack=aucune"), SD, 0},
			{TEXT("-StridesHorseScale=grand"), SD, 1},
			{TEXT("-StridesMonte=ancien -StridesHorseScale=grand"), false, 1},
			{TEXT("-StridesMonteDir=/x -StridesMontePoses=/y.json"), SD, 0},
		};
		for (const FScaleCase& C : ScaleCases)
		{
			TArray<FString> Unknown;
			const bool Got = StridesMonteOptions::ResolveWebHorseScale(C.Cmd, &Unknown);
			TestEqual(FString::Printf(TEXT("taille, « %s » : web %d (attendu %d)"), C.Cmd, (int32)Got, (int32)C.Want), Got, C.Want);
			TestEqual(FString::Printf(TEXT("taille, « %s » : valeurs inconnues"), C.Cmd), Unknown.Num(), C.Unknown);
		}
		// La taille ne touche pas l'ensemble de la monte.
		TestTrue(TEXT("taille : ensemble de la monte inchangé"), Resolve(TEXT("-StridesHorseScale=web")) == Resolve(TEXT("")) && Resolve(TEXT("-StridesMonte=ancien -StridesHorseScale=web")) == Make(false, false, false));
	}
	// ---- 1 ter. Vue du cheval (étape S4) : -StridesHorseView=web | jeu ; sans elle, non avec -StridesMonte=ancien, sinon le
	// défaut.
	{
		const bool VD = bExpectedWebViewByDefault;
		TestEqual(TEXT("vue du cheval par défaut épinglée par le test"), StridesMonteOptions::bWebHorseViewByDefault, VD);
		struct FViewCase { const TCHAR* Cmd; bool Want; int32 Unknown; };
		const FViewCase ViewCases[] = {
			{TEXT(""), VD, 0},
			{TEXT("-StridesHorseView=web"), true, 0},
			{TEXT("-StridesHorseView=jeu"), false, 0},
			{TEXT("-StridesMonte=web"), VD, 0},
			{TEXT("-StridesMonte=ancien"), false, 0},
			{TEXT("-StridesMonte=ancien -StridesHorseView=web"), true, 0},
			{TEXT("-StridesMonte=web -StridesHorseView=jeu"), false, 0},
			{TEXT("-StridesHorseScale=web -StridesHorseLead=web"), VD, 0},
			{TEXT("-StridesHorseView=webb"), VD, 1},
			{TEXT("-StridesMonte=ancien -StridesHorseView=x"), false, 1},
		};
		for (const FViewCase& C : ViewCases)
		{
			TArray<FString> Unknown;
			const bool Got = StridesMonteOptions::ResolveWebHorseView(C.Cmd, &Unknown);
			TestEqual(FString::Printf(TEXT("vue, « %s » : web %d (attendu %d)"), C.Cmd, (int32)Got, (int32)C.Want), Got, C.Want);
			TestEqual(FString::Printf(TEXT("vue, « %s » : valeurs inconnues"), C.Cmd), Unknown.Num(), C.Unknown);
		}
		TestTrue(TEXT("vue : ensemble de la monte et taille inchangés"), Resolve(TEXT("-StridesHorseView=web")) == Resolve(TEXT("")) &&
			StridesMonteOptions::ResolveWebHorseScale(TEXT("-StridesHorseView=web")) == StridesMonteOptions::ResolveWebHorseScale(TEXT("")));
	}
	TestEqual(TEXT("description de l'ensemble web"), StridesMonteOptions::Describe(Make(true, true, true)), FString(TEXT("web")));
	TestEqual(TEXT("description de l'ancien comportement"), StridesMonteOptions::Describe(Make(false, false, false)), FString(TEXT("ancien")));

	// ---- 2. Effet par BeginPlay.
	FTestWorld W(TEXT("StridesMonteOptionsTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	if (!TestTrue(TEXT("monde commencé (BeginPlay distribué)"), W.Begin())) return false;
	const TCHAR* Lines[] = {
		TEXT(""),
		TEXT("-StridesMonte=web"),
		TEXT("-StridesMonte=ancien"),
		TEXT("-StridesRider=regles"),
		TEXT("-StridesMonte=web -StridesHorseLead=droite"),
		TEXT("-StridesMonte=web -StridesRider=ancien"),
		TEXT("-StridesMonte=web -StridesTack=aucune"),
		TEXT("-StridesMonte=ancien -StridesHorseLead=web"),
		TEXT("-StridesMonte=ancien -StridesTack=web"),
		TEXT("-StridesHorseScale=web"),
		TEXT("-StridesHorseScale=jeu"),
		TEXT("-StridesMonte=ancien -StridesHorseScale=web"),
		TEXT("-StridesHorseView=web"),
		TEXT("-StridesHorseView=jeu"),
		TEXT("-StridesMonte=web -StridesHorseLead=droite -StridesHorseView=web"),
	};
	AStridesHorse* WebHorse = nullptr;
	AStridesRider* WebRider = nullptr;
	double X = 200000;
	for (const TCHAR* Line : Lines)
	{
		const FMonte Want = Resolve(Line);
		AStridesHorse* Horse = nullptr;
		AStridesRider* Rider = nullptr;
		{
			FCommandLineScope Cl(Line);
			Horse = W.World->SpawnActor<AStridesHorse>(FVector(X, 0, 0), FRotator::ZeroRotator);
			Rider = W.World->SpawnActor<AStridesRider>(FVector(X, -150, 90), FRotator::ZeroRotator);
		}
		X += 5000;
		if (!TestNotNull(FString::Printf(TEXT("« %s » : cheval"), Line), Horse) || !TestNotNull(FString::Printf(TEXT("« %s » : cavalière"), Line), Rider)) return false;
		TestEqual(FString::Printf(TEXT("« %s » : main du web (%s)"), Line, *Str(Want)), Horse->UsesWebLead(), Want.bWebLead);
		TestEqual(FString::Printf(TEXT("« %s » : clips miroir cuits"), Line), Horse->MirrorSet() != nullptr, Want.bWebLead);
		TestEqual(FString::Printf(TEXT("« %s » : sellerie affichée"), Line), Horse->TackMesh() != nullptr, Want.bTackMesh);
		if (Horse->TackMesh()) TestTrue(FString::Printf(TEXT("« %s » : sellerie affichée prête"), Line), Horse->TackMesh()->IsReady());
		TestEqual(FString::Printf(TEXT("« %s » : sellerie lue par la règle"), Line), Horse->HorseTack() != nullptr, Want.bRiderRules || Want.bTackMesh);
		TestEqual(FString::Printf(TEXT("« %s » : règle de la cavalière"), Line), Rider->RulesRig() != nullptr, Want.bRiderRules);
		TestEqual(FString::Printf(TEXT("« %s » : maillage posé"), Line), Rider->RulesMesh() != nullptr, Want.bRiderRules);
		const bool bScale = StridesMonteOptions::ResolveWebHorseScale(Line);
		TestEqual(FString::Printf(TEXT("« %s » : taille du cheval du web"), Line), Horse->UsesWebScale(), bScale);
		TestEqual(FString::Printf(TEXT("« %s » : échelle du maillage"), Line), (double)Horse->BodyMesh()->GetRelativeScale3D().X, bScale ? AStridesHorse::WebMeshScale() : (double)AStridesHorse::GameMeshScale);
		// Vue du web : demandée et main du web active (elle s'appuie sur le mélangeur à couches).
		const bool bView = StridesMonteOptions::ResolveWebHorseView(Line) && Want.bWebLead;
		TestEqual(FString::Printf(TEXT("« %s » : vue du cheval du web"), Line), Horse->UsesWebView(), bView);
		TestEqual(FString::Printf(TEXT("« %s » : vue prête"), Line), Horse->HorseView() != nullptr && Horse->HorseView()->IsReady(), bView);
		if (Want == Make(true, true, true) && !WebHorse)
		{
			WebHorse = Horse;
			WebRider = Rider;
		}
	}
	TestFalse(TEXT("ligne de commande rétablie après les blocs"), FParse::Value(FCommandLine::Get(), TEXT("StridesMonte="), Opt));
	if (!TestNotNull(TEXT("couple de l'ensemble web"), WebHorse)) return false;
	// En selle avec l'ensemble web : règle active, maillage du jeu caché, sellerie affichée prête.
	if (!TestNotNull(TEXT("ensemble web : règle et maillage posé de la cavalière"), WebRider->RulesMesh()) || !WebRider->RulesRig()) return false;
	if (!TestTrue(TEXT("ensemble web : montée (TryMount)"), WebRider->TryMount(nullptr))) return false;
	TestTrue(TEXT("ensemble web, en selle : maillage posé visible, maillage du jeu caché"), WebRider->RulesMesh()->IsVisible() && !WebRider->GetMesh()->IsVisible());
	TestTrue(TEXT("ensemble web, en selle : règle prête sur la sellerie du cheval"), WebRider->RulesRig()->IsReady() && WebHorse->HorseTack() && WebHorse->HorseTack()->IsReady());
	TestTrue(TEXT("ensemble web : mélangeur à couches du cheval"), WebHorse->UsesWebLead() && WebHorse->LeadState().lead == 1);
	return true;
}
