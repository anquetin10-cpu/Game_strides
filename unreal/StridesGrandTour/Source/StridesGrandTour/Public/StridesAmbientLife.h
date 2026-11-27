// Jalon J3 (monde vivant de Deauville) : vie ambiante du web dans le monde Unreal. La logique est celle du cœur
// (strides::AmbientLife : Car et WalkAI de src/gameplay/npcs.js, prouvée contre l'oracle du web par le ctest
// « monde-vivant ») ; cet acteur lui donne le joueur, les chevaux et la caméra à chaque image et pose les silhouettes.
// Silhouettes PROVISOIRES (unreal/docs/livraison/actifs.md) : voitures en blocs (caisse, habitacle, 4 roues) aux
// gabarits et teintes du web (props.js CARS, CAR_COLORS) ; passants et spectateurs en formes simples (jambes, buste,
// tête) aux couleurs de leur tenue du web (outfits.js randomOutfit). Aucune collision bloquante : les voitures
// s'arrêtent devant le cheval et le piéton (règle du web), rien ne bloque le joueur.
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesCore/WorldLife.h"
#include "StridesAmbientLife.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API AStridesAmbientLife : public AActor
{
	GENERATED_BODY()
public:
	AStridesAmbientLife();
	// Apparition depuis les données du web (UStridesDataSubsystem::Ambient) ; faux sans données.
	bool Build(const class UStridesDataSubsystem& Data);
	// Jalon J3b : véhicules garés posés en véhicules conduisibles (AStridesVehicle, par le directeur du monde) : pas de
	// silhouette fixe ici.
	bool bParkedAsVehicles = false;
	virtual void Tick(float DeltaSeconds) override;
	const strides::AmbientLife& Life() const { return Sim; }
	// Entrées de la dernière image (tests).
	const strides::LifeInput& LastInput() const { return Input; }
	// Composants posés (tests, relevé de coût) : une racine par voiture, par passant, par spectateur.
	int32 CarCount() const { return Cars.Num(); }
	int32 PeopleCount() const { return Walkers.Num() + Spectators.Num(); }
	int32 ParkedCount() const { return Parked.Num(); }
	FVector CarLocation(int32 I) const;
	FVector WalkerLocation(int32 I) const;
	// Avance la simulation d'une image avec des entrées données (tests : joueur posé où on veut).
	void StepWith(double Dt, const strides::LifeInput& In);

private:
	strides::AmbientLife Sim;
	strides::LifeInput Input;
	const class UStridesDataSubsystem* DataRef = nullptr;
	UPROPERTY() TArray<TObjectPtr<class USceneComponent>> Cars;
	UPROPERTY() TArray<TObjectPtr<class USceneComponent>> Walkers;
	UPROPERTY() TArray<TObjectPtr<class USceneComponent>> Spectators;
	UPROPERTY() TArray<TObjectPtr<class USceneComponent>> Parked;
	UPROPERTY() TArray<TObjectPtr<class UStaticMeshComponent>> CarWheels;  // 4 par voiture
	class USceneComponent* MakeFigure(const strides::LifeOutfit& O, const FString& Name);
	class UStaticMeshComponent* MakePart(USceneComponent* Parent, class UStaticMesh* Mesh, const FVector& Loc, const FVector& Size, const FLinearColor& Color, const FRotator& Rot = FRotator::ZeroRotator);
	void GatherInput();
	void Pose();
	UPROPERTY() TObjectPtr<class UMaterialInterface> BaseMaterial;
	UPROPERTY() TObjectPtr<class UStaticMesh> Cube;
	UPROPERTY() TObjectPtr<class UStaticMesh> Cylinder;
	UPROPERTY() TObjectPtr<class UStaticMesh> Sphere;
	int32 LastHorns = 0;
	float LogT = 0.f;
};
