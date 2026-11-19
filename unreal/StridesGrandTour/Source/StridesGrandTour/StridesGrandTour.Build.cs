// Module de jeu : acteurs (cavalier, cheval, obstacles, parcours), sous-systèmes (données, sauvegarde), commandes,
// HUD. Les règles sont dans StridesCore (C++ standard, testé hors moteur) ; ce module convertit unités et axes
// (StridesUnits.h) et les expose à Unreal (UPROPERTY/UFUNCTION, Blueprints).
using UnrealBuildTool;

public class StridesGrandTour : ModuleRules
{
	public StridesGrandTour(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore", "EnhancedInput", "StridesCore" });
		PrivateDependencyModuleNames.AddRange(new string[] { "Json", "JsonUtilities", "UMG", "Slate", "SlateCore", "ApplicationCore", "ProceduralMeshComponent" });
	}
}
