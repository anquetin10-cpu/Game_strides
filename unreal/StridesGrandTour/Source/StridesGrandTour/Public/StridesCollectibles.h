// Jalon J3-D : fers d'or Strides cachés dans le monde (src/gameplay/collectibles.js), règles portées par
// StridesCore/Collectibles, positions exportées du web (Content/Data/world_horseshoes.json). Ramassés à 2,6 m du joueur
// (cheval ou cavalier), +25 € chacun, +500 € à la collection complète, gardés dans la sauvegarde (save.data.horseshoes),
// visibles à moins de 220 m. Forme provisoire (disque doré qui tourne ; le web : tore doré et halo additif).
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesCore/Collectibles.h"
#include "StridesCollectibles.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API AStridesCollectibles : public AActor
{
	GENERATED_BODY()
public:
	AStridesCollectibles();
	// Lit world_horseshoes.json et pose les fers pas encore ramassés (UStridesSaveSubsystem::Horseshoes).
	bool Build();
	virtual void Tick(float DeltaSeconds) override;
	// Une vérification au point (x, z) du web (tests) ; renvoie le nombre de fers ramassés.
	int32 CollectAt(double X, double Z);
	// Fers encore posés (rang dans HORSESHOES, position web) : repères de la mini-carte.
	void Remaining(TArray<FVector2D>& Out, const FVector2D& Near, double MaxDist) const;
	const strides::HorseshoeData& Data() const { return Def; }
	int32 VisibleCount() const;
	// Repose les fers pas encore ramassés (après un rechargement).
	void Refresh();
private:
	strides::HorseshoeData Def;
	bool bBuilt = false;
	double Clock = 0;
	UPROPERTY() TArray<TObjectPtr<class UStaticMeshComponent>> Items;
	TArray<int32> ItemIndex;
};
