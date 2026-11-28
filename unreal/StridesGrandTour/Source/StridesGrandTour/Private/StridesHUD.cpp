#include "StridesHUD.h"
#include "StridesActivityPost.h"
#include "Engine/Canvas.h"
#include "CanvasItem.h"
#include "Algo/Reverse.h"
#include "Camera/PlayerCameraManager.h"
#include "EngineUtils.h"
#include "StridesCollectibles.h"
#include "StridesCore/WorldClock.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesFence.h"
#include "StridesHorse.h"
#include "StridesPlayerController.h"
#include "StridesProgressionSubsystem.h"
#include "StridesSaveSubsystem.h"
#include "StridesUnits.h"
#include "StridesVehicle.h"

void AStridesHUD::BeginPlay()
{
	Super::BeginPlay();
	for (TActorIterator<AStridesCourse> It(GetWorld()); It; ++It)
	{
		It->OnCourseEvent.AddDynamic(this, &AStridesHUD::OnCourseEvent);
		if (!Course.IsValid()) Course = *It;
	}
}

FString AStridesHUD::DebugText(const FString& S)
{
	return S.Replace(TEXT("<b>"), TEXT("")).Replace(TEXT("</b>"), TEXT("")).Replace(TEXT("▸"), TEXT(">"));
}

TArray<FString> AStridesHUD::ObjectiveLines(bool bRunLive, const FString& RunObjective, const FString& ActiveMissionId, const FString& MissionStatus)
{
	TArray<FString> Out;
	if (bRunLive && !RunObjective.IsEmpty()) Out.Add(RunObjective);
	if (!bRunLive || !ActiveMissionId.IsEmpty()) Out.Add(MissionStatus);
	return Out;
}

void AStridesHUD::OnCourseEvent(const FString& Kind, const FString& Text)
{
	// Épreuve : grand message, toast, astuce (l'interface d'épreuve est en tranche T7) ; clearHint n'a pas de texte.
	if (Text.IsEmpty()) return;
	LastEvent = DebugText(Text);
	EventT = 3.f;
}

void AStridesHUD::DrawHUD()
{
	Super::DrawHUD();
	// Jalon J4-A : écran titre ouvert (state 'title' du web : HUD masqué) : rien n'est dessiné derrière.
	if (const AStridesPlayerController* TPC = Cast<AStridesPlayerController>(GetOwningPlayerController()); TPC && TPC->IsTitleOpen()) return;
	EventT -= GetWorld()->GetDeltaSeconds();
	// Épreuve du monde cherchée à chaque image tant qu'aucune n'est connue (parcours apparu après BeginPlay, monde de test).
	if (!Course.IsValid() || (!Course->Run() && !Course->TrainingActive()))
		for (TActorIterator<AStridesCourse> It(GetWorld()); It; ++It)
			if (It->Run() || It->TrainingActive()) { Course = *It; break; }
	// Épreuve (mode concours) : interface d'épreuve UMG seule, ni lignes de débogage ni minicarte. Jalon J2d : le modèle
	// du HUD décide aussi pendant l'entraînement lancé au poteau du paddock (sans épreuve préalable).
	const bool bModel = Course.IsValid() && (Course->Run() || Course->TrainingActive());
	bDrewDebug = DebugVisible(bModel ? &Course->HudModel() : nullptr);
	LastOverlay = FRaceOverlay();
	if (!bDrewDebug)
	{
		DrawCourseGuide();
		DrawRaceOverlay();
		DrawPhone(GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>());
		DrawActiveCard();
		return;
	}
	LastCourseGuide.Reset();
	float Y = 40.f;
	// Lignes sur un fond sombre : lisibles sur le sable clair de la carrière et sur le ciel (relevé du contrôle J1).
	auto Line = [this, &Y](const FString& S, const FLinearColor& C = FLinearColor::White)
	{
		float TW = 0, TH = 0;
		GetTextSize(S, TW, TH, nullptr, 1.4f);
		DrawRect(FLinearColor(0.f, 0.f, 0.f, .55f), 32.f, Y - 3.f, TW + 16.f, TH + 6.f);
		DrawText(S, C, 40.f, Y, nullptr, 1.4f);
		Y += 30.f;
	};
	const APawn* P = GetOwningPawn();
	FString StatusShown;
	if (const AStridesHorse* H = Cast<AStridesHorse>(P))
	{
		const UStridesDataSubsystem* D = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
		const FString Gait = D && D->Gaits.IsValidIndex(H->GaitIndex) ? D->Gaits[H->GaitIndex].Name.ToString() : TEXT("?");
		Line(FString::Printf(TEXT("À cheval · %s · %.1f m/s (%.0f m/min) · cadence %.1f"), *Gait, H->SpeedMS, H->SpeedMS * 60, H->CadenceMS));
		if (H->Course) StatusShown = DebugText(H->Course->StatusText());
		if (H->Course) Line(StatusShown);
#if !UE_BUILD_SHIPPING
		if (H->IsDemoCourseActive()) Line(TEXT("DÉMONSTRATION AUTOMATIQUE DU PARCOURS"), FLinearColor(0.4f, 0.9f, 1.f));
#endif
		if (!H->LastTakeoff.IsEmpty()) Line(FString::Printf(TEXT("Dernier appel : %s"), *H->LastTakeoff));
		if (PLATFORM_IOS) Line(TEXT("Joystick : direction / cadence · boutons : SAUT, MONTER, ALLURE"), FLinearColor(0.8f, 0.8f, 0.8f));
#if UE_BUILD_SHIPPING
		else Line(TEXT("Flèches / ZQSD : direction et cadence · Maj / Ctrl : allure · SAUT : Espace (manette : A) · Descendre : E"), FLinearColor(0.8f, 0.8f, 0.8f));
#else
		else Line(TEXT("Flèches / ZQSD : direction et cadence · Maj / Ctrl : allure · SAUT : Espace (manette : A) · Démo parcours : F8 · Descendre : E"), FLinearColor(0.8f, 0.8f, 0.8f));
#endif
	}
	else if (const AStridesVehicle* V = Cast<AStridesVehicle>(P))
	{
		// Jalon J3b : au volant (rapport, vitesse, carburant : ordinateur de bord du web).
		Line(FString::Printf(TEXT("Au volant · %s%s"), *V->DriveText(), V->CarriesHorse() ? TEXT(" · cheval à bord") : TEXT("")));
		Line(PLATFORM_IOS ? TEXT("Joystick : direction, gaz et frein · Descendre : bouton (à l'arrêt)") : TEXT("Flèches / ZQSD : direction, gaz, frein et marche arrière · Descendre : E (à l'arrêt)"), FLinearColor(0.8f, 0.8f, 0.8f));
	}
	else Line(TEXT("À pied · Monter à cheval : E (à moins de 3 m) · Monter en voiture : E à la portière"));
	if (EventT > 0) Line(LastEvent, FLinearColor(1.f, 0.85f, 0.3f));
	if (const UStridesSaveSubsystem* S = GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>())
#if UE_BUILD_SHIPPING
		if (!S->LastMessage.IsEmpty()) Line(S->LastMessage, FLinearColor(0.6f, 0.9f, 0.6f));
#else
		if (!S->LastMessage.IsEmpty()) Line(S->LastMessage + TEXT(" (F5 sauvegarder · F9 recharger)"), FLinearColor(0.6f, 0.9f, 0.6f));
#endif
	if (const UStridesProgressionSubsystem* Progress = GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>())
	{
		// Jalon J3-C : heure et temps du web (game.js clockText, weatherText : « Éclaircies · 19 °C »).
		FString Weather;
		if (const UStridesSaveSubsystem* Sv = GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>())
		{
			const double Gt = Sv->GameTime;
			const int32 Day = strides::clock::dayOf(Gt);
			const double Hr = strides::clock::hourOf(Gt);
			Weather = FString::Printf(TEXT(" · %s · %s · %d °C"), UTF8_TO_TCHAR(strides::clock::clockText(Gt).c_str()), UTF8_TO_TCHAR(strides::clock::conditionText(Day, Hr).c_str()),
				FMath::RoundToInt(strides::clock::temperature(Day, Hr)));
		}
		LastWeatherLine = Weather;
		Line(FString::Printf(TEXT("%s · %d crédits · %d réputation%s"), *Progress->RankName(), Progress->Credits, Progress->Reputation, *Weather), FLinearColor(0.35f, 0.9f, 0.75f));
		// Objectif : celui de l'épreuve en cours (Run.text, setObjective du web ; vide : aucune ligne), puis l'état de la
		// mission de carrière quand l'une est lancée (touche M) ; « Aucune mission active » seulement hors épreuve.
		// Jalon J2c : l'entraînement à l'abord est une mission comme l'épreuve (missions.objectiveText).
		const bool bRunLive = Course.IsValid() && Course->MissionActive();
		const FString Objective = bRunLive ? Course->ObjectiveText() : FString();
		// Contrôle de J2c : pendant l'étape « rejoindre le paddock », la ligne d'état du parcours porte déjà l'objectif (même
		// texte) ; une ligne identique à celle de l'état n'est pas répétée.
		// Jalon J3 : objectif de la mission avec la distance (makeSteps withDist), comme au web.
		FString Status = Progress->MissionStatus();
		if (P && Progress->HasActiveTarget())
		{
			double MX, MY, MZ;
			StridesUnits::UEToWeb(P->GetActorLocation(), MX, MY, MZ);
			Status = UStridesProgressionSubsystem::WithDistance(Status, FVector2D::Distance(FVector2D(MX, MZ), Progress->ActiveTarget()));
		}
		for (const FString& L : ObjectiveLines(bRunLive, Objective, Progress->ActiveMissionId, Status))
			if (DebugText(L) != StatusShown) Line(DebugText(L), FLinearColor(1.f, 0.82f, 0.25f));
		if (!Progress->LastMessage.IsEmpty()) Line(Progress->LastMessage, FLinearColor(0.7f, 0.9f, 1.f));

		// Jalon J3 : guidage vers la cible de la mission (GPS du web : direct à cheval), ou vers le GPS posé à la main.
		LastGuideLine.Reset();
		FVector2D MissionGoal; FString MissionLabel;
		if (P && Progress->HasActiveTarget() && Progress->GuideTarget(MissionGoal, MissionLabel))
		{
			double MX, MY, MZ;
			StridesUnits::UEToWeb(P->GetActorLocation(), MX, MY, MZ);
			const FVector2D Me(MX, MZ);
			const FString G = PoleGuideText(FVector2D::Distance(Me, MissionGoal), RelativeAngleDeg(P->GetActorForwardVector(), MissionGoal - Me), *FString::Printf(TEXT("GPS · %s"), *MissionLabel));
			LastGuideLine = G;
			if (!G.IsEmpty()) Line(G, FLinearColor(1.f, .82f, .25f));
		}
		// Guidage vers le chrono du Pôle (lot J1-D) : sans mission de carrière ni épreuve en cours.
		if (P && !Progress->HasActiveTarget())
		{
			FVector2D Goal;
			// Jalon J2c : étape « rejoindre le paddock » de l'entraînement, même guidage (le GPS du web n'est pas porté).
			const strides::CsoTraining* Tr = Course.IsValid() ? Course->Training() : nullptr;
			const UStridesDataSubsystem* Dd = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
			const bool bPaddock = Tr && !Tr->finished() && Tr->step() == strides::CsoTrainingStep::Goto && Dd;
			if (bPaddock) Goal = FVector2D(Dd->PoleWarmup.X, Dd->PoleWarmup.Y);
			// GPS posé à la main (app Activités, « Itinéraire ») : même ligne, vers le départ de l'activité choisie.
			const bool bGps = !bPaddock && Progress->HasGps();
			if (bGps) Goal = Progress->GpsTarget();
			if (bPaddock || bGps || PoleGoal(Goal))
			{
				double CX, CY, CZ;
				StridesUnits::UEToWeb(P->GetActorLocation(), CX, CY, CZ);
				const FVector F = P->GetActorForwardVector();
				const UStridesDataSubsystem* Dt = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
				const FVector2D Me(CX, CZ);
				// Départ dans la carrière : par l'entrée de la lice (colliders du web), pas au travers ; près de la carrière, autour
				// des obstacles et des ailes (grille de guidage, 2e correction J1 : 4 refus au 4B sur le chemin du poteau).
				double Dist = 0;
				// Paddock : par son ouverture est (rectFence 'e', 6 m, milieu), pas au travers de la lice (partie J2d en paquet :
				// cheval arrêté contre la lice nord, ligne « tout droit »).
				const FVector2D Way = bPaddock ? PaddockGuideAim(Me, Goal, Dt, Course.Get(), Dist) : PoleGuideAim(Me, Goal, Dt, Course.Get(), Dist);
				const FString Name = bPaddock ? FString(TEXT("Paddock du Pôle")) : bGps ? FString::Printf(TEXT("GPS · %s"), *Progress->GpsName()) : FString(TEXT("Chrono du Pôle"));
				const FString G = PoleGuideText(Dist, RelativeAngleDeg(F, Way - Me), *Name);
				LastGuideLine = G;
				if (!G.IsEmpty()) Line(G, FLinearColor(1.f, .82f, .25f));
			}
		}
		DrawMinimap(P, Progress);
		DrawPhone(Progress);
	}
	// Invite de l'action proposée (poteau « Chrono ») : grande bulle en bas au centre, hors tactile.
	if (const AStridesPlayerController* SPC = Cast<AStridesPlayerController>(GetOwningPlayerController()))
	{
		const FString Prompt = ActionPrompt(SPC->ActionLabel(), AStridesPlayerController::TouchMode());
		LastPrompt = Prompt;
		if (!Prompt.IsEmpty() && Canvas)
		{
			float TW = 0, TH = 0;
			const float Sc = 2.2f;
			GetTextSize(Prompt, TW, TH, nullptr, Sc);
			const float BX = (Canvas->SizeX - TW) * .5f - 28.f, BY = Canvas->SizeY * .72f;
			DrawRect(FLinearColor(.02f, .03f, .04f, .82f), BX, BY, TW + 56.f, TH + 28.f);
			DrawRect(FLinearColor(.3f, .9f, .75f, 1.f), BX, BY, 6.f, TH + 28.f);
			DrawText(Prompt, FLinearColor::White, BX + 28.f, BY + 14.f, nullptr, Sc);
		}
	}
	if (const UStridesDataSubsystem* D = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>())
		for (const FString& L : D->LoadLog) if (L.Contains(TEXT("introuvable")) || L.Contains(TEXT("illisible"))) Line(L, FLinearColor::Red);
	DrawActiveCard();
}

