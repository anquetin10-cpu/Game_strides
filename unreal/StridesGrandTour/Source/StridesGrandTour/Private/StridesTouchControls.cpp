#include "StridesTouchControls.h"

#include "Blueprint/WidgetLayoutLibrary.h"
#include "Blueprint/WidgetTree.h"
#include "Components/Border.h"
#include "Components/Button.h"
#include "Components/ButtonSlot.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/Image.h"
#include "Components/ScaleBox.h"
#include "Components/SizeBox.h"
#include "Components/TextBlock.h"
#include "EngineUtils.h"
#include "StridesCourse.h"
#include "StridesCss.h"
#include "StridesCsoHud.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesPlayerController.h"

namespace
{
namespace Sc = StridesCss;

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

// Bouton rond ou arrondi du HUD du web : même pinceau dans tous les états (l'état enfoncé .down n'est pas porté),
// contenu posé sur un canevas à la taille du bouton.
UCanvasPanel* StyleButton(UWidgetTree* Tree, UButton* B, const FSlateBrush& Brush)
{
	FButtonStyle St;
	St.SetNormal(Brush);
	St.SetHovered(Brush);
	St.SetPressed(Brush);
	St.SetDisabled(Brush);
	St.SetNormalPadding(FMargin(0));
	St.SetPressedPadding(FMargin(0));
	B->SetStyle(St);
	B->SetBackgroundColor(FLinearColor::White);
	B->SetClickMethod(EButtonClickMethod::DownAndUp);
	B->SetTouchMethod(EButtonTouchMethod::DownAndUp);
	B->SetPressMethod(EButtonPressMethod::DownAndUp);
	UCanvasPanel* C = Tree->ConstructWidget<UCanvasPanel>();
	C->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
	if (UButtonSlot* S = Cast<UButtonSlot>(B->SetContent(C)))
	{
		S->SetHorizontalAlignment(HAlign_Fill);
		S->SetVerticalAlignment(VAlign_Fill);
		S->SetPadding(FMargin(0));
	}
	return C;
}

void Place(UWidget* W, const FVector4& Box)
{
	if (UCanvasPanelSlot* S = Cast<UCanvasPanelSlot>(W ? W->Slot : nullptr))
	{
		S->SetAnchors(FAnchors(0, 0));
		S->SetAlignment(FVector2D::ZeroVector);
		S->SetPosition(FVector2D(Box.X, Box.Y));
		S->SetSize(FVector2D(Box.Z, Box.W));
	}
}

// Boîte d'un enfant relevée dans le navigateur, relative à celle de son bouton.
FVector4 Inner(const Sc::FJ& Child, const Sc::FJ& Parent)
{
	const FVector4 C = Sc::Rect(Child), P = Sc::Rect(Parent);
	return FVector4(C.X - P.X, C.Y - P.Y, C.Z, C.W);
}
}  // namespace

void UStridesTouchControls::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	Controller = Cast<AStridesPlayerController>(GetOwningPlayer());
	Build();
}

bool UStridesTouchControls::IsTouchMode() const { return bTouchSet ? bTouch : AStridesPlayerController::TouchMode(); }

const strides::CsoInput* UStridesTouchControls::Commands() const
{
	if (TestCommands) return TestCommands;
	return Controller ? &Controller->Commands() : nullptr;
}

bool UStridesTouchControls::Riding() const
{
	if (TestCommands) return bTestRiding;
	return Controller && Cast<AStridesHorse>(Controller->GetPawn()) != nullptr;
}

FVector2D UStridesTouchControls::ViewCss() const
{
	if (!TestView.IsZero()) return TestView;
	const FVector2D Px = UWidgetLayoutLibrary::GetViewportSize(const_cast<UStridesTouchControls*>(this));
	return Px.X > 0 ? Px / UStridesCsoHud::PixelRatio() : FVector2D(844, 390);
}

