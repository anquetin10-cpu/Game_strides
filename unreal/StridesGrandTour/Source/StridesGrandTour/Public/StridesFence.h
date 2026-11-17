// Obstacle de CSO : barres (formes de base du moteur en attendant les modèles importés), données du cœur (strides::Fence)
// pour le modèle de saut. Le jugement (barre tombée / franchi / refus) vient de strides::planJump, comme dans le jeu web.
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesCore/JumpModel.h"
#include "StridesFence.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API AStridesFence : public AActor
{
	GENERATED_BODY()
public:
	AStridesFence();
	// Construit l'obstacle : nature ('v' vertical, 'o' oxer, 'w' mur), hauteur et largeur (m), position (m, repère web),
	// cap (rad), numéro dans le parcours.
	void Setup(const FString& InLabel, const FString& Kind, float HeightM, float SpreadM, double WebX, double WebZ, double RotRad, int32 InNum);
	const strides::Fence& CoreFence() const { return Core; }
	// Barre la plus haute tombée (affichage) — la faute est comptée par le juge du parcours.
	void KnockTopBar();
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Strides") FString Label;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Strides") int32 Num = 0;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Strides") float HeightM = 1.1f;

private:
	strides::Fence Core;
	UPROPERTY() TArray<TObjectPtr<class UStaticMeshComponent>> Bars;
	UPROPERTY() TObjectPtr<class USceneComponent> Root;
};
