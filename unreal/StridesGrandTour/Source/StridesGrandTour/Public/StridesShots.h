// Revue visuelle automatique (ligne de commande -StridesShots) : le jeu se place sur des points de vue fixes du monde
// (repère web), capture chacun dans Saved/Screenshots/Strides/<nom>.png, puis la vue de jeu, et quitte.
// Sert à comparer les décors d'une version à l'autre, toujours sous les mêmes angles. Ensuite, la cavalière monte et
// le cheval enchaîne le parcours de démonstration du Pôle sur le relief : une capture toutes les 4 s (10_galop_NN).
//
// -StridesShots=cso : captures jumelles du banc de parité CSO. Lit unreal/docs/parite/cso/poses.json (écrit par
// scripts/unreal/export-cso-runs.mjs --shots, ou -StridesPoses=<fichier>) ; pour chaque pose : cheval posé, cavalière
// en selle, caméra à l'œil / cible du web, FOV vertical du web converti en FOV horizontal Unreal pour le viewport de la
// pose, soleil orienté comme le soleil web à la même heure, HUD masqué ; capture haute résolution exactement à la taille
// du viewport web dans unreal/docs/parite/cso/<pose>-unreal.png, puis quitte. Outil de développement (hors jeu iOS).
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesShots.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API AStridesShots : public AActor
{
	GENERATED_BODY()
public:
	AStridesShots();
	virtual void Tick(float DeltaSeconds) override;
	static bool Requested();
	// Mode demandé : "" (revue des décors et démonstration) ou "cso" (poses jumelles du banc de parité).
	static FString Mode();
	// FOV horizontal (degrés) d'une caméra Unreal (axe X maintenu) qui montre le même champ vertical qu'une caméra
	// Three.js de FOV vertical FovV (degrés) dans un viewport Width × Height.
	static double HorizontalFov(double FovV, double Width, double Height);

private:
	struct FShot { FString Name; FVector Eye; FVector Target; };
	TArray<FShot> Shots;
	int32 Index = -1;
	float Wait = 0.f;
	bool bCaptured = false;
	int32 RideShot = -1;
	float RideTime = 0.f;
	UPROPERTY() TObjectPtr<class ACameraActor> Camera;

	// Banc de parité CSO (mode "cso").
	struct FPose
	{
		FString Name;
		double HorseX = 0, HorseZ = 0, HorseH = 0;
		FVector Eye = FVector::ZeroVector, Target = FVector::ZeroVector;  // repère web (m, altitude absolue)
		FVector SunDir = FVector::UpVector;  // repère web, vers le soleil
		double FovV = 58;
		int32 Width = 844, Height = 390;
		FString Out;  // chemin absolu de la capture Unreal
		// Poses de chute de barre (tranche T3) : cheval en l'air (jumpY, m), barre renversée par le cœur (csoKnock) puis
		// Frames images de csoFencesUpdate (pas 1/30 s), affichée par AStridesFence::ApplyRails comme en jeu.
		bool bHasJumpY = false;
		double HorseJumpY = 0;
		bool bHasFence = false;
		FString FenceLabel;
		int32 FenceBar = 0, FenceFrames = 0;
		double FenceDir = 1, FenceSide = 0, FenceHit = 0.15;
	};
	void LoadPoses();
	void TickCso(float DeltaSeconds, class APlayerController* PC);
	void ApplyPose(const FPose& P, class APlayerController* PC);
	TArray<FPose> Poses;
	int32 PoseIndex = -1;
	int32 PoseStep = 0;
	bool bPoseMounted = false;
};
