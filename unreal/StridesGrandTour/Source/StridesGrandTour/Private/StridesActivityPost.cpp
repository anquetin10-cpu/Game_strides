#include "StridesActivityPost.h"

#include "Engine/GameInstance.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesProgressionSubsystem.h"
#include "StridesUnits.h"

AStridesActivityPost::AStridesActivityPost()
{
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));
	PrimaryActorTick.bCanEverTick = false;
}

void AStridesActivityPost::Setup(const strides::CsoActivity& InDef, AStridesCourse* InCourse)
{
	Def = InDef;
	bHasDef = true;
	Course = InCourse;
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	SetActorLocation(StridesUnits::WebToUE(Def.markerX, Data ? Data->TerrainHeight(Def.markerX, Def.markerZ) : 0.0, Def.markerZ));
}

bool AStridesActivityPost::MissionActive() const
{
	if (Course && Course->MissionActive()) return true;
	const UStridesProgressionSubsystem* P = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>() : nullptr;
	return P && !P->ActiveMissionId.IsEmpty();
}

bool AStridesActivityPost::Available(double FocusX, double FocusZ, const FString& Mode) const
{
	return bHasDef && Course && strides::csoActivityAvailable(Def, FocusX, FocusZ, TCHAR_TO_UTF8(*Mode), MissionActive());
}

FString AStridesActivityPost::Label() const
{
	if (!bHasDef || !Course) return FString();
	return UTF8_TO_TCHAR(Course->Texts().t(Def.label, Course->RunLang()).c_str());
}

bool AStridesActivityPost::Trigger(double FocusX, double FocusZ, const FString& Mode, const FString& Player, const FString& HorseName, double JumpPower, double Clearance)
{
	if (!Available(FocusX, FocusZ, Mode)) return false;
	return Course->StartActivity(Player, HorseName, JumpPower, Clearance);
}
