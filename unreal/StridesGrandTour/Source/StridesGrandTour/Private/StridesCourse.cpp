#include "StridesCourse.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "StridesCsoScenery.h"
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
	RefreshPropSigns();
	StartRunWith(C, RunText);
	return true;
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

void AStridesCourse::UpdateHud(double Dt, bool bHasCadence, double Cadence, bool bCadAdjust)
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
