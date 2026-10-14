# Drags with the real mouse from (-FromX, -FromY) to (-ToX, -ToY), physical
# screen pixels. Both points must be over a window of -TargetPid, so nothing
# outside the app under test is ever dragged or dropped on. Prints "Done" or
# why it refused. Used by tests that opt in with STASH_REAL_INPUT=1.
param(
  [Parameter(Mandatory = $true)][int]$FromX,
  [Parameter(Mandatory = $true)][int]$FromY,
  [Parameter(Mandatory = $true)][int]$ToX,
  [Parameter(Mandatory = $true)][int]$ToY,
  [Parameter(Mandatory = $true)][int]$TargetPid
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class StashMouse {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static uint PidAt(int x, int y) {
    var p = new POINT { X = x, Y = y };
    uint pid; GetWindowThreadProcessId(GetAncestor(WindowFromPoint(p), 2), out pid); return pid;
  }
  public static void Move(int x, int y) { SetCursorPos(x, y); mouse_event(0x0001, 0, 0, 0, UIntPtr.Zero); }
}
"@
[void][StashMouse]::SetProcessDPIAware()

if ([StashMouse]::PidAt($FromX, $FromY) -ne $TargetPid) { Write-Output 'Refused(start)'; exit }
if ([StashMouse]::PidAt($ToX, $ToY) -ne $TargetPid) { Write-Output 'Refused(end)'; exit }

[StashMouse]::Move($FromX, $FromY)
Start-Sleep -Milliseconds 150
[StashMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 120
for ($i = 1; $i -le 30; $i++) {
  [StashMouse]::Move([int]($FromX + ($ToX - $FromX) * $i / 30), [int]($FromY + ($ToY - $FromY) * $i / 30))
  Start-Sleep -Milliseconds 20
}
for ($j = 0; $j -lt 8; $j++) { [StashMouse]::Move($ToX, $ToY + ($j % 2)); Start-Sleep -Milliseconds 40 }
if ([StashMouse]::PidAt($ToX, $ToY) -ne $TargetPid) {
  # Cancel (Esc) rather than drop somewhere else.
  [StashMouse]::keybd_event(0x1B, 0, 0, [UIntPtr]::Zero)
  [StashMouse]::keybd_event(0x1B, 0, 2, [UIntPtr]::Zero)
}
[StashMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
Write-Output 'Done'