void AStridesHUD::DrawActiveCard()
{
	CardButtons.Reset();
	LastCardShown.Reset();
	const AStridesCourse* C = nullptr;
	for (TActorIterator<AStridesCourse> It(GetWorld()); It; ++It) if (It->ActiveCardOpen()) { C = *It; break; }
	AStridesCourse::FCardView V;
	if (!C || !C->ActiveCard(V) || !Canvas) return;
	// Carte du web (screens.card) : voile, carte sombre centrée, en-tête, titre, lignes clé / valeur, classement, boutons.
	const float Ui = FMath::Clamp(Canvas->SizeY / 720.f, .6f, 2.f);
	const float W = FMath::Min(Canvas->SizeX - 32.f, 760.f * Ui);
	const float Pad = 22.f * Ui, LineH = 26.f * Ui;
	const float Rows = 3 + V.Rows.Num() + V.Table.Num() + (V.Body.IsEmpty() ? 0 : 2) + 2;
	const float H = FMath::Min(Canvas->SizeY - 24.f, Rows * LineH + 2 * Pad);
	const float X = (Canvas->SizeX - W) * .5f, Y = (Canvas->SizeY - H) * .5f;
	DrawRect(FLinearColor(0, 0, 0, .45f), 0, 0, Canvas->SizeX, Canvas->SizeY);
	DrawRect(FLinearColor(.035f, .04f, .05f, .97f), X, Y, W, H);
	DrawRect(FLinearColor(.49f, 1.f, .77f, 1.f), X, Y, W, 4.f * Ui);
	float TY = Y + Pad;
	DrawText(V.Kicker, FLinearColor(.49f, 1.f, .77f), X + Pad, TY, nullptr, 1.0f * Ui);
	TY += LineH;
	DrawText(V.Title, FLinearColor::White, X + Pad, TY, nullptr, 1.6f * Ui);
	TY += LineH * 1.5f;
	for (const TPair<FString, FString>& R : V.Rows)
	{
		DrawText(R.Key, FLinearColor(.62f, .66f, .7f), X + Pad, TY, nullptr, 1.0f * Ui);
		DrawText(R.Value, FLinearColor::White, X + Pad + 200.f * Ui, TY, nullptr, 1.0f * Ui);
		TY += LineH;
	}
	if (!V.Body.IsEmpty())
	{
		DrawText(V.Body, FLinearColor(.85f, .87f, .9f), X + Pad, TY, nullptr, .95f * Ui);
		TY += LineH * 1.4f;
	}
	const float Cols[4] = {0.f, 44.f, 380.f, 530.f};
	for (int32 I = 0; I < V.Table.Num(); I++)
	{
		const bool bMe = V.TableMe.IsValidIndex(I) && V.TableMe[I];
		if (bMe) DrawRect(FLinearColor(.12f, .42f, .34f, .6f), X + Pad - 6.f, TY - 2.f, W - 2 * Pad + 12.f, LineH);
		for (int32 K = 0; K < V.Table[I].Num() && K < 4; K++)
			DrawText(V.Table[I][K], bMe ? FLinearColor::White : FLinearColor(.85f, .87f, .9f), X + Pad + Cols[K] * Ui, TY, nullptr, .9f * Ui);
		TY += LineH * .9f;
	}
	// Boutons, de droite à gauche (principal à droite comme screens.card) ; bouton choisi entouré de vert.
	const FString Sel = C->CardSelectedId();
	float BX = X + W - Pad;
	const float BY = Y + H - Pad - 40.f * Ui;
	for (int32 I = V.Buttons.Num() - 1; I >= 0; I--)
	{
		const AStridesCourse::FCardButton& B = V.Buttons[I];
		float TW = 0, TH = 0;
		GetTextSize(B.Label, TW, TH, nullptr, 1.1f * Ui);
		const float BW = TW + 36.f * Ui, BH = 40.f * Ui;
		BX -= BW;
		if (B.Id == Sel) DrawRect(FLinearColor(.49f, 1.f, .77f, 1.f), BX - 3.f, BY - 3.f, BW + 6.f, BH + 6.f);
		DrawRect(B.bPrimary ? FLinearColor(.12f, .62f, .48f, 1.f) : FLinearColor(.2f, .22f, .25f, 1.f), BX, BY, BW, BH);
		DrawText(B.Label, FLinearColor::White, BX + 18.f * Ui, BY + (BH - TH) * .5f, nullptr, 1.1f * Ui);
		CardButtons.Add(TPair<FString, FBox2D>(B.Id, FBox2D(FVector2D(BX, BY), FVector2D(BX + BW, BY + BH))));
		BX -= 14.f * Ui;
	}
	LastCardShown = V.Title;
}

