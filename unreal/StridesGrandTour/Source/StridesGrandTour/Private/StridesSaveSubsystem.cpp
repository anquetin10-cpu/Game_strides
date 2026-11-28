#include "StridesSaveSubsystem.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/FileHelper.h"
#include "StridesCore/CsoCourse.h"
#include "StridesCore/SaveGame.h"
#include "StridesCollectibles.h"
#include "StridesCourse.h"
#include "StridesHorse.h"
#include "StridesProgressionSubsystem.h"
#include "StridesRider.h"
#include "StridesUnits.h"
#include "StridesVehicle.h"

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
	Core.playerName = TCHAR_TO_UTF8(*PlayerName);  // jalon J4-A : création du personnage
	Core.avatar = TCHAR_TO_UTF8(*Avatar);
	Core.settings = Settings;  // réglages en cours (carte Pause)
	Core.challenges = ChallengeRecords;  // records des défis (J4-D)
	for (const auto& [Id, R] : ChallengeRecords) if (R.hasBest) Core.records[Id] = {R.best.isEliminated(), R.best.penalties, R.best.time};
	Core.bestTimes = Best;     // meilleurs temps des activités (tranche T11)
	Core.gameTime = GameTime;  // heure du jeu (J3-C)
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
	double Hd = Riding ? Horse->Heading() : StridesUnits::YawDegToHeading(Rider ? Rider->GetActorRotation().Yaw : 0);
	// Jalon J3b : au volant, le joueur est repris à pied à la portière (le web le pose à la position du véhicule et le
	// repousse hors de sa boîte : placeFromSave, colliders.resolve).
	if (const AStridesVehicle* Drv = Cast<AStridesVehicle>(PC->GetPawn()))
	{
		const FVector2D D = Drv->DoorWeb();
		X = D.X;
		Z = D.Y;
		Hd = Drv->Heading();
	}
	Core.pose = {Riding ? "ride" : "foot", X, Y, Z, Hd, true};
	// Cheval engagé (game.js _storePositions : pos.horse), aussi à pied : il est retrouvé là où il a été laissé.
	if (Horse)
	{
		double HX, HY, HZ;
		StridesUnits::UEToWeb(Horse->GetActorLocation(), HX, HY, HZ);
		Core.pose.horseValid = true;
		Core.pose.horseX = HX;
		Core.pose.horseZ = HZ;
		Core.pose.horseHeading = Horse->Heading();
		// Jalon J3b : cheval embarqué dans le camion : repris à la rampe arrière.
		for (TActorIterator<AStridesVehicle> It(W); It; ++It)
			if (It->CarriesHorse())
			{
				Core.pose.horseX = It->RampWeb().X;
				Core.pose.horseZ = It->RampWeb().Y;
			}
	}
	if (Horse) Core.activeHorse = TCHAR_TO_UTF8(*Horse->ProfileId);
	// Tranche T11 : l'ancien record « cso_pole » pris à la sauvegarde (compareResults des défis) est retiré : le Parcours du
	// Pôle du web n'écrit pas de record de défi, il écrit bestTimes.cso_train à la fin de l'activité (RecordBestTime).
	UStridesSaveGame* S = Cast<UStridesSaveGame>(UGameplayStatics::CreateSaveGameObject(UStridesSaveGame::StaticClass()));
	S->Json = UTF8_TO_TCHAR(Core.toJson().c_str());
	if (const UStridesProgressionSubsystem* Progress = GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>())
	{
		S->Credits = Progress->Credits;
		S->Reputation = Progress->Reputation;
		// Mission en cours, sinon le point de reprise (rechargée, pas encore reprise) : il survit à une 2e relance.
		S->ActiveMissionId = Progress->ActiveMissionId.IsEmpty() ? Progress->CheckpointMission : Progress->ActiveMissionId;
		S->CompletedMissions = Progress->CompletedMissions;
	}
	S->Horseshoes = Horseshoes;
	for (TActorIterator<AStridesVehicle> It(W); It; ++It)
		if (!It->bAtSpot || It->ParkedIndex() < 0)
		{
			S->VehicleIds.Add(It->ParkedIndex());
			S->VehiclePoses.Add(FVector(It->WebPos().X, It->WebPos().Y, It->Heading()));
		}
	const bool Ok = UGameplayStatics::SaveGameToSlot(S, SlotName, 0);
	LastMessage = Ok ? TEXT("Partie sauvegardée") : TEXT("Échec de la sauvegarde");
	UE_LOG(LogTemp, Display, TEXT("Strides sauvegarde : %s (%s, position %.1f, %.1f, mission %s, %d terminée(s))"), Ok ? TEXT("écrite") : TEXT("ÉCHEC"), *SlotName, X, Z,
		S->ActiveMissionId.IsEmpty() ? TEXT("aucune") : *S->ActiveMissionId, S->CompletedMissions.Num());
	return Ok;
}

