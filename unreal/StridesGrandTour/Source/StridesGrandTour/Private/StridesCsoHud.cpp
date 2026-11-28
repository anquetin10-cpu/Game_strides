#include "StridesCsoHud.h"
#include "StridesCore/WindowFit.h"

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
#include "Fonts/FontMeasure.h"
#include "Framework/Application/SlateApplication.h"
#include "Rendering/SlateRenderer.h"
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
// comme un petit triangle plein (texture de 32 × 32 px, bords lissés par suréchantillonnage 4 × 4), teinté comme le texte,
// à la taille et à la place de l'encre du glyphe mesurée dans le navigateur (glyphs.next de hud_cso_style.json).
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
// Courbe d'une animation ou transition CSS telle que la rend getComputedStyle : cubic-bezier(x1, y1, x2, y2), ou mot-clé
// dont la norme CSS donne la courbe (ease, ease-in, ease-out, ease-in-out, linear).
FVector4 CssCurve(const FString& S)
{
	const FString T = S.TrimStartAndEnd();
	if (T.StartsWith(TEXT("cubic-bezier(")))
	{
		TArray<FString> P;
		T.Mid(13).Replace(TEXT(")"), TEXT("")).ParseIntoArray(P, TEXT(","));
		if (P.Num() == 4) return FVector4(FCString::Atod(*P[0].TrimStartAndEnd()), FCString::Atod(*P[1].TrimStartAndEnd()), FCString::Atod(*P[2].TrimStartAndEnd()), FCString::Atod(*P[3].TrimStartAndEnd()));
	}
	if (T == TEXT("linear")) return FVector4(0, 0, 1, 1);
	if (T == TEXT("ease-in")) return FVector4(.42, 0, 1, 1);
	if (T == TEXT("ease-out")) return FVector4(0, 0, .58, 1);
	if (T == TEXT("ease-in-out")) return FVector4(.42, 0, .58, 1);
	return FVector4(.25, .1, .25, 1);  // ease
}
// Durée CSS (« 0.35s », « 300ms ») en secondes.
double CssSeconds(const FString& S)
{
	const FString T = S.TrimStartAndEnd();
	return T.EndsWith(TEXT("ms")) ? FCString::Atod(*T) / 1000 : FCString::Atod(*T);
}
// Argument numérique de la fonction Fn( dans une valeur transform (« translateX(-12px) », « scale(0.8) ») ; un
// argument en % (translate(-50%, -50%) qui centre le grand message, aussi à l'arrivée) est ignoré.
bool CssTransformArg(const FString& S, const TCHAR* Fn, int32 Arg, double& Out)
{
	const int32 At = S.Find(Fn, ESearchCase::CaseSensitive);
	if (At == INDEX_NONE) return false;
	const int32 Open = At + FCString::Strlen(Fn);
	int32 Close = INDEX_NONE;
	if (!S.Mid(Open).FindChar(')', Close)) return false;
	TArray<FString> P;
	S.Mid(Open, Close).ParseIntoArray(P, TEXT(","));
	if (!P.IsValidIndex(Arg) || P[Arg].Contains(TEXT("%"))) return false;
	Out = FCString::Atod(*P[Arg].TrimStartAndEnd());
	return true;
}
// Apparition relevée dans le navigateur (motion.<élément> de hud_cso_style.json) : animation @keyframes (image de départ
// 0 % → état de l'élément) ou, pour bTransition, transition d'opacité ; durée et courbe de getComputedStyle.
struct FCssMotion
{
	double Dur = 0;
	FVector4 Curve = FVector4(.25, .1, .25, 1);
	double FromOpacity = 1, FromScale = 1;
	FVector2D FromShift = FVector2D::ZeroVector;  // translateX / translateY (px)
	// Avancement de la courbe T secondes après le début (1 sans durée).
	double At(double T) const { return Dur > 0 ? Bezier(Curve.X, Curve.Y, Curve.Z, Curve.W, FMath::Clamp(T / Dur, 0.0, 1.0)) : 1.0; }
	double Opacity(double E) const { return FromOpacity + (1 - FromOpacity) * E; }
	double Scale(double E) const { return FromScale + (1 - FromScale) * E; }
	FVector2D Shift(double E) const { return FromShift * (1 - E); }
};
FCssMotion CssMotionOf(const FJ& View, const TCHAR* Key, bool bTransition)
{
	FCssMotion M;
	const FJ E = CssObj(CssObj(View, TEXT("motion")), Key);
	if (!E.IsValid()) return M;
	M.Dur = CssSeconds(CssStr(E, bTransition ? TEXT("transitionDuration") : TEXT("animationDuration")));
	M.Curve = CssCurve(CssStr(E, bTransition ? TEXT("transitionTimingFunction") : TEXT("animationTimingFunction")));
	if (bTransition) return M;
	const FJ From = CssObj(CssObj(E, TEXT("keyframes")), TEXT("0%"));
	if (!From.IsValid()) return M;
	const FString Op = CssStr(From, TEXT("opacity"));
	if (!Op.IsEmpty()) M.FromOpacity = FCString::Atod(*Op);
	const FString Tr = CssStr(From, TEXT("transform"));
	double V = 0;
	if (CssTransformArg(Tr, TEXT("translateX("), 0, V)) M.FromShift.X = V;
	if (CssTransformArg(Tr, TEXT("translateY("), 0, V)) M.FromShift.Y = V;
	if (CssTransformArg(Tr, TEXT("translate("), 0, V)) M.FromShift.X = V;
	if (CssTransformArg(Tr, TEXT("translate("), 1, V)) M.FromShift.Y = V;
	if (CssTransformArg(Tr, TEXT("scale("), 0, V)) M.FromScale = V;
	return M;
}
// Première ombre d'un text-shadow calculé (« rgba(0, 0, 0, 0.45) 0px 1px 3px, … ») : couleur et décalage (Slate : une
// seule ombre, sans flou).
bool CssTextShadow(const FJ& E, FLinearColor& Color, FVector2D& Offset)
{
	const FString S = CssStr(E, TEXT("textShadow"));
	int32 Close = INDEX_NONE;
	if (S.IsEmpty() || S == TEXT("none") || !S.FindChar(')', Close)) return false;
	const TSharedPtr<FJsonObject> C = MakeShared<FJsonObject>();
	C->SetStringField(TEXT("c"), S.Left(Close + 1));
	Color = CssColor(C, TEXT("c"));
	TArray<FString> P;
	S.Mid(Close + 1).TrimStartAndEnd().ParseIntoArray(P, TEXT(" "));
	Offset = FVector2D(P.Num() > 0 ? FCString::Atod(*P[0]) : 0, P.Num() > 1 ? FCString::Atod(*P[1]) : 0);
	return true;
}
// text-transform calculé : « uppercase » → majuscules (Unicode : « É »), « lowercase » → minuscules.
FText CssCased(const FJ& E, const FText& T)
{
	const FString X = CssStr(E, TEXT("textTransform"));
	return X == TEXT("uppercase") ? T.ToUpper() : X == TEXT("lowercase") ? T.ToLower() : T;
}
// Champ numérique d'un objet JSON (Def si absent).
double JNum(const FJ& O, const TCHAR* K, double Def = 0)
{
	double V = Def;
	if (O.IsValid()) O->TryGetNumberField(K, V);
	return V;
}
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
		if (It.W == ChronoBox)
		{
			ChronoMarginLeft = CssNum(E, TEXT("marginLeft"));
			ChronoPadBottom = R.W > 0 ? FMath::Max(0.0, InnerBottom - (R.Y + R.W)) : 0;
		}
	}
	BoardGap = Gap;
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
	// « ▸ » dessiné (TriangleTexture) : boîte d'encre du glyphe mesurée par le navigateur dans la police du web (avance,
	// débords gauche et droit, hauteur au-dessus de la ligne de base), puis l'espace du texte. Ligne de base : celle de la
	// police du texte qui suit (mesure de Slate) ; sans mesure (moteur sans rendu), triangle centré dans la ligne.
	const FJ Gl = CssObj(CssObj(V, TEXT("glyphs")), TEXT("next"));
	const double GAdv = JNum(Gl, TEXT("advance")), GL = JNum(Gl, TEXT("left")), GR = JNum(Gl, TEXT("right")), GA = JNum(Gl, TEXT("ascent")), GD = JNum(Gl, TEXT("descent"));
	NextArrow->SetDesiredSizeOverride(FVector2D(FMath::Max(0.0, GL + GR), FMath::Max(0.0, GA + GD)));
	NextArrow->SetColorAndOpacity(CssColor(N, TEXT("color")));
	if (UHorizontalBoxSlot* AS = Cast<UHorizontalBoxSlot>(NextArrow->Slot))
	{
		double Below = -1;  // de la ligne de base au bas de la ligne (px)
		if (FSlateApplication::IsInitialized() && FSlateApplication::Get().GetRenderer())
			Below = -(double)FSlateApplication::Get().GetRenderer()->GetFontMeasureService()->GetBaseline(Next->GetFont());
		AS->SetVerticalAlignment(Below >= 0 ? VAlign_Bottom : VAlign_Center);
		AS->SetPadding(FMargin(FMath::Max(0.0, -GL), 0, FMath::Max(0.0, GAdv - GR), Below >= 0 ? FMath::Max(0.0, Below - GD) : 0));
	}
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
	FLinearColor ShadowColor = FLinearColor::Transparent;
	FVector2D ShadowOffset = FVector2D::ZeroVector;
	CssTextShadow(GT, ShadowColor, ShadowOffset);
	BigTitle->SetShadowOffset(ShadowOffset);
	BigTitle->SetShadowColorAndOpacity(ShadowColor);
	CssSet(BigSub, GS);
	BigSubPill->SetBrush(BoxOf(GS));
	BigSubPill->SetPadding(CssPadding(GS));
	if (UVerticalBoxSlot* VS = Cast<UVerticalBoxSlot>(BigSubPill->Slot)) VS->SetPadding(FMargin(0, CssNum(GS, TEXT("marginTop")), 0, 0));
}

