#include "StridesMonteOptions.h"

#include "Misc/CommandLine.h"
#include "Misc/Parse.h"

namespace StridesMonteOptions
{
FMonte Resolve(const TCHAR* CommandLine, TArray<FString>* Unknown)
{
	const TCHAR* Cmd = CommandLine ? CommandLine : TEXT("");
	// Option à deux valeurs : 1 (Oui), 0 (Non), -1 (absente ou inconnue).
	const auto Read = [&](const TCHAR* Key, const TCHAR* Yes, const TCHAR* No) -> int32 {
		FString V;
		if (!FParse::Value(Cmd, Key, V)) return -1;
		if (V == Yes) return 1;
		if (V == No) return 0;
		if (Unknown) Unknown->Add(FString::Printf(TEXT("-%s%s"), Key, *V));
		return -1;
	};
	const int32 Group = Read(TEXT("StridesMonte="), TEXT("web"), TEXT("ancien"));
	const bool bGroup = Group < 0 ? bWebByDefault : Group == 1;
	FMonte M;
	const int32 Rider = Read(TEXT("StridesRider="), TEXT("regles"), TEXT("ancien"));
	M.bRiderRules = Rider < 0 ? bGroup : Rider == 1;
	const int32 Lead = Read(TEXT("StridesHorseLead="), TEXT("web"), TEXT("droite"));
	M.bWebLead = Lead < 0 ? bGroup : Lead == 1;
	const int32 Tack = Read(TEXT("StridesTack="), TEXT("web"), TEXT("aucune"));
	M.bTackMesh = Tack < 0 ? (bGroup || M.bRiderRules) : Tack == 1;
	return M;
}

bool ResolveWebHorseScale(const TCHAR* CommandLine, TArray<FString>* Unknown)
{
	const TCHAR* Cmd = CommandLine ? CommandLine : TEXT("");
	FString V;
	if (FParse::Value(Cmd, TEXT("StridesHorseScale="), V))
	{
		if (V == TEXT("web")) return true;
		if (V == TEXT("jeu")) return false;
		if (Unknown) Unknown->Add(FString::Printf(TEXT("-StridesHorseScale=%s"), *V));
	}
	FString G;
	if (FParse::Value(Cmd, TEXT("StridesMonte="), G) && G == TEXT("ancien")) return false;
	return bWebHorseScaleByDefault;
}

bool WebHorseScaleFromCommandLine()
{
	TArray<FString> Unknown;
	const bool B = ResolveWebHorseScale(FCommandLine::Get(), &Unknown);
	for (const FString& U : Unknown) UE_LOG(LogTemp, Warning, TEXT("Strides taille du cheval : option %s inconnue, ignorée"), *U);
	return B;
}

FMonte FromCommandLine()
{
	TArray<FString> Unknown;
	const FMonte M = Resolve(FCommandLine::Get(), &Unknown);
	for (const FString& U : Unknown) UE_LOG(LogTemp, Warning, TEXT("Strides monte : option %s inconnue, ignorée"), *U);
	return M;
}

FString Describe(const FMonte& M)
{
	if (M.bRiderRules && M.bWebLead && M.bTackMesh) return TEXT("web");
	if (!M.bRiderRules && !M.bWebLead && !M.bTackMesh) return TEXT("ancien");
	return FString::Printf(TEXT("cavalière %s, main %s, sellerie %s"), M.bRiderRules ? TEXT("règles") : TEXT("ancienne"),
		M.bWebLead ? TEXT("web") : TEXT("droite"), M.bTackMesh ? TEXT("web") : TEXT("aucune"));
}
}  // namespace StridesMonteOptions
