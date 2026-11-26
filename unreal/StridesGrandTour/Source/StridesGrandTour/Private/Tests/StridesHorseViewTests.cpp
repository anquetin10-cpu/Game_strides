// Étape S4 de l'essai de monte (voie A) : Strides.Parite.HorseView, vue du cheval du web sur le cheval Unreal, dans le
// moteur sans rendu. Les scénarios de l'oracle vue/ (scripts/unreal/export-rider-rules.mjs --vue : galop et trot en cercle
// à gauche et à droite, grand galop en cercle, sauts à main gauche et à main droite à 6,5, 7,5 et 9 m/s, arrêt, trot enlevé,
// virage) sont rejoués sur le cheval Unreal à la taille du web (EnableWebScale), image par image : repère de l'acteur =
// holder du web, entrées du cheval du jeu web (vitesse, virage lissé, saut, refus, main), obstacle du dernier saut et sol
// relevés dans le web. Deux passes par scénario :
//  - « jeu » : vue du jeu Unreal (mélangeur à couches de l'étape M2 : clip de l'allure de la vitesse joué à vitesse 1 depuis
//    0, saut joué une fois depuis 0, corps immobile) : l'AVANT ;
//  - « web » : vue du web (-StridesHorseView=web, FStridesHorseView) : l'APRÈS.
// Vérifié ici (passe web) : ce qui ne dépend pas de la pose (allure, main, phase, poids et temps des clips, horloge et fondu du
// saut, inclinaison) égal au web à 1e-9 près à chaque image (la logique prouvée par le ctest « monte-vue » est bien celle
// qui pilote le cheval Unreal) ; repère du corps posé sur le maillage ; replis : sabots replis sur la pose réévaluée égaux à
// ceux prévus par la géométrie du web (rotation de l'os d'attache, sens et axe convertis en Unreal) ; nombre de clips.
// Relevé (export -StridesMonteDir=<dossier>/unreal-vue, puis scripts/unreal/horse-view-appuis.py) : os des sabots de chaque
// image dans le repère du cheval et hauteur au-dessus du sol, corps (hauteur, avance, bascule, inclinaison), replis ; les
// posers et levers de chaque pied, comparés au web, sont calculés par le script.
#include "Misc/AutomationTest.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/World.h"
#include "HAL/FileManager.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "StridesCore/MiniJson.h"
#include "StridesHorse.h"
#include "StridesHorseMirror.h"
#include "StridesHorseView.h"
#include "StridesUnits.h"
#include "Animation/AnimSequence.h"
#include "UObject/UObjectGlobals.h"

