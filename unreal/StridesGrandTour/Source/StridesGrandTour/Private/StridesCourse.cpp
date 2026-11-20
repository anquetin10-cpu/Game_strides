#include "StridesCourse.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "StridesCourseAids.h"
#include "StridesCsoScenery.h"
#include "StridesDataSubsystem.h"
#include "StridesSaveSubsystem.h"
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
	// Géométrie du jeu web (tranche T5) : hors épreuve, le monde pose les obstacles à csoHeights(1,15) (obstacles.js
	// _build, base relevée par l'export) ; lignes de départ et d'arrivée, poteau « Chrono ».
	const FStridesCsoScenery& S = Data.CsoScenery();
	if (S.IsLoaded())
	{
		if (const FStridesCsoState* Off = S.State(TEXT("hors-epreuve"))) ApplyHeights(HeightsFor(Off->Base));
		BuildProps(Data);
	}
	else UE_LOG(LogTemp, Warning, TEXT("Strides : géométrie du parcours absente (Content/World/Cso), formes de base"));
}

void AStridesCourse::ApplyHeights(const std::vector<double>& Heights)
{
	for (int32 I = 0; I < Fences.Num() && I < (int32)Heights.size(); I++)
	{
		if (!Fences[I]) continue;
		Fences[I]->SetHeight(Heights[I]);
		CoreObstacles[I] = Fences[I]->CoreObstacle();
	}
	CoreStates = strides::csoFenceStates(CoreObstacles);
}

std::vector<double> AStridesCourse::FenceHeights() const
{
	std::vector<double> H;
	for (const AStridesFence* F : Fences) H.push_back(F ? F->CoreObstacle().h : 0.0);
	return H;
}

void AStridesCourse::SetHighlight(int32 InNum)
{
	HighlightNum = InNum;
	for (AStridesFence* F : Fences)
		if (F) F->SetHighlighted(F->Num == InNum);
}

void AStridesCourse::BuildProps(const UStridesDataSubsystem& Data)
{
	for (UStaticMeshComponent* C : Props)
		if (C) C->DestroyComponent();
	Props.Reset();
	PropTex.Reset();
	PropTexEn.Reset();
	const FStridesCsoScenery& S = Data.CsoScenery();
	// Pièce d'un groupe posé en (X, sol, Z) et tourné de Rot : position et lacet monde (FStridesCsoScenery).
	auto Add = [&](const FString& Group, double X, double Z, double Rot, const FStridesCsoPiece& P)
	{
		UStaticMesh* M = S.LoadMesh(P.Mesh);
		if (!M) return;
		const FVector W = FStridesCsoScenery::PieceWorldWeb(X, Data.TerrainHeight(X, Z), Z, Rot, P);
		UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(this);
		C->SetupAttachment(GetRootComponent());
		C->SetStaticMesh(M);
		C->ComponentTags.Add(FName(*Group));
		C->ComponentTags.Add(FName(*P.Cat));
		C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		C->RegisterComponent();
		C->SetWorldTransform(FTransform(FRotator(0, -FMath::RadiansToDegrees(Rot + P.Yaw), 0), StridesUnits::WebToUE(W.X, W.Y, W.Z)));
		Props.Add(C);
		PropTex.Add(P.Tex);
		PropTexEn.Add(P.TexEn);
	};
	for (const FStridesCsoGroup& L : S.Lines)
	{
		// Lignes posées comme le déroulé de l'épreuve les franchit (cso_course_pole.json « run » : CSO_START / CSO_FINISH).
		double X = L.X, Z = L.Z, Rot = L.Rot;
		if (bRunConfig && (L.Id == TEXT("start") || L.Id == TEXT("finish")))
		{
			const strides::CsoRunLine& R = L.Id == TEXT("start") ? RunConfig.start : RunConfig.finish;
			X = R.x;
			Z = R.z;
			Rot = R.rot;
		}
		for (const FStridesCsoPiece& P : L.Pieces) Add(L.Id, X, Z, Rot, P);
	}
	for (const FStridesCsoPiece& P : S.Marker.Pieces) Add(S.Marker.Id, S.Marker.X, S.Marker.Z, S.Marker.Rot, P);
	RefreshPropSigns();
}