void UStridesTouchControls::Build()
{
	if (!WidgetTree || Buttons.Num()) return;
	UCanvasPanel* Canvas = WidgetTree->ConstructWidget<UCanvasPanel>(UCanvasPanel::StaticClass(), TEXT("TouchCanvas"));
	Canvas->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
	WidgetTree->RootWidget = Canvas;
	const FAnchors BottomRight(1.f, 1.f);
	const FVector2D AlignRight(1.f, 1.f);

	// Boutons du portage (mode tactile, hors épreuve).
	UButton* InteractButton = AddTouchButton(WidgetTree, Canvas, TEXT("Interact"), TEXT("MONTER"), BottomRight, FVector2D(-198, -132), FVector2D(142, 72), AlignRight);
	UButton* GaitUpButton = AddTouchButton(WidgetTree, Canvas, TEXT("GaitUp"), TEXT("ALLURE +"), BottomRight, FVector2D(-32, -242), FVector2D(150, 68), AlignRight);
	UButton* GaitDownButton = AddTouchButton(WidgetTree, Canvas, TEXT("GaitDown"), TEXT("ALLURE -"), BottomRight, FVector2D(-198, -242), FVector2D(142, 68), AlignRight);
	// SAUVER et CHARGER en haut au centre : le coin haut droit est celui du bouton pause du web.
	UButton* SaveButton = AddTouchButton(WidgetTree, Canvas, TEXT("Save"), TEXT("SAUVER"), FAnchors(.5f, 0.f), FVector2D(6, 32), FVector2D(124, 54), FVector2D(0.f, 0.f));
	UButton* LoadButton = AddTouchButton(WidgetTree, Canvas, TEXT("Load"), TEXT("CHARGER"), FAnchors(.5f, 0.f), FVector2D(-6, 32), FVector2D(124, 54), FVector2D(1.f, 0.f));
	UButton* PhoneButton = AddTouchButton(WidgetTree, Canvas, TEXT("Phone"), TEXT("TÉLÉPHONE"), FAnchors(.5f, 1.f), FVector2D(-82, -32), FVector2D(164, 58), FVector2D(.5f, 1.f));
	UButton* MissionButton = AddTouchButton(WidgetTree, Canvas, TEXT("Mission"), TEXT("MISSION"), FAnchors(.5f, 1.f), FVector2D(-82, -102), FVector2D(164, 58), FVector2D(.5f, 1.f));
	InteractButton->OnClicked.AddDynamic(this, &UStridesTouchControls::Interact);
	GaitUpButton->OnClicked.AddDynamic(this, &UStridesTouchControls::GaitUp);
	GaitDownButton->OnClicked.AddDynamic(this, &UStridesTouchControls::GaitDown);
	SaveButton->OnClicked.AddDynamic(this, &UStridesTouchControls::Save);
	LoadButton->OnClicked.AddDynamic(this, &UStridesTouchControls::Load);
	PhoneButton->OnClicked.AddDynamic(this, &UStridesTouchControls::Phone);
	MissionButton->OnClicked.AddDynamic(this, &UStridesTouchControls::Mission);

	// Calque en px CSS (tranche T8) : joystick, SAUT, pause.
	Scale = WidgetTree->ConstructWidget<UScaleBox>();
	Scale->SetStretch(EStretch::UserSpecified);
	Scale->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
	UCanvasPanelSlot* S0 = Canvas->AddChildToCanvas(Scale);
	S0->SetAnchors(FAnchors(0, 0));
	S0->SetAutoSize(true);
	S0->SetPosition(FVector2D::ZeroVector);
	S0->SetZOrder(-1);
	Css = WidgetTree->ConstructWidget<USizeBox>();
	Css->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
	Scale->AddChild(Css);
	CssCanvas = WidgetTree->ConstructWidget<UCanvasPanel>();
	CssCanvas->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
	Css->AddChild(CssCanvas);
	auto AddImage = [this](const TCHAR* Name)
	{
		UImage* I = WidgetTree->ConstructWidget<UImage>(UImage::StaticClass(), Name);
		I->SetVisibility(ESlateVisibility::HitTestInvisible);
		CssCanvas->AddChildToCanvas(I);
		return I;
	};
	JoyBase = AddImage(TEXT("JoyBase"));
	JoyKnobShadow = AddImage(TEXT("JoyKnobShadow"));
	JoyKnob = AddImage(TEXT("JoyKnob"));
	PauseShadow = AddImage(TEXT("PauseShadow"));
	JumpButton = WidgetTree->ConstructWidget<UButton>(UButton::StaticClass(), TEXT("Jump"));
	CssCanvas->AddChildToCanvas(JumpButton);
	PauseButton = WidgetTree->ConstructWidget<UButton>(UButton::StaticClass(), TEXT("Pause"));
	CssCanvas->AddChildToCanvas(PauseButton);
	// Bouton SAUT coloré (tranche T9) : halo et anneau autour du bouton (.ring, inset −6 px), pastille du signe
	// (.jt-sign) au-dessus.
	JumpGlow = AddImage(TEXT("JumpGlow"));
	JumpRing = AddImage(TEXT("JumpRing"));
	JumpSign = WidgetTree->ConstructWidget<UBorder>(UBorder::StaticClass(), TEXT("JumpSign"));
	JumpSign->SetVisibility(ESlateVisibility::HitTestInvisible);
	JumpSign->SetPadding(FMargin(0));
	JumpSign->SetHorizontalAlignment(HAlign_Center);
	JumpSign->SetVerticalAlignment(VAlign_Center);
	JumpSignLabel = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass(), TEXT("JumpSignText"));
	JumpSignLabel->SetJustification(ETextJustify::Center);
	JumpSign->SetContent(JumpSignLabel);
	CssCanvas->AddChildToCanvas(JumpSign);
	JumpButton->OnPressed.AddDynamic(this, &UStridesTouchControls::JumpDown);
	JumpButton->OnReleased.AddDynamic(this, &UStridesTouchControls::JumpUp);
	PauseButton->OnPressed.AddDynamic(this, &UStridesTouchControls::PauseDown);
	PauseButton->OnReleased.AddDynamic(this, &UStridesTouchControls::PauseUp);

	Buttons = {JumpButton, PauseButton, InteractButton, GaitUpButton, GaitDownButton, SaveButton, LoadButton, PhoneButton, MissionButton};
}

