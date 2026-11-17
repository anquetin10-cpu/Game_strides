// Épreuve de CSO : tracé (strides::traceCourse, données Content/Data/cso_course_pole.json), obstacles, lignes de départ
// et d'arrivée, juge (strides::CourseJudge : fautes, refus, chrono, éliminations), résultat et record.
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StridesCore/CsoCourse.h"
#include "StridesCore/JumpModel.h"
#include <memory>
#include "StridesCourse.generated.h"

class AStridesFence;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FStridesCourseEvent, const FString&, Kind, const FString&, Text);

UCLASS()
class STRIDESGRANDTOUR_API AStridesCourse : public AActor
{
	GENERATED_BODY()
public:
	AStridesCourse();
	// Hauteur de l'épreuve (m) et niveau de vitesse ("national" 350 m/min, "csi", "gp").
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Strides") float CourseHeight = 1.1f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Strides") FString SpeedLevel = TEXT("national");
	UPROPERTY(BlueprintAssignable, Category = "Strides") FStridesCourseEvent OnCourseEvent;

	void Build(const strides::CourseDesign& Design, const class UStridesDataSubsystem& Data);
	// Appelé par le cheval : position et cap (repère web, m / rad), avant et après l'image.
	void TrackHorse(double X0, double Z0, double X1, double Z1, double Heading, float Dt);
	// Obstacle le plus proche devant le cheval (dans la portée du modèle de saut), ou nul.
	AStridesFence* FenceAhead(double X, double Z, double Heading, double Reach) const;
	// Fin d'un saut (plan du cœur) ou refus devant un obstacle.
	void JumpLanded(AStridesFence* Fence, const strides::JumpPlan& Plan, int32 Dir);
	void Refused(AStridesFence* Fence, int32 Dir);
	void RiderDismounted();

	UFUNCTION(BlueprintPure, Category = "Strides") float ElapsedTime() const;
	UFUNCTION(BlueprintPure, Category = "Strides") int32 Faults() const;
	UFUNCTION(BlueprintPure, Category = "Strides") int32 NextFence() const;
	UFUNCTION(BlueprintPure, Category = "Strides") int32 TimeAllowed() const { return Allowed; }
	UFUNCTION(BlueprintPure, Category = "Strides") FString StatusText() const;
	const strides::CourseJudge* Judge() const { return JudgePtr.get(); }
	const strides::CourseTrace& CourseTraceData() const { return Trace; }

private:
	bool LineCrossed(const strides::TraceMark& M, double X0, double Z0, double X1, double Z1, double Heading) const;
	strides::CourseTrace Trace;
	std::unique_ptr<strides::CourseJudge> JudgePtr;
	int32 Allowed = 64;
	UPROPERTY() TArray<TObjectPtr<AStridesFence>> Fences;
};
