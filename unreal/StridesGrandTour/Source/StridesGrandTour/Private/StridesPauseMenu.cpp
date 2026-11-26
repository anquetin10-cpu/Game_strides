#include "StridesPauseMenu.h"

#include "Blueprint/WidgetLayoutLibrary.h"
#include "Blueprint/WidgetTree.h"
#include "Components/BackgroundBlur.h"
#include "Components/Border.h"
#include "Components/Button.h"
#include "Components/ButtonSlot.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/Image.h"
#include "Components/RichTextBlock.h"
#include "Components/ScaleBox.h"
#include "Components/ScrollBox.h"
#include "Components/SizeBox.h"
#include "Components/TextBlock.h"
#include "Engine/DataTable.h"
#include "EngineUtils.h"
#include "StridesCore/SaveGame.h"
#include "StridesCourse.h"
#include "StridesCss.h"
#include "StridesCsoHud.h"
#include "StridesDataSubsystem.h"
#include "StridesPlayerController.h"
#include "StridesSaveSubsystem.h"

namespace
{
namespace Sc = StridesCss;

void PlaceIn(UCanvasPanel* C, UWidget* W, const FVector4& Box, int32 Z = 0)
{
	UCanvasPanelSlot* S = C->AddChildToCanvas(W);
	S->SetAnchors(FAnchors(0, 0));
	S->SetAlignment(FVector2D::ZeroVector);
	S->SetPosition(FVector2D(Box.X, Box.Y));
	S->SetSize(FVector2D(Box.Z, Box.W));
	S->SetZOrder(Z);
}
FVector4 Shift(const FVector4& R, const FVector2D& O) { return FVector4(R.X - O.X, R.Y - O.Y, R.Z, R.W); }
// HTML d'un paragraphe du web (<b>, <br>) → balises du texte riche d'Unreal (<b>…</>, retour à la ligne).
FString RichOf(const FString& Html)
{
	return Html.Replace(TEXT("</b>"), TEXT("</>")).Replace(TEXT("<br>"), TEXT("\n"));
}
}  // namespace

void UStridesPauseMenu::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	Build();
}

UStridesSaveSubsystem* UStridesPauseMenu::Save() const
{
	return GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>() : nullptr;
}

AStridesCourse* UStridesPauseMenu::RaceCourse() const
{
	if (!GetWorld()) return nullptr;
	for (TActorIterator<AStridesCourse> It(GetWorld()); It; ++It)
		if (It->Run()) return *It;
	return nullptr;
}

// game.course.kind === 'cso' (épreuve, de l'entrée en piste à la sortie) : classe cso-sober du HUD de l'épreuve.
bool UStridesPauseMenu::InRace() const
{
	// HUD affiché (widget d'épreuve : état figé des captures, sinon l'épreuve) ; à défaut, l'épreuve du monde.
	if (const UStridesCsoHud* W = PC ? PC->CsoHudWidget() : nullptr)
		if (const strides::CsoHud* H = W->Source()) return H->csoSober();
	const AStridesCourse* C = RaceCourse();
	return C && C->HudModel().csoSober();
}

// Aide imposée (game.course.aidLocked : défis) : le parcours du Pôle n'en impose pas.
bool UStridesPauseMenu::AidLocked() const { return false; }

FVector2D UStridesPauseMenu::ViewCss() const
{
	if (!TestView.IsZero()) return TestView;
	const FVector2D Px = UWidgetLayoutLibrary::GetViewportSize(const_cast<UStridesPauseMenu*>(this));
	return Px.X > 0 ? Px / UStridesCsoHud::PixelRatio() : FVector2D(844, 390);
}

