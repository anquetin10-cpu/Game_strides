#include "StridesDataSubsystem.h"
#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "ImageUtils.h"
#include "Engine/Texture2D.h"
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
	if (LoadJson(TEXT("cso_horse.json"), J))
	{
		auto N = [&J](const TCHAR* K, double& Out) { J->TryGetNumberField(K, Out); };
		N(TEXT("ref"), HorseP.ref); N(TEXT("nose"), HorseP.nose); N(TEXT("overrun"), HorseP.overrun);
		N(TEXT("jumpDuration"), HorseP.jumpDuration); N(TEXT("minJumpSpeed"), HorseP.minJumpSpeed);
		N(TEXT("hindTrail"), FenceP.hindTrail);
		double W = 0;
		if (J->TryGetNumberField(TEXT("csoFenceWidth"), W)) CsoFenceWidth = W;
	}
	// HUD d'épreuve (tranche T7) : styles calculés par le navigateur, lus par UStridesCsoHud.
	LoadJson(TEXT("hud_cso_style.json"), CsoHudStyleJson);
	// Commandes d'épreuve (tranche T8) : styles de la page tactile et icônes PNG rendues par le navigateur.
	if (LoadJson(TEXT("cso_controls_style.json"), CsoControlsJson))
	{
		const TSharedPtr<FJsonObject>* Icons = nullptr;
		if (CsoControlsJson->TryGetObjectField(TEXT("icons"), Icons))
			for (const auto& KV : (*Icons)->Values)
			{
				const FString File = KV.Value->AsObject()->GetStringField(TEXT("file"));
				if (UTexture2D* T = FImageUtils::ImportFileAsTexture2D(FPaths::ProjectContentDir() / TEXT("Data") / File)) UiIcons.Add(FString(*KV.Key), T);
				else UE_LOG(LogTemp, Warning, TEXT("Strides: icône %s illisible"), *File);
			}
	}
	// Aides à l'appel (tranche T9) : aides du parcours (scène du web) et bouton SAUT coloré (HUD du web).
	LoadJson(TEXT("cso_aids.json"), CsoAidsJson);
	LoadJson(TEXT("cso_jump_style.json"), CsoJumpJson);
	if (LoadJson(TEXT("cso_camera.json"), J))
	{
		auto N = [&J](const TCHAR* K, double& Out) { J->TryGetNumberField(K, Out); };
		N(TEXT("back"), CamP.back); N(TEXT("up"), CamP.up); N(TEXT("lookAhead"), CamP.lookAhead); N(TEXT("lookUp"), CamP.lookUp);
		N(TEXT("fenceBias"), CamP.fenceBias); N(TEXT("fenceRange"), CamP.fenceRange); N(TEXT("lead"), CamP.lead); N(TEXT("yawK"), CamP.yawK);
		N(TEXT("yawAcc"), CamP.yawAcc); N(TEXT("posK"), CamP.posK); N(TEXT("yK"), CamP.yK); N(TEXT("jumpFollow"), CamP.jumpFollow);
		N(TEXT("fov"), CamP.fov); N(TEXT("minBack"), CamP.minBack); N(TEXT("fenceClear"), CamP.fenceClear); N(TEXT("enter"), CamP.enter);
	}
	// Parcours : tracé du fichier (commandes F/L/R/J/M) ; à défaut, le tracé du Pôle compilé dans StridesCore.
	PoleDesign = strides::poleDesign();
	if (LoadJson(TEXT("cso_course_pole.json"), J))
	{
		if (const TSharedPtr<FJsonObject>* A; J->TryGetObjectField(TEXT("arena"), A))
			PoleArena = FVector2D((*A)->GetNumberField(TEXT("x")), (*A)->GetNumberField(TEXT("z")));
		// Tracé : lecture du cœur (strides::parseCourseFile), la même que celle que les tests du cœur comparent à
		// l'oracle cso_course.json (unreal/core/tests/test_core.cpp, testCourse).
		FString Text;
		strides::CourseDesign Design;
		std::string Err = "fichier illisible";
		if (FFileHelper::LoadFileToString(Text, *(FPaths::ProjectContentDir() / TEXT("Data/cso_course_pole.json")))
			&& strides::parseCourseFile(std::string(TCHAR_TO_UTF8(*Text)), Design, Err))
		{
			PoleDesign = Design;
			PoleCourseJson = std::string(TCHAR_TO_UTF8(*Text));
		}
		else
			LoadLog.Add(FString::Printf(TEXT("cso_course_pole.json : tracé illisible (%s), tracé compilé utilisé"), UTF8_TO_TCHAR(Err.c_str())));
		for (const auto& P : J->GetObjectField(TEXT("speeds"))->Values) CourseSpeeds.Add(FString(P.Key), P.Value->AsNumber());
	}
	// Textes de l'épreuve (tranche T4) : table lue par le cœur (strides::TextTable), la même que testCsoRuns.
	{
		FString Text;
		std::string Err = "fichier introuvable";
		if (FFileHelper::LoadFileToString(Text, *(FPaths::ProjectContentDir() / TEXT("Data/strings_cso.json"))) && CsoTextTable.parse(std::string(TCHAR_TO_UTF8(*Text)), Err))
		{
			bCsoText = true;
			LoadLog.Add(FString::Printf(TEXT("strings_cso.json : %d textes"), (int32)CsoTextTable.size()));
		}
		else LoadLog.Add(FString::Printf(TEXT("strings_cso.json : illisible (%s)"), UTF8_TO_TCHAR(Err.c_str())));
	}
	if (LoadJson(TEXT("world_architecture.json"), J))
	{
		const TSharedPtr<FJsonObject> W = J->GetObjectField(TEXT("world"));
		WorldSize = W->GetNumberField(TEXT("size"));
		const TArray<TSharedPtr<FJsonValue>>& Spawn = W->GetArrayField(TEXT("spawn"));
		WorldSpawn = FVector(Spawn[0]->AsNumber(), Spawn[1]->AsNumber(), Spawn[2]->AsNumber());
		for (const TSharedPtr<FJsonValue>& V : J->GetArrayField(TEXT("regions")))
		{
			const TSharedPtr<FJsonObject> O = V->AsObject(); FStridesWorldRegion R;
			R.Id = O->GetStringField(TEXT("id")); R.Name = O->GetStringField(TEXT("name")); R.Kind = O->GetStringField(TEXT("kind"));
			R.Center = FVector2D(O->GetNumberField(TEXT("x")), O->GetNumberField(TEXT("z")));
			R.Size = FVector2D(O->GetNumberField(TEXT("w")), O->GetNumberField(TEXT("d"))); WorldRegions.Add(R);
		}
		for (const TSharedPtr<FJsonValue>& V : J->GetArrayField(TEXT("poi")))
		{
			const TSharedPtr<FJsonObject> O = V->AsObject(); FStridesPoi P;
			P.Id = O->GetStringField(TEXT("id")); P.Name = O->GetStringField(TEXT("name")); P.Icon = O->GetStringField(TEXT("icon"));
			P.Position = FVector2D(O->GetNumberField(TEXT("x")), O->GetNumberField(TEXT("z"))); PointsOfInterest.Add(P);
		}
		for (const TSharedPtr<FJsonValue>& V : J->GetArrayField(TEXT("roads")))
		{
			const TSharedPtr<FJsonObject> O = V->AsObject(); FStridesRoad R;
			R.Id = O->GetStringField(TEXT("id")); R.Width = O->GetNumberField(TEXT("width"));
			for (const TSharedPtr<FJsonValue>& PV : O->GetArrayField(TEXT("points"))) { const TArray<TSharedPtr<FJsonValue>>& A = PV->AsArray(); R.Points.Add(FVector2D(A[0]->AsNumber(), A[1]->AsNumber())); }
			Roads.Add(R);
		}
		for (const TSharedPtr<FJsonValue>& V : J->GetArrayField(TEXT("missions")))
		{
			const TSharedPtr<FJsonObject> O = V->AsObject(); FStridesMissionDefinition M;
			M.Id = O->GetStringField(TEXT("id")); M.Title = O->GetStringField(TEXT("title")); M.Category = O->GetStringField(TEXT("category")); M.Place = O->GetStringField(TEXT("place"));
			M.Pay = O->GetIntegerField(TEXT("pay")); M.Xp = O->GetIntegerField(TEXT("xp"));
			for (const TSharedPtr<FJsonValue>& R : O->GetArrayField(TEXT("requires"))) M.Requires.Add(R->AsString()); Missions.Add(M);
		}
		for (const TSharedPtr<FJsonValue>& V : J->GetArrayField(TEXT("progression")))
		{
			const TSharedPtr<FJsonObject> O = V->AsObject(); FStridesProgressionLevel L;
			L.Id = O->GetStringField(TEXT("id")); L.Name = O->GetStringField(TEXT("name")); L.Reputation = O->GetIntegerField(TEXT("reputation")); Progression.Add(L);
		}
		for (const TSharedPtr<FJsonValue>& V : J->GetArrayField(TEXT("phoneApps"))) PhoneApps.Add(V->AsString());
	}
	LoadScene();
	// Obstacles, lignes et poteau du parcours du Pôle construits par le jeu web (tranche T5).
	{
		const FString Dir = FPaths::ProjectContentDir() / TEXT("World/Cso");
		FString Err;
		if (CsoSceneryData.Load(Dir / TEXT("cso_fences.json"), Dir / TEXT("cso_assets.json"), Err))
			LoadLog.Add(FString::Printf(TEXT("World/Cso/cso_fences.json : %d obstacles, %d lignes, %d maillages"), CsoSceneryData.Fences.Num(), CsoSceneryData.Lines.Num(), CsoSceneryData.MeshCount));
		else
			LoadLog.Add(FString::Printf(TEXT("World/Cso : géométrie du parcours absente (%s)"), *Err));
	}
}

