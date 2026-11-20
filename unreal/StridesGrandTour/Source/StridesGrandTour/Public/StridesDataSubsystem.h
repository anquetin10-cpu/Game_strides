// Données du jeu lues au démarrage dans Content/Data (JSON versionnés, exportés du jeu web par
// scripts/unreal/export-data.mjs) : allures, profils des chevaux, modèle de saut, conduite CSO, parcours.
// Les règles restent dans StridesCore ; ce sous-système ne fait que remplir ses paramètres (unités SI).
#pragma once
#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "StridesCore/CoursePlan.h"
#include "StridesCore/CsoCamera.h"
#include "StridesCore/CsoEntry.h"
#include "StridesCore/CsoCourse.h"
#include "StridesCore/CsoFences.h"
#include "StridesCore/CsoHorse.h"
#include "StridesCore/CsoRide.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/Text.h"
#include "StridesCore/JumpModel.h"
#include "StridesCore/Ranking.h"
#include "StridesCsoScenery.h"
#include "StridesDataSubsystem.generated.h"

USTRUCT(BlueprintType)
struct FStridesGait
{
	GENERATED_BODY()
	UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Id;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) FText Name;
	// Vitesse de l'allure (m/s) ; MaxSpeed > 0 : vitesse maximale réglable (galop de concours).
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float Speed = 0.f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float MaxSpeed = 0.f;
};

USTRUCT(BlueprintType)
struct FStridesHorseProfile
{
	GENERATED_BODY()
	UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Id;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Name;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Breed;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) FString Coat;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) int32 Age = 0;
	// Multiplicateurs du jeu web (data.js) : vitesse, saut, endurance.
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float SpeedMul = 1.f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) double JumpMul = 1.0;  // double : puissance du saut au bit près du jeu web
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float StaminaMul = 1.f;
};

USTRUCT(BlueprintType)
struct FStridesWorldRegion
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Id;
	UPROPERTY(BlueprintReadOnly) FString Name;
	UPROPERTY(BlueprintReadOnly) FString Kind;
	UPROPERTY(BlueprintReadOnly) FVector2D Center = FVector2D::ZeroVector;
	UPROPERTY(BlueprintReadOnly) FVector2D Size = FVector2D::ZeroVector;
};

USTRUCT(BlueprintType)
struct FStridesPoi
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Id;
	UPROPERTY(BlueprintReadOnly) FString Name;
	UPROPERTY(BlueprintReadOnly) FString Icon;
	UPROPERTY(BlueprintReadOnly) FVector2D Position = FVector2D::ZeroVector;
};

USTRUCT(BlueprintType)
struct FStridesRoad
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Id;
	UPROPERTY(BlueprintReadOnly) float Width = 6.f;
	UPROPERTY(BlueprintReadOnly) TArray<FVector2D> Points;
};

USTRUCT(BlueprintType)
struct FStridesMissionDefinition
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Id;
	UPROPERTY(BlueprintReadOnly) FString Title;
	UPROPERTY(BlueprintReadOnly) FString Category;
	UPROPERTY(BlueprintReadOnly) FString Place;
	UPROPERTY(BlueprintReadOnly) int32 Pay = 0;
	UPROPERTY(BlueprintReadOnly) int32 Xp = 0;
	UPROPERTY(BlueprintReadOnly) TArray<FString> Requires;
};

USTRUCT(BlueprintType)
struct FStridesProgressionLevel
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Id;
	UPROPERTY(BlueprintReadOnly) FString Name;
	UPROPERTY(BlueprintReadOnly) int32 Reputation = 0;
};

