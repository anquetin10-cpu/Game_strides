#include "StridesCourse.h"
#include <limits>
#include "StridesCsoAudio.h"
#include "Components/BoxComponent.h"
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
	// Jalon J4 (correction) : Grand Prix de Paris et autoroute A13 (StridesCourseParis.cpp).
	PrimaryActorTick.bCanEverTick = true;
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
	// Jalon J2c : vertical et oxer du paddock d'échauffement (entraînement à l'abord).
	BuildWarmup(Data);
	// Jalon J4 : obstacles fixes du cross de Saint-Gatien (mission « cross »).
	BuildCross(Data);
	// Jalon J4 (correction) : obstacles de l'arène de Paris (Sprint, Grand Prix) et du paddock de Paris.
	BuildParis(Data);
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
	// Ailes : sommet à h + 0,75 m, suivent la hauteur posée.
	RebuildColliders();
}

void AStridesCourse::RebuildColliders()
{
	WorldCol = strides::Colliders();
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	auto Ground = [Data](double X, double Z) { return Data ? (double)Data->TerrainHeight(X, Z) : 0.0; };
	// Lice basse de la carrière du Pôle (world.js buildPole : rectFence(POLE.arena, { height: 1.0, tag: 'arena' }, 's', 7, 0.5)).
	if (Data && Data->PlanArena().w > 0 && Data->PlanArena().d > 0)
	{
		const auto Pts = strides::rectFencePoints(Data->PoleArena.X, Data->PoleArena.Y, Data->PlanArena().w, Data->PlanArena().d, 's', 7, 0.5);
		strides::addFence(WorldCol, Pts, false, 1.0, false, "arena", Ground);
	}
	// Tribunes du Pôle (world.js buildStands : boîte pleine, jalon J2b / B9) : cheval (cœur) et cavalier à pied (boîte
	// invisible bloquante, hauteur 12 m, posée sur le sol au centre).
	bool bStands = true;
#if WITH_DEV_AUTOMATION_TESTS
	bStands = bStandsForTest;
#endif
	if (bStands && Data && Data->PoleStands.Z > 0 && Data->PoleStands.W > 0)
	{
		const FVector4 S = Data->PoleStands;
		strides::addStands(WorldCol, S.X, S.Y, S.Z, S.W);
		if (!StandsBlock)
		{
			StandsBlock = NewObject<UBoxComponent>(this, TEXT("StandsBlock"));
			StandsBlock->SetupAttachment(GetRootComponent());
			StandsBlock->SetHiddenInGame(true);
			// Seulement les pions (cavalier à pied) : ni la caméra (sonde de la perche, tranche T6) ni les tracés de visibilité.
			StandsBlock->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
			StandsBlock->SetCollisionObjectType(ECC_WorldStatic);
			StandsBlock->SetCollisionResponseToAllChannels(ECR_Ignore);
			StandsBlock->SetCollisionResponseToChannel(ECC_Pawn, ECR_Block);
			StandsBlock->RegisterComponent();
		}
		const double H = 12.0;
		StandsBlock->SetBoxExtent(FVector(S.Z / 2 * StridesUnits::CmPerM, S.W / 2 * StridesUnits::CmPerM, H / 2 * StridesUnits::CmPerM));
		StandsBlock->SetWorldLocationAndRotation(StridesUnits::WebToUE(S.X, Ground(S.X, S.Y) + H / 2, S.Y), FRotator::ZeroRotator);
	}
	// Jalon J2c : lice du paddock d'échauffement (world.js:573 rectFence(POLE.warmup, { height: 1.0, board: true }, 'e', 6,
	// 0.5), tag « fence » par défaut), solide pour le cheval ; ouverture de 6 m au milieu du côté est.
	if (Data && Data->PoleWarmup.Z > 0 && Data->PoleWarmup.W > 0)
	{
		const FVector4 Wu = Data->PoleWarmup;
		strides::addFence(WorldCol, strides::rectFencePoints(Wu.X, Wu.Y, Wu.Z, Wu.W, 'e', 6, 0.5), false, 1.0, false, "fence", Ground);
	}
	// Chandeliers et ailes (obstacles.js add), solides pour le cheval.
	for (const strides::CsoObstacle& O : CoreObstacles)
		if (!O.off) strides::addObstacleWings(WorldCol, O.kind, O.x, O.z, O.rot, O.w, O.h, O.spread, Ground(O.x, O.z));
	// Jalon J4 (correction) : arène de Paris (paris.js) : murs de la salle (porte des cavaliers à l'ouest), lice de la
	// piste (sommet sol + 1,3 m, entrée de 5,6 m à l'ouest), tribunes, lice du paddock, tentes ; mêmes boîtes que le web.
	if (const strides::ParisGpData* PD = Data ? Data->Paris() : nullptr)
	{
		const strides::ParisSite& P = PD->site;
		const double X = P.x, Z = P.z, Inf = std::numeric_limits<double>::infinity();
		const double HW = P.hall.w / 2, HD = P.hall.d / 2;
		const double Dz0 = P.door.z - Z - P.doorW / 2, Dz1 = P.door.z - Z + P.doorW / 2;
		WorldCol.addBox(X - HW, Z + (-HD + Dz0) / 2, 0.3, (Dz0 + HD) / 2, 0, Inf, "arena-wall");
		WorldCol.addBox(X - HW, Z + (Dz1 + HD) / 2, 0.3, (HD - Dz1) / 2, 0, Inf, "arena-wall");
		WorldCol.addBox(X + HW, Z, 0.3, HD, 0, Inf, "arena-wall");
		WorldCol.addBox(X, Z - HD, HW, 0.3, 0, Inf, "arena-wall");
		WorldCol.addBox(X, Z + HD, HW, 0.3, 0, Inf, "arena-wall");
		const double Hx = P.arena.w / 2, Hz = P.arena.d / 2, Top = P.y + 1.3;
		const double Gz0 = P.gate.z - Z - 2.8, Gz1 = P.gate.z - Z + 2.8;
		WorldCol.addBox(X, Z - Hz, Hx, 0.1, 0, Top, "arena-boards");
		WorldCol.addBox(X, Z + Hz, Hx, 0.1, 0, Top, "arena-boards");
		WorldCol.addBox(X + Hx, Z, 0.1, Hz, 0, Top, "arena-boards");
		WorldCol.addBox(X - Hx, Z + (Gz1 + Hz) / 2, 0.1, (Hz - Gz1) / 2, 0, Top, "arena-boards");
		WorldCol.addBox(X - Hx, Z + (-Hz + Gz0) / 2, 0.1, (Gz0 + Hz) / 2, 0, Top, "arena-boards");
		for (const strides::ParisRect& St : P.stands)
		{
			const bool bEast = FMath::Abs(FMath::Abs(St.rot) - UE_DOUBLE_HALF_PI) < 0.01;
			WorldCol.addBox(St.x, St.z, (bEast ? St.d : St.w) / 2, (bEast ? St.w : St.d) / 2, St.rot, Inf, "stands");
		}
		const strides::ParisRect& Wu = P.warmup;
		const double GapPos = FMath::Clamp((P.door.z - (Wu.z - Wu.d / 2)) / Wu.d, 0.15, 0.85);
		strides::addFence(WorldCol, strides::rectFencePoints(Wu.x, Wu.z, Wu.w, Wu.d, 'e', 6, GapPos), false, 1.0, false, "fence", Ground);
		WorldCol.addBox(P.stables.x, P.stables.z, P.stables.w / 2, P.stables.d / 2, 0, Inf, "barn");
		WorldCol.addBox(P.secretariat.x, P.secretariat.z - 3.5, 2.5, 1.5, 0, Inf, "tent");
	}
	// Jalon J3 (correction) : véhicules garés du web, obstacles statiques (vehicle.js : addBox(x, z, W/2 + 0.12, L/2 + 0.1,
	// cap, Infinity, id)) ; le cheval ne les traverse plus.
	if (Data)
		for (const FStridesParked& V : Data->Parked) WorldCol.addBox(V.X, V.Z, V.Hw, V.Hd, V.Heading, std::numeric_limits<double>::infinity(), "parked");
	// Grille du guidage (carrière et 30 m autour) : lice, ailes et obstacles gonflés de 1,8 m (rayon du cheval 0,85 + marge).
	GuideGridMap = strides::GuideGrid();
	if (Data && Data->PlanArena().w > 0 && Data->PlanArena().d > 0)
	{
		const double AX = Data->PoleArena.X, AZ = Data->PoleArena.Y, HW = Data->PlanArena().w / 2 + 30, HD = Data->PlanArena().d / 2 + 30;
		GuideGridMap = strides::buildGuideGrid(strides::GuideBounds{AX - HW, AZ - HD, AX + HW, AZ + HD}, WorldCol, CoreObstacles);
	}
}

