// pix <png> x y [x y ...] : couleur RVB (0-255) des pixels donnés (coordonnées en pixels de l'image).
import AppKit
let a = CommandLine.arguments
guard a.count >= 4, let img = NSImage(contentsOfFile: a[1]), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print("illisible"); exit(1) }
let rep = NSBitmapImageRep(cgImage: cg)
var i = 2
while i + 1 < a.count {
  let x = Int(a[i])!, y = Int(a[i+1])!
  if let c = rep.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) { print(Int(c.redComponent*255), Int(c.greenComponent*255), Int(c.blueComponent*255)) } else { print("? ? ?") }
  i += 2
}
