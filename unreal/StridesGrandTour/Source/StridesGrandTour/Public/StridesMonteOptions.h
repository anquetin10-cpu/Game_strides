#pragma once

#include "CoreMinimal.h"

// Étape S2 de la voie A (décision de Julien du 24/11/2026) : la monte du web forme UN ensemble cohérent, lu à un seul
// endroit par le cheval et la cavalière (BeginPlay) et par les modes de capture.
//  - cavalière posée par les règles de monte du web (étape 6, UStridesRiderRig) ;
//  - main du web au galop et sauts en miroir (étape M2, mélangeur à couches, clips miroir ; seuil du grand saut de la vue
//    du web : jump_gallop au-delà de 8 m/s, au lieu de 7 m/s dans l'ancien comportement) ;
//  - sellerie complète du web affichée (étape S1, UStridesHorseTackMesh).
// Lecture de la ligne de commande (la plus précise l'emporte) :
//  - -StridesMonte=web | ancien : l'ensemble ; sans elle, StridesMonteOptions::bWebByDefault ;
//  - -StridesRider=regles | ancien : la cavalière seule ;
//  - -StridesHorseLead=web | droite : la main du cheval seule (« droite » : clips d'origine, toujours à main droite) ;
//  - -StridesTack=web | aucune : la sellerie seule ; sans elle, la sellerie suit l'ensemble ou la cavalière de la règle
//    (comportement de l'étape S1 : -StridesRider=regles l'affiche).
// Une valeur inconnue est ignorée (signalée par FromCommandLine).
namespace StridesMonteOptions
{
// Comportement du jeu sans aucune option. Faux : ancien comportement (cavalière aux clips cuits, clips d'origine, pas de
// sellerie affichée).
inline constexpr bool bWebByDefault = false;

struct FMonte
{
	bool bRiderRules = false;  // cavalière posée par les règles du web
	bool bWebLead = false;     // main du web et sauts en miroir
	bool bTackMesh = false;    // sellerie complète du web affichée
	bool operator==(const FMonte& O) const { return bRiderRules == O.bRiderRules && bWebLead == O.bWebLead && bTackMesh == O.bTackMesh; }
};

// Résolution sur une ligne de commande donnée (tests) ; Unknown reçoit les options aux valeurs non reconnues.
STRIDESGRANDTOUR_API FMonte Resolve(const TCHAR* CommandLine, TArray<FString>* Unknown = nullptr);
// Résolution sur la ligne de commande du processus (FCommandLine::Get()) ; valeurs inconnues signalées dans le journal.
STRIDESGRANDTOUR_API FMonte FromCommandLine();
// « web » si les trois sont actifs, « ancien » si aucun, sinon le détail (journaux, relevés des captures).
STRIDESGRANDTOUR_API FString Describe(const FMonte& M);
}  // namespace StridesMonteOptions