void UStridesDataSubsystem::LoadScene()
{
	TSharedPtr<FJsonObject> J;
	if (!LoadJson(TEXT("World/world_scene.json"), J)) return;
	const TSharedPtr<FJsonObject> T = J->GetObjectField(TEXT("terrain"));
	const int32 N = T->GetIntegerField(TEXT("n"));
	const TArray<TSharedPtr<FJsonValue>>& O = T->GetArrayField(TEXT("origin"));
	TerrainOrigin = FVector2D(O[0]->AsNumber(), O[1]->AsNumber());
	TerrainStep = T->GetNumberField(TEXT("step"));
	TArray<uint8> Bytes;
	const FString Bin = FPaths::ProjectContentDir() / TEXT("Data/World") / T->GetStringField(TEXT("file"));
	if (!FFileHelper::LoadFileToArray(Bytes, *Bin) || Bytes.Num() != N * N * (int32)sizeof(float))
	{
		LoadLog.Add(FString::Printf(TEXT("%s : relief illisible (%d octets, %d attendus)"), *Bin, Bytes.Num(), N * N * (int32)sizeof(float)));
		return;
	}
	TerrainHeights.SetNumUninitialized(N * N);
	FMemory::Memcpy(TerrainHeights.GetData(), Bytes.GetData(), Bytes.Num());  // float32 petit-boutiste (iOS et Mac aussi)
	TerrainN = N;
	for (const TSharedPtr<FJsonValue>& V : J->GetArrayField(TEXT("roads")))
	{
		const TSharedPtr<FJsonObject> R = V->AsObject(); FStridesRoad Road;
		Road.Id = R->GetStringField(TEXT("id")); Road.Width = R->GetNumberField(TEXT("w"));
		for (const TSharedPtr<FJsonValue>& PV : R->GetArrayField(TEXT("pts"))) { const TArray<TSharedPtr<FJsonValue>>& A = PV->AsArray(); Road.Points.Add(FVector2D(A[0]->AsNumber(), A[1]->AsNumber())); }
		SceneRoads.Add(Road);
	}
	if (const TSharedPtr<FJsonObject>* P; J->TryGetObjectField(TEXT("pond"), P))
	{
		Pond = FVector((*P)->GetNumberField(TEXT("x")), (*P)->GetNumberField(TEXT("z")), (*P)->GetNumberField(TEXT("r")));
		PondLevel = (*P)->GetNumberField(TEXT("level"));
	}
	LoadLog.Add(FString::Printf(TEXT("relief %d x %d (pas %.1f m), %d routes"), N, N, TerrainStep, SceneRoads.Num()));
}

