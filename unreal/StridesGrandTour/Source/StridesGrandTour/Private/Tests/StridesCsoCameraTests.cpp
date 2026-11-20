// Tests moteur de la caméra de concours (tranche T6) :
//   - Strides.Parite.CsoCamera : le cœur strides::csoCamStep, compilé dans le module Unreal, rejoue le canal « cc » de
//     toutes les exécutions non légères de unreal/core/tests/oracles/cso_runs/ (résultats de la sonde et du sol
//     réinjectés depuis l'oracle), à 1e-6 près, comme unreal/core/tests/test_core.cpp (testCamRuns) ;
//   - Strides.Cso.CameraInGame : la caméra du cheval du jeu (AStridesHorse::StepCourseCamera : sonde par traces du
//     moteur, sol du relief exporté, obstacles du parcours, réglages lus dans Content/Data/cso_camera.json) rejoue le
//     scénario « cadrage » (tests/e2e/cso-framing.mjs) ; composant caméra, FOV VERTICAL (axe Y maintenu) et cadrage du
//     couple mesuré avec la projection du moteur en 844 × 390 comparés au jeu web.
#include "Misc/AutomationTest.h"
#include "Camera/CameraComponent.h"
#include "Camera/CameraTypes.h"
#include "SceneView.h"
#include "Dom/JsonObject.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Misc/FileHelper.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "StridesCore/CsoCamera.h"
#include "StridesCore/MiniJson.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesOracleRuns.h"
#include "StridesShots.h"
#include "StridesUnits.h"
#include <algorithm>
#include <vector>

