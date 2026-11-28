#include "StridesPlayerController.h"
#include "StridesCsoAudio.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "EngineUtils.h"
#include "Engine/GameViewportClient.h"
#include "Framework/Application/IInputProcessor.h"
#include "Framework/Application/SlateApplication.h"
#include "Layout/WidgetPath.h"
#include "Widgets/SWindow.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/CoreDelegates.h"
#include "Misc/Parse.h"
#include "StridesCourse.h"
#include "StridesHorse.h"
#include "StridesRider.h"
#include "StridesSaveSubsystem.h"
#include "StridesProgressionSubsystem.h"
#include "StridesTouchControls.h"
#include "StridesCsoHud.h"
#include "StridesPauseMenu.h"
#include "StridesTitleScreen.h"
#include "StridesGameMode.h"
#include "StridesActivityPost.h"
#include "StridesCsoScreens.h"
#include "StridesHUD.h"
#include "StridesDataSubsystem.h"
#include "StridesUnits.h"
#include "StridesVehicle.h"
#include "GameFramework/Character.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Misc/App.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "StridesCore/WindowFit.h"

namespace
{
UInputAction* MakeAction(UObject* Outer, const TCHAR* Name, EInputActionValueType Type)
{
	UInputAction* A = NewObject<UInputAction>(Outer, Name);
	A->ValueType = Type;
	return A;
}

// Position de la fenêtre de jeu connue de Slate, recalée sur l'écran qui la porte (Mac, plein écran). Contrôle J1b : en
// plein écran fenêtré, jeu lancé normalement et resté au premier plan, la fenêtre native elle-même rend une position
// périmée ((0, 2159) au lieu de (0, 0) sur l'écran 1920 x 1080, GetFullScreenInfo compris), que Slate garde : le test de
// position d'un clic ne trouve aucun widget (« sous le pointeur rien ») et aucun bouton de carte ne répond, quel que soit
// le nombre de clics, jusqu'à une sortie de l'espace plein écran suivie d'un retour. Règle (StridesCore/WindowFit,
// ctest « fenetre ») : la fenêtre plein écran couvre l'écran du pointeur. Appelé à chaque image de Slate (Tick du
// préprocesseur, avant le dessin qui bâtit la grille de recherche des widgets : recaler au clic seulement laisserait le
// clic courant chercher dans la grille de l'image d'avant, constaté) et avant chaque clic.
static void ResyncGameWindowPosition(FSlateApplication& App, const FVector2D& Cursor)
{
#if PLATFORM_MAC
	const FDisplayMetrics& DM = App.GetCachedDisplayMetricsByRef();
	std::vector<strides::ScreenRect> Screens;
	for (const FMonitorInfo& M : DM.MonitorInfo) Screens.push_back({M.DisplayRect.Left, M.DisplayRect.Top, M.DisplayRect.Right, M.DisplayRect.Bottom});
	for (const TSharedRef<SWindow>& W : App.GetInteractiveTopLevelWindows())
	{
		const TSharedPtr<FGenericWindow> N = W->GetNativeWindow();
		if (!N.IsValid() || W->GetWindowMode() == EWindowMode::Windowed) continue;
		const FVector2D Pos = W->GetPositionInScreen(), Size = W->GetSizeInScreen();
		if (const std::optional<strides::WindowOrigin> O = strides::fullscreenWindowResync(Cursor.X, Cursor.Y, Pos.X, Pos.Y, Size.X, Size.Y, Screens))
		{
			UE_LOG(LogTemp, Display, TEXT("Strides fenêtre : position Slate (%.0f, %.0f) recalée sur l'écran du pointeur (%d, %d), taille %.0f x %.0f"), Pos.X, Pos.Y, O->x, O->y, Size.X, Size.Y);
			App.OnMovedWindow(N.ToSharedRef(), O->x, O->y);
		}
	}
#endif
}

// Préprocesseur Slate : chaque touche enfoncée ou relâchée (répétition automatique comprise) est versée aux commandes
// du web (window keydown / keyup) ; l'événement continue vers Enhanced Input et les widgets.
class FStridesKeyProcessor : public IInputProcessor
{
public:
	explicit FStridesKeyProcessor(AStridesPlayerController* InPC) : PC(InPC) {}
	virtual void Tick(const float, FSlateApplication& App, TSharedRef<ICursor> Cursor) override { ResyncGameWindowPosition(App, Cursor->GetPosition()); }
	virtual bool HandleKeyDownEvent(FSlateApplication&, const FKeyEvent& E) override { Feed(E, true); return false; }
	virtual bool HandleKeyUpEvent(FSlateApplication&, const FKeyEvent& E) override { Feed(E, false); return false; }
	virtual const TCHAR* GetDebugName() const override { return TEXT("StridesKeys"); }
	// Avant que Slate cherche le widget sous le pointeur : position de la fenêtre recalée (voir ResyncGameWindowPosition).
	virtual bool HandleMouseButtonDownEvent(FSlateApplication& App, const FPointerEvent& E) override
	{
		ResyncGameWindowPosition(App, E.GetScreenSpacePosition());
#if !UE_BUILD_SHIPPING
		LogMouse(App, E, TEXT("enfoncé"));
#endif
		return false;
	}
#if !UE_BUILD_SHIPPING
	// Journal des clics (diagnostic J1 du premier clic absorbé, hors Shipping) : position, fenêtre active, capture.
	virtual bool HandleMouseButtonUpEvent(FSlateApplication& App, const FPointerEvent& E) override { LogMouse(App, E, TEXT("relâché")); return false; }
	void LogMouse(FSlateApplication& App, const FPointerEvent& E, const TCHAR* What)
	{
		const TSharedPtr<SWidget> Focus = App.GetUserFocusedWidget(0);
		UE_LOG(LogTemp, Display, TEXT("Strides souris : bouton %s %s à (%.0f, %.0f), application active %d, capture %s, focus %s"), *E.GetEffectingButton().ToString(), What,
			E.GetScreenSpacePosition().X, E.GetScreenSpacePosition().Y, App.IsActive(), App.HasAnyMouseCaptor() ? TEXT("oui") : TEXT("non"),
			Focus.IsValid() ? *Focus->GetTypeAsString() : TEXT("aucun"));
		// Ce que Slate trouve sous le pointeur (fenêtre, chemin de widgets), géométrie de la fenêtre et mode de la souris.
		const FVector2D Pos = E.GetScreenSpacePosition();
		const FWidgetPath Path = App.LocateWindowUnderMouse(Pos, App.GetInteractiveTopLevelWindows(), false, E.GetUserIndex());
		FString Under = TEXT("rien");
		if (Path.IsValid())
		{
			Under.Reset();
			for (int32 i = FMath::Max(0, Path.Widgets.Num() - 3); i < Path.Widgets.Num(); ++i) Under += Path.Widgets[i].Widget->GetTypeAsString() + TEXT(" ");
			Under += FString::Printf(TEXT("(%d)"), Path.Widgets.Num());
		}
		const TSharedPtr<GenericApplication> PA = App.GetPlatformApplication();
		const TSharedPtr<SWindow> W = App.GetActiveTopLevelWindow();
		const FVector2D CurPos = PA.IsValid() && PA->Cursor.IsValid() ? PA->Cursor->GetPosition() : FVector2D(-1, -1);
		int32 FX = -1, FY = -1, FW = -1, FH = -1;
		if (W.IsValid() && W->GetNativeWindow().IsValid()) W->GetNativeWindow()->GetFullScreenInfo(FX, FY, FW, FH);
		UE_LOG(LogTemp, Display, TEXT("Strides souris (détail) : sous le pointeur %s ; au-dessus d'une fenêtre Slate %d, haute précision %d, curseur (%.0f, %.0f) ; fenêtre active %s à (%.0f, %.0f) taille (%.0f, %.0f), mode %d, %d fenêtre(s) interactive(s), écran natif (%d, %d, %d, %d)"),
			*Under, PA.IsValid() && PA->IsCursorDirectlyOverSlateWindow(), PA.IsValid() && PA->IsUsingHighPrecisionMouseMode(), CurPos.X, CurPos.Y,
			W.IsValid() ? TEXT("oui") : TEXT("aucune"), W.IsValid() ? W->GetPositionInScreen().X : 0.f, W.IsValid() ? W->GetPositionInScreen().Y : 0.f,
			W.IsValid() ? W->GetSizeInScreen().X : 0.f, W.IsValid() ? W->GetSizeInScreen().Y : 0.f, W.IsValid() ? (int32)W->GetWindowMode() : -1,
			App.GetInteractiveTopLevelWindows().Num(), FX, FY, FW, FH);
	}
#endif
private:
	void Feed(const FKeyEvent& E, bool bDown)
	{
		const FString Code = AStridesPlayerController::WebCodeOf(E);
		if (!Code.IsEmpty() && PC.IsValid()) PC->FeedKey(Code, bDown, E.IsRepeat());
	}
	TWeakObjectPtr<AStridesPlayerController> PC;
};
}  // namespace

