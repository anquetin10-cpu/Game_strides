#include "StridesCsoScreens.h"

#include "Blueprint/WidgetLayoutLibrary.h"
#include "Blueprint/WidgetTree.h"
#include "Components/BackgroundBlur.h"
#include "Components/Border.h"
#include "Components/Button.h"
#include "Components/ButtonSlot.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/Image.h"
#include "Components/ScaleBox.h"
#include "Components/ScrollBox.h"
#include "Components/SizeBox.h"
#include "Components/TextBlock.h"
#include "Fonts/FontMeasure.h"
#include "Framework/Application/SlateApplication.h"
#include "Rendering/DrawElements.h"
#include "Rendering/SlateRenderer.h"
#include "StridesCourse.h"
#include "StridesCss.h"
#include "StridesCsoHud.h"
#include "StridesDataSubsystem.h"
#include "Styling/CoreStyle.h"
#include "Widgets/SLeafWidget.h"

// ---------- Plan du parcours en Slate ----------
namespace
{
namespace Sc = StridesCss;

// Couleur SVG « #rrggbb » (sRGB) et opacité → couleur linéaire ; « none » ou vide : transparente.
FLinearColor HexColor(const std::string& S, double Opacity)
{
	if (S.size() != 7 || S[0] != '#') return FLinearColor::Transparent;
	const FColor C = FColor::FromHex(FString(UTF8_TO_TCHAR(S.c_str())));
	FLinearColor L = FLinearColor::FromSRGBColor(FColor(C.R, C.G, C.B, 255));
	L.A = (float)Opacity;
	return L;
}
}  // namespace

class SStridesCoursePlan : public SLeafWidget
{
public:
	SLATE_BEGIN_ARGS(SStridesCoursePlan) {}
	SLATE_END_ARGS()
	void Construct(const FArguments&) {}
	void SetPlan(const strides::CoursePlan& InPlan, const FLinearColor& InBg, double InRad)
	{
		Plan = InPlan;
		Bg = InBg;
		Rad = InRad;
		Invalidate(EInvalidateWidgetReason::Paint);
	}
	TMap<FString, int32> Counts() const { return Drawn; }
	virtual FVector2D ComputeDesiredSize(float) const override { return FVector2D(Plan.vb[2], Plan.vb[3]); }
	virtual int32 OnPaint(const FPaintArgs& Args, const FGeometry& G, const FSlateRect& Clip, FSlateWindowElementList& Out, int32 Layer, const FWidgetStyle& Style, bool bParentEnabled) const override;

private:
	strides::CoursePlan Plan;
	FLinearColor Bg = FLinearColor::Transparent;
	double Rad = 0;
	mutable TMap<FString, int32> Drawn;
};

void UStridesCoursePlanView::Fit(const double Vb[4], const FVector2D& Box, double& OutScale, FVector2D& OutOrigin)
{
	// preserveAspectRatio par défaut (xMidYMid meet) : la plus petite échelle, contenu centré.
	OutScale = Vb[2] > 0 && Vb[3] > 0 ? FMath::Min(Box.X / Vb[2], Box.Y / Vb[3]) : 1.0;
	OutOrigin = FVector2D((Box.X - Vb[2] * OutScale) / 2 - Vb[0] * OutScale, (Box.Y - Vb[3] * OutScale) / 2 - Vb[1] * OutScale);
}

