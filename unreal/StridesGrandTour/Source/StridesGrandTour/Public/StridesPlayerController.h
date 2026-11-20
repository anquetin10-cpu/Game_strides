// Commandes du joueur. Tranche T8 : les commandes du web (src/core/input.js, portées dans strides::CsoInput) reçoivent
// le clavier par CODES PHYSIQUES (préprocesseur Slate : code matériel de la touche, « KeyW » = touche Z d'un clavier
// AZERTY), le toucher (InputTouch du viewport : joystick flottant et regard ; boutons SAUT et pause du widget
// UStridesTouchControls) ; une image de commandes (StepCommands, début de game.update) applique téléphone (P / Tab),
// carte (M), pause (Échap, ferme d'abord le téléphone), gel des commandes quand le téléphone est ouvert, puis le
// déplacement et le saut au cheval. Pause : état « paused » (game.pause), commandes désactivées, carte Pause
// (UStridesPauseMenu), jeu suspendu (UGameplayStatics::SetGamePaused ; le cheval et l'épreuve ne font plus de pas,
// AStridesHorse::Tick). Téléphone ouvert : cheval et chrono figés (hdt et sdt nuls, game.js:1486-1489, 1507).
// Enhanced Input garde la manette, la souris (regard) et les outils du portage (E monter, F5 / F9, F8, N mission) ; les
// allures (Maj / Ctrl) sont sans effet en épreuve (mode concours).
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "InputActionValue.h"
#include "StridesCore/CsoInput.h"
#include "StridesPlayerController.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API AStridesPlayerController : public APlayerController
{
	GENERATED_BODY()
public:
	AStridesPlayerController();
	void TouchJump();
	void TouchInteract();
	void TouchGaitUp();
	void TouchGaitDown();
	void TouchSave();
	void TouchLoad();
	void TouchPhone();
	void TouchMission();

	// ---- Commandes du web (tranche T8) ----
	strides::CsoInput& Commands() { return Cmd; }
	const strides::CsoInput& Commands() const { return Cmd; }
	// Touche (code physique du web) reçue par le préprocesseur, ou par les tests.
	void FeedKey(const FString& Code, bool bDown, bool bRepeat);
	// Pointeur sur la surface de jeu (px CSS) : doigt (joystick ou regard) ou souris (regard seulement).
	void FeedPointerDown(int64 Id, bool bMouse, const FVector2D& Css);
	void FeedPointerMove(int64 Id, bool bMouse, const FVector2D& Css);
	void FeedPointerUp(int64 Id);
	// Bouton du HUD relié comme bindButton (« jump », « pause ») : appui puis relâchement.
	void ButtonDown(const FString& Name);
	void ButtonUp(const FString& Name);
	// Une image des commandes (début de game.update jusqu'au cheval, puis input.endFrame) : appelée par PlayerTick avant le
	// pas du cheval ; les tests l'appellent eux-mêmes avant AStridesHorse::Tick.
	void StepCommands(float Dt);
	// Taille du viewport en px CSS (pixels / facteur de pixels) ; tests sans viewport : SetViewCssForTest.
	FVector2D ViewCss() const;
	void SetViewCssForTest(const FVector2D& V) { TestViewCss = V; }

	// Téléphone (phone.js open / close / toggle) : commandes désactivées tant qu'il est ouvert.
	bool IsPhoneOpen() const { return bPhoneOpen; }
	const FString& PhoneApp() const { return PhoneAppName; }
	void OpenPhone(const FString& App = TEXT("home"));
	void ClosePhone();
	void TogglePhone();
	// Pause (game.pause) et reprise (Reprendre de la carte).
	void PauseGame();
	void ResumeGame();
	bool IsGamePausedState() const { return bPausedState; }
	// La pause prend effet à l'image suivante (le web finit l'image où Échap a été lu) : vrai si la mise à jour du jeu
	// est suspendue à cette image.
	bool SkipsUpdate() const { return bPausedState && !bPauseThisFrame; }
	// Simulation suspendue (game.simPaused : téléphone, carte modale) : cheval et chrono figés en épreuve.
	bool IsSimPaused() const;
	class UStridesPauseMenu* PauseMenuWidget() const { return PauseMenu; }
	// Mode concours (classe cso-ctl du HUD de l'épreuve du monde).
	bool InRace() const;

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;
	virtual void SetupInputComponent() override;
	virtual void PlayerTick(float DeltaTime) override;
	using APlayerController::InputTouch;
	virtual bool InputTouch(const FTouchId TouchId, const ETouchType::Type Type, const FVector2D& TouchLocation, const float Force, const uint64 Timestamp) override;

private:
	void InstallInputContext();
	void OnMove(const FInputActionValue& V);
	void OnMoveDone(const FInputActionValue& V);
	void OnLook(const FInputActionValue& V);
	void OnJump();
	void OnInteract();
	void OnGaitUp();
	void OnGaitDown();
	void OnSave();
	void OnLoad();
	void OnDemoCourse();
	void OnPhone();
	void OnMission();
	void OnAppActivation(const bool bActive);
	void OnAppDeactivate();
	void RestoreInputMode();
	UPROPERTY() TObjectPtr<class UInputMappingContext> Context;
	UPROPERTY() TObjectPtr<class UInputAction> MoveAction;
	UPROPERTY() TObjectPtr<class UInputAction> LookAction;
	UPROPERTY() TObjectPtr<class UInputAction> JumpAction;
	UPROPERTY() TObjectPtr<class UInputAction> InteractAction;
	UPROPERTY() TObjectPtr<class UInputAction> GaitUpAction;
	UPROPERTY() TObjectPtr<class UInputAction> GaitDownAction;
	UPROPERTY() TObjectPtr<class UInputAction> SaveAction;
	UPROPERTY() TObjectPtr<class UInputAction> LoadAction;
	UPROPERTY() TObjectPtr<class UInputAction> DemoCourseAction;
	UPROPERTY() TObjectPtr<class UInputAction> PhoneAction;
	UPROPERTY() TObjectPtr<class UInputAction> MissionAction;
	UPROPERTY() TObjectPtr<class UUserWidget> TouchControls;
public:
	// Interface d'épreuve UMG (tranche T7).
	class UStridesCsoHud* CsoHudWidget() const { return CsoHud; }
	// Commandes tactiles et boutons SAUT / pause (créés sur toutes les plateformes ; joystick et boutons du portage en
	// mode tactile : iOS ou -TouchControls) : nul si absentes.
	class UStridesTouchControls* TouchWidget() const;
	// Mode tactile (corps sans .desktop du web) : iOS ou -TouchControls.
	static bool TouchMode();
	// Code physique du web (KeyboardEvent.code) d'une touche reçue par Slate : sur Mac, code matériel de la touche
	// (position, indépendante de la disposition) ; ailleurs ou code absent de la table, nom de la touche Unreal (repli).
	static FString WebCodeOf(const struct FKeyEvent& E);
private:
	UPROPERTY() TObjectPtr<class UStridesCsoHud> CsoHud;
	UPROPERTY() TObjectPtr<class UStridesPauseMenu> PauseMenu;
	strides::CsoInput Cmd;
	TSharedPtr<class IInputProcessor> KeyProcessor;
	FDelegateHandle ActivationHandle, DeactivateHandle;
	FVector2D GamepadMove = FVector2D::ZeroVector;
	FVector2D TestViewCss = FVector2D(844, 390);
	FString PhoneAppName = TEXT("home");
	bool bPhoneOpen = false;
	bool bPausedState = false;
	bool bPauseThisFrame = false;
	mutable TWeakObjectPtr<class AStridesCourse> CourseCache;
	class AStridesRider* Rider() const;
};
