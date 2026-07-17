[CmdletBinding()]
param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\target\package"),
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$nativeRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repositoryRoot = (Resolve-Path (Join-Path $nativeRoot "..")).Path
$packageVersion = (Get-Content (Join-Path $repositoryRoot "package.json") -Raw | ConvertFrom-Json).version
if ([string]::IsNullOrWhiteSpace($packageVersion)) {
  throw "package.json does not contain a release version."
}
$nativeManifest = Get-Content (Join-Path $nativeRoot "Cargo.toml") -Raw
$nativeVersionMatch = [regex]::Match($nativeManifest, '(?m)^version\s*=\s*"([^"]+)"')
if (-not $nativeVersionMatch.Success -or $nativeVersionMatch.Groups[1].Value -ne $packageVersion) {
  throw "Native workspace version must match package.json version $packageVersion."
}
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
$packageName = "DesktopPet-Windows-x64"
$packageRoot = Join-Path $outputRoot $packageName
$archivePath = Join-Path $outputRoot "$packageName.zip"
$metadataPath = Join-Path $outputRoot "$packageName.artifact.json"
$executableSource = Join-Path $nativeRoot "target\release\desktop-pet-windows.exe"
$petsSource = Join-Path $repositoryRoot "pets"

if (-not $SkipBuild) {
  Push-Location $nativeRoot
  try {
    cargo build -p desktop-pet-windows --release --locked
    if ($LASTEXITCODE -ne 0) {
      throw "Native Windows release build failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path $executableSource -PathType Leaf)) {
  throw "Missing release executable: $executableSource"
}
if (-not (Test-Path $petsSource -PathType Container)) {
  throw "Missing bundled pet source: $petsSource"
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
if (Test-Path $packageRoot) {
  Remove-Item $packageRoot -Recurse -Force
}
if (Test-Path $archivePath) {
  Remove-Item $archivePath -Force
}
if (Test-Path $metadataPath) {
  Remove-Item $metadataPath -Force
}

New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
Copy-Item $executableSource (Join-Path $packageRoot "DesktopPet.exe")
Copy-Item $petsSource (Join-Path $packageRoot "pets-seed") -Recurse

$petFiles = @(Get-ChildItem (Join-Path $packageRoot "pets-seed") -File -Recurse)
$manifestFiles = @($petFiles | Where-Object { $_.Name -eq "pet.json" })
$spritesheetFiles = @($petFiles | Where-Object { $_.Name -eq "spritesheet.webp" })
$unexpectedFiles = @($petFiles | Where-Object { $_.Name -notin @("pet.json", "spritesheet.webp") })
if ($manifestFiles.Count -ne 25 -or $spritesheetFiles.Count -ne 25 -or $unexpectedFiles.Count -ne 0) {
  throw "Pet package contract failed: manifests=$($manifestFiles.Count), spritesheets=$($spritesheetFiles.Count), unexpected=$($unexpectedFiles.Count)."
}

$executable = Get-Item (Join-Path $packageRoot "DesktopPet.exe")
$executableAscii = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($executable.FullName))
$dynamicMsvcRuntimeImports = @(
  "VCRUNTIME140.dll",
  "VCRUNTIME140_1.dll",
  "MSVCP140.dll",
  "ucrtbase.dll"
) | Where-Object { $executableAscii.IndexOf($_, [StringComparison]::OrdinalIgnoreCase) -ge 0 }
if ($dynamicMsvcRuntimeImports.Count -ne 0) {
  throw "DesktopPet.exe dynamically imports MSVC runtime DLLs: $($dynamicMsvcRuntimeImports -join ', ')."
}
$resourceBytes = ($petFiles | Measure-Object -Property Length -Sum).Sum
if ($executable.Length -gt 20MB) {
  throw "DesktopPet.exe is $($executable.Length) bytes, above the 20 MiB budget."
}
if ($resourceBytes -gt 65MB) {
  throw "Bundled pet resources are $resourceBytes bytes, above the 65 MiB budget."
}

Compress-Archive -Path $packageRoot -DestinationPath $archivePath -CompressionLevel Optimal
$archive = Get-Item $archivePath
if ($archive.Length -gt 90MB) {
  throw "Windows native ZIP is $($archive.Length) bytes, above the 90 MiB budget."
}

$metadata = [ordered]@{
  package = $packageName
  version = $packageVersion
  rustWorkspaceVersion = $nativeVersionMatch.Groups[1].Value
  architecture = "x86_64-pc-windows-msvc"
  msvcRuntime = "static"
  executableBytes = $executable.Length
  executableSha256 = (Get-FileHash $executable.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  petCount = $manifestFiles.Count
  resourceBytes = $resourceBytes
  archiveBytes = $archive.Length
  archiveSha256 = (Get-FileHash $archive.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  gitSha = (git -C $repositoryRoot rev-parse HEAD).Trim()
  dirtyWorktreeBuild = [bool](git -C $repositoryRoot status --porcelain)
}
$metadata | ConvertTo-Json | Set-Content $metadataPath -Encoding utf8
$metadata | ConvertTo-Json
