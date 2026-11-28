// Essai de monte, voie A, étape M3 (niveau B) : rejeu d'un scénario de l'oracle O1 sur le cheval Unreal, cavalière montée par
// la règle (-StridesRider=regles), tout ce que la règle lit venant du cheval Unreal. Code commun au test moteur
// Strides.Parite.RiderOnHorse et au mode de capture -StridesShots=monte-b (captures appariées, même image d'O1).
//
// À chaque image d'O1 :
//  1. cheval : le mélangeur du jeu (UStridesHorseAnimInstance, option -StridesHorseLead=web : clips importés et clips miroir
//     cuits au chargement, étape M2) reçoit les clips, poids et temps du mélangeur WildMesh du web (canal mx.a), et le
//     maillage du jeu est évalué (échelle du jeu, 3,7 % plus petit que le web ; ni inclinaison dans les virages, ni corps
//     abaissé ou remonté par la vue du web : mx.rz et mx.by ne sont PAS appliqués, comme en jeu) ;
//  2. sellerie Unreal (UStridesHorseTack::StepPose, même calcul qu'en jeu) : siège S, ancres, profils, postérieurs (hauteur
//     au-dessus du sol du web : origine du cheval à hz.p.y − hz.gy du sol, trajectoire enregistrée) ; phase de foulée de la
//     convention du web depuis le clip d'allure du maillage (StepPhase : allure hz.gait, main hz.lead, vitesse hz.v, saut) ;
//  3. cavalière : chaîne du jeu (UStridesRiderRig : SampleFromTack, FitFromTack, retard d'une image, règle, reciblage, deux
//     os par membre) ; première image par son canal in (comme le niveau A), virage par le canal in (h.lastTurn non exporté).
// Le cheval de l'image de mise en place (non exportée par O1) est le clip idle seul au premier pas, comme Strides.Parite.HorseSeat.
// Contrôle (SetWebPose(true), test seulement) : le même cheval Unreal posé COMME LE WEB (racines du web au repos, groupe
// intérieur de la vue : échelle 0,010388, lacet, sol ; corps de la vue : hauteur mx.by et inclinaison mx.rz), clips mêlés
// comme le mélangeur WildMesh (Strides.Parite.HorseSeat) : sert à vérifier que le rejeu redonne O2 quand le cheval est
// posé comme celui du web, et à séparer l'effet du cheval du jeu (taille, inclinaison, corps) de celui du rejeu.
#pragma once
#include "CoreMinimal.h"
#include "StridesCore/HorseTack.h"
#include "StridesCore/MiniJson.h"
#include "StridesCore/RiderPose.h"
#include "StridesHorseView.h"

class AStridesHorse;
class UStridesHorseTack;
class UStridesRiderRig;
class UAnimSequence;

class STRIDESGRANDTOUR_API FStridesRiderOnHorseReplay
{
public:
	// Horse : option -StridesHorseLead=web activée (EnableWebLead) ; Tack : sellerie initialisée sur son maillage ; Rig :
	// règle de la cavalière initialisée. Faux (raison dans Err) sinon.
	bool Setup(AStridesHorse* InHorse, UStridesHorseTack* InTack, UStridesRiderRig* InRig, FString* Err = nullptr);
	// Scénario O1 (fichier entier) ; états remis à neuf, image de mise en place jouée.
	bool Begin(const J& Run, FString* Err = nullptr);
	// Image I (0, 1, … dans l'ordre) : cheval posé, sellerie, phase, cavalière posée. Faux (raison dans Err) si un clip manque.
	bool Step(int32 I, FString* Err = nullptr);
	void SetWebPose(bool bOn) { bWebPose = bOn; }
	// Contrôle : phase de foulée du web (hz.ph) donnée à la règle au lieu de celle du cheval Unreal (attribution des écarts).
	void SetWebPhase(bool bOn) { bWebPhase = bOn; }
	int32 Num() const { return Run ? (int32)Run->operator[]("frames").a.size() : 0; }
	double Dt() const { return DtRun; }
	// Dernière image : entrées de la règle, état brut du cheval lu, nombre de clips du web joués, clips miroir parmi eux.
	const strides::rider::RideInputs& LastInputs() const { return LastIn; }
	const strides::rider::RideHorseSample& LastSample() const { return LastH; }
	int32 LastClipCount() const { return LastClips; }
	int32 LastMirrorCount() const { return LastMirrors; }
	double LastCostMs() const { return CostMs; }
	// Étape S1 : pose du maillage donnée à la sellerie à la dernière image (transformées de composant : celles du maillage
	// du jeu, ou la pose du web en contrôle) et passage espace du maillage → repère du cheval utilisé.
	const TArray<FTransform>& LastPose() const;
	const strides::tack::Affine& LastToHolder() const { return ToHolderLast; }
	// Étape S4 : avec la vue du cheval du web (AStridesHorse::UsesWebView), le cheval n'est plus posé par le canal mx.a d'O1
	// mais par sa vue (FStridesHorseView), nourrie des entrées du cheval du jeu web relevées dans l'oracle vue/ (même
	// scénario, mêmes images qu'O1 : repère S identique, contrôlé à l'export) : clips, poids, temps, corps (hauteur,
	// bascule, inclinaison), replis ; roulis et phase de foulée de la vue donnés à la sellerie. Vrai si le scénario est rejoué
	// ainsi.
	bool UsesView() const { return bView; }

private:
	const UAnimSequence* Clip(const FString& Name);
	bool PoseHorse(const J& Mx, FString* Err);
	bool PoseHorseView(const J& Rec, const J& H, FString* Err);
	J VueRun;
	bool bView = false;
	FStridesHorseViewTestHooks Hooks;
	AStridesHorse* Horse = nullptr;
	UStridesHorseTack* Tack = nullptr;
	UStridesRiderRig* Rig = nullptr;
	const J* Run = nullptr;
	double DtRun = 1.0 / 30.0;
	double FitScale = 1;
	TMap<FString, const UAnimSequence*> Clips;
	bool bWebPose = false, bWebPhase = false;
	TArray<FTransform> WebCS;
	strides::rider::RideInputs LastIn;
	strides::rider::RideHorseSample LastH;
	int32 LastClips = 0, LastMirrors = 0;
	double CostMs = 0;
	strides::tack::Affine ToHolderLast;
};
