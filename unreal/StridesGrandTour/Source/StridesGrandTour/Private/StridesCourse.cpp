#include "StridesCourse.h"
#include "Engine/World.h"
#include "StridesDataSubsystem.h"
#include "StridesFence.h"
#include "StridesUnits.h"

AStridesCourse::AStridesCourse()
{
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));
}

void AStridesCourse::Build(const strides::CourseDesign& Design, const UStridesDataSubsystem& Data)
{
	BuildWith(Design, Data.CourseSpeed(SpeedLevel), Data.CsoFenceWidth);
	// Déroulé de l'épreuve (tranche T4) : règles, lignes, entrée de piste et textes exportés du jeu web.
	std::vector<std::string> Labels;
	for (const strides::TraceFence& F : Trace.fences) Labels.push_back(F.label);
	bRunConfig = Data.CsoText() && Data.PoleRunConfig(Labels, RunConfig);
	if (bRunConfig) RunText = *Data.CsoText();
	else UE_LOG(LogTemp, Warning, TEXT("Strides : épreuve du Pôle sans règles ni textes (cso_course_pole.json « run » ou strings_cso.json absents)"));
}

void AStridesCourse::BuildWith(const strides::CourseDesign& Design, double CourseSpeedMS, double FenceWidthM)
{
	Trace = strides::traceCourse(Design);
	CoreObstacles.clear();
	const std::vector<double> Heights = strides::courseHeights(Design, Trace, CourseHeight);
	for (size_t i = 0; i < Trace.fences.size(); i++)
	{
		const strides::TraceFence& F = Trace.fences[i];
		AStridesFence* Fence = GetWorld()->SpawnActor<AStridesFence>();
		Fence->Setup(UTF8_TO_TCHAR(F.label.c_str()), UTF8_TO_TCHAR(F.kind.c_str()), Heights[i], F.spread, F.x, F.z, F.rot, (int32)i + 1, FenceWidthM);
		Fences.Add(Fence);
		CoreObstacles.push_back(Fence->CoreObstacle());
	}
	CoreStates = strides::csoFenceStates(CoreObstacles);
	// Temps accordé : longueur arrondie au mètre (obstacles.js, CSO_LENGTH) à la vitesse du niveau.
	Allowed = strides::timeAllowedFor(FMath::RoundToDouble(Trace.length), CourseSpeedMS);
}

bool AStridesCourse::StartRun(const FString& PlayerName, const FString& HorseName)
{
	if (!bRunConfig) return false;
	strides::CsoRunConfig C = RunConfig;
	C.playerName = TCHAR_TO_UTF8(*PlayerName);
	C.horseName = TCHAR_TO_UTF8(*HorseName);
	C.lang = strides::langFromName(TCHAR_TO_UTF8(*Lang));
	StartRunWith(C, RunText);
	return true;
}

void AStridesCourse::StartRunWith(const strides::CsoRunConfig& Config, const strides::TextTable& Text)
{
	if (&Text != &RunText) RunText = Text;
	Allowed = Config.timeAllowed;
	RunPtr = std::make_unique<strides::CsoRun>(Config, RunText);
	RunPtr->begin();
	FlushRunCalls();
}

void AStridesCourse::FlushRunCalls()
{
	if (!RunPtr) return;
	auto Line = [](const strides::CsoCall& C)
	{
		FString L = UTF8_TO_TCHAR(C.fn.c_str());
		for (const strides::CsoArg& A : C.args) L += TEXT(" | ") + (A.isNum ? FString::SanitizeFloat(A.n) : FString(UTF8_TO_TCHAR(A.s.c_str())));
		return L;
	};
	for (const strides::CsoCall& C : RunPtr->takeHud())
	{
		HudCalls.Add(Line(C));
		// Interface d'épreuve (grand message, toasts, astuce : tranche T7) : texte transmis au HUD de débogage.
		FString Text = C.args.empty() || C.args[0].isNum ? FString() : FString(UTF8_TO_TCHAR(C.args[0].s.c_str()));
		if (C.fn == "big" && C.args.size() > 1 && !C.args[1].isNum && !C.args[1].s.empty()) Text += TEXT(" · ") + FString(UTF8_TO_TCHAR(C.args[1].s.c_str()));
		OnCourseEvent.Broadcast(UTF8_TO_TCHAR(C.fn.c_str()), Text);
	}
	for (const strides::CsoCall& C : RunPtr->takeAudio())
	{
		AudioCalls.Add(Line(C));  // sons de l'épreuve : tranche T12
		UE_LOG(LogTemp, Verbose, TEXT("Strides épreuve : son %s"), *AudioCalls.Last());
	}
	// Entrée en piste : barres remises sur leurs taquets (obstacles.js resetRails).
	if (RunPtr->takeResetRails())
		for (int32 I = 0; I < (int32)CoreStates.size(); I++)
		{
			strides::csoRestFence(CoreStates[I]);
			if (Fences.IsValidIndex(I) && Fences[I]) Fences[I]->ApplyRails(CoreStates[I]);
		}
}

