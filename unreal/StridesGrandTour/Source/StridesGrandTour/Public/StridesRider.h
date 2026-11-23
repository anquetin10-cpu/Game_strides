// Cavalier à pied (Character : déplacement, collisions) : monte sur le cheval (côté montoir, à gauche), descend.
// Forme provisoire (capsule et cylindre) tant que les personnages réalistes ne sont pas importés.
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "StridesRider.generated.h"

class AStridesHorse;

UCLASS()
class STRIDESGRANDTOUR_API AStridesRider : public ACharacter
{
	GENERATED_BODY()
public:
	AStridesRider();
	virtual void Tick(float Dt) override;
	virtual void BeginPlay() override;
	// Monte si un cheval est à moins de 3 m : rejoint le siège en 0,8 s (transition provisoire, voir relais), puis le
	// contrôleur prend le cheval.
	bool TryMount(class APlayerController* PC);
	// Descend du côté montoir (gauche du cheval), 0,9 m du flanc ; pendant l'épreuve, le parcours le lit à l'image
	// suivante (cavalier à pied) et élimine, avant le départ compris (règle de courses.js).
	void Dismount(class APlayerController* PC);
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Strides") TObjectPtr<AStridesHorse> MountedOn;
	// Essai de monte, voie A, étape 6 : cavalière montée par les règles du web (-StridesRider=regles, appelé au BeginPlay ;
	// les tests l'appellent directement). Crée un maillage posé (UPoseableMeshComponent, mêmes vêtements) et le composant
	// UStridesRiderRig ; en selle sur un cheval dont la sellerie est prête, les clips cuits sont coupés et la règle pose
	// la cavalière au siège S. Sans cet appel, rien n'est créé et le comportement est celui d'avant.
	bool EnableRulesRig(FString* Err = nullptr);
	class UStridesRiderRig* RulesRig() const { return Rules; }
	class UPoseableMeshComponent* RulesMesh() const { return RulesBody; }

private:
	UPROPERTY(VisibleAnywhere) TObjectPtr<class UStaticMeshComponent> Body;
	UPROPERTY(VisibleAnywhere) TArray<TObjectPtr<class USkeletalMeshComponent>> MeshParts;
	UPROPERTY(VisibleAnywhere) TObjectPtr<class USpringArmComponent> Boom;
	UPROPERTY(VisibleAnywhere) TObjectPtr<class UCameraComponent> Camera;
	float MountT = -1.f;
	FTransform MountFrom;
	void UpdateMountedAnimation();
	UPROPERTY() TArray<TObjectPtr<class UAnimationAsset>> GaitAnimations;
	UPROPERTY() TObjectPtr<class UAnimationAsset> JumpCanterAnimation;
	UPROPERTY() TObjectPtr<class UAnimationAsset> JumpGallopAnimation;
	int32 LastAnimationGait = INDEX_NONE;
	bool bLastAnimationJumping = false;
	UPROPERTY(Transient) TObjectPtr<class UStridesRiderRig> Rules;
	UPROPERTY(Transient) TObjectPtr<class UPoseableMeshComponent> RulesBody;
	bool bRulesActive = false;  // en selle, pose par la règle
	void SetRulesActive(bool bOn);
	bool RulesReady() const;
};
