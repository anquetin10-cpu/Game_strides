#include "StridesCore/CoursePlan.h"

#include <cmath>
#include <cstdlib>

namespace strides {
namespace {

std::string F1(double x) { return jsToFixed(x, 1); }
std::string F2(double x) { return jsToFixed(x, 2); }
std::string N(double x) { return jsNumber(x); }

// Un élément écrit attribut par attribut dans l'ordre du gabarit de coursePlan.js ; les nombres de la géométrie sont
// relus dans le texte de leur attribut (ce que le navigateur dessine).
struct El {
  PlanPrim p;
  std::string s;
  El(PlanPrim::Kind k, const char* tag) {
    p.kind = k;
    s = std::string("<") + tag;
  }
  El& a(const char* name, const std::string& val) {
    s += std::string(" ") + name + "=\"" + val + "\"";
    return *this;
  }
  El& g(const char* name, const std::string& val) {  // géométrie
    a(name, val);
    p.v.push_back(std::strtod(val.c_str(), nullptr));
    return *this;
  }
  El& fill(const std::string& c) { p.fill = c; return a("fill", c); }
  El& stroke(const std::string& c) { p.stroke = c; return a("stroke", c); }
  El& strokeWidth(const std::string& w) { p.strokeWidth = std::strtod(w.c_str(), nullptr); return a("stroke-width", w); }
  El& strokeOpacity(const std::string& o) { p.strokeOpacity = std::strtod(o.c_str(), nullptr); return a("stroke-opacity", o); }
  El& fillOpacity(const std::string& o) { p.fillOpacity = std::strtod(o.c_str(), nullptr); return a("fill-opacity", o); }
  El& dash(const char* d) {
    std::sscanf(d, "%lf %lf", &p.dash[0], &p.dash[1]);
    return a("stroke-dasharray", d);
  }
  El& fontSize(const std::string& f) { p.fontSize = std::strtod(f.c_str(), nullptr); return a("font-size", f); }
  El& bold() { p.bold = true; return a("font-weight", "700"); }
  El& anchor(const char* x) { p.anchor = x; return a("text-anchor", x); }
  PlanPrim close() {
    s += "/>";
    p.svg = s;
    return p;
  }
  PlanPrim text(const std::string& t) {
    s += ">" + t + "</text>";
    p.text = t;
    p.svg = s;
    return p;
  }
};

// Liste de points d'une polyline (coursePlan.js pl) : un point sur deux, « x,z » au dixième, séparés d'une espace.
El polyline(const std::vector<TracePoint>& pts) {
  El e(PlanPrim::Kind::Polyline, "polyline");
  std::string s;
  for (size_t i = 0; i < pts.size(); i += 2) {
    const std::string x = F1(pts[i].x), z = F1(pts[i].z);
    if (!s.empty()) s += ' ';
    s += x + "," + z;
    e.p.v.push_back(std::strtod(x.c_str(), nullptr));
    e.p.v.push_back(std::strtod(z.c_str(), nullptr));
  }
  e.a("points", s);
  return e;
}

}  // namespace

CoursePlan coursePlan(const CourseTrace& trace, const CoursePlanArena& arena, const std::vector<double>* heights, int next, const TextTable& tt, Lang lang) {
  CoursePlan out;
  const double W = arena.w, D = arena.d, pad = 6;
  out.vb[0] = -W / 2 - pad;
  out.vb[1] = -D / 2 - pad - 4;
  out.vb[2] = W + pad * 2;
  out.vb[3] = D + pad * 2 + 8;
  out.viewBox = N(out.vb[0]) + " " + N(out.vb[1]) + " " + N(out.vb[2]) + " " + N(out.vb[3]);
  out.aria = tt.t("Plan du parcours", lang);
  std::vector<PlanPrim>& P = out.prims;
  // Carrière (sable), lice, entrée de piste au sud (+z), tribunes au nord (−z).
  P.push_back(El(PlanPrim::Kind::Rect, "rect").g("x", N(-W / 2)).g("y", N(-D / 2)).g("width", N(W)).g("height", N(D)).g("rx", "1.5").fill("#e8dcc0").stroke("#1b1c1f").strokeWidth("0.5").close());
  {
    El e(PlanPrim::Kind::Rect, "rect");
    e.g("x", "-3.5").g("y", N(D / 2 - 0.4)).g("width", "7").g("height", "0.8").fill("#e8dcc0");
    e.p.v.push_back(0);  // rx absent
    P.push_back(e.close());
  }
  P.push_back(El(PlanPrim::Kind::Text, "text").g("x", "0").g("y", N(D / 2 + 3.6)).fontSize("2.6").anchor("middle").fill("#6b6a64").text(tt.t("ENTRÉE", lang)));
  {
    El e(PlanPrim::Kind::Rect, "rect");
    e.g("x", N(-arena.standsW / 2)).g("y", N(-D / 2 - 5.5)).g("width", N(arena.standsW)).g("height", "3.2").fill("#c9c6bd");
    e.p.v.push_back(0);
    P.push_back(e.close());
  }
  P.push_back(El(PlanPrim::Kind::Text, "text").g("x", "0").g("y", N(-D / 2 - 3.1)).fontSize("2.2").anchor("middle").fill("#3a3a36").text(tt.t("TRIBUNES", lang)));
  // Ligne du cavalier (pointillés) ; abord conseillé depuis l'entrée de piste jusqu'au départ (plus discret).
  if (trace.leadIn.size() > 1) P.push_back(polyline(trace.leadIn).fill("none").stroke("#1b1c1f").strokeOpacity("0.22").strokeWidth("0.35").dash("0.6 1").close());
  P.push_back(polyline(trace.pts).fill("none").stroke("#1b1c1f").strokeOpacity("0.45").strokeWidth("0.45").dash("1.2 1").close());
  // Lignes de départ et d'arrivée.
  const struct { const char* k; const char* mark; const char* col; } marks[2] = {{"D", "start", "#2f6e4a"}, {"A", "finish", "#b8322a"}};
  for (const auto& mk : marks) {
    const TraceMark& m = trace.marks.at(mk.mark);
    const double tx = std::cos(m.rot) * 3.5, tz = -std::sin(m.rot) * 3.5;
    P.push_back(El(PlanPrim::Kind::Line, "line").g("x1", F2(m.x - tx)).g("y1", F2(m.z - tz)).g("x2", F2(m.x + tx)).g("y2", F2(m.z + tz)).stroke(mk.col).strokeWidth("0.7").close());
    P.push_back(El(PlanPrim::Kind::Text, "text").g("x", F2(m.x + tx * 1.5)).g("y", F2(m.z + tz * 1.5 + 1)).fontSize("2.6").bold().anchor("middle").fill(mk.col)
                    .text(std::string(mk.k) == "D" ? tt.t("Départ", lang) : tt.t("Arrivée", lang)));
  }
  // Obstacles.
  for (size_t i = 0; i < trace.fences.size(); i++) {
    const TraceFence& f = trace.fences[i];
    const double nx = std::sin(f.rot), nz = std::cos(f.rot), tx = std::cos(f.rot), tz = -std::sin(f.rot);
    const double hw = 1.9;
    auto bar = [&](double s, const char* col, const char* width) {
      El e(PlanPrim::Kind::Line, "line");
      e.g("x1", F2(f.x + nx * s - tx * hw)).g("y1", F2(f.z + nz * s - tz * hw)).g("x2", F2(f.x + nx * s + tx * hw)).g("y2", F2(f.z + nz * s + tz * hw)).stroke(col).strokeWidth(width).a("stroke-linecap", "round");
      e.p.roundCap = true;
      return e.close();
    };
    const bool hot = next == (int)i + 1;
    const char* col = hot ? "#1a9b62" : "#1b1c1f";
    if (f.kind == "o") {
      P.push_back(bar(-f.spread / 2, col, "0.8"));
      P.push_back(bar(f.spread / 2, col, "0.8"));
    } else if (f.kind == "w") P.push_back(bar(0, "#a4553f", "1.3"));
    else P.push_back(bar(0, col, "0.8"));
    // Flèche du sens de saut et numéro (du côté du panneau sur la piste : à droite du cavalier, fanion rouge).
    const double ax = f.x - nx * 2.4, az = f.z - nz * 2.4;
    {
      El e(PlanPrim::Kind::Path, "path");
      const std::string x0 = F2(ax - tx * 0.6), y0 = F2(az - tz * 0.6), x1 = F2(ax + nx * 1.1), y1 = F2(az + nz * 1.1), x2 = F2(ax + tx * 0.6), y2 = F2(az + tz * 0.6);
      e.a("d", "M" + x0 + "," + y0 + " L" + x1 + "," + y1 + " L" + x2 + "," + y2);
      for (const std::string* c : {&x0, &y0, &x1, &y1, &x2, &y2}) e.p.v.push_back(std::strtod(c->c_str(), nullptr));
      P.push_back(e.fill(col).fillOpacity("0.55").close());
    }
    const double lx = f.x - tx * 3.6, lz = f.z - tz * 3.6;
    P.push_back(El(PlanPrim::Kind::Circle, "circle").g("cx", F2(lx)).g("cy", F2(lz)).g("r", "1.85").fill(hot ? "#1a9b62" : "#1b1c1f").close());
    P.push_back(El(PlanPrim::Kind::Text, "text").g("x", F2(lx)).g("y", F2(lz + 0.85)).fontSize(f.label.size() > 1 ? "1.9" : "2.4").bold().anchor("middle").fill("#fbfaf5").text(f.label));
    if (heights && i < heights->size()) P.push_back(El(PlanPrim::Kind::Text, "text").g("x", F2(lx)).g("y", F2(lz + 3.6)).fontSize("1.5").anchor("middle").fill("#55544f").text(dec((*heights)[i], 2, lang)));
  }
  return out;
}

std::string coursePlanSvg(const CoursePlan& plan) {
  std::string s = "<svg class=\"course-plan\" viewBox=\"" + plan.viewBox + "\" xmlns=\"http://www.w3.org/2000/svg\" role=\"img\" aria-label=\"" + plan.aria + "\">";
  for (const PlanPrim& p : plan.prims) s += p.svg;
  return s + "</svg>";
}

std::string coursePlanLegend(const CourseTrace& trace, const TextTable& tt, Lang lang) {
  std::string s;
  for (const TraceFence& f : trace.fences) {
    const std::string name = f.kind == "v" ? tt.t("vertical", lang) : f.kind == "o" ? tt.t("oxer", lang) : f.kind == "w" ? tt.t("mur", lang) : f.kind;
    if (!s.empty()) s += " · ";
    s += f.label + " " + name;
  }
  return s;
}

}  // namespace strides
