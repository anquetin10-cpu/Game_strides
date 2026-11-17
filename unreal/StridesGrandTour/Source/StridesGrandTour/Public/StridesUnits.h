// Conversions entre le repère du jeu web / du cœur StridesCore (mètres, y vers le haut, cap h → (sin h, cos h)) et
// Unreal (centimètres, Z vers le haut). Voir unreal/docs/conventions.md. Seul endroit où ces conversions sont faites.
#pragma once
#include "CoreMinimal.h"

namespace StridesUnits
{
	constexpr double CmPerM = 100.0;
	// (x, y, z) web, en mètres → position Unreal (cm) : X = x, Y = z, Z = y.
	inline FVector WebToUE(double X, double Y, double Z) { return FVector(X * CmPerM, Z * CmPerM, Y * CmPerM); }
	inline void UEToWeb(const FVector& V, double& X, double& Y, double& Z) { X = V.X / CmPerM; Y = V.Z / CmPerM; Z = V.Y / CmPerM; }
	// Cap web h (rad) ↔ lacet Unreal (degrés) : direction web (sin h, cos h) = direction Unreal (X, Y).
	inline double HeadingToYawDeg(double H) { return 90.0 - FMath::RadiansToDegrees(H); }
	inline double YawDegToHeading(double Yaw) { return UE_DOUBLE_HALF_PI - FMath::DegreesToRadians(Yaw); }
}