UCLASS()
class STRIDESGRANDTOUR_API UStridesDataSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()
public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	UPROPERTY(BlueprintReadOnly, Category = "Strides") TArray<FStridesGait> Gaits;
	UPROPERTY(BlueprintReadOnly, Category = "Strides") TArray<FStridesHorseProfile> Horses;
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") float WorldSize = 1200.f;
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") FVector WorldSpawn = FVector(-104.f, 168.f, .35f);
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") TArray<FStridesWorldRegion> WorldRegions;
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") TArray<FStridesPoi> PointsOfInterest;
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") TArray<FStridesRoad> Roads;
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") TArray<FStridesMissionDefinition> Missions;
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") TArray<FStridesProgressionLevel> Progression;
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") TArray<FString> PhoneApps;
	// Hauteur de base du saut (m) : HORSE.jumpPeak du jeu web, multipliée par le profil du cheval.
	UPROPERTY(BlueprintReadOnly, Category = "Strides") double JumpPeak = 1.35;  // double : HORSE.jumpPeak du jeu web, sans arrondi float
	UPROPERTY(BlueprintReadOnly, Category = "Strides") float MinJumpSpeed = 3.2f;
	// Cheval de concours (cso_horse.json, extrait de obstacles.js par scripts/unreal/export-data.mjs) : largeur des
	// obstacles du parcours de CSO (m) ; REF / NOSE / OVERRUN et constantes du saut dans HorseParams().
	UPROPERTY(BlueprintReadOnly, Category = "Strides") double CsoFenceWidth = 3.8;
	// Fichiers lus, ou la raison d'un échec (affichée par le HUD : jamais de valeurs inventées en silence).
	UPROPERTY(BlueprintReadOnly, Category = "Strides") TArray<FString> LoadLog;

	// Décor exporté du jeu web (Content/Data/World, scripts/unreal/world-export.js) : relief sur une grille régulière
	// (m, repère web), tracé exact des routes, étang. Le relief est la référence de hauteur du cheval, des obstacles et
	// des repères ; hors du carré du monde, la hauteur du bord est prolongée.
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") int32 TerrainN = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") float TerrainStep = 2.f;
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") FVector2D TerrainOrigin = FVector2D(-600.f, -600.f);
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") TArray<FStridesRoad> SceneRoads;
	// Étang : centre (x, z), rayon et niveau de l'eau (m) ; niveau moyen de la mer : 0 m.
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") FVector Pond = FVector(-515.f, 420.f, 15.f);
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") float PondLevel = 0.f;
	// Centre de la carrière du Pôle (repère du tracé du parcours, cso_course_pole.json : arena).
	UPROPERTY(BlueprintReadOnly, Category = "Strides|World") FVector2D PoleArena = FVector2D(330.f, -224.f);
	// Lit le décor exporté (appelé par Initialize ; public pour les tests).
	void LoadScene();
	bool HasTerrain() const { return TerrainN > 1 && TerrainHeights.Num() == TerrainN * TerrainN; }
	// Hauteur du sol (m) en (x, z) web, interpolée dans la cellule de la grille.
	UFUNCTION(BlueprintCallable, Category = "Strides|World") double TerrainHeight(double X, double Z) const;

	const strides::JumpParams& Jump() const { return JumpP; }
	const strides::CsoRideParams& Ride() const { return RideP; }
	const strides::CsoHorseParams& HorseParams() const { return HorseP; }
	// Obstacles de concours (cso_horse.json : HIND_TRAIL de obstacles.js, tranche T3).
	const strides::CsoFenceParams& FenceParams() const { return FenceP; }
	// Caméra de concours (cso_camera.json : CAM_COMP de camera.js, tranche T6 ; fov = champ VERTICAL en degrés).
	const strides::CsoCamParams& CameraParams() const { return CamP; }
	const strides::CourseDesign& PoleCourse() const { return PoleDesign; }
	// Déroulé de l'épreuve du Pôle (tranche T4) : règles, lignes et entrée de piste de cso_course_pole.json (objet
	// « run »), libellés des obstacles dans l'ordre du tracé ; faux si absent ou illisible.
	bool PoleRunConfig(const std::vector<std::string>& Labels, strides::CsoRunConfig& Out) const;
	// Textes de l'épreuve (strings_cso.json : clés françaises du code, traductions anglaises) ; nul si absents.
	const strides::TextTable* CsoText() const { return bCsoText ? &CsoTextTable : nullptr; }
	// Styles du HUD d'épreuve (tranche T7) relevés dans le navigateur : Content/Data/hud_cso_style.json
	// (scripts/unreal/export-hud-style.mjs) ; nul si absent.
	const TSharedPtr<class FJsonObject>& CsoHudStyle() const { return CsoHudStyleJson; }
	// Commandes d'épreuve (tranche T8) relevées dans la page tactile du navigateur : Content/Data/cso_controls_style.json
	// (joystick, boutons SAUT et pause, carte Pause, libellés des bascules ; scripts/unreal/export-hud-style.mjs
	// --controls) ; nul si absent. Icônes rendues par le navigateur (Content/Data/ui/icon-<nom>.png) : nul si absente.
	const TSharedPtr<class FJsonObject>& CsoControlsStyle() const { return CsoControlsJson; }
	// Aides à l'appel (tranche T9) relevées dans la scène et le HUD du jeu web : Content/Data/cso_aids.json (LINE_MARK,
	// matériaux et géométries des aides du parcours ; scripts/unreal/export-cso-runs.mjs --aids) et
	// Content/Data/cso_jump_style.json (bouton SAUT dans chaque état ; scripts/unreal/export-hud-style.mjs --jump-states) ;
	// nuls si absents.
	const TSharedPtr<class FJsonObject>& CsoAids() const { return CsoAidsJson; }
	const TSharedPtr<class FJsonObject>& CsoJumpStyle() const { return CsoJumpJson; }
	class UTexture2D* UiIcon(const FString& Name) const { const TObjectPtr<UTexture2D>* T = UiIcons.Find(Name); return T ? T->Get() : nullptr; }
	// Entrée dans l'épreuve (tranche T10) : activité « Parcours du Pôle » et action de son poteau relevées dans le jeu web
	// (Content/Data/cso_activity.json, scripts/unreal/export-cso-entry.mjs ; nul si absente ou illisible) ; styles des
	// cartes de présentation et du plan et du dialogue de l'entraîneur (Content/Data/cso_screens_style.json, --screens ;
	// nul si absent) ; carrière et tribunes du plan et longueur du parcours (cso_course_pole.json : arena, stands, length).
	const strides::CsoActivity* CsoActivity() const { return bCsoActivity ? &CsoActivityDef : nullptr; }
	const TSharedPtr<class FJsonObject>& CsoScreensStyle() const { return CsoScreensJson; }
	// Tranche T11 : noms des engagés simulés (Content/Data/cso_ranking.json : FIRST_NAMES, LAST_NAMES, HORSE_NAMES ; nul si
	// absent ou illisible) ; styles de la carte de bilan (Content/Data/cso_result_style.json,
	// scripts/unreal/export-cso-result.mjs --screens ; nul si absent).
	const strides::RankNames* RankNames() const { return bRankNames ? &RankNamesDef : nullptr; }
	const TSharedPtr<class FJsonObject>& CsoResultStyle() const { return CsoResultJson; }
	const strides::CoursePlanArena& PlanArena() const { return PlanArenaDef; }
	double PoleLength() const { return PoleLengthM; }
	// Géométrie du parcours exportée du jeu web (tranche T5) : Content/World/Cso/cso_fences.json et cso_assets.json ;
	// IsLoaded() faux si absente (obstacles en formes de base, lignes et poteau invisibles).
	const FStridesCsoScenery& CsoScenery() const { return CsoSceneryData; }
	const FStridesHorseProfile* FindHorse(const FString& Id) const;
	float CourseSpeed(const FString& Level) const;

