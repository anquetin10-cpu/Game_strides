// Jalon J4 (correction après contrôle adverse) : Grand Prix de Paris Indoor sur l'acteur du parcours (obstacles de
// l'arène de Paris et du paddock, déroulé du cœur strides::ParisRun, manches vues comme l'épreuve, appels de
// l'interface et des sons, dialogues de Margot, cartes).
#include "StridesCourse.h"
#include "StridesCsoAudio.h"
#include "StridesDataSubsystem.h"
#include "StridesFence.h"
#include "StridesSaveSubsystem.h"
#include "StridesProgressionSubsystem.h"
#include "StridesHorse.h"
#include "StridesRider.h"
#include "StridesVehicle.h"
#include "StridesPlayerController.h"
#include "StridesUnits.h"
#include "EngineUtils.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

void AStridesCourse::BuildParis(const UStridesDataSubsystem& Data)
{
	const strides::ParisGpData* P = Data.Paris();
	if (!P) return;
	// obstacles.js:204-220 : les deux tracés à 1,45 m hors épreuve (heights(1.45)), 3,8 m de large ; paddock : vertical
	// à 1,30 m et oxer à 1,25 m, 3,4 m de large.
	auto Add = [&](const strides::ParisFenceData& F, const TCHAR* Course, double W)
	{
		AStridesFence* Fence = GetWorld()->SpawnActor<AStridesFence>();
		Fence->Course = Course;
		Fence->CourseIndex = F.num - 1;
		Fence->Setup(UTF8_TO_TCHAR(F.label.c_str()), UTF8_TO_TCHAR(F.kind.c_str()), F.h, F.spread, F.x, F.z, F.rot, F.num, W);
		Fences.Add(Fence);
		strides::CsoObstacle O = Fence->CoreObstacle();
		O.course = TCHAR_TO_UTF8(Course);
		CoreObstacles.push_back(O);
	};
	ParisSprintFirst = (int32)CoreObstacles.size();
	for (const strides::ParisFenceData& F : P->sprint.fences) Add(F, TEXT("paris_sprint"), 3.8);
	ParisGpFirst = (int32)CoreObstacles.size();
	for (const strides::ParisFenceData& F : P->gp.fences) Add(F, TEXT("paris_gp"), 3.8);
	ParisWarmFirst = (int32)CoreObstacles.size();
	for (const strides::ParisFenceData& F : P->warm) Add(F, TEXT("paris_warm"), 3.4);
	NumParisFences = (int32)CoreObstacles.size() - ParisSprintFirst;
	CoreStates = strides::csoFenceStates(CoreObstacles);
	ShowParisCourse(TEXT("paris_gp"));
	UE_LOG(LogTemp, Display, TEXT("Strides Paris : %d obstacles posés (Sprint %d, Grand Prix %d, paddock %d)"), NumParisFences, (int32)P->sprint.fences.size(), (int32)P->gp.fences.size(), (int32)P->warm.size());
}

int32 AStridesCourse::ParisFenceStart(const FString& Course) const
{
	return Course == TEXT("paris_sprint") ? ParisSprintFirst : Course == TEXT("paris_gp") ? ParisGpFirst : Course == TEXT("paris_warm") ? ParisWarmFirst : -1;
}

void AStridesCourse::ShowParisCourse(const FString& Course)
{
	// obstacles.js showParisCourse : un seul tracé en piste, l'autre rangé (affichage et collisions : setOff).
	ParisShown = Course;
	for (int32 I = 0; I < (int32)CoreObstacles.size(); I++)
	{
		const FString C = UTF8_TO_TCHAR(CoreObstacles[I].course.c_str());
		if (C != TEXT("paris_sprint") && C != TEXT("paris_gp")) continue;
		const bool bOff = C != Course;
		CoreObstacles[I].off = bOff;
		if (Fences.IsValidIndex(I) && Fences[I]) Fences[I]->SetActorHiddenInGame(bOff);
	}
	RebuildColliders();
}

