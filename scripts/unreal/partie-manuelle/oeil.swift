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

@main
struct Oeil {
  static func main() async {
    guard let content = try? await SCShareableContent.current, let display = content.displays.first else {
      print("ERREUR|pas d'écran (droit Enregistrement de l'écran ?)"); fflush(stdout); return
    }
    // Repères en points (écran 1920 × 1080 points, 3840 × 2160 pixels) : bande haute gauche (tableau, pastille) et
    // bouton SAUT (bas droite).
    let band = CGRect(x: 0, y: 0, width: 700, height: 175)
    let jump = CGRect(x: 1815, y: 970, width: 75, height: 60)
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
