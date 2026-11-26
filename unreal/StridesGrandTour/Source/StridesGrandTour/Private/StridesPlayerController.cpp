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
#include "StridesActivityPost.h"
#include "StridesCsoScreens.h"
#include "StridesDataSubsystem.h"
#include "StridesUnits.h"

namespace
{
UInputAction* MakeAction(UObject* Outer, const TCHAR* Name, EInputActionValueType Type)
{
	UInputAction* A = NewObject<UInputAction>(Outer, Name);
	A->ValueType = Type;
	return A;
}

// Préprocesseur Slate : chaque touche enfoncée ou relâchée (répétition automatique comprise) est versée aux commandes
// du web (window keydown / keyup) ; l'événement continue vers Enhanced Input et les widgets.
class FStridesKeyProcessor : public IInputProcessor
{
public:
	explicit FStridesKeyProcessor(AStridesPlayerController* InPC) : PC(InPC) {}
	virtual void Tick(const float, FSlateApplication&, TSharedRef<ICursor>) override {}
	virtual bool HandleKeyDownEvent(FSlateApplication&, const FKeyEvent& E) override { Feed(E, true); return false; }
	virtual bool HandleKeyUpEvent(FSlateApplication&, const FKeyEvent& E) override { Feed(E, false); return false; }
	virtual const TCHAR* GetDebugName() const override { return TEXT("StridesKeys"); }
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
	GaitUpAction = MakeAction(this, TEXT("GaitUp"), EInputActionValueType::Boolean);
	GaitDownAction = MakeAction(this, TEXT("GaitDown"), EInputActionValueType::Boolean);
	SaveAction = MakeAction(this, TEXT("Save"), EInputActionValueType::Boolean);
	LoadAction = MakeAction(this, TEXT("Load"), EInputActionValueType::Boolean);
	DemoCourseAction = MakeAction(this, TEXT("DemoCourse"), EInputActionValueType::Boolean);
	PhoneAction = MakeAction(this, TEXT("Phone"), EInputActionValueType::Boolean);
	MissionAction = MakeAction(this, TEXT("Mission"), EInputActionValueType::Boolean);
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
	Context->MapKey(PhoneAction, EKeys::Gamepad_Special_Right);
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
	// Carte ouverte : gauche / droite choisissent le bouton (choix n° 8) ; la touche ne va pas au cheval (gel des commandes).
	if (bDown && !bRepeat && Screens && CardOpen() && !bPausedState)
	{
		if (Code == TEXT("ArrowLeft") || Code == TEXT("KeyA") || Code == TEXT("KeyQ")) { Screens->MoveSelection(-1); return; }
		if (Code == TEXT("ArrowRight") || Code == TEXT("KeyD")) { Screens->MoveSelection(1); return; }
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
	case ETouchType::Began: Name = TEXT("Began"); FeedPointerDown(Id, false, Css); break;
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

void AStridesPlayerController::PlayerTick(float DeltaTime)
{
	Super::PlayerTick(DeltaTime);
	StepCommands(DeltaTime);
}

// game.update (src/game.js:1438-1490) côté commandes : input.poll, boutons globaux, gel des commandes, cheval, puis
// input.endFrame. En pause, update() n'est pas appelée : rien n'est lu (un Échap tapé en pause reste dans pressed et
// reprend effet à la reprise, comme dans le web).
void AStridesPlayerController::StepCommands(float)
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
			// Souris rendue au système (contrôle J1 : en plein écran, clics sans effet sur le bilan ouvert en épreuve, la souris
			// restant capturée par la vue) : capture et verrou relâchés, pointeur Slate remis à zéro.
			if (UGameViewportClient* VC = GetLocalPlayer()->ViewportClient)
			{
				VC->SetMouseCaptureMode(EMouseCaptureMode::NoCapture);
				if (FViewport* Vp = VC->Viewport) { Vp->CaptureMouse(false); Vp->LockMouseToViewport(false); }
			}
			if (FSlateApplication::IsInitialized()) FSlateApplication::Get().ReleaseAllPointerCapture();
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
	else if (bOverlay && !bPhoneOpen && Cmd.wasPressed("action") && Screens) Screens->PressPrimary();
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
	}
	else if (P)
	{
		// À pied : déplacement relatif à la caméra (le cavalier du portage, pas le marcheur du web).
		FVector2D M(Cmd.move.x, Cmd.move.y);
		if (M.IsZero() && bCanAct) M = GamepadMove;
		if (!M.IsZero())
		{
			const FRotator Yaw(0, GetControlRotation().Yaw, 0);
			P->AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::X), M.Y);
			P->AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y), M.X);
		}
	}
	// Regard au doigt (glisser hors du joystick, camera.js:79-81 : 0,0062 rad par px en lacet, 0,0045 en tangage) sur la
	// perche du monde ouvert ; sans effet sur la caméra de concours.
	if (Cmd.look.dx != 0 || Cmd.look.dy != 0)
	{
		AddYawInput((float)FMath::RadiansToDegrees(Cmd.look.dx * 0.0062));
		AddPitchInput((float)FMath::RadiansToDegrees(Cmd.look.dy * 0.0045));
	}
	Cmd.endFrame();
}

