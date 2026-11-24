// Essai de monte, voie A, reliquats M1 : Strides.Monte.EnJeu, la cavalière montée par les règles DANS UN MONDE QUI TIQUE.
//  Monde de test commencé comme le jeu (InitializeActorsForPlay puis BeginPlay distribué) ; cheval et cavalière créés par
//  SpawnActor, donc BeginPlay passé, et la ligne de commande lue par BeginPlay comme en jeu.
//  1. Jeu par défaut : sans -StridesRider=regles, BeginPlay ne crée ni la sellerie du cheval ni la règle de la cavalière ;
//     avec l'option, BeginPlay les crée (contrôle positif : le test départage les deux cas).
//  2. Ordre des ticks au galop (240 images de 1/60 s, World->Tick et GFrameCounter avancé comme par la boucle du moteur) :
//     en fin d'image (FWorldDelegates::OnWorldPostActorTick, après tous les groupes), l'acteur de la cavalière est sur le
//     siège S de l'image (position et orientation) ; groupe réel de la cavalière ≥ celui de la sellerie. Un observateur qui
//     tique en TG_PrePhysics juste après le cheval (comme AStridesShots) voit, lui, la cavalière de l'image précédente : c'est
//     l'écart de 9 cm relevé à l'étape 6, mesuré ici pour montrer que le test voit un retard quand il y en a un.
//  3. Suiveurs (vêtements, yeux, sourcils, cils, queue de cheval) : en selle avec la règle, meneur = maillage posé et bornes
//     prises au meneur ; les bornes des parties de la tête contiennent l'os de la tête. Pied à terre : meneur et bornes du
//     jeu par défaut rétablis.
#include "Misc/AutomationTest.h"
#include "Components/PoseableMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/World.h"
#include "GameFramework/WorldSettings.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "StridesHorse.h"
#include "StridesHorseTack.h"
#include "StridesRider.h"
#include "StridesRiderRig.h"

