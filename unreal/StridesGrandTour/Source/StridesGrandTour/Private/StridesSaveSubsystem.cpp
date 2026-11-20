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

static bool ReadCore(const FString& SlotName, strides::SaveGame& Out, FString& Msg)
{
	UStridesSaveGame* S = Cast<UStridesSaveGame>(UGameplayStatics::LoadGameFromSlot(SlotName, 0));
	if (!S) { Msg = TEXT("Aucune sauvegarde"); return false; }
	std::string Err;
	if (!strides::SaveGame::fromJson(TCHAR_TO_UTF8(*S->Json), Out, Err)) { Msg = FString::Printf(TEXT("Sauvegarde illisible : %s"), UTF8_TO_TCHAR(Err.c_str())); return false; }
	return true;
}

bool UStridesSaveSubsystem::SaveNow(APlayerController* PC)
{
	strides::SaveGame Core;
	FString Msg;
	ReadCore(SlotName, Core, Msg);  // part de la sauvegarde existante (records importés) ; sinon une sauvegarde neuve
	Core.settings = Settings;  // réglages en cours (carte Pause)
	Core.bestTimes = Best;     // meilleurs temps des activités (tranche T11)
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
	// Tranche T11 : l'ancien record « cso_pole » pris à la sauvegarde (compareResults des défis) est retiré : le Parcours du
	// Pôle du web n'écrit pas de record de défi, il écrit bestTimes.cso_train à la fin de l'activité (RecordBestTime).
	UStridesSaveGame* S = Cast<UStridesSaveGame>(UGameplayStatics::CreateSaveGameObject(UStridesSaveGame::StaticClass()));
	S->Json = UTF8_TO_TCHAR(Core.toJson().c_str());
	if (const UStridesProgressionSubsystem* Progress = GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>())
	{
		S->Credits = Progress->Credits;
		S->Reputation = Progress->Reputation;
		S->ActiveMissionId = Progress->ActiveMissionId;
		S->CompletedMissions = Progress->CompletedMissions;
	}
	const bool Ok = UGameplayStatics::SaveGameToSlot(S, SlotName, 0);
	LastMessage = Ok ? TEXT("Partie sauvegardée") : TEXT("Échec de la sauvegarde");
	return Ok;
}

bool UStridesSaveSubsystem::LoadNow(APlayerController* PC)
{
	strides::SaveGame Core;
	if (!ReadCore(SlotName, Core, LastMessage)) return false;
	Settings = Core.settings;
	Best = Core.bestTimes;
	UWorld* W = PC ? PC->GetWorld() : nullptr;
	if (!W || !Core.pose.valid) { LastMessage = TEXT("Sauvegarde sans position"); return false; }
	if (UStridesSaveGame* Saved = Cast<UStridesSaveGame>(UGameplayStatics::LoadGameFromSlot(SlotName, 0)))
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

void UStridesSaveSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	ReloadSettings();
}

bool UStridesSaveSubsystem::ReloadSettings()
{
	strides::SaveGame Core;
	FString Msg;
	if (!UGameplayStatics::DoesSaveGameExist(SlotName, 0) || !ReadCore(SlotName, Core, Msg)) return false;
	Settings = Core.settings;
	Best = Core.bestTimes;
	return true;
}

bool UStridesSaveSubsystem::BestTime(const FString& Id, double& Out) const
{
	const auto It = Best.find(TCHAR_TO_UTF8(*Id));
	if (It == Best.end()) return false;
	Out = It->second;
	return true;
}

bool UStridesSaveSubsystem::RecordBestTime(const FString& Id, double Score)
{
	Best[TCHAR_TO_UTF8(*Id)] = Score;
	strides::SaveGame Core;
	FString Msg;
	UStridesSaveGame* Old = UGameplayStatics::DoesSaveGameExist(SlotName, 0) ? Cast<UStridesSaveGame>(UGameplayStatics::LoadGameFromSlot(SlotName, 0)) : nullptr;
	if (Old) ReadCore(SlotName, Core, Msg);
	Core.bestTimes = Best;
	UStridesSaveGame* S = Old ? Old : Cast<UStridesSaveGame>(UGameplayStatics::CreateSaveGameObject(UStridesSaveGame::StaticClass()));
	S->Json = UTF8_TO_TCHAR(Core.toJson().c_str());
	return UGameplayStatics::SaveGameToSlot(S, SlotName, 0);
}

bool UStridesSaveSubsystem::SaveSettings()
{
	strides::SaveGame Core;
	FString Msg;
	UStridesSaveGame* Old = UGameplayStatics::DoesSaveGameExist(SlotName, 0) ? Cast<UStridesSaveGame>(UGameplayStatics::LoadGameFromSlot(SlotName, 0)) : nullptr;
	if (Old) ReadCore(SlotName, Core, Msg);
	Core.settings = Settings;
	UStridesSaveGame* S = Old ? Old : Cast<UStridesSaveGame>(UGameplayStatics::CreateSaveGameObject(UStridesSaveGame::StaticClass()));
	S->Json = UTF8_TO_TCHAR(Core.toJson().c_str());
	return UGameplayStatics::SaveGameToSlot(S, SlotName, 0);
}

bool UStridesSaveSubsystem::ImportWebExport(const FString& Path)
{
	FString Text;
	if (!FFileHelper::LoadFileToString(Text, *Path)) { LastMessage = TEXT("Fichier introuvable"); return false; }
	strides::SaveGame Core;
	std::string Err;
	if (!strides::SaveGame::fromWebExport(TCHAR_TO_UTF8(*Text), Core, Err)) { LastMessage = UTF8_TO_TCHAR(Err.c_str()); return false; }
	Settings = Core.settings;
	Best = Core.bestTimes;
	UStridesSaveGame* S = Cast<UStridesSaveGame>(UGameplayStatics::CreateSaveGameObject(UStridesSaveGame::StaticClass()));
	S->Json = UTF8_TO_TCHAR(Core.toJson().c_str());
	const bool Ok = UGameplayStatics::SaveGameToSlot(S, SlotName, 0);
	LastMessage = Ok ? TEXT("Sauvegarde du jeu web importée") : TEXT("Échec de l'import");
	return Ok;
}
