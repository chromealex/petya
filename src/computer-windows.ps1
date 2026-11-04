param([string]$Payload)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$a=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
if($a.type -eq 'apps') { $rows=@(Get-Process | Where-Object {$_.MainWindowHandle -ne 0} | ForEach-Object {@{pid=$_.Id;name=$_.ProcessName;identity=$_.Path}}); ConvertTo-Json -InputObject $rows -Compress; exit }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class PetyaInput {
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint flag);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void keybd_event(byte v,byte s,uint f,UIntPtr e);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);
}
'@
try{[void][PetyaInput]::SetProcessDpiAwarenessContext([IntPtr](-4))}catch{}
Add-Type -AssemblyName System.Windows.Forms
if($a.mode -eq 'app' -or $a.type -eq 'focus' -or $a.type -eq 'search') {
$p=Get-Process -Id $a.pid
if($p.Path -ne $a.identity){throw 'Приложение изменилось'}
if($p.MainWindowHandle -eq 0) {throw 'Приложение закрыто'}
[void][PetyaInput]::SetForegroundWindow($p.MainWindowHandle)
Start-Sleep -Milliseconds 200
if([PetyaInput]::GetForegroundWindow() -ne $p.MainWindowHandle){throw 'Не удалось активировать приложение'}
}
function Show-PetyaVisual($data){if($a.visual){[Console]::Error.WriteLine('PETYA_CONTROL:'+(ConvertTo-Json -InputObject $data -Depth 5 -Compress))}}
if($a.visual){
 try{
  $pointer=New-Object PetyaInput+POINT
  [void][PetyaInput]::GetCursorPos([ref]$pointer)
  if($a.type -eq 'click' -or $a.type -eq 'drag'){$pointer.X=$a.x;$pointer.Y=$a.y}
  $hwnd=[PetyaInput]::GetForegroundWindow()
  if($a.type -eq 'click' -or $a.type -eq 'drag' -or $a.type -eq 'scroll'){$hwnd=[PetyaInput]::GetAncestor([PetyaInput]::WindowFromPoint($pointer),2)}
  $bounds=New-Object PetyaInput+RECT
  $data=@{pointer=@{x=$pointer.X;y=$pointer.Y}}
  if([PetyaInput]::GetWindowRect($hwnd,[ref]$bounds)){
   [uint32]$ownerId=0;[void][PetyaInput]::GetWindowThreadProcessId($hwnd,[ref]$ownerId)
   $ownerName=(Get-Process -Id $ownerId).ProcessName
   $data.window=@{x=$bounds.Left;y=$bounds.Top;width=$bounds.Right-$bounds.Left;height=$bounds.Bottom-$bounds.Top;name=$ownerName}
  }
  Show-PetyaVisual $data
  Start-Sleep -Milliseconds 140
 }catch{}
}
if($a.type -eq 'search') {
 if($a.service -ne 'telegram' -or $p.Path -notmatch '[\\/]Telegram\.exe$'){throw 'Неизвестное приложение поиска'}
 Add-Type -AssemblyName UIAutomationClient
 Add-Type -AssemblyName UIAutomationTypes
 $root=[System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
 $scope=[System.Windows.Automation.TreeScope]::Descendants
 $condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit)
 $fields=@($root.FindAll($scope,$condition) | Where-Object {($_.Current.Name+' '+$_.Current.AutomationId) -match '(?i)search|поиск|найти'})
 if($fields.Count -ne 1){throw 'Не удалось однозначно найти поле поиска Telegram. Откройте основной список чатов и включите доступность интерфейса Telegram.'}
 $field=$fields[0];$field.SetFocus()
 if(!$field.Current.HasKeyboardFocus){throw 'Не удалось сфокусировать поле поиска'}
 $pattern=$field.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
 if($a.visual){$fieldBounds=$field.Current.BoundingRectangle;Show-PetyaVisual @{pointer=@{x=$fieldBounds.X+[Math]::Min(20,$fieldBounds.Width/2);y=$fieldBounds.Y+$fieldBounds.Height/2}}}
 $pattern.SetValue([string]$a.query)
 if($pattern.Current.Value -ne $a.query){throw 'Telegram не подтвердил введённый запрос'}
 $last='';$result=@{}
 for($round=0;$round -lt 4;$round++){
  Start-Sleep -Milliseconds 500
  if($a.visual){$r=$root.Current.BoundingRectangle;Show-PetyaVisual @{window=@{x=$r.X;y=$r.Y;width=$r.Width;height=$r.Height;name=$p.ProcessName}}}
  if([PetyaInput]::GetForegroundWindow() -ne $p.MainWindowHandle){throw 'Активное приложение изменилось во время поиска'}
  $walker=[System.Windows.Automation.TreeWalker]::ControlViewWalker
  $parent=$walker.GetParent($field);$resultRoot=$null
  while($null -ne $parent){
   $lists=@($parent.FindAll($scope,[System.Windows.Automation.Condition]::TrueCondition) | Where-Object {$_.Current.ControlType -eq [System.Windows.Automation.ControlType]::List -or $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::DataGrid -or $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Tree})
   if($lists.Count -eq 1){$resultRoot=$lists[0];break}
   if($lists.Count -gt 1 -or $parent.Current.ControlType -eq [System.Windows.Automation.ControlType]::Window){break}
   $parent=$walker.GetParent($parent)
  }
  if($null -eq $resultRoot){$result=@{results=@();empty=$false;message='Не удалось отличить список результатов от других областей окна Telegram.'};break}
  $all=$resultRoot.FindAll($scope,[System.Windows.Automation.Condition]::TrueCondition)
  $rows=@();$empty=$false
  foreach($element in $all){
   $name=$element.Current.Name
   if($element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Text -and $name -match '^(?i:no results(?: found)?|nothing found|no contacts found|ничего не найдено|нет результатов|контакты не найдены)[.!]?$'){$empty=$true}
   if($element.Current.ControlType -eq [System.Windows.Automation.ControlType]::ListItem -or $element.Current.ControlType -eq [System.Windows.Automation.ControlType]::DataItem){
    $labels=@($name)+@($element.FindAll($scope,[System.Windows.Automation.Condition]::TrueCondition) | ForEach-Object {$_.Current.Name})
    $text=(@($labels | Where-Object {$_} | Select-Object -Unique) -join ' · ')
    if($text){$rows+=@{text=$text.Substring(0,[Math]::Min(500,$text.Length))}}
   }
   if($rows.Count -ge 40){break}
  }
  $result=@{results=@($rows);empty=$empty};$current=ConvertTo-Json -InputObject $result -Depth 5 -Compress
  if($round -ge 2 -and $current -eq $last){break};$last=$current
 }
 if(!$result.results.Count -and !$result.empty){$result.message='Telegram не раскрыл строки результатов через интерфейс доступности.'}
 ConvertTo-Json -InputObject $result -Depth 5 -Compress;exit
}
if($a.type -eq 'text') {
 $literal=[regex]::Replace([string]$a.text,'[+^%~(){}\[\]]',{param($m) '{'+$m.Value+'}'})
 [System.Windows.Forms.SendKeys]::SendWait($literal)
}
if($a.type -eq 'key') {
 $keys=@{enter='{ENTER}';tab='{TAB}';escape='{ESC}';backspace='{BACKSPACE}';up='{UP}';down='{DOWN}';left='{LEFT}';right='{RIGHT}';delete='{DELETE}';home='{HOME}';end='{END}';pageup='{PGUP}';pagedown='{PGDN}';space=' ';cut='^x';undo='^z';redo='^y';copy='^c';paste='^v';selectAll='^a';save='^s'}
 if(!$keys.ContainsKey([string]$a.key)){throw 'Неизвестная клавиша'}
 [System.Windows.Forms.SendKeys]::SendWait($keys[[string]$a.key])
}