void AStridesCourse::RefreshPropSigns()
{
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	if (!Data) return;
	// Panneaux DÉPART / ARRIVÉE dans la langue de l'épreuve (t('DÉPART') du jeu web).
	for (int32 I = 0; I < Props.Num(); I++)
	{
		if (!Props[I] || PropTex[I].IsEmpty()) continue;
		FStridesCsoPiece P;
		P.Tex = PropTex[I];
		P.TexEn = PropTexEn[I];
		Props[I]->SetMaterial(0, Data->CsoScenery().SignMaterial(P, Lang));
	}
}

void AStridesCourse::BuildWith(const strides::CourseDesign& Design, double CourseSpeedMS, double FenceWidthM)
{
	Trace = strides::traceCourse(Design);
	DesignData = Design;
	CoreObstacles.clear();
	const std::vector<double> Heights = strides::courseHeights(Design, Trace, CourseHeight);
	CourseHeightsV = Heights;
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
	C.aid = TCHAR_TO_UTF8(*JumpAid);
	ApplyActivityResult(C, false);
	RefreshPropSigns();
	StartRunWith(C, RunText);
	bAutoEnter = true;
	return true;
}

void AStridesCourse::ApplyActivityResult(strides::CsoRunConfig& C, bool bRecord) const
{
	// Tranche T11 : opts.result de l'épreuve (bilan) ; avec l'activité, étape d'enregistrement du meilleur temps
	// (activities.js:111-129 : best = save.data.bestTimes[a.id] lu au lancement).
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	const strides::CsoActivity* A = Data ? Data->CsoActivity() : nullptr;
	if (!A) return;
	C.resultCfg = A->result;
	C.courseTitle = A->title;
	if (!bRecord || A->noRecord) return;
	C.record = true;
	C.recordId = A->id;
	C.penalties = A->penalties;
	if (const UStridesSaveSubsystem* Save = GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>())
		C.hasBest = Save->BestTime(UTF8_TO_TCHAR(A->id.c_str()), C.best);
}

bool AStridesCourse::StartActivity(const FString& PlayerName, const FString& HorseName, double JumpPower, double Clearance)
{
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	const strides::CsoActivity* A = Data ? Data->CsoActivity() : nullptr;
	if (!bRunConfig || !A) return false;
	strides::CsoRunConfig C = RunConfig;
	C.playerName = TCHAR_TO_UTF8(*PlayerName);
	C.horseName = TCHAR_TO_UTF8(*HorseName);
	C.lang = strides::langFromName(TCHAR_TO_UTF8(*Lang));
	C.aid = TCHAR_TO_UTF8(*JumpAid);
	// missions.start (missions.js:475-477) : grand message et « notify » avant la première étape.
	C.launch = true;
	C.launchBig = strides::csoActivityLaunchBig(*A, RunText, C.lang);
	// Contrôle de capacité (courses.js:499-528) : obstacles tels qu'ils sont posés (hors épreuve) et hauteurs de l'épreuve
	// (heights[i] ?? o.h), cheval du joueur (puissance du saut, bonus de franchissement de l'équipement).
	strides::CsoCapacityInput In;
	for (const strides::CsoObstacle& O : CoreObstacles) In.fences.push_back({O.kind, O.spread, O.h});
	In.heights = CourseHeightsV;
	In.power = JumpPower;
	In.clearance = Clearance;
	In.horseName = C.horseName;
	const strides::CsoCapacity Cap = strides::csoCapacity(In, RunText, C.lang, Data->Jump());
	C.capacity = Cap.step;
	C.hopeless = Cap.hopeless;
	C.capWho = Cap.who;
	C.capInitials = Cap.initials;
	C.capText = Cap.text;
	ApplyActivityResult(C, true);
	RefreshPropSigns();
	StartRunWith(C, RunText);
	UE_LOG(LogTemp, Display, TEXT("Strides épreuve : activité %s lancée (capacité : portée %.2f m pour %.2f m, dialogue %d)"), UTF8_TO_TCHAR(A->id.c_str()), Cap.reach, Cap.maxH, Cap.hopeless);
	return true;
}