int32 SStridesCoursePlan::OnPaint(const FPaintArgs&, const FGeometry& G, const FSlateRect&, FSlateWindowElementList& Out, int32 Layer, const FWidgetStyle&, bool) const
{
	Drawn.Reset();
	const FVector2D Size = FVector2D(G.GetLocalSize());
	// Fond et arrondi de l'élément svg (.course-plan : background, border-radius).
	{
		FSlateBrush B = Sc::Rounded(Bg, Rad);
		FSlateDrawElement::MakeBox(Out, Layer, G.ToPaintGeometry(), &B, ESlateDrawEffect::None, Bg);
	}
	double S = 1;
	FVector2D O;
	UStridesCoursePlanView::Fit(Plan.vb, Size, S, O);
	auto P = [&](double X, double Y) { return FVector2f((float)(O.X + X * S), (float)(O.Y + Y * S)); };
	const FSlateRenderTransform& RT = G.GetAccumulatedRenderTransform();
	const FSlateBrush* White = FCoreStyle::Get().GetBrush("GenericWhiteBox");
	const FSlateResourceHandle WhiteH = FSlateApplication::IsInitialized() && FSlateApplication::Get().GetRenderer() ? FSlateApplication::Get().GetRenderer()->GetResourceHandle(*White) : FSlateResourceHandle();
	const TSharedRef<FSlateFontMeasure> Measure = FSlateApplication::Get().GetRenderer()->GetFontMeasureService();
	int32 L = Layer + 1;
	// Disque plein (cercle SVG, extrémité ronde d'un trait).
	auto Disc = [&](const FVector2f& C, double R, const FLinearColor& Col)
	{
		FSlateBrush B = Sc::Rounded(Col, R);
		FSlateDrawElement::MakeBox(Out, L, G.ToPaintGeometry(FVector2f((float)(2 * R), (float)(2 * R)), FSlateLayoutTransform(FVector2f(C.X - (float)R, C.Y - (float)R))), &B, ESlateDrawEffect::None, Col);
	};
	// Trait (plein ou en tirets : stroke-dasharray mesuré le long du tracé, depuis son début).
	auto Stroke = [&](const TArray<FVector2f>& Pts, const strides::PlanPrim& Pr)
	{
		const FLinearColor Col = HexColor(Pr.stroke, Pr.strokeOpacity);
		const float W = (float)(Pr.strokeWidth * S);
		if (Col.A <= 0 || W <= 0 || Pts.Num() < 2) return;
		if (Pr.dash[0] <= 0)
		{
			FSlateDrawElement::MakeLines(Out, L, G.ToPaintGeometry(), Pts, ESlateDrawEffect::None, Col, true, W);
			if (Pr.roundCap)
			{
				Disc(Pts[0], W / 2, Col);
				Disc(Pts.Last(), W / 2, Col);
			}
			return;
		}
		const double On = Pr.dash[0] * S, Off = Pr.dash[1] * S, Period = On + Off;
		double Acc = 0;  // abscisse le long du tracé (px)
		for (int32 I = 1; I < Pts.Num(); I++)
		{
			const FVector2f A = Pts[I - 1], B = Pts[I];
			const double Len = FVector2f::Distance(A, B);
			double T = 0;
			while (T < Len)
			{
				const double Ph = FMath::Fmod(Acc + T, Period);
				const bool bOn = Ph < On;
				const double Next = FMath::Min(Len, T + (bOn ? On - Ph : Period - Ph));
				if (bOn && Next > T)
				{
					const FVector2f D = (B - A) / (float)FMath::Max(Len, 1e-9);
					TArray<FVector2f> Seg = {A + D * (float)T, A + D * (float)Next};
					FSlateDrawElement::MakeLines(Out, L, G.ToPaintGeometry(), Seg, ESlateDrawEffect::None, Col, true, W);
				}
				T = Next;
			}
			Acc += Len;
		}
	};
	auto Count = [&](const TCHAR* K) { Drawn.FindOrAdd(K)++; };
	for (const strides::PlanPrim& Pr : Plan.prims)
	{
		const std::vector<double>& V = Pr.v;
		switch (Pr.kind)
		{
		case strides::PlanPrim::Kind::Rect:
		{
			if (V.size() < 4) break;
			const double Rx = V.size() > 4 ? V[4] * S : 0;
			const FVector2f A = P(V[0], V[1]);
			const FVector2f Sz((float)(V[2] * S), (float)(V[3] * S));
			const FLinearColor F = HexColor(Pr.fill, Pr.fillOpacity);
			if (F.A > 0)
			{
				FSlateBrush B = Sc::Rounded(F, Rx);
				FSlateDrawElement::MakeBox(Out, L, G.ToPaintGeometry(Sz, FSlateLayoutTransform(A)), &B, ESlateDrawEffect::None, F);
			}
			if (!Pr.stroke.empty() && Pr.stroke != "none")
			{
				// Contour du rectangle arrondi (arcs en 6 segments par angle).
				TArray<FVector2f> C;
				const float R = (float)FMath::Min<double>(Rx, FMath::Min(Sz.X, Sz.Y) / 2);
				const FVector2f Cs[4] = {A + FVector2f(Sz.X - R, R), A + FVector2f(Sz.X - R, Sz.Y - R), A + FVector2f(R, Sz.Y - R), A + FVector2f(R, R)};
				for (int32 K = 0; K < 4; K++)
					for (int32 J = 0; J <= 6; J++)
					{
						const double Ang = -UE_HALF_PI + K * UE_HALF_PI + J * UE_HALF_PI / 6;
						C.Add(Cs[K] + FVector2f((float)FMath::Cos(Ang), (float)FMath::Sin(Ang)) * R);
					}
				const FVector2f First = C[0];  // TArray::Add d'un de ses propres éléments : interdit (assertion)
				C.Add(First);
				Stroke(C, Pr);
			}
			Count(TEXT("rect"));
			break;
		}
		case strides::PlanPrim::Kind::Line:
			if (V.size() >= 4) Stroke({P(V[0], V[1]), P(V[2], V[3])}, Pr);
			Count(TEXT("line"));
			break;
		case strides::PlanPrim::Kind::Polyline:
		{
			TArray<FVector2f> Pts;
			for (size_t I = 0; I + 1 < V.size(); I += 2) Pts.Add(P(V[I], V[I + 1]));
			Stroke(Pts, Pr);
			Count(TEXT("polyline"));
			break;
		}
		case strides::PlanPrim::Kind::Path:
		{
			// Triangle plein (flèche du sens de saut) : chemin ouvert rempli (fermeture implicite du remplissage SVG).
			const FLinearColor F = HexColor(Pr.fill, Pr.fillOpacity);
			if (V.size() >= 6 && F.A > 0 && WhiteH.IsValid())
			{
				TArray<FSlateVertex> Vs;
				TArray<SlateIndex> Ix;
				const FColor C = F.ToFColor(true);
				for (size_t I = 0; I + 1 < V.size(); I += 2) Vs.Add(FSlateVertex::Make<ESlateVertexRounding::Disabled>(RT, P(V[I], V[I + 1]), FVector2f(0.5f, 0.5f), C));
				for (int32 I = 1; I + 1 < Vs.Num(); I++) Ix.Append({0, (SlateIndex)I, (SlateIndex)(I + 1)});
				FSlateDrawElement::MakeCustomVerts(Out, L, WhiteH, Vs, Ix, nullptr, 0, 0);
			}
			Count(TEXT("path"));
			break;
		}
		case strides::PlanPrim::Kind::Circle:
		{
			if (V.size() < 3) break;
			const FLinearColor F = HexColor(Pr.fill, Pr.fillOpacity);
			if (F.A > 0) Disc(P(V[0], V[1]), V[2] * S, F);
			if (!Pr.stroke.empty() && Pr.stroke != "none")
			{
				TArray<FVector2f> C;
				for (int32 J = 0; J <= 32; J++) C.Add(P(V[0] + V[2] * FMath::Cos(J * UE_TWO_PI / 32), V[1] + V[2] * FMath::Sin(J * UE_TWO_PI / 32)));
				Stroke(C, Pr);
			}
			Count(TEXT("circle"));
			break;
		}
		case strides::PlanPrim::Kind::Text:
		{
			if (V.size() < 2) break;
			// Police du moteur à la taille SVG (unités du viewBox × échelle, px CSS ; points Slate = px × 0,75), 700 en gras ;
			// x au centre (text-anchor middle) ou au début, y sur la ligne de base.
			const FString Tx = UTF8_TO_TCHAR(Pr.text.c_str());
			FSlateFontInfo Fo = FCoreStyle::GetDefaultFontStyle(Pr.bold ? TEXT("Bold") : TEXT("Regular"), (float)(Pr.fontSize * S * 0.75));
			const FVector2f Sz = FVector2f(Measure->Measure(Tx, Fo, 1.f));
			const float Ascent = (float)Measure->GetMaxCharacterHeight(Fo, 1.f) + (float)Measure->GetBaseline(Fo, 1.f);
			const FVector2f At = P(V[0], V[1]);
			const float X = Pr.anchor == "middle" ? At.X - Sz.X / 2 : Pr.anchor == "end" ? At.X - Sz.X : At.X;
			FSlateDrawElement::MakeText(Out, L, G.ToPaintGeometry(Sz, FSlateLayoutTransform(FVector2f(X, At.Y - Ascent))), Tx, Fo, ESlateDrawEffect::None, HexColor(Pr.fill.empty() ? std::string("#000000") : Pr.fill, Pr.fillOpacity));
			Count(TEXT("text"));
			break;
		}
		}
		L++;
	}
	return L;
}

