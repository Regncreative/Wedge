# Performs a real Windows (OLE) file drag-and-drop with synthetic mouse input:
# a tiny source window starts DoDragDrop with -File, the cursor moves to
# (-ToX, -ToY) in physical screen pixels, and the button is released there.
# Prints the drop effect reported to the source ("Copy", "None", ...).
# This moves the real cursor; used by tests that opt in with STASH_REAL_INPUT=1.
param(
  [Parameter(Mandatory = $true)][string]$File,
  [Parameter(Mandatory = $true)][int]$ToX,
  [Parameter(Mandatory = $true)][int]$ToY,
  # Only release over a window of this process; otherwise cancel the drag
  # (Esc) so nothing is ever dropped on Explorer or another app.
  [Parameter(Mandatory = $true)][int]$TargetPid,
  # Where the drag starts (default: 260 px left of the target, clamped on screen).
  [int]$FromX = -1,
  [int]$FromY = -1
)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class StashInput {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  public static IntPtr TopAt(int x, int y) { var p = new POINT { X = x, Y = y }; return GetAncestor(WindowFromPoint(p), 2); }
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static uint PidAt(int x, int y) { uint pid; GetWindowThreadProcessId(TopAt(x, y), out pid); return pid; }
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, System.Text.StringBuilder s, int n);
  public static string ClassAt(int x, int y) { var b = new System.Text.StringBuilder(128); GetClassName(TopAt(x, y), b, 128); return b.ToString(); }
  public static void Escape() { keybd_event(0x1B, 0, 0, UIntPtr.Zero); keybd_event(0x1B, 0, 2, UIntPtr.Zero); }
  public static void Move(int x, int y) { SetCursorPos(x, y); mouse_event(0x0001, 0, 0, 0, UIntPtr.Zero); }
  public static void Down() { mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero); }
  public static void Up() { mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero); }
}
"@
[void][StashInput]::SetProcessDPIAware()

$fromX = if ($FromX -ge 0) { $FromX } else { [Math]::Max(40, $ToX - 260) }
$fromY = if ($FromY -ge 0) { $FromY } else { $ToY }
$form = New-Object System.Windows.Forms.Form
$form.StartPosition = 'Manual'
$form.Location = New-Object System.Drawing.Point(($fromX - 30), ($fromY - 30))
$form.Size = New-Object System.Drawing.Size(60, 60)
$form.FormBorderStyle = 'None'
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.BackColor = [System.Drawing.Color]::DodgerBlue

$data = New-Object System.Windows.Forms.DataObject
$list = New-Object System.Collections.Specialized.StringCollection
[void]$list.Add((Resolve-Path $File).Path)
$data.SetFileDropList($list)

$script:effect = 'NotStarted'
$result = [hashtable]::Synchronized(@{})
$shown = New-Object System.Threading.ManualResetEvent($false)
$form.Add_Shown({ [void]$shown.Set() })
$form.Add_MouseDown({
  # Copy only: even a misplaced drop could never move the file.
  $script:effect = $form.DoDragDrop($data, [System.Windows.Forms.DragDropEffects]::Copy)
  $form.Close()
})

# Drive the mouse from another thread while DoDragDrop runs its modal loop.
# The button is only pressed once the window under the cursor is our own
# source form, so a slow start can never drag something else (a desktop icon).
$driver = [powershell]::Create()
[void]$driver.AddScript({
  param($fx, $fy, $tx, $ty, $targetPid, $result, $shown, $formHandle)
  if (-not $shown.WaitOne(5000)) { return }
  [StashInput]::Move($fx, $fy)
  $ready = $false
  for ($k = 0; $k -lt 50 -and -not $ready; $k++) {
    Start-Sleep -Milliseconds 100
    $ready = [StashInput]::TopAt($fx, $fy) -eq $formHandle
  }
  if (-not $ready) { $result['blocked'] = [StashInput]::ClassAt($fx, $fy); return }
  Start-Sleep -Milliseconds 100
  [StashInput]::Down()
  Start-Sleep -Milliseconds 150
  for ($i = 1; $i -le 40; $i++) {
    [StashInput]::Move([int]($fx + ($tx - $fx) * $i / 40), [int]($fy + ($ty - $fy) * $i / 40))
    Start-Sleep -Milliseconds 20
  }
  # Hover a moment so the target sees DragEnter/DragOver.
  for ($j = 0; $j -lt 10; $j++) { [StashInput]::Move($tx, $ty + ($j % 2)); Start-Sleep -Milliseconds 40 }
  $at = [StashInput]::PidAt($tx, $ty)
  if ($at -ne $targetPid) {
    $result['wrongTarget'] = $at
    [StashInput]::Escape()
    Start-Sleep -Milliseconds 100
  }
  [StashInput]::Up()
}).AddArgument($fromX).AddArgument($fromY).AddArgument($ToX).AddArgument($ToY).AddArgument($TargetPid).AddArgument($result).AddArgument($shown)
$form.Add_HandleCreated({
  [void]$driver.AddArgument($form.Handle)
  $script:async = $driver.BeginInvoke()
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 8000
$timer.Add_Tick({ $form.Close() })
$timer.Start()
[void]$form.ShowDialog()
$driver.EndInvoke($script:async) | Out-Null
if ($result.ContainsKey('blocked')) { Write-Output "Blocked($($result['blocked']))" } elseif ($result.ContainsKey('wrongTarget')) { Write-Output "WrongTarget(pid $($result['wrongTarget']))" } else { Write-Output $script:effect }
