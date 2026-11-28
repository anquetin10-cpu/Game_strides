// Jalon J5 « Finition et performance » : profil mobile (profils d'appareils iOS du jeu, verrou à 30 i/s), mise en page
// des commandes tactiles sur les formats d'iPhone et d'iPad (zones sûres comprises), manette (pause, téléphone, allures).
#include "Misc/AutomationTest.h"
#include "Blueprint/UserWidget.h"
#include "DeviceProfiles/DeviceProfile.h"
#include "DeviceProfiles/DeviceProfileManager.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/ConfigCacheIni.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/SaveGame.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesPlayerController.h"
#include "StridesRider.h"
#include "StridesSaveSubsystem.h"
#include "StridesTouchControls.h"

namespace StridesMobileTest
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
bool Overlap(const FVector4& A, const FVector4& B)
{
	return A.X < B.X + B.Z && B.X < A.X + A.Z && A.Y < B.Y + B.W && B.Y < A.Y + A.W;
}
}  // namespace StridesMobileTest

// Profils d'appareils (DefaultDeviceProfiles.ini) : les iPhone et iPad récents, qui héritent d'IOS_Epic ou d'IOS_High dans
// le moteur, reçoivent le réglage « Strides mobile » ; verrou à 30 i/s (DefaultEngine.ini, FrameRateLock).
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesMobileDeviceProfilesTest, "Strides.Mobile.DeviceProfiles", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FStridesMobileDeviceProfilesTest::RunTest(const FString&)
{
	UDeviceProfileManager& Mgr = UDeviceProfileManager::Get();
	const TMap<FString, FString> Want = {
		{TEXT("r.MobileContentScaleFactor"), TEXT("1.5")}, {TEXT("sg.ViewDistanceQuality"), TEXT("1")}, {TEXT("sg.ShadowQuality"), TEXT("1")},
		{TEXT("sg.PostProcessQuality"), TEXT("1")}, {TEXT("sg.EffectsQuality"), TEXT("1")}, {TEXT("sg.FoliageQuality"), TEXT("1")},
		{TEXT("sg.TextureQuality"), TEXT("2")}, {TEXT("r.ViewDistanceScale"), TEXT("0.8")}, {TEXT("r.Shadow.CSM.MaxMobileCascades"), TEXT("1")},
		{TEXT("r.Shadow.DistanceScale"), TEXT("0.7")}};
	for (const TCHAR* Name : {TEXT("iPhone15Pro"), TEXT("iPhone16"), TEXT("iPhone17Pro"), TEXT("iPhone18ProMax"), TEXT("IOS_High")})
	{
		UDeviceProfile* P = Mgr.FindProfile(Name, false);
		if (!TestNotNull(FString::Printf(TEXT("profil %s"), Name), P)) continue;
		TArray<FString> Got, Bad;
		for (const TPair<FString, FString>& W : Want)
		{
			FString V;
			const bool bHas = P->GetConsolidatedCVarValue(*W.Key, V);
			Got.Add(W.Key + TEXT("=") + (bHas ? V : FString(TEXT("?"))));
			if (!bHas || FCString::Atod(*V) != FCString::Atod(*W.Value)) Bad.Add(W.Key);
		}
		AddInfo(FString::Printf(TEXT("%s : %s"), Name, *FString::Join(Got, TEXT(", "))));
		TestTrue(FString::Printf(TEXT("%s : réglage Strides mobile (écarts : %s)"), Name, *FString::Join(Bad, TEXT(", "))), Bad.Num() == 0);
	}
	// Le profil Epic d'origine (2x, ombres et post-traitement au maximum) n'atteint plus aucun iPhone récent.
	if (UDeviceProfile* P = Mgr.FindProfile(TEXT("iPhone15Pro"), false))
	{
		int32 Scale2 = 0;
		P->ForEachConsolidatedCVar([&](const FString& K, const FString& V) { Scale2 += K == TEXT("r.MobileContentScaleFactor") && FCString::Atod(*V) == 2.0; return true; });
		TestEqual(TEXT("iPhone15Pro : plus de r.MobileContentScaleFactor=2"), Scale2, 0);
	}
	FString Lock;
	GConfig->GetString(TEXT("/Script/IOSRuntimeSettings.IOSRuntimeSettings"), TEXT("FrameRateLock"), Lock, GEngineIni);
	TestEqual(TEXT("iOS : verrou à 30 images par seconde"), Lock, FString(TEXT("PUFRL_30")));
	return true;
}

