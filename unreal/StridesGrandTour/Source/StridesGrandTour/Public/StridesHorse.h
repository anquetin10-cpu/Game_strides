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

private:
	// bSimPaused : simulation suspendue (téléphone ouvert : game.simPaused) ; cheval et chrono figés (hdt et sdt nuls),
	// obstacles, caméra et HUD au pas réel (game.js:1486-1507).
	void TickCso(float Dt, bool bSimPaused = false);
	void TickOpenWorld(float Dt, bool bSimPaused = false);
	void TickDemo();
	void StartOpenWorldJump();
	void UpdateAnimation();
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
};
