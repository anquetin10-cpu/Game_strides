// Cheval monté. Conduite de concours, visée, déclenchement du saut, refus engagé, cabré : délégués au cœur
// (strides::csoHorseStep, portage de csoRide.js + horse.js + obstacles.js target / timing / refuse, prouvé par les
// oracles du jeu web : unreal/core/tests/oracles/cso_runs.json, cso_target.json). Monde ouvert (allures) : code d'origine,
// hors du périmètre du portage. Siège du cavalier.
// Simulation en unités SI dans le repère web (x, z, cap h), convertie à chaque image (StridesUnits.h). Le maillage est
// une forme de base tant que le cheval PJL n'est pas importé (voir unreal/docs/relais-mac.md) : la simulation ne dépend
// pas du maillage (clips sur place, pas de root motion).
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/JumpModel.h"
#include <vector>
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

	// Commandes (−1..1), écrites par le contrôleur : x direction (droite > 0), y avant/arrière ; bKeyboard : venues du
	// clavier (input.js keyMove : la direction de concours y monte progressivement).
	void SetMoveInput(const FVector2D& In, bool bKeyboard = false) { Move = In; bKeyMove = bKeyboard; }
	void RequestJump() { bJumpRequested = true; }
	void ChangeGait(int32 Delta);
	// Pose le cheval (horse.js setPosition : arrêt, saut et refus oubliés) ; SpeedMS : vitesse donnée ensuite (scénarios
	// de test, comme le banc web : la cadence de concours repart de cette vitesse arrondie au dixième).
	void PlaceAt(double WebX, double WebZ, double Heading, double InSpeedMS = 0);
	// Pied à terre : arrêt, cadence de concours oubliée (player.js : commandes de concours retirées).
	void Halt();
	// État du cœur (simulation de concours) et événements de la dernière image ("horse:jump", "horse:jumpEarly", …).
	const strides::CsoHorseState& CsoState() const { return Sim; }
	// Entrées d'une image de l'épreuve (strides::CsoRun) : pas, heure, cheval, point suivi, monté ou non.
	strides::CsoRunFrame RunFrame(double Dt, double Time) const;
	const TArray<FString>& LastEvents() const { return FrameEvents; }
	// Aide à l'appel (obstacles.js timing) : zone affichée par le bouton SAUT (tranche T9).
	strides::Zone JumpTiming() const;
	// Puissance du saut (horse.js jumpPower) : jumpPeak lu dans Content/Data × saut du profil (équipement et état absents).
	double JumpPower() const;
	// Hauteur du sol (m, repère web) sous un point.
	double GroundAt(double WebX, double WebZ) const;
	double WebX() const { return X; }
	double WebZ() const { return Z; }
	double Heading() const { return H; }
	bool IsJumping() const { return Sim.jumpT >= 0; }
	bool IsDemoCourseActive() const { return bDemoCourse; }
	void ToggleDemoCourse();
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
	void TickCso(float Dt);
	void TickOpenWorld(float Dt);
	void TickDemo();
	void StartOpenWorldJump();
	void UpdateAnimation();
	const class UStridesDataSubsystem* DataSub() const;
	UPROPERTY() TArray<TObjectPtr<class UAnimationAsset>> GaitAnimations;
	UPROPERTY() TObjectPtr<class UAnimationAsset> JumpCanterAnimation;
	UPROPERTY() TObjectPtr<class UAnimationAsset> JumpGallopAnimation;
	int32 LastAnimationGait = INDEX_NONE;
	bool bLastAnimationJumping = false;
	double X = 0, Z = 0, H = 0, YawRate = 0;
	FVector2D Move = FVector2D::ZeroVector;
	bool bKeyMove = false;
	bool bJumpRequested = false;
	// Concours : état du cœur, événements de l'image.
	strides::CsoHorseState Sim;
	std::vector<strides::CsoHorseEvent> Events;
	TArray<FString> FrameEvents;
	// Saut en cours : obstacle visé et sens de franchissement (jugement à la réception, provisoire jusqu'à T3).
	bool bJumping = false;
	TWeakObjectPtr<AStridesFence> JumpFence;
	int32 JumpDir = 1;
	// Monde ouvert (code d'origine) : distance parcourue depuis l'appel, plan du saut.
	double JumpX = 0;
	strides::JumpPlan Plan;
	bool bDemoCourse = false;
	int32 DemoPoint = 1;
};
