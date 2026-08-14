$ErrorActionPreference = "Stop"

$repo = $PSScriptRoot
$ocDir = Join-Path $env:USERPROFILE ".config\opencode"
$pluginsDir = Join-Path $ocDir "plugins"
$skillsDir = Join-Path $ocDir "skills\opensight"
$envFile = Join-Path $ocDir "opensight.env"
$packageFile = Join-Path $ocDir "package.json"

Write-Host "== OpenSight install =="

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
Copy-Item (Join-Path $repo "plugin\opensight.ts") $pluginsDir -Force
$installedLib = Join-Path $pluginsDir "opensight-lib"
New-Item -ItemType Directory -Force -Path $installedLib | Out-Null
Copy-Item (Join-Path $repo "plugin\opensight-lib\*") $installedLib -Recurse -Force

Write-Host "Copying skill ..."
Copy-Item (Join-Path $repo "skills\opensight\SKILL.md") $skillsDir -Force

Write-Host "Setting up Python sidecar ..."
& (Join-Path $pluginsDir "opensight-lib\setup.ps1")

if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $pluginsDir "opensight-lib\opensight.env.example") $envFile
    Write-Host "Created $envFile"
}

Write-Host "Done. Restart opencode to load the plugin."