void UStridesTouchControls::ApplyStyle(const FVector2D& ViewCss)
{
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	const Sc::FJ Doc = Data ? Data->CsoControlsStyle() : Sc::FJ();
	const TArray<TSharedPtr<FJsonValue>>* Views = nullptr;
	if (!Doc.IsValid() || !Doc->TryGetArrayField(TEXT("views"), Views) || !Views->Num()) return;
	// Relevé du viewport de hauteur la plus proche (les règles @media du web portent sur la hauteur).
	double Best = 1e9;
	for (const TSharedPtr<FJsonValue>& V : *Views)
	{
		const Sc::FJ O = V->AsObject();
		const TArray<TSharedPtr<FJsonValue>>& VP = O->GetArrayField(TEXT("viewport"));
		const double D = FMath::Abs(VP[1]->AsNumber() - ViewCss.Y);
		if (D < Best) { Best = D; View = O; View0 = FVector2D(VP[0]->AsNumber(), VP[1]->AsNumber()); }
	}
	const Sc::FJ Bt = Sc::Obj(View, TEXT("buttons")), Rest = Sc::Obj(View, TEXT("rest"));
	const Sc::FJ J = Sc::Obj(Bt, TEXT("jump")), P = Sc::Obj(Bt, TEXT("pause"));
	Textures.Reset();

	// SAUT : bas à droite (bloc d'actions .actions réduit par sa transformation : la boîte relevée est celle affichée).
	const FVector4 Jr = Sc::Rect(J);
	JumpBox = FVector4(ViewCss.X - (View0.X - Jr.X), ViewCss.Y - (View0.Y - Jr.Y), Jr.Z, Jr.W);
	const double K = Jr.Z / FMath::Max(1.0, Sc::Num(J, TEXT("width"), Jr.Z));  // échelle du bloc (0,88 sous 420 px)
	{
		UCanvasPanel* C = StyleButton(WidgetTree, JumpButton, Sc::Rounded(Sc::Color(J, TEXT("backgroundColor")), Jr.Z / 2, Sc::Color(J, TEXT("borderTopColor")), Sc::Num(J, TEXT("borderTopWidth")) * K));
		JumpIcon = WidgetTree->ConstructWidget<UImage>();
		JumpIcon->SetVisibility(ESlateVisibility::HitTestInvisible);
		C->AddChildToCanvas(JumpIcon);
		const Sc::FJ Ic = Sc::Obj(Bt, TEXT("jumpIcon"));
		if (UTexture2D* T = Data->UiIcon(TEXT("jump"))) JumpIcon->SetBrush(Sc::ImageBrush(T, FVector2D(Sc::Rect(Ic).Z, Sc::Rect(Ic).W), Sc::Color(J, TEXT("color"))));
		Place(JumpIcon, Inner(Ic, J));
		JumpLabel = WidgetTree->ConstructWidget<UTextBlock>();
		JumpLabel->SetVisibility(ESlateVisibility::HitTestInvisible);
		const Sc::FJ L = Sc::Obj(Bt, TEXT("jumpLabel"));
		JumpLabel->SetText(Sc::Cased(L, Sc::Str(L, TEXT("text"))));
		FSlateFontInfo F = Sc::Font(L);
		F.Size = (float)(F.Size * K);
		JumpLabel->SetFont(F);
		JumpLabel->SetColorAndOpacity(FSlateColor(Sc::Color(L, TEXT("color"))));
		JumpLabel->SetJustification(ETextJustify::Center);
		C->AddChildToCanvas(JumpLabel);
		// Boîte du texte relevée (largeur du texte du web) : centrée sur la même ligne, assez large pour la police du moteur.
		const FVector4 Li = Inner(L, J);
		Place(JumpLabel, FVector4(0, Li.Y - 2, Jr.Z, Li.W + 4));
	}
	// Pause : en haut à droite.
	const FVector4 Pr = Sc::Rect(P);
	PauseBox = FVector4(ViewCss.X - (View0.X - Pr.X), Pr.Y, Pr.Z, Pr.W);
	{
		UCanvasPanel* C = StyleButton(WidgetTree, PauseButton, Sc::Rounded(Sc::Color(P, TEXT("backgroundColor")), Sc::Radius(P)));
		PauseIcon = WidgetTree->ConstructWidget<UImage>();
		PauseIcon->SetVisibility(ESlateVisibility::HitTestInvisible);
		C->AddChildToCanvas(PauseIcon);
		const Sc::FJ Ic = Sc::Obj(Bt, TEXT("pauseIcon"));
		if (UTexture2D* T = Data->UiIcon(TEXT("pause"))) PauseIcon->SetBrush(Sc::ImageBrush(T, FVector2D(Sc::Rect(Ic).Z, Sc::Rect(Ic).W), Sc::Color(Ic, TEXT("stroke"))));
		Place(PauseIcon, Inner(Ic, P));
		const Sc::FShadow Sh = Sc::Shadow(P);
		if (Sh.bOn)
		{
			const int32 Bl = (int32)FMath::CeilToInt(Sh.Blur);
			UTexture2D* T = Sc::SoftShadowTexture((int32)Pr.Z + 2 * Bl, (int32)Pr.W + 2 * Bl, Sc::Radius(P), Sh.Blur);
			Textures.Add(T);
			PauseShadow->SetBrush(Sc::ImageBrush(T, FVector2D(Pr.Z + 2 * Bl, Pr.W + 2 * Bl), Sh.Color));
			Place(PauseShadow, FVector4(PauseBox.X + Sh.Offset.X - Bl, PauseBox.Y + Sh.Offset.Y - Bl, Pr.Z + 2 * Bl, Pr.W + 2 * Bl));
		}
	}
	Place(JumpButton, JumpBox);
	Place(PauseButton, PauseBox);
	JumpKey.Reset();  // états du bouton SAUT reposés au nouveau viewport
	// Joystick : base (dégradé radial, bordure), bouton (et son ombre) ; place de repos ancrée en bas à gauche.
	const Sc::FJ Jb = Sc::Obj(Rest, TEXT("base")), Jk = Sc::Obj(Rest, TEXT("knob"));
	const FVector4 Rb = Sc::Rect(Jb);
	RestBox = FVector4(Rb.X, ViewCss.Y - (View0.Y - Rb.Y), Rb.Z, Rb.W);
	KnobSize = Sc::Rect(Jk);
	{
		const TArray<FLinearColor> G = Sc::Colors(Sc::Str(Jb, TEXT("backgroundImage")));
		const int32 N = 256;
		const double Ring = Sc::Num(Jb, TEXT("borderTopWidth")) * N / FMath::Max(1.0, Rb.Z);
		UTexture2D* T = Sc::DiscTexture(N, G.Num() > 0 ? G[0] : FLinearColor::Transparent, G.Num() > 1 ? G[1] : FLinearColor::Transparent, Ring, Sc::Color(Jb, TEXT("borderTopColor")));
		Textures.Add(T);
		JoyBase->SetBrush(Sc::ImageBrush(T, FVector2D(Rb.Z, Rb.W)));
		const FLinearColor Kc = Sc::Color(Jk, TEXT("backgroundColor"));
		UTexture2D* Tk = Sc::DiscTexture(128, Kc, Kc, 0, FLinearColor::Transparent);
		Textures.Add(Tk);
		JoyKnob->SetBrush(Sc::ImageBrush(Tk, FVector2D(KnobSize.Z, KnobSize.W)));
		const Sc::FShadow Sh = Sc::Shadow(Jk);
		if (Sh.bOn)
		{
			const int32 Bl = (int32)FMath::CeilToInt(Sh.Blur);
			UTexture2D* Ts = Sc::SoftShadowTexture((int32)KnobSize.Z + 2 * Bl, (int32)KnobSize.W + 2 * Bl, KnobSize.Z / 2, Sh.Blur);
			Textures.Add(Ts);
			JoyKnobShadow->SetBrush(Sc::ImageBrush(Ts, FVector2D(KnobSize.Z + 2 * Bl, KnobSize.W + 2 * Bl), Sh.Color));
		}
	}
}

