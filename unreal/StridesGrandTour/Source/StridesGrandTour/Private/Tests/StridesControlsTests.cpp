// Commandes d'épreuve (tranche T8, unreal/docs/parite/cso-ecarts.md §4) dans le moteur :
//  - Strides.Cso.Controls : épreuve du Pôle réelle (AStridesCourse, AStridesHorse, AStridesRider monté par le contrôleur
//    du joueur) ; chaque image = AStridesPlayerController::StepCommands puis AStridesHorse::Tick (ordre du web : poll,
//    boutons globaux, cheval). Clavier par codes physiques (KeyW avance, KeyZ non ; Ctrl gauche 0,5), boutons visibles en
//    épreuve (SAUT 104 × 104 à l'échelle du bloc d'actions, pause ; boîtes du relevé du navigateur), allures du portage
//    sans effet en épreuve (Maj / Ctrl) ; doigts reçus par AStridesPlayerController::InputTouch (le gestionnaire appelé
//    par UGameViewportClient::InputTouch) : px du viewport divisés par le facteur de pixels (3, comme un iPhone),
//    identifiant par doigt et par appareil, Began / FirstMove / Moved / Stationary / ForceChanged / Ended, joystick
//    tenu → commandes → affichage, second doigt en regard ; gel en pause (Échap) et au téléphone (P, M) image par image
//    comparé au jeu web (ORA/cso_freeze.json : 150 images de pause et 150 de téléphone sans que le chrono ni la position
//    du cheval ne bougent ; l'image d'Échap et celle de l'ouverture du téléphone avancent encore, celle de sa fermeture
//    reste figée), carte Pause et ses bascules (réglages écrits dans un emplacement de sauvegarde de test puis relus),
//    reprise ; Tab, M ; joysticks virtuels du moteur retirés (DefaultInput.ini).
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
#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "StridesCsoHud.h"
#include "StridesShots.h"
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
// Facteur de pixels imposé pendant le test (iPhone : 3), rendu à l'écran même en cas d'échec.
struct FPixelRatioGuard
{
	explicit FPixelRatioGuard(double R) { UStridesCsoHud::SetPixelRatioForTest(R); }
	~FPixelRatioGuard() { UStridesCsoHud::SetPixelRatioForTest(0); }
};
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
	// Relevé écrit aussi dans le journal (les messages des tests réussis n'y figurent pas).
	auto Info = [this](const FString& M) { AddInfo(M); UE_LOG(LogTemp, Display, TEXT("Strides.Cso.Controls : %s"), *M); };
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
	// En 844 × 390, la boîte calculée vient du relevé lui-même (ancrage à droite et en bas d'une vue de même taille) : ce
	// contrôle vérifie le placement effectif (slot du canevas = boîte relevée), pas l'identité du rendu, prouvée par les
	// montages côte à côte cmd-* et hud-*. Les relevés n'existent qu'en 844 × 390 et 667 × 308 : l'ancrage à droite et en
	// bas pour une autre taille de viewport n'est comparé au web par aucun test.
	const FVector4 GotJ = Touch->SlotBoxOf(TEXT("Jump")), GotP = Touch->SlotBoxOf(TEXT("Pause"));
	const double CssW = FCString::Atod(*Bt->GetObjectField(TEXT("jump"))->GetStringField(TEXT("width")));
	TestTrue(FString::Printf(TEXT("SAUT : %.0f × %.0f px CSS (largeur calculée %s), slot posé (%.1f ; %.1f) %.1f × %.1f = boîte relevée (%.1f ; %.1f) %.1f × %.1f (placement, pas identité)"), CssW, CssW,
		*Bt->GetObjectField(TEXT("jump"))->GetStringField(TEXT("height")), GotJ.X, GotJ.Y, GotJ.Z, GotJ.W, WantJ.X, WantJ.Y, WantJ.Z, WantJ.W), CssW == 104 && (GotJ - WantJ).Size() < 1e-3);
	// (slot du canevas en float : 1e-3 px)
	TestTrue(FString::Printf(TEXT("pause : slot posé (%.1f ; %.1f) %.1f × %.1f = boîte relevée (placement, pas identité)"), GotP.X, GotP.Y, GotP.Z, GotP.W), (GotP - WantP).Size() < 1e-3);
	const FVector4 RestJ = Touch->BoxOf(TEXT("Joystick"));
	const FVector4 WantRest = RectOf(V0->GetObjectField(TEXT("rest"))->GetObjectField(TEXT("base")));
	TestTrue(FString::Printf(TEXT("joystick au repos : (%.1f ; %.1f) %.1f × %.1f, opacité %.2f = relevé du web"), RestJ.X, RestJ.Y, RestJ.Z, RestJ.W, Touch->JoystickOpacity()),
		(RestJ - WantRest).Size() < 1e-6 && FMath::IsNearlyEqual(Touch->JoystickOpacity(), 0.55));
	Touch->SetTouchMode(false);
	Touch->Sync();
	TestTrue(TEXT("sur ordinateur (pas d'écran tactile) : SAUT et pause, sans joystick"), Touch->VisibleButtons() == TArray<FString>{TEXT("Jump"), TEXT("Pause")} && Touch->BoxOf(TEXT("Joystick")).Z == 0);
	Touch->SetTouchMode(true);

	// 2) Doigts reçus du viewport : AStridesPlayerController::InputTouch (appelé par UGameViewportClient::InputTouch, ici
	//    par l'interface de APlayerController) avec la position en px du viewport ; facteur de pixels 3 (iPhone).
	{
		const FPixelRatioGuard Ratio(3.0);
		const double R = UStridesCsoHud::PixelRatio();
		APlayerController* Base = PC;
		const FInputDeviceId Dev0 = FInputDeviceId::CreateFromInternalId(0), Dev1 = FInputDeviceId::CreateFromInternalId(1);
		auto Finger = [&](FInputDeviceId D, ETouchIndex::Type I, ETouchType::Type T, double X, double Y) { return Base->InputTouch(FTouchId(D, I), T, FVector2D(X, Y) * R, 1.f, 0); };
		const strides::CsoInput& C = PC->Commands();
		auto KnobCss = [&]() { Touch->Sync(); const FVector4 K = Touch->BoxOf(TEXT("Knob")); return FVector2D(K.X + K.Z / 2, K.Y + K.W / 2); };
		// Doigt 1 de l'appareil 0 posé dans la zone du joystick : joystick tenu, base centrée sur le doigt (px CSS).
		const bool bR0 = Finger(Dev0, ETouchIndex::Touch1, ETouchType::Began, 150, 300);
		Touch->Sync();
		const FVector4 Held = Touch->BoxOf(TEXT("Joystick"));
		const int64 Id0 = AStridesPlayerController::TouchPointerId(FTouchId(Dev0, ETouchIndex::Touch1));
		TestTrue(FString::Printf(TEXT("Began à (450 ; 900) px, facteur %.0f : joystick tenu par le doigt %lld, base centrée en (%.1f ; %.1f) px CSS, opacité %.2f"), R, Id0, Held.X + Held.Z / 2, Held.Y + Held.W / 2, Touch->JoystickOpacity()),
			bR0 && C.joy.on && C.joy.id == Id0 && FMath::IsNearlyEqual(Held.X + Held.Z / 2, 150.0) && FMath::IsNearlyEqual(Held.Y + Held.W / 2, 300.0) && Touch->JoystickOpacity() == 1.0);
		// FirstMove (premier déplacement) : pointermove.
		Finger(Dev0, ETouchIndex::Touch1, ETouchType::FirstMove, 150, 270);
		const FVector2D K1 = KnobCss();
		TestTrue(FString::Printf(TEXT("FirstMove vers (150 ; 270) px CSS : bouton du joystick en (%.1f ; %.1f), move.y %.4f"), K1.X, K1.Y, C.move.y), FMath::IsNearlyEqual(K1.Y, 270.0) && FMath::IsNearlyEqual(C.move.y, 30.0 / 58.0, 1e-9));
		// Moved puis Moved au même point : le second ne change rien.
		Finger(Dev0, ETouchIndex::Touch1, ETouchType::Moved, 150, 250);
		const strides::CsoInput::Move M1 = C.move;
		const strides::CsoInput::View V1 = C.view;
		Finger(Dev0, ETouchIndex::Touch1, ETouchType::Moved, 150, 250);
		TestTrue(FString::Printf(TEXT("Moved vers (150 ; 250) : move.y %.4f ; répété au même point : inchangé"), C.move.y),
			FMath::IsNearlyEqual(C.move.y, 50.0 / 58.0, 1e-9) && C.move.x == M1.x && C.move.y == M1.y && C.move.mag == M1.mag && C.view.knobX == V1.knobX && C.view.knobY == V1.knobY && C.view.left == V1.left && C.view.top == V1.top);
		// Stationary et ForceChanged (position différente) : aucun pointermove.
		Finger(Dev0, ETouchIndex::Touch1, ETouchType::Stationary, 150, 200);
		Finger(Dev0, ETouchIndex::Touch1, ETouchType::ForceChanged, 150, 200);
		const FVector2D K2 = KnobCss();
		TestTrue(FString::Printf(TEXT("Stationary, ForceChanged vers (150 ; 200) : sans effet, bouton en (%.1f ; %.1f)"), K2.X, K2.Y), FMath::IsNearlyEqual(K2.Y, 250.0) && C.move.y == M1.y);
		// Doigt 1 d'un autre appareil (même index) posé à droite : regard (doigt distinct du joystick), 1,25 par px.
		const int64 Id1 = AStridesPlayerController::TouchPointerId(FTouchId(Dev1, ETouchIndex::Touch1));
		Finger(Dev1, ETouchIndex::Touch1, ETouchType::Began, 600, 200);
		Finger(Dev1, ETouchIndex::Touch1, ETouchType::Moved, 620, 190);
		const FVector2D K3 = KnobCss();
		TestTrue(FString::Printf(TEXT("second doigt %lld (appareil 1) : regard (%.2f ; %.2f), joystick inchangé (%.1f ; %.1f)"), Id1, C.look.dx, C.look.dy, K3.X, K3.Y),
			Id1 != Id0 && C.lookPtr.on && C.lookPtr.id == Id1 && FMath::IsNearlyEqual(C.look.dx, 25.0) && FMath::IsNearlyEqual(C.look.dy, -12.5) && FMath::IsNearlyEqual(K3.Y, 250.0));
		const double LookDx = C.look.dx, LookDy = C.look.dy;
		// Joystick vers l'avant 1 s : cadence montée ; doigts levés (Ended) : joystick relâché, cadence gardée.
		const double Cad0 = Horse->CsoState().hasCadence ? Horse->CsoState().cadence : 0;
		for (int32 K = 0; K < 30; K++) Frame();
		const double Cad1 = Horse->CsoState().cadence;
		Finger(Dev1, ETouchIndex::Touch1, ETouchType::Ended, 620, 190);
		Finger(Dev0, ETouchIndex::Touch1, ETouchType::Ended, 150, 250);
		Frame();
		TestTrue(FString::Printf(TEXT("joystick vers l'avant 1 s : cadence %.3f -> %.3f m/s ; Ended : joystick et regard relâchés, cadence gardée (%.3f)"), Cad0, Cad1, Horse->CsoState().cadence),
			Cad1 > Cad0 + 0.5 && Horse->CsoState().cadence == Cad1 && C.move.mag == 0 && !C.joy.on && !C.lookPtr.on);
		Info(FString::Printf(TEXT("doigts reçus par InputTouch (facteur %.0f) : %s ; regard (%.2f ; %.2f) ; cadence %.3f -> %.3f m/s"), R, *FString::Join(PC->TouchLog(), TEXT(" ")), LookDx, LookDy, Cad0, Cad1));
	}

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
	// Allures du portage (Maj / Ctrl gauche liées à OnGaitUp / OnGaitDown, mêmes fonctions que les boutons ALLURE ±) :
	// sans effet en épreuve (le web n'a pas d'allure en concours ; Ctrl gauche y réduit l'amplitude du clavier). Cheval au
	// trot de concours (allure 2 du portage, ni la plus basse ni la plus haute : chaque sens serait visible).
	const int32 Gait0 = Horse->GaitIndex;
	PC->TouchGaitUp();
	const int32 GaitUp = Horse->GaitIndex;
	PC->TouchGaitDown();
	PC->TouchGaitDown();
	TestTrue(FString::Printf(TEXT("allures sans effet en épreuve : %d -> %d (Maj) -> %d (Ctrl ×2)"), Gait0, GaitUp, Horse->GaitIndex), Gait0 > 0 && Gait0 < 4 && GaitUp == Gait0 && Horse->GaitIndex == Gait0);
	Info(FString::Printf(TEXT("allures en épreuve : %d -> %d (Maj) -> %d (Ctrl ×2)"), Gait0, GaitUp, Horse->GaitIndex));

	// 5) Gel en pause et au téléphone, image par image, comparé au jeu web : ORA/cso_freeze.json (boucle de game.js:1406,
	//    update seulement à l'état « play »), même séquence d'actions après le départ du chrono (pause = Échap, phone = P,
	//    map = M, resume = Reprendre sur la carte Pause). Par image : update appelée, état « paused », simPaused, téléphone
	//    et application, chrono écoulé (valeur, depuis la première image), cheval déplacé (oui ou non). Pendant la première pause : carte Pause et ses bascules ; pendant
	//    le premier téléphone : touche W non retenue.
	FString FText;
	TSharedPtr<FJsonObject> FDoc;
	if (!TestTrue(TEXT("oracle cso_freeze.json lu"), FFileHelper::LoadFileToString(FText, *(AStridesShots::RepoRoot() / TEXT("unreal/core/tests/oracles/cso_freeze.json"))) && FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(FText), FDoc) && FDoc.IsValid()))
		return false;
	const TArray<TSharedPtr<FJsonValue>>& OF = FDoc->GetArrayField(TEXT("frames"));
	UStridesPauseMenu* Menu = nullptr;
	bool bCard = false, bPhoneKeys = false, bEscCloses = false, bSkips = true;
	int32 Bad = 0, Advanced = 0, Frozen = 0;
	TArray<FString> BadLines;
	double PrevT = Course->Run()->state().t, PrevX = Horse->WebX(), PrevZ = Horse->WebZ();
	double PauseT0 = -1, PauseT1 = -1, PhoneT0 = -1, PhoneT1 = -1, RunStartT = 0, PhoneStartT = 0;
	int32 PauseRun = 0, PhoneRun = 0, MaxPauseRun = 0, MaxPhoneRun = 0;
	// Valeurs du chrono comparées à celles du web (et non plus seulement « avancé ou non ») : chrono écoulé depuis la
	// première image de la séquence, au millionième de l'oracle près (l'arrivée sur la ligne de départ diffère : cheval
	// posé ici, galop du scénario « droit » au web). Positions : comparées par « déplacé ou non » seulement (vitesses
	// d'abord différentes).
	double T0u = 0, T0w = 0, MaxDT = 0;
	for (int32 I = 0; I < OF.Num(); I++)
	{
		const TSharedPtr<FJsonObject> O = OF[I]->AsObject();
		FString A;
		O->TryGetStringField(TEXT("a"), A);
		const TCHAR* Key = A == TEXT("pause") ? TEXT("Escape") : A == TEXT("phone") ? TEXT("KeyP") : A == TEXT("map") ? TEXT("KeyM") : nullptr;
		if (A == TEXT("resume") && PC->PauseMenuWidget() && PC->PauseMenuWidget()->IsOpen()) PC->PauseMenuWidget()->ClickForTest(TEXT("resume"));
		const bool bPhoneBefore = PC->IsPhoneOpen();
		if (Key) PC->FeedKey(Key, true, false);
		const bool bUpd = !PC->IsGamePausedState();
		Frame();
		if (Key) PC->FeedKey(Key, false, false);
		const double T = Course->Run()->state().t, X = Horse->WebX(), Z = Horse->WebZ();
		const bool bPaused = PC->IsGamePausedState(), bSp = PC->IsSimPaused(), bPh = PC->IsPhoneOpen();
		const FString App = bPh ? PC->PhoneApp() : FString();
		const bool bAdv = T != PrevT, bMov = X != PrevX || Z != PrevZ;
		// Web : st, sp, ph, app, upd ; chrono avancé et cheval déplacé depuis l'image précédente (relevés au millionième).
		FString WApp;
		O->TryGetStringField(TEXT("app"), WApp);
		const double WT = O->GetNumberField(TEXT("t")), WX = O->GetNumberField(TEXT("x")), WZ = O->GetNumberField(TEXT("z"));
		if (I == 0) { T0u = T; T0w = WT; }
		const double DT = FMath::Abs((T - T0u) - (WT - T0w));
		MaxDT = FMath::Max(MaxDT, DT);
		bool bWAdv = bAdv, bWMov = bMov;
		if (I > 0)
		{
			const TSharedPtr<FJsonObject> Q = OF[I - 1]->AsObject();
			bWAdv = WT != Q->GetNumberField(TEXT("t"));
			bWMov = WX != Q->GetNumberField(TEXT("x")) || WZ != Q->GetNumberField(TEXT("z"));
		}
		const bool bSame = bUpd == O->GetBoolField(TEXT("upd")) && bPaused == (O->GetStringField(TEXT("st")) == TEXT("paused")) && bSp == O->GetBoolField(TEXT("sp")) &&
			bPh == O->GetBoolField(TEXT("ph")) && App == WApp && bAdv == bWAdv && bMov == bWMov && DT < 2e-6;
		if (!bSame)
		{
			Bad++;
			if (BadLines.Num() < 6)
				BadLines.Add(FString::Printf(TEXT("image %d (%s) : portage upd %d paused %d sp %d ph %d « %s » avance %d déplacé %d ; web upd %d st %s sp %d ph %d « %s » avance %d déplacé %d"), I, A.IsEmpty() ? TEXT("-") : *A,
					bUpd, bPaused, bSp, bPh, *App, bAdv, bMov, O->GetBoolField(TEXT("upd")), *O->GetStringField(TEXT("st")), O->GetBoolField(TEXT("sp")), O->GetBoolField(TEXT("ph")), *WApp, bWAdv, bWMov));
		}
		if (bAdv) Advanced++;
		else Frozen++;
		// Plus longues suites d'images figées : en pause (aucune update) et téléphone ouvert (update, simPaused).
		if (!bUpd && !bAdv && !bMov)
		{
			if (PauseRun++ == 0) RunStartT = PrevT;
			if (PauseRun > MaxPauseRun) { MaxPauseRun = PauseRun; PauseT0 = RunStartT; PauseT1 = T; }
		}
		else PauseRun = 0;
		if (bUpd && bSp && !bAdv && !bMov)
		{
			if (PhoneRun++ == 0) PhoneStartT = PrevT;
			if (PhoneRun > MaxPhoneRun) { MaxPhoneRun = PhoneRun; PhoneT0 = PhoneStartT; PhoneT1 = T; }
		}
		else PhoneRun = 0;
		if (A == TEXT("pause") && bPhoneBefore) bEscCloses = !bPh && !bPaused;
		// En pause, à partir de l'image qui suit Échap : mise à jour du cheval suspendue.
		if (!bUpd) bSkips = bSkips && PC->SkipsUpdate();
		PrevT = T; PrevX = X; PrevZ = Z;
		// Première pause : carte Pause, bascules, réglages écrits puis relus, aide appliquée à l'épreuve en cours.
		if (bPaused && !bCard)
		{
			bCard = true;
			Menu = PC->PauseMenuWidget();
			if (!TestTrue(TEXT("carte Pause ouverte"), Menu && Menu->IsOpen())) return false;
			Menu->SetViewCssForTest(FVector2D(844, 390));
			Menu->Refresh();
			TestTrue(FString::Printf(TEXT("carte Pause : bascules « %s » et « %s »"), *Menu->LineLabel(), *Menu->AidLabel()), Menu->LineLabel() == TEXT("Tracé au sol : affiché") && Menu->AidLabel() == TEXT("Aide au saut : complète") && Menu->AidEnabled());
			Menu->ClickForTest(TEXT("pause-line"));
			Menu->ClickForTest(TEXT("pause-aid"));
			TestTrue(FString::Printf(TEXT("bascules : « %s », « %s » ; aide de l'épreuve %s"), *Menu->LineLabel(), *Menu->AidLabel(), UTF8_TO_TCHAR(Course->Run()->config().aid.c_str())),
				Menu->LineLabel() == TEXT("Tracé au sol : masqué") && Menu->AidLabel() == TEXT("Aide au saut : bouton seul") && Course->JumpAid == TEXT("button") && Course->Run()->config().aid == "button");
			Save->MutableSettings() = strides::SaveGame::fresh().settings;
			const bool bReloaded = Save->ReloadSettings();
			TestTrue(TEXT("réglages relus dans la sauvegarde : courseLine false, jumpAid button"), bReloaded && !strides::courseLineShown(Save->GetSettings()) && strides::jumpAidOf(Save->GetSettings()) == "button");
		}
		// Premier téléphone ouvert : touche W (déplacement) non retenue, commandes désactivées.
		if (bPh && !bPhoneKeys && A.IsEmpty())
		{
			bPhoneKeys = true;
			PC->FeedKey(TEXT("KeyW"), true, false);
			TestTrue(TEXT("téléphone ouvert : touche W non retenue"), !PC->Commands().keys.count("KeyW"));
			PC->FeedKey(TEXT("KeyW"), false, false);
		}
	}
	TestTrue(FString::Printf(TEXT("chrono écoulé identique au web à chaque image (écart max %.3g s ; chrono à la première image : portage %.6f, web %.6f)"), MaxDT, T0u, T0w), MaxDT < 2e-6);
	TestTrue(FString::Printf(TEXT("gel image par image identique au web (cso_freeze.json) : %d images, %d écart(s) ; chrono avancé à %d images, figé à %d%s%s"), OF.Num(), Bad, Advanced, Frozen,
		BadLines.Num() ? TEXT(" ; ") : TEXT(""), *FString::Join(BadLines, TEXT(" | "))), OF.Num() > 300 && Bad == 0);
	Info(FString::Printf(TEXT("gel : %d images comparées à cso_freeze.json, %d écart(s), chrono avancé à %d images, figé à %d ; pause %d images sans update, chrono %.6f -> %.6f s ; téléphone %d images figées, chrono %.6f -> %.6f s ; Échap ferme le téléphone %d"),
		OF.Num(), Bad, Advanced, Frozen, MaxPauseRun, PauseT0, PauseT1, MaxPhoneRun, PhoneT0, PhoneT1, bEscCloses));
	TestTrue(FString::Printf(TEXT("pause : %d images sans update, chrono %.6f -> %.6f s ; téléphone : %d images figées, chrono %.6f -> %.6f s (5 s = 150 images)"), MaxPauseRun, PauseT0, PauseT1, MaxPhoneRun, PhoneT0, PhoneT1),
		MaxPauseRun >= 150 && MaxPhoneRun >= 150 && PauseT0 == PauseT1 && PhoneT0 == PhoneT1);
	TestTrue(TEXT("reprise : carte fermée, jeu relancé ; en pause, mise à jour du cheval suspendue (SkipsUpdate)"), bCard && Menu && !Menu->IsOpen() && !PC->IsGamePausedState() && bSkips);
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
	AddInfo(FString::Printf(TEXT("commandes en jeu : SAUT %.1f px affiché (104 px CSS), pause %.0f × %.0f, chrono figé à %.4f s pendant %d images de pause et à %.4f s pendant %d images de téléphone"), GotJ.Z, GotP.Z, GotP.W, PauseT0, MaxPauseRun, PhoneT0, MaxPhoneRun));
	// Hors épreuve (parcours retiré) : les allures du portage reviennent (contre-épreuve du garde en épreuve).
	Course->Destroy();
	const int32 GaitOut0 = Horse->GaitIndex;
	PC->TouchGaitUp();
	const int32 GaitOut1 = Horse->GaitIndex;
	PC->TouchGaitDown();
	TestTrue(FString::Printf(TEXT("hors épreuve : Maj %d -> %d, Ctrl -> %d"), GaitOut0, GaitOut1, Horse->GaitIndex), !PC->InRace() && GaitOut1 == GaitOut0 + 1 && Horse->GaitIndex == GaitOut0);
	Info(FString::Printf(TEXT("allures hors épreuve (parcours retiré) : %d -> %d (Maj) -> %d (Ctrl)"), GaitOut0, GaitOut1, Horse->GaitIndex));
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
