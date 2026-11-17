// Module Unreal du cœur Strides : règles de jeu en C++17 standard (saut, conduite CSO, parcours et jugement, sauvegarde),
// sans type Unreal, testées hors moteur contre les oracles du jeu web (unreal/core). Les modules de jeu l'utilisent
// à travers StridesGrandTour (conversion cm/axes, UObject, Blueprints).
using UnrealBuildTool;

public class StridesCore : ModuleRules
{
	public StridesCore(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		CppStandard = CppStandardVersion.Cpp20;
		// Le lecteur JSON du cœur signale les fichiers abîmés par exception (attrapée dans SaveGame) : exceptions activées
		// pour ce module seulement.
		bEnableExceptions = true;
		PublicDependencyModuleNames.AddRange(new string[] { "Core" });
	}
}
