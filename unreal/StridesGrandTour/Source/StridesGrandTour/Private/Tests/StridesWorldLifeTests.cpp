// Jalon J3 (monde vivant de Deauville, unreal/docs/livraison/plan.md) : vérifications dans le moteur.
//  - Strides.World.AmbientLife : vie ambiante lue par le sous-système de données (world_ambient.json, chemin du jeu),
//    posée par AStridesAmbientLife : 7 voitures, 24 passants, 8 spectateurs, sans collision ; l'acteur suit le joueur
//    réel (pion possédé) : cheval arrêté sur la route principale → les voitures de la route s'arrêtent derrière lui,
//    sans klaxon ; à pied sur la chaussée → klaxon ; silhouettes posées sur le relief.
//  - Strides.Phone.MissionFlow : partie conduite par les touches du joueur (FeedKey) et le HUD rendu sur une toile :
//    P ouvre le téléphone, l'app Strides liste « Premiers pas », la demande s'ouvre, « Accepter la mission » deux fois
//    (350 ms d'écart au moins), 1,3 s plus tard le téléphone se range et la mission est en cours ; guidage « GPS · … »,
//    repère GPS sur la mini-carte ; arrivée au lieu → mission terminée (+50 crédits, +60 réputation) ; sauvegarde
//    (emplacement de test) puis rechargement : la mission en cours devient un point de reprise proposé en tête (« REPRISE ») ;
//    app Activités : « Itinéraire » pose le GPS vers le chrono du Pôle et range le téléphone.
//  - Strides.Hud.MinimapRotation : mini-carte tournée comme au web (regard en haut) : flèche vers le haut quand le
//    cavalier regarde devant lui, pastille N au bord dans la direction du nord (−z) quel que soit le cap.
// Ce n'est ni l'autopilote (F8) ni une partie jouée à la main : la partie par entrées système (paquet) le complète.
#include "Misc/AutomationTest.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Components/StaticMeshComponent.h"
#include "HAL/PlatformProcess.h"
#include "Kismet/GameplayStatics.h"
#include "StridesActivityPost.h"
#include "StridesAmbientLife.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesHUD.h"
#include "StridesPlayerController.h"
#include "StridesProgressionSubsystem.h"
#include "StridesRider.h"
#include "StridesSaveSubsystem.h"
#include "StridesUnits.h"
#include "StridesWorldDirector.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace StridesWorldLifeTest
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
	AStridesActivityPost* Post = nullptr;
	AStridesHorse* Horse = nullptr;
	AStridesPlayerController* PC = nullptr;
	AStridesRider* Rider = nullptr;
	AStridesHUD* Hud = nullptr;
	UCanvas* Toile = nullptr;
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
		PC->MyHUD = Hud;  // ce que fait ClientSetHUD en jeu
		Toile = NewObject<UCanvas>();
		Toile->SizeX = 1280;
		Toile->SizeY = 800;
		return true;
	}
	void Draw()
	{
		Hud->SetCanvasForTest(Toile);
		Hud->DrawHUD();
	}
	void Frame()
	{
		PC->StepCommands(1.0 / 30);
		PC->PhoneTick();
		Horse->Tick(1.0 / 30);
		Draw();
	}
	void Tap(const TCHAR* Code)
	{
		PC->FeedKey(Code, true, false);
		Frame();
		PC->FeedKey(Code, false, false);
		Frame();
	}
	bool HasItem(const FString& Id) const
	{
		for (const AStridesHUD::FPhoneItem& I : Hud->PhoneItems()) if (I.Id == Id) return true;
		return false;
	}
	int32 IndexOf(const FString& Id) const
	{
		for (int32 I = 0; I < Hud->PhoneItems().Num(); ++I) if (Hud->PhoneItems()[I].Id == Id) return I;
		return -1;
	}
	// Choisit l'élément au clavier (flèches) puis le touche (Entrée), comme le joueur.
	bool Choose(const FString& Id)
	{
		const int32 Want = IndexOf(Id);
		if (Want < 0) return false;
		for (int32 K = 0; K < 40 && PC->PhoneSelection() != Want; ++K) Tap(PC->PhoneSelection() < Want ? TEXT("ArrowRight") : TEXT("ArrowLeft"));
		if (PC->PhoneSelection() != Want) return false;
		Tap(TEXT("Enter"));
		return true;
	}
	FString Texts() const { return FString::Join(Hud->PhoneTexts(), TEXT(" | ")); }
};
}  // namespace StridesWorldLifeTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesWorldAmbientLifeTest, "Strides.World.AmbientLife", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesWorldAmbientLifeTest::RunTest(const FString&)
{
	using namespace StridesWorldLifeTest;
	FTestWorld W(TEXT("StridesWorldAmbientLife"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	if (!TestNotNull(TEXT("données de la vie ambiante (world_ambient.json)"), Data ? Data->Ambient() : nullptr)) return false;
	FGame G;
	if (!TestTrue(TEXT("cheval monté"), G.Make(W.World, *Data))) return false;
	AStridesAmbientLife* A = W.World->SpawnActor<AStridesAmbientLife>();
	if (!TestTrue(TEXT("vie ambiante posée"), A && A->Build(*Data))) return false;
	TestEqual(TEXT("7 voitures (Ambient.spawn : coast, main, ew ×2, main, hippo, coast)"), A->CarCount(), 7);
	TestEqual(TEXT("24 passants et 8 spectateurs"), A->PeopleCount(), 32);
	int32 Colliding = 0;
	TArray<UStaticMeshComponent*> Parts;
	A->GetComponents(Parts);
	for (const UStaticMeshComponent* C : Parts) if (C->IsCollisionEnabled()) Colliding++;
	TestEqual(TEXT("aucune collision bloquante (silhouettes sans collision)"), Colliding, 0);
	AddInfo(FString::Printf(TEXT("%d composants de maillage posés"), Parts.Num()));
	// Joueur réel : cheval possédé arrêté sur la voie de droite de la route principale (sens +z), à (−32,2 ; 100).
	G.Horse->PlaceAt(-32.2, 100, 0, 0);
	for (int32 F = 0; F < 1800; ++F) A->Tick(1.0 / 30);
	TestTrue(TEXT("le joueur lu est le cheval monté"), A->LastInput().riding && FMath::Abs(A->LastInput().player.x + 32.2) < 0.2 && FMath::Abs(A->LastInput().player.z - 100) < 0.2);
	int32 Behind = 0;
	for (const strides::TrafficCar& C : A->Life().cars)
		if (FMath::Abs(C.x + 32.2) < 0.01 && C.z < 100 && C.z > 80 && FMath::Abs(C.speed) < 0.01) Behind++;
	TestEqual(TEXT("2 voitures arrêtées derrière le cheval (5 m de marge, comme l'oracle du web)"), Behind, 2);
	TestEqual(TEXT("aucun klaxon derrière un cheval"), A->Life().horns, 0);
	// Silhouette de la voiture posée au sol, au point simulé.
	{
		const strides::TrafficCar& C = A->Life().cars[1];
		const FVector L = A->CarLocation(1);
		TestTrue(FString::Printf(TEXT("voiture 1 posée au point simulé (%.1f ; %.1f)"), C.x, C.z), FMath::Abs(L.X / 100 - C.x) < 0.01 && FMath::Abs(L.Y / 100 - C.z) < 0.01 && FMath::Abs(L.Z / 100 - Data->TerrainHeight(C.x, C.z)) < 0.01);
	}
	// Passant posé sur le relief, à sa place simulée.
	{
		const strides::Walker& P = A->Life().walkers[0];
		const FVector L = A->WalkerLocation(0);
		TestTrue(TEXT("passant 0 posé au point simulé"), FMath::Abs(L.X / 100 - P.x) < 0.01 && FMath::Abs(L.Y / 100 - P.z) < 0.01);
	}
	// À pied sur la chaussée (pion à pied) : klaxon au bout de 4 s à moins de 14 m.
	{
		strides::LifeInput In;
		In.player = {-32.2, 100};
		In.cam = In.player;
		In.riding = false;
		AStridesAmbientLife* B = W.World->SpawnActor<AStridesAmbientLife>();
		B->Build(*Data);
		for (int32 F = 0; F < 1800; ++F) B->StepWith(1.0 / 30, In);
		TestTrue(FString::Printf(TEXT("klaxon devant le piéton (%d)"), B->Life().horns), B->Life().horns > 0);
	}
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesPhoneMissionFlowTest, "Strides.Phone.MissionFlow", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesPhoneMissionFlowTest::RunTest(const FString&)
{
	using namespace StridesWorldLifeTest;
	FTestWorld W(TEXT("StridesPhoneMissionFlow"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	UStridesProgressionSubsystem* P = W.GI->GetSubsystem<UStridesProgressionSubsystem>();
	UStridesSaveSubsystem* Save = W.GI->GetSubsystem<UStridesSaveSubsystem>();
	if (!TestTrue(TEXT("sous-systèmes"), Data && P && Save)) return false;
	TestFalse(TEXT("sauvegarde automatique coupée pendant les tests"), Save->bAutoSave);
	Save->SlotName = TEXT("strides_test_j3_phone");
	P->Restore(0, 0, FString(), {});
	FGame G;
	if (!TestTrue(TEXT("cheval monté à l'Écurie du Val"), G.Make(W.World, *Data))) return false;
	AStridesWorldDirector* Dir = W.World->SpawnActor<AStridesWorldDirector>();
	auto Info = [this](const FString& M) { AddInfo(M); UE_LOG(LogTemp, Display, TEXT("Strides.Phone.MissionFlow : %s"), *M); };
	// P : téléphone ouvert sur l'accueil (12 apps du web), commandes gelées.
	G.Tap(TEXT("KeyP"));
	if (!TestTrue(TEXT("téléphone ouvert par P"), G.PC->IsPhoneOpen())) return false;
	TestEqual(TEXT("accueil"), G.PC->PhoneApp(), FString(TEXT("home")));
	TestEqual(TEXT("12 applications"), G.Hud->PhoneItems().Num(), 12);
	TestEqual(TEXT("grille de 3 colonnes"), G.Hud->PhoneColumns(), 3);
	TestTrue(FString::Printf(TEXT("widget « 1 mission dispo » (%s)"), *G.Texts()), G.Texts().Contains(TEXT("1 mission dispo")));
	// Flèche bas puis haut : sélection par rangée ; Entrée sur « Strides ».
	G.Tap(TEXT("ArrowDown"));
	TestEqual(TEXT("flèche bas : rangée suivante"), G.PC->PhoneSelection(), 3);
	G.Tap(TEXT("ArrowUp"));
	TestTrue(TEXT("app Strides touchée"), G.Choose(TEXT("app:strides")));
	TestEqual(TEXT("app Strides"), G.PC->PhoneApp(), FString(TEXT("strides")));
	TestTrue(FString::Printf(TEXT("offre « Premiers pas » (%s)"), *G.Texts()), G.HasItem(TEXT("offer:tuto")) && G.Texts().Contains(TEXT("Premiers pas")));
	TestFalse(TEXT("« Première mission » pas encore proposée (prérequis)"), G.HasItem(TEXT("offer:m1")));
	TestTrue(TEXT("demande ouverte"), G.Choose(TEXT("offer:tuto")));
	TestEqual(TEXT("écran de la demande"), G.PC->PhoneApp(), FString(TEXT("request")));
	TestTrue(TEXT("« Accepter la mission »"), G.Texts().Contains(TEXT("Accepter la mission")));
	TestTrue(TEXT("premier toucher"), G.Choose(TEXT("accept")));
	TestTrue(FString::Printf(TEXT("« Confirmer l'acceptation ? » (%s)"), *G.Texts()), G.PC->PhoneConfirmArmed() && G.Texts().Contains(TEXT("Confirmer l'acceptation ?")));
	G.Tap(TEXT("Enter"));
	TestFalse(TEXT("second toucher trop rapide (< 350 ms) : pas une confirmation"), G.PC->PhoneAcceptDone());
	FPlatformProcess::Sleep(0.4f);
	G.Tap(TEXT("Enter"));
	TestTrue(TEXT("demande acceptée"), G.PC->PhoneAcceptDone());
	TestTrue(TEXT("mission pas encore lancée (1,3 s)"), P->ActiveMissionId.IsEmpty());
	FPlatformProcess::Sleep(1.35f);
	G.Frame();
	TestFalse(TEXT("téléphone rangé"), G.PC->IsPhoneOpen());
	TestEqual(TEXT("mission « tuto » en cours"), P->ActiveMissionId, FString(TEXT("tuto")));
	TestEqual(TEXT("point de reprise posé (missions.start)"), P->CheckpointMission, FString(TEXT("tuto")));
	// Guidage et mini-carte : l'Écurie du Val est à ~7 m du départ ; le cheval est posé 200 m au sud pour suivre le GPS.
	G.Horse->PlaceAt(-110, 372, PI, 0);
	G.Frame();
	Info(FString::Printf(TEXT("guidage « %s », repères %s"), *G.Hud->GuideLineShown(), *FString::Join(G.Hud->MinimapBlips(), TEXT(", "))));
	TestTrue(TEXT("guidage « GPS · Écurie du Val · 200 m »"), G.Hud->GuideLineShown().StartsWith(TEXT("GPS · Écurie du Val · 200 m")));
	TestTrue(TEXT("repère GPS sur la mini-carte"), G.Hud->MinimapBlips().Contains(TEXT("GPS")));
	TestTrue(TEXT("demi-tour : la cible est derrière (cap π, vers le nord ; Écurie au nord)"), G.Hud->GuideLineShown().EndsWith(TEXT("tout droit")) || G.Hud->GuideLineShown().EndsWith(TEXT("demi-tour")));
	// Arrivée (balise du directeur du monde, rayon 18 m).
	G.Horse->PlaceAt(-110, 180, PI, 0);
	Dir->Tick(0.3f);
	TestTrue(TEXT("mission terminée à l'arrivée"), P->ActiveMissionId.IsEmpty() && P->CompletedMissions.Contains(TEXT("tuto")));
	TestEqual(TEXT("+50 crédits"), P->Credits, 50);
	TestEqual(TEXT("+60 réputation"), P->Reputation, 60);
	TestTrue(TEXT("point de reprise effacé"), P->CheckpointMission.IsEmpty());
	// Mission suivante acceptée puis partie sauvegardée et rechargée (relance) : point de reprise proposé en tête.
	TestTrue(TEXT("« Première mission » acceptée"), P->StartMission(TEXT("m1")));
	TestTrue(TEXT("sauvegarde écrite (emplacement de test)"), Save->SaveNow(G.PC));
	P->Restore(0, 0, FString(), {});
	TestTrue(TEXT("rechargement"), Save->LoadNow(G.PC));
	TestEqual(TEXT("crédits rechargés"), P->Credits, 50);
	TestTrue(TEXT("mission terminée rechargée"), P->CompletedMissions.Contains(TEXT("tuto")));
	TestTrue(TEXT("mission non relancée d'office (le web ne reprend pas une mission seule)"), P->ActiveMissionId.IsEmpty());
	TestEqual(TEXT("point de reprise « m1 »"), P->CheckpointMission, FString(TEXT("m1")));
	G.Tap(TEXT("KeyP"));
	G.Choose(TEXT("app:strides"));
	TestTrue(FString::Printf(TEXT("« REPRISE » en tête (%s)"), *G.Texts()), G.IndexOf(TEXT("offer:m1")) == 0 && G.Texts().Contains(TEXT("REPRISE")));
	// Retour arrière : accueil ; app Activités : « Itinéraire » vers le chrono du Pôle.
	G.Tap(TEXT("Backspace"));
	TestEqual(TEXT("retour à l'accueil"), G.PC->PhoneApp(), FString(TEXT("home")));
	TestTrue(TEXT("app Activités"), G.Choose(TEXT("app:activities")));
	const FString It = FString(TEXT("itinerary:")) + UTF8_TO_TCHAR(G.Post->Activity().id.c_str());
	TestTrue(FString::Printf(TEXT("« Itinéraire » proposé (%s)"), *G.Texts()), G.HasItem(It));
	G.Choose(It);
	TestFalse(TEXT("téléphone rangé après « Itinéraire »"), G.PC->IsPhoneOpen());
	TestTrue(TEXT("GPS posé vers le départ de l'activité"), P->HasGps() && FVector2D::Distance(P->GpsTarget(), FVector2D(G.Post->Activity().startX, G.Post->Activity().startZ)) < 0.01);
	G.Frame();
	Info(FString::Printf(TEXT("guidage GPS « %s »"), *G.Hud->GuideLineShown()));
	TestTrue(TEXT("guidage « GPS · <activité> · … »"), G.Hud->GuideLineShown().StartsWith(FString(TEXT("GPS · ")) + UTF8_TO_TCHAR(G.Post->Activity().name.c_str())));
	// Arrivée au départ de l'activité : GPS effacé (rayon 6 m).
	G.Horse->PlaceAt(G.Post->Activity().startX, G.Post->Activity().startZ + 2, PI, 0);
	Dir->Tick(0.3f);
	TestFalse(TEXT("GPS effacé à l'arrivée"), P->HasGps());
	// Souris / doigt : toucher hors du téléphone le range ; toucher une app l'ouvre.
	G.Tap(TEXT("KeyP"));
	const FBox2D Box = G.Hud->PhoneItems()[FMath::Max(0, G.IndexOf(TEXT("app:map")))].Box;
	G.PC->PhoneTapAt(Box.GetCenter());
	TestEqual(TEXT("toucher l'app Carte"), G.PC->PhoneApp(), FString(TEXT("map")));
	G.Frame();
	G.PC->PhoneTapAt(FVector2D(4, 4));
	TestFalse(TEXT("toucher hors du téléphone : fermé"), G.PC->IsPhoneOpen());
	UGameplayStatics::DeleteGameInSlot(Save->SlotName, 0);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesHudMinimapRotationTest, "Strides.Hud.MinimapRotation", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesHudMinimapRotationTest::RunTest(const FString&)
{
	using namespace StridesWorldLifeTest;
	FTestWorld W(TEXT("StridesMinimapRotation"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	FGame G;
	if (!TestTrue(TEXT("cheval monté"), Data && G.Make(W.World, *Data))) return false;
	// Sans caméra de joueur dans le monde de test, le regard est celui du cheval : la flèche pointe vers le haut.
	for (const double H : {0.0, double(HALF_PI), double(PI), -0.7})
	{
		G.Horse->PlaceAt(-104, 168, H, 0);
		G.Draw();
		const FVector2D A = G.Hud->MinimapArrowDir(), N = G.Hud->MinimapNorthDir().GetSafeNormal();
		AddInfo(FString::Printf(TEXT("cap %.2f : flèche (%.3f ; %.3f), nord (%.3f ; %.3f)"), H, A.X, A.Y, N.X, N.Y));
		TestTrue(FString::Printf(TEXT("cap %.2f : flèche vers le haut (regard en haut, comme au web)"), H), A.Equals(FVector2D(0, -1), 1e-3));
		if (FMath::IsNearlyZero(H)) TestTrue(TEXT("cap 0 (vers +z, le sud) : nord en bas"), N.Equals(FVector2D(0, 1), 1e-3));
		if (FMath::IsNearlyEqual(H, HALF_PI)) TestTrue(TEXT("cap π/2 (vers +x, l'est) : nord à gauche"), N.Equals(FVector2D(-1, 0), 1e-3));
		if (FMath::IsNearlyEqual(H, PI)) TestTrue(TEXT("cap π (vers −z, le nord) : nord en haut"), N.Equals(FVector2D(0, -1), 1e-3));
	}
	return true;
}

#endif
