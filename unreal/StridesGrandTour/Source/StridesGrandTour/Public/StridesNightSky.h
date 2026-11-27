// Jalon J3b (monde vivant) : ciel de nuit et pluie du web, posés autour de la caméra.
//  - étoiles de sky.js (strides::sky::stars : 1 693 directions, trois classes d'éclat), estompées par nightFactor ;
//  - lune (disque clair dans la direction de la lumière de lune de l'horloge du monde) ;
//  - pluie de rain.js (traînées dans une boîte de 46 × 26 × 46 m qui suit la caméra, nombre selon l'intensité de
//    weather.js rainTarget).
// Créé par l'horloge du monde (donc absent en mode capture -StridesShots et dans les tests qui ne le posent pas).
// Formes PROVISOIRES (actifs.md) : carrés et traînées non éclairés, pas le ciel physique de sky.js (nuages non portés).
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesNightSky.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API AStridesNightSky : public AActor
{
	GENERATED_BODY()
public:
	AStridesNightSky();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	// Pose le ciel pour une caméra, un facteur de nuit (0..1), une intensité de pluie (0..1) et une direction de lune
	// (unitaire, repère Unreal) ; Dt fait tomber la pluie. Appelé par le Tick (et les tests).
	void Apply(const FVector& Cam, double Night, double RainK, const FVector& MoonDir, double Dt);
	int32 StarCount() const;
	int32 DropsShown() const { return Shown; }
	bool StarsVisible() const;
private:
	UPROPERTY() TArray<TObjectPtr<class UInstancedStaticMeshComponent>> StarBands;
	UPROPERTY() TObjectPtr<class UInstancedStaticMeshComponent> Drops;
	UPROPERTY() TObjectPtr<class UStaticMeshComponent> Moon;
	UPROPERTY() TArray<TObjectPtr<class UMaterialInstanceDynamic>> StarMats;
	UPROPERTY() TObjectPtr<class UMaterialInstanceDynamic> MoonMat;
	TArray<float> DropSeed, DropX, DropY, DropZ;
	double T = 0;
	int32 Shown = 0;
	bool bBuilt = false;
	void Build();
};
