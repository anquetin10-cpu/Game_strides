// Cartes de l'entrée dans l'épreuve (tranche T10) : carte de présentation (src/gameplay/courses.js:119-138, gabarit
// src/ui/screens.js:159-177), carte du plan du parcours (courses.js:111-118, src/ui/coursePlan.js) et dialogue de
// l'entraîneur (src/ui/hud.js:547-583), en UMG. Mise en page relevée dans le navigateur (Content/Data/cso_screens_style.json,
// scripts/unreal/export-cso-entry.mjs --screens : boîtes et styles calculés à 844 × 390 et 667 × 308 ; viewport le plus
// proche en hauteur, carte centrée) ; textes du cœur (AStridesCourse::Presentation / PlanCard : strides::csoPresentation,
// csoPlanCard ; dialogue : appel « dialog » du déroulé) ; plan dessiné en Slate depuis les primitives du cœur
// (strides::coursePlan, UStridesCoursePlanView). L'état (carte ouverte, dialogue) est celui de l'épreuve
// (AStridesCourse::Screen, DialogOpen) ; les boutons y renvoient (PressScreenButton, AdvanceDialog). Police du moteur
// (Geist non embarquée) à la taille en px CSS, comme les autres cartes ; une unité = un px CSS.
#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Components/Widget.h"
#include "StridesCore/CoursePlan.h"
#include "StridesCsoScreens.generated.h"

// Plan du parcours dessiné en Slate (SVG du web : viewBox mis à l'échelle de la boîte, centré, xMidYMid meet) : rectangles
// arrondis, traits (extrémités rondes), pointillés, triangles pleins, disques, textes ; fond et arrondi de l'élément svg.
UCLASS()
class STRIDESGRANDTOUR_API UStridesCoursePlanView : public UWidget
{
	GENERATED_BODY()
public:
	void SetPlan(const strides::CoursePlan& InPlan, const FLinearColor& Background, double Radius);
	// Primitives par sorte (rect, line, polyline, path, circle, text) peintes à la dernière peinture ; vide avant.
	TMap<FString, int32> DrawnCounts() const;
	// Échelle et origine du viewBox dans la boîte (px CSS par unité, décalage) : xMidYMid meet.
	static void Fit(const double Vb[4], const FVector2D& Box, double& OutScale, FVector2D& OutOrigin);
	virtual void ReleaseSlateResources(bool bReleaseChildren) override;

protected:
	virtual TSharedRef<SWidget> RebuildWidget() override;

private:
	TSharedPtr<SWidget> Slate;  // SStridesCoursePlan (StridesCsoScreens.cpp)
	strides::CoursePlan Data;
	FLinearColor Bg = FLinearColor::Transparent;
	double Rad = 0;
};

UCLASS()
class STRIDESGRANDTOUR_API UStridesCsoScreens : public UUserWidget
{
	GENERATED_BODY()

public:
	void Bind(class AStridesCourse* InCourse) { Course = InCourse; }
	class AStridesCourse* BoundCourse() const { return Course; }
	// Carte ou dialogue affiché (relevé à la dernière mise à jour) : 0 aucune carte, 1 présentation, 2 plan.
	int32 CardShown() const { return ShownScreen; }
	bool DialogShown() const { return bDialogShown; }
	// Bouton par son identifiant du web (plan, plan-back, enter ; dialog : toucher le dialogue) : mêmes gestionnaires
	// qu'au toucher (tests, captures) ; faux si ce bouton n'est pas affiché.
	bool ClickForTest(const FString& Id);
	// Éléments affichés (« partie=texte »), pour les tests et les captures.
	TArray<FString> Describe() const { return Shown; }
	void SetViewCssForTest(const FVector2D& V) { TestView = V; }
	// Met à jour tout de suite (sans attendre l'image suivante).
	void Refresh();
	const UStridesCoursePlanView* PlanView() const { return PlanW; }
	// Boîte (px CSS) d'une partie affichée : « card », « kicker », « title », « k0 »…, « v0 »…, « rules », « svg »,
	// « legend », « plan » / « plan-back » / « enter » (boutons), « dialog », « av », « line ».
	FVector4 BoxOf(const FString& Part) const { const FVector4* B = Boxes.Find(Part); return B ? *B : FVector4(0, 0, 0, 0); }

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	void Build();
	void Clear();
	void BuildCard(int32 Which, const FVector2D& ViewCss);
	void BuildDialog(const FVector2D& ViewCss);
	FVector2D ViewCss() const;
	UFUNCTION() void OnPlan();
	UFUNCTION() void OnBack();
	UFUNCTION() void OnEnter();
	UFUNCTION() void OnDialog();

	UPROPERTY() TObjectPtr<class AStridesCourse> Course;
	UPROPERTY() TObjectPtr<class UCanvasPanel> Root;
	UPROPERTY() TObjectPtr<class UScaleBox> Scale;
	UPROPERTY() TObjectPtr<class USizeBox> CssBox;
	UPROPERTY() TObjectPtr<class UCanvasPanel> Canvas;
	UPROPERTY() TArray<TObjectPtr<class UWidget>> Parts;
	UPROPERTY() TArray<TObjectPtr<class UTexture2D>> Textures;
	UPROPERTY() TObjectPtr<UStridesCoursePlanView> PlanW;
	TArray<FString> Shown;
	TArray<FString> ButtonIds;
	TMap<FString, FVector4> Boxes;
	FVector2D TestView = FVector2D::ZeroVector;
	int32 ShownScreen = 0;  // 0 : aucune carte, 1 : présentation, 2 : plan
	bool bDialogShown = false;
	FString ShownKey;       // état affiché (carte, dialogue, langue, cheval, viewport) : reconstruit quand il change
};