AStridesPlayerController::AStridesPlayerController()
{
	// Commandes lues en pause (la carte Pause et ses boutons ; Échap ne relance pas : update() du web n'est plus appelée).
	PrimaryActorTick.bTickEvenWhenPaused = true;
	bEnableTouchEvents = true;
}

// Sur Mac : FKeyEvent::GetKeyCode porte le code virtuel matériel de macOS (kVK_*, position sur le clavier) ; ailleurs,
// ou code inconnu de la table, nom de la touche Unreal (lié au caractère produit : repli, déclaré dans l'inventaire).
FString AStridesPlayerController::WebCodeOf(const FKeyEvent& E)
{
#if PLATFORM_MAC
	const std::string Mac = strides::webCodeFromMacKeyCode(E.GetKeyCode());
	if (!Mac.empty()) return UTF8_TO_TCHAR(Mac.c_str());
#endif
	return UTF8_TO_TCHAR(strides::webCodeFromKeyName(TCHAR_TO_UTF8(*E.GetKey().GetFName().ToString())).c_str());
}

bool AStridesPlayerController::TouchMode()
{
	return PLATFORM_IOS || FParse::Param(FCommandLine::Get(), TEXT("TouchControls"));
}

void AStridesPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();
	Context = NewObject<UInputMappingContext>(this, TEXT("StridesContext"));
	MoveAction = MakeAction(this, TEXT("Move"), EInputActionValueType::Axis2D);
	LookAction = MakeAction(this, TEXT("Look"), EInputActionValueType::Axis2D);
	JumpAction = MakeAction(this, TEXT("Jump"), EInputActionValueType::Boolean);
	InteractAction = MakeAction(this, TEXT("Interact"), EInputActionValueType::Boolean);
	// Carte Pause à la manette (choix n° 9) : stick et X lus jeu suspendu.
	MoveAction->bTriggerWhenPaused = true;
	InteractAction->bTriggerWhenPaused = true;
	GaitUpAction = MakeAction(this, TEXT("GaitUp"), EInputActionValueType::Boolean);
	GaitDownAction = MakeAction(this, TEXT("GaitDown"), EInputActionValueType::Boolean);
	SaveAction = MakeAction(this, TEXT("Save"), EInputActionValueType::Boolean);
	LoadAction = MakeAction(this, TEXT("Load"), EInputActionValueType::Boolean);
	DemoCourseAction = MakeAction(this, TEXT("DemoCourse"), EInputActionValueType::Boolean);
	PhoneAction = MakeAction(this, TEXT("Phone"), EInputActionValueType::Boolean);
	MissionAction = MakeAction(this, TEXT("Mission"), EInputActionValueType::Boolean);
	// Jalon J5 : pause à la manette (bouton Menu), lue aussi jeu suspendu pour refermer la carte Pause.
	PauseAction = MakeAction(this, TEXT("Pause"), EInputActionValueType::Boolean);
	PauseAction->bTriggerWhenPaused = true;
	// Clavier du web (déplacement, Espace, Échap, P / Tab, M, Ctrl / Alt) : commandes du web (FeedKey, codes physiques).
	// Restent ici : manette (stick gauche / droit, A, X, Start, croix), souris (regard), outils du portage (Maj / Ctrl allure
	// hors épreuve, F5 / F9, F8 démonstration, N mission suivante). E, F et Entrée : « action » des commandes du web
	// (tranche T10, DoAction depuis StepCommands) ; le bouton X de la manette y mène aussi (OnInteract).
	Context->MapKey(MoveAction, EKeys::Gamepad_Left2D);
	Context->MapKey(LookAction, EKeys::Mouse2D);
	Context->MapKey(LookAction, EKeys::Gamepad_Right2D);
	Context->MapKey(JumpAction, EKeys::Gamepad_FaceButton_Bottom);
	Context->MapKey(InteractAction, EKeys::Gamepad_FaceButton_Left);
	Context->MapKey(GaitUpAction, EKeys::LeftShift);
	Context->MapKey(GaitDownAction, EKeys::LeftControl);
#if !UE_BUILD_SHIPPING
	// Outils du portage (sauvegarde / rechargement manuels, démonstration automatique) : absents du Shipping (lot J1-F) ;
	// le jeu publié sauvegarde seul (meilleur temps écrit en fin d'épreuve, AStridesCourse::FlushRunCalls).
	Context->MapKey(SaveAction, EKeys::F5);
	Context->MapKey(LoadAction, EKeys::F9);
	Context->MapKey(DemoCourseAction, EKeys::F8);
	// Mission suivante (N, croix haut) : outil du portage (audit B7), absent du Shipping comme F5 / F9 / F8.
	Context->MapKey(MissionAction, EKeys::N);
	Context->MapKey(MissionAction, EKeys::Gamepad_DPad_Up);
#endif
	// Jalon J5 (choix n° 40, le web n'a pas de manette) : disposition usuelle d'une manette. Menu (Start) = pause, comme
	// Échap ; Vue (Select) = téléphone ; gâchettes hautes droite / gauche = allure + / − (BOOST du web).
	Context->MapKey(PauseAction, EKeys::Gamepad_Special_Right);
	Context->MapKey(PhoneAction, EKeys::Gamepad_Special_Left);
	Context->MapKey(GaitUpAction, EKeys::Gamepad_RightShoulder);
	Context->MapKey(GaitDownAction, EKeys::Gamepad_LeftShoulder);
	if (UEnhancedInputComponent* EI = Cast<UEnhancedInputComponent>(InputComponent))
	{
		EI->BindAction(MoveAction, ETriggerEvent::Triggered, this, &AStridesPlayerController::OnMove);
		EI->BindAction(MoveAction, ETriggerEvent::Completed, this, &AStridesPlayerController::OnMoveDone);
		EI->BindAction(LookAction, ETriggerEvent::Triggered, this, &AStridesPlayerController::OnLook);
		EI->BindAction(JumpAction, ETriggerEvent::Started, this, &AStridesPlayerController::OnJump);
		EI->BindAction(InteractAction, ETriggerEvent::Started, this, &AStridesPlayerController::OnInteract);
		EI->BindAction(GaitUpAction, ETriggerEvent::Started, this, &AStridesPlayerController::OnGaitUp);
		EI->BindAction(GaitDownAction, ETriggerEvent::Started, this, &AStridesPlayerController::OnGaitDown);
		EI->BindAction(SaveAction, ETriggerEvent::Started, this, &AStridesPlayerController::OnSave);
		EI->BindAction(LoadAction, ETriggerEvent::Started, this, &AStridesPlayerController::OnLoad);
		EI->BindAction(DemoCourseAction, ETriggerEvent::Started, this, &AStridesPlayerController::OnDemoCourse);
		EI->BindAction(PhoneAction, ETriggerEvent::Started, this, &AStridesPlayerController::OnPhone);
		EI->BindAction(MissionAction, ETriggerEvent::Started, this, &AStridesPlayerController::OnMission);
		EI->BindAction(PauseAction, ETriggerEvent::Started, this, &AStridesPlayerController::OnGamepadPause);
	}
	InstallInputContext();
}

UStridesTouchControls* AStridesPlayerController::TouchWidget() const { return Cast<UStridesTouchControls>(TouchControls); }

void AStridesPlayerController::BeginPlay()
{
	Super::BeginPlay();
	InstallInputContext();
	if (!IsLocalController()) return;
	// Interface d'épreuve (tranche T7) : affichée sur toutes les plateformes, sous les commandes tactiles.
	CsoHud = CreateWidget<UStridesCsoHud>(this, UStridesCsoHud::StaticClass());
	if (CsoHud) CsoHud->AddToViewport(50);
	// Boutons SAUT et pause (toutes plateformes, comme les boutons du HUD du web) ; joystick et boutons du portage en
	// mode tactile (tranche T8).
	TouchControls = CreateWidget<UStridesTouchControls>(this, UStridesTouchControls::StaticClass());
	if (TouchControls) TouchControls->AddToViewport(100);
	// Cartes de présentation et du plan, dialogue de l'entraîneur (tranche T10) : au-dessus du HUD et des boutons (overlay
	// du web, z-index 46), sous la carte Pause.
	Screens = CreateWidget<UStridesCsoScreens>(this, UStridesCsoScreens::StaticClass());
	if (Screens)
	{
		Screens->Bind(EntryCourse());
		Screens->AddToViewport(200);
	}
	RestoreInputMode();
	// Clavier par codes physiques ; tout relâché quand l'application perd le focus ou passe en arrière-plan (window blur,
	// visibilitychange du web).
	if (FSlateApplication::IsInitialized())
	{
		KeyProcessor = MakeShared<FStridesKeyProcessor>(this);
		FSlateApplication::Get().RegisterInputPreProcessor(KeyProcessor);
		ActivationHandle = FSlateApplication::Get().OnApplicationActivationStateChanged().AddUObject(this, &AStridesPlayerController::OnAppActivation);
	}
	DeactivateHandle = FCoreDelegates::ApplicationWillDeactivateDelegate.AddUObject(this, &AStridesPlayerController::OnAppDeactivate);
}