bool AStridesCourse::PressScreenButton(const FString& Id)
{
	// screens.card (screens.js:162-168) : la carte se ferme, puis le bouton agit.
	if (ScreenNow == EScreen::Presentation && Id == TEXT("plan")) { ScreenNow = EScreen::Plan; return true; }
	if (ScreenNow == EScreen::Plan && Id == TEXT("plan-back")) { ScreenNow = EScreen::Presentation; return true; }
	if (ScreenNow == EScreen::Presentation && Id == TEXT("enter"))
	{
		ScreenNow = EScreen::None;
		if (RunPtr) RunPtr->enter();
		return true;
	}
	// Bilan (courses.js:418-422) : la carte se ferme, le choix est lu par l'étape à l'image suivante (r.flags.res).
	if (ScreenNow == EScreen::Result && RunPtr && (Id == TEXT("cso-retry") || Id == TEXT("cso-train") || Id == TEXT("cso-done")))
	{
		ScreenNow = EScreen::None;
		using RC = strides::CsoRun::ResultChoice;
		RunPtr->resultChoice(Id == TEXT("cso-retry") ? RC::Retry : Id == TEXT("cso-train") ? RC::Train : RC::Done);
		return true;
	}
	return false;
}

bool AStridesCourse::AdvanceDialog()
{
	if (!bDialog) return false;
	// hud.advanceDialog : une seule ligne, dialogue fermé puis onDone (courses.js:524 : capWarn = false).
	bDialog = false;
	if (RunPtr) RunPtr->closeCapacityDialog();
	return true;
}

strides::CsoPresentationInput AStridesCourse::PresentationInput() const
{
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	const strides::CsoActivity* A = Data ? Data->CsoActivity() : nullptr;
	strides::CsoPresentationInput In;
	for (const strides::TraceFence& F : Trace.fences) In.labels.push_back(F.label);
	In.heights = CourseHeightsV;
	if (A)
	{
		In.title = A->title;
		In.className = A->className;
		In.appTitle = A->appTitle;
		In.defaultPlace = A->place;
	}
	In.horseName = RunHorseName.empty() && RunPtr ? RunPtr->config().horseName : RunHorseName;
	In.timeAllowed = Allowed;
	In.length = Data ? Data->PoleLength() : 368;
	return In;
}

strides::CsoPresentation AStridesCourse::Presentation() const { return strides::csoPresentation(PresentationInput(), RunText, RunLang()); }

strides::CsoPlanCard AStridesCourse::PlanCard() const
{
	// Plan du tracé local (CSO_TRACE, repère de la carrière) : celui du design non décalé.
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	return strides::csoPlanCard(PresentationInput(), Data ? strides::traceCourse(Data->PoleCourse()) : Trace, RunText, RunLang());
}

strides::CoursePlan AStridesCourse::Plan() const
{
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	const strides::CsoPresentationInput In = PresentationInput();
	return strides::coursePlan(Data ? strides::traceCourse(Data->PoleCourse()) : Trace, Data ? Data->PlanArena() : strides::CoursePlanArena(), &In.heights, 0, RunText, RunLang());
}

void AStridesCourse::SetJumpAid(const FString& Aid)
{
	JumpAid = Aid;
	if (RunPtr) RunPtr->setAid(TCHAR_TO_UTF8(*Aid));
}

