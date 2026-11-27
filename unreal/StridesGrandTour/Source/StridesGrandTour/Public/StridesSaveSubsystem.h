// Sauvegarde native : le contenu est la sauvegarde versionnée du cœur (strides::SaveGame, JSON « strides.save »), rangée
// dans un USaveGame (emplacement « strides_main ») ; import d'une sauvegarde exportée du jeu web.
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "StridesCore/SaveGame.h"
#include "StridesSaveSubsystem.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API UStridesSaveGame : public USaveGame
{
	GENERATED_BODY()
public:
	UPROPERTY() FString Json;
	UPROPERTY() int32 Credits = 0;
	UPROPERTY() int32 Reputation = 0;
	UPROPERTY() FString ActiveMissionId;
	UPROPERTY() TArray<FString> CompletedMissions;
};

UCLASS()
class STRIDESGRANDTOUR_API UStridesSaveSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()
public:
	UFUNCTION(BlueprintCallable, Category = "Strides") bool SaveNow(class APlayerController* PC);
	UFUNCTION(BlueprintCallable, Category = "Strides") bool LoadNow(class APlayerController* PC);
	// Import du fichier exporté depuis Réglages du jeu web (chemin local) : devient la sauvegarde native.
	UFUNCTION(BlueprintCallable, Category = "Strides") bool ImportWebExport(const FString& Path);
	UPROPERTY(BlueprintReadOnly, Category = "Strides") FString LastMessage;
	// Jalon J3 : sauvegarde automatique toutes les 12 s de jeu (game.js _saveT, saveSoon) et reprise au lancement ; coupées
	// pendant les tests d'automatisation (la partie du joueur n'est jamais touchée par un test).
	bool bAutoSave = !GIsAutomationTesting;
	bool AutoSaveTick(class APlayerController* PC, float Dt);
	bool ResumeAtStart(class APlayerController* PC);
	float AutoSaveT = 0.f;
	static const FString Slot;
	// Emplacement utilisé (Slot par défaut) ; les tests en prennent un à eux pour ne jamais toucher la partie du joueur.
	FString SlotName = Slot;

	// Réglages en cours (save.js settings : jumpAid, courseLine…, tranche T8) : lus dans la sauvegarde à l'initialisation
	// (sinon ceux d'une sauvegarde neuve), modifiés par la carte Pause, écrits par SaveSettings (saveSoon du web) et par
	// SaveNow, relus par LoadNow.
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	const strides::Settings& GetSettings() const { return Settings; }
	strides::Settings& MutableSettings() { return Settings; }
	// Réglages écrits dans l'emplacement : le reste de la sauvegarde (position, records) est gardé ; sans sauvegarde,
	// une sauvegarde neuve portant ces réglages.
	bool SaveSettings();
	// Relit les réglages de l'emplacement (faux : aucune sauvegarde lisible, réglages inchangés).
	bool ReloadSettings();

	// Tranche T11 : meilleurs temps des activités (save.data.bestTimes du web), lus avec les réglages, écrits par SaveNow.
	// RecordBestTime : activities.js:120 (bestTimes[a.id] = score), écrit tout de suite dans l'emplacement (le reste de la
	// sauvegarde est gardé ; sans sauvegarde, une sauvegarde neuve) : le meilleur temps est conservé sans F5.
	bool BestTime(const FString& Id, double& Out) const;
	const std::map<std::string, double>& BestTimes() const { return Best; }
	// Tests (emplacement à eux, SlotName) : meilleurs temps en mémoire remis à ceux d'une sauvegarde neuve.
	std::map<std::string, double>& MutableBestTimes() { return Best; }
	bool RecordBestTime(const FString& Id, double Score);

	// Robe du cheval engagé (C1) : écurie et monture de la sauvegarde (save.data.horses, activeHorse), lues avec les
	// réglages et par LoadNow (sinon celles d'une sauvegarde neuve) ; monture engagée = activeHorseId (data.js).
	const std::vector<std::string>& StableHorses() const { return Horses; }
	const std::string& SavedActiveHorse() const { return ActiveHorse; }
	// Tests (emplacement à eux) : écurie et monture en mémoire.
	void SetStable(const std::vector<std::string>& InHorses, const std::string& InActive) { Horses = InHorses; ActiveHorse = InActive; }

private:
	strides::Settings Settings = strides::SaveGame::fresh().settings;
	std::map<std::string, double> Best;
	std::vector<std::string> Horses = strides::SaveGame::fresh().horses;
	std::string ActiveHorse = strides::SaveGame::fresh().activeHorse;
};
