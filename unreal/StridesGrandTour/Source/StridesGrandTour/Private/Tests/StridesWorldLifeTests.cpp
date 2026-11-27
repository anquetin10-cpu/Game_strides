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
#include "Engine/StaticMesh.h"
#include "StaticMeshResources.h"
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
#include "StridesWorldClock.h"
#include "StridesCollectibles.h"
#include "StridesCore/WorldClock.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyLight.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"

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
	// Jalon J3 (correction) : 14 véhicules garés du web (tracteur et voiture du Val, 12 places en ville), infranchissables.
	TestEqual(TEXT("14 véhicules garés (world.js parkedVehicles)"), A->ParkedCount(), 14);
	TestEqual(TEXT("14 véhicules garés chargés"), Data->Parked.Num(), 14);
	{
		AStridesCourse* Pc = W.World->SpawnActor<AStridesCourse>();
		Pc->Build(Data->PoleCourse(), *Data);
		int32 Boxes = 0;
		for (const strides::Collider& C : Pc->WorldColliders().all()) Boxes += C.tag == "parked";
		TestEqual(TEXT("14 collisions « parked »"), Boxes, 14);
		const FStridesParked& V = Data->Parked[2];
		double X = V.X, Z = V.Z + 0.3;
		const strides::ColliderHit Hit = Pc->WorldColliders().resolve(X, Z, 0.85);
		TestTrue(FString::Printf(TEXT("cheval repoussé hors de la voiture garée (%.2f ; %.2f)"), X, Z), Hit.hit && FVector2D::Distance(FVector2D(X, Z), FVector2D(V.X, V.Z)) > 1.0);
	}
	TestEqual(TEXT("24 passants et 8 spectateurs"), A->PeopleCount(), 32);
	int32 Colliding = 0;
	TArray<UStaticMeshComponent*> Parts;
	A->GetComponents(Parts);
	for (const UStaticMeshComponent* C : Parts) if (C->IsCollisionEnabled()) Colliding++;
	TestEqual(TEXT("aucune collision bloquante (silhouettes sans collision)"), Colliding, 0);
	AddInfo(FString::Printf(TEXT("%d composants de maillage posés"), Parts.Num()));
	{
		int32 NoMesh = 0, NotReg = 0;
		for (const UStaticMeshComponent* C : Parts) { NoMesh += C->GetStaticMesh() ? 0 : 1; NotReg += C->IsRegistered() ? 0 : 1; }
		TestEqual(TEXT("chaque pièce a un maillage"), NoMesh, 0);
		// Coût ajouté par la vie ambiante (J3-E) : triangles du LOD 0 de toutes les pièces.
		int64 Tris = 0;
		for (const UStaticMeshComponent* C : Parts) if (C->GetStaticMesh() && C->GetStaticMesh()->GetRenderData()) Tris += C->GetStaticMesh()->GetRenderData()->LODResources[0].GetNumTriangles();
		AddInfo(FString::Printf(TEXT("coût de la vie ambiante : %d pièces (un appel de dessin chacune au plus), %lld triangles au LOD 0"), Parts.Num(), Tris));
		UE_LOG(LogTemp, Display, TEXT("Strides.World.AmbientLife : %d pièces, %lld triangles au LOD 0"), Parts.Num(), Tris);
		TestEqual(TEXT("chaque pièce est enregistrée (rendue)"), NotReg, 0);
	}
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
		// Pièces du passant : visibles près de la caméra, à hauteur d'homme au-dessus du sol (relevé du rendu en paquet).
		TArray<UStaticMeshComponent*> Mine;
		for (UStaticMeshComponent* C : Parts) if (C->GetAttachParent() && C->GetAttachParent()->GetName() == TEXT("Passant_0")) Mine.Add(C);
		for (const UStaticMeshComponent* C : Mine)
			AddInfo(FString::Printf(TEXT("pièce %s : visible %d, caché %d, centre (%.1f ; %.1f ; %.1f) m, rayon %.2f m, sol %.2f m"), *C->GetName(), C->IsVisible(), C->bHiddenInGame, C->Bounds.Origin.X / 100, C->Bounds.Origin.Y / 100, C->Bounds.Origin.Z / 100, C->Bounds.SphereRadius / 100, Data->TerrainHeight(P.x, P.z)));
		TestEqual(TEXT("4 pièces au passant 0"), Mine.Num(), 4);
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
	TestFalse(TEXT("« Deux écuries, une matinée » pas encore proposée (prérequis)"), G.HasItem(TEXT("offer:m1")));
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
	// Jalon J3 (correction après contrôle adverse) : itinéraire du web (story.js tuto : carrière, 5 anneaux, retour vers
	// Camille). Au départ, rien n'est franchi : le contrôle a vu « Premiers pas » se terminer 0,1 s après l'acceptation.
	Dir->Tick(0.3f);
	TestEqual(TEXT("au départ : toujours à l'étape 1"), P->MissionStep, 0);
	TestEqual(TEXT("7 étapes (carrière, 5 anneaux, Camille)"), P->StepCount(), 7);
	TestTrue(FString::Printf(TEXT("objectif du web « Suis la balise jusqu’à la carrière » (%s)"), *P->MissionStatus()), P->MissionStatus().StartsWith(TEXT("Suis la balise jusqu’à la carrière (1/7)")));
	// Guidage et mini-carte : le cheval est posé 200 m au sud de l'entrée de la carrière du Val (-100, 199).
	G.Horse->PlaceAt(-100, 399, PI, 0);
	G.Frame();
	Info(FString::Printf(TEXT("guidage « %s », repères %s"), *G.Hud->GuideLineShown(), *FString::Join(G.Hud->MinimapBlips(), TEXT(", "))));
	TestTrue(TEXT("guidage « GPS · Suis la balise jusqu’à la carrière · 200 m »"), G.Hud->GuideLineShown().StartsWith(TEXT("GPS · Suis la balise jusqu’à la carrière · 200 m")));
	TestTrue(TEXT("repère GPS sur la mini-carte"), G.Hud->MinimapBlips().Contains(TEXT("GPS")));
	TestTrue(TEXT("demi-tour : la cible est derrière (cap π, vers le nord ; carrière au nord)"), G.Hud->GuideLineShown().EndsWith(TEXT("tout droit")) || G.Hud->GuideLineShown().EndsWith(TEXT("demi-tour")));
	// Étapes franchies une à une (balise du directeur du monde, rayon du web) ; payée seulement à la dernière.
	const strides::StoryMission* Tuto = Data->Story() ? Data->Story()->find("tuto") : nullptr;
	if (!TestNotNull(TEXT("tuto dans story_missions.json"), Tuto)) return false;
	for (size_t I = 0; I < Tuto->route.size(); ++I)
	{
		TestEqual(*FString::Printf(TEXT("tuto pas encore payée avant l'étape %d"), (int32)I + 1), P->Credits, 0);
		G.Horse->PlaceAt(Tuto->route[I].x, Tuto->route[I].z, PI, 0);
		Dir->Tick(0.3f);
	}
	TestTrue(TEXT("mission terminée à la dernière étape"), P->ActiveMissionId.IsEmpty() && P->CompletedMissions.Contains(TEXT("tuto")));
	TestEqual(TEXT("+50 € (def.pay du web)"), P->Credits, 50);
	TestEqual(TEXT("+60 réputation (def.xp du web)"), P->Reputation, 60);
	TestTrue(TEXT("point de reprise effacé"), P->CheckpointMission.IsEmpty());
	TestEqual(TEXT("palier du web « Premiers contrats »"), P->RankName(), FString(TEXT("Premiers contrats")));
	// Mission suivante acceptée puis partie sauvegardée et rechargée (relance) : point de reprise proposé en tête.
	TestTrue(TEXT("« Deux écuries, une matinée » acceptée"), P->StartMission(TEXT("m1")));
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

