#include "StridesVehicle.h"

#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/SpotLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "EngineUtils.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesRider.h"
#include "StridesUnits.h"
#include "StridesWorldClock.h"

AStridesVehicle::AStridesVehicle()
{
	PrimaryActorTick.bCanEverTick = true;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	Body = CreateDefaultSubobject<USceneComponent>(TEXT("Body"));
	Body->SetupAttachment(RootComponent);
	// Caméra de conduite (camera.js : derrière le véhicule à camDist, tangage 0,24 rad ; recentrage k = 2,4).
	Boom = CreateDefaultSubobject<USpringArmComponent>(TEXT("Boom"));
	Boom->SetupAttachment(RootComponent);
	Boom->SetRelativeLocation(FVector(0, 0, 150));
	Boom->SetRelativeRotation(FRotator(-FMath::RadiansToDegrees(0.24), 0, 0));
	Boom->bUsePawnControlRotation = false;
	Boom->bInheritPitch = false;
	Boom->bInheritRoll = false;
	Boom->bEnableCameraRotationLag = true;
	Boom->CameraRotationLagSpeed = 2.4f;
	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(Boom);
	Camera->FieldOfView = 55.f;
	HeadL = CreateDefaultSubobject<USpotLightComponent>(TEXT("HeadL"));
	HeadR = CreateDefaultSubobject<USpotLightComponent>(TEXT("HeadR"));
	for (USpotLightComponent* L : {HeadL.Get(), HeadR.Get()})
	{
		L->SetupAttachment(Body);
		L->SetMobility(EComponentMobility::Movable);
		L->SetIntensityUnits(ELightUnits::Candelas);
		L->SetIntensity(1800.f);
		L->SetAttenuationRadius(4500.f);
		L->SetInnerConeAngle(14.f);
		L->SetOuterConeAngle(32.f);
		L->SetLightColor(FLinearColor(1.f, .95f, .85f));
		L->SetCastShadows(false);
		L->SetVisibility(false);
	}
	AutoPossessPlayer = EAutoReceiveInput::Disabled;
}

