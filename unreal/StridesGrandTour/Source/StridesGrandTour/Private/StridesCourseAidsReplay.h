// Rejeu du canal « ai » (tranche T9) d'une exécution de l'oracle cso_runs/ (exécutions t9-*) dans les aides du parcours
// du jeu (AStridesCourseAids) : obstacles relevés (liste « ob »), entrées de chaque appel de CourseAids.update (c.in),
// sol pris dans le relief du jeu. Même règle que unreal/core/tests/test_core.cpp (testCsoAids). Utilisé par le test
// Strides.Cso.Aids et par les poses « aide-* » de -StridesShots=cso.
#pragma once
#include <string>
#include <vector>
#include "StridesCore/CourseAids.h"
#include "StridesCore/MiniJson.h"
#include "StridesCourseAids.h"

namespace StridesCourseAidsReplay
{
inline std::vector<strides::CsoAidsFence> Fences(const J& Ob)
{
	std::vector<strides::CsoAidsFence> Out;
	for (size_t K = 0; K < Ob.a.size(); K++)
	{
		const J& O = Ob[K];
		strides::CsoAidsFence F;
		F.id = (int)K;
		F.ob = strides::makeCsoObstacle(O["kind"].s, O["x"].num(), O["z"].num(), O["rot"].num(), O["h"].num(), O["w"].num(), O["spread"].num(), O["label"].s, (int)O["num"].num(), "cso");
		F.ground = O["ground"].num();
		F.hasLineS = !O["lineS"].isNull();
		F.lineS = F.hasLineS ? O["lineS"].num() : 0;
		Out.push_back(F);
	}
	return Out;
}

inline strides::CsoAidsInput Input(const J& In, const std::vector<strides::CsoAidsFence>& Fs)
{
	strides::CsoAidsInput A;
	A.dt = In["dt"].num();
	A.next = In["n"].isNull() || (size_t)In["n"].num() >= Fs.size() ? nullptr : &Fs[(size_t)In["n"].num()];
	A.prevS = In["ps"].num();
	A.showLine = In["sl"].b;
	A.showZone = In["sz"].b;
	A.hasHorse = In["hh"].b;
	if (A.hasHorse)
	{
		A.hx = In["x"].num();
		A.hz = In["z"].num();
		A.speed = In["v"].num();
		A.power = In["pw"].num();
		A.clearance = In["cl"].num();
	}
	A.riding = In["md"].b;
	A.time = In["t"].num();
	return A;
}

// Appels de l'exécution jusqu'à l'image LastFrame comprise (−1 : toutes) dans l'acteur (Begin fait par l'appelant) ;
// rend le nombre d'appels ; Last = dernier appel rejoué (nul si aucun).
inline int Run(AStridesCourseAids* Aids, const J& RunJ, int LastFrame, const J** Last = nullptr)
{
	std::vector<strides::CsoAidsFence> Fs;
	int N = 0;
	if (Last) *Last = nullptr;
	for (const J& F : RunJ["frames"].a)
	{
		if (LastFrame >= 0 && (int)F["f"].num() > LastFrame) break;
		const J& Ai = F["ai"];
		if (!Ai["ob"].isNull()) Fs = Fences(Ai["ob"]);
		const J& C = Ai["c"];
		if (C.isNull()) continue;
		Aids->Step(Input(C["in"], Fs));
		if (Last) *Last = &C;
		N++;
	}
	return N;
}

// Vue du cœur après un appel comparée à l'état relevé du web (out) : tirets affichés, repère, bandes (x, z, cap,
// échelle exacts à Tol près ; altitude des bandes posée sur le relief du jeu : écart rendu dans GroundDev), zone et sa
// temporisation. Rend la liste des parties différentes.
inline TArray<FString> Diff(const strides::CsoCourseAids& C, const J& Out, double Tol, double& GroundDev)
{
	TArray<FString> D;
	const strides::CsoAidsView& V = C.view();
	auto Near = [Tol](double A, const J& B) { return FMath::Abs(A - B.num()) <= Tol * FMath::Max(1.0, FMath::Abs(B.num())); };
	auto Range = [&](const TCHAR* What, int First, int Count, const J& W)
	{
		if (V.lineVisible != W[0].b || (V.lineVisible && (W[2].isNull() || First != (int)W[1].num() || Count != (int)W[2].num()))) D.Add(What);
	};
	Range(TEXT("tracé"), V.lineFirst, V.lineCount, Out["ln"]);
	Range(TEXT("suite du tracé"), V.afterFirst, V.afterCount, Out["af"]);
	const J& M = Out["mk"];
	if (V.markVisible != M[0].b || !Near(V.markX, M[1]) || !Near(V.markY, M[2]) || !Near(V.markZ, M[3]) || !Near(V.markRot, M[4])) D.Add(TEXT("repère"));
	auto Band = [&](const TCHAR* What, const strides::CsoAidsBand& B, const J& W)
	{
		if (B.visible != W[0].b) { D.Add(What); return; }
		if (!B.visible) return;
		if (!Near(B.x, W[1]) || !Near(B.z, W[3]) || !Near(B.rot, W[4]) || !Near(B.sx, W[5]) || !Near(B.sz, W[6])) D.Add(What);
		GroundDev = FMath::Max(GroundDev, FMath::Abs(B.y - W[2].num()));
	};
	Band(TEXT("bande ambre"), V.ok, Out["ok"]);
	Band(TEXT("bande verte"), V.good, Out["gd"]);
	if (!Near(C.zoneTimer(), Out["zt"]) || C.zoneFor() != (Out["zf"].isNull() ? -1 : (int)Out["zf"].num())) D.Add(TEXT("zone (temporisation)"));
	return D;
}
}  // namespace StridesCourseAidsReplay
