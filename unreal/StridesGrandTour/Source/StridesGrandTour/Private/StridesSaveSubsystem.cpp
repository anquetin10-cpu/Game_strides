#include "StridesSaveSubsystem.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/FileHelper.h"
#include "StridesCore/CsoCourse.h"
#include "StridesCore/SaveGame.h"
#include "StridesCourse.h"
#include "StridesHorse.h"
#include "StridesProgressionSubsystem.h"
#include "StridesRider.h"
#include "StridesUnits.h"

const FString UStridesSaveSubsystem::Slot = TEXT("strides_main");

static bool ReadCore(strides::SaveGame& Out, FString& Msg)
{
	UStridesSaveGame* S = Cast<UStridesSaveGame>(UGameplayStatics::LoadGameFromSlot(UStridesSaveSubsystem::Slot, 0));
	if (!S) { Msg = TEXT("Aucune sauvegarde"); return false; }
	std::string Err;
	if (!strides::SaveGame::fromJson(TCHAR_TO_UTF8(*S->Json), Out, Err)) { Msg = FString::Printf(TEXT("Sauvegarde illisible : %s"), UTF8_TO_TCHAR(Err.c_str())); return false; }
	return true;
}

bool UStridesSaveSubsystem::SaveNow(APlayerController* PC)
{
	strides::SaveGame Core;
	FString Msg;
	ReadCore(Core, Msg);  // part de la sauvegarde existante (records, réglages) ; sinon une sauvegarde neuve
	UWorld* W = PC ? PC->GetWorld() : nullptr;
	if (!W) return false;
	AStridesHorse* Horse = nullptr;
	for (TActorIterator<AStridesHorse> It(W); It; ++It) Horse = *It;
	AStridesRider* Rider = nullptr;
	for (TActorIterator<AStridesRider> It(W); It; ++It) Rider = *It;
	// Position du joueur (repère web, m) : à cheval, celle du cheval.
	const bool Riding = Rider && Rider->MountedOn;
	const FVector P = Riding ? Horse->GetActorLocation() : Rider ? Rider->GetActorLocation() : FVector::ZeroVector;
	double X, Y, Z;
	StridesUnits::UEToWeb(P, X, Y, Z);
	const double Hd = Riding ? Horse->Heading() : StridesUnits::YawDegToHeading(Rider ? Rider->GetActorRotation().Yaw : 0);
	Core.pose = {Riding ? "ride" : "foot", X, Y, Z, Hd, true};
	if (Horse) Core.activeHorse = TCHAR_TO_UTF8(*Horse->ProfileId);
	// Record du parcours : seulement s'il est meilleur (challenge.js : compareResults).
	for (TActorIterator<AStridesCourse> It(W); It; ++It)
		if (const strides::CsoRun* Run = It->Run())
			if (Run->state().finished || Run->state().eliminated)
			{
				// Résultat de la manche (épreuve du cœur, tranche T4) : éliminé, fautes + pénalités de temps, chrono au centième.
				const strides::CsoRunState& St = Run->state();
				const strides::RunResult R{St.eliminated, St.eliminated ? 0 : Run->points(), std::round(St.t * 100) / 100};
				auto Cur = Core.records.find("cso_pole");
				const strides::RunResult Old = Cur == Core.records.end() ? strides::RunResult{true, 0, 0} : strides::RunResult{Cur->second.eliminated, Cur->second.penalties, Cur->second.time};
				if (Cur == Core.records.end() || strides::compareResults(R, Old) < 0) Core.records["cso_pole"] = {R.eliminated, R.penalties, R.time};
			}
	UStridesSaveGame* S = Cast<UStridesSaveGame>(UGameplayStatics::CreateSaveGameObject(UStridesSaveGame::StaticClass()));
	S->Json = UTF8_TO_TCHAR(Core.toJson().c_str());
	if (const UStridesProgressionSubsystem* Progress = GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>())
	{
		S->Credits = Progress->Credits;
		S->Reputation = Progress->Reputation;
		S->ActiveMissionId = Progress->ActiveMissionId;
		S->CompletedMissions = Progress->CompletedMissions;
	}
	const bool Ok = UGameplayStatics::SaveGameToSlot(S, Slot, 0);
	LastMessage = Ok ? TEXT("Partie sauvegardée") : TEXT("Échec de la sauvegarde");
	return Ok;
}

bool UStridesSaveSubsystem::LoadNow(APlayerController* PC)
{
	strides::SaveGame Core;
	if (!ReadCore(Core, LastMessage)) return false;
	UWorld* W = PC ? PC->GetWorld() : nullptr;
	if (!W || !Core.pose.valid) { LastMessage = TEXT("Sauvegarde sans position"); return false; }
	if (UStridesSaveGame* Saved = Cast<UStridesSaveGame>(UGameplayStatics::LoadGameFromSlot(Slot, 0)))
		if (UStridesProgressionSubsystem* Progress = GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>())
			Progress->Restore(Saved->Credits, Saved->Reputation, Saved->ActiveMissionId, Saved->CompletedMissions);
	AStridesHorse* Horse = nullptr;
	for (TActorIterator<AStridesHorse> It(W); It; ++It) Horse = *It;
	AStridesRider* Rider = nullptr;
	for (TActorIterator<AStridesRider> It(W); It; ++It) Rider = *It;
	if (!Horse || !Rider) return false;
	if (Rider->MountedOn) Rider->Dismount(PC);
	if (Core.pose.mode == "ride")
	{
		Horse->PlaceAt(Core.pose.x, Core.pose.z, Core.pose.heading);
		Rider->SetActorLocation(Horse->GetActorLocation() - Horse->GetActorRightVector() * 120.0 + FVector(0, 0, 90));
		Rider->TryMount(PC);
	}
	else Rider->SetActorLocationAndRotation(StridesUnits::WebToUE(Core.pose.x, Core.pose.y, Core.pose.z) + FVector(0, 0, 90), FRotator(0, StridesUnits::HeadingToYawDeg(Core.pose.heading), 0));
	LastMessage = TEXT("Partie rechargée");
	return true;
}

bool UStridesSaveSubsystem::ImportWebExport(const FString& Path)
{
	FString Text;
	if (!FFileHelper::LoadFileToString(Text, *Path)) { LastMessage = TEXT("Fichier introuvable"); return false; }
	strides::SaveGame Core;
	std::string Err;
	if (!strides::SaveGame::fromWebExport(TCHAR_TO_UTF8(*Text), Core, Err)) { LastMessage = UTF8_TO_TCHAR(Err.c_str()); return false; }
	UStridesSaveGame* S = Cast<UStridesSaveGame>(UGameplayStatics::CreateSaveGameObject(UStridesSaveGame::StaticClass()));
	S->Json = UTF8_TO_TCHAR(Core.toJson().c_str());
	const bool Ok = UGameplayStatics::SaveGameToSlot(S, Slot, 0);
	LastMessage = Ok ? TEXT("Sauvegarde du jeu web importée") : TEXT("Échec de l'import");
	return Ok;
}
