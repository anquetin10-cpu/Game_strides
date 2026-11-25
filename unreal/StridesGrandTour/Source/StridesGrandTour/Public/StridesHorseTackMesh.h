// Sellerie complète affichée sur le cheval Unreal (étape S1) : ce que le web dessine (src/entities/pjl/view.js
// buildTackMeshes, setTackVisible ; src/entities/pjlHorse.js ironGeometry, Strap, _straps ; src/entities/horse.js
// _stirrupsFollow).
//  - Pièces skinnées (tapis, liseré, selle, sangle, filet, mors, guêtres, bonnet) : assets SK_Tack_<pièce> importés du GLB
//    de la sellerie du web (scripts/unreal/tack-horse-glb.py, import-horse-tack.py), même squelette que le cheval, posés
//    en suiveurs du maillage du cheval (SetLeaderPoseComponent) : chaque sommet suit les mêmes os, avec les mêmes poids,
//    que dans le web. Visibilité : celle de setTackVisible dans le scénario E1 d'O1 (bonnet masqué : le cheval engagé
//    n'en porte pas), lue dans Content/Data/pjl_horse_tack_mesh.json.
//  - Étriers (géométrie du web), étrivières et rênes (rubans recalculés à chaque image) : logique pure dans
//    StridesCore/HorseStraps (prouvée par le ctest « monte-sellerie »), dessin en UProceduralMeshComponent.
//    Étrier : sous l'orteil de la cavalière de la MÊME image (pose de la règle), abaissé de 0,015 · scale, sinon à l'ancre
//    d'étrier ; rênes : du mors au creux des poings de la pose PRÉCÉDENTE, dans le siège de l'image (instants du web,
//    prouvés contre O1 par le ctest) ; sans cavalière posée par la règle : étriers pendants, rênes sur l'encolure.
//
// Repères : le cœur calcule dans le monde du web (y vers le haut, m) ; conversion Unreal → web : x = −Y/100, y = Z/100,
// z = X/100 (la symétrie du repère du cheval, UStridesHorseTack::HolderToActor), appliquée aux positions monde.
//
// Créé par AStridesHorse selon StridesMonteOptions : par défaut depuis l'étape S2 b (avant : -StridesRider=regles ou
// -StridesTack=web) ; -StridesTack=aucune ou -StridesMonte=ancien l'empêche. Preuve : Strides.Parite.HorseTackMesh (StridesHorseTackMeshTests.cpp).
#pragma once
#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "StridesCore/HorseStraps.h"
#include "StridesCore/HorseTack.h"
#include "StridesHorseTackMesh.generated.h"

class AStridesHorse;
class UProceduralMeshComponent;
class UMaterialInterface;

// Pièce de sellerie skinnée, suiveuse du maillage du cheval. Bornes calculées sur les os du meneur qui la portent (position
// posée), élargies de 40 cm : les bornes par défaut d'un suiveur viennent de la pose de référence de la pièce, où le cheval
// du GLB est couché (racine tournée de 90°), et le rendu écartait selle, tapis, sangle, filet et mors (constaté le 25/11/2026).
UCLASS(ClassGroup = (Strides))
class STRIDESGRANDTOUR_API UStridesTackPieceComponent : public USkeletalMeshComponent
{
	GENERATED_BODY()
public:
	virtual FBoxSphereBounds CalcBounds(const FTransform& LocalToWorld) const override;
	// Os du meneur qui portent la pièce (os actifs du rendu, LOD 0, retrouvés par nom) ; marge (unités du maillage).
	TArray<int32> LeaderBones;
	double Margin = 4000;
};

UCLASS(ClassGroup = (Strides))
class STRIDESGRANDTOUR_API UStridesHorseTackMesh : public UActorComponent
{
	GENERATED_BODY()
public:
	UStridesHorseTackMesh();
	// Lit les données, crée les pièces (suiveurs du maillage du cheval), les étriers et les lanières. Faux (raison dans
	// Err) si une donnée ou un asset manque.
	bool Init(AStridesHorse* InHorse, FString* Err = nullptr);
	bool IsReady() const { return bReady; }

