#include "StridesCsoHud.h"

#include "Blueprint/WidgetLayoutLibrary.h"
#include "Blueprint/WidgetTree.h"
#include "Components/Border.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/HorizontalBox.h"
#include "Components/HorizontalBoxSlot.h"
#include "Components/Image.h"
#include "Engine/Texture2D.h"
#include "Components/RichTextBlock.h"
#include "Components/ScaleBox.h"
#include "Components/SizeBox.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"
#include "Dom/JsonObject.h"
#include "Engine/DataTable.h"
#include "EngineUtils.h"
#include "HAL/PlatformApplicationMisc.h"
#include "Styling/CoreStyle.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"

namespace
{
using FJ = TSharedPtr<FJsonObject>;

FJ CssObj(const FJ& O, const TCHAR* K)
{
	const TSharedPtr<FJsonObject>* R = nullptr;
	return O.IsValid() && O->TryGetObjectField(K, R) ? *R : FJ();
}
FString CssStr(const FJ& E, const TCHAR* K)
{
	FString S;
	if (E.IsValid()) E->TryGetStringField(K, S);
	return S;
}
// « 12px », « 600 », « 0.55 » → nombre ; « normal » et absent → Def.
double CssNum(const FJ& E, const TCHAR* K, double Def = 0)
{
	const FString S = CssStr(E, K);
	if (S.IsEmpty() || !(FChar::IsDigit(S[0]) || S[0] == '-' || S[0] == '.')) return Def;
	return FCString::Atod(*S);
}
// Boîte relevée par getBoundingClientRect : x, y, largeur, hauteur (px CSS).
FVector4 CssRect(const FJ& E)
{
	const TArray<TSharedPtr<FJsonValue>>* A = nullptr;
	if (!E.IsValid() || !E->TryGetArrayField(TEXT("rect"), A) || A->Num() != 4) return FVector4(0, 0, 0, 0);
	return FVector4((*A)[0]->AsNumber(), (*A)[1]->AsNumber(), (*A)[2]->AsNumber(), (*A)[3]->AsNumber());
}
// Couleur CSS calculée (« rgb(r, g, b) » ou « rgba(r, g, b, a) », sRGB) → couleur linéaire de Slate.
FLinearColor CssColor(const FJ& E, const TCHAR* K)
{
	FString S = CssStr(E, K);
	int32 Open = INDEX_NONE;
	if (!S.FindChar('(', Open)) return FLinearColor::Transparent;
	S = S.Mid(Open + 1).Replace(TEXT(")"), TEXT(""));
	TArray<FString> P;
	S.ParseIntoArray(P, TEXT(","));
	if (P.Num() < 3) return FLinearColor::Transparent;
	const FColor C((uint8)FCString::Atoi(*P[0].TrimStartAndEnd()), (uint8)FCString::Atoi(*P[1].TrimStartAndEnd()), (uint8)FCString::Atoi(*P[2].TrimStartAndEnd()));
	FLinearColor L = FLinearColor::FromSRGBColor(C);
	L.A = P.Num() > 3 ? FCString::Atof(*P[3].TrimStartAndEnd()) : 1.f;
	return L;
}
// Largeur maximale calculée (« 260px », « 100% », « min(100%, 420px) », « none ») dans un conteneur de largeur
// Container.
double CssMaxWidth(const FJ& E, double Container)
{
	FString S = CssStr(E, TEXT("maxWidth")).TrimStartAndEnd();
	if (S.StartsWith(TEXT("min(")))
	{
		S = S.Mid(4).Replace(TEXT(")"), TEXT(""));
		TArray<FString> P;
		S.ParseIntoArray(P, TEXT(","));
		double M = Container;
		for (const FString& X : P)
		{
			const FString T = X.TrimStartAndEnd();
			M = FMath::Min(M, T.EndsWith(TEXT("%")) ? FCString::Atod(*T) * Container / 100 : FCString::Atod(*T));
		}
		return M;
	}
	if (S.EndsWith(TEXT("%"))) return FCString::Atod(*S) * Container / 100;
	if (S.IsEmpty() || S == TEXT("none")) return Container;
	return FCString::Atod(*S);
}
// « ▸ » (U+25B8) : absent de toutes les polices du moteur (Roboto, Droid Sans Mono, Droid Sans Fallback) ; dessiné
// comme un petit triangle plein (texture de 32 × 32 px, bords lissés par suréchantillonnage 4 × 4), teinté comme le texte.
UTexture2D* TriangleTexture()
{
	const int32 N = 32;
	UTexture2D* T = UTexture2D::CreateTransient(N, N, PF_B8G8R8A8);
	if (!T) return nullptr;
	FTexture2DMipMap& Mip = T->GetPlatformData()->Mips[0];
	uint8* D = (uint8*)Mip.BulkData.Lock(LOCK_READ_WRITE);
	for (int32 Y = 0; Y < N; Y++)
		for (int32 X = 0; X < N; X++)
		{
			int32 In = 0;
			for (int32 Sy = 0; Sy < 4; Sy++)
				for (int32 Sx = 0; Sx < 4; Sx++)
				{
					const double U = (X + (Sx + .5) / 4) / N, V = (Y + (Sy + .5) / 4) / N;
					In += U >= 0 && V >= U * .5 && V <= 1 - U * .5;  // sommets (0, 0), (1, 0,5), (0, 1)
				}
			uint8* Px = D + (Y * N + X) * 4;
			Px[0] = Px[1] = Px[2] = 255;
			Px[3] = (uint8)(In * 255 / 16);
		}
	Mip.BulkData.Unlock();
	T->UpdateResource();
	return T;
}

FMargin CssPadding(const FJ& E)
{
	return FMargin(CssNum(E, TEXT("paddingLeft")), CssNum(E, TEXT("paddingTop")), CssNum(E, TEXT("paddingRight")), CssNum(E, TEXT("paddingBottom")));
}
// Police : la pile du web (Geist, Geist Mono, chargées depuis Google Fonts) n'est pas embarquée ; police du moteur
// (Roboto ; « Mono » = Droid Sans Mono) à la même taille en px CSS (taille Slate en points à 96 ppp : px × 0,75), graisse
// 700 et 600 en gras, 500 en « Medium » (Regular si absente), espacement des lettres en millièmes d'em.
FSlateFontInfo CssFont(const FJ& E)
{
	const bool bMono = CssStr(E, TEXT("fontFamily")).Contains(TEXT("Mono"));
	const double W = CssNum(E, TEXT("fontWeight"), 400), Px = CssNum(E, TEXT("fontSize"), 13);
	const TCHAR* Face = W >= 550 ? TEXT("Bold") : bMono ? TEXT("Mono") : W >= 450 ? TEXT("Medium") : TEXT("Regular");
	if (bMono && W < 650) Face = TEXT("Mono");
	FSlateFontInfo F = FCoreStyle::GetDefaultFontStyle(Face, (float)(Px * 0.75));
	F.LetterSpacing = (int32)FMath::RoundToInt(CssNum(E, TEXT("letterSpacing")) / FMath::Max(1.0, Px) * 1000.0);
	return F;
}
FSlateBrush Rounded(const FLinearColor& Fill, double Radius, const FLinearColor& Outline = FLinearColor::Transparent, double OutlineW = 0)
{
	FSlateBrush B;
	B.DrawAs = ESlateBrushDrawType::RoundedBox;
	B.TintColor = FSlateColor(Fill);
	B.OutlineSettings.CornerRadii = FVector4(Radius, Radius, Radius, Radius);
	B.OutlineSettings.RoundingType = ESlateBrushRoundingType::FixedRadius;
	B.OutlineSettings.Color = FSlateColor(Outline);
	B.OutlineSettings.Width = (float)OutlineW;
	return B;
}
FSlateBrush BoxOf(const FJ& E)
{
	return Rounded(CssColor(E, TEXT("backgroundColor")), CssNum(E, TEXT("borderTopLeftRadius")), CssColor(E, TEXT("borderTopColor")), CssNum(E, TEXT("borderTopWidth")));
}
// Courbe cubic-bezier CSS (x1, y1, x2, y2) en t (résolution de x par Newton puis dichotomie).
double Bezier(double X1, double Y1, double X2, double Y2, double T)
{
	if (T <= 0) return 0;
	if (T >= 1) return 1;
	auto Bx = [&](double U) { return 3 * X1 * U * (1 - U) * (1 - U) + 3 * X2 * U * U * (1 - U) + U * U * U; };
	auto By = [&](double U) { return 3 * Y1 * U * (1 - U) * (1 - U) + 3 * Y2 * U * U * (1 - U) + U * U * U; };
	double Lo = 0, Hi = 1, U = T;
	for (int32 I = 0; I < 40; I++)
	{
		const double X = Bx(U);
		if (FMath::Abs(X - T) < 1e-7) break;
		if (X < T) Lo = U; else Hi = U;
		U = (Lo + Hi) / 2;
	}
	return By(U);
}
double EaseOut(double T) { return Bezier(0, 0, .58, 1, T); }
double Ease(double T) { return Bezier(.25, .1, .25, 1, T); }
FText CssText(const std::string& S) { return FText::FromString(UTF8_TO_TCHAR(S.c_str())); }
void CssSet(UTextBlock* T, const FJ& E)
{
	T->SetFont(CssFont(E));
	T->SetColorAndOpacity(FSlateColor(CssColor(E, TEXT("color"))));
}
}  // namespace

