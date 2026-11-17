// Tests d'automatisation Unreal (Session Frontend > Automation, ou ligne de commande, voir unreal/docs/relais-mac.md) :
// rejouent dans le moteur les mêmes contrôles que unreal/core (tracé, jugement, sauvegarde, conversions d'axes).
#include "Misc/AutomationTest.h"
#include "StridesCore/CsoCourse.h"
#include "StridesCore/JumpModel.h"
#include "StridesCore/SaveGame.h"
#include "StridesUnits.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesCoreCourseTest, "Strides.Core.Course", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesCoreCourseTest::RunTest(const FString&)
{
	const strides::CourseTrace T = strides::traceCourse(strides::poleDesign());
	TestEqual(TEXT("10 obstacles"), (int32)T.fences.size(), 10);
	TestTrue(TEXT("longueur 368,44 m (oracle du jeu web)"), FMath::IsNearlyEqual(T.length, 368.44003310371414, 1e-6));
	TestEqual(TEXT("temps accordé national"), strides::timeAllowedFor(FMath::RoundToDouble(T.length), 350), 64);
	strides::JumpHorse H{6.2, 1.35, 0.0, true};
	strides::Fence F;
	F.bars.push_back({0, 1.1});
	const strides::FenceGeo G = strides::railsAhead(F, 0, -2.0, 0, 1);
	const strides::JumpPlan P = strides::planJump(H, &G);
	TestTrue(TEXT("vertical 1,10 m appelé à 2 m au galop de concours : franchi"), P.hasMargin && P.margin > -strides::jumpDefaults().rub);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesUnitsTest, "Strides.Units", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesUnitsTest::RunTest(const FString&)
{
	const FVector V = StridesUnits::WebToUE(1.0, 2.0, 3.0);
	TestEqual(TEXT("x web → X UE (cm)"), V.X, 100.0);
	TestEqual(TEXT("z web → Y UE (cm)"), V.Y, 300.0);
	TestEqual(TEXT("y web → Z UE (cm)"), V.Z, 200.0);
	// Cap h = 0 (vers +z web) → lacet 90° (vers +Y UE) ; aller-retour.
	TestTrue(TEXT("cap 0 → lacet 90°"), FMath::IsNearlyEqual(StridesUnits::HeadingToYawDeg(0), 90.0));
	TestTrue(TEXT("aller-retour du cap"), FMath::IsNearlyEqual(StridesUnits::YawDegToHeading(StridesUnits::HeadingToYawDeg(1.234)), 1.234, 1e-9));
	const FVector Dir = FRotator(0, StridesUnits::HeadingToYawDeg(0.7), 0).Vector();
	TestTrue(TEXT("direction du cap conservée"), FMath::IsNearlyEqual(Dir.X, FMath::Sin(0.7), 1e-6) && FMath::IsNearlyEqual(Dir.Y, FMath::Cos(0.7), 1e-6));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesSaveTest, "Strides.Core.Save", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesSaveTest::RunTest(const FString&)
{
	strides::SaveGame S;
	S.pose = {"ride", 1.5, 0, -2.5, 0.3, true};
	strides::SaveGame R;
	std::string Err;
	TestTrue(TEXT("relecture"), strides::SaveGame::fromJson(S.toJson(), R, Err));
	TestTrue(TEXT("position relue"), R.pose.valid && R.pose.mode == "ride" && FMath::IsNearlyEqual(R.pose.z, -2.5));
	return true;
}