void UStridesPauseMenu::Build()
{
	if (!WidgetTree || Root) return;
	Root = WidgetTree->ConstructWidget<UCanvasPanel>(UCanvasPanel::StaticClass(), TEXT("PauseRoot"));
	WidgetTree->RootWidget = Root;
	Scale = WidgetTree->ConstructWidget<UScaleBox>();
	Scale->SetStretch(EStretch::UserSpecified);
	UCanvasPanelSlot* S0 = Root->AddChildToCanvas(Scale);
	S0->SetAnchors(FAnchors(0, 0));
	S0->SetAutoSize(true);
	CssBox = WidgetTree->ConstructWidget<USizeBox>();
	Scale->AddChild(CssBox);
	Canvas = WidgetTree->ConstructWidget<UCanvasPanel>();
	CssBox->AddChild(Canvas);
	RichStyles = NewObject<UDataTable>(this);
	RichStyles->RowStruct = FRichTextStyleRow::StaticStruct();
}

void UStridesPauseMenu::Open(AStridesPlayerController* InPC)
{
	PC = InPC;
	bOpen = true;
	SelectedId = TEXT("resume");  // bouton principal choisi d'office à chaque ouverture
	Build();
	LastView = FVector2D::ZeroVector;  // mise en page refaite (épreuve ou non)
	Refresh();
}

void UStridesPauseMenu::Close() { bOpen = false; }

void UStridesPauseMenu::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	Refresh();
}

void UStridesPauseMenu::Refresh()
{
	Build();
	if (!Root) return;
	const FVector2D V = ViewCss();
	if (Scale)
	{
		const double D = TestView.IsZero() ? FMath::Max(1e-3f, UWidgetLayoutLibrary::GetViewportScale(this)) : 1.0;
		Scale->SetUserSpecifiedScale((float)(TestView.IsZero() ? UStridesCsoHud::PixelRatio() / D : 1.0));
	}
	CssBox->SetWidthOverride(V.X);
	CssBox->SetHeightOverride(V.Y);
	const bool bRace = InRace();
	if (V != LastView || bRace != bLastRace)
	{
		ApplyStyle(V);
		LastView = V;
		bLastRace = bRace;
	}
	RefreshLabels();
}

