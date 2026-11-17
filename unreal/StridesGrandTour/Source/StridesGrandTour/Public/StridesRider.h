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
	// Monte si un cheval est à moins de 3 m : rejoint le siège en 0,8 s (transition provisoire, voir relais), puis le
	// contrôleur prend le cheval.
	bool TryMount(class APlayerController* PC);
	// Descend du côté montoir (gauche du cheval), 0,9 m du flanc ; épreuve en cours : éliminé (règle de courses.js).
	void Dismount(class APlayerController* PC);
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Strides") TObjectPtr<AStridesHorse> MountedOn;

private:
	UPROPERTY(VisibleAnywhere) TObjectPtr<class UStaticMeshComponent> Body;
	UPROPERTY(VisibleAnywhere) TObjectPtr<class USpringArmComponent> Boom;
	UPROPERTY(VisibleAnywhere) TObjectPtr<class UCameraComponent> Camera;
	float MountT = -1.f;
	FTransform MountFrom;
};
