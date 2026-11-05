param([switch]$MeetingLink)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public class PetyaWindows {
  delegate bool Callback(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(Callback cb, IntPtr p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static string[] Titles() {
    var result = new List<string>();
    EnumWindows((h,p) => { uint pid; GetWindowThreadProcessId(h, out pid);
      try { if (Process.GetProcessById((int)pid).ProcessName.Equals("Zoom", StringComparison.OrdinalIgnoreCase)) {
        var s = new StringBuilder(2048); GetWindowText(h, s, s.Capacity); if(s.Length > 0) result.Add(s.ToString());
      }} catch {} return true;
    }, IntPtr.Zero); return result.ToArray();
  }
}
'@
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$petyaActive = $false
$petyaInfo = [System.Collections.Generic.List[string]]::new()
$petyaRoot = [System.Windows.Automation.AutomationElement]::RootElement
foreach ($petyaProcess in @(Get-Process Zoom -ErrorAction SilentlyContinue)) {
  $petyaCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $petyaProcess.Id)
  $petyaWindows = $petyaRoot.FindAll([System.Windows.Automation.TreeScope]::Children, $petyaCondition)
  foreach ($petyaWindow in $petyaWindows) {
    $petyaNodes = @($petyaWindow.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition))
    $petyaLeave = @($petyaNodes | Where-Object { $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $_.Current.Name -match '^(Leave|End|Leave Meeting|End Meeting|Выйти из конференции|Завершить конференцию)$' })
    if (!$petyaLeave.Count) { continue }
    $petyaActive = $true
    if (!$MeetingLink) { continue }
    $petyaInfoButton = @($petyaNodes | Where-Object { $_.Current.Name -match '^(Meeting Information|Meeting Info|Информация о конференции|Сведения о конференции)$' })
    if ($petyaInfoButton.Count -eq 1) {
      $petyaPattern = $null
      if ($petyaInfoButton[0].TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$petyaPattern)) { $petyaPattern.Invoke() }
      $petyaNodes = @($petyaWindow.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition))
    }
    for ($petyaIndex = 0; $petyaIndex -lt $petyaNodes.Count; $petyaIndex++) {
      $petyaText = $petyaNodes[$petyaIndex].Current.Name
      if ($petyaText -match '^(Meeting ID|Passcode|Invite Link|Join Link|Идентификатор конференции|Код доступа|Пароль конференции|Ссылка приглашения)') {
        $petyaInfo.Add($petyaText)
        if ($petyaIndex + 1 -lt $petyaNodes.Count) { $petyaInfo.Add($petyaNodes[$petyaIndex + 1].Current.Name) }
      }
    }
  }
}
$petyaRows = @([PetyaWindows]::Titles() | ForEach-Object { @{ title = $_ } })
@{ meetingActive = $petyaActive; meetingInfo = ($petyaInfo -join "`n"); zoomOpen = [bool](Get-Process Zoom -ErrorAction SilentlyContinue); slackOpen = [bool](Get-Process slack -ErrorAction SilentlyContinue); permission = $true; windows = $petyaRows } | ConvertTo-Json -Compress -Depth 4
