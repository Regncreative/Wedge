# Prints, for each point in -Points ("x,y;x,y;…", physical screen pixels),
# the process id of the window a click there would reach (0 if none) and
# that window's style bits. Reads only; moves nothing.
param([Parameter(Mandatory = $true)][string]$Points)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class StashHit {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int index);
  public static string At(int x, int y) {
    // The top-level window: the web view's own windows belong to WebView2.
    var h = GetAncestor(WindowFromPoint(new POINT { X = x, Y = y }), 2);
    if (h == IntPtr.Zero) return "0 0";
    uint pid; GetWindowThreadProcessId(h, out pid);
    return pid + " " + (uint)GetWindowLong(h, -16);
  }
}
"@
[StashHit]::SetProcessDPIAware() | Out-Null
foreach ($point in $Points.Split(';')) {
  $x, $y = $point.Split(',') | ForEach-Object { [int]$_ }
  [StashHit]::At($x, $y)
}
