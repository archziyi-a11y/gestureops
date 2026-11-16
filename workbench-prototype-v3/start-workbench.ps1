param([switch]$ServiceOnly, [switch]$Browser)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$url = 'http://127.0.0.1:5185/'
$state = Join-Path $env:LOCALAPPDATA 'YiliWorkbench/spatial-demo'
function Test-Workbench {
    try {
        $response = Invoke-RestMethod ($url + 'api/dock-operations') -TimeoutSec 2
        return $response.ok -eq $true
    } catch { return $false }
}
try {
    if (-not (Test-Workbench)) {
        if (Get-NetTCPConnection -LocalPort 5185 -State Listen -ErrorAction SilentlyContinue) {
            throw 'Port 5185 is occupied by another service. No process was stopped.'
        }
        $node = (Get-Command node -ErrorAction Stop).Source
        New-Item -ItemType Directory -Path $state -Force | Out-Null
        $env:PORT = '5185'
        $env:STATE_DIR = $state
        Start-Process -FilePath $node -ArgumentList 'server.js' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $state 'server.stdout.log') -RedirectStandardError (Join-Path $state 'server.stderr.log')
        $ready = $false
        for ($i = 0; $i -lt 30; $i++) {
            if (Test-Workbench) { $ready = $true; break }
            Start-Sleep -Milliseconds 500
        }
        if (-not $ready) { throw "Startup failed. See logs in $state" }
    }
    if (-not $ServiceOnly) {
        if ($Browser) { Start-Process $url }
        else {
            $electron = Join-Path $root 'desktop/node_modules/electron/dist/electron.exe'
            if (-not (Test-Path $electron)) { throw 'Desktop runtime missing. Run npm ci in the desktop folder, or use -Browser.' }
            Start-Process -FilePath $electron -ArgumentList ('"' + (Join-Path $root 'desktop') + '"') -WorkingDirectory $root
        }
    }
} catch {
    if ($ServiceOnly) { Write-Error $_.Exception.Message; exit 1 }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Workbench startup') | Out-Null
    exit 1
}