// Jalon J3 (2e correction après contrôle adverse, P1) : partie sauvegardée à pied → le cheval laissé est retrouvé à sa
// place à la reprise (game.js _storePositions pos.horse, :1063 mainHorse.setPosition) et repéré sur la mini-carte tant que
// le joueur est à pied (game.js:1382 kind 'horse', sticky). Avant : le cheval revenait au point d'apparition (~570 m).
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesSaveHorseOnFootTest, "Strides.Save.HorseOnFoot", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesSaveHorseOnFootTest::RunTest(const FString&)
{
	using namespace StridesWorldLifeTest;
	FTestWorld W(TEXT("StridesSaveHorseOnFoot"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	UStridesSaveSubsystem* Save = W.GI->GetSubsystem<UStridesSaveSubsystem>();
	UStridesProgressionSubsystem* P = W.GI->GetSubsystem<UStridesProgressionSubsystem>();
	if (!TestTrue(TEXT("sous-systèmes"), Data && Save && P)) return false;
	Save->SlotName = TEXT("strides_test_j3_horse_foot");
	P->Restore(0, 0, FString(), {});
	FGame G;
	if (!TestTrue(TEXT("cheval monté"), G.Make(W.World, *Data))) return false;
	G.Draw();
	TestFalse(TEXT("à cheval : aucun repère « Cheval » (le web ne le montre qu'à pied)"), G.Hud->MinimapBlips().Contains(TEXT("Cheval")));
	// Le cheval est laissé en (336,9 ; -187,9), le joueur s'en éloigne à pied jusqu'en (221 ; -493) (relevés du contrôle).
	G.Horse->PlaceAt(336.9, -187.9, -1.25, 0);
	G.Rider->Dismount(G.PC);
	if (!TestTrue(TEXT("à pied"), !G.Rider->MountedOn && G.PC->GetPawn() == G.Rider)) return false;
	G.Rider->SetActorLocation(StridesUnits::WebToUE(221, 0, -493) + FVector(0, 0, 90));
	TestTrue(TEXT("sauvegarde à pied"), Save->SaveNow(G.PC));
	// Relance : le monde repose le cheval à son point d'apparition (StridesGameMode, WorldSpawn), puis la reprise.
	G.Horse->PlaceAt(-104, 168, 0.35, 0);
	TestTrue(TEXT("rechargement"), Save->LoadNow(G.PC));
	double HX, HY, HZ;
	StridesUnits::UEToWeb(G.Horse->GetActorLocation(), HX, HY, HZ);
	AddInfo(FString::Printf(TEXT("cheval relu en (%.2f ; %.2f), cap %.3f"), HX, HZ, G.Horse->Heading()));
	TestTrue(TEXT("cheval retrouvé là où il a été laissé (< 0,5 m)"), FVector2D::Distance(FVector2D(HX, HZ), FVector2D(336.9, -187.9)) < 0.5);
	TestTrue(TEXT("cap du cheval relu"), FMath::IsNearlyEqual(G.Horse->Heading(), -1.25, 1e-3));
	TestTrue(TEXT("joueur toujours à pied"), !G.Rider->MountedOn && G.PC->GetPawn() == G.Rider);
	G.Draw();
	AddInfo(FString::Printf(TEXT("repères à pied : %s"), *FString::Join(G.Hud->MinimapBlips(), TEXT(", "))));
	TestTrue(TEXT("repère « Cheval » sur la mini-carte (ramené au bord à 345 m)"), G.Hud->MinimapBlips().Contains(TEXT("Cheval")));
	// Rejoint à pied (< 3 m) : la monte reprend.
	G.Rider->SetActorLocation(G.Horse->GetActorLocation() - G.Horse->GetActorRightVector() * 120.0 + FVector(0, 0, 90));
	TestTrue(TEXT("remonté à cheval après la reprise"), G.Rider->TryMount(G.PC) && G.PC->GetPawn() == G.Horse);
	UGameplayStatics::DeleteGameInSlot(Save->SlotName, 0);
	return true;
}

// Jalon J3-C : heure du jeu, jour et nuit, météo et marée du web (AStridesWorldClock sur StridesCore/WorldClock, oracle
// du web : ctest « meteo »). Lumière posée selon le soleil du web, nuit à la lune, mer à la hauteur de la marée, temps
// arrêté téléphone ouvert (game.js:1448), journée de 1 200 s, heure écrite et relue avec la partie, heure et temps au HUD.
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesWorldDayNightTest, "Strides.World.DayNight", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesWorldDayNightTest::RunTest(const FString&)
{
	using namespace StridesWorldLifeTest;
	namespace C = strides::clock;
	FTestWorld W(TEXT("StridesWorldDayNight"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	UStridesSaveSubsystem* Save = W.GI->GetSubsystem<UStridesSaveSubsystem>();
	if (!TestTrue(TEXT("sous-systèmes"), Data && Save)) return false;
	Save->SlotName = TEXT("strides_test_j3_clock");
	FGame G;
	if (!TestTrue(TEXT("cheval monté"), G.Make(W.World, *Data))) return false;
	AStridesWorldClock* Clock = W.World->SpawnActor<AStridesWorldClock>();
	Clock->Sun = W.World->SpawnActor<ADirectionalLight>();
	Clock->Sky = W.World->SpawnActor<ASkyLight>();
	AActor* SeaHolder = W.World->SpawnActor<AActor>();
	UStaticMeshComponent* Sea = NewObject<UStaticMeshComponent>(SeaHolder);
	Sea->RegisterComponent();
	SeaHolder->SetRootComponent(Sea);
	Clock->Sea = Sea;
	// 14 h, jour 0 : soleil du web haut dans le ciel, lumière vers le bas, dans l'axe de sunDirection.
	Clock->Apply(14 * 3600);
	const C::SunPos P14 = C::sunPosition(14);
	double X, Y, Z;
	C::sunDirection(14, X, Y, Z);
	const FVector Fw = Clock->Sun->GetActorForwardVector();
	AddInfo(FString::Printf(TEXT("14 h : soleil à %.1f° (azimut %.1f°), lumière (%.3f ; %.3f ; %.3f), %.2f lux, mer %.2f m"), P14.alt, P14.az, Fw.X, Fw.Y, Fw.Z, Clock->SunLux, Clock->SeaLevel));
	TestTrue(TEXT("14 h : soleil haut (> 40°)"), P14.alt > 40 && !Clock->bNight);
	TestTrue(TEXT("lumière opposée à la direction du soleil du web"), Fw.Equals(-StridesUnits::WebToUE(X, Y, Z).GetSafeNormal(), 1e-3));
	TestTrue(TEXT("jour : plus de 3 lux"), Clock->SunLux > 3);
	TestTrue(TEXT("mer à la hauteur de la marée du web"), FMath::IsNearlyEqual(Sea->GetRelativeLocation().Z, C::tideLevel(14.0) * 100.0, 0.01));
	// 7 h (départ du web, juste avant le lever de 7 h 01) puis 23 h : nuit, lune, lumière du ciel au plancher.
	Clock->Apply(7 * 3600);
	AddInfo(FString::Printf(TEXT("7 h : soleil à %.2f°, %.2f lux, ciel %.2f"), Clock->SunAltitude, Clock->SunLux, Clock->SkyIntensity));
	TestTrue(TEXT("7 h : aube (soleil sous 2°)"), Clock->SunAltitude < 2 && Clock->SunAltitude > -6);
	Clock->Apply(23 * 3600);
	TestTrue(FString::Printf(TEXT("23 h : nuit (soleil à %.1f°)"), Clock->SunAltitude), Clock->bNight && Clock->SunLux < 0.5 && Clock->SkyIntensity >= 0.3);
	TestTrue(TEXT("23 h : la lune éclaire d'en haut"), Clock->Sun->GetActorForwardVector().Z < -0.5);
	// Marée basse puis haute : la mer bouge (marnage du web).
	double Lo = 1e9, Hi = -1e9;
	for (double T = 0; T < 13; T += .25) { Clock->Apply(T * 3600); Lo = FMath::Min(Lo, Clock->SeaLevel); Hi = FMath::Max(Hi, Clock->SeaLevel); }
	AddInfo(FString::Printf(TEXT("marée du jour 0 : %.2f à %.2f m"), Lo, Hi));
	TestTrue(TEXT("marnage du jour 0 de plus de 4 m"), Hi - Lo > 4);
	// Écoulement du temps : 1 200 s = un jour ; arrêté téléphone ouvert (Step(…, true)).
	Save->GameTime = 7 * 3600;
	Clock->Step(600, false);
	TestTrue(FString::Printf(TEXT("600 s → 19 h (%s)"), UTF8_TO_TCHAR(C::clockText(Save->GameTime).c_str())), FMath::IsNearlyEqual(Save->GameTime, 19.0 * 3600, 1e-3));
	Clock->Step(30, true);
	TestTrue(TEXT("téléphone ouvert : temps arrêté"), FMath::IsNearlyEqual(Save->GameTime, 19.0 * 3600, 1e-3));
	// Phone réellement ouvert : Tick lit le contrôleur.
	G.Tap(TEXT("KeyP"));
	TestTrue(TEXT("téléphone ouvert"), G.PC->IsPhoneOpen());
	Clock->Tick(10);
	TestTrue(TEXT("Tick téléphone ouvert : temps arrêté"), FMath::IsNearlyEqual(Save->GameTime, 19.0 * 3600, 1e-3));
	G.Tap(TEXT("Escape"));
	// Heure écrite et relue avec la partie ; HUD « · 19:00 · <temps du web> · <°C> ».
	TestTrue(TEXT("sauvegarde"), Save->SaveNow(G.PC));
	Save->GameTime = 0;
	TestTrue(TEXT("rechargement"), Save->LoadNow(G.PC));
	TestTrue(TEXT("heure relue"), FMath::IsNearlyEqual(Save->GameTime, 19.0 * 3600, 1e-3));
	if (G.PC->IsPhoneOpen()) G.Tap(TEXT("KeyP"));
	G.Draw();
	const FString Want = FString::Printf(TEXT(" · 19:00 · %s · "), UTF8_TO_TCHAR(C::conditionText(0, 19).c_str()));
	TestTrue(FString::Printf(TEXT("HUD « %s »"), *G.Hud->LastWeatherLine), G.Hud->LastWeatherLine.StartsWith(Want));
	UGameplayStatics::DeleteGameInSlot(Save->SlotName, 0);
	return true;
}

// Jalon J3-D : fers d'or du web (collectibles.js) : 20 fers posés, ramassés à 2,6 m du joueur réel (pion possédé), +25 €,
// repère de la mini-carte à moins de 70 m, gardés à la sauvegarde et non reposés après le rechargement.
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesWorldHorseshoesTest, "Strides.World.Horseshoes", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesWorldHorseshoesTest::RunTest(const FString&)
{
	using namespace StridesWorldLifeTest;
	FTestWorld W(TEXT("StridesHorseshoes"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	UStridesSaveSubsystem* Save = W.GI->GetSubsystem<UStridesSaveSubsystem>();
	UStridesProgressionSubsystem* P = W.GI->GetSubsystem<UStridesProgressionSubsystem>();
	if (!TestTrue(TEXT("sous-systèmes"), Data && Save && P)) return false;
	Save->SlotName = TEXT("strides_test_j3_shoes");
	Save->Horseshoes.Reset();
	P->Restore(0, 0, FString(), {});
	FGame G;
	if (!TestTrue(TEXT("cheval monté"), G.Make(W.World, *Data))) return false;
	AStridesCollectibles* Shoes = W.World->SpawnActor<AStridesCollectibles>();
	if (!TestTrue(TEXT("world_horseshoes.json lu"), Shoes && Shoes->Build())) return false;
	TestEqual(TEXT("20 fers du web"), (int32)Shoes->Data().shoes.size(), 20);
	const double X = Shoes->Data().shoes[19].first, Z = Shoes->Data().shoes[19].second;  // (-160 ; 232)
	G.Horse->PlaceAt(X + 30, Z, 0, 0);
	G.Draw();
	TestTrue(FString::Printf(TEXT("repère « Fer d’or » à 30 m (%s)"), *FString::Join(G.Hud->MinimapBlips(), TEXT(", "))), G.Hud->MinimapBlips().Contains(TEXT("Fer d’or")));
	Shoes->Tick(.1f);
	TestEqual(TEXT("à 30 m : pas ramassé"), P->Credits, 0);
	TestTrue(TEXT("visible à 30 m"), Shoes->VisibleCount() >= 1);
	G.Horse->PlaceAt(X + 2, Z, 0, 0);
	Shoes->Tick(.1f);
	TestEqual(TEXT("à 2 m : ramassé, +25 €"), P->Credits, 25);
	TestTrue(FString::Printf(TEXT("« Fer d’or 1/20 · +25 € » (%s)"), *P->LastMessage), P->LastMessage == TEXT("Fer d’or 1/20 · +25 €"));
	TestTrue(TEXT("gardé (save.data.horseshoes)"), Save->Horseshoes.Num() == 1 && Save->Horseshoes[0] == 19);
	TestTrue(TEXT("sauvegarde"), Save->SaveNow(G.PC));
	Save->Horseshoes.Reset();
	TestTrue(TEXT("rechargement"), Save->LoadNow(G.PC));
	TestTrue(TEXT("fer relu"), Save->Horseshoes.Num() == 1);
	G.Horse->PlaceAt(X + 2, Z, 0, 0);
	Shoes->Tick(.1f);
	TestEqual(TEXT("pas ramassé deux fois"), P->Credits, 25);
	G.Draw();
	// Le fer n°20 n'a plus de repère ; le n°12 (−212 ; 271), à 67 m, garde le sien (moins de 70 m).
	int32 NShoes = 0;
	for (const FString& B : G.Hud->MinimapBlips()) NShoes += B == TEXT("Fer d’or");
	TArray<FVector2D> Left;
	Shoes->Remaining(Left, FVector2D(X + 2, Z), 70);
	TestTrue(FString::Printf(TEXT("repères des fers restants seulement (%d repères, %d fers à moins de 70 m)"), NShoes, Left.Num()), NShoes == Left.Num() && !Left.ContainsByPredicate([&](const FVector2D& V) { return V.Equals(FVector2D(X, Z)); }));
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

// Jalon J3 (correction après contrôle adverse) : M3 « Le premier concours en équipe » du web : parking des camions du
// Pôle, secrétariat, épreuve (le poteau « Chrono » reste ouvert pendant cette étape), retour vers l'équipe ; payée à la fin
// (150 € de participation, 200 points ; dotation non portée). Verrou de palier (« plage », palier 2) et sommes du web.
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesCareerStoryTest, "Strides.Career.Story", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesCareerStoryTest::RunTest(const FString&)
{
	StridesWorldLifeTest::FTestWorld W(TEXT("StridesCareerStory"));
	UStridesProgressionSubsystem* P = W.GI->GetSubsystem<UStridesProgressionSubsystem>();
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	if (!TestTrue(TEXT("sous-systèmes et missions du web"), P && Data && Data->Story())) return false;
	const FStridesMissionDefinition* M3 = P->FindMission(TEXT("m3"));
	if (!TestNotNull(TEXT("m3"), M3)) return false;
	TestEqual(TEXT("titre du web"), M3->Title, FString(TEXT("Le premier concours en équipe")));
	TestEqual(TEXT("libellé du paiement du web"), M3->PayLabel, FString(TEXT("150 € + dotation")));
	P->Restore(260, 220, FString(), {TEXT("tuto"), TEXT("m1"), TEXT("m2")});
	TestTrue(TEXT("m3 seule offre"), P->Offers(0).Num() == 1 && P->Offers(0)[0]->Id == TEXT("m3"));
	TestTrue(TEXT("m3 acceptée"), P->StartMission(TEXT("m3")));
	const strides::StoryMission* S = Data->Story()->find("m3");
	TestEqual(TEXT("4 étapes"), P->StepCount(), 4);
	TestFalse(TEXT("pas franchie de l'Écurie du Val"), P->TickMission(FVector2D(-104, 168), false, false));
	TestTrue(TEXT("parking des camions"), P->TickMission(FVector2D(S->route[0].x, S->route[0].z), false, false));
	TestTrue(TEXT("secrétariat"), P->TickMission(FVector2D(S->route[1].x, S->route[1].z), false, false));
	TestTrue(TEXT("étape « épreuve »"), P->CourseStepActive());
	const FVector2D Gate(S->route[2].x, S->route[2].z);
	TestFalse(TEXT("pas franchie au poteau sans parcours"), P->TickMission(Gate, false, false));
	TestFalse(TEXT("pas franchie par un parcours terminé avant l'étape"), P->TickMission(Gate, false, true));
	TestFalse(TEXT("parcours en cours"), P->TickMission(Gate, true, false));
	TestTrue(TEXT("parcours terminé"), P->TickMission(Gate, false, true));
	TestEqual(TEXT("pas encore payée"), P->Credits, 260);
	TestTrue(TEXT("équipe retrouvée : mission finie"), P->TickMission(FVector2D(S->route[3].x, S->route[3].z), false, false) && P->ActiveMissionId.IsEmpty());
	TestEqual(TEXT("+150 € de participation"), P->Credits, 410);
	TestEqual(TEXT("+200 points"), P->Reputation, 420);
	TestEqual(TEXT("palier « Professionnel apprécié » (300 points)"), P->RankName(), FString(TEXT("Professionnel apprécié")));
	// Verrou de palier : « Galop sur la plage » (palier 2) à 0 point après « Le fugueur ».
	P->Restore(0, 0, FString(), {TEXT("tuto"), TEXT("m1"), TEXT("m2"), TEXT("m3"), TEXT("groom"), TEXT("livraison"), TEXT("fugueur")});
	TestTrue(FString::Printf(TEXT("plage verrouillée (%s)"), *P->OfferLock(TEXT("plage"))), P->OfferLock(TEXT("plage")).StartsWith(TEXT("Débloqué au palier « Professionnel apprécié »")));
	TestFalse(TEXT("plage refusée sous le palier"), P->StartMission(TEXT("plage")));
	// 2e correction après contrôle adverse (P1 « gains sans le déroulé ») : « Selle sur-mesure » n'est plus payée à
	// l'arrivée à la Sellerie : comptoir, puis 1 min 45 pour livrer Clara aux écuries du Pôle (story.js:197).
	P->Restore(500, 400, FString(), {TEXT("tuto"), TEXT("m1"), TEXT("m2"), TEXT("m3"), TEXT("groom")});
	const strides::StoryMission* Liv = Data->Story()->find("livraison");
	TestTrue(TEXT("livraison acceptée"), Liv && P->StartMission(TEXT("livraison")));
	if (Liv && Liv->route.size() == 2)
	{
		TestTrue(TEXT("comptoir de la Sellerie"), P->TickMission(FVector2D(Liv->route[0].x, Liv->route[0].z), false, false, .25));
		TestEqual(TEXT("pas payée au comptoir"), P->Credits, 500);
		TestTrue(FString::Printf(TEXT("compte à rebours affiché (%s)"), *P->MissionStatus()), P->MissionStatus().EndsWith(TEXT("· 1:45")));
		for (int32 I = 0; I < 480 && !P->ActiveMissionId.IsEmpty(); ++I) P->TickMission(FVector2D(-104, 168), false, false, .25);
		TestTrue(TEXT("échec à 0 s : mission arrêtée"), P->ActiveMissionId.IsEmpty() && !P->CompletedMissions.Contains(TEXT("livraison")));
		TestEqual(TEXT("rien payé"), P->Credits, 500);
		TestTrue(FString::Printf(TEXT("raison du web (%s)"), *P->LastMessage), P->LastMessage.Contains(TEXT("Trop tard : l’épreuve a commencé sans la selle.")));
		TestTrue(TEXT("reproposée"), P->Offers(0).Num() > 0 && P->Offers(0)[0]->Id == TEXT("livraison"));
		TestTrue(TEXT("reprise"), P->StartMission(TEXT("livraison")));
		P->TickMission(FVector2D(Liv->route[0].x, Liv->route[0].z), false, false, .25);
		for (int32 I = 0; I < 200; ++I) P->TickMission(FVector2D(-104, 168), false, false, .25);  // 50 s de trajet
		TestTrue(TEXT("Clara livrée à temps : mission finie"), P->TickMission(FVector2D(Liv->route[1].x, Liv->route[1].z), false, false, .25) && P->CompletedMissions.Contains(TEXT("livraison")));
		TestEqual(TEXT("+120 € (def.pay du web)"), P->Credits, 620);
	}
	// Qualificative CSI 3★ : 9 pénalités, non qualifié(e) ; 8, qualifié(e).
	P->Restore(500, 2000, FString(), {TEXT("tuto"), TEXT("m1"), TEXT("m2"), TEXT("m3"), TEXT("groom"), TEXT("livraison"), TEXT("fugueur"), TEXT("plage"), TEXT("transport"), TEXT("fer"), TEXT("cross"), TEXT("pension"), TEXT("derby")});
	TestTrue(TEXT("csi3 acceptée"), P->StartMission(TEXT("csi3")));
	const strides::StoryMission* Q = Data->Story()->find("csi3");
	const FVector2D QGate = Q ? FVector2D(Q->route[0].x, Q->route[0].z) : FVector2D::ZeroVector;
	TestTrue(TEXT("épreuve de la qualificative"), P->CourseStepActive());
	P->TickMission(QGate, true, false, .25);
	TestTrue(TEXT("9 pénalités : fin d'étape"), P->TickMission(QGate, false, true, .25, 9, 75.0, false));
	TestTrue(FString::Printf(TEXT("non qualifié(e) (%s)"), *P->LastMessage), P->ActiveMissionId.IsEmpty() && P->Credits == 500 && P->LastMessage.Contains(TEXT("9 pénalités : non qualifié(e). Il en faut 8 au maximum.")));
	TestTrue(TEXT("csi3 reprise"), P->StartMission(TEXT("csi3")));
	P->TickMission(QGate, true, false, .25);
	TestTrue(TEXT("8 pénalités : qualifié(e), payée"), P->TickMission(QGate, false, true, .25, 8, 75.0, false) && P->CompletedMissions.Contains(TEXT("csi3")) && P->Credits == 1000);
	return true;
}

#endif