bool AStridesCourse::StartParis(const FString& PlayerName, const FString& HorseName, double JumpPower)
{
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	const strides::ParisGpData* P = Data ? Data->Paris() : nullptr;
	const strides::MissionEvents* E = Data ? Data->Events() : nullptr;
	if (!P || !E || MissionActive()) return false;
	ClearParis();
	// run.data.seed = 4000 + floor(random × 5000) ; run.data.bib = 100 + floor(random × 40) (parisGP.js:91, 125).
	const double Seed = 4000 + (double)(FPlatformTime::Cycles() % 5000);
	const int32 Bib = 100 + (int32)(FPlatformTime::Cycles64() / 7 % 40);
	ParisPtr = std::make_unique<strides::ParisRun>(*P, *E, RunText, TCHAR_TO_UTF8(*PlayerName), TCHAR_TO_UTF8(*HorseName), Seed, Bib, TCHAR_TO_UTF8(*JumpAid));
	// Contrôle de capacité de chaque manche (courses.js:499-528) : obstacles du parcours aux hauteurs de l'épreuve, cheval
	// engagé (puissance du saut).
	bool bHopeless[2] = {false, false};
	for (int32 K = 0; K < 2; K++)
	{
		const strides::ParisCourseData& C = K == 0 ? P->sprint : P->gp;
		strides::CsoCapacityInput In;
		for (const strides::ParisFenceData& F : C.fences) In.fences.push_back({F.kind, F.spread, F.h});
		In.heights = C.heights(K == 0 ? P->sprintH : P->gpH);
		In.power = JumpPower;
		In.horseName = TCHAR_TO_UTF8(*HorseName);
		const strides::CsoCapacity Cap = strides::csoCapacity(In, RunText, strides::Lang::Fr, Data->Jump());
		bHopeless[K] = Cap.hopeless;
	}
	ParisPtr->setHopeless(bHopeless[0], bHopeless[1]);
	ParisPtr->setRampless(true);
	SyncHudClock(WallSeconds());
	ParisPtr->begin();
	FlushParisCalls();
	UE_LOG(LogTemp, Display, TEXT("Strides Grand Prix de Paris : lancé (graine %.0f, dossard %d, capacité Sprint %d / Grand Prix %d)"), Seed, Bib, bHopeless[0], bHopeless[1]);
	return true;
}

void AStridesCourse::ClearParis()
{
	if (bParisDialog) bDialog = false;
	bParisDialog = false;
	ParisDialogQueue.Reset();
	ParisPtr.reset();
	ParisHighlight = -1;
	if (!ParisShown.IsEmpty() && ParisShown != TEXT("paris_gp")) ShowParisCourse(TEXT("paris_gp"));
	for (int32 I = 0; I < Fences.Num(); I++)
		if (Fences[I] && Fences[I]->Course.StartsWith(TEXT("paris"))) Fences[I]->SetHighlighted(false);
}