FString AStridesHUD::CardButtonAt(const FVector2D& P) const
{
	for (const TPair<FString, FBox2D>& B : CardButtons)
		if (B.Value.IsInside(P)) return B.Key;
	return FString();
}

AStridesHUD::FRaceOverlay AStridesHUD::RaceOverlay(const strides::CsoHud& H, bool bMission, const FString& Objective, const FString& Gait, double SpeedMS, const FString& ActionLabel, bool bTouch)
{
	// Mode concours du web (classe cso-ctl) : objectif masqué par cso-on (tableau d'épreuve) ou par un grand message ;
	// télémétrie (allure et vitesse, km/h arrondis : hud.js:252-262) et bouton d'action masqués par cso-sober seulement
	// (hud.js:390-392, styles.css:995). L'entraînement au paddock (kind 'cso-train') garde donc les trois.
	FRaceOverlay O;
	if (bMission && !H.objectiveOff() && !H.masked(strides::CsoHudElement::Objective) && !Objective.IsEmpty()) O.Objective = DebugText(Objective);
	if (!H.masked(strides::CsoHudElement::Telemetry)) O.Telemetry = FString::Printf(TEXT("%s · %d km/h"), *Gait, (int32)FMath::RoundHalfFromZero(FMath::Abs(SpeedMS) * 3.6));
	if (!H.masked(strides::CsoHudElement::Action)) O.Prompt = ActionPrompt(ActionLabel, bTouch);
	return O;
}

void AStridesHUD::DrawRaceOverlay()
{
	if (!Course.IsValid() || !Canvas) return;
	const AStridesHorse* H = Cast<AStridesHorse>(GetOwningPawn());
	const AStridesPlayerController* SPC = Cast<AStridesPlayerController>(GetOwningPlayerController());
	const UStridesDataSubsystem* D = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	const FString Gait = H && D && D->Gaits.IsValidIndex(H->GaitIndex) ? D->Gaits[H->GaitIndex].Name.ToString() : FString();
	LastOverlay = RaceOverlay(Course->HudModel(), Course->MissionActive(), Course->ObjectiveText(), Gait, H ? H->SpeedMS : 0.0,
		SPC ? SPC->ActionLabel() : FString(), AStridesPlayerController::TouchMode());
	if (!H) LastOverlay.Telemetry.Reset();
	// Toile sans FCanvas (tests Automation) : textes relevés, rien dessiné.
	if (!Canvas->Canvas) return;
	auto Pill = [this](const FString& S, float X, float Y, float Sc, const FLinearColor& Accent, bool bCenter)
	{
		float TW = 0, TH = 0;
		GetTextSize(S, TW, TH, nullptr, Sc);
		const float BX = bCenter ? (Canvas->SizeX - TW) * .5f - 22.f : X;
		DrawRect(FLinearColor(.02f, .03f, .04f, .78f), BX, Y, TW + 44.f, TH + 18.f);
		DrawRect(Accent, BX, Y, 5.f, TH + 18.f);
		DrawText(S, FLinearColor::White, BX + 22.f, Y + 9.f, nullptr, Sc);
	};
	// Objectif en haut à gauche (barre du haut du web), télémétrie en bas au centre, invite d'action comme hors épreuve.
	if (!LastOverlay.Objective.IsEmpty()) Pill(LastOverlay.Objective, 24.f, Canvas->SizeY * .035f, 1.5f, FLinearColor(1.f, .82f, .25f), false);
	if (!LastOverlay.Telemetry.IsEmpty()) Pill(LastOverlay.Telemetry, 0.f, Canvas->SizeY * .86f, 1.5f, FLinearColor(.49f, 1.f, .77f), true);
	if (!LastOverlay.Prompt.IsEmpty()) Pill(LastOverlay.Prompt, 0.f, Canvas->SizeY * .72f, 2.2f, FLinearColor(.3f, .9f, .75f), true);
	LastPrompt = LastOverlay.Prompt;
}

// ---- Téléphone (jalon J3 : phone.js, requests.js, activities-app.js) ----
// Applications de l'accueil du web (phone.js renderHome), dans l'ordre : identifiant de l'écran, libellé.
static const TCHAR* const GPhoneApps[][2] = {
	{TEXT("strides"), TEXT("Strides")}, {TEXT("map"), TEXT("Carte")}, {TEXT("messages"), TEXT("Messages")},
	{TEXT("stable"), TEXT("Mes chevaux")}, {TEXT("ecurie"), TEXT("Mon écurie")}, {TEXT("activities"), TEXT("Activités")},
	{TEXT("guide"), TEXT("Guide local")}, {TEXT("ranking"), TEXT("Classements")}, {TEXT("trophies"), TEXT("Trophées")},
	{TEXT("weather"), TEXT("Météo")}, {TEXT("photo"), TEXT("Photo")}, {TEXT("settings"), TEXT("Réglages")},
};

FString AStridesHUD::PhoneAppLabel(const FString& App)
{
	for (const auto& A : GPhoneApps) if (App == A[0]) return A[1];
	return App;
}

