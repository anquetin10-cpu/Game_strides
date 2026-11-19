// Commandes (Enhanced Input, créées dans le code : aucune ressource binaire nécessaire) : déplacement / conduite,
// regard, saut, monter-descendre, allure, sauvegarder, recharger. Sur iOS, le joystick virtuel du moteur est complété
// par des boutons UMG explicites pour que toutes les actions essentielles restent accessibles sans clavier.
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "InputActionValue.h"
#include "StridesPlayerController.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API AStridesPlayerController : public APlayerController
{
	GENERATED_BODY()
public:
	void TouchJump();
	void TouchInteract();
	void TouchGaitUp();
	void TouchGaitDown();
	void TouchSave();
	void TouchLoad();
	void TouchPhone();
	void TouchMission();
	bool IsPhoneOpen() const { return bPhoneOpen; }
protected:
	virtual void BeginPlay() override;
	virtual void SetupInputComponent() override;
private:
	void InstallInputContext();
	void OnMove(const FInputActionValue& V);
	void OnMoveDone(const FInputActionValue& V);
	void OnLook(const FInputActionValue& V);
	void OnJump();
	void OnInteract();
	void OnGaitUp();
	void OnGaitDown();
	void OnSave();
	void OnLoad();
	void OnDemoCourse();
	void OnPhone();
	void OnMission();
	UPROPERTY() TObjectPtr<class UInputMappingContext> Context;
	UPROPERTY() TObjectPtr<class UInputAction> MoveAction;
	UPROPERTY() TObjectPtr<class UInputAction> LookAction;
	UPROPERTY() TObjectPtr<class UInputAction> JumpAction;
	UPROPERTY() TObjectPtr<class UInputAction> InteractAction;
	UPROPERTY() TObjectPtr<class UInputAction> GaitUpAction;
	UPROPERTY() TObjectPtr<class UInputAction> GaitDownAction;
	UPROPERTY() TObjectPtr<class UInputAction> SaveAction;
	UPROPERTY() TObjectPtr<class UInputAction> LoadAction;
	UPROPERTY() TObjectPtr<class UInputAction> DemoCourseAction;
	UPROPERTY() TObjectPtr<class UInputAction> PhoneAction;
	UPROPERTY() TObjectPtr<class UInputAction> MissionAction;
	UPROPERTY() TObjectPtr<class UUserWidget> TouchControls;
public:
	// Interface d'épreuve UMG (tranche T7).
	class UStridesCsoHud* CsoHudWidget() const { return CsoHud; }
private:
	UPROPERTY() TObjectPtr<class UStridesCsoHud> CsoHud;
	bool bPhoneOpen = false;
	class AStridesRider* Rider() const;
};
