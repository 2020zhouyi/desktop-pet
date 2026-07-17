[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath,
  [Parameter(Mandatory = $true)]
  [string]$MetadataPath,
  [string]$ExpectedVersion,
  [string]$ExpectedGitSha,
  [switch]$RequireCleanWorktree
)

$ErrorActionPreference = "Stop"

function Assert-Condition {
  param(
    [bool]$Condition,
    [string]$Message
  )
  if (-not $Condition) {
    throw $Message
  }
}

$archive = Get-Item (Resolve-Path $ArchivePath)
$metadataFile = Get-Item (Resolve-Path $MetadataPath)
$metadata = Get-Content $metadataFile.FullName -Raw | ConvertFrom-Json
$expectedPackageName = "DesktopPet-Windows-x64"

Assert-Condition ($metadata.package -eq $expectedPackageName) "Unexpected package name '$($metadata.package)'."
Assert-Condition ($archive.Name -eq "$expectedPackageName.zip") "Unexpected archive filename '$($archive.Name)'."
Assert-Condition ($metadataFile.Name -eq "$expectedPackageName.artifact.json") "Unexpected metadata filename '$($metadataFile.Name)'."
Assert-Condition (-not [string]::IsNullOrWhiteSpace($metadata.version)) "Artifact version is missing."
Assert-Condition ($metadata.rustWorkspaceVersion -eq $metadata.version) "Rust workspace and package versions differ in artifact metadata."
Assert-Condition ($metadata.architecture -eq "x86_64-pc-windows-msvc") "Unexpected package architecture '$($metadata.architecture)'."
Assert-Condition ($metadata.msvcRuntime -eq "static") "The artifact metadata does not declare a static MSVC runtime."
Assert-Condition ([int64]$metadata.archiveBytes -eq $archive.Length) "Archive byte count does not match artifact metadata."
Assert-Condition (
  $metadata.archiveSha256 -eq (Get-FileHash $archive.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
) "Archive SHA256 does not match artifact metadata."
if (-not [string]::IsNullOrWhiteSpace($ExpectedGitSha)) {
  Assert-Condition ($metadata.gitSha -eq $ExpectedGitSha) "Artifact gitSha '$($metadata.gitSha)' does not match '$ExpectedGitSha'."
}
if (-not [string]::IsNullOrWhiteSpace($ExpectedVersion)) {
  Assert-Condition ($metadata.version -eq $ExpectedVersion) "Artifact version '$($metadata.version)' does not match '$ExpectedVersion'."
}
if ($RequireCleanWorktree) {
  Assert-Condition (-not [bool]$metadata.dirtyWorktreeBuild) "Release artifact was built from a dirty worktree."
}

$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) "desktop-pet-package-$([guid]::NewGuid().ToString('N'))"
try {
  New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
  Expand-Archive -LiteralPath $archive.FullName -DestinationPath $temporaryRoot

  $topLevelEntries = @(Get-ChildItem $temporaryRoot -Force)
  Assert-Condition ($topLevelEntries.Count -eq 1) "Archive must contain exactly one top-level entry."
  Assert-Condition $topLevelEntries[0].PSIsContainer "Archive top-level entry must be a directory."
  Assert-Condition ($topLevelEntries[0].Name -eq $expectedPackageName) "Unexpected archive root '$($topLevelEntries[0].Name)'."

  $packageRoot = $topLevelEntries[0].FullName
  $rootEntries = @(Get-ChildItem $packageRoot -Force)
  $rootEntryNames = @($rootEntries | ForEach-Object { $_.Name } | Sort-Object)
  Assert-Condition (
    ($rootEntries.Count -eq 2) -and
    ($rootEntryNames[0] -eq "DesktopPet.exe") -and
    ($rootEntryNames[1] -eq "pets-seed")
  ) "Archive root must contain only DesktopPet.exe and pets-seed."

  $executable = Get-Item (Join-Path $packageRoot "DesktopPet.exe")
  $seedRoot = Get-Item (Join-Path $packageRoot "pets-seed")
  Assert-Condition (-not $executable.PSIsContainer) "DesktopPet.exe is not a file."
  Assert-Condition $seedRoot.PSIsContainer "pets-seed is not a directory."

  $petFiles = @(Get-ChildItem $seedRoot.FullName -File -Recurse)
  $manifestFiles = @($petFiles | Where-Object { $_.Name -eq "pet.json" })
  $spritesheetFiles = @($petFiles | Where-Object { $_.Name -eq "spritesheet.webp" })
  $unexpectedFiles = @($petFiles | Where-Object { $_.Name -notin @("pet.json", "spritesheet.webp") })
  Assert-Condition ($manifestFiles.Count -eq 25) "Expected 25 manifests, found $($manifestFiles.Count)."
  Assert-Condition ($spritesheetFiles.Count -eq 25) "Expected 25 spritesheets, found $($spritesheetFiles.Count)."
  Assert-Condition ($unexpectedFiles.Count -eq 0) "Found $($unexpectedFiles.Count) unexpected pet resource files."

  $resourceBytes = [int64](($petFiles | Measure-Object -Property Length -Sum).Sum)
  Assert-Condition ([int64]$metadata.executableBytes -eq $executable.Length) "Executable byte count does not match artifact metadata."
  Assert-Condition (
    $metadata.executableSha256 -eq (Get-FileHash $executable.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  ) "Executable SHA256 does not match artifact metadata."
  Assert-Condition ([int64]$metadata.resourceBytes -eq $resourceBytes) "Resource byte count does not match artifact metadata."
  Assert-Condition ([int]$metadata.petCount -eq $manifestFiles.Count) "Pet count does not match artifact metadata."

  $executableAscii = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($executable.FullName))
  $dynamicMsvcRuntimeImports = @(
    "VCRUNTIME140.dll",
    "VCRUNTIME140_1.dll",
    "MSVCP140.dll",
    "ucrtbase.dll"
  ) | Where-Object { $executableAscii.IndexOf($_, [StringComparison]::OrdinalIgnoreCase) -ge 0 }
  Assert-Condition ($dynamicMsvcRuntimeImports.Count -eq 0) "DesktopPet.exe imports dynamic MSVC runtime DLLs: $($dynamicMsvcRuntimeImports -join ', ')."

  [ordered]@{
    status = "passed"
    package = $metadata.package
    version = $metadata.version
    architecture = $metadata.architecture
    gitSha = $metadata.gitSha
    archiveBytes = $archive.Length
    archiveSha256 = $metadata.archiveSha256
    executableBytes = $executable.Length
    executableSha256 = $metadata.executableSha256
    petCount = $manifestFiles.Count
    resourceBytes = $resourceBytes
    dirtyWorktreeBuild = [bool]$metadata.dirtyWorktreeBuild
  } | ConvertTo-Json
} finally {
  if (Test-Path $temporaryRoot) {
    Remove-Item $temporaryRoot -Recurse -Force
  }
}