void UStridesTouchControls::Interact() { if (Controller) Controller->TouchInteract(); }
void UStridesTouchControls::GaitUp() { if (Controller) Controller->TouchGaitUp(); }
void UStridesTouchControls::GaitDown() { if (Controller) Controller->TouchGaitDown(); }
void UStridesTouchControls::Save() { if (Controller) Controller->TouchSave(); }
void UStridesTouchControls::Load() { if (Controller) Controller->TouchLoad(); }
void UStridesTouchControls::Phone() { if (Controller) Controller->TouchPhone(); }
void UStridesTouchControls::Mission() { if (Controller) Controller->TouchMission(); }
// bindButton du web : appui pris à la pression (pressed + held), relâché à la levée.
void UStridesTouchControls::JumpDown() { if (Controller) Controller->ButtonDown(TEXT("jump")); }
void UStridesTouchControls::JumpUp() { if (Controller) Controller->ButtonUp(TEXT("jump")); }
void UStridesTouchControls::PauseDown() { if (Controller) Controller->ButtonDown(TEXT("pause")); }
void UStridesTouchControls::PauseUp() { if (Controller) Controller->ButtonUp(TEXT("pause")); }

void UStridesTouchControls::PressForTest(const FString& Name, bool bDown)
{
	if (Name == TEXT("Jump")) { if (bDown) JumpDown(); else JumpUp(); }
	else if (Name == TEXT("Pause")) { if (bDown) PauseDown(); else PauseUp(); }
}

