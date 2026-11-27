// Poteau « Chrono » d'une activité libre (tranche T10) — portage de Activities._markers (src/gameplay/activities.js:66-95)
// et de l'action contextuelle qu'il porte (src/gameplay/interact.js:18-53). La géométrie du poteau (mât, panneau) est
// celle exportée du jeu web et posée par AStridesCourse (BuildProps, tranche T5) ; cet acteur porte l'action : proposée
// à cheval, à moins de r m du départ de l'activité, sans mission en cours (strides::csoActivityAvailable, oracle
// unreal/core/tests/oracles/cso_entry.json), elle lance l'activité (AStridesCourse::StartActivity : grand message,
// contrôle de capacité, présentation…). Activités portées : Parcours du Pôle (cso_train) ; jalon J2c : entraînement à
// l'abord au paddock (cso_warmup, strides::csoWarmupActivity → AStridesCourse::StartTraining).
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesCore/CsoEntry.h"
#include "StridesActivityPost.generated.h"

class AStridesCourse;

UCLASS()
class STRIDESGRANDTOUR_API AStridesActivityPost : public AActor
{
	GENERATED_BODY()
public:
	AStridesActivityPost();
	// Activité (Content/Data/cso_activity.json) et épreuve qu'elle lance ; l'acteur est posé au poteau (a.marker).
	void Setup(const strides::CsoActivity& InDef, AStridesCourse* InCourse);
	// Mission en cours (g.missions.active) : épreuve lancée et pas terminée, ou mission de carrière du portage.
	bool MissionActive() const;
	// Action proposée pour ce point suivi (repère web) et ce mode du joueur (« foot », « ride », « drive »).
	bool Available(double FocusX, double FocusZ, const FString& Mode) const;
	// Libellé du bouton Action (t('Chrono'), langue de l'épreuve).
	FString Label() const;
	// interact.trigger → Activities.start : faux (rien n'est lancé) si l'action n'est pas proposée.
	bool Trigger(double FocusX, double FocusZ, const FString& Mode, const FString& Player, const FString& HorseName, double JumpPower, double Clearance);
	const strides::CsoActivity& Activity() const { return Def; }
	UPROPERTY() TObjectPtr<AStridesCourse> Course;
	// Joueur (save.playerName) : texte de l'annonce « N° … · joueur » de l'activité lancée.
	UPROPERTY() FString PlayerName;

private:
	strides::CsoActivity Def;
	bool bHasDef = false;
};
