// Commandes à l'écran. Tranche T8 : boutons SAUT et pause du HUD du web (src/ui/hud.js:50, 60, 113-118 ;
// styles.css:118, 137, 212-232, 990-992), joystick flottant tactile (input.js, styles.css:84-97, 854), à la place des
// joysticks virtuels du moteur ; styles, boîtes et icônes relevés dans la page tactile du navigateur
// (Content/Data/cso_controls_style.json, Content/Data/ui/). Une unité de mise en page = un px CSS.
// Boutons du portage (MONTER, ALLURE ±, SAUVER, CHARGER, TÉLÉPHONE, MISSION) : mode tactile seulement, masqués en
// épreuve (tranche T7). Le widget existe sur toutes les plateformes : SAUT et pause sont des boutons du HUD du web
// (visibles aussi sur ordinateur) ; le joystick n'est dessiné qu'en mode tactile (body.desktop du web le masque).
#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "StridesCore/CsoHud.h"
#include "StridesCore/CsoInput.h"
#include "StridesTouchControls.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API UStridesTouchControls : public UUserWidget
{
	GENERATED_BODY()

public:
	// Bouton visible selon l'état du HUD d'épreuve (RaceHud nul ou sans cso-ctl : hors épreuve). « Jump » (SAUT) : masqué
	// seulement par les classes du HUD (le web le cache aussi hors du mode « ride », voir Sync) ; « Pause » : jamais masqué ;
	// boutons du portage : comme le web masque action, BOOST et téléphone (styles.css:988-995), SAUVER, CHARGER et
	// MISSION, sans équivalent, masqués aussi en épreuve.
	static bool ButtonVisible(const FString& Name, const strides::CsoHud* RaceHud);
	// Noms des boutons visibles (tests, journal des captures en partie réelle).
	TArray<FString> VisibleButtons() const;
	// Visibilités, joystick et mise en page : appelé à chaque image par NativeTick (et par les tests : sans joueur
	// propriétaire, widget construit au premier appel).
	void Sync();
	// Mode tactile (joystick, boutons du portage) : par défaut celui de la plateforme (iOS ou -TouchControls) ; forcé par
	// les captures (pose tactile du web) et les tests.
	void SetTouchMode(bool bOn) { bTouchSet = true; bTouch = bOn; }
	bool IsTouchMode() const;
	// Tests sans joueur : commandes lues (joystick) et cheval monté ou non.
	void SetCommandsForTest(const strides::CsoInput* Commands, bool bRiding) { TestCommands = Commands; bTestRiding = bRiding; }
	void SetViewCssForTest(const FVector2D& V) { TestView = V; }
	// Affichage (tests, captures) : boîte en px CSS [x, y, largeur, hauteur] d'un bouton ou du joystick (« Joystick »,
	// « Knob »), opacité du joystick ; zéro si masqué.
	FVector4 BoxOf(const FString& Name) const;
	// Boîte effectivement posée sur le slot du canevas (position et taille du widget affiché, px CSS) : « Jump », « Pause ».
	FVector4 SlotBoxOf(const FString& Name) const;
	double JoystickOpacity() const;
	// Appui / relâchement du bouton SAUT ou pause comme un doigt (tests) : mêmes gestionnaires qu'au toucher.
	void PressForTest(const FString& Name, bool bDown);

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	void Build();
	void ApplyStyle(const FVector2D& ViewCss);
	FVector2D ViewCss() const;
	const strides::CsoInput* Commands() const;
	bool Riding() const;
	UFUNCTION() void Interact();
	UFUNCTION() void GaitUp();
	UFUNCTION() void GaitDown();
	UFUNCTION() void Save();
	UFUNCTION() void Load();
	UFUNCTION() void Phone();
	UFUNCTION() void Mission();
	UFUNCTION() void JumpDown();
	UFUNCTION() void JumpUp();
	UFUNCTION() void PauseDown();
	UFUNCTION() void PauseUp();

	UPROPERTY() TObjectPtr<class AStridesPlayerController> Controller;
	UPROPERTY() TArray<TObjectPtr<class UButton>> Buttons;
	UPROPERTY() TObjectPtr<class UScaleBox> Scale;
	UPROPERTY() TObjectPtr<class USizeBox> Css;
	UPROPERTY() TObjectPtr<class UCanvasPanel> CssCanvas;
	UPROPERTY() TObjectPtr<class UImage> JoyBase;
	UPROPERTY() TObjectPtr<class UImage> JoyKnobShadow;
	UPROPERTY() TObjectPtr<class UImage> JoyKnob;
	UPROPERTY() TObjectPtr<class UButton> JumpButton;
	UPROPERTY() TObjectPtr<class UImage> JumpIcon;
	UPROPERTY() TObjectPtr<class UTextBlock> JumpLabel;
	UPROPERTY() TObjectPtr<class UImage> PauseShadow;
	UPROPERTY() TObjectPtr<class UButton> PauseButton;
	UPROPERTY() TObjectPtr<class UImage> PauseIcon;
	UPROPERTY() TArray<TObjectPtr<class UTexture2D>> Textures;
	TWeakObjectPtr<class AStridesCourse> Course;
	TSharedPtr<class FJsonObject> View;  // relevé du viewport retenu (cso_controls_style.json)
	FVector2D LastView = FVector2D::ZeroVector;
	FVector2D View0 = FVector2D(844, 390);  // viewport du relevé
	FVector4 JumpBox, PauseBox, RestBox, KnobSize;  // boîtes placées pour le viewport courant (px CSS)
	FVector2D JoyCenter = FVector2D::ZeroVector, KnobCenter = FVector2D::ZeroVector;
	double JoyOpacity = 0;
	bool bTouchSet = false, bTouch = false;
	const strides::CsoInput* TestCommands = nullptr;
	bool bTestRiding = false;
	FVector2D TestView = FVector2D::ZeroVector;
};