void AStridesPlayerController::EndPlay(const EEndPlayReason::Type Reason)
{
	if (FSlateApplication::IsInitialized())
	{
		if (KeyProcessor.IsValid()) FSlateApplication::Get().UnregisterInputPreProcessor(KeyProcessor);
		if (ActivationHandle.IsValid()) FSlateApplication::Get().OnApplicationActivationStateChanged().Remove(ActivationHandle);
	}
	KeyProcessor.Reset();
	if (DeactivateHandle.IsValid()) FCoreDelegates::ApplicationWillDeactivateDelegate.Remove(DeactivateHandle);
	Super::EndPlay(Reason);
}

void AStridesPlayerController::ReleaseMouseForCard()
{
	// Souris rendue au système (contrôles J1 : en plein écran, premier clic sur un bouton de carte absorbé par la capture
	// de la vue, « MouseCaptureMode CapturePermanently » au journal) : capture et verrou relâchés, pointeur Slate remis à
	// zéro. FInputModeGameAndUI remet CaptureDuringMouseDown : NoCapture est donc posé après lui.
	if (UGameViewportClient* VC = GetLocalPlayer() ? GetLocalPlayer()->ViewportClient : nullptr)
	{
		VC->SetMouseCaptureMode(EMouseCaptureMode::NoCapture);
		if (FViewport* Vp = VC->Viewport) { Vp->CaptureMouse(false); Vp->LockMouseToViewport(false); }
	}
	if (FSlateApplication::IsInitialized())
	{
		FSlateApplication::Get().ReleaseAllPointerCapture();
		ResyncGameWindowPosition(FSlateApplication::Get(), FSlateApplication::Get().GetCursorPos());
	}
}

void AStridesPlayerController::OnAppActivation(const bool bActive) { if (!bActive) Cmd.releaseAll(); }
void AStridesPlayerController::OnAppDeactivate() { Cmd.releaseAll(); }

void AStridesPlayerController::RestoreInputMode()
{
	if (TouchMode())
	{
		FInputModeGameAndUI InputMode;
		InputMode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		InputMode.SetHideCursorDuringCapture(false);
		SetInputMode(InputMode);
		bShowMouseCursor = !PLATFORM_IOS;
	}
	else
	{
		SetInputMode(FInputModeGameOnly());
		bShowMouseCursor = false;
	}
}

void AStridesPlayerController::InstallInputContext()
{
	if (!Context) return;
	if (UEnhancedInputLocalPlayerSubsystem* S = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(GetLocalPlayer()))
	{
		S->RemoveMappingContext(Context);
		S->AddMappingContext(Context, 0);
		UE_LOG(LogTemp, Display, TEXT("Strides input context installed"));
	}
}

AStridesRider* AStridesPlayerController::Rider() const
{
	if (AStridesRider* R = Cast<AStridesRider>(GetPawn())) return R;
	if (AStridesHorse* H = Cast<AStridesHorse>(GetPawn())) return H->Rider;
	return nullptr;
}

AStridesVehicle* AStridesPlayerController::NearVehicle() const
{
	// player.js « vehicle-in » : portière conducteur à moins de 2,6 m d'un véhicule sans conducteur.
	const AStridesRider* R = Cast<AStridesRider>(GetPawn());
	if (!R || R->MountedOn || !GetWorld()) return nullptr;
	double X, Y, Z;
	StridesUnits::UEToWeb(R->GetActorLocation(), X, Y, Z);
	AStridesVehicle* Best = nullptr;
	double BestD = 2.6;
	for (TActorIterator<AStridesVehicle> It(GetWorld()); It; ++It)
	{
		if (It->IsDriven()) continue;
		const double D = It->DoorDistance(X, Z);
		if (D < BestD) { BestD = D; Best = *It; }
	}
	return Best;
}

FVector2D AStridesPlayerController::ViewCss() const
{
	const UWorld* W = GetWorld();
	const UGameViewportClient* VC = W ? W->GetGameViewport() : nullptr;
	if (VC && VC->Viewport)
	{
		const FIntPoint Px = VC->Viewport->GetSizeXY();
		if (Px.X > 0 && Px.Y > 0) return FVector2D(Px) / UStridesCsoHud::PixelRatio();
	}
	return TestViewCss;
}

bool AStridesPlayerController::InRace() const
{
	if (!CourseCache.IsValid() && GetWorld())
		for (TActorIterator<AStridesCourse> It(GetWorld()); It; ++It)
			if (It->Run()) { CourseCache = *It; break; }
	const AStridesCourse* C = CourseCache.Get();
	return C && C->Run() && C->HudModel().csoCtl();
}

// ---- Entrées vers les commandes du web ----
void AStridesPlayerController::FeedKey(const FString& Code, bool bDown, bool bRepeat)
{
	// Jalon J4-A : écran titre ouvert : haut / bas choisissent, Entrée / E / F (hors saisie du prénom) touchent, Retour
	// arrière efface le prénom ; rien ne va aux commandes du jeu.
	if (IsTitleOpen())
	{
		if (!bDown) return;
		const bool bTyping = TitleScreen->NameFieldSelected();
		if (Code == TEXT("ArrowUp") || (!bTyping && (Code == TEXT("KeyW") || Code == TEXT("KeyZ")))) { TitleScreen->MoveSelection(-1); return; }
		if (Code == TEXT("ArrowDown") || Code == TEXT("Tab") || (!bTyping && Code == TEXT("KeyS"))) { TitleScreen->MoveSelection(1); return; }
		if (Code == TEXT("ArrowLeft") || (!bTyping && (Code == TEXT("KeyA") || Code == TEXT("KeyQ")))) { TitleScreen->MoveSelection(-1); return; }
		if (Code == TEXT("ArrowRight") || (!bTyping && Code == TEXT("KeyD"))) { TitleScreen->MoveSelection(1); return; }
		if (Code == TEXT("Backspace")) { TitleScreen->Backspace(); return; }
		if (bRepeat) return;
		if (Code == TEXT("Enter") || Code == TEXT("NumpadEnter") || (!bTyping && (Code == TEXT("KeyE") || Code == TEXT("KeyF") || Code == TEXT("Space"))))
		{
			// Entrée dans le prénom : passage au bouton « C'est parti » (input keydown Enter → blur du web).
			if (bTyping) TitleScreen->MoveSelection(3);
			else TitleScreen->PressSelected();
		}
		return;
	}
	// Carte Pause ouverte (choix n° 9, 2e correction J1) : Échap la referme (Reprendre), Entrée / E / F déclenchent le
	// bouton choisi (« Reprendre » d'office), gauche / droite changent de bouton. La touche ne va pas aux commandes du web :
	// sinon l'Échap resterait dans pressed et remettrait la pause dès la reprise (input.js:138, 171).
	if (bPausedState && PauseMenu && PauseMenu->IsOpen())
	{
		if (!bDown) { Cmd.key(TCHAR_TO_UTF8(*Code), false, false); return; }  // relâchés : état des touches tenu à jour
		if (bRepeat) return;
		if (Code == TEXT("Escape")) { UE_LOG(LogTemp, Display, TEXT("Strides pause : Échap, reprise")); ResumeGame(); return; }
		if (Code == TEXT("Enter") || Code == TEXT("NumpadEnter") || Code == TEXT("KeyE") || Code == TEXT("KeyF")) { PauseMenu->PressSelected(); return; }
		if (Code == TEXT("ArrowLeft") || Code == TEXT("KeyA") || Code == TEXT("KeyQ")) { PauseMenu->MoveSelection(-1); return; }
		if (Code == TEXT("ArrowRight") || Code == TEXT("KeyD")) { PauseMenu->MoveSelection(1); return; }
		return;
	}
	// Téléphone ouvert (choix n° 15) : flèches / ZQSD choisissent, Entrée / E / F touchent, Retour arrière revient ; la touche
	// ne va pas aux commandes (elles sont désactivées : phone.open → input.setEnabled(false)). Échap, P, Tab et M gardent leur
	// effet du web (fermer, carte).
	if (bPhoneOpen && !bPausedState && !CardOpen() && bDown)
	{
		const AStridesHUD* H = Cast<AStridesHUD>(GetHUD());
		const int32 Cols = H ? FMath::Max(1, H->PhoneColumns()) : 1;
		if (Code == TEXT("ArrowLeft") || Code == TEXT("KeyA") || Code == TEXT("KeyQ")) { if (!bRepeat) PhoneMove(-1); return; }
		if (Code == TEXT("ArrowRight") || Code == TEXT("KeyD")) { if (!bRepeat) PhoneMove(1); return; }
		if (Code == TEXT("ArrowUp") || Code == TEXT("KeyW") || Code == TEXT("KeyZ")) { if (!bRepeat) PhoneMove(-Cols); return; }
		if (Code == TEXT("ArrowDown") || Code == TEXT("KeyS")) { if (!bRepeat) PhoneMove(Cols); return; }
		if (Code == TEXT("Enter") || Code == TEXT("NumpadEnter") || Code == TEXT("KeyE") || Code == TEXT("KeyF")) { if (!bRepeat) PhonePressSelected(); return; }
		if (Code == TEXT("Backspace")) { if (!bRepeat) PhoneBack(); return; }
	}
	// Carte ouverte : gauche / droite choisissent le bouton (choix n° 8) ; la touche ne va pas au cheval (gel des commandes).
	if (bDown && !bRepeat && CardOpen() && !bPausedState)
	{
		if (Code == TEXT("ArrowLeft") || Code == TEXT("KeyA") || Code == TEXT("KeyQ")) { CardMove(-1); return; }
		if (Code == TEXT("ArrowRight") || Code == TEXT("KeyD")) { CardMove(1); return; }
	}
	Cmd.key(TCHAR_TO_UTF8(*Code), bDown, bRepeat);
}