namespace StridesMonteInGameTest
{
struct FTestWorld
{
	UGameInstance* GI = nullptr;
	UWorld* World = nullptr;
	FTestWorld(const TCHAR* Name)
	{
		GI = NewObject<UGameInstance>(GEngine);
		GI->AddToRoot();
		GI->InitializeStandalone(Name);
		World = GI->GetWorld();
	}
	// Comme le jeu : acteurs initialisés pour le jeu, puis BeginPlay distribué (pas de mode de jeu dans ce monde de test).
	bool Begin()
	{
		World->InitializeActorsForPlay(FURL());
		World->GetWorldSettings()->NotifyBeginPlay();
		return World->GetBegunPlay();
	}
	~FTestWorld()
	{
		if (World && World->GetBegunPlay()) World->EndPlay(EEndPlayReason::Quit);
		GI->Shutdown();
		if (World)
		{
			GEngine->DestroyWorldContext(World);
			World->DestroyWorld(false);
		}
		GI->RemoveFromRoot();
	}
};
// Ligne de commande du jeu le temps d'un bloc (BeginPlay lit -StridesRider=), rétablie à la sortie.
struct FCommandLineScope
{
	FString Saved;
	explicit FCommandLineScope(const FString& Extra) : Saved(FCommandLine::Get()) { FCommandLine::Set(*(Saved + TEXT(" ") + Extra)); }
	~FCommandLineScope() { FCommandLine::Set(*Saved); }
};
// Observateur dans l'image : une fonction de tick du monde, appelée à son groupe et après ses prérequis.
struct FObserverTick : public FTickFunction
{
	TFunction<void()> Fn;
	virtual void ExecuteTick(float, ELevelTick, ENamedThreads::Type, const FGraphEventRef&) override { if (Fn) Fn(); }
	virtual FString DiagnosticMessage() override { return TEXT("Strides.Monte.EnJeu observateur"); }
};
bool HeadPart(const FString& N) { return N.StartsWith(TEXT("Hair")) || N.StartsWith(TEXT("Eye")); }
}  // namespace StridesMonteInGameTest

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FStridesMonteInGameTest, "Strides.Monte.EnJeu", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FStridesMonteInGameTest::RunTest(const FString&)
{
	using namespace StridesMonteInGameTest;
	FString Opt;
	if (!TestFalse(TEXT("ligne de commande du test sans -StridesRider= (sinon le cas « jeu par défaut » ne serait pas testé)"), FParse::Value(FCommandLine::Get(), TEXT("StridesRider="), Opt))) return false;
	FTestWorld W(TEXT("StridesMonteInGameTest"));
	if (!TestNotNull(TEXT("monde de test"), W.World)) return false;
	if (!TestTrue(TEXT("monde commencé (BeginPlay distribué)"), W.Begin())) return false;

	// ---- 1. Jeu par défaut contre option, par BeginPlay.
	AStridesHorse* DefHorse = W.World->SpawnActor<AStridesHorse>(FVector(100000, 0, 0), FRotator::ZeroRotator);
	AStridesRider* DefRider = W.World->SpawnActor<AStridesRider>(FVector(100000, -150, 90), FRotator::ZeroRotator);
	if (!TestNotNull(TEXT("cheval (défaut)"), DefHorse) || !TestNotNull(TEXT("cavalière (défaut)"), DefRider)) return false;
	TestTrue(TEXT("défaut : BeginPlay passé (cheval et cavalière)"), DefHorse->HasActorBegunPlay() && DefRider->HasActorBegunPlay());
	TestNull(TEXT("défaut : sellerie du cheval non créée par BeginPlay"), DefHorse->HorseTack());
	TestNull(TEXT("défaut : règle de la cavalière non créée par BeginPlay"), DefRider->RulesRig());
	TestNull(TEXT("défaut : maillage posé non créé par BeginPlay"), DefRider->RulesMesh());
	AStridesHorse* Horse = nullptr;
	AStridesRider* Rider = nullptr;
	{
		FCommandLineScope Cl(TEXT("-StridesRider=regles"));
		Horse = W.World->SpawnActor<AStridesHorse>(FVector::ZeroVector, FRotator::ZeroRotator);
		Rider = W.World->SpawnActor<AStridesRider>(FVector(0, -150, 90), FRotator::ZeroRotator);
	}
	TestFalse(TEXT("ligne de commande rétablie après le bloc"), FParse::Value(FCommandLine::Get(), TEXT("StridesRider="), Opt));
	if (!TestNotNull(TEXT("cheval (option)"), Horse) || !TestNotNull(TEXT("cavalière (option)"), Rider)) return false;
	UStridesHorseTack* Tack = Horse->HorseTack();
	if (!TestNotNull(TEXT("option : sellerie créée par BeginPlay"), Tack) || !TestTrue(TEXT("option : sellerie prête"), Tack->IsReady())) return false;
	if (!TestNotNull(TEXT("option : règle créée par BeginPlay"), Rider->RulesRig()) || !TestTrue(TEXT("option : règle prête"), Rider->RulesRig()->IsReady())) return false;
	UPoseableMeshComponent* RB = Rider->RulesMesh();
	if (!TestNotNull(TEXT("option : maillage posé"), RB)) return false;
	TestFalse(TEXT("option, à pied : maillage posé caché"), RB->IsVisible());
	for (USkeletalMeshComponent* P : DefRider->Parts())
		TestTrue(FString::Printf(TEXT("défaut : %s suit le maillage du jeu, bornes propres"), *P->GetName()), P->LeaderPoseComponent.Get() == DefRider->GetMesh() && !P->bUseBoundsFromLeaderPoseComponent);

	// ---- 2. Au galop : ordre des ticks, relevé en fin d'image et dans l'image.
	// Sans rendu, le moteur ne rafraîchit pas les os d'un maillage non vu : on l'exige ici pour que le siège bouge avec la
	// foulée, comme en jeu rendu.
	Horse->BodyMesh()->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::AlwaysTickPoseAndRefreshBones;
	if (!TestTrue(TEXT("montée (TryMount)"), Rider->TryMount(nullptr))) return false;
	TestTrue(TEXT("en selle : maillage posé visible, maillage du jeu caché"), RB->IsVisible() && !Rider->GetMesh()->IsVisible());
	Horse->PlaceAt(0, 0, 0, 7.0);
	Horse->SetMoveInput(FVector2D(0, 1));
	const float Dt = 1.f / 60.f;
	const int32 Settle = 90;  // montée (0,8 s) passée
	int32 Frames = 0, EndSamples = 0, MidSamples = 0;
	double EndGap = 0, EndAng = 0, MidGap = 0, MaxStep = 0;
	FVector LastHorse = Horse->GetActorLocation();
	const FDelegateHandle Hd = FWorldDelegates::OnWorldPostActorTick.AddLambda([&](UWorld* Wd, ELevelTick, float) {
		if (Wd != W.World || Frames < Settle) return;
		const FTransform S = Tack->SeatWorld();
		EndGap = FMath::Max(EndGap, (Rider->GetActorLocation() - S.GetLocation()).Size());
		EndAng = FMath::Max(EndAng, FMath::RadiansToDegrees(Rider->GetActorQuat().AngularDistance(S.GetRotation())));
		EndSamples++;
	});
	FObserverTick Obs;
	Obs.bCanEverTick = true;
	Obs.TickGroup = TG_PrePhysics;
	Obs.EndTickGroup = TG_PrePhysics;
	Obs.Fn = [&]() {
		if (Frames < Settle) return;
		MidGap = FMath::Max(MidGap, (Rider->GetActorLocation() - Tack->SeatWorld().GetLocation()).Size());
		MidSamples++;
	};
	Obs.RegisterTickFunction(W.World->PersistentLevel);
	Obs.AddPrerequisite(Horse, Horse->PrimaryActorTick);
	for (int32 F = 0; F < 240; F++)
	{
		GFrameCounter++;  // une image du moteur : sans cela, chaque fonction de tick se croit déjà passée à cette image
		W.World->Tick(LEVELTICK_All, Dt);
		Frames++;
		const FVector Hp = Horse->GetActorLocation();
		if (F >= Settle) MaxStep = FMath::Max(MaxStep, (Hp - LastHorse).Size());
		LastHorse = Hp;
	}
	Obs.UnRegisterTickFunction();
	FWorldDelegates::OnWorldPostActorTick.Remove(Hd);
	const int32 GRider = (int32)Rider->PrimaryActorTick.GetActualTickGroup(), GTack = (int32)Tack->PrimaryComponentTick.GetActualTickGroup();
	const int32 GHorse = (int32)Horse->PrimaryActorTick.GetActualTickGroup();
	const float GallopSpeed = Horse->SpeedMS;
	TestTrue(FString::Printf(TEXT("galop réel : vitesse %.2f m/s, pas du cheval max %.2f cm par image"), GallopSpeed, MaxStep), GallopSpeed >= 6.f && MaxStep >= 10.0);
	TestTrue(FString::Printf(TEXT("groupes réels : cheval %d, sellerie %d, cavalière %d (cavalière après la sellerie)"), GHorse, GTack, GRider), GRider >= GTack && GTack >= GHorse);
	TestTrue(FString::Printf(TEXT("fin d'image : cavalière sur le siège de l'image (%d images, écart max %.6f cm, %.6f°)"), EndSamples, EndGap, EndAng),
		EndSamples == 240 - Settle && EndGap <= 1e-3 && EndAng <= 1e-3);
	TestTrue(FString::Printf(TEXT("dans l'image (observateur en TG_PrePhysics après le cheval) : écart max %.2f cm, environ un pas du cheval (%.2f cm) : le relevé de l'étape 6"), MidGap, MaxStep),
		MidSamples == 240 - Settle && MidGap >= 0.5 * MaxStep);

	// ---- 3. Suiveurs du maillage posé.
	const FVector HeadW = RB->GetBoneLocation(TEXT("head"), EBoneSpaces::WorldSpace);
	int32 HeadParts = 0;
	for (USkeletalMeshComponent* P : Rider->Parts())
	{
		const FString N = P->GetSkeletalMeshAsset() ? P->GetSkeletalMeshAsset()->GetName() : P->GetName();
		const FBox B = P->Bounds.GetBox();
		TestTrue(FString::Printf(TEXT("en selle : %s visible, suit le maillage posé, bornes du meneur"), *N), P->IsVisible() && P->LeaderPoseComponent.Get() == RB && P->bUseBoundsFromLeaderPoseComponent);
		if (!HeadPart(N)) continue;
		HeadParts++;
		TestTrue(FString::Printf(TEXT("en selle : bornes de %s autour de la tête (distance %.1f cm)"), *N, FMath::Sqrt(B.ComputeSquaredDistanceToPoint(HeadW))), B.IsInside(HeadW));
	}
	TestEqual(TEXT("parties de la tête (queue de cheval, yeux, sourcils, cils)"), HeadParts, 4);
	Horse->Halt();
	Rider->Dismount(nullptr);
	TestTrue(TEXT("pied à terre : maillage du jeu visible, maillage posé caché"), Rider->GetMesh()->IsVisible() && !RB->IsVisible());
	for (USkeletalMeshComponent* P : Rider->Parts())
		TestTrue(FString::Printf(TEXT("pied à terre : %s suit de nouveau le maillage du jeu, bornes propres"), *P->GetName()), P->LeaderPoseComponent.Get() == Rider->GetMesh() && !P->bUseBoundsFromLeaderPoseComponent);
	AddInfo(FString::Printf(TEXT("galop %.2f m/s, pas max %.2f cm ; groupes cheval %d, sellerie %d, cavalière %d ; fin d'image : écart max %.6f cm, %.6f° ; dans l'image : %.2f cm"),
		GallopSpeed, MaxStep, GHorse, GTack, GRider, EndGap, EndAng, MidGap));
	return true;
}
