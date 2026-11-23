// Strides.Shots.OutputDir : dossier de sortie du mode -StridesShots (AStridesShots::ResolveShotsDir). Dossiers de
// travail créés dans Saved/Automation/Transient/StridesShotsDir (jamais dans Saved/Screenshots) : un dossier « protégé »
// qui contient déjà une capture est refusé sans l'option comme avec elle (même écrit autrement, y compris avec une autre
// casse : volume APFS insensible à la casse), un dossier protégé
// vide est accepté, l'option est prise telle quelle (absolue) ou relative à la racine du dépôt, le mode cso sans option
// garde les chemins de poses.json ; la capture préexistante est relue intacte. Puis les vrais dossiers du projet :
// Saved/Screenshots/Strides et MacEditor sont protégés, et -StridesShots sans option est refusé tant que
// Saved/Screenshots/Strides contient des fichiers (lecture seule : rien n'y est créé ni modifié).
#include "Misc/AutomationTest.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "StridesShots.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesShotsOutputDirTest, "Strides.Shots.OutputDir", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesShotsOutputDirTest::RunTest(const FString&)
{
	IFileManager& FM = IFileManager::Get();
	const FString Base = FPaths::ConvertRelativePathToFull(FPaths::AutomationTransientDir() / TEXT("StridesShotsDir"));
	FM.DeleteDirectory(*Base, false, true);  // dossier de travail de ce test seulement
	const FString Prot = Base / TEXT("Protege");
	const FString Empty = Base / TEXT("Vide");
	const FString Repo = Base / TEXT("depot");
	const FString Old = Prot / TEXT("01_ecurie_cour.png");
	const FString OldText = TEXT("capture existante");
	FM.MakeDirectory(*Empty, true);
	FM.MakeDirectory(*Repo, true);
	if (!TestTrue(TEXT("capture préexistante écrite"), FFileHelper::SaveStringToFile(OldText, *Old))) return false;
	TestTrue(TEXT("dossier protégé non vide vu comme tel"), AStridesShots::DirHasFiles(Prot));
	TestFalse(TEXT("dossier vide vu comme tel"), AStridesShots::DirHasFiles(Empty));
	const TArray<FString> Protected = {Prot, Empty};
	FString Out, Why;

	// Sans option, dossier par défaut protégé et non vide : refus, motif nommant le dossier.
	TestFalse(TEXT("sans option, défaut protégé non vide : refus"), AStridesShots::ResolveShotsDir(TEXT("-game -StridesShots"), Repo, Prot, Protected, Out, Why));
	TestTrue(TEXT("motif du refus"), Why.Contains(TEXT("Protege")) && Why.Contains(TEXT("-StridesShotsDir")));
	TestTrue(TEXT("aucun dossier rendu au refus"), Out.IsEmpty());
	// Option désignant ce même dossier, écrit autrement (barre finale, « .. », doubles barres) : refus aussi.
	const FString Detour = FString::Printf(TEXT("-StridesShots -StridesShotsDir=%s/depot/..//Protege/"), *Base);
	TestFalse(TEXT("option vers le dossier protégé non vide : refus"), AStridesShots::ResolveShotsDir(*Detour, Repo, FString(), Protected, Out, Why));
	// Même dossier écrit avec une autre casse (volume APFS insensible à la casse : c'est le même dossier) : refus aussi.
	const FString Casse = FString::Printf(TEXT("-StridesShots -StridesShotsDir=%s/PROTEGE"), *Base);
	TestFalse(TEXT("option vers le dossier protégé écrit avec une autre casse : refus"), AStridesShots::ResolveShotsDir(*Casse, Repo, FString(), Protected, Out, Why));
	TestTrue(TEXT("motif du refus (autre casse)"), Why.Contains(TEXT("Protege")) && Out.IsEmpty());
	const FString CasseRel = TEXT("-StridesShots -StridesShotsDir=../protege");  // relative à la racine (Base/depot)
	TestFalse(TEXT("option relative vers le dossier protégé, autre casse : refus"), AStridesShots::ResolveShotsDir(*CasseRel, Repo, FString(), Protected, Out, Why));
	// Sans option, dossier par défaut protégé mais vide : accepté.
	TestTrue(TEXT("sans option, défaut protégé vide : accepté"), AStridesShots::ResolveShotsDir(TEXT("-StridesShots"), Repo, Empty, Protected, Out, Why));
	TestTrue(TEXT("dossier rendu = défaut vide"), FPaths::IsSamePath(Out, Empty));
	// Option absolue : dossier dédié retenu tel quel, même si le défaut est protégé et non vide.
	const FString Dedie = Base / TEXT("dedie");
	TestTrue(TEXT("option absolue : acceptée"), AStridesShots::ResolveShotsDir(*FString::Printf(TEXT("-StridesShots -StridesShotsDir=%s"), *Dedie), Repo, Prot, Protected, Out, Why));
	TestTrue(TEXT("dossier rendu = option absolue"), FPaths::IsSamePath(Out, Dedie) && !FPaths::IsRelative(Out));
	// Option relative : relative à la racine du dépôt ; aussi en mode cso (même nom de fichier que poses.json).
	TestTrue(TEXT("option relative : acceptée"), AStridesShots::ResolveShotsDir(TEXT("-StridesShots=cso -StridesShotsDir=.tmp/captures-cso"), Repo, FString(), Protected, Out, Why));
	TestTrue(TEXT("dossier rendu = racine du dépôt / option relative"), FPaths::IsSamePath(Out, Repo / TEXT(".tmp/captures-cso")));
	// Mode cso sans option : chemins de poses.json (aucun dossier imposé), accepté.
	TestTrue(TEXT("mode cso sans option : accepté"), AStridesShots::ResolveShotsDir(TEXT("-StridesShots=cso"), Repo, FString(), Protected, Out, Why));
	TestTrue(TEXT("mode cso sans option : chemins de poses.json"), Out.IsEmpty());
	// La capture préexistante n'a pas été touchée.
	FString Read;
	TestTrue(TEXT("capture préexistante intacte"), FFileHelper::LoadFileToString(Read, *Old) && Read == OldText);
	FM.DeleteDirectory(*Base, false, true);

	// Dossiers réels du projet (lecture seule).
	const TArray<FString> Real = AStridesShots::ProtectedShotsDirs();
	const FString Strides = AStridesShots::DefaultShotsDir();
	TestTrue(TEXT("Saved/Screenshots/Strides protégé"), Real.ContainsByPredicate([&](const FString& P) { return FPaths::IsSamePath(P, Strides); }));
	TestTrue(TEXT("Saved/Screenshots/MacEditor protégé"), Real.ContainsByPredicate([](const FString& P) { return P.EndsWith(TEXT("Screenshots/MacEditor")); }));
	// Le vrai dossier Strides désigné en minuscules (…/Screenshots/strides) : refusé s'il contient des fichiers.
	{
		const FString Lower = FPaths::GetPath(Strides) / TEXT("strides");
		const bool bLowerOk = AStridesShots::ResolveShotsDir(*FString::Printf(TEXT("-StridesShots -StridesShotsDir=%s"), *Lower), AStridesShots::RepoRoot(), FString(), Real, Out, Why);
		TestEqual(TEXT("-StridesShotsDir=…/Screenshots/strides : refusé si et seulement si Saved/Screenshots/Strides contient des fichiers"), bLowerOk, !AStridesShots::DirHasFiles(Strides));
	}
	const bool bJulien = AStridesShots::DirHasFiles(Strides);
	const bool bOk = AStridesShots::ResolveShotsDir(TEXT("-game -StridesShots"), AStridesShots::RepoRoot(), Strides, Real, Out, Why);
	TestEqual(TEXT("-StridesShots sans option : refusé si et seulement si Saved/Screenshots/Strides contient des fichiers"), bOk, !bJulien);
	AddInfo(FString::Printf(TEXT("Saved/Screenshots/Strides %s ; -StridesShots sans option : %s"), bJulien ? TEXT("non vide") : TEXT("vide"), bOk ? TEXT("accepté") : *(TEXT("refusé : ") + Why)));
	return true;
}