void AStridesPlayerController::FeedPointerDown(int64 Id, bool bMouse, const FVector2D& Css)
{
	const FVector2D V = ViewCss();
	Cmd.pointerDown(Id, bMouse ? strides::CsoPointer::Mouse : strides::CsoPointer::Touch, Css.X, Css.Y, V.X, V.Y);
}
void AStridesPlayerController::FeedPointerMove(int64 Id, bool bMouse, const FVector2D& Css)
{
	Cmd.pointerMove(Id, bMouse ? strides::CsoPointer::Mouse : strides::CsoPointer::Touch, Css.X, Css.Y, FPlatformTime::Seconds() * 1000.0);
}
void AStridesPlayerController::FeedPointerUp(int64 Id) { Cmd.pointerUp(Id); }
void AStridesPlayerController::ButtonDown(const FString& Name) { Cmd.buttonDown(TCHAR_TO_UTF8(*Name)); }
void AStridesPlayerController::ButtonUp(const FString& Name) { Cmd.buttonUp(TCHAR_TO_UTF8(*Name)); }

int64 AStridesPlayerController::TouchPointerId(const FTouchId& TouchId)
{
	return (int64)TouchId.GetIndex() + 100 * (int64)TouchId.GetDeviceId().GetId();
}

bool AStridesPlayerController::InputTouch(const FTouchId TouchId, const ETouchType::Type Type, const FVector2D& TouchLocation, const float Force, const uint64 Timestamp)
{
	// Doigt posé hors des widgets (surface de jeu, comme le canvas du web) : position du viewport (px) en px CSS.
	const int64 Id = TouchPointerId(TouchId);
	const FVector2D Css = TouchLocation / UStridesCsoHud::PixelRatio();
	// FirstMove (premier déplacement du doigt) traité comme Moved : qu'il précède un Moved au même point (le second
	// pointermove ne change rien : position absolue, écart de regard nul) ou qu'il le remplace, le geste du web est rendu.
	const TCHAR* Name = TEXT("?");
	switch (Type)
	{
	case ETouchType::Began:
		Name = TEXT("Began");
		// Téléphone ouvert : le doigt touche ses éléments (px du viewport), pas la surface de jeu.
		if (bPhoneOpen && !bPausedState) { PhoneTapAt(TouchLocation); break; }
		// Carte du Grand Prix de Paris ou de l'A13 (dessinée sur le canevas) : bouton touché.
		if (!bPausedState && CardTapAt(TouchLocation)) break;
		FeedPointerDown(Id, false, Css);
		break;
	case ETouchType::Moved: Name = TEXT("Moved"); FeedPointerMove(Id, false, Css); break;
	case ETouchType::FirstMove: Name = TEXT("FirstMove"); FeedPointerMove(Id, false, Css); break;
	case ETouchType::Ended: Name = TEXT("Ended"); FeedPointerUp(Id); break;
	case ETouchType::Stationary: Name = TEXT("Stationary"); break;
	case ETouchType::ForceChanged: Name = TEXT("ForceChanged"); break;
	default: break;
	}
	if (TouchEvents.Num() >= 32) TouchEvents.RemoveAt(0);
	TouchEvents.Add(FString::Printf(TEXT("%s#%lld(%.1f;%.1f)"), Name, Id, Css.X, Css.Y));
	Super::InputTouch(TouchId, Type, TouchLocation, Force, Timestamp);
	return true;
}

void AStridesPlayerController::TitleOrbit(double T, FVector& Eye, FVector& Target)
{
	// game.js:1416-1422 : t = titleT · 0,035 ; centre (60 ; −330) ; œil (c.x + cos t · 190, 46 + sin 0,7t · 6,
	// c.z + 70 + sin t · 120), regard vers (c.x, 6, c.z − 40).
	const double A = T * 0.035, CX = 60, CZ = -330;
	Eye = FVector(CX + FMath::Cos(A) * 190, 46 + FMath::Sin(A * 0.7) * 6, CZ + 70 + FMath::Sin(A) * 120);
	Target = FVector(CX, 6, CZ - 40);
}

void AStridesPlayerController::SyncTitleHud()
{
	const bool bTitle = IsTitleOpen();
	// Écran titre du web : la caméra survole Deauville (updateTitle) au lieu de rester sur le personnage (gros plan sur le
	// cavalier dans le portage) ; le monde reste en pause derrière (choix du portage), seule la caméra bouge.
	if (bTitle && GetWorld())
	{
		if (!TitleCamera)
		{
			TitleCamera = GetWorld()->SpawnActor<ACameraActor>();
			if (TitleCamera)
			{
				// Champ vertical de 60° du web (PerspectiveCamera(60, …)) à tout format : axe Y imposé, rapport 1 (voir
				// AStridesHorse, caméra de concours).
				UCameraComponent* C = TitleCamera->GetCameraComponent();
				C->bConstrainAspectRatio = false;
				C->SetAspectRatio(1.f);
				C->bOverrideAspectRatioAxisConstraint = true;
				C->SetAspectRatioAxisConstraint(EAspectRatioAxisConstraint::AspectRatio_MaintainYFOV);
				C->SetFieldOfView(60.f);
			}
			TitleT = 0;
		}
		if (TitleCamera)
		{
			TitleT += FMath::Min(0.1, (double)FApp::GetDeltaTime());
			FVector E, T;
			TitleOrbit(TitleT, E, T);
			const FVector Eye = StridesUnits::WebToUE(E.X, E.Y, E.Z), At = StridesUnits::WebToUE(T.X, T.Y, T.Z);
			TitleCamera->SetActorLocationAndRotation(Eye, (At - Eye).Rotation());
			if (GetViewTarget() != TitleCamera) SetViewTarget(TitleCamera);
		}
	}
	else if (TitleCamera)
	{
		if (GetViewTarget() == TitleCamera && GetPawn()) SetViewTarget(GetPawn());
		TitleCamera->Destroy();
		TitleCamera = nullptr;
	}
	if (bTitle == bHudHiddenForTitle) return;
	UUserWidget* Hud = CsoHud.Get();
	if (bTitle)
	{
		if (Hud) { SavedCsoHudVis = (uint8)Hud->GetVisibility(); Hud->SetVisibility(ESlateVisibility::Collapsed); }
		if (TouchControls) { SavedTouchVis = (uint8)TouchControls->GetVisibility(); TouchControls->SetVisibility(ESlateVisibility::Collapsed); }
	}
	else
	{
		if (Hud) Hud->SetVisibility((ESlateVisibility)SavedCsoHudVis);
		if (TouchControls) TouchControls->SetVisibility((ESlateVisibility)SavedTouchVis);
	}
	bHudHiddenForTitle = bTitle;
}

void AStridesPlayerController::TickActor(float DeltaTime, ELevelTick TickType, FActorTickFunction& ThisTickFunction)
{
	Super::TickActor(DeltaTime, TickType, ThisTickFunction);
	// 2e correction de J4 (relevé en jeu, -StridesShots=titre : « HUD masqué 0 ») : le titre met le jeu en pause, et en
	// pause le moteur ne passe pas par PlayerTick ; sans cet appel, ni le masquage ni la caméra du titre n'avaient lieu.
	if (TickType != LEVELTICK_PauseTick) return;
	SyncTitleHud();
	// En pause, le monde ne recalcule plus le point de vue (relevé en jeu : vue figée, caméra de survol pourtant choisie) :
	// sous le titre, le gestionnaire de caméra est mis à jour ici pour suivre le survol.
	if (IsTitleOpen()) UpdateCameraManager(DeltaTime);
}

