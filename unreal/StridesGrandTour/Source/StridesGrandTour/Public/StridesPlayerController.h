// Commandes du joueur. Tranche T8 : les commandes du web (src/core/input.js, portées dans strides::CsoInput) reçoivent
// le clavier par CODES PHYSIQUES (préprocesseur Slate : code matériel de la touche, « KeyW » = touche Z d'un clavier
// AZERTY), le toucher (InputTouch : doigt posé hors des widgets, routé par Slate et le viewport du jeu comme sur iOS ;
// joystick flottant et regard ; boutons SAUT et pause du widget UStridesTouchControls) ; une image de commandes
// (StepCommands, début de game.update) relève game.simPaused en tête d'image, puis applique téléphone (P / Tab),
// carte (M), pause (Échap, ferme d'abord le téléphone), gel des commandes quand le téléphone est ouvert, puis le
// déplacement et le saut au cheval. Pause : état « paused » (game.pause), commandes désactivées, carte Pause
// (UStridesPauseMenu), jeu suspendu (UGameplayStatics::SetGamePaused ; le cheval et l'épreuve ne font plus de pas,
// AStridesHorse::Tick, à partir de l'image suivante : celle d'Échap avance encore). Téléphone ouvert : cheval et chrono
// figés (hdt et sdt nuls, game.js:1444-1445, 1488, 1507) à partir de l'image qui suit l'ouverture, jusqu'à l'image de la
// fermeture comprise (simPaused est calculé avant les boutons globaux).
// Tranche T10 : action contextuelle du web (« action » : E, F, Entrée, bouton d'action ; game.js:1467-1469) — ferme le
// dialogue de l'entraîneur s'il est affiché, sinon déclenche l'action proposée (poteau « Chrono » d'AStridesActivityPost,
// à cheval, sans mission ; à défaut monter / descendre du portage) ; carte de présentation ou du plan ouverte (overlay)
// et dialogue : simulation suspendue (game.simPaused), commandes gelées, boutons globaux coupés sous la carte ; cartes et
// dialogue affichés par UStridesCsoScreens.
// Enhanced Input garde la manette, la souris (regard) et les outils du portage (F5 / F9, F8, N mission ; E passe par les
// commandes du web) ; les allures (Maj / Ctrl) sont sans effet en épreuve (mode concours).
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
	// ---- Jalon J3 : téléphone interactif (phone.js, requests.js, activities-app.js) ----
	// Écrans : home (accueil, 12 apps du web), strides (offres de missions), request (demande : Accepter / Refuser),
	// activities (Itinéraire vers le chrono du Pôle), map (carte plein écran), app:<nom> (application non portée).
	// Choix n° 15 (plan.md) : au clavier, flèches / ZQSD pour choisir, Entrée / E / F pour toucher, Retour arrière pour
	// revenir (le web n'a que le toucher et la souris : boutons HTML) ; souris et doigt touchent les éléments dessinés.
	int32 PhoneSelection() const { return PhoneSel; }
	void PhoneMove(int32 Delta);
	void PhonePressSelected();
	void PhoneBack();
	// Toucher / clic au point (px du viewport) : élément du téléphone touché, sinon rien. Vrai si un élément a été touché.
	bool PhoneTapAt(const FVector2D& ViewportPx);
	// Jalon J4 (correction) : carte ouverte (épreuve du Pôle, Grand Prix de Paris, A13) : bouton choisi, choix, toucher.
	bool CardPress();
	void CardMove(int32 Dir);
	bool CardTapAt(const FVector2D& ViewportPx);
	// Effet d'un élément (identifiant dessiné par le HUD : « app:strides », « offer:tuto », « accept », « refuse »,
	// « itinerary:cso_train », « abandon », « back »).
	void PhoneActivate(const FString& Id);
	const FString& PhoneRequest() const { return PhoneReq; }
	bool PhoneConfirmArmed() const { return PhoneArmedAt >= 0; }
	bool PhoneAcceptDone() const { return PhoneAcceptAt >= 0; }
	FString PhoneToast;  // toast de l'app (appToast) : texte, effacé après 3 s
	// Horloge de l'interface (s, temps réel : la confirmation et le rangement du téléphone ne dépendent pas du jeu).
	double PhoneNow() const;
	// Une image du téléphone (confirmation expirée, toast, demande acceptée → mission lancée) : appelée par PlayerTick.
	void PhoneTick();
	virtual bool InputKey(const FInputKeyEventArgs& Params) override;
	// Pause (game.pause) et reprise (Reprendre de la carte).
	void PauseGame();
	void ResumeGame();
	bool IsGamePausedState() const { return bPausedState; }
	// La pause prend effet à l'image suivante (le web finit l'image où Échap a été lu) : vrai si la mise à jour du jeu
	// est suspendue à cette image.
	bool SkipsUpdate() const { return bPausedState && !bPauseThisFrame; }
	// Simulation suspendue (game.simPaused, src/game.js:1444 : téléphone ouvert, carte modale ouverte ou dialogue affiché)
	// relevée en tête de l'image de commandes, avant les boutons globaux : cheval et chrono figés en épreuve.
	bool IsSimPaused() const { return bSimPausedFrame; }
	// ---- Entrée dans l'épreuve (tranche T10) ----
	// Action du web (game.js:1467-1469 : advanceDialog, sinon interact.trigger) ; vrai si quelque chose a été fait.
	bool DoAction();
	// Libellé de l'action proposée par le poteau (t('Chrono')), vide si aucune.
	FString ActionLabel() const;
	// Poteau de l'activité du Pôle et épreuve qu'il lance (nuls sans données).
	class AStridesActivityPost* ActivityPost() const;
	class AStridesCourse* EntryCourse() const;
	// Carte de présentation ou du plan ouverte (overlay du web), dialogue de l'entraîneur affiché.
	bool CardOpen() const;
	bool DialogOpen() const;
	class UStridesCsoScreens* ScreensWidget() const { return Screens; }
	class UStridesPauseMenu* PauseMenuWidget() const { return PauseMenu; }
	// Jalon J4-A : écran titre (jeu en pause derrière, pointeur rendu) ; choix transmis au mode de jeu.
	void ShowTitle(bool bHasSave, const FString& Issue);
	bool IsTitleOpen() const;
	// Caméra de l'écran titre (nulle hors titre) et position du survol au temps T (repère web, m : œil, cible).
	class ACameraActor* TitleCameraActor() const { return TitleCamera; }
	static void TitleOrbit(double T, FVector& Eye, FVector& Target);
	class UStridesTitleScreen* TitleWidget() const { return TitleScreen; }
	void OnTitleChoice(bool bNew, const FString& Name, const FString& Avatar);
	// Mode concours (classe cso-ctl du HUD de l'épreuve du monde).
	bool InRace() const;

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;
	virtual void SetupInputComponent() override;
	virtual void PlayerTick(float DeltaTime) override;
	// Jeu en pause (écran titre) : APlayerController n'appelle pas PlayerTick ; l'écran titre (HUD masqué, caméra de survol)
	// est tenu ici.
	virtual void TickActor(float DeltaTime, enum ELevelTick TickType, FActorTickFunction& ThisTickFunction) override;

