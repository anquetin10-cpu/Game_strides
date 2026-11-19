// Oracles de scénario du banc de parité CSO pour les tests moteur (Strides.Parite.*) : dossier
// unreal/core/tests/oracles/cso_runs/ écrit par scripts/unreal/export-cso-runs.mjs (format de
// scripts/unreal/cso-runs-io.mjs) : index.json (en-tête, liste des exécutions dans l'ordre) et un fichier par exécution,
// <id>.<lang>.json = { id, lang, desc, setup, frames }. Même lecture que unreal/core/tests/test_core.cpp (loadRuns).
#pragma once
#include "CoreMinimal.h"
#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace StridesOracleRuns
{
inline const TCHAR* Schema() { return TEXT("strides.oracle.cso_runs/2"); }

struct FEntry
{
	FString Id, Lang, File;
	int32 Frames = 0;
};

inline FString Dir()
{
	FString Root = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../.."));
	FPaths::CollapseRelativeDirectories(Root);
	return Root / TEXT("unreal/core/tests/oracles/cso_runs");
}

// Entrées de l'index, dans l'ordre ; vide si l'index est illisible, d'un autre schéma ou mal formé.
inline TArray<FEntry> List()
{
	TArray<FEntry> L;
	FString Text;
	TSharedPtr<FJsonObject> O;
	if (!FFileHelper::LoadFileToString(Text, *(Dir() / TEXT("index.json"))) || !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), O) || !O.IsValid()) return L;
	FString S;
	const TArray<TSharedPtr<FJsonValue>>* Runs = nullptr;
	if (!O->TryGetStringField(TEXT("schema"), S) || S != Schema() || !O->TryGetArrayField(TEXT("runs"), Runs)) return L;
	for (const TSharedPtr<FJsonValue>& V : *Runs)
	{
		const TSharedPtr<FJsonObject>* E = nullptr;
		FEntry R;
		double N = -1;
		if (!V->TryGetObject(E) || !(*E)->TryGetStringField(TEXT("id"), R.Id) || !(*E)->TryGetStringField(TEXT("lang"), R.Lang) || !(*E)->TryGetStringField(TEXT("file"), R.File) ||
			!(*E)->TryGetNumberField(TEXT("frames"), N) || R.File != R.Id + TEXT(".") + R.Lang + TEXT(".json"))
			return TArray<FEntry>();
		R.Frames = (int32)N;
		L.Add(R);
	}
	return L;
}

inline FString Path(const FEntry& E) { return Dir() / E.File; }

// Exécution lue en arbre JSON d'Unreal ; nul si illisible ou si l'identifiant, la langue ou le nombre d'images
// diffèrent de l'index.
inline TSharedPtr<FJsonObject> Load(const FEntry& E)
{
	FString Text;
	TSharedPtr<FJsonObject> R;
	if (!FFileHelper::LoadFileToString(Text, *Path(E)) || !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), R) || !R.IsValid()) return nullptr;
	FString Id, Lang;
	const TArray<TSharedPtr<FJsonValue>>* Frames = nullptr;
	if (!R->TryGetStringField(TEXT("id"), Id) || Id != E.Id || !R->TryGetStringField(TEXT("lang"), Lang) || Lang != E.Lang || !R->TryGetArrayField(TEXT("frames"), Frames) ||
		Frames->Num() != E.Frames)
		return nullptr;
	return R;
}
}  // namespace StridesOracleRuns
