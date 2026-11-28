// Jalon J4 : épreuves des missions cross et derby sur l'acteur du parcours (obstacles du cross, déroulé du cœur
// strides::EventRun, appels de l'interface et des sons, dialogue, adversaires de la course).
#include "StridesCourse.h"
#include "StridesCsoAudio.h"
#include "StridesDataSubsystem.h"
#include "StridesFence.h"
#include "StridesRivalHorse.h"
#include "StridesSaveSubsystem.h"
#include "StridesProgressionSubsystem.h"
#include "StridesUnits.h"
#include "Engine/World.h"

void AStridesCourse::BuildCross(const UStridesDataSubsystem& Data)
{
	const strides::MissionEvents* E = Data.Events();
	if (!E) return;
	// obstacles.js _build :186-188 : dix obstacles fixes le long de XC_PATH (troncs à 0,95 m, haies et entrée dans l'eau
	// à 1,05 m, 4,2 m de large), numérotés 1 à 10, course « xc », solid.
	CrossFirst = (int32)CoreObstacles.size();
	for (const strides::EventFence& F : E->cross.fences)
	{
		AStridesFence* Fence = GetWorld()->SpawnActor<AStridesFence>();
		Fence->Course = TEXT("xc");
		Fence->CourseIndex = F.num - 1;
		Fence->bSolid = true;
		Fence->Setup(UTF8_TO_TCHAR(F.label.c_str()), UTF8_TO_TCHAR(F.kind.c_str()), F.h, 0, F.x, F.z, F.rot, F.num, F.w);
		Fences.Add(Fence);
		CoreObstacles.push_back(Fence->CoreObstacle());
	}
	NumCrossFences = (int32)E->cross.fences.size();
	CoreStates = strides::csoFenceStates(CoreObstacles);
	RebuildColliders();
	UE_LOG(LogTemp, Display, TEXT("Strides cross : %d obstacles fixes posés à Saint-Gatien"), NumCrossFences);
}

bool AStridesCourse::StartEvent(const FString& Id, const FString& PlayerName)
{
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	const strides::MissionEvents* E = Data ? Data->Events() : nullptr;
	if (!E || (RunPtr && !RunPtr->finished()) || TrainingActive() || EventActive()) return false;
	if (Id != TEXT("cross") && Id != TEXT("derby")) return false;
	ClearEvent();
	const strides::EventRun::Kind K = Id == TEXT("cross") ? strides::EventRun::Kind::Cross : strides::EventRun::Kind::Race;
	// Vitesses des adversaires : tirage du web (0,98 + 0,04 × hasard) à graine variable d'une course à l'autre.
	EventPtr = std::make_unique<strides::EventRun>(K, *E, TCHAR_TO_UTF8(*PlayerName), std::vector<double>{}, (double)(FPlatformTime::Cycles() % 100000));
	EventName = Id;
	SyncHudClock(WallSeconds());
	// missions.start : grand message du titre et son « notify » (missions.js:470-471), puis la première étape.
	const FString Title = Id == TEXT("cross") ? TEXT("CROSS DE SAINT-GATIEN") : TEXT("DERBY DE LA TOUQUES");
	const FString Sub = Id == TEXT("cross") ? TEXT("Événement · Cross") : TEXT("Événement · Course");
	strides::CsoCall Big;
	Big.fn = "big";
	strides::CsoArg A0, A1, A2;
	A0.s = TCHAR_TO_UTF8(*Title);
	A1.s = TCHAR_TO_UTF8(*Sub);
	A2.isNum = true;
	A2.n = 2600;
	Big.args = {A0, A1, A2};
	Hud.call(Big);
	EventPtr->begin();
	FlushEventCalls();
	UE_LOG(LogTemp, Display, TEXT("Strides épreuve de mission : %s lancée"), *Id);
	return true;
}

void AStridesCourse::ClearEvent()
{
	for (AStridesRivalHorse* R : Rivals)
		if (R) R->Destroy();
	Rivals.Reset();
	if (bEventDialog) bDialog = false;
	bEventDialog = false;
	EventPtr.reset();
	EventName.Empty();
	SetHighlight(-1);
}

