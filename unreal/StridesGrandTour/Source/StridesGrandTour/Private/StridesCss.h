// Lecture des styles calculés du navigateur (relevés JSON des scripts de scripts/unreal/) pour les widgets UMG des
// commandes d'épreuve (tranche T8) : mêmes règles que les fonctions de StridesCsoHud.cpp (tranche T7), dans un espace de
// noms à part (appels qualifiés : aucun conflit en compilation groupée). Une unité de mise en page = un px CSS.
#pragma once

#include "CoreMinimal.h"
#include "Dom/JsonObject.h"
#include "Engine/Texture2D.h"
#include "Fonts/SlateFontInfo.h"
#include "Styling/CoreStyle.h"
#include "Styling/SlateBrush.h"

namespace StridesCss
{
using FJ = TSharedPtr<FJsonObject>;

inline FJ Obj(const FJ& O, const TCHAR* K)
{
	const TSharedPtr<FJsonObject>* R = nullptr;
	return O.IsValid() && O->TryGetObjectField(K, R) ? *R : FJ();
}
inline FString Str(const FJ& E, const TCHAR* K)
{
	FString S;
	if (E.IsValid()) E->TryGetStringField(K, S);
	return S;
}
// « 12px », « 600 », « 0.55 » → nombre ; « normal », « auto » et absent → Def.
inline double Num(const FJ& E, const TCHAR* K, double Def = 0)
{
	const FString S = Str(E, K);
	if (S.IsEmpty() || !(FChar::IsDigit(S[0]) || S[0] == '-' || S[0] == '.')) return Def;
	return FCString::Atod(*S);
}
// Boîte relevée par getBoundingClientRect : x, y, largeur, hauteur (px CSS).
inline FVector4 Rect(const FJ& E)
{
	const TArray<TSharedPtr<FJsonValue>>* A = nullptr;
	if (!E.IsValid() || !E->TryGetArrayField(TEXT("rect"), A) || A->Num() != 4) return FVector4(0, 0, 0, 0);
	return FVector4((*A)[0]->AsNumber(), (*A)[1]->AsNumber(), (*A)[2]->AsNumber(), (*A)[3]->AsNumber());
}
// Couleur CSS (« rgb(r, g, b) », « rgba(r, g, b, a) », sRGB) → couleur linéaire de Slate.
inline FLinearColor ColorOf(const FString& In)
{
	FString S = In;
	int32 Open = INDEX_NONE;
	if (!S.FindChar('(', Open)) return FLinearColor::Transparent;
	S = S.Mid(Open + 1);
	int32 Close = INDEX_NONE;
	if (S.FindChar(')', Close)) S = S.Left(Close);
	TArray<FString> P;
	S.ParseIntoArray(P, TEXT(","));
	if (P.Num() < 3) return FLinearColor::Transparent;
	const FColor C((uint8)FCString::Atoi(*P[0].TrimStartAndEnd()), (uint8)FCString::Atoi(*P[1].TrimStartAndEnd()), (uint8)FCString::Atoi(*P[2].TrimStartAndEnd()));
	FLinearColor L = FLinearColor::FromSRGBColor(C);
	L.A = P.Num() > 3 ? FCString::Atof(*P[3].TrimStartAndEnd()) : 1.f;
	return L;
}
inline FLinearColor Color(const FJ& E, const TCHAR* K) { return ColorOf(Str(E, K)); }
// Toutes les couleurs d'une valeur calculée (« radial-gradient(circle, rgba(…), rgba(…)) », box-shadow), dans l'ordre.
inline TArray<FLinearColor> Colors(const FString& S)
{
	TArray<FLinearColor> Out;
	int32 From = 0;
	for (;;)
	{
		const int32 A = S.Find(TEXT("rgb"), ESearchCase::CaseSensitive, ESearchDir::FromStart, From);
		if (A == INDEX_NONE) break;
		const int32 B = S.Find(TEXT(")"), ESearchCase::CaseSensitive, ESearchDir::FromStart, A);
		if (B == INDEX_NONE) break;
		Out.Add(ColorOf(S.Mid(A, B - A + 1)));
		From = B + 1;
	}
	return Out;
}
// Ombre portée (box-shadow « rgba(…) 0px 4px 14px 0px ») : couleur, décalage x, y, flou.
struct FShadow
{
	bool bOn = false;
	FLinearColor Color = FLinearColor::Transparent;
	FVector2D Offset = FVector2D::ZeroVector;
	double Blur = 0;
};
inline FShadow Shadow(const FJ& E)
{
	FShadow R;
	const FString S = Str(E, TEXT("boxShadow"));
	int32 Close = INDEX_NONE;
	if (S.IsEmpty() || S == TEXT("none") || !S.FindChar(')', Close)) return R;
	R.Color = ColorOf(S.Left(Close + 1));
	TArray<FString> P;
	S.Mid(Close + 1).TrimStartAndEnd().ParseIntoArray(P, TEXT(" "));
	R.Offset = FVector2D(P.Num() > 0 ? FCString::Atod(*P[0]) : 0, P.Num() > 1 ? FCString::Atod(*P[1]) : 0);
	R.Blur = P.Num() > 2 ? FCString::Atod(*P[2]) : 0;
	R.bOn = R.Color.A > 0;
	return R;
}
// Police : pile du web (Geist) non embarquée ; police du moteur à la même taille en px CSS (taille Slate en points à
// 96 ppp : px × 0,75), 600 et plus en gras, 500 en « Medium », espacement des lettres en millièmes d'em.
inline FSlateFontInfo Font(const FJ& E)
{
	const double W = Num(E, TEXT("fontWeight"), 400), Px = Num(E, TEXT("fontSize"), 13);
	const TCHAR* Face = W >= 550 ? TEXT("Bold") : W >= 450 ? TEXT("Medium") : TEXT("Regular");
	FSlateFontInfo F = FCoreStyle::GetDefaultFontStyle(Face, (float)(Px * 0.75));
	F.LetterSpacing = (int32)FMath::RoundToInt(Num(E, TEXT("letterSpacing")) / FMath::Max(1.0, Px) * 1000.0);
	return F;
}
inline FText Cased(const FJ& E, const FString& T)
{
	// text-transform du web : casse de la culture (accents compris : « Trop près » → « TROP PRÈS », tranche T9) ;
	// FString::ToUpper ne change que l'ASCII.
	const FString X = Str(E, TEXT("textTransform"));
	if (X == TEXT("uppercase")) return FText::FromString(T).ToUpper();
	if (X == TEXT("lowercase")) return FText::FromString(T).ToLower();
	return FText::FromString(T);
}
inline FSlateBrush Rounded(const FLinearColor& Fill, double Radius, const FLinearColor& Outline = FLinearColor::Transparent, double OutlineW = 0)
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
// Rayon d'angle : « 14px » ; « 50% » (cercle) → moitié de la plus petite dimension de la boîte relevée.
inline double Radius(const FJ& E)
{
	const FString S = Str(E, TEXT("borderTopLeftRadius"));
	if (S.EndsWith(TEXT("%")))
	{
		const FVector4 R = Rect(E);
		return FMath::Min(R.Z, R.W) * FCString::Atod(*S) / 100.0;
	}
	return Num(E, TEXT("borderTopLeftRadius"));
}
inline FSlateBrush BoxOf(const FJ& E)
{
	return Rounded(Color(E, TEXT("backgroundColor")), Radius(E), Color(E, TEXT("borderTopColor")), Num(E, TEXT("borderTopWidth")));
}
inline FSlateBrush ImageBrush(UTexture2D* T, const FVector2D& Size, const FLinearColor& Tint = FLinearColor::White)
{
	FSlateBrush B;
	B.SetResourceObject(T);
	B.ImageSize = Size;
	B.DrawAs = ESlateBrushDrawType::Image;
	B.TintColor = FSlateColor(Tint);
	return B;
}
// Disque peint dans une texture (N × N, bords lissés par suréchantillonnage 4 × 4) : fond en dégradé radial C0 (centre)
// → C1 (bord), anneau de bordure Ring (px de texture) de couleur Border (radial-gradient(circle, …) et border du web).
inline UTexture2D* DiscTexture(int32 N, const FLinearColor& C0, const FLinearColor& C1, double Ring, const FLinearColor& Border)
{
	UTexture2D* T = UTexture2D::CreateTransient(N, N, PF_B8G8R8A8);
	if (!T) return nullptr;
	T->SRGB = true;
	FTexture2DMipMap& Mip = T->GetPlatformData()->Mips[0];
	uint8* D = (uint8*)Mip.BulkData.Lock(LOCK_READ_WRITE);
	const double Rr = N / 2.0;
	for (int32 Y = 0; Y < N; Y++)
		for (int32 X = 0; X < N; X++)
		{
			FLinearColor Acc(0, 0, 0, 0);
			for (int32 Sy = 0; Sy < 4; Sy++)
				for (int32 Sx = 0; Sx < 4; Sx++)
				{
					const double U = X + (Sx + .5) / 4 - Rr, V = Y + (Sy + .5) / 4 - Rr;
					const double R = FMath::Sqrt(U * U + V * V);
					if (R > Rr) continue;
					FLinearColor C = R >= Rr - Ring ? Border : FMath::Lerp(C0, C1, (float)FMath::Clamp(R / (Rr - Ring), 0.0, 1.0));
					// Bordure posée sur le fond (le fond du web va jusqu'au bord de la boîte de bordure).
					if (R >= Rr - Ring)
					{
						const FLinearColor Under = C1;
						const float A = Border.A + Under.A * (1 - Border.A);
						C = A > 0 ? FLinearColor((Border.R * Border.A + Under.R * Under.A * (1 - Border.A)) / A, (Border.G * Border.A + Under.G * Under.A * (1 - Border.A)) / A,
							(Border.B * Border.A + Under.B * Under.A * (1 - Border.A)) / A, A) : FLinearColor::Transparent;
					}
					Acc += FLinearColor(C.R * C.A, C.G * C.A, C.B * C.A, C.A) / 16.f;
				}
			const FColor S = Acc.A > 0 ? FLinearColor(Acc.R / Acc.A, Acc.G / Acc.A, Acc.B / Acc.A, 1).ToFColor(true) : FColor(0, 0, 0, 0);
			uint8* Px = D + (Y * N + X) * 4;
			Px[0] = S.B; Px[1] = S.G; Px[2] = S.R;
			Px[3] = (uint8)FMath::Clamp(FMath::RoundToInt(Acc.A * 255.f), 0, 255);
		}
	Mip.BulkData.Unlock();
	T->UpdateResource();
	return T;
}
// Ombre floue d'un rectangle arrondi (box-shadow) : texture d'opacité (gaussienne approchée par une rampe lissée), à
// étirer sur la boîte de l'élément agrandie du flou ; couleur portée par la teinte du pinceau. bOutside : ombre extérieure
// du web dessinée seulement hors de la boîte de bordure (halo d'un anneau, tranche T9).
inline UTexture2D* SoftShadowTexture(int32 W, int32 H, double Radius, double Blur, bool bOutside = false)
{
	UTexture2D* T = UTexture2D::CreateTransient(W, H, PF_B8G8R8A8);
	if (!T) return nullptr;
	FTexture2DMipMap& Mip = T->GetPlatformData()->Mips[0];
	uint8* D = (uint8*)Mip.BulkData.Lock(LOCK_READ_WRITE);
	// Boîte intérieure (celle de l'élément) au centre, flou de part et d'autre.
	const double Bx = Blur, By = Blur, Iw = W - 2 * Blur, Ih = H - 2 * Blur;
	for (int32 Y = 0; Y < H; Y++)
		for (int32 X = 0; X < W; X++)
		{
			// Distance signée au rectangle arrondi (négative dedans).
			const double Px = FMath::Abs(X + .5 - (Bx + Iw / 2)) - (Iw / 2 - Radius), Py = FMath::Abs(Y + .5 - (By + Ih / 2)) - (Ih / 2 - Radius);
			const double Out = FMath::Sqrt(FMath::Square(FMath::Max(Px, 0.0)) + FMath::Square(FMath::Max(Py, 0.0))) + FMath::Min(FMath::Max(Px, Py), 0.0) - Radius;
			// Flou CSS : écart-type = flou / 2 ; opacité = 1 − Φ(d / σ) approchée par une rampe lissée sur ±σ·2.
			const double Sigma = FMath::Max(0.5, Blur / 2);
			const double A = bOutside && Out < 0 ? 0.0 : 1.0 - FMath::SmoothStep(-2 * Sigma, 2 * Sigma, Out);
			uint8* P = D + (Y * W + X) * 4;
			P[0] = P[1] = P[2] = 255;
			P[3] = (uint8)FMath::Clamp(FMath::RoundToInt(A * 255.0), 0, 255);
		}
	Mip.BulkData.Unlock();
	T->UpdateResource();
	return T;
}
}  // namespace StridesCss
