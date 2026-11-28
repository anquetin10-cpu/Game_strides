// Géométrie du parcours CSO du Pôle exportée du jeu web (tranche T5) : manifeste Content/World/Cso/cso_fences.json
// (scripts/unreal/export-cso-runs.mjs --fences : pièces des obstacles, des lignes de départ et d'arrivée et du poteau
// « Chrono », positions locales et monde, hauteurs hors épreuve et en épreuve, couleurs de surlignage) et ressources
// importées par scripts/unreal/import-cso-fences.py (Content/World/Cso/cso_assets.json : maillages, matériaux des
// panneaux). Aucune valeur de géométrie n'est écrite dans le code : tout vient du manifeste.
#pragma once
#include "CoreMinimal.h"

class UStaticMesh;
class UMaterialInterface;

// Pièce : un maillage exporté posé dans le repère local web de son groupe (obstacle, ligne, poteau).
struct STRIDESGRANDTOUR_API FStridesCsoPiece
{
	FString Cat;      // chandelier, aile, barre, barre_basse, jardiniere, fanion, panneau, cellule, …
	FString Mesh;     // identifiant du maillage (cso_fences.json « meshes »)
	FVector P = FVector::ZeroVector;  // pivot, repère local web du groupe (m : x le long des barres, y haut, z axe de saut)
	double Yaw = 0;   // rotation locale autour de y (rad, sens du jeu web)
	FVector W = FVector::ZeroVector;  // pivot, repère monde web (m), relevé dans le jeu web
	FVector WC = FVector::ZeroVector; // barycentre des sommets du maillage, repère monde web (m) : fixe l'orientation
	int32 Rail = -1;  // barre du haut : rang dans ob.rails ; -1 sinon
	FString Tex, TexEn;  // panneau : texture (français, anglais si elle diffère)
};

// État d'un obstacle à une hauteur donnée : ses pièces.
struct STRIDESGRANDTOUR_API FStridesCsoLook
{
	FString State;  // « hors-epreuve », « epreuve »
	double H = 0;
	TArray<FStridesCsoPiece> Pieces;
	TMap<FString, int32> Counts;
};

struct STRIDESGRANDTOUR_API FStridesCsoFenceData
{
	int32 Num = 0;
	FString Label, Kind;
	double Spread = 0, X = 0, Z = 0, Rot = 0, Ground = 0, W = 0;
	TArray<FStridesCsoLook> Looks;
	// Pièces à la hauteur H (m), nul si aucun état exporté ne pose l'obstacle à cette hauteur.
	const FStridesCsoLook* LookAt(double H) const;
};

// Ligne de départ / d'arrivée ou poteau : groupe posé en (X, Ground, Z), tourné de Rot autour de y.
struct STRIDESGRANDTOUR_API FStridesCsoGroup
{
	FString Id;
	double X = 0, Z = 0, Rot = 0, Ground = 0, W = 0;
	TArray<FStridesCsoPiece> Pieces;
	TMap<FString, int32> Counts;
};

struct STRIDESGRANDTOUR_API FStridesCsoState
{
	FString Id;
	double Base = 0;  // hauteur de base de csoHeights (1,15 hors épreuve, 1,10 en épreuve)
	TArray<double> Heights;
};

class STRIDESGRANDTOUR_API FStridesCsoScenery
{
public:
	// Lit le manifeste et la table des ressources ; faux et message si l'un manque ou est illisible.
	bool Load(const FString& ManifestFile, const FString& AssetsFile, FString& Err);
	bool IsLoaded() const { return bLoaded; }
	const FStridesCsoState* State(const FString& Id) const;
	const FStridesCsoFenceData* Fence(int32 Num) const;
	UStaticMesh* LoadMesh(const FString& Id) const;
	// Matériau du panneau (texture Tex, ou TexEn en anglais quand elle existe).
	UMaterialInterface* SignMaterial(const FStridesCsoPiece& P, const FString& Lang) const;
	// Transformée d'une pièce relative à un acteur posé au pivot de son groupe et tourné du lacet
	// StridesUnits::HeadingToYawDeg(rot) : maillage exporté (x, y, z web → X, Z, Y Unreal, import Interchange) tourné de
	// −90° − yaw autour de Z, pivot en (z, −x, y) × 100 cm.
	static FTransform PieceRelative(const FStridesCsoPiece& P);
	// Position monde (m, repère web) du pivot d'une pièce d'un groupe posé en (X, Y, Z) et tourné de Rot autour de y.
	static FVector PieceWorldWeb(double X, double Y, double Z, double Rot, const FStridesCsoPiece& P);

	TArray<FStridesCsoState> States;
	TArray<FStridesCsoFenceData> Fences;
	// Jalon J2c (lot J2-D) : obstacles du paddock d'échauffement du Pôle (obstacles.js:199-201, course « warmup »), dans
	// l'ordre du jeu web (vertical, puis oxer) ; une pose « paddock » à leur hauteur fixe.
	TArray<FStridesCsoFenceData> Warmup;
	TArray<FStridesCsoGroup> Lines;  // « start », « finish »
	FStridesCsoGroup Marker;          // poteau « Chrono » de l'activité cso_train
	FLinearColor HighlightOn = FLinearColor::White, HighlightOff = FLinearColor::White;
	TMap<FString, FString> MeshPaths, SignMaterials;
	TMap<FString, FVector> MeshCentroids;  // barycentre des sommets de chaque maillage (m, repère web du maillage)
	int32 MeshCount = 0;

private:
	bool bLoaded = false;
};