void AStridesPlayerController::PlayerTick(float DeltaTime)
{
	Super::PlayerTick(DeltaTime);
	SyncTitleHud();
	StepCommands(DeltaTime);
	PhoneTick();
	// Sauvegarde automatique toutes les 12 s de jeu (game.js update), jamais en pause ni sur l'écran titre (state 'title' :
	// la partie n'a pas commencé, la sauvegarde du joueur n'est pas touchée avant son choix).
	if (!bPausedState && !IsTitleOpen() && !(GetWorld() && GetWorld()->IsPaused()) && DeltaTime > 0)
		if (UStridesSaveSubsystem* S = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>() : nullptr) S->AutoSaveTick(this, DeltaTime);
}

// game.update (src/game.js:1438-1490) côté commandes : input.poll, boutons globaux, gel des commandes, cheval, puis
// input.endFrame. En pause, update() n'est pas appelée : rien n'est lu (un Échap tapé en pause reste dans pressed et
// reprend effet à la reprise, comme dans le web).
void AStridesPlayerController::StepCommands(float Dt)
{
	bPauseThisFrame = false;
	if (bPausedState) return;
	Cmd.poll();
	// Écran modal ouvert (overlay : carte de présentation ou du plan, tranche T10) ; dialogue de l'entraîneur affiché.
	if (Screens && !Screens->BoundCourse()) Screens->Bind(EntryCourse());
	const bool bOverlay = CardOpen();
	const bool bDialog = DialogOpen();
	// game.simPaused (src/game.js:1444-1445) : relevé ici, avant les boutons globaux. L'image où le téléphone s'ouvre (ou
	// Échap) avance encore, celle où il se referme reste figée (ORA/cso_freeze.json).
	bSimPausedFrame = bPhoneOpen || bOverlay || bDialog;
	// Carte cliquable à la souris sur Mac (le web garde toujours le pointeur) ; mode d'entrée rendu à sa fermeture.
	if (bOverlay != bCardInput && GetLocalPlayer() && !bPausedState)
	{
		bCardInput = bOverlay;
		if (bOverlay)
		{
			FInputModeGameAndUI InputMode;
			InputMode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
			InputMode.SetHideCursorDuringCapture(false);
			SetInputMode(InputMode);
			bShowMouseCursor = !PLATFORM_IOS;
			ReleaseMouseForCard();
			Cmd.releaseAll();  // screens.card : input.releaseAll()
		}
		else RestoreInputMode();
	}
	if (Cmd.wasPressed("phone") && !bOverlay) TogglePhone();
	if (Cmd.wasPressed("map") && !bOverlay)
	{
		if (bPhoneOpen) ClosePhone();
		else OpenPhone(TEXT("map"));
	}
	if (Cmd.wasPressed("pause") && !bOverlay)
	{
		if (bPhoneOpen) ClosePhone();
		else PauseGame();
	}
	const bool bCanAct = !bPhoneOpen && !bOverlay;
	// game.js:1467-1469 : action (E, F, Entrée, bouton d'action) — dialogue fermé, sinon action proposée.
	if (bCanAct && Cmd.wasPressed("action")) DoAction();
	// Carte ouverte : Entrée / E / F déclenchent son bouton principal (choix n° 8 : le bouton HTML du web se prend au clavier).
	else if (bOverlay && !bPhoneOpen && Cmd.wasPressed("action")) CardPress();
	// frozenInput (game.js:1478) : téléphone, carte ou dialogue.
	if (!bCanAct || DialogOpen())
	{
		// frozenInput : déplacement à zéro, saut retiré.
		Cmd.move.x = Cmd.move.y = Cmd.move.mag = 0;
		Cmd.pressed.erase("jump");
	}
	APawn* P = GetPawn();
	if (AStridesHorse* H = Cast<AStridesHorse>(P))
	{
		FVector2D M(Cmd.move.x, Cmd.move.y);
		// Manette (hors web) : seulement sans clavier ni joystick.
		if (Cmd.move.mag == 0 && !Cmd.keyMove && bCanAct && !GamepadMove.IsZero()) M = GamepadMove;
		H->SetMoveInput(M, Cmd.keyMove);
		if (Cmd.wasPressed("jump")) H->RequestJump();
		// Jalon J4 : BOOST (Maj tenue, input « gallop » du web), lu par la course de l'hippodrome.
		H->SetBoost(bCanAct && Cmd.isHeld("gallop"));
	}
	else if (AStridesVehicle* V = Cast<AStridesVehicle>(P))
	{
		// Jalon J3b : au volant (player.js:665-669), mêmes commandes que le cheval (mv.x : direction, mv.y : gaz / frein).
		FVector2D M(Cmd.move.x, Cmd.move.y);
		if (M.IsZero() && bCanAct) M = GamepadMove;
		V->SetDriveInput(M);
	}
	else if (P)
	{
		// À pied (player.js:625-636, camera.js:85-97) : déplacement relatif à la caméra (cam.worldDir) ; la caméra se
		// recentre derrière le marcheur quand il avance (vitesse > 1,2 m/s, regard manuel il y a plus de 1,4 s,
		// k = 1,4 + min(v / 10, 1,6)) ; vitesse du web : 2,4 × (mag / 0,55 + 0,25) sous mag 0,55, course 5,4 m/s
		// au-delà (clavier : mag 1), sprint 7,2 m/s touche d'allure tenue. Jalon J3b (P2 : marche non dirigeable).
		FVector2D M(Cmd.move.x, Cmd.move.y);
		if (M.IsZero() && bCanAct) M = GamepadMove;
		const double Mag = FMath::Min(1.0, (double)M.Size());
		double Sp = 0;
		if (Mag > 0.1)
		{
			Sp = Mag < 0.55 ? 2.4 * (Mag / 0.55 + 0.25) : 5.4;
			if (Cmd.isHeld("gallop")) Sp = 7.2;
		}
		if (ACharacter* Ch = Cast<ACharacter>(P)) Ch->GetCharacterMovement()->MaxWalkSpeed = (float)FMath::Max(Sp, 0.1) * 100.f;
		if (Mag > 0.1)
		{
			const FVector2D Dir = M.GetSafeNormal();
			const FRotator Yaw(0, GetControlRotation().Yaw, 0);
			P->AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::X), Dir.Y);
			P->AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y), Dir.X);
		}
		const double Speed = P->GetVelocity().Size2D() / 100.0;
		const double Now = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0;
		if (Speed > 1.2 && Now - FootLookAt > 1.4 && Dt > 0)
		{
			const double K = 1.4 + FMath::Min(Speed / 10.0, 1.6);
			FRotator CR = GetControlRotation();
			CR.Yaw += FMath::FindDeltaAngleDegrees(CR.Yaw, P->GetActorRotation().Yaw) * (1.0 - FMath::Exp(-K * Dt));
			CR.Pitch = 0;
			SetControlRotation(CR);
		}
	}
	// Regard au doigt (glisser hors du joystick, camera.js:79-81 : 0,0062 rad par px en lacet, 0,0045 en tangage) sur la
	// perche du monde ouvert ; sans effet sur la caméra de concours.
	if (Cmd.look.dx != 0 || Cmd.look.dy != 0)
	{
		AddYawInput((float)FMath::RadiansToDegrees(Cmd.look.dx * 0.0062));
		AddPitchInput((float)FMath::RadiansToDegrees(Cmd.look.dy * 0.0045));
		FootLookAt = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0;
	}
	Cmd.endFrame();
}

// ---- Téléphone et pause ----
void AStridesPlayerController::OpenPhone(const FString& App)
{
	PhoneShow(App);
	bPhoneOpen = true;
	Cmd.setEnabled(false);
	// Pointeur rendu sur Mac pour toucher les applications à la souris (le web garde toujours le pointeur).
	if (GetLocalPlayer() && !bCardInput)
	{
		FInputModeGameAndUI InputMode;
		InputMode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		InputMode.SetHideCursorDuringCapture(false);
		SetInputMode(InputMode);
		bShowMouseCursor = !PLATFORM_IOS;
		ReleaseMouseForCard();
	}
	UE_LOG(LogTemp, Display, TEXT("Strides téléphone : ouvert (%s)"), *PhoneAppName);
}
void AStridesPlayerController::ClosePhone()
{
	if (!bPhoneOpen) return;
	bPhoneOpen = false;
	PhoneArmedAt = -1;
	Cmd.setEnabled(true);
	if (GetLocalPlayer() && !bCardInput) RestoreInputMode();
	UE_LOG(LogTemp, Display, TEXT("Strides téléphone : fermé"));
}

double AStridesPlayerController::PhoneNow() const { return FPlatformTime::Seconds(); }

void AStridesPlayerController::PhoneShow(const FString& App)
{
	PhoneAppName = App;
	PhoneSel = 0;
	PhoneArmedAt = -1;
	UE_LOG(LogTemp, Display, TEXT("Strides téléphone : écran %s"), *App);
}

