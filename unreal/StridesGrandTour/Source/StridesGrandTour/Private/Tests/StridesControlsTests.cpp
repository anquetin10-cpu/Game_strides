// Commandes d'épreuve (tranche T8, unreal/docs/parite/cso-ecarts.md §4) dans le moteur :
//  - Strides.Cso.Controls : épreuve du Pôle réelle (AStridesCourse, AStridesHorse, AStridesRider monté par le contrôleur
//    du joueur) ; chaque image = AStridesPlayerController::StepCommands puis AStridesHorse::Tick (ordre du web : poll,
//    boutons globaux, cheval). Clavier par codes physiques (KeyW avance, KeyZ non ; Ctrl gauche 0,5), boutons visibles en
//    épreuve (SAUT 104 × 104 à l'échelle du bloc d'actions, pause ; boîtes du relevé du navigateur), joystick flottant
//    tenu au doigt (InputTouch → commandes → affichage), pause par Échap : 5 s (150 images) sans que le chrono ni la
//    position du cheval ne bougent, carte Pause et ses bascules (réglages écrits dans un emplacement de sauvegarde de
//    test puis relus), reprise ; téléphone (P) : 5 s figées ; Tab, M, Échap qui ferme le téléphone ; joysticks virtuels du
//    moteur retirés (DefaultInput.ini).
//  - Strides.Cso.PhysicalKeys : codes physiques des touches Slate (code matériel du Mac : la touche Z d'un clavier AZERTY,
//    position de W, donne KeyW).
#include "Misc/AutomationTest.h"
#include "Blueprint/UserWidget.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "GameFramework/InputSettings.h"
#include "Input/Events.h"
#include "Kismet/GameplayStatics.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/SaveGame.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesPauseMenu.h"
#include "StridesPlayerController.h"
#include "StridesRider.h"
#include "StridesSaveSubsystem.h"
#include "StridesTouchControls.h"

