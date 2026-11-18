// Revue visuelle automatique (ligne de commande -StridesShots) : le jeu se place sur des points de vue fixes du monde
// (repère web), capture chacun dans Saved/Screenshots/Strides/<nom>.png, puis la vue de jeu, et quitte.
// Sert à comparer les décors d'une version à l'autre, toujours sous les mêmes angles. Ensuite, la cavalière monte et
// le cheval enchaîne le parcours de démonstration du Pôle sur le relief : une capture toutes les 4 s (10_galop_NN).
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesShots.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API AStridesShots : public AActor
{
	GENERATED_BODY()
public:
	AStridesShots();
	virtual void Tick(float DeltaSeconds) override;
	static bool Requested();

private:
	struct FShot { FString Name; FVector Eye; FVector Target; };
	TArray<FShot> Shots;
	int32 Index = -1;
	float Wait = 0.f;
	bool bCaptured = false;
	int32 RideShot = -1;
	float RideTime = 0.f;
	UPROPERTY() TObjectPtr<class ACameraActor> Camera;
};
