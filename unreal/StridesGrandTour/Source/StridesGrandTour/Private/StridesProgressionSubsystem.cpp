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
			CheckpointMission = Mission.Id;
			ClearGps();
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
	if (CheckpointMission == Mission->Id) CheckpointMission.Empty();
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
	CompletedMissions = InCompleted;
	ActiveMissionId.Empty();
	CheckpointMission = CompletedMissions.Contains(InActiveMission) ? FString() : InActiveMission;
	ClearGps();
	RefusedAt.Reset();
	LastMessage = CheckpointMission.IsEmpty() ? TEXT("Progression rechargée") : TEXT("Progression rechargée · mission à reprendre dans l'app Strides");
}

const FStridesMissionDefinition* UStridesProgressionSubsystem::FindMission(const FString& Id) const
{
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	return Data ? Data->Missions.FindByPredicate([&Id](const FStridesMissionDefinition& M) { return M.Id == Id; }) : nullptr;
}

TArray<const FStridesMissionDefinition*> UStridesProgressionSubsystem::Offers(double Now) const
{
	TArray<const FStridesMissionDefinition*> Out;
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	if (!Data) return Out;
	for (const FStridesMissionDefinition& M : Data->Missions)
	{
		if (!IsAvailable(M) || M.Id == ActiveMissionId) continue;
		if (const double* R = RefusedAt.Find(M.Id)) if (Now - *R < 40.0) continue;
		if (M.Id == CheckpointMission) Out.Insert(&M, 0);
		else Out.Add(&M);
	}
	return Out;
}

bool UStridesProgressionSubsystem::StartMission(const FString& Id)
{
	if (!ActiveMissionId.IsEmpty())
	{
		LastMessage = TEXT("Mission en cours : termine ou abandonne ta mission en cours d'abord.");
		return false;
	}
	const FStridesMissionDefinition* M = FindMission(Id);
	if (!M || !IsAvailable(*M)) return false;
	ActiveMissionId = M->Id;
	CheckpointMission = M->Id;  // point de reprise « start » (missions.start : enregistré tout de suite)
	RefusedAt.Remove(M->Id);
	ClearGps();
	LastMessage = FString::Printf(TEXT("%s · Mission Strides · %s"), *M->Title.ToUpper(), *M->Category);
	UE_LOG(LogTemp, Display, TEXT("Strides career start: %s (téléphone)"), *M->Id);
	return true;
}

void UStridesProgressionSubsystem::RefuseMission(const FString& Id, double Now)
{
	RefusedAt.Add(Id, Now);
	LastMessage = TEXT("Mission refusée — elle te sera reproposée.");
}

bool UStridesProgressionSubsystem::AbandonMission()
{
	if (ActiveMissionId.IsEmpty()) return false;
	UE_LOG(LogTemp, Display, TEXT("Strides career abandon: %s"), *ActiveMissionId);
	if (CheckpointMission == ActiveMissionId) CheckpointMission.Empty();
	ActiveMissionId.Empty();
	LastMessage = TEXT("Mission abandonnée.");
	return true;
}

FVector2D UStridesProgressionSubsystem::PlacePosition(const FString& Place) const
{
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	if (!Data) return FVector2D::ZeroVector;
	const FStridesPoi* Poi = Data->PointsOfInterest.FindByPredicate([&Place](const FStridesPoi& P) { return P.Id == Place; });
	if (!Poi && Place == TEXT("paris")) Poi = Data->PointsOfInterest.FindByPredicate([](const FStridesPoi& P) { return P.Id == TEXT("pole"); });
	if (Poi) return Poi->Position;
	const FStridesWorldRegion* Region = Data->WorldRegions.FindByPredicate([&Place](const FStridesWorldRegion& R) { return R.Id == Place; });
	return Region ? Region->Center : FVector2D::ZeroVector;
}

FString UStridesProgressionSubsystem::PlaceName(const FString& Place) const
{
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	if (!Data) return Place;
	if (const FStridesPoi* Poi = Data->PointsOfInterest.FindByPredicate([&Place](const FStridesPoi& P) { return P.Id == Place; })) return Poi->Name;
	if (const FStridesWorldRegion* R = Data->WorldRegions.FindByPredicate([&Place](const FStridesWorldRegion& X) { return X.Id == Place; })) return R->Name;
	return Place;
}

void UStridesProgressionSubsystem::SetGps(const FVector2D& Target, const FString& Label)
{
	Gps = Target;
	GpsLabel = Label;
	bGps = true;
	UE_LOG(LogTemp, Display, TEXT("Strides GPS : %s (%.1f, %.1f)"), *Label, Target.X, Target.Y);
}

bool UStridesProgressionSubsystem::GuideTarget(FVector2D& Out, FString& Label) const
{
	if (HasActiveTarget())
	{
		Out = ActiveTarget();
		const FStridesMissionDefinition* M = FindMission(ActiveMissionId);
		Label = M ? PlaceName(M->Place) : FString(TEXT("GPS"));
		return true;
	}
	if (bGps) { Out = Gps; Label = GpsLabel; return true; }
	return false;
}

FString UStridesProgressionSubsystem::WithDistance(const FString& Text, double D)
{
	// missions.js withDist : km avec une décimale (virgule) dès 1 000 m, sinon arrondi à la dizaine de mètres.
	const FString Dist = D >= 1000.0 ? FString::Printf(TEXT("%.1f km"), D / 1000.0).Replace(TEXT("."), TEXT(",")) : FString::Printf(TEXT("%d m"), (int32)(FMath::RoundHalfFromZero(D / 10.0) * 10));
	return FString::Printf(TEXT("%s · %s"), *Text, *Dist);
}