void AStridesCourse::StartRunWith(const strides::CsoRunConfig& Config, const strides::TextTable& Text)
{
	if (&Text != &RunText) RunText = Text;
	Allowed = Config.timeAllowed;
	Hud = strides::CsoHud();
	// Origine de l'horloge du HUD : l'heure murale du lancement (appels du lancement à 0, comme les setTimeout du web).
	HudWall = WallSeconds();
	bHudWall = true;
	LastJumpTime = -1;
	RunPtr = std::make_unique<strides::CsoRun>(Config, RunText);
	bAutoEnter = false;
	ScreenStep = -1;
	ScreenNow = EScreen::None;
	bDialog = false;
	RunHorseName = Config.horseName;
	ResultCardData = strides::CsoResultCard();
	bLastRecord = false;
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
		// Dialogue de l'entraîneur (tranche T10) : affiché par UStridesCsoScreens jusqu'à sa fermeture.
		if (C.fn == "dialog")
		{
			bDialog = true;
			DialogLine = C;
		}
		// Fin de la mission (tranche T11, run.cleanup de missions.js:250-252) : dialogue encore ouvert fermé.
		if (C.fn == "closeDialog") bDialog = false;
		// Interface d'épreuve (tranche T7) : appel rejoué par le modèle du HUD, affiché par UStridesCsoHud ; texte
		// transmis aussi aux abonnés (journal).
		Hud.call(C);
		FString Text = C.args.empty() || C.args[0].isNum ? FString() : FString(UTF8_TO_TCHAR(C.args[0].s.c_str()));
		if (C.fn == "big" && C.args.size() > 1 && !C.args[1].isNum && !C.args[1].s.empty()) Text += TEXT(" · ") + FString(UTF8_TO_TCHAR(C.args[1].s.c_str()));
		OnCourseEvent.Broadcast(UTF8_TO_TCHAR(C.fn.c_str()), Text);
	}
	for (const strides::CsoCall& C : RunPtr->takeAudio())
	{
		AudioCalls.Add(Line(C));  // sons de l'épreuve : tranche T12
		UE_LOG(LogTemp, Verbose, TEXT("Strides épreuve : son %s"), *AudioCalls.Last());
	}
	// Entrée en piste (courses.js:453-455) : hauteurs de l'épreuve posées (Obstacles.setHeights), barres remises sur
	// leurs taquets (resetRails), puis numéro 1 surligné (ci-dessous).
	if (RunPtr->takeResetRails())
	{
		RailResetCount++;
		if (FenceHeights() != CourseHeightsV) ApplyHeights(CourseHeightsV);
		for (int32 I = 0; I < (int32)CoreStates.size(); I++)
		{
			strides::csoRestFence(CoreStates[I]);
			if (Fences.IsValidIndex(I) && Fences[I]) Fences[I]->ApplyRails(CoreStates[I]);
		}
	}
	// Numéro attendu mis en évidence (Obstacles.highlight) quand le déroulé le change.
	if (RunPtr->highlight() != RunHighlight)
	{
		RunHighlight = RunPtr->highlight();
		SetHighlight(RunHighlight);
	}
	// Bilan ouvert (courses.js:375-424, tranche T11) : carte du cœur sur l'état de la manche, simulation suspendue jusqu'au
	// choix (overlay du web).
	if (RunPtr->takeResultOpened())
	{
		const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
		const strides::RankNames* Names = Data ? Data->RankNames() : nullptr;
		// (dotation non portée : csoResultCard la refuse ; le Parcours du Pôle n'en a pas, contrôlé ici sans exception)
		const strides::CsoResultConfig& Rc = RunPtr->config().resultCfg;
		if (Names && Rc.prizes.empty() && !Names->first.empty()) ResultCardData = strides::csoResultCard(strides::csoResultInputOf(*RunPtr), *Names, RunText, RunLang());
		else
		{
			UE_LOG(LogTemp, Error, TEXT("Strides épreuve : bilan sans noms des engagés (cso_ranking.json) ou avec dotation (non portée)"));
			ResultCardData = strides::CsoResultCard();
		}
		ScreenNow = EScreen::Result;
		UE_LOG(LogTemp, Display, TEXT("Strides épreuve : bilan « %s » (%s)"), UTF8_TO_TCHAR(ResultCardData.title.c_str()), UTF8_TO_TCHAR(ResultCardData.kicker.c_str()));
	}
	// Étape d'enregistrement (activities.js:113-127) : meilleur temps écrit dans la sauvegarde tout de suite (sans F5).
	{
		const strides::CsoRun::Record Rec = RunPtr->takeRecord();
		if (Rec.taken && Rec.rec)
		{
			bLastRecord = true;
			LastRecordScore = Rec.score;
			UStridesSaveSubsystem* Save = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>() : nullptr;
			const bool bSaved = Save && Save->RecordBestTime(UTF8_TO_TCHAR(RunPtr->config().recordId.c_str()), Rec.score);
			UE_LOG(LogTemp, Display, TEXT("Strides épreuve : meilleur temps %hs = %.17g s (écrit dans la sauvegarde : %d)"), RunPtr->config().recordId.c_str(), Rec.score, bSaved);
		}
	}
	// Étape de présentation commencée (courses.js:529-536, start : showPresentation) : carte ouverte une fois (lancement
	// direct StartRun : validée d'office à l'image suivante, sans carte ni simulation suspendue).
	if (!bAutoEnter && !RunPtr->finished() && RunPtr->step() == strides::CsoStep::Presentation && ScreenStep != RunPtr->stepIndex())
	{
		ScreenStep = RunPtr->stepIndex();
		ScreenNow = EScreen::Presentation;
	}
}

