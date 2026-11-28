// Jalon J3-E : mesure du coût du monde vivant (-StridesShots=perf-monde), outil de mesure compilé hors Shipping.
#include "StridesShots.h"

#if !UE_BUILD_SHIPPING
#include "Dom/JsonObject.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "HAL/PlatformMemory.h"
#include "HAL/PlatformTime.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Policies/CondensedJsonPrintPolicy.h"
#include "RHI.h"
#include "RHIStats.h"
#include "RenderTimer.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "Stats/StatsData.h"
#include "StridesAmbientLife.h"
#include "StridesCore/PerfStats.h"
#include "StridesHorse.h"
#include "StridesRider.h"
#include "StridesUnits.h"
#include "UnrealClient.h"

// J5 : compteur « name » des groupes de statistiques actifs (dernière image reçue par le fil de jeu), -1 si absent.
static double StatCounter(const TCHAR* ShortName)
{
#if STATS
	const FGameThreadStatsData* D = FLatestGameThreadStatsData::Get().Latest;
	if (!D) return -1;
	const FName Want(ShortName);
	for (const FActiveStatGroupInfo& G : D->ActiveStatGroups)
		for (const FComplexStatMessage& M : G.CountersAggregate)
			if (M.NameAndInfo.GetShortName() == Want)
				return M.NameAndInfo.GetField<EStatDataType>() == EStatDataType::ST_double ? M.GetValue_double(EComplexStatField::IncAve) : (double)M.GetValue_int64(EComplexStatField::IncAve);
#endif
	return -1;
}

