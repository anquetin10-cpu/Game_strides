// garde.swift <pid> : contrôle de sécurité du poste partagé avant chaque rafale d'entrées injectées (règles du 27/11).
// Sortie 0 et « ok <id fenêtre> <x> <y> <l> <h> » si le jeu (pid) est l'application au premier plan ET qu'aucune
// fenêtre système modale n'est affichée (SecurityAgent, trousseau, UserNotificationCenter, alertes de confidentialité,
// « Forcer à quitter ») ; sinon sortie 1 et « attente <raison> » : l'appelant attend sans rien taper.
// Lecture seule : ne touche à aucune fenêtre. Compiler : swiftc -O garde.swift -o garde (binaire hors dépôt).
import AppKit
import CoreGraphics
guard CommandLine.arguments.count > 1, let pid = Int32(CommandLine.arguments[1]) else { print("usage : garde <pid>"); exit(2) }
let front = NSWorkspace.shared.frontmostApplication
if front?.processIdentifier != pid { print("attente premier plan : \(front?.localizedName ?? "?") (\(front?.processIdentifier ?? 0))"); exit(1) }
let blocking = ["SecurityAgent", "UserNotificationCenter", "coreautha", "CoreServicesUIAgent", "universalAccessAuthWarn", "loginwindow",
                "Trousseau d’accès", "Keychain Access", "tccd", "Forcer"]
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
var game: [String: Any]? = nil
for w in list {
  let owner = w[kCGWindowOwnerName as String] as? String ?? ""
  let name = w[kCGWindowName as String] as? String ?? ""
  let wpid = w[kCGWindowOwnerPID as String] as? Int32 ?? 0
  if blocking.contains(where: { owner.contains($0) || name.contains($0) }) { print("attente fenêtre système : \(owner) « \(name) »"); exit(1) }
  if wpid == pid && (w[kCGWindowLayer as String] as? Int ?? 1) == 0 && game == nil { game = w }
}
guard let g = game, let b = g[kCGWindowBounds as String] as? [String: Any] else { print("attente fenêtre du jeu absente"); exit(1) }
print("ok \(g[kCGWindowNumber as String] ?? 0) \(b["X"] ?? 0) \(b["Y"] ?? 0) \(b["Width"] ?? 0) \(b["Height"] ?? 0)")
