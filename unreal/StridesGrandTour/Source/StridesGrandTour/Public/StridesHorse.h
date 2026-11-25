// Cheval monté. Conduite de concours, visée, déclenchement du saut, refus engagé, cabré : délégués au cœur
// (strides::csoHorseStep, portage de csoRide.js + horse.js + obstacles.js target / timing / refuse, prouvé par les
// oracles du jeu web : unreal/core/tests/oracles/cso_runs/, cso_target.json). Monde ouvert (allures) : code d'origine,
// hors du périmètre du portage. Siège du cavalier.
// Caméra : perche du monde ouvert (code d'origine) ; en épreuve (game.course.camera du jeu web : CsoRun::course().active,
// cavalier en selle), caméra de concours pilotée par le cœur (strides::csoCamStep, portage de camera.js _updateComp,
// tranche T6) : le jeu fournit la sonde de la perche (traces du moteur) et le sol, puis applique œil, point visé et FOV
// VERTICAL (axe Y maintenu, imposé sur la caméra de concours).
// Simulation en unités SI dans le repère web (x, z, cap h), convertie à chaque image (StridesUnits.h). Le maillage est
// une forme de base tant que le cheval PJL n'est pas importé (voir unreal/docs/relais-mac.md) : la simulation ne dépend
// pas du maillage (clips sur place, pas de root motion).
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "StridesCore/CsoCamera.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/HorseMirror.h"
#include "StridesCore/JumpModel.h"
#include <vector>
#include "StridesHorse.generated.h"

class AStridesCourse;
class AStridesFence;
class AStridesRider;
class UStridesHorseTack;
class UStridesHorseTackMesh;