void AStridesCourse::FlushParisCalls()
{
	if (!ParisPtr) return;
	auto Line = [](const strides::CsoCall& C)
	{
		FString L = UTF8_TO_TCHAR(C.fn.c_str());
		for (const strides::CsoArg& A : C.args) L += TEXT(" | ") + (A.isNum ? FString::SanitizeFloat(A.n) : FString(UTF8_TO_TCHAR(A.s.c_str())));
		return L;
	};
	for (const strides::CsoCall& C0 : ParisPtr->takeHud())
	{
		if (C0.fn == "dialog" && C0.args.size() == 3 && C0.args[0].s.find('|') == std::string::npos)
		{
			// Dialogue de l'entraîneur d'une manche (contrôle de capacité) : une réplique, fermée par l'action.
			DialogLine = C0;
			bDialog = true;
			bParisCap = true;
			continue;
		}
		if (C0.fn == "dialog")
		{
			// hud.dialog : une réplique à la fois (« qui|initiales|texte »), avancée par l'action ; la dernière ferme le
			// dialogue de la mission (rappel onDone).
			ParisDialogQueue.Reset();
			for (const strides::CsoArg& A : C0.args)
			{
				const std::string L = A.s;
				const size_t a = L.find('|'), b = a == std::string::npos ? a : L.find('|', a + 1);
				strides::CsoCall D;
				D.fn = "dialog";
				strides::CsoArg Who, Ini, Txt;
				Who.s = L.substr(0, a);
				Ini.s = b == std::string::npos ? std::string() : L.substr(a + 1, b - a - 1);
				Txt.s = b == std::string::npos ? L : L.substr(b + 1);
				D.args = {Who, Ini, Txt};
				ParisDialogQueue.Add(D);
			}
			if (ParisDialogQueue.Num())
			{
				DialogLine = ParisDialogQueue[0];
				ParisDialogQueue.RemoveAt(0);
				bDialog = true;
				bParisDialog = true;
				UE_LOG(LogTemp, Display, TEXT("Strides Grand Prix de Paris : dialogue « %s »"), UTF8_TO_TCHAR(DialogLine.args[2].s.c_str()));
			}
			continue;
		}
		if (C0.fn == "closeDialog" && bParisDialog) { bDialog = false; bParisDialog = false; ParisDialogQueue.Reset(); }
		if (C0.fn == "dialog" || C0.fn == "closeDialog") continue;
		Hud.call(C0);
		HudCalls.Add(Line(C0));
		FString Text = C0.args.empty() || C0.args[0].isNum ? FString() : FString(UTF8_TO_TCHAR(C0.args[0].s.c_str()));
		if (C0.fn == "big" && C0.args.size() > 1 && !C0.args[1].isNum && !C0.args[1].s.empty()) Text += TEXT(" · ") + FString(UTF8_TO_TCHAR(C0.args[1].s.c_str()));
		if (C0.fn == "big" || C0.fn == "toast") UE_LOG(LogTemp, Display, TEXT("Strides Grand Prix de Paris : %s %s"), UTF8_TO_TCHAR(C0.fn.c_str()), *Text);
		OnCourseEvent.Broadcast(UTF8_TO_TCHAR(C0.fn.c_str()), Text);
	}
	{
		const std::vector<strides::CsoCall> Sounds = ParisPtr->takeAudio();
		for (const strides::CsoCall& C : Sounds) AudioCalls.Add(Line(C));
		if (UStridesCsoAudio* Audio = GetWorld() ? GetWorld()->GetSubsystem<UStridesCsoAudio>() : nullptr) Audio->RunCalls(Sounds);
	}
	strides::ParisCard Card;
	if (ParisPtr->takeCard(Card))
	{
		FString Rows;
		for (const auto& R : Card.rows) Rows += FString::Printf(TEXT(" · %s : %s"), UTF8_TO_TCHAR(R.first.c_str()), UTF8_TO_TCHAR(R.second.c_str()));
		UE_LOG(LogTemp, Display, TEXT("Strides Grand Prix de Paris : carte « %s » (%s)%s"), UTF8_TO_TCHAR(Card.title.c_str()), UTF8_TO_TCHAR(Card.kicker.c_str()), *Rows);
	}
	// Paddock : ob.resetRails(PARIS_WARM).
	if (ParisPtr->takeResetWarm())
		for (int32 I = 0; I < (int32)CoreStates.size(); I++)
			if (CoreObstacles[I].course == "paris_warm")
			{
				strides::csoRestFence(CoreStates[I]);
				if (Fences.IsValidIndex(I) && Fences[I]) Fences[I]->ApplyRails(CoreStates[I]);
			}
	// Heure du soir (d.gameTime) posée par la présentation des cavaliers.
	double GT;
	if (ParisPtr->takeGameTime(GT))
		if (UStridesSaveSubsystem* Save = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>() : nullptr) Save->GameTime = GT;
	// Tracé en piste (showParisCourse).
	const FString Want = UTF8_TO_TCHAR(ParisPtr->courseShown().c_str());
	if (Want != ParisShown) ShowParisCourse(Want);
	// Manche : entrée en piste (hauteurs de l'épreuve posées, barres remises), numéro attendu surligné.
	if (strides::CsoRun* R = ParisPtr->mutableRound())
	{
		const bool bSprint = ParisPtr->roundKind() == strides::ParisRun::Round::Sprint;
		const strides::ParisGpData* P = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>()->Paris();
		const std::string Course = bSprint ? "paris_sprint" : "paris_gp";
		if (R->takeResetRails() && P)
		{
			RailResetCount++;
			const std::vector<double> H = (bSprint ? P->sprint : P->gp).heights(bSprint ? P->sprintH : P->gpH);
			const int32 First = bSprint ? ParisSprintFirst : ParisGpFirst;
			for (int32 K = 0; K < (int32)H.size(); K++)
			{
				const int32 I = First + K;
				if (!Fences.IsValidIndex(I) || !Fences[I]) continue;
				Fences[I]->SetHeight(H[(size_t)K]);
				strides::CsoObstacle O = Fences[I]->CoreObstacle();
				O.course = Course;
				CoreObstacles[(size_t)I] = O;
				CoreStates[(size_t)I] = strides::csoFenceStates({O})[0];
				Fences[I]->ApplyRails(CoreStates[(size_t)I]);
			}
			RebuildColliders();
		}
		if (R->highlight() != ParisHighlight)
		{
			ParisHighlight = R->highlight();
			for (int32 I = 0; I < Fences.Num(); I++)
				if (Fences[I] && Fences[I]->Course == UTF8_TO_TCHAR(Course.c_str())) Fences[I]->SetHighlighted(Fences[I]->Num == ParisHighlight);
		}
	}
	else if (ParisHighlight != -1)
	{
		ParisHighlight = -1;
		for (int32 I = 0; I < Fences.Num(); I++)
			if (Fences[I] && Fences[I]->Course.StartsWith(TEXT("paris"))) Fences[I]->SetHighlighted(false);
	}
}