void UStridesCoursePlanView::SetPlan(const strides::CoursePlan& InPlan, const FLinearColor& Background, double Radius)
{
	Data = InPlan;
	Bg = Background;
	Rad = Radius;
	if (Slate.IsValid()) StaticCastSharedPtr<SStridesCoursePlan>(Slate)->SetPlan(Data, Bg, Rad);
}

TMap<FString, int32> UStridesCoursePlanView::DrawnCounts() const
{
	return Slate.IsValid() ? StaticCastSharedPtr<SStridesCoursePlan>(Slate)->Counts() : TMap<FString, int32>();
}

TSharedRef<SWidget> UStridesCoursePlanView::RebuildWidget()
{
	TSharedRef<SStridesCoursePlan> W = SNew(SStridesCoursePlan);
	W->SetPlan(Data, Bg, Rad);
	Slate = W;
	return W;
}

void UStridesCoursePlanView::ReleaseSlateResources(bool bReleaseChildren)
{
	Super::ReleaseSlateResources(bReleaseChildren);
	Slate.Reset();
}

// ---------- Cartes et dialogue ----------
namespace
{
void PlaceAt(UCanvasPanel* C, UWidget* W, const FVector4& Box, int32 Z = 0)
{
	UCanvasPanelSlot* S = C->AddChildToCanvas(W);
	S->SetAnchors(FAnchors(0, 0));
	S->SetAlignment(FVector2D::ZeroVector);
	S->SetPosition(FVector2D(Box.X, Box.Y));
	S->SetSize(FVector2D(Box.Z, Box.W));
	S->SetZOrder(Z);
}
FString U(const std::string& S) { return UTF8_TO_TCHAR(S.c_str()); }
}  // namespace