void UStridesPauseMenu::ApplyStyle(const FVector2D& ViewCss)
{
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	Doc = Data ? Data->CsoControlsStyle() : nullptr;
	for (UWidget* W : Parts) if (W) W->RemoveFromParent();
	Parts.Reset();
	Textures.Reset();
	ActionButtons.Reset();
	ActionOrder.Reset();
	ActionBoxes.Reset();
	SelRing = nullptr;
	Shown.Reset();
	LineButton = AidButton = nullptr;
	LineText = AidText = nullptr;
	if (RichStyles) RichStyles->EmptyTable();  // style gras du viewport retenu (13 px sous 360 px de haut)
	const TArray<TSharedPtr<FJsonValue>>* Views = nullptr;
	if (!Doc.IsValid() || !Doc->TryGetArrayField(TEXT("views"), Views) || !Views->Num()) return;
	Sc::FJ View;
	FVector2D View0(844, 390);
	double Best = 1e9;
	for (const TSharedPtr<FJsonValue>& Vv : *Views)
	{
		const Sc::FJ O = Vv->AsObject();
		const TArray<TSharedPtr<FJsonValue>>& VP = O->GetArrayField(TEXT("viewport"));
		const double D = FMath::Abs(VP[1]->AsNumber() - ViewCss.Y);
		if (D < Best) { Best = D; View = O; View0 = FVector2D(VP[0]->AsNumber(), VP[1]->AsNumber()); }
	}
	const Sc::FJ C = Sc::Obj(View, TEXT("card"));
	// La carte est centrée (overlay flex) : décalage du relevé au viewport courant.
	const FVector2D Off((ViewCss.X - View0.X) / 2, (ViewCss.Y - View0.Y) / 2);
	auto Box = [&](const Sc::FJ& E) { const FVector4 R = Sc::Rect(E); return FVector4(R.X + Off.X, R.Y + Off.Y, R.Z, R.W); };
	auto Keep = [this](UWidget* W) { Parts.Add(W); return W; };
	auto Text = [&](const Sc::FJ& E, const FString& S, bool bWrap = true)
	{
		UTextBlock* T = WidgetTree->ConstructWidget<UTextBlock>();
		T->SetText(Sc::Cased(E, S));
		T->SetFont(Sc::Font(E));
		FLinearColor Col = Sc::Color(E, TEXT("color"));
		Col.A *= (float)Sc::Num(E, TEXT("opacity"), 1);
		T->SetColorAndOpacity(FSlateColor(Col));
		T->SetAutoWrapText(bWrap);
		const double Fs = Sc::Num(E, TEXT("fontSize"), 15) * 1.171;
		T->SetLineHeightPercentage((float)(Sc::Num(E, TEXT("lineHeight"), Fs) / Fs));
		const FString Al = Sc::Str(E, TEXT("textAlign"));
		T->SetJustification(Al == TEXT("center") ? ETextJustify::Center : ETextJustify::Left);
		return T;
	};
	auto Button = [&](const Sc::FJ& E, const FString& Label, UTextBlock** OutText)
	{
		UButton* B = WidgetTree->ConstructWidget<UButton>();
		const FSlateBrush Br = Sc::BoxOf(E);
		FButtonStyle St;
		St.SetNormal(Br);
		St.SetHovered(Br);
		St.SetPressed(Br);
		St.SetDisabled(Br);
		St.SetNormalPadding(FMargin(0));
		St.SetPressedPadding(FMargin(0));
		B->SetStyle(St);
		B->SetBackgroundColor(FLinearColor::White);
		UTextBlock* T = Text(E, Label);
		T->SetJustification(ETextJustify::Center);
		if (UButtonSlot* S = Cast<UButtonSlot>(B->SetContent(T)))
		{
			S->SetHorizontalAlignment(HAlign_Center);
			S->SetVerticalAlignment(VAlign_Center);
			S->SetPadding(FMargin(Sc::Num(E, TEXT("paddingLeft")), 0));
		}
		if (OutText) *OutText = T;
		return B;
	};

	// Fond (overlay : voile et flou de l'arrière-plan).
	const Sc::FJ Ov = Sc::Obj(C, TEXT("overlay"));
	UBackgroundBlur* Blur = Cast<UBackgroundBlur>(Keep(WidgetTree->ConstructWidget<UBackgroundBlur>()));
	{
		FString F = Sc::Str(Ov, TEXT("backdropFilter"));
		Blur->SetBlurStrength(F.StartsWith(TEXT("blur(")) ? (float)FCString::Atod(*F.Mid(5)) : 0.f);
		PlaceIn(Canvas, Blur, FVector4(0, 0, ViewCss.X, ViewCss.Y), 0);
	}
	UBorder* Veil = Cast<UBorder>(Keep(WidgetTree->ConstructWidget<UBorder>()));
	Veil->SetBrushColor(Sc::Color(Ov, TEXT("backgroundColor")));
	PlaceIn(Canvas, Veil, FVector4(0, 0, ViewCss.X, ViewCss.Y), 1);
	// Carte : ombre, fond arrondi bordé.
	const Sc::FJ Cd = Sc::Obj(C, TEXT("card"));
	const FVector4 Cr = Box(Cd);
	const Sc::FShadow Sh = Sc::Shadow(Cd);
	if (Sh.bOn)
	{
		const int32 Bl = (int32)FMath::CeilToInt(Sh.Blur);
		UTexture2D* T = Sc::SoftShadowTexture((int32)Cr.Z + 2 * Bl, (int32)Cr.W + 2 * Bl, Sc::Radius(Cd), Sh.Blur);
		Textures.Add(T);
		UImage* I = Cast<UImage>(Keep(WidgetTree->ConstructWidget<UImage>()));
		I->SetBrush(Sc::ImageBrush(T, FVector2D(Cr.Z + 2 * Bl, Cr.W + 2 * Bl), Sh.Color));
		PlaceIn(Canvas, I, FVector4(Cr.X + Sh.Offset.X - Bl, Cr.Y + Sh.Offset.Y - Bl, Cr.Z + 2 * Bl, Cr.W + 2 * Bl), 2);
	}
	UBorder* Card = Cast<UBorder>(Keep(WidgetTree->ConstructWidget<UBorder>()));
	Card->SetBrush(Sc::BoxOf(Cd));
	PlaceIn(Canvas, Card, Cr, 3);
	// Corps défilable : contenu posé aux boîtes du relevé (relatives au corps), hauteur de défilement du relevé.
	const Sc::FJ Bd = Sc::Obj(C, TEXT("body"));
	const FVector4 Br = Box(Bd);
	UScrollBox* Scroll = Cast<UScrollBox>(Keep(WidgetTree->ConstructWidget<UScrollBox>()));
	Scroll->SetScrollBarVisibility(ESlateVisibility::Collapsed);
	PlaceIn(Canvas, Scroll, Br, 4);
	USizeBox* Content = WidgetTree->ConstructWidget<USizeBox>();
	const TArray<TSharedPtr<FJsonValue>>* Paras = nullptr;
	C->TryGetArrayField(TEXT("paragraphs"), Paras);
	const bool bRace = InRace();
	// Hors épreuve, la carte du web n'a ni rappel de l'épreuve ni bascules : le reste remonte d'autant (approché).
	const double Up = !bRace && Paras && Paras->Num() > 1 ? Sc::Rect((*Paras)[1]->AsObject()).Y - Sc::Rect((*Paras)[0]->AsObject()).Y : 0;
	Content->SetHeightOverride(Sc::Num(Bd, TEXT("scrollHeight"), Br.W) - Up);
	Content->SetWidthOverride(Br.Z);
	Scroll->AddChild(Content);
	UCanvasPanel* In = WidgetTree->ConstructWidget<UCanvasPanel>();
	Content->AddChild(In);
	const FVector2D BodyO(Br.X, Br.Y);
	auto InBody = [&](const Sc::FJ& E, double Dy = 0) { FVector4 R = Shift(Box(E), BodyO); R.Y -= Dy; return R; };
	const Sc::FJ Kk = Sc::Obj(C, TEXT("kicker")), Ti = Sc::Obj(C, TEXT("title"));
	PlaceIn(In, Text(Kk, Sc::Str(Kk, TEXT("text"))), InBody(Kk));
	PlaceIn(In, Text(Ti, Sc::Str(Ti, TEXT("text"))), InBody(Ti));
	Shown.Add(TEXT("kicker=") + Sc::Cased(Kk, Sc::Str(Kk, TEXT("text"))).ToString());
	Shown.Add(TEXT("title=") + Sc::Str(Ti, TEXT("text")));
	// Paragraphes (texte riche : <b>) ; styles : défaut du paragraphe, gras relevé.
	const Sc::FJ Bo = Sc::Obj(C, TEXT("bold"));
	if (Paras)
		for (int32 I = 0; I < Paras->Num(); I++)
		{
			if (!bRace && I == 0) continue;
			const Sc::FJ P = (*Paras)[I]->AsObject();
			FString Html = Sc::Str(P, TEXT("html")).Replace(TEXT("{build_id}"), TEXT("Unreal"));
			URichTextBlock* R = WidgetTree->ConstructWidget<URichTextBlock>();
			FTextBlockStyle Def;
			FLinearColor Col = Sc::Color(P, TEXT("color"));
			Col.A *= (float)Sc::Num(P, TEXT("opacity"), 1);
			Def.SetFont(Sc::Font(P)).SetColorAndOpacity(FSlateColor(Col));
			FTextBlockStyle Bold;
			Bold.SetFont(Sc::Font(Bo)).SetColorAndOpacity(FSlateColor(Col));
			// Style « b » seulement : une ligne « Default » de la table remplacerait le style par défaut de chaque paragraphe
			// (la ligne de version est plus petite et plus pâle).
			if (RichStyles->GetRowMap().Num() == 0)
			{
				FRichTextStyleRow RB;
				RB.TextStyle = Bold;
				RichStyles->AddRow(TEXT("b"), RB);
			}
			R->SetTextStyleSet(RichStyles);
			R->SetDefaultTextStyle(Def);
			R->SetAutoWrapText(true);
			// Interligne du web (line-height, px) rapporté à celui de la police du moteur (Roboto : 1,171 em) : approché.
			R->SetLineHeightPercentage((float)(Sc::Num(P, TEXT("lineHeight"), Sc::Num(P, TEXT("fontSize"), 15) * 1.171) / (Sc::Num(P, TEXT("fontSize"), 15) * 1.171)));
			R->SetText(FText::FromString(RichOf(Html)));
			PlaceIn(In, R, InBody(P, I > 0 ? Up : 0));
			Shown.Add(FString::Printf(TEXT("p%d=%s"), I, *Html));
		}
	// Bascules (épreuve seulement).
	if (bRace)
	{
		const Sc::FJ L = Sc::Obj(C, TEXT("line")), A = Sc::Obj(C, TEXT("aid"));
		UTextBlock* Lt = nullptr;
		UTextBlock* At = nullptr;
		LineButton = Button(L, Sc::Str(L, TEXT("text")), &Lt);
		AidButton = Button(A, Sc::Str(A, TEXT("text")), &At);
		LineText = Lt;
		AidText = At;
		LineButton->OnClicked.AddDynamic(this, &UStridesPauseMenu::OnLine);
		AidButton->OnClicked.AddDynamic(this, &UStridesPauseMenu::OnAid);
		PlaceIn(In, LineButton, InBody(L));
		PlaceIn(In, AidButton, InBody(A));
	}
	// Encart Strides.
	const Sc::FJ Pr = Sc::Obj(C, TEXT("promo")), PT = Sc::Obj(C, TEXT("promoT")), PS = Sc::Obj(C, TEXT("promoS")), PB = Sc::Obj(C, TEXT("promoBtn"));
	UBorder* Promo = WidgetTree->ConstructWidget<UBorder>();
	Promo->SetBrush(Sc::BoxOf(Pr));
	PlaceIn(In, Promo, InBody(Pr, Up));
	PlaceIn(In, Text(PT, Sc::Str(PT, TEXT("text"))), InBody(PT, Up));
	PlaceIn(In, Text(PS, Sc::Str(PS, TEXT("text"))), InBody(PS, Up));
	UButton* PromoB = Button(PB, Sc::Str(PB, TEXT("text")), nullptr);
	PromoB->OnClicked.AddDynamic(this, &UStridesPauseMenu::OnOther);
	PlaceIn(In, PromoB, InBody(PB, Up));
	Shown.Add(TEXT("promo=") + Sc::Str(PT, TEXT("text")));
	// Barre d'actions (toujours visible) : bordure du haut et ombre quand le corps déborde (classe more).
	const Sc::FJ Ac = Sc::Obj(C, TEXT("actions"));
	const FVector4 Ar = Box(Ac);
	bool bMore = false;
	Ac->TryGetBoolField(TEXT("more"), bMore);
	if (bMore)
	{
		const Sc::FShadow As = Sc::Shadow(Ac);
		if (As.bOn)
		{
			// Ombre vers le haut (0 -12px 24px) : bande dégradée au-dessus de la barre, bornée à la carte.
			const int32 Bl = (int32)FMath::CeilToInt(As.Blur);
			UTexture2D* T = Sc::SoftShadowTexture((int32)Ar.Z + 2 * Bl, (int32)Ar.W + 2 * Bl, 0, As.Blur);
			Textures.Add(T);
			UImage* I = Cast<UImage>(Keep(WidgetTree->ConstructWidget<UImage>()));
			I->SetBrush(Sc::ImageBrush(T, FVector2D(Ar.Z + 2 * Bl, Ar.W + 2 * Bl), As.Color));
			I->SetClipping(EWidgetClipping::ClipToBounds);
			PlaceIn(Canvas, I, FVector4(Ar.X + As.Offset.X - Bl, Ar.Y + As.Offset.Y - Bl, Ar.Z + 2 * Bl, Ar.W + 2 * Bl), 5);
		}
		UBorder* Top = Cast<UBorder>(Keep(WidgetTree->ConstructWidget<UBorder>()));
		Top->SetBrushColor(Sc::Color(Ac, TEXT("borderTopColor")));
		PlaceIn(Canvas, Top, FVector4(Ar.X, Ar.Y, Ar.Z, Sc::Num(Ac, TEXT("borderTopWidth"), 1)), 7);
	}
	// Fond de la barre (celui de la carte) sous les boutons, au-dessus de l'ombre.
	UBorder* Bar = Cast<UBorder>(Keep(WidgetTree->ConstructWidget<UBorder>()));
	{
		FSlateBrush B = Sc::Rounded(Sc::Color(Cd, TEXT("backgroundColor")), 0);
		B.OutlineSettings.CornerRadii = FVector4(0, 0, Sc::Radius(Cd), Sc::Radius(Cd));
		Bar->SetBrush(B);
		PlaceIn(Canvas, Bar, Ar, 6);
	}
	const TArray<TSharedPtr<FJsonValue>>* Btns = nullptr;
	if (C->TryGetArrayField(TEXT("buttons"), Btns))
		for (const TSharedPtr<FJsonValue>& Bv : *Btns)
		{
			const Sc::FJ B = Bv->AsObject();
			const FString Id = Sc::Str(B, TEXT("id"));
			UButton* W = Cast<UButton>(Keep(Button(B, Sc::Str(B, TEXT("text")), nullptr)));
			if (Id == TEXT("resume")) W->OnClicked.AddDynamic(this, &UStridesPauseMenu::OnResume);
			else W->OnClicked.AddDynamic(this, &UStridesPauseMenu::OnOther);
			PlaceIn(Canvas, W, Box(B), 8);
			ActionButtons.Add(Id, W);
			ActionOrder.Add(Id);
			ActionBoxes.Add(Id, Box(B));
			Shown.Add(FString::Printf(TEXT("bouton %s=%s"), *Id, *Sc::Str(B, TEXT("text"))));
		}
	if (!ActionOrder.Contains(SelectedId) && ActionOrder.Num()) SelectedId = ActionOrder.Contains(TEXT("resume")) ? FString(TEXT("resume")) : ActionOrder.Last();
	PlaceSelRing();
}