namespace StridesControlsTest
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
const TCHAR* TestSlot = TEXT("strides_test_t8");
}  // namespace StridesControlsTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesCsoControlsTest, "Strides.Cso.Controls", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesCsoControlsTest::RunTest(const FString&)
{
	using namespace StridesControlsTest;
	// Joysticks virtuels du moteur retirés.
	const UInputSettings* IS = GetDefault<UInputSettings>();
	TestTrue(TEXT("DefaultInput.ini : joysticks virtuels du moteur retirés"), !IS->bAlwaysShowTouchInterface && !IS->DefaultTouchInterface.IsValid());

	FTestWorld W(TEXT("StridesCsoControlsTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	const UStridesDataSubsystem* Data = W.GI->GetSubsystem<UStridesDataSubsystem>();
	UStridesSaveSubsystem* Save = W.GI->GetSubsystem<UStridesSaveSubsystem>();
	if (!TestNotNull(TEXT("sous-systèmes"), Data) || !TestNotNull(TEXT("sauvegarde"), Save) || !TestTrue(TEXT("styles des commandes (cso_controls_style.json)"), Data->CsoControlsStyle().IsValid())) return false;
	// Emplacement de sauvegarde du test (jamais celui du joueur).
	Save->SlotName = TestSlot;
	UGameplayStatics::DeleteGameInSlot(TestSlot, 0);
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
	if (!TestTrue(TEXT("cavalier en selle, cheval possédé par le contrôleur du joueur"), PC && Rider && Rider->TryMount(PC) && PC->GetPawn() == Horse)) return false;
	PC->SetViewCssForTest(FVector2D(844, 390));
	const double Dt = 1.0 / 30;
	auto Frame = [&]() { PC->StepCommands(Dt); Horse->Tick(Dt); };
	for (int32 K = 0; K < 90 && Course->Run()->step() != strides::CsoStep::Course; K++) Frame();
	TestTrue(TEXT("parcours atteint ; mode concours (cso-ctl)"), Course->Run()->step() == strides::CsoStep::Course && PC->InRace());

	// 1) Boutons en épreuve : SAUT et pause seuls (mode tactile : joystick en plus), boîtes du relevé du navigateur.
	UStridesTouchControls* Touch = CreateWidget<UStridesTouchControls>(W.World, UStridesTouchControls::StaticClass());
	if (!TestNotNull(TEXT("widget des commandes"), Touch)) return false;
	Touch->SetCommandsForTest(&PC->Commands(), true);
	Touch->SetViewCssForTest(FVector2D(844, 390));
	Touch->SetTouchMode(true);
	Touch->Sync();
	const TArray<FString> InRace = Touch->VisibleButtons();
	TestTrue(FString::Printf(TEXT("épreuve : boutons visibles « %s » (SAUT et pause seuls)"), *FString::Join(InRace, TEXT(", "))), InRace == TArray<FString>{TEXT("Jump"), TEXT("Pause")});
	const TSharedPtr<FJsonObject> V0 = Data->CsoControlsStyle()->GetArrayField(TEXT("views"))[0]->AsObject();
	const TSharedPtr<FJsonObject> Bt = V0->GetObjectField(TEXT("buttons"));
	auto RectOf = [](const TSharedPtr<FJsonObject>& E) { const TArray<TSharedPtr<FJsonValue>>& A = E->GetArrayField(TEXT("rect")); return FVector4(A[0]->AsNumber(), A[1]->AsNumber(), A[2]->AsNumber(), A[3]->AsNumber()); };
	const FVector4 WantJ = RectOf(Bt->GetObjectField(TEXT("jump"))), WantP = RectOf(Bt->GetObjectField(TEXT("pause")));
	const FVector4 GotJ = Touch->BoxOf(TEXT("Jump")), GotP = Touch->BoxOf(TEXT("Pause"));
	const double CssW = FCString::Atod(*Bt->GetObjectField(TEXT("jump"))->GetStringField(TEXT("width")));
	TestTrue(FString::Printf(TEXT("SAUT : %.0f × %.0f px CSS (largeur calculée %s), affiché (%.1f ; %.1f) %.1f × %.1f = relevé du web (%.1f ; %.1f) %.1f × %.1f"), CssW, CssW,
		*Bt->GetObjectField(TEXT("jump"))->GetStringField(TEXT("height")), GotJ.X, GotJ.Y, GotJ.Z, GotJ.W, WantJ.X, WantJ.Y, WantJ.Z, WantJ.W), CssW == 104 && (GotJ - WantJ).Size() < 1e-6);
	TestTrue(FString::Printf(TEXT("pause : (%.1f ; %.1f) %.1f × %.1f = relevé du web"), GotP.X, GotP.Y, GotP.Z, GotP.W), (GotP - WantP).Size() < 1e-6);
	const FVector4 RestJ = Touch->BoxOf(TEXT("Joystick"));
	const FVector4 WantRest = RectOf(V0->GetObjectField(TEXT("rest"))->GetObjectField(TEXT("base")));
	TestTrue(FString::Printf(TEXT("joystick au repos : (%.1f ; %.1f) %.1f × %.1f, opacité %.2f = relevé du web"), RestJ.X, RestJ.Y, RestJ.Z, RestJ.W, Touch->JoystickOpacity()),
		(RestJ - WantRest).Size() < 1e-6 && FMath::IsNearlyEqual(Touch->JoystickOpacity(), 0.55));
	Touch->SetTouchMode(false);
	Touch->Sync();
	TestTrue(TEXT("sur ordinateur (pas d'écran tactile) : SAUT et pause, sans joystick"), Touch->VisibleButtons() == TArray<FString>{TEXT("Jump"), TEXT("Pause")} && Touch->BoxOf(TEXT("Joystick")).Z == 0);
	Touch->SetTouchMode(true);

	// 2) Joystick tenu au doigt (InputTouch : px CSS), avance : cadence ; doigt levé : cadence gardée.
	PC->FeedPointerDown(7, false, FVector2D(150, 300));
	PC->FeedPointerMove(7, false, FVector2D(150, 250));
	Touch->Sync();
	const FVector4 Held = Touch->BoxOf(TEXT("Joystick")), Kn = Touch->BoxOf(TEXT("Knob"));
	TestTrue(FString::Printf(TEXT("joystick tenu : base centrée sur le doigt (%.1f ; %.1f), bouton (%.1f ; %.1f), opacité %.2f"), Held.X + Held.Z / 2, Held.Y + Held.W / 2, Kn.X + Kn.Z / 2, Kn.Y + Kn.W / 2, Touch->JoystickOpacity()),
		FMath::IsNearlyEqual(Held.X + Held.Z / 2, 150.0) && FMath::IsNearlyEqual(Held.Y + Held.W / 2, 300.0) && FMath::IsNearlyEqual(Kn.Y + Kn.W / 2, 250.0) && Touch->JoystickOpacity() == 1.0);
	const double Cad0 = Horse->CsoState().hasCadence ? Horse->CsoState().cadence : 0;
	for (int32 K = 0; K < 30; K++) Frame();
	const double Cad1 = Horse->CsoState().cadence;
	PC->FeedPointerUp(7);
	Frame();
	TestTrue(FString::Printf(TEXT("joystick vers l'avant 1 s : cadence %.3f -> %.3f m/s, gardée au relâché (%.3f)"), Cad0, Cad1, Horse->CsoState().cadence),
		Cad1 > Cad0 + 0.5 && Horse->CsoState().cadence == Cad1 && PC->Commands().move.mag == 0);

	// 3) Clavier par codes physiques : KeyW (touche Z en AZERTY) avance, KeyZ (touche W en AZERTY) n'avance pas ; Ctrl
	//    gauche : amplitude 0,5.
	PC->FeedKey(TEXT("KeyZ"), true, false);
	Frame();
	const bool bZ = PC->Commands().move.mag == 0 && !PC->Commands().keyMove;
	PC->FeedKey(TEXT("KeyZ"), false, false);
	PC->FeedKey(TEXT("KeyW"), true, false);
	Frame();
	const bool bW = PC->Commands().keyMove && PC->Commands().move.y == 1;
	PC->FeedKey(TEXT("ControlLeft"), true, false);
	Frame();
	const bool bCtrl = PC->Commands().move.y == 0.5;
	PC->FeedKey(TEXT("ControlLeft"), false, false);
	PC->FeedKey(TEXT("KeyW"), false, false);
	Frame();
	TestTrue(TEXT("clavier : KeyZ sans effet, KeyW avance (keyMove), Ctrl gauche 0,5"), bZ && bW && bCtrl);

	// 4) Ligne de départ franchie : chrono lancé.
	Horse->PlaceAt(Cfg.start.x - FMath::Sin(Cfg.start.rot) * 6, Cfg.start.z - FMath::Cos(Cfg.start.rot) * 6, Cfg.start.rot, 4.6);
	for (int32 K = 0; K < 60 && !Course->Run()->state().started; K++) Frame();
	for (int32 K = 0; K < 10; K++) Frame();
	TestTrue(TEXT("chrono lancé"), Course->Run()->state().started && Course->Run()->state().t > 0.3);

	// 5) Pause (Échap) : l'image en cours finit (le web), puis 5 s sans pas : chrono et cheval inchangés.
	PC->FeedKey(TEXT("Escape"), true, false);
	Frame();
	PC->FeedKey(TEXT("Escape"), false, false);
	const double T0 = Course->Run()->state().t;
	const FVector P0 = Horse->GetActorLocation();
	const double X0 = Horse->WebX(), Z0 = Horse->WebZ();
	for (int32 K = 0; K < 150; K++) Frame();
	const double T1 = Course->Run()->state().t;
	TestTrue(FString::Printf(TEXT("pause 5 s (150 images) : chrono %.6f -> %.6f s, cheval (%.6f ; %.6f) -> (%.6f ; %.6f)"), T0, T1, X0, Z0, Horse->WebX(), Horse->WebZ()),
		PC->IsGamePausedState() && PC->SkipsUpdate() && T1 == T0 && Horse->WebX() == X0 && Horse->WebZ() == Z0 && Horse->GetActorLocation() == P0);
	UStridesPauseMenu* Menu = PC->PauseMenuWidget();
	if (!TestTrue(TEXT("carte Pause ouverte"), Menu && Menu->IsOpen())) return false;
	Menu->SetViewCssForTest(FVector2D(844, 390));
	Menu->Refresh();
	TestTrue(FString::Printf(TEXT("carte Pause : bascules « %s » et « %s »"), *Menu->LineLabel(), *Menu->AidLabel()), Menu->LineLabel() == TEXT("Tracé au sol : affiché") && Menu->AidLabel() == TEXT("Aide au saut : complète") && Menu->AidEnabled());
	// Bascules : réglages changés, écrits dans l'emplacement de test, aide appliquée à l'épreuve en cours.
	Menu->ClickForTest(TEXT("pause-line"));
	Menu->ClickForTest(TEXT("pause-aid"));
	TestTrue(FString::Printf(TEXT("bascules : « %s », « %s » ; aide de l'épreuve %s"), *Menu->LineLabel(), *Menu->AidLabel(), UTF8_TO_TCHAR(Course->Run()->config().aid.c_str())),
		Menu->LineLabel() == TEXT("Tracé au sol : masqué") && Menu->AidLabel() == TEXT("Aide au saut : bouton seul") && Course->JumpAid == TEXT("button") && Course->Run()->config().aid == "button");
	Save->MutableSettings() = strides::SaveGame::fresh().settings;
	const bool bReloaded = Save->ReloadSettings();
	TestTrue(TEXT("réglages relus dans la sauvegarde : courseLine false, jumpAid button"), bReloaded && !strides::courseLineShown(Save->GetSettings()) && strides::jumpAidOf(Save->GetSettings()) == "button");
	// Reprendre : le jeu repart.
	Menu->ClickForTest(TEXT("resume"));
	for (int32 K = 0; K < 15; K++) Frame();
	TestTrue(FString::Printf(TEXT("reprise : chrono %.4f s, cheval reparti"), Course->Run()->state().t), !PC->IsGamePausedState() && !Menu->IsOpen() && Course->Run()->state().t > T1 && Horse->WebX() != X0);

	// 6) Téléphone (P) : 5 s figées (hdt et sdt nuls), commandes désactivées ; P le referme.
	PC->FeedKey(TEXT("KeyP"), true, false);
	Frame();
	PC->FeedKey(TEXT("KeyP"), false, false);
	const double T2 = Course->Run()->state().t;
	const double X2 = Horse->WebX(), Z2 = Horse->WebZ();
	PC->FeedKey(TEXT("KeyW"), true, false);  // ignorée : commandes désactivées
	for (int32 K = 0; K < 150; K++) Frame();
	TestTrue(FString::Printf(TEXT("téléphone 5 s : chrono %.6f -> %.6f s, cheval (%.6f ; %.6f) -> (%.6f ; %.6f), touche W non retenue"), T2, Course->Run()->state().t, X2, Z2, Horse->WebX(), Horse->WebZ()),
		PC->IsPhoneOpen() && Course->Run()->state().t == T2 && Horse->WebX() == X2 && Horse->WebZ() == Z2 && !PC->Commands().keys.count("KeyW"));
	PC->FeedKey(TEXT("KeyW"), false, false);
	// Échap avec le téléphone ouvert : le ferme (pas de pause).
	PC->FeedKey(TEXT("Escape"), true, false);
	Frame();
	PC->FeedKey(TEXT("Escape"), false, false);
	const bool bEscCloses = !PC->IsPhoneOpen() && !PC->IsGamePausedState();
	// Tab ouvre, M ferme ; M ouvre sur la carte.
	PC->FeedKey(TEXT("Tab"), true, false); Frame(); PC->FeedKey(TEXT("Tab"), false, false);
	const bool bTab = PC->IsPhoneOpen() && PC->PhoneApp() == TEXT("home");
	PC->FeedKey(TEXT("KeyM"), true, false); Frame(); PC->FeedKey(TEXT("KeyM"), false, false);
	const bool bMClose = !PC->IsPhoneOpen();
	PC->FeedKey(TEXT("KeyM"), true, false); Frame(); PC->FeedKey(TEXT("KeyM"), false, false);
	const bool bMap = PC->IsPhoneOpen() && PC->PhoneApp() == TEXT("map");
	PC->FeedKey(TEXT("KeyM"), true, false); Frame(); PC->FeedKey(TEXT("KeyM"), false, false);
	TestTrue(TEXT("Échap ferme le téléphone ; Tab ouvre, M ferme ; M ouvre la carte et la referme"), bEscCloses && bTab && bMClose && bMap && !PC->IsPhoneOpen());
	// Bouton pause du HUD (tactile) : même effet qu'Échap.
	Touch->Sync();
	PC->ButtonDown(TEXT("pause"));
	Frame();
	PC->ButtonUp(TEXT("pause"));
	TestTrue(TEXT("bouton pause : jeu en pause"), PC->IsGamePausedState());
	PC->ResumeGame();
	Frame();
	AddInfo(FString::Printf(TEXT("commandes en jeu : SAUT %.1f px affiché (104 px CSS), pause %.0f × %.0f, chrono figé à %.4f s pendant 150 images de pause et à %.4f s pendant 150 images de téléphone"), GotJ.Z, GotP.Z, GotP.W, T0, T2));
	PC->UnPossess();
	UGameplayStatics::DeleteGameInSlot(TestSlot, 0);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesPhysicalKeysTest, "Strides.Cso.PhysicalKeys", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesPhysicalKeysTest::RunTest(const FString&)
{
	// Touche reçue par Slate : FKey (caractère produit) et code matériel. Clavier AZERTY : la touche à la place de W
	// produit « z » (FKey Z) avec le code matériel de W (kVK_ANSI_W = 0x0D) ; le web lit KeyW.
	auto Code = [](const FKey& K, uint32 Char, uint32 Hw) { return AStridesPlayerController::WebCodeOf(FKeyEvent(K, FModifierKeysState(), 0, false, Char, Hw)); };
#if PLATFORM_MAC
	TestEqual(TEXT("AZERTY : touche Z (position de W) -> KeyW"), Code(EKeys::Z, 'z', 0x0D), FString(TEXT("KeyW")));
	TestEqual(TEXT("AZERTY : touche Q (position de A) -> KeyA"), Code(EKeys::Q, 'q', 0x00), FString(TEXT("KeyA")));
	TestEqual(TEXT("AZERTY : touche A (position de Q) -> KeyQ"), Code(EKeys::A, 'a', 0x0C), FString(TEXT("KeyQ")));
	TestEqual(TEXT("Ctrl gauche"), Code(EKeys::LeftControl, 0, 0x3B), FString(TEXT("ControlLeft")));
	TestEqual(TEXT("Alt gauche"), Code(EKeys::LeftAlt, 0, 0x3A), FString(TEXT("AltLeft")));
	TestEqual(TEXT("Échap"), Code(EKeys::Escape, 27, 0x35), FString(TEXT("Escape")));
	TestEqual(TEXT("Tab"), Code(EKeys::Tab, 9, 0x30), FString(TEXT("Tab")));
	TestEqual(TEXT("flèche haut"), Code(EKeys::Up, 0, 0x7E), FString(TEXT("ArrowUp")));
#endif
	// Code matériel inconnu de la table : nom de la touche Unreal (repli des autres plateformes).
	TestEqual(TEXT("repli : nom de touche"), Code(EKeys::SpaceBar, ' ', 0xFFFF), FString(TEXT("Space")));
	TestEqual(TEXT("repli : touche non lue"), Code(EKeys::F8, 0, 0xFFFF), FString());
	return true;
}
