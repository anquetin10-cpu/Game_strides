// Conduite des épreuves de CSO — portage de src/gameplay/csoRide.js (fonctions pures ; l'état du cavalier et du cheval
// est tenu par l'appelant). Oracles : unreal/core/tests/oracles/cso_ride.json.
#pragma once
#include "StridesCore/Api.h"

namespace strides {
struct CsoRideParams {
  double cadence = 6.2, maxSpeed = 8.0, cadenceRate = 1.2, lowRate = 2.2, deadZone = 0.35, slope = 0.65, steerDead = 0.06,
         expo = 1.35, radius0 = 2.6, radiusK = 0.8, pivot = 0.8, yawTau = 0.2, yawAcc = 3.0, airTurn = 0.3, kbdRamp = 3.2,
         landingLoss = 0.04;
};
STRIDESCORE_API const CsoRideParams& csoRideDefaults();
STRIDESCORE_API double minRadius(double v, const CsoRideParams& R = csoRideDefaults());
STRIDESCORE_API double maxTurnRate(double v, const CsoRideParams& R = csoRideDefaults());
// Commande de direction (−1..1) → vitesse de rotation visée (rad/s ; positive = vers la gauche du cavalier).
STRIDESCORE_API double steerRate(double x, double v, const CsoRideParams& R = csoRideDefaults());
// Commande de vitesse (−1..1, et direction x) → variation de cadence (m/s par seconde).
STRIDESCORE_API double cadenceDelta(double y, double x, double cadence, const CsoRideParams& R = csoRideDefaults());
}  // namespace strides