void UStridesCsoScreens::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	Build();
}

void UStridesCsoScreens::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	Refresh();
}

FVector2D UStridesCsoScreens::ViewCss() const
{
	if (!TestView.IsZero()) return TestView;
	const FVector2D Px = UWidgetLayoutLibrary::GetViewportSize(const_cast<UStridesCsoScreens*>(this));
	return Px.X > 0 ? Px / UStridesCsoHud::PixelRatio() : FVector2D(844, 390);
}

void UStridesCsoScreens::Build()
{
	if (!WidgetTree || Root) return;
	Root = WidgetTree->ConstructWidget<UCanvasPanel>(UCanvasPanel::StaticClass(), TEXT("ScreensRoot"));
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
}

void UStridesCsoScreens::Clear()
{
	for (UWidget* W : Parts) if (W) W->RemoveFromParent();
	Parts.Reset();
	Textures.Reset();
	Shown.Reset();
	ButtonIds.Reset();
	Boxes.Reset();
	PlanW = nullptr;
}

void UStridesCsoScreens::Refresh()
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
	int32 Which = 0;
	bool bDlg = false;
	FString Key;
	if (Course)
	{
		Which = Course->Screen() == AStridesCourse::EScreen::Presentation ? 1 : Course->Screen() == AStridesCourse::EScreen::Plan ? 2 : 0;
		bDlg = Course->DialogOpen();
		const strides::CsoCall& Dc = Course->DialogCall();
		Key = FString::Printf(TEXT("%d|%d|%s|%s|%.2fx%.2f|%s"), Which, bDlg, *Course->Lang, *U(Course->PresentationInput().horseName), V.X, V.Y,
			bDlg && Dc.args.size() > 2 ? *U(Dc.args[2].s) : TEXT(""));
	}
	if (Key != ShownKey)
	{
		Clear();
		if (Which) BuildCard(Which, V);
		if (bDlg) BuildDialog(V);
		ShownKey = Key;
	}
	ShownScreen = Which;
	bDialogShown = bDlg;
	Root->SetVisibility(Which || bDlg ? ESlateVisibility::SelfHitTestInvisible : ESlateVisibility::Collapsed);
}