void AStridesHUD::DrawPhone(const UStridesProgressionSubsystem* Progress)
{
	Phone.Reset();
	PhoneCols = 1;
	PhoneBox = FBox2D(ForceInit);
	PhoneLines.Reset();
	if (!Progress || !Canvas) return;
	const AStridesPlayerController* PC = Cast<AStridesPlayerController>(GetOwningPlayerController());
	if (!PC || !PC->IsPhoneOpen()) return;
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	const FString App = PC->PhoneApp();
	const float W = FMath::Min(480.f, Canvas->SizeX - 32.f), Ht = FMath::Min(720.f, Canvas->SizeY - 40.f);
	const float X = (Canvas->SizeX - W) * .5f, Top = (Canvas->SizeY - Ht) * .5f;
	PhoneBox = FBox2D(FVector2D(X, Top), FVector2D(X + W, Top + Ht));
	const FLinearColor Ink(.94f, .94f, .92f), Mute(.62f, .66f, .7f), Accent(.3f, .9f, .75f), Gold(1.f, .82f, .25f), Card(.08f, .1f, .13f), Sel(.16f, .42f, .36f);
	DrawRect(FLinearColor(.0f, .0f, .0f, .45f), 0, 0, Canvas->SizeX, Canvas->SizeY);  // phone-layer
	DrawRect(FLinearColor(.025f, .03f, .04f, .98f), X, Top, W, Ht);
	auto Text = [&](const FString& S, const FLinearColor& C, float TX, float TY, float Sc)
	{
		DrawText(S, C, TX, TY, nullptr, Sc);
		PhoneLines.Add(S);
	};
	// Élément touchable : fond, cadre de sélection (clavier), boîte gardée pour la souris et le doigt.
	auto Item = [&](const FString& Id, float IX, float IY, float IW, float IH, const FLinearColor& Fill)
	{
		const bool bSel = Phone.Num() == PC->PhoneSelection();
		DrawRect(bSel ? Sel : Fill, IX, IY, IW, IH);
		if (bSel)
		{
			const FLinearColor B(.49f, 1.f, .77f);
			DrawLine(IX, IY, IX + IW, IY, B, 2.f); DrawLine(IX, IY + IH, IX + IW, IY + IH, B, 2.f);
			DrawLine(IX, IY, IX, IY + IH, B, 2.f); DrawLine(IX + IW, IY, IX + IW, IY + IH, B, 2.f);
		}
		Phone.Add({Id, FBox2D(FVector2D(IX, IY), FVector2D(IX + IW, IY + IH))});
	};
	const float L = X + 24, CW = W - 48;
	Text(TEXT("STRIDES"), Accent, L, Top + 18, 1.6f);
	float Y = Top + 62;
	double MeX = 0, MeY = 0, MeZ = 0;
	if (const APawn* P = GetOwningPawn()) StridesUnits::UEToWeb(P->GetActorLocation(), MeX, MeY, MeZ);
	const FVector2D Me(MeX, MeZ);
	auto Km = [](double D) { return FString::Printf(TEXT("%.1f km"), D / 1000.0).Replace(TEXT("."), TEXT(",")); };
	const FStridesMissionDefinition* Active = Progress->ActiveMissionId.IsEmpty() ? nullptr : Progress->FindMission(Progress->ActiveMissionId);
	const TArray<const FStridesMissionDefinition*> Offers = Progress->Offers(GetWorld()->GetTimeSeconds());
	if (App == TEXT("home"))
	{
		// Widget STRIDES (phone.js renderHome) : mission en cours, sinon nombre de missions disponibles.
		DrawRect(Card, L, Y, CW, 78);
		Text(TEXT("STRIDES"), Accent, L + 14, Y + 8, .85f);
		Text(Active ? Active->Title : Offers.Num() > 1 ? FString::Printf(TEXT("%d missions dispo"), Offers.Num()) : Offers.Num() ? TEXT("1 mission dispo") : TEXT("0 mission dispo"), Ink, L + 14, Y + 28, 1.2f);
		Text(Active ? Progress->MissionStatus() : FString::Printf(TEXT("%s · %d mission%s réalisée%s"), *Progress->RankName(), Progress->CompletedMissions.Num(), Progress->CompletedMissions.Num() > 1 ? TEXT("s") : TEXT(""), Progress->CompletedMissions.Num() > 1 ? TEXT("s") : TEXT("")), Mute, L + 14, Y + 54, .85f);
		Y += 96;
		PhoneCols = 3;
		const float TW = (CW - 2 * 10) / 3, TH = 70;
		for (int32 I = 0; I < UE_ARRAY_COUNT(GPhoneApps); ++I)
		{
			const float TX = L + (I % 3) * (TW + 10), TY = Y + (I / 3) * (TH + 10);
			Item(FString(TEXT("app:")) + GPhoneApps[I][0], TX, TY, TW, TH, Card);
			Text(GPhoneApps[I][1], Ink, TX + 10, TY + 26, .95f);
			if (I == 0 && Offers.Num() && !Active)
			{
				DrawRect(FLinearColor(.86f, .2f, .18f), TX + TW - 26, TY + 6, 20, 20);
				Text(FString::FromInt(Offers.Num()), Ink, TX + TW - 21, TY + 7, .8f);
			}
		}
	}
	else if (App == TEXT("strides"))
	{
		Text(TEXT("Strides · Missions"), Ink, L, Y, 1.25f);
		Y += 40;
		if (Active)
		{
			DrawRect(Card, L, Y, CW, 92);
			Text(TEXT("EN COURS"), Accent, L + 14, Y + 8, .8f);
			Text(Active->Title, Ink, L + 14, Y + 28, 1.1f);
			FVector2D T; FString Lb;
			Text(Progress->GuideTarget(T, Lb) ? UStridesProgressionSubsystem::WithDistance(Progress->MissionStatus(), FVector2D::Distance(Me, T)) : Progress->MissionStatus(), Mute, L + 14, Y + 56, .85f);
			Y += 100;
			Item(TEXT("abandon"), L, Y, CW, 40, Card);
			Text(TEXT("Abandonner la mission"), Ink, L + 14, Y + 10, .95f);
			Y += 52;
		}
		if (!Offers.Num()) { Text(TEXT("Aucune demande pour l'instant."), Mute, L, Y, .95f); Y += 34; }
		for (const FStridesMissionDefinition* M : Offers)
		{
			if (Y > Top + Ht - 150) break;
			const FVector2D Pl = Progress->PlacePosition(M->Place);
			Item(FString(TEXT("offer:")) + M->Id, L, Y, CW, 84, Card);
			// Carte d'offre du web (phone.js offerCard) : catégorie, titre, lieu (placeName), paiement (payLabel sinon montant),
			// réputation ; offre verrouillée : « Débloqué au palier … ».
			const FString Lock = Progress->OfferLock(M->Id);
			Text(M->Id == Progress->CheckpointMission ? FString::Printf(TEXT("%s · REPRISE"), *M->Category.ToUpper()) : M->Category.ToUpper(), Gold, L + 14, Y + 8, .8f);
			Text(M->Title, Lock.IsEmpty() ? Ink : Mute, L + 14, Y + 28, 1.1f);
			const FString Pay = M->PayLabel.IsEmpty() ? FString::Printf(TEXT("%d €"), M->Pay) : M->PayLabel;
			Text(Lock.IsEmpty() ? FString::Printf(TEXT("%s · %s · +%d réputation · %s"), *M->PlaceName, *Pay, M->Xp, *Km(FVector2D::Distance(Me, Pl))) : Lock, Mute, L + 14, Y + 56, .8f);
			Y += 94;
		}
	}
	else if (App == TEXT("request"))
	{
		const FStridesMissionDefinition* M = Progress->FindMission(PC->PhoneRequest());
		Text(TEXT("Demande reçue"), Mute, L, Y, .9f);
		Y += 28;
		if (M)
		{
			const FVector2D Pl = Progress->PlacePosition(M->Place);
			Text(M->Title, Ink, L, Y, 1.4f); Y += 40;
			Text(M->Category, Gold, L, Y, .95f); Y += 30;
			Text(FString::Printf(TEXT("Lieu : %s · %s"), *M->PlaceName, *Km(FVector2D::Distance(Me, Pl))), Ink, L, Y, .95f); Y += 28;
			Text(FString::Printf(TEXT("Rémunération : %s · +%d réputation"), *(M->PayLabel.IsEmpty() ? FString::Printf(TEXT("%d €"), M->Pay) : M->PayLabel), M->Xp), Ink, L, Y, .95f); Y += 28;
			const FString Lock = Progress->OfferLock(M->Id);
			if (!Lock.IsEmpty()) Text(Lock, Gold, L, Y, .9f);
			Y += 16;
			const FString Acc = PC->PhoneAcceptDone() ? TEXT("Demande acceptée — les créneaux sont réservés dans votre agenda.")
				: PC->PhoneConfirmArmed() ? TEXT("Confirmer l'acceptation ?") : TEXT("Accepter la mission");
			Item(TEXT("accept"), L, Y, CW, 48, FLinearColor(.12f, .42f, .34f));
			Text(Acc, Ink, L + 14, Y + 13, PC->PhoneAcceptDone() ? .75f : 1.05f);
			Y += 56;
			if (PC->PhoneConfirmArmed() && !PC->PhoneAcceptDone()) { Text(TEXT("Touchez à nouveau pour confirmer — le client sera informé."), Mute, L, Y, .8f); Y += 28; }
			Item(TEXT("refuse"), L, Y, CW, 44, Card);
			Text(TEXT("Refuser"), Ink, L + 14, Y + 11, 1.f);
			Y += 54;
		}
		else { Text(TEXT("Cette demande n'est plus disponible."), Mute, L, Y, .95f); Y += 34; }
	}
	else if (App == TEXT("activities"))
	{
		Text(TEXT("Activités"), Ink, L, Y, 1.25f);
		Text(TEXT("Défis · concours · chronos"), Mute, L, Y + 30, .85f);
		Y += 64;
		if (Active) { Text(FString::Printf(TEXT("En cours : %s"), *Active->Title), Accent, L, Y, .9f); Y += 30; }
		const UStridesSaveSubsystem* Save = GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>();
		// Jalon J4-D : défis à conditions fixes (activities-app.js challengeCard) : version, record, conditions, dernier
		// résultat, « Règles et départ ».
		if (const strides::ChallengeData* CD = Data ? Data->Challenges() : nullptr)
		{
			Text(TEXT("Défis à conditions fixes"), Gold, L, Y, .9f);
			Y += 30;
			for (const strides::ChallengeConfig& Cf : CD->challenges)
			{
				if (Y > Top + Ht - 260) break;
				const strides::ChallengeRecord* Rc = nullptr;
				if (Save) if (const auto It = Save->ChallengeRecords.find(Cf.id); It != Save->ChallengeRecords.end()) Rc = &It->second;
				DrawRect(Card, L, Y, CW, 118);
				Text(FString::Printf(TEXT("Défi · v%d"), Cf.version), Mute, L + 14, Y + 8, .75f);
				Text(Rc && Rc->hasBest ? FString::Printf(TEXT("Record : %s"), UTF8_TO_TCHAR(strides::challengeResultLine(Rc->best).c_str())) : FString(TEXT("Pas encore de record")), Gold, L + CW - 250, Y + 8, .8f);
				Text(UTF8_TO_TCHAR(Cf.name.c_str()), Ink, L + 14, Y + 26, 1.1f);
				Text(FString::Printf(TEXT("%s · %d obstacles · %s m · %s fourni · %d s accordées"), UTF8_TO_TCHAR(Cf.place.c_str()), (int32)Cf.obstacles.size(),
					*FString::Printf(TEXT("%.2f"), Cf.height).Replace(TEXT("."), TEXT(",")), UTF8_TO_TCHAR(Cf.horseName.c_str()), Cf.timeAllowed), Mute, L + 14, Y + 52, .72f);
				Text(Rc && Rc->hasLast ? FString::Printf(TEXT("Dernier résultat : %s · %d tentative%s"), UTF8_TO_TCHAR(strides::challengeResultLine(Rc->last).c_str()), Rc->attempts, Rc->attempts > 1 ? TEXT("s") : TEXT(""))
					: FString(TEXT("Aucune tentative pour l’instant.")), Mute, L + 14, Y + 70, .72f);
				Item(FString(TEXT("challenge:")) + UTF8_TO_TCHAR(Cf.id.c_str()), L + 14, Y + 88, 170, 26, FLinearColor(.12f, .42f, .34f));
				Text(TEXT("Règles et départ"), Ink, L + 24, Y + 91, .85f);
				Y += 128;
			}
		}
		Text(TEXT("Entraînements libres (chrono)"), Gold, L, Y, .9f);
		Y += 30;
		for (const AStridesActivityPost* Post : PC->Posts())
		{
			if (!Post || Y > Top + Ht - 150) continue;
			const strides::CsoActivity& A = Post->Activity();
			double Best = 0;
			const bool bBest = Save && Save->BestTime(UTF8_TO_TCHAR(A.id.c_str()), Best);
			DrawRect(Card, L, Y, CW, 104);
			Text(UTF8_TO_TCHAR(A.kind.c_str()), Mute, L + 14, Y + 8, .75f);
			Text(bBest ? FString::Printf(TEXT("%.2f s"), Best).Replace(TEXT("."), TEXT(",")) : FString(TEXT("—")), Gold, L + CW - 90, Y + 8, .85f);
			Text(UTF8_TO_TCHAR(A.name.c_str()), Ink, L + 14, Y + 26, 1.1f);
			Text(FString::Printf(TEXT("%s"), *Km(FVector2D::Distance(Me, FVector2D(A.startX, A.startZ)))), Mute, L + 14, Y + 52, .8f);
			Item(FString(TEXT("itinerary:")) + UTF8_TO_TCHAR(A.id.c_str()), L + 14, Y + 70, 140, 28, FLinearColor(.12f, .42f, .34f));
			Text(TEXT("Itinéraire"), Ink, L + 26, Y + 74, .9f);
			Y += 114;
		}
	}
	else if (App == TEXT("map"))
	{
		// Carte plein écran (minimap.js drawFullMap : nord en haut, toScreen = centre + (x − cx, z − cz) · échelle),
		// centrée sur le joueur, 700 m dans la plus petite dimension. Le geste (zoom, déplacement, repère au doigt) n'est
		// pas porté (choix n° 16).
		const float MX = L, MY = Y, MW = CW, MH = Ht - (Y - Top) - 110;
		DrawRect(FLinearColor(.12f, .2f, .11f, 1.f), MX, MY, MW, MH);
		const double Sc = FMath::Min(MW, MH) / 700.0;
		auto ToS = [&](const FVector2D& P) { return FVector2D(MX + MW * .5 + (P.X - Me.X) * Sc, MY + MH * .5 + (P.Y - Me.Y) * Sc); };
		const FBox2D Clip(FVector2D(MX, MY), FVector2D(MX + MW, MY + MH));
		if (Data)
		{
			for (const FStridesWorldRegion& R : Data->WorldRegions)
			{
				FVector2D A = ToS(R.Center - R.Size * .5), B = ToS(R.Center + R.Size * .5);
				A = FVector2D(FMath::Clamp(A.X, MX, MX + MW), FMath::Clamp(A.Y, MY, MY + MH));
				B = FVector2D(FMath::Clamp(B.X, MX, MX + MW), FMath::Clamp(B.Y, MY, MY + MH));
				if (B.X - A.X > 1 && B.Y - A.Y > 1) DrawRect(R.Kind == TEXT("competition") ? FLinearColor(.36f, .45f, .36f) : R.Kind == TEXT("stable") ? FLinearColor(.42f, .36f, .22f) : R.Kind == TEXT("nature") ? FLinearColor(.1f, .22f, .1f) : FLinearColor(.36f, .36f, .34f), A.X, A.Y, B.X - A.X, B.Y - A.Y);
			}
			const strides::AmbientData* Amb = Data->Ambient();
			if (Amb)
				for (const strides::LifeRoad& R : Amb->roads)
					for (size_t I = 1; I < R.pts.size(); ++I)
					{
						const FVector2D A = ToS(FVector2D(R.pts[I - 1].x, R.pts[I - 1].z)), B = ToS(FVector2D(R.pts[I].x, R.pts[I].z));
						if (Clip.IsInside(A) || Clip.IsInside(B)) DrawLine(A.X, A.Y, B.X, B.Y, FLinearColor(.89f, .89f, .87f), FMath::Max(1.5f, float(R.w * Sc)));
					}
			for (const FStridesPoi& Poi : Data->PointsOfInterest)
			{
				const FVector2D S = ToS(Poi.Position);
				if (!Clip.IsInside(S)) continue;
				DrawRect(FLinearColor(.96f, .95f, .93f), S.X - 4, S.Y - 4, 8, 8);
				if (S.X < MX + MW - 60) DrawText(Poi.Name, Ink, S.X + 7, S.Y - 8, nullptr, .7f);
			}
		}
		FVector2D T; FString Lb;
		if (Progress->GuideTarget(T, Lb))
		{
			FVector2D S = ToS(T);
			S = FVector2D(FMath::Clamp(S.X, MX + 6, MX + MW - 6), FMath::Clamp(S.Y, MY + 6, MY + MH - 6));
			DrawRect(Gold, S.X - 6, S.Y - 6, 12, 12);
			Text(FString::Printf(TEXT("GPS : %s"), *Lb), Gold, MX + 8, MY + MH + 6, .85f);
		}
		DrawRect(FLinearColor(.2f, .9f, 1.f), MX + MW * .5f - 4, MY + MH * .5f - 4, 8, 8);
		Text(TEXT("N ↑"), Ink, MX + MW - 34, MY + 6, .85f);
		Y = MY + MH + 30;
	}
	else
	{
		Text(PhoneAppLabel(App), Ink, L, Y, 1.25f);
		Y += 44;
		Text(TEXT("Application pas encore portée dans cette version."), Mute, L, Y, .9f);
		Text(TEXT("Prévue avec la boucle produit (jalon J4)."), Mute, L, Y + 26, .9f);
		Y += 70;
	}
	if (App != TEXT("home"))
	{
		const float BY = FMath::Min(Y + 6, Top + Ht - 96);
		Item(TEXT("back"), L, BY, 140, 36, Card);
		Text(TEXT("‹ Retour"), Ink, L + 14, BY + 8, .95f);
	}
	if (!PC->PhoneToast.IsEmpty())
	{
		DrawRect(FLinearColor(.12f, .42f, .34f, .95f), L, Top + Ht - 92, CW, 34);
		Text(PC->PhoneToast, Ink, L + 10, Top + Ht - 86, .78f);
	}
	Text(AStridesPlayerController::TouchMode() ? TEXT("Touchez un élément · touchez hors du téléphone pour le fermer")
		: TEXT("Flèches : choisir · Entrée : toucher · Retour arrière : revenir · Échap : fermer"), Mute, L, Top + Ht - 44, .72f);
}

