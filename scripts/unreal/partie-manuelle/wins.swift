import CoreGraphics
let l = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as! [[String: Any]]
for w in l { let o = w["kCGWindowOwnerName"] as? String ?? ""; if CommandLine.arguments.count < 2 || o.contains(CommandLine.arguments[1]) { print(w["kCGWindowNumber"] ?? "", o, w["kCGWindowLayer"] ?? "", w["kCGWindowBounds"] ?? "", w["kCGWindowName"] ?? "") } }
