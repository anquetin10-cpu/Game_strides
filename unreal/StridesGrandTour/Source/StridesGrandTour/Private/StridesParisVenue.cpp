#include "StridesParisVenue.h"
#include "Components/StaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "StridesDataSubsystem.h"
#include "StridesUnits.h"

AStridesParisVenue::AStridesParisVenue()
{
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));
}

UStaticMeshComponent* AStridesParisVenue::Block(double X, double Z, double Y0, double W, double D, double H, const FLinearColor& Color, bool bCollide, double Rot)
{
	// Boîte du web (box(w, h, d) posée à y0, tournée de rot autour de la verticale : axe local x → (cos rot, −sin rot)).
	UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(this);
	C->SetStaticMesh(Cube);
	C->SetMobility(EComponentMobility::Static);
	if (bCollide)
	{
		C->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
		C->SetCollisionObjectType(ECC_WorldStatic);
		C->SetCollisionResponseToAllChannels(ECR_Block);
		C->SetCollisionResponseToChannel(ECC_Camera, ECR_Ignore);
	}
	else C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	C->SetupAttachment(GetRootComponent());
	C->SetWorldLocation(StridesUnits::WebToUE(X, Y0 + H / 2, Z));
	C->SetWorldRotation(FRotator(0, -FMath::RadiansToDegrees(Rot), 0));
	C->SetWorldScale3D(FVector(W, D, H));  // cube de 1 m (100 cm) : échelle en mètres
	if (Base)
	{
		UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(Base, this);
		M->SetVectorParameterValue(TEXT("Color"), Color);
		C->SetMaterial(0, M);
	}
	C->RegisterComponent();
	Parts++;
	return C;
}