// ---- Mini-carte (jalon J3 : minimap.js draw, portée par strides::MinimapView) ----
namespace
{
// Polygone convexe découpé par un polygone convexe (Sutherland-Hodgman) : la carte ronde est un polygone à 48 côtés.
double Area2(const TArray<FVector2D>& P)
{
	double A = 0;
	for (int32 I = 0; I < P.Num(); ++I) A += P[I].X * P[(I + 1) % P.Num()].Y - P[(I + 1) % P.Num()].X * P[I].Y;
	return A;
}
TArray<FVector2D> ClipConvex(const TArray<FVector2D>& Poly, const TArray<FVector2D>& Clip)
{
	// Même sens de parcours pour les deux polygones ; intérieur : du côté de l'aire du polygone de découpe.
	TArray<FVector2D> Out = Poly;
	const double Sign = Area2(Clip) >= 0 ? 1.0 : -1.0;
	if (Area2(Out) * Sign < 0) Algo::Reverse(Out);
	for (int32 E = 0; E < Clip.Num() && Out.Num(); ++E)
	{
		const FVector2D A = Clip[E], B = Clip[(E + 1) % Clip.Num()];
		auto Inside = [&](const FVector2D& P) { return ((B.X - A.X) * (P.Y - A.Y) - (B.Y - A.Y) * (P.X - A.X)) * Sign >= 0; };
		TArray<FVector2D> In = MoveTemp(Out);
		Out.Reset();
		for (int32 I = 0; I < In.Num(); ++I)
		{
			const FVector2D P = In[I], Q = In[(I + 1) % In.Num()];
			const bool bP = Inside(P), bQ = Inside(Q);
			if (bP) Out.Add(P);
			if (bP != bQ)
			{
				const FVector2D D = Q - P, Ed = B - A;
				const double Den = D.X * Ed.Y - D.Y * Ed.X;
				if (FMath::Abs(Den) > 1e-9) Out.Add(P + D * (((A.X - P.X) * Ed.Y - (A.Y - P.Y) * Ed.X) / Den));
			}
		}
	}
	return Out;
}
// Segment découpé par un disque ; faux s'il est entièrement dehors.
bool ClipToCircle(FVector2D& A, FVector2D& B, const FVector2D& C, double R)
{
	const FVector2D D = B - A, F = A - C;
	const double a = D.SizeSquared(), b = 2 * FVector2D::DotProduct(F, D), c = F.SizeSquared() - R * R;
	if (a < 1e-12) return c <= 0;
	const double Disc = b * b - 4 * a * c;
	if (Disc <= 0) return false;
	const double S = FMath::Sqrt(Disc), T0 = FMath::Max(0.0, (-b - S) / (2 * a)), T1 = FMath::Min(1.0, (-b + S) / (2 * a));
	if (T0 >= T1) return false;
	const FVector2D A0 = A;
	A = A0 + D * T0;
	B = A0 + D * T1;
	return true;
}
}

