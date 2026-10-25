param([string]$BlenderPath = $env:BLENDER_PATH)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not $BlenderPath) {
    $installedBlender = 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe'
    if (Test-Path -LiteralPath $installedBlender) { $BlenderPath = $installedBlender }
    else { $BlenderPath = (Get-Command blender -ErrorAction Stop).Source }
}
python scripts/extract_rhino.py
if ($LASTEXITCODE -ne 0) { throw 'Rhino extraction failed' }
& $BlenderPath --background --factory-startup --python scripts/build_blender.py
if ($LASTEXITCODE -ne 0) { throw 'Blender build failed' }
& $BlenderPath --background --factory-startup --python scripts/verify_glb_blender.py
if ($LASTEXITCODE -ne 0) { throw 'GLB round-trip failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