void AStridesShots::TickPerfMonde(float DeltaSeconds, APlayerController* PC)
{
	AStridesHorse* Horse = TActorIterator<AStridesHorse>(GetWorld()) ? *TActorIterator<AStridesHorse>(GetWorld()) : nullptr;
	AStridesRider* Rider = Cast<AStridesRider>(PC->GetPawn());
	AStridesAmbientLife* Life = TActorIterator<AStridesAmbientLife>(GetWorld()) ? *TActorIterator<AStridesAmbientLife>(GetWorld()) : nullptr;
	auto SetLife = [&](bool bOn)
	{
		if (!Life) return;
		Life->SetActorHiddenInGame(!bOn);
		Life->SetActorTickEnabled(bOn);
	};
	auto Begin = [&](const TCHAR* Name, bool bOn)
	{
		SetLife(bOn);
		FPerfMonde P;
		P.Name = Name;
		MondePhases.Add(P);
		PerfFrame = 0;
		UE_LOG(LogTemp, Display, TEXT("Strides perf-monde : phase %s"), Name);
	};
	PerfWait -= DeltaSeconds;
	if (PerfWait > 0) return;
	if (PerfStep == 0)
	{
		FParse::Value(FCommandLine::Get(), TEXT("StridesPerfWarm="), PerfWarm);
		FParse::Value(FCommandLine::Get(), TEXT("StridesPerfFrames="), PerfFrames);
		PerfStep = 1;
		PerfWait = 15.f;  // shaders et tuiles
		return;
	}
	if (PerfStep == 1)
	{
		// Résolution du téléphone (844 × 390 points d'un iPhone, ou -StridesPerfRes=LxH).
		int32 RW = 844, RH = 390;
		FString Res;
		if (FParse::Value(FCommandLine::Get(), TEXT("StridesPerfRes="), Res)) { FString A, B; if (Res.Split(TEXT("x"), &A, &B)) { RW = FCString::Atoi(*A); RH = FCString::Atoi(*B); } }
		const FIntPoint Size = GEngine && GEngine->GameViewport && GEngine->GameViewport->Viewport ? GEngine->GameViewport->Viewport->GetSizeXY() : FIntPoint::ZeroValue;
		if (Size != FIntPoint(RW, RH) && PerfResizeTries < 4)
		{
			PerfResizeTries++;
			FSystemResolution::RequestResolutionChange(RW, RH, EWindowMode::Windowed);
			PerfWait = 2.f;
			return;
		}
		PerfViewport = Size;
		if (!Horse || !Rider) { UE_LOG(LogTemp, Error, TEXT("Strides perf-monde : cheval ou cavalière absent")); FPlatformMisc::RequestExit(false); return; }
		// Rue principale de Deauville City (route « main », x = −30), regard vers le nord (la ville et la côte).
		Horse->PlaceAt(-27.0, -215.0, PI);
		Rider->SetActorLocation(Horse->GetActorLocation() - Horse->GetActorRightVector() * 150.0 + FVector(0, 0, 90));
		Rider->TryMount(PC);
		PerfStep = 2;
		PerfWait = 6.f;
		return;
	}
	if (PerfStep == 2)
	{
		// Compteurs d'appels de dessin et de primitives du RHI : remplis seulement avec « stat rhi » (retiré avant les captures).
		if (GEngine) GEngine->Exec(GetWorld(), TEXT("stat rhi"));
		// J5 : appels de dessin du moteur de rendu et triangles (le RHI Metal rend 0, voir FPerfMonde).
		if (GEngine) GEngine->Exec(GetWorld(), TEXT("stat scenerendering"));
		if (GEngine) GEngine->Exec(GetWorld(), TEXT("stat engine"));
		Begin(TEXT("ville-vide"), false);
		PerfStep = 3;
		return;
	}
	if (PerfStep == 3 || PerfStep == 5)
	{
		if (PerfFrame++ >= PerfWarm)
		{
			FPerfMonde& P = MondePhases.Last();
			P.Game.Add(FPlatformTime::ToMilliseconds(GGameThreadTime));
			P.Render.Add(FPlatformTime::ToMilliseconds(GRenderThreadTime));
			P.Gpu.Add(FPlatformTime::ToMilliseconds(RHIGetGPUFrameCycles(0)));
			P.Delta.Add(1000.0 * DeltaSeconds);
			P.Draws.Add(GNumDrawCallsRHI[0]);
			P.Prims.Add(GNumPrimitivesDrawnRHI[0]);
			const double Md = StatCounter(TEXT("STAT_MeshDrawCalls"));
			if (Md >= 0) P.MeshDraws.Add(Md);
			const double Ts = StatCounter(TEXT("STAT_StaticMeshTriangles")), Tk = StatCounter(TEXT("STAT_SkelMeshTriangles"));
			if (Ts >= 0) P.Tris.Add(Ts + FMath::Max(Tk, 0.0));
			if (PerfFrame % 30 == 0) P.Used.Add(FPlatformMemory::GetStats().UsedPhysical / (1024.0 * 1024.0));
			if (Life && PerfStep == 5)
			{
				int32 Cars = 0, People = 0;
				for (const strides::TrafficCar& C : Life->Life().cars) Cars += C.visible ? 1 : 0;
				for (const strides::Walker& W : Life->Life().walkers) People += FVector2D::Distance(FVector2D(W.x, W.z), FVector2D(-27, -215)) < 300 ? 1 : 0;
				P.Cars = FMath::Max(P.Cars, Cars);
				P.People = FMath::Max(P.People, People);
			}
		}
		if (PerfFrame >= PerfWarm + PerfFrames)
		{
			if (PerfStep == 3) { Begin(TEXT("ville-vivante"), true); PerfStep = 5; }
			else
			{
				if (GEngine) GEngine->Exec(GetWorld(), TEXT("stat rhi"));
				if (GEngine) GEngine->Exec(GetWorld(), TEXT("stat scenerendering"));
				if (GEngine) GEngine->Exec(GetWorld(), TEXT("stat engine"));
				PerfStep = 6;
				PerfWait = 1.f;
			}
		}
		return;
	}
	if (PerfStep == 6)
	{
		TSharedPtr<FJsonObject> Doc = MakeShared<FJsonObject>();
		Doc->SetStringField(TEXT("schema"), TEXT("strides.perf_monde/1"));
		Doc->SetStringField(TEXT("doc"), TEXT("ms par image (GGameThreadTime, GRenderThreadTime, RHIGetGPUFrameCycles, pas de l'image) ; draws = GNumDrawCallsRHI[0], prims = GNumPrimitivesDrawnRHI[0] (image précédente) ; usedMB = UsedPhysical toutes les 30 images ; cars : voitures visibles (à moins de 300 m de la caméra), people : passants à moins de 300 m ; médianes et 95e centiles"));
		Doc->SetStringField(TEXT("rhi"), GDynamicRHI ? GDynamicRHI->GetName() : TEXT("?"));
		// J5 : niveau de rendu (SM5 bureau ou ES3_1 mobile) et profil d'appareil actif (-DeviceProfile=…).
		{
			FString Fl;
			GetFeatureLevelName(GMaxRHIFeatureLevel, Fl);
			Doc->SetStringField(TEXT("featureLevel"), Fl);
			FString Dp;
			FParse::Value(FCommandLine::Get(), TEXT("DeviceProfile="), Dp);
			Doc->SetStringField(TEXT("deviceProfile"), Dp);
		}
		Doc->SetArrayField(TEXT("viewport"), {MakeShared<FJsonValueNumber>(PerfViewport.X), MakeShared<FJsonValueNumber>(PerfViewport.Y)});
		TArray<TSharedPtr<FJsonValue>> Phases;
		for (const FPerfMonde& P : MondePhases)
		{
			TSharedPtr<FJsonObject> O = MakeShared<FJsonObject>();
			O->SetStringField(TEXT("name"), P.Name);
			O->SetNumberField(TEXT("cars"), P.Cars);
			O->SetNumberField(TEXT("people"), P.People);
			auto Put = [&](const TCHAR* K, const TArray<double>& V) { O->SetObjectField(K, PerfSummaryJson(V)); };
			Put(TEXT("gameMs"), P.Game); Put(TEXT("renderMs"), P.Render); Put(TEXT("gpuMs"), P.Gpu); Put(TEXT("frameMs"), P.Delta);
			Put(TEXT("draws"), P.Draws); Put(TEXT("prims"), P.Prims); Put(TEXT("usedMB"), P.Used);
			Put(TEXT("meshDraws"), P.MeshDraws); Put(TEXT("tris"), P.Tris);
			Phases.Add(MakeShared<FJsonValueObject>(O));
			const strides::perf::Summary G = strides::perf::summarize(std::vector<double>(P.Game.GetData(), P.Game.GetData() + P.Game.Num()));
			const strides::perf::Summary D = strides::perf::summarize(std::vector<double>(P.Draws.GetData(), P.Draws.GetData() + P.Draws.Num()));
			const strides::perf::Summary Pr = strides::perf::summarize(std::vector<double>(P.Prims.GetData(), P.Prims.GetData() + P.Prims.Num()));
			const strides::perf::Summary Md = strides::perf::summarize(std::vector<double>(P.MeshDraws.GetData(), P.MeshDraws.GetData() + P.MeshDraws.Num()));
			const strides::perf::Summary Tr = strides::perf::summarize(std::vector<double>(P.Tris.GetData(), P.Tris.GetData() + P.Tris.Num()));
			const strides::perf::Summary Gp = strides::perf::summarize(std::vector<double>(P.Gpu.GetData(), P.Gpu.GetData() + P.Gpu.Num()));
			const strides::perf::Summary Fr = strides::perf::summarize(std::vector<double>(P.Delta.GetData(), P.Delta.GetData() + P.Delta.Num()));
			UE_LOG(LogTemp, Display, TEXT("Strides perf-monde : %s : jeu médiane %.2f ms, GPU %.2f ms, image %.2f ms, dessins RHI %.0f, primitives %.0f, dessins du rendu %.0f (%d images), triangles %.0f, %d voitures, %d passants"), *P.Name, G.median, Gp.median, Fr.median, D.median, Pr.median, Md.median, P.MeshDraws.Num(), Tr.median, P.Cars, P.People);
		}
		Doc->SetArrayField(TEXT("phases"), Phases);
		FString Out;
		FJsonSerializer::Serialize(Doc.ToSharedRef(), TJsonWriterFactory<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>::Create(&Out));
		FFileHelper::SaveStringToFile(Out + TEXT("\n"), *(OutDir / TEXT("perf-monde.json")), FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
		PerfStep = 7;
		PerfWait = 1.f;
		// J5 : -StridesPerfSansCapture (aperçu du rendu mobile, où une capture a déjà figé le jeu) : sortie sans capture.
		if (FParse::Param(FCommandLine::Get(), TEXT("StridesPerfSansCapture"))) { FPlatformMisc::RequestExit(false); return; }
		return;
	}
	// Captures de contrôle du rendu (vie ambiante visible) : un passant de la ville à 4 m devant le cheval ; puis le cheval
	// arrêté 30 m devant une voiture de la route principale, face à elle (la voiture doit s'arrêter avant lui, règle du web).
	if (PerfStep == 7 && Life && Horse)
	{
		const strides::Walker& W = Life->Life().walkers[19];  // promeneur des Planches (espace dégagé)
		const double H = W.heading;
		// 12 m derrière lui, 2,5 m sur le côté : la cavalière ne le masque pas.
		Horse->PlaceAt(W.x - FMath::Sin(H) * 12.0 + FMath::Cos(H) * 2.5, W.z - FMath::Cos(H) * 12.0 - FMath::Sin(H) * 2.5, H);
		PerfStep = 8;
		PerfWait = 0.5f;
		return;
	}
	if (PerfStep == 8)
	{
		FScreenshotRequest::RequestScreenshot(OutDir / TEXT("monde-passant.png"), false, false);
		PerfStep = 9;
		PerfWait = 1.f;
		return;
	}
	if (PerfStep == 9 && Life && Horse)
	{
		const strides::TrafficCar& C = Life->Life().cars[1];
		CarProbe = 1;
		Horse->PlaceAt(C.x + FMath::Sin(C.heading) * 30.0, C.z + FMath::Cos(C.heading) * 30.0, C.heading + PI);
		UE_LOG(LogTemp, Display, TEXT("Strides perf-monde : cheval posé 30 m devant la voiture 1 (%.1f ; %.1f, %.1f m/s)"), C.x, C.z, C.speed);
		PerfStep = 10;
		PerfWait = 8.f;
		return;
	}
	if (PerfStep == 10 && Life && Horse)
	{
		const strides::TrafficCar& C = Life->Life().cars[CarProbe];
		double X, Y, Z;
		StridesUnits::UEToWeb(Horse->GetActorLocation(), X, Y, Z);
		UE_LOG(LogTemp, Display, TEXT("Strides perf-monde : voiture 1 à %.1f m du cheval, %.2f m/s, klaxons %d"), FVector2D::Distance(FVector2D(X, Z), FVector2D(C.x, C.z)), C.speed, Life->Life().horns);
		FScreenshotRequest::RequestScreenshot(OutDir / TEXT("monde-voiture-arretee.png"), false, false);
		PerfStep = 11;
		PerfWait = 1.f;
		return;
	}
	FPlatformMisc::RequestExit(false);
}
#else
void AStridesShots::TickPerfMonde(float, APlayerController*) {}
#endif
