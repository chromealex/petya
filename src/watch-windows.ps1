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
$petyaRows = @([PetyaWindows]::Titles() | ForEach-Object { @{ title = $_ } })
@{ zoomOpen = [bool](Get-Process Zoom -ErrorAction SilentlyContinue); slackOpen = [bool](Get-Process slack -ErrorAction SilentlyContinue); permission = $true; windows = $petyaRows } | ConvertTo-Json -Compress -Depth 4
