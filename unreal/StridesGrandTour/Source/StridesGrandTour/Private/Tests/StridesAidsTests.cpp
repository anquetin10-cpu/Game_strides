// Aides à l'appel (tranche T9, unreal/docs/parite/cso-ecarts.md §4) dans le moteur — Strides.Cso.Aids :
//  1) matériaux M_CsoAid (une face) et M_CsoAidTwoSided (deux faces) : translucides, sans éclairage ; données de la scène
//     du web (Content/Data/cso_aids.json) et du bouton (cso_jump_style.json) chargées ;
//  2) canal « ai » des exécutions t9-* de l'oracle rejoué dans AStridesCourseAids (relief du jeu) : vue du cœur = état
//     relevé dans le web à chaque appel, maillages posés d'après la vue (tirets affichés, sommets des bandes et du repère
//     dans le repère du web, matériaux et opacités relus dans la scène du web, ordre de rendu) ;
//  3) bouton SAUT : HUD des exécutions t9-* rejoué (StridesCsoHudReplay) et affiché par UStridesTouchControls à chaque
//     image : style (classes), libellé en capitales, signe, couleurs du fond, de l'anneau et de la pastille = état du DOM
//     du web et styles relevés pour cet état ;
//  4) épreuve réelle (AStridesCourse, AStridesHorse) : aides créées à l'étape de parcours, repère sur l'obstacle 1, zone
//     d'appel à l'abord, réglages jumpAid (button, off) et courseLine (sauvegarde de test) lus à chaque image, bouton coloré
//     par l'aide du cheval.
#include "Misc/AutomationTest.h"
#include "Blueprint/UserWidget.h"
#include "Dom/JsonObject.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/Material.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "StridesCore/CsoInput.h"
#include "StridesCore/MiniJson.h"
#include "StridesCore/SaveGame.h"
#include "StridesCourse.h"
#include "StridesCourseAids.h"
#include "StridesCourseAidsReplay.h"
#include "StridesCsoHudReplay.h"
#include "StridesCss.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesPlayerController.h"
#include "StridesRider.h"
#include "StridesSaveSubsystem.h"
#include "StridesTouchControls.h"