	// Points de la cavalière dans le repère local Unreal du siège (cm) : orteils (os de l'orteil de la pose courante) et
	// creux des poings (gripPoint du web, pose courante) ; Scale : échelle du cavalier (hu.scale).
	struct FRiderPoints
	{
		FVector Toe[2] = {FVector::ZeroVector, FVector::ZeroVector};
		FVector Grip[2] = {FVector::ZeroVector, FVector::ZeroVector};
		double Scale = 1;
	};
	// Une image : siège S (UStridesHorseTack::SeatWorld) et ancres (UStridesHorseTack::Out, dans S), cavalière posée par la
	// règle (nul : pas de cavalier), caméra (nul : proche). Les poings utilisés sont ceux de l'appel précédent (web).
	void StepStraps(const FTransform& SeatWorld, const strides::tack::TackOut& O, const FRiderPoints* Rider, const FVector* CamWorld);
	// Remise à neuf (nouveau scénario, nouvelle monte) : pas de poings mémorisés.
	void ResetStraps() { bHasPrevGrip = false; }
	// Points de la cavalière posée par la règle (UStridesRiderRig), dans le repère du siège (cm). Faux sans règle.
	static bool RiderPointsFromRig(const class UStridesRiderRig* Rig, const FTransform& MeshToSeat, FRiderPoints& Out);

	const strides::straps::StrapsModel& Model() const { return Model_; }
	const strides::straps::StrapsIn& LastIn() const { return In_; }
	const strides::straps::StrapsOut& Out() const { return Out_; }
	// Étrier dans le monde Unreal (cm).
	FVector IronWorld(int32 Side) const { return FromWeb(Out_.iron[Side]); }
	int32 NumPieces() const { return Pieces.Num(); }
	USkeletalMeshComponent* Piece(int32 I) const { return Pieces.IsValidIndex(I) ? Pieces[I].Get() : nullptr; }
	const FString& PieceName(int32 I) const { return PieceNames[I]; }
	bool PieceWebVisible(int32 I) const { return PieceVisible[I]; }
	UProceduralMeshComponent* StrapsMesh() const { return Straps; }
	UProceduralMeshComponent* IronMesh(int32 Side) const { return Irons[Side]; }
	// Coût de la dernière image (ms) : logique des lanières et mise à jour des rubans (FPlatformTime).
	double LastCostMs() const { return CostMs; }

	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	static FVector3d ToWeb(const FVector& U) { return FVector3d(-U.Y / 100.0, U.Z / 100.0, U.X / 100.0); }
	static strides::tack::V3 ToWebV(const FVector& U) { return strides::tack::V3{-U.Y / 100.0, U.Z / 100.0, U.X / 100.0}; }
	static FVector FromWeb(const strides::tack::V3& P) { return FVector(100.0 * P.z, -100.0 * P.x, 100.0 * P.y); }

private:
	UPROPERTY(Transient) TObjectPtr<AStridesHorse> Horse;
	UPROPERTY(Transient) TArray<TObjectPtr<USkeletalMeshComponent>> Pieces;
	UPROPERTY(Transient) TObjectPtr<UProceduralMeshComponent> Straps;
	UPROPERTY(Transient) TObjectPtr<UProceduralMeshComponent> Irons[2];
	TArray<FString> PieceNames;
	TArray<bool> PieceVisible;
	bool bReady = false;
	bool bSectionsMade = false;
	bool bHasPrevGrip = false;
	FVector PrevGrip[2];
	strides::straps::StrapsModel Model_;
	strides::straps::StrapsIn In_;
	strides::straps::StrapsOut Out_;
	double CostMs = 0;
	void UpdateRibbons();
	void RefreshPieceBounds();
};