void UStridesCsoHud::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	SetVisibility(ESlateVisibility::HitTestInvisible);
	Build();
}

void UStridesCsoHud::Build()
{
	if (!WidgetTree) return;
	auto Make = [this](UClass* C, const TCHAR* Name = nullptr) { return WidgetTree->ConstructWidget<UWidget>(C, Name ? FName(Name) : NAME_None); };
	Root = Cast<UCanvasPanel>(Make(UCanvasPanel::StaticClass(), TEXT("CsoHudRoot")));
	WidgetTree->RootWidget = Root;
	Scale = Cast<UScaleBox>(Make(UScaleBox::StaticClass()));
	Scale->SetStretch(EStretch::UserSpecified);
	UCanvasPanelSlot* S0 = Root->AddChildToCanvas(Scale);
	S0->SetAnchors(FAnchors(0, 0));
	S0->SetAutoSize(true);
	S0->SetPosition(FVector2D::ZeroVector);
	Css = Cast<USizeBox>(Make(USizeBox::StaticClass()));
	Scale->AddChild(Css);
	Canvas = Cast<UCanvasPanel>(Make(UCanvasPanel::StaticClass()));
	Css->AddChild(Canvas);

	// Colonne du haut (.top-mid) : tableau, mot d'appel, astuce, toasts.
	TopMidBox = Cast<USizeBox>(Make(USizeBox::StaticClass()));
	UCanvasPanelSlot* TS = Canvas->AddChildToCanvas(TopMidBox);
	TS->SetAutoSize(true);
	TopMid = Cast<UVerticalBox>(Make(UVerticalBox::StaticClass()));
	TopMidBox->AddChild(TopMid);

	Board = Cast<UBorder>(Make(UBorder::StaticClass(), TEXT("CsoBoard")));
	BoardRow = Cast<UHorizontalBox>(Make(UHorizontalBox::StaticClass()));
	Board->SetContent(BoardRow);
	Clock0 = Cast<UTextBlock>(Make(UTextBlock::StaticClass()));
	Clock0->SetText(FText::FromString(TEXT("⏱")));
	ChronoBox = Cast<USizeBox>(Make(USizeBox::StaticClass()));
	Chrono = Cast<UTextBlock>(Make(UTextBlock::StaticClass(), TEXT("CsoChrono")));
	ChronoBox->AddChild(Chrono);
	Allowed = Cast<UTextBlock>(Make(UTextBlock::StaticClass()));
	Points = Cast<UTextBlock>(Make(UTextBlock::StaticClass()));
	NextPill = Cast<UBorder>(Make(UBorder::StaticClass()));
	UHorizontalBox* NextRow = Cast<UHorizontalBox>(Make(UHorizontalBox::StaticClass()));
	NextArrow = Cast<UImage>(Make(UImage::StaticClass()));
	Triangle = TriangleTexture();
	if (Triangle) NextArrow->SetBrushFromTexture(Triangle);
	Next = Cast<UTextBlock>(Make(UTextBlock::StaticClass()));
	NextRow->AddChildToHorizontalBox(NextArrow)->SetVerticalAlignment(VAlign_Center);
	NextRow->AddChildToHorizontalBox(Next)->SetVerticalAlignment(VAlign_Bottom);
	NextPill->SetContent(NextRow);
	Cad = Cast<UHorizontalBox>(Make(UHorizontalBox::StaticClass()));
	for (int32 I = 0; I < 6; I++)
	{
		USizeBox* SB = Cast<USizeBox>(Make(USizeBox::StaticClass()));
		UBorder* Bar = Cast<UBorder>(Make(UBorder::StaticClass()));
		SB->AddChild(Bar);
		UHorizontalBoxSlot* BS = Cad->AddChildToHorizontalBox(SB);
		BS->SetVerticalAlignment(VAlign_Bottom);
		CadBars.Add(Bar);
	}
	for (UWidget* W : TArray<UWidget*>{Clock0, ChronoBox, Allowed, Points, NextPill, Cad})
	{
		UHorizontalBoxSlot* HS = BoardRow->AddChildToHorizontalBox(W);
		HS->SetVerticalAlignment(VAlign_Bottom);
	}
	TopMid->AddChildToVerticalBox(Board)->SetHorizontalAlignment(HAlign_Left);

	Feedback = Cast<UBorder>(Make(UBorder::StaticClass(), TEXT("CsoJumpFb")));
	FeedbackText = Cast<UTextBlock>(Make(UTextBlock::StaticClass()));
	Feedback->SetContent(FeedbackText);
	TopMid->AddChildToVerticalBox(Feedback)->SetHorizontalAlignment(HAlign_Center);

	HintBox = Cast<USizeBox>(Make(USizeBox::StaticClass()));
	Hint = Cast<UBorder>(Make(UBorder::StaticClass(), TEXT("CsoHint")));
	HintText = Cast<URichTextBlock>(Make(URichTextBlock::StaticClass()));
	Hint->SetContent(HintText);
	HintBox->AddChild(Hint);
	TopMid->AddChildToVerticalBox(HintBox)->SetHorizontalAlignment(HAlign_Left);

	Toasts = Cast<UVerticalBox>(Make(UVerticalBox::StaticClass(), TEXT("CsoToasts")));
	TopMid->AddChildToVerticalBox(Toasts)->SetHorizontalAlignment(HAlign_Fill);

	// Grand message (.big-msg) : centré, titre et sous-titre sur une pastille.
	BigBox = Cast<USizeBox>(Make(USizeBox::StaticClass(), TEXT("CsoBig")));
	Big = Cast<UVerticalBox>(Make(UVerticalBox::StaticClass()));
	BigBox->AddChild(Big);
	BigTitle = Cast<UTextBlock>(Make(UTextBlock::StaticClass()));
	BigTitle->SetJustification(ETextJustify::Center);
	BigTitle->SetAutoWrapText(true);
	Big->AddChildToVerticalBox(BigTitle)->SetHorizontalAlignment(HAlign_Fill);
	BigSubPill = Cast<UBorder>(Make(UBorder::StaticClass()));
	BigSub = Cast<UTextBlock>(Make(UTextBlock::StaticClass()));
	BigSubPill->SetContent(BigSub);
	Big->AddChildToVerticalBox(BigSubPill)->SetHorizontalAlignment(HAlign_Center);
	UCanvasPanelSlot* BS = Canvas->AddChildToCanvas(BigBox);
	BS->SetAutoSize(true);
	BS->SetAlignment(FVector2D(.5, .5));
	BigBox->SetRenderTransformPivot(FVector2D(.5, .5));

	HintStyles = NewObject<UDataTable>(this);
	HintStyles->RowStruct = FRichTextStyleRow::StaticStruct();
}

