import Cocoa
import ApplicationServices
func attr(_ e: AXUIElement,_ key: String)->CFTypeRef? {var v:CFTypeRef?; AXUIElementCopyAttributeValue(e,key as CFString,&v); return v}
func str(_ e:AXUIElement,_ key:String)->String { (attr(e,key) as? String) ?? (attr(e,key) as? URL)?.absoluteString ?? "" }
func walk(_ root:AXUIElement)->[AXUIElement] {var out=[AXUIElement]();var queue=[root];var i=0;while i<queue.count && i<10000 {let e=queue[i];i+=1;out.append(e);queue += (attr(e,"AXChildren") as? [AXUIElement]) ?? []};return out}
func label(_ e:AXUIElement)->String {let d=str(e,"AXDescription");return d.isEmpty ? str(e,"AXTitle") : d}
func reply(_ obj:[String:Any])->Never {let data=try! JSONSerialization.data(withJSONObject:obj);print(String(data:data,encoding:.utf8)!);exit(0)}
var attempted=false
func fail(_ message:String)->Never {reply(["error":message,"attempted":attempted])}
func press(_ e:AXUIElement) {if AXUIElementPerformAction(e,kAXPressAction as CFString) != .success {fail("Claude не принял нажатие. Проверьте открытый проект.")}}
let input=Data((readLine() ?? "").utf8)
guard let request=(try? JSONSerialization.jsonObject(with:input)) as? [String:Any] else {fail("Некорректный запрос")}
guard AXIsProcessTrusted() else {fail("Разрешите Пете Универсальный доступ в настройках macOS для отправки в Claude.")}
var running=NSRunningApplication.runningApplications(withBundleIdentifier:"com.anthropic.claudefordesktop").first
if running == nil, let appURL=NSWorkspace.shared.urlForApplication(withBundleIdentifier:"com.anthropic.claudefordesktop") {
  NSWorkspace.shared.openApplication(at:appURL,configuration:NSWorkspace.OpenConfiguration()){app,_ in running=app}
  for _ in 0..<50 {if running != nil {break};CFRunLoopRunInMode(CFRunLoopMode.defaultMode,0.2,true)}
}
guard let running=running else {fail("Не удалось открыть Claude. Проверьте установку приложения.")}
let root=AXUIElementCreateApplication(running.processIdentifier)
AXUIElementSetAttributeValue(root,"AXEnhancedUserInterface" as CFString,kCFBooleanTrue)
func tree()->[AXUIElement]{walk(root)}
func document(_ nodes:[AXUIElement])->String {nodes.filter{str($0,"AXRole")=="AXWebArea"}.map{str($0,"AXURL")}.first{ $0.contains("claude.ai/") } ?? ""}
func waitFor(_ predicate:([AXUIElement])->Bool)->[AXUIElement] {for _ in 0..<60 {let n=tree();if predicate(n){return n};Thread.sleep(forTimeInterval:0.2)};fail("Интерфейс Claude не готов. Отправка не подтверждена; проверьте чат перед повтором.")}
let initial=waitFor{nodes in nodes.contains{str($0,"AXRole")=="AXButton" && label($0)=="Projects"}}
if initial.contains(where:{str($0,"AXRole")=="AXTextArea" && !str($0,"AXValue").trimmingCharacters(in:.whitespacesAndNewlines).isEmpty}){fail("В Claude есть незавершённый текст. Сохраните или отправьте его, затем продолжите передачу.")}
guard let projectsButton=initial.first(where:{str($0,"AXRole")=="AXButton" && label($0)=="Projects"}) else {fail("Не удалось найти каталог проектов Claude.")}
press(projectsButton)
let catalog=waitFor{document($0).hasSuffix("/projects")}
func projectURL(_ e:AXUIElement)->String {let url=str(e,"AXURL");return url.isEmpty ? str(e,"AXValue") : url}
let links=catalog.filter{str($0,"AXRole")=="AXLink" && projectURL($0).contains("claude.ai/cowork/project/")}
if request["action"] as? String == "projects" {reply(["projects":links.map{["id":projectURL($0),"name":label($0),"description":""]}])}
guard let project=request["project"] as? [String:Any],let id=project["id"] as? String,let name=project["name"] as? String,let prompt=request["prompt"] as? String,let marker=request["marker"] as? String,!prompt.isEmpty else {fail("Не указан проект или запрос")}
guard let link=links.first(where:{projectURL($0)==id && label($0)==name}) else {fail("Проект больше не доступен в Claude")}
press(link)
let page=waitFor{nodes in (document(nodes)==id || document(nodes)=="https://"+id) && nodes.contains{str($0,"AXRole")=="AXTextArea" && str($0,"AXPlaceholderValue")=="New session in "+name}}
guard let composer=page.first(where:{str($0,"AXRole")=="AXTextArea" && str($0,"AXPlaceholderValue")=="New session in "+name}) else {fail("Не найден новый чат выбранного проекта; отправка остановлена.")}
if !str(composer,"AXValue").trimmingCharacters(in:.whitespacesAndNewlines).isEmpty {fail("В проекте есть черновик; отправка остановлена.")}
guard AXUIElementSetAttributeValue(composer,kAXValueAttribute as CFString,prompt as CFString) == .success else {fail("Claude не разрешил заполнить запрос")}
let ready=waitFor{nodes in nodes.contains{str($0,"AXRole")=="AXTextArea" && str($0,"AXValue")==prompt} && nodes.contains{label($0)=="Send message" && (attr($0,"AXEnabled") as? Bool)==true}}
guard (document(ready)==id || document(ready)=="https://"+id),let send=ready.first(where:{str($0,"AXRole")=="AXButton" && label($0)=="Send message" && (attr($0,"AXEnabled") as? Bool)==true}) else {fail("Проект изменился перед отправкой")}
attempted=true
press(send)
let sent=waitFor{nodes in document(nodes).contains("claude.ai/chat/") && nodes.contains{str($0,"AXRole")=="AXStaticText" && str($0,"AXValue").contains(marker)}}
reply(["state":"submitted","url":document(sent)])
