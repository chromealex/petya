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
// is already authorized. Metadata requests may expand the meeting information control.
func attribute(_ element: AXUIElement, _ key: String) -> CFTypeRef? {
    var value: CFTypeRef?
    AXUIElementCopyAttributeValue(element, key as CFString, &value)
    return value
}
func meetingObservation(_ pid: pid_t) -> (Bool, String) {
    guard AXIsProcessTrusted() else { return (false, "") }
    let root = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(root, 0.1)
    guard let windows = attribute(root, kAXWindowsAttribute) as? [AXUIElement] else { return (false, "") }
    func scan(_ window: AXUIElement) -> [(AXUIElement, String, String)] {
        var pending = [(window, 0)], nodes = [(AXUIElement, String, String)]()
        let deadline = Date().addingTimeInterval(1.5)
        while let (element, depth) = pending.popLast(), nodes.count < 900, Date() < deadline {
            if attribute(element, "AXHidden") as? Bool == true { continue }
            let role = attribute(element, kAXRoleAttribute) as? String ?? ""
            let text = [kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute, kAXURLAttribute].compactMap { key -> String? in
                if let url = attribute(element, key) as? URL { return url.absoluteString }
                return attribute(element, key) as? String
            }.joined(separator: "\n")
            nodes.append((element, role, text))
            if depth < 18, let children = attribute(element, kAXChildrenAttribute) as? [AXUIElement] {
                pending.append(contentsOf: children.reversed().map { ($0, depth + 1) })
            }
        }
        return nodes
    }
    let meetingWindows = windows.filter { window in
        let identifier = attribute(window, "AXIdentifier") as? String ?? ""
        let title = attribute(window, kAXTitleAttribute) as? String ?? ""
        if identifier == "zm.meeting.window.main" || ["Zoom Meeting", "Конференция Zoom"].contains(title) { return true }
        return scan(window).contains { _, role, text in
            role == kAXButtonRole as String && text.lowercased().components(separatedBy: "\n").contains { label in
                ["leave meeting", "end meeting", "leave", "end", "выйти из конференции", "завершить конференцию"].contains(label.trimmingCharacters(in: .whitespacesAndNewlines))
            }
        }
    }
    guard meetingWindows.count == 1 else { return (!meetingWindows.isEmpty, "") }
    guard CommandLine.arguments.contains("--meeting-link") else { return (true, "") }
    let window = meetingWindows[0]
    var nodes = scan(window)
    // Expand only the current meeting's information control; never copy invitations or read chats.
    let info = nodes.filter { _, role, text in
        [kAXButtonRole as String, "AXMenuButton"].contains(role) && text.lowercased().components(separatedBy: "\n").contains { label in
            ["meeting information", "meeting info", "информация о конференции", "сведения о конференции"].contains(label.trimmingCharacters(in: .whitespacesAndNewlines))
        }
    }
    if info.count == 1 && !nodes.contains(where: { $0.2.lowercased().hasPrefix("meeting id") || $0.2.lowercased().hasPrefix("идентификатор конференции") }) {
        AXUIElementPerformAction(info[0].0, kAXPressAction as CFString)
        Thread.sleep(forTimeInterval: 0.15)
        nodes = scan(window)
    }
    // Include the information popover if Zoom exposes it as a separate AX window.
    let extra = (attribute(root, kAXWindowsAttribute) as? [AXUIElement] ?? []).filter {
        let title = (attribute($0, kAXTitleAttribute) as? String ?? "").lowercased()
        return ["meeting information", "meeting info", "информация о конференции", "сведения о конференции"].contains(title)
    }
    for w in extra { nodes.append(contentsOf: scan(w)) }
    // Only emit meeting metadata, not arbitrary text from the call or meeting chat.
    let texts = nodes.map { $0.2 }
    var metadata = [String]()
    for (index, text) in texts.enumerated() {
        if text.range(of: "(?i)^(?:meeting id|passcode|invite link|join link|идентификатор конференции|код доступа|пароль конференции|ссылка приглашения)[:：]?", options: .regularExpression) != nil {
            metadata.append(text)
            if index + 1 < texts.count { metadata.append(texts[index + 1]) }
        }
    }
    if metadata.isEmpty {
        // Zoom hides the toolbar while presenting. The Invite dialog exposes only
        // this meeting's ID and passcode; opening it does not send invitations.
        func inviteWindows() -> [AXUIElement] {
            return (attribute(root, kAXWindowsAttribute) as? [AXUIElement] ?? []).filter {
                let title = attribute($0, kAXTitleAttribute) as? String ?? ""
                return title.range(of: "^(?:Invite people to join meeting|Пригласить.*конференци[юи]) [0-9]{9,11}$", options: .regularExpression) != nil
            }
        }
        var invitations = inviteWindows()
        let wasOpen = !invitations.isEmpty
        if invitations.isEmpty, let barValue = attribute(root, kAXMenuBarAttribute), CFGetTypeID(barValue) == AXUIElementGetTypeID() {
            let bar = unsafeBitCast(barValue, to: AXUIElement.self)
            let menus = scan(bar).filter { _, role, text in role == "AXMenuBarItem" && ["Meeting", "Конференция"].contains(text.components(separatedBy: "\n")[0]) }
            if menus.count == 1 {
                AXUIElementPerformAction(menus[0].0, kAXPressAction as CFString)
                let actions = scan(bar).filter { element, role, text in
                    role == "AXMenuItem" && ((attribute(element, "AXIdentifier") as? String) == "onInvite:" || ["Invite...", "Пригласить..."].contains(text.components(separatedBy: "\n")[0]))
                }
                if actions.count == 1 {
                    AXUIElementPerformAction(actions[0].0, kAXPressAction as CFString)
                    Thread.sleep(forTimeInterval: 0.15)
                    invitations = inviteWindows()
                } else { AXUIElementPerformAction(menus[0].0, "AXCancel" as CFString) }
            }
        }
        if invitations.count == 1 {
            let dialog = invitations[0]
            let title = attribute(dialog, kAXTitleAttribute) as? String ?? ""
            if let range = title.range(of: "[0-9]{9,11}$", options: .regularExpression) { metadata.append("Meeting ID: " + title[range]) }
            for (_, _, text) in scan(dialog) {
                if text.lowercased().hasPrefix("meeting passcode:") { metadata.append(String(text.dropFirst("Meeting ".count))) }
                if text.lowercased().hasPrefix("код доступа:") { metadata.append(text) }
            }
            if !wasOpen, let close = attribute(dialog, kAXCloseButtonAttribute), CFGetTypeID(close) == AXUIElementGetTypeID() {
                AXUIElementPerformAction(unsafeBitCast(close, to: AXUIElement.self), kAXPressAction as CFString)
            }
        }
    }
    return (true, metadata.joined(separator: "\n"))
}
let observations = zoom.map { meetingObservation($0) }
let meetingActive = observations.contains { $0.0 }
let meetingInfo = observations.filter { $0.0 }.count == 1 ? observations.first(where: { $0.0 })!.1 : ""
let data: [String: Any] = ["meetingActive": meetingActive, "meetingInfo": meetingInfo, "zoomOpen": !zoom.isEmpty, "slackOpen": slack, "permission": CGPreflightScreenCaptureAccess(), "windows": windows, "zoomWindowIds": zoomWindowIds]
print(String(data: try JSONSerialization.data(withJSONObject: data), encoding: .utf8)!)