void AStridesPlayerController::PhoneMove(int32 Delta)
{
	const AStridesHUD* H = Cast<AStridesHUD>(GetHUD());
	const int32 N = H ? H->PhoneItems().Num() : 0;
	if (N <= 0) { PhoneSel = 0; return; }
	PhoneSel = FMath::Clamp(PhoneSel + Delta, 0, N - 1);
}

void AStridesPlayerController::PhonePressSelected()
{
	const AStridesHUD* H = Cast<AStridesHUD>(GetHUD());
	if (H && H->PhoneItems().IsValidIndex(PhoneSel)) PhoneActivate(H->PhoneItems()[PhoneSel].Id);
}

void AStridesPlayerController::PhoneBack()
{
	if (PhoneAcceptAt >= 0) return;
	if (PhoneAppName == TEXT("request")) PhoneShow(TEXT("strides"));
	else if (PhoneAppName == TEXT("home")) ClosePhone();
	else PhoneShow(TEXT("home"));
}

bool AStridesPlayerController::PhoneTapAt(const FVector2D& Px)
{
	const AStridesHUD* H = Cast<AStridesHUD>(GetHUD());
	if (!bPhoneOpen || !H) return false;
	for (int32 I = 0; I < H->PhoneItems().Num(); ++I)
		if (H->PhoneItems()[I].Box.IsInside(Px))
		{
			PhoneSel = I;
			UE_LOG(LogTemp, Display, TEXT("Strides téléphone : touché %s à (%.0f, %.0f)"), *H->PhoneItems()[I].Id, Px.X, Px.Y);
			PhoneActivate(H->PhoneItems()[I].Id);
			return true;
		}
	// Toucher hors du téléphone (phone-layer) : fermeture, comme au web.
	if (!H->PhoneFrame().IsInside(Px)) ClosePhone();
	return false;
}

void AStridesPlayerController::PhoneActivate(const FString& Id)
{
	UStridesProgressionSubsystem* P = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>() : nullptr;
	UE_LOG(LogTemp, Display, TEXT("Strides téléphone : %s (écran %s)"), *Id, *PhoneAppName);
	if (PhoneAcceptAt >= 0) return;  // demande acceptée : le téléphone se range tout seul
	if (Id == TEXT("back")) { PhoneBack(); return; }
	if (Id.StartsWith(TEXT("app:"))) { PhoneShow(Id.Mid(4)); return; }
	if (Id.StartsWith(TEXT("offer:"))) { PhoneReq = Id.Mid(6); PhoneShow(TEXT("request")); return; }
	if (Id == TEXT("refuse") && P)
	{
		P->RefuseMission(PhoneReq, GetWorld()->GetTimeSeconds());
		PhoneToast = P->LastMessage;
		PhoneToastAt = PhoneNow();
		PhoneShow(TEXT("strides"));
		return;
	}
	if (Id == TEXT("accept") && P)
	{
		// requests.js : premier toucher « Confirmer l'acceptation ? » (5 s), second toucher après 350 ms au moins.
		const double Now = PhoneNow();
		if (PhoneArmedAt < 0) { PhoneArmedAt = Now; return; }
		if (Now - PhoneArmedAt < 0.35) return;
		if (!P->ActiveMissionId.IsEmpty())
		{
			PhoneArmedAt = -1;
			PhoneToast = TEXT("Mission en cours · Terminez ou abandonnez votre mission en cours d'abord.");
			PhoneToastAt = Now;
			return;
		}
		// missions.accept : offre verrouillée (palier) ou solde insuffisant : refus expliqué, rien n'est réservé.
		const FString Lock = P->OfferLock(PhoneReq);
		const FStridesMissionDefinition* Req = P->FindMission(PhoneReq);
		if (!Lock.IsEmpty() || (Req && Req->Cost > P->Credits))
		{
			PhoneArmedAt = -1;
			PhoneToast = !Lock.IsEmpty() ? Lock : FString::Printf(TEXT("Solde insuffisant : il faut %d € (solde %d €)."), Req->Cost, P->Credits);
			PhoneToastAt = Now;
			return;
		}
		PhoneAcceptAt = Now;
		PhoneToast = TEXT("Demande acceptée · Les créneaux sont réservés dans votre agenda.");
		PhoneToastAt = Now;
		return;
	}
	if (Id == TEXT("abandon") && P)
	{
		P->AbandonMission();
		if (UStridesSaveSubsystem* S = GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>()) if (S->bAutoSave) S->SaveNow(this);
		PhoneToast = P->LastMessage;
		PhoneToastAt = PhoneNow();
		return;
	}
	// Jalon J4-D : « Règles et départ » d'un défi de l'app Activités (activities-app.js challengeCard → challenge.start) :
	// mission en cours refusée (blocker), arène de Paris non portée ; sinon départ derrière la ligne, à cheval.
	if (Id.StartsWith(TEXT("challenge:")) && P)
	{
		const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
		const strides::ChallengeData* CD = Data ? Data->Challenges() : nullptr;
		const strides::ChallengeConfig* Cfg = CD ? CD->find(TCHAR_TO_UTF8(*Id.Mid(10))) : nullptr;
		AStridesCourse* C = EntryCourse();
		AStridesHorse* H = nullptr;
		for (TActorIterator<AStridesHorse> It(GetWorld()); It; ++It) H = *It;
		const double Now = PhoneNow();
		if (!Cfg || !C || !H) return;
		if (!P->ActiveMissionId.IsEmpty() || C->MissionActive()) { PhoneToast = TEXT("Termine ou abandonne ta mission en cours d’abord."); PhoneToastAt = Now; return; }
		if (Cfg->courseId != "cso") { PhoneToast = TEXT("À venir : l’arène du Grand Prix de Paris n’est pas encore portée."); PhoneToastAt = Now; return; }
		// _enter : 8 m derrière la ligne de départ, dans l'axe ; cavalier en selle.
		const double SX = CD->startX - FMath::Sin(CD->startRot) * 8, SZ = CD->startZ - FMath::Cos(CD->startRot) * 8;
		H->bChallengeReturn = true;
		H->ChallengeReturn = FVector(H->WebX(), H->WebZ(), H->Heading());
		AStridesRider* R = nullptr;
		for (TActorIterator<AStridesRider> It(GetWorld()); It; ++It) R = *It;
		if (R && R->MountedOn) R->Dismount(this);
		H->PlaceAt(SX, SZ, CD->startRot, 0);
		if (R)
		{
			R->SetActorLocation(H->GetActorLocation() - H->GetActorRightVector() * 120.0 + FVector(0, 0, 90));
			R->TryMount(this);
		}
		H->JumpMulOverride = Cfg->horseJump;
		const UStridesSaveSubsystem* Save = GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>();
		if (!C->StartChallenge(*Cfg, Save ? Save->PlayerName : FString(TEXT("Alex")), H->JumpPower()))
		{
			H->JumpMulOverride = -1;
			PhoneToast = TEXT("Défi indisponible.");
			PhoneToastAt = Now;
			return;
		}
		ClosePhone();
		return;
	}
	if (Id.StartsWith(TEXT("itinerary:")) && P)
	{
		// activities-app.js « Itinéraire » : gps.set(a.start, a.name), puis le téléphone se range.
		for (const AStridesActivityPost* Post : Posts())
			if (Post && UTF8_TO_TCHAR(Post->Activity().id.c_str()) == Id.Mid(10))
			{
				P->SetGps(FVector2D(Post->Activity().startX, Post->Activity().startZ), UTF8_TO_TCHAR(Post->Activity().name.c_str()));
				break;
			}
		ClosePhone();
		return;
	}
}

void AStridesPlayerController::PhoneTick()
{
	const double Now = PhoneNow();
	if (PhoneArmedAt >= 0 && Now - PhoneArmedAt > 5.0) PhoneArmedAt = -1;  // confirmation annulée au bout de 5 s
	if (PhoneToastAt >= 0 && Now - PhoneToastAt > 3.0) { PhoneToast.Empty(); PhoneToastAt = -1; }
	// Demande acceptée : 1,3 s plus tard le téléphone se range et la mission démarre (missions.accept → start).
	if (PhoneAcceptAt >= 0 && Now - PhoneAcceptAt >= 1.3)
	{
		PhoneAcceptAt = -1;
		PhoneArmedAt = -1;
		ClosePhone();
		UStridesProgressionSubsystem* P = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>() : nullptr;
		if (P && P->StartMission(PhoneReq))
		{
			// Mission d'histoire acceptée : enregistrée tout de suite (missions.start : saveNow).
			if (UStridesSaveSubsystem* S = GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>()) if (S->bAutoSave) S->SaveNow(this);
			if (AStridesHUD* H = Cast<AStridesHUD>(GetHUD())) H->OnCourseEvent(TEXT("big"), P->LastMessage);
		}
		PhoneShow(TEXT("home"));
	}
}

