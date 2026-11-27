#include "StridesProgressionSubsystem.h"
#include "StridesDataSubsystem.h"

static const strides::StoryData* StoryOf(const UGameInstance* GI)
{
	const UStridesDataSubsystem* Data = GI ? GI->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	return Data ? Data->Story() : nullptr;
}

strides::CareerState UStridesProgressionSubsystem::MakeCareer() const
{
	strides::CareerState S;
	S.credits = Credits;
	S.reputation = Reputation;
	for (const FString& C : CompletedMissions) S.completed.push_back(TCHAR_TO_UTF8(*C));
	S.active = TCHAR_TO_UTF8(*ActiveMissionId);
	S.checkpoint = TCHAR_TO_UTF8(*CheckpointMission);
	S.step = MissionStep;
	return S;
}

void UStridesProgressionSubsystem::ApplyCareer(const strides::CareerState& S)
{
	Credits = S.credits;
	Reputation = S.reputation;
	CompletedMissions.Reset();
	for (const std::string& C : S.completed) CompletedMissions.Add(UTF8_TO_TCHAR(C.c_str()));
	ActiveMissionId = UTF8_TO_TCHAR(S.active.c_str());
	CheckpointMission = UTF8_TO_TCHAR(S.checkpoint.c_str());
	MissionStep = S.step;
}

bool UStridesProgressionSubsystem::IsAvailable(const FStridesMissionDefinition& Mission) const
{
	const strides::StoryData* St = StoryOf(GetGameInstance());
	const strides::StoryMission* M = St ? St->find(TCHAR_TO_UTF8(*Mission.Id)) : nullptr;
	return M && strides::storyAvailable(MakeCareer(), *M);
}

bool UStridesProgressionSubsystem::StartNextMission()
{
	// Outil hors Shipping (touche M) : accepte la première offre acceptable, comme un toucher « Accepter ».
	for (const FStridesMissionDefinition* M : Offers(0.0))
		if (OfferLock(M->Id).IsEmpty()) return StartMission(M->Id);
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	LastMessage = Data && CompletedMissions.Num() == Data->Missions.Num() ? TEXT("Carrière terminée") : TEXT("Aucune mission disponible");
	return false;
}

bool UStridesProgressionSubsystem::CompleteActiveMission()
{
	const strides::StoryData* St = StoryOf(GetGameInstance());
	const FStridesMissionDefinition* Mission = ActiveMission();
	if (!St || !Mission) return false;
	strides::CareerState S = MakeCareer();
	const strides::CareerReward R = strides::completeMission(*St, S);
	ApplyCareer(S);
	bCourseSeen = false;
	// missions.complete : carte « Mission réussie » (paiement, réputation) ; coût réglé sur place (Fer perdu).
	LastMessage = R.cost > 0
		? FString::Printf(TEXT("Mission réussie · %s · +%d € · -%d € de soins · +%d réputation"), *Mission->Title, R.pay, R.cost, R.rep)
		: FString::Printf(TEXT("Mission réussie · %s · +%d € · +%d réputation"), *Mission->Title, R.pay, R.rep);
	UE_LOG(LogTemp, Display, TEXT("Strides career complete: %s credits=%d reputation=%d (+%d, +%d)"), *Mission->Id, Credits, Reputation, R.pay - R.cost, R.rep);
	return true;
}

int32 UStridesProgressionSubsystem::StepCount() const
{
	const strides::StoryData* St = StoryOf(GetGameInstance());
	const strides::StoryMission* M = St && !ActiveMissionId.IsEmpty() ? St->find(TCHAR_TO_UTF8(*ActiveMissionId)) : nullptr;
	return M ? (int32)M->route.size() : 0;
}

FString UStridesProgressionSubsystem::StepText() const
{
	const strides::StoryData* St = StoryOf(GetGameInstance());
	const strides::MissionStep* Step = St ? strides::currentStep(*St, MakeCareer()) : nullptr;
	return Step ? FString(UTF8_TO_TCHAR(Step->text.c_str())) : FString();
}

bool UStridesProgressionSubsystem::CourseStepActive() const
{
	const strides::StoryData* St = StoryOf(GetGameInstance());
	const strides::MissionStep* Step = St ? strides::currentStep(*St, MakeCareer()) : nullptr;
	return Step && Step->kind == "course";
}

bool UStridesProgressionSubsystem::TickMission(const FVector2D& Me, bool bCourseRunning, bool bCourseFinished)
{
	const strides::StoryData* St = StoryOf(GetGameInstance());
	if (!St || ActiveMissionId.IsEmpty()) return false;
	if (CourseStepActive() && bCourseRunning) bCourseSeen = true;
	strides::CareerState S = MakeCareer();
	if (!strides::advanceStep(*St, S, Me.X, Me.Y, bCourseSeen && bCourseFinished && !bCourseRunning)) return false;
	MissionStep = S.step;
	bCourseSeen = false;
	UE_LOG(LogTemp, Display, TEXT("Strides career step: %s %d/%d"), *ActiveMissionId, MissionStep, StepCount());
	if (MissionStep >= StepCount()) CompleteActiveMission();
	return true;
}