namespace StridesAidsTest
{
struct FTestWorld
{
	UGameInstance* GI = nullptr;
	UWorld* World = nullptr;
	explicit FTestWorld(const TCHAR* Name)
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
const TCHAR* TestSlot = TEXT("strides_test_t9");
FString RepoRoot() { return FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../..")); }
bool LoadRun(const FString& Id, J& Out)
{
	FString Text;
	if (!FFileHelper::LoadFileToString(Text, *(RepoRoot() / TEXT("unreal/core/tests/oracles/cso_runs") / (Id + TEXT(".json"))))) return false;
	const std::string U = TCHAR_TO_UTF8(*Text);
	Out = JParser(U).parse();
	return true;
}
}  // namespace StridesAidsTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesCsoAidsTest, "Strides.Cso.Aids", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesCsoAidsTest::RunTest(const FString&)
{
	using namespace StridesAidsTest;
	namespace Sc = StridesCss;
	auto Info = [this](const FString& M) { AddInfo(M); UE_LOG(LogTemp, Display, TEXT("Strides.Cso.Aids : %s"), *M); };
	FTestWorld W(TEXT("StridesCsoAidsTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	UStridesSaveSubsystem* Save = W.GI->GetSubsystem<UStridesSaveSubsystem>();
	if (!TestNotNull(TEXT("sous-systèmes"), Data) || !TestNotNull(TEXT("sauvegarde"), Save)) return false;
	if (!TestTrue(TEXT("données des aides (cso_aids.json, cso_jump_style.json)"), Data->CsoAids().IsValid() && Data->CsoJumpStyle().IsValid())) return false;

	// 1) Matériaux.
	const UMaterial* M1 = LoadObject<UMaterial>(nullptr, TEXT("/Game/World/Cso/Materials/M_CsoAid.M_CsoAid"));
	const UMaterial* M2 = LoadObject<UMaterial>(nullptr, TEXT("/Game/World/Cso/Materials/M_CsoAidTwoSided.M_CsoAidTwoSided"));
	TestTrue(TEXT("M_CsoAid : translucide, sans éclairage, une face ; M_CsoAidTwoSided : deux faces"), M1 && M2 && M1->BlendMode == BLEND_Translucent && M2->BlendMode == BLEND_Translucent &&
		M1->GetShadingModels().IsUnlit() && M2->GetShadingModels().IsUnlit() && !M1->IsTwoSided() && M2->IsTwoSided());

	// Parcours construit comme dans le jeu (aides : ligne du cavalier, obstacles).
	Save->SlotName = TestSlot;
	UGameplayStatics::DeleteGameInSlot(TestSlot, 0);
	Save->MutableSettings() = strides::SaveGame::fresh().settings;
	AStridesCourse* Course = W.World->SpawnActor<AStridesCourse>();
	strides::CourseDesign D = Data->PoleCourse();
	D.x += Data->PoleArena.X;
	D.z += Data->PoleArena.Y;
	Course->Build(D, *Data);
	const std::vector<strides::TracePoint> Line = Course->AidLine();
	TestTrue(FString::Printf(TEXT("ligne du cavalier : %d points (CSO_LINE du web : 738)"), (int32)Line.size()), Line.size() == 738);
	auto Ground = [Data](double X, double Z) { return Data->TerrainHeight(X, Z); };

	// 2) Canal « ai » rejoué dans l'acteur.
	const TSharedPtr<FJsonObject> AidsData = Data->CsoAids();
	const TSharedPtr<FJsonObject> Mats = AidsData->GetObjectField(TEXT("materials"));
	int32 Calls = 0, Bad = 0, ShownLine = 0, ShownOk = 0, ShownGood = 0, ShownMark = 0, GeoBad = 0;
	double GroundDev = 0;
	for (const TCHAR* Id : {TEXT("t9-appel.fr"), TEXT("t9-aide-bouton.fr"), TEXT("t9-aide-off.fr"), TEXT("t9-sans-trace.fr"), TEXT("t9-parcours.fr")})
	{
		J RunJ;
		if (!TestTrue(FString::Printf(TEXT("exécution %s lue"), Id), LoadRun(Id, RunJ))) continue;
		AStridesCourseAids* A = W.World->SpawnActor<AStridesCourseAids>();
		A->Begin(Line, Ground);
		std::vector<strides::CsoAidsFence> Fs;
		for (const J& F : RunJ["frames"].a)
		{
			const J& Ai = F["ai"];
			if (!Ai["ob"].isNull()) Fs = StridesCourseAidsReplay::Fences(Ai["ob"]);
			const J& C = Ai["c"];
			if (C.isNull()) continue;
			A->Step(StridesCourseAidsReplay::Input(C["in"], Fs));
			Calls++;
			const TArray<FString> Dd = StridesCourseAidsReplay::Diff(*A->CoreAids(), C["out"], 1e-9, GroundDev);
			if (Dd.Num() && Bad++ < 3) AddError(FString::Printf(TEXT("%s image %d : %s"), Id, (int32)F["f"].num(), *FString::Join(Dd, TEXT(", "))));
			// Maillages posés d'après la vue : tirets affichés, bandes (centre, cap, échelle) et repère (sommet du cône).
			const strides::CsoAidsView& V = A->CoreAids()->view();
			bool bGeo = A->IsShown(TEXT("line")) == (V.lineVisible && V.lineCount > 0) && (!A->IsShown(TEXT("line")) || A->LineQuads() == V.lineCount);
			for (const TPair<const TCHAR*, const strides::CsoAidsBand*> Bp : {TPair<const TCHAR*, const strides::CsoAidsBand*>(TEXT("ok"), &V.ok), TPair<const TCHAR*, const strides::CsoAidsBand*>(TEXT("good"), &V.good)})
			{
				const strides::CsoAidsBand& B = *Bp.Value;
				const TArray<FVector> Wv = A->WebVertices(Bp.Key);
				bGeo = bGeo && A->IsShown(Bp.Key) == B.visible;
				if (!B.visible) continue;
				FVector Ctr = FVector::ZeroVector;
				for (const FVector& P : Wv) Ctr += P / Wv.Num();
				// Plan 1 × 1 : coins à (±sx/2, ±sz/2) tournés du cap.
				// (repère web : x, y haut, z ; diagonale dans le plan du sol)
				const double Diag = Wv.Num() == 4 ? FMath::Sqrt(FMath::Square(Wv[0].X - Wv[3].X) + FMath::Square(Wv[0].Z - Wv[3].Z)) : 0.0;
				bGeo = bGeo && Wv.Num() == 4 && FVector::Dist(Ctr, FVector(B.x, B.y, B.z)) < 1e-9 && FMath::Abs(Diag - FMath::Sqrt(B.sx * B.sx + B.sz * B.sz)) < 1e-9;
				(Bp.Value == &V.ok ? ShownOk : ShownGood)++;
			}
			if (V.markVisible)
			{
				// Pointe du cône retourné : 0,15 m sous le centre du repère (ConeGeometry hauteur 0,3 ; positions float32 du web).
				double MinY = 1e9;
				for (const FVector& P : A->WebVertices(TEXT("mark"))) MinY = FMath::Min(MinY, P.Y);
				bGeo = bGeo && A->IsShown(TEXT("mark")) && FMath::Abs(MinY - (V.markY - 0.15)) < 1e-6;
				ShownMark++;
			}
			if (A->IsShown(TEXT("line"))) ShownLine++;
			if (!bGeo && GeoBad++ < 3) AddError(FString::Printf(TEXT("%s image %d : maillages différents de la vue du cœur"), Id, (int32)F["f"].num()));
		}
		// Matériaux : couleur linéaire et opacité de la scène du web, une ou deux faces, ordre de rendu.
		for (const TCHAR* Part : {TEXT("line"), TEXT("after"), TEXT("ok"), TEXT("good"), TEXT("mark")})
		{
			const TSharedPtr<FJsonObject> Mj = Mats->GetObjectField(Part);
			const UMaterialInstanceDynamic* Mid = Cast<UMaterialInstanceDynamic>(A->PartMaterial(Part));
			FLinearColor Col;
			float Op = 0;
			const bool bOk = Mid && Mid->GetVectorParameterValue(FHashedMaterialParameterInfo(TEXT("Color")), Col) && Mid->GetScalarParameterValue(FHashedMaterialParameterInfo(TEXT("Opacity")), Op);
			const TArray<TSharedPtr<FJsonValue>>& Cl = Mj->GetArrayField(TEXT("colorLinear"));
			const bool bTwo = Mid && Mid->GetMaterial() && Mid->GetMaterial()->IsTwoSided();
			if (FCString::Strcmp(Id, TEXT("t9-appel.fr")) == 0)
				TestTrue(FString::Printf(TEXT("%s : couleur (%.4f ; %.4f ; %.4f), opacité %.2f, %s, priorité %d = scène du web"), Part, Col.R, Col.G, Col.B, Op, bTwo ? TEXT("deux faces") : TEXT("une face"), A->SortPriority(Part)),
					bOk && FMath::IsNearlyEqual(Col.R, Cl[0]->AsNumber(), 1e-6) && FMath::IsNearlyEqual(Col.G, Cl[1]->AsNumber(), 1e-6) && FMath::IsNearlyEqual(Col.B, Cl[2]->AsNumber(), 1e-6) &&
					FMath::IsNearlyEqual(Op, Mj->GetNumberField(TEXT("opacity")), 1e-6) && bTwo == (Mj->GetIntegerField(TEXT("side")) == 2) &&
					A->SortPriority(Part) == AidsData->GetObjectField(TEXT("renderOrder"))->GetIntegerField(Part));
		}
		A->Destroy();
	}
	TestTrue(FString::Printf(TEXT("canal « ai » : %d appels rejoués dans l'acteur, %d écarts de la vue au web, %d maillages différents de la vue ; sol des bandes à %.3g m du web"), Calls, Bad, GeoBad, GroundDev),
		Calls > 3000 && Bad == 0 && GeoBad == 0 && GroundDev < 1e-3 && ShownLine > 0 && ShownOk > 0 && ShownGood > 0 && ShownMark > 0);
	Info(FString::Printf(TEXT("aides rejouées : %d appels ; affichés : tracé %d, ambre %d, verte %d, repère %d ; sol des bandes à %.3g m du web"), Calls, ShownLine, ShownOk, ShownGood, ShownMark, GroundDev));

	// 3) Bouton SAUT : HUD rejoué, affiché par le widget des commandes, comparé au DOM du web image par image.
	UStridesTouchControls* Touch = CreateWidget<UStridesTouchControls>(W.World, UStridesTouchControls::StaticClass());
	if (!TestNotNull(TEXT("widget des commandes"), Touch)) return false;
	strides::CsoInput Dummy;
	Touch->SetCommandsForTest(&Dummy, true);
	Touch->SetTouchMode(false);
	Touch->SetLangForTest(TEXT("fr"));
	if (!TestTrue(TEXT("épreuve lancée (HUD du parcours)"), Course->StartRun(TEXT("Alex"), TEXT("Comète")))) return false;
	int32 Frames = 0, BtnBad = 0;
	TSet<FString> Keys;
	for (const FVector2D& View : {FVector2D(844, 390), FVector2D(667, 308)})
	{
		Touch->SetViewCssForTest(View);
		TSharedPtr<FJsonObject> JV;
		for (const TSharedPtr<FJsonValue>& Vv : Data->CsoJumpStyle()->GetArrayField(TEXT("views")))
			if (Vv->AsObject()->GetArrayField(TEXT("viewport"))[1]->AsNumber() == View.Y) JV = Vv->AsObject();
		for (const TCHAR* Id : {TEXT("t9-appel.fr"), TEXT("t9-aide-off.fr")})
		{
			J RunJ;
			if (!LoadRun(Id, RunJ)) continue;
			strides::CsoHud& H = Course->HudModel();
			H = strides::CsoHud();
			H.setViewportHeight(View.Y);
			StridesCsoHudReplay::Calls(H, RunJ["setup"]["calls"]["hud"]);
			for (const J& F : RunJ["frames"].a)
			{
				StridesCsoHudReplay::Frame(H, F, false);
				Touch->Sync();
				Frames++;
				const J& B = F["ai"]["b"];
				FString Want = TEXT("none");
				bool bEarly = false;
				for (const J& C : B["cl"].a)
				{
					if (C.s == "early") bEarly = true;
					else Want = UTF8_TO_TCHAR(C.s.c_str());
				}
				if (bEarly) Want += TEXT("-early");
				Keys.Add(Want);
				const Sc::FJ S = Sc::Obj(Sc::Obj(JV, TEXT("states")), *Want);
				// (text-transform: uppercase du web, accents compris)
				const FString WantLabel = FText::FromString(UTF8_TO_TCHAR(B["lb"].s.c_str())).ToUpper().ToString();
				const bool bSign = Sc::Str(Sc::Obj(S, TEXT("sign")), TEXT("display")) != TEXT("none");
				const bool bSame = Touch->JumpShownKey() == Want && Touch->JumpLabelText() == WantLabel && Touch->JumpSignText() == (bSign ? FString(UTF8_TO_TCHAR(B["sg"].s.c_str())) : FString()) &&
					Touch->JumpColor(TEXT("background")).Equals(Sc::Color(Sc::Obj(S, TEXT("jump")), TEXT("backgroundColor")), 1e-4f) &&
					Touch->JumpColor(TEXT("ring")).Equals(Sc::Color(Sc::Obj(S, TEXT("ring")), TEXT("borderTopColor")), 1e-4f) &&
					(!bSign || Touch->JumpColor(TEXT("sign")).Equals(Sc::Color(Sc::Obj(S, TEXT("sign")), TEXT("backgroundColor")), 1e-4f)) &&
					Touch->JumpGlowShown() == Sc::Shadow(Sc::Obj(S, TEXT("ring"))).bOn;
				if (!bSame && BtnBad++ < 3)
					AddError(FString::Printf(TEXT("%s image %d (%.0f × %.0f) : bouton %s « %s » « %s » au lieu de %s « %s » « %s »"), Id, (int32)F["f"].num(), View.X, View.Y, *Touch->JumpShownKey(), *Touch->JumpLabelText(),
						*Touch->JumpSignText(), *Want, *WantLabel, UTF8_TO_TCHAR(B["sg"].s.c_str())));
			}
		}
	}
	TestTrue(FString::Printf(TEXT("bouton SAUT : %d images affichées (deux viewports), %d écarts au DOM du web ; états %s"), Frames, BtnBad, *FString::Join(Keys.Array(), TEXT(", "))),
		BtnBad == 0 && Keys.Contains(TEXT("far")) && Keys.Contains(TEXT("good")) && Keys.Contains(TEXT("near")) && Keys.Contains(TEXT("none")) && Keys.Contains(TEXT("far-early")));
	// Boîtes de l'anneau et de la pastille = relevé du navigateur (844 × 390, état far).
	{
		Touch->SetViewCssForTest(FVector2D(844, 390));
		strides::CsoHud& H = Course->HudModel();
		H = strides::CsoHud();
		strides::CsoHudFrame Hf;
		Hf.jumpTiming = strides::Zone::Far;
		H.update(1.0 / 30, Hf);
		Touch->Sync();
		const Sc::FJ S = Sc::Obj(Sc::Obj(Data->CsoJumpStyle()->GetArrayField(TEXT("views"))[0]->AsObject(), TEXT("states")), TEXT("far"));
		const FVector4 R = Touch->JumpPartBox(TEXT("ring")), G = Touch->JumpPartBox(TEXT("sign"));
		TestTrue(FString::Printf(TEXT("état far : anneau (%.1f ; %.1f) %.1f × %.1f, pastille (%.1f ; %.1f) %.1f × %.1f = boîtes relevées (placement)"), R.X, R.Y, R.Z, R.W, G.X, G.Y, G.Z, G.W),
			(R - Sc::Rect(Sc::Obj(S, TEXT("ring")))).Size() < 1e-6 && (G - Sc::Rect(Sc::Obj(S, TEXT("sign")))).Size() < 1e-6 && Touch->JumpLabelText() == TEXT("TROP LOIN"));
		// Majuscules accentuées comme le navigateur (text-transform) : « Trop près » → « TROP PRÈS ».
		H = strides::CsoHud();
		Hf.jumpTiming = strides::Zone::Near;
		H.update(1.0 / 30, Hf);
		Touch->Sync();
		TestTrue(FString::Printf(TEXT("état near : libellé « %s » (TROP PRÈS)"), *Touch->JumpLabelText()), Touch->JumpLabelText() == FString(TEXT("TROP PR\u00C8S")));
		Touch->SetLangForTest(TEXT("en"));
		Touch->Sync();
		TestTrue(FString::Printf(TEXT("libellé anglais de l'état near « %s » (strings_cso.json : Too close)"), *Touch->JumpLabelText()), Touch->JumpLabelText() == TEXT("TOO CLOSE"));
		Touch->SetLangForTest(TEXT("fr"));
	}

	// 4) Épreuve réelle : aides de l'étape de parcours, réglages lus à chaque image, bouton coloré par l'aide du cheval.
	Course->HudModel() = strides::CsoHud();
	if (!TestTrue(TEXT("épreuve relancée"), Course->StartRun(TEXT("Alex"), TEXT("Comète")))) return false;
	const strides::CsoRunConfig& Cfg = Course->Run()->config();
	AStridesHorse* Horse = W.World->SpawnActor<AStridesHorse>();
	Horse->Course = Course;
	Horse->PlaceAt(Cfg.gateX, Cfg.gateZ, Cfg.start.rot, 0);
	// Cavalier en selle (étape « rejoindre l'entrée » validée à cheval), comme Strides.Cso.Controls.
	AStridesPlayerController* PC = W.World->SpawnActor<AStridesPlayerController>();
	AStridesRider* Rider = W.World->SpawnActor<AStridesRider>(Horse->GetActorLocation() + FVector(0, 0, 90), FRotator::ZeroRotator);
	if (!TestTrue(TEXT("cavalier en selle"), PC && Rider && Rider->TryMount(PC) && PC->GetPawn() == Horse)) return false;
	const double Dt = 1.0 / 30;
	for (int32 K = 0; K < 120 && !(Course->CourseAids() && Course->CourseAids()->Active()); K++)
	{
		PC->StepCommands(Dt);
		Horse->Tick(Dt);
	}
	AStridesCourseAids* A = Course->CourseAids();
	if (!TestTrue(TEXT("aides créées à l'étape de parcours"), A && A->Active() && Course->Run()->step() == strides::CsoStep::Course)) return false;
	const strides::CsoObstacle& O1 = Course->Obstacles()[0];
	const strides::CsoAidsView& V0 = A->CoreAids()->view();
	const double G1 = Data->TerrainHeight(O1.x, O1.z);
	TestTrue(FString::Printf(TEXT("avant le départ : tracé %d tirets (de la ligne de départ au 1), repère sur le 1 à %.3f m (sol %.3f + h %.2f + 1,15 ± 0,06), zone masquée (> 26 m)"), A->LineQuads(), V0.markY, G1, O1.h),
		A->IsShown(TEXT("line")) && A->IsShown(TEXT("mark")) && FMath::IsNearlyEqual(V0.markX, O1.x) && FMath::Abs(V0.markY - (G1 + O1.h + 1.15)) <= 0.06 + 1e-9 && !A->IsShown(TEXT("ok")) && !A->IsShown(TEXT("good")));
	// Abord du 1 : cheval posé 9 m devant, dans l'axe, à 6,2 m/s (cadence reprise), quelques images.
	Horse->PlaceAt(O1.x - O1.n.x * 9, O1.z - O1.n.z * 9, O1.rot, 6.2);
	for (int32 K = 0; K < 3; K++) { PC->StepCommands(Dt); Horse->Tick(Dt); }
	const strides::Zone Tm = Horse->JumpTiming();
	const FString K1 = UStridesTouchControls::JumpStyleKey(&Course->HudModel());
	TestTrue(FString::Printf(TEXT("abord du 1 (aide complète) : zone d'appel affichée (ambre %d, verte %d), bouton « %s » = aide du cheval « %s »"), A->IsShown(TEXT("ok")), A->IsShown(TEXT("good")), *K1, UTF8_TO_TCHAR(strides::zoneName(Tm))),
		A->IsShown(TEXT("ok")) && Tm != strides::Zone::None && K1 == UTF8_TO_TCHAR(strides::zoneName(Tm)));
	Course->SetJumpAid(TEXT("button"));
	PC->StepCommands(Dt);
	Horse->Tick(Dt);
	TestTrue(FString::Printf(TEXT("aide « bouton seul » : zone masquée, bouton « %s »"), *UStridesTouchControls::JumpStyleKey(&Course->HudModel())),
		!A->IsShown(TEXT("ok")) && !A->IsShown(TEXT("good")) && UStridesTouchControls::JumpStyleKey(&Course->HudModel()) != TEXT("none"));
	Course->SetJumpAid(TEXT("off"));
	PC->StepCommands(Dt);
	Horse->Tick(Dt);
	TestTrue(TEXT("aide « aucune » : zone masquée, bouton « none » ; tracé et repère gardés"), !A->IsShown(TEXT("ok")) && UStridesTouchControls::JumpStyleKey(&Course->HudModel()) == TEXT("none") && A->IsShown(TEXT("mark")));
	strides::toggleCourseLine(Save->MutableSettings());
	PC->StepCommands(Dt);
	Horse->Tick(Dt);
	TestTrue(TEXT("tracé au sol masqué (courseLine false, sauvegarde) : tracé caché, repère gardé"), !A->IsShown(TEXT("line")) && !A->IsShown(TEXT("after")) && A->IsShown(TEXT("mark")));
	Course->SetJumpAid(TEXT("full"));
	strides::toggleCourseLine(Save->MutableSettings());
	UGameplayStatics::DeleteGameInSlot(TestSlot, 0);
	return true;
}
