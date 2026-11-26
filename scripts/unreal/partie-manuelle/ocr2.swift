// ocr2 <png> : texte (Vision, fr) de la bande haute gauche (tableau du chrono, pastille de guidage).
import Vision
import AppKit
for p in CommandLine.arguments.dropFirst() {
  guard let img = NSImage(contentsOfFile: p), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print(p, "illisible"); continue }
  let crop = cg.cropping(to: CGRect(x: 0, y: 0, width: 1700, height: 420)) ?? cg
  let req = VNRecognizeTextRequest(); req.recognitionLanguages = ["fr-FR"]; req.recognitionLevel = .accurate
  try? VNImageRequestHandler(cgImage: crop).perform([req])
  let lines = (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }
  print((p as NSString).lastPathComponent, "|", lines.joined(separator: " | "))
}
