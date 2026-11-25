// Étape S4 de l'essai de monte (voie A) : vue du cheval WildMesh du web appliquée au cheval Unreal (option
// -StridesHorseView=web) : inclinaison en virage, corps et horloge du saut, cadence des clips réglée sur la vitesse, phase
// de foulée qui avance à l'arrêt et pendant le saut, membres repliés et bascule face aux barres. Toute la logique est celle
// de StridesCore/HorseView (port de pjl/view.js, pjlHorse.js, horse/anim.js, prouvé par le ctest « monte-vue ») ; ce code
// ne fait que le lien avec le moteur :
//  - avant la pose (Tick du cheval) : entrées du cheval du jeu → locomotion, instantané, vue → couches du mélangeur
//    (UStridesHorseAnimInstance : clips importés ou miroir, poids, temps) et repère du corps ;
//  - après la pose (UStridesHorseViewPost, TG_PostUpdateWork, avant la sellerie) : sabots et os d'attache lus sur le
//    maillage posé (espace du composant → monde → repère du web), abaissement d'appel, repli des membres (rotation des os
//    dans le mélangeur, pose réévaluée si un repli est actif), bascule ; repère du corps posé sur le maillage.
// Repère du corps : groupe « body » de la vue du web (position y, z ; rotation.x puis rotation.z, ordre XYZ de three.js),
// exprimé dans le repère de l'acteur (X = 100 z, Y = −100 x, Z = 100 y) et composé avec l'échelle du maillage.
// Écarts au web déclarés : durées des clips = celles des clips importés (tous à 24 images/s depuis l'étape S5, mêmes
// durées que le web) ; mouvements secondaires (SecondaryMotion : queue, crinière, encolure, oreilles) et contacts des membres avec les
// barres (_limbContacts : faute comptée par le jeu web) non portés.
#pragma once
#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "StridesCore/HorseView.h"
#include "StridesHorseMirror.h"
#include "StridesHorseView.generated.h"

class AStridesHorse;
class USkeletalMeshComponent;
class UAnimSequence;

class STRIDESGRANDTOUR_API FStridesHorseView
{
public:
	// Données (Content/Data/pjl_horse_view.json), clips du mélangeur (importés « Horse_<nom> » de ClipRoot, miroirs de
	// Mirrors), os des sabots et des membres. Faux (raison dans Err) sinon.
	bool Init(USkeletalMeshComponent* InMesh, const FString& ClipRoot, const FStridesHorseMirrorSet* InMirrors, FString* Err = nullptr);
	bool IsReady() const { return bReady; }
	// Remise à neuf (vue recréée : constructeur de la vue du web).
	void Reset();

	struct FInputs
	{
		double Dt = 1.0 / 30;
		double Speed = 0;      // h.speed (m/s)
		double SpeedMul = 1;   // h.speedMul (allure normalisée : vitesse / max(0,6, speedMul))
		double AnimSpeed = -1; // st.speed imposée (tests : celle du web) ; −1 : Speed / max(0,6, SpeedMul)
		double JumpT = -1, JumpDur = 0;
		double Brake = 0, RearT = 0, RearAnim = 0;
		double LastTurn = 0;
		int32 ForcedLead = 0;  // st.lead (tests) : ±1, 0 sinon
	};
	// Avant la pose : couches du mélangeur et repère du corps de cette image.
	void StepPre(const FInputs& In, TArray<FStridesHorseLayer>& Layers);

	// Obstacle du dernier saut vu par la vue (H._lastJump) : near = saut en cours ou réception depuis moins de 0,8 s.
	struct FObstacle
	{
		bool bNear = false;
		strides::hview::Obst O;
		double Time = 0;
	};
	// Après la pose : CS = transformées de composant du maillage posé ; ActorXf = repère de l'acteur ; Ground : sol du web.
	// Rend vrai si un repli est actif (pose à réévaluer avec les replis posés dans le mélangeur).
	bool StepPost(const TArray<FTransform>& CS, const FTransform& ActorXf, const FObstacle& Ob, const TFunctionRef<double(double, double)>& Ground,
		TArray<FStridesHorseTuck>& Tucks);

	// Transformée relative du maillage : corps de la vue (repère de l'acteur) composé avec l'échelle du maillage.
	FTransform MeshRelative(double MeshScale) const;
	// Repère du corps seul (sans échelle), dans le repère de l'acteur, pour un état donné de la vue.
	static FTransform BodyInActor(double Y, double Z, double Rx, double Rz);
	// Position monde (repère du web, m) d'un os d'indice B du squelette de référence, avec le corps de l'état courant.
	strides::hview::V3 BoneWeb(const TArray<FTransform>& CS, int32 B, const FTransform& ActorXf, double MeshScale) const;