bool UStridesTouchControls::ButtonVisible(const FString& Name, const strides::CsoHud* RaceHud)
{
#if UE_BUILD_SHIPPING
	// Jalon J3 : SAUVER, CHARGER et MISSION sont des outils du portage ; le jeu publié sauvegarde seul (toutes les 12 s,
	// acceptation et fin de mission) et lance les missions depuis le téléphone.
	if (Name == TEXT("Save") || Name == TEXT("Load") || Name == TEXT("Mission")) return false;
#endif
	if (Name == TEXT("Pause")) return true;  // jamais masqué (styles.css : aucune règle de concours)
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

FVector4 UStridesTouchControls::BoxOf(const FString& Name) const
{
	auto Shown = [](const UWidget* W) { return W && W->GetVisibility() != ESlateVisibility::Collapsed; };
	if (Name == TEXT("Jump")) return Shown(JumpButton) ? JumpBox : FVector4(0, 0, 0, 0);
	if (Name == TEXT("Pause")) return Shown(PauseButton) ? PauseBox : FVector4(0, 0, 0, 0);
	if (Name == TEXT("Joystick")) return Shown(JoyBase) ? FVector4(JoyCenter.X - RestBox.Z / 2, JoyCenter.Y - RestBox.W / 2, RestBox.Z, RestBox.W) : FVector4(0, 0, 0, 0);
	if (Name == TEXT("Knob")) return Shown(JoyKnob) ? FVector4(KnobCenter.X - KnobSize.Z / 2, KnobCenter.Y - KnobSize.W / 2, KnobSize.Z, KnobSize.W) : FVector4(0, 0, 0, 0);
	return FVector4(0, 0, 0, 0);
}

FVector4 UStridesTouchControls::SlotBoxOf(const FString& Name) const
{
	const UWidget* W = Name == TEXT("Jump") ? JumpButton : Name == TEXT("Pause") ? PauseButton : nullptr;
	const UCanvasPanelSlot* S = W ? Cast<UCanvasPanelSlot>(W->Slot) : nullptr;
	if (!S || W->GetVisibility() == ESlateVisibility::Collapsed) return FVector4(0, 0, 0, 0);
	return FVector4(S->GetPosition().X, S->GetPosition().Y, S->GetSize().X, S->GetSize().Y);
}

double UStridesTouchControls::JoystickOpacity() const { return JoyBase && JoyBase->GetVisibility() != ESlateVisibility::Collapsed ? JoyOpacity : 0.0; }

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
	// HUD affiché : celui du widget d'épreuve (état figé des captures, sinon l'épreuve), à défaut celui de l'épreuve.
	const UStridesCsoHud* HudW = Controller ? Controller->CsoHudWidget() : nullptr;
	const strides::CsoHud* H = HudW && HudW->Source() ? HudW->Source() : Course.IsValid() && Course->Run() ? &Course->HudModel() : nullptr;
	const bool bTouchMode = IsTouchMode();
	const ESlateVisibility Show = ESlateVisibility::Visible, Hide = ESlateVisibility::Collapsed;
	for (UButton* B : Buttons)
	{
		if (!B || B == JumpButton || B == PauseButton) continue;
		B->SetVisibility(bTouchMode && ButtonVisible(B->GetName(), H) ? Show : Hide);
	}
	// Bouton d'action : libellé de l'action proposée par le poteau (t('Chrono'), tranche T10), sinon celui du portage.
	for (UButton* B : Buttons)
		if (B && B->GetName() == TEXT("Interact"))
			if (UTextBlock* L = Cast<UTextBlock>(B->GetContent()))
			{
				const FString A = Controller ? Controller->ActionLabel() : FString();
				L->SetText(FText::FromString(A.IsEmpty() ? FString(TEXT("MONTER")) : A));
			}
	// Calque en px CSS : échelle (facteur de pixels de la plateforme), puis mise en page au viewport.
	const FVector2D V = ViewCss();
	if (Scale && !TestView.IsZero()) Scale->SetUserSpecifiedScale(1.f);
	else if (Scale)
	{
		const double D = FMath::Max(1e-3f, UWidgetLayoutLibrary::GetViewportScale(this));
		Scale->SetUserSpecifiedScale((float)(UStridesCsoHud::PixelRatio() / D));
	}
	if (Css) { Css->SetWidthOverride(V.X); Css->SetHeightOverride(V.Y); }
	if (V != LastView || !View.IsValid())
	{
		ApplyStyle(V);
		LastView = V;
	}
	const bool bStyled = View.IsValid();
	// SAUT : bouton du mode « ride » (hud.js:344) et non masqué par les classes du HUD ; pause : toujours.
	JumpButton->SetVisibility(bStyled && Riding() && ButtonVisible(TEXT("Jump"), H) ? Show : Hide);
	PauseButton->SetVisibility(bStyled ? Show : Hide);
	ApplyJumpState(H, V);
	PauseShadow->SetVisibility(bStyled ? ESlateVisibility::HitTestInvisible : Hide);
	// Joystick (mode tactile) : au repos à sa place (opacité du repos), tenu : base au doigt, bouton décalé (input.js).
	const strides::CsoInput* Cmd = Commands();
	const bool bJoy = bStyled && bTouchMode && Cmd;
	for (UImage* I : {JoyBase.Get(), JoyKnob.Get(), JoyKnobShadow.Get()}) I->SetVisibility(bJoy ? ESlateVisibility::HitTestInvisible : Hide);
	if (!bJoy) return;
	const strides::CsoInput::View& Jv = Cmd->view;
	JoyCenter = Jv.placed ? FVector2D(Jv.left, Jv.top) : FVector2D(RestBox.X + RestBox.Z / 2, RestBox.Y + RestBox.W / 2);
	KnobCenter = JoyCenter + FVector2D(Jv.knobX, Jv.knobY);
	JoyOpacity = Sc::Num(Sc::Obj(Sc::Obj(View, Jv.active ? TEXT("held") : TEXT("rest")), TEXT("base")), TEXT("opacity"), 1);
	Place(JoyBase, FVector4(JoyCenter.X - RestBox.Z / 2, JoyCenter.Y - RestBox.W / 2, RestBox.Z, RestBox.W));
	Place(JoyKnob, FVector4(KnobCenter.X - KnobSize.Z / 2, KnobCenter.Y - KnobSize.W / 2, KnobSize.Z, KnobSize.W));
	const Sc::FShadow Sh = Sc::Shadow(Sc::Obj(Sc::Obj(View, TEXT("rest")), TEXT("knob")));
	const double Bl = FMath::CeilToDouble(Sh.Blur);
	Place(JoyKnobShadow, FVector4(KnobCenter.X - KnobSize.Z / 2 - Bl + Sh.Offset.X, KnobCenter.Y - KnobSize.W / 2 - Bl + Sh.Offset.Y, KnobSize.Z + 2 * Bl, KnobSize.W + 2 * Bl));
	// L'opacité de .joy-base vaut pour la base et son bouton (enfant).
	for (UImage* I : {JoyBase.Get(), JoyKnob.Get(), JoyKnobShadow.Get()}) I->SetRenderOpacity((float)JoyOpacity);
}