double UStridesCsoHud::ChronoLeftPadding() const
{
	const UHorizontalBoxSlot* HS = ChronoBox ? Cast<UHorizontalBoxSlot>(ChronoBox->Slot) : nullptr;
	return HS ? HS->GetPadding().Left : -1;
}

void UStridesCsoHud::SetCourseViewport(const FVector2D& ViewCss)
{
	if (Frozen) return;
	if (!Course.IsValid() && GetWorld())
		for (TActorIterator<AStridesCourse> It(GetWorld()); It; ++It)
			if (It->Run()) { Course = *It; break; }
	if (Course.IsValid()) Course->HudModel().setViewportHeight(ViewCss.Y);
}

const strides::CsoHud* UStridesCsoHud::Source() const
{
	if (Frozen) return Frozen;
	return Course.IsValid() && Course->Run() ? &Course->HudModel() : nullptr;
}

namespace { double GPixelRatioForTest = 0; }
void UStridesCsoHud::SetPixelRatioForTest(double Ratio) { GPixelRatioForTest = Ratio; }

double UStridesCsoHud::PixelRatio()
{
	if (GPixelRatioForTest > 0) return GPixelRatioForTest;
#if PLATFORM_IOS
	// Jalon J5 : sur iOS, la plateforme générique rend 1 ; un px CSS du web = un point d'écran, et le rendu compte
	// r.MobileContentScaleFactor pixels par point (1,5 dans DefaultDeviceProfiles.ini), borné par le facteur natif de
	// l'écran (3 sur les iPhone récents, 2 sur iPad : 3 retenu comme borne, à confirmer sur appareil en J6). Sans cela,
	// les commandes (SAUT, pause, joystick) seraient dessinées à 1/1,5 de leur taille du web.
	static const IConsoleVariable* Mcsf = IConsoleManager::Get().FindConsoleVariable(TEXT("r.MobileContentScaleFactor"));
	return strides::iosContentScale(Mcsf ? (double)Mcsf->GetFloat() : 0.0, 3.0);
#else
	// Mac : facteur de l'écran (FPlatformApplicationMisc).
	return FMath::Max(1.0, (double)FPlatformApplicationMisc::GetDPIScaleFactorAtPoint(0, 0));
#endif
}

