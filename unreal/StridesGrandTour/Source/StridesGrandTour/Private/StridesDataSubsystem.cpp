#include "StridesDataSubsystem.h"
#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

bool UStridesDataSubsystem::LoadJson(const FString& File, TSharedPtr<FJsonObject>& Out)
{
	const FString Path = FPaths::ProjectContentDir() / TEXT("Data") / File;
	FString Text;
	if (!FFileHelper::LoadFileToString(Text, *Path))
	{
		LoadLog.Add(FString::Printf(TEXT("%s : introuvable (%s)"), *File, *Path));
		return false;
	}
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
	if (!FJsonSerializer::Deserialize(Reader, Out) || !Out.IsValid())
	{
		LoadLog.Add(FString::Printf(TEXT("%s : JSON illisible"), *File));
		return false;
	}
	LoadLog.Add(FString::Printf(TEXT("%s : %s"), *File, *Out->GetStringField(TEXT("schema"))));
	return true;
}

void UStridesDataSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	TSharedPtr<FJsonObject> J;
	if (LoadJson(TEXT("horse_gaits.json"), J))
	{
		for (const TSharedPtr<FJsonValue>& V : J->GetArrayField(TEXT("gaits")))
		{
			const TSharedPtr<FJsonObject> G = V->AsObject();
			FStridesGait Gait;
			Gait.Id = G->GetStringField(TEXT("id"));
			Gait.Name = FText::FromString(G->GetStringField(TEXT("name")));
			Gait.Speed = G->GetNumberField(TEXT("speed"));
			double Max = 0;
			if (G->TryGetNumberField(TEXT("max"), Max)) Gait.MaxSpeed = Max;
			Gaits.Add(Gait);
		}
		JumpPeak = J->GetNumberField(TEXT("jumpPeak"));
		MinJumpSpeed = J->GetNumberField(TEXT("minJumpSpeed"));
	}
	if (LoadJson(TEXT("horse_profiles.json"), J))
	{
		for (const TSharedPtr<FJsonValue>& V : J->GetArrayField(TEXT("horses")))
		{
			const TSharedPtr<FJsonObject> H = V->AsObject();
			FStridesHorseProfile P;
			P.Id = H->GetStringField(TEXT("id"));
			P.Name = H->GetStringField(TEXT("name"));
			H->TryGetStringField(TEXT("breed"), P.Breed);
			H->TryGetStringField(TEXT("coat"), P.Coat);
			H->TryGetNumberField(TEXT("age"), P.Age);
			double D;
			if (H->TryGetNumberField(TEXT("speed"), D)) P.SpeedMul = D;
			if (H->TryGetNumberField(TEXT("jump"), D)) P.JumpMul = D;
			if (H->TryGetNumberField(TEXT("stamina"), D)) P.StaminaMul = D;
			Horses.Add(P);
		}
	}
	if (LoadJson(TEXT("jump_model.json"), J))
	{
		auto N = [&J](const TCHAR* K, double& Out) { J->TryGetNumberField(K, Out); };
		N(TEXT("T"), JumpP.T); N(TEXT("lift"), JumpP.lift); N(TEXT("adapt"), JumpP.adapt); N(TEXT("shorten"), JumpP.shorten);
		N(TEXT("adaptXc"), JumpP.adaptXc); N(TEXT("shortenXc"), JumpP.shortenXc); N(TEXT("minFront"), JumpP.minFront);
		N(TEXT("good"), JumpP.good); N(TEXT("rub"), JumpP.rub); N(TEXT("late"), JumpP.late); N(TEXT("maxAngle"), JumpP.maxAngle);
		N(TEXT("reach"), JumpP.reach); N(TEXT("clear"), JumpP.clear); N(TEXT("spreadK"), JumpP.spreadK); N(TEXT("T0"), JumpP.T0);
		N(TEXT("Tk"), JumpP.Tk); N(TEXT("Tmin"), JumpP.Tmin); N(TEXT("Tmax"), JumpP.Tmax);
	}
	if (LoadJson(TEXT("cso_ride.json"), J))
	{
		auto N = [&J](const TCHAR* K, double& Out) { J->TryGetNumberField(K, Out); };
		N(TEXT("cadence"), RideP.cadence); N(TEXT("maxSpeed"), RideP.maxSpeed); N(TEXT("cadenceRate"), RideP.cadenceRate);
		N(TEXT("lowRate"), RideP.lowRate); N(TEXT("deadZone"), RideP.deadZone); N(TEXT("slope"), RideP.slope);
		N(TEXT("steerDead"), RideP.steerDead); N(TEXT("expo"), RideP.expo); N(TEXT("radius0"), RideP.radius0);
		N(TEXT("radiusK"), RideP.radiusK); N(TEXT("pivot"), RideP.pivot); N(TEXT("yawTau"), RideP.yawTau); N(TEXT("yawAcc"), RideP.yawAcc);
		N(TEXT("airTurn"), RideP.airTurn); N(TEXT("kbdRamp"), RideP.kbdRamp); N(TEXT("landingLoss"), RideP.landingLoss);
	}
	// Parcours : tracé du fichier (commandes F/L/R/J/M) ; à défaut, le tracé du Pôle compilé dans StridesCore.
	PoleDesign = strides::poleDesign();
	if (LoadJson(TEXT("cso_course_pole.json"), J))
	{
		const TSharedPtr<FJsonObject> D = J->GetObjectField(TEXT("design"));
		const TSharedPtr<FJsonObject> S = D->GetObjectField(TEXT("start"));
		strides::CourseDesign Design;
		Design.x = S->GetNumberField(TEXT("x"));
		Design.z = S->GetNumberField(TEXT("z"));
		Design.h = S->GetNumberField(TEXT("h"));
		for (const TSharedPtr<FJsonValue>& V : D->GetArrayField(TEXT("cmds")))
		{
			const TArray<TSharedPtr<FJsonValue>>& C = V->AsArray();
			const FString Op = C[0]->AsString();
			strides::CourseCmd Cmd;
			Cmd.op = (char)Op[0];
			if (Op == TEXT("F")) Cmd.a = C[1]->AsNumber();
			else if (Op == TEXT("L") || Op == TEXT("R")) { Cmd.a = C[1]->AsNumber(); Cmd.b = C[2]->AsNumber(); }
			else if (Op == TEXT("J")) { Cmd.label = TCHAR_TO_UTF8(*C[1]->AsString()); Cmd.kind = TCHAR_TO_UTF8(*C[2]->AsString()); Cmd.spread = C.Num() > 3 ? C[3]->AsNumber() : 0; }
			else if (Op == TEXT("M")) Cmd.label = TCHAR_TO_UTF8(*C[1]->AsString());
			Design.cmds.push_back(Cmd);
		}
		for (const auto& P : D->GetObjectField(TEXT("profile"))->Values) Design.profile[TCHAR_TO_UTF8(*P.Key)] = P.Value->AsNumber();
		PoleDesign = Design;
		for (const auto& P : J->GetObjectField(TEXT("speeds"))->Values) CourseSpeeds.Add(P.Key, P.Value->AsNumber());
	}
}

const FStridesHorseProfile* UStridesDataSubsystem::FindHorse(const FString& Id) const
{
	return Horses.FindByPredicate([&Id](const FStridesHorseProfile& H) { return H.Id == Id; });
}

float UStridesDataSubsystem::CourseSpeed(const FString& Level) const
{
	const float* S = CourseSpeeds.Find(Level);
	return S ? *S : 350.f;
}