void UStridesCsoScreens::BuildCard(int32 Which, const FVector2D& ViewCss)
{
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	const Sc::FJ Doc = Data ? Data->CsoScreensStyle() : nullptr;
	const TArray<TSharedPtr<FJsonValue>>* Views = nullptr;
	if (!Course || !Doc.IsValid() || !Doc->TryGetArrayField(TEXT("views"), Views) || !Views->Num()) return;
	// Relevé du viewport le plus proche en hauteur ; carte centrée (overlay flex) : décalage au viewport courant.
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
	const Sc::FJ C = Sc::Obj(View, Which == 1 ? TEXT("presentation") : TEXT("plan"));
	const FVector2D Off((ViewCss.X - View0.X) / 2, (ViewCss.Y - View0.Y) / 2);
	auto Box = [&](const Sc::FJ& E) { const FVector4 R = Sc::Rect(E); return FVector4(R.X + Off.X, R.Y + Off.Y, R.Z, R.W); };
	auto Keep = [this](UWidget* W) { Parts.Add(W); return W; };
	auto Text = [&](const Sc::FJ& E, const FString& S)
	{
		UTextBlock* T = WidgetTree->ConstructWidget<UTextBlock>();
		T->SetText(Sc::Cased(E, S));
		T->SetFont(Sc::Font(E));
		FLinearColor Col = Sc::Color(E, TEXT("color"));
		Col.A *= (float)Sc::Num(E, TEXT("opacity"), 1);
		T->SetColorAndOpacity(FSlateColor(Col));
		T->SetAutoWrapText(true);
		// Interligne du web (line-height, px) rapporté à celui de la police du moteur (1,171 em) : approché.
		const double Fs = Sc::Num(E, TEXT("fontSize"), 15) * 1.171;
		T->SetLineHeightPercentage((float)(Sc::Num(E, TEXT("lineHeight"), Fs) / Fs));
		return T;
	};
	auto Button = [&](const Sc::FJ& E, const FString& Label)
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
		return B;
	};

	// Voile et flou de l'arrière-plan (.overlay : backdrop-filter blur(6px), fond rgba(10,10,9,.45)) ; le voile reçoit les
	// touchers hors de la carte (le jeu ne les voit pas, comme sous l'overlay du web).
	const Sc::FJ Ov = Sc::Obj(C, TEXT("overlay"));
	{
		UBackgroundBlur* Blur = Cast<UBackgroundBlur>(Keep(WidgetTree->ConstructWidget<UBackgroundBlur>()));
		const FString F = Sc::Str(Ov, TEXT("backdropFilter"));
		Blur->SetBlurStrength(F.StartsWith(TEXT("blur(")) ? (float)FCString::Atod(*F.Mid(5)) : 0.f);
		PlaceAt(Canvas, Blur, FVector4(0, 0, ViewCss.X, ViewCss.Y), 0);
		UBorder* Veil = Cast<UBorder>(Keep(WidgetTree->ConstructWidget<UBorder>()));
		Veil->SetBrushColor(Sc::Color(Ov, TEXT("backgroundColor")));
		Veil->SetVisibility(ESlateVisibility::Visible);
		PlaceAt(Canvas, Veil, FVector4(0, 0, ViewCss.X, ViewCss.Y), 1);
	}
	// Carte : ombre, fond arrondi bordé.
	const Sc::FJ Cd = Sc::Obj(C, TEXT("card"));
	const FVector4 Cr = Box(Cd);
	Boxes.Add(TEXT("card"), Cr);
	const Sc::FShadow Sh = Sc::Shadow(Cd);
	if (Sh.bOn)
	{
		const int32 Bl = (int32)FMath::CeilToInt(Sh.Blur);
		UTexture2D* T = Sc::SoftShadowTexture((int32)Cr.Z + 2 * Bl, (int32)Cr.W + 2 * Bl, Sc::Radius(Cd), Sh.Blur);
		Textures.Add(T);
		UImage* I = Cast<UImage>(Keep(WidgetTree->ConstructWidget<UImage>()));
		I->SetBrush(Sc::ImageBrush(T, FVector2D(Cr.Z + 2 * Bl, Cr.W + 2 * Bl), Sh.Color));
		PlaceAt(Canvas, I, FVector4(Cr.X + Sh.Offset.X - Bl, Cr.Y + Sh.Offset.Y - Bl, Cr.Z + 2 * Bl, Cr.W + 2 * Bl), 2);
	}
	UBorder* Card = Cast<UBorder>(Keep(WidgetTree->ConstructWidget<UBorder>()));
	Card->SetBrush(Sc::BoxOf(Cd));
	PlaceAt(Canvas, Card, Cr, 3);
	// Corps défilable : contenu posé aux boîtes du relevé (relatives au corps), hauteur de défilement du relevé.
	const Sc::FJ Bd = Sc::Obj(C, TEXT("body"));
	const FVector4 Br = Box(Bd);
	UScrollBox* Scroll = Cast<UScrollBox>(Keep(WidgetTree->ConstructWidget<UScrollBox>()));
	Scroll->SetScrollBarVisibility(ESlateVisibility::Collapsed);
	PlaceAt(Canvas, Scroll, Br, 4);
	USizeBox* Content = WidgetTree->ConstructWidget<USizeBox>();
	Content->SetHeightOverride(Sc::Num(Bd, TEXT("scrollHeight"), Br.W));
	Content->SetWidthOverride(Br.Z);
	Scroll->AddChild(Content);
	UCanvasPanel* In = WidgetTree->ConstructWidget<UCanvasPanel>();
	Content->AddChild(In);
	auto InBody = [&](const Sc::FJ& E) { const FVector4 R = Box(E); return FVector4(R.X - Br.X, R.Y - Br.Y, R.Z, R.W); };
	auto Put = [&](const TCHAR* Part, const Sc::FJ& E, const FString& S)
	{
		if (!E.IsValid()) return;
		PlaceAt(In, Text(E, S), InBody(E));
		Boxes.Add(Part, Box(E));
		Shown.Add(FString::Printf(TEXT("%s=%s"), Part, *Sc::Cased(E, S).ToString()));
	};
	struct FBtn { FString Id, Label; bool bPrimary; };
	TArray<FBtn> Btns;
	if (Which == 1)
	{
		// Présentation (showPresentation) : textes du cœur, mise en page du relevé.
		const strides::CsoPresentation Pr = Course->Presentation();
		Put(TEXT("kicker"), Sc::Obj(C, TEXT("kicker")), U(Pr.kicker));
		Put(TEXT("title"), Sc::Obj(C, TEXT("title")), U(Pr.title));
		const TArray<TSharedPtr<FJsonValue>>* Ks = nullptr;
		const TArray<TSharedPtr<FJsonValue>>* Vs = nullptr;
		C->TryGetArrayField(TEXT("keys"), Ks);
		C->TryGetArrayField(TEXT("values"), Vs);
		for (int32 I = 0; I < (int32)Pr.rows.size(); I++)
		{
			if (!Ks || !Vs || I >= Ks->Num() || I >= Vs->Num())
			{
				Shown.Add(FString::Printf(TEXT("k%d=%s (sans boîte relevée)"), I, *U(Pr.rows[(size_t)I].first)));
				continue;
			}
			Put(*FString::Printf(TEXT("k%d"), I), (*Ks)[I]->AsObject(), U(Pr.rows[(size_t)I].first));
			Put(*FString::Printf(TEXT("v%d"), I), (*Vs)[I]->AsObject(), U(Pr.rows[(size_t)I].second));
		}
		// Lignes du jury : aucune pour le Parcours du Pôle (pas de boîte relevée) ; signalées si présentes.
		if (!Pr.jury.empty()) Put(TEXT("jury"), Sc::Obj(C, TEXT("jury")).IsValid() ? Sc::Obj(C, TEXT("jury")) : Sc::Obj(C, TEXT("rules")), U(Pr.jury));
		Put(TEXT("rules"), Sc::Obj(C, TEXT("rules")), U(Pr.rules));
		Btns = {{TEXT("plan"), U(Pr.planLabel), false}, {TEXT("enter"), U(Pr.enterLabel), true}};
	}
	else
	{
		// Plan (showPlan) : kicker, titre, plan dessiné des primitives du cœur, légende.
		const strides::CsoPlanCard Pc = Course->PlanCard();
		Put(TEXT("kicker"), Sc::Obj(C, TEXT("kicker")), U(Pc.kicker));
		Put(TEXT("title"), Sc::Obj(C, TEXT("title")), U(Pc.title));
		const Sc::FJ Sv = Sc::Obj(C, TEXT("svg"));
		if (Sv.IsValid())
		{
			const strides::CoursePlan Plan = Course->Plan();
			PlanW = WidgetTree->ConstructWidget<UStridesCoursePlanView>();
			PlanW->SetPlan(Plan, Sc::Color(Sv, TEXT("backgroundColor")), Sc::Radius(Sv));
			PlaceAt(In, PlanW, InBody(Sv));
			Boxes.Add(TEXT("svg"), Box(Sv));
			TMap<FString, int32> N;
			for (const strides::PlanPrim& P : Plan.prims)
				N.FindOrAdd(P.kind == strides::PlanPrim::Kind::Rect ? TEXT("rect") : P.kind == strides::PlanPrim::Kind::Line ? TEXT("line") : P.kind == strides::PlanPrim::Kind::Polyline ? TEXT("polyline") : P.kind == strides::PlanPrim::Kind::Path ? TEXT("path") : P.kind == strides::PlanPrim::Kind::Circle ? TEXT("circle") : TEXT("text"))++;
			FString Texts;
			for (const strides::PlanPrim& P : Plan.prims) if (P.kind == strides::PlanPrim::Kind::Text) Texts += (Texts.IsEmpty() ? TEXT("") : TEXT(",")) + U(P.text);
			Shown.Add(FString::Printf(TEXT("svg=viewBox %s ; %d rect, %d line, %d polyline, %d path, %d circle, %d text ; textes %s"), *U(Plan.viewBox), N.FindRef(TEXT("rect")), N.FindRef(TEXT("line")),
				N.FindRef(TEXT("polyline")), N.FindRef(TEXT("path")), N.FindRef(TEXT("circle")), N.FindRef(TEXT("text")), *Texts));
		}
		Put(TEXT("legend"), Sc::Obj(C, TEXT("legend")), U(Pc.legend));
		Btns = {{TEXT("plan-back"), U(Pc.backLabel), true}};
	}
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
			PlaceAt(Canvas, I, FVector4(Ar.X + As.Offset.X - Bl, Ar.Y + As.Offset.Y - Bl, Ar.Z + 2 * Bl, Ar.W + 2 * Bl), 5);
		}
		UBorder* Top = Cast<UBorder>(Keep(WidgetTree->ConstructWidget<UBorder>()));
		Top->SetBrushColor(Sc::Color(Ac, TEXT("borderTopColor")));
		PlaceAt(Canvas, Top, FVector4(Ar.X, Ar.Y, Ar.Z, Sc::Num(Ac, TEXT("borderTopWidth"), 1)), 7);
	}
	UBorder* Bar = Cast<UBorder>(Keep(WidgetTree->ConstructWidget<UBorder>()));
	{
		FSlateBrush B = Sc::Rounded(Sc::Color(Cd, TEXT("backgroundColor")), 0);
		B.OutlineSettings.CornerRadii = FVector4(0, 0, Sc::Radius(Cd), Sc::Radius(Cd));
		Bar->SetBrush(B);
		PlaceAt(Canvas, Bar, Ar, 6);
	}
	// Boutons : boîtes et styles relevés (btn, btn primary), libellés du cœur.
	const TArray<TSharedPtr<FJsonValue>>* Bs = nullptr;
	C->TryGetArrayField(TEXT("buttons"), Bs);
	for (const FBtn& Bn : Btns)
	{
		Sc::FJ E;
		if (Bs)
			for (const TSharedPtr<FJsonValue>& Bv : *Bs)
				if (Sc::Str(Bv->AsObject(), TEXT("id")) == Bn.Id) E = Bv->AsObject();
		if (!E.IsValid()) continue;
		UButton* W = Cast<UButton>(Keep(Button(E, Bn.Label)));
		if (Bn.Id == TEXT("plan")) W->OnClicked.AddDynamic(this, &UStridesCsoScreens::OnPlan);
		else if (Bn.Id == TEXT("plan-back")) W->OnClicked.AddDynamic(this, &UStridesCsoScreens::OnBack);
		else W->OnClicked.AddDynamic(this, &UStridesCsoScreens::OnEnter);
		PlaceAt(Canvas, W, Box(E), 8);
		Boxes.Add(Bn.Id, Box(E));
		ButtonIds.Add(Bn.Id);
		Shown.Add(FString::Printf(TEXT("bouton %s=%s%s"), *Bn.Id, *Bn.Label, Bn.bPrimary ? TEXT(" (primary)") : TEXT("")));
	}
}

