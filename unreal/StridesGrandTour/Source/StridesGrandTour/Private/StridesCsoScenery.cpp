#include "StridesCsoScenery.h"
#include "Dom/JsonObject.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"
#include "Misc/FileHelper.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "StridesUnits.h"

namespace
{
TSharedPtr<FJsonObject> ReadJson(const FString& File, FString& Err)
{
	FString Text;
	TSharedPtr<FJsonObject> J;
	if (!FFileHelper::LoadFileToString(Text, *File)) { Err = FString::Printf(TEXT("%s introuvable"), *File); return nullptr; }
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), J) || !J.IsValid()) { Err = FString::Printf(TEXT("%s illisible"), *File); return nullptr; }
	return J;
}

FVector Vec(const TSharedPtr<FJsonObject>& O, const TCHAR* K)
{
	const TArray<TSharedPtr<FJsonValue>>* A = nullptr;
	if (!O->TryGetArrayField(K, A) || A->Num() != 3) return FVector::ZeroVector;
	return FVector((*A)[0]->AsNumber(), (*A)[1]->AsNumber(), (*A)[2]->AsNumber());
}

void Pieces(const TSharedPtr<FJsonObject>& O, TArray<FStridesCsoPiece>& Out, TMap<FString, int32>& Counts)
{
	for (const TSharedPtr<FJsonValue>& V : O->GetArrayField(TEXT("pieces")))
	{
		const TSharedPtr<FJsonObject> Q = V->AsObject();
		FStridesCsoPiece P;
		P.Cat = Q->GetStringField(TEXT("cat"));
		P.Mesh = Q->GetStringField(TEXT("mesh"));
		P.P = Vec(Q, TEXT("p"));
		P.W = Vec(Q, TEXT("w"));
		P.WC = Vec(Q, TEXT("wc"));
		Q->TryGetNumberField(TEXT("yaw"), P.Yaw);
		Q->TryGetNumberField(TEXT("rail"), P.Rail);
		Q->TryGetStringField(TEXT("tex"), P.Tex);
		Q->TryGetStringField(TEXT("texEn"), P.TexEn);
		Out.Add(P);
	}
	for (const auto& C : O->GetObjectField(TEXT("counts"))->Values) Counts.Add(FString(C.Key), (int32)C.Value->AsNumber());
}

void Group(const TSharedPtr<FJsonObject>& O, FStridesCsoGroup& G)
{
	O->TryGetStringField(TEXT("id"), G.Id);
	O->TryGetStringField(TEXT("activity"), G.Id);
	G.X = O->GetNumberField(TEXT("x"));
	G.Z = O->GetNumberField(TEXT("z"));
	G.Rot = O->GetNumberField(TEXT("rot"));
	G.Ground = O->GetNumberField(TEXT("ground"));
	O->TryGetNumberField(TEXT("w"), G.W);
	Pieces(O, G.Pieces, G.Counts);
}

FLinearColor Hex(const FString& S)
{
	// Couleur CSS sRGB du jeu web (#rrggbb) → couleur linéaire (Three.js Color.set convertit de même).
	return FLinearColor::FromSRGBColor(FColor::FromHex(S));
}
}  // namespace

