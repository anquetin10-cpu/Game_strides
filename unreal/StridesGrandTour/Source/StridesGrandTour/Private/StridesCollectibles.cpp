#include "StridesCollectibles.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/Pawn.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "StridesDataSubsystem.h"
#include "StridesPlayerController.h"
#include "StridesProgressionSubsystem.h"
#include "StridesSaveSubsystem.h"
#include "StridesUnits.h"
#include "EngineUtils.h"

AStridesCollectibles::AStridesCollectibles()
{
	PrimaryActorTick.bCanEverTick = true;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Racine"));
}

bool AStridesCollectibles::Build()
{
	FString Text;
	std::string Err = "fichier introuvable";
	if (!FFileHelper::LoadFileToString(Text, *(FPaths::ProjectContentDir() / TEXT("Data/world_horseshoes.json"))) || !strides::loadHorseshoes(TCHAR_TO_UTF8(*Text), Def, Err))
	{
		UE_LOG(LogTemp, Warning, TEXT("Strides fers d'or : %s"), UTF8_TO_TCHAR(Err.c_str()));
		return false;
	}
	bBuilt = true;
	Refresh();
	return true;
}

void AStridesCollectibles::Refresh()
{
	for (UStaticMeshComponent* C : Items) if (C) C->DestroyComponent();
	Items.Reset();
	ItemIndex.Reset();
	const UStridesSaveSubsystem* Save = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>() : nullptr;
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	UMaterialInterface* Base = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	UMaterialInstanceDynamic* Gold = Base ? UMaterialInstanceDynamic::Create(Base, this) : nullptr;
	if (Gold) Gold->SetVectorParameterValue(TEXT("Color"), FLinearColor(.80f, .53f, .14f));  // #e7c06a (linéaire)
	for (int32 I = 0; I < (int32)Def.shoes.size(); ++I)
	{
		if (Save && Save->Horseshoes.Contains(I)) continue;
		const double X = Def.shoes[(size_t)I].first, Z = Def.shoes[(size_t)I].second;
		const double Y = (Data ? Data->TerrainHeight(X, Z) : 0.0) + Def.height;
		UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(this);
		C->SetStaticMesh(Mesh);
		if (Gold) C->SetMaterial(0, Gold);
		C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		C->SetCastShadow(true);
		C->SetupAttachment(RootComponent);
		C->RegisterComponent();
		C->SetWorldLocation(StridesUnits::WebToUE(X, Y, Z));
		// Disque debout de 0,84 m (diamètre du tore du web : 2 × 0,42), 0,12 m d'épaisseur.
		C->SetWorldRotation(FRotator(90, 0, 0));
		C->SetWorldScale3D(FVector(.84, .84, .12));
		Items.Add(C);
		ItemIndex.Add(I);
	}
}

int32 AStridesCollectibles::CollectAt(double X, double Z)
{
	UStridesSaveSubsystem* Save = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>() : nullptr;
	UStridesProgressionSubsystem* Progress = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>() : nullptr;
	if (!bBuilt || !Save || !Progress) return 0;
	std::vector<int> Got(Save->Horseshoes.GetData(), Save->Horseshoes.GetData() + Save->Horseshoes.Num());
	const std::vector<strides::ShoePickup> P = strides::collectShoes(Def, Got, X, Z);
	for (const strides::ShoePickup& S : P)
	{
		Save->Horseshoes.Add(S.index);
		Progress->Credits += S.money;
		// collectibles.js : toast « Fer d’or n/20 · +25 € », grande annonce à la collection complète.
		Progress->LastMessage = S.complete ? FString::Printf(TEXT("COLLECTION COMPLÈTE · Les %d fers d’or · +%d €"), (int32)Def.shoes.size(), Def.completeBonus)
			: FString::Printf(TEXT("Fer d’or %d/%d · +%d €"), S.count, (int32)Def.shoes.size(), Def.reward);
		UE_LOG(LogTemp, Display, TEXT("Strides fer d'or : n°%d ramassé (%d/%d, +%d crédits, total %d)"), S.index + 1, S.count, (int32)Def.shoes.size(), S.money, Progress->Credits);
		const int32 K = ItemIndex.Find(S.index);
		if (K != INDEX_NONE)
		{
			if (Items[K]) Items[K]->DestroyComponent();
			Items.RemoveAt(K);
			ItemIndex.RemoveAt(K);
		}
	}
	// game.saveSoon() : sauvegarde (la partie du joueur seulement ; jamais pendant les tests ni en capture).
	if (!P.empty() && Save->bAutoSave)
		if (APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0)) Save->SaveNow(PC);
	return (int32)P.size();
}

void AStridesCollectibles::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!bBuilt) return;
	Clock += DeltaSeconds;
	APawn* Pawn = UGameplayStatics::GetPlayerPawn(GetWorld(), 0);
	if (!Pawn) for (TActorIterator<AStridesPlayerController> It(GetWorld()); It && !Pawn; ++It) Pawn = It->GetPawn();
	if (!Pawn) return;
	double X, Y, Z;
	StridesUnits::UEToWeb(Pawn->GetActorLocation(), X, Y, Z);
	for (int32 K = 0; K < Items.Num(); ++K)
	{
		const int32 I = ItemIndex[K];
		const double D = FMath::Sqrt(FMath::Square(X - Def.shoes[(size_t)I].first) + FMath::Square(Z - Def.shoes[(size_t)I].second));
		const bool bVis = D < Def.visibleDist;
		Items[K]->SetVisibility(bVis);
		// it.m.rotation.y = t · 2 (rad/s).
		if (bVis) Items[K]->SetWorldRotation(FRotator(90, FMath::RadiansToDegrees(Clock * 2.0), 0));
	}
	CollectAt(X, Z);
}

void AStridesCollectibles::Remaining(TArray<FVector2D>& Out, const FVector2D& Near, double MaxDist) const
{
	for (const int32 I : ItemIndex)
	{
		const FVector2D P(Def.shoes[(size_t)I].first, Def.shoes[(size_t)I].second);
		if (FVector2D::Distance(P, Near) < MaxDist) Out.Add(P);
	}
}

int32 AStridesCollectibles::VisibleCount() const
{
	int32 N = 0;
	for (const UStaticMeshComponent* C : Items) if (C && C->IsVisible()) ++N;
	return N;
}