FStridesCsoHudStyle UStridesCsoHud::StyleFor(const TSharedPtr<FJsonObject>& Doc, const FVector2D& ViewCss)
{
	FStridesCsoHudStyle S;
	const TArray<TSharedPtr<FJsonValue>>* Views = nullptr;
	if (!Doc.IsValid() || !Doc->TryGetArrayField(TEXT("views"), Views) || Views->Num() == 0) return S;
	// Relevé du viewport de hauteur la plus proche (les règles @media du web portent sur la hauteur).
	double Best = 1e9;
	for (const TSharedPtr<FJsonValue>& V : *Views)
	{
		const FJ O = V->AsObject();
		const TArray<TSharedPtr<FJsonValue>>& VP = O->GetArrayField(TEXT("viewport"));
		const double D = FMath::Abs(VP[1]->AsNumber() - ViewCss.Y);
		if (D < Best)
		{
			Best = D;
			S.View = O;
			S.Viewport = FVector2D(VP[0]->AsNumber(), VP[1]->AsNumber());
		}
	}
	const FVector4 TM = CssRect(CssObj(S.View, TEXT("topMid")));
	// Colonne du haut : bord gauche et haut du relevé (marges sûres --sl / --st) ; largeur : celle du relevé, élargie
	// avec le viewport (le bouton pause et la marge droite gardent leur place).
	S.TopMid = FVector4(TM.X, TM.Y, FMath::Max(0.0, TM.Z + (ViewCss.X - S.Viewport.X)), 0);
	S.Gap = CssNum(CssObj(S.View, TEXT("topMid")), TEXT("rowGap"), 6);
	S.bLoaded = true;
	return S;
}