void AStridesParisVenue::Build(const UStridesDataSubsystem& Data)
{
	const strides::ParisGpData* PD = Data.Paris();
	if (!PD) return;
	Cube = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
	Base = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	if (!Cube) return;
	const strides::ParisSite& P = PD->site;
	const double X = P.x, Z = P.z, Y = P.y;
	const FLinearColor Asphalt = FLinearColor::FromSRGBColor(FColor(0x4f, 0x50, 0x52));
	// Enrobé de la zone (paris.js:122 : bounds + 40 m), parvis, voie d'accès vers la bretelle.
	const double Bx0 = X - 215, Bx1 = X + 72, Bz0 = Z - 92, Bz1 = Z + 92;
	Block((Bx0 + Bx1) / 2, (Bz0 + Bz1) / 2, Y - 0.6, Bx1 - Bx0 + 40, Bz1 - Bz0 + 40, 0.6, Asphalt, true);
	Block(X, Z, Y, P.hall.w + 14, P.hall.d + 14, 0.02, FLinearColor::FromSRGBColor(FColor(0xa9, 0xa4, 0x9a)), true);
	Block(P.exit.x + 28, P.exit.z, Y, 70, 9, 0.06, FLinearColor::FromSRGBColor(FColor(0x3b, 0x3c, 0x3e)), true);
	// Marquages du parking des camions.
	for (int K = -3; K <= 3; K++) Block(P.park.x + K * 4.5, P.park.z - 9, Y + 0.01, 0.15, 8, 0.03, FLinearColor::FromSRGBColor(FColor(0xe9, 0xe7, 0xe0)), false);
	// Salle : sol, piste en sable, murs (porte des cavaliers à l'ouest), linteau.
	Block(X, Z, Y, P.hall.w - 1, P.hall.d - 1, 0.06, FLinearColor::FromSRGBColor(FColor(0x2a, 0x2b, 0x2f)), true);
	Block(X, Z, Y + 0.03, P.arena.w, P.arena.d, 0.06, FLinearColor::FromSRGBColor(FColor(0xcd, 0xb6, 0x8f)), true);
	const FLinearColor WallC = FLinearColor::FromSRGBColor(FColor(0x25, 0x27, 0x2b));
	const double HW = P.hall.w / 2, HD = P.hall.d / 2, WH = P.hall.h > 0 ? P.hall.h : 21;
	const double Dz0 = P.door.z - Z - P.doorW / 2, Dz1 = P.door.z - Z + P.doorW / 2;
	Block(X - HW, Z + (-HD + Dz0) / 2, Y, 0.6, Dz0 + HD, WH, WallC, true);
	Block(X - HW, Z + (Dz1 + HD) / 2, Y, 0.6, HD - Dz1, WH, WallC, true);
	Block(X - HW, P.door.z, Y + 4.6, 0.6, P.doorW, WH - 4.6, WallC, true);
	Block(X + HW, Z, Y, 0.6, P.hall.d, WH, WallC, true);
	Block(X, Z - HD, Y, P.hall.w, 0.6, WH, WallC, true);
	Block(X, Z + HD, Y, P.hall.w, 0.6, WH, WallC, true);
	// Lice de la piste (planches blanches de 1,05 m, paris.js:197-226), entrée de piste de 5,6 m à l'ouest.
	const FLinearColor Board = FLinearColor::FromSRGBColor(FColor(0xf2, 0xf1, 0xec));
	const double Hx = P.arena.w / 2, Hz = P.arena.d / 2;
	const double Gz0 = P.gate.z - Z - 2.8, Gz1 = P.gate.z - Z + 2.8;
	Block(X, Z - Hz, Y, P.arena.w, 0.12, 1.05, Board, true);
	Block(X, Z + Hz, Y, P.arena.w, 0.12, 1.05, Board, true);
	Block(X + Hx, Z, Y, 0.12, P.arena.d, 1.05, Board, true);
	Block(X - Hx, Z + (Gz1 + Hz) / 2, Y, 0.12, Hz - Gz1, 1.05, Board, true);
	Block(X - Hx, Z + (-Hz + Gz0) / 2, Y, 0.12, Gz0 + Hz, 1.05, Board, true);
	// Tribunes (paris.js:235-256) : marches de 0,85 m pour 0,5 m, du bord de piste au mur ; main courante.
	for (const strides::ParisRect& St : P.stands)
	{
		const bool bEast = FMath::Abs(FMath::Abs(St.rot) - UE_DOUBLE_HALF_PI) < 0.01;
		const double Len = bEast ? St.d : St.w, Depth = bEast ? St.w : St.d;
		const int32 Rows = FMath::FloorToInt(Depth / 0.85);
		const double Sx = FMath::Sin(St.rot), Sz = FMath::Cos(St.rot);
		for (int32 I = 0; I < Rows; I++)
		{
			const double Lz = -Depth / 2 + 0.425 + I * 0.85;
			Block(St.x + Sx * Lz, St.z + Sz * Lz, Y, Len, 0.85, 1.4 + I * 0.5, I % 2 ? FLinearColor::FromSRGBColor(FColor(0x2e, 0x30, 0x36)) : FLinearColor::FromSRGBColor(FColor(0x34, 0x36, 0x3c)), true, St.rot);
		}
		const double Lz = -Depth / 2 + 0.02;
		Block(St.x + Sx * Lz, St.z + Sz * Lz, Y + 1.4, Len, 0.06, 1.1, FLinearColor::FromSRGBColor(FColor(0x9f, 0xb2, 0xbb)), false, St.rot);
	}
	// Paddock d'échauffement (sable) et sa lice (ouverture de 6 m à l'est, vers la porte des cavaliers).
	const strides::ParisRect& Wu = P.warmup;
	Block(Wu.x, Wu.z, Y + 0.02, Wu.w, Wu.d, 0.06, FLinearColor::FromSRGBColor(FColor(0xc0, 0xa8, 0x81)), true);
	{
		const double GapPos = FMath::Clamp((P.door.z - (Wu.z - Wu.d / 2)) / Wu.d, 0.15, 0.85);
		const double X0 = Wu.x - Wu.w / 2, X1 = Wu.x + Wu.w / 2, Z0 = Wu.z - Wu.d / 2, Z1 = Wu.z + Wu.d / 2, Gz = Z0 + Wu.d * GapPos;
		Block(Wu.x, Z0, Y, Wu.w, 0.12, 1.0, Board, true);
		Block(Wu.x, Z1, Y, Wu.w, 0.12, 1.0, Board, true);
		Block(X0, Wu.z, Y, 0.12, Wu.d, 1.0, Board, true);
		Block(X1, (Z0 + Gz - 3) / 2, Y, 0.12, Gz - 3 - Z0, 1.0, Board, true);
		Block(X1, (Gz + 3 + Z1) / 2, Y, 0.12, Z1 - Gz - 3, 1.0, Board, true);
	}
	// Allée en caoutchouc du paddock à la porte des cavaliers.
	Block((Wu.x + Wu.w / 2 + X - HW) / 2, P.door.z, Y + 0.01, X - HW - (Wu.x + Wu.w / 2), P.doorW, 0.04, FLinearColor::FromSRGBColor(FColor(0x33, 0x34, 0x36)), false);
	// Écuries provisoires (tente blanche) et tente des accréditations.
	Block(P.stables.x, P.stables.z, Y, P.stables.w, P.stables.d, 3.6, FLinearColor::FromSRGBColor(FColor(0xee, 0xee, 0xea)), true);
	Block(P.secretariat.x, P.secretariat.z - 3.5, Y, 5, 3, 2.6, FLinearColor::FromSRGBColor(FColor(0xf4, 0xf4, 0xf0)), true);
	Block(P.secretariat.x, P.secretariat.z - 1.6, Y, 3.2, 0.8, 1.0, FLinearColor::FromSRGBColor(FColor(0x15, 0x16, 0x1a)), true);
	// Projecteurs (paris.js _flood, floodlights du paddock) : le Grand Prix se court le soir (20 h). Lumières ponctuelles
	// sans ombre au-dessus de la piste (3 × 2) et du paddock (2) : rendu provisoire (choix n° 34).
	auto Flood = [&](double Lx, double Lz, double Hh, double Cd, double R)
	{
		UPointLightComponent* L = NewObject<UPointLightComponent>(this);
		L->SetupAttachment(GetRootComponent());
		L->SetMobility(EComponentMobility::Movable);
		L->SetWorldLocation(StridesUnits::WebToUE(Lx, Y + Hh, Lz));
		L->SetIntensityUnits(ELightUnits::Candelas);
		L->SetIntensity(Cd);
		L->SetAttenuationRadius(R * 100.0);
		L->SetCastShadows(false);
		L->SetLightColor(FLinearColor(1.f, .97f, .92f));
		L->RegisterComponent();
		Lights++;
	};
	for (int32 I = -1; I <= 1; I++)
		for (int32 K = -1; K <= 1; K += 2) Flood(X + I * P.arena.w / 3, Z + K * P.arena.d / 4, 17, 2500, 60);
	Flood(Wu.x - Wu.w / 4, Wu.z, 12, 1200, 35);
	Flood(Wu.x + Wu.w / 4, Wu.z, 12, 1200, 35);
	UE_LOG(LogTemp, Display, TEXT("Strides Paris : arène construite (%d blocs, %d projecteurs) en (%.0f ; %.0f), sol %.2f m"), Parts, Lights, X, Z, Y);
}