// ---------- Bouton SAUT coloré (tranche T9) ----------

FString UStridesTouchControls::JumpStyleKey(const strides::CsoHud* RaceHud)
{
	if (!RaceHud) return TEXT("none");
	// Classes far / good / near de .btn-jump (hud.js:376), early ajoutée par jumpEarly (:434).
	const TCHAR* Base = RaceHud->jumpFar() ? TEXT("far") : RaceHud->jumpGood() ? TEXT("good") : RaceHud->jumpNear() ? TEXT("near") : TEXT("none");
	return RaceHud->jumpEarlyOn() ? FString(Base) + TEXT("-early") : FString(Base);
}

void UStridesTouchControls::ApplyJumpState(const strides::CsoHud* RaceHud, const FVector2D& ViewCss)
{
	const ESlateVisibility Hide = ESlateVisibility::Collapsed, Shown = ESlateVisibility::HitTestInvisible;
	const bool bJump = JumpButton && JumpButton->GetVisibility() != Hide;
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	const Sc::FJ Doc = Data ? Data->CsoJumpStyle() : Sc::FJ();
	const TArray<TSharedPtr<FJsonValue>>* Views = nullptr;
	if (!bJump || !Doc.IsValid() || !Doc->TryGetArrayField(TEXT("views"), Views) || !Views->Num())
	{
		for (UWidget* W : {(UWidget*)JumpGlow.Get(), (UWidget*)JumpRing.Get(), (UWidget*)JumpSign.Get()})
			if (W) W->SetVisibility(Hide);
		RingBox = SignBox = GlowBox = FVector4(0, 0, 0, 0);
		bJumpGlow = false;
		JumpKey.Reset();
		return;
	}
	// Libellé : clé française du HUD traduite dans la langue de l'épreuve (t() de hud.js:379, 435).
	FString Lang = TestLang;
	if (Lang.IsEmpty()) Lang = Course.IsValid() ? Course->Lang : TEXT("fr");
	const strides::TextTable* Text = Data ? Data->CsoText() : nullptr;
	const std::string Key = RaceHud ? RaceHud->jumpLabelKey() : std::string("Saut");
	const FString Label = UTF8_TO_TCHAR((Text ? Text->t(Key, strides::langFromName(TCHAR_TO_UTF8(*Lang))) : Key).c_str());
	const FString Sign = RaceHud ? UTF8_TO_TCHAR(RaceHud->jumpSign().c_str()) : TEXT("");
	const FString K = JumpStyleKey(RaceHud);
	if (K == JumpKey && ViewCss == JumpKeyView && Label == JumpLabelShown && Sign == JumpSignShown) return;
	// Relevé du viewport de hauteur la plus proche (comme ApplyStyle).
	double Best = 1e9;
	for (const TSharedPtr<FJsonValue>& V : *Views)
	{
		const Sc::FJ O = V->AsObject();
		const TArray<TSharedPtr<FJsonValue>>& VP = O->GetArrayField(TEXT("viewport"));
		const double D = FMath::Abs(VP[1]->AsNumber() - ViewCss.Y);
		if (D < Best) { Best = D; JumpView = O; JumpView0 = FVector2D(VP[0]->AsNumber(), VP[1]->AsNumber()); }
	}
	const Sc::FJ States = Sc::Obj(JumpView, TEXT("states"));
	Sc::FJ S = Sc::Obj(States, *K);
	if (!S.IsValid()) S = Sc::Obj(States, TEXT("none"));
	if (!S.IsValid()) return;
	JumpKey = K;
	JumpKeyView = ViewCss;
	JumpLabelShown = Label;
	JumpSignShown = Sign;
	const Sc::FJ J = Sc::Obj(S, TEXT("jump")), R = Sc::Obj(S, TEXT("ring")), G = Sc::Obj(S, TEXT("sign")), L = Sc::Obj(S, TEXT("label"));
	// Boîtes relevées ancrées en bas à droite, comme le bouton (bloc d'actions réduit à 0,88 sous 420 px : boîtes affichées).
	auto Anchor = [&](const FVector4& B) { return FVector4(ViewCss.X - (JumpView0.X - B.X), ViewCss.Y - (JumpView0.Y - B.Y), B.Z, B.W); };
	const FVector4 Jr = Sc::Rect(J);
	const double Kx = Jr.Z / FMath::Max(1.0, Sc::Num(J, TEXT("width"), Jr.Z));
	// Fond et bordure du bouton (.btn-jump.good : fond vert).
	JumpBg = Sc::Color(J, TEXT("backgroundColor"));
	const FSlateBrush Bb = Sc::Rounded(JumpBg, Jr.Z / 2, Sc::Color(J, TEXT("borderTopColor")), Sc::Num(J, TEXT("borderTopWidth")) * Kx);
	FButtonStyle St = JumpButton->GetStyle();
	St.SetNormal(Bb);
	St.SetHovered(Bb);
	St.SetPressed(Bb);
	St.SetDisabled(Bb);
	JumpButton->SetStyle(St);
	// Anneau (bordure de 3 px, transparente sans état) et halo (box-shadow de l'anneau, hors de sa boîte).
	RingBox = Anchor(Sc::Rect(R));
	JumpRingC = Sc::Color(R, TEXT("borderTopColor"));
	JumpRing->SetBrush(Sc::Rounded(FLinearColor::Transparent, RingBox.Z / 2, JumpRingC, Sc::Num(R, TEXT("borderTopWidth")) * Kx));
	Place(JumpRing, RingBox);
	JumpRing->SetVisibility(JumpRingC.A > 0 ? Shown : Hide);
	const Sc::FShadow Sh = Sc::Shadow(R);
	bJumpGlow = Sh.bOn;
	if (Sh.bOn)
	{
		const double Bl = Sh.Blur * Kx;
		const int32 Bi = (int32)FMath::CeilToInt(Bl);
		JumpTextures.Reset();
		UTexture2D* T = Sc::SoftShadowTexture((int32)RingBox.Z + 2 * Bi, (int32)RingBox.W + 2 * Bi, RingBox.Z / 2, Bl, true);
		JumpTextures.Add(T);
		GlowBox = FVector4(RingBox.X + Sh.Offset.X - Bi, RingBox.Y + Sh.Offset.Y - Bi, RingBox.Z + 2 * Bi, RingBox.W + 2 * Bi);
		JumpGlow->SetBrush(Sc::ImageBrush(T, FVector2D(GlowBox.Z, GlowBox.W), Sh.Color));
		Place(JumpGlow, GlowBox);
		JumpGlow->SetVisibility(Shown);
	}
	else
	{
		GlowBox = FVector4(0, 0, 0, 0);
		JumpGlow->SetVisibility(Hide);
	}
	// Pastille du signe (display none sans état).
	const bool bSign = Sc::Str(G, TEXT("display")) != TEXT("none");
	JumpSignC = Sc::Color(G, TEXT("backgroundColor"));
	JumpSignTextC = Sc::Color(G, TEXT("color"));
	if (bSign)
	{
		SignBox = Anchor(Sc::Rect(G));
		JumpSign->SetBrush(Sc::Rounded(JumpSignC, Sc::Num(G, TEXT("borderTopLeftRadius")) * Kx));
		FSlateFontInfo F = Sc::Font(G);
		F.Size = (float)(F.Size * Kx);
		JumpSignLabel->SetFont(F);
		JumpSignLabel->SetColorAndOpacity(FSlateColor(JumpSignTextC));
		JumpSignLabel->SetText(FText::FromString(Sign));
		Place(JumpSign, SignBox);
		JumpSign->SetVisibility(Shown);
	}
	else
	{
		SignBox = FVector4(0, 0, 0, 0);
		JumpSign->SetVisibility(Hide);
	}
	// Libellé (texte en capitales du web : text-transform).
	JumpLabelC = Sc::Color(L, TEXT("color"));
	JumpLabel->SetColorAndOpacity(FSlateColor(JumpLabelC));
	JumpLabel->SetText(Sc::Cased(L, Label));
}