void AStridesCourse::TickRun(const strides::CsoRunFrame& Frame, strides::CsoCadence& Cadence)
{
	if (!RunPtr) return;
	// Présentation : la carte (Voir le plan / Entrer en piste) relève de la tranche T10 ; en attendant, l'entrée en piste
	// suit aussitôt (écart inscrit à l'inventaire).
	if (RunPtr->step() == strides::CsoStep::Presentation) RunPtr->enter();
	RunPtr->update(Frame, Cadence);
	FlushRunCalls();
}

void AStridesCourse::HandleFenceOut(const strides::CsoFenceOut& Out, strides::CsoCadence& Cadence)
{
	for (const strides::CsoFenceEvent& E : Out.events)
	{
		AStridesFence* Fence = FenceAt(E.obstacle);
		FenceLog.Add(FString::Printf(TEXT("%s %s %d"), UTF8_TO_TCHAR(strides::csoFenceEventName(E.kind)), Fence ? *Fence->Label : TEXT("?"), E.dir));
		if (!RunPtr || !Fence) continue;
		const strides::CsoObstacleEventKind K = E.kind == strides::CsoFenceEventKind::Clear ? strides::CsoObstacleEventKind::Clear
			: E.kind == strides::CsoFenceEventKind::Fault ? strides::CsoObstacleEventKind::Fault : strides::CsoObstacleEventKind::Refusal;
		// Texte de la cause (jumpModel.js CAUSES, traduit) transmis avec la faute, comme causeText dans le jeu web.
		RunPtr->obstacleEvent(K, Fence->Num, E.dir, E.cause, E.cause.empty() ? std::string() : RunText.cause(E.cause, RunPtr->config().lang), Cadence);
	}
	FlushRunCalls();
}

void AStridesCourse::UpdateFences(double Dt, double Time, double FocusX, double FocusZ)
{
	strides::CsoFencesUpdateInput In;
	In.dt = Dt;
	In.time = Time;
	In.missionActive = true;  // épreuve en cours : pas de remise hors mission (obstacles.js update)
	In.focusX = FocusX;
	In.focusZ = FocusZ;
	strides::CsoFenceOut Out;
	strides::csoFencesUpdate(CoreObstacles, CoreStates, In, Out);
	for (int32 I = 0; I < Fences.Num() && I < (int32)CoreStates.size(); I++)
		if (Fences[I]) Fences[I]->ApplyRails(CoreStates[I]);
}

float AStridesCourse::ElapsedTime() const { return RunPtr ? (float)RunPtr->state().t : 0.f; }
int32 AStridesCourse::Faults() const { return RunPtr ? RunPtr->state().faults : 0; }
int32 AStridesCourse::NextFence() const { return RunPtr ? RunPtr->state().next : 1; }
FString AStridesCourse::StatusText() const
{
	if (!RunPtr) return FString();
	strides::CsoBoard B;
	const FString Objective = UTF8_TO_TCHAR(RunPtr->text().c_str());
	if (!RunPtr->board(B)) return Objective;
	FString S;
	for (int32 K = 0; K < 4; K++) S += (K ? TEXT(" ") : TEXT("")) + FString(UTF8_TO_TCHAR(B.txt[K].c_str()));
	return Objective.IsEmpty() ? S : S + TEXT(" · ") + Objective;
}