void UStridesCsoHud::ApplyStyle(const FStridesCsoHudStyle& S)
{
	const FJ V = S.View;
	TopMidBox->SetWidthOverride(S.TopMid.Z);
	if (UCanvasPanelSlot* TS = Cast<UCanvasPanelSlot>(TopMidBox->Slot)) TS->SetPosition(FVector2D(S.TopMid.X, S.TopMid.Y));

	// Tableau : boîte, éléments alignés sur la ligne de base comme au web (marge basse de chaque élément relevée).
	const FJ B = CssObj(V, TEXT("board"));
	Board->SetBrush(BoxOf(B));
	const double Bw = CssNum(B, TEXT("borderTopWidth"));
	FMargin Pad = CssPadding(B);
	Pad.Left += Bw; Pad.Top += Bw; Pad.Right += Bw; Pad.Bottom += Bw;
	Board->SetPadding(Pad);
	const FVector4 BR = CssRect(B);
	const double InnerBottom = BR.Y + BR.W - Pad.Bottom;
	const double Gap = CssNum(B, TEXT("columnGap"), 9);
	struct FItem { UWidget* W; const TCHAR* Key; };
	const FItem Items[] = {{Clock0, TEXT("clockIco")}, {ChronoBox, TEXT("boardT")}, {Allowed, TEXT("boardTa")}, {Points, TEXT("boardPen")}, {NextPill, TEXT("boardNext")}, {Cad, TEXT("cad")}};
	for (const FItem& It : Items)
	{
		const FJ E = CssObj(V, It.Key);
		const FVector4 R = CssRect(E);
		if (UHorizontalBoxSlot* HS = Cast<UHorizontalBoxSlot>(It.W->Slot))
			HS->SetPadding(FMargin(It.W == Clock0 ? 0 : Gap + CssNum(E, TEXT("marginLeft")), 0, 0, R.W > 0 ? FMath::Max(0.0, InnerBottom - (R.Y + R.W)) : 0));
	}
	CssSet(Clock0, CssObj(V, TEXT("clockIco")));
	Clock0->SetRenderOpacity(CssNum(CssObj(V, TEXT("clockIco")), TEXT("opacity"), 1));
	const FJ T = CssObj(V, TEXT("boardT"));
	CssSet(Chrono, T);
	ChronoBox->SetMinDesiredWidth(CssRect(T).Z);
	CssSet(Allowed, CssObj(V, TEXT("boardTa")));
	Allowed->SetRenderOpacity(CssNum(CssObj(V, TEXT("boardTa")), TEXT("opacity"), 1));
	CssSet(Points, CssObj(V, TEXT("boardPen")));
	const FJ N = CssObj(V, TEXT("boardNext"));
	CssSet(Next, N);
	// « ▸ » dessiné (TriangleTexture) : 0,42 em de large sur 0,5 em de haut, suivi de l'espace du texte.
	const double Em = CssNum(N, TEXT("fontSize"), 13);
	NextArrow->SetDesiredSizeOverride(FVector2D(.42 * Em, .5 * Em));
	NextArrow->SetColorAndOpacity(CssColor(N, TEXT("color")));
	NextPill->SetBrush(BoxOf(N));
	NextPill->SetPadding(CssPadding(N));
	// Crans : largeur, hauteur et écart relevés.
	const TArray<TSharedPtr<FJsonValue>>* Bars = nullptr;
	if (V->TryGetArrayField(TEXT("cadBars"), Bars))
		for (int32 I = 0; I < CadBars.Num() && I < Bars->Num(); I++)
		{
			const FJ E = (*Bars)[I]->AsObject();
			USizeBox* SB = Cast<USizeBox>(CadBars[I]->GetParent());
			SB->SetWidthOverride(CssRect(E).Z);
			SB->SetHeightOverride(CssRect(E).W);
			if (UHorizontalBoxSlot* HS = Cast<UHorizontalBoxSlot>(SB->Slot)) HS->SetPadding(FMargin(I ? CssNum(CssObj(V, TEXT("cad")), TEXT("columnGap"), 2) : 0, 0, 0, 0));
		}

	// Mot d'appel : boîte, marge haute, police ; couleur selon le genre (Refresh).
	const FJ Fb = CssObj(V, TEXT("jumpFb"));
	Feedback->SetBrush(BoxOf(Fb));
	FMargin FP = CssPadding(Fb);
	const double Fw = CssNum(Fb, TEXT("borderTopWidth"));
	FP.Left += Fw; FP.Top += Fw; FP.Right += Fw; FP.Bottom += Fw;
	Feedback->SetPadding(FP);
	FeedbackText->SetFont(CssFont(Fb));

	// Astuce : boîte, largeur maximale (retour à la ligne dans la boîte), styles du texte et du gras (<b>).
	const FJ Hi = CssObj(V, TEXT("hint")), Hb = CssObj(V, TEXT("hintB"));
	Hint->SetBrush(BoxOf(Hi));
	FMargin HP = CssPadding(Hi);
	const double Hw = CssNum(Hi, TEXT("borderTopWidth"));
	HP.Left += Hw; HP.Top += Hw; HP.Right += Hw; HP.Bottom += Hw;
	Hint->SetPadding(HP);
	const double HintMax = CssMaxWidth(Hi, S.TopMid.Z);
	HintBox->SetMaxDesiredWidth(HintMax);
	HintText->SetAutoWrapText(false);
	HintText->SetWrapTextAt((float)FMath::Max(1.0, HintMax - HP.Left - HP.Right));
	FTextBlockStyle Def;
	Def.SetFont(CssFont(Hi)).SetColorAndOpacity(FSlateColor(CssColor(Hi, TEXT("color"))));
	FTextBlockStyle Bold;
	Bold.SetFont(CssFont(Hb)).SetColorAndOpacity(FSlateColor(CssColor(Hb, TEXT("color"))));
	HintStyles->EmptyTable();
	FRichTextStyleRow RD, RB;
	RD.TextStyle = Def;
	RB.TextStyle = Bold;
	HintStyles->AddRow(TEXT("Default"), RD);
	HintStyles->AddRow(TEXT("b"), RB);
	HintText->SetTextStyleSet(HintStyles);
	HintText->SetDefaultTextStyle(Def);

	// Grand message : largeur, police du titre (taille du relevé), pastille du sous-titre.
	// Largeur min(66vw, 640 px) : part de la largeur relevée, appliquée au viewport.
	const FJ G = CssObj(V, TEXT("big")), GT = CssObj(V, TEXT("bigT")), GS = CssObj(V, TEXT("bigS"));
	BigBox->SetWidthOverride(CssRect(G).Z / S.Viewport.X * LastView.X);
	CssSet(BigTitle, GT);
	BigTitle->SetShadowOffset(FVector2D(0, 1));
	BigTitle->SetShadowColorAndOpacity(FLinearColor(0, 0, 0, .45f));
	CssSet(BigSub, GS);
	BigSubPill->SetBrush(BoxOf(GS));
	BigSubPill->SetPadding(CssPadding(GS));
	if (UVerticalBoxSlot* VS = Cast<UVerticalBoxSlot>(BigSubPill->Slot)) VS->SetPadding(FMargin(0, CssNum(GS, TEXT("marginTop")), 0, 0));
}