void UStridesCsoScreens::BuildDialog(const FVector2D& ViewCss)
{
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	const Sc::FJ Doc = Data ? Data->CsoScreensStyle() : nullptr;
	const TArray<TSharedPtr<FJsonValue>>* Views = nullptr;
	if (!Course || !Doc.IsValid() || !Doc->TryGetArrayField(TEXT("views"), Views) || !Views->Num()) return;
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
	const Sc::FJ Dg = Sc::Obj(View, TEXT("dialog"));
	const Sc::FJ Bx = Sc::Obj(Dg, TEXT("dialog"));
	if (!Bx.IsValid()) return;
	// Centré en largeur, ancré en bas (.dialog : left 50 %, bottom) ; hauteur du relevé (texte du contrôle de capacité).
	const FVector2D Off((ViewCss.X - View0.X) / 2, ViewCss.Y - View0.Y);
	auto Box = [&](const Sc::FJ& E) { const FVector4 R = Sc::Rect(E); return FVector4(R.X + Off.X, R.Y + Off.Y, R.Z, R.W); };
	auto Keep = [this](UWidget* W) { Parts.Add(W); return W; };
	const strides::CsoCall& Call = Course->DialogCall();
	const FString Who = Call.args.size() > 0 ? U(Call.args[0].s) : FString();
	FString Ini = Call.args.size() > 1 ? U(Call.args[1].s) : FString();
	if (Ini.IsEmpty()) Ini = (Who.IsEmpty() ? FString(TEXT("?")) : Who.Left(2)).ToUpper();
	const FString Line = Call.args.size() > 2 ? U(Call.args[2].s) : FString();
	const FString Next = U(Course->Texts().t("Toucher pour fermer", Course->RunLang()));
	const FVector4 R = Box(Bx);
	Boxes.Add(TEXT("dialog"), R);
	const Sc::FShadow Sh = Sc::Shadow(Bx);
	if (Sh.bOn)
	{
		const int32 Bl = (int32)FMath::CeilToInt(Sh.Blur);
		UTexture2D* T = Sc::SoftShadowTexture((int32)R.Z + 2 * Bl, (int32)R.W + 2 * Bl, Sc::Radius(Bx), Sh.Blur);
		Textures.Add(T);
		UImage* I = Cast<UImage>(Keep(WidgetTree->ConstructWidget<UImage>()));
		I->SetBrush(Sc::ImageBrush(T, FVector2D(R.Z + 2 * Bl, R.W + 2 * Bl), Sh.Color));
		PlaceAt(Canvas, I, FVector4(R.X + Sh.Offset.X - Bl, R.Y + Sh.Offset.Y - Bl, R.Z + 2 * Bl, R.W + 2 * Bl), 20);
	}
	// Flou de l'arrière-plan (backdrop-filter blur(14px)) borné à la boîte, puis fond vitré arrondi bordé.
	{
		UBackgroundBlur* Blur = Cast<UBackgroundBlur>(Keep(WidgetTree->ConstructWidget<UBackgroundBlur>()));
		const FString F = Sc::Str(Bx, TEXT("backdropFilter"));
		Blur->SetBlurStrength(F.StartsWith(TEXT("blur(")) ? (float)FCString::Atod(*F.Mid(5)) : 0.f);
		Blur->SetCornerRadius(FVector4(Sc::Radius(Bx), Sc::Radius(Bx), Sc::Radius(Bx), Sc::Radius(Bx)));
		PlaceAt(Canvas, Blur, R, 21);
	}
	// Toute la boîte se touche pour fermer (tap(this.dialogEl, advanceDialog)).
	UButton* Hit = WidgetTree->ConstructWidget<UButton>();
	{
		const FSlateBrush Br = Sc::BoxOf(Bx);
		FButtonStyle St;
		St.SetNormal(Br);
		St.SetHovered(Br);
		St.SetPressed(Br);
		St.SetDisabled(Br);
		Hit->SetStyle(St);
		Hit->SetBackgroundColor(FLinearColor::White);
		Hit->OnClicked.AddDynamic(this, &UStridesCsoScreens::OnDialog);
		Keep(Hit);
		PlaceAt(Canvas, Hit, R, 22);
	}
	auto Text = [&](const Sc::FJ& E, const FString& S)
	{
		UTextBlock* T = WidgetTree->ConstructWidget<UTextBlock>();
		T->SetText(Sc::Cased(E, S));
		T->SetFont(Sc::Font(E));
		FLinearColor Col = Sc::Color(E, TEXT("color"));
		Col.A *= (float)Sc::Num(E, TEXT("opacity"), 1);
		T->SetColorAndOpacity(FSlateColor(Col));
		T->SetAutoWrapText(true);
		T->SetVisibility(ESlateVisibility::HitTestInvisible);
		const double Fs = Sc::Num(E, TEXT("fontSize"), 15) * 1.171;
		T->SetLineHeightPercentage((float)(Sc::Num(E, TEXT("lineHeight"), Fs) / Fs));
		return T;
	};
	const Sc::FJ Av = Sc::Obj(Dg, TEXT("av")), Nm = Sc::Obj(Dg, TEXT("name")), Nx = Sc::Obj(Dg, TEXT("next")), Ln = Sc::Obj(Dg, TEXT("line"));
	// Pastille des initiales (disque, texte centré).
	{
		UBorder* Disc = Cast<UBorder>(Keep(WidgetTree->ConstructWidget<UBorder>()));
		Disc->SetBrush(Sc::BoxOf(Av));
		Disc->SetVisibility(ESlateVisibility::HitTestInvisible);
		UTextBlock* T = Text(Av, Ini);
		T->SetJustification(ETextJustify::Center);
		Disc->SetContent(T);
		Disc->SetHorizontalAlignment(HAlign_Center);
		Disc->SetVerticalAlignment(VAlign_Center);
		PlaceAt(Canvas, Disc, Box(Av), 23);
		Boxes.Add(TEXT("av"), Box(Av));
	}
	auto Put = [&](const TCHAR* Part, const Sc::FJ& E, const FString& S)
	{
		UTextBlock* T = Text(E, S);
		PlaceAt(Canvas, T, Box(E), 23);
		Boxes.Add(Part, Box(E));
		Shown.Add(FString::Printf(TEXT("%s=%s"), Part, *Sc::Cased(E, S).ToString()));
	};
	Shown.Add(TEXT("av=") + Ini);
	Put(TEXT("who"), Nm, Who);
	{
		// « Toucher pour fermer » aligné à droite (margin-left: auto) : boîte relevée élargie vers la gauche.
		FVector4 B = Box(Nx);
		UTextBlock* T = Text(Nx, Next);
		T->SetJustification(ETextJustify::Right);
		T->SetAutoWrapText(false);
		PlaceAt(Canvas, T, FVector4(B.X + B.Z - 240, B.Y, 240, B.W + 4), 23);
		Boxes.Add(TEXT("next"), B);
		Shown.Add(TEXT("next=") + Sc::Cased(Nx, Next).ToString());
	}
	Put(TEXT("line"), Ln, Line);
}

void UStridesCsoScreens::OnPlan() { if (Course) Course->PressScreenButton(TEXT("plan")); Refresh(); }
void UStridesCsoScreens::OnBack() { if (Course) Course->PressScreenButton(TEXT("plan-back")); Refresh(); }
void UStridesCsoScreens::OnEnter() { if (Course) Course->PressScreenButton(TEXT("enter")); Refresh(); }
void UStridesCsoScreens::OnDialog() { if (Course) Course->AdvanceDialog(); Refresh(); }

bool UStridesCsoScreens::ClickForTest(const FString& Id)
{
	Refresh();
	if (Id == TEXT("dialog"))
	{
		if (!bDialogShown) return false;
		OnDialog();
		return true;
	}
	if (!ButtonIds.Contains(Id)) return false;
	if (Id == TEXT("plan")) OnPlan();
	else if (Id == TEXT("plan-back")) OnBack();
	else if (Id == TEXT("enter")) OnEnter();
	return true;
}
