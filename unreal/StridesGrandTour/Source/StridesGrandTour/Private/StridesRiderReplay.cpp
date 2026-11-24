// Essai de monte, voie A, étape M3 (niveau B) : voir StridesRiderReplay.h.
#include "StridesRiderReplay.h"
#include "Animation/AnimSequence.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "HAL/PlatformTime.h"
#include "StridesHorse.h"
#include "StridesHorseMirror.h"
#include "StridesHorseTack.h"
#include "StridesRiderRig.h"
#include "StridesUnits.h"

using namespace strides::rider;

namespace
{
const TCHAR* const ClipRoot = TEXT("/Game/Characters/Horse/horse_pjl_normalized/horse_pjl_normalized/SkeletalMeshes/Horse_");
}

bool FStridesRiderOnHorseReplay::Setup(AStridesHorse* InHorse, UStridesHorseTack* InTack, UStridesRiderRig* InRig, FString* Err)
{
	Horse = InHorse;
	Tack = InTack;
	Rig = InRig;
	auto Fail = [Err](const TCHAR* Why) {
		if (Err) *Err = Why;
		return false;
	};
	if (!Horse || !Horse->BodyMesh()) return Fail(TEXT("cheval absent"));
	if (!Horse->UsesWebLead() || !Horse->MirrorSet() || !Cast<UStridesHorseAnimInstance>(Horse->BodyMesh()->GetAnimInstance()))
		return Fail(TEXT("option -StridesHorseLead=web absente : mélangeur à couches et clips miroir exigés"));
	if (!Tack || !Tack->IsReady()) return Fail(TEXT("sellerie non initialisée"));
	if (!Rig || !Rig->IsReady() || !Rig->Driver()) return Fail(TEXT("règle de la cavalière non initialisée"));
	return true;
}

const UAnimSequence* FStridesRiderOnHorseReplay::Clip(const FString& Name)
{
	if (const UAnimSequence* const* C = Clips.Find(Name)) return *C;
	const UAnimSequence* C = LoadObject<UAnimSequence>(nullptr, *(FString(ClipRoot) + Name + TEXT(".Horse_") + Name));
	Clips.Add(Name, C);
	return C;
}

bool FStridesRiderOnHorseReplay::PoseHorse(const J& Mx, FString* Err)
{
	USkeletalMeshComponent* Mesh = Horse->BodyMesh();
	UStridesHorseAnimInstance* Anim = Cast<UStridesHorseAnimInstance>(Mesh->GetAnimInstance());
	if (!Anim) return false;
	TArray<FStridesHorseLayer> Layers;
	LastClips = LastMirrors = 0;
	for (const J& A : Mx["a"].a)
	{
		const FString N = UTF8_TO_TCHAR(A[0].s.c_str());
		FStridesHorseLayer L;
		L.Weight = A[1].num();
		L.Time = A[2].num();
		if (N.EndsWith(TEXT("_M")))
		{
			L.Mirror = Horse->MirrorSet()->Find(N);
			if (L.Mirror == INDEX_NONE)
			{
				if (Err) *Err = FString::Printf(TEXT("clip miroir %s absent d'Unreal"), *N);
				return false;
			}
			LastMirrors++;
		}
		else
		{
			L.Seq = Clip(N);
			if (!L.Seq)
			{
				if (Err) *Err = FString::Printf(TEXT("clip %s absent d'Unreal"), *N);
				return false;
			}
		}
		LastClips++;
		Layers.Add(L);
	}
	if (bWebPose)
	{
		// Contrôle : mélange du web (racines du web à la pose de référence), même calcul que le mélangeur du jeu.
		const USkeletalMesh* SkM = Mesh->GetSkeletalMeshAsset();
		const FReferenceSkeleton& Ref = SkM->GetRefSkeleton();
		TArray<FTransform> Acc, In;
		double W = 0;
		for (const FStridesHorseLayer& L : Layers)
		{
			const bool bOk = L.Mirror != INDEX_NONE ? Horse->MirrorSet()->SampleLocal(L.Mirror, L.Time, true, In) : StridesHorseAnim::SampleLocal(L.Seq, SkM, L.Time, true, In);
			if (!bOk) return false;
			if (W == 0) Acc = In, W = L.Weight;
			else
			{
				W += L.Weight;
				StridesHorseAnim::Mix(Acc, In, L.Weight / W);
			}
		}
		if (W > 0 && W < 1) StridesHorseAnim::Mix(Acc, Ref.GetRefBonePose(), 1 - W);
		StridesHorseAnim::LocalToComponent(Ref, Acc, WebCS);
		// Couches posées sans évaluation du maillage : la sellerie y lit le clip d'allure joué (phase de foulée).
		Anim->Layers = MoveTemp(Layers);
		return W > 0;
	}
	Anim->Layers = MoveTemp(Layers);
	Mesh->TickAnimation(0.f, false);
	Mesh->RefreshBoneTransforms();
	return true;
}