// Commandes tactiles sur les formats d'iPhone et d'iPad (points d'écran = px CSS du web), à pied, à cheval hors épreuve et
// en épreuve, avec les zones sûres d'un iPhone à îlot dynamique en paysage (59 pt à gauche et à droite, 21 pt en bas ;
// valeurs d'iOS à confirmer sur appareil) et d'un iPad (24 pt en haut, 20 pt en bas) : tous les boutons visibles dans
// l'écran et hors des zones sûres, sans chevauchement entre eux ni avec le joystick au repos, d'au moins 44 pt de côté
// (taille minimale d'une cible tactile chez Apple).
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesMobileTouchLayoutTest, "Strides.Mobile.TouchLayout", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesMobileTouchLayoutTest::RunTest(const FString&)
{
	using namespace StridesMobileTest;
	FTestWorld W(TEXT("StridesMobileTouchLayout"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	if (!TestTrue(TEXT("styles des commandes"), Data && Data->CsoControlsStyle().IsValid())) return false;
	UStridesTouchControls* Touch = CreateWidget<UStridesTouchControls>(W.World, UStridesTouchControls::StaticClass());
	if (!TestNotNull(TEXT("widget des commandes"), Touch)) return false;
	const strides::CsoInput Cmd;
	struct FFormat { const TCHAR* Name; FVector2D View; FMargin Safe; };
	const TArray<FFormat> Formats = {
		{TEXT("iPhone 15 / 16 (844 × 390)"), FVector2D(844, 390), FMargin(59, 0, 59, 21)},
		{TEXT("iPhone Pro Max (932 × 430)"), FVector2D(932, 430), FMargin(59, 0, 59, 21)},
		{TEXT("iPhone SE (667 × 375)"), FVector2D(667, 375), FMargin(0, 0, 0, 0)},
		{TEXT("iPad mini (1133 × 744)"), FVector2D(1133, 744), FMargin(0, 24, 0, 20)},
		{TEXT("iPad Air 11 (1180 × 820)"), FVector2D(1180, 820), FMargin(0, 24, 0, 20)},
		{TEXT("iPad Pro 13 (1376 × 1032)"), FVector2D(1376, 1032), FMargin(0, 24, 0, 20)},
	};
	Touch->SetTouchMode(true);
	int32 Cases = 0;
	for (const FFormat& F : Formats)
		for (int32 Riding = 0; Riding < 2; ++Riding)
		{
			Touch->SetCommandsForTest(&Cmd, Riding == 1);
			Touch->SetViewCssForTest(F.View);
			Touch->SetSafeInsetsForTest(F.Safe);
			Touch->Sync();
			const TMap<FString, FVector4> Boxes = Touch->VisibleButtonBoxes();
			const FVector4 Joy = Touch->BoxOf(TEXT("Joystick"));
			const double L = F.Safe.Left, T = F.Safe.Top, R = F.View.X - F.Safe.Right, B = F.View.Y - F.Safe.Bottom;
			TArray<FString> Bad, Desc;
			TArray<FString> Names;
			Boxes.GetKeys(Names);
			// SAUVER, CHARGER et MISSION : outils du portage, ni construits ni visibles en Shipping (jalon J3) ; hors du contrôle.
			Names.RemoveAll([](const FString& N) { return N == TEXT("Save") || N == TEXT("Load") || N == TEXT("Mission"); });
			for (const FString& N : Names)
			{
				const FVector4& X = Boxes[N];
				Desc.Add(FString::Printf(TEXT("%s (%.0f ; %.0f) %.0f × %.0f"), *N, X.X, X.Y, X.Z, X.W));
				if (X.X < L - 1e-3 || X.Y < T - 1e-3 || X.X + X.Z > R + 1e-3 || X.Y + X.W > B + 1e-3) Bad.Add(N + TEXT(" hors zone sûre"));
				if (FMath::Min(X.Z, X.W) < 44 - 1e-3) Bad.Add(N + TEXT(" sous 44 pt"));
				if (Joy.Z > 0 && Overlap(X, Joy)) Bad.Add(N + TEXT(" sur le joystick"));
				for (const FString& M : Names)
					if (M > N && Overlap(X, Boxes[M])) Bad.Add(N + TEXT(" sur ") + M);
			}
			if (Joy.Z > 0 && (Joy.X < L - 1e-3 || Joy.Y + Joy.W > B + 1e-3)) Bad.Add(TEXT("joystick hors zone sûre"));
			const bool bNeed = Boxes.Contains(TEXT("Pause")) && Boxes.Contains(TEXT("Interact")) && Boxes.Contains(TEXT("Phone")) && (Riding == 0 || Boxes.Contains(TEXT("Jump")));
			AddInfo(FString::Printf(TEXT("%s, %s : %s ; joystick (%.0f ; %.0f) %.0f"), F.Name, Riding ? TEXT("à cheval") : TEXT("à pied"), *FString::Join(Desc, TEXT(", ")), Joy.X, Joy.Y, Joy.Z));
			TestTrue(FString::Printf(TEXT("%s, %s : pause, action, téléphone%s présents ; défauts : %s"), F.Name, Riding ? TEXT("à cheval") : TEXT("à pied"), Riding ? TEXT(", SAUT") : TEXT(""),
				Bad.Num() ? *FString::Join(Bad, TEXT(", ")) : TEXT("aucun")), bNeed && Bad.Num() == 0);
			++Cases;
		}
	// Sans encoche (Mac, relevé du web) : SAUT à sa place relevée ; avec l'encoche de l'iPhone : décalé de l'excédent (43 ; 11).
	Touch->SetCommandsForTest(&Cmd, true);
	Touch->SetViewCssForTest(FVector2D(844, 390));
	Touch->SetSafeInsetsForTest(FMargin(0));
	Touch->Sync();
	const FVector4 J0 = Touch->BoxOf(TEXT("Jump"));
	Touch->SetSafeInsetsForTest(FMargin(59, 0, 59, 21));
	Touch->Sync();
	const FVector4 J1 = Touch->BoxOf(TEXT("Jump"));
	TestTrue(FString::Printf(TEXT("SAUT décalé par l'encoche de (%.1f ; %.1f), attendu (−43 ; −11)"), J1.X - J0.X, J1.Y - J0.Y), FMath::IsNearlyEqual(J1.X - J0.X, -43.0) && FMath::IsNearlyEqual(J1.Y - J0.Y, -11.0));
	TestTrue(FString::Printf(TEXT("%d cas (formats × à pied / à cheval)"), Cases), Cases == 12);
	return true;
}

// Manette (choix n° 40) : bouton Menu = Échap (ouvre puis referme la pause, aussi jeu suspendu), Vue = téléphone,
// gâchettes hautes = allure ; A = saut, X = action (inchangés).
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesMobileGamepadTest, "Strides.Mobile.Gamepad", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesMobileGamepadTest::RunTest(const FString&)
{
	using namespace StridesMobileTest;
	FTestWorld W(TEXT("StridesMobileGamepad"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	UStridesSaveSubsystem* Save = W.GI->GetSubsystem<UStridesSaveSubsystem>();
	if (!TestTrue(TEXT("sous-systèmes"), Data && Save)) return false;
	Save->SlotName = TEXT("strides_test_j5_manette");
	UGameplayStatics::DeleteGameInSlot(Save->SlotName, 0);
	Save->MutableSettings() = strides::SaveGame::fresh().settings;
	AStridesCourse* Course = W.World->SpawnActor<AStridesCourse>();
	strides::CourseDesign D = Data->PoleCourse();
	D.x += Data->PoleArena.X;
	D.z += Data->PoleArena.Y;
	Course->Build(D, *Data);
	if (!TestTrue(TEXT("épreuve lancée"), Course->StartRun(TEXT("Alex"), TEXT("Comète")))) return false;
	const strides::CsoRunConfig& Cfg = Course->Run()->config();
	AStridesHorse* Horse = W.World->SpawnActor<AStridesHorse>();
	Horse->Course = Course;
	Horse->PlaceAt(Cfg.gateX, Cfg.gateZ, Cfg.start.rot, 0);
	AStridesPlayerController* PC = W.World->SpawnActor<AStridesPlayerController>();
	AStridesRider* Rider = W.World->SpawnActor<AStridesRider>(Horse->GetActorLocation() + FVector(0, 0, 90), FRotator::ZeroRotator);
	if (!TestTrue(TEXT("cavalier en selle"), PC && Rider && Rider->TryMount(PC) && PC->GetPawn() == Horse)) return false;
	PC->SetViewCssForTest(FVector2D(844, 390));
	PC->SetupInputForTest();
	const TArray<FString> Map = PC->GamepadMappingsForTest();
	AddInfo(FString::Printf(TEXT("manette : %s"), *FString::Join(Map, TEXT(", "))));
	for (const TCHAR* M : {TEXT("Gamepad_Special_Right=Pause"), TEXT("Gamepad_Special_Left=Phone"), TEXT("Gamepad_RightShoulder=GaitUp"), TEXT("Gamepad_LeftShoulder=GaitDown"),
			 TEXT("Gamepad_FaceButton_Bottom=Jump"), TEXT("Gamepad_FaceButton_Left=Interact"), TEXT("Gamepad_Left2D=Move")})
		TestTrue(FString::Printf(TEXT("correspondance %s"), M), Map.Contains(M));
	const double Dt = 1.0 / 30;
	auto Frame = [&]() { PC->StepCommands(Dt); Horse->Tick(Dt); };
	for (int32 K = 0; K < 90 && Course->Run()->step() != strides::CsoStep::Course; K++) Frame();
	PC->GamepadPauseForTest();
	for (int32 K = 0; K < 3; K++) Frame();
	const bool bPaused = PC->IsGamePausedState();
	PC->GamepadPauseForTest();
	for (int32 K = 0; K < 3; K++) Frame();
	TestTrue(FString::Printf(TEXT("Menu : pause %d, puis reprise %d"), bPaused, !PC->IsGamePausedState()), bPaused && !PC->IsGamePausedState());
	UGameplayStatics::DeleteGameInSlot(Save->SlotName, 0);
	return true;
}
