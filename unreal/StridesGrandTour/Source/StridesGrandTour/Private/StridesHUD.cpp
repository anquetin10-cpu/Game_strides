#include "StridesHUD.h"
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
	if (!bDrewDebug) return;
	float Y = 40.f;
	auto Line = [this, &Y](const FString& S, const FLinearColor& C = FLinearColor::White) { DrawText(S, C, 40.f, Y, nullptr, 1.4f); Y += 30.f; };
	const APawn* P = GetOwningPawn();
	if (const AStridesHorse* H = Cast<AStridesHorse>(P))
	{
		const UStridesDataSubsystem* D = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
		const FString Gait = D && D->Gaits.IsValidIndex(H->GaitIndex) ? D->Gaits[H->GaitIndex].Name.ToString() : TEXT("?");
		Line(FString::Printf(TEXT("À cheval · %s · %.1f m/s (%.0f m/min) · cadence %.1f"), *Gait, H->SpeedMS, H->SpeedMS * 60, H->CadenceMS));
		if (H->Course) Line(DebugText(H->Course->StatusText()));
		if (H->IsDemoCourseActive()) Line(TEXT("DÉMONSTRATION AUTOMATIQUE DU PARCOURS"), FLinearColor(0.4f, 0.9f, 1.f));
		if (!H->LastTakeoff.IsEmpty()) Line(FString::Printf(TEXT("Dernier appel : %s"), *H->LastTakeoff));
		if (PLATFORM_IOS) Line(TEXT("Joystick : direction / cadence · boutons : SAUT, MONTER, ALLURE"), FLinearColor(0.8f, 0.8f, 0.8f));
		else Line(TEXT("Joystick : direction / cadence · SAUT : Espace / A · Démo parcours : F8 · Descendre : E"), FLinearColor(0.8f, 0.8f, 0.8f));
	}
	else Line(TEXT("À pied · Monter à cheval : E (à moins de 3 m)"));
	if (EventT > 0) Line(LastEvent, FLinearColor(1.f, 0.85f, 0.3f));
	if (const UStridesSaveSubsystem* S = GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>())
		if (!S->LastMessage.IsEmpty()) Line(S->LastMessage + TEXT(" (F5 sauvegarder · F9 recharger)"), FLinearColor(0.6f, 0.9f, 0.6f));
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

		DrawMinimap(P, Progress);
		const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();

		const AStridesPlayerController* Controller = Cast<AStridesPlayerController>(GetOwningPlayerController());
		if (Controller && Controller->IsPhoneOpen())
		{
			const float W = 440.f, Ht = FMath::Min(650.f, Canvas->SizeY - 80.f), X = (Canvas->SizeX - W) * .5f, Top = 40.f;
			DrawRect(FLinearColor(.025f, .03f, .04f, .96f), X, Top, W, Ht);
			DrawText(TEXT("STRIDES"), FLinearColor(.3f, .9f, .75f), X + 28, Top + 24, nullptr, 1.8f);
			DrawText(TEXT("Téléphone · P pour fermer"), FLinearColor(.7f, .75f, .8f), X + 28, Top + 62, nullptr, 1.f);
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
			DrawText(TEXT("M / bouton MISSION : lancer la prochaine mission"), FLinearColor(1.f, .82f, .25f), X + 28, MissionY + 72, nullptr, .85f);
			DrawText(FString::Printf(TEXT("Carrière : %d / %d missions"), Progress->CompletedMissions.Num(), Data ? Data->Missions.Num() : 0), FLinearColor(.8f, .84f, .9f), X + 28, MissionY + 108, nullptr, 1.f);
		}
	}
	if (const UStridesDataSubsystem* D = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>())
		for (const FString& L : D->LoadLog) if (L.Contains(TEXT("introuvable")) || L.Contains(TEXT("illisible"))) Line(L, FLinearColor::Red);
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
	auto ToMap = [&](const FVector2D& Web) { return Center + FVector2D((Web.X - CX) * PxPerM, -(Web.Y - CZ) * PxPerM); };
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
	// Cible GPS : au bord du cadre dans sa direction quand elle est hors champ.
	if (Progress && Progress->HasActiveTarget())
	{
		FVector2D T = ToMap(Progress->ActiveTarget());
		if (!Inside(T))
		{
			const FVector2D Dir = (T - Center).GetSafeNormal();
			const float K = (MapSize * .5f - 8.f) / FMath::Max(FMath::Abs(Dir.X), FMath::Abs(Dir.Y));
			T = Center + Dir * K;
		}
		DrawRect(FLinearColor(1.f, .7f, .1f), T.X - 6, T.Y - 6, 12, 12);
		DrawText(FString::Printf(TEXT("GPS %.0f m"), FVector2D::Distance(FVector2D(CX, CZ), Progress->ActiveTarget())), FLinearColor(1.f, .82f, .25f), MapX + 8, MapY + MapSize + 8, nullptr, 1.f);
	}
	if (P)
	{
		// Flèche de cap : direction avant de l'acteur ramenée sur la carte.
		const FVector F = P->GetActorForwardVector();
		const FVector2D Dir = FVector2D(F.X, -F.Y).GetSafeNormal();
		const FVector2D Side(-Dir.Y, Dir.X);
		const FVector2D Tip = Center + Dir * 12.f, L = Center - Dir * 7.f + Side * 7.f, R = Center - Dir * 7.f - Side * 7.f;
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
