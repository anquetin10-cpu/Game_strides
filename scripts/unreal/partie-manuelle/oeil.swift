// oeil : « œil » persistant du joueur de l'agent (ScreenCaptureKit + Vision), pour lire l'écran plus vite qu'une capture
// screencapture + un processus OCR par image (1,5 à 2 s par lecture au contrôle J1). Lancé par suivre.py (qui a les droits
// Enregistrement de l'écran ; le processus enfant en hérite). Une ligne sur stdin = une lecture ; une ligne en sortie :
//   T|<lignes de texte de la bande haute gauche, séparées par |>|G|<pixels verts du bouton SAUT>|MS|<durée en ms>
// Compiler (hors dépôt) : swiftc -O oeil.swift -o oeil
import AppKit
import ScreenCaptureKit
import Vision

func capture(_ display: SCDisplay, _ rect: CGRect, _ scale: CGFloat) async -> CGImage? {
  let filter = SCContentFilter(display: display, excludingWindows: [])
  let cfg = SCStreamConfiguration()
  cfg.sourceRect = rect
  cfg.width = Int(rect.width * scale)
  cfg.height = Int(rect.height * scale)
  cfg.showsCursor = false
  return try? await SCScreenshotManager.captureImage(contentFilter: filter, configuration: cfg)
}

func ocr(_ img: CGImage) -> [String] {
  let req = VNRecognizeTextRequest()
  req.recognitionLanguages = ["fr-FR"]
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = false
  try? VNImageRequestHandler(cgImage: img).perform([req])
  return (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }
}

func greens(_ img: CGImage) -> Int {
  guard let data = img.dataProvider?.data, let p = CFDataGetBytePtr(data) else { return 0 }
  let bpr = img.bytesPerRow, bpp = img.bitsPerPixel / 8
  var n = 0
  for y in stride(from: 0, to: img.height, by: 4) {
    for x in stride(from: 0, to: img.width, by: 4) {
      let o = y * bpr + x * bpp
      // BGRA (ScreenCaptureKit)
      let b = Int(p[o]), g = Int(p[o + 1]), r = Int(p[o + 2])
      if g > r + 30 && g > b + 10 { n += 1 }
    }
  }
  return n
}

func rings(_ img: CGImage) -> (Int, Int, Int) {
  guard let data = img.dataProvider?.data, let p = CFDataGetBytePtr(data) else { return (0, 0, 0) }
  let bpr = img.bytesPerRow, bpp = img.bitsPerPixel / 8
  var a = 0, g = 0, r = 0
  func near(_ x: Int, _ y: Int, _ z: Int, _ c: (Int, Int, Int)) -> Bool { abs(x - c.0) < 40 && abs(y - c.1) < 40 && abs(z - c.2) < 40 }
  let little = (img.bitmapInfo.rawValue & CGBitmapInfo.byteOrderMask.rawValue) == CGBitmapInfo.byteOrder32Little.rawValue
  // Anneau seul (couronne entre 0,36 et 0,52 du côté, centrée) : les coins (sable, herbe) ne comptent pas.
  let cx = Double(img.width) / 2, cy = Double(img.height) / 2, m = Double(min(img.width, img.height))
  for y in stride(from: 0, to: img.height, by: 2) {
    for x in stride(from: 0, to: img.width, by: 2) {
      let dd = ((Double(x) - cx) * (Double(x) - cx) + (Double(y) - cy) * (Double(y) - cy)).squareRoot() / m
      if dd < 0.30 || dd > 0.52 { continue }
      let o = y * bpr + x * bpp
      // Ordre des octets : BGRA (ScreenCaptureKit, petit-boutiste) ou RGBA (PNG relu par NSImage).
      let bl = Int(p[o + (little ? 0 : 2)]), gr = Int(p[o + 1]), rd = Int(p[o + (little ? 2 : 0)])
      if near(rd, gr, bl, (240, 179, 58)) { a += 1 } else if near(rd, gr, bl, (95, 184, 126)) { g += 1 } else if near(rd, gr, bl, (226, 91, 75)) { r += 1 }
    }
  }
  return (a, g, r)
}

func load(_ path: String) -> CGImage? {
  guard let img = NSImage(contentsOfFile: path) else { return nil }
  return img.cgImage(forProposedRect: nil, context: nil, hints: nil)
}

@main
struct Oeil {
  static func main() async {
    // Mode « fichiers » (sans ScreenCaptureKit : macOS redemande périodiquement l'accès direct à l'écran, demande que
    // seul Julien peut accorder) : les captures sont faites par screencapture (outil système) ; une ligne sur stdin :
    //   « T <png> » → T|<texte>|G|0|MS|<ms> ; « S <png> » → S|<ambre>|<vert>|<rouge>.
    if CommandLine.arguments.dropFirst().first == "fichiers" {
      while let line = readLine() {
        let t0 = Date()
        let kind = line.prefix(1), path = String(line.dropFirst(2))
        guard let img = load(path) else { print(kind == "T" ? "T||G|0|MS|0" : "S|0|0|0"); fflush(stdout); continue }
        if kind == "T" {
          print("T|" + ocr(img).joined(separator: "|") + "|G|0|MS|\(Int(Date().timeIntervalSince(t0) * 1000))")
        } else {
          let c = rings(img)
          print("S|\(c.0)|\(c.1)|\(c.2)")
        }
        fflush(stdout)
      }
      return
    }
    guard let content = try? await SCShareableContent.current, let display = content.displays.first else {
      print("ERREUR|pas d'écran (droit Enregistrement de l'écran ?)"); fflush(stdout); return
    }
    // Repères en points (écran 1920 × 1080 points, 3840 × 2160 pixels) : bande haute gauche (tableau, pastille) et
    // bouton SAUT (bas droite).
    let band = CGRect(x: 0, y: 0, width: 760, height: 270)
    let jump = CGRect(x: 1805, y: 965, width: 95, height: 100)
    // Mode « tout » : deux boucles concurrentes dans le même processus (deux processus ScreenCaptureKit se bloquaient) :
    //   T|<texte de la bande haute gauche>|MS|<ms>  (~4 lectures par seconde, OCR) ;
    //   S|<pixels ambre (loin)>|<pixels verts (bon appel)>|<pixels rouges (près)>  (bouton SAUT seul, ~20 à 40 par seconde ;
    //   couleurs des anneaux du web, cso_jump_style.json : far rgb(240,179,58), good rgb(95,184,126), near rgb(226,91,75)).
    if CommandLine.arguments.dropFirst().first == "tout" {
      await withTaskGroup(of: Void.self) { group in
        group.addTask {
          while true {
            let t0 = Date()
            var texts: [String] = []
            if let a = await capture(display, band, 2) { texts = ocr(a) }
            let ms = Int(Date().timeIntervalSince(t0) * 1000)
            print("T|" + texts.joined(separator: "|") + "|G|0|MS|\(ms)")
            fflush(stdout)
          }
        }
        group.addTask {
          while true {
            guard let b = await capture(display, jump, 1) else { continue }
            let c = rings(b)
            print("S|\(c.0)|\(c.1)|\(c.2)")
            fflush(stdout)
          }
        }
      }
    }
    while let line = readLine() {
      if line == "fin" { break }
      let t0 = Date()
      var texts: [String] = []
      var g = 0
      if let a = await capture(display, band, 2) { texts = ocr(a) }
      if let b = await capture(display, jump, 1) { g = greens(b) }
      let ms = Int(Date().timeIntervalSince(t0) * 1000)
      print("T|" + texts.joined(separator: "|") + "|G|\(g)|MS|\(ms)")
      fflush(stdout)
    }
  }
}
