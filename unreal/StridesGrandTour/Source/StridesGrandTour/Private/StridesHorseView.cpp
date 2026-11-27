// Étape S4 : vue du cheval WildMesh du web appliquée au cheval Unreal. Voir StridesHorseView.h.
#include "StridesHorseView.h"
#include "StridesCore/LimbContact.h"

#include "Animation/AnimSequence.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "HAL/PlatformTime.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "StridesCore/HorseMirror.h"
#include "StridesCore/MiniJson.h"
#include "StridesHorse.h"
#include "StridesUnits.h"

using namespace strides::hview;

namespace
{
// Repère du web (m) ↔ Unreal (cm), monde : X = x, Y = z, Z = y (StridesUnits).
V3 ToWeb(const FVector& P)
{
	V3 R;
	StridesUnits::UEToWeb(P, R.x, R.y, R.z);
	return R;
}
FVector DirToUE(const V3& D) { return FVector(D.x, D.z, D.y); }
V3 DirToWeb(const FVector& D) { return V3{D.X, D.Z, D.Y}; }
}  // namespace

bool FStridesHorseView::Init(USkeletalMeshComponent* InMesh, const FString& ClipRoot, const FStridesHorseMirrorSet* InMirrors, FString* Err)
{
	bReady = false;
	Mesh = InMesh;
	Mirrors = InMirrors;
	if (!Mesh || !Mesh->GetSkeletalMeshAsset())
	{
		if (Err) *Err = TEXT("maillage absent");
		return false;
	}
	const FString Path = FPaths::ProjectContentDir() / TEXT("Data/pjl_horse_view.json");
	FString Text;
	if (!FFileHelper::LoadFileToString(Text, *Path))
	{
		if (Err) *Err = TEXT("Content/Data/pjl_horse_view.json illisible (scripts/unreal/export-rider-rules.mjs --vue)");
		return false;
	}
	try
	{
		const std::string S = TCHAR_TO_UTF8(*Text);
		D = viewDataFromJson(JParser(S).parse());
	}
	catch (const std::exception& Ex)
	{
		if (Err) *Err = UTF8_TO_TCHAR(Ex.what());
		return false;
	}
	// Clips du mélangeur dans l'ordre des actions du web ; durée = celle du clip joué par Unreal.
	Clips.Reset();
	DurGap = 0;
	DurReport.Reset();
	std::map<std::string, double> Durations;
	TArray<FString> Missing;
	for (const std::string& N : D.clipOrder)
	{
		FClip C;
		C.Name = UTF8_TO_TCHAR(N.c_str());
		double Len = 0;
		if (C.Name.EndsWith(TEXT("_M")))
		{
			C.Mirror = Mirrors ? Mirrors->Find(C.Name) : INDEX_NONE;
			if (C.Mirror != INDEX_NONE) Len = Mirrors->Clip(C.Mirror).duration;
		}
		else
		{
			C.Seq = LoadObject<UAnimSequence>(nullptr, *(ClipRoot + C.Name + TEXT(".Horse_") + C.Name));
			if (C.Seq) Len = C.Seq->GetPlayLength();
		}
		if (!(Len > 0))
		{
			Missing.Add(C.Name);
			continue;
		}
		const auto W = D.clips.find(N);
		if (W != D.clips.end())
		{
			const double Gap = FMath::Abs(Len - W->second);
			if (Gap > 1e-6) DurReport += FString::Printf(TEXT("%s %.4f s (web %.4f s) ; "), *C.Name, Len, W->second);
			DurGap = FMath::Max(DurGap, Gap);
		}
		Durations[N] = Len;
		Clips.Add(C);
	}
	if (Missing.Num()) DurReport += FString::Printf(TEXT("absents : %s"), *FString::Join(Missing, TEXT(", ")));
	D.clips = Durations;
	// Os par nom de base (pjl/names.js).
	const FReferenceSkeleton& Ref = Mesh->GetSkeletalMeshAsset()->GetRefSkeleton();
	static const char* HoofN[4] = {"fingers_02_l", "fingers_02_r", "toes_02_l", "toes_02_r"};
	static const char* LimbN[4] = {"upperleg_l", "upperleg_r", "hand_l", "hand_r"};
	for (int32 K = 0; K < 4; K++) HoofB[K] = LimbB[K] = INDEX_NONE;
	for (int32 B = 0; B < Ref.GetNum(); B++)
	{
		const std::string Base = strides::mirror::baseName(TCHAR_TO_UTF8(*Ref.GetBoneName(B).ToString()));
		for (int32 K = 0; K < 4; K++)
		{
			if (Base == HoofN[K]) HoofB[K] = B;
			if (Base == LimbN[K]) LimbB[K] = B;
		}
	}
	for (int32 K = 0; K < 4; K++)
		if (HoofB[K] == INDEX_NONE)
		{
			if (Err) *Err = FString::Printf(TEXT("os %hs absent"), HoofN[K]);
			return false;
		}
	// Jalon J2 : os des capsules des membres (pjlHorse.js LIMBS).
	bContactBones = true;
	for (int32 K = 0; K < 4; K++)
		for (int32 I = 0; I < 3; I++)
		{
			ContactB[K][I] = INDEX_NONE;
			for (int32 B = 0; B < Ref.GetNum(); B++)
				if (strides::mirror::baseName(TCHAR_TO_UTF8(*Ref.GetBoneName(B).ToString())) == strides::limb::limbBones()[K][I]) ContactB[K][I] = B;
			if (ContactB[K][I] == INDEX_NONE)
			{
				bContactBones = false;
				UE_LOG(LogTemp, Warning, TEXT("Strides contacts des membres : os %hs absent, contacts non jugés"), strides::limb::limbBones()[K][I]);
			}
		}
	MeshScale = Mesh->GetRelativeScale3D().X;
	Reset();
	bReady = true;
	return true;
}