void AStridesCourse::TickRun(const strides::CsoRunFrame& Frame, strides::CsoCadence& Cadence)
{
	if (!RunPtr) return;
	// Présentation (tranche T10) : carte affichée jusqu'à « Entrer en piste » (PressScreenButton) ; lancement direct des
	// tests et outils (StartRun) : validée d'office, sans carte.
	if (bAutoEnter && RunPtr->step() == strides::CsoStep::Presentation)
	{
		ScreenNow = EScreen::None;
		RunPtr->enter();
	}
	RunPtr->update(Frame, Cadence);
	FlushRunCalls();
}

double AStridesCourse::WallSeconds() const
{
	return GetWorld() ? GetWorld()->GetRealTimeSeconds() : 0.0;
}

void AStridesCourse::SyncHudClock(double Now)
{
	if (bHudWall && Now > HudWall) Hud.advance(Now - HudWall);
	if (!bHudWall || Now > HudWall) HudWall = Now;
	bHudWall = true;
}

void AStridesCourse::UpdateHud(double Dt, bool bHasCadence, double Cadence, bool bCadAdjust, strides::Zone Timing)
{
	// hud.update du jeu web (après la mission) : game.course (commandes et tableau de l'épreuve), cadence du joueur.
	// Objectif (setObjective de missions.js) : affiché tant que l'épreuve n'est pas terminée.
	strides::CsoHudFrame F;
	if (RunPtr)
	{
		Hud.setObjective(!RunPtr->finished());
		const strides::CsoCourseMode& M = RunPtr->course();
		F.course = M.active;
		F.controlsCso = M.active;  // cso_train : controls === 'cso', kind === 'cso' (courses.js:187)
		F.kindCso = M.active;
		F.board = RunPtr->board(F.info);
		// Bouton SAUT (tranche T9) : g.course?.jumpTiming?.() || 'none'.
		F.jumpTiming = strides::csoJumpTiming(M.active, M.pre, RunPtr->config().aid, Timing);
	}
	F.hasCadence = bHasCadence;
	F.cadence = Cadence;
	F.cadAdjust = bCadAdjust;
	Hud.update(Dt, F);
}

