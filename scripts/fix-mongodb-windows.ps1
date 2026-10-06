# One-time fix for the local MongoDB service on a low-memory Windows PC.
# Run from an *Administrator* PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts\fix-mongodb-windows.ps1
#
# Why: mongod crashed with "out of memory" (see mongod.log). On a ~8 GB
# machine its default cache can claim ~3.3 GB, and Windows does not restart
# the service after a crash, so the app silently loses its database.

$ErrorActionPreference = "Stop"
$cfg = "C:\Program Files\MongoDB\Server\8.3\bin\mongod.cfg"

# 1. Cap the WiredTiger cache at 1 GB (plenty for this app's data).
$text = Get-Content $cfg -Raw
if ($text -notmatch "cacheSizeGB") {
    Copy-Item $cfg "$cfg.bak" -Force
    $text = $text -replace "(?m)^(  dbPath: .*)$", "`$1`r`n  wiredTiger:`r`n    engineConfig:`r`n      cacheSizeGB: 1"
    Set-Content -Path $cfg -Value $text -Encoding ascii
    Write-Host "Capped MongoDB cache at 1 GB (backup: mongod.cfg.bak)"
} else {
    Write-Host "Cache cap already present - skipped"
}

# 2. Restart the service automatically if it ever crashes again.
sc.exe failure MongoDB reset= 86400 actions= restart/5000/restart/5000/restart/30000 | Out-Null
Write-Host "Service will now auto-restart after a crash"

# 3. Start it.
Start-Service MongoDB
Start-Sleep -Seconds 3
Write-Host "MongoDB status: $((Get-Service MongoDB).Status)"
