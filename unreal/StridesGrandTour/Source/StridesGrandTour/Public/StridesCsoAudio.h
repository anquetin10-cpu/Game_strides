// Sons de l'épreuve du Pôle (tranche T12, unreal/docs/parite/cso-ecarts.md §4) : journal et lecture des appels audio.*
// du jeu web. Chaque appel de premier niveau (comme le relève le canal « audio » de cso_runs/) est écrit au journal (nom,
// arguments, fichier du jeu web qui l'aurait fait, image) puis joué : WAV rendu hors ligne par la classe Audio du web
// (scripts/unreal/export-cso-sounds.mjs, importé sous /Game/Audio/Cso par import-cso-sounds.py ; manifeste
// Content/Data/cso_sounds.json). Bus du public : boucle de bruit filtré dont le volume suit strides::CsoCrowd (ambience à
// chaque image de jeu, cheer et applause) sur l'horloge audio (temps réel, qui court aussi en pause, comme
// AudioContext.currentTime).
// Sources des appels : AStridesHorse::TickCso (écouteurs de game.js sur les événements du cheval, sons des obstacles),
// AStridesCourse::FlushRunCalls (déroulé d'épreuve), AStridesPlayerController (click d'une action, ambience).
// Non porté (déclaré à l'inventaire) : synthèse, compresseur du bus maître, souffle et pas des sabots (foulées de
// l'animation), vent, mer, moteur, musique, pluie, oiseaux.
#pragma once
#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Tickable.h"
#include "StridesCore/CsoAudio.h"
#include "StridesCsoAudio.generated.h"

class UAudioComponent;
class USoundWave;

USTRUCT()
struct FStridesSoundCall
{
	GENERATED_BODY()
	int64 Frame = 0;     // GFrameCounter à l'appel
	double Time = 0;     // horloge audio (s)
	FString Call;        // « fn(arguments)@fichier », même écriture que testCsoSounds (nombres en %.17g)
	FString Key;         // clé du WAV (strides::csoSoundKey) ; vide pour cheer (automation du bus du public)
	bool bPlayed = false;  // WAV trouvé et lecture demandée au moteur audio
};

UCLASS()
class STRIDESGRANDTOUR_API UStridesCsoAudio : public UTickableWorldSubsystem
{
	GENERATED_BODY()
public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;
	virtual bool IsTickableWhenPaused() const override { return true; }
	virtual ETickableTickType GetTickableTickType() const override;

	// Un appel de premier niveau (src : fichier du jeu web, ex. « gameplay/courses.js »).
	void Call(const strides::CsoCall& C, const char* Src);
	// Écouteurs de game.js:716-728 sur un événement du cheval.
	void HorseEvent(strides::CsoHorseEvent E, bool bPlayerHorse, bool bCsoControls, const std::string& Surface);
	void FenceSound(strides::CsoFenceSound S);
	void RunCalls(const std::vector<strides::CsoCall>& Calls);
	void Click();
	// game.js:1549-1556 : une image de jeu (update), niveau du public calculé par l'appelant (csoCrowdLevel).
	void Ambience(double Crowd);

	const TArray<FStridesSoundCall>& Journal() const { return Log; }
	void ResetJournal() { Log.Reset(); }
	double Clock() const { return AudioTime; }
	double CrowdGain() { return Crowd.gainAt(AudioTime); }
	// Volume appliqué à la boucle du bus du public à la dernière image (gain du bus, 0 si muet).
	float CrowdVolumeApplied() const { return AppliedCrowd; }
	const strides::CsoSoundBank& Bank() const { return SoundBank; }
	bool BankLoaded() const { return bBank; }
	// Réglage « son » de la sauvegarde (audio.setEnabled : bus maître à 0).
	bool SoundEnabled() const;
	USoundWave* Wave(const FString& Key);
	void AdvanceClockForTest(double Dt) { StepClock(Dt); }
	// Niveau du public de l'image (csoCrowdLevel : point suivi du joueur, épreuve en cours) ; bUpdate faux en pause ou sans
	// joueur (ambience non appelée).
	double CrowdLevelAt(const UWorld* World, bool& bUpdate);
	static FString CallString(const strides::CsoCall& C, const char* Src);

private:
	void StepClock(double Dt);
	void EnsureCrowdLoop();
	strides::CsoSoundBank SoundBank;
	bool bBank = false;
	strides::CsoCrowd Crowd;
	double AudioTime = 0;
	float AppliedCrowd = 0;
	TArray<FStridesSoundCall> Log;
	UPROPERTY() TMap<FString, TObjectPtr<USoundWave>> Waves;
	UPROPERTY() TObjectPtr<UAudioComponent> CrowdLoop;
};