void AStridesHUD::DrawMinimap(const APawn* P, const UStridesProgressionSubsystem* Progress)
{
	// Carte du web (minimap.js) : ronde, centrée sur le joueur, TOURNÉE selon le regard de la caméra (le haut de la carte
	// est la direction regardée), portée de 150 m + 6 m par m/s (lissée), repères au bord, flèche, pastille N.
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	const float MapSize = 240.f, MapX = Canvas->SizeX - MapSize - 28.f, MapY = 104.f;
	const double W = MapSize, R = W / 2, Ui = W / 132.0;
	double CX = 0, CY = 0, CZ = 0;
	if (P) StridesUnits::UEToWeb(P->GetActorLocation(), CX, CY, CZ);
	const AStridesHorse* Horse = Cast<AStridesHorse>(P);
	const double Speed = Horse ? Horse->SpeedMS : P ? P->GetVelocity().Size2D() / 100.0 : 0.0;
	MiniView.step(GetWorld()->GetDeltaSeconds(), Speed, false);
	// Lacet du web depuis le regard de la caméra : avant Unreal (X, Y) = direction web (x, z) (StridesUnits).
	FVector Look = P ? P->GetActorForwardVector() : FVector::ForwardVector;
	if (const APlayerController* PCc = GetOwningPlayerController()) if (PCc->PlayerCameraManager) Look = PCc->PlayerCameraManager->GetCameraRotation().Vector();
	const double Yaw = strides::MinimapView::yawFromLook(Look.X, Look.Y);
	MiniYaw = Yaw;
	const FVector Fw = P ? P->GetActorForwardVector() : FVector::ForwardVector;
	const double Heading = FMath::Atan2(Fw.X, Fw.Y);
	const FVector2D O(MapX, MapY), C = O + FVector2D(R, R);
	auto ToMap = [&](double X, double Z) { const strides::MinimapPoint S = MiniView.toScreen(W, CX, CZ, Yaw, X, Z); return O + FVector2D(S.x, S.y); };
	TArray<FVector2D> Disc;
	for (int32 I = 0; I < 48; ++I) Disc.Add(C + FVector2D(FMath::Cos(-2 * PI * I / 48), FMath::Sin(-2 * PI * I / 48)) * (R - 1));
	auto Fill = [&](const TArray<FVector2D>& Poly, const FLinearColor& Col)
	{
		if (Poly.Num() < 3 || !Canvas->Canvas) return;  // toile de test sans FCanvas : rien à dessiner
		TArray<FCanvasUVTri> Tris;
		for (int32 I = 1; I + 1 < Poly.Num(); ++I)
		{
			FCanvasUVTri T;
			T.V0_Pos = Poly[0]; T.V1_Pos = Poly[I]; T.V2_Pos = Poly[I + 1];
			T.V0_Color = T.V1_Color = T.V2_Color = Col;
			Tris.Add(T);
		}
		FCanvasTriangleItem Item(Tris, GWhiteTexture);
		Item.BlendMode = SE_BLEND_Translucent;
		Canvas->DrawItem(Item);
	};
	// Fond (#16191d), puis zones du monde, routes (bord sombre puis chaussée), comme l'image de buildMapImage.
	Fill(Disc, FLinearColor(.16f, .27f, .14f, .92f));
	if (Data)
	{
		for (const FStridesWorldRegion& Rg : Data->WorldRegions)
		{
			const FVector2D A = Rg.Center - Rg.Size * .5, B = Rg.Center + Rg.Size * .5;
			TArray<FVector2D> Q = {ToMap(A.X, A.Y), ToMap(B.X, A.Y), ToMap(B.X, B.Y), ToMap(A.X, B.Y)};
			const FLinearColor Col = Rg.Kind == TEXT("competition") ? FLinearColor(.36f, .45f, .36f, .95f) : Rg.Kind == TEXT("stable") ? FLinearColor(.42f, .36f, .22f, .95f)
				: Rg.Kind == TEXT("nature") ? FLinearColor(.12f, .24f, .11f, .95f) : FLinearColor(.38f, .38f, .36f, .95f);
			Fill(ClipConvex(Q, Disc), Col);
		}
		const double Px = (W / 2) / MiniView.range;
		if (const strides::AmbientData* Amb = Data->Ambient())
			for (int32 Pass = 0; Pass < 2; ++Pass)
				for (const strides::LifeRoad& Rd : Amb->roads)
					for (size_t I = 1; I < Rd.pts.size(); ++I)
					{
						FVector2D A = ToMap(Rd.pts[I - 1].x, Rd.pts[I - 1].z), B = ToMap(Rd.pts[I].x, Rd.pts[I].z);
						if (!ClipToCircle(A, B, C, R - 1)) continue;
						const float Wd = FMath::Max(1.5f, float(Rd.w * Px));
						if (Pass == 0) DrawLine(A.X, A.Y, B.X, B.Y, FLinearColor(.06f, .06f, .07f), Wd + 1.4f);
						else DrawLine(A.X, A.Y, B.X, B.Y, Rd.id.rfind("t_", 0) == 0 ? FLinearColor(.75f, .75f, .74f) : FLinearColor(.89f, .89f, .87f), Wd);
					}
	}
	for (TActorIterator<AStridesFence> It(GetWorld()); It; ++It)
	{
		double X, Y, Z; StridesUnits::UEToWeb(It->GetActorLocation(), X, Y, Z);
		const FVector2D S = ToMap(X, Z);
		if (FVector2D::Distance(S, C) < R - 4) DrawRect(FLinearColor(.95f, .95f, .95f), S.X - 2, S.Y - 2, 4, 4);
	}
	// Itinéraire du GPS (gps.js : direct à cheval et à pied) : tirets clairs du joueur à la cible.
	FVector2D Goal; FString GoalLabel;
	bool bGoal = Progress && Progress->GuideTarget(Goal, GoalLabel);
	if (!bGoal && PoleGoal(Goal)) { bGoal = true; GoalLabel = TEXT("Chrono du Pôle"); }
	if (bGoal)
	{
		FVector2D A = ToMap(CX, CZ), B = ToMap(Goal.X, Goal.Y);
		if (ClipToCircle(A, B, C, R - 1))
		{
			const double Len = FVector2D::Distance(A, B);
			const FVector2D U = (B - A) / FMath::Max(Len, 1e-6);
			for (double T = 0; T < Len; T += 11 * Ui)
			{
				const FVector2D S = A + U * T, E = A + U * FMath::Min(Len, T + 6 * Ui);
				DrawLine(S.X, S.Y, E.X, E.Y, FLinearColor(.96f, .95f, .94f, .95f), 3.2f * Ui);
			}
		}
	}
	// Repères (getBlips) : lieux (non sticky, cachés hors du cadre), cible du GPS (sticky, ramenée au bord).
	LastBlips.Reset();
	auto Blip = [&](double X, double Z, bool bSticky, const FLinearColor& Col, float Size, const FString& Name)
	{
		strides::MinimapPoint S;
		if (!MiniView.blip(W, CX, CZ, Yaw, X, Z, bSticky, S)) return;
		const FVector2D Sp = O + FVector2D(S.x, S.y);
		DrawRect(FLinearColor(.07f, .07f, .08f), Sp.X - Size - 1, Sp.Y - Size - 1, 2 * Size + 2, 2 * Size + 2);
		DrawRect(Col, Sp.X - Size, Sp.Y - Size, 2 * Size, 2 * Size);
		LastBlips.Add(Name);
	};
	if (Data)
		for (const FStridesPoi& Poi : Data->PointsOfInterest)
		{
			if (Poi.Icon == TEXT("view") || Poi.Icon == TEXT("town")) continue;  // getBlips : ni points de vue ni ville
			Blip(Poi.Position.X, Poi.Position.Y, false, Poi.Icon == TEXT("shop") ? FLinearColor(.85f, .71f, .42f) : (Poi.Icon == TEXT("stable") || Poi.Icon == TEXT("pro")) ? FLinearColor(.61f, .62f, .64f) : FLinearColor(.96f, .95f, .94f), 4.f * Ui, Poi.Name);
		}
	if (bGoal) Blip(Goal.X, Goal.Y, true, FLinearColor(1.f, .7f, .1f), 5.f * Ui, TEXT("GPS"));
	// Fers d'or à moins de 70 m (game.js getBlips : collectibles.blips, kind 'shoe', petits).
	{
		TArray<FVector2D> Shoes;
		for (TActorIterator<AStridesCollectibles> It(GetWorld()); It; ++It) It->Remaining(Shoes, FVector2D(CX, CZ), It->Data().blipDist);
		for (const FVector2D& S : Shoes) Blip(S.X, S.Y, false, FLinearColor(.85f, .71f, .42f), 2.5f * Ui, TEXT("Fer d’or"));
	}
	// Cheval engagé quand le joueur est à pied (game.js:1382 getBlips kind 'horse', sticky : ramené au bord ; minimap.js
	// pastille #c8a46a de 4,5 px).
	if (P && !Horse)
		if (TActorIterator<AStridesHorse> It(GetWorld()); It)
		{
			double HX, HY, HZ;
			StridesUnits::UEToWeb(It->GetActorLocation(), HX, HY, HZ);
			Blip(HX, HZ, true, FLinearColor(.784f, .643f, .416f), 4.5f * Ui, TEXT("Cheval"));
		}
	if (bGoal) DrawText(FString::Printf(TEXT("%s %.0f m"), *GoalLabel, FVector2D::Distance(FVector2D(CX, CZ), Goal)), FLinearColor(1.f, .82f, .25f), MapX + 8, MapY + MapSize + 8, nullptr, 1.f);
	// Joueur (flèche) : rotate(−(cap − lacet + π)), pointe en (0, −8) ; sens de la toile (y vers le bas).
	if (P)
	{
		const double Rot = strides::MinimapView::arrowRotation(Heading, Yaw);
		auto Rp = [&](double X, double Y) { return C + FVector2D(X * FMath::Cos(Rot) - Y * FMath::Sin(Rot), X * FMath::Sin(Rot) + Y * FMath::Cos(Rot)) * Ui; };
		// Flèche du web : pointe (0, −8), ailes (±6, 6), creux (0, 3), dans le repère tourné.
		const FVector2D Tip = Rp(0, -8), Lw = Rp(6, 6), Mid = Rp(0, 3), Rw = Rp(-6, 6);
		Fill({Tip, Lw, Mid}, FLinearColor(.96f, .95f, .94f));
		Fill({Tip, Mid, Rw}, FLinearColor(.96f, .95f, .94f));
		LastArrowDir = (Tip - C).GetSafeNormal();
	}
	// Nord : pastille au bord, dans la direction du nord du monde (−z).
	const strides::MinimapPoint N = MiniView.north(W, CX, CZ, Yaw);
	const FVector2D Np = O + FVector2D(N.x, N.y);
	TArray<FVector2D> Dot;
	for (int32 I = 0; I < 16; ++I) Dot.Add(Np + FVector2D(FMath::Cos(2 * PI * I / 16), FMath::Sin(2 * PI * I / 16)) * 7 * Ui);
	Fill(Dot, FLinearColor(.07f, .07f, .08f));
	DrawText(TEXT("N"), FLinearColor(.96f, .95f, .94f), Np.X - 4 * Ui, Np.Y - 6 * Ui, nullptr, Ui * .75f);
	LastNorth = Np - C;
	for (int32 I = 0; I < 48; ++I) DrawLine(Disc[I].X, Disc[I].Y, Disc[(I + 1) % 48].X, Disc[(I + 1) % 48].Y, FLinearColor(.85f, .9f, .95f, .9f), 1.5f);
}

