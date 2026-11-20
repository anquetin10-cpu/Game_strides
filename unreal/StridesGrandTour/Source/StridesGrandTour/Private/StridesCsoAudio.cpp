// Sons de l'épreuve du Pôle (tranche T12) : voir StridesCsoAudio.h.
#include "StridesCsoAudio.h"
#include "Components/AudioComponent.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Sound/SoundWave.h"
#include "StridesSaveSubsystem.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesPlayerController.h"
#include "StridesUnits.h"

void UStridesCsoAudio::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	FString Text;
	std::string Err;
	const FString Path = FPaths::ProjectContentDir() / TEXT("Data/cso_sounds.json");
	bBank = FFileHelper::LoadFileToString(Text, *Path) && strides::csoSoundBankFromFile(std::string(TCHAR_TO_UTF8(*Text)), SoundBank, Err);
	if (!bBank) UE_LOG(LogTemp, Warning, TEXT("Strides sons : manifeste %s illisible (%hs) : aucun son"), *Path, Err.c_str());
	// Constantes du bus du public : celles du manifeste (lues dans le source du jeu web par l'exporteur).
	Crowd = strides::CsoCrowd(bBank ? SoundBank.crowd : strides::csoCrowdDefaults());
}

void UStridesCsoAudio::Deinitialize()
{
	if (CrowdLoop) CrowdLoop->Stop();
	CrowdLoop = nullptr;
	Super::Deinitialize();
}

TStatId UStridesCsoAudio::GetStatId() const { RETURN_QUICK_DECLARE_CYCLE_STAT(UStridesCsoAudio, STATGROUP_Tickables); }

ETickableTickType UStridesCsoAudio::GetTickableTickType() const
{
	return IsTemplate() ? ETickableTickType::Never : ETickableTickType::Always;
}

bool UStridesCsoAudio::SoundEnabled() const
{
	// audio.setEnabled(settings.sound) : bus maître à 0 quand le son est coupé (réglage absent : son actif, comme le web).
	const UWorld* W = GetWorld();
	const UGameInstance* GI = W ? W->GetGameInstance() : nullptr;
	const UStridesSaveSubsystem* Save = GI ? GI->GetSubsystem<UStridesSaveSubsystem>() : nullptr;
	if (!Save) return true;
	const auto It = Save->GetSettings().find("sound");
	return It == Save->GetSettings().end() || It->second != "false";
}

USoundWave* UStridesCsoAudio::Wave(const FString& Key)
{
	if (const TObjectPtr<USoundWave>* W = Waves.Find(Key)) return *W;
	const strides::CsoSoundEntry* E = bBank ? SoundBank.find(std::string(TCHAR_TO_UTF8(*Key))) : nullptr;
	USoundWave* W = E ? LoadObject<USoundWave>(nullptr, UTF8_TO_TCHAR(E->asset.c_str())) : nullptr;
	if (E && !W) UE_LOG(LogTemp, Warning, TEXT("Strides sons : actif %hs introuvable"), E->asset.c_str());
	Waves.Add(Key, W);
	return W;
}

FString UStridesCsoAudio::CallString(const strides::CsoCall& C, const char* Src)
{
	// Même écriture que testCsoSounds (unreal/core/tests/test_core.cpp) : nombres en %.17g, chaînes entre guillemets.
	std::string R = C.fn + "(";
	for (size_t I = 0; I < C.args.size(); I++)
	{
		if (I) R += ", ";
		if (C.args[I].isNum)
		{
			char B[40];
			std::snprintf(B, sizeof B, "%.17g", C.args[I].n);
			R += B;
		}
		else R += "\"" + C.args[I].s + "\"";
	}
	R += ")@";
	R += Src;
	return UTF8_TO_TCHAR(R.c_str());
}

void UStridesCsoAudio::Call(const strides::CsoCall& C, const char* Src)
{
	FStridesSoundCall L;
	L.Frame = (int64)GFrameCounter;
	L.Time = AudioTime;
	L.Call = CallString(C, Src);
	// applause() se termine par cheer() : automation du bus du public (strides::CsoCrowd), pas de WAV pour cheer.
	Crowd.onCall(C, AudioTime);
	if (C.fn != "cheer")
	{
		L.Key = UTF8_TO_TCHAR(strides::csoSoundKey(C).c_str());
		if (USoundWave* W = Wave(L.Key))
		{
			L.bPlayed = true;
			UWorld* World = GetWorld();
			if (World && World->IsGameWorld() && SoundEnabled()) UGameplayStatics::PlaySound2D(World, W);
		}
		else UE_LOG(LogTemp, Warning, TEXT("Strides sons : %s sans WAV (clé %s)"), *L.Call, *L.Key);
	}
	UE_LOG(LogTemp, Verbose, TEXT("Strides sons : %s"), *L.Call);
	Log.Add(MoveTemp(L));
}