UStaticMeshComponent* AStridesVehicle::Part(UStaticMesh* Mesh, const FVector& Loc, const FVector& Size, const FLinearColor& Color, const FRotator& Rot)
{
	UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(this);
	C->SetStaticMesh(Mesh);
	C->SetMobility(EComponentMobility::Movable);
	C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	C->SetupAttachment(Body);
	C->SetRelativeLocation(Loc);
	C->SetRelativeRotation(Rot);
	C->SetRelativeScale3D(Size / 100.0);
	if (UMaterialInterface* Base = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial")))
	{
		UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(Base, this);
		M->SetVectorParameterValue(TEXT("Color"), Color);
		C->SetMaterial(0, M);
	}
	C->RegisterComponent();
	return C;
}

bool AStridesVehicle::Init(const UStridesDataSubsystem& Data, const FString& InKind, double X, double Z, double H, const FLinearColor& Paint, int32 InParkedIndex)
{
	const strides::VehicleData* V = Data.Vehicles();
	const std::string K = TCHAR_TO_UTF8(*InKind);
	if (!V || !V->specs.count(K) || !V->geometry.count(K)) return false;
	DataRef = &Data;
	KindId = InKind;
	ParkedIdx = InParkedIndex;
	Sim = strides::TruckSim(V->specs.at(K));
	Geo = V->geometry.at(K);
	Sim.x = X;
	Sim.z = Z;
	Sim.heading = H;
	// vehicle.js : réservoir entamé d'une voiture du quotidien (tiré au hasard au web) ; camion : trois quarts (placeFromSave).
	Sim.fuelL = Sim.spec.tank * (InParkedIndex < 0 ? 0.75 : 0.6);
	UStaticMesh* Cube = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
	UStaticMesh* Cyl = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	const double L = Geo.L * 100, W = Geo.W * 100, R = Geo.r * 100, Zc = Geo.zc * 100;
	const FLinearColor Glass(.06f, .09f, .11f), Tyre(.03f, .03f, .035f);
	if (KindId == TEXT("truck"))
	{
		// Porteur 7,5 t : cabine à l'avant, caisse à chevaux haute ; essieux du web (zFront 2,75, zRear −1,45).
		Part(Cube, FVector(L * .5 - 110, 0, R + 120), FVector(200, W, 200), Paint);
		Part(Cube, FVector(L * .5 - 60, 0, R + 170), FVector(90, W * .92, 80), Glass);
		Part(Cube, FVector(-110, 0, R + 160), FVector(L - 240, W, 280), FLinearColor(.92f, .92f, .9f));
		for (const double Ax : {Sim.spec.zFront, Sim.spec.zRear})
			for (const int S : {-1, 1}) Wheels.Add(Part(Cyl, FVector(Ax * 100, S * (W * .5 - 14), R), FVector(2 * R, 2 * R, 26), Tyre, FRotator(0, 0, 90)));
	}
	else
	{
		const bool bTractor = KindId == TEXT("tractor");
		Part(Cube, FVector(Zc, 0, R + 30), FVector(L, W, bTractor ? 90 : 62), Paint);
		Part(Cube, FVector(Zc + (bTractor ? -L * .2 : -L * .08), 0, R + (bTractor ? 120 : 85)), FVector(L * (bTractor ? .3 : .55), W * .9, bTractor ? 110 : 48), Glass);
		for (int32 I = 0; I < 4; ++I)
		{
			const double Ax = (I < 2 ? Sim.spec.zFront : Sim.spec.zRear) * 100, Y = (I % 2 ? 1 : -1) * (W * .5 - 12);
			Wheels.Add(Part(Cyl, FVector(Ax, Y, R), FVector(2 * R, 2 * R, 22), Tyre, FRotator(0, 0, 90)));
		}
	}
	// Optiques avant (blocs clairs) et phares (projecteurs, allumés la nuit moteur tournant).
	const double Front = Zc + L * .5, LampZ = R + (KindId == TEXT("truck") ? 60 : 35);
	LampL = Part(Cube, FVector(Front, -W * .32, LampZ), FVector(4, 22, 10), FLinearColor(.95f, .95f, .9f));
	LampR = Part(Cube, FVector(Front, W * .32, LampZ), FVector(4, 22, 10), FLinearColor(.95f, .95f, .9f));
	HeadL->SetRelativeLocationAndRotation(FVector(Front + 5, -W * .32, LampZ), FRotator(-6, 0, 0));
	HeadR->SetRelativeLocationAndRotation(FVector(Front + 5, W * .32, LampZ), FRotator(-6, 0, 0));
	Boom->TargetArmLength = Geo.camDist * 100;
	Boom->SetRelativeLocation(FVector(0, 0, KindId == TEXT("truck") ? 300 : 150));
	Course = FindCourse();
	if (AStridesCourse* C = Course.Get())
	{
		strides::Colliders& Col = C->MutableWorldColliders();
		if (ParkedIdx >= 0)
		{
			// Boîte « parked » posée par AStridesCourse (même ordre que world_parked.json).
			int32 N = 0;
			for (int32 I = 0; I < (int32)Col.size(); ++I)
				if (Col.all()[(size_t)I].tag == "parked" && N++ == ParkedIdx) { ColliderIdx = I; break; }
		}
		else ColliderIdx = Col.addBox(X, Z, Geo.hw, Geo.hd, H, std::numeric_limits<double>::infinity(), "truck");
	}
	SyncCollider();
	Pose();
	return true;
}

AStridesCourse* AStridesVehicle::FindCourse()
{
	if (!GetWorld()) return nullptr;
	TActorIterator<AStridesCourse> It(GetWorld());
	return It ? *It : nullptr;
}

double AStridesVehicle::NightFactor(double SunAltitudeDeg)
{
	// sky.js:407 nightFactor = smoothstep(0,03, −0,16, sun.y) ; math.js smoothstep accepte des bornes inversées.
	const double Y = FMath::Sin(FMath::DegreesToRadians(SunAltitudeDeg));
	const double T = FMath::Clamp((Y - 0.03) / (-0.16 - 0.03), 0.0, 1.0);
	return T * T * (3 - 2 * T);
}

FVector2D AStridesVehicle::DoorWeb() const
{
	double X, Z;
	strides::vehicleDoor(Geo, Sim.x, Sim.z, Sim.heading, X, Z);
	return FVector2D(X, Z);
}

FVector2D AStridesVehicle::RampWeb() const
{
	const double Back = Geo.L * .5 + 2.5;
	return FVector2D(Sim.x - FMath::Sin(Sim.heading) * Back, Sim.z - FMath::Cos(Sim.heading) * Back);
}

double AStridesVehicle::DoorDistance(double X, double Z) const { return FVector2D::Distance(DoorWeb(), FVector2D(X, Z)); }

void AStridesVehicle::PlaceAt(double X, double Z, double H)
{
	Sim.x = X;
	Sim.z = Z;
	Sim.heading = H;
	Sim.vx = Sim.vy = Sim.r = 0;
	SyncCollider();
	Pose();
}

void AStridesVehicle::SyncCollider()
{
	AStridesCourse* C = Course.Get();
	strides::Collider* Box = C ? C->MutableWorldColliders().get(ColliderIdx) : nullptr;
	if (!Box) return;
	// vehicle.js _syncCollider : désactivée au volant ; centrée à zc vers l'avant (godet du tracteur).
	Box->enabled = !Driver.IsValid();
	Box->x = Sim.x + FMath::Sin(Sim.heading) * Geo.zc;
	Box->z = Sim.z + FMath::Cos(Sim.heading) * Geo.zc;
	Box->rot = Sim.heading;
	Box->c = FMath::Cos(Sim.heading);
	Box->s = FMath::Sin(Sim.heading);
}

bool AStridesVehicle::Enter(APlayerController* PC, AStridesRider* Rider)
{
	if (!PC || !Rider || Driver.IsValid() || Rider->MountedOn) return false;
	Driver = Rider;
	bAtSpot = false;
	Rider->SetActorHiddenInGame(true);
	Rider->SetActorEnableCollision(false);
	Rider->GetCharacterMovement()->DisableMovement();
	// Choix n° 26 : le camion embarque le cheval resté à moins de 15 m (transport.loadInstant du web, sans la séquence de
	// chargement à la rampe, non portée).
	if (KindId == TEXT("truck"))
		if (TActorIterator<AStridesHorse> It(GetWorld()); It)
		{
			double HX, HY, HZ;
			StridesUnits::UEToWeb(It->GetActorLocation(), HX, HY, HZ);
			if (FVector2D::Distance(FVector2D(HX, HZ), FVector2D(Sim.x, Sim.z)) < 15.0)
			{
				HorseAboard = *It;
				It->Halt();
				It->SetActorHiddenInGame(true);
				It->SetActorEnableCollision(false);
				Sim.horses = 1;
			}
		}
	Sim.startEngine();
	SyncCollider();
	PC->Possess(this);
	UE_LOG(LogTemp, Display, TEXT("Strides véhicule : au volant (%s%s) en (%.1f ; %.1f)"), *KindId, HorseAboard.IsValid() ? TEXT(", cheval embarqué") : TEXT(""), Sim.x, Sim.z);
	return true;
}

bool AStridesVehicle::Exit(APlayerController* PC)
{
	AStridesRider* R = Driver.Get();
	if (!R || !CanExit()) return false;
	Driver = nullptr;
	Sim.vx = 0;
	Sim.engineOn = false;  // vehicle.js stopEngine
	MoveInput = FVector2D::ZeroVector;
	const FVector2D D = DoorWeb();
	const double G = DataRef ? DataRef->TerrainHeight(D.X, D.Y) : 0.0;
	R->SetActorLocationAndRotation(StridesUnits::WebToUE(D.X, G, D.Y) + FVector(0, 0, 95), FRotator(0, StridesUnits::HeadingToYawDeg(Sim.heading + UE_DOUBLE_HALF_PI), 0));
	R->SetActorHiddenInGame(false);
	R->SetActorEnableCollision(true);
	R->GetCharacterMovement()->SetMovementMode(MOVE_Walking);
	if (AStridesHorse* Hs = HorseAboard.Get())
	{
		// Déchargé derrière le camion (rampe arrière), dans l'axe.
		const FVector2D Ramp = RampWeb();
		Hs->PlaceAt(Ramp.X, Ramp.Y, Sim.heading);
		Hs->SetActorHiddenInGame(false);
		Hs->SetActorEnableCollision(true);
		HorseAboard = nullptr;
		Sim.horses = 0;
	}
	SyncCollider();
	if (PC) PC->Possess(R);
	UE_LOG(LogTemp, Display, TEXT("Strides véhicule : descendu (%s) en (%.1f ; %.1f)"), *KindId, D.X, D.Y);
	return true;
}

void AStridesVehicle::StepSim(double Dt)
{
	if (Dt <= 0) return;
	Time += Dt;
	const bool bDriving = Driver.IsValid();
	const bool bMoving = FMath::Abs(Sim.vx) > 0.05 || bDriving;
	if (!bMoving && !bWasMoving)
	{
		// vehicle.js update : à l'arrêt sans conducteur, rien à simuler.
		Sim.rpm = Sim.engineOn ? Sim.spec.idle : FMath::Max(0.0, Sim.rpm - Dt * 1500);
		bLights = false;
		return;
	}
	// Adhérence : route ou terrain meuble (nearestRoad < 0,5 m au web) ; pente sous l'empattement.
	if (DataRef)
	{
		const double Fx = FMath::Sin(Sim.heading), Fz = FMath::Cos(Sim.heading), Hw = Geo.wb * .5;
		Sim.slope = (DataRef->TerrainHeight(Sim.x + Fx * Hw, Sim.z + Fz * Hw) - DataRef->TerrainHeight(Sim.x - Fx * Hw, Sim.z - Fz * Hw)) / FMath::Max(0.5, Geo.wb);
	}
	strides::DriveInput In;
	// player.js:667-668 : throttle = clamp(mv.y × 1,25), steer = clamp(mv.x × 1,2).
	In.throttle = FMath::Clamp(MoveInput.Y * 1.25, -1.0, 1.0);
	In.steer = FMath::Clamp(MoveInput.X * 1.2, -1.0, 1.0);
	Sim.step(Dt, bDriving ? &In : nullptr);
	bWasMoving = bMoving;
	// Collisions (vehicle.js update) : trois cercles le long de l'axe contre les colliders du monde, sa propre boîte exclue.
	double Bump = 0;
	if (AStridesCourse* C = Course.Get(); C && FMath::Abs(Sim.vx) > 0.01)
	{
		strides::Colliders& Col = C->MutableWorldColliders();
		strides::Collider* Own = Col.get(ColliderIdx);
		const bool bWas = Own ? Own->enabled : false;
		if (Own) Own->enabled = false;
		const double Fx = FMath::Sin(Sim.heading), Fz = FMath::Cos(Sim.heading);
		const double Half = Geo.L / 2 - Geo.W / 2;
		const double Feet = (DataRef ? DataRef->TerrainHeight(Sim.x, Sim.z) : 0.0) + 0.4;
		for (const double Off : {-Half, 0.0, Half})
		{
			const double Cx = Sim.x + Fx * (Off + Geo.zc), Cz = Sim.z + Fz * (Off + Geo.zc);
			double Px = Cx, Pz = Cz;
			const strides::ColliderHit Hit = Col.resolve(Px, Pz, Geo.W / 2, Feet);
			if (!Hit.hit) continue;
			Sim.x += Px - Cx;
			Sim.z += Pz - Cz;
			const double Into = -(Fx * Hit.nx + Fz * Hit.nz) * (Sim.vx >= 0 ? 1 : -1);
			Bump = FMath::Max(Bump, FMath::Abs(Sim.vx) * FMath::Clamp(Into, 0.2, 1.0));
		}
		if (Own) Own->enabled = bWas;
	}
	if (Bump > 2.5 && Time - LastBump > 0.5)
	{
		LastBump = Time;
		++BumpCount;
		Sim.impact(-0.25);
		UE_LOG(LogTemp, Display, TEXT("Strides véhicule : choc à %.1f m/s (%s)"), Bump, *KindId);
	}
	else if (Bump > 0) Sim.vx *= 0.9;
	// Phares (vehicle.js lightK : moteur tournant et night > 0,25).
	bLights = Sim.engineOn && NightK > 0.25;
	SyncCollider();
}

void AStridesVehicle::Pose()
{
	const double G = DataRef ? DataRef->TerrainHeight(Sim.x, Sim.z) : 0.0;
	SetActorLocationAndRotation(StridesUnits::WebToUE(Sim.x, G, Sim.z), FRotator(0, StridesUnits::HeadingToYawDeg(Sim.heading), 0));
	Body->SetRelativeRotation(FRotator(FMath::RadiansToDegrees(FMath::Atan(Sim.slope)), 0, 0));
	for (UStaticMeshComponent* W : Wheels) if (W) W->SetRelativeRotation(FRotator(-FMath::RadiansToDegrees(Sim.wheelSpin), 0, 90));
	HeadL->SetVisibility(bLights);
	HeadR->SetVisibility(bLights);
	if (AStridesHorse* H = HorseAboard.Get())
	{
		// Cheval embarqué : il voyage avec le camion (caché), au droit de l'essieu arrière.
		H->PlaceAt(Sim.x - FMath::Sin(Sim.heading) * 1.1, Sim.z - FMath::Cos(Sim.heading) * 1.1, Sim.heading);
	}
}

void AStridesVehicle::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!Driver.IsValid()) MoveInput = FVector2D::ZeroVector;
	if (!Clock.IsValid() && GetWorld())
		for (TActorIterator<AStridesWorldClock> It(GetWorld()); It; ++It) Clock = *It;
	if (const AStridesWorldClock* C = Clock.Get()) NightK = NightFactor(C->SunAltitude);
	// Pas du web plafonné à 0,05 s (game.js frame) ; jeu suspendu (pause, téléphone) : Dt nul, rien ne bouge.
	StepSim(FMath::Min<double>(DeltaSeconds, 0.05));
	Pose();
}

FString AStridesVehicle::DriveText() const
{
	return FString::Printf(TEXT("%s · %.0f km/h · %.0f l"), UTF8_TO_TCHAR(Sim.gearLabel().c_str()), FMath::Abs(Sim.vx) * 3.6, Sim.fuelL);
}