FString UStridesTouchControls::JumpLabelText() const { return JumpLabel && JumpButton && JumpButton->GetVisibility() != ESlateVisibility::Collapsed ? JumpLabel->GetText().ToString() : FString(); }
FString UStridesTouchControls::JumpSignText() const { return JumpSign && JumpSign->GetVisibility() != ESlateVisibility::Collapsed ? JumpSignShown : FString(); }
bool UStridesTouchControls::JumpGlowShown() const { return JumpGlow && JumpGlow->GetVisibility() != ESlateVisibility::Collapsed && bJumpGlow; }

FLinearColor UStridesTouchControls::JumpColor(const FString& Part) const
{
	if (Part == TEXT("background")) return JumpBg;
	if (Part == TEXT("ring")) return JumpRingC;
	if (Part == TEXT("sign")) return JumpSignC;
	if (Part == TEXT("signText")) return JumpSignTextC;
	if (Part == TEXT("label")) return JumpLabelC;
	return FLinearColor::Transparent;
}

FVector4 UStridesTouchControls::JumpPartBox(const FString& Part) const
{
	auto Shown = [](const UWidget* W) { return W && W->GetVisibility() != ESlateVisibility::Collapsed; };
	if (Part == TEXT("ring")) return Shown(JumpRing) ? RingBox : FVector4(0, 0, 0, 0);
	if (Part == TEXT("sign")) return Shown(JumpSign) ? SignBox : FVector4(0, 0, 0, 0);
	if (Part == TEXT("glow")) return Shown(JumpGlow) ? GlowBox : FVector4(0, 0, 0, 0);
	return FVector4(0, 0, 0, 0);
}