namespace StridesCamTest
{


std::vector<strides::CsoCamFence> Fences(const J& Obs)
{
	std::vector<strides::CsoCamFence> V;
	for (const J& O : Obs.a)
	{
		strides::CsoCamFence F;
		F.x = O[0].num(); F.z = O[1].num(); F.nx = O[2].num(); F.nz = O[3].num(); F.tx = O[4].num(); F.tz = O[5].num();
		F.w = O[6].num(); F.depth = O[7].isNull() ? 0 : O[7].num(); F.ground = O[8].num(); F.h = O[9].num(); F.off = O[10].b;
		V.push_back(F);
	}
	return V;
}
strides::CsoVec3 Vec(const J& A) { return strides::CsoVec3{A[0].num(), A[1].num(), A[2].num()}; }

// Monde de test autonome (instance de jeu, sous-système de données lu dans Content/Data).
struct FTestWorld
{
	UGameInstance* GI = nullptr;
	UWorld* World = nullptr;
	FTestWorld(const TCHAR* Name)
	{
		GI = NewObject<UGameInstance>(GEngine);
		GI->AddToRoot();
		GI->InitializeStandalone(Name);
		World = GI->GetWorld();
	}
	~FTestWorld()
	{
		GI->Shutdown();
		if (World)
		{
			GEngine->DestroyWorldContext(World);
			World->DestroyWorld(false);
		}
		GI->RemoveFromRoot();
	}
};
}  // namespace StridesCamTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesPariteCsoCameraTest, "Strides.Parite.CsoCamera", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesPariteCsoCameraTest::RunTest(const FString&)
{
	using namespace StridesCamTest;
	const TArray<StridesOracleRuns::FEntry> Runs = StridesOracleRuns::List();
	if (!TestTrue(TEXT("index des oracles cso_runs lu"), Runs.Num() > 0)) return false;
	const strides::CsoCamParams& C = strides::csoCamDefaults();
	int32 Calls = 0, Bad = 0, Done = 0, Blocked = 0;
	double DevPos = 0, DevFov = 0;
	TArray<FString> Clean;
	for (const StridesOracleRuns::FEntry& Entry : Runs)
	{
		FString Text;
		if (!TestTrue(FString::Printf(TEXT("cso_runs/%s lu"), *Entry.File), FFileHelper::LoadFileToString(Text, *StridesOracleRuns::Path(Entry)))) return false;
		const std::string Utf8 = TCHAR_TO_UTF8(*Text);
		const J R = JParser(Utf8).parse();
		if (R["setup"]["lite"].b) continue;  // images légères (t4-*, t7-*) : pas de canal caméra (même règle que testCamRuns)
		const J& C0 = R["setup"]["cc0"];
		if (!TestTrue(FString::Printf(TEXT("%s : état de départ de la caméra (cc0)"), *Entry.File), C0.t == J::Obj)) continue;
		strides::CsoCamState S;
		S.eye = Vec(C0["eye"]);
		S.fov = C0["fov"].num();
		S.camFov = C0["camFov"].num();
		if (!C0["st"].isNull())
		{
			const J& St = C0["st"];
			S.active = true;
			S.cH = St["cH"].num(); S.w = St["w"].num(); S.t = St["t"].num();
			S.ax = St["ax"].num(); S.az = St["az"].num(); S.ay = St["ay"].num(); S.back = St["back"].num();
			S.from = Vec(St["from"]); S.fromLook = Vec(St["fromLook"]);
			S.hasAim = !St["aim"].isNull();
			if (S.hasAim) S.aim = Vec(St["aim"]);
		}
		std::vector<strides::CsoCamFence> Obs = Fences(C0["obs"]);
		int32 RunBad = 0;
		FString First;
		auto Call = [&](const J& Cc, int32 F)
		{
			strides::CsoCamInput In;
			In.dt = Cc["dt"].isNull() ? 1.0 / 30 : Cc["dt"].num();
			In.instant = Cc["i"].b;
			const J& Hz = Cc["hz"];
			In.horse = strides::CsoCamHorse{Hz[0].num(), Hz[1].num(), Hz[2].num(), Hz[3].isNull() ? 0.0 : Hz[3].num(), Hz[4].num(), Hz[5].num(), Hz[6].num()};
			if (!Cc["e0"].isNull())
			{
				S.eye = Vec(Cc["e0"]);
				S.fov = Cc["f0"][0].num();
				S.camFov = Cc["f0"][1].num();
			}
			if (!Cc["obs"].isNull()) Obs = Fences(Cc["obs"]);
			In.fences = &Obs;
			if (!Cc["nx"].isNull() && (size_t)Cc["nx"].num() < Obs.size())
			{
				In.hasNext = true;
				In.nextX = Obs[(size_t)Cc["nx"].num()].x;
				In.nextZ = Obs[(size_t)Cc["nx"].num()].z;
			}
			const int32 Pb = (int32)Cc["pb"].num();
			int32 K = 0;
			In.blocked = [&](double, double, double) { return K++ == Pb; };
			const double Th = Cc["th"][2].num();
			In.ground = [Th](double, double) { return Th; };
			const strides::CsoCamOut Out = strides::csoCamStep(S, In, C);
			double D = 0;
			const double Oe[3] = {Out.eye.x, Out.eye.y, Out.eye.z}, Ol[3] = {Out.look.x, Out.look.y, Out.look.z};
			for (int32 I = 0; I < 3; I++)
			{
				D = FMath::Max(D, FMath::Abs(Oe[I] - Cc["eye"][(size_t)I].num()));
				D = FMath::Max(D, FMath::Abs(Ol[I] - Cc["look"][(size_t)I].num()));
			}
			const double Df = FMath::Max(FMath::Abs(Out.fov - Cc["fov"].num()), FMath::Abs(S.fov - Cc["fs"].num()));
			DevPos = FMath::Max(DevPos, D);
			DevFov = FMath::Max(DevFov, Df);
			if (Pb >= 0) Blocked++;
			const bool bOk = D <= 1e-6 && Df <= 1e-6 && FMath::Abs(S.back - Cc["bk"].num()) <= 1e-6 && Out.probeHit == Pb && Out.probeCount == (int32)Cc["pn"].num();
			if (!bOk && RunBad++ == 0) First = FString::Printf(TEXT("image %d : écart %.3g m, FOV %.3g°, recul %.9g/%.9g, sonde %d/%d"), F, D, Df, S.back, Cc["bk"].num(), Out.probeHit, Pb);
			Calls++;
		};
		for (const J& Fr : R["frames"].a)
		{
			const int32 F = (int32)Fr["f"].num();
			for (const J& Cc : Fr["ccp"].a) Call(Cc, F);
			if (Fr["cc"].isNull()) strides::csoCamLeave(S);
			else Call(Fr["cc"], F);
		}
		TestTrue(FString::Printf(TEXT("%s : caméra rejouée à 1e-6 près (%s)"), *Entry.File, RunBad ? *First : TEXT("aucun écart")), RunBad == 0);
		if (RunBad == 0) Clean.Add(Entry.Id);
		Bad += RunBad;
		Done++;
	}
	for (const TCHAR* Id : {TEXT("droit"), TEXT("t6-tribunes"), TEXT("t6-mat"), TEXT("t6-entree"), TEXT("t6-relief"), TEXT("t6-survol"), TEXT("cadrage")})
		TestTrue(FString::Printf(TEXT("scénario %s rejoué sans écart"), Id), Clean.Contains(Id));
	TestTrue(FString::Printf(TEXT("sonde de la perche bloquée dans l'oracle (%d appels)"), Blocked), Blocked > 0);
	AddInfo(FString::Printf(TEXT("caméra de concours (cœur dans le module) : %d exécutions, %d appels, écarts max œil/visée %.3g m, FOV %.3g°, %d appels en écart"), Done, Calls, DevPos, DevFov, Bad));
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesCsoCameraInGameTest, "Strides.Cso.CameraInGame", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesCsoCameraInGameTest::RunTest(const FString&)
{
	using namespace StridesCamTest;
	FTestWorld W(TEXT("StridesCsoCameraInGameTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	if (!TestNotNull(TEXT("sous-système de données"), Data)) return false;
	// Réglages de la caméra lus dans Content/Data/cso_camera.json (export de CAM_COMP) = valeurs du portage.
	{
		const strides::CsoCamParams& P = Data->CameraParams();
		const strides::CsoCamParams& D = strides::csoCamDefaults();
		TestTrue(TEXT("cso_camera.json lu (réglages CAM_COMP du jeu web)"), Data->LoadLog.ContainsByPredicate([](const FString& L) { return L.StartsWith(TEXT("cso_camera.json : strides.cso_camera/1")); }));
		TestTrue(TEXT("réglages de la caméra = portage"), P.back == D.back && P.up == D.up && P.lookAhead == D.lookAhead && P.lookUp == D.lookUp && P.fenceBias == D.fenceBias &&
			P.fenceRange == D.fenceRange && P.lead == D.lead && P.yawK == D.yawK && P.yawAcc == D.yawAcc && P.posK == D.posK && P.yK == D.yK &&
			P.jumpFollow == D.jumpFollow && P.fov == D.fov && P.minBack == D.minBack && P.fenceClear == D.fenceClear && P.enter == D.enter);
	}
	AStridesCourse* Course = W.World->SpawnActor<AStridesCourse>();
	{
		strides::CourseDesign Dz = Data->PoleCourse();
		Dz.x += Data->PoleArena.X;
		Dz.z += Data->PoleArena.Y;
		Course->Build(Dz, *Data);
	}
	AStridesHorse* Horse = W.World->SpawnActor<AStridesHorse>();
	Horse->Course = Course;
	UCameraComponent* Cam = Horse->CourseCameraComponent();
	if (!TestNotNull(TEXT("caméra de concours du cheval"), Cam)) return false;
	TestTrue(TEXT("caméra de concours inactive hors épreuve"), !Cam->IsActive() && !Horse->IsCourseCameraActive());
	TestTrue(TEXT("caméra de concours : axe Y maintenu imposé (FOV vertical), pas de bandes"), Cam->bOverrideAspectRatioAxisConstraint &&
		Cam->AspectRatioAxisConstraint == EAspectRatioAxisConstraint::AspectRatio_MaintainYFOV && !Cam->bConstrainAspectRatio);

	// Scénario « cadrage » de l'oracle (tests/e2e/cso-framing.mjs au pas fixe), rejoué par la caméra du cheval.
	StridesOracleRuns::FEntry Entry;
	for (const StridesOracleRuns::FEntry& E : StridesOracleRuns::List()) if (E.Id == TEXT("cadrage")) Entry = E;
	if (!TestTrue(TEXT("exécution « cadrage » dans l'index"), !Entry.File.IsEmpty())) return false;
	FString Text;
	TSharedPtr<FJsonObject> Run;
	if (!TestTrue(TEXT("cadrage.fr.json lu"), FFileHelper::LoadFileToString(Text, *StridesOracleRuns::Path(Entry)) && FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Run) && Run.IsValid())) return false;
	TArray<FVector2D> Pts;
	for (const TSharedPtr<FJsonValue>& P : Run->GetObjectField(TEXT("setup"))->GetObjectField(TEXT("framing"))->GetArrayField(TEXT("pts")))
		Pts.Add(FVector2D(P->AsArray()[0]->AsNumber(), P->AsArray()[1]->AsNumber()));
	TMap<int32, TSharedPtr<FJsonObject>> Marks;
	for (const TSharedPtr<FJsonValue>& F : Run->GetArrayField(TEXT("frames")))
	{
		const TSharedPtr<FJsonObject>* Fr = nullptr;
		if (F->AsObject()->TryGetObjectField(TEXT("fr"), Fr)) Marks.Add((int32)F->AsObject()->GetNumberField(TEXT("f")), *Fr);
	}
	double DevPos = 0, DevFov = 0, DevGround = 0, DevComp = 0, DevDir = 0, DevFrame = 0;
	int32 Calls = 0, Measured = 0, Snaps = 0;
	TArray<FString> Parts;
	FString Why;
	const bool bOk = AStridesShots::ReplayCourseCamera(Horse, Run, -1, [&](int32 F, const strides::CsoCamOut& Out, const TSharedPtr<FJsonObject>& C)
	{
		Calls++;
		bool bI = false;
		if (C->TryGetBoolField(TEXT("i"), bI) && bI) Snaps++;
		const TArray<TSharedPtr<FJsonValue>>& E = C->GetArrayField(TEXT("eye"));
		const TArray<TSharedPtr<FJsonValue>>& L = C->GetArrayField(TEXT("look"));
		const TArray<TSharedPtr<FJsonValue>>& Hz = C->GetArrayField(TEXT("hz"));
		const double Oe[3] = {Out.eye.x, Out.eye.y, Out.eye.z}, Ol[3] = {Out.look.x, Out.look.y, Out.look.z};
		for (int32 I = 0; I < 3; I++)
		{
			DevPos = FMath::Max(DevPos, FMath::Abs(Oe[I] - E[I]->AsNumber()));
			DevPos = FMath::Max(DevPos, FMath::Abs(Ol[I] - L[I]->AsNumber()));
		}
		DevFov = FMath::Max(DevFov, FMath::Abs(Out.fov - C->GetNumberField(TEXT("fov"))));
		DevGround = FMath::Max(DevGround, FMath::Abs(Horse->GroundAt(Hz[0]->AsNumber(), Hz[1]->AsNumber()) - Hz[6]->AsNumber()));
		// Composant caméra du cheval : position, direction de visée, FOV appliqué.
		const FVector EyeUE = StridesUnits::WebToUE(Out.eye.x, Out.eye.y, Out.eye.z);
		const FVector Dir = (StridesUnits::WebToUE(Out.look.x, Out.look.y, Out.look.z) - EyeUE).GetSafeNormal();
		DevComp = FMath::Max(DevComp, (Cam->GetComponentLocation() - EyeUE).Size());
		DevDir = FMath::Max(DevDir, (Cam->GetForwardVector() - Dir).Size());
		DevFov = FMath::Max(DevFov, FMath::Abs((double)Cam->FieldOfView - Out.fov));
		// Instants mesurés par cso-framing.mjs : projection du moteur (vue du composant, 844 × 390).
		if (const TSharedPtr<FJsonObject>* Fr = Marks.Find(F); Fr && !bI)
		{
			FMinimalViewInfo View;
			Cam->GetCameraView(0, View);
			const TArray<TSharedPtr<FJsonValue>>& Pose = (*Fr)->GetArrayField(TEXT("pose"));
			const double Y0 = Pose[3]->AsNumber() + Pose[4]->AsNumber();
			const TArray<double> Ys = AStridesShots::FramingYs(View, 844, 390, Pose[0]->AsNumber(), Pose[1]->AsNumber(), Pose[2]->AsNumber(), Y0, Pts);
			const TArray<TSharedPtr<FJsonValue>>& Wys = (*Fr)->GetArrayField(TEXT("ys"));
			double Top = 1e9, Bot = -1e9;
			for (int32 I = 0; I < Ys.Num(); I++)
			{
				DevFrame = FMath::Max(DevFrame, FMath::Abs(Ys[I] - Wys[I]->AsNumber()));
				Top = FMath::Min(Top, Ys[I]);
				Bot = FMath::Max(Bot, Ys[I]);
			}
			Top = FMath::Max(0.0, Top);
			Bot = FMath::Min(1.0, Bot);
			Parts.Add(FString::Printf(TEXT("%d%s %.4f/%.4f"), F, (*Fr)->GetBoolField(TEXT("jump")) ? TEXT(" (saut)") : TEXT(""), Bot - Top, (*Fr)->GetNumberField(TEXT("part"))));
			if (Measured == 0)
			{
				// Axe du FOV mesuré sur la matrice de projection du moteur (celle du rendu) en 844 × 390 : champ vertical
				// = FieldOfView si M11 = 1 / tan(FOV / 2), et M00 = M11 × 390 / 844.
				FMinimalViewInfo V2 = View;
				FSceneViewProjectionData Pd;
				Pd.SetViewRectangle(FIntRect(0, 0, 844, 390));
				const EAspectRatioAxisConstraint Ax = V2.AspectRatioAxisConstraint.Get(EAspectRatioAxisConstraint::AspectRatio_MajorAxisFOV);
				FMinimalViewInfo::CalculateProjectionMatrixGivenViewRectangle(V2, Ax, FIntRect(0, 0, 844, 390), Pd);
				const double M11 = Pd.ProjectionMatrix.M[1][1], M00 = Pd.ProjectionMatrix.M[0][0], Want = 1.0 / FMath::Tan(FMath::DegreesToRadians((double)View.FOV) / 2);
				TestTrue(FString::Printf(TEXT("projection du moteur : FOV %.6f° vertical (M11 %.6f = 1/tan(FOV/2) %.6f ; M00 %.6f ; axe %d, AspectRatio %.4f)"), View.FOV, M11, Want, M00, (int32)Ax, View.AspectRatio),
					Ax == EAspectRatioAxisConstraint::AspectRatio_MaintainYFOV && FMath::Abs(M11 - Want) <= 1e-5 && FMath::Abs(M00 - M11 * 390.0 / 844.0) <= 1e-5);
			}
			Measured++;
		}
	}, Why);
	TestTrue(FString::Printf(TEXT("cadrage rejoué par la caméra du cheval (%s)"), bOk ? TEXT("ok") : *Why), bOk);
	TestTrue(FString::Printf(TEXT("%d appels dont %d snap"), Calls, Snaps), Calls > 400 && Snaps == 1);
	TestTrue(FString::Printf(TEXT("sol du jeu sous le cheval = sol du web (écart max %.3g m)"), DevGround), DevGround <= 1e-6);
	TestTrue(FString::Printf(TEXT("œil et point visé du jeu = web à 1e-6 m près (écart max %.3g m)"), DevPos), DevPos <= 1e-6);
	TestTrue(FString::Printf(TEXT("FOV vertical appliqué = web (écart max %.3g°, float du composant compris)"), DevFov), DevFov <= 1e-5);
	TestTrue(FString::Printf(TEXT("composant caméra posé à l'œil (écart %.3g cm) et tourné vers le point visé (écart %.3g, rotateur en degrés)"), DevComp, DevDir), DevComp <= 1e-3 && DevDir <= 1e-5);
	TestTrue(TEXT("caméra de concours active après le rejeu"), Cam->IsActive() && Horse->IsCourseCameraActive());
	// Cadrage : part de la hauteur de l'écran occupée par le couple, projection du moteur avec FOV vertical (axe Y
	// maintenu) = projection Three.js du web ; un FOV lu comme horizontal donnerait un tout autre cadrage.
	TestTrue(FString::Printf(TEXT("cadrage : %d instants mesurés (6 de cso-framing.mjs et les sauts)"), Measured), Measured >= 6);
	TestTrue(FString::Printf(TEXT("cadrage du moteur = web (écart max des points %.3g de la hauteur ; image part jeu/web : %s)"), DevFrame, *FString::Join(Parts, TEXT(", "))), DevFrame <= 1e-5);
	// Sortie de l'épreuve : perche du monde ouvert rétablie.
	Horse->LeaveCourseCamera();
	TestTrue(TEXT("sortie : caméra de concours désactivée"), !Cam->IsActive() && !Horse->IsCourseCameraActive());
	AddInfo(FString::Printf(TEXT("caméra de concours en jeu : %d appels, écarts œil/visée %.3g m, FOV %.3g°, composant %.3g cm / %.3g, cadrage %.3g ; %s"),
		Calls, DevPos, DevFov, DevComp, DevDir, DevFrame, *FString::Join(Parts, TEXT(", "))));
	return true;
}
