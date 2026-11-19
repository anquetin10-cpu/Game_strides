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
}

void AStridesCourse::BuildWith(const strides::CourseDesign& Design, double CourseSpeedMS, double FenceWidthM)
{
	Trace = strides::traceCourse(Design);
	CoreObstacles.clear();
	const std::vector<double> Heights = strides::courseHeights(Design, Trace, CourseHeight);
	std::vector<std::string> Labels;
	for (size_t i = 0; i < Trace.fences.size(); i++)
	{
		const strides::TraceFence& F = Trace.fences[i];
		AStridesFence* Fence = GetWorld()->SpawnActor<AStridesFence>();
		Fence->Setup(UTF8_TO_TCHAR(F.label.c_str()), UTF8_TO_TCHAR(F.kind.c_str()), Heights[i], F.spread, F.x, F.z, F.rot, (int32)i + 1, FenceWidthM);
		Fences.Add(Fence);
		CoreObstacles.push_back(Fence->CoreObstacle());
		Labels.push_back(F.label);
	}
	CoreStates = strides::csoFenceStates(CoreObstacles);
	// Temps accordé : longueur arrondie au mètre (obstacles.js, CSO_LENGTH) à la vitesse du niveau.
	Allowed = strides::timeAllowedFor(FMath::RoundToDouble(Trace.length), CourseSpeedMS);
	JudgePtr = std::make_unique<strides::CourseJudge>(Labels, Allowed);
}

bool AStridesCourse::LineCrossed(const strides::TraceMark& M, double X0, double Z0, double X1, double Z1, double Heading) const
{
	// Ligne perpendiculaire au cap du tracé, 6 m de part et d'autre ; franchie dans son sens (à 60° près).
	const double Nx = FMath::Sin(M.rot), Nz = FMath::Cos(M.rot);
	const double S0 = (X0 - M.x) * Nx + (Z0 - M.z) * Nz, S1 = (X1 - M.x) * Nx + (Z1 - M.z) * Nz;
	if (!(S0 < 0 && S1 >= 0)) return false;
	const double U = (X1 - M.x) * Nz - (Z1 - M.z) * Nx;
	const double CosH = FMath::Sin(Heading) * Nx + FMath::Cos(Heading) * Nz;
	return FMath::Abs(U) < 6.0 && CosH > 0.5;
}

void AStridesCourse::TrackHorse(double X0, double Z0, double X1, double Z1, double Heading, float Dt)
{
	if (!JudgePtr) return;
	strides::CourseJudge& J = *JudgePtr;
	if (!J.started() && Trace.marks.count("start") && LineCrossed(Trace.marks.at("start"), X0, Z0, X1, Z1, Heading))
	{
		J.startCrossed();
		OnCourseEvent.Broadcast(TEXT("start"), TEXT("Départ : le chrono est lancé"));
	}
	const bool Before = J.eliminated() != strides::Elim::None;
	J.tick(Dt);
	if (!Before && J.eliminated() == strides::Elim::TimeLimit) OnCourseEvent.Broadcast(TEXT("eliminated"), TEXT("Temps limite dépassé : éliminé"));
	if (J.started() && Trace.marks.count("finish") && LineCrossed(Trace.marks.at("finish"), X0, Z0, X1, Z1, Heading) && J.finishCrossed())
	{
		const int32 Pts = J.points();
		OnCourseEvent.Broadcast(TEXT("finish"), Pts == 0 ? TEXT("SANS FAUTE !") : FString::Printf(TEXT("%d POINTS"), Pts));
	}
}

void AStridesCourse::HandleFenceOut(const strides::CsoFenceOut& Out)
{
	for (const strides::CsoFenceEvent& E : Out.events)
	{
		AStridesFence* Fence = FenceAt(E.obstacle);
		FenceLog.Add(FString::Printf(TEXT("%s %s %d"), UTF8_TO_TCHAR(strides::csoFenceEventName(E.kind)), Fence ? *Fence->Label : TEXT("?"), E.dir));
		if (!JudgePtr || !Fence) continue;
		strides::CourseJudge& J = *JudgePtr;
		// courses.js : rien n'est compté avant le départ ni après l'arrivée ou l'élimination (le juge l'ignore).
		if (E.kind == strides::CsoFenceEventKind::Refusal)
		{
			const int32 Before = J.refusals();
			J.refusal(Fence->Num, E.dir);
			if (J.refusals() != Before)
				OnCourseEvent.Broadcast(TEXT("refusal"), J.eliminated() == strides::Elim::Refusals ? TEXT("2e refus : éliminé") : FString::Printf(TEXT("Refus au %s · +4"), *Fence->Label));
			continue;
		}
		const bool bRail = E.kind == strides::CsoFenceEventKind::Fault;
		if (!J.started() || J.finished() || J.eliminated() != strides::Elim::None || E.dir <= 0) continue;
		const bool bOk = bRail ? J.rail(Fence->Num, E.dir) : J.clear(Fence->Num, E.dir);
		if (!bOk) OnCourseEvent.Broadcast(TEXT("wrong"), FString::Printf(TEXT("Erreur de parcours : ce n'est pas le %s"), *Fence->Label));
		else OnCourseEvent.Broadcast(bRail ? TEXT("rail") : TEXT("clear"), bRail ? FString::Printf(TEXT("Barre au %s · +4"), *Fence->Label) : FString::Printf(TEXT("%s franchi"), *Fence->Label));
	}
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

void AStridesCourse::RiderDismounted()
{
	if (JudgePtr && JudgePtr->started() && !JudgePtr->finished()) { JudgePtr->dismounted(); OnCourseEvent.Broadcast(TEXT("eliminated"), TEXT("Descendu de cheval : éliminé")); }
}

float AStridesCourse::ElapsedTime() const { return JudgePtr ? JudgePtr->time() : 0.f; }
int32 AStridesCourse::Faults() const { return JudgePtr ? JudgePtr->faults() : 0; }
int32 AStridesCourse::NextFence() const { return JudgePtr ? JudgePtr->next() : 1; }
FString AStridesCourse::StatusText() const
{
	if (!JudgePtr) return FString();
	const strides::CourseJudge& J = *JudgePtr;
	if (J.eliminated() != strides::Elim::None) return TEXT("Éliminé");
	if (J.finished()) return FString::Printf(TEXT("Terminé : %d pts en %.2f s"), J.points(), J.time());
	if (!J.started()) return FString::Printf(TEXT("Franchis la ligne de départ · temps accordé %d s"), Allowed);
	const int32 N = J.next();
	return FString::Printf(TEXT("%.2f s · %d pts · prochain : %s"), J.time(), J.faults(), N <= Fences.Num() ? *Fences[N - 1]->Label : TEXT("arrivée"));
}