void UStridesCsoHud::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	Clock += InDeltaTime;
	if (!Frozen && !Course.IsValid() && GetWorld())
		for (TActorIterator<AStridesCourse> It(GetWorld()); It; ++It)
			if (It->Run()) { Course = *It; break; }
	// Temporisations du HUD sur l'horloge murale aussi quand le cheval ne fait pas de pas (pause) ; sans effet si le
	// cheval l'a déjà avancée à cette image.
	if (!Frozen && Course.IsValid() && Course->Run()) Course->SyncHudClock(Course->WallSeconds());
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
	SetCourseViewport(ViewCss);
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
		// Toasts affichés reconstruits au style du nouveau viewport (rotation, redimensionnement), apparition gardée.
		ToastIds.Reset();
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
	// Gap flex seulement entre éléments affichés : l'icône repliée (cso-sober) ne laisse pas d'écart avant le chrono.
	if (UHorizontalBoxSlot* HS = Cast<UHorizontalBoxSlot>(ChronoBox->Slot))
		HS->SetPadding(FMargin((Clock0->GetVisibility() == Hide ? 0 : BoardGap) + ChronoMarginLeft, 0, 0, ChronoPadBottom));
	// Crans : allumés round(cadence / 8 × 6), affichés 2 s après un réglage, fondu de 0,4 s.
	const FLinearColor On = CssColor(CssObj(V, TEXT("cadOn")), TEXT("backgroundColor")), Off = CssColor(CssObj(V, TEXT("cadOff")), TEXT("backgroundColor"));
	for (int32 I = 0; I < CadBars.Num(); I++) CadBars[I]->SetBrush(Rounded(I < H.cadOn() ? On : Off, CssNum(CssObj(V, TEXT("cadOn")), TEXT("borderTopLeftRadius"), 1)));
	ShownCadOn = FMath::Min(H.cadOn(), CadBars.Num());
	const double FadeE = CssMotionOf(V, TEXT("cad"), true).At(H.cadShowSince());
	const double CadOp = CssNum(CssObj(V, TEXT("cad")), TEXT("opacity"), .9);
	Cad->SetRenderOpacity((float)(H.cadShow() ? FadeE * CadOp : (1 - FadeE) * CadOp));

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
		const FCssMotion HM = CssMotionOf(V, TEXT("hint"), false);
		const double K = HM.At(Clock - HintBorn);
		// Transparente sous big-on (opacité 0, place gardée) : masquée sans être retirée de la colonne (le contour d'une
		// boîte arrondie de Slate ne suit pas l'opacité de rendu).
		if (H.masked(strides::CsoHudElement::Hint)) HintBox->SetVisibility(ESlateVisibility::Hidden);
		HintBox->SetRenderOpacity((float)HM.Opacity(K));
		HintBox->SetRenderTranslation(HM.Shift(K));
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
	const FCssMotion TM = CssMotionOf(V, TEXT("toast"), false);
	for (int32 I = 0; I < Toasts->GetChildrenCount() && I < (int32)H.toasts().size(); I++)
	{
		const double K = TM.At(Clock - ToastBorn.FindRef(H.toasts()[I].id));
		Toasts->GetChildAt(I)->SetRenderOpacity((float)TM.Opacity(K));
		Toasts->GetChildAt(I)->SetRenderTranslation(TM.Shift(K));
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

	// Grand message : centre à 50 % de la largeur et à max(34 %, --st + 56 px) de la hauteur ; animation pop relevée.
	BigBox->SetVisibility(H.bigHidden() ? Hide : Show);
	if (!H.bigHidden())
	{
		// Centre relevé (top: max(34 %, --st + 56 px), translate(-50 %, -50 %)) : même part de la hauteur.
		const FVector4 G = CssRect(CssObj(V, TEXT("big")));
		if (UCanvasPanelSlot* BS = Cast<UCanvasPanelSlot>(BigBox->Slot)) BS->SetPosition(FVector2D((G.X + G.Z / 2) / Style.Viewport.X * ViewCss.X, (G.Y + G.W / 2) / Style.Viewport.Y * ViewCss.Y));
		BigTitle->SetText(CssText(H.bigTitle()));
		BigSub->SetText(CssCased(CssObj(V, TEXT("bigS")), CssText(H.bigSub())));
		BigSubPill->SetVisibility(H.bigSub().empty() ? Hide : Show);
		const FCssMotion BM = CssMotionOf(V, TEXT("big"), false);
		const double E = BM.At(H.bigPopSeconds());
		BigBox->SetRenderOpacity((float)FMath::Clamp(BM.Opacity(E), 0.0, 1.0));
		BigBox->SetRenderScale(FVector2D(BM.Scale(E), BM.Scale(E)));
	}
}

FString UStridesCsoHud::ToastStyle(int32 I) const
{
	const USizeBox* SB = Toasts && I >= 0 && I < Toasts->GetChildrenCount() ? Cast<USizeBox>(Toasts->GetChildAt(I)) : nullptr;
	const UBorder* Bd = SB ? Cast<UBorder>(SB->GetContent()) : nullptr;
	const UTextBlock* T = Bd ? Cast<UTextBlock>(Bd->GetContent()) : nullptr;
	if (!T) return FString();
	const FMargin P = Bd->GetPadding();
	return FString::Printf(TEXT("police %.2f px, marges %.1f %.1f %.1f %.1f, largeur max %.1f, retour à %.1f"), T->GetFont().Size / .75, P.Left, P.Top, P.Right, P.Bottom,
		SB->GetMaxDesiredWidth(), T->GetWrapTextAt());
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
