// axpress <pid> <titre du bouton> : appuie (AXPress) sur le bouton de ce titre dans les fenêtres du processus pid ; "list" pour lister.
import ApplicationServices
let pid = pid_t(CommandLine.arguments[1])!; let want = CommandLine.arguments[2]
print("trusted", AXIsProcessTrusted())
let app = AXUIElementCreateApplication(pid)
func attr(_ e: AXUIElement, _ a: String) -> AnyObject? { var v: AnyObject?; AXUIElementCopyAttributeValue(e, a as CFString, &v); return v }
func walk(_ e: AXUIElement, _ d: Int) -> Bool {
  let role = attr(e, kAXRoleAttribute) as? String ?? ""; let title = attr(e, kAXTitleAttribute) as? String ?? ""
  if want == "list" { print(String(repeating: " ", count: d), role, title) }
  if role == kAXButtonRole && title == want { let r = AXUIElementPerformAction(e, kAXPressAction as CFString); print("press", title, r.rawValue); return true }
  for c in (attr(e, kAXChildrenAttribute) as? [AXUIElement] ?? []) { if walk(c, d + 1) { return true } }
  return false
}
for w in (attr(app, kAXWindowsAttribute) as? [AXUIElement] ?? []) { if walk(w, 0) { break } }