FString AStridesHUD::ActionPrompt(const FString& Label, bool bTouch)
{
	if (Label.IsEmpty() || bTouch) return FString();
	return FString::Printf(TEXT("E  ·  %s"), *Label);
}

FVector2D AStridesHUD::MinimapPoint(const FVector2D& Center, double CX, double CZ, double PxPerM, const FVector2D& Web)
{
	// Carte du web : px = (x + half)·S, pz = (z + half)·S : x vers la droite, z vers le bas de l'image.
	return Center + FVector2D((Web.X - CX) * PxPerM, (Web.Y - CZ) * PxPerM);
}

FVector2D AStridesHUD::MinimapHeading(const FVector& Forward)
{
	// Avant Unreal (X, Y) = direction web (x, z) (StridesUnits) : même sens que MinimapPoint.
	return FVector2D(Forward.X, Forward.Y).GetSafeNormal();
}

FVector2D AStridesHUD::PoleWaypoint(const FVector2D& Me, const FVector2D& Goal, const FVector2D& Arena, double W, double D)
{
	auto Inside = [&](const FVector2D& P, double M) { return FMath::Abs(P.X - Arena.X) < W / 2 + M && FMath::Abs(P.Y - Arena.Y) < D / 2 + M; };
	// Cible dans la carrière, cavalier dehors : point devant l'ouverture de la lice (côté sud, rectFence 's', 7 m, milieu),
	// 5 m à l'extérieur ; une fois à moins de 3 m de ce point (ou dedans), la cible elle-même.
	// Tout près de la cible (entrée de la lice comprise) : la cible directement, sans aller-retour au point de passage.
	if (!Inside(Goal, 0) || Inside(Me, -0.5) || FVector2D::Distance(Me, Goal) < 15) return Goal;
	const FVector2D Gate(Arena.X, Arena.Y + D / 2 + 5);
	if (FVector2D::Distance(Me, Gate) < 3 || (FMath::Abs(Me.X - Arena.X) < 2.5 && Me.Y > Arena.Y + D / 2 - 1)) return Goal;
	return Gate;
}

