[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class PetyaSlackView {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
'@
try {
 $handle=[PetyaSlackView]::GetForegroundWindow(); [uint32]$owner=0
 [void][PetyaSlackView]::GetWindowThreadProcessId($handle,[ref]$owner)
 if ((Get-Process -Id $owner).ProcessName -ne 'slack') { '{}';exit }
 $root=[System.Windows.Automation.AutomationElement]::FromHandle($handle)
 $walker=[System.Windows.Automation.TreeWalker]::ControlViewWalker
 $stack=[System.Collections.Generic.Stack[object]]::new();$stack.Push(@($root,0))
 $texts=[System.Collections.Generic.List[string]]::new();$deadline=[DateTime]::UtcNow.AddSeconds(2);$count=0;$size=0
 while($stack.Count -gt 0 -and $count -lt 1800 -and $size -lt 50000 -and [DateTime]::UtcNow -lt $deadline) {
  $pair=$stack.Pop();$node=$pair[0];$depth=$pair[1];$count++
  if(-not $node.Current.IsOffscreen) { $name=$node.Current.Name;if($name){$texts.Add($name);$size+=$name.Length} }
  if($depth -lt 35){$children=[System.Collections.Generic.List[object]]::new();$child=$walker.GetFirstChild($node);while($null -ne $child -and $children.Count -lt 1000 -and [DateTime]::UtcNow -lt $deadline){$children.Add($child);$child=$walker.GetNextSibling($child)};for($i=$children.Count-1;$i -ge 0;$i--){$stack.Push(@($children[$i],($depth+1)))}}
 }
 $marker=-1;for($i=0;$i -lt $texts.Count;$i++){if($texts[$i].Trim() -match '^(Thread|Тред|Ветка|Обсуждение)$'){$marker=$i;break}}
 $content='';if($marker -ge 0){$content=($texts.GetRange($marker,$texts.Count-$marker) -join "`n")}
 @{thread=($marker -ge 0);title=$root.Current.Name;text=$content;urls=@()} | ConvertTo-Json -Compress
} catch { @{error='Не удалось прочитать видимое обсуждение Slack через UI Automation.'} | ConvertTo-Json -Compress }
