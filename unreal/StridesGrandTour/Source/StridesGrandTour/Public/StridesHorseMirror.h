// Étape M2 de l'essai de monte (voie A) : clips miroir (main gauche) du cheval Unreal, cuits par la logique du web
// (StridesCore/HorseMirror : port de src/entities/pjl/asset.js bakeMirror) à partir des clips importés du cheval.
//
// Pourquoi une cuisson au chargement plutôt que des AnimSequence « _M » écrites par l'éditeur : le web joue ses clips
// cuits tels quels (clés à 24 images/s, Float32Array) ; une AnimSequence écrite par l'éditeur serait recompressée par
// Unreal (erreur de compression d'animation) et versionnerait ~25 Mo de binaires ; la cuisson au chargement est le code
// même que le ctest « monte-miroir » prouve contre le web (au bit près sur les entrées du web), pour ~ms de calcul.
//
// Entrées : le squelette de référence du maillage (espace du composant, racines sans parent), les clips importés
// échantillonnés par Unreal (GetBonePose) aux instants de la cuisson du web, racines root_04, _rootJoint et
// rootmountpoint_01_0289 laissées à la pose de référence comme le web (pjl/asset.js retire leurs pistes). Durée du clip :
// celle du GLB du web, flottant 32 bits comme les temps des clés glTF (GetPlayLength rend un float).
// Lecture : FStridesHorseMirrorSet::SampleLocal (interpolation des clés comme three.js), racines au choix : pose de
// référence (comparaison au web) ou pose du clip source au même instant (jeu : rotation de la racine cuite par
// Interchange, comme les clips d'origine joués par le jeu).
//
// Jeu : seulement avec l'option -StridesHorseLead=web (UStridesHorseAnimInstance, voir AStridesHorse::UpdateAnimation) ;
// sans l'option, le jeu par défaut joue les clips d'origine comme avant.
// Preuve : Strides.Parite.HorseMirror (StridesHorseMirrorTests.cpp).
#pragma once
#include "CoreMinimal.h"
#include "Animation/AnimInstance.h"
#include "Animation/AnimInstanceProxy.h"
#include "StridesCore/HorseMirror.h"
#include <vector>
#include "StridesHorseMirror.generated.h"

class UAnimSequence;
class USkeletalMesh;

namespace StridesHorseAnim
{
// Pose locale d'un clip à un instant (squelette de référence du maillage) ; bWebRoots : racines du web à la pose de référence.
STRIDESGRANDTOUR_API bool SampleLocal(const UAnimSequence* Seq, const USkeletalMesh* SkM, double T, bool bWebRoots, TArray<FTransform>& L, bool bRaw = false);
STRIDESGRANDTOUR_API void LocalToComponent(const FReferenceSkeleton& Ref, const TArray<FTransform>& L, TArray<FTransform>& CS);
// three.js PropertyMixer (première action copiée, puis mélange au poids relatif ; positions et échelles lerp, rotations
// slerpFlat), os par os en repère local.
STRIDESGRANDTOUR_API void Mix(TArray<FTransform>& Acc, const TArray<FTransform>& In, double T);
STRIDESGRANDTOUR_API bool IsWebRoot(const FName& Bone);
}

class STRIDESGRANDTOUR_API FStridesHorseMirrorSet
{
public:
	// Cuit les 11 clips miroir (strides::mirror::mirroredSources) depuis les clips Horse_<nom> de ClipRoot.
	// bRaw : données brutes de l'import (éditeur seulement) au lieu des données compressées que le jeu joue. Avant
	// d'échantillonner, la compression de chaque clip est attendue (WaitOnExistingCompression) : sinon l'éditeur peut lire
	// les données brutes d'un clip pendant que sa compression se termine (constaté : cuissons différentes d'un lancement
	// à l'autre).
	bool Build(const USkeletalMesh* SkM, const FString& ClipRoot, FString* Err = nullptr, bool bRaw = false);
	bool UsesRawData() const { return bRawData; }
	bool IsBuilt() const { return Clips.Num() > 0; }
	int32 Find(const FString& MirrorName) const;
	const strides::mirror::Clip& Clip(int32 I) const { return Clips[I]; }
	const UAnimSequence* Source(int32 I) const { return Sources[I]; }
	const FString& Name(int32 I) const { return Names[I]; }
	int32 Num() const { return Clips.Num(); }
	// Pose locale du clip miroir I au temps de clip T. bWebRoots : racines à la pose de référence (comparaison au web) ;
	// sinon pose du clip source au même instant (jeu).
	bool SampleLocal(int32 I, double T, bool bWebRoots, TArray<FTransform>& L) const;
	const strides::mirror::Rig& Rig() const { return MRig; }
	const strides::mirror::Plane& Plane() const { return MPlane; }
	const std::vector<int>& Pairs() const { return MPairs; }
	double BuildMs() const { return BuildTimeMs; }
	const USkeletalMesh* Mesh() const { return SkMesh; }
	// Instants de la cuisson et temps de clip demandés à Unreal (diagnostic du test moteur).
	static double WebDuration(const UAnimSequence* Seq);

private:
	const USkeletalMesh* SkMesh = nullptr;
	strides::mirror::Rig MRig;
	strides::mirror::Plane MPlane;
	std::vector<int> MPairs;
	TArray<strides::mirror::Clip> Clips;
	TArray<const UAnimSequence*> Sources;
	TArray<FString> Names;
	double BuildTimeMs = 0;
	bool bRawData = false;
};

// Une couche du mélangeur du cheval : clip importé (Seq) ou clip miroir (Mirror), temps de clip, poids.
struct FStridesHorseLayer
{
	const UAnimSequence* Seq = nullptr;
	int32 Mirror = INDEX_NONE;
	double Time = 0;
	double Weight = 0;
};

struct FStridesHorseAnimProxy : public FAnimInstanceProxy
{
	FStridesHorseAnimProxy() = default;
	FStridesHorseAnimProxy(UAnimInstance* Instance) : FAnimInstanceProxy(Instance) {}
	virtual void PreUpdate(UAnimInstance* InAnimInstance, float DeltaSeconds) override;
	virtual bool Evaluate(FPoseContext& Output) override;
	TArray<FStridesHorseLayer> Layers;
	TSharedPtr<const FStridesHorseMirrorSet> Set;
};

// Mélangeur du cheval avec l'option -StridesHorseLead=web : couches posées par AStridesHorse à chaque image, mêlées comme
// le PropertyMixer de three.js (pjl/view.js : clips d'origine au poids leadBlend, clips miroir au poids 1 − leadBlend).
UCLASS(Transient, NotBlueprintable)
class STRIDESGRANDTOUR_API UStridesHorseAnimInstance : public UAnimInstance
{
	GENERATED_BODY()
public:
	TArray<FStridesHorseLayer> Layers;
	TSharedPtr<const FStridesHorseMirrorSet> Set;
	// Phase du clip de la première couche (temps / durée), −1 sans couche (UStridesHorseTack::PlayedClipPhase).
	double Phase() const;

protected:
	virtual FAnimInstanceProxy* CreateAnimInstanceProxy() override { return new FStridesHorseAnimProxy(this); }
};
