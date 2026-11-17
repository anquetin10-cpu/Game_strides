// Données du jeu lues au démarrage dans Content/Data (JSON versionnés, exportés du jeu web par
// scripts/unreal/export-data.mjs) : allures, profils des chevaux, modèle de saut, conduite CSO, parcours.
// Les règles restent dans StridesCore ; ce sous-système ne fait que remplir ses paramètres (unités SI).
#pragma once
#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "StridesCore/CsoCourse.h"
#include "StridesCore/CsoRide.h"
#include "StridesCore/JumpModel.h"
#include "StridesDataSubsystem.generated.h"

USTRUCT(BlueprintType)
struct FStridesGait
{
	GENERATED_BODY()
	UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Id;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) FText Name;
	// Vitesse de l'allure (m/s) ; MaxSpeed > 0 : vitesse maximale réglable (galop de concours).
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float Speed = 0.f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float MaxSpeed = 0.f;
};

USTRUCT(BlueprintType)
struct FStridesHorseProfile
{
	GENERATED_BODY()
	UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Id;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Name;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Breed;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Coat;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) int32 Age = 0;
	// Multiplicateurs du jeu web (data.js) : vitesse, saut, endurance.
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float SpeedMul = 1.f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float JumpMul = 1.f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float StaminaMul = 1.f;
};

UCLASS()
class STRIDESGRANDTOUR_API UStridesDataSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()
public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	UPROPERTY(BlueprintReadOnly, Category = "Strides") TArray<FStridesGait> Gaits;
	UPROPERTY(BlueprintReadOnly, Category = "Strides") TArray<FStridesHorseProfile> Horses;
	// Hauteur de base du saut (m) : HORSE.jumpPeak du jeu web, multipliée par le profil du cheval.
	UPROPERTY(BlueprintReadOnly, Category = "Strides") float JumpPeak = 1.35f;
	UPROPERTY(BlueprintReadOnly, Category = "Strides") float MinJumpSpeed = 3.2f;
	// Fichiers lus, ou la raison d'un échec (affichée par le HUD : jamais de valeurs inventées en silence).
	UPROPERTY(BlueprintReadOnly, Category = "Strides") TArray<FString> LoadLog;

	const strides::JumpParams& Jump() const { return JumpP; }
	const strides::CsoRideParams& Ride() const { return RideP; }
	const strides::CourseDesign& PoleCourse() const { return PoleDesign; }
	const FStridesHorseProfile* FindHorse(const FString& Id) const;
	float CourseSpeed(const FString& Level) const;

private:
	bool LoadJson(const FString& File, TSharedPtr<class FJsonObject>& Out);
	strides::JumpParams JumpP;
	strides::CsoRideParams RideP;
	strides::CourseDesign PoleDesign;
	TMap<FString, float> CourseSpeeds;
};