namespace StridesHorseViewTest
{
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
double Num(const J& j, double D = 0) { return j.isNull() ? D : j.num(); }
strides::hview::V3 V3of(const J& a) { return {a[0].num(), a[1].num(), a[2].num()}; }
FString N9(double V) { return FMath::IsFinite(V) ? FString::Printf(TEXT("%.9f"), V) : TEXT("null"); }
// Holder du web (position, quaternion, monde du web) → repère de l'acteur Unreal.
FTransform ActorOf(const J& H)
{
	const double qx = H[3].num(), qy = H[4].num(), qz = H[5].num(), qw = H[6].num();
	auto Rot = [&](double x, double y, double z) {
		const double tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
		return FVector(x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx);
	};
	auto Map = [](const FVector& W) { return FVector(W.X, W.Z, W.Y); };  // monde du web → Unreal (sans échelle)
	const FMatrix M(Map(Rot(0, 0, 1)), Map(Rot(-1, 0, 0)), Map(Rot(0, 1, 0)), FVector::ZeroVector);
	return FTransform(M.ToQuat(), StridesUnits::WebToUE(H[0].num(), H[1].num(), H[2].num()));
}
strides::hview::Obst ObstOf(const J& lj)
{
	strides::hview::Obst o;
	o.id = 1;
	const J& a = lj["o"];
	o.x = a[0].num(), o.z = a[1].num(), o.nx = a[2].num(), o.nz = a[3].num(), o.tx = a[4].num(), o.tz = a[5].num(), o.w = a[6].num(), o.ground = a[7].num();
	for (const J& b : lj["bars"].a) o.bars.push_back({b[0].num(), b[1].num(), b[2].num() != 0, b[3].num() != 0});
	o.sign = Num(lj["sign"]);
	for (const J& r : lj["rails"].a) o.rails.push_back(r.num());
	for (const J& m : lj["margins"].a) o.margins.push_back(m.num());
	return o;
}
}  // namespace StridesHorseViewTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesHorseViewTest, "Strides.Parite.HorseView", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FStridesHorseViewTest::RunTest(const FString&)
{
	using namespace StridesHorseViewTest;
	FTestWorld W(TEXT("StridesHorseViewTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	AStridesHorse* Horse = W.World->SpawnActor<AStridesHorse>(FVector::ZeroVector, FRotator::ZeroRotator);
	if (!TestNotNull(TEXT("cheval"), Horse)) return false;
	FString Err;
	if (!TestTrue(FString::Printf(TEXT("taille du cheval du web (%s)"), *Err), Horse->EnableWebScale(true, &Err))) return false;
	if (!TestTrue(FString::Printf(TEXT("vue du cheval du web activée (%s)"), *Err), Horse->EnableWebView(&Err))) return false;
	USkeletalMeshComponent* Mesh = Horse->BodyMesh();
	FStridesHorseView* V = Horse->MutableHorseView();
	TestTrue(TEXT("mélangeur à couches"), Cast<UStridesHorseAnimInstance>(Mesh->GetAnimInstance()) != nullptr);
	TestEqual(TEXT("clips du mélangeur : tous ceux du web"), (int32)V->Data().clips.size(), (int32)V->Data().clipOrder.size());
	AddInfo(FString::Printf(TEXT("durées des clips différentes du web : %s"), V->DurationReport().IsEmpty() ? TEXT("aucune") : *V->DurationReport()));
	const double Scale = Mesh->GetRelativeScale3D().X;
	// Clips de la vue retenus par le cheval : un passage du ramasse-miettes ne doit en libérer aucun (plantage constaté en
	// partie jouée avant la correction : clips de virage et d'arrêt libérés puis lus par le mélangeur).
	{
		TArray<const UAnimSequence*> Seqs;
		V->ClipAssets(Seqs);
		TArray<TWeakObjectPtr<const UAnimSequence>> Weak;
		for (const UAnimSequence* S : Seqs) Weak.Add(S);
		CollectGarbage(GARBAGE_COLLECTION_KEEPFLAGS, true);
		int32 Lost = 0;
		for (const TWeakObjectPtr<const UAnimSequence>& Wp : Weak) Lost += !Wp.IsValid();
		TestTrue(FString::Printf(TEXT("clips de la vue retenus après le ramasse-miettes (%d clips, %d libérés)"), Weak.Num(), Lost), Weak.Num() >= 17 && Lost == 0);
		// Étape S5 : les 17 clips importés joués par la vue sont à 24 images/s, cadence de la cuisson du web (f / 24 s) ;
		// Strides.Parite.HorseMirror n'épingle que les 11 sources des miroirs, ce critère épingle les 17.
		int32 N24 = 0;
		FString Off;
		for (const UAnimSequence* S : Seqs)
		{
			const double Fps = S->GetSamplingFrameRate().AsDecimal();
			if (FMath::IsNearlyEqual(Fps, 24.0, 1e-6)) N24++;
			else Off += FString::Printf(TEXT(" %s (%.0f images/s)"), *S->GetName(), Fps);
		}
		TestTrue(FString::Printf(TEXT("clips importés de la vue tous à 24 images/s : %d sur %d%s"), N24, Seqs.Num(), *Off), Seqs.Num() == 17 && N24 == 17);
	}

	const FString Ora = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../core/tests/oracles/monte/vue"));
	FString OutDir;
	if (!FParse::Value(FCommandLine::Get(), TEXT("StridesMonteDir="), OutDir)) OutDir = FPaths::ProjectSavedDir() / TEXT("StridesMonte");
	OutDir = FPaths::ConvertRelativePathToFull(OutDir / TEXT("unreal-vue"));
	IFileManager::Get().MakeDirectory(*OutDir, true);
	J Idx;
	try
	{
		Idx = loadJson(TCHAR_TO_UTF8(*(Ora / TEXT("index.json"))));
	}
	catch (const std::exception& Ex)
	{
		AddError(FString::Printf(TEXT("oracle vue/ illisible : %hs"), Ex.what()));
		return false;
	}
	FString Index = FString::Printf(TEXT("{\"schema\":\"strides.monte.vue_unreal/1\",\"generator\":\"Strides.Parite.HorseView\",\"meshScale\":%.9g,\"runs\":["), Scale);
	int32 Frames = 0, LogicBad = 0, TuckFrames = 0, Runs = 0, CostN = 0;
	double LogicWorst = 0, TuckWorst = 0, CostSum = 0, CostMax = 0, HoofGround = 0, HoofCanter = 0, HoofGallop = 0;
	FString LogicWhere, TuckWhere, HoofGroundWhere, HoofCanterWhere, HoofGallopWhere;
	FStridesHorseViewTestHooks Hooks;
	Horse->SetViewTestHooks(&Hooks);
	for (const J& RunE : Idx["runs"].a)
	{
		const FString Id = UTF8_TO_TCHAR(RunE["id"].s.c_str());
		J Run;
		try
		{
			Run = loadJson(TCHAR_TO_UTF8(*(Ora / Id + TEXT(".json"))));
		}
		catch (const std::exception& Ex)
		{
			AddError(FString::Printf(TEXT("%s illisible : %hs"), *Id, Ex.what()));
			continue;
		}
		std::vector<const J*> Recs = {&Run["setup"]["vue0"]};
		for (const J& F : Run["frames"].a) Recs.push_back(&F["vu"]);
		FString Out = FString::Printf(TEXT("{\"id\":\"%s\",\"frames\":["), *Id);
		for (const bool bWeb : {false, true})
		{
			Horse->SetWebViewActiveForTests(bWeb);
			Horse->ResetWebLeadForTests();
			for (size_t I = 0; I < Recs.size(); I++)
			{
				const J& R = *Recs[I];
				const double Dt = R["dt"].num();
				const J& Sn = R["sn"]["in"];
				const J& St = R["loco"]["st"];
				const J& H = I == 0 ? (*Recs[1])["H"] : R["H"];
				// Entrées du cheval du jeu web (pjlHorse.js _snapshot, horse/anim.js), obstacle, sol.
				Hooks.In = FStridesHorseView::FInputs();
				Hooks.In.Dt = Dt;
				Hooks.In.Speed = Sn["speed"].num();
				Hooks.In.AnimSpeed = St["speed"].num();
				Hooks.In.JumpT = Sn["jumpT"].num();
				Hooks.In.JumpDur = Num(Sn["jumpDur"]);
				Hooks.In.Brake = Num(Sn["brake"]);
				Hooks.In.RearT = Num(Sn["rearT"]);
				Hooks.In.RearAnim = St["rear"].num();
				Hooks.In.LastTurn = Num(Sn["lastTurn"]);
				Hooks.In.ForcedLead = St["lead"].isNull() ? 0 : (int32)St["lead"].num();
				// Vitesse de la passe « jeu » (étape M2) : vélocité du web au relevé (Hooks.In.Speed).
				Hooks.Ob = FStridesHorseView::FObstacle();
				if (R["bar"]["near"].b)
				{
					Hooks.Ob.bNear = true;
					Hooks.Ob.O = ObstOf(R["bar"]["lj"]);
					Hooks.Ob.Time = R["bar"]["lj"]["t"].num();
				}
				Hooks.Ground = H[7].num();
				const FTransform Xf = ActorOf(H);
				Horse->SetActorTransform(Xf);
				if (!bWeb)
				{
					// Vue du jeu (étape M2) : allure de la vitesse (seuils de TickCso), saut en cours, virage lissé du web.
					const double Spd = Hooks.In.Speed;
					Horse->SpeedMS = (float)Spd;
					Horse->GaitIndex = Spd < 0.2 ? 0 : Spd < 3.2 ? 1 : Spd < 5.5 ? 2 : Spd < 7.0 ? 3 : 4;
					Horse->SetJumpingForTests(Hooks.In.JumpT >= 0);
					Horse->SetTurnForTests(Hooks.In.LastTurn);
				}
				Horse->StepAnimation(Dt);
				Mesh->TickAnimation(0.f, false);
				Mesh->RefreshBoneTransforms();
				if (bWeb) Horse->PostPoseView();
				const TArray<FTransform>& CS = Mesh->GetComponentSpaceTransforms();
				const int32* HB = V->HoofBones();
				FString Hoof = TEXT("[");
				for (int32 K = 0; K < 4; K++)
				{
					const FVector Wd = Mesh->GetComponentTransform().TransformPosition(CS[HB[K]].GetLocation());
					double Wx, Wy, Wz;
					StridesUnits::UEToWeb(Wd, Wx, Wy, Wz);
					const FVector L = Xf.InverseTransformPositionNoScale(Wd);
					// Sabots dans le repère du cheval contre ceux du web, même image (passe web) : au sol, au saut sur jump_canter
					// et sur jump_gallop (tous deux importés à 24 images/s depuis l'étape S5 ; jump_gallop, à 30 images/s
					// avant, était relevé à part : 19,81 cm).
					if (bWeb)
					{
						const J& Wh = R["hoof"][K];
						const double D = FMath::Sqrt(FMath::Square(-L.Y / 100.0 - Wh[4].num()) + FMath::Square(L.Z / 100.0 - Wh[5].num()) + FMath::Square(L.X / 100.0 - Wh[6].num()));
						const bool bAir = Hooks.In.JumpT >= 0 || R["view"]["jw"].num() > 0.01;
						const bool bGallop = !R["view"]["jc"].isNull() && R["view"]["jc"].s == "jump_gallop";
						double& Wst = !bAir ? HoofGround : bGallop ? HoofGallop : HoofCanter;
						FString& Wwh = !bAir ? HoofGroundWhere : bGallop ? HoofGallopWhere : HoofCanterWhere;
						if (I > 0 && D > Wst) Wst = D, Wwh = FString::Printf(TEXT("%s image %d sabot %d"), *Id, (int32)I - 1, K);
					}
					Hoof += FString::Printf(TEXT("%s[%s,%s,%s,%s]"), K ? TEXT(",") : TEXT(""), *N9(-L.Y / 100.0), *N9(L.Z / 100.0), *N9(L.X / 100.0), *N9(Wy - Hooks.Ground));
				}
				Hoof += TEXT("]");
				FString Extra;
				if (bWeb)
				{
					const strides::hview::ViewState& Vs = V->GetView();
					// Ce qui ne dépend pas de la pose : égal au web.
					const J& Wv = R["view"];
					double E = 0;
					FString Where;
					auto See = [&](double A, double B, const TCHAR* What) {
						const double D = FMath::Abs(A - B);
						if (D > E) E = D, Where = What;
					};
					See(Vs.jumpTime, Wv["jt"].num(), TEXT("jumpTime"));
					See(Vs.jumpWeight, Wv["jw"].num(), TEXT("jumpWeight"));
					See(Vs.postLand, Wv["pl"].num(), TEXT("postLand"));
					See(Vs.leadBlend, Wv["lb"].num(), TEXT("leadBlend"));
					See(Vs.rotZ, Wv["rz"].num(), TEXT("rotation.z"));
					See(V->GetSnap().phase, R["sn"]["s"]["phase"].num(), TEXT("phase de la vue"));
					See(V->AnimPhase(), R["sn"]["phaseOut"].num(), TEXT("h.anim.phase"));
					See(V->GetLoco().move, R["loco"]["A"]["move"].num(), TEXT("A.move"));
					for (const J& Ent : Wv["w"].a)
					{
						const auto It = Vs.weights.find(Ent[0].s);
						See(It == Vs.weights.end() ? 1e9 : It->second, Ent[1].num(), TEXT("poids"));
						if (Ent[3].num() != 0 && It != Vs.weights.end()) See(Vs.times.at(Ent[0].s), Ent[2].num(), TEXT("temps de clip"));
					}
					const bool bGait = V->GetLoco().gait == R["loco"]["A"]["gait"].s && V->GetSnap().mode == R["sn"]["s"]["mode"].s && Vs.jumpClip == (Wv["jc"].isNull() ? std::string() : Wv["jc"].s);
					if (!bGait) E = 1e9, Where = TEXT("allure, mode ou clip de saut");
					if (E > 1e-9) LogicBad++;
					if (E > LogicWorst) LogicWorst = E, LogicWhere = FString::Printf(TEXT("%s image %d : %s"), *Id, (int32)I - 1, *Where);
					// Replis : pose réévaluée = géométrie prévue.
					if (V->LastTucked())
					{
						TuckFrames++;
						for (int32 K = 0; K < 4; K++)
						{
							double Px, Py, Pz;
							StridesUnits::UEToWeb(V->CompAtTuck().TransformPosition(CS[HB[K]].GetLocation()), Px, Py, Pz);
							const strides::hview::V3 T = V->TuckedToes()[K];
							const double D = FMath::Sqrt(FMath::Square(Px - T.x) + FMath::Square(Py - T.y) + FMath::Square(Pz - T.z));
							if (D > TuckWorst) TuckWorst = D, TuckWhere = FString::Printf(TEXT("%s image %d sabot %d"), *Id, (int32)I - 1, K);
						}
					}
					const strides::hview::TuckState& Tk = V->GetTuck();
					CostSum += V->LastCostMs();
					CostN++;
					CostMax = FMath::Max(CostMax, V->LastCostMs());
					Extra = FString::Printf(TEXT(",\"body\":[%s,%s,%s,%s],\"co\":%s,\"tuck\":[%s,%s,%s,%s],\"jt\":%s,\"jw\":%s"), *N9(Vs.bodyY), *N9(Vs.bodyZ), *N9(Vs.rotX),
						*N9(Vs.rotZ), *N9(Vs.contactOff), *N9(Tk.a[0]), *N9(Tk.a[1]), *N9(Tk.a[2]), *N9(Tk.a[3]), *N9(Vs.jumpTime), *N9(Vs.jumpWeight));
				}
				if (I > 0)
				{
					Out += FString::Printf(TEXT("%s{\"f\":%d,\"m\":\"%s\",\"hoof\":%s%s}"), Frames ? TEXT(",\n") : TEXT("\n"), (int32)I - 1, bWeb ? TEXT("web") : TEXT("jeu"), *Hoof, *Extra);
					Frames++;
				}
			}
		}
		Out += TEXT("]}\n");
		FFileHelper::SaveStringToFile(Out, *(OutDir / Id + TEXT(".json")), FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
		Index += FString::Printf(TEXT("%s{\"id\":\"%s\",\"file\":\"%s.json\"}"), Runs ? TEXT(",") : TEXT(""), *Id, *Id);
		Runs++;
		Frames = 0;
	}
	Horse->SetViewTestHooks(nullptr);
	FFileHelper::SaveStringToFile(Index + TEXT("]}\n"), *(OutDir / TEXT("index.json")), FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
	AddInfo(FString::Printf(TEXT("%d scénarios ; logique hors tolérance : %d images (plus grand écart %.3g, %s) ; replis : %d images, plus grand écart %.4f cm (%s)"), Runs, LogicBad,
		LogicWorst, *LogicWhere, TuckFrames, TuckWorst * 100, *TuckWhere));
	TestTrue(FString::Printf(TEXT("%d scénarios rejoués (au moins 17)"), Runs), Runs >= 17);
	TestTrue(FString::Printf(TEXT("vue du web sur le cheval Unreal : allure, main, phase, poids et temps des clips, horloge du saut, inclinaison égaux au web (images hors tolérance %d, plus grand écart %.3g, %s)"),
		LogicBad, LogicWorst, *LogicWhere), LogicBad == 0);
	TestTrue(FString::Printf(TEXT("replis : %d images, sabots de la pose réévaluée à %.3f cm au plus de la géométrie du web (%s ; seuil 0,5 cm)"), TuckFrames, TuckWorst * 100, *TuckWhere),
		TuckFrames > 0 && TuckWorst <= 0.005);
	const FString HoofMsg = FString::Printf(TEXT("sabots du cheval Unreal dans le repère du cheval, même image que le web : au sol %.2f cm au plus (%s), au saut sur jump_canter %.2f cm (%s), au saut sur jump_gallop %.2f cm (%s) ; seuil 4 cm"),
		HoofGround * 100, *HoofGroundWhere, HoofCanter * 100, *HoofCanterWhere, HoofGallop * 100, *HoofGallopWhere);
	AddInfo(HoofMsg);
	TestTrue(HoofMsg, HoofGround > 0 && HoofGround <= 0.04 && HoofCanter <= 0.04 && HoofGallop > 0 && HoofGallop <= 0.04);
	AddInfo(FString::Printf(TEXT("coût de la vue (avant et après la pose, hors réévaluation) : moyenne %.4f ms, au plus %.4f ms"), CostSum / FMath::Max(1, CostN), CostMax));
	AddInfo(FString::Printf(TEXT("export : %s"), *OutDir));
	return true;
}