double UStridesDataSubsystem::TerrainHeight(double X, double Z) const
{
	if (!HasTerrain()) return 0.0;
	const double Fx = FMath::Clamp((X - TerrainOrigin.X) / TerrainStep, 0.0, TerrainN - 1.0001);
	const double Fz = FMath::Clamp((Z - TerrainOrigin.Y) / TerrainStep, 0.0, TerrainN - 1.0001);
	const int32 I = (int32)Fx, K = (int32)Fz;
	const double U = Fx - I, V = Fz - K;
	const float* H = TerrainHeights.GetData() + K * TerrainN + I;
	// Même découpage en triangles que le maillage du sol (diagonale de (i+1, k) à (i, k+1)).
	if (U + V <= 1.0) return H[0] + (H[1] - H[0]) * U + (H[TerrainN] - H[0]) * V;
	return H[TerrainN + 1] + (H[TerrainN] - H[TerrainN + 1]) * (1.0 - U) + (H[1] - H[TerrainN + 1]) * (1.0 - V);
}

const FStridesHorseProfile* UStridesDataSubsystem::FindHorse(const FString& Id) const
{
	return Horses.FindByPredicate([&Id](const FStridesHorseProfile& H) { return H.Id == Id; });
}

bool UStridesDataSubsystem::PoleRunConfig(const std::vector<std::string>& Labels, strides::CsoRunConfig& Out) const
{
	std::string Err;
	return !PoleCourseJson.empty() && strides::csoRunConfigFromFile(PoleCourseJson, Labels, Out, Err);
}

float UStridesDataSubsystem::CourseSpeed(const FString& Level) const
{
	const float* S = CourseSpeeds.Find(Level);
	return S ? *S : 350.f;
}