const strides::CsoHud* UStridesCsoHud::Source() const
{
	if (Frozen) return Frozen;
	return Course.IsValid() && Course->Run() ? &Course->HudModel() : nullptr;
}

double UStridesCsoHud::PixelRatio()
{
	// Mac : facteur de l'écran (FPlatformApplicationMisc) ; iOS : la plateforme générique rend 1 (à confirmer sur
	// appareil, facteur d'écran natif 2 ou 3 attendu).
	return FMath::Max(1.0, (double)FPlatformApplicationMisc::GetDPIScaleFactorAtPoint(0, 0));
}

void UStridesCsoHud::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	Clock += InDeltaTime;
	if (!Frozen && !Course.IsValid() && GetWorld())
		for (TActorIterator<AStridesCourse> It(GetWorld()); It; ++It)
			if (It->Run()) { Course = *It; break; }
	const strides::CsoHud* H = Source();
	if (!H || !Root)
	{
		if (Root) Root->SetVisibility(ESlateVisibility::Collapsed);
		return;
	}
	Root->SetVisibility(ESlateVisibility::HitTestInvisible);
	const FVector2D Px = UWidgetLayoutLibrary::GetViewportSize(this);
	const double P = PixelRatio();
	const double D = FMath::Max(1e-3f, UWidgetLayoutLibrary::GetViewportScale(this));
	if (Px.X <= 0) return;
	Scale->SetUserSpecifiedScale((float)(P / D));
	const FVector2D ViewCss = Px / P;
	Css->SetWidthOverride(ViewCss.X);
	Css->SetHeightOverride(ViewCss.Y);
	Refresh(*H, ViewCss);
}

