// Jalon J4 (correction après contrôle adverse) : arène couverte du Grand Prix de Paris Indoor (src/world/paris.js, région
// à part du jeu web, 4 km à l'est de Deauville), aux cotes de src/world/sites.js PARIS (Content/Data/paris_gp.json) :
// dalle, parvis, salle de 112 × 76 m (murs de 21 m, porte des cavaliers à l'ouest), piste en sable de 86 × 46 m et sa lice
// (entrée de piste à l'ouest), tribunes au nord, au sud et à l'est (PARIS_STANDS), paddock d'échauffement, tente des
// écuries provisoires, accréditations, parking des camions et voie d'accès jusqu'à la bretelle de l'A13.
// Silhouette PROVISOIRE (actifs.md) : blocs aux cotes et teintes du web ; toit, projecteurs, écrans géants et public non
// modélisés (choix n° 35 de plan.md). Collisions : maillages pour le cavalier à pied et le camion ; le cheval lit les
// boîtes ajoutées aux collisions du parcours (AStridesCourse::RebuildColliders).
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesParisVenue.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API AStridesParisVenue : public AActor
{
	GENERATED_BODY()
public:
	AStridesParisVenue();
	void Build(const class UStridesDataSubsystem& Data);
	int32 PartCount() const { return Parts; }

private:
	class UStaticMeshComponent* Block(double X, double Z, double Y0, double W, double D, double H, const FLinearColor& Color, bool bCollide, double Rot = 0);
	UPROPERTY() TObjectPtr<class UStaticMesh> Cube;
	UPROPERTY() TObjectPtr<class UMaterialInterface> Base;
	int32 Parts = 0, Lights = 0;
};
