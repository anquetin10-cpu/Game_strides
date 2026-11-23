// Cavalière Unreal montée par les règles de monte du web (essai de monte, voie A, étape 6), option -StridesRider=regles.
//
// À chaque image : entrées de la règle depuis la sellerie du cheval (UStridesHorseTack : siège S, profils, postérieurs ;
// AStridesHorse : allure, saut, virage), avec le retard d'une image du web (StridesCore/RiderPose RideDriver) ; règle
// (StridesCore/RiderRules, prouvée contre O2 à 0,1 mm) ; reciblage sur le squelette de rider_f_animated comme le fait le
// jeu web pour son modèle réaliste (realistic.js update : rotation monde de l'os classique × décalage mémorisé au calage,
// bassin à la position du bassin classique) ; puis deux os par membre résolus vers la cible de la règle
// (AnimationCore::SolveTwoBoneIK, étirement désactivé, pôle en POSITION = genou ou coude calculé par la règle, kneeOf).
//
// Repli déclaré (plan-essai.md, étape 6) : la pose est calculée en C++ et posée sur un UPoseableMeshComponent, au lieu
// d'un asset Control Rig (CR_StridesMonte_riderF) ; voir unreal/docs/parite/monte/README.md.
//
// Repères. S : repère du siège du web (m ; x à gauche, y vers le haut, z vers l'avant), où la règle écrit. Repère local
// Unreal du siège (cm ; X avant, Y droite, Z haut) : X = 100 z, Y = −100 x, Z = 100 y (UStridesHorseTack::HolderToActor).
// Espace du maillage : déduit à l'initialisation par une similitude à axes signés (moindres carrés sur 9 articulations
// du tronc et des racines des membres, que le calage ne déplace pas), résidu exposé.
#pragma once
#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "StridesCore/RiderPose.h"
#include <memory>
#include "StridesRiderRig.generated.h"

class UPoseableMeshComponent;
class AStridesHorse;

UCLASS(ClassGroup = (Strides))
class STRIDESGRANDTOUR_API UStridesRiderRig : public UActorComponent
{
	GENERATED_BODY()
public:
	UStridesRiderRig();
	// Lit Content/Data/rider_rules.json et monte_rider_f.json, retrouve les os du maillage par nom, déduit l'espace du
	// maillage et refait le calage. Faux (raison dans Err) si une donnée ou un os manque, ou si le résidu dépasse 0,05 cm.
	bool Init(UPoseableMeshComponent* InMesh, FString* Err = nullptr);
	bool IsReady() const { return bReady; }
	// Mise en selle : règle remise à neuf (Human.mount).
	void ResetRide();
	// Une image du jeu, cavalière en selle sur Horse (sellerie créée et prête) : entrées, règle, pose du maillage.
	bool StepFromHorse(const AStridesHorse* Horse, double Dt);
	// Rejeu (tests) : première image connue par ses entrées, puis images depuis l'état brut du cheval.
	void Seed(const strides::rider::RideInputs& First, const strides::rider::RideHorseSample& H, const strides::rider::RideFitMeters& Fit);
	strides::rider::RideInputs Prepare(const strides::rider::RideHorseSample& H, const strides::rider::RideFitMeters& Fit, double Dt);
	void Apply(const strides::rider::RideInputs& In);
	// Pose de la règle → os du maillage (reciblage, puis deux os par membre), écrite dans le UPoseableMeshComponent.
	void PoseMesh();

	const strides::rider::RideDriver* Driver() const { return Drv.get(); }
	// Transformée relative du maillage dans le repère local Unreal du siège (constante après Init).
	const FTransform& MeshInSeat() const { return MeshInSeatT; }
	// Résidu de l'ajustement de l'espace du maillage (cm) ; correction maximale apportée par les deux os par membre à la
	// dernière image (cm : déplacement de l'articulation intermédiaire ou de l'extrémité) ; coût de la dernière image (ms).
	double AxisFitRms() const { return FitRms; }
	double LastIKCorrection() const { return IKCorrection; }
	double LastCostMs() const { return CostMs; }
	// Os du maillage associé à un os de la règle (realistic.js MAP ; lFing, rFing : middle_01), INDEX_NONE sinon.
	int32 MeshBone(int RuleBone) const { return RuleToMesh[RuleBone]; }
	// Plante et poing (points sans os de la règle) dans l'espace du composant, à la dernière pose.
	FVector SolePoint(int32 Side) const;
	FVector FistPoint(int32 Side) const;
	const TArray<FTransform>& ComponentPose() const { return CS; }
	// Paramètres des deux os par membre (comme TwoBoneIKSimplePerItem : bEnableStretch faux, StretchStartRatio 0,75,
	// StretchMaximumRatio 1,25) : lus par le test pour vérifier que l'étirement reste désactivé.
	static constexpr bool bEnableStretch = false;
	static constexpr double StretchStartRatio = 0.75, StretchMaximumRatio = 1.25;

	// Point de S (m) → repère local Unreal du siège (cm).
	static FVector SeatToUnreal(const strides::rider::Vec3& P) { return FVector(100.0 * P.z, -100.0 * P.x, 100.0 * P.y); }

private:
	FVector ModelToMesh(const strides::rider::Vec3& P) const;
	FQuat ModelToMesh(const strides::rider::Quat& Q) const;
	void Compose(const TArray<bool>& bAbs);

	UPROPERTY(Transient) TObjectPtr<UPoseableMeshComponent> Mesh;
	bool bReady = false;
	std::unique_ptr<strides::rider::RideDriver> Drv;
	strides::rider::RideFitMeters Fit0;
	int32 RuleToMesh[strides::rider::BoneCount];
	TArray<int32> MeshToRule;           // os du maillage → os de la règle (MAP), INDEX_NONE sinon
	TArray<int32> Parent;
	TArray<FVector> RefT;               // translations locales de référence
	TArray<FVector> RefS;               // échelles locales de référence
	TArray<FQuat> CalLocal;             // rotations locales après calage (realistic.js _calibrate)
	TArray<FQuat> CalCS;                // rotations de composant après calage (décalage de chaque os apparié)
	TArray<FQuat> Rot;                  // rotations de composant de la pose courante
	TArray<FTransform> CS;              // transformées de composant de la pose courante
	FVector PelvisPos = FVector::ZeroVector;
	int32 Pelvis = INDEX_NONE;
	FVector SoleLocal[2], FistLocal[2];
	// Espace du maillage : p_maillage = Scale · Axes · p_modèle + Offset (Axes : permutation signée, Det = ±1).
	FMatrix Axes = FMatrix::Identity;
	double Scale = 100, Det = 1;
	FVector Offset = FVector::ZeroVector;
	double FitRms = -1;
	FTransform MeshInSeatT;
	double IKCorrection = 0;
	double CostMs = 0;
};
