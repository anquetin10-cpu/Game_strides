// Interface d'épreuve UMG (tranche T7) : tableau de chrono, crans de cadence, mot d'appel, astuce, toasts et grand
// message du jeu web (src/ui/hud.js, src/styles.css), construits en C++ comme UStridesTouchControls. Le widget affiche
// l'état d'un strides::CsoHud : celui de l'épreuve du Pôle (AStridesCourse::HudModel), ou un état figé (captures du banc
// de parité, -StridesShots=cso). Styles (tailles, marges, couleurs, positions) : Content/Data/hud_cso_style.json,
// relevé par scripts/unreal/export-hud-style.mjs dans le navigateur ; échelle : une unité de mise en page = un pixel CSS
// (viewport en pixels divisé par le facteur de pixels de la plateforme).
#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "StridesCore/CsoHud.h"
#include "StridesCsoHud.generated.h"

class UBorder;
class UCanvasPanel;
class UHorizontalBox;
class URichTextBlock;
class UScaleBox;
class USizeBox;
class UTextBlock;
class UVerticalBox;

// Valeurs de style d'un viewport de hud_cso_style.json (px CSS).
struct FStridesCsoHudStyle
{
	bool bLoaded = false;
	FVector2D Viewport = FVector2D(844, 390);
	FVector4 TopMid = FVector4(16, 10, 756, 0);  // x, y, largeur
	double Gap = 6;
	TSharedPtr<class FJsonObject> View;  // relevé brut du viewport retenu
};

UCLASS()
class STRIDESGRANDTOUR_API UStridesCsoHud : public UUserWidget
{
	GENERATED_BODY()

public:
	// État affiché : celui d'un modèle extérieur figé (captures), sinon celui de l'épreuve du monde.
	void SetFrozen(const strides::CsoHud* Model) { Frozen = Model; }
	const strides::CsoHud* Source() const;
	// Recalcule tout de suite l'affichage (sans attendre l'image suivante) ; ViewCss = taille du viewport en px CSS.
	void Refresh(const strides::CsoHud& H, const FVector2D& ViewCss);
	// Textes et visibilités affichés (tests) : « partie=texte » pour chaque élément visible.
	TArray<FString> Describe() const;
	// Style appliqué au toast I (taille de police en px CSS, marges intérieures, largeur maximale) : tests du changement de
	// viewport (rotation, redimensionnement).
	FString ToastStyle(int32 I) const;
	// Facteur de pixels de la plateforme (pixels physiques par px CSS) : 1 sur un écran de Mac non Retina.
	static double PixelRatio();
	// Style du viewport le plus proche (hauteur) dans le relevé du navigateur.
	static FStridesCsoHudStyle StyleFor(const TSharedPtr<class FJsonObject>& Doc, const FVector2D& ViewCss);

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	void Build();
	void ApplyStyle(const FStridesCsoHudStyle& S);
	const strides::CsoHud* Frozen = nullptr;
	TWeakObjectPtr<class AStridesCourse> Course;
	FStridesCsoHudStyle Style;
	FVector2D LastView = FVector2D::ZeroVector;
	double Clock = 0;  // temps du widget (animations d'apparition)
	TMap<int32, double> ToastBorn;
	TArray<int32> ToastIds;
	int32 ShownCadOn = 0;
	double HintBorn = -1, CadFade = 0;
	FString HintShown, NextShown;

	UPROPERTY() TObjectPtr<UCanvasPanel> Root;
	UPROPERTY() TObjectPtr<UScaleBox> Scale;
	UPROPERTY() TObjectPtr<USizeBox> Css;
	UPROPERTY() TObjectPtr<UCanvasPanel> Canvas;
	UPROPERTY() TObjectPtr<USizeBox> TopMidBox;
	UPROPERTY() TObjectPtr<UVerticalBox> TopMid;
	UPROPERTY() TObjectPtr<UBorder> Board;
	UPROPERTY() TObjectPtr<UHorizontalBox> BoardRow;
	UPROPERTY() TObjectPtr<UTextBlock> Clock0;
	UPROPERTY() TObjectPtr<USizeBox> ChronoBox;
	UPROPERTY() TObjectPtr<UTextBlock> Chrono;
	UPROPERTY() TObjectPtr<UTextBlock> Allowed;
	UPROPERTY() TObjectPtr<UTextBlock> Points;
	UPROPERTY() TObjectPtr<UBorder> NextPill;
	UPROPERTY() TObjectPtr<class UImage> NextArrow;
	UPROPERTY() TObjectPtr<class UTexture2D> Triangle;
	UPROPERTY() TObjectPtr<UTextBlock> Next;
	UPROPERTY() TObjectPtr<UHorizontalBox> Cad;
	UPROPERTY() TArray<TObjectPtr<UBorder>> CadBars;
	UPROPERTY() TObjectPtr<UBorder> Feedback;
	UPROPERTY() TObjectPtr<UTextBlock> FeedbackText;
	UPROPERTY() TObjectPtr<USizeBox> HintBox;
	UPROPERTY() TObjectPtr<UBorder> Hint;
	UPROPERTY() TObjectPtr<URichTextBlock> HintText;
	UPROPERTY() TObjectPtr<UVerticalBox> Toasts;
	UPROPERTY() TObjectPtr<USizeBox> BigBox;
	UPROPERTY() TObjectPtr<UVerticalBox> Big;
	UPROPERTY() TObjectPtr<UTextBlock> BigTitle;
	UPROPERTY() TObjectPtr<UBorder> BigSubPill;
	UPROPERTY() TObjectPtr<UTextBlock> BigSub;
	UPROPERTY() TObjectPtr<class UDataTable> HintStyles;
};
