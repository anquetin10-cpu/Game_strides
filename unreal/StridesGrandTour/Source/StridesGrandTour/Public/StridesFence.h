// Obstacle de CSO : pièces construites par le jeu web (tranche T5 : chandeliers, ailes, barres, barres basses, taquets,
// remplissage, jardinières, fanions, panneau numéro ; manifeste Content/World/Cso/cso_fences.json, maillages importés par
// scripts/unreal/import-cso-fences.py), données du cœur (strides::Fence) pour le modèle de saut. Le jugement (barre
// tombée / franchi / refus) et la chute des barres viennent du cœur (strides::csoFencesUpdateHorse / csoFencesUpdate,
// tranche T3) : l'acteur n'affiche que les transformées calculées, une composante par barre du haut (celles qui tombent).
// Sans manifeste (ou sans pièces exportées à la hauteur demandée) : formes de base du moteur.
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
	// Nouvelle hauteur (m) : obstacle du cœur et pièces refaites, barres au repos (Obstacles.setHeights → _mesh).
	void SetHeight(double H);
	const strides::Fence& CoreFence() const { return Core; }
	const strides::CsoObstacle& CoreObstacle() const { return Obstacle; }
	// Barres affichées à la transformée calculée par le cœur (rang k = barre k de l'obstacle, comme ob.rails du web).
	void ApplyRails(const strides::CsoFenceState& State);
	// Numéro attendu mis en évidence (Obstacles.highlight) : panneau teinté de la couleur exportée, sinon blanc.
	void SetHighlighted(bool bOn);
	bool IsHighlighted() const { return bHighlighted; }
	// Teinte du panneau numéro (blanc sans panneau).
	FLinearColor SignTint() const;
	// Transformée relative (repère de l'acteur, cm) d'une barre posée à (y, z) dans le repère local web de l'obstacle
	// (y vers le haut, z le long de l'axe de saut), tournée de rx puis rz (Euler XYZ de Three.js) ; inclut l'orientation
	// du cylindre de base du moteur couché le long des barres (formes de base).
	static FTransform RailTransform(double Y, double Z, double Rx, double Rz);
	// Même transformée pour la barre exportée du jeu web (maillage importé : x web le long des barres → X du maillage).
	static FTransform RailMeshTransform(double Y, double Z, double Rx, double Rz);
	// Transformée de la composante d'une barre (maillage exporté ou cylindre de base, échelle comprise).
	FTransform RailDisplayTransform(double Y, double Z, double Rx, double Rz) const;
	// Composante d'une barre (tests).
	const class UStaticMeshComponent* RailComponent(int32 Index) const { return Bars.IsValidIndex(Index) ? Bars[Index].Get() : nullptr; }
	// Composantes affichées (barres et panneau compris) ; étiquettes : catégorie de la pièce (manifeste).
	const TArray<TObjectPtr<class UStaticMeshComponent>>& PieceComponents() const { return Pieces; }
	// Pièces exportées du jeu web affichées (faux : formes de base).
	bool UsesExportedGeometry() const { return bExported; }
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Strides") FString Label;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Strides") int32 Num = 0;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Strides") float HeightM = 1.1f;

private:
	void ClearVisuals();
	bool BuildExported();
	void BuildBasicShapes();
	strides::Fence Core;
	strides::CsoObstacle Obstacle;
	FString Kind;
	double Spread = 0, WebX = 0, WebZ = 0, Rot = 0, Width = 3.8, Height = 1.1;
	bool bExported = false, bHighlighted = false;
	UPROPERTY() TArray<TObjectPtr<class UStaticMeshComponent>> Bars;
	UPROPERTY() TArray<TObjectPtr<class UStaticMeshComponent>> Pieces;
	UPROPERTY() TObjectPtr<class UMaterialInstanceDynamic> SignMaterial;
	UPROPERTY() TObjectPtr<class USceneComponent> Root;
};
