using UnrealBuildTool;

public class StridesGrandTourTarget : TargetRules
{
	public StridesGrandTourTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.AddRange(new string[] { "StridesGrandTour", "StridesCore" });
	}
}
