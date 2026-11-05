import AppKit
import ApplicationServices
import Foundation
func output(_ data: [String: Any]) { print(String(data: try! JSONSerialization.data(withJSONObject:data),encoding:.utf8)! ) }
guard AXIsProcessTrusted() else { output(["error":"Для чтения открытого треда разрешите Пете Универсальный доступ в настройках macOS."]); exit(0) }
guard let app=NSWorkspace.shared.frontmostApplication,app.bundleIdentifier == "com.tinyspeck.slackmacgap" else { output([:]);exit(0) }
let root=AXUIElementCreateApplication(app.processIdentifier)
AXUIElementSetMessagingTimeout(root,0.05)
// Slack is an Electron app: Chromium exposes the page (messages, member lists) to accessibility only after
// AXManualAccessibility is set; without it only the window title is readable. The tree is built asynchronously.
let enabled=AXUIElementSetAttributeValue(root,"AXManualAccessibility" as CFString,kCFBooleanTrue)==.success
func attribute(_ element:AXUIElement,_ key:String)->CFTypeRef? { var value:CFTypeRef?;AXUIElementCopyAttributeValue(element,key as CFString,&value);return value }
guard let window=attribute(root,kAXFocusedWindowAttribute) else { output([:]);exit(0) }
let element=unsafeBitCast(window,to:AXUIElement.self)
var texts=[String](),urls=[String](),urlPositions=[Int]()
func walk(){
 var pending:[(AXUIElement,Int)]=[(element,0)],visited=0,total=0
 texts=[];urls=[];urlPositions=[]
 let deadline=Date().addingTimeInterval(2)
 while !pending.isEmpty && visited<4000 && Date()<deadline && total<50000 {
  let (node,depth)=pending.removeLast();visited+=1
  if (attribute(node,"AXHidden") as? Bool)==true { continue }
  for key in [kAXTitleAttribute,kAXValueAttribute,kAXDescriptionAttribute] { if let text=attribute(node,key) as? String,!text.isEmpty,texts.last != text { texts.append(text);total+=text.count } }
  if let url=attribute(node,kAXURLAttribute) as? URL { urls.append(url.absoluteString);urlPositions.append(texts.count) }
  if depth<45,let children=attribute(node,kAXChildrenAttribute) as? [AXUIElement] { pending.append(contentsOf:children.reversed().map{($0,depth+1)}) }
 }
}
walk()
// The first read after switching accessibility on often sees only the frame: wait for Chromium and read again.
for _ in 0..<4 where enabled && texts.joined().count<400 { Thread.sleep(forTimeInterval:0.5);walk() }
// Start at the thread heading; do not treat the channel's message history as an opened thread.
// --window: return all visible text of the Slack window (e.g. a channel and its member list), not only an open thread.
let wholeWindow=CommandLine.arguments.contains("--window")
let threadStart=texts.firstIndex(where: { ["thread","тред","ветка","обсуждение"].contains($0.lowercased().trimmingCharacters(in:.whitespacesAndNewlines)) })
let marker:Int? = wholeWindow ? (texts.isEmpty ? nil : 0) : threadStart
output(["thread":threadStart != nil,"title":attribute(element,kAXTitleAttribute) as? String ?? "Slack","text":marker.map{Array(texts[$0...]).joined(separator:"\n")} ?? "","urls":marker.map { start in zip(urls,urlPositions).filter{$0.1 >= start}.map{$0.0} } ?? []])