void UStridesPauseMenu::PlaceSelRing()
{
	if (!Canvas || !ActionBoxes.Contains(SelectedId)) return;
	if (!SelRing)
	{
		SelRing = WidgetTree->ConstructWidget<UBorder>();
		Parts.Add(SelRing);
		FSlateBrush B;
		B.DrawAs = ESlateBrushDrawType::RoundedBox;
		B.TintColor = FSlateColor(FLinearColor(0, 0, 0, 0));
		B.OutlineSettings = FSlateBrushOutlineSettings(FVector4(10, 10, 10, 10), FSlateColor(FLinearColor(.49f, 1.f, .77f, 1.f)), 3.f);
		B.OutlineSettings.RoundingType = ESlateBrushRoundingType::FixedRadius;
		SelRing->SetBrush(B);
		SelRing->SetVisibility(ESlateVisibility::HitTestInvisible);
		PlaceIn(Canvas, SelRing, FVector4(0, 0, 1, 1), 9);
	}
	const FVector4 Bx = ActionBoxes[SelectedId];
	if (UCanvasPanelSlot* S = Cast<UCanvasPanelSlot>(SelRing->Slot))
	{
		S->SetPosition(FVector2D(Bx.X - 4, Bx.Y - 4));
		S->SetSize(FVector2D(Bx.Z + 8, Bx.W + 8));
	}
}