void UStridesCsoHud::Refresh(const strides::CsoHud& H, const FVector2D& ViewCss)
{
	// Sans joueur propriétaire (tests), NativeOnInitialized n'est pas appelé : arbre construit ici.
	if (!Root) Build();
	if (!Root) return;
	if (ViewCss != LastView || !Style.bLoaded)
	{
		const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
		Style = StyleFor(Data ? Data->CsoHudStyle() : FJ(), ViewCss);
		if (!Style.bLoaded) return;
		LastView = ViewCss;
		ApplyStyle(Style);
	}
	const FJ V = Style.View;
	const ESlateVisibility Show = ESlateVisibility::HitTestInvisible, Hide = ESlateVisibility::Collapsed;
	// Colonne du haut : écart entre éléments affichés (display ≠ none ; l'astuce transparente garde sa place).
	TArray<UWidget*> Shown;

	// Tableau.
	Board->SetVisibility(H.boardHidden() ? Hide : Show);
	if (!H.boardHidden()) Shown.Add(Board);
	Chrono->SetText(CssText(H.boardText(0)));
	Allowed->SetText(CssText(H.boardText(1)));
	Points->SetText(CssText(H.boardText(2)));
	{
		const FString Nx = UTF8_TO_TCHAR(H.boardText(3).c_str());
		const bool bArrow = Nx.StartsWith(TEXT("▸"));
		NextArrow->SetVisibility(bArrow ? Show : Hide);
		Next->SetText(FText::FromString(bArrow ? Nx.RightChop(1) : Nx));
		NextShown = Nx;
	}
	const FJ Over = CssObj(V, TEXT("boardOver")), Plain = CssObj(V, TEXT("boardPlain"));
	Chrono->SetColorAndOpacity(FSlateColor(CssColor(CssObj(H.boardOver() ? Over : Plain, TEXT("boardT")), TEXT("color"))));
	Points->SetColorAndOpacity(FSlateColor(CssColor(CssObj(H.boardFaults() ? Over : Plain, TEXT("boardPen")), TEXT("color"))));
	Clock0->SetVisibility(H.masked(strides::CsoHudElement::ClockIcon) ? Hide : Show);
	// Crans : allumés round(cadence / 8 × 6), affichés 2 s après un réglage, fondu de 0,4 s.
	const FLinearColor On = CssColor(CssObj(V, TEXT("cadOn")), TEXT("backgroundColor")), Off = CssColor(CssObj(V, TEXT("cadOff")), TEXT("backgroundColor"));
	for (int32 I = 0; I < CadBars.Num(); I++) CadBars[I]->SetBrush(Rounded(I < H.cadOn() ? On : Off, CssNum(CssObj(V, TEXT("cadOn")), TEXT("borderTopLeftRadius"), 1)));
	ShownCadOn = FMath::Min(H.cadOn(), CadBars.Num());
	const double FadeT = FMath::Clamp(H.cadShowSince() / .4, 0.0, 1.0);
	const double CadOp = CssNum(CssObj(V, TEXT("cad")), TEXT("opacity"), .9);
	Cad->SetRenderOpacity((float)(H.cadShow() ? Ease(FadeT) * CadOp : (1 - Ease(FadeT)) * CadOp));

	// Mot d'appel.
	Feedback->SetVisibility(H.fbOff() ? Hide : Show);
	if (!H.fbOff()) Shown.Add(Feedback);
	FeedbackText->SetText(CssText(H.fbText()));
	const FJ Kinds = CssObj(V, TEXT("fbKinds"));
	const FJ Kind = CssObj(Kinds, *FString(UTF8_TO_TCHAR(H.fbKind().c_str())));
	FeedbackText->SetColorAndOpacity(FSlateColor(CssColor(Kind.IsValid() ? Kind : CssObj(Kinds, TEXT("ok")), TEXT("color"))));

	// Astuce : dans la colonne quand elle n'est pas dans la carte d'objectif (non portée) ; transparente sous big-on.
	const bool bHint = !H.hintOff() && !H.hintInline();
	HintBox->SetVisibility(bHint ? Show : Hide);
	if (bHint)
	{
		Shown.Add(HintBox);
		const FString Html = UTF8_TO_TCHAR(H.hintHtml().c_str());
		if (Html != HintShown || HintBorn < 0)
		{
			HintShown = Html;
			// Balises <b>…</b> du web → balisage du texte riche d'Unreal (<b>…</>, style « b »).
			HintText->SetText(FText::FromString(Html.Replace(TEXT("</b>"), TEXT("</>"))));
			HintBorn = Clock;
		}
		const double K = EaseOut(FMath::Clamp((Clock - HintBorn) / .3, 0.0, 1.0));
		// Transparente sous big-on (opacité 0, place gardée) : masquée sans être retirée de la colonne (le contour d'une
		// boîte arrondie de Slate ne suit pas l'opacité de rendu).
		if (H.masked(strides::CsoHudElement::Hint)) HintBox->SetVisibility(ESlateVisibility::Hidden);
		HintBox->SetRenderOpacity((float)K);
		HintBox->SetRenderTranslation(FVector2D(0, -4 * (1 - K)));
	}
	else HintBorn = -1;

	// Toasts (le plus ancien en haut).
	TArray<int32> Ids;
	for (const strides::CsoHudToast& T : H.toasts()) Ids.Add(T.id);
	if (Ids != ToastIds)
	{
		ToastIds = Ids;
		Toasts->ClearChildren();
		const FJ To = CssObj(V, TEXT("toast"));
		for (const strides::CsoHudToast& T : H.toasts())
		{
			USizeBox* SB = WidgetTree->ConstructWidget<USizeBox>(USizeBox::StaticClass());
			const double MaxW = CssMaxWidth(To, Style.TopMid.Z);
			SB->SetMaxDesiredWidth(MaxW);
			UBorder* Bd = WidgetTree->ConstructWidget<UBorder>(UBorder::StaticClass());
			Bd->SetBrush(BoxOf(To));
			FMargin TP = CssPadding(To);
			const double W = CssNum(To, TEXT("borderTopWidth"));
			TP.Left += W; TP.Top += W; TP.Right += W; TP.Bottom += W;
			Bd->SetPadding(TP);
			UTextBlock* Tx = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
			CssSet(Tx, To);
			Tx->SetWrapTextAt((float)FMath::Max(1.0, MaxW - TP.Left - TP.Right));
			Tx->SetText(CssText(T.text));
			Bd->SetContent(Tx);
			SB->AddChild(Bd);
			UVerticalBoxSlot* VS = Toasts->AddChildToVerticalBox(SB);
			VS->SetHorizontalAlignment(HAlign_Left);
			VS->SetPadding(FMargin(0, Toasts->GetChildrenCount() > 1 ? CssNum(CssObj(V, TEXT("toasts")), TEXT("rowGap"), 6) : 0, 0, 0));
			if (!ToastBorn.Contains(T.id)) ToastBorn.Add(T.id, Clock);
		}
	}
	for (int32 I = 0; I < Toasts->GetChildrenCount() && I < (int32)H.toasts().size(); I++)
	{
		const double K = EaseOut(FMath::Clamp((Clock - ToastBorn.FindRef(H.toasts()[I].id)) / .35, 0.0, 1.0));
		Toasts->GetChildAt(I)->SetRenderOpacity((float)K);
		Toasts->GetChildAt(I)->SetRenderTranslation(FVector2D(-12 * (1 - K), 0));
	}
	Toasts->SetVisibility(H.toasts().empty() ? Hide : Show);
	if (!H.toasts().empty()) Shown.Add(Toasts);
	for (UWidget* W : TArray<UWidget*>{Board, Feedback, HintBox, Toasts})
		if (UVerticalBoxSlot* VS = Cast<UVerticalBoxSlot>(W->Slot))
		{
			const int32 At = Shown.IndexOfByKey(W);
			const double Top = At > 0 ? Style.Gap : 0;
			VS->SetPadding(FMargin(0, Top + (W == Feedback && At >= 0 ? CssNum(CssObj(V, TEXT("jumpFb")), TEXT("marginTop")) : 0), 0, 0));
		}

	// Grand message : centre à 50 % de la largeur et à max(34 %, --st + 56 px) de la hauteur ; animation pop (0,5 s).
	BigBox->SetVisibility(H.bigHidden() ? Hide : Show);
	if (!H.bigHidden())
	{
		// Centre relevé (top: max(34 %, --st + 56 px), translate(-50 %, -50 %)) : même part de la hauteur.
		const FVector4 G = CssRect(CssObj(V, TEXT("big")));
		if (UCanvasPanelSlot* BS = Cast<UCanvasPanelSlot>(BigBox->Slot)) BS->SetPosition(FVector2D((G.X + G.Z / 2) / Style.Viewport.X * ViewCss.X, (G.Y + G.W / 2) / Style.Viewport.Y * ViewCss.Y));
		BigTitle->SetText(CssText(H.bigTitle()));
		BigSub->SetText(CssText(H.bigSub()).ToUpper());  // text-transform: uppercase (Unicode : « É »)
		BigSubPill->SetVisibility(H.bigSub().empty() ? Hide : Show);
		const double E = Bezier(.2, .9, .3, 1.3, FMath::Clamp(H.bigPopSeconds() / .5, 0.0, 1.0));
		BigBox->SetRenderOpacity((float)FMath::Clamp(E, 0.0, 1.0));
		BigBox->SetRenderScale(FVector2D(.8 + .2 * E, .8 + .2 * E));
	}
}

