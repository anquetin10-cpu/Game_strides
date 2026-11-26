// Carte Pause (tranche T8) : menu du jeu web en pause (src/ui/screens.js:215-257, carte générique :159-176), en épreuve :
// kicker « Pause », titre, rappel des gestes de l'épreuve, bascules « Tracé au sol » et « Aide au saut » (réglages
// courseLine et jumpAid, écrits dans la sauvegarde et appliqués à l'épreuve en cours), rappel des commandes, encart
// Strides, version, actions (Écran titre, Découvrir…, Partager, Reprendre). Mise en page, textes et styles relevés dans
// la page tactile du navigateur (Content/Data/cso_controls_style.json : boîtes en px CSS) ; libellés des bascules :
// labels du même fichier, choisis par le cœur (strides::pauseLineLabelKey, pauseAidLabelKey). Une unité = un px CSS.
#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "StridesPauseMenu.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API UStridesPauseMenu : public UUserWidget
{
	GENERATED_BODY()

public:
	void Open(class AStridesPlayerController* InPC);
	void Close();
	bool IsOpen() const { return bOpen; }
	// Libellés affichés des bascules, bouton d'aide actif ou non (tests).
	FString LineLabel() const;
	FString AidLabel() const;
	bool AidEnabled() const;
	// Clic sur un bouton par son identifiant du web (pause-line, pause-aid, resume, title, strides, share) : mêmes
	// gestionnaires qu'au toucher (tests).
	bool ClickForTest(const FString& Id);
	// Clavier / manette (choix n° 9, 2e correction J1 : la carte Pause piégeait le joueur au clavier) : bouton choisi,
	// « Reprendre » d'office à l'ouverture ; gauche / droite parcourent les boutons d'action (Écran titre, Découvrir…,
	// Partager, Reprendre) avec le liseré vert des cartes ; Entrée / E / F / X déclenchent le bouton choisi.
	FString SelectedButtonId() const { return SelectedId; }
	void MoveSelection(int32 Dir);
	bool PressSelected();
	// Éléments affichés (« partie=texte »), pour les tests et les captures.
	TArray<FString> Describe() const;
	void SetViewCssForTest(const FVector2D& V) { TestView = V; }
	// Recalcule tout de suite la mise en page (sans attendre l'image suivante).
	void Refresh();

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	void Build();
	void ApplyStyle(const FVector2D& ViewCss);
	void RefreshLabels();
	bool InRace() const;
	bool AidLocked() const;
	FVector2D ViewCss() const;
	class UStridesSaveSubsystem* Save() const;
	class AStridesCourse* RaceCourse() const;
	UFUNCTION() void OnLine();
	UFUNCTION() void OnAid();
	UFUNCTION() void OnResume();
	UFUNCTION() void OnOther();

	UPROPERTY() TObjectPtr<class AStridesPlayerController> PC;
	UPROPERTY() TObjectPtr<class UCanvasPanel> Root;
	UPROPERTY() TObjectPtr<class UScaleBox> Scale;
	UPROPERTY() TObjectPtr<class USizeBox> CssBox;
	UPROPERTY() TObjectPtr<class UCanvasPanel> Canvas;
	UPROPERTY() TArray<TObjectPtr<class UWidget>> Parts;  // reconstruits à chaque changement de viewport
	UPROPERTY() TObjectPtr<class UButton> LineButton;
	UPROPERTY() TObjectPtr<class UTextBlock> LineText;
	UPROPERTY() TObjectPtr<class UButton> AidButton;
	UPROPERTY() TObjectPtr<class UTextBlock> AidText;
	UPROPERTY() TMap<FString, TObjectPtr<class UButton>> ActionButtons;
	UPROPERTY() TObjectPtr<class UBorder> SelRing;
	TArray<FString> ActionOrder;
	TMap<FString, FVector4> ActionBoxes;
	FString SelectedId = TEXT("resume");
	void PlaceSelRing();
	UPROPERTY() TArray<TObjectPtr<class UTexture2D>> Textures;
	UPROPERTY() TObjectPtr<class UDataTable> RichStyles;
	TSharedPtr<class FJsonObject> Doc;
	TArray<FString> Shown;
	FVector2D LastView = FVector2D::ZeroVector;
	FVector2D TestView = FVector2D::ZeroVector;
	bool bOpen = false;
	bool bLastRace = false;
};
