import AppKit
import Vision

guard CommandLine.arguments.count == 2 else {
    fputs("usage: swift scripts/vision-ocr.swift image.png\n", stderr)
    exit(2)
}
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let image = NSImage(contentsOf: url) else { exit(3) }
var rect = NSRect(origin: .zero, size: image.size)
guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else { exit(4) }
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["fr-FR", "en-US"]
let handler = VNImageRequestHandler(cgImage: cgImage)
try handler.perform([request])
for observation in request.results ?? [] {
    if let candidate = observation.topCandidates(1).first {
        print(candidate.string)
    }
}
