#include "StridesHUD.h"
#include "StridesActivityPost.h"
#include "Engine/Canvas.h"
#include "EngineUtils.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesFence.h"
#include "StridesHorse.h"
#include "StridesPlayerController.h"
#include "StridesProgressionSubsystem.h"
#include "StridesSaveSubsystem.h"
#include "StridesUnits.h"

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
	EventT -= GetWorld()->GetDeltaSeconds();
	// Épreuve du monde cherchée à chaque image tant qu'aucune n'est connue (parcours apparu après BeginPlay, monde de test).
	if (!Course.IsValid() || !Course->Run())
		for (TActorIterator<AStridesCourse> It(GetWorld()); It; ++It)
			if (It->Run()) { Course = *It; break; }
	// Épreuve (mode concours) : interface d'épreuve UMG seule, ni lignes de débogage ni minicarte.
	bDrewDebug = DebugVisible(Course.IsValid() && Course->Run() ? &Course->HudModel() : nullptr);
	if (!bDrewDebug)
	{
		DrawCourseGuide();
		DrawPhone(GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>());
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
	if (const AStridesHorse* H = Cast<AStridesHorse>(P))
	{
		const UStridesDataSubsystem* D = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
		const FString Gait = D && D->Gaits.IsValidIndex(H->GaitIndex) ? D->Gaits[H->GaitIndex].Name.ToString() : TEXT("?");
		Line(FString::Printf(TEXT("À cheval · %s · %.1f m/s (%.0f m/min) · cadence %.1f"), *Gait, H->SpeedMS, H->SpeedMS * 60, H->CadenceMS));
		if (H->Course) Line(DebugText(H->Course->StatusText()));
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
	else Line(TEXT("À pied · Monter à cheval : E (à moins de 3 m)"));
	if (EventT > 0) Line(LastEvent, FLinearColor(1.f, 0.85f, 0.3f));
	if (const UStridesSaveSubsystem* S = GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>())
#if UE_BUILD_SHIPPING
		if (!S->LastMessage.IsEmpty()) Line(S->LastMessage, FLinearColor(0.6f, 0.9f, 0.6f));
#else
		if (!S->LastMessage.IsEmpty()) Line(S->LastMessage + TEXT(" (F5 sauvegarder · F9 recharger)"), FLinearColor(0.6f, 0.9f, 0.6f));
#endif
	if (const UStridesProgressionSubsystem* Progress = GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>())
	{
		Line(FString::Printf(TEXT("%s · %d crédits · %d réputation"), *Progress->RankName(), Progress->Credits, Progress->Reputation), FLinearColor(0.35f, 0.9f, 0.75f));
		// Objectif : celui de l'épreuve en cours (Run.text, setObjective du web ; vide : aucune ligne), puis l'état de la
		// mission de carrière quand l'une est lancée (touche M) ; « Aucune mission active » seulement hors épreuve.
		const strides::CsoRun* Run = Course.IsValid() ? Course->Run() : nullptr;
		const bool bRunLive = Run && !Run->finished();
		const FString Objective = bRunLive ? FString(UTF8_TO_TCHAR(Run->text().c_str())) : FString();
		for (const FString& L : ObjectiveLines(bRunLive, Objective, Progress->ActiveMissionId, Progress->MissionStatus())) Line(DebugText(L), FLinearColor(1.f, 0.82f, 0.25f));
		if (!Progress->LastMessage.IsEmpty()) Line(Progress->LastMessage, FLinearColor(0.7f, 0.9f, 1.f));

		// Guidage vers le chrono du Pôle (lot J1-D) : sans mission de carrière ni épreuve en cours.
		if (P && !Progress->HasActiveTarget())
		{
			FVector2D Goal;
			if (PoleGoal(Goal))
			{
				double CX, CY, CZ;
				StridesUnits::UEToWeb(P->GetActorLocation(), CX, CY, CZ);
				const FVector F = P->GetActorForwardVector();
				const UStridesDataSubsystem* Dt = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
				const FVector2D Me(CX, CZ);
				// Départ dans la carrière : par l'entrée de la lice (colliders du web), pas au travers.
				const FVector2D Way = Dt ? PoleWaypoint(Me, Goal, Dt->PoleArena, Dt->PlanArena().w, Dt->PlanArena().d) : Goal;
				const double Dist = FVector2D::Distance(Me, Way) + FVector2D::Distance(Way, Goal);
				const FString G = PoleGuideText(Dist, RelativeAngleDeg(F, Way - Me));
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
}

// Téléphone ouvert (P / Tab, M sur la carte) : panneau dessiné aussi en épreuve (le web ouvre le téléphone en concours ;
// tranche T8 : il fige le cheval et le chrono).
void AStridesHUD::DrawPhone(const UStridesProgressionSubsystem* Progress)
{
	if (!Progress) return;
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	const AStridesPlayerController* Controller = Cast<AStridesPlayerController>(GetOwningPlayerController());
	if (Controller && Controller->IsPhoneOpen())
	{
		const float W = 440.f, Ht = FMath::Min(650.f, Canvas->SizeY - 80.f), X = (Canvas->SizeX - W) * .5f, Top = 40.f;
		DrawRect(FLinearColor(.025f, .03f, .04f, .96f), X, Top, W, Ht);
		DrawText(TEXT("STRIDES"), FLinearColor(.3f, .9f, .75f), X + 28, Top + 24, nullptr, 1.8f);
		DrawText(Controller->PhoneApp() == TEXT("map") ? TEXT("Carte · M pour fermer (application Carte non portée)") : TEXT("Téléphone · P ou Tab pour fermer"), FLinearColor(.7f, .75f, .8f), X + 28, Top + 62, nullptr, 1.f);
		float AppY = Top + 108;
		if (Data) for (int32 I = 0; I < Data->PhoneApps.Num(); ++I)
		{
			const int32 Col = I % 2, Row = I / 2;
			DrawRect(FLinearColor(.08f, .1f, .13f, 1.f), X + 26 + Col * 198, AppY + Row * 48, 184, 38);
			DrawText(Data->PhoneApps[I], FLinearColor::White, X + 38 + Col * 198, AppY + 8 + Row * 48, nullptr, .9f);
		}
		const float MissionY = AppY + 260;
		DrawText(TEXT("MISSION ACTIVE"), FLinearColor(.3f, .9f, .75f), X + 28, MissionY, nullptr, 1.f);
		DrawText(Progress->MissionStatus(), FLinearColor::White, X + 28, MissionY + 32, nullptr, 1.05f);
		DrawText(TEXT("N / bouton MISSION : lancer la prochaine mission"), FLinearColor(1.f, .82f, .25f), X + 28, MissionY + 72, nullptr, .85f);
		DrawText(FString::Printf(TEXT("Carrière : %d / %d missions"), Progress->CompletedMissions.Num(), Data ? Data->Missions.Num() : 0), FLinearColor(.8f, .84f, .9f), X + 28, MissionY + 108, nullptr, 1.f);
	}
}

void AStridesHUD::DrawMinimap(const APawn* P, const UStridesProgressionSubsystem* Progress)
{
	// Vue nord en haut centrée sur le joueur, 320 m de côté : à l'échelle du monde entier (1,2 km sur
	// 190 px), le joueur restait un point immobile. Coordonnées du jeu web : (x, z) au sol, z vers le haut.
	const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
	const float MapSize = 240.f, MapX = Canvas->SizeX - MapSize - 28.f, MapY = 104.f;
	const double RadiusM = 160.0, PxPerM = MapSize / (2.0 * RadiusM);
	double CX = 0, CY = 0, CZ = 0;
	if (P) StridesUnits::UEToWeb(P->GetActorLocation(), CX, CY, CZ);
	const FVector2D Center(MapX + MapSize * .5f, MapY + MapSize * .5f);
	auto ToMap = [&](const FVector2D& Web) { return MinimapPoint(Center, CX, CZ, PxPerM, Web); };
	auto ToMapUE = [&](const FVector& UE) { double X, Y, Z; StridesUnits::UEToWeb(UE, X, Y, Z); return ToMap(FVector2D(X, Z)); };
	auto Inside = [&](const FVector2D& S) { return S.X >= MapX && S.X <= MapX + MapSize && S.Y >= MapY && S.Y <= MapY + MapSize; };
	// Segment découpé au cadre (Liang-Barsky).
	auto Segment = [&](FVector2D A, FVector2D B, const FLinearColor& Color, float Thickness)
	{
		const FVector2D D = B - A;
		double T0 = 0, T1 = 1;
		const double Pv[4] = {-D.X, D.X, -D.Y, D.Y};
		const double Qv[4] = {A.X - MapX, MapX + MapSize - A.X, A.Y - MapY, MapY + MapSize - A.Y};
		for (int32 I = 0; I < 4; ++I)
		{
			if (FMath::IsNearlyZero(Pv[I])) { if (Qv[I] < 0) return; continue; }
			const double R = Qv[I] / Pv[I];
			if (Pv[I] < 0) T0 = FMath::Max(T0, R); else T1 = FMath::Min(T1, R);
			if (T0 > T1) return;
		}
		const FVector2D S = A + D * T0, E = A + D * T1;
		DrawLine(S.X, S.Y, E.X, E.Y, Color, Thickness);
	};
	auto Box = [&](FVector2D Min, FVector2D Max, const FLinearColor& Color)
	{
		const float X0 = FMath::Clamp<float>(FMath::Min(Min.X, Max.X), MapX, MapX + MapSize), X1 = FMath::Clamp<float>(FMath::Max(Min.X, Max.X), MapX, MapX + MapSize);
		const float Y0 = FMath::Clamp<float>(FMath::Min(Min.Y, Max.Y), MapY, MapY + MapSize), Y1 = FMath::Clamp<float>(FMath::Max(Min.Y, Max.Y), MapY, MapY + MapSize);
		if (X1 - X0 > .5f && Y1 - Y0 > .5f) DrawRect(Color, X0, Y0, X1 - X0, Y1 - Y0);
	};

	DrawRect(FLinearColor(.16f, .27f, .14f, .9f), MapX, MapY, MapSize, MapSize);
	if (Data)
	{
		for (const FStridesWorldRegion& R : Data->WorldRegions)
		{
			const FLinearColor C = R.Kind == TEXT("competition") ? FLinearColor(.36f, .45f, .36f, .95f)
				: R.Kind == TEXT("stable") ? FLinearColor(.42f, .36f, .22f, .95f)
				: R.Kind == TEXT("nature") ? FLinearColor(.12f, .24f, .11f, .95f)
				: FLinearColor(.38f, .38f, .36f, .95f);
			Box(ToMap(R.Center - R.Size * .5), ToMap(R.Center + R.Size * .5), C);
		}
		for (const FStridesRoad& Road : Data->Roads)
			for (int32 I = 1; I < Road.Points.Num(); ++I)
				Segment(ToMap(Road.Points[I - 1]), ToMap(Road.Points[I]), FLinearColor(.78f, .74f, .62f), FMath::Max(2.f, float(Road.Width * PxPerM)));
	}
	for (TActorIterator<AStridesFence> It(GetWorld()); It; ++It)
	{
		const FVector2D S = ToMapUE(It->GetActorLocation());
		if (Inside(S)) DrawRect(FLinearColor(.95f, .95f, .95f), S.X - 2, S.Y - 2, 4, 4);
	}
	if (Data)
		for (const FStridesPoi& Poi : Data->PointsOfInterest)
		{
			const FVector2D S = ToMap(Poi.Position);
			if (!Inside(S)) continue;
			const FLinearColor C = Poi.Icon == TEXT("event") ? FLinearColor(.3f, .6f, 1.f) : (Poi.Icon == TEXT("shop") || Poi.Icon == TEXT("pro")) ? FLinearColor(1.f, .6f, .2f) : FLinearColor(.85f, .55f, .35f);
			DrawRect(C, S.X - 4, S.Y - 4, 8, 8);
			if (S.X < MapX + MapSize - 30)
			{
				DrawText(Poi.Name, FLinearColor(0, 0, 0, .8f), S.X + 7, S.Y - 7, nullptr, .8f);
				DrawText(Poi.Name, FLinearColor(1.f, 1.f, .95f), S.X + 6, S.Y - 8, nullptr, .8f);
			}
		}
	for (TActorIterator<AStridesHorse> It(GetWorld()); It; ++It)
	{
		if (*It == P) continue;
		const FVector2D S = ToMapUE(It->GetActorLocation());
		if (Inside(S)) DrawRect(FLinearColor(.55f, .32f, .16f), S.X - 4, S.Y - 4, 8, 8);
	}
	// Cible GPS : au bord du cadre dans sa direction quand elle est hors champ ; sans mission, le chrono du Pôle (J1-D).
	FVector2D Goal;
	const bool bMissionGoal = Progress && Progress->HasActiveTarget();
	if (bMissionGoal) Goal = Progress->ActiveTarget();
	if (bMissionGoal || PoleGoal(Goal))
	{
		FVector2D T = ToMap(Goal);
		if (!Inside(T))
		{
			const FVector2D Dir = (T - Center).GetSafeNormal();
			const float K = (MapSize * .5f - 8.f) / FMath::Max(FMath::Abs(Dir.X), FMath::Abs(Dir.Y));
			T = Center + Dir * K;
		}
		DrawRect(FLinearColor(1.f, .7f, .1f), T.X - 6, T.Y - 6, 12, 12);
		DrawText(FString::Printf(TEXT("%s %.0f m"), bMissionGoal ? TEXT("GPS") : TEXT("Chrono du Pôle"), FVector2D::Distance(FVector2D(CX, CZ), Goal)), FLinearColor(1.f, .82f, .25f), MapX + 8, MapY + MapSize + 8, nullptr, 1.f);
	}
	if (P)
	{
		// Flèche de cap : direction avant de l'acteur ramenée sur la carte.
		const FVector2D Dir = MinimapHeading(P->GetActorForwardVector());
		const FVector2D Side(-Dir.Y, Dir.X);
		// Flèche effilée (pointe à 16 px, base étroite) : l'ancienne (pointe 12 px, base 14 px) se lisait dans les deux sens
		// (partie manuelle J1 du 26/11/2026).
		const FVector2D Tip = Center + Dir * 16.f, L = Center - Dir * 6.f + Side * 5.f, R = Center - Dir * 6.f - Side * 5.f;
		const FLinearColor C(.2f, .9f, 1.f);
		DrawLine(Tip.X, Tip.Y, L.X, L.Y, C, 2.5f);
		DrawLine(Tip.X, Tip.Y, R.X, R.Y, C, 2.5f);
		DrawLine(L.X, L.Y, R.X, R.Y, C, 2.5f);
		DrawRect(C, Center.X - 2, Center.Y - 2, 4, 4);
	}
	const FLinearColor Frame(.85f, .9f, .95f, .9f);
	DrawLine(MapX, MapY, MapX + MapSize, MapY, Frame, 1.5f);
	DrawLine(MapX, MapY + MapSize, MapX + MapSize, MapY + MapSize, Frame, 1.5f);
	DrawLine(MapX, MapY, MapX, MapY + MapSize, Frame, 1.5f);
	DrawLine(MapX + MapSize, MapY, MapX + MapSize, MapY + MapSize, Frame, 1.5f);
	DrawText(TEXT("CARTE"), FLinearColor::White, MapX + 8, MapY + 6, nullptr, 1.f);
	DrawText(TEXT("N"), FLinearColor(1.f, .4f, .35f), Center.X - 4, MapY + 6, nullptr, 1.f);
	DrawLine(MapX + MapSize - 70, MapY + MapSize - 12, MapX + MapSize - 70 + 50 * PxPerM, MapY + MapSize - 12, FLinearColor::White, 2.f);
	DrawText(TEXT("50 m"), FLinearColor::White, MapX + MapSize - 70, MapY + MapSize - 30, nullptr, .7f);
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
	if (!Inside(Goal, 0) || Inside(Me, -0.5)) return Goal;
	const FVector2D Gate(Arena.X, Arena.Y + D / 2 + 5);
	if (FVector2D::Distance(Me, Gate) < 3 || (FMath::Abs(Me.X - Arena.X) < 2.5 && Me.Y > Arena.Y + D / 2 - 1)) return Goal;
	return Gate;
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
	if (!P || !Canvas || !Course.IsValid() || !Course->CourseGuide(Goal, Label)) return;
	double CX, CY, CZ;
	StridesUnits::UEToWeb(P->GetActorLocation(), CX, CY, CZ);
	const FVector F = P->GetActorForwardVector();
	const FVector2D D(Goal.X - CX, Goal.Y - CZ);
	const FString G = CourseGuideText(Label, D.Size(), RelativeAngleDeg(F, D));
	LastCourseGuide = G;
	if (G.IsEmpty()) return;
	// Pastille sous le tableau du chrono (en haut à gauche), fond sombre, texte clair.
	float TW = 0, TH = 0;
	const float Sc = 1.6f;
	GetTextSize(G, TW, TH, nullptr, Sc);
	const float BX = 24.f, BY = Canvas->SizeY * .11f;
	DrawRect(FLinearColor(.02f, .03f, .04f, .78f), BX, BY, TW + 36.f, TH + 18.f);
	DrawRect(FLinearColor(.49f, 1.f, .77f, 1.f), BX, BY, 5.f, TH + 18.f);
	DrawText(G, FLinearColor::White, BX + 20.f, BY + 9.f, nullptr, Sc);
}

FString AStridesHUD::PoleGuideText(double Distance, double RelAngleDeg)
{
	if (Distance < 6.0) return FString();
	const double A = FMath::Abs(RelAngleDeg);
	const TCHAR* Way = A < 20.0 ? TEXT("tout droit") : A > 135.0 ? TEXT("demi-tour") : RelAngleDeg > 0 ? TEXT("à droite") : TEXT("à gauche");
	FString D = Distance < 1000.0 ? FString::Printf(TEXT("%.0f m"), Distance) : FString::Printf(TEXT("%.1f km"), Distance / 1000.0).Replace(TEXT("."), TEXT(","));
	return FString::Printf(TEXT("Chrono du Pôle · %s · %s"), *D, Way);
}

bool AStridesHUD::PoleGoal(FVector2D& Out) const
{
	const AStridesPlayerController* SPC = Cast<AStridesPlayerController>(GetOwningPlayerController());
	const AStridesActivityPost* Post = SPC ? SPC->ActivityPost() : nullptr;
	if (!Post || Post->MissionActive()) return false;
	Out = FVector2D(Post->Activity().startX, Post->Activity().startZ);
	return true;
}
