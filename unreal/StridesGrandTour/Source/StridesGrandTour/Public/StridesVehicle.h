// Jalon J3b (monde vivant) : véhicule conduisible du jeu web (src/entities/vehicle.js Vehicle, truck.js Truck).
// La dynamique est celle du cœur (strides::TruckSim, portage de truckPhysics.js prouvé contre l'oracle du web par le
// ctest « vehicules ») ; cet acteur la nourrit des commandes du joueur (player.js:665-669 : throttle = mv.y × 1,25,
// steer = mv.x × 1,2), la pose au sol, la heurte aux collisions du monde (vehicle.js update : trois cercles le long de
// l'axe contre colliders.resolve) et tient à jour sa boîte de collision (vehicle.js _syncCollider, désactivée au volant).
// Phares allumés moteur tournant la nuit (vehicle.js lightK : night > 0,25, nightFactor de sky.js).
// Silhouette PROVISOIRE (actifs.md) : caisse, habitacle et roues en blocs aux gabarits et teintes du web ; le camion de
// l'écurie a le gabarit du porteur d'origine (truckModel.js TRUCK_DIM, 8,5 m), pas le modèle STX de 13 m.
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "StridesCore/Vehicle.h"
#include "StridesVehicle.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API AStridesVehicle : public APawn
{
	GENERATED_BODY()
public:
	AStridesVehicle();
	// Modèle du web (clio, golf, p508, p3008, duster, tractor, truck), position (repère web), teinte ; ParkedIndex : rang
	// dans world_parked.json (−1 : camion de l'écurie). Faux si le modèle ou les données manquent.
	bool Init(const class UStridesDataSubsystem& Data, const FString& InKind, double X, double Z, double Heading, const FLinearColor& Paint, int32 InParkedIndex);
	virtual void Tick(float DeltaSeconds) override;
	// Commandes au volant (repère des commandes du web : x à droite, y en avant), remises à zéro sans conducteur.
	void SetDriveInput(const FVector2D& Move) { MoveInput = Move; }
	// Montée au volant (player.enterVehicle) : le cavalier à pied s'installe, le moteur démarre, le contrôleur possède le
	// véhicule. Camion : le cheval laissé à moins de 15 m est embarqué (choix n° 26 de plan.md).
	bool Enter(class APlayerController* PC, class AStridesRider* Rider);
	// Descente (interaction « Descendre », vitesse < 1,5 m/s) : à la portière conducteur, moteur coupé ; faux sinon.
	bool Exit(class APlayerController* PC);
	bool CanExit() const { return Driver.IsValid() && FMath::Abs(Sim.vx) < 1.5; }
	// Portière conducteur (repère web, m) et distance du point (x, z) à cette portière.
	FVector2D DoorWeb() const;
	double DoorDistance(double X, double Z) const;
	// Rampe arrière du camion (repère web) : où le cheval embarqué est déchargé.
	FVector2D RampWeb() const;
	// Pose (tests, reprise) : véhicule à l'arrêt.
	void PlaceAt(double X, double Z, double Heading);
	// Une image de simulation (tests) ; le Tick l'appelle avec le pas de l'image.
	void StepSim(double Dt);
	double SpeedMS() const { return Sim.vx; }
	double Heading() const { return Sim.heading; }
	FVector2D WebPos() const { return FVector2D(Sim.x, Sim.z); }
	bool IsDriven() const { return Driver != nullptr; }
	bool HeadlightsOn() const { return bLights; }
	bool CarriesHorse() const { return HorseAboard.IsValid(); }
	const FString& Kind() const { return KindId; }
	int32 ParkedIndex() const { return ParkedIdx; }
	// vehicle.js atSpot : encore à sa place d'origine (n'est pas sauvegardé).
	bool bAtSpot = true;
	int32 BumpCount = 0;
	strides::TruckSim Sim{strides::VehicleSpec()};
	strides::VehicleGeometry Geo;
	// Facteur de nuit (sky.js nightFactor = smoothstep(0,03 ; −0,16 ; sin hauteur du soleil)), posé par l'horloge du monde.
	static double NightFactor(double SunAltitudeDeg);
	double NightK = 0;  // lu sur l'horloge du monde à chaque image (0 sans horloge : tests, mode capture)
	// Libellé du rapport et vitesse (HUD de conduite : « D3 · 42 km/h »).
	FString DriveText() const;

private:
	UPROPERTY() TObjectPtr<class USceneComponent> Body;
	UPROPERTY() TObjectPtr<class USpringArmComponent> Boom;
	UPROPERTY() TObjectPtr<class UCameraComponent> Camera;
	UPROPERTY() TObjectPtr<class USpotLightComponent> HeadL;
	UPROPERTY() TObjectPtr<class USpotLightComponent> HeadR;
	UPROPERTY() TObjectPtr<class UStaticMeshComponent> LampL;
	UPROPERTY() TObjectPtr<class UStaticMeshComponent> LampR;
	UPROPERTY() TArray<TObjectPtr<class UStaticMeshComponent>> Wheels;
	TWeakObjectPtr<class AStridesRider> Driver;
	TWeakObjectPtr<class AStridesHorse> HorseAboard;
	TWeakObjectPtr<class AStridesCourse> Course;
	TWeakObjectPtr<class AStridesWorldClock> Clock;
	const class UStridesDataSubsystem* DataRef = nullptr;
	FString KindId;
	int32 ParkedIdx = -1;
	int32 ColliderIdx = -1;
	FVector2D MoveInput = FVector2D::ZeroVector;
	bool bWasMoving = false, bLights = false;
	double LastBump = -10, Time = 0;
	class UStaticMeshComponent* Part(class UStaticMesh* Mesh, const FVector& Loc, const FVector& Size, const FLinearColor& Color, const FRotator& Rot = FRotator::ZeroRotator);
	void SyncCollider();
	void Pose();
	class AStridesCourse* FindCourse();
};
