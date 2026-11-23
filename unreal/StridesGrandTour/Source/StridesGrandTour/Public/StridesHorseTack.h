// Sellerie du cheval WildMesh dans Unreal (essai de monte, voie A, étape 5, R0) : ce que la règle de monte lit du cheval.
// Siège S (ancre « seat » recentrée entre les ancres d'étrier, tangage du dos spine_04 → bassin, inclinaison), ancres
// skinnées (porte-étrivières, mors, garrot, encolure, genoux, étriers qui pendent), profils du flanc et du dessus de
// l'encolure, postérieurs reposés (hindDown) et horloge de réception : logique pure dans StridesCore/HorseTack (port de
// src/entities/pjlHorse.js et pjl/view.js anchorWorld), données Content/Data/pjl_horse_tack.json (scripts/unreal/
// export-horse-tack.mjs). Ce composant fournit au cœur les transformées de peau des os du cheval Unreal.
//
// Conversion d'axes : l'espace de la scène du GLB du web (où sont écrits les points) et celui du maillage importé (où
// sont les os Unreal) diffèrent d'une similitude (axes, symétrie, échelle de l'import) ; elle est déduite à
// l'initialisation par moindres carrés sur les positions de repos des 419 articulations (même rig, mêmes noms), et son
// résidu est exposé (AxisFitRms). Transformée de peau d'un os : MeshToHolder ∘ os posé ∘ os au repos⁻¹ ∘ conversion.
//
// Le jeu par défaut ne crée pas ce composant : AStridesHorse ne le crée qu'avec -StridesRider=regles (étape 6), et
// SeatTransform() reste inchangé. Preuve : Strides.Parite.HorseSeat (StridesRiderTests.cpp), contre le canal hz d'O1.
#pragma once
#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "StridesCore/HorseTack.h"
#include <functional>
#include <vector>
#include "StridesHorseTack.generated.h"

class USkeletalMeshComponent;

UCLASS(ClassGroup = (Strides))
class STRIDESGRANDTOUR_API UStridesHorseTack : public UActorComponent
{
	GENERATED_BODY()
public:
	UStridesHorseTack();
	// Lit les données, retrouve les os du cheval par nom et déduit la conversion d'axes. Faux (raison dans Err) si les
	// données manquent, si un os manque ou si la conversion n'est pas une similitude (résidu > 0,1 % de la taille du rig).
	bool Init(USkeletalMeshComponent* InMesh, FString* Err = nullptr);
	bool IsReady() const { return bReady; }
	// État remis à neuf (cheval WildMesh recréé : pjlHorse.js constructeur).
	void ResetState();

	// Une image du jeu : pose courante du maillage (transformées de composant), acteur propriétaire = repère du cheval
	// (holder du web : origine au sol sous le cheval, axes du cap), sol lu par AStridesHorse::GroundAt, saut en cours.
	void Step(float Dt);
	// Une image à partir d'une pose donnée (tests) : CS = transformées de composant des os du maillage (indices du
	// squelette de référence) ; MeshToHolder = espace du maillage Unreal → repère du cheval du web (mètres, x à gauche,
	// y vers le haut, z vers l'avant) ; Roll = inclinaison de la vue (V.body.rotation.z) ; HeightAboveGround : point du
	// repère du cheval → hauteur au-dessus du sol (m).
	void StepPose(const TArray<FTransform>& CS, const strides::tack::Affine& MeshToHolder, double Dt, double Roll, bool bJumping,
		const std::function<double(const strides::tack::V3&)>& HeightAboveGround);

	const strides::tack::TackModel& Model() const { return Model_; }
	const strides::tack::TackOut& Out() const { return Out_; }
	strides::tack::TackState& State() { return State_; }
	// Conversion d'axes : scène du GLB du web → espace du maillage Unreal ; résidu (unités du maillage) et nombre
	// d'articulations appariées.
	const strides::tack::Affine& GlbToMesh() const { return Glb2Mesh; }
	double AxisFitRms() const { return FitRms; }
	int32 AxisFitJoints() const { return FitJoints; }
	// Repère du maillage dans le repère du cheval, tel que le jeu le pose (composant relatif à l'acteur, cm → m, axes du web).
	strides::tack::Affine GameMeshToHolder() const;
	// Siège S en Unreal : repère local de l'acteur (cm ; X vers l'avant, Y à droite, Z vers le haut) et monde.
	FTransform SeatInActor() const;
	FTransform SeatWorld() const;
	// Phase du clip joué par le maillage (temps / durée, 0..1 ; −1 hors mode d'animation à un seul clip). Ce n'est pas
	// horse.anim.phase du web (décalages gaitInfo.offset et align.off non portés).
	double PlayedClipPhase() const;
	// Coût de la dernière image (ms), mesuré par FPlatformTime autour de la logique et des transformées de peau.
	double LastCostMs() const { return CostMs; }

	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	// Conversion du repère du cheval du web (m) vers le repère local d'un acteur Unreal (cm) : X = 100 z, Y = −100 x, Z = 100 y.
	static FVector HolderToActor(const strides::tack::V3& P) { return FVector(100.0 * P.z, -100.0 * P.x, 100.0 * P.y); }
	static strides::tack::Affine ToAffine(const FMatrix& M);

private:
	UPROPERTY(Transient) TObjectPtr<USkeletalMeshComponent> Mesh;
	bool bReady = false;
	strides::tack::TackModel Model_;
	strides::tack::TackState State_;
	strides::tack::TackOut Out_;
	strides::tack::Affine Glb2Mesh;
	double FitRms = -1;
	int32 FitJoints = 0;
	TArray<int32> BoneIndex;                    // os utilisés → indice du squelette de référence
	std::vector<strides::tack::Affine> RestInv; // os au repos⁻¹ ∘ conversion, par os utilisé
	std::vector<strides::tack::Affine> Skin;
	double CostMs = 0;
};
