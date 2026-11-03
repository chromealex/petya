import AppKit
import CoreGraphics
import Foundation
import ApplicationServices
let apps = NSWorkspace.shared.runningApplications
let zoom = Set(apps.filter { $0.bundleIdentifier == "us.zoom.xos" }.map { $0.processIdentifier })
let slack = apps.contains { $0.bundleIdentifier == "com.tinyspeck.slackmacgap" }
let rows = (CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
let zoomWindowIds = rows.compactMap { row -> String? in
    guard let pid = row[kCGWindowOwnerPID as String] as? Int32, zoom.contains(pid),
          let id = row[kCGWindowNumber as String] as? NSNumber else { return nil }
    return id.stringValue
}
let windows = rows.compactMap { row -> [String: Any]? in
    guard let pid = row[kCGWindowOwnerPID as String] as? Int32, zoom.contains(pid),
          let title = row[kCGWindowName as String] as? String, !title.isEmpty else { return nil }
    return ["title": title, "visible": (row[kCGWindowIsOnscreen as String] as? Bool) ?? false]
}
// Zoom can use a custom meeting title. Inspect meeting controls when Accessibility
// is already authorized; never prompt or manipulate Zoom from this observer.
func hasMeetingControls(_ pid: pid_t) -> Bool {
    guard AXIsProcessTrusted() else { return false }
    let app = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(app, 0.15)
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &value) == .success,
          let windows = value as? [AXUIElement] else { return false }
    var pending = windows.map { ($0, 0) }
    var visited = 0
    let deadline = Date().addingTimeInterval(2)
    while let (element, depth) = pending.popLast(), visited < 600, Date() < deadline {
        visited += 1
        var role: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &role)
        if (role as? String) == (kAXButtonRole as String) {
            for attribute in [kAXTitleAttribute, kAXDescriptionAttribute] {
                var label: CFTypeRef?
                AXUIElementCopyAttributeValue(element, attribute as CFString, &label)
                let text = (label as? String ?? "").lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
                if ["leave meeting", "end meeting", "leave", "end", "выйти из конференции", "завершить конференцию"].contains(text) { return true }
            }
        }
        if depth < 10 {
            var children: CFTypeRef?
            if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &children) == .success,
               let elements = children as? [AXUIElement] { pending.append(contentsOf: elements.map { ($0, depth + 1) }) }
        }
    }
    return false
}
let meetingActive = zoom.contains { hasMeetingControls($0) }
let data: [String: Any] = ["meetingActive": meetingActive, "zoomOpen": !zoom.isEmpty, "slackOpen": slack, "permission": CGPreflightScreenCaptureAccess(), "windows": windows, "zoomWindowIds": zoomWindowIds]
print(String(data: try JSONSerialization.data(withJSONObject: data), encoding: .utf8)!)