void FStridesHorseView::Reset()
{
	LocoS = strides::hview::Loco();
	SnapSt = SnapState();
	SnapS = strides::hview::Snap();
	viewInit(D, ViewS);
	PushS = strides::hview::PushState();
	ClearS = ClearState();
	TuckS = TuckState();
	Prev.clear();
	bTuckOn = false;
	AnimPhaseV = 0;
}

void FStridesHorseView::StepPre(const FInputs& In, TArray<FStridesHorseLayer>& Layers)
{
	const double T0 = FPlatformTime::Seconds();
	DtLast = In.Dt;
	LocoIn Li;
	Li.dt = In.Dt;
	Li.speed = In.AnimSpeed >= 0 ? In.AnimSpeed : In.Speed / FMath::Max(0.6, In.SpeedMul);
	Li.vel = In.Speed;
	Li.jump = In.JumpT;
	Li.turn = In.LastTurn;
	Li.rear = In.RearAnim;
	Li.lead = In.ForcedLead;
	locoStep(D.c, LocoS, Li);
	SnapIn Si;
	Si.dt = In.Dt;
	Si.speed = In.Speed;
	Si.gait = LocoS.gait;
	Si.lead = LocoS.lead;
	Si.jumpT = In.JumpT;
	Si.jumpDur = In.JumpDur;
	Si.brake = In.Brake;
	Si.rearT = In.RearT;
	Si.lastTurn = In.LastTurn;
	AnimPhaseV = LocoS.phase;
	SnapS = snapshotStep(D, SnapSt, Si, AnimPhaseV);
	LocoS.phase = AnimPhaseV;
	viewStep(D, ViewS, SnapS, In.Dt);
	LastJumpT = In.JumpT;
	Layers.Reset();
	for (const FClip& C : Clips)
	{
		const std::string N = TCHAR_TO_UTF8(*C.Name);
		if (!actionEnabled(ViewS, N)) continue;
		FStridesHorseLayer L;
		L.Seq = C.Seq;
		L.Mirror = C.Mirror;
		L.Time = ViewS.times.at(N);
		L.Weight = ViewS.weights.at(N);
		Layers.Add(L);
	}
	CostMs = (FPlatformTime::Seconds() - T0) * 1000.0;
}

