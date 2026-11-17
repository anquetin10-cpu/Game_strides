// Première boucle jouable : construit la scène à partir des données (carrière du Pôle 120 × 76 m, parcours, lumière),
// place le cheval à l'entrée de piste et le cavalier à pied à côté. Aucune carte binaire n'est requise (carte Entry du
// moteur) ; les décors réels du Pôle viennent avec l'import des ressources (relais).
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "StridesGameMode.generated.h"

UCLASS()
class STRIDESGRANDTOUR_API AStridesGameMode : public AGameModeBase
{
	GENERATED_BODY()
public:
	AStridesGameMode();
	virtual void StartPlay() override;
};