if($a.type -eq 'hotkey') {
 $special=@{enter='ENTER';tab='TAB';escape='ESC';backspace='BACKSPACE';delete='DELETE';home='HOME';end='END';pageup='PGUP';pagedown='PGDN';up='UP';down='DOWN';left='LEFT';right='RIGHT'}
 $key=[string]$a.key
 if($special.ContainsKey($key)){$key='{'+$special[$key]+'}'} elseif($key -match '^f([1-9]|1[0-2])$'){$key='{'+$key.ToUpper()+'}'} elseif($key -eq 'space'){$key=' '}
 $prefix='';if($a.modifiers -contains 'ctrl'){$prefix+='^'};if($a.modifiers -contains 'alt'){$prefix+='%'};if($a.modifiers -contains 'shift'){$prefix+='+'}
 $meta=$a.modifiers -contains 'meta'
 try {if($meta){[PetyaInput]::keybd_event(0x5B,0,0,[UIntPtr]::Zero)};[System.Windows.Forms.SendKeys]::SendWait($prefix+$key)}
 finally {if($meta){[PetyaInput]::keybd_event(0x5B,0,2,[UIntPtr]::Zero)}}
}
if($a.type -eq 'scroll') {
 $delta=[int]$a.amount*120
 if($a.direction -eq 'down' -or $a.direction -eq 'left'){$delta=-$delta}
 $flag=2048;if($a.direction -eq 'left' -or $a.direction -eq 'right'){$flag=4096}
 $bits=[BitConverter]::ToUInt32([BitConverter]::GetBytes($delta),0)
 [PetyaInput]::mouse_event($flag,0,0,$bits,[UIntPtr]::Zero)
}
if($a.type -eq 'click' -or $a.type -eq 'drag') {
 if($a.mode -ne 'desktop'){throw 'Нет доступа к рабочему столу'}
 if(![PetyaInput]::SetCursorPos($a.x,$a.y)){throw 'Не удалось переместить курсор'}
 if($a.type -eq 'click'){
  $down=2;$up=4;if($a.button -eq 'right'){$down=8;$up=16}
  $count=1;if($a.count -eq 2){$count=2}
  for($i=0;$i -lt $count;$i++){[PetyaInput]::mouse_event($down,0,0,0,[UIntPtr]::Zero);[PetyaInput]::mouse_event($up,0,0,0,[UIntPtr]::Zero);if($i -eq 0 -and $count -eq 2){Start-Sleep -Milliseconds 60}}
 } else {
  [PetyaInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
  try {for($i=1;$i -le 12;$i++){Show-PetyaVisual @{pointer=@{x=$a.x+($a.toX-$a.x)*$i/12;y=$a.y+($a.toY-$a.y)*$i/12}};[void][PetyaInput]::SetCursorPos([int]($a.x+($a.toX-$a.x)*$i/12),[int]($a.y+($a.toY-$a.y)*$i/12));Start-Sleep -Milliseconds 20}}
  finally {[PetyaInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}
 }
}
if($a.type -eq 'release'){[PetyaInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero);[PetyaInput]::keybd_event(0x5B,0,2,[UIntPtr]::Zero)}
'{"ok":true}'
