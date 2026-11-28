// Rejeu d'une exécution de l'oracle unreal/core/tests/oracles/cso_runs/ par le chemin du jeu (tranche T11), image par
// image, comme Strides.Parite.CsoRun et testCsoRuns (test_core.cpp) : à chaque image où une mission est en cours dans le
// jeu web (canal « ep »), bouton de carte touché avant l'image (in.ui : par le widget des cartes UStridesCsoScreens
// s'il est donné, sinon AStridesCourse::PressScreenButton), dernier saut du cheval (ep.lj), événements d'obstacle du bus
// passés à AStridesCourse::HandleFenceOut, puis l'image passée à AStridesCourse::TickRun.
// Utilisé par Strides.Cso.Result (Tests/StridesCsoResultTests.cpp) et par les poses « bilan-* » de AStridesShots.
#pragma once
#include "CoreMinimal.h"
#include "StridesCore/CsoFences.h"
#include "StridesCore/CsoRun.h"
#include "StridesCore/MiniJson.h"
#include "StridesCourse.h"
#include "StridesCsoScreens.h"

namespace StridesCsoRunReplay
{
// Une image de l'exécution ; faux si aucune mission n'y était en cours dans le jeu web (ep absent : rien à rejouer).
// bUiOk : bouton de carte touché affiché (vrai sans bouton) ; Cadence : cadence de concours après l'image.
inline bool Frame(AStridesCourse* Course, const J& Fr, UStridesCsoScreens* Screens, bool& bUiOk, strides::CsoCadence& Cadence)
{
	bUiOk = true;
	const J& Ep = Fr["ep"];
	if (Ep.isNull() || !Course || !Course->Run()) return false;
	const J& Ui = Fr["in"]["ui"];
	if (Ui.t == J::Str && !Ui.s.empty())
	{
		const FString Id = UTF8_TO_TCHAR(Ui.s.c_str());
		bUiOk = Screens ? Screens->ClickForTest(Id) : Course->PressScreenButton(Id);
	}
	if (Ep.o.count("lj"))
	{
		strides::CsoLastJump Lj;
		const J& V = Ep["lj"];
		Lj.has = !V.isNull();
		if (Lj.has)
		{
			Lj.num = V[0].isNull() ? -1 : (int)V[0].num();
			Lj.quality = V[1].isNull() ? std::string() : V[1].s;
		}
		Course->Run()->setLastJump(Lj);
	}
	strides::CsoFenceOut Out;
	for (size_t K = 0; K < (size_t)Ep["e0"].num() && K < Fr["ev"].a.size(); K++)
	{
		const J& E = Fr["ev"][K];
		const std::string& En = E["e"].s;
		if ((En != "obstacle:clear" && En != "obstacle:fault" && En != "obstacle:refusal") || E["d"]["obstacle"]["course"].s != "cso") continue;
		strides::CsoFenceEvent Ev;
		Ev.kind = En == "obstacle:clear" ? strides::CsoFenceEventKind::Clear : En == "obstacle:fault" ? strides::CsoFenceEventKind::Fault : strides::CsoFenceEventKind::Refusal;
		Ev.obstacle = (int)E["d"]["obstacle"]["num"].num() - 1;
		Ev.dir = (int)E["d"]["dir"].num();
		if (!E["d"]["cause"].isNull()) Ev.cause = E["d"]["cause"].s;
		Out.events.push_back(Ev);
	}
	strides::CsoCadence Cad{!Ep["cad"].isNull(), -12345.0};
	if (!Out.events.empty()) Course->HandleFenceOut(Out, Cad);
	strides::CsoRunFrame In;
	In.dt = Ep["dt"].num();
	In.time = Ep["gt"].num();
	In.x = Ep["x"].num();
	In.z = Ep["z"].num();
	In.heading = Ep["h"].num();
	In.focusX = Ep["fx"].isNull() ? In.x : Ep["fx"].num();
	In.focusZ = Ep["fz"].isNull() ? In.z : Ep["fz"].num();
	In.riding = Ep["mode"].s == "ride";
	In.driving = Ep["mode"].s == "drive";
	In.inTruck = !Ep["tk"].isNull() && Ep["tk"].b;
	In.vehicle = !Ep["vh"].isNull() && Ep["vh"].b;
	Cadence = strides::CsoCadence{!Ep["cad"].isNull(), Ep["cad"].isNull() ? 0 : Ep["cad"].num()};
	Course->TickRun(In, Cadence);
	return true;
}
}  // namespace StridesCsoRunReplay
