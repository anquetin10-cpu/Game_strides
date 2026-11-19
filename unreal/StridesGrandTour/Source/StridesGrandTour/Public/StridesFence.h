// Obstacle de CSO : barres (formes de base du moteur en attendant les modèles importés), données du cœur (strides::Fence)
// pour le modèle de saut. Le jugement (barre tombée / franchi / refus) et la chute des barres viennent du cœur
// (strides::csoFencesUpdateHorse / csoFencesUpdate, tranche T3) : l'acteur n'affiche que les transformées calculées, une
// composante par barre du haut (celles qui tombent).
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesCore/CsoFences.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCore/JumpModel.h"
#include "StridesFence.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API AStridesFence : public AActor
{
	GENERATED_BODY()
public:
	AStridesFence();
	// Construit l'obstacle : nature ('v' vertical, 'o' oxer, 'w' mur), hauteur et écartement (m), position (m, repère
	// web), cap (rad), numéro dans le parcours, largeur des barres (m, cso_horse.json). Barres et faces : portage de
	// obstacles.js (strides::makeCsoObstacle).
	void Setup(const FString& InLabel, const FString& Kind, double HeightM, double SpreadM, double WebX, double WebZ, double RotRad, int32 InNum, double WidthM);
	const strides::Fence& CoreFence() const { return Core; }
	const strides::CsoObstacle& CoreObstacle() const { return Obstacle; }
	// Barres affichées à la transformée calculée par le cœur (rang k = barre k de l'obstacle, comme ob.rails du web).
	void ApplyRails(const strides::CsoFenceState& State);
	// Transformée relative (repère de l'acteur, cm) d'une barre posée à (y, z) dans le repère local web de l'obstacle
	// (y vers le haut, z le long de l'axe de saut), tournée de rx puis rz (Euler XYZ de Three.js) ; inclut l'orientation
	// du cylindre de base couché le long des barres. Seul endroit où cette conversion est faite.
	static FTransform RailTransform(double Y, double Z, double Rx, double Rz);
	// Composante d'une barre (tests).
	const class UStaticMeshComponent* RailComponent(int32 Index) const { return Bars.IsValidIndex(Index) ? Bars[Index].Get() : nullptr; }
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Strides") FString Label;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Strides") int32 Num = 0;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Strides") float HeightM = 1.1f;

private:
	strides::Fence Core;
	strides::CsoObstacle Obstacle;
	UPROPERTY() TArray<TObjectPtr<class UStaticMeshComponent>> Bars;
	UPROPERTY() TObjectPtr<class USceneComponent> Root;
};
