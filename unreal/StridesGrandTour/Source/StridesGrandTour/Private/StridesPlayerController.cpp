#include "StridesPlayerController.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "EngineUtils.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "StridesHorse.h"
#include "StridesRider.h"
#include "StridesSaveSubsystem.h"
#include "StridesTouchControls.h"

static UInputAction* MakeAction(UObject* Outer, const TCHAR* Name, EInputActionValueType Type)
{
	UInputAction* A = NewObject<UInputAction>(Outer, Name);
	A->ValueType = Type;
	return A;
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
	// Clavier ZQSD/WASD et flèches, manette (stick gauche / droit, A, X), tactile : joystick virtuel (axes de manette).
	auto Axis = [this](const FKey& K, bool SwizzleY, bool Negate)
	{
		FEnhancedActionKeyMapping& M = Context->MapKey(MoveAction, K);
		if (SwizzleY) M.Modifiers.Add(NewObject<UInputModifierSwizzleAxis>(this));
		if (Negate) M.Modifiers.Add(NewObject<UInputModifierNegate>(this));
	};
	Axis(EKeys::W, true, false); Axis(EKeys::Z, true, false); Axis(EKeys::Up, true, false);
	Axis(EKeys::S, true, true); Axis(EKeys::Down, true, true);
	Axis(EKeys::D, false, false); Axis(EKeys::Right, false, false);
	Axis(EKeys::A, false, true); Axis(EKeys::Q, false, true); Axis(EKeys::Left, false, true);
	Context->MapKey(MoveAction, EKeys::Gamepad_Left2D);
	Context->MapKey(LookAction, EKeys::Mouse2D);
	Context->MapKey(LookAction, EKeys::Gamepad_Right2D);
	Context->MapKey(JumpAction, EKeys::SpaceBar);
	Context->MapKey(JumpAction, EKeys::Gamepad_FaceButton_Bottom);
	Context->MapKey(InteractAction, EKeys::E);
	Context->MapKey(InteractAction, EKeys::Gamepad_FaceButton_Left);
	Context->MapKey(GaitUpAction, EKeys::LeftShift);
	Context->MapKey(GaitDownAction, EKeys::LeftControl);
	Context->MapKey(SaveAction, EKeys::F5);
	Context->MapKey(LoadAction, EKeys::F9);
	Context->MapKey(DemoCourseAction, EKeys::F8);
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
	}
	InstallInputContext();
}

void AStridesPlayerController::BeginPlay()
{
	Super::BeginPlay();
	InstallInputContext();
	if (PLATFORM_IOS || FParse::Param(FCommandLine::Get(), TEXT("TouchControls")))
	{
		bEnableTouchEvents = true;
		TouchControls = CreateWidget<UStridesTouchControls>(this, UStridesTouchControls::StaticClass());
		if (TouchControls) TouchControls->AddToViewport(100);
		FInputModeGameAndUI InputMode;
		InputMode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		InputMode.SetHideCursorDuringCapture(false);
		SetInputMode(InputMode);
		if (!PLATFORM_IOS) bShowMouseCursor = true;
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

void AStridesPlayerController::OnMove(const FInputActionValue& V)
{
	const FVector2D In = V.Get<FVector2D>();
	if (AStridesHorse* H = Cast<AStridesHorse>(GetPawn())) { H->SetMoveInput(In); return; }
	if (APawn* P = GetPawn())
	{
		const FRotator Yaw(0, GetControlRotation().Yaw, 0);
		P->AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::X), In.Y);
		P->AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y), In.X);
	}
}
void AStridesPlayerController::OnMoveDone(const FInputActionValue&)
{
	if (AStridesHorse* H = Cast<AStridesHorse>(GetPawn())) H->SetMoveInput(FVector2D::ZeroVector);
}
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
	if (AStridesRider* R = Rider())
	{
		if (R->MountedOn) R->Dismount(this);
		else R->TryMount(this);
	}
}
void AStridesPlayerController::OnGaitUp() { if (AStridesHorse* H = Cast<AStridesHorse>(GetPawn())) H->ChangeGait(1); }
void AStridesPlayerController::OnGaitDown() { if (AStridesHorse* H = Cast<AStridesHorse>(GetPawn())) H->ChangeGait(-1); }
void AStridesPlayerController::OnSave() { if (UStridesSaveSubsystem* S = GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>()) S->SaveNow(this); }
void AStridesPlayerController::OnLoad() { if (UStridesSaveSubsystem* S = GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>()) S->LoadNow(this); }
void AStridesPlayerController::OnDemoCourse() { if (AStridesHorse* H = Cast<AStridesHorse>(GetPawn())) H->ToggleDemoCourse(); }

void AStridesPlayerController::TouchJump() { OnJump(); }
void AStridesPlayerController::TouchInteract() { OnInteract(); }
void AStridesPlayerController::TouchGaitUp() { OnGaitUp(); }
void AStridesPlayerController::TouchGaitDown() { OnGaitDown(); }
void AStridesPlayerController::TouchSave() { OnSave(); }
void AStridesPlayerController::TouchLoad() { OnLoad(); }