void UStridesPauseMenu::MoveSelection(int32 Dir)
{
	Refresh();
	if (!ActionOrder.Num()) return;
	int32 I = ActionOrder.IndexOfByKey(SelectedId);
	if (I == INDEX_NONE) I = ActionOrder.Num() - 1;
	SelectedId = ActionOrder[FMath::Clamp(I + (Dir > 0 ? 1 : -1), 0, ActionOrder.Num() - 1)];
	PlaceSelRing();
	UE_LOG(LogTemp, Display, TEXT("Strides pause : bouton choisi « %s »"), *SelectedId);
}

bool UStridesPauseMenu::PressSelected()
{
	Refresh();
	const FString Id = SelectedId;
	UE_LOG(LogTemp, Display, TEXT("Strides pause : bouton « %s » au clavier / à la manette"), *Id);
	return ClickForTest(Id);
}

void UStridesPauseMenu::RefreshLabels()
{
	if (!LineText || !AidText || !Doc.IsValid()) return;
	const UStridesSaveSubsystem* S = Save();
	const strides::Settings St = S ? S->GetSettings() : strides::SaveGame::fresh().settings;
	const Sc::FJ Lb = Sc::Obj(Doc, TEXT("labels"));
	auto Label = [&](const std::string& Key) -> FString
	{
		if (Key.empty()) return FString();
		if (Key == "aid.locked") return Sc::Str(Lb, TEXT("locked"));
		const FString K = UTF8_TO_TCHAR(Key.c_str());
		FString Group, Value;
		K.Split(TEXT("."), &Group, &Value);
		return Sc::Str(Sc::Obj(Lb, *Group), *Value);
	};
	LineText->SetText(FText::FromString(Label(strides::pauseLineLabelKey(St))));
	AidText->SetText(FText::FromString(Label(strides::pauseAidLabelKey(St, AidLocked()))));
	AidButton->SetIsEnabled(!AidLocked());
}

