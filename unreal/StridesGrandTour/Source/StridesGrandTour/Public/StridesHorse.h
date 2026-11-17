// Cheval monté : allures (monde ouvert), conduite de concours (strides::steerRate / cadenceDelta), saut
// (strides::planJump : la même trajectoire anime le cheval et juge les barres), refus, siège du cavalier.
// Simulation en unités SI dans le repère web (x, z, cap h), convertie à chaque image (StridesUnits.h). Le maillage est
// une forme de base tant que le cheval PJL n'est pas importé (voir unreal/docs/relais-mac.md) : la simulation ne dépend
// pas du maillage (clips sur place, pas de root motion).
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "StridesCore/JumpModel.h"
#include "StridesHorse.generated.h"

class AStridesCourse;
class AStridesFence;
class AStridesRider;

UCLASS()
class STRIDESGRANDTOUR_API AStridesHorse : public APawn
{
	GENERATED_BODY()
public:
	AStridesHorse();
	virtual void Tick(float Dt) override;
	virtual void BeginPlay() override;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Strides") FString ProfileId = TEXT("comete");
	// Conduite de concours (vrai pendant une épreuve) : cadence réglée au joystick, saut au bouton.
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Strides") bool bCsoControls = true;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Strides") float SpeedMS = 0.f;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Strides") float CadenceMS = 0.f;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Strides") int32 GaitIndex = 0;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Strides") FString LastTakeoff;
	UPROPERTY() TObjectPtr<AStridesCourse> Course;
	UPROPERTY() TObjectPtr<AStridesRider> Rider;

	// Commandes (−1..1), écrites par le contrôleur : x direction (droite > 0), y avant/arrière.
	void SetMoveInput(const FVector2D& In) { Move = In; }
	void RequestJump() { bJumpRequested = true; }
	void ChangeGait(int32 Delta);
	void PlaceAt(double WebX, double WebZ, double Heading);
	double WebX() const { return X; }
	double WebZ() const { return Z; }
	double Heading() const { return H; }
	bool IsJumping() const { return bJumping; }
	// Point d'assise du cavalier (repère monde Unreal).
	FTransform SeatTransform() const;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<class USceneComponent> Root;
	UPROPERTY(VisibleAnywhere) TObjectPtr<class UStaticMeshComponent> Body;
	UPROPERTY(VisibleAnywhere) TObjectPtr<class USkeletalMeshComponent> Mesh;
	UPROPERTY(VisibleAnywhere) TObjectPtr<class USkeletalMeshComponent> EyesMesh;
	UPROPERTY(VisibleAnywhere) TObjectPtr<class USkeletalMeshComponent> HairMesh;
	UPROPERTY(VisibleAnywhere) TObjectPtr<class USpringArmComponent> Boom;
	UPROPERTY(VisibleAnywhere) TObjectPtr<class UCameraComponent> Camera;

private:
	void StartJump(AStridesFence* Fence);
	void UpdateAnimation();
	double JumpPower() const;
	UPROPERTY() TArray<TObjectPtr<class UAnimationAsset>> GaitAnimations;
	UPROPERTY() TObjectPtr<class UAnimationAsset> JumpCanterAnimation;
	UPROPERTY() TObjectPtr<class UAnimationAsset> JumpGallopAnimation;
	int32 LastAnimationGait = INDEX_NONE;
	bool bLastAnimationJumping = false;
	double X = 0, Z = 0, H = 0, YawRate = 0;
	FVector2D Move = FVector2D::ZeroVector;
	bool bJumpRequested = false;
	// Saut en cours : distance parcourue depuis l'appel, plan du cœur, obstacle visé, sens de franchissement.
	bool bJumping = false;
	double JumpX = 0;
	strides::JumpPlan Plan;
	TWeakObjectPtr<AStridesFence> JumpFence;
	int32 JumpDir = 1;
	float RefuseT = 0.f;
};
