param(
    [string]$SourceDatabase = "backend\database.db",
    [string]$SourceData = "backend\data",
    [string]$TargetRuntime = "deploy\runtime"
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$databasePath = Join-Path $root $SourceDatabase
$dataPath = Join-Path $root $SourceData
$runtimePath = Join-Path $root $TargetRuntime
$targetDatabasePath = Join-Path $runtimePath "database.db"
$targetDataPath = Join-Path $runtimePath "data"

if (-not (Test-Path -LiteralPath $databasePath -PathType Leaf)) {
    throw "Source database was not found: $databasePath"
}
if (-not (Test-Path -LiteralPath $dataPath -PathType Container)) {
    throw "Source data directory was not found: $dataPath"
}

New-Item -ItemType Directory -Force -Path $runtimePath, $targetDataPath | Out-Null
Copy-Item -LiteralPath $databasePath -Destination $targetDatabasePath -Force
Copy-Item -Path (Join-Path $dataPath "*") -Destination $targetDataPath -Recurse -Force

Write-Host "Runtime prepared at $runtimePath"
Write-Host "Set SECOND_BRAIN_RUNTIME_PATH=./$($TargetRuntime -replace '\\','/') in deploy/.env before starting Compose."
