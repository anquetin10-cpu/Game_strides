// Position réelle du soleil sur la Côte Fleurie (algorithme de la NOAA : déclinaison et équation du temps, précis à
// la minute près). Le jeu se déroule pendant la saison d'août de Deauville : la date est fixe (comme la météo, cycle
// de fin d'été) et l'heure de jeu est l'heure légale d'été (UTC + 2).
const RAD = Math.PI / 180;
export const SUN_SITE = { lat: 49.36, lon: 0.07, utc: 2, dayOfYear: 235 }; // Deauville, 23 août

// Azimut (degrés depuis le nord, sens horaire) et hauteur (degrés) du soleil à l'heure locale donnée.
export function sunPosition(hour, site = SUN_SITE) {
  const g = ((2 * Math.PI) / 365) * (site.dayOfYear - 1 + (hour - site.utc - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const trueSolar = hour * 60 + eqTime + 4 * site.lon - 60 * site.utc; // minutes
  const ha = (trueSolar / 4 - 180) * RAD; // angle horaire
  const lat = site.lat * RAD;
  const cosZen = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen)));
  let az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) / RAD + 180;
  az = ((az % 360) + 360) % 360;
  return { alt: 90 - zen / RAD, az, decl: decl / RAD, eqTime };
}

// Heures (locales) du lever, du midi solaire et du coucher : soleil à -0,833° (réfraction et demi-diamètre).
export function sunTimes(site = SUN_SITE) {
  const { decl, eqTime } = sunPosition(12, site);
  const noon = (720 - 4 * site.lon - eqTime + 60 * site.utc) / 60;
  const lat = site.lat * RAD, d = decl * RAD;
  const cosH = (Math.cos(90.833 * RAD) - Math.sin(lat) * Math.sin(d)) / (Math.cos(lat) * Math.cos(d));
  const half = (Math.acos(Math.max(-1, Math.min(1, cosH))) / RAD) * 4 / 60;
  return { sunrise: noon - half, noon, sunset: noon + half };
}

// Direction du soleil dans le monde du jeu (nord = -z, est = +x, haut = +y), vecteur unitaire.
export function sunDirection(hour, out, site = SUN_SITE) {
  const { alt, az } = sunPosition(hour, site);
  const a = alt * RAD, z = az * RAD;
  out.x = Math.sin(z) * Math.cos(a);
  out.y = Math.sin(a);
  out.z = -Math.cos(z) * Math.cos(a);
  return out;
}