bool UStridesSaveSubsystem::AutoSaveTick(APlayerController* PC, float Dt)
{
	// game.js update : _saveT > 12 s → saveSoon (positions puis save.save).
	if (!bAutoSave) return false;
	AutoSaveT += Dt;
	if (AutoSaveT <= 12.f) return false;
	AutoSaveT = 0.f;
	const FString Keep = LastMessage;
	const bool Ok = SaveNow(PC);
	LastMessage = Keep;  // sauvegarde silencieuse, comme le web (aucun message)
	return Ok;
}

bool UStridesSaveSubsystem::ResumeAtStart(APlayerController* PC)
{
	// Reprise de la partie au lancement (bouton « Continuer » de l'écran titre du web, pas encore porté : J4-A).
	if (!bAutoSave || !UGameplayStatics::DoesSaveGameExist(SlotName, 0)) return false;
	const bool Ok = LoadNow(PC);
	UE_LOG(LogTemp, Display, TEXT("Strides sauvegarde : reprise au lancement %s (%s)"), Ok ? TEXT("faite") : TEXT("impossible"), *LastMessage);
	if (Ok) LastMessage = TEXT("Partie reprise");
	return Ok;
}

bool UStridesSaveSubsystem::LoadNow(APlayerController* PC)
{
	strides::SaveGame Core;
	if (!ReadCore(SlotName, Core, LastMessage)) return false;
	Settings = Core.settings;
	Best = Core.bestTimes;
	PlayerName = UTF8_TO_TCHAR(Core.playerName.c_str());
	Avatar = UTF8_TO_TCHAR(Core.avatar.c_str());
	Horses = Core.horses;
	ActiveHorse = Core.activeHorse;
	GameTime = Core.gameTime;
	UWorld* W = PC ? PC->GetWorld() : nullptr;
	if (!W || !Core.pose.valid) { LastMessage = TEXT("Sauvegarde sans position"); return false; }
	// Jalon J3b : au volant au moment du rechargement, descente d'abord (véhicule arrêté).
	if (AStridesVehicle* Drv = Cast<AStridesVehicle>(PC->GetPawn()))
	{
		Drv->Sim.vx = 0;
		Drv->Exit(PC);
	}
	if (UStridesSaveGame* Saved = Cast<UStridesSaveGame>(UGameplayStatics::LoadGameFromSlot(SlotName, 0)))
	{
		Horseshoes = Saved->Horseshoes;
		for (int32 I = 0; I < Saved->VehicleIds.Num() && I < Saved->VehiclePoses.Num(); ++I)
			for (TActorIterator<AStridesVehicle> It(W); It; ++It)
				if (It->ParkedIndex() == Saved->VehicleIds[I])
				{
					const FVector& Vp = Saved->VehiclePoses[I];
					It->PlaceAt(Vp.X, Vp.Y, Vp.Z);
					It->bAtSpot = false;
				}
		if (UStridesProgressionSubsystem* Progress = GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>())
			Progress->Restore(Saved->Credits, Saved->Reputation, Saved->ActiveMissionId, Saved->CompletedMissions);
	}
	AStridesHorse* Horse = nullptr;
	for (TActorIterator<AStridesHorse> It(W); It; ++It) Horse = *It;
	AStridesRider* Rider = nullptr;
	for (TActorIterator<AStridesRider> It(W); It; ++It) Rider = *It;
	if (!Horse || !Rider) return false;
	// Monture de la sauvegarde (game.js spawnMainHorse(activeHorseId(d))) : robe du cheval engagé.
	Horse->ApplyEngagedCoat();
	if (Rider->MountedOn) Rider->Dismount(PC);
	if (Core.pose.mode == "ride")
	{
		Horse->PlaceAt(Core.pose.x, Core.pose.z, Core.pose.heading);
		Rider->SetActorLocation(Horse->GetActorLocation() - Horse->GetActorRightVector() * 120.0 + FVector(0, 0, 90));
		Rider->TryMount(PC);
	}
	else
	{
		// À pied : le cheval revient où il a été laissé (game.js:1063 mainHorse.setPosition(pos.horse)) ; ancienne
		// sauvegarde sans cette position : il reste à son point d'apparition, repéré sur la mini-carte (StridesHUD).
		if (Core.pose.horseValid) Horse->PlaceAt(Core.pose.horseX, Core.pose.horseZ, Core.pose.horseHeading);
		Rider->SetActorLocationAndRotation(StridesUnits::WebToUE(Core.pose.x, Core.pose.y, Core.pose.z) + FVector(0, 0, 90), FRotator(0, StridesUnits::HeadingToYawDeg(Core.pose.heading), 0));
	}
	for (TActorIterator<AStridesCollectibles> It(W); It; ++It) It->Refresh();
	LastMessage = TEXT("Partie rechargée");
	return true;
}

void UStridesSaveSubsystem::CheckSave(bool& bHas, FString& Issue) const
{
	bHas = false;
	Issue.Reset();
	if (!UGameplayStatics::DoesSaveGameExist(SlotName, 0)) return;
	strides::SaveGame Core;
	FString Msg;
	if (!ReadCore(SlotName, Core, Msg)) { Issue = Msg + TEXT("."); return; }
	bHas = Core.pose.valid;
	if (!bHas) Issue = TEXT("La sauvegarde ne contient pas de position.");
}