void AStridesCourse::TickParis(const strides::ParisFrame& Frame, strides::CsoCadence& Cadence)
{
	if (!ParisPtr) return;
	ParisPtr->update(Frame, Cadence);
	FlushParisCalls();
}

bool AStridesCourse::PressParisButton(const FString& Id)
{
	if (!ParisPtr || !ParisPtr->cardOpen()) return false;
	const bool bOk = ParisPtr->pressButton(TCHAR_TO_UTF8(*Id));
	if (bOk) UE_LOG(LogTemp, Display, TEXT("Strides Grand Prix de Paris : bouton « %s »"), *Id);
	FlushParisCalls();
	return bOk;
}

FString AStridesCourse::ParisPrimaryButton() const
{
	// Bouton principal de la carte (primary du web) : « Entrer en piste », « Vers le Grand Prix », « Continuer ».
	const strides::ParisCard* C = ParisCard();
	if (!C) return FString();
	return C->presentation ? FString(TEXT("enter")) : C->buttons.empty() ? FString() : FString(UTF8_TO_TCHAR(C->buttons.back().c_str()));
}

// ---------- Image : déroulé du Grand Prix, bretelles de l'A13 ----------

static APawn* StridesPlayerPawn(UWorld* World)
{
	// Pion du joueur ; monde de test (contrôleur sans joueur local) : celui du contrôleur du jeu.
	APawn* P = UGameplayStatics::GetPlayerPawn(World, 0);
	if (!P) for (TActorIterator<AStridesPlayerController> It(World); It && !P; ++It) P = It->GetPawn();
	return P;
}

AStridesVehicle* AStridesCourse::StableTruck() const
{
	for (TActorIterator<AStridesVehicle> It(GetWorld()); It; ++It)
		if (It->Kind() == TEXT("truck") && It->ParkedIndex() < 0) return *It;
	return nullptr;
}

AStridesHorse* AStridesCourse::PlayerHorse() const
{
	TActorIterator<AStridesHorse> It(GetWorld());
	return It ? *It : nullptr;
}

bool AStridesCourse::BuildParisFrame(strides::ParisFrame& F, double Dt) const
{
	const APawn* Pawn = StridesPlayerPawn(GetWorld());
	const AStridesHorse* H = PlayerHorse();
	const AStridesVehicle* T = StableTruck();
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	if (!Pawn || !H || !Data) return false;
	double X, Y, Z;
	F.dt = Dt;
	F.time = GetWorld()->GetTimeSeconds();
	StridesUnits::UEToWeb(H->GetActorLocation(), X, Y, Z);
	F.hx = X;
	F.hz = Z;
	F.heading = StridesUnits::YawDegToHeading(H->GetActorRotation().Yaw);
	StridesUnits::UEToWeb(Pawn->GetActorLocation(), X, Y, Z);
	F.fx = X;
	F.fz = Z;
	const AStridesVehicle* V = Cast<AStridesVehicle>(Pawn);
	F.mode = Pawn == H ? "ride" : V ? "drive" : "foot";
	F.inTruck = V && V == T;
	F.vehicle = V && V != T;
	F.horseAboard = T && T->CarriesHorse();
	if (T)
	{
		F.tkx = T->WebPos().X;
		F.tkz = T->WebPos().Y;
		F.tkSpeed = T->SpeedMS();
	}
	F.inParis = Data->InParis(F.fx);
	if (const UStridesSaveSubsystem* Save = GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>()) F.gameTime = Save->GameTime;
	return true;
}

