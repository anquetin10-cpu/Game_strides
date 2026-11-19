// Rejeu des entrées du HUD d'épreuve (tranche T7) depuis une exécution de l'oracle cso_runs/ ou la séquence synthétique
// de cso_hud.json : même règle que scripts/unreal/export-hud-style.mjs (page du jeu web) et que
// unreal/core/tests/test_core.cpp (testCsoHud) : appels du lancement à 0 ; image f : temporisations échues (100 ticks),
// appels hud.* (big, toast, hint, clearHint, jumpFeedback, setObjective), appels ajoutés, puis hud.update(1/30) avec
// game.course (controls, kind), le tableau relevé (classes over / faults ; textes affichés = board.txt) et la cadence du
// canal « ch » (indéfinie dans les images légères). Utilisé par le test Strides.Parite.CsoHud et par les poses « hud-* »
// de -StridesShots=cso.
#pragma once
#include <string>
#include "StridesCore/CsoHud.h"
#include "StridesCore/MiniJson.h"

namespace StridesCsoHudReplay
{
inline bool IsHudFn(const std::string& Fn)
{
	return Fn == "big" || Fn == "toast" || Fn == "hint" || Fn == "clearHint" || Fn == "jumpFeedback" || Fn == "setObjective";
}

inline void Call(strides::CsoHud& H, const std::string& Fn, const J& Args)
{
	if (!IsHudFn(Fn)) return;
	if (Fn == "setObjective")
	{
		H.setObjective(!Args.a.empty() && !Args[0].isNull());
		return;
	}
	strides::CsoCall C;
	C.fn = Fn;
	for (const J& A : Args.a)
	{
		strides::CsoArg X;
		if (A.t == J::Num) { X.isNum = true; X.n = A.n; }
		else X.s = A.s;
		C.args.push_back(X);
	}
	H.call(C);
}

// Appels d'une liste : objets { fn, args } (cso_runs) ou paires [fn, args] (séquence synthétique, appels ajoutés).
inline void Calls(strides::CsoHud& H, const J& List)
{
	for (const J& C : List.a)
	{
		if (C.t == J::Arr) Call(H, C[0].s, C[1]);
		else Call(H, C["fn"].s, C["args"]);
	}
}

// Une image : Frame = image de cso_runs (Synth faux) ou entrée de la séquence synthétique.
inline void Frame(strides::CsoHud& H, const J& F, bool bSynth, const J* Extra = nullptr)
{
	H.advanceTicks(100);
	strides::CsoHudFrame In;
	const J& Course = F["course"];
	const J& Board = F["board"];
	In.course = !Course.isNull();
	In.controlsCso = In.course && Course["controls"].s == "cso";
	In.kindCso = In.course && Course["kind"].s == "cso";
	In.board = !Board.isNull();  // tableau fourni tel quel : CsoHud applique lui-même game.course && hud()
	if (In.board)
	{
		In.info.over = Board["over"].b;
		In.info.pen = (int)Board["pen"].num();
		const J& Txt = Board["txt"];
		for (int K = 0; K < 4 && (size_t)K < Txt.a.size(); K++) In.info.txt[K] = Txt[(size_t)K].s;
	}
	if (bSynth)
	{
		In.hasCadence = !F["cad"].isNull() && !F["cad"][0].isNull();
		if (In.hasCadence) { In.cadence = F["cad"][0].num(); In.cadAdjust = F["cad"][1].b; }
	}
	else
	{
		const J& S = F["ch"]["s"];
		In.hasCadence = !S.isNull() && !S["cad"].isNull();
		if (In.hasCadence) { In.cadence = S["cad"].num(); In.cadAdjust = !S["ca"].isNull() && S["ca"].b; }
	}
	Calls(H, F["hud"]);
	if (Extra) Calls(H, *Extra);
	H.update(1.0 / 30, In);
}

// Exécution de cso_runs rejouée jusqu'à l'image LastFrame comprise (−1 : toutes) ; appels ExtraCalls ajoutés à
// l'image ExtraFrame. Rend le nombre d'images rejouées.
inline int Run(strides::CsoHud& H, const J& RunJ, int LastFrame = -1, int ExtraFrame = -1, const J* ExtraCalls = nullptr)
{
	Calls(H, RunJ["setup"]["calls"]["hud"]);
	int N = 0;
	for (const J& F : RunJ["frames"].a)
	{
		const int Fi = (int)F["f"].num();
		if (LastFrame >= 0 && Fi > LastFrame) break;
		Frame(H, F, false, Fi == ExtraFrame ? ExtraCalls : nullptr);
		N++;
	}
	return N;
}
}  // namespace StridesCsoHudReplay
