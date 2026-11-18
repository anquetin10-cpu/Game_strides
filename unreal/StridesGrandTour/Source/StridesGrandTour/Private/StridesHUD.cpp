#include "StridesHUD.h"
#include "Engine/Canvas.h"
#include "EngineUtils.h"
#include "StridesCourse.h"
#include "StridesDataSubsystem.h"
#include "StridesHorse.h"
#include "StridesPlayerController.h"
#include "StridesProgressionSubsystem.h"
#include "StridesSaveSubsystem.h"
#include "StridesUnits.h"

void AStridesHUD::BeginPlay()
{
	Super::BeginPlay();
	for (TActorIterator<AStridesCourse> It(GetWorld()); It; ++It) It->OnCourseEvent.AddDynamic(this, &AStridesHUD::OnCourseEvent);
}

void AStridesHUD::OnCourseEvent(const FString& Kind, const FString& Text)
{
	LastEvent = Text;
	EventT = 3.f;
}

void AStridesHUD::DrawHUD()
{
	Super::DrawHUD();
	EventT -= GetWorld()->GetDeltaSeconds();
	float Y = 40.f;
	auto Line = [this, &Y](const FString& S, const FLinearColor& C = FLinearColor::White) { DrawText(S, C, 40.f, Y, nullptr, 1.4f); Y += 30.f; };
	const APawn* P = GetOwningPawn();
	if (const AStridesHorse* H = Cast<AStridesHorse>(P))
	{
		const UStridesDataSubsystem* D = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
		const FString Gait = D && D->Gaits.IsValidIndex(H->GaitIndex) ? D->Gaits[H->GaitIndex].Name.ToString() : TEXT("?");
		Line(FString::Printf(TEXT("À cheval · %s · %.1f m/s (%.0f m/min) · cadence %.1f"), *Gait, H->SpeedMS, H->SpeedMS * 60, H->CadenceMS));
		if (H->Course) Line(H->Course->StatusText());
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
		Line(Progress->MissionStatus(), FLinearColor(1.f, 0.82f, 0.25f));
		if (!Progress->LastMessage.IsEmpty()) Line(Progress->LastMessage, FLinearColor(0.7f, 0.9f, 1.f));

		// Minicarte toujours visible : monde complet, joueur et cible GPS.
		const UStridesDataSubsystem* Data = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>();
		const float MapSize = 190.f, MapX = Canvas->SizeX - MapSize - 28.f, MapY = 104.f;
		DrawRect(FLinearColor(0.015f, 0.025f, 0.035f, .86f), MapX, MapY, MapSize, MapSize);
		auto MapPoint = [Data, MapX, MapY, MapSize](const FVector2D& Web)
		{
			const float World = Data ? Data->WorldSize : 1200.f;
			return FVector2D(MapX + (Web.X / World + .5f) * MapSize, MapY + (.5f - Web.Y / World) * MapSize);
		};
		if (P)
		{
			double PX, PY, PZ; StridesUnits::UEToWeb(P->GetActorLocation(), PX, PY, PZ);
			const FVector2D Dot = MapPoint(FVector2D(PX, PZ));
			DrawRect(FLinearColor(0.2f, 0.85f, 1.f), Dot.X - 4, Dot.Y - 4, 8, 8);
		}
		if (Progress->HasActiveTarget())
		{
			const FVector2D Target = MapPoint(Progress->ActiveTarget());
			DrawRect(FLinearColor(1.f, .7f, .1f), Target.X - 6, Target.Y - 6, 12, 12);
			if (P)
			{
				double PX, PY, PZ; StridesUnits::UEToWeb(P->GetActorLocation(), PX, PY, PZ);
				const float Distance = FVector2D::Distance(FVector2D(PX, PZ), Progress->ActiveTarget());
				DrawText(FString::Printf(TEXT("GPS %.0f m"), Distance), FLinearColor(1.f, .82f, .25f), MapX + 8, MapY + MapSize + 8, nullptr, 1.f);
			}
		}
		DrawText(TEXT("CARTE"), FLinearColor::White, MapX + 8, MapY + 6, nullptr, 1.f);

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
