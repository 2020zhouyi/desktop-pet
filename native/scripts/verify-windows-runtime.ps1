[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$PackageDirectory,
  [string]$EvidenceDirectory = (Join-Path $PSScriptRoot "..\target\windows-runtime-evidence"),
  [ValidateRange(5, 120)]
  [int]$StartupTimeoutSeconds = 25,
  [switch]$KeepProcessRunning
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

function Wait-ForLogEvent {
  param(
    [string]$Path,
    [string]$Event,
    [int]$TimeoutSeconds
  )
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    if ((Test-Path $Path -PathType Leaf) -and
        (Select-String -Path $Path -SimpleMatch $Event -Quiet)) {
      return
    }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Timed out waiting for '$Event' in $Path."
}

$sourcePackage = (Resolve-Path $PackageDirectory).Path
$sourceExecutable = Join-Path $sourcePackage "DesktopPet.exe"
$sourceSeed = Join-Path $sourcePackage "pets-seed"
Assert-Condition (Test-Path $sourceExecutable -PathType Leaf) "Missing DesktopPet.exe in $sourcePackage."
Assert-Condition (Test-Path $sourceSeed -PathType Container) "Missing pets-seed in $sourcePackage."
$sourceExecutableAscii = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($sourceExecutable))
$dynamicMsvcRuntimeImports = @(
  "VCRUNTIME140.dll",
  "VCRUNTIME140_1.dll",
  "MSVCP140.dll",
  "ucrtbase.dll"
) | Where-Object { $sourceExecutableAscii.IndexOf($_, [StringComparison]::OrdinalIgnoreCase) -ge 0 }
Assert-Condition ($dynamicMsvcRuntimeImports.Count -eq 0) "DesktopPet.exe requires dynamic MSVC runtime DLLs: $($dynamicMsvcRuntimeImports -join ', ')."

$sourceManifests = @(Get-ChildItem $sourceSeed -File -Filter "pet.json" -Recurse)
$sourceSpritesheets = @(Get-ChildItem $sourceSeed -File -Filter "spritesheet.webp" -Recurse)
$sourceUnexpected = @(
  Get-ChildItem $sourceSeed -File -Recurse |
    Where-Object { $_.Name -notin @("pet.json", "spritesheet.webp") }
)
Assert-Condition ($sourceManifests.Count -eq 25) "Expected 25 source manifests, found $($sourceManifests.Count)."
Assert-Condition ($sourceSpritesheets.Count -eq 25) "Expected 25 source spritesheets, found $($sourceSpritesheets.Count)."
Assert-Condition ($sourceUnexpected.Count -eq 0) "Found $($sourceUnexpected.Count) unexpected pet resource files."

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$evidenceRoot = [IO.Path]::GetFullPath($EvidenceDirectory)
$sandbox = Join-Path $evidenceRoot "run-$stamp-$PID"
$workingPackage = Join-Path $sandbox "package"
$isolatedLocalAppData = Join-Path $sandbox "local-app-data"
$isolatedAppData = Join-Path $sandbox "roaming-app-data"
$dataRoot = Join-Path $isolatedLocalAppData "DesktopPet"
$logPath = Join-Path $dataRoot "desktop-pet.log"
$evidencePath = Join-Path $sandbox "runtime-evidence.json"

New-Item -ItemType Directory -Path $workingPackage -Force | Out-Null
New-Item -ItemType Directory -Path $isolatedLocalAppData -Force | Out-Null
New-Item -ItemType Directory -Path $isolatedAppData -Force | Out-Null
Get-ChildItem $sourcePackage | Copy-Item -Destination $workingPackage -Recurse
$workingExecutable = Join-Path $workingPackage "DesktopPet.exe"

