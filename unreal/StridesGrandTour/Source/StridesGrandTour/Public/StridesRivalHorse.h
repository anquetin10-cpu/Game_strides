// Jalon J4 : adversaire de la course de l'hippodrome (raceSteps du web : cheval monté par un jockey aux couleurs de son
// écurie). Affichage léger : maillage du cheval du jeu et de la cavalière, allure jouée selon la vitesse ; position, cap
// et vitesse viennent du cœur (strides::EventRun : PathAI et mouvement du web). Ni simulation, ni collision, ni entrée.
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesRivalHorse.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API AStridesRivalHorse : public AActor
{
	GENERATED_BODY()
public:
	AStridesRivalHorse();
	// Couleurs de la casaque (silks du web, « #b8322a »).
	void Init(const FString& Name, const FString& SilkHex);
	// Pose (repère web, m et rad) et vitesse (m/s) de l'image ; Ground : hauteur du sol (m).
	void Apply(double WebX, double WebZ, double Heading, double SpeedMS, double Ground);
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Strides") FString RivalName;
	int32 Gait() const { return LastGait; }

private:
	UPROPERTY() TObjectPtr<class USceneComponent> Root;
	UPROPERTY() TObjectPtr<class USkeletalMeshComponent> HorseMesh;
	UPROPERTY() TObjectPtr<class USkeletalMeshComponent> RiderMesh;
	UPROPERTY() TObjectPtr<class UStaticMeshComponent> Silk;
	UPROPERTY() TArray<TObjectPtr<class UAnimationAsset>> HorseGaits;
	UPROPERTY() TArray<TObjectPtr<class UAnimationAsset>> RiderGaits;
	int32 LastGait = -1;
};
