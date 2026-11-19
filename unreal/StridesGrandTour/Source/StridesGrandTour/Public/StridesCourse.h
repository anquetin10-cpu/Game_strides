// Épreuve de CSO : tracé (strides::traceCourse, données Content/Data/cso_course_pole.json), obstacles, déroulé de
// l'épreuve (strides::CsoRun, tranche T4 : entrée de piste, entrée en piste, cloche, lignes, chrono, points en direct,
// refus, erreurs de parcours, éliminations, arrivée, sortie de piste, textes fr / en de Content/Data/strings_cso.json).
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesCore/CsoCourse.h"
#include "StridesCore/CsoFences.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/Text.h"
#include "StridesCore/JumpModel.h"
#include <memory>
#include "StridesCourse.generated.h"

class AStridesFence;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FStridesCourseEvent, const FString&, Kind, const FString&, Text);

UCLASS()
class STRIDESGRANDTOUR_API AStridesCourse : public AActor
{
	GENERATED_BODY()
public:
	AStridesCourse();
	// Hauteur de l'épreuve (m) et niveau de vitesse ("national" 350 m/min, "csi", "gp").
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Strides") float CourseHeight = 1.1f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Strides") FString SpeedLevel = TEXT("national");
	// Langue des textes de l'épreuve (« fr » ou « en », comme la sauvegarde : strides::SaveGame::lang).
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Strides") FString Lang = TEXT("fr");
	UPROPERTY(BlueprintAssignable, Category = "Strides") FStridesCourseEvent OnCourseEvent;

	void Build(const strides::CourseDesign& Design, const class UStridesDataSubsystem& Data);
	// Même construction sans le sous-système de données : vitesse du niveau (m/s) et largeur des obstacles (m). Aucune
	// épreuve n'est préparée (règles, lignes et textes viennent des données).
	void BuildWith(const strides::CourseDesign& Design, double CourseSpeedMS, double FenceWidthM);
	// Lancement de l'activité (premier pas de la mission : rejoindre l'entrée de la carrière) avec les règles et textes
	// préparés par Build ; faux si aucune donnée. Joueur et cheval : textes de l'annonce (N° … · joueur / et cheval).
	bool StartRun(const FString& PlayerName, const FString& HorseName);
	// Même lancement avec des règles et une table de textes données (tests).
	void StartRunWith(const strides::CsoRunConfig& Config, const strides::TextTable& Text);
	// Une image de l'épreuve (Run.update du jeu web), appelée par le cheval après le pas du cœur, les obstacles et leurs
	// événements (même ordre que src/game.js:1489-1507). La cadence de concours peut être réécrite (refus compté,
	// sortie de piste).
	void TickRun(const strides::CsoRunFrame& Frame, strides::CsoCadence& Cadence);
	const strides::CsoRun* Run() const { return RunPtr.get(); }
	strides::CsoRun* Run() { return RunPtr.get(); }
	// Obstacles vus par le cheval (visée, aide à l'appel, refus : strides::csoTarget / csoTiming / csoApproachRefusal),
	// dans l'ordre du parcours ; l'indice d'un obstacle du cœur est celui de son acteur (FenceAt).
	const std::vector<strides::CsoObstacle>& Obstacles() const { return CoreObstacles; }
	AStridesFence* FenceAt(int32 Index) const { return Fences.IsValidIndex(Index) ? Fences[Index].Get() : nullptr; }
	// État des obstacles du cœur (barres, remises, barres en attente), même ordre que Obstacles() : écrit par
	// strides::csoFencesUpdateHorse (appelé par le cheval) et par UpdateFences.
	std::vector<strides::CsoFenceState>& FenceStates() { return CoreStates; }
	// Événements des obstacles du cœur (obstacle:clear / fault / refusal) : journal, puis écouteurs de l'épreuve
	// (courses.js : obstacle attendu, sens, chrono lancé ; refus compté : cadence remise à 0).
	void HandleFenceOut(const strides::CsoFenceOut& Out, strides::CsoCadence& Cadence);
	// Obstacles.update(dt) du jeu web (chute des barres, vibration, remises) puis affichage des barres. FocusX / FocusZ :
	// position suivie (cheval monté), repère web.
	void UpdateFences(double Dt, double Time, double FocusX, double FocusZ);
	const TArray<FString>& FenceEventLog() const { return FenceLog; }
	// Appels de l'interface (hud.big / toast / hint / clearHint) et sons (audio.*) demandés par l'épreuve, dans l'ordre :
	// « fn | arg | arg… ». Les sons ne sont pas joués (tranche T12), l'interface d'épreuve est en T7.
	const TArray<FString>& HudLog() const { return HudCalls; }
	const TArray<FString>& AudioLog() const { return AudioCalls; }
	// Remises des barres demandées par l'épreuve (entrée en piste, obstacles.js resetRails) et appliquées aux obstacles.
	int32 RailResets() const { return RailResetCount; }

	UFUNCTION(BlueprintPure, Category = "Strides") float ElapsedTime() const;
	UFUNCTION(BlueprintPure, Category = "Strides") int32 Faults() const;
	UFUNCTION(BlueprintPure, Category = "Strides") int32 NextFence() const;
	UFUNCTION(BlueprintPure, Category = "Strides") int32 TimeAllowed() const { return Allowed; }
	// Tableau de chrono (textes de hud.js) pendant le parcours, sinon objectif de l'étape (Run.text).
	UFUNCTION(BlueprintPure, Category = "Strides") FString StatusText() const;
	const strides::CourseTrace& CourseTraceData() const { return Trace; }

private:
	void FlushRunCalls();
	strides::CourseTrace Trace;
	std::vector<strides::CsoObstacle> CoreObstacles;
	std::vector<strides::CsoFenceState> CoreStates;
	TArray<FString> FenceLog, HudCalls, AudioCalls;
	int32 Allowed = 64, RailResetCount = 0;
	bool bRunConfig = false;
	strides::CsoRunConfig RunConfig;
	strides::TextTable RunText;  // copie : CsoRun en garde une référence
	std::unique_ptr<strides::CsoRun> RunPtr;
	UPROPERTY() TArray<TObjectPtr<AStridesFence>> Fences;
};