$legacyRoot = Join-Path $isolatedAppData "desktop-pet-mvp"
$legacyFixture = Join-Path $legacyRoot "pets\Migration Fixture"
New-Item -ItemType Directory -Path $legacyFixture -Force | Out-Null
Copy-Item $sourceSpritesheets[0].FullName (Join-Path $legacyFixture "spritesheet.webp")
$legacyManifest = [ordered]@{
  id = "migration-fixture"
  displayName = "Migration Fixture"
  spritesheetPath = "spritesheet.webp"
  bubbleLines = [ordered]@{
    welcome = @("Welcome")
    click = @("Click")
    drag = @("Drag")
    petSwitch = @("Switch")
  }
}
$legacySettings = [ordered]@{
  selectedPetId = "user:migration-fixture"
  mascotWidthPx = 180
  launchAtLogin = $false
}
$legacyManifest | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $legacyFixture "pet.json") -Encoding ascii
$legacySettings | ConvertTo-Json | Set-Content (Join-Path $legacyRoot "desktop-pet-settings.json") -Encoding ascii

$previousLocalAppData = $env:LOCALAPPDATA
$previousAppData = $env:APPDATA
$runKeyPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$runValueNames = @("DesktopPet", "desktop-pet-mvp", "Desktop Pet MVP")
$hadPreviousRunKey = Test-Path $runKeyPath
$previousRunValues = @{}
if ($hadPreviousRunKey) {
  $runKey = Get-Item $runKeyPath
  $existingRunValueNames = @($runKey.GetValueNames())
  foreach ($runValueName in $runValueNames) {
    if ($existingRunValueNames -contains $runValueName) {
      $previousRunValues[$runValueName] = $runKey.GetValue(
        $runValueName,
        $null,
        [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames
      )
    }
  }
}
$firstProcess = $null
$secondProcess = $null
$gracefulStop = $false
try {
  $env:LOCALAPPDATA = $isolatedLocalAppData
  $env:APPDATA = $isolatedAppData
  $startedAt = [DateTime]::UtcNow
  $firstProcess = Start-Process $workingExecutable -WorkingDirectory $workingPackage -PassThru

  Wait-ForLogEvent $logPath "event=window_visible" $StartupTimeoutSeconds
  Wait-ForLogEvent $logPath "event=tray_ready" $StartupTimeoutSeconds
  Wait-ForLogEvent $logPath "event=bubble_shown scene=Welcome" $StartupTimeoutSeconds
  $firstProcess.Refresh()
  Assert-Condition (-not $firstProcess.HasExited) "Desktop Pet exited before the startup checks completed."

  $startupLog = Get-Content $logPath -Raw
  Assert-Condition ($startupLog.Contains("event=process_start source=manual")) "Missing manual process_start event."
  Assert-Condition ($startupLog.Contains("event=legacy_electron_imported settings=true seed_marker=false copied=1 preserved=0 skipped=0")) "Legacy Electron data was not imported exactly once."
  Assert-Condition ($startupLog.Contains("event=bundled_library_ready mode=consumed changed=true moved=25 preserved=0")) "Bundled library was not consumed exactly once."
  Assert-Condition ($startupLog.Contains("event=pet_loaded id=user:migration-fixture width=180")) "Legacy selection and size were not restored."
  Assert-Condition (-not $startupLog.Contains("event=fatal_error")) "A fatal runtime error was logged."

  $installedManifests = @(Get-ChildItem (Join-Path $dataRoot "pets") -File -Filter "pet.json" -Recurse)
  $installedSpritesheets = @(Get-ChildItem (Join-Path $dataRoot "pets") -File -Filter "spritesheet.webp" -Recurse)
  Assert-Condition ($installedManifests.Count -eq 26) "Expected 25 bundled plus 1 migrated manifest, found $($installedManifests.Count)."
  Assert-Condition ($installedSpritesheets.Count -eq 26) "Expected 25 bundled plus 1 migrated spritesheet, found $($installedSpritesheets.Count)."
  Assert-Condition (Test-Path (Join-Path $dataRoot "pets\.bundled-pets-seeded-v1.json") -PathType Leaf) "Missing bundled pet marker."
  Assert-Condition (Test-Path (Join-Path $dataRoot ".electron-user-data-imported-v1.json") -PathType Leaf) "Missing legacy import marker."
  Assert-Condition (Test-Path (Join-Path $legacyFixture "pet.json") -PathType Leaf) "Legacy source data was deleted."
  Assert-Condition (-not (Test-Path (Join-Path $workingPackage "pets-seed"))) "The writable package copy still contains pets-seed after consumption."
  Assert-Condition (Test-Path (Join-Path $dataRoot "desktop-pet-settings.json") -PathType Leaf) "Missing persisted slim settings."

  $secondProcess = Start-Process $workingExecutable -WorkingDirectory $workingPackage -PassThru
  Assert-Condition ($secondProcess.WaitForExit(5000)) "The duplicate process did not exit promptly."
  Assert-Condition ($secondProcess.ExitCode -eq 0) "The duplicate process exited with code $($secondProcess.ExitCode)."
  Wait-ForLogEvent $logPath "event=duplicate_instance_rejected" 5

  if (-not $KeepProcessRunning) {
    $firstProcess.Refresh()
    if (($firstProcess.MainWindowHandle -ne 0) -and $firstProcess.CloseMainWindow()) {
      $gracefulStop = $firstProcess.WaitForExit(5000)
    }
    if (-not $firstProcess.HasExited) {
      Stop-Process -Id $firstProcess.Id -Force
      $firstProcess.WaitForExit()
    }
  }

  $finalLog = Get-Content $logPath -Raw
  Assert-Condition (-not $finalLog.Contains("event=fatal_error")) "A fatal runtime error was logged."
  $completedAt = [DateTime]::UtcNow
  $evidence = [ordered]@{
    status = "passed"
    architecture = "x86_64-pc-windows-msvc"
    msvcRuntime = "static"
    sourcePackage = $sourcePackage
    sourceExecutableSha256 = (Get-FileHash $sourceExecutable -Algorithm SHA256).Hash.ToLowerInvariant()
    sandbox = $sandbox
    isolatedLocalAppData = $isolatedLocalAppData
    isolatedAppData = $isolatedAppData
    logPath = $logPath
    launchAtLoginRegistryPreserved = $true
    firstProcessId = $firstProcess.Id
    keptRunning = [bool]$KeepProcessRunning
    gracefulStop = $gracefulStop
    sourcePetCount = $sourceManifests.Count
    installedPetCount = $installedManifests.Count
    legacyElectronDataImported = $finalLog.Contains("event=legacy_electron_imported")
    legacySourcePreserved = (Test-Path (Join-Path $legacyFixture "pet.json") -PathType Leaf)
    seedConsumed = -not (Test-Path (Join-Path $workingPackage "pets-seed"))
    duplicateInstanceRejected = $finalLog.Contains("event=duplicate_instance_rejected")
    welcomeBubbleShown = $finalLog.Contains("event=bubble_shown scene=Welcome")
    startedAtUtc = $startedAt.ToString("o")
    completedAtUtc = $completedAt.ToString("o")
  }
  $evidence | ConvertTo-Json | Set-Content $evidencePath -Encoding utf8
  $evidence | ConvertTo-Json
  Write-Host "Runtime evidence: $evidencePath"
} finally {
  if ((-not $KeepProcessRunning) -and $firstProcess -and (-not $firstProcess.HasExited)) {
    Stop-Process -Id $firstProcess.Id -Force -ErrorAction SilentlyContinue
  }
  if ($null -eq $previousLocalAppData) {
    Remove-Item Env:LOCALAPPDATA -ErrorAction SilentlyContinue
  } else {
    $env:LOCALAPPDATA = $previousLocalAppData
  }
  if ($null -eq $previousAppData) {
    Remove-Item Env:APPDATA -ErrorAction SilentlyContinue
  } else {
    $env:APPDATA = $previousAppData
  }
  foreach ($runValueName in $runValueNames) {
    if ($previousRunValues.ContainsKey($runValueName)) {
      if (-not (Test-Path $runKeyPath)) {
        New-Item $runKeyPath -Force | Out-Null
      }
      New-ItemProperty $runKeyPath -Name $runValueName -Value $previousRunValues[$runValueName] -PropertyType String -Force | Out-Null
    } elseif (Test-Path $runKeyPath) {
      Remove-ItemProperty $runKeyPath -Name $runValueName -ErrorAction SilentlyContinue
    }
  }
  if ((-not $hadPreviousRunKey) -and (Test-Path $runKeyPath)) {
    $remainingRunValues = (Get-Item $runKeyPath).GetValueNames()
    if ($remainingRunValues.Count -eq 0) {
      Remove-Item $runKeyPath -ErrorAction SilentlyContinue
    }
  }
}