// Bascules (screens.js:228-243) : réglage changé, libellé relu, sauvegarde (saveSoon) ; l'aide vaut aussitôt pour
// l'épreuve en cours (aid() relit le réglage).
void UStridesPauseMenu::OnLine()
{
	if (UStridesSaveSubsystem* S = Save())
	{
		strides::toggleCourseLine(S->MutableSettings());
		S->SaveSettings();
	}
	RefreshLabels();
}

void UStridesPauseMenu::OnAid()
{
	if (AidLocked()) return;
	if (UStridesSaveSubsystem* S = Save())
	{
		strides::cycleJumpAid(S->MutableSettings());
		S->SaveSettings();
		if (AStridesCourse* C = RaceCourse()) C->SetJumpAid(UTF8_TO_TCHAR(strides::jumpAidOf(S->GetSettings()).c_str()));
	}
	RefreshLabels();
}

void UStridesPauseMenu::OnResume() { if (PC) PC->ResumeGame(); }

// Écran titre, Découvrir la vraie application Strides, Partager : écrans et liens hors du portage (sans effet).
void UStridesPauseMenu::OnOther() {}

FString UStridesPauseMenu::LineLabel() const { return LineText ? LineText->GetText().ToString() : FString(); }
FString UStridesPauseMenu::AidLabel() const { return AidText ? AidText->GetText().ToString() : FString(); }
bool UStridesPauseMenu::AidEnabled() const { return AidButton && AidButton->GetIsEnabled(); }

bool UStridesPauseMenu::ClickForTest(const FString& Id)
{
	if (Id == TEXT("pause-line") && LineButton) { OnLine(); return true; }
	if (Id == TEXT("pause-aid") && AidButton) { if (AidButton->GetIsEnabled()) OnAid(); return true; }
	if (Id == TEXT("resume") && ActionButtons.Contains(Id)) { OnResume(); return true; }
	if (ActionButtons.Contains(Id)) { OnOther(); return true; }
	return false;
}

TArray<FString> UStridesPauseMenu::Describe() const
{
	TArray<FString> L = Shown;
	if (LineText) L.Add(TEXT("pause-line=") + LineLabel());
	if (AidText) L.Add(TEXT("pause-aid=") + AidLabel());
	return L;
}