bool UStridesSaveSubsystem::NewGame(APlayerController* PC, const FString& Name, const FString& InAvatar)
{
	UWorld* W = PC ? PC->GetWorld() : nullptr;
	if (!W) return false;
	// save.reset() : tout repart de zéro sauf les réglages ; prénom et personnage de la création.
	const strides::SaveGame Fresh = strides::SaveGame::fresh();
	PlayerName = Name.IsEmpty() ? TEXT("Alex") : Name;
	Avatar = InAvatar.IsEmpty() ? TEXT("f") : InAvatar;
	Best.clear();
	ChallengeRecords.clear();
	Horses = Fresh.horses;
	ActiveHorse = Fresh.activeHorse;
	GameTime = Fresh.gameTime;
	Horseshoes.Reset();
	if (UStridesProgressionSubsystem* Progress = GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>())
	{
		Progress->Restore(0, 0, FString(), {});
		Progress->LastMessage.Empty();
	}
	for (TActorIterator<AStridesCollectibles> It(W); It; ++It) It->Refresh();
	// Partie neuve écrite tout de suite (saveNow) : rien de l'ancienne sauvegarde n'est gardé (ni records, ni import).
	strides::SaveGame Core = Fresh;
	Core.playerName = TCHAR_TO_UTF8(*PlayerName);
	Core.avatar = TCHAR_TO_UTF8(*Avatar);
	Core.settings = Settings;
	UStridesSaveGame* S = Cast<UStridesSaveGame>(UGameplayStatics::CreateSaveGameObject(UStridesSaveGame::StaticClass()));
	S->Json = UTF8_TO_TCHAR(Core.toJson().c_str());
	UGameplayStatics::SaveGameToSlot(S, SlotName, 0);
	const bool Ok = SaveNow(PC);  // position de départ, cheval, crédits nuls
	UE_LOG(LogTemp, Display, TEXT("Strides : nouvelle partie (%s, %s) %s"), *PlayerName, *Avatar, Ok ? TEXT("écrite") : TEXT("NON écrite"));
	LastMessage.Empty();
	return Ok;
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
	if (!UGameplayStatics::DoesSaveGameExist(SlotName, 0) || !ReadCore(SlotName, Core, Msg))
	{
		UE_LOG(LogTemp, Display, TEXT("Strides sauvegarde : emplacement %s absent ou illisible, partie neuve"), *SlotName);
		return false;
	}
	Settings = Core.settings;
	Best = Core.bestTimes;
	Horses = Core.horses;
	ActiveHorse = Core.activeHorse;
	GameTime = Core.gameTime;
	PlayerName = UTF8_TO_TCHAR(Core.playerName.c_str());
	Avatar = UTF8_TO_TCHAR(Core.avatar.c_str());
	ChallengeRecords = Core.challenges;
	if (const UStridesSaveGame* Saved = Cast<UStridesSaveGame>(UGameplayStatics::LoadGameFromSlot(SlotName, 0))) Horseshoes = Saved->Horseshoes;
	// Journal du joueur (J1-E, J1-G) : meilleurs temps relus au lancement, comme le téléphone du web les affiche.
	FString Times;
	for (const auto& [Id, T] : Best) Times += FString::Printf(TEXT(" %hs = %.3f s ;"), Id.c_str(), T);
	UE_LOG(LogTemp, Display, TEXT("Strides sauvegarde : emplacement %s lu, %d meilleur(s) temps%s"), *SlotName, (int32)Best.size(), *Times);
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

strides::RecordOutcome UStridesSaveSubsystem::RecordChallenge(const strides::ChallengeResult& Res)
{
	const strides::RecordOutcome O = strides::recordChallengeResult(ChallengeRecords, Res);
	strides::SaveGame Core;
	FString Msg;
	UStridesSaveGame* Old = UGameplayStatics::DoesSaveGameExist(SlotName, 0) ? Cast<UStridesSaveGame>(UGameplayStatics::LoadGameFromSlot(SlotName, 0)) : nullptr;
	if (Old) ReadCore(SlotName, Core, Msg);
	Core.challenges = ChallengeRecords;
	for (const auto& [Id, R] : ChallengeRecords) if (R.hasBest) Core.records[Id] = {R.best.isEliminated(), R.best.penalties, R.best.time};
	UStridesSaveGame* S = Old ? Old : Cast<UStridesSaveGame>(UGameplayStatics::CreateSaveGameObject(UStridesSaveGame::StaticClass()));
	S->Json = UTF8_TO_TCHAR(Core.toJson().c_str());
	UGameplayStatics::SaveGameToSlot(S, SlotName, 0);
	UE_LOG(LogTemp, Display, TEXT("Strides défi : %hs %hs (%s, %d tentative(s))"), Res.challenge.c_str(), strides::challengeResultLine(Res).c_str(),
		O.isRecord ? TEXT("record") : O.duplicate ? TEXT("doublon") : TEXT("pas de record"), ChallengeRecords[Res.challenge].attempts);
	return O;
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