UCLASS()
class STRIDESGRANDTOUR_API AStridesHorse : public APawn
{
	GENERATED_BODY()
public:
	AStridesHorse();
	virtual void Tick(float Dt) override;
	virtual void BeginPlay() override;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Strides") FString ProfileId = TEXT("comete");
	// Robe du cheval engagé (C1) : monture de la sauvegarde (activeHorseId de data.js : écurie et monture lues par
	// UStridesSaveSubsystem, sinon celles d'une sauvegarde neuve) → ProfileId, puis robe de ce cheval (coatOf) posée sur des
	// instances dynamiques des matériaux de robe et de crins (scripts/unreal/import-horse-coat.py) : paramètres
	// strides::coatUniforms. Appelé au BeginPlay et au chargement d'une partie. Faux si les données ou les matériaux
	// manquent (robe d'origine du modèle gardée).
	bool ApplyEngagedCoat();
	// Robe posée (C1) : vrai après ApplyEngagedCoat réussi ; corps avec les masques de robe chargé (SK_HorseCoatBody).
	bool HasEngagedCoat() const { return bCoatApplied; }
	bool HasCoatBody() const { return bCoatBody; }
	class UMaterialInstanceDynamic* CoatMaterial() const { return CoatMID; }
	class UMaterialInstanceDynamic* HairMaterial() const { return HairMID; }
	class USkeletalMeshComponent* BodyMesh() const { return Mesh; }
	class USkeletalMeshComponent* ManeMesh() const { return HairMesh; }
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
	// Sellerie du cheval WildMesh (essai de monte, étape 5 : siège S, ancres, profils, postérieurs ; UStridesHorseTack) :
	// créée avec la cavalière de la règle ou la sellerie affichée (StridesMonteOptions : par défaut depuis l'étape S2 b ;
	// -StridesMonte=ancien : nulle ; SeatTransform inchangé).
	UStridesHorseTack* HorseTack() const { return Tack; }
	// Étape S1 : sellerie complète affichée (selle, tapis, filet, mors, guêtres, étriers, étrivières, rênes ;
	// UStridesHorseTackMesh), créée avec -StridesRider=regles ou -StridesTack=web (pas avec -StridesTack=aucune), sinon nulle.
	UStridesHorseTackMesh* TackMesh() const { return TackMeshComp; }
	// Crée la sellerie complète affichée (et la sellerie lue par la règle si elle manque). Faux (raison dans Err) sinon.
	bool EnableTackMesh(FString* Err = nullptr);
	// Étape M2 (main du web : par défaut depuis l'étape S2 b ; -StridesHorseLead=droite ou -StridesMonte=ancien : clips
	// d'origine, nuls) : main au galop et clips miroir comme le web.
	bool UsesWebLead() const { return bLeadWeb; }
	const class FStridesHorseMirrorSet* MirrorSet() const { return Mirrors.Get(); }
	const strides::mirror::LeadState& LeadState() const { return LeadSt; }
	double LeadBlend() const { return LeadBlendV; }
	bool JumpMirrored() const { return JumpV.clip.mirror; }
	// Clip de saut de la vue (view.js:229-233), choisi au départ du dernier saut.
	const strides::mirror::JumpView& JumpViewState() const { return JumpV; }
	// Tests Strides.Parite.HorseMirror : entrées de l'animation hors simulation (saut en cours, virage vu par la main au
	// galop à la place de lastTurn ou du lacet lissé, main remise à neuf). Le jeu ne les appelle pas.
	void SetJumpingForTests(bool bJump) { bJumping = bJump; }
	void SetTurnForTests(double Turn) { bTurnForTests = true; TurnForTests = Turn; }
	// Main posée directement (maintien remis à zéro) ; avec un virage nul, leadStep la garde.
	void SetLeadForTests(int32 Lead) { LeadSt.lead = Lead; LeadSt.hold = 0; }
	void ResetWebLeadForTests()
	{
		LeadSt = strides::mirror::LeadState();
		LeadBlendV = 1;
		JumpV = strides::mirror::JumpView();
		bLastAnimationJumping = bJumping = false;
		LastAnimationGait = INDEX_NONE;
	}
	// Active l'option sur ce cheval (BeginPlay la lit dans la ligne de commande ; les tests l'appellent) ; faux si la cuisson échoue.
	bool EnableWebLead(FString* Err = nullptr);
	// Étape S3 : taille du cheval (StridesMonteOptions::ResolveWebHorseScale ; BeginPlay lit la ligne de commande, les tests
	// l'appellent). Échelle du maillage du corps (yeux, crins et sellerie skinnée suivent) : GameMeshScale (0,01, jeu) ou
	// celle du web, WebMeshScale(). Le maillage importé vaut 100 unités par unité de la scène du GLB (conversion d'axes de
	// UStridesHorseTack, vérifiée par Strides.Parite.HorseScale) : échelle du maillage = m par unité du GLB du web.
	// Rien d'autre ne change (simulation, caméra, obstacles : aucun ne lit le maillage). Faux si les données sont illisibles.
	bool EnableWebScale(bool bWeb = true, FString* Err = nullptr);
	bool UsesWebScale() const { return bScaleWeb; }
	static constexpr float GameMeshScale = 0.01f;
	// inner.scale de Content/Data/pjl_horse_tack.json (export du web) ; 0 si illisible.
	static double WebMeshScale(FString* Err = nullptr);
	// Étape S4 : vue du cheval du web (-StridesHorseView=web ; StridesMonteOptions::ResolveWebHorseView) : inclinaison en
	// virage, corps et horloge du saut, cadence des clips, phase de foulée, membres repliés et bascule face aux barres
	// (FStridesHorseView : StridesCore/HorseView). Demande le mélangeur à couches (EnableWebLead). Faux (raison dans Err)
	// si les données ou les clips manquent.
	bool EnableWebView(FString* Err = nullptr);
	bool UsesWebView() const { return bViewWeb; }
	const class FStridesHorseView* HorseView() const { return View.Get(); }
	class FStridesHorseView* MutableHorseView() { return View.Get(); }
	// Après la pose (UStridesHorseViewPost, TG_PostUpdateWork) : abaissement d'appel, repli, bascule ; repère du corps posé.
	void PostPoseView();
	// Tests (Strides.Parite.HorseView) : entrées de la vue, obstacle et sol imposés (nuls : ceux du jeu) ; vue du web
	// active ou non (le cheval rejoue alors la vue du jeu, maillage sans repère du corps).
	void SetViewTestHooks(const struct FStridesHorseViewTestHooks* InHooks) { ViewHooks = InHooks; }
	void SetWebViewActiveForTests(bool bOn);
	// Captures du niveau B (-StridesShots=monte-b) : passe après la pose suspendue avec les autres ticks du cheval.
	void SetViewPostTickEnabled(bool bOn);
	// Une mise à jour de l'animation de pas Dt, hors simulation (tests Strides.Parite.HorseMirror).
	void StepAnimation(double Dt)
	{
		LastDt = Dt;
		UpdateAnimation();
	}