FVector2D AStridesCourse::GuideAim(const FVector2D& Me, const FVector2D& Goal, double* OutDistance) const
{
	double Ax = Goal.X, Az = Goal.Y, Len = FVector2D::Distance(Me, Goal);
	strides::guideAim(GuideGridMap, Me.X, Me.Y, Goal.X, Goal.Y, Ax, Az, 18.0, &Len);
	if (OutDistance) *OutDistance = Len;
	return FVector2D(Ax, Az);
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
		// Jalon J4 : seuls les obstacles du parcours du Pôle (les obstacles du cross portent aussi des numéros 1 à 10).
		if (F && F->Course == TEXT("cso")) F->SetHighlighted(F->Num == InNum);
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
	NumCourseFences = (int32)Trace.fences.size();
	CoreStates = strides::csoFenceStates(CoreObstacles);
	RebuildColliders();
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
	for (const strides::CsoObstacle& O : CoreObstacles)
		if (O.course == "cso") In.fences.push_back({O.kind, O.spread, O.h});  // ofCourse('cso') (paddock exclu)
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
	// Jalon J4 : dialogue d'une épreuve de mission (Paul au cross, Victor à la course).
	if (bEventDialog && EventPtr) { bEventDialog = false; EventPtr->closeDialog(); return true; }
	// Jalon J4 (correction) : dialogue de Margot (Grand Prix de Paris) : réplique suivante, puis fin du dialogue.
	if (bParisDialog && ParisPtr)
	{
		if (ParisDialogQueue.Num())
		{
			DialogLine = ParisDialogQueue[0];
			ParisDialogQueue.RemoveAt(0);
			bDialog = true;
			return true;
		}
		bParisDialog = false;
		ParisPtr->closeDialog();
		return true;
	}
	if (bParisCap && ParisPtr) { bParisCap = false; ParisPtr->capacityClosed(); return true; }
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
	RunSerial++;
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
	{
		// Sons de l'épreuve (tranche T12) : journal de l'acteur et lecture par UStridesCsoAudio.
		const std::vector<strides::CsoCall> Sounds = RunPtr->takeAudio();
		for (const strides::CsoCall& C : Sounds) AudioCalls.Add(Line(C));
		if (UStridesCsoAudio* Audio = GetWorld() ? GetWorld()->GetSubsystem<UStridesCsoAudio>() : nullptr) Audio->RunCalls(Sounds);
	}
	// Entrée en piste (courses.js:453-455) : hauteurs de l'épreuve posées (Obstacles.setHeights), barres remises sur
	// leurs taquets (resetRails), puis numéro 1 surligné (ci-dessous).
	if (RunPtr->takeResetRails())
	{
		RailResetCount++;
		if (FenceHeights() != CourseHeightsV) ApplyHeights(CourseHeightsV);
		for (int32 I = 0; I < (int32)CoreStates.size(); I++)
		{
			if (CoreObstacles[I].course != "cso") continue;  // resetRails('cso') : le paddock garde ses barres
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
	// Jalon J2c : entraînement (lancé par « S'entraîner » ou directement), mission à part de l'épreuve.
	TickTraining(Frame);
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
	TickChallenge();
}

// ---------- Entraînement à l'abord (jalon J2c, lot J2-D) ----------

void AStridesCourse::BuildWarmup(const UStridesDataSubsystem& Data)
{
	// Obstacles du paddock (obstacles.js:199-201) posés comme le web les construit (manifeste « warmup »), après ceux du
	// parcours : indices NumCourseFences et suivants, course « warmup », sans numéro.
	const FStridesCsoScenery& S = Data.CsoScenery();
	if (!S.IsLoaded() || S.Warmup.Num() == 0)
	{
		UE_LOG(LogTemp, Warning, TEXT("Strides : obstacles du paddock absents (cso_fences.json « warmup ») : entraînement sans obstacles"));
		return;
	}
	for (int32 I = 0; I < S.Warmup.Num(); I++)
	{
		const FStridesCsoFenceData& W = S.Warmup[I];
		AStridesFence* Fence = GetWorld()->SpawnActor<AStridesFence>();
		Fence->Course = TEXT("warmup");
		Fence->CourseIndex = I;
		Fence->Setup(W.Label, W.Kind, W.Looks.Num() ? W.Looks[0].H : 1.0, W.Spread, W.X, W.Z, W.Rot, 0, W.W);
		Fences.Add(Fence);
		CoreObstacles.push_back(Fence->CoreObstacle());
	}
	CoreStates = strides::csoFenceStates(CoreObstacles);
	RebuildColliders();
	// Poteau « Chrono » de l'activité cso_warmup (Activities._markers : même maillage pour chaque activité, posé en
	// a.marker || a.start + 3 m sur x, sans rotation).
	if (Data.PoleWarmup.Z > 0)
	{
		const strides::CsoActivity WA = strides::csoWarmupActivity(strides::CsoPaddock{Data.PoleWarmup.X, Data.PoleWarmup.Y, Data.PoleWarmup.Z, Data.PoleWarmup.W});
		for (const FStridesCsoPiece& P : S.Marker.Pieces)
		{
			UStaticMesh* M = S.LoadMesh(P.Mesh);
			if (!M) continue;
			const FVector Wp = FStridesCsoScenery::PieceWorldWeb(WA.markerX, Data.TerrainHeight(WA.markerX, WA.markerZ), WA.markerZ, S.Marker.Rot, P);
			UStaticMeshComponent* Cm = NewObject<UStaticMeshComponent>(this);
			Cm->SetupAttachment(GetRootComponent());
			Cm->SetStaticMesh(M);
			Cm->ComponentTags.Add(FName(TEXT("cso_warmup")));
			Cm->ComponentTags.Add(FName(*P.Cat));
			Cm->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			Cm->RegisterComponent();
			Cm->SetWorldTransform(FTransform(FRotator(0, -FMath::RadiansToDegrees(S.Marker.Rot + P.Yaw), 0), StridesUnits::WebToUE(Wp.X, Wp.Y, Wp.Z)));
			Props.Add(Cm);
			PropTex.Add(P.Tex);
			PropTexEn.Add(P.TexEn);
		}
	}
	UE_LOG(LogTemp, Display, TEXT("Strides : paddock d'échauffement, %d obstacles posés (pièces exportées : %d)"), S.Warmup.Num(), Fences.Num() && Fences.Last() ? (int32)Fences.Last()->IsExported() : 0);
}

bool AStridesCourse::StartTraining()
{
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	// startTraining : `if (g.missions.active) return;`.
	if (MissionActive() || !Data || Data->PoleWarmup.Z <= 0 || !Data->CsoText()) return false;
	const strides::CsoPaddock P{Data->PoleWarmup.X, Data->PoleWarmup.Y, Data->PoleWarmup.Z, Data->PoleWarmup.W};
	if (RunText.size() == 0) RunText = *Data->CsoText();
	TrainingPtr = std::make_unique<strides::CsoTraining>(strides::csoTrainingConfig(P, RunText, RunLang()), RunText);
	TrainingResult = strides::CsoTrainingResult();
	TrainingNext = -1;
	TrainingCount++;
	SyncHudClock(WallSeconds());
	TrainingPtr->begin();
	FlushTrainingCalls();
	UE_LOG(LogTemp, Display, TEXT("Strides entraînement : activité cso_warmup lancée (paddock %.0f, %.0f)"), P.x, P.z);
	return true;
}

FString AStridesCourse::TrainingEndLabel() const
{
	return TrainingPtr ? FString(UTF8_TO_TCHAR(TrainingPtr->endLabel().c_str())) : FString();
}

bool AStridesCourse::PressTrainingEnd()
{
	if (!TrainingPtr || !TrainingPtr->finish()) return false;
	UE_LOG(LogTemp, Display, TEXT("Strides entraînement : « Terminer » (%d sans faute sur %d)"), TrainingPtr->clean(), TrainingPtr->jumps());
	return true;
}

strides::CsoCourseMode AStridesCourse::CourseMode() const
{
	// Jalon J4 (correction) : manche du Grand Prix de Paris ; obstacle suivant ramené à son rang dans Obstacles().
	if (ParisPtr && ParisPtr->round() && ParisPtr->round()->course().active)
	{
		strides::CsoCourseMode M = ParisPtr->round()->course();
		const int32 First = ParisPtr->roundKind() == strides::ParisRun::Round::Sprint ? ParisSprintFirst : ParisGpFirst;
		if (M.next >= 0 && First >= 0) M.next += First;
		return M;
	}
	if (RunPtr && !RunPtr->finished() && RunPtr->course().active) return RunPtr->course();
	if (TrainingActive())
	{
		strides::CsoCourseMode M = TrainingPtr->course();
		if (M.active) M.next = TrainingNext;
		return M;
	}
	return RunPtr ? RunPtr->course() : strides::CsoCourseMode();
}

FString AStridesCourse::ObjectiveText() const
{
	if (EventActive()) return UTF8_TO_TCHAR(EventPtr->text().c_str());
	if (ParisActive()) return UTF8_TO_TCHAR(ParisPtr->text().c_str());
	if (RunPtr && !RunPtr->finished()) return UTF8_TO_TCHAR(RunPtr->text().c_str());
	if (TrainingActive()) return UTF8_TO_TCHAR(TrainingPtr->text(LastTrainFrame).c_str());
	return FString();
}

void AStridesCourse::TickTraining(const strides::CsoRunFrame& Frame)
{
	// « S'entraîner » au bilan (courses.js:439) : setTimeout(startTraining, 300) une fois la mission refermée.
	if (RunPtr && RunPtr->finished() && RunPtr->trainingRequested() && TrainingAskedSerial != RunSerial)
	{
		TrainingAskedSerial = RunSerial;
		TrainingAt = WallSeconds() + 0.3;
	}
	if (TrainingAt >= 0 && WallSeconds() >= TrainingAt)
	{
		TrainingAt = -1;
		StartTraining();
	}
	if (!TrainingPtr) return;
	LastTrainFrame = Frame;
	if (Frame.dt > 0) TrainingPtr->update(Frame);
	FlushTrainingCalls();
}

void AStridesCourse::FlushTrainingCalls()
{
	if (!TrainingPtr) return;
	auto Line = [](const strides::CsoCall& C)
	{
		FString L = UTF8_TO_TCHAR(C.fn.c_str());
		for (const strides::CsoArg& A : C.args) L += TEXT(" | ") + (A.isNum ? FString::SanitizeFloat(A.n) : FString(UTF8_TO_TCHAR(A.s.c_str())));
		return L;
	};
	for (const strides::CsoCall& C : TrainingPtr->takeHud())
	{
		HudCalls.Add(Line(C));
		Hud.call(C);
		FString Text = C.args.empty() || C.args[0].isNum ? FString() : FString(UTF8_TO_TCHAR(C.args[0].s.c_str()));
		if (C.fn == "big" && C.args.size() > 1 && !C.args[1].isNum && !C.args[1].s.empty()) Text += TEXT(" · ") + FString(UTF8_TO_TCHAR(C.args[1].s.c_str()));
		if (C.fn == "toast" || C.fn == "big") UE_LOG(LogTemp, Display, TEXT("Strides entraînement : %s %s"), UTF8_TO_TCHAR(C.fn.c_str()), *Text);
		OnCourseEvent.Broadcast(UTF8_TO_TCHAR(C.fn.c_str()), Text);
	}
	{
		const std::vector<strides::CsoCall> Sounds = TrainingPtr->takeAudio();
		for (const strides::CsoCall& C : Sounds) AudioCalls.Add(Line(C));
		if (UStridesCsoAudio* Audio = GetWorld() ? GetWorld()->GetSubsystem<UStridesCsoAudio>() : nullptr) Audio->RunCalls(Sounds);
	}
	// start de l'étape d'entraînement : ob.resetRails('warmup').
	if (TrainingPtr->takeResetRails())
		for (int32 I = 0; I < (int32)CoreStates.size(); I++)
		{
			if (CoreObstacles[I].course != "warmup") continue;
			strides::csoRestFence(CoreStates[I]);
			if (Fences.IsValidIndex(I) && Fences[I]) Fences[I]->ApplyRails(CoreStates[I]);
		}
	// Fin de la mission (missions.complete) : carte de résultat du web (titre, kicker, texte) rendue en grand message
	// (choix n° 12 du plan : carte de fin de mission non portée).
	const strides::CsoTrainingResult R = TrainingPtr->takeResult();
	if (R.taken)
	{
		TrainingResult = R;
		strides::CsoCall Big;
		Big.fn = "big";
		strides::CsoArg T, B, Ms;
		T.s = R.title;
		B.s = R.body;
		Ms.isNum = true;
		Ms.n = 3500;
		Big.args = {T, B, Ms};
		HudCalls.Add(Line(Big));
		Hud.call(Big);
		OnCourseEvent.Broadcast(TEXT("big"), UTF8_TO_TCHAR((R.title + " · " + R.body).c_str()));
		UE_LOG(LogTemp, Display, TEXT("Strides entraînement : fin « %s » · %s · %s"), UTF8_TO_TCHAR(R.title.c_str()), UTF8_TO_TCHAR(R.kicker.c_str()), UTF8_TO_TCHAR(R.body.c_str()));
	}
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
	if (TrainingActive() && (!RunPtr || RunPtr->finished()))
	{
		// Entraînement (jalon J2c) : game.course { kind: 'cso-train', controls: 'cso', camera } pendant l'étape
		// d'entraînement, sans tableau ; bouton SAUT : jumpTiming (aide « off » : 'none', sinon ob.timing du cheval).
		Hud.setObjective(true);
		const strides::CsoCourseMode M = CourseMode();
		F.course = M.active;
		F.controlsCso = M.active;
		F.kindCso = false;  // kind === 'cso-train' : pas de classe cso-sober
		F.board = false;
		F.jumpTiming = strides::csoJumpTiming(M.active, false, TCHAR_TO_UTF8(*JumpAid), Timing);
	}
	else if (ParisPtr && ParisPtr->round())
	{
		// Jalon J4 (correction) : manche du Grand Prix de Paris (courseSteps CSO : game.course { kind: 'cso', controls:
		// 'cso', hud }).
		const strides::CsoRun* R = ParisPtr->round();
		Hud.setObjective(true);
		const strides::CsoCourseMode& M = R->course();
		F.course = M.active;
		F.controlsCso = M.active;
		F.kindCso = M.active;
		F.board = R->board(F.info);
		F.jumpTiming = strides::csoJumpTiming(M.active, M.pre, R->config().aid, Timing);
	}
	else if (ParisActive()) Hud.setObjective(true);
	else if (EventActive())
	{
		// Jalon J4 : cross (game.course { kind: 'xc', controls: null, hud: hudInfo } : tableau sans commandes de
		// concours) ; course de l'hippodrome : game.course nul.
		Hud.setObjective(true);
		F.board = EventPtr->board(F.info);
		F.course = F.board;
		F.controlsCso = false;
		F.kindCso = false;
	}
	else if (RunPtr)
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
	// Jalon J4 (correction) : manche du Grand Prix de Paris comprise (Run()).
	strides::CsoRun* RP = Run();
	if (!RP) return;
	if (!bHas)
	{
		// Cheval posé (horse.setPosition : _lastJump = null).
		if (RP->lastJump().has) RP->setLastJump(strides::CsoLastJump());
		LastJumpTime = -1;
		return;
	}
	// Un nouveau saut (horse._lastJump remplacé) : obstacle sauté (numéro du parcours) et qualité de l'appel.
	if (JumpTime == LastJumpTime && RP->lastJump().has) return;
	LastJumpTime = JumpTime;
	strides::CsoLastJump L;
	L.has = true;
	const AStridesFence* F = FenceAt(ObstacleIndex);
	L.num = F ? F->Num : -1;
	L.quality = strides::qualityName(strides::takeoffQuality(Plan));
	RP->setLastJump(L);
}

void AStridesCourse::HandleFenceOut(const strides::CsoFenceOut& Out, strides::CsoCadence& Cadence)
{
	for (const strides::CsoFenceEvent& E : Out.events)
	{
		AStridesFence* Fence = FenceAt(E.obstacle);
		FenceLog.Add(FString::Printf(TEXT("%s %s %d"), UTF8_TO_TCHAR(strides::csoFenceEventName(E.kind)), Fence ? *Fence->Label : TEXT("?"), E.dir));
		// Journal du jeu (preuve d'une partie jouée : ce que les obstacles ont jugé au contact du cheval).
		UE_LOG(LogTemp, Display, TEXT("Strides épreuve : %s %s (sens %d, marge %.2f m%s%s)"), UTF8_TO_TCHAR(strides::csoFenceEventName(E.kind)), Fence ? *Fence->Label : TEXT("?"),
			E.dir, E.margin, E.cause.empty() ? TEXT("") : TEXT(", cause "), UTF8_TO_TCHAR(E.cause.c_str()));
		if (!Fence) continue;
		const strides::CsoObstacleEventKind K0 = E.kind == strides::CsoFenceEventKind::Clear ? strides::CsoObstacleEventKind::Clear
			: E.kind == strides::CsoFenceEventKind::Fault ? strides::CsoObstacleEventKind::Fault : strides::CsoObstacleEventKind::Refusal;
		// Jalon J2c : écouteurs de l'entraînement (course « warmup ») ; ceux de l'épreuve ne voient que la course « cso »
		// (courses.js:221 : obstacle.course !== courseId → ignoré).
		if (TrainingPtr && !TrainingPtr->finished())
			TrainingPtr->obstacleEvent(K0, TCHAR_TO_UTF8(*Fence->Course), E.margin, E.cause.empty() ? std::string() : RunText.cause(E.cause, TrainingPtr->config().lang));
		// Jalon J4 : obstacles du cross vus par l'épreuve de la mission « cross » (courses.js : obstacle.course === 'xc').
		if (EventPtr && Fence->Course == TEXT("xc"))
		{
			EventPtr->obstacleEvent(K0, Fence->Num, E.dir, E.cause, E.cause.empty() ? std::string() : RunText.cause(E.cause, strides::Lang::Fr), Cadence);
			continue;
		}
		// Jalon J4 (correction) : Grand Prix de Paris : paddock (échauffement : sauts comptés) et manche en cours.
		if (ParisPtr && Fence->Course.StartsWith(TEXT("paris")))
		{
			if (Fence->Course == TEXT("paris_warm")) ParisPtr->warmEvent(K0);
			else ParisPtr->obstacleEvent(K0, TCHAR_TO_UTF8(*Fence->Course), Fence->Num, E.dir, E.cause, E.cause.empty() ? std::string() : RunText.cause(E.cause, strides::Lang::Fr), Cadence);
			continue;
		}
		if (!RunPtr || Fence->Course != TEXT("cso")) continue;
		const strides::CsoObstacleEventKind K = E.kind == strides::CsoFenceEventKind::Clear ? strides::CsoObstacleEventKind::Clear
			: E.kind == strides::CsoFenceEventKind::Fault ? strides::CsoObstacleEventKind::Fault : strides::CsoObstacleEventKind::Refusal;
		// Texte de la cause (jumpModel.js CAUSES, traduit) transmis avec la faute, comme causeText dans le jeu web.
		RunPtr->obstacleEvent(K, Fence->Num, E.dir, E.cause, E.cause.empty() ? std::string() : RunText.cause(E.cause, RunPtr->config().lang), Cadence);
	}
	FlushRunCalls();
	FlushTrainingCalls();
	FlushEventCalls();
	FlushParisCalls();
}

void AStridesCourse::UpdateFences(double Dt, double Time, double FocusX, double FocusZ)
{
	strides::CsoFencesUpdateInput In;
	In.dt = Dt;
	In.time = Time;
	// obstacles.js update : hors mission (g.missions.active nul), une barre tombée est remise une fois le joueur à plus de
	// 60 m ; la mission du portage est l'épreuve du Pôle, active jusqu'à sa fin (bilan ou échec).
	In.missionActive = (RunPtr && !RunPtr->finished()) || EventActive() || ParisActive();
	In.focusX = FocusX;
	In.focusZ = FocusZ;
	strides::CsoFenceOut Out;
	strides::csoFencesUpdate(CoreObstacles, CoreStates, In, Out);
	// Choc de la barre au premier rebond (obstacles.js:649 : thud), tranche T12.
	if (UStridesCsoAudio* Audio = GetWorld() ? GetWorld()->GetSubsystem<UStridesCsoAudio>() : nullptr)
		for (const strides::CsoFenceSound S : Out.sounds) Audio->FenceSound(S);
	for (int32 I = 0; I < Fences.Num() && I < (int32)CoreStates.size(); I++)
		if (Fences[I]) Fences[I]->ApplyRails(CoreStates[I]);
}

float AStridesCourse::ElapsedTime() const { return RunPtr ? (float)RunPtr->state().t : 0.f; }
int32 AStridesCourse::Faults() const { return RunPtr ? RunPtr->state().faults : 0; }
int32 AStridesCourse::NextFence() const { return RunPtr ? RunPtr->state().next : 1; }

bool AStridesCourse::CourseGuide(FVector2D& OutWeb, FString& OutLabel, const FVector2D& Me, double* OutDistance, const FVector2D& Forward, double Speed) const
{
	if (!RunPtr || RunPtr->finished() || RunPtr->step() != strides::CsoStep::Course) return false;
	const strides::CsoRunState& S = RunPtr->state();
	if (S.finished || S.eliminated) return false;
	const strides::CsoRunConfig& Cfg = RunPtr->config();
	// Abord d'un axe (strides::guideAxisTarget, 2e correction J1) : poursuite de l'axe dans le couloir d'abord, centre
	// dans les 3 derniers mètres, sortie à 18 m si le cheval est dos à l'obstacle ou arrêté contre lui (refus), sinon
	// l'abord par un chemin qui contourne obstacles, ailes et lice (relevé au contrôle du 26/11 : joueur bloqué au 7
	// « sens −1 » en suivant la pastille vers le 1). Distance affichée : chemin jusqu'au centre.
	auto Axis = [&](const strides::GuideAxis& A)
	{
		double Tx = A.x, Tz = A.z;
		bool bPath = false;
		LastGuideMode = strides::guideAxisTarget(A, Me.X, Me.Y, Forward.X, Forward.Y, Speed, Tx, Tz, bPath);
		double Len = FVector2D::Distance(Me, FVector2D(Tx, Tz));
		OutWeb = bPath ? GuideAim(Me, FVector2D(Tx, Tz), &Len) : FVector2D(Tx, Tz);
		if (OutDistance) *OutDistance = LastGuideMode == strides::GuideMode::Pursue || LastGuideMode == strides::GuideMode::Center ? FVector2D::Distance(Me, FVector2D(A.x, A.z))
			: Len + FVector2D::Distance(FVector2D(Tx, Tz), FVector2D(A.x, A.z));
		return true;
	};
	auto Line = [&](const strides::CsoRunLine& L, const TCHAR* Label)
	{
		strides::GuideAxis A;
		A.x = L.x;
		A.z = L.z;
		A.nx = FMath::Sin(L.rot);
		A.nz = FMath::Cos(L.rot);
		A.tx = A.nz;
		A.tz = -A.nx;
		A.front = 0;
		A.halfW = L.w / 2;
		A.approach = 8;
		OutLabel = Label;
		return Axis(A);
	};
	if (!S.started) return Line(Cfg.start, TEXT("Ligne de départ"));
	for (const strides::CsoObstacle& O : CoreObstacles)
		if (O.course == "cso" && O.num == S.next)
		{
			OutLabel = FString::Printf(TEXT("Obstacle %s"), UTF8_TO_TCHAR(O.label.c_str()));
			strides::GuideAxis A;
			A.x = O.x;
			A.z = O.z;
			A.nx = O.n.x;
			A.nz = O.n.z;
			A.tx = O.t.x;
			A.tz = O.t.z;
			A.front = O.front;
			A.halfW = O.w / 2;
			A.approach = 12;
			return Axis(A);
		}
	return Line(Cfg.finish, TEXT("Arrivée"));
}
FString AStridesCourse::StatusText() const
{
	if (ParisActive())
	{
		const FString Objective = UTF8_TO_TCHAR(ParisPtr->text().c_str());
		strides::CsoBoard B;
		if (!ParisPtr->round() || !ParisPtr->round()->board(B)) return Objective;
		FString S;
		for (int32 K = 0; K < 4; K++) S += (K ? TEXT(" ") : TEXT("")) + FString(UTF8_TO_TCHAR(B.txt[K].c_str()));
		return Objective.IsEmpty() ? S : S + TEXT(" · ") + Objective;
	}
	if (EventActive())
	{
		strides::CsoBoard B;
		const FString Objective = UTF8_TO_TCHAR(EventPtr->text().c_str());
		if (!EventPtr->board(B)) return Objective;
		FString S;
		for (int32 K = 0; K < 4; K++) S += (K ? TEXT(" ") : TEXT("")) + FString(UTF8_TO_TCHAR(B.txt[K].c_str()));
		return Objective.IsEmpty() ? S : S + TEXT(" · ") + Objective;
	}
	if ((!RunPtr || RunPtr->finished()) && TrainingActive()) return ObjectiveText();
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
	// Entraînement (jalon J2c) : CourseAids(game, 'warmup') de l'étape d'entraînement, mis à jour avec l'obstacle visé du
	// paddock, sans tracé (showLine: false), zone si l'aide est « full » ; pas fixe de 1/30 s (activities.js:190).
	if (!bCourse && TrainingActive() && TrainingPtr->step() == strides::CsoTrainingStep::Train)
	{
		EnsureAids();
		const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
		if (!Aids->Active()) Aids->Begin(std::vector<strides::TracePoint>(), [Data](double X, double Z) { return Data ? Data->TerrainHeight(X, Z) : 0.0; });
		const std::vector<strides::CsoAidsFence> Fs = AidFences();
		strides::CsoAidsInput In;
		In.dt = 1.0 / 30;
		In.hasHorse = true;
		In.hx = HorseX;
		In.hz = HorseZ;
		In.speed = Speed;
		In.power = Power;
		In.clearance = Clearance;
		In.riding = bRiding;
		In.time = Time;
		In.next = TrainingNext >= 0 && TrainingNext < (int32)Fs.size() ? &Fs[(size_t)TrainingNext] : nullptr;
		In.prevS = 0;
		In.showLine = false;
		In.showZone = JumpAid == TEXT("full");
		Aids->Step(In);
		return;
	}
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