void AStridesCourse::NoteLastJump(bool bHas, int32 ObstacleIndex, const strides::JumpPlan& Plan, double JumpTime)
{
	if (!RunPtr) return;
	if (!bHas)
	{
		// Cheval posé (horse.setPosition : _lastJump = null).
		if (RunPtr->lastJump().has) RunPtr->setLastJump(strides::CsoLastJump());
		LastJumpTime = -1;
		return;
	}
	// Un nouveau saut (horse._lastJump remplacé) : obstacle sauté (numéro du parcours) et qualité de l'appel.
	if (JumpTime == LastJumpTime && RunPtr->lastJump().has) return;
	LastJumpTime = JumpTime;
	strides::CsoLastJump L;
	L.has = true;
	const AStridesFence* F = FenceAt(ObstacleIndex);
	L.num = F ? F->Num : -1;
	L.quality = strides::qualityName(strides::takeoffQuality(Plan));
	RunPtr->setLastJump(L);
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
	// obstacles.js update : hors mission (g.missions.active nul), une barre tombée est remise une fois le joueur à plus de
	// 60 m ; la mission du portage est l'épreuve du Pôle, active jusqu'à sa fin (bilan ou échec).
	In.missionActive = RunPtr && !RunPtr->finished();
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

// ---------- Aides à l'appel (tranche T9) ----------

bool AStridesCourse::CourseLineShown() const
{
	const UStridesSaveSubsystem* Save = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>() : nullptr;
	return Save ? strides::courseLineShown(Save->GetSettings()) : bCourseLine;
}

std::vector<strides::TracePoint> AStridesCourse::AidLine() const
{
	std::vector<strides::TracePoint> Line;
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	if (!Data) return Line;
	// CSO_LINE = CSO_TRACE.pts.map(toWorld) : tracé local du design, puis décalage de la carrière.
	for (const strides::TracePoint& P : strides::traceCourse(Data->PoleCourse()).pts)
		Line.push_back({Data->PoleArena.X + P.x, Data->PoleArena.Y + P.z, P.h, P.s});
	return Line;
}

std::vector<strides::CsoAidsFence> AStridesCourse::AidFences() const
{
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	std::vector<strides::CsoAidsFence> Out;
	for (size_t I = 0; I < CoreObstacles.size(); I++)
	{
		strides::CsoAidsFence F;
		F.id = (int)I;
		F.ob = CoreObstacles[I];
		F.ground = Data ? Data->TerrainHeight(F.ob.x, F.ob.z) : 0.0;
		F.hasLineS = I < Trace.fences.size();
		F.lineS = F.hasLineS ? Trace.fences[I].s : 0.0;
		Out.push_back(F);
	}
	return Out;
}

AStridesCourseAids* AStridesCourse::EnsureAids()
{
	if (!Aids && GetWorld()) Aids = GetWorld()->SpawnActor<AStridesCourseAids>();
	return Aids;
}

void AStridesCourse::UpdateAids(double Dt, double HorseX, double HorseZ, double Speed, double Power, double Clearance, bool bRiding, double Time)
{
	// Étape de parcours en cours (courseStep : CourseAids créé à start, supprimé à end).
	const bool bCourse = RunPtr && !RunPtr->finished() && RunPtr->step() == strides::CsoStep::Course;
	if (Aids && Aids->bFrozen) return;
	if (!bCourse)
	{
		if (Aids && Aids->Active()) Aids->End();
		return;
	}
	EnsureAids();
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	if (!Aids->Active()) Aids->Begin(AidLine(), [Data](double X, double Z) { return Data ? Data->TerrainHeight(X, Z) : 0.0; });
	// courses.js:300-320 : obstacle suivant (le 1 avant le départ), début du tronçon (obstacle précédent), réglages.
	const strides::CsoRunState& S = RunPtr->state();
	const std::vector<strides::CsoAidsFence> Fs = AidFences();
	strides::CsoAidsInput In;
	In.dt = Dt;
	In.hasHorse = true;
	In.hx = HorseX;
	In.hz = HorseZ;
	In.speed = Speed;
	In.power = Power;
	In.clearance = Clearance;
	In.riding = bRiding;
	In.time = Time;
	if (!S.finished)
	{
		const int N = (int)Fs.size();
		const int NextI = S.started ? S.next - 1 : 0;
		In.next = NextI >= 0 && NextI < N ? &Fs[(size_t)NextI] : nullptr;
		const int PrevI = S.next - 2;
		In.prevS = !S.started || PrevI < 0 || PrevI >= N ? 0.0 : Fs[(size_t)PrevI].lineS;
		In.showLine = CourseLineShown();
		In.showZone = RunPtr->config().aid == "full";
	}
	Aids->Step(In);
}
