// Jalon J3b (monde vivant, unreal/docs/livraison/plan.md) : véhicules conduisibles et marche à pied dans le moteur.
//  - Strides.World.Vehicles : partie conduite par les touches du joueur (FeedKey, chemin du clavier du jeu) : à pied à la
//    portière d'une voiture garée du web, E → au volant ; Z (KeyW) tenu → la voiture avance, rapport « D… », boîte de
//    collision désactivée au volant ; S → freinage jusqu'à l'arrêt ; E → à pied à la portière, boîte remise à la
//    nouvelle place (le cheval y est repoussé). Voiture lancée sur une autre voiture garée : arrêtée par la collision du
//    web (trois cercles contre colliders.resolve). Camion de l'écurie : cheval à moins de 15 m embarqué, déchargé derrière
//    le camion à la descente (choix n° 26). Phares la nuit (nightFactor > 0,25). Sauvegarde au volant (emplacement de
//    test) : joueur repris à pied à la portière, véhicule déplacé relu à sa place.
//  - Strides.World.FootSteering : marche à pied (P2 de J3) : vitesse du web au clavier (5,4 m/s), caméra recentrée
//    derrière le marcheur ; tourner à droite au clavier change la direction de marche (le marcheur ne file plus vers un
//    cap fixe du monde).
// Ce n'est ni l'autopilote (F8) ni une partie jouée à la main : la partie par entrées système (paquet) le complète.
#include "Misc/AutomationTest.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/StaticMesh.h"
#include "StaticMeshResources.h"
#include "Engine/StaticMeshActor.h"
#include "Components/StaticMeshComponent.h"
#include "StridesActivityPost.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesPlayerController.h"
#include "StridesRider.h"
#include "StridesSaveSubsystem.h"
#include "StridesUnits.h"
#include "StridesVehicle.h"
#include "StridesCollectibles.h"
#include "StridesProgressionSubsystem.h"
#include "StridesNightSky.h"
#include "Components/InstancedStaticMeshComponent.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace StridesVehicleTest
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
	AStridesHorse* Horse = nullptr;
	AStridesPlayerController* PC = nullptr;
	AStridesRider* Rider = nullptr;
	bool Make(UWorld* World, const UStridesDataSubsystem& Data, double HorseX, double HorseZ)
	{
		Course = World->SpawnActor<AStridesCourse>();
		strides::CourseDesign D = Data.PoleCourse();
		D.x += Data.PoleArena.X;
		D.z += Data.PoleArena.Y;
		Course->Build(D, Data);
		Horse = World->SpawnActor<AStridesHorse>();
		Horse->Course = Course;
		Horse->PlaceAt(HorseX, HorseZ, 0, 0);
		PC = World->SpawnActor<AStridesPlayerController>();
		Rider = World->SpawnActor<AStridesRider>(StridesUnits::WebToUE(HorseX + 30, Data.TerrainHeight(HorseX + 30, HorseZ) + 1, HorseZ), FRotator::ZeroRotator);
		if (!PC || !Rider) return false;
		PC->Possess(Rider);
		return PC->GetPawn() == Rider;
	}
	void PutRider(const UStridesDataSubsystem& Data, double X, double Z)
	{
		Rider->SetActorLocation(StridesUnits::WebToUE(X, Data.TerrainHeight(X, Z), Z) + FVector(0, 0, 95));
	}
	void Frame(AStridesVehicle* V, double Dt = 1.0 / 30)
	{
		PC->StepCommands(Dt);
		if (V) V->Tick(Dt);
	}
	void Tap(const TCHAR* Code, AStridesVehicle* V)
	{
		PC->FeedKey(Code, true, false);
		Frame(V);
		PC->FeedKey(Code, false, false);
		Frame(V);
	}
};
}  // namespace StridesVehicleTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesWorldVehiclesTest, "Strides.World.Vehicles", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesWorldVehiclesTest::RunTest(const FString&)
{
	using namespace StridesVehicleTest;
	FTestWorld W(TEXT("StridesWorldVehicles"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	if (!TestNotNull(TEXT("véhicules du web (vehicles.json)"), Data ? Data->Vehicles() : nullptr) || Data->Parked.Num() < 4) return false;
	FGame G;
	if (!TestTrue(TEXT("cavalier à pied possédé"), G.Make(W.World, *Data, -104, 168))) return false;

	// 1. Voiture garée n° 2 du web (Clio de la ville) : boîte « parked » reprise, portière conducteur.
	const FStridesParked& P = Data->Parked[2];
	AStridesVehicle* V = W.World->SpawnActor<AStridesVehicle>();
	if (!TestTrue(TEXT("Clio posée"), V && V->Init(*Data, P.Kind, P.X, P.Z, P.Heading, FLinearColor::Blue, 2))) return false;
	// Posée sur une prairie dégagée au sud du Val (la Golf garée est 16 m devant elle en ville).
	V->PlaceAt(-40, 100, 0);
	const FVector2D Door = V->DoorWeb();
	TestTrue(FString::Printf(TEXT("portière à %.2f m du centre (web : 1,65 m)"), FVector2D::Distance(Door, V->WebPos())), FMath::IsNearlyEqual(FVector2D::Distance(Door, V->WebPos()), 1.657, 0.01));
	G.PutRider(*Data, Door.X + 0.5, Door.Y);
	TestTrue(TEXT("véhicule proposé à la portière"), G.PC->NearVehicle() == V);
	TestEqual(TEXT("action « Monter »"), G.PC->ActionLabel(), FString(TEXT("Monter")));
	G.Tap(TEXT("KeyE"), V);
	if (!TestTrue(TEXT("E : au volant (pion = véhicule)"), G.PC->GetPawn() == V && V->IsDriven())) return false;
	TestTrue(TEXT("cavalier caché au volant"), G.Rider->IsHidden());
	const auto Own = [&]() -> const strides::Collider* {
		int32 N = 0;
		for (const strides::Collider& C : G.Course->WorldColliders().all())
			if (C.tag == "parked" && N++ == 2) return &C;
		return nullptr;
	};
	TestTrue(TEXT("boîte de la voiture désactivée au volant (vehicle.js _syncCollider)"), Own() && !Own()->enabled);

	// 2. Z tenu 4 s : la voiture avance (cap du web), boîte automatique en prise.
	const FVector2D Start = V->WebPos();
	G.PC->FeedKey(TEXT("KeyW"), true, false);
	for (int32 F = 0; F < 120; ++F) G.Frame(V);
	G.PC->FeedKey(TEXT("KeyW"), false, false);
	const FVector2D Moved = V->WebPos() - Start;
	const FVector2D Fwd(0, 1);
	AddInfo(FString::Printf(TEXT("après 4 s de gaz : %.1f m, %.1f m/s, %s"), Moved.Size(), V->SpeedMS(), *V->DriveText()));
	TestTrue(FString::Printf(TEXT("avancée de %.1f m devant elle"), FVector2D::DotProduct(Moved, Fwd)), FVector2D::DotProduct(Moved, Fwd) > 8.0);
	TestTrue(TEXT("rapport D"), V->DriveText().StartsWith(TEXT("D")));
	TestEqual(TEXT("« Descendre » refusé en roulant"), G.PC->ActionLabel(), FString());
	// 3. S : freinage jusqu'à l'arrêt, puis E : à pied à la portière.
	G.PC->FeedKey(TEXT("KeyS"), true, false);
	for (int32 F = 0; F < 300 && V->SpeedMS() > 0.2; ++F) G.Frame(V);
	G.PC->FeedKey(TEXT("KeyS"), false, false);
	for (int32 F = 0; F < 30; ++F) G.Frame(V);
	TestTrue(FString::Printf(TEXT("arrêtée (%.2f m/s)"), V->SpeedMS()), FMath::Abs(V->SpeedMS()) < 0.3);
	TestEqual(TEXT("action « Descendre »"), G.PC->ActionLabel(), FString(TEXT("Descendre")));
	G.Tap(TEXT("KeyE"), V);
	if (!TestTrue(TEXT("E : à pied"), G.PC->GetPawn() == G.Rider && !V->IsDriven() && !G.Rider->IsHidden())) return false;
	double RX, RY, RZ;
	StridesUnits::UEToWeb(G.Rider->GetActorLocation(), RX, RY, RZ);
	TestTrue(TEXT("descendu à la portière"), V->DoorDistance(RX, RZ) < 0.6);
	TestTrue(TEXT("boîte réactivée à la nouvelle place"), Own() && Own()->enabled && FVector2D::Distance(FVector2D(Own()->x, Own()->z), V->WebPos()) < 0.5);
	{
		double X = V->WebPos().X, Z = V->WebPos().Y;
		const strides::ColliderHit Hit = G.Course->WorldColliders().resolve(X, Z, 0.85);
		TestTrue(TEXT("cheval repoussé hors de la voiture déplacée"), Hit.hit);
	}

	// 4. Collision du web : lancée vers la Golf garée 16 m devant (même file), la Clio ne la traverse pas.
	{
		const FStridesParked& Golf = Data->Parked[3];
		V->PlaceAt(Golf.X - 14, Golf.Z, Golf.Heading);
		const FVector2D D2 = V->DoorWeb();
		G.PutRider(*Data, D2.X, D2.Y);
		G.Tap(TEXT("KeyE"), V);
		G.PC->FeedKey(TEXT("KeyW"), true, false);
		for (int32 F = 0; F < 180; ++F) G.Frame(V);
		G.PC->FeedKey(TEXT("KeyW"), false, false);
		const double Gap = Golf.X - V->WebPos().X;
		AddInfo(FString::Printf(TEXT("contre la Golf : centre à %.2f m du sien, %d choc(s)"), Gap, V->BumpCount));
		TestTrue(FString::Printf(TEXT("arrêtée contre la Golf (écart des centres %.2f m)"), Gap), Gap > 3.0);
		G.PC->FeedKey(TEXT("KeyS"), true, false);
		for (int32 F = 0; F < 200 && FMath::Abs(V->SpeedMS()) > 0.2; ++F) G.Frame(V);
		G.PC->FeedKey(TEXT("KeyS"), false, false);
		for (int32 F = 0; F < 30; ++F) G.Frame(V);
		G.Tap(TEXT("KeyE"), V);
		TestTrue(TEXT("descendu après la collision"), G.PC->GetPawn() == G.Rider);
	}

	// 5. Phares : moteur tournant la nuit (nightFactor > 0,25), éteints de jour.
	TestTrue(TEXT("nuit : facteur 1 à −20°, 0 à +10°"), AStridesVehicle::NightFactor(-20) == 1.0 && AStridesVehicle::NightFactor(10) == 0.0);
	{
		V->Sim.startEngine();
		V->NightK = 1;
		V->Sim.vx = 1;
		V->StepSim(1.0 / 30);
		TestTrue(TEXT("phares allumés la nuit, moteur tournant"), V->HeadlightsOn());
		V->NightK = 0;
		V->Sim.vx = 1;
		V->StepSim(1.0 / 30);
		TestFalse(TEXT("phares éteints de jour"), V->HeadlightsOn());
		V->Sim.engineOn = false;
		V->PlaceAt(V->WebPos().X, V->WebPos().Y, V->Heading());
	}

	// 6. Camion de l'écurie : cheval embarqué à moins de 15 m, déchargé derrière le camion.
	{
		const strides::VehicleData* VD = Data->Vehicles();
		AStridesVehicle* T = W.World->SpawnActor<AStridesVehicle>();
		if (!TestTrue(TEXT("camion posé à l'Écurie du Val"), T && T->Init(*Data, TEXT("truck"), VD->truckX, VD->truckZ, VD->truckHeading, FLinearColor::White, -1))) return false;
		G.Horse->PlaceAt(VD->truckX - 8, VD->truckZ + 4, 0, 0);
		const FVector2D TD = T->DoorWeb();
		G.PutRider(*Data, TD.X, TD.Y);
		G.Tap(TEXT("KeyE"), T);
		TestTrue(TEXT("au volant du camion, cheval à bord"), G.PC->GetPawn() == T && T->CarriesHorse() && G.Horse->IsHidden());
		G.PC->FeedKey(TEXT("KeyW"), true, false);
		for (int32 F = 0; F < 90; ++F) G.Frame(T);
		G.PC->FeedKey(TEXT("KeyW"), false, false);
		G.PC->FeedKey(TEXT("KeyS"), true, false);
		for (int32 F = 0; F < 300 && T->SpeedMS() > 0.2; ++F) G.Frame(T);
		G.PC->FeedKey(TEXT("KeyS"), false, false);
		for (int32 F = 0; F < 30; ++F) G.Frame(T);
		const double Run = FVector2D::Distance(T->WebPos(), FVector2D(VD->truckX, VD->truckZ));
		// 7. Sauvegarde au volant (emplacement de test, jamais la partie du joueur).
		UStridesSaveSubsystem* Save = W.GI->GetSubsystem<UStridesSaveSubsystem>();
		Save->SlotName = TEXT("strides_test_j3b_vehicles");
		TestTrue(TEXT("sauvegarde au volant"), Save->SaveNow(G.PC));
		G.Tap(TEXT("KeyE"), T);
		double HX, HY, HZ;
		StridesUnits::UEToWeb(G.Horse->GetActorLocation(), HX, HY, HZ);
		const double Behind = FVector2D::DotProduct(FVector2D(HX, HZ) - T->WebPos(), FVector2D(FMath::Sin(T->Heading()), FMath::Cos(T->Heading())));
		AddInfo(FString::Printf(TEXT("camion : %.1f m parcourus, cheval déchargé à %.1f m dans l'axe"), Run, Behind));
		TestTrue(TEXT("camion parti du Val"), Run > 3.0);
		TestTrue(TEXT("cheval déchargé derrière le camion, visible"), G.PC->GetPawn() == G.Rider && !T->CarriesHorse() && !G.Horse->IsHidden() && Behind < -4.0);
		const FVector2D Saved = T->WebPos();
		T->PlaceAt(VD->truckX, VD->truckZ, VD->truckHeading);
		TestTrue(TEXT("rechargement"), Save->LoadNow(G.PC));
		TestTrue(FString::Printf(TEXT("camion relu à sa place sauvegardée (%.2f m)"), FVector2D::Distance(T->WebPos(), Saved)), FVector2D::Distance(T->WebPos(), Saved) < 0.05);
		StridesUnits::UEToWeb(G.Rider->GetActorLocation(), RX, RY, RZ);
		TestTrue(FString::Printf(TEXT("joueur repris à pied près de la portière (%.2f m)"), T->DoorDistance(RX, RZ)), G.PC->GetPawn() == G.Rider && T->DoorDistance(RX, RZ) < 1.0);
		UGameplayStatics::DeleteGameInSlot(Save->SlotName, 0);
		Save->SlotName = UStridesSaveSubsystem::Slot;
	}

	// 8. Fer d'or ramassé au volant (collectibles.js : player.focus.pos, la voiture quand on conduit), +25 €.
	{
		UStridesSaveSubsystem* Save = W.GI->GetSubsystem<UStridesSaveSubsystem>();
		UStridesProgressionSubsystem* Prog = W.GI->GetSubsystem<UStridesProgressionSubsystem>();
		Save->SlotName = TEXT("strides_test_j3b_shoes");
		Save->Horseshoes.Reset();
		Prog->Restore(0, 0, FString(), {});
		AStridesCollectibles* Shoes = W.World->SpawnActor<AStridesCollectibles>();
		if (!TestTrue(TEXT("fers d'or posés"), Shoes && Shoes->Build())) return false;
		const double X = Shoes->Data().shoes[19].first, Z = Shoes->Data().shoes[19].second;
		V->PlaceAt(X, Z - 14, 0);
		const FVector2D D3 = V->DoorWeb();
		G.PutRider(*Data, D3.X, D3.Y);
		G.Tap(TEXT("KeyE"), V);
		G.PC->FeedKey(TEXT("KeyW"), true, false);
		int32 F = 0;
		for (; F < 240 && Prog->Credits == 0; ++F)
		{
			G.Frame(V);
			Shoes->Tick(1.0 / 30);
		}
		G.PC->FeedKey(TEXT("KeyW"), false, false);
		AddInfo(FString::Printf(TEXT("fer d'or ramassé au volant après %.1f s : %d €"), F / 30.0, Prog->Credits));
		TestTrue(TEXT("fer d'or ramassé au volant (+25 €)"), G.PC->GetPawn() == V && Prog->Credits == 25 && Save->Horseshoes.Num() == 1);
		Save->Horseshoes.Reset();
		Prog->Restore(0, 0, FString(), {});
		UGameplayStatics::DeleteGameInSlot(Save->SlotName, 0);
		Save->SlotName = UStridesSaveSubsystem::Slot;
	}
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesWorldFootSteeringTest, "Strides.World.FootSteering", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesWorldFootSteeringTest::RunTest(const FString&)
{
	using namespace StridesVehicleTest;
	FTestWorld W(TEXT("StridesWorldFootSteering"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	if (!TestNotNull(TEXT("données"), Data)) return false;
	FGame G;
	if (!TestTrue(TEXT("cavalier à pied possédé"), G.Make(W.World, *Data, -104, 168))) return false;
	// Prairie dégagée près du Val : le monde de test n'a que le relief exporté (pas de décor bloquant).
	G.PutRider(*Data, -60, 120);
	{
		// Sol plat de 400 m sous le marcheur (le monde de test n'a pas le décor et ses collisions).
		AStaticMeshActor* Floor = W.World->SpawnActor<AStaticMeshActor>(G.Rider->GetActorLocation() - FVector(0, 0, 95 + 50), FRotator::ZeroRotator);
		Floor->GetStaticMeshComponent()->SetMobility(EComponentMobility::Movable);
		Floor->GetStaticMeshComponent()->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube")));
		Floor->SetActorScale3D(FVector(400, 400, 1));
		Floor->GetStaticMeshComponent()->SetCollisionProfileName(TEXT("BlockAll"));
	}
	G.Rider->GetCharacterMovement()->SetMovementMode(MOVE_Walking);
	G.Rider->SetActorRotation(FRotator(0, 0, 0));
	G.PC->SetControlRotation(FRotator(0, 0, 0));
	// Le monde de test n'a pas de BeginPlay : le personnage n'y avance pas seul. On vérifie ce que le contrôleur décide
	// (vitesse visée, direction demandée, recentrage de la caméra sur un marcheur en mouvement) ; la marche elle-même est
	// jouée en paquet.
	UCharacterMovementComponent* M = G.Rider->GetCharacterMovement();
	const auto Step = [&](int32 Frames) {
		for (int32 F = 0; F < Frames; ++F)
		{
			G.Rider->ConsumeMovementInputVector();
			G.PC->StepCommands(1.0 / 30);
			// Monde sans horloge : le temps du regard manuel avance avec les images (camera.js lastManual).
		}
	};
	G.PC->FeedKey(TEXT("KeyW"), true, false);
	Step(1);
	TestEqual(TEXT("Z tenu : course du web au clavier, 5,4 m/s"), M->MaxWalkSpeed, 540.f);
	FVector In = G.Rider->GetPendingMovementInputVector();
	TestTrue(FString::Printf(TEXT("Z : vers l'avant de la caméra (%.2f ; %.2f)"), In.X, In.Y), In.X > 0.99 && FMath::Abs(In.Y) < 0.01);
	G.PC->FeedKey(TEXT("KeyD"), true, false);
	Step(1);
	In = G.Rider->GetPendingMovementInputVector().GetSafeNormal();
	TestTrue(FString::Printf(TEXT("Z + D : en avant à droite de la caméra (%.2f ; %.2f)"), In.X, In.Y), FMath::IsNearlyEqual(In.X, 0.7071, 0.01) && FMath::IsNearlyEqual(In.Y, 0.7071, 0.01));
	G.PC->FeedKey(TEXT("KeyD"), false, false);
	G.PC->FeedKey(TEXT("ShiftLeft"), true, false);
	Step(1);
	TestEqual(TEXT("Maj tenue : sprint du web, 7,2 m/s"), M->MaxWalkSpeed, 720.f);
	G.PC->FeedKey(TEXT("ShiftLeft"), false, false);
	// Marcheur qui file à 5,4 m/s vers +Y (lacet 90°), caméra restée à 0° : elle se recentre derrière lui (camera.js
	// k = 1,4 + min(v / 10 ; 1,6), soit 1,94 : 63 % de l'écart en 0,52 s), et Z le pousse alors dans son propre sens.
	G.Rider->SetActorRotation(FRotator(0, 90, 0));
	M->Velocity = FVector(0, 540, 0);
	Step(30);
	const float CamYaw = G.PC->GetControlRotation().Yaw;
	AddInfo(FString::Printf(TEXT("caméra après 1 s : %.1f° (marcheur à 90°)"), CamYaw));
	TestTrue(FString::Printf(TEXT("caméra recentrée derrière le marcheur en 1 s (%.1f°, attendu ≈ 77°)"), CamYaw), CamYaw > 70.f && CamYaw < 85.f);
	Step(1);
	In = G.Rider->GetPendingMovementInputVector().GetSafeNormal();
	TestTrue(FString::Printf(TEXT("Z suit la caméra : direction (%.2f ; %.2f)"), In.X, In.Y), In.Y > 0.95);
	M->Velocity = FVector::ZeroVector;
	G.PC->FeedKey(TEXT("KeyW"), false, false);
	return true;
}


IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesWorldNightSkyTest, "Strides.World.NightSky", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesWorldNightSkyTest::RunTest(const FString&)
{
	using namespace StridesVehicleTest;
	FTestWorld W(TEXT("StridesWorldNightSky"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	AStridesNightSky* S = W.World->SpawnActor<AStridesNightSky>();
	if (!TestNotNull(TEXT("ciel de nuit"), S)) return false;
	const FVector Cam(1000, -2000, 500), MoonDir = FVector(.3, .2, .9).GetSafeNormal();
	// Jour, sans pluie : rien d'affiché.
	S->Apply(Cam, 0.0, 0.0, MoonDir, 1.0 / 30);
	TestFalse(TEXT("étoiles cachées de jour"), S->StarsVisible());
	TestEqual(TEXT("aucune goutte sans pluie"), S->DropsShown(), 0);
	// Nuit, averse de moitié : étoiles du web (sky.js), lune, gouttes gardées selon leur graine (rain.js).
	S->Apply(Cam, 1.0, 0.5, MoonDir, 1.0 / 30);
	TestTrue(FString::Printf(TEXT("%d étoiles visibles la nuit"), S->StarCount()), S->StarsVisible() && S->StarCount() > 1000);
	TestTrue(FString::Printf(TEXT("%d gouttes sur 900 à mi-intensité"), S->DropsShown()), S->DropsShown() > 350 && S->DropsShown() < 550);
	TestTrue(TEXT("ciel centré sur la caméra"), S->GetActorLocation().Equals(Cam, 1.0));
	int64 Tris = 0;
	TArray<UStaticMeshComponent*> Parts;
	S->GetComponents(Parts);
	for (const UStaticMeshComponent* C : Parts)
	{
		const UInstancedStaticMeshComponent* I = Cast<UInstancedStaticMeshComponent>(C);
		const int64 N = I ? I->GetInstanceCount() : 1;
		if (C->GetStaticMesh() && C->GetStaticMesh()->GetRenderData()) Tris += N * C->GetStaticMesh()->GetRenderData()->LODResources[0].GetNumTriangles();
	}
	AddInfo(FString::Printf(TEXT("coût du ciel de nuit : %d composants (appels de dessin au plus), %lld triangles au LOD 0"), Parts.Num(), Tris));
	return true;
}

#endif