	// Caméra de concours (tranche T6). Une image : cheval vu par la caméra, obstacle suivant (rang dans Course->Obstacles(),
	// −1 : aucun), snap (instant). Sonde de la perche : CameraBlockedAt ; sol : GroundAt ; obstacles survolés : ceux du
	// parcours. Applique œil, point visé et FOV vertical à CourseCameraComponent() et l'active.
	strides::CsoCamOut StepCourseCamera(double Dt, const strides::CsoCamHorse& HorseView, int32 NextIndex, bool bInstant = false);
	// Fin de l'épreuve : caméra de concours désactivée, perche du monde ouvert rétablie (sans l'état commun recalé du web).
	void LeaveCourseCamera();
	// Caméra précédente vue par l'entrée de la caméra de concours (position web, FOV lissé et appliqué) : par défaut la
	// perche du monde ouvert ; posée par les tests et les captures pour repartir de la caméra du jeu web.
	void SetCameraBefore(const strides::CsoVec3& Eye, double Fov, double CamFov);
	bool IsCourseCameraActive() const { return CamState.active; }
	const strides::CsoCamState& CourseCameraState() const { return CamState; }
	class UCameraComponent* CourseCameraComponent() const { return CourseCamera; }
	// Sonde (colliders.cameraBlocked du jeu web) : sphère de 0,45 m (marge du web) au point (repère web) contre ce qui bloque
	// le canal Camera, sans le cheval ni le cavalier.
	bool CameraBlockedAt(double WebX, double WebY, double WebZ) const;
	// Cheval vu par la caméra : état du cœur, sol sous le cheval.
	strides::CsoCamHorse CameraHorse() const;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<class USceneComponent> Root;
	UPROPERTY(VisibleAnywhere) TObjectPtr<class UStaticMeshComponent> Body;
	UPROPERTY(VisibleAnywhere) TObjectPtr<class USkeletalMeshComponent> Mesh;
	UPROPERTY(VisibleAnywhere) TObjectPtr<class USkeletalMeshComponent> EyesMesh;
	UPROPERTY(VisibleAnywhere) TObjectPtr<class USkeletalMeshComponent> HairMesh;
	UPROPERTY(Transient) TObjectPtr<class UMaterialInstanceDynamic> CoatMID;
	UPROPERTY(Transient) TObjectPtr<class UMaterialInstanceDynamic> HairMID;
	bool bCoatApplied = false;
	bool bCoatBody = false;
	UPROPERTY(VisibleAnywhere) TObjectPtr<class USpringArmComponent> Boom;
	UPROPERTY(VisibleAnywhere) TObjectPtr<class UCameraComponent> Camera;
	// Caméra de concours (position et orientation absolues, posées à chaque image par StepCourseCamera).
	UPROPERTY(VisibleAnywhere) TObjectPtr<class UCameraComponent> CourseCamera;
	UPROPERTY(Transient) TObjectPtr<UStridesHorseTack> Tack;
	UPROPERTY(Transient) TObjectPtr<UStridesHorseTackMesh> TackMeshComp;

private:
	// bSimPaused : simulation suspendue (téléphone ouvert : game.simPaused) ; cheval et chrono figés (hdt et sdt nuls),
	// obstacles, caméra et HUD au pas réel (game.js:1486-1507).
	void TickCso(float Dt, bool bSimPaused = false);
	void TickOpenWorld(float Dt, bool bSimPaused = false);
	void TickDemo();
	void StartOpenWorldJump();
	void UpdateAnimation();
	void UpdateWebLeadAnimation(double Dt);
	void UpdateWebViewAnimation(double Dt);
	void UpdateCourseCamera(float Dt);
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
	// Caméra de concours : état du cœur, obstacles vus par la caméra, caméra précédente posée par SetCameraBefore.
	strides::CsoCamState CamState;
	std::vector<strides::CsoCamFence> CamFences;
	bool bCameraBefore = false;
	// Étape M2 : option -StridesHorseLead=web.
	bool bLeadWeb = false;
	bool bScaleWeb = false;
	TSharedPtr<class FStridesHorseMirrorSet> Mirrors;
	strides::mirror::LeadState LeadSt;
	double LeadBlendV = 1;  // pjl/view.js : leadBlend = 1 à la création de la vue
	double OpenWorldTurn = 0;
	double ClipTime = 0;
	strides::mirror::JumpView JumpV;
	bool bTurnForTests = false;
	double TurnForTests = 0;
	double LastDt = 0;  // double : les tests rejouent les pas du web sans arrondi 32 bits
	// Étape S4 : vue du cheval du web.
	bool bViewWeb = false;
	TSharedPtr<class FStridesHorseView> View;
	UPROPERTY(Transient) TObjectPtr<class UStridesHorseViewPost> ViewPost;
	// Clips joués par la vue du web et sources des clips miroir, retenus contre le ramasse-miettes (plantage constaté en
	// partie jouée le 25/11/2026 : clips de virage et d'arrêt chargés sans référence, libérés, puis lus par le mélangeur).
	UPROPERTY(Transient) TArray<TObjectPtr<const class UAnimSequence>> ViewClipRefs;
	const struct FStridesHorseViewTestHooks* ViewHooks = nullptr;
};
