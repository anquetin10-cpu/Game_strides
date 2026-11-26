// Carte de bilan (tranche T11 : courses.js:372-424, textes du cœur strides::csoResultCard via AStridesCourse::ResultCard ;
// styles et relevé de base par langue et par viewport : Content/Data/cso_result_style.json ; mise en page du flux CSS
// strides::csoResultLayout, lignes de chaque texte et largeur du texte des cellules mesurées par le moteur ; classe more
// de la barre d'actions suivie au défilement du corps). Cartes de l'entrée dans l'épreuve (tranche T10) : carte de
// présentation (src/gameplay/courses.js:119-138, gabarit
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
#include "StridesCore/Ranking.h"
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
	// Carte ou dialogue affiché (relevé à la dernière mise à jour) : 0 aucune carte, 1 présentation, 2 plan, 3 bilan.
	int32 CardShown() const { return ShownScreen; }
	bool DialogShown() const { return bDialogShown; }
	// Bouton par son identifiant du web (plan, plan-back, enter ; bilan : cso-retry, cso-train, cso-done ; dialog : toucher le
	// dialogue) : mêmes gestionnaires
	// qu'au toucher (tests, captures) ; faux si ce bouton n'est pas affiché.
	bool ClickForTest(const FString& Id);
	// Bouton principal de la carte affichée (« Entrer en piste », « Retour », « Continuer ») déclenché au clavier ou à la
	// manette (Entrée / E / F, bouton X) : un bouton HTML du web garde le focus clavier ; la carte du portage n'en a pas.
	// Faux sans carte ni bouton principal (jalon J1, correction, choix n° 8).
	bool PressPrimary();
	FString PrimaryButtonId() const { return PrimaryId; }
	// Bouton choisi au clavier / à la manette (gauche / droite, croix ou stick) : le principal à l'ouverture ; liseré vert
	// autour du bouton choisi. PressPrimary déclenche le bouton choisi (choix n° 8).
	void MoveSelection(int32 Dir);
	FString SelectedButtonId() const { return SelectedId.IsEmpty() ? PrimaryId : SelectedId; }
	// Éléments affichés (« partie=texte »), pour les tests et les captures.
	TArray<FString> Describe() const { return Shown; }
	void SetViewCssForTest(const FVector2D& V) { TestView = V; }
	// Met à jour tout de suite (sans attendre l'image suivante).
	void Refresh();
	const UStridesCoursePlanView* PlanView() const { return PlanW; }
	// Boîte (px CSS) d'une partie affichée : « card », « kicker », « title », « k0 »…, « v0 »…, « rules », « svg »,
	// « legend », « plan » / « plan-back » / « enter » (boutons), « dialog », « av », « line ».
	FVector4 BoxOf(const FString& Part) const { const FVector4* B = Boxes.Find(Part); return B ? *B : FVector4(0, 0, 0, 0); }
	// Bilan posé sans épreuve (tests de mise en page) : carte du cœur et langue de la vue ; ClearResultForTest le retire.
	void SetResultForTest(const strides::CsoResultCard& Card, const FString& InLang) { TestCard = Card; TestLang = InLang; }
	void ClearResultForTest() { TestCard.Reset(); }
	// Mise en page du bilan affiché (csoResultLayout) et ses entrées mesurées par le moteur ; nul hors du bilan.
	const strides::CsoResultLayout* ResultLayoutShown() const { return bResultLay ? &ResultLay : nullptr; }
	const strides::CsoResultLayoutIn* ResultLayoutInput() const { return bResultLay ? &ResultLayIn : nullptr; }
	// Corps défilable de la carte affichée : défilement (px CSS), défilement maximal, classe more de la barre d'actions
	// (scrollHeight − scrollTop − clientHeight > 4, screens.js:151) ; ScrollCardForTest défile comme le doigt.
	void ScrollCardForTest(double Offset);
	double CardScrollOffset() const { return CardOffset; }
	double CardMaxScroll() const { return FMath::Max(0.0, CardScrollH - CardClientH); }
	bool CardMore() const { return bCardMore; }

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
	UFUNCTION() void OnRetry();
	UFUNCTION() void OnTrain();
	UFUNCTION() void OnDone();
	UFUNCTION() void OnCardScrolled(float Offset);
	void UpdateMore();
	const strides::CsoResultCard& ResultShown() const;

	UPROPERTY() TObjectPtr<class AStridesCourse> Course;
	UPROPERTY() TObjectPtr<class UCanvasPanel> Root;
	UPROPERTY() TObjectPtr<class UScaleBox> Scale;
	UPROPERTY() TObjectPtr<class USizeBox> CssBox;
	UPROPERTY() TObjectPtr<class UCanvasPanel> Canvas;
	UPROPERTY() TArray<TObjectPtr<class UWidget>> Parts;
	UPROPERTY() TArray<TObjectPtr<class UTexture2D>> Textures;
	UPROPERTY() TObjectPtr<UStridesCoursePlanView> PlanW;
	UPROPERTY() TObjectPtr<class UScrollBox> CardScroll;
	UPROPERTY() TArray<TObjectPtr<class UWidget>> MoreParts;  // ombre et bordure de la barre d'actions (classe more)
	double CardScrollH = 0, CardClientH = 0, CardOffset = 0;
	bool bCardMore = false;
	TOptional<strides::CsoResultCard> TestCard;
	FString TestLang;
	strides::CsoResultLayout ResultLay;
	strides::CsoResultLayoutIn ResultLayIn;
	bool bResultLay = false;
	TArray<FString> Shown;
	TArray<FString> ButtonIds;
	FString PrimaryId, SelectedId;
	UPROPERTY(Transient) TObjectPtr<class UBorder> SelRing;
	void PlaceSelRing();
	TMap<FString, FVector4> Boxes;
	FVector2D TestView = FVector2D::ZeroVector;
	int32 ShownScreen = 0;  // 0 : aucune carte, 1 : présentation, 2 : plan, 3 : bilan
	bool bDialogShown = false;
	FString ShownKey;       // état affiché (carte, dialogue, langue, cheval, viewport) : reconstruit quand il change
};
