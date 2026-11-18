#include "StridesProgressionSubsystem.h"
#include "StridesDataSubsystem.h"

bool UStridesProgressionSubsystem::IsAvailable(const FStridesMissionDefinition& Mission) const
{
	if (CompletedMissions.Contains(Mission.Id)) return false;
	for (const FString& Required : Mission.Requires)
		if (!CompletedMissions.Contains(Required)) return false;
	return true;
}

bool UStridesProgressionSubsystem::StartNextMission()
{
	if (!ActiveMissionId.IsEmpty())
	{
		LastMessage = TEXT("Une mission est déjà active");
		return false;
	}
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	if (!Data) return false;
	for (const FStridesMissionDefinition& Mission : Data->Missions)
		if (IsAvailable(Mission))
		{
			ActiveMissionId = Mission.Id;
			LastMessage = FString::Printf(TEXT("Mission lancée : %s"), *Mission.Title);
			UE_LOG(LogTemp, Display, TEXT("Strides career start: %s"), *Mission.Id);
			return true;
		}
	LastMessage = CompletedMissions.Num() == Data->Missions.Num() ? TEXT("Carrière terminée") : TEXT("Aucune mission disponible");
	return false;
}

bool UStridesProgressionSubsystem::CompleteActiveMission()
{
	if (ActiveMissionId.IsEmpty()) return false;
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	if (!Data) return false;
	const FStridesMissionDefinition* Mission = Data->Missions.FindByPredicate([this](const FStridesMissionDefinition& M) { return M.Id == ActiveMissionId; });
	if (!Mission) return false;
	Credits += Mission->Pay;
	Reputation += Mission->Xp;
	CompletedMissions.AddUnique(Mission->Id);
	LastMessage = FString::Printf(TEXT("%s terminée · +%d crédits · +%d réputation"), *Mission->Title, Mission->Pay, Mission->Xp);
	UE_LOG(LogTemp, Display, TEXT("Strides career complete: %s credits=%d reputation=%d"), *Mission->Id, Credits, Reputation);
	ActiveMissionId.Empty();
	return true;
}

FString UStridesProgressionSubsystem::MissionStatus() const
{
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	if (!Data) return TEXT("Missions indisponibles");
	if (ActiveMissionId.IsEmpty())
		return CompletedMissions.Num() == Data->Missions.Num() ? TEXT("Carrière terminée") : TEXT("Aucune mission active");
	const FStridesMissionDefinition* Mission = Data->Missions.FindByPredicate([this](const FStridesMissionDefinition& M) { return M.Id == ActiveMissionId; });
	return Mission ? FString::Printf(TEXT("%s · rejoindre %s"), *Mission->Title, *Mission->Place) : TEXT("Mission inconnue");
}

FString UStridesProgressionSubsystem::RankName() const
{
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	FString Result = TEXT("Groom");
	if (Data)
		for (const FStridesProgressionLevel& Level : Data->Progression)
			if (Reputation >= Level.Reputation) Result = Level.Name;
	return Result;
}

FVector2D UStridesProgressionSubsystem::ActiveTarget() const
{
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	if (!Data || ActiveMissionId.IsEmpty()) return FVector2D::ZeroVector;
	const FStridesMissionDefinition* Mission = Data->Missions.FindByPredicate([this](const FStridesMissionDefinition& M) { return M.Id == ActiveMissionId; });
	if (!Mission) return FVector2D::ZeroVector;
	const FStridesPoi* Poi = Data->PointsOfInterest.FindByPredicate([Mission](const FStridesPoi& P) { return P.Id == Mission->Place; });
	// La finale parisienne part du Pôle via le transport événementiel.
	if (!Poi && Mission->Place == TEXT("paris")) Poi = Data->PointsOfInterest.FindByPredicate([](const FStridesPoi& P) { return P.Id == TEXT("pole"); });
	if (Poi) return Poi->Position;
	const FStridesWorldRegion* Region = Data->WorldRegions.FindByPredicate([Mission](const FStridesWorldRegion& R) { return R.Id == Mission->Place; });
	return Region ? Region->Center : FVector2D::ZeroVector;
}

bool UStridesProgressionSubsystem::HasActiveTarget() const
{
	if (ActiveMissionId.IsEmpty()) return false;
	const FVector2D Target = ActiveTarget();
	return !Target.IsNearlyZero();
}

void UStridesProgressionSubsystem::Restore(int32 InCredits, int32 InReputation, const FString& InActiveMission, const TArray<FString>& InCompleted)
{
	Credits = FMath::Max(0, InCredits);
	Reputation = FMath::Max(0, InReputation);
	ActiveMissionId = InActiveMission;
	CompletedMissions = InCompleted;
	LastMessage = TEXT("Progression rechargée");
}