void AStridesCourse::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (ParisPtr && !ParisPtr->finished())
	{
		strides::ParisFrame F;
		// Carte ou dialogue ouverts : simulation en pause pour la mission (overlay du web), comme la carte de l'épreuve.
		const double Dt = ParisPtr->cardOpen() ? 0.0 : (double)DeltaSeconds;
		if (BuildParisFrame(F, Dt))
		{
			strides::CsoCadence Cad;
			if (const AStridesHorse* H = PlayerHorse()) Cad = strides::CsoCadence{H->CadenceMS > 0, (double)H->CadenceMS};
			TickParis(F, Cad);
		}
	}
	TickTravel();
}

void AStridesCourse::TickTravel()
{
	// travel.js update : au volant du camion, à l'arrêt (|v| ≤ 4 m/s) sur la bretelle de la région : proposition, une fois
	// tant que le camion reste sur la bretelle.
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	const strides::ParisGpData* P = Data ? Data->Paris() : nullptr;
	const AStridesVehicle* T = StableTruck();
	const APawn* Pawn = StridesPlayerPawn(GetWorld());
	if (!P || !T || Pawn != T || TravelCard != ETravel::None) return;
	const FVector2D Tp = T->WebPos();
	const bool bParis = Data->InParis(Tp.X);
	const strides::ParisPoint& E = bParis ? P->a13.paris : P->a13.deauville;
	if (FVector2D::Distance(Tp, FVector2D(E.x, E.z)) >= E.r) { bTravelPrompted = false; return; }
	if (bTravelPrompted || FMath::Abs(T->SpeedMS()) > 4) return;
	bTravelPrompted = true;
	TravelFrom = bParis ? TEXT("paris") : TEXT("deauville");
	// blocker : gazole (plein à l'aire de service), cheval laissé seul à Paris.
	const AStridesHorse* H = PlayerHorse();
	double Hx, Hy, Hz;
	if (H) StridesUnits::UEToWeb(H->GetActorLocation(), Hx, Hy, Hz);
	const FString HorseName = [&]() { const FStridesHorseProfile* Pr = H ? Data->FindHorse(H->ProfileId) : nullptr; return Pr ? Pr->Name : FString(TEXT("ton cheval")); }();
	TravelTitle = bParis ? TEXT("Retour en Normandie") : TEXT("Direction Paris");
	if (bParis && H && Data->InParis(Hx) && !T->CarriesHorse())
	{
		TravelBody = FString::Printf(TEXT("Charge d’abord %s dans le camion : il ne rentre pas sans toi."), *HorseName);
		TravelCard = ETravel::Blocked;
		return;
	}
	const double Need = P->a13.fuelL + 2;
	if (T->Sim.fuelL < Need)
	{
		const UStridesProgressionSubsystem* Prog = GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>();
		const double Litres = FMath::Max(0.0, T->Sim.spec.tank - T->Sim.fuelL);
		const double Cost = Litres * P->a13.aireDiesel;
		if (!Prog || Prog->Credits < Cost)
		{
			TravelBody = FString::Printf(TEXT("Pas assez de gazole pour %d km (%d l nécessaires) et pas assez d’argent pour le plein à l’aire de service (%s €/l)."), P->a13.km, P->a13.fuelL, UTF8_TO_TCHAR(strides::dec(P->a13.aireDiesel, 2, strides::Lang::Fr).c_str()));
			TravelCard = ETravel::Blocked;
			return;
		}
		TravelTitle = TEXT("Plein avant la route");
		TravelBody = FString::Printf(TEXT("%d l dans le réservoir, %d l nécessaires pour %d km. Plein à l’aire de service de l’A13 : %s l de gazole à %s €/l, soit %s €."), FMath::RoundToInt(T->Sim.fuelL), P->a13.fuelL, P->a13.km,
			UTF8_TO_TCHAR(strides::dec(Litres, 1, strides::Lang::Fr).c_str()), UTF8_TO_TCHAR(strides::dec(P->a13.aireDiesel, 2, strides::Lang::Fr).c_str()), UTF8_TO_TCHAR(strides::dec(Cost, 2, strides::Lang::Fr).c_str()));
		TravelCard = ETravel::Fuel;
		return;
	}
	const FString Dest = bParis ? TEXT("Deauville City · Côte Fleurie") : TEXT("Paris · Grand Prix de Paris Indoor");
	const FString Aboard = T->CarriesHorse() ? FString::Printf(TEXT("À bord : %s."), *HorseName) : FString(TEXT("Aucun cheval à bord."));
	TravelBody = FString::Printf(TEXT("%s : %d km, environ 2 h 10 de route. %s Gazole : environ %d l."), *Dest, P->a13.km, *Aboard, P->a13.fuelL);
	TravelCard = ETravel::Prompt;
	CardSel = -1;
	UE_LOG(LogTemp, Display, TEXT("Strides A13 : proposition « %s » (%s)"), *TravelTitle, *TravelBody);
}