void UStridesCsoAudio::HorseEvent(strides::CsoHorseEvent E, bool bPlayerHorse, bool bCsoControls, const std::string& Surface)
{
	std::vector<strides::CsoCall> Calls;
	strides::csoHorseSounds(E, bPlayerHorse, bCsoControls, Surface, Calls);
	for (const strides::CsoCall& C : Calls) Call(C, "game.js");
}

void UStridesCsoAudio::FenceSound(strides::CsoFenceSound S) { Call(strides::csoFenceSoundCall(S), "gameplay/obstacles.js"); }

void UStridesCsoAudio::RunCalls(const std::vector<strides::CsoCall>& Calls)
{
	for (const strides::CsoCall& C : Calls) Call(C, strides::csoRunSoundSrc(C));
}

void UStridesCsoAudio::Click() { Call(strides::csoClickCall(), "gameplay/interact.js"); }

void UStridesCsoAudio::Ambience(double CrowdLevel) { Crowd.ambience(CrowdLevel, AudioTime); }

void UStridesCsoAudio::StepClock(double Dt)
{
	if (Dt > 0) AudioTime += Dt;
	AppliedCrowd = SoundEnabled() ? (float)Crowd.gainAt(AudioTime) : 0.f;
}

void UStridesCsoAudio::EnsureCrowdLoop()
{
	if (CrowdLoop || !bBank) return;
	UWorld* World = GetWorld();
	if (!World || !World->IsGameWorld() || !GEngine || !GEngine->UseSound()) return;
	if (USoundWave* W = Wave(UTF8_TO_TCHAR(SoundBank.crowdLoop.c_str())))
	{
		CrowdLoop = UGameplayStatics::CreateSound2D(World, W, 1.f, 1.f, 0.f, nullptr, false, false);
		if (CrowdLoop)
		{
			CrowdLoop->SetVolumeMultiplier(0.f);
			CrowdLoop->Play();
		}
	}
}

double UStridesCsoAudio::CrowdLevelAt(const UWorld* World, bool& bOut)
{
	// game.js:1549-1556 : point suivi (player.focus : le cheval monté, sinon le cavalier à pied), épreuve CSO en cours.
	bOut = false;
	const AStridesPlayerController* PC = World ? Cast<AStridesPlayerController>(World->GetFirstPlayerController()) : nullptr;
	// Monde sans joueur local (tests) : contrôleur du jeu présent dans le monde.
	if (!PC && World)
		if (TActorIterator<AStridesPlayerController> It(const_cast<UWorld*>(World)); It) PC = *It;
	const APawn* P = PC ? PC->GetPawn() : nullptr;
	const UGameInstance* GI = World ? World->GetGameInstance() : nullptr;
	const UStridesDataSubsystem* Data = GI ? GI->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	if (!P || !Data || PC->SkipsUpdate()) return 0;
	double X, Y, Z;
	StridesUnits::UEToWeb(P->GetActorLocation(), X, Y, Z);
	const AStridesCourse* C = PC->EntryCourse();
	const bool bCourse = C && C->Run() && C->Run()->course().active;
	bOut = true;
	return strides::csoCrowdLevel(X, Z, Data->PoleArena.X, Data->PoleArena.Y, bCourse, Crowd.params());
}

void UStridesCsoAudio::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);
	UWorld* World = GetWorld();
	// Fin de l'image de jeu (game.update appelle ambience après les missions) : niveau du public à l'heure audio de
	// l'image, puis l'horloge avance du temps réel de l'image, en pause comprise (AudioContext.currentTime ne s'arrête
	// pas ; ambience n'est pas appelée en pause).
	bool bUpdate = false;
	const double Level = CrowdLevelAt(World, bUpdate);
	if (bUpdate) Ambience(Level);
	// (monde qui ne tourne pas, tests : pas de l'image passé en argument)
	StepClock(World && World->DeltaRealTimeSeconds > 0 ? (double)World->DeltaRealTimeSeconds : (double)DeltaTime);
	EnsureCrowdLoop();
	if (CrowdLoop) CrowdLoop->SetVolumeMultiplier(AppliedCrowd);
}
