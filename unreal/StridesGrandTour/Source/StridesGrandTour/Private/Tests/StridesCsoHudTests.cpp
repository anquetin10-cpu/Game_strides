// Interface d'épreuve (tranche T7, unreal/docs/parite/cso-ecarts.md §4) dans le moteur :
//  - Strides.Parite.CsoHud : miroir de unreal/core/tests/test_core.cpp (testCsoHud) par le module de jeu — les 152
//    rejeux de unreal/core/tests/oracles/cso_hud.json (HUD du jeu web rejouant les appels hud.* des exécutions de
//    cso_runs/ et une séquence synthétique, horloge virtuelle) refaits par strides::CsoHud avec StridesCsoHudReplay (même
//    règle que les poses de captures) ; masquages de hud_cso_style.json (csoHudMasked), HUD de débogage
//    (AStridesHUD::DebugVisible) et boutons tactiles (UStridesTouchControls::ButtonVisible) selon les classes ;
//  - Strides.Cso.HudWidget : UStridesCsoHud construit dans un monde de test, alimenté par l'état rejoué de poses du banc
//    (t4-cloche, t4-arrivee-barre, t7-parfait-barre-2 : « Appel parfait » puis « Barre au 2 · +4 · … », droit) : textes
//    affichés (tableau, grand message, toast, mot d'appel, crans) égaux à l'oracle caractère pour caractère, éléments
//    masqués absents ; toast affiché restylé au changement de viewport (844 × 390 puis 667 × 308 = 667 × 308 d'emblée).
#include "Misc/AutomationTest.h"
#include "Blueprint/UserWidget.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "StridesCore/CsoHud.h"
#include "StridesCore/MiniJson.h"
#include "StridesCsoHud.h"
#include "StridesCsoHudReplay.h"
#include "StridesDataSubsystem.h"
#include "StridesHUD.h"
#include "StridesTouchControls.h"
#include "StridesOracleRuns.h"