bool AStridesCourse::TravelTo(const FString& To)
{
	// Travel.go (travel.js:112-133) : camion posé à l'arrivée, gazole consommé, +130 min, région, sauvegarde.
	const UStridesDataSubsystem* Data = GetGameInstance() ? GetGameInstance()->GetSubsystem<UStridesDataSubsystem>() : nullptr;
	const strides::ParisGpData* P = Data ? Data->Paris() : nullptr;
	AStridesVehicle* T = StableTruck();
	if (!P || !T) return false;
	const strides::ParisPoint& A = To == TEXT("paris") ? P->a13.arriveParis : P->a13.arriveDeauville;
	T->PlaceAt(A.x, A.z, A.h);
	T->Sim.fuelL = FMath::Max(0.0, T->Sim.fuelL - P->a13.fuelL);
	if (UStridesSaveSubsystem* Save = GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>()) Save->GameTime += P->a13.minutes * 60.0;
	Travels++;
	bTravelPrompted = true;
	TravelTitle = To == TEXT("paris") ? TEXT("Bienvenue à Paris") : TEXT("De retour en Normandie");
	TravelBody = To == TEXT("paris") ? TEXT("Arrivée au parking des camions du Grand Prix de Paris Indoor. Écuries provisoires et paddock à l’est, l’arène derrière.")
		: TEXT("Retour sur la Côte Fleurie par la sortie est : l’Écurie du Val est à l’ouest.");
	TravelCard = ETravel::Arrived;
	CardSel = -1;
	UE_LOG(LogTemp, Display, TEXT("Strides A13 : trajet vers %s (camion en (%.1f ; %.1f), gazole %.1f l)"), *To, A.x, A.z, T->Sim.fuelL);
	if (UStridesSaveSubsystem* Save = GetGameInstance()->GetSubsystem<UStridesSaveSubsystem>())
		if (Save->bAutoSave) Save->SaveNow(Cast<APlayerController>(T->GetController()));
	return true;
}

bool AStridesCourse::ActiveCard(FCardView& Out) const
{
	Out = FCardView();
	if (const strides::ParisCard* C = ParisCard())
	{
		Out.Kicker = UTF8_TO_TCHAR(C->kicker.c_str());
		Out.Title = UTF8_TO_TCHAR(C->title.c_str());
		for (const auto& R : C->rows) Out.Rows.Add(TPair<FString, FString>(UTF8_TO_TCHAR(R.first.c_str()), UTF8_TO_TCHAR(R.second.c_str())));
		for (const strides::ParisCardRow& R : C->table)
		{
			TArray<FString> Cells;
			for (const std::string& X : R.cells) Cells.Add(UTF8_TO_TCHAR(X.c_str()));
			Out.Table.Add(Cells);
			Out.TableMe.Add(R.me);
		}
		if (C->presentation)
		{
			// « Voir le plan » : plan de l'arène de Paris non porté (choix n° 34) ; « Entrer en piste ».
			Out.Body = TEXT("Barre ou premier refus : 4 points · deuxième refus : élimination.");
			Out.Buttons.Add({TEXT("enter"), TEXT("Entrer en piste"), true});
		}
		else Out.Buttons.Add({UTF8_TO_TCHAR(C->buttons.empty() ? "" : C->buttons[0].c_str()), C->buttons.size() && C->buttons[0] == "sprint-ok" ? TEXT("Vers le Grand Prix") : TEXT("Continuer"), true});
		return true;
	}
	if (TravelCard == ETravel::None) return false;
	Out.Kicker = TravelCard == ETravel::Arrived ? TEXT("Autoroute A13 · 200 km") : TEXT("Autoroute A13");
	Out.Title = TravelTitle;
	Out.Body = TravelBody;
	if (TravelCard == ETravel::Prompt)
	{
		Out.Buttons.Add({TEXT("travel-no"), TEXT("Rester ici"), false});
		Out.Buttons.Add({TEXT("travel-go"), TravelFrom == TEXT("paris") ? TEXT("Rentrer à Deauville") : TEXT("Partir pour Paris"), true});
	}
	else if (TravelCard == ETravel::Fuel)
	{
		Out.Buttons.Add({TEXT("travel-no"), TEXT("Rester ici"), false});
		Out.Buttons.Add({TEXT("travel-fuel"), TEXT("Faire le plein"), true});
	}
	else Out.Buttons.Add({TravelCard == ETravel::Arrived ? TEXT("travel-ok") : TEXT("travel-no"), TravelCard == ETravel::Arrived ? TEXT("Continuer") : TEXT("Compris"), true});
	return true;
}