namespace
{
// Corps de la vue (pjl/view.js : body.position.y, body.rotation.z) ∘ groupe intérieur : scène du GLB → repère du cheval.
strides::tack::Affine WebBody(const strides::tack::TackModel& M, double By, double Rz)
{
	const double C = FMath::Cos(Rz), S = FMath::Sin(Rz);
	strides::tack::Affine B;
	const double V[12] = {C, -S, 0, 0, S, C, 0, By, 0, 0, 1, 0};
	for (int I = 0; I < 12; I++) B.m[I] = V[I];
	return strides::tack::compose(B, strides::tack::innerAffine(M));
}
}

bool FStridesRiderOnHorseReplay::Begin(const J& InRun, FString* Err)
{
	Run = &InRun;
	DtRun = InRun["setup"]["dt"].num();
	FitScale = InRun["setup"]["scale"].num() / Rig->Driver()->rules().rig().scale;
	Tack->ResetState();
	Rig->ResetRide();
	// Image de mise en place (non exportée) : clip idle seul au premier pas (idleTime = dt), comme Strides.Parite.HorseSeat.
	J Idle;
	Idle.t = J::Obj;
	J A;
	A.t = J::Arr;
	J Nm, W, T;
	Nm.t = J::Str, Nm.s = "idle";
	W.t = J::Num, W.n = 1;
	T.t = J::Num, T.n = DtRun;
	A.a = {Nm, W, T};
	J List;
	List.t = J::Arr;
	List.a = {A};
	Idle.o["a"] = List;
	if (!PoseHorse(Idle, Err)) return false;
	const strides::tack::Affine ToHolder0 = bWebPose ? strides::tack::compose(WebBody(Tack->Model(), 0, 0), strides::tack::invert(Tack->GlbToMesh())) : Tack->GameMeshToHolder();
	Tack->StepPose(bWebPose ? WebCS : Horse->BodyMesh()->GetComponentSpaceTransforms(), ToHolder0, DtRun, 0, false, [](const strides::tack::V3& P) { return P.y; });
	// Phase avant la première image exportée : celle de l'image 0 du web (état repris, comme le ctest « monte-cheval »).
	Tack->RiderPhaseState().animPhase = InRun["frames"][0]["hz"]["ph"].num();
	return true;
}

bool FStridesRiderOnHorseReplay::Step(int32 I, FString* Err)
{
	const J& F = (*Run)["frames"][I];
	const J& Hz = F["hz"];
	const double T0 = FPlatformTime::Seconds();
	if (!PoseHorse(F["mx"], Err)) return false;
	const bool bJump = Hz["jT"].num() >= 0;
	// Hauteur au-dessus du sol du web : l'origine du repère du cheval est à hz.p.y, le sol à hz.gy (trajectoire enregistrée).
	const double Lift = Hz["p"][1].num() - Hz["gy"].num();
	const double Rz = bWebPose ? F["mx"]["rz"].num() : 0, By = bWebPose ? F["mx"]["by"].num() : 0;
	const strides::tack::Affine ToHolder = bWebPose ? strides::tack::compose(WebBody(Tack->Model(), By, Rz), strides::tack::invert(Tack->GlbToMesh())) : Tack->GameMeshToHolder();
	Tack->StepPose(bWebPose ? WebCS : Horse->BodyMesh()->GetComponentSpaceTransforms(), ToHolder, DtRun, Rz, bJump,
		[Lift](const strides::tack::V3& P) { return P.y + Lift; });
	Tack->StepPhase(UTF8_TO_TCHAR(Hz["gait"].s.c_str()), Hz["v"].num(), Hz["lead"].num() > 0 ? TEXT('L') : TEXT('R'), bJump);
	LastH = UStridesRiderRig::SampleFromTack(*Tack, Hz["v"].num(), Hz["jT"].num(), 0);
	if (bWebPhase) LastH.phase = Hz["ph"].num();
	if (bWebPose)
	{
		// Contrôle : le cheval du web suit la pente du terrain (hz.H, monde) ; human.js lit hauteur et axe z de l'os d'attache
		// dans le monde. Le cheval du jeu Unreal ne s'incline pas sur la pente : pas de cette rotation en jeu.
		const J& Hh = Hz["H"];
		const strides::tack::Q4 Qh{Hh[3].num(), Hh[4].num(), Hh[5].num(), Hh[6].num()};
		const strides::tack::TackOut& O = Tack->Out();
		const strides::tack::V3 Pw = strides::tack::rotate(Qh, O.seatPos);
		const strides::tack::V3 Zw = strides::tack::rotate(Qh, strides::tack::rotate(O.seatQ, strides::tack::V3{0, 0, 1}));
		LastH.attachY = Pw.y;
		LastH.attachZ = Vec3{Zw.x, Zw.y, Zw.z};
	}
	const RideFitMeters Fm = Rig->FitFromTack(*Tack);
	if (I == 0)
	{
		LastIn = rideInputsFromJson(F["in"], FitScale);
		Rig->Seed(LastIn, LastH, Fm);
	}
	else
	{
		LastIn = Rig->Prepare(LastH, Fm, F["in"]["dt"].num());
		LastIn.turn = F["in"]["turn"].num();  // h.lastTurn non exporté dans O1 (comme le niveau A)
		Rig->Apply(LastIn);
	}
	Rig->PoseMesh();
	CostMs = (FPlatformTime::Seconds() - T0) * 1000.0;
	return true;
}