namespace StridesHudTest
{
J LoadCore(const FString& Path)
{
	FString Text;
	if (!FFileHelper::LoadFileToString(Text, *Path)) return J();
	const std::string Utf8 = TCHAR_TO_UTF8(*Text);
	return JParser(Utf8).parse();
}
FString Oracles() { return FPaths::GetPath(StridesOracleRuns::Dir()); }

bool PartSame(const std::string& K, const J& W, const strides::CsoHud& H)
{
	if (K == "to")
	{
		if (W.a.size() != H.toasts().size()) return false;
		for (size_t I = 0; I < H.toasts().size(); I++)
			if (W[I][0].s != H.toasts()[I].text || W[I][1].s != H.toasts()[I].kind) return false;
		return true;
	}
	if (K == "hi") return W[0].b == H.hintOff() && W[1].s == H.hintHtml() && W[2].b == H.hintInline();
	if (K == "bg") return W[0].b == H.bigHidden() && W[1].s == H.bigTitle() && W[2].s == H.bigSub() && W[3].b == H.bigOn();
	if (K == "fb") return W[0].s == H.fbText() && W[1].s == H.fbClass();
	if (K == "cad") return (int)W[0].num() == H.cadOn() && W[1].b == H.cadShow();
	if (K == "bd") return W[0].b == H.boardHidden() && W[1].b == H.boardOver() && W[2].b == H.boardFaults();
	if (K == "cl") return W[0].b == H.csoOn() && W[1].b == H.csoCtl() && W[2].b == H.csoSober();
	if (K == "ob") return W.b == H.objectiveOff();
	return false;
}

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
}  // namespace StridesHudTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesPariteCsoHudTest, "Strides.Parite.CsoHud", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesPariteCsoHudTest::RunTest(const FString&)
{
	using namespace StridesHudTest;
	const J O = LoadCore(Oracles() / TEXT("cso_hud.json"));
	if (!TestTrue(TEXT("cso_hud.json lu"), O["schema"].s == "strides.oracle.cso_hud/1")) return false;
	std::string Loaded;
	J RunJ;
	int32 Replays = 0, Frames = 0, Bad = 0, MaxToasts = 0;
	for (const J& Rp : O["replays"].a)
	{
		const bool bSynth = !Rp["inputs"].isNull();
		if (!bSynth)
		{
			const std::string File = Rp["id"].s + "." + Rp["lang"].s + ".json";
			if (File != Loaded)
			{
				RunJ = LoadCore(StridesOracleRuns::Dir() / UTF8_TO_TCHAR(File.c_str()));
				Loaded = File;
			}
		}
		strides::CsoHud H;
		H.setViewportHeight(Rp["vh"].num());
		const J& Fr = bSynth ? Rp["inputs"]["frames"] : RunJ["frames"];
		StridesCsoHudReplay::Calls(H, bSynth ? Rp["inputs"]["setup"] : RunJ["setup"]["calls"]["hud"]);
		std::map<std::string, J> Want;
		size_t Si = 0;
		int32 RunBad = 0;
		auto Compare = [&](int F)
		{
			const J& Snaps = Rp["snaps"];
			for (; Si < Snaps.a.size() && (int)Snaps[Si][0].num() == F; Si++)
				for (const auto& Kv : Snaps[Si][1].o)
				{
					Want[Kv.first] = Kv.second;
					if (Kv.first == "to") MaxToasts = FMath::Max(MaxToasts, (int32)Kv.second.a.size());
				}
			for (const auto& Kv : Want)
				if (!PartSame(Kv.first, Kv.second, H) && ++RunBad < 4)
					AddError(FString::Printf(TEXT("%hs (%hs, %d px) image %d : partie %hs différente du web"), Rp["id"].s.c_str(), Rp["lang"].s.c_str(), (int)Rp["vh"].num(), F, Kv.first.c_str()));
		};
		Compare(-1);
		for (size_t K = 0; K < Fr.a.size(); K++)
		{
			StridesCsoHudReplay::Frame(H, Fr[K], bSynth);
			Compare((int)K);
			Frames++;
		}
		Bad += RunBad;
		Replays++;
	}
	TestEqual(TEXT("écarts au HUD du jeu web"), Bad, 0);
	TestTrue(FString::Printf(TEXT("%d rejeux, deux toasts simultanés relevés (max %d)"), Replays, MaxToasts), Replays > 100 && MaxToasts == 2);

	// Masquages relevés par le navigateur, puis HUD de débogage et boutons tactiles sous les classes d'épreuve.
	const J St = LoadCore(FPaths::ProjectContentDir() / TEXT("Data/hud_cso_style.json"));
	const J& Mk = St["masks"];
	int32 MaskN = 0, MaskBad = 0;
	for (const J& Combo : Mk["combos"].a)
	{
		const std::string C = " " + Combo.s + " ";
		const bool bCtl = C.find(" cso-ctl ") != std::string::npos, bSober = C.find(" cso-sober ") != std::string::npos, bOn = C.find(" cso-on ") != std::string::npos, bBig = C.find(" big-on ") != std::string::npos;
		for (const J& En : Mk["elements"].a)
		{
			const J& V = Mk["table"][Combo.s][En.s];
			const bool bVis = V[0].s != "none" && V[1].num() > 0;
			for (int32 E = 0; E < (int32)strides::CsoHudElement::Count; E++)
				if (En.s == strides::csoHudElementName((strides::CsoHudElement)E))
				{
					MaskN++;
					if (strides::csoHudMasked((strides::CsoHudElement)E, bCtl, bSober, bOn, bBig) == bVis && ++MaskBad < 4)
						AddError(FString::Printf(TEXT("masquage de %hs sous « %hs » différent du web"), En.s.c_str(), Combo.s.c_str()));
				}
		}
	}
	TestTrue(FString::Printf(TEXT("masquages : %d cas, %d écarts"), MaskN, MaskBad), MaskN > 100 && MaskBad == 0);
	strides::CsoHud Race;
	strides::CsoHudFrame F;
	F.course = F.controlsCso = F.kindCso = F.board = true;
	Race.update(1.0 / 30, F);
	TestFalse(TEXT("épreuve : HUD de débogage (minicarte, lignes) masqué"), AStridesHUD::DebugVisible(&Race));
	const strides::CsoHud Idle;
	TestTrue(TEXT("hors épreuve : HUD de débogage affiché"), AStridesHUD::DebugVisible(nullptr) && AStridesHUD::DebugVisible(&Idle));
	const TCHAR* Names[] = {TEXT("Jump"), TEXT("Interact"), TEXT("GaitUp"), TEXT("GaitDown"), TEXT("Save"), TEXT("Load"), TEXT("Phone"), TEXT("Mission")};
	TArray<FString> InRace;
	for (const TCHAR* N : Names)
		if (UStridesTouchControls::ButtonVisible(N, &Race)) InRace.Add(N);
	TestTrue(FString::Printf(TEXT("épreuve : boutons tactiles visibles « %s » (SAUT seul)"), *FString::Join(InRace, TEXT(", "))), InRace == TArray<FString>{TEXT("Jump")});
	const FString Info = FString::Printf(TEXT("HUD d'épreuve dans le module : %d rejeux, %d images, %d écarts ; %d masquages, %d écarts"), Replays, Frames, Bad, MaskN, MaskBad);
	AddInfo(Info);
	UE_LOG(LogTemp, Display, TEXT("Strides.Parite.CsoHud : %s"), *Info);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesCsoHudWidgetTest, "Strides.Cso.HudWidget", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesCsoHudWidgetTest::RunTest(const FString&)
{
	using namespace StridesHudTest;
	FTestWorld W(TEXT("StridesCsoHudWidgetTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	if (!TestTrue(TEXT("styles du HUD (hud_cso_style.json) lus"), Data && Data->CsoHudStyle().IsValid())) return false;
	UStridesCsoHud* Widget = CreateWidget<UStridesCsoHud>(W.World, UStridesCsoHud::StaticClass());
	if (!TestNotNull(TEXT("widget UStridesCsoHud"), Widget)) return false;
	// États rejoués jusqu'à une image de l'oracle (comme les poses de captures) ; textes attendus pris dans l'oracle.
	// FbAt : image visée prise au premier mot d'appel égal à Fb (sinon au grand message ou au toast).
	struct FCase { const TCHAR* Run; const char* BigTitle; const char* Toast; const char* Fb; bool bCad; bool bFbAt = false; };
	const FCase Cases[] = {
		{TEXT("t4-cloche.fr.json"), "CLOCHE", nullptr, nullptr, false},
		{TEXT("t4-arrivee-barre.fr.json"), nullptr, "Barre au 1", "Appel trop loin", false},
		{TEXT("t7-parfait-barre-2.fr.json"), nullptr, nullptr, "Appel parfait", false, true},
		{TEXT("t7-parfait-barre-2.fr.json"), nullptr, "Barre au 2 · +4 · ", "Appel trop loin", false},
		{TEXT("droit.fr.json"), nullptr, nullptr, nullptr, true},
	};
	for (const FCase& C : Cases)
	{
		const J R = LoadCore(StridesOracleRuns::Dir() / C.Run);
		if (!TestTrue(FString::Printf(TEXT("%s lu"), C.Run), R["frames"].t == J::Arr)) continue;
		// Image visée : 21 images après le premier appel attendu (grand message, toast), ou dernier réglage de cadence.
		int32 Target = -1;
		for (const J& F : R["frames"].a)
		{
			const int32 Fi = (int32)F["f"].num();
			if (C.bCad && !F["ch"]["s"].isNull() && !F["ch"]["s"]["ca"].isNull() && F["ch"]["s"]["ca"].b && !F["board"].isNull()) Target = Fi + 9;
			for (const J& Hc : F["hud"].a)
				if (Target < 0 && ((C.BigTitle && Hc["fn"].s == "big" && Hc["args"][0].s == C.BigTitle) || (C.Toast && Hc["fn"].s == "toast" && Hc["args"][0].s.rfind(C.Toast, 0) == 0) ||
					(C.bFbAt && Hc["fn"].s == "jumpFeedback" && Hc["args"][0].s == C.Fb))) Target = Fi + 21;
		}
		if (!TestTrue(FString::Printf(TEXT("%s : image visée trouvée"), C.Run), Target >= 0)) continue;
		strides::CsoHud H;
		H.setViewportHeight(390);
		StridesCsoHudReplay::Run(H, R, Target);
		Widget->SetFrozen(&H);
		Widget->Refresh(H, FVector2D(844, 390));
		const TArray<FString> Shown = Widget->Describe();
		const FString All = FString::Join(Shown, TEXT(" ; "));
		const J& Board = R["frames"][(size_t)Target]["board"];
		const FString WantBoard = FString::Printf(TEXT("board=%hs|%hs|%hs|%hs"), Board["txt"][0].s.c_str(), Board["txt"][1].s.c_str(), Board["txt"][2].s.c_str(), Board["txt"][3].s.c_str());
		TestTrue(FString::Printf(TEXT("%s image %d : tableau affiché « %s » (attendu « %s »)"), C.Run, Target, *All, *WantBoard), Shown.Contains(WantBoard));
		if (C.BigTitle) TestTrue(FString::Printf(TEXT("%s : grand message « %s »"), C.Run, *All), Shown.ContainsByPredicate([&](const FString& L) { return L.StartsWith(FString(TEXT("big=")) + UTF8_TO_TCHAR(C.BigTitle) + TEXT("|")); }) && H.bigTitle() == C.BigTitle);
		else TestFalse(FString::Printf(TEXT("%s : pas de grand message"), C.Run), All.Contains(TEXT("big=")));
		if (C.Toast)
		{
			const FString Want = FString(TEXT("toast=")) + UTF8_TO_TCHAR(H.toasts().empty() ? "" : H.toasts()[0].text.c_str());
			TestTrue(FString::Printf(TEXT("%s : toast « %s »"), C.Run, *All), !H.toasts().empty() && Shown.Contains(Want) && H.toasts()[0].text.rfind(C.Toast, 0) == 0);
		}
		if (C.Fb) TestTrue(FString::Printf(TEXT("%s : mot d'appel « %s »"), C.Run, *All), Shown.Contains(FString(TEXT("fb=")) + UTF8_TO_TCHAR(C.Fb)));
		if (C.bCad) TestTrue(FString::Printf(TEXT("%s : crans de cadence affichés « %s »"), C.Run, *All), H.cadShow() && Shown.Contains(FString::Printf(TEXT("cad=%d"), H.cadOn())));
		TestFalse(FString::Printf(TEXT("%s : horloge du tableau masquée (cso-sober)"), C.Run), Shown.Contains(TEXT("clock")));
		if (!C.Toast) TestFalse(FString::Printf(TEXT("%s : pas de toast"), C.Run), All.Contains(TEXT("toast=")));
		AddInfo(FString::Printf(TEXT("%s image %d : %s"), C.Run, Target, *All));
		UE_LOG(LogTemp, Display, TEXT("Strides.Cso.HudWidget : %s image %d : %s"), C.Run, Target, *All);
		// Toast affiché, puis changement de viewport (rotation, redimensionnement) : le toast prend le style du nouveau
		// viewport, comme un widget qui l'affiche d'emblée à cette taille (captures reproductibles pose par pose).
		if (C.Toast && !H.toasts().empty())
		{
			Widget->Refresh(H, FVector2D(667, 308));
			UStridesCsoHud* Fresh = CreateWidget<UStridesCsoHud>(W.World, UStridesCsoHud::StaticClass());
			Fresh->SetFrozen(&H);
			Fresh->Refresh(H, FVector2D(667, 308));
			const FString After = Widget->ToastStyle(0), Direct = Fresh->ToastStyle(0);
			Widget->Refresh(H, FVector2D(844, 390));
			const FString Back = Widget->ToastStyle(0);
			TestTrue(FString::Printf(TEXT("%s : toast restylé en 667 × 308 « %s » = affiché d'emblée « %s » ; en 844 × 390 « %s »"), C.Run, *After, *Direct, *Back),
				!After.IsEmpty() && After == Direct && After != Back);
			Fresh->SetFrozen(nullptr);
		}
	}
	Widget->SetFrozen(nullptr);
	return true;
}