// ---- Téléphone et pause ----
void AStridesPlayerController::OpenPhone(const FString& App)
{
	PhoneAppName = App;
	bPhoneOpen = true;
	Cmd.setEnabled(false);
}
void AStridesPlayerController::ClosePhone()
{
	if (!bPhoneOpen) return;
	bPhoneOpen = false;
	Cmd.setEnabled(true);
}
void AStridesPlayerController::TogglePhone()
{
	if (bPhoneOpen) ClosePhone();
	else OpenPhone(TEXT("home"));
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
	// Carte ouverte : stick gauche poussé à gauche / à droite = bouton précédent / suivant (un pas par poussée).
	if (Screens && CardOpen() && !bPausedState)
	{
		const int32 Dir = In.X > .6 ? 1 : In.X < -.6 ? -1 : 0;
		if (Dir != 0 && Dir != CardStickDir) Screens->MoveSelection(Dir);
		CardStickDir = Dir;
	}
	GamepadMove = In;
}
void AStridesPlayerController::OnMoveDone(const FInputActionValue&) { GamepadMove = FVector2D::ZeroVector; CardStickDir = 0; }
void AStridesPlayerController::OnLook(const FInputActionValue& V)
{
	const FVector2D In = V.Get<FVector2D>();
	AddYawInput(In.X);
	AddPitchInput(-In.Y);
}
void AStridesPlayerController::OnJump()
{
	if (AStridesHorse* H = Cast<AStridesHorse>(GetPawn())) H->RequestJump();
}
void AStridesPlayerController::OnInteract()
{
	// Manette (X) et bouton tactile du portage : même action que E / F / Entrée, hors carte et téléphone.
	if (!bPhoneOpen && !CardOpen() && !bPausedState) DoAction();
	// Carte ouverte : bouton principal (choix n° 8), comme Entrée / E / F au clavier.
	else if (!bPhoneOpen && CardOpen() && !bPausedState && Screens) Screens->PressPrimary();
}

// ---- Entrée dans l'épreuve (tranche T10) ----
AStridesActivityPost* AStridesPlayerController::ActivityPost() const
{
	if (!PostCache.IsValid() && GetWorld())
		if (TActorIterator<AStridesActivityPost> It(GetWorld()); It) PostCache = *It;
	return PostCache.Get();
}

AStridesCourse* AStridesPlayerController::EntryCourse() const
{
	if (const AStridesActivityPost* P = ActivityPost()) return P->Course;
	return nullptr;
}

bool AStridesPlayerController::CardOpen() const
{
	const AStridesCourse* C = EntryCourse();
	return C && C->Screen() != AStridesCourse::EScreen::None;
}

bool AStridesPlayerController::DialogOpen() const
{
	const AStridesCourse* C = EntryCourse();
	return C && C->DialogOpen();
}

FString AStridesPlayerController::ActionLabel() const
{
	const AStridesActivityPost* P = ActivityPost();
	const AStridesHorse* H = Cast<AStridesHorse>(GetPawn());
	if (!P || !H) return FString();
	double X, Y, Z;
	StridesUnits::UEToWeb(H->GetActorLocation(), X, Y, Z);
	return P->Available(X, Z, TEXT("ride")) ? P->Label() : FString();
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
	// Action du poteau « Chrono » (priorité 1) : à cheval, point suivi = le cheval, sans mission en cours.
	if (AStridesHorse* H = Cast<AStridesHorse>(GetPawn()))
		if (AStridesActivityPost* P = ActivityPost())
		{
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
		else bDone = R->TryMount(this);
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