FTransform FStridesHorseView::BodyInActor(double Y, double Z, double Rx, double Rz)
{
	// Rotation du corps du web : R = Rx(rx) · Rz(rz) (Euler XYZ de three.js), repère du holder (x à gauche, y en haut, z
	// en avant) ; conjuguée par la symétrie X = z, Y = −x, Z = y du repère de l'acteur.
	const double cx = FMath::Cos(Rx), sx = FMath::Sin(Rx), cz = FMath::Cos(Rz), sz = FMath::Sin(Rz);
	auto R = [&](const V3& v) {
		const V3 a{cz * v.x - sz * v.y, sz * v.x + cz * v.y, v.z};  // Rz
		return V3{a.x, cx * a.y - sx * a.z, sx * a.y + cx * a.z};   // Rx
	};
	auto ToActor = [](const V3& v) { return FVector(v.z, -v.x, v.y); };
	const FVector X = ToActor(R({0, 0, 1})), Yv = ToActor(R({-1, 0, 0})), Zv = ToActor(R({0, 1, 0}));
	const FMatrix M(X, Yv, Zv, FVector::ZeroVector);
	return FTransform(M.ToQuat(), FVector(100.0 * Z, 0, 100.0 * Y));
}

FTransform FStridesHorseView::MeshRelative(double InScale) const
{
	const FTransform Body = BodyInActor(ViewS.bodyY, ViewS.bodyZ, ViewS.rotX, ViewS.rotZ);
	return FTransform(Body.GetRotation(), Body.GetLocation(), FVector(InScale));
}

V3 FStridesHorseView::BoneWeb(const TArray<FTransform>& CS, int32 B, const FTransform& ActorXf, double InScale) const
{
	if (!CS.IsValidIndex(B)) return V3();
	const FTransform Rel = MeshRelative(InScale);
	return ToWeb(ActorXf.TransformPosition(Rel.TransformPosition(CS[B].GetLocation())));
}

void FStridesHorseView::LimbPoseWeb(const TArray<FTransform>& CS, const FTransform& ActorXf, V3 Out[4][3]) const
{
	for (int32 K = 0; K < 4; K++)
		for (int32 I = 0; I < 3; I++) Out[K][I] = bContactBones ? BoneWeb(CS, ContactB[K][I], ActorXf, MeshScale) : V3();
}

