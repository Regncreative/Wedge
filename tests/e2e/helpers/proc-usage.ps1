# Prints, as JSON, what a process and everything it started (WebView2's
# browser, renderer and GPU processes) use right now: memory and the CPU
# time spent so far. Reads only.
param([Parameter(Mandatory = $true)][int]$RootPid)

$all = Get-CimInstance Win32_Process |
  Select-Object ProcessId, ParentProcessId, Name, WorkingSetSize, PrivatePageCount, KernelModeTime, UserModeTime
$ids = @{ $RootPid = $true }
do {
  $added = $false
  foreach ($p in $all) {
    if ($ids.ContainsKey([int]$p.ParentProcessId) -and -not $ids.ContainsKey([int]$p.ProcessId)) {
      $ids[[int]$p.ProcessId] = $true
      $added = $true
    }
  }
} while ($added)
$mine = @($all | Where-Object { $ids.ContainsKey([int]$_.ProcessId) })
$root = $mine | Where-Object { [int]$_.ProcessId -eq $RootPid }
$sum = { param($prop) ($mine | Measure-Object -Property $prop -Sum).Sum }

[pscustomobject]@{
  processes    = $mine.Count
  workingSetMB = [math]::Round((& $sum WorkingSetSize) / 1MB, 1)
  privateMB    = [math]::Round((& $sum PrivatePageCount) / 1MB, 1)
  mainPrivateMB = [math]::Round($root.PrivatePageCount / 1MB, 1)
  # Kernel and user time are in 100 ns units.
  cpuMs        = [math]::Round(((& $sum KernelModeTime) + (& $sum UserModeTime)) / 10000)
  each         = @($mine | ForEach-Object {
      [pscustomobject]@{
        pid       = [int]$_.ProcessId
        name      = $_.Name
        privateMB = [math]::Round($_.PrivatePageCount / 1MB, 1)
        cpuMs     = [math]::Round(($_.KernelModeTime + $_.UserModeTime) / 10000)
      }
    })
} | ConvertTo-Json -Compress -Depth 3