	const strides::hview::ViewData& Data() const { return D; }
	const strides::hview::Loco& GetLoco() const { return LocoS; }
	const strides::hview::Snap& GetSnap() const { return SnapS; }
	const strides::hview::ViewState& GetView() const { return ViewS; }
	strides::hview::ViewState& MutableView() { return ViewS; }
	const strides::hview::ClearState& GetClear() const { return ClearS; }
	const strides::hview::TuckState& GetTuck() const { return TuckS; }
	const strides::hview::PushState& GetPush() const { return PushS; }
	double AnimPhase() const { return AnimPhaseV; }
	double LastCostMs() const { return CostMs; }
	// Os des sabots (fingers_02_l, fingers_02_r, toes_02_l, toes_02_r) et des membres (upperleg_l, upperleg_r, hand_l, hand_r).
	const int32* HoofBones() const { return HoofB; }
	const int32* LimbBones() const { return LimbB; }
	// Durées des clips : web (données) et Unreal (clip importé ou miroir) ; écart maximal (s).
	double MaxDurationGap() const { return DurGap; }
	FString DurationReport() const { return DurReport; }
	void SetMeshScale(double S) { MeshScale = S; }
	// Clips importés joués par la vue (à retenir par le propriétaire : sans référence, le ramasse-miettes les libère).
	void ClipAssets(TArray<const UAnimSequence*>& Out) const
	{
		for (const FClip& C : Clips)
			if (C.Seq) Out.AddUnique(C.Seq);
	}
	// Dernier repli (tests) : sabots repliés prévus par la géométrie (monde du web), repère du composant au moment du repli.
	bool LastTucked() const { return bTuckedLast; }
	const strides::hview::V3* TuckedToes() const { return TuckedToe; }
	const FTransform& CompAtTuck() const { return CompAtTuckLast; }

private:
	USkeletalMeshComponent* Mesh = nullptr;
	const FStridesHorseMirrorSet* Mirrors = nullptr;
	bool bReady = false;
	strides::hview::ViewData D;
	struct FClip
	{
		FString Name;
		const UAnimSequence* Seq = nullptr;
		int32 Mirror = INDEX_NONE;
	};
	TArray<FClip> Clips;  // ordre des actions du web (accumulation des poses)
	strides::hview::Loco LocoS;
	strides::hview::SnapState SnapSt;
	strides::hview::Snap SnapS;
	strides::hview::ViewState ViewS;
	strides::hview::PushState PushS;
	strides::hview::ClearState ClearS;
	strides::hview::TuckState TuckS;
	strides::hview::PrevMap Prev;
	bool bTuckOn = false;
	double AnimPhaseV = 0;
	double DtLast = 1.0 / 30;
	double MeshScale = 0.01;
	int32 HoofB[4] = {INDEX_NONE, INDEX_NONE, INDEX_NONE, INDEX_NONE};
	int32 LimbB[4] = {INDEX_NONE, INDEX_NONE, INDEX_NONE, INDEX_NONE};
	double LastJumpT = -1;
	bool bTuckedLast = false;
	strides::hview::V3 TuckedToe[4];
	FTransform CompAtTuckLast;
	double DurGap = 0;
	FString DurReport;
	double CostMs = 0;
};

// Entrées imposées par le test moteur Strides.Parite.HorseView (rejeu de l'oracle vue/ : cheval du jeu web).
struct FStridesHorseViewTestHooks
{
	FStridesHorseView::FInputs In;
	FStridesHorseView::FObstacle Ob;
	double Ground = 0;  // sol du web sous le cheval (carrière plane)
	// Repère du holder du web dans le monde Unreal, à la place de celui de l'acteur pour l'abaissement d'appel, le repli et la
	// bascule (rejeu du niveau B : l'acteur reste où il est, le corps est posé relativement à lui).
	bool bActorXf = false;
	FTransform ActorXf;
};
namespace StridesHorseViewReplay
{
// Holder du web (position, quaternion, monde du web) → repère d'acteur Unreal.
STRIDESGRANDTOUR_API FTransform ActorOfHolder(const struct J& H);
// Entrées d'une image de l'oracle vue/ (relevé « vu » d'une image) dans les crochets de test.
STRIDESGRANDTOUR_API void HooksFromRecord(const struct J& R, const struct J& H, FStridesHorseViewTestHooks& Hooks);
}

// Après la pose du cheval (TG_PostUpdateWork), avant la sellerie : AStridesHorse::PostPoseView.
UCLASS()
class STRIDESGRANDTOUR_API UStridesHorseViewPost : public UActorComponent
{
	GENERATED_BODY()
public:
	UStridesHorseViewPost();
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;
};
