#include "StridesWorldClock.h"
#include "StridesNightSky.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/PostProcessVolume.h"
#include "Engine/SkyLight.h"
#include "EngineUtils.h"
#include "StridesCore/WorldClock.h"
#include "StridesPlayerController.h"
#include "StridesSaveSubsystem.h"
#include "StridesScenery.h"
#include "StridesUnits.h"

namespace C = strides::clock;

static double Smooth(double A, double B, double X)
{
	const double T = FMath::Clamp((X - A) / (B - A), 0.0, 1.0);
	return T * T * (3 - 2 * T);
}

AStridesWorldClock::AStridesWorldClock()
{
	PrimaryActorTick.bCanEverTick = true;
}

void AStridesWorldClock::BeginPlay()
{
	Super::BeginPlay();
	// Jalon J3b : étoiles, lune et pluie du web (absents avec l'horloge : mode capture, tests).
	if (UWorld* World = GetWorld()) World->SpawnActor<AStridesNightSky>();
	UWorld* W = GetWorld();
	if (!Sun) if (TActorIterator<ADirectionalLight> It(W); It) Sun = *It;
	if (!Sky) if (TActorIterator<ASkyLight> It(W); It) Sky = *It;
	if (!Fog) if (TActorIterator<AExponentialHeightFog> It(W); It) Fog = *It;
	if (!Post) if (TActorIterator<APostProcessVolume> It(W); It) Post = *It;
	if (!Sea) if (TActorIterator<AStridesScenery> It(W); It) Sea = It->SeaMesh;
	if (const UStridesSaveSubsystem* Save = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>() : nullptr) Apply(Save->GameTime);
}

void AStridesWorldClock::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	bool bPaused = false;
	for (TActorIterator<AStridesPlayerController> It(GetWorld()); It; ++It) bPaused = bPaused || It->IsPhoneOpen();
	Step(DeltaSeconds, bPaused);
}

void AStridesWorldClock::Step(double Dt, bool bPaused)
{
	UStridesSaveSubsystem* Save = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>() : nullptr;
	if (!Save) return;
	// game.js:1448 : simulation en pause (téléphone ouvert) → le temps ne passe pas.
	Save->GameTime = C::advance(Save->GameTime, Dt, bPaused);
	RecaptureT += Dt;
	Apply(Save->GameTime);
}

void AStridesWorldClock::Apply(double GameTime)
{
	const double Hour = C::hourOf(GameTime);
	const int Day = C::dayOf(GameTime);
	const C::SunPos Pos = C::sunPosition(Hour);
	SunAltitude = Pos.alt;
	Cover = C::coverAt(Day, Hour);
	Rain = C::rainTarget(Day, Hour);
	bNight = Pos.alt < -2;
	// Jour : la lumière vient du soleil du web (sun.js sunDirection) ; nuit : lune posée à l'opposé, 35° de haut (portage).
	double X, Y, Z;
	C::sunDirection(Hour, X, Y, Z);
	if (bNight)
	{
		const double Az = FMath::DegreesToRadians(Pos.az + 180), Alt = FMath::DegreesToRadians(35.0);
		X = FMath::Sin(Az) * FMath::Cos(Alt);
		Y = FMath::Sin(Alt);
		Z = -FMath::Cos(Az) * FMath::Cos(Alt);
	}
	const FVector ToLight = StridesUnits::WebToUE(X, Y, Z).GetSafeNormal();
	if (bNight) MoonDir = ToLight;
	const double Day01 = Smooth(-3, 12, Pos.alt);
	SunLux = bNight ? 0.35 * (1 - 0.6 * Cover) : 10.0 * Day01 * (1 - 0.55 * Cover) * (1 - 0.4 * Rain);
	SkyIntensity = 0.3 + 1.2 * Smooth(-6, 10, Pos.alt) * (1 - 0.3 * Cover);
	if (Sun)
	{
		Sun->SetActorRotation((-ToLight).Rotation());
		if (UDirectionalLightComponent* L = Cast<UDirectionalLightComponent>(Sun->GetLightComponent()))
		{
			L->SetIntensity((float)SunLux);
			// Soleil bas : lumière chaude ; nuit : lune froide (portage, à confirmer à l'œil).
			const FLinearColor Warm(1.f, .72f, .48f), Noon(1.f, .97f, .92f), Moon(.62f, .72f, 1.f);
			L->SetLightColor(bNight ? Moon : FMath::Lerp(Warm, Noon, (float)Smooth(0, 25, Pos.alt)));
			L->SetAtmosphereSunLight(!bNight);
		}
	}
	if (Sky)
		if (USkyLightComponent* SL = Sky->GetLightComponent())
		{
			SL->SetIntensity((float)SkyIntensity);
			// Recapture du ciel (coûteuse) : au plus toutes les 4 s, quand l'heure a bougé d'au moins 3 min de jeu.
			if (RecaptureT >= 4 && FMath::Abs(Hour - LastCaptureHour) > .05)
			{
				SL->RecaptureSky();
				RecaptureT = 0;
				LastCaptureHour = Hour;
			}
		}
	if (Fog)
		if (UExponentialHeightFogComponent* F = Fog->GetComponent())
			F->SetFogDensity((float)(.0035 * (1 + 1.2 * Cover + 2.0 * Rain)));
	if (Post)
	{
		// Exposition fixe du portage (−1 de jour, 10 lux) relevée quand la lumière baisse (aube, soir, nuit, ciel couvert),
		// pour garder la scène lisible : +0,8 diaphragme par moitié de lumière en moins (réglage du portage).
		// Éclairement d'une surface horizontale : soleil × sin(hauteur), rapporté au soleil fixe d'avant J3-C (42°).
		const double Grazing = bNight ? 1.0 : FMath::Sin(FMath::DegreesToRadians(FMath::Max(Pos.alt, 3.0))) / FMath::Sin(FMath::DegreesToRadians(42.0));
		const double Light = FMath::Max(SunLux * Grazing + 2.0 * SkyIntensity, .6);
		Post->Settings.bOverride_AutoExposureBias = true;
		Post->Settings.AutoExposureBias = (float)FMath::Clamp(-1.0 + .8 * FMath::Log2(13.0 / Light), -1.5, 2.5);
	}
	// Marée (weather.js tideLevel, mètres autour du niveau moyen, zéro du jeu) : hauteur de la mer.
	SeaLevel = C::tideLevel(GameTime / 3600);
	if (Sea)
	{
		FVector L = Sea->GetRelativeLocation();
		L.Z = SeaLevel * StridesUnits::CmPerM;
		Sea->SetRelativeLocation(L);
	}
}