public:
	// Doigt reçu du viewport du jeu (UGameViewportClient::InputTouch, position en px du viewport) : px CSS (divisés par
	// le facteur de pixels), identifiant du doigt = index + 100 × appareil ; Began → pointerdown, Moved et FirstMove →
	// pointermove, Ended → pointerup ; Stationary et ForceChanged sans effet (aucun pointermove du web).
	using APlayerController::InputTouch;
	virtual bool InputTouch(const FTouchId TouchId, const ETouchType::Type Type, const FVector2D& TouchLocation, const float Force, const uint64 Timestamp) override;
	static int64 TouchPointerId(const FTouchId& TouchId);
	// Relevé des doigts reçus par InputTouch (type, identifiant, px CSS), pour les captures : 32 derniers.
	const TArray<FString>& TouchLog() const { return TouchEvents; }
	void ClearTouchLog() { TouchEvents.Reset(); }
#if WITH_DEV_AUTOMATION_TESTS
	// Tests (sans joueur local, Enhanced Input ne lit pas la manette) : rappels des actions liées à Gamepad_Left2D (Move),
	// Gamepad_FaceButton_Bottom (Jump) et Gamepad_FaceButton_Left (Interact), comme les appelle Enhanced Input.
	void GamepadStickForTest(const FVector2D& V);
	void GamepadJumpForTest() { OnJump(); }
	void GamepadInteractForTest() { OnInteract(); }
	// Jalon J5 : bouton Menu de la manette (pause) ; correspondances touche de manette → action (« Gamepad_X=Action ») ;
	// tests sans joueur local : composant d'entrée créé et correspondances posées.
	void GamepadPauseForTest() { OnGamepadPause(); }
	TArray<FString> GamepadMappingsForTest() const;
	void SetupInputForTest();
