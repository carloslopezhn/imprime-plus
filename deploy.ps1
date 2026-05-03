# ============================================
# Imprime+ -- Build, Sign & Deploy to VPS
# Run from project root: .\deploy.ps1
# Optional: .\deploy.ps1 -BumpType minor   (patch por defecto)
# ============================================

param([string]$BumpType = "patch")   # patch | minor | major

$ErrorActionPreference = "Stop"

# Paths
$ProjectRoot = $PSScriptRoot
$TauriConf   = "$ProjectRoot\src-tauri\tauri.conf.json"
$CargoToml   = "$ProjectRoot\src-tauri\Cargo.toml"
$KeyFile     = "$ProjectRoot\.tauri\keys.key"
$TargetDir   = "$ProjectRoot\src-tauri\target\release\bundle\nsis"

# VPS
$VPS       = "root@162.222.204.83"
$RemoteDir = "/root/imprime-plus"

# Ensure PATH — Cargo home fuera de OneDrive para evitar errores de sincronización de nube
$env:CARGO_HOME = "C:\cargo"
$env:Path = "C:\cargo\bin;C:\Program Files\nodejs;" + $env:Path

# ---- Step 0: Auto-bump version ----
$conf = Get-Content $TauriConf -Raw | ConvertFrom-Json
$vparts = $conf.version -split '\.'
$major = [int]$vparts[0]; $minor = [int]$vparts[1]; $patch = [int]$vparts[2]
switch ($BumpType) {
    "major" { $major++; $minor = 0; $patch = 0 }
    "minor" { $minor++; $patch = 0 }
    default { $patch++ }
}
$version = "$major.$minor.$patch"
$oldVersion = $conf.version
Write-Host "=== Imprime+ Deploy: $oldVersion → $version ===" -ForegroundColor Cyan

# Update tauri.conf.json
$tauriContent = Get-Content $TauriConf -Raw
$tauriContent = $tauriContent -replace '"version"\s*:\s*"[^"]*"', """version"": ""$version"""
[System.IO.File]::WriteAllText($TauriConf, $tauriContent, [System.Text.UTF8Encoding]::new($false))

# Update Cargo.toml (solo la primera línea version = "...")
$cargoLines = Get-Content $CargoToml
$updated = $false
$cargoLines = $cargoLines | ForEach-Object {
    if (-not $updated -and $_ -match '^version\s*=\s*"') {
        $updated = $true
        "version = ""$version"""
    } else { $_ }
}
[System.IO.File]::WriteAllText($CargoToml, ($cargoLines -join "`n") + "`n", [System.Text.UTF8Encoding]::new($false))

Write-Host "  Versión actualizada en tauri.conf.json y Cargo.toml" -ForegroundColor Green

# ---- Step 1: Build with signing ----
Write-Host "`n[1/5] Building release..." -ForegroundColor Yellow
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $KeyFile -Raw)
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "acero20!!!!"

Push-Location $ProjectRoot
npx tauri build 2>&1
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Build failed!" }
Pop-Location

# ---- Step 2: Locate artifacts ----
Write-Host "`n[2/5] Locating artifacts..." -ForegroundColor Yellow
$setup = "$TargetDir\Imprime+_${version}_x64-setup.exe"
$sig   = "$setup.sig"

if (-not (Test-Path $setup)) { throw "Setup not found: $setup" }
if (-not (Test-Path $sig))   { throw "Signature not found: $sig" }

$setupSize = [math]::Round((Get-Item $setup).Length / 1MB, 2)
Write-Host "  Setup: $setupSize MB"
Write-Host "  Signature: OK"

# ---- Step 3: Upload to VPS ----
Write-Host "`n[3/5] Uploading to VPS..." -ForegroundColor Yellow
scp $setup "${VPS}:${RemoteDir}/downloads/Imprime+_${version}_x64-setup.exe"
scp $sig   "${VPS}:${RemoteDir}/downloads/Imprime+_${version}_x64-setup.exe.sig"

# ---- Step 4: Generate and upload latest.json ----
Write-Host "`n[4/5] Updating latest.json..." -ForegroundColor Yellow
$sigContent = (Get-Content $sig -Raw).Trim()
$today      = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")

$latestJson = @"
{
  "version": "$version",
  "notes": "v${version}: ver historial en https://github.com/carloslopezhn/imprime-plus",
  "pub_date": "$today",
  "platforms": {
    "windows-x86_64": {
      "signature": "$sigContent",
      "url": "https://imprime.utp.hn/downloads/Imprime+_${version}_x64-setup.exe"
    }
  }
}
"@

$latestFile = "$env:TEMP\latest.json"
[System.IO.File]::WriteAllText($latestFile, $latestJson, [System.Text.UTF8Encoding]::new($false))
scp $latestFile "${VPS}:${RemoteDir}/data/latest.json"
Remove-Item $latestFile -ErrorAction SilentlyContinue

# ---- Step 5: Rebuild Docker container ----
Write-Host "`n[5/5] Rebuilding Docker container..." -ForegroundColor Yellow
ssh $VPS "cd $RemoteDir && docker compose build web && docker compose up -d --force-recreate web"

# ---- Step 6: Commit and push version bump ----
Write-Host "`nCommitting version bump..." -ForegroundColor Yellow
git -C $ProjectRoot add src-tauri/tauri.conf.json src-tauri/Cargo.toml
git -C $ProjectRoot commit -m "chore: release v$version"
git -C $ProjectRoot push origin main

Write-Host "`n=== Deploy complete! ===" -ForegroundColor Green
Write-Host "  Version:  $version"
Write-Host "  Download: https://imprime.utp.hn/"
Write-Host "  Update:   https://imprime.utp.hn/api/update/windows-x86_64/x86_64/$version"
