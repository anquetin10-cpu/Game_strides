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
	// Bouton SAUT coloré (tranche T9, hud.js:373-380, 433-442 ; styles relevés par état dans Content/Data/cso_jump_style.json) :
	// état du HUD d'épreuve → clé de style (« none », « far », « good », « near », suivie de « -early » pendant « Trop
	// tôt ») ; affichage : clé posée, libellé et signe affichés, couleurs du fond, de l'anneau et de la pastille, halo,
	// boîtes de l'anneau et de la pastille (px CSS ; zéro si masqués).
	static FString JumpStyleKey(const strides::CsoHud* RaceHud);
	FString JumpShownKey() const { return JumpKey; }
	FString JumpLabelText() const;
	FString JumpSignText() const;
	FLinearColor JumpColor(const FString& Part) const;  // « background », « ring », « sign », « signText », « label »
	bool JumpGlowShown() const;
	FVector4 JumpPartBox(const FString& Part) const;    // « ring », « sign », « glow »
	// Langue du libellé (textes du jeu, strings_cso.json) : celle de l'épreuve ; forcée par les captures et les tests.
	void SetLangForTest(const FString& InLang) { TestLang = InLang; }

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	void Build();
	void ApplyStyle(const FVector2D& ViewCss);
	void ApplyJumpState(const strides::CsoHud* RaceHud, const FVector2D& ViewCss);
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
	UPROPERTY() TObjectPtr<class UImage> JumpGlow;
	UPROPERTY() TObjectPtr<class UImage> JumpRing;
	UPROPERTY() TObjectPtr<class UBorder> JumpSign;
	UPROPERTY() TObjectPtr<class UTextBlock> JumpSignLabel;
	UPROPERTY() TArray<TObjectPtr<class UTexture2D>> JumpTextures;
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
	// Bouton SAUT coloré (tranche T9) : relevé du viewport retenu, clé et textes affichés, boîtes posées.
	TSharedPtr<class FJsonObject> JumpView;
	FVector2D JumpView0 = FVector2D(844, 390);
	FString JumpKey, JumpLabelShown, JumpSignShown, TestLang;
	FVector2D JumpKeyView = FVector2D::ZeroVector;
	FVector4 RingBox, SignBox, GlowBox;
	FLinearColor JumpBg, JumpRingC, JumpSignC, JumpSignTextC, JumpLabelC;
	bool bJumpGlow = false;
};