#endif

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
	void OnGamepadPause();
	void OnAppActivation(const bool bActive);
	void OnAppDeactivate();
	void RestoreInputMode();
	void ReleaseMouseForCard();
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
	UPROPERTY() TObjectPtr<class UInputAction> PauseAction;
	UPROPERTY() TObjectPtr<class UUserWidget> TouchControls;
	// Jalon J4 (correction après contrôle) : interface d'épreuve et commandes tactiles masquées tant que l'écran titre est
	// ouvert (state 'title' du web : HUD masqué) ; visibilités d'avant rendues à sa fermeture.
	bool bHudHiddenForTitle = false;
	uint8 SavedCsoHudVis = 0, SavedTouchVis = 0;  // ESlateVisibility
public:
	// Appelée par PlayerTick : interface masquée et caméra de survol tant que l'écran titre est ouvert (publique pour les
	// tests, qui n'appellent pas PlayerTick).
	void SyncTitleHud();
	bool HudHiddenForTitle() const { return bHudHiddenForTitle; }
private:
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
	UPROPERTY() TObjectPtr<class UStridesTitleScreen> TitleScreen;
	// Caméra de l'écran titre (game.js updateTitle : survol lent de Deauville), vue tant que le titre est ouvert.
	UPROPERTY() TObjectPtr<class ACameraActor> TitleCamera;
	double TitleT = 0;
	UPROPERTY() TObjectPtr<class UStridesCsoScreens> Screens;
	int32 CardStickDir = 0;
	mutable TWeakObjectPtr<class AStridesActivityPost> PostCache;
public:
	// Tous les poteaux d'activité (Pôle, paddock : jalon J2c), dans l'ordre de création.
	TArray<class AStridesActivityPost*> Posts() const;
private:
	bool bCardInput = false;  // mode d'entrée « jeu et interface » posé pour la carte (pointeur sur Mac)
	strides::CsoInput Cmd;
	TSharedPtr<class IInputProcessor> KeyProcessor;
	FDelegateHandle ActivationHandle, DeactivateHandle;
	FVector2D GamepadMove = FVector2D::ZeroVector;
	FVector2D TestViewCss = FVector2D(844, 390);
	FString PhoneAppName = TEXT("home");
	bool bPhoneOpen = false;
	int32 PhoneSel = 0;
	FString PhoneReq;
	double PhoneArmedAt = -1, PhoneAcceptAt = -1, PhoneToastAt = -1;
	void PhoneShow(const FString& App);
	bool bPausedState = false;
	bool bPauseThisFrame = false;
	bool bSimPausedFrame = false;
	TArray<FString> TouchEvents;
	mutable TWeakObjectPtr<class AStridesCourse> CourseCache;
	class AStridesRider* Rider() const;
	double FootLookAt = -10;  // dernier regard manuel (camera.js lastManual)
public:
	// Jalon J3b : véhicule dont la portière conducteur est à moins de 2,6 m du joueur à pied (nul sinon).
	class AStridesVehicle* NearVehicle() const;
};
