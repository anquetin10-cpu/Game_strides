// Jalon J4-A : écran titre et création du personnage du jeu web (src/ui/screens.js showTitle :62-119, showSetup
// :121-146 ; src/game.js showTitle :1232, startGame :1302). Titre « EQUESTRIAN TOUR » et sous-titre, mention de
// l'application Strides intégrée, menu (« Continuer » et « Nouvelle partie » s'il existe une sauvegarde, sinon « Jouer » ;
// sauvegarde illisible : avertissement et « Nouvelle partie », rien n'est écrasé avant le choix), rappel des touches du
// clavier en pied de page ; puis « Qui monte en selle ? » : prénom (16 caractères, « Alex » par défaut), Cavalière /
// Cavalier, « C'est parti ». Couleurs et textes du web (styles.css .title-screen, .btn.primary). Non portés (choix n° 31
// de plan.md) : bouton « Découvrir la vraie application Strides » (lien externe), bascule FR | EN (textes des missions et
// des épreuves du portage en français seulement), écran de chargement et ses astuces.
// Clavier / manette : haut / bas choisissent, Entrée / E / F (manette : A) touchent ; la souris clique les boutons.
#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Components/Button.h"
#include "StridesTitleScreen.generated.h"

// Bouton de l'écran titre qui ne prend pas le focus clavier (l'écran le garde : sélection et saisie du prénom).
UCLASS()
class STRIDESGRANDTOUR_API UStridesTitleButton : public UButton
{
	GENERATED_BODY()
public:
	UStridesTitleButton() { InitIsFocusable(false); }
};

DECLARE_DELEGATE_ThreeParams(FStridesTitleChoice, bool /*bNew*/, const FString& /*Name*/, const FString& /*Avatar*/);

UCLASS()
class STRIDESGRANDTOUR_API UStridesTitleScreen : public UUserWidget
{
	GENERATED_BODY()
public:
	// bHasSave : sauvegarde lisible ; Issue : raison d'une sauvegarde illisible (vide sinon).
	void Open(bool bHasSave, const FString& Issue);
	bool IsOpen() const { return bOpen; }
	FStridesTitleChoice OnChoice;
	// Page affichée (« title » ou « setup »), boutons de la page dans l'ordre, bouton choisi.
	FString Page() const { return bSetup ? TEXT("setup") : TEXT("title"); }
	const TArray<FString>& Items() const { return ItemIds; }
	FString SelectedId() const { return ItemIds.IsValidIndex(Sel) ? ItemIds[Sel] : FString(); }
	void MoveSelection(int32 Dir);
	bool PressSelected();
	bool Press(const FString& Id);
	// Prénom en cours de saisie (champ choisi : les caractères tapés s'y ajoutent, Retour arrière efface).
	void TypeChar(TCHAR C);
	void Backspace();
	FString NameValue() const { return Name; }
	FString AvatarValue() const { return Avatar; }
	bool NameFieldSelected() const { return bSetup && SelectedId() == TEXT("name"); }
	// Textes affichés (tests et journal).
	TArray<FString> Describe() const;

protected:
	virtual void NativeOnInitialized() override;
	virtual FReply NativeOnKeyChar(const FGeometry& G, const FCharacterEvent& E) override;

private:
	void Build();
	void ShowPage();
	void Refresh();
	class UButton* MakeButton(const FString& Id, const FString& Label, bool bPrimary);
	UFUNCTION() void OnContinue();
	UFUNCTION() void OnNew();
	UFUNCTION() void OnPlay();
	UFUNCTION() void OnName();
	UFUNCTION() void OnAvatarF();
	UFUNCTION() void OnAvatarM();
	UFUNCTION() void OnStart();

	UPROPERTY() TObjectPtr<class UCanvasPanel> Root;
	UPROPERTY() TObjectPtr<class UImage> Shade;
	UPROPERTY() TObjectPtr<class UTexture2D> ShadeTex;
	UPROPERTY() TObjectPtr<class UVerticalBox> TitleCol;
	UPROPERTY() TObjectPtr<class UVerticalBox> Menu;
	UPROPERTY() TObjectPtr<class UTextBlock> Notice;
	UPROPERTY() TObjectPtr<class UTextBlock> Foot;
	UPROPERTY() TObjectPtr<class UBorder> SetupCard;
	UPROPERTY() TObjectPtr<class UTextBlock> NameText;
	UPROPERTY() TMap<FString, TObjectPtr<class UButton>> Buttons;
	UPROPERTY() TMap<FString, TObjectPtr<class UTextBlock>> Labels;
	TMap<FString, bool> Primary;
	TArray<FString> ItemIds;
	int32 Sel = 0;
	bool bOpen = false, bSetup = false, bHasSave = false;
	FString IssueText, Name = TEXT("Alex"), Avatar = TEXT("f");
};