// Strides.Shots.PerfStats : résumé écrit par le mode -StridesShots=perf (essai de monte, étape 7) dans perf-unreal.json,
// calculé par strides::perf::summarize (centile type 7) ; mêmes valeurs attendues que le ctest « perf » (à la main).
#include "Dom/JsonObject.h"
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesShotsPerfStatsTest, "Strides.Shots.PerfStats", EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FStridesShotsPerfStatsTest::RunTest(const FString&)
{
	TArray<double> V;
	for (int32 I = 0; I < 20; I++) V.Add((I * 7) % 20 + 1);  // 1..20 dans le désordre
	const TSharedPtr<FJsonObject> S = AStridesShots::PerfSummaryJson(V);
	TestEqual(TEXT("n"), S->GetNumberField(TEXT("n")), 20.0);
	TestEqual(TEXT("médiane"), S->GetNumberField(TEXT("median")), 10.5, 1e-12);
	TestEqual(TEXT("95e centile : h = 18,05 → 19,05"), S->GetNumberField(TEXT("p95")), 19.05, 1e-12);
	TestEqual(TEXT("moyenne"), S->GetNumberField(TEXT("mean")), 10.5, 1e-12);
	TestEqual(TEXT("minimum"), S->GetNumberField(TEXT("min")), 1.0);
	TestEqual(TEXT("maximum"), S->GetNumberField(TEXT("max")), 20.0);
	TestEqual(TEXT("série vide : n = 0"), AStridesShots::PerfSummaryJson({})->GetNumberField(TEXT("n")), 0.0);
	TestEqual(TEXT("p95 de {1, 3, 5} = 4,8"), AStridesShots::PerfSummaryJson({5, 1, 3})->GetNumberField(TEXT("p95")), 4.8, 1e-12);
	return true;
}