bool FStridesHorseView::StepPost(const TArray<FTransform>& CS, const FTransform& ActorXf, const FObstacle& Ob, const TFunctionRef<double(double, double)>& Ground,
	TArray<FStridesHorseTuck>& Tucks)
{
	const double T0 = FPlatformTime::Seconds();
	Tucks.Reset();
	bTuckedLast = false;
	auto Pos = [&](int32 B) { return BoneWeb(CS, B, ActorXf, MeshScale); };
	// pjlHorse.js _pushContact.
	{
		PushIn Pi;
		Pi.jumpT = LastJumpT;
		Pi.hasClip = !ViewS.jumpClip.empty();
		Pi.jumpTime = ViewS.jumpTime;
		Pi.toeOff = Pi.hasClip ? D.jumps.at(ViewS.jumpClip).toeOff : 0;
		Pi.nearBar = Ob.bNear;
		auto Low = [&](int32 A, int32 B) {
			double M = INFINITY;
			for (const int32 K : {A, B})
			{
				const V3 P = Pos(HoofB[K]);
				M = FMath::Min(M, P.y - Ground(P.x, P.z));
			}
			return M;
		};
		Pi.hind = Low(2, 3);
		Pi.fore = Low(0, 1);
		if (Ob.bNear && LastJumpT >= 0)
		{
			const Obst& O = Ob.O;
			const double Sg = O.sign > 0 ? 1 : O.sign < 0 ? -1 : 1;
			double Dm = -INFINITY;
			for (const int32 K : {0, 1})
			{
				const V3 P = Pos(HoofB[K]);
				const double Sh = (P.x - O.x) * O.nx + (P.z - O.z) * O.nz;
				for (const ObBar& Bar : O.bars) Dm = FMath::Max(Dm, FMath::Min(0.0, (Sh - Bar.s) * Sg));
			}
			Pi.hasD = Dm > -INFINITY;
			Pi.d = Pi.hasD ? Dm : 0;
		}
		const double Off = pushStep(D.c, PushS, Pi, ViewS.contactOff);
		setContact(ViewS, Off);
	}
	// pjlHorse.js _barClear (avec _limbTuck et _barNeed).
	barClearReset(ClearS, ViewS);
	const bool bJumping = LastJumpT >= 0;
	Need Hind, Fore;
	V3 PH, PF;
	bool bH = false, bF = false;
	// Axes latéral (x du holder, à gauche) et avant (z) du cheval, monde du web.
	const V3 Ax = DirToWeb(ActorXf.TransformVectorNoScale(FVector(0, -1, 0)));
	const V3 Fw = DirToWeb(ActorXf.TransformVectorNoScale(FVector(1, 0, 0)));
	double Applied[4] = {0, 0, 0, 0};
	// Repère du composant au moment du repli (corps sans bascule) : axe du repli exprimé dans l'espace du composant.
	const FTransform CompAtTuck = MeshRelative(MeshScale) * ActorXf;
	if (Ob.bNear)
	{
		if (!bTuckOn) TuckS = TuckState();
		bTuckOn = true;
		TuckIn Ti;
		for (int32 K = 0; K < 4; K++)
		{
			Ti.toe[K] = Pos(HoofB[K]);
			Ti.hasUp[K] = LimbB[K] != INDEX_NONE;
			if (Ti.hasUp[K]) Ti.up[K] = Pos(LimbB[K]);
		}
		Ti.ax = Ax;
		Ti.fw = Fw;
		Ti.jumping = bJumping;
		Ti.time = Ob.Time;
		Ti.dt = DtLast;
		tuckStep(D.c, TuckS, Ob.O, Ti, Prev, Applied);
		for (int32 K = 0; K < 4; K++) TuckedToe[K] = Ti.toe[K];
		const V3* Toes = &Ti.toe[2];
		const V3* Fings = &Ti.toe[0];
		auto ToHolder = [&](const V3& P) {
			const FVector L = ActorXf.InverseTransformPositionNoScale(StridesUnits::WebToUE(P.x, P.y, P.z));
			return V3{-L.Y / 100.0, L.Z / 100.0, L.X / 100.0};
		};
		Hind = barNeed(D.c, Ob.O, {Hoof{"toes_02_l", Toes[0]}, Hoof{"toes_02_r", Toes[1]}}, Fings[0], Fings[1], "", Ob.Time, DtLast, Prev);
		bH = true;
		PH = ToHolder(Hind.pivot);
		if (bJumping)
		{
			Fore = barNeed(D.c, Ob.O, {Hoof{"fingers_02_l", Fings[0]}, Hoof{"fingers_02_r", Fings[1]}}, Toes[0], Toes[1], "", Ob.Time, DtLast, Prev);
			bF = true;
			PF = ToHolder(Fore.pivot);
		}
	}
	else
	{
		bTuckOn = false;
		TuckS = TuckState();
	}
	barClearStep(D.c, ClearS, bJumping, bH ? &Hind : nullptr, bH ? &PH : nullptr, bF ? &Fore : nullptr, bF ? &PF : nullptr, ViewS, DtLast);
	// Replis : rotation physique d'angle a autour de l'axe latéral du web ; le passage web → Unreal (X = x, Y = z, Z = y)
	// est une symétrie : même axe image, angle opposé.
	for (int32 K = 0; K < 4; K++)
	{
		if (Applied[K] == 0 || LimbB[K] == INDEX_NONE) continue;
		FStridesHorseTuck Tk;
		Tk.Bone = LimbB[K];
		Tk.AxisCS = CompAtTuck.InverseTransformVectorNoScale(DirToUE(Ax)).GetSafeNormal();
		Tk.Angle = -Applied[K];
		Tucks.Add(Tk);
	}
	bTuckedLast = Tucks.Num() > 0;
	CompAtTuckLast = CompAtTuck;
	CostMs += (FPlatformTime::Seconds() - T0) * 1000.0;
	return Tucks.Num() > 0;
}