void AStridesCourse::FlushEventCalls()
{
	if (!EventPtr) return;
	for (const strides::CsoCall& C0 : EventPtr->takeHud())
	{
		strides::CsoCall C = C0;
		if (C.fn == "dialog" && !C.args.empty())
		{
			// « qui|initiales|texte » → arguments du dialogue de l'entraîneur (UStridesCsoScreens) : une ligne.
			const std::string L = C.args[0].s;
			const size_t a = L.find('|'), b = a == std::string::npos ? a : L.find('|', a + 1);
			strides::CsoArg Who, Ini, Txt;
			Who.s = L.substr(0, a);
			Ini.s = b == std::string::npos ? std::string() : L.substr(a + 1, b - a - 1);
			Txt.s = b == std::string::npos ? L : L.substr(b + 1);
			C.args = {Who, Ini, Txt};
			bDialog = true;
			bEventDialog = true;
			DialogLine = C;
			continue;
		}
		if (C.fn == "closeDialog" && bEventDialog) { bDialog = false; bEventDialog = false; }
		if (C.fn == "_nextNotif" || C.fn == "dialog" || C.fn == "closeDialog") continue;
		Hud.call(C);
		FString Line = UTF8_TO_TCHAR(C.fn.c_str());
		for (const strides::CsoArg& A : C.args) Line += TEXT(" | ") + (A.isNum ? FString::SanitizeFloat(A.n) : FString(UTF8_TO_TCHAR(A.s.c_str())));
		HudCalls.Add(Line);
		FString Text = C.args.empty() || C.args[0].isNum ? FString() : FString(UTF8_TO_TCHAR(C.args[0].s.c_str()));
		if (C.fn == "big" && C.args.size() > 1 && !C.args[1].isNum && !C.args[1].s.empty()) Text += TEXT(" · ") + FString(UTF8_TO_TCHAR(C.args[1].s.c_str()));
		OnCourseEvent.Broadcast(UTF8_TO_TCHAR(C.fn.c_str()), Text);
	}
	const std::vector<strides::CsoCall> Sounds = EventPtr->takeAudio();
	if (UStridesCsoAudio* Audio = GetWorld() ? GetWorld()->GetSubsystem<UStridesCsoAudio>() : nullptr) Audio->RunCalls(Sounds);
	// Obstacle attendu du cross surligné (Obstacles.highlight('xc', n)) : numéro de l'obstacle dans le cœur.
	if (EventPtr->kind() == strides::EventRun::Kind::Cross)
	{
		const int32 H = EventPtr->highlight();
		for (int32 I = 0; I < NumCrossFences; ++I)
			if (AStridesFence* F = FenceAt(CrossFirst + I)) F->SetHighlighted(H == I + 1);
	}
}

void AStridesCourse::TickEvent(const strides::CsoRunFrame& Frame, double SpeedMS, strides::CsoCadence& Cadence)
{
	if (!EventPtr) return;
	strides::EventFrame F;
	F.dt = Frame.dt;
	F.x = Frame.x;
	F.z = Frame.z;
	F.heading = Frame.heading;
	F.speed = SpeedMS;
	F.focusX = Frame.focusX;
	F.focusZ = Frame.focusZ;
	F.riding = Frame.riding;
	F.driving = Frame.driving;
	F.inTruck = Frame.inTruck;
	F.vehicle = Frame.vehicle;
	EventPtr->update(F, Cadence);
	FlushEventCalls();
	// Adversaires de la course : apparus aux stalles (setup), affichés à la pose calculée par le cœur.
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	const std::vector<strides::RaceRival>& RV = EventPtr->rivals();
	if (Rivals.Num() != (int32)RV.size() && Data && Data->Events())
	{
		for (AStridesRivalHorse* R : Rivals) if (R) R->Destroy();
		Rivals.Reset();
		const strides::RaceData& RD = Data->Events()->race;
		for (size_t I = 0; I < RV.size(); ++I)
		{
			AStridesRivalHorse* A = GetWorld()->SpawnActor<AStridesRivalHorse>();
			if (!A) continue;
			A->Init(UTF8_TO_TCHAR(RV[I].name.c_str()), I < RD.silks.size() ? UTF8_TO_TCHAR(RD.silks[I].c_str() + 1) : TEXT("888888"));
			Rivals.Add(A);
		}
	}
	for (int32 I = 0; I < Rivals.Num() && I < (int32)RV.size(); ++I)
		if (Rivals[I]) Rivals[I]->Apply(RV[I].x, RV[I].z, RV[I].heading, RV[I].speed, Data ? Data->TerrainHeight(RV[I].x, RV[I].z) : 0.0);
}

// ---------- Jalon J4-D : défi à conditions fixes ----------

