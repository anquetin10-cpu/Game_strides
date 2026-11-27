// Jalon J3-C (monde vivant de Deauville) : heure du jeu, jour et nuit, météo et marée, d'après le web.
//  - temps : game.js:1448 (journée de 1 200 s, arrêté téléphone ouvert), porté par StridesCore/WorldClock ; l'heure vit
//    dans UStridesSaveSubsystem::GameTime (save.data.gameTime du web, écrite et relue avec la partie) ;
//  - soleil : position réelle du web (sun.js : Deauville, 23 août, UTC + 2) → rotation de la lumière directionnelle ;
//  - météo : couverture nuageuse et averses du web (weather.js) → intensités et brouillard ; marée (weather.js
//    tideLevel) → hauteur de la mer.
// Les intensités (lux, lumière du ciel, exposition, brouillard) sont un RÉGLAGE DU PORTAGE (sky.js du web n'est pas
// porté : ciel, nuages, étoiles, lampadaires) ; à confirmer à l'œil par Julien. Absent en mode capture (-StridesShots :
// lumière fixe des captures de référence) et pendant les tests qui ne le posent pas eux-mêmes.
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesWorldClock.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API AStridesWorldClock : public AActor
{
	GENERATED_BODY()
public:
	AStridesWorldClock();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	// Pose l'éclairage, le brouillard et la mer pour l'heure de jeu donnée (s depuis le début, save.data.gameTime).
	void Apply(double GameTime);
	// Avance l'heure (Dt réel ; arrêtée si Paused), puis Apply.
	void Step(double Dt, bool bPaused);
	UPROPERTY() TObjectPtr<class ADirectionalLight> Sun;
	UPROPERTY() TObjectPtr<class ASkyLight> Sky;
	UPROPERTY() TObjectPtr<class AExponentialHeightFog> Fog;
	UPROPERTY() TObjectPtr<class APostProcessVolume> Post;
	UPROPERTY() TObjectPtr<class UStaticMeshComponent> Sea;
	// Relevés de la dernière application (tests, journal) : hauteur du soleil (°), intensité (lux), niveau de la mer (m).
	double SunAltitude = 0, SunLux = 0, SeaLevel = 0, SkyIntensity = 0, Cover = 0, Rain = 0;
	bool bNight = false;
	// Jalon J3b : direction de la lune (unitaire, repère Unreal), posée la nuit ; lue par le ciel de nuit.
	FVector MoonDir = FVector(0, 0, 1);
private:
	double RecaptureT = 0, LastCaptureHour = -100;
};