bool FStridesCsoScenery::Load(const FString& ManifestFile, const FString& AssetsFile, FString& Err)
{
	bLoaded = false;
	const TSharedPtr<FJsonObject> J = ReadJson(ManifestFile, Err);
	if (!J) return false;
	const TSharedPtr<FJsonObject> A = ReadJson(AssetsFile, Err);
	if (!A) return false;
	if (J->GetStringField(TEXT("schema")) != TEXT("strides.cso_fences/1")) { Err = TEXT("schéma de cso_fences.json inattendu"); return false; }
	States.Reset();
	Fences.Reset();
	Lines.Reset();
	MeshPaths.Reset();
	MeshCentroids.Reset();
	SignMaterials.Reset();
	for (const TSharedPtr<FJsonValue>& V : J->GetArrayField(TEXT("states")))
	{
		const TSharedPtr<FJsonObject> O = V->AsObject();
		FStridesCsoState S;
		S.Id = O->GetStringField(TEXT("id"));
		S.Base = O->GetNumberField(TEXT("base"));
		for (const TSharedPtr<FJsonValue>& H : O->GetArrayField(TEXT("heights"))) S.Heights.Add(H->AsNumber());
		States.Add(S);
	}
	for (const TSharedPtr<FJsonValue>& V : J->GetArrayField(TEXT("fences")))
	{
		const TSharedPtr<FJsonObject> O = V->AsObject();
		FStridesCsoFenceData F;
		F.Num = (int32)O->GetNumberField(TEXT("num"));
		F.Label = O->GetStringField(TEXT("label"));
		F.Kind = O->GetStringField(TEXT("kind"));
		F.Spread = O->GetNumberField(TEXT("spread"));
		F.X = O->GetNumberField(TEXT("x"));
		F.Z = O->GetNumberField(TEXT("z"));
		F.Rot = O->GetNumberField(TEXT("rot"));
		F.Ground = O->GetNumberField(TEXT("ground"));
		F.W = O->GetNumberField(TEXT("w"));
		for (const auto& S : O->GetObjectField(TEXT("states"))->Values)
		{
			const TSharedPtr<FJsonObject> L = S.Value->AsObject();
			FStridesCsoLook Look;
			Look.State = FString(S.Key);
			Look.H = L->GetNumberField(TEXT("h"));
			Pieces(L, Look.Pieces, Look.Counts);
			F.Looks.Add(Look);
		}
		Fences.Add(F);
	}
	// Jalon J2c (lot J2-D) : vertical et oxer du paddock d'échauffement (course « warmup », une seule pose « paddock »).
	Warmup.Reset();
	const TArray<TSharedPtr<FJsonValue>>* Wa = nullptr;
	if (J->TryGetArrayField(TEXT("warmup"), Wa))
		for (const TSharedPtr<FJsonValue>& V : *Wa)
		{
			const TSharedPtr<FJsonObject> O = V->AsObject();
			FStridesCsoFenceData F;
			F.Num = 0;
			F.Label = O->GetStringField(TEXT("label"));
			F.Kind = O->GetStringField(TEXT("kind"));
			F.Spread = O->GetNumberField(TEXT("spread"));
			F.X = O->GetNumberField(TEXT("x"));
			F.Z = O->GetNumberField(TEXT("z"));
			F.Rot = O->GetNumberField(TEXT("rot"));
			F.Ground = O->GetNumberField(TEXT("ground"));
			F.W = O->GetNumberField(TEXT("w"));
			FStridesCsoLook Look;
			Look.State = TEXT("paddock");
			Look.H = O->GetNumberField(TEXT("h"));
			Pieces(O, Look.Pieces, Look.Counts);
			F.Looks.Add(Look);
			Warmup.Add(F);
		}
	for (const TSharedPtr<FJsonValue>& V : J->GetArrayField(TEXT("lines")))
	{
		FStridesCsoGroup G;
		Group(V->AsObject(), G);
		Lines.Add(G);
	}
	Group(J->GetObjectField(TEXT("marker")), Marker);
	const TSharedPtr<FJsonObject> Hl = J->GetObjectField(TEXT("highlight"));
	HighlightOn = Hex(Hl->GetStringField(TEXT("on")));
	HighlightOff = Hex(Hl->GetStringField(TEXT("off")));
	MeshCount = J->GetObjectField(TEXT("meshes"))->Values.Num();
	for (const auto& M : J->GetObjectField(TEXT("meshes"))->Values) MeshCentroids.Add(FString(M.Key), Vec(M.Value->AsObject(), TEXT("c")));
	for (const auto& M : A->GetObjectField(TEXT("meshes"))->Values) MeshPaths.Add(FString(M.Key), M.Value->AsString());
	for (const auto& M : A->GetObjectField(TEXT("signs"))->Values) SignMaterials.Add(FString(M.Key), M.Value->AsString());
	for (const auto& M : J->GetObjectField(TEXT("meshes"))->Values)
		if (!MeshPaths.Contains(FString(M.Key))) { Err = FString::Printf(TEXT("maillage %s absent de cso_assets.json (relancer import-cso-fences.py)"), *FString(M.Key)); return false; }
	bLoaded = true;
	return true;
}

const FStridesCsoState* FStridesCsoScenery::State(const FString& Id) const
{
	return States.FindByPredicate([&Id](const FStridesCsoState& S) { return S.Id == Id; });
}

const FStridesCsoFenceData* FStridesCsoScenery::Fence(int32 Num) const
{
	return Fences.FindByPredicate([Num](const FStridesCsoFenceData& F) { return F.Num == Num; });
}

const FStridesCsoLook* FStridesCsoFenceData::LookAt(double H) const
{
	// Hauteurs arrondies au centimètre (csoHeights) : même valeur au millionième près.
	return Looks.FindByPredicate([H](const FStridesCsoLook& L) { return FMath::Abs(L.H - H) < 1e-6; });
}

UStaticMesh* FStridesCsoScenery::LoadMesh(const FString& Id) const
{
	const FString* Path = MeshPaths.Find(Id);
	return Path ? LoadObject<UStaticMesh>(nullptr, **Path) : nullptr;
}

UMaterialInterface* FStridesCsoScenery::SignMaterial(const FStridesCsoPiece& P, const FString& Lang) const
{
	const FString& Tex = Lang == TEXT("en") && !P.TexEn.IsEmpty() ? P.TexEn : P.Tex;
	const FString* Path = SignMaterials.Find(Tex);
	return Path ? LoadObject<UMaterialInterface>(nullptr, **Path) : nullptr;
}

FTransform FStridesCsoScenery::PieceRelative(const FStridesCsoPiece& P)
{
	// Repère de l'acteur (lacet 90° − rot) : X = z web local (axe de saut), Y = −x web local, Z = y web (StridesFence.h).
	// Maillage importé : X = x web, Y = z web, Z = y web ; un lacet de −90° l'amène dans le repère de l'acteur, puis la
	// rotation locale du jeu web (autour de y, de sens opposé au lacet Unreal).
	return FTransform(FRotator(0, -90.0 - FMath::RadiansToDegrees(P.Yaw), 0),
		FVector(P.P.Z, -P.P.X, P.P.Y) * StridesUnits::CmPerM);
}

FVector FStridesCsoScenery::PieceWorldWeb(double X, double Y, double Z, double Rot, const FStridesCsoPiece& P)
{
	// Three.js rotation.y = Rot : (lx, lz) → (lx cos + lz sin, −lx sin + lz cos).
	const double C = FMath::Cos(Rot), S = FMath::Sin(Rot);
	return FVector(X + P.P.X * C + P.P.Z * S, Y + P.P.Y, Z - P.P.X * S + P.P.Z * C);
}