bool AStridesPlayerController::InputKey(const FInputKeyEventArgs& Params)
{
	// Clic gauche sur le téléphone ouvert (Mac) : élément touché.
	if (bPhoneOpen && !bPausedState && Params.Key == EKeys::LeftMouseButton && Params.Event == IE_Pressed)
	{
		float X = 0, Y = 0;
		if (GetMousePosition(X, Y)) { PhoneTapAt(FVector2D(X, Y)); return true; }
	}
	if (!bPhoneOpen && !bPausedState && Params.Key == EKeys::LeftMouseButton && Params.Event == IE_Pressed)
	{
		float X = 0, Y = 0;
		if (GetMousePosition(X, Y) && CardTapAt(FVector2D(X, Y))) return true;
	}
	return Super::InputKey(Params);
}
void AStridesPlayerController::TogglePhone()
{
	if (bPhoneOpen) ClosePhone();
	else OpenPhone(TEXT("home"));
}

bool AStridesPlayerController::IsTitleOpen() const { return TitleScreen && TitleScreen->IsOpen(); }

void AStridesPlayerController::ShowTitle(bool bHasSave, const FString& Issue)
{
	if (!TitleScreen) TitleScreen = GetLocalPlayer() ? CreateWidget<UStridesTitleScreen>(this, UStridesTitleScreen::StaticClass()) : CreateWidget<UStridesTitleScreen>(GetWorld(), UStridesTitleScreen::StaticClass());
	if (!TitleScreen) return;
	TitleScreen->OnChoice.BindUObject(this, &AStridesPlayerController::OnTitleChoice);
	TitleScreen->Open(bHasSave, Issue);
	if (GetWorld() && GetWorld()->GetGameViewport() && !TitleScreen->IsInViewport()) TitleScreen->AddToViewport(400);
	Cmd.releaseAll();
	Cmd.setEnabled(false);
	UGameplayStatics::SetGamePaused(this, true);
	if (GetLocalPlayer())
	{
		FInputModeUIOnly InputMode;
		InputMode.SetWidgetToFocus(TitleScreen->TakeWidget());
		InputMode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		SetInputMode(InputMode);
		bShowMouseCursor = !PLATFORM_IOS;
		ReleaseMouseForCard();
	}
	SyncTitleHud();
	UE_LOG(LogTemp, Display, TEXT("Strides écran titre : ouvert (%s)"), *FString::Join(TitleScreen->Describe(), TEXT(" ; ")));
}

void AStridesPlayerController::OnTitleChoice(bool bNew, const FString& Name, const FString& Avatar)
{
	UE_LOG(LogTemp, Display, TEXT("Strides écran titre : %s (%s, %s)"), bNew ? TEXT("nouvelle partie") : TEXT("continuer"), *Name, *Avatar);
	if (TitleScreen) TitleScreen->RemoveFromParent();
	SyncTitleHud();
	UGameplayStatics::SetGamePaused(this, false);
	Cmd.setEnabled(true);
	Cmd.releaseAll();
	RestoreInputMode();
	if (AStridesGameMode* GM = GetWorld() ? GetWorld()->GetAuthGameMode<AStridesGameMode>() : nullptr) GM->StartFromTitle(bNew, Name, Avatar);
	else AStridesGameMode::StartGameIn(GetWorld(), bNew, Name, Avatar);  // mondes de test (sans mode de jeu)
}

void AStridesPlayerController::PauseGame()
{
	if (bPausedState) return;  // game.pause : seulement depuis l'état « play »
	bPausedState = true;
	bPauseThisFrame = true;
	Cmd.setEnabled(false);
	if (!PauseMenu)
		PauseMenu = GetLocalPlayer() ? CreateWidget<UStridesPauseMenu>(this, UStridesPauseMenu::StaticClass()) : CreateWidget<UStridesPauseMenu>(GetWorld(), UStridesPauseMenu::StaticClass());
	if (PauseMenu)
	{
		PauseMenu->Open(this);
		if (GetWorld() && GetWorld()->GetGameViewport() && !PauseMenu->IsInViewport()) PauseMenu->AddToViewport(300);
	}
	Cmd.releaseAll();  // screens.card : input.releaseAll()
	UGameplayStatics::SetGamePaused(this, true);
	// Carte cliquable à la souris sur Mac (le web garde toujours le pointeur).
	if (GetLocalPlayer())
	{
		FInputModeGameAndUI InputMode;
		InputMode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		InputMode.SetHideCursorDuringCapture(false);
		SetInputMode(InputMode);
		bShowMouseCursor = !PLATFORM_IOS;
		ReleaseMouseForCard();
	}
}

void AStridesPlayerController::ResumeGame()
{
	if (!bPausedState) return;
	bPausedState = false;
	Cmd.setEnabled(true);
	if (PauseMenu)
	{
		PauseMenu->Close();
		PauseMenu->RemoveFromParent();
	}
	UGameplayStatics::SetGamePaused(this, false);
	if (GetLocalPlayer()) RestoreInputMode();
}

// ---- Enhanced Input : manette, souris, outils du portage ----
void AStridesPlayerController::OnMove(const FInputActionValue& V)
{
	const FVector2D In = V.Get<FVector2D>();
	// Écran titre (jalon J4-A) : stick haut / bas = bouton précédent / suivant (un pas par poussée).
	if (IsTitleOpen())
	{
		const int32 Dir = In.Y > .6 ? -1 : In.Y < -.6 ? 1 : 0;
		if (Dir != 0 && Dir != CardStickDir) TitleScreen->MoveSelection(Dir);
		CardStickDir = Dir;
		return;
	}
	// Carte ouverte (ou carte Pause) : stick gauche poussé à gauche / à droite = bouton précédent / suivant (un pas par poussée).
	const bool bPauseCard = bPausedState && PauseMenu && PauseMenu->IsOpen();
	if ((CardOpen() && !bPausedState) || bPauseCard)
	{
		const int32 Dir = In.X > .6 ? 1 : In.X < -.6 ? -1 : 0;
		if (Dir != 0 && Dir != CardStickDir)
		{
			if (bPauseCard) PauseMenu->MoveSelection(Dir);
			else CardMove(Dir);
		}
		CardStickDir = Dir;
	}
	GamepadMove = In;
}
#if WITH_DEV_AUTOMATION_TESTS
void AStridesPlayerController::GamepadStickForTest(const FVector2D& V)
{
	if (V.IsZero()) OnMoveDone(FInputActionValue(V));
	else OnMove(FInputActionValue(V));
}
#endif
void AStridesPlayerController::OnMoveDone(const FInputActionValue&) { GamepadMove = FVector2D::ZeroVector; CardStickDir = 0; }
void AStridesPlayerController::OnLook(const FInputActionValue& V)
{
	const FVector2D In = V.Get<FVector2D>();
	AddYawInput(In.X);
	AddPitchInput(-In.Y);
}
void AStridesPlayerController::OnJump()
{
	// Écran titre (jalon J4-A) : bouton A de la manette = bouton choisi.
	if (IsTitleOpen()) { TitleScreen->PressSelected(); return; }
	if (AStridesHorse* H = Cast<AStridesHorse>(GetPawn())) H->RequestJump();
}
void AStridesPlayerController::OnInteract()
{
	// Manette (X) et bouton tactile du portage : même action que E / F / Entrée, hors carte et téléphone.
	if (!bPhoneOpen && !CardOpen() && !bPausedState) DoAction();
	// Carte ouverte : bouton principal (choix n° 8), comme Entrée / E / F au clavier.
	else if (!bPhoneOpen && CardOpen() && !bPausedState) CardPress();
	// Carte Pause : bouton choisi (choix n° 9).
	else if (bPausedState && PauseMenu && PauseMenu->IsOpen()) PauseMenu->PressSelected();
}

// ---- Entrée dans l'épreuve (tranche T10) ----
AStridesActivityPost* AStridesPlayerController::ActivityPost() const
{
	// Poteau du Pôle (cso_train) : épreuve et guidage ; le poteau du paddock (cso_warmup, jalon J2c) est vu par Posts().
	if (!PostCache.IsValid() && GetWorld())
		for (TActorIterator<AStridesActivityPost> It(GetWorld()); It; ++It)
			if (!PostCache.IsValid() || It->Activity().id == "cso_train") PostCache = *It;
	return PostCache.Get();
}

TArray<AStridesActivityPost*> AStridesPlayerController::Posts() const
{
	TArray<AStridesActivityPost*> Out;
	if (GetWorld())
		for (TActorIterator<AStridesActivityPost> It(GetWorld()); It; ++It) Out.Add(*It);
	return Out;
}

AStridesCourse* AStridesPlayerController::EntryCourse() const
{
	if (const AStridesActivityPost* P = ActivityPost()) return P->Course;
	return nullptr;
}

