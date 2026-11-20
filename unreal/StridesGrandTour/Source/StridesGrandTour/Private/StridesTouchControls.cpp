#include "StridesTouchControls.h"

#include "Components/Button.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/TextBlock.h"
#include "StridesPlayerController.h"
#include "StridesCourse.h"
#include "Blueprint/WidgetTree.h"
#include "EngineUtils.h"

namespace
{
UButton* AddTouchButton(UWidgetTree* Tree, UCanvasPanel* Canvas, const TCHAR* Name, const TCHAR* Caption,
	const FAnchors& Anchors, const FVector2D& Position, const FVector2D& Size, const FVector2D& Alignment)
{
	UButton* Button = Tree->ConstructWidget<UButton>(UButton::StaticClass(), Name);
	Button->SetBackgroundColor(FLinearColor(0.04f, 0.05f, 0.06f, 0.82f));
	UTextBlock* Label = Tree->ConstructWidget<UTextBlock>();
	Label->SetText(FText::FromString(Caption));
	Label->SetColorAndOpacity(FSlateColor(FLinearColor::White));
	Label->SetJustification(ETextJustify::Center);
	Button->AddChild(Label);
	UCanvasPanelSlot* Slot = Canvas->AddChildToCanvas(Button);
	Slot->SetAnchors(Anchors);
	Slot->SetAlignment(Alignment);
	Slot->SetPosition(Position);
	Slot->SetSize(Size);
	return Button;
}
}

void UStridesTouchControls::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	Controller = Cast<AStridesPlayerController>(GetOwningPlayer());
	if (!Controller) return;
	Build();
}

void UStridesTouchControls::Build()
{
	if (!WidgetTree || Buttons.Num()) return;
	UCanvasPanel* Canvas = WidgetTree->ConstructWidget<UCanvasPanel>(UCanvasPanel::StaticClass(), TEXT("TouchCanvas"));
	WidgetTree->RootWidget = Canvas;
	const FAnchors BottomRight(1.f, 1.f);
	const FAnchors TopRight(1.f, 0.f);
	const FVector2D AlignRight(1.f, 1.f);

	UButton* JumpButton = AddTouchButton(WidgetTree, Canvas, TEXT("Jump"), TEXT("SAUT"), BottomRight, FVector2D(-32, -132), FVector2D(150, 92), AlignRight);
	UButton* InteractButton = AddTouchButton(WidgetTree, Canvas, TEXT("Interact"), TEXT("MONTER"), BottomRight, FVector2D(-198, -132), FVector2D(142, 72), AlignRight);
	UButton* GaitUpButton = AddTouchButton(WidgetTree, Canvas, TEXT("GaitUp"), TEXT("ALLURE +"), BottomRight, FVector2D(-32, -242), FVector2D(150, 68), AlignRight);
	UButton* GaitDownButton = AddTouchButton(WidgetTree, Canvas, TEXT("GaitDown"), TEXT("ALLURE -"), BottomRight, FVector2D(-198, -242), FVector2D(142, 68), AlignRight);
	UButton* SaveButton = AddTouchButton(WidgetTree, Canvas, TEXT("Save"), TEXT("SAUVER"), TopRight, FVector2D(-32, 32), FVector2D(124, 54), FVector2D(1.f, 0.f));
	UButton* LoadButton = AddTouchButton(WidgetTree, Canvas, TEXT("Load"), TEXT("CHARGER"), TopRight, FVector2D(-168, 32), FVector2D(124, 54), FVector2D(1.f, 0.f));
	UButton* PhoneButton = AddTouchButton(WidgetTree, Canvas, TEXT("Phone"), TEXT("TÉLÉPHONE"), FAnchors(.5f, 1.f), FVector2D(-82, -32), FVector2D(164, 58), FVector2D(.5f, 1.f));
	UButton* MissionButton = AddTouchButton(WidgetTree, Canvas, TEXT("Mission"), TEXT("MISSION"), FAnchors(.5f, 1.f), FVector2D(-82, -102), FVector2D(164, 58), FVector2D(.5f, 1.f));

	Buttons = {JumpButton, InteractButton, GaitUpButton, GaitDownButton, SaveButton, LoadButton, PhoneButton, MissionButton};
	JumpButton->OnClicked.AddDynamic(this, &UStridesTouchControls::Jump);
	InteractButton->OnClicked.AddDynamic(this, &UStridesTouchControls::Interact);
	GaitUpButton->OnClicked.AddDynamic(this, &UStridesTouchControls::GaitUp);
	GaitDownButton->OnClicked.AddDynamic(this, &UStridesTouchControls::GaitDown);
	SaveButton->OnClicked.AddDynamic(this, &UStridesTouchControls::Save);
	LoadButton->OnClicked.AddDynamic(this, &UStridesTouchControls::Load);
	PhoneButton->OnClicked.AddDynamic(this, &UStridesTouchControls::Phone);
	MissionButton->OnClicked.AddDynamic(this, &UStridesTouchControls::Mission);
}

void UStridesTouchControls::Jump() { if (Controller) Controller->TouchJump(); }
void UStridesTouchControls::Interact() { if (Controller) Controller->TouchInteract(); }
void UStridesTouchControls::GaitUp() { if (Controller) Controller->TouchGaitUp(); }
void UStridesTouchControls::GaitDown() { if (Controller) Controller->TouchGaitDown(); }
void UStridesTouchControls::Save() { if (Controller) Controller->TouchSave(); }
void UStridesTouchControls::Load() { if (Controller) Controller->TouchLoad(); }
void UStridesTouchControls::Phone() { if (Controller) Controller->TouchPhone(); }
void UStridesTouchControls::Mission() { if (Controller) Controller->TouchMission(); }

bool UStridesTouchControls::ButtonVisible(const FString& Name, const strides::CsoHud* RaceHud)
{
	if (!RaceHud) return true;
	using E = strides::CsoHudElement;
	if (Name == TEXT("Jump")) return !RaceHud->masked(E::Jump);
	if (Name == TEXT("Interact")) return !RaceHud->masked(E::Action);  // action contextuelle (monter, descendre)
	if (Name == TEXT("GaitUp") || Name == TEXT("GaitDown")) return !RaceHud->masked(E::Boost);  // allure (BOOST au web)
	if (Name == TEXT("Phone")) return !RaceHud->masked(E::PhoneButton);
	return !RaceHud->csoCtl();  // SAUVER, CHARGER, MISSION : outils du portage, sans équivalent au web
}

TArray<FString> UStridesTouchControls::VisibleButtons() const
{
	TArray<FString> L;
	for (const UButton* B : Buttons)
		if (B && B->GetVisibility() != ESlateVisibility::Collapsed) L.Add(B->GetName());
	return L;
}

void UStridesTouchControls::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	Sync();
}

void UStridesTouchControls::Sync()
{
	// Sans joueur propriétaire (tests), NativeOnInitialized n'est pas appelé : boutons construits ici.
	Build();
	if (!Course.IsValid() && GetWorld())
		for (TActorIterator<AStridesCourse> It(GetWorld()); It; ++It)
			if (It->Run()) { Course = *It; break; }
	const strides::CsoHud* H = Course.IsValid() && Course->Run() ? &Course->HudModel() : nullptr;
	for (UButton* B : Buttons)
		if (B) B->SetVisibility(ButtonVisible(B->GetName(), H) ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
}
