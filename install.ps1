$ErrorActionPreference = "Stop"

$repo = $PSScriptRoot
$ocDir = Join-Path $env:USERPROFILE ".config\opencode"
$pluginsDir = Join-Path $ocDir "plugins"
$skillsDir = Join-Path $ocDir "skills\vision"
$envFile = Join-Path $ocDir "vision-pro.env"
$packageFile = Join-Path $ocDir "package.json"

Write-Host "== vision-pro install =="

New-Item -ItemType Directory -Force -Path $pluginsDir, $skillsDir | Out-Null

if (Test-Path $packageFile) {
    $package = Get-Content $packageFile -Raw | ConvertFrom-Json
} else {
    $package = [pscustomobject]@{}
}
if (-not $package.PSObject.Properties["dependencies"]) {
    $package | Add-Member -NotePropertyName "dependencies" -NotePropertyValue ([pscustomobject]@{})
}
if ($package.dependencies.PSObject.Properties["@opencode-ai/plugin"]) {
    $package.dependencies."@opencode-ai/plugin" = "^1.0.0"
} else {
    $package.dependencies | Add-Member -NotePropertyName "@opencode-ai/plugin" -NotePropertyValue "^1.0.0"
}
$package | ConvertTo-Json -Depth 10 | Set-Content $packageFile -Encoding UTF8

Write-Host "Copying plugin to $pluginsDir ..."
Copy-Item (Join-Path $repo "plugin\vision-pro.ts") $pluginsDir -Force
$installedLib = Join-Path $pluginsDir "vision-pro-lib"
New-Item -ItemType Directory -Force -Path $installedLib | Out-Null
Copy-Item (Join-Path $repo "plugin\vision-pro-lib\*") $installedLib -Recurse -Force

Write-Host "Copying skill ..."
Copy-Item (Join-Path $repo "skills\vision\SKILL.md") $skillsDir -Force

Write-Host "Setting up Python sidecar ..."
& (Join-Path $pluginsDir "vision-pro-lib\setup.ps1")

if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $pluginsDir "vision-pro-lib\vision-pro.env.example") $envFile
    Write-Host "Created $envFile"
}

Write-Host "Done. Restart opencode to load the plugin."