namespace StridesHorseViewReplay
{
FTransform ActorOfHolder(const J& H)
{
	const double qx = H[3].num(), qy = H[4].num(), qz = H[5].num(), qw = H[6].num();
	auto Rot = [&](double x, double y, double z) {
		const double tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
		return FVector(x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx);
	};
	auto Map = [](const FVector& W) { return FVector(W.X, W.Z, W.Y); };
	const FMatrix M(Map(Rot(0, 0, 1)), Map(Rot(-1, 0, 0)), Map(Rot(0, 1, 0)), FVector::ZeroVector);
	return FTransform(M.ToQuat(), StridesUnits::WebToUE(H[0].num(), H[1].num(), H[2].num()));
}

void HooksFromRecord(const J& R, const J& H, FStridesHorseViewTestHooks& Hooks)
{
	auto Num = [](const J& j) { return j.isNull() ? 0.0 : j.num(); };
	const J& Sn = R["sn"]["in"];
	const J& St = R["loco"]["st"];
	Hooks.In = FStridesHorseView::FInputs();
	Hooks.In.Dt = R["dt"].num();
	Hooks.In.Speed = Sn["speed"].num();
	Hooks.In.AnimSpeed = St["speed"].num();
	Hooks.In.JumpT = Sn["jumpT"].num();
	Hooks.In.JumpDur = Num(Sn["jumpDur"]);
	Hooks.In.Brake = Num(Sn["brake"]);
	Hooks.In.RearT = Num(Sn["rearT"]);
	Hooks.In.RearAnim = St["rear"].num();
	Hooks.In.LastTurn = Num(Sn["lastTurn"]);
	Hooks.In.ForcedLead = St["lead"].isNull() ? 0 : (int32)St["lead"].num();
	Hooks.Ob = FStridesHorseView::FObstacle();
	if (R["bar"]["near"].b)
	{
		const J& lj = R["bar"]["lj"];
		Obst& o = Hooks.Ob.O;
		o.id = 1;
		const J& a = lj["o"];
		o.x = a[0].num(), o.z = a[1].num(), o.nx = a[2].num(), o.nz = a[3].num(), o.tx = a[4].num(), o.tz = a[5].num(), o.w = a[6].num(), o.ground = a[7].num();
		for (const J& b : lj["bars"].a) o.bars.push_back({b[0].num(), b[1].num(), b[2].num() != 0, b[3].num() != 0});
		o.sign = Num(lj["sign"]);
		for (const J& r : lj["rails"].a) o.rails.push_back(r.num());
		for (const J& m : lj["margins"].a) o.margins.push_back(m.num());
		Hooks.Ob.bNear = true;
		Hooks.Ob.Time = lj["t"].num();
	}
	Hooks.Ground = H[7].num();
	Hooks.bActorXf = true;
	Hooks.ActorXf = ActorOfHolder(H);
}
}  // namespace StridesHorseViewReplay

UStridesHorseViewPost::UStridesHorseViewPost()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickGroup = TG_PostUpdateWork;
}

void UStridesHorseViewPost::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	if (AStridesHorse* H = Cast<AStridesHorse>(GetOwner())) H->PostPoseView();
}