private:
	bool LoadJson(const FString& File, TSharedPtr<class FJsonObject>& Out);
	TArray<float> TerrainHeights;
	strides::JumpParams JumpP;
	strides::CsoRideParams RideP;
	strides::CsoHorseParams HorseP;
	strides::CsoFenceParams FenceP;
	strides::CsoCamParams CamP;
	strides::CourseDesign PoleDesign;
	TMap<FString, float> CourseSpeeds;
	std::string PoleCourseJson;
	strides::TextTable CsoTextTable;
	TSharedPtr<class FJsonObject> CsoHudStyleJson;
	TSharedPtr<class FJsonObject> CsoControlsJson;
	TSharedPtr<class FJsonObject> CsoAidsJson;
	TSharedPtr<class FJsonObject> CsoJumpJson;
	TSharedPtr<class FJsonObject> CsoScreensJson;
	strides::CsoActivity CsoActivityDef;
	bool bCsoActivity = false;
	strides::RankNames RankNamesDef;
	bool bRankNames = false;
	TSharedPtr<class FJsonObject> CsoResultJson;
	strides::CoursePlanArena PlanArenaDef;
	double PoleLengthM = 368;
	UPROPERTY() TMap<FString, TObjectPtr<class UTexture2D>> UiIcons;
	bool bCsoText = false;
	FStridesCsoScenery CsoSceneryData;
};
