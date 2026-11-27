#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "StridesProgressionSubsystem.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API UStridesProgressionSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()
public:
	UPROPERTY(BlueprintReadOnly, Category="Strides|Progression") int32 Credits = 0;
	UPROPERTY(BlueprintReadOnly, Category="Strides|Progression") int32 Reputation = 0;
	UPROPERTY(BlueprintReadOnly, Category="Strides|Progression") FString ActiveMissionId;
	UPROPERTY(BlueprintReadOnly, Category="Strides|Progression") TArray<FString> CompletedMissions;
	UPROPERTY(BlueprintReadOnly, Category="Strides|Progression") FString LastMessage;

	UFUNCTION(BlueprintCallable, Category="Strides|Progression") bool StartNextMission();
	UFUNCTION(BlueprintCallable, Category="Strides|Progression") bool CompleteActiveMission();
	UFUNCTION(BlueprintPure, Category="Strides|Progression") FString MissionStatus() const;
	UFUNCTION(BlueprintPure, Category="Strides|Progression") FString RankName() const;
	UFUNCTION(BlueprintPure, Category="Strides|Progression") FVector2D ActiveTarget() const;
	UFUNCTION(BlueprintPure, Category="Strides|Progression") bool HasActiveTarget() const;
	bool IsAvailable(const struct FStridesMissionDefinition& Mission) const;
	// Rechargement (save.js) : crédits, réputation, missions terminées ; la mission en cours à la sauvegarde devient un
	// point de reprise (d.checkpoint du web) : elle est reproposée en tête de l'app Strides, marquée « Reprise », et ne
	// redémarre qu'acceptée à nouveau (missions.js refreshOffers : o.resume ; « les missions ordinaires ne sont pas reprises »).
	void Restore(int32 InCredits, int32 InReputation, const FString& InActiveMission, const TArray<FString>& InCompleted);

	// ---- Jalon J3 : téléphone, offres, GPS ----
	// Mission en cours à reprendre (point de reprise du web, checkpoint.mission), vide sinon.
	UPROPERTY(BlueprintReadOnly, Category="Strides|Progression") FString CheckpointMission;
	// Offres de l'app Strides (refreshOffers, missions de l'histoire) : missions disponibles (prérequis terminés), sauf la
	// mission en cours et celles refusées depuis moins de 40 s ; le point de reprise en tête. Now : temps de jeu (s).
	TArray<const struct FStridesMissionDefinition*> Offers(double Now) const;
	const struct FStridesMissionDefinition* FindMission(const FString& Id) const;
	// Acceptation depuis la demande (requests.js « Accepter la mission », missions.start) : faux si une mission est déjà en
	// cours ou si l'offre n'est pas disponible. Le GPS manuel est remplacé par la cible de la mission (applyWaypoint).
	bool StartMission(const FString& Id);
	// Refus (missions.refuse) : reproposée après 40 s de jeu ; Abandon (missions.abandon) : mission arrêtée, point de reprise effacé.
	void RefuseMission(const FString& Id, double Now);
	bool AbandonMission();
	// Nom du lieu d'une mission (lieu, sinon région du monde).
	FString PlaceName(const FString& Place) const;
	FVector2D PlacePosition(const FString& Place) const;
	// GPS posé à la main (app Activités « Itinéraire » : gps.set(a.start, a.name)) ; effacé à l'arrivée (rayon 6 m, gps.set).
	void SetGps(const FVector2D& Target, const FString& Label);
	void ClearGps() { bGps = false; GpsLabel.Empty(); }
	bool HasGps() const { return bGps; }
	FVector2D GpsTarget() const { return Gps; }
	const FString& GpsName() const { return GpsLabel; }
	// Cible du guidage : celle de la mission en cours, sinon le GPS posé à la main ; Label : titre de la mission ou nom du lieu.
	bool GuideTarget(FVector2D& Out, FString& Label) const;
	// Objectif de la mission avec la distance (makeSteps withDist : « … · 340 m », « … · 1,2 km » ; arrondi à 10 m).
	static FString WithDistance(const FString& Text, double Meters);
private:
	TMap<FString, double> RefusedAt;
	FVector2D Gps = FVector2D::ZeroVector;
	FString GpsLabel;
	bool bGps = false;
};
