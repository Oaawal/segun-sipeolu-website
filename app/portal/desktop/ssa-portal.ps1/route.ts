import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * "SOS&A Portal for Windows": one PowerShell script (works with the
 * PowerShell 5.1 built into Windows 10 and 11, nothing to install).
 *
 *   Right-click the downloaded file → Run with PowerShell   (first-time setup)
 *
 * Setup asks for a personal connection code, stores it encrypted for this
 * Windows user only (DPAPI), and adds:
 *   - "Send to → SOS&A Portal" on every file's right-click menu;
 *   - a "Portal Inbox" folder in Documents. Files dropped in it upload by
 *     themselves; a subfolder named after a matter number (e.g.
 *     SSA-LIT-2026-0001) files straight onto that matter.
 * The script contains no secrets; it is built with this portal's address.
 */
const SCRIPT = String.raw`<#
  SOS&A Portal for Windows - Segun Sipeolu & Associates
  First time: right-click this file and choose "Run with PowerShell".
  Afterwards: right-click any file > Send to > SOS&A Portal,
  or drop files into Documents\Portal Inbox.
#>
param(
  [switch]$Setup,
  [switch]$Watch,
  [switch]$Uninstall,
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$Files
)
$ErrorActionPreference = 'Stop'
$nl = [Environment]::NewLine
$Portal   = '__PORTAL__'
$AppDir   = Join-Path $env:APPDATA 'SOSA Portal'
$CodeFile = Join-Path $AppDir 'connection.dat'
$Self     = Join-Path $AppDir 'ssa-portal.ps1'
$LogFile  = Join-Path $AppDir 'activity.log'
$InboxDir = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Portal Inbox'
$DoneDir  = Join-Path $InboxDir 'Uploaded'
$FailDir  = Join-Path $InboxDir 'Not uploaded'
$SendTo   = Join-Path ([Environment]::GetFolderPath('SendTo')) 'SOS&A Portal.lnk'
$Startup  = Join-Path ([Environment]::GetFolderPath('Startup')) 'SOS&A Portal Inbox.lnk'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Net.Http, System.Windows.Forms, Microsoft.VisualBasic

function Log([string]$m) { New-Item -ItemType Directory -Force $AppDir | Out-Null; Add-Content $LogFile ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $m) }
function Say([string]$m, [string]$icon = 'Information') { [void][Windows.Forms.MessageBox]::Show($m, 'SOS&A Portal', 'OK', $icon) }

function Get-Code {
  if (-not (Test-Path $CodeFile)) { throw 'This computer is not connected yet. Right-click ssa-portal.ps1 and choose Run with PowerShell.' }
  $s = Get-Content $CodeFile | ConvertTo-SecureString
  [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}

function New-Client([string]$code) {
  $c = New-Object Net.Http.HttpClient
  $c.Timeout = [TimeSpan]::FromMinutes(15)
  $c.DefaultRequestHeaders.Authorization = New-Object Net.Http.Headers.AuthenticationHeaderValue('Bearer', $code)
  return $c
}

function Send-File($client, [string]$path, [string]$matter, [string]$source) {
  $content = New-Object Net.Http.MultipartFormDataContent
  $stream = [IO.File]::OpenRead($path)
  try {
    $file = New-Object Net.Http.StreamContent($stream)
    $file.Headers.ContentType = New-Object Net.Http.Headers.MediaTypeHeaderValue('application/octet-stream')
    $content.Add($file, 'file', [IO.Path]::GetFileName($path))
    if ($matter) { $content.Add((New-Object Net.Http.StringContent($matter)), 'matter') }
    $content.Add((New-Object Net.Http.StringContent($source)), 'source')
    $resp = $client.PostAsync("$Portal/portal/api/desktop/upload", $content).GetAwaiter().GetResult()
    $text = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $body = $null
    try { $body = $text | ConvertFrom-Json } catch { }
    if (-not $resp.IsSuccessStatusCode) { if ($body -and $body.error) { throw $body.error } else { throw "The portal answered $([int]$resp.StatusCode)." } }
    if ($body.results[0].error) { throw $body.results[0].error }
    return $body.results[0]
  } finally { $stream.Dispose(); $content.Dispose() }
}

function New-Shortcut([string]$at, [string]$arguments) {
  $sh = New-Object -ComObject WScript.Shell
  $l = $sh.CreateShortcut($at)
  $l.TargetPath = Join-Path $PSHOME 'powershell.exe'
  $l.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$Self"" $arguments"
  $l.WindowStyle = 7
  $l.Description = 'Save files to the SOS&A Practice Portal'
  $l.Save()
}

function Do-Setup {
  Write-Host ''
  Write-Host '  SOS&A Portal for Windows' -ForegroundColor Yellow
  Write-Host "  Portal: $Portal"
  Write-Host ''
  Write-Host '  In the portal, open Account > Connection codes, create one, and paste it here.'
  $secure = Read-Host '  Connection code' -AsSecureString
  $code = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  $client = New-Client $code.Trim()
  $resp = $client.GetAsync("$Portal/portal/api/word/me").GetAwaiter().GetResult()
  if (-not $resp.IsSuccessStatusCode) { Say 'That connection code was not accepted. Create a new one on your Account page and run setup again.' 'Error'; exit 1 }
  $me = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json

  New-Item -ItemType Directory -Force $AppDir, $InboxDir, $DoneDir | Out-Null
  # Stored encrypted with Windows (DPAPI): only this Windows user on this computer can read it
  ConvertTo-SecureString $code.Trim() -AsPlainText -Force | ConvertFrom-SecureString | Set-Content $CodeFile
  if ($PSCommandPath -ne $Self) { Copy-Item $PSCommandPath $Self -Force }
  Unblock-File $Self -ErrorAction SilentlyContinue
  Set-Content (Join-Path $InboxDir 'READ ME.txt') @"
SOS&A Portal Inbox

Files you put in this folder are uploaded to your inbox in the portal, then
moved into the "Uploaded" folder. File them to a matter from the portal.

To send files straight to a matter, make a folder here named after the
matter number, using dashes instead of slashes, e.g.

    SSA-LIT-2026-0001

Anything put in that folder goes onto that matter.
Files that cannot be uploaded go to "Not uploaded", with the reason.
"@
  New-Shortcut $SendTo ''
  New-Shortcut $Startup '-Watch'
  Start-Process (Join-Path $PSHOME 'powershell.exe') -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$Self"" -Watch" -WindowStyle Hidden
  Log "Set up for $($me.email)"
  Say ("Connected as {0}.$($nl)$($nl)Right-click any file > Send to > SOS&A Portal, or drop files into Documents\Portal Inbox." -f $me.name)
}

function Do-Send([string[]]$paths) {
  $code = Get-Code
  $client = New-Client $code
  $matter = [Microsoft.VisualBasic.Interaction]::InputBox("Matter or suit number to file these on (e.g. SSA/LIT/2026/0001).$($nl)$($nl)Leave empty to save to your portal inbox.", 'SOS&A Portal', '')
  $all = @()
  foreach ($p in $paths) {
    if (Test-Path $p -PathType Container) { $all += Get-ChildItem $p -File -Recurse | ForEach-Object { $_.FullName } } else { $all += $p }
  }
  $ok = 0; $bad = @()
  foreach ($f in $all) {
    try { $r = Send-File $client $f $matter.Trim() 'windows'; $ok++; Log "Sent $f" }
    catch { $bad += ('{0}: {1}' -f [IO.Path]::GetFileName($f), $_.Exception.Message); Log "Failed $f : $($_.Exception.Message)" }
  }
  $where = if ($matter.Trim()) { "matter $($matter.Trim())" } else { 'your portal inbox' }
  $msg = "$ok of $($all.Count) file(s) saved to $where."
  if ($bad.Count) { Say ("$msg$($nl)$($nl)Not saved:$($nl)" + ($bad -join "$($nl)")) 'Warning' } else { Say $msg }
}

function Do-Watch {
  $mutex = New-Object Threading.Mutex($false, 'Global\SOSAPortalInboxWatcher')
  if (-not $mutex.WaitOne(0)) { exit 0 }  # already running
  Log 'Watching the Portal Inbox folder'
  while ($true) {
    try {
      $code = Get-Code
      $client = New-Client $code
      New-Item -ItemType Directory -Force $InboxDir, $DoneDir | Out-Null
      $files = Get-ChildItem $InboxDir -File -Recurse | Where-Object {
        $_.FullName -notlike "$DoneDir*" -and $_.FullName -notlike "$FailDir*" -and $_.Name -ne 'READ ME.txt' -and
        $_.Name -notlike '~$*' -and $_.Extension -notin '.tmp', '.crdownload', '.partial' -and $_.LastWriteTime -lt (Get-Date).AddSeconds(-5)
      }
      foreach ($f in $files) {
        try { $h = [IO.File]::Open($f.FullName, 'Open', 'Read', 'None'); $h.Dispose() } catch { continue }  # still being written
        $rel = $f.FullName.Substring($InboxDir.Length).TrimStart('\')
        $matter = if ($rel.Contains('\')) { $rel.Split('\')[0].Replace('-', '/') } else { '' }
        try {
          Send-File $client $f.FullName $matter 'folder' | Out-Null
          $dest = Join-Path $DoneDir (Get-Date -Format 'yyyy-MM-dd')
          New-Item -ItemType Directory -Force $dest | Out-Null
          Move-Item $f.FullName (Join-Path $dest ("{0:HHmmss} {1}" -f (Get-Date), $f.Name)) -Force
          Log "Uploaded $rel"
        } catch {
          New-Item -ItemType Directory -Force $FailDir | Out-Null
          $target = Join-Path $FailDir $f.Name
          Move-Item $f.FullName $target -Force
          Set-Content "$target.reason.txt" $_.Exception.Message
          Log "Not uploaded $rel : $($_.Exception.Message)"
        }
      }
      $client.Dispose()
    } catch { Log "Waiting: $($_.Exception.Message)" }
    Start-Sleep -Seconds 10
  }
}

function Do-Uninstall {
  Remove-Item $SendTo, $Startup, $CodeFile -Force -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*ssa-portal.ps1*-Watch*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Log 'Removed from this computer'
  Say 'SOS&A Portal has been removed from this computer. Your Portal Inbox folder was left in place.'
}

try {
  if ($Uninstall) { Do-Uninstall }
  elseif ($Watch) { Do-Watch }
  elseif ($Files -and $Files.Count) { Do-Send $Files }
  else { Do-Setup }
} catch {
  Log "Error: $($_.Exception.Message)"
  Say $_.Exception.Message 'Error'
  exit 1
}
`;

export function GET(req: NextRequest) {
  const origin = (process.env.PORTAL_URL || req.nextUrl.origin).replace(/\/$/, "");
  // Windows PowerShell 5.1 reads scripts as the system code page unless there is a BOM; keep it plain ASCII with CRLF
  const body = SCRIPT.replace("__PORTAL__", origin.replace(/'/g, "''")).replace(/\r?\n/g, "\r\n");
  return new NextResponse(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": 'attachment; filename="ssa-portal.ps1"', "Cache-Control": "no-store" },
  });
}
