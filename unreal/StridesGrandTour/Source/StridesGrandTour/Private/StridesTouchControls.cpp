#include "StridesTouchControls.h"

#include "Components/Button.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/TextBlock.h"
#include "StridesPlayerController.h"
#include "Blueprint/WidgetTree.h"

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
	if (!Controller || !WidgetTree) return;

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

	JumpButton->OnClicked.AddDynamic(this, &UStridesTouchControls::Jump);
	InteractButton->OnClicked.AddDynamic(this, &UStridesTouchControls::Interact);
	GaitUpButton->OnClicked.AddDynamic(this, &UStridesTouchControls::GaitUp);
	GaitDownButton->OnClicked.AddDynamic(this, &UStridesTouchControls::GaitDown);
	SaveButton->OnClicked.AddDynamic(this, &UStridesTouchControls::Save);
	LoadButton->OnClicked.AddDynamic(this, &UStridesTouchControls::Load);
}

void UStridesTouchControls::Jump() { if (Controller) Controller->TouchJump(); }
void UStridesTouchControls::Interact() { if (Controller) Controller->TouchInteract(); }
void UStridesTouchControls::GaitUp() { if (Controller) Controller->TouchGaitUp(); }
void UStridesTouchControls::GaitDown() { if (Controller) Controller->TouchGaitDown(); }
void UStridesTouchControls::Save() { if (Controller) Controller->TouchSave(); }
void UStridesTouchControls::Load() { if (Controller) Controller->TouchLoad(); }
