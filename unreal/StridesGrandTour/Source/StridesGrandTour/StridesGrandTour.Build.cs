// Module de jeu : acteurs (cavalier, cheval, obstacles, parcours), sous-systèmes (données, sauvegarde), commandes,
// HUD. Les règles sont dans StridesCore (C++ standard, testé hors moteur) ; ce module convertit unités et axes
// (StridesUnits.h) et les expose à Unreal (UPROPERTY/UFUNCTION, Blueprints).
using UnrealBuildTool;

public class StridesGrandTour : ModuleRules
{
	public StridesGrandTour(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		// Lecteur JSON du cœur (MiniJson.h, qui lève des exceptions) inclus par les rejeux d'oracle des outils et des tests :
		// exceptions permises comme dans StridesCore (sans quoi la cible IOS Shipping ne compile pas, constaté le 20/11/2026).
		bEnableExceptions = true;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore", "EnhancedInput", "StridesCore" });
		PrivateDependencyModuleNames.AddRange(new string[] { "Json", "JsonUtilities", "UMG", "Slate", "SlateCore", "ApplicationCore", "ProceduralMeshComponent" });
	}
}