TArray<FString> UStridesCsoHud::Describe() const
{
	TArray<FString> L;
	auto Vis = [](const UWidget* W) { return W && W->GetVisibility() != ESlateVisibility::Collapsed && W->GetVisibility() != ESlateVisibility::Hidden; };
	if (!Vis(Root)) return L;
	if (Vis(Board))
		L.Add(FString::Printf(TEXT("board=%s|%s|%s|%s%s"), *Chrono->GetText().ToString(), *Allowed->GetText().ToString(), *Points->GetText().ToString(), Vis(NextArrow) ? TEXT("▸") : TEXT(""), *Next->GetText().ToString()));
	if (Vis(Feedback)) L.Add(TEXT("fb=") + FeedbackText->GetText().ToString());
	if (HintBox->GetVisibility() == ESlateVisibility::Hidden) L.Add(TEXT("hint(transparente)=") + HintShown);
	else if (Vis(HintBox)) L.Add(TEXT("hint=") + HintShown);
	for (int32 I = 0; I < Toasts->GetChildrenCount(); I++)
		if (const USizeBox* SB = Cast<USizeBox>(Toasts->GetChildAt(I)))
			if (const UBorder* Bd = Cast<UBorder>(SB->GetContent()))
				if (const UTextBlock* T = Cast<UTextBlock>(Bd->GetContent())) L.Add(TEXT("toast=") + T->GetText().ToString());
	if (Vis(BigBox)) L.Add(FString::Printf(TEXT("big=%s|%s"), *BigTitle->GetText().ToString(), *BigSub->GetText().ToString()));
	if (Vis(Board) && Cad->GetRenderOpacity() > 0) L.Add(FString::Printf(TEXT("cad=%d"), ShownCadOn));
	if (Vis(Clock0) && Vis(Board)) L.Add(TEXT("clock"));
	return L;
}
