// Vie ambiante du web (src/gameplay/npcs.js : Car, WalkAI, Ambient) ; voir WorldLife.h.
#include "StridesCore/WorldLife.h"

#include <cmath>
#include <limits>

#include "StridesCore/MathUtil.h"
#include "StridesCore/MiniJson.h"

namespace strides {

namespace {
constexpr double kLane = 2.2;  // npcs.js LANE
constexpr double kInf = std::numeric_limits<double>::infinity();

double wrapAngle(double a) {
  const double tau = 2 * kPi;
  a = std::fmod(a + kPi, tau);
  if (a < 0) a += tau;
  return a - kPi;
}

double polylineLength(const std::vector<LifeVec2>& p) {
  double l = 0;
  for (size_t i = 0; i + 1 < p.size(); i++) l += jsHypot(p[i + 1].x - p[i].x, p[i + 1].z - p[i].z);
  return l;
}

LifeOutfit readOutfit(const J& o) {
  LifeOutfit f;
  auto s = [&](const char* k) { return o[k].t == J::Str ? o[k].s : std::string(); };
  f.sex = s("sex");
  f.top = s("top");
  f.sleeve = s("sleeve");
  f.pants = s("pants");
  f.boots = s("boots");
  f.skin = s("skin");
  f.hair = s("hair");
  f.cap = s("cap");
  f.dress = o["dress"].t == J::Bool && o["dress"].b;
  return f;
}

// Distance d'un point dans le couloir devant la voiture (2,6 m de part et d'autre), sinon l'infini (Car._ahead).
double ahead(const TrafficCar& c, double px, double pz, double fx, double fz, double look) {
  const double dx = px - c.x, dz = pz - c.z;
  const double a = dx * fx + dz * fz;
  return a > 0 && a < look && std::fabs(dx * fz - dz * fx) < 2.6 ? a : kInf;
}
}  // namespace

double lifeDampAngle(double a, double b, double lambda, double dt) { return a + wrapAngle(b - a) * (1 - std::exp(-lambda * dt)); }

LifeVec2 lifePointAlong(const std::vector<LifeVec2>& pts, double s, double* dir) {
  for (size_t i = 0; i + 1 < pts.size(); i++) {
    const double ax = pts[i].x, az = pts[i].z, bx = pts[i + 1].x, bz = pts[i + 1].z;
    const double l = jsHypot(bx - ax, bz - az);
    if (s <= l || i == pts.size() - 2) {
      const double t = l > 0 ? clampd(s / l, 0, 1) : 0;
      if (dir) *dir = std::atan2(bx - ax, bz - az);
      return {ax + (bx - ax) * t, az + (bz - az) * t};
    }
    s -= l;
  }
  if (dir) *dir = 0;
  return pts.empty() ? LifeVec2{} : pts[0];
}

const LifeRoad* AmbientData::road(const std::string& id) const {
  for (const LifeRoad& r : roads)
    if (r.id == id) return &r;
  return nullptr;
}

bool loadAmbient(const std::string& text, AmbientData& out, std::string& err) {
  try {
    const J d = JParser(text).parse();
    if (d["schema"].s != "strides.world_ambient/1") {
      err = "schéma inattendu : " + d["schema"].s;
      return false;
    }
    out = AmbientData();
    for (const J& r : d["roads"].a) {
      LifeRoad R;
      R.id = r["id"].s;
      R.w = r["w"].num();
      for (const J& p : r["pts"].a) R.pts.push_back({p[0].num(), p[1].num()});
      R.len = polylineLength(R.pts);
      out.roads.push_back(R);
    }
    out.townX0 = out.townZ0 = 1e9;
    out.townX1 = out.townZ1 = -1e9;
    for (const J& b : d["townBlocks"].a) {
      std::vector<double> v{b[0].num(), b[1].num(), b[2].num(), b[3].num()};
      out.townX0 = std::fmin(out.townX0, v[0] - 30);
      out.townX1 = std::fmax(out.townX1, v[1] + 30);
      out.townZ0 = std::fmin(out.townZ0, v[2] - 30);
      out.townZ1 = std::fmax(out.townZ1, v[3] + 30);
      out.townBlocks.push_back(v);
    }
    for (const auto& [k, m] : d["carModels"].o) out.carModels[k] = {m["L"].num(), m["W"].num(), m["wb"].num(), m["r"].num()};
    for (const J& c : d["cars"].a) out.cars.push_back({c["road"].s, c["kind"].s, c["color"].s, c["s"].num(), c["cruise"].num(), (int)c["dir"].num()});
    for (const J& w : d["walkers"].a) {
      LifeWalkerSpawn W;
      for (const J& p : w["points"].a) W.points.push_back({p[0].num(), p[1].num()});
      W.speed = w["speed"].num();
      W.outfit = readOutfit(w["outfit"]);
      W.chatter = w["chatter"].t == J::Str ? w["chatter"].s : std::string();
      out.walkers.push_back(W);
    }
    for (const J& s : d["spectators"].a) out.spectators.push_back({s["x"].num(), s["z"].num(), s["heading"].num(), readOutfit(s["outfit"])});
    for (const LifeCarSpawn& c : out.cars)
      if (!out.road(c.road)) {
        err = "route inconnue : " + c.road;
        return false;
      }
    return true;
  } catch (const std::exception& e) {
    err = e.what();
    return false;
  }
}

void TrafficCar::place() {
  double pd = 0;
  const LifeVec2 p = lifePointAlong(road->pts, s, &pd);
  const double d = dir > 0 ? pd : pd + kPi;
  if (uturn) {
    // Demi-tour : demi-cercle vers la gauche, de la voie de droite à la voie opposée.
    const double fx = std::sin(d), fz = std::cos(d), rx = std::cos(d), rz = -std::sin(d);
    const double c = std::cos(*uturn), sn = std::sin(*uturn);
    x = p.x - (rx * c - fx * sn) * kLane;
    z = p.z - (rz * c - fz * sn) * kLane;
    heading = d + *uturn;
    return;
  }
  // Voie de droite.
  x = p.x - std::cos(d) * kLane;
  z = p.z + std::sin(d) * kLane;
  heading = d;
}

void AmbientLife::init(const AmbientData& d, unsigned seed) {
  data = &d;
  cars.clear();
  walkers.clear();
  horns = 0;
  sepTick = 0;
  rnd = Mulberry32(double(seed));
  for (const LifeCarSpawn& sp : d.cars) {
    TrafficCar c;
    c.road = d.road(sp.road);
    c.len = c.road->len;
    c.s = sp.s;
    c.dir = sp.dir;
    c.cruise = sp.cruise;
    c.kind = sp.kind;
    c.color = sp.color;
    const auto m = d.carModels.find(sp.kind);
    if (m != d.carModels.end()) {
      c.L = m->second.L;
      c.r = m->second.r;
    }
    c.place();
    cars.push_back(c);
  }
  for (const LifeWalkerSpawn& sp : d.walkers) {
    Walker w;
    w.points = sp.points;
    w.speed = sp.speed;
    w.x = sp.points[0].x;
    w.z = sp.points[0].z;
    walkers.push_back(w);
  }
}

bool AmbientLife::inTown(double x, double z) const {
  return x > data->townX0 && x < data->townX1 && z > data->townZ0 && z < data->townZ1;
}

void AmbientLife::step(double dt, const LifeInput& in) {
  for (Walker& w : walkers) stepWalker(w, dt, in);
  for (TrafficCar& c : cars) stepCar(c, dt, in);
  if ((sepTick = (sepTick + 1) & 1) == 0) separate();
}

void AmbientLife::stepWalker(Walker& h, double dt, const LifeInput& in) {
  const double dp = jsHypot(in.player.x - h.x, in.player.z - h.z);
  if (h.talking > 0 || dp < 2.2) {
    h.talking = std::fmax(0, h.talking - dt);
    h.curSpeed = 0;
    h.heading = lifeDampAngle(h.heading, std::atan2(in.player.x - h.x, in.player.z - h.z), 6, dt);
    return;
  }
  if (h.wait > 0) {
    h.wait -= dt;
    h.curSpeed = 0;
    return;
  }
  const LifeVec2 t = h.points[h.i];
  const double dx = t.x - h.x, dz = t.z - h.z;
  const double d = jsHypot(dx, dz);
  if (d < 0.8) {
    h.i = (h.i + 1) % h.points.size();
    if (rnd.next() < 0.15) h.wait = 2 + rnd.next() * 4;
    return;
  }
  h.heading = lifeDampAngle(h.heading, std::atan2(dx, dz), 5, dt);
  h.curSpeed = h.speed;
  h.x += std::sin(h.heading) * h.curSpeed * dt;
  h.z += std::cos(h.heading) * h.curSpeed * dt;
}

void AmbientLife::separate() {
  // Ambient._separateWalkers : deux passants à moins de 0,9 m sont écartés avec un pas de côté.
  for (size_t i = 0; i < walkers.size(); i++) {
    Walker& a = walkers[i];
    if (!a.visible) continue;
    for (size_t j = i + 1; j < walkers.size(); j++) {
      Walker& b = walkers[j];
      if (!b.visible) continue;
      const double dx = b.x - a.x, dz = b.z - a.z;
      if (dx > 0.9 || dx < -0.9 || dz > 0.9 || dz < -0.9) continue;
      const double d = jsHypot(dx, dz);
      if (d >= 0.9 || d < 1e-4) continue;
      const double push = (0.9 - d) / 2;
      const double nx = dx / d, nz = dz / d;
      const double mx = (nx + nz * 0.6) * push, mz = (nz - nx * 0.6) * push;
      a.x -= mx;
      a.z -= mz;
      b.x += mx;
      b.z += mz;
    }
  }
}

void AmbientLife::stepCar(TrafficCar& c, double dt, const LifeInput& in) {
  const double fx = std::sin(c.heading), fz = std::cos(c.heading);
  double limit = (inTown(c.x, c.z) ? 13.9 : 19.4) * c.cruise;
  // Obstacles devant : distance d'observation croissante avec la vitesse.
  const double look = 8 + c.speed * 1.5;
  double gap = ahead(c, in.player.x, in.player.z, fx, fz, look);
  // Cavalier : la voiture attend derrière le cheval sans klaxonner.
  const bool byPlayer = gap < kInf && !in.riding;
  // Autres voitures de la circulation : avant, centre, arrière.
  for (const TrafficCar& v : cars) {
    if (&v == &c) continue;
    gap = std::fmin(gap, ahead(c, v.x, v.z, fx, fz, look));
    const double half = v.L / 2 - 0.9;
    if (half > 0.6) {
      const double hx = std::sin(v.heading) * half, hz = std::cos(v.heading) * half;
      gap = std::fmin(gap, ahead(c, v.x + hx, v.z + hz, fx, fz, look));
      gap = std::fmin(gap, ahead(c, v.x - hx, v.z - hz, fx, fz, look));
    }
  }
  // Carrefours : entre voitures, priorité à droite (trajectoires qui se croisent dans les 4 prochaines secondes).
  if (!c.uturn && c.speed > 0.5) {
    for (const TrafficCar& v : cars) {
      if (&v == &c) continue;
      const double vs = v.speed;
      if (std::fabs(vs) < 0.5) continue;
      const double vfx = std::sin(v.heading), vfz = std::cos(v.heading);
      if (std::fabs(fx * vfz - fz * vfx) < 0.3) continue;
      const double rx = v.x - c.x, rz = v.z - c.z;
      if (rx * rx + rz * rz > 70 * 70) continue;
      const bool fromRight = rx * -fz + rz * fx > 0;
      if (!fromRight) continue;
      const double half = std::fmax(0, v.L / 2 - 1);
      bool hit = false;
      for (double t = 0.5; t <= 4 && !hit; t += 0.5) {
        for (double o = -half; o <= half + 1e-6 && !hit; o += std::fmax(half, 1)) {
          const double dx = rx + vfx * (vs * t + o) - fx * c.speed * t, dz = rz + vfz * (vs * t + o) - fz * c.speed * t;
          if (dx * dx + dz * dz < 3.6 * 3.6) {
            gap = std::fmin(gap, std::fmax(0, c.speed * t - 1.5));
            hit = true;
          }
        }
      }
    }
  }
  // Code de la route : on croise et on dépasse les chevaux au pas (20 km/h).
  for (const LifeVec2& h : in.horses) {
    gap = std::fmin(gap, ahead(c, h.x, h.z, fx, fz, look));
    const double dx = h.x - c.x, dz = h.z - c.z;
    const double a = dx * fx + dz * fz;
    if (a > -8 && a < 45 && std::fabs(dx * fz - dz * fx) < 8) limit = std::fmin(limit, 5.5);
  }
  // Bout de route.
  const double far = jsHypot(in.cam.x - c.x, in.cam.z - c.z);
  const double toEnd = c.dir > 0 ? c.len - c.s : c.s;
  if (c.uturn)
    limit = 2.2;
  else if (toEnd < 14 && far > 160) {
    c.dir *= -1;
    c.speed *= 0.3;
  } else if (toEnd < (c.speed * c.speed) / 10 + 12) {
    gap = std::fmin(gap, std::fmax(0, toEnd - 5));
    if (toEnd < 14 && c.speed < 0.3) {
      c.endWait += dt;
      if (c.endWait > 1.5) {
        // _turnClear : pas de demi-tour tant que le joueur ou un cheval se trouve sur la trajectoire.
        const double cx = c.x + std::sin(c.heading) * kLane, cz = c.z + std::cos(c.heading) * kLane;
        auto near = [&](const LifeVec2& p) { return jsHypot(p.x - cx, p.z - cz) < kLane + 4.5; };
        bool clear = !near(in.player);
        for (const LifeVec2& h : in.horses) clear = clear && !near(h);
        if (clear) c.uturn = 0.0;
      }
    }
  }
  if (!c.uturn && c.speed >= 0.3) c.endWait = 0;
  // Vitesse visée : limitation, puis freinage doux (≈ 5 m/s²) pour s'arrêter 5 m avant l'obstacle.
  double target = limit;
  if (gap < kInf) target = std::fmin(target, std::sqrt(std::fmax(0, 10 * (gap - 5))));
  const double prev = c.speed;
  c.speed += clampd(target - c.speed, -9 * dt, 2.6 * dt);
  c.accel = (c.speed - prev) / std::fmax(dt, 1e-3);
  if (byPlayer && c.speed < 0.5) {
    c.wait += dt;
    if (c.wait > 4 && jsHypot(in.player.x - c.x, in.player.z - c.z) < 14) {
      c.wait = -5;
      horns++;
    }
  } else if (c.wait > 0)
    c.wait = 0;
  else
    c.wait = std::fmin(0, c.wait + dt);
  if (c.uturn) {
    *c.uturn += (c.speed * dt) / kLane;
    if (*c.uturn >= kPi) {
      c.uturn.reset();
      c.endWait = 0;
      c.dir *= -1;
    }
  } else
    c.s = clampd(c.s + c.speed * dt * c.dir, 4, c.len - 4);
  c.spin += (c.speed * dt) / c.r;
  c.place();
  c.visible = far < 300;
  c.braking = c.accel < -0.8 || (c.speed < 0.3 && c.speed > -0.2);
}

}  // namespace strides