FVector2D AStridesHUD::PaddockWaypoint(const FVector2D& Me, const FVector2D& Goal, const FVector4& R, double& OutDist)
{
	// R : centre (X, Y) du paddock dans le repère web, largeur Z (selon x), profondeur W (selon z) ; ouverture côté est.
	const double HX = R.Z / 2, HZ = R.W / 2;
	const FVector2D Gate(R.X + HX + 5, R.Y);
	const bool bInside = FMath::Abs(Me.X - R.X) < HX - 0.5 && FMath::Abs(Me.Y - R.Y) < HZ - 0.5;
	const bool bCorridor = FMath::Abs(Me.Y - R.Y) < 2.5 && Me.X > R.X + HX - 1;
	if (bInside || bCorridor || FVector2D::Distance(Me, Gate) < 3)
	{
		OutDist = FVector2D::Distance(Me, Goal);
		return Goal;
	}
	if (Me.X < R.X + HX + 2)
	{
		// À l'ouest, au nord ou au sud du paddock : d'abord le coin est le plus proche, dehors.
		const FVector2D Corner(R.X + HX + 5, Me.Y < R.Y ? R.Y - HZ - 5 : R.Y + HZ + 5);
		if (FVector2D::Distance(Me, Corner) >= 3)
		{
			OutDist = FVector2D::Distance(Me, Corner) + FVector2D::Distance(Corner, Gate) + FVector2D::Distance(Gate, Goal);
			return Corner;
		}
	}
	OutDist = FVector2D::Distance(Me, Gate) + FVector2D::Distance(Gate, Goal);
	return Gate;
}

FVector2D AStridesHUD::PaddockGuideAim(const FVector2D& Me, const FVector2D& Goal, const UStridesDataSubsystem* Dt, const AStridesCourse* C, double& OutDist)
{
	if (!Dt) { OutDist = FVector2D::Distance(Me, Goal); return Goal; }
	const FVector4 R(Dt->PoleWarmup.X, Dt->PoleWarmup.Y, Dt->PoleWarmup.Z, Dt->PoleWarmup.W);
	const FVector2D A = Dt->PoleArena;
	const double HW = Dt->PlanArena().w / 2, HD = Dt->PlanArena().d / 2;
	// Sortie de la carrière (l'entraînement part du bilan, cheval dans la carrière) : par l'ouverture sud de la lice
	// (rectFence 's', milieu), autour des obstacles (grille de guidage), puis le coin sud-ouest extérieur et l'allée
	// entre la carrière et le paddock (partie J2d en paquet : cheval arrêté contre la lice ouest de la carrière).
	const FVector2D Out(A.X, A.Y + HD + 5), SW(A.X - HW - 5, A.Y + HD + 5);
	double Rest = 0;
	PaddockWaypoint(SW, Goal, R, Rest);
	if (FMath::Abs(Me.X - A.X) < HW - 0.5 && FMath::Abs(Me.Y - A.Y) < HD - 0.5)
	{
		const FVector2D Exit = FMath::Abs(Me.X - A.X) < 2.5 ? Out : FVector2D(A.X, A.Y + HD - 3);
		OutDist = FVector2D::Distance(Me, Exit) + FVector2D::Distance(Exit, Out) + FVector2D::Distance(Out, SW) + Rest;
		if (C && C->GuideMap().inside(Me.X, Me.Y)) { double Dd = 0; return C->GuideAim(Me, Exit, &Dd); }
		return Exit;
	}
	// Au sud de la carrière, à l'est de son coin sud-ouest : le coin d'abord (la ligne droite couperait la carrière).
	if (Me.Y > A.Y + HD - 0.5 && Me.X > A.X - HW - 2 && FVector2D::Distance(Me, SW) >= 3)
	{
		OutDist = FVector2D::Distance(Me, SW) + Rest;
		return SW;
	}
	return PaddockWaypoint(Me, Goal, R, OutDist);
}

FVector2D AStridesHUD::PoleGuideAim(const FVector2D& Me, const FVector2D& Goal, const UStridesDataSubsystem* Dt, const AStridesCourse* C, double& OutDist)
{
	FVector2D Way = Dt ? PoleWaypoint(Me, Goal, Dt->PoleArena, Dt->PlanArena().w, Dt->PlanArena().d) : Goal;
	OutDist = FVector2D::Distance(Me, Way) + FVector2D::Distance(Way, Goal);
	if (C && C->GuideMap().inside(Me.X, Me.Y)) Way = C->GuideAim(Me, Goal, &OutDist);
	return Way;
}

double AStridesHUD::RelativeAngleDeg(const FVector& Forward, const FVector2D& ToGoalWeb)
{
	// Avant Unreal (X, Y) = direction web (x, z) (StridesUnits) ; positif : la cible est à droite du cavalier.
	return FMath::RadiansToDegrees(FMath::Atan2(Forward.X * ToGoalWeb.Y - Forward.Y * ToGoalWeb.X, Forward.X * ToGoalWeb.X + Forward.Y * ToGoalWeb.Y));
}

FString AStridesHUD::CourseGuideText(const FString& Label, double Distance, double RelAngleDeg)
{
	if (Distance < 4.0) return FString();
	const double A = FMath::Abs(RelAngleDeg);
	const TCHAR* Way = A < 20.0 ? TEXT("tout droit") : A > 135.0 ? TEXT("demi-tour") : RelAngleDeg > 0 ? TEXT("à droite") : TEXT("à gauche");
	return FString::Printf(TEXT("%s · %.0f m · %s"), *Label, Distance, Way);
}

void AStridesHUD::DrawCourseGuide()
{
	LastCourseGuide.Reset();
	const APawn* P = GetOwningPawn();
	FVector2D Goal;
	FString Label;
	if (!P || !Canvas || !Course.IsValid()) return;
	double CX, CY, CZ;
	StridesUnits::UEToWeb(P->GetActorLocation(), CX, CY, CZ);
	double Dist = 0;
	const FVector F = P->GetActorForwardVector();
	const AStridesHorse* H = Cast<AStridesHorse>(P);
	if (!Course->CourseGuide(Goal, Label, FVector2D(CX, CZ), &Dist, FVector2D(F.X, F.Y).GetSafeNormal(), H ? H->CsoState().speed : 0.0)) return;
	const FVector2D D(Goal.X - CX, Goal.Y - CZ);
	const FString G = CourseGuideText(Label, Dist, RelativeAngleDeg(F, D));
	LastCourseGuide = G;
	if (G.IsEmpty() || !Canvas->Canvas) return;
	// Pastille sous le tableau du chrono (en haut à gauche), fond sombre, texte clair.
	float TW = 0, TH = 0;
	const float Sc = 1.6f;
	GetTextSize(G, TW, TH, nullptr, Sc);
	const float BX = 24.f, BY = Canvas->SizeY * .11f;
	DrawRect(FLinearColor(.02f, .03f, .04f, .78f), BX, BY, TW + 36.f, TH + 18.f);
	DrawRect(FLinearColor(.49f, 1.f, .77f, 1.f), BX, BY, 5.f, TH + 18.f);
	DrawText(G, FLinearColor::White, BX + 20.f, BY + 9.f, nullptr, Sc);
}

FString AStridesHUD::PoleGuideText(double Distance, double RelAngleDeg, const TCHAR* Name)
{
	if (Distance < 6.0) return FString();
	const double A = FMath::Abs(RelAngleDeg);
	const TCHAR* Way = A < 20.0 ? TEXT("tout droit") : A > 135.0 ? TEXT("demi-tour") : RelAngleDeg > 0 ? TEXT("à droite") : TEXT("à gauche");
	FString D = Distance < 1000.0 ? FString::Printf(TEXT("%.0f m"), Distance) : FString::Printf(TEXT("%.1f km"), Distance / 1000.0).Replace(TEXT("."), TEXT(","));
	return FString::Printf(TEXT("%s · %s · %s"), Name, *D, Way);
}

bool AStridesHUD::PoleGoal(FVector2D& Out) const
{
	const AStridesPlayerController* SPC = Cast<AStridesPlayerController>(GetOwningPlayerController());
	const AStridesActivityPost* Post = SPC ? SPC->ActivityPost() : nullptr;
	if (!Post || Post->MissionActive()) return false;
	Out = FVector2D(Post->Activity().startX, Post->Activity().startZ);
	return true;
}
