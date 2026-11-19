// Strides.Shots.OutputDir : dossier de sortie du mode -StridesShots (AStridesShots::ResolveShotsDir). Dossiers de
// travail créés dans Saved/Automation/Transient/StridesShotsDir (jamais dans Saved/Screenshots) : un dossier « protégé »
// qui contient déjà une capture est refusé sans l'option comme avec elle (même écrit autrement), un dossier protégé
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
	const bool bJulien = AStridesShots::DirHasFiles(Strides);
	const bool bOk = AStridesShots::ResolveShotsDir(TEXT("-game -StridesShots"), AStridesShots::RepoRoot(), Strides, Real, Out, Why);
	TestEqual(TEXT("-StridesShots sans option : refusé si et seulement si Saved/Screenshots/Strides contient des fichiers"), bOk, !bJulien);
	AddInfo(FString::Printf(TEXT("Saved/Screenshots/Strides %s ; -StridesShots sans option : %s"), bJulien ? TEXT("non vide") : TEXT("vide"), bOk ? TEXT("accepté") : *(TEXT("refusé : ") + Why)));
	return true;
}
