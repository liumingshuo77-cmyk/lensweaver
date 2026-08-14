$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$venv = Join-Path $env:USERPROFILE ".config\opencode\opensight-venv"
$envFile = Join-Path $env:USERPROFILE ".config\opencode\opensight.env"

Write-Host "== OpenSight setup =="

if (-not (Test-Path (Join-Path $venv "Scripts\python.exe"))) {
    Write-Host "Creating venv at $venv ..."
    python -m venv $venv
}

$py = Join-Path $venv "Scripts\python.exe"
Write-Host "Installing rapidocr-onnxruntime + pillow ..."
& $py -m pip install --disable-pip-version-check -q rapidocr-onnxruntime pillow
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

& $py -c "from rapidocr_onnxruntime import RapidOCR; import PIL; print('OK: rapidocr + pillow ready')"

if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $root "opensight.env.example") $envFile
    Write-Host "Created $envFile - please fill in VISION_API_KEY"
} else {
    Write-Host "$envFile already exists (not overwritten)"
}

Write-Host "Done. Restart opencode to load the plugin."