bool AStridesCourse::PressCard(const FString& Id)
{
	if (ParisCardOpen())
	{
		CardSel = -1;
		return PressParisButton(Id);
	}
	if (TravelCard == ETravel::None) return false;
	CardSel = -1;
	UE_LOG(LogTemp, Display, TEXT("Strides A13 : bouton « %s »"), *Id);
	if (Id == TEXT("travel-go") && TravelCard == ETravel::Prompt)
	{
		TravelCard = ETravel::None;
		return TravelTo(TravelFrom == TEXT("paris") ? TEXT("deauville") : TEXT("paris"));
	}
	if (Id == TEXT("travel-fuel") && TravelCard == ETravel::Fuel)
	{
		// Plein à l'aire de service (fillQuote : plein du réservoir, payé sur le solde), puis la proposition de départ.
		AStridesVehicle* T = StableTruck();
		const strides::ParisGpData* P = GetGameInstance()->GetSubsystem<UStridesDataSubsystem>()->Paris();
		UStridesProgressionSubsystem* Prog = GetGameInstance()->GetSubsystem<UStridesProgressionSubsystem>();
		if (T && P && Prog)
		{
			const double Litres = FMath::Max(0.0, T->Sim.spec.tank - T->Sim.fuelL);
			const double Cost = Litres * P->a13.aireDiesel;
			T->Sim.refuel(Litres);
			Prog->Credits -= FMath::CeilToInt(Cost);
			UE_LOG(LogTemp, Display, TEXT("Strides A13 : plein %.1f l, %.2f €"), Litres, Cost);
		}
		TravelCard = ETravel::None;
		bTravelPrompted = false;
		return true;
	}
	TravelCard = ETravel::None;
	return true;
}

void AStridesCourse::MoveCardSelection(int32 Dir)
{
	FCardView V;
	if (!ActiveCard(V) || V.Buttons.Num() == 0) return;
	int32 Cur = CardSel;
	if (Cur < 0) for (int32 I = 0; I < V.Buttons.Num(); I++) if (V.Buttons[I].bPrimary) Cur = I;
	CardSel = FMath::Clamp(Cur + Dir, 0, V.Buttons.Num() - 1);
}

FString AStridesCourse::CardSelectedId() const
{
	FCardView V;
	if (!ActiveCard(V) || V.Buttons.Num() == 0) return FString();
	if (CardSel >= 0 && CardSel < V.Buttons.Num()) return V.Buttons[CardSel].Id;
	for (const FCardButton& B : V.Buttons) if (B.bPrimary) return B.Id;
	return V.Buttons[0].Id;
}

bool AStridesCourse::PressCardSelected()
{
	const FString Id = CardSelectedId();
	return !Id.IsEmpty() && PressCard(Id);
}

bool AStridesCourse::ParisInteractAvailable() const
{
	strides::ParisFrame F;
	return ParisPtr && !ParisPtr->finished() && BuildParisFrame(F, 0) && ParisPtr->interactAvailable(F);
}

bool AStridesCourse::PressParisInteract()
{
	strides::ParisFrame F;
	if (!ParisPtr || !BuildParisFrame(F, 0) || !ParisPtr->interactAvailable(F)) return false;
	ParisPtr->interact(F);
	UE_LOG(LogTemp, Display, TEXT("Strides Grand Prix de Paris : accréditation retirée (dossard %d)"), ParisPtr->bib());
	return true;
}