bool AStridesPlayerController::CardOpen() const
{
	const AStridesCourse* C = EntryCourse();
	// Jalon J4 (correction) : cartes du Grand Prix de Paris et de l'autoroute A13 (dessinées par AStridesHUD).
	return C && (C->Screen() != AStridesCourse::EScreen::None || C->ActiveCardOpen());
}

bool AStridesPlayerController::CardPress()
{
	if (AStridesCourse* C = EntryCourse(); C && C->ActiveCardOpen()) return C->PressCardSelected();
	return Screens && Screens->PressPrimary();
}

void AStridesPlayerController::CardMove(int32 Dir)
{
	if (AStridesCourse* C = EntryCourse(); C && C->ActiveCardOpen()) { C->MoveCardSelection(Dir); return; }
	if (Screens) Screens->MoveSelection(Dir);
}

bool AStridesPlayerController::CardTapAt(const FVector2D& ViewportPx)
{
	AStridesCourse* C = EntryCourse();
	const AStridesHUD* H = Cast<AStridesHUD>(GetHUD());
	if (!C || !H || !C->ActiveCardOpen()) return false;
	// Bouton touché ; ailleurs sur la carte : rien (le bouton HTML du web se touche lui-même).
	const FString Id = H->CardButtonAt(ViewportPx);
	return !Id.IsEmpty() && C->PressCard(Id);
}

bool AStridesPlayerController::DialogOpen() const
{
	const AStridesCourse* C = EntryCourse();
	return C && C->DialogOpen();
}

FString AStridesPlayerController::ActionLabel() const
{
	// Jalon J2c : « Terminer » de l'entraînement (priorité 2, à cheval comme à pied, rayon illimité).
	if (const AStridesCourse* C = EntryCourse(); C && C->TrainingEndAvailable()) return C->TrainingEndLabel();
	if (const AStridesCourse* C = EntryCourse(); C && C->ParisInteractAvailable()) return TEXT("Accréditation");
	// Jalon J3b : véhicules (player.js interactions « vehicle-in », « truck-out »).
	if (const AStridesVehicle* V = Cast<AStridesVehicle>(GetPawn())) return V->CanExit() ? FString(TEXT("Descendre")) : FString();
	if (const AStridesRider* R = Cast<AStridesRider>(GetPawn()); R && !R->MountedOn && !R->HorseInReach() && NearVehicle()) return TEXT("Monter");
	const AStridesHorse* H = Cast<AStridesHorse>(GetPawn());
	if (!H) return FString();
	double X, Y, Z;
	StridesUnits::UEToWeb(H->GetActorLocation(), X, Y, Z);
	for (const AStridesActivityPost* P : Posts())
		if (P && P->Available(X, Z, TEXT("ride"))) return P->Label();
	return FString();
}

bool AStridesPlayerController::DoAction()
{
	// hud.advanceDialog() d'abord (dialogue de l'entraîneur), sinon interact.trigger().
	UStridesCsoAudio* Audio = GetWorld() ? GetWorld()->GetSubsystem<UStridesCsoAudio>() : nullptr;
	if (AStridesCourse* C = EntryCourse(); C && C->AdvanceDialog())
	{
		// hud.advanceDialog : réplique passée → click() (hud.js:570).
		if (Audio) Audio->Call(strides::csoClickCall(), "ui/hud.js");
		return true;
	}
	// Jalon J4 (correction) : « Accréditation » du Grand Prix de Paris (priorité 3 : l'emporte sur monter / descendre).
	if (AStridesCourse* C = EntryCourse(); C && C->PressParisInteract())
	{
		if (Audio) Audio->Click();
		return true;
	}
	// Jalon J2c : « Terminer » l'entraînement (interact train:end, priorité 2 : l'emporte sur le poteau et la descente).
	if (AStridesCourse* C = EntryCourse(); C && C->PressTrainingEnd())
	{
		if (Audio) Audio->Click();
		return true;
	}
	// Action du poteau « Chrono » (priorité 1) : à cheval, point suivi = le cheval, sans mission en cours.
	if (AStridesHorse* H = Cast<AStridesHorse>(GetPawn()))
		for (AStridesActivityPost* P : Posts())
		{
			if (!P) continue;
			double X, Y, Z;
			StridesUnits::UEToWeb(H->GetActorLocation(), X, Y, Z);
			const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
			const FStridesHorseProfile* Pr = Data ? Data->FindHorse(H->ProfileId) : nullptr;
			if (P->Trigger(X, Z, TEXT("ride"), P->PlayerName, Pr ? Pr->Name : FString(), H->JumpPower(), 0.0))
			{
				if (Audio) Audio->Click();  // interact.trigger : it.action() puis click() (interact.js:50-52)
				return true;
			}
		}
	// Jalon J3b : au volant, « Descendre » (truck-out : vitesse < 1,5 m/s, sinon aucune action).
	if (AStridesVehicle* V = Cast<AStridesVehicle>(GetPawn()))
	{
		const bool bOut = V->Exit(this);
		if (Audio && bOut) Audio->Click();
		return true;
	}
	// Action du portage (priorité 0 au web pour descendre) : monter, descendre.
	if (AStridesRider* R = Rider())
	{
		// interact.trigger : click() seulement si une action était proposée (monter près d'un cheval, descendre).
		// « Descendre » n'est proposé que si le cheval va à moins de 2,5 m/s et hors saut (player.js:225, when de
		// l'interaction dismount) : sinon aucune action, donc ni descente ni click. Dismount lui-même reste inconditionnel
		// hors saut (descente forcée du chargement, comme player.dismount(true) du web).
		bool bDone = true;
		if (const AStridesHorse* M = R->MountedOn)
		{
			bDone = M->SpeedMS < 2.5f && !M->IsJumping();
			if (bDone) R->Dismount(this);
		}
		else
		{
			// À pied : « Monter » à cheval (priorité 2, 3,2 m) l'emporte sur « Monter » au volant (priorité 1,4, portière à
			// 2,6 m), comme le score priorité × 100 − distance d'interact.js.
			bDone = R->TryMount(this);
			if (!bDone)
				if (AStridesVehicle* V = NearVehicle()) bDone = V->Enter(this, R);
		}
		if (Audio && bDone) Audio->Click();
		return true;
	}
	return false;
}
// Allures du portage (Maj / Ctrl) : sans effet en épreuve (le web n'a pas d'allure en concours ; Ctrl gauche y réduit
// l'amplitude du clavier).
void AStridesPlayerController::OnGaitUp() { if (AStridesHorse* H = Cast<AStridesHorse>(GetPawn()); H && !InRace()) H->ChangeGait(1); }
void AStridesPlayerController::OnGaitDown() { if (AStridesHorse* H = Cast<AStridesHorse>(GetPawn()); H && !InRace()) H->ChangeGait(-1); }
void AStridesPlayerController::OnSave() { if (UStridesSaveSubsystem* S = GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>()) S->SaveNow(this); }
void AStridesPlayerController::OnLoad() { if (UStridesSaveSubsystem* S = GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>()) S->LoadNow(this); }
void AStridesPlayerController::OnDemoCourse() { if (AStridesHorse* H = Cast<AStridesHorse>(GetPawn())) H->ToggleDemoCourse(); }
void AStridesPlayerController::OnPhone() { TogglePhone(); }
// Bouton Menu de la manette : exactement la touche Échap du clavier (ouvre la pause, la referme, ferme le téléphone).
void AStridesPlayerController::OnGamepadPause()
{
	FeedKey(TEXT("Escape"), true, false);
	FeedKey(TEXT("Escape"), false, false);
}
TArray<FString> AStridesPlayerController::GamepadMappingsForTest() const
{
	TArray<FString> L;
	if (Context)
		for (const FEnhancedActionKeyMapping& M : Context->GetMappings())
			if (M.Key.IsGamepadKey() && M.Action) L.Add(M.Key.GetFName().ToString() + TEXT("=") + M.Action->GetName());
	return L;
}
void AStridesPlayerController::SetupInputForTest()
{
	if (!InputComponent) InputComponent = NewObject<UEnhancedInputComponent>(this, TEXT("StridesTestInput"));
	SetupInputComponent();
}
void AStridesPlayerController::OnMission()
{
	if (UStridesProgressionSubsystem* P = GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>()) P->StartNextMission();
}

void AStridesPlayerController::TouchJump() { OnJump(); }
void AStridesPlayerController::TouchInteract() { OnInteract(); }
void AStridesPlayerController::TouchGaitUp() { OnGaitUp(); }
void AStridesPlayerController::TouchGaitDown() { OnGaitDown(); }
void AStridesPlayerController::TouchSave() { OnSave(); }
void AStridesPlayerController::TouchLoad() { OnLoad(); }
void AStridesPlayerController::TouchPhone() { TogglePhone(); }
void AStridesPlayerController::TouchMission() { OnMission(); }
