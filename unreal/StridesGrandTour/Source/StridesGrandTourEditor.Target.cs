using UnrealBuildTool;

public class StridesGrandTourEditorTarget : TargetRules
{
	public StridesGrandTourEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.AddRange(new string[] { "StridesGrandTour", "StridesCore" });
	}
}