bool AStridesCourse::StartChallenge(const strides::ChallengeConfig& Cfg, const FString& PlayerName, double JumpPower)
{
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	const strides::ChallengeData* CD = Data ? Data->Challenges() : nullptr;
	if (!bRunConfig || !CD || MissionActive() || Cfg.courseId != "cso") return false;
	strides::CsoRunConfig C = RunConfig;
	C.playerName = TCHAR_TO_UTF8(*PlayerName);
	C.horseName = Cfg.horseName;
	C.lang = strides::Lang::Fr;
	// challengeRun._steps : courseSteps({ gate: V.start, present: false, maxRefusals, timeAllowed, heights, jumpAid }) ; pas
	// de bilan (résultat du défi à la place) ; élimination = fin de la tentative avec un résultat (et non un échec).
	C.timeAllowed = Cfg.timeAllowed;
	C.maxRefusals = Cfg.refusalsToEliminate;
	C.present = false;
	C.result = false;
	C.soft = true;
	C.record = false;
	C.gateX = CD->startX;
	C.gateZ = CD->startZ;
	C.gateR = 9;
	C.aid = Cfg.jumpAid ? "full" : "off";
	C.launch = true;
	C.launchBig.fn = "big";
	strides::CsoArg A0, A1, A2;
	A0.s = strides::jsUpper(Cfg.name);
	A1.s = "Défi rejouable · " + Cfg.id;
	A2.isNum = true;
	A2.n = 2400;
	C.launchBig.args = {A0, A1, A2};
	// Hauteur unique du défi (ob.setHeights(cfg.obstacles.map(() => cfg.height))) ; contrôle de capacité du cheval fourni.
	CourseHeightsV.assign((size_t)NumCourseFences, Cfg.height);
	strides::CsoCapacityInput In;
	for (const strides::CsoObstacle& O : CoreObstacles)
		if (O.course == "cso") In.fences.push_back({O.kind, O.spread, O.h});
	In.heights = CourseHeightsV;
	In.power = JumpPower;
	In.horseName = C.horseName;
	const strides::CsoCapacity Cap = strides::csoCapacity(In, RunText, C.lang, Data->Jump());
	C.capacity = Cap.step;
	C.hopeless = Cap.hopeless;
	C.capWho = Cap.who;
	C.capInitials = Cap.initials;
	C.capText = Cap.text;
	C.courseTitle = Cfg.name;
	ChallengeCfg = Cfg;
	bChallenge = true;
	bChallengeResult = false;
	ChallengeAttempt = Cfg.id + "-" + std::to_string(FPlatformTime::Cycles64() % 1000000007ULL) + "-" + std::to_string(++ChallengeSerial);
	RefreshPropSigns();
	StartRunWith(C, RunText);
	UE_LOG(LogTemp, Display, TEXT("Strides défi : %hs lancé (tentative %hs, %d s accordées, %.2f m)"), Cfg.id.c_str(), ChallengeAttempt.c_str(), Cfg.timeAllowed, Cfg.height);
	return true;
}

void AStridesCourse::TickChallenge()
{
	if (!bChallenge || !RunPtr) return;
	// _pin : heure et météo du défi réappliquées à chaque image.
	if (UStridesSaveSubsystem* Save = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>() : nullptr)
		Save->GameTime = ChallengeCfg.weatherDay * 86400.0 + ChallengeCfg.weatherHour * 3600.0;
	if (!RunPtr->finished()) return;
	// _finish : résultat de la tentative (barres = (fautes − refus × 4) / 4), record, titre.
	const strides::CsoRunState& St = RunPtr->state();
	const int Rails = FMath::Max(0, FMath::RoundToInt((St.faults - St.refusals * ChallengeCfg.firstRefusal) / (double)ChallengeCfg.rail));
	ChallengeRes = strides::makeChallengeResult(ChallengeCfg, ChallengeAttempt, St.faults, St.refusals, Rails, St.t, St.eliminated ? (St.eliminatedReason.empty() ? std::string("Éliminé") : St.eliminatedReason) : std::string());
	UStridesSaveSubsystem* Save = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>() : nullptr;
	ChallengeRec = Save ? Save->RecordChallenge(ChallengeRes) : strides::RecordOutcome();
	const std::string Title = ChallengeRes.isEliminated() ? "Éliminé" : ChallengeRec.isRecord ? "Nouveau record" : "Parcours terminé";
	strides::CsoCall Big;
	Big.fn = "big";
	strides::CsoArg B0, B1, B2;
	B0.s = strides::jsUpper(Title);
	B1.s = strides::challengeResultLine(ChallengeRes);
	B2.isNum = true;
	B2.n = 3200;
	Big.args = {B0, B1, B2};
	Hud.call(Big);
	if (UStridesProgressionSubsystem* P = GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>())
		P->LastMessage = FString::Printf(TEXT("%s · %s · %s"), UTF8_TO_TCHAR(ChallengeCfg.name.c_str()), UTF8_TO_TCHAR(Title.c_str()),
			UTF8_TO_TCHAR((ChallengeRes.isEliminated() ? ChallengeRes.eliminated : strides::challengeResultLine(ChallengeRes)).c_str()));
	// _exit : hauteurs du parcours rendues.
	CourseHeightsV = HeightsFor(CourseHeight);
	bChallenge = false;
	bChallengeResult = true;
}

bool AStridesCourse::TakeChallengeResult(strides::ChallengeResult& Out, strides::RecordOutcome& Rec)
{
	if (!bChallengeResult) return false;
	bChallengeResult = false;
	Out = ChallengeRes;
	Rec = ChallengeRec;
	return true;
}