FString UStridesProgressionSubsystem::OfferLock(const FString& Id) const
{
	const strides::StoryData* St = StoryOf(GetGameInstance());
	if (!St) return FString();
	for (const strides::CareerOffer& O : strides::storyOffers(*St, MakeCareer(), [](const std::string&) { return false; }))
		if (O.mission->id == TCHAR_TO_UTF8(*Id)) return O.locked ? FString(UTF8_TO_TCHAR(O.lockText.c_str())) : FString();
	return FString();
}

double UStridesProgressionSubsystem::TierProgress() const
{
	const strides::StoryData* St = StoryOf(GetGameInstance());
	return St ? strides::reputationTier(*St, Reputation).progress : 0.0;
}

FString UStridesProgressionSubsystem::MissionStatus() const
{
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	if (!Data) return TEXT("Missions indisponibles");
	if (ActiveMissionId.IsEmpty())
		return CompletedMissions.Num() == Data->Missions.Num() ? TEXT("Carrière terminée") : TEXT("Aucune mission active");
	const FStridesMissionDefinition* Mission = ActiveMission();
	if (!Mission) return TEXT("Mission inconnue");
	// Objectif de l'étape du web (setObjective) ; numéro d'étape pour suivre l'itinéraire.
	return FString::Printf(TEXT("%s (%d/%d)"), *StepText(), FMath::Min(MissionStep + 1, StepCount()), StepCount());
}

FString UStridesProgressionSubsystem::RankName() const
{
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	FString Result = Data && Data->Progression.Num() ? Data->Progression[0].Name : FString(TEXT("Premiers contrats"));
	if (Data)
		for (const FStridesProgressionLevel& Level : Data->Progression)
			if (Reputation >= Level.Reputation) Result = Level.Name;
	return Result;
}

FVector2D UStridesProgressionSubsystem::ActiveTarget() const
{
	const strides::StoryData* St = StoryOf(GetGameInstance());
	const strides::MissionStep* Step = St ? strides::currentStep(*St, MakeCareer()) : nullptr;
	return Step ? FVector2D(Step->x, Step->z) : FVector2D::ZeroVector;
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
	MissionStep = 0;
	bCourseSeen = false;
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
	// refreshOffers du web (StridesCore/Career::storyOffers) : ordre de STORY, verrou de palier, refus de moins de 40 s.
	TArray<const FStridesMissionDefinition*> Out;
	const strides::StoryData* St = StoryOf(GetGameInstance());
	if (!St) return Out;
	const auto Refused = [this, Now](const std::string& Id) { const double* R = RefusedAt.Find(UTF8_TO_TCHAR(Id.c_str())); return R && Now - *R < 40.0; };
	for (const strides::CareerOffer& O : strides::storyOffers(*St, MakeCareer(), Refused))
		if (const FStridesMissionDefinition* M = FindMission(UTF8_TO_TCHAR(O.mission->id.c_str()))) Out.Add(M);
	return Out;
}

bool UStridesProgressionSubsystem::StartMission(const FString& Id)
{
	const strides::StoryData* St = StoryOf(GetGameInstance());
	if (!St) return false;
	strides::CareerState S = MakeCareer();
	const strides::AcceptResult R = strides::acceptMission(*St, S, TCHAR_TO_UTF8(*Id));
	const FStridesMissionDefinition* M = FindMission(Id);
	switch (R)
	{
	case strides::AcceptResult::Busy: LastMessage = TEXT("Termine ou abandonne ta mission en cours d’abord."); return false;
	case strides::AcceptResult::Locked: LastMessage = OfferLock(Id); return false;
	case strides::AcceptResult::Funds: LastMessage = FString::Printf(TEXT("Solde insuffisant : il faut %d € (solde %d €)."), M ? M->Cost : 0, Credits); return false;
	case strides::AcceptResult::Unknown: return false;
	default: break;
	}
	ApplyCareer(S);  // point de reprise « start » (missions.start : enregistré tout de suite), étape 0
	bCourseSeen = false;
	RefusedAt.Remove(Id);
	ClearGps();
	LastMessage = FString::Printf(TEXT("%s · Mission Strides · %s"), *M->Title.ToUpper(), *M->Category);
	UE_LOG(LogTemp, Display, TEXT("Strides career start: %s (téléphone) %d étapes"), *M->Id, StepCount());
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
	MissionStep = 0;
	bCourseSeen = false;
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
		// Ligne « GPS · … » : objectif de l'étape (texte du web), sinon le lieu de la mission.
		const FStridesMissionDefinition* M = FindMission(ActiveMissionId);
		Label = StepText();
		if (Label.IsEmpty()) Label = M ? (M->PlaceName.IsEmpty() ? PlaceName(M->Place) : M->PlaceName) : FString(TEXT("GPS"));
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
