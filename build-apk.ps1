<#
  build-apk.ps1 -- one command that turns this repo into an installable APK.

  npm run android:apk fails on a machine that has not been set up for Android development,
  and the message it fails with ("SDK location not found") tells you what is missing but not
  what to do -- after seven minutes of Gradle downloading itself. This script does the setup
  part: it finds a usable JDK, finds or installs the Android SDK, writes the local.properties
  that Gradle wants, copies the launcher icons in, builds, and hands you the file.

  It writes outside the repo in at most two places, both standard, and only if it had to
  install an SDK for you: the SDK directory itself, and the user-level ANDROID_HOME variable.

    powershell -ExecutionPolicy Bypass -File build-apk.ps1

  Switches:
    -InstallSdk    install Android's command-line tools without asking first (about 500MB
                   with the platform and build-tools, against several gigabytes for the
                   whole of Android Studio)
    -SdkDir PATH   where to install it, if it installs one       (default C:\Android\Sdk)
    -JavaHome PATH use this JDK instead of searching for one

  It builds a debug APK, which is what you want for your own phone. Signing a release build
  needs a change to the generated Gradle project that does not survive regenerating it;
  ANDROID.md explains where that stands.

  The messages below are in English on purpose, even though the rest of this project's docs
  are Persian: Windows PowerShell 5.1 misreads non-ASCII in a .ps1 file that has no BOM, and
  a build log you cannot read is worse than one in the wrong language. Every failure it can
  report has a matching section in ANDROID.md.
#>

[CmdletBinding()]
param(
  [switch] $InstallSdk,
  [string] $SdkDir = 'C:\Android\Sdk',
  [string] $JavaHome
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# Gradle 8.2.1 with AGP 8.2.1, which is what `cap add android` generates: AGP needs at least
# 17 and this Gradle refuses anything past 20. A JDK outside that window fails with
# "Unsupported class file major version", so it is worth catching before the build.
$JDK_MIN = 17
$JDK_MAX = 20
$PLATFORM = 'platforms;android-34'      # variables.gradle: compileSdk and targetSdk are 34
$BUILDTOOLS = 'build-tools;34.0.0'

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Info($text) { Write-Host "   $text" }
function Good($text) { Write-Host "   $text" -ForegroundColor Green }
function Warn($text) { Write-Host "   $text" -ForegroundColor Yellow }
function Die($text) {
  Write-Host "`n!! $text" -ForegroundColor Red
  Write-Host "   ANDROID.md has the long version of every problem this script can hit."
  exit 1
}

# Native commands get this treatment throughout: npm, sdkmanager and Gradle all write
# ordinary progress to stderr, and under 'Stop' PowerShell turns that into a terminating
# error on a build that actually succeeded. So the exit code is the only thing consulted.
#
# Out-Host, not the pipeline: a native command's stdout would otherwise become part of this
# function's return value, and the caller would get Gradle's entire log with the exit code
# buried at the end of it -- an array, which compares to 0 in ways nobody wants.
function Invoke-Native([scriptblock] $command) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $command | Out-Host
    return $LASTEXITCODE
  } finally { $ErrorActionPreference = $previous }
}

# ---------------------------------------------------------------------------------------
Step 'Node and the project dependencies'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Die 'Node.js is not installed. Get the LTS build from https://nodejs.org and rerun this.'
}
# 2>$null because version-manager shims (fnm, volta, nvm-windows) sometimes greet you on
# stderr, and this is the one native call that runs before Invoke-Native is worth the noise.
$nodeVersion = (node --version 2>$null | Select-Object -First 1)
Info "node $nodeVersion"
if ([int](($nodeVersion -replace '^v', '') -split '\.')[0] -lt 20) {
  Warn 'Capacitor 6 expects Node 20 or newer; this may not work.'
}

if (-not (Test-Path 'node_modules\@capacitor\cli')) {
  Info 'installing dependencies (once)...'
  if ((Invoke-Native { npm install --no-fund --no-audit }) -ne 0) {
    Die 'npm install failed. The output above says why.'
  }
}
Good 'dependencies ready'

# ---------------------------------------------------------------------------------------
Step 'A JDK Gradle can use'

function Get-JdkMajor([string] $jdkPath) {
  # The release file beside the JDK carries its version, which beats parsing the banner
  # `java -version` prints to stderr in a locale-dependent format. Not named $home: that
  # is one of PowerShell's automatic variables.
  $version = $null
  $release = Join-Path $jdkPath 'release'
  if (Test-Path $release) {
    $line = Select-String -Path $release -Pattern '^JAVA_VERSION="([^"]+)"' -ErrorAction SilentlyContinue
    if ($line) { $version = $line.Matches[0].Groups[1].Value }
  }
  if (-not $version) {
    $exe = Join-Path $jdkPath 'bin\java.exe'
    if (Test-Path $exe) {
      $banner = (& $exe -version 2>&1 | Out-String)
      if ($banner -match 'version "([^"]+)"') { $version = $matches[1] }
    }
  }
  if (-not $version) { return 0 }
  $parts = $version -split '[._+-]'
  if ($parts[0] -eq '1') { return [int] $parts[1] }       # 1.8.0_301 -> 8
  return [int] $parts[0]
}

function Test-Jdk([string] $path) {
  if (-not $path) { return 0 }
  if (-not (Test-Path (Join-Path $path 'bin\javac.exe'))) { return 0 }
  return (Get-JdkMajor $path)
}

# Distinct from the $JavaHome parameter on purpose. PowerShell variable names are
# case-insensitive, so calling this one $javaHome would overwrite the user's argument.
$selectedJdk = $null

if ($JavaHome) {
  # An explicit override that turns out to be unusable has to say so. Quietly falling back
  # to a different JDK than the one you named is how you end up debugging the wrong thing.
  $major = Test-Jdk $JavaHome
  if ($major -eq 0) {
    Die "-JavaHome '$JavaHome' is not a JDK (no bin\javac.exe, or no readable version)."
  }
  if ($major -lt $JDK_MIN -or $major -gt $JDK_MAX) {
    Die "-JavaHome points at JDK $major, and Gradle 8.2.1 only builds with $JDK_MIN to $JDK_MAX."
  }
  $selectedJdk = $JavaHome
  Good "JDK $major at $JavaHome (as you asked)"
}

if (-not $selectedJdk) {
  $candidates = New-Object System.Collections.Generic.List[string]
  if ($env:JAVA_HOME) { $candidates.Add($env:JAVA_HOME) }
  # Android Studio ships a JDK 17 of its own; on most machines this is the one that works.
  foreach ($base in @("$env:ProgramFiles\Android\Android Studio",
                      "$env:LOCALAPPDATA\Programs\Android Studio",
                      "$env:ProgramFiles\Android\Android Studio Preview")) {
    $candidates.Add((Join-Path $base 'jbr'))
    $candidates.Add((Join-Path $base 'jre'))
  }
  foreach ($base in @("$env:ProgramFiles\Eclipse Adoptium", "$env:ProgramFiles\Java",
                      "$env:ProgramFiles\Microsoft", "$env:ProgramFiles\Zulu",
                      "$env:ProgramFiles\Amazon Corretto",
                      "$env:LOCALAPPDATA\Programs\Eclipse Adoptium")) {
    if (Test-Path $base) {
      Get-ChildItem $base -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { $candidates.Add($_.FullName) }
    }
  }

  $rejected = @()
  foreach ($candidate in $candidates) {
    $major = Test-Jdk $candidate
    if ($major -eq 0) { continue }
    if ($major -ge $JDK_MIN -and $major -le $JDK_MAX) {
      $selectedJdk = $candidate
      Good "JDK $major at $candidate"
      break
    }
    $rejected += "JDK $major at $candidate"
  }

  if (-not $selectedJdk) {
    foreach ($line in $rejected) { Warn "not usable: $line" }
    Die @"
No JDK between $JDK_MIN and $JDK_MAX was found, and Gradle 8.2.1 will not build with
anything outside that range. Either install Android Studio (its bundled JDK is 17), or
install a standalone JDK 17 from https://adoptium.net, then rerun. If you already have one
somewhere unusual:  .\build-apk.ps1 -JavaHome 'C:\path\to\jdk-17'
"@
  }
}

# ---------------------------------------------------------------------------------------
Step 'The Android SDK'

function Find-Sdk {
  foreach ($path in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT,
                      "$env:LOCALAPPDATA\Android\Sdk", 'C:\Android\Sdk', $SdkDir)) {
    if (-not $path) { continue }
    if ((Test-Path (Join-Path $path 'platforms')) -or
        (Test-Path (Join-Path $path 'cmdline-tools'))) { return $path }
  }
  return $null
}

function Find-SdkManager([string] $sdk) {
  foreach ($relative in @('cmdline-tools\latest\bin\sdkmanager.bat',
                          'cmdline-tools\bin\sdkmanager.bat',
                          'tools\bin\sdkmanager.bat')) {
    $path = Join-Path $sdk $relative
    if (Test-Path $path) { return $path }
  }
  foreach ($dir in (Get-ChildItem (Join-Path $sdk 'cmdline-tools') -Directory -ErrorAction SilentlyContinue)) {
    $path = Join-Path $dir.FullName 'bin\sdkmanager.bat'
    if (Test-Path $path) { return $path }
  }
  return $null
}

function Install-CommandLineTools([string] $into) {
  # The zip's filename carries a build number that changes with every release, so rather
  # than hardcode one that will 404 next quarter, ask Google's package manifest -- the very
  # file sdkmanager itself reads -- what the current one is called.
  $base = 'https://dl.google.com/android/repository'
  $url = $null
  foreach ($manifest in @('repository2-3.xml', 'repository2-1.xml')) {
    try {
      Info "asking Google which command-line tools are current ($manifest)..."
      [xml] $xml = (Invoke-WebRequest "$base/$manifest" -UseBasicParsing).Content
      $packages = @($xml.SelectNodes('//remotePackage') |
                    Where-Object { $_.path -like 'cmdline-tools;*' })
      # Ask for the package by name rather than trusting document order to be newest-last.
      $wanted = @($packages | Where-Object { $_.path -eq 'cmdline-tools;latest' })
      if ($wanted.Count -eq 0) { $wanted = $packages }
      $zip = $wanted |
             ForEach-Object { $_.archives.archive } |
             ForEach-Object { $_.complete.url } |
             Where-Object { $_ -like 'commandlinetools-win-*' } |
             Select-Object -Last 1
      if ($zip) { $url = "$base/$zip"; break }
      Warn "$manifest listed no Windows command-line tools"
    } catch {
      Warn "could not read $manifest ($($_.Exception.Message))"
    }
  }
  if (-not $url) {
    Die @"
Could not work out the download URL for the command-line tools, which usually means no
internet connection or a proxy in the way. Install them by hand instead -- it is three
steps and ANDROID.md walks through them:
  https://developer.android.com/studio#command-line-tools-only
"@
  }

  # Staged inside the destination, not in TEMP: Move-Item cannot move a directory across
  # volumes in Windows PowerShell, and -SdkDir may well be on another drive.
  $staging = Join-Path $into '.cmdline-tools-download'
  $zipPath = Join-Path $staging 'tools.zip'
  if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $staging | Out-Null

  Info "downloading $([IO.Path]::GetFileName($url))..."
  $previous = $ProgressPreference
  $ProgressPreference = 'SilentlyContinue'   # otherwise most of the time goes on redrawing a bar
  try {
    Invoke-WebRequest $url -OutFile $zipPath -UseBasicParsing
  } catch {
    Die "The download failed part way through ($($_.Exception.Message)). Try again, or follow the manual steps in ANDROID.md."
  } finally {
    $ProgressPreference = $previous
  }

  # The zip holds a top-level cmdline-tools\ folder, and sdkmanager insists on living at
  # cmdline-tools\latest\, so it is unpacked to the side and the inner folder moved in.
  Expand-Archive $zipPath -DestinationPath $staging -Force
  $latest = Join-Path $into 'cmdline-tools\latest'
  New-Item -ItemType Directory -Force -Path (Split-Path $latest) | Out-Null
  if (Test-Path $latest) { Remove-Item $latest -Recurse -Force }
  Move-Item (Join-Path $staging 'cmdline-tools') $latest
  Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
  Good "command-line tools installed in $into"
}

$sdk = Find-Sdk
$installedSdk = $false
if (-not $sdk) {
  Info 'No Android SDK found in the usual places.'
  if (-not $InstallSdk) {
    Info "This script can install just the command-line tools into $SdkDir -- about 500MB"
    Info 'with the platform and build-tools, against several gigabytes for Android Studio.'
    $answer = Read-Host '   Install them now? [y/N]'
    if ($answer -notmatch '^(y|yes)$') {
      Die 'Nothing installed. Install Android Studio, or rerun with -InstallSdk.'
    }
  }
  New-Item -ItemType Directory -Force -Path $SdkDir | Out-Null
  Install-CommandLineTools $SdkDir
  $sdk = $SdkDir
  $installedSdk = $true
}
Good "SDK at $sdk"

$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:JAVA_HOME = $selectedJdk
$env:Path = "$selectedJdk\bin;$env:Path"

# Gradle needs the exact platform and build-tools the project asks for and will not fetch
# them itself, so a missing one is worth installing before the build rather than after it
# fails. Derived from the constants above so that bumping compileSdk cannot leave this
# behind, checking for the old version and skipping the install.
$sdkManager = Find-SdkManager $sdk
$havePlatform = Test-Path (Join-Path $sdk ($PLATFORM -replace ';', '\'))
$haveTools = Test-Path (Join-Path $sdk ($BUILDTOOLS -replace ';', '\'))

if (-not ($havePlatform -and $haveTools)) {
  if (-not $sdkManager) {
    Die @"
The SDK at $sdk is missing $PLATFORM or $BUILDTOOLS, and it has no sdkmanager to install
them with. Open Android Studio -> Settings -> Languages and Frameworks -> Android SDK and
tick 'Android 14.0 (API 34)' plus 'Android SDK Build-Tools 34', or delete that folder and
rerun this script with -InstallSdk.
"@
  }
  Step 'Licences and SDK packages'
  # Each licence wants a typed "y". Feeding it a stream of them is the documented way to do
  # this unattended, and it is the same agreement the Studio installer shows you.
  Info 'accepting SDK licences...'
  Invoke-Native { (1..40 | ForEach-Object { 'y' }) | & $sdkManager "--sdk_root=$sdk" --licenses } | Out-Null
  Info "installing platform-tools, $PLATFORM, $BUILDTOOLS ..."
  if ((Invoke-Native { & $sdkManager "--sdk_root=$sdk" 'platform-tools' $PLATFORM $BUILDTOOLS }) -ne 0) {
    Die 'sdkmanager failed. The output above says why.'
  }
  Good 'SDK packages ready'
}

# Only when this script is the reason the SDK exists. Setting a persistent variable on
# someone's account because we merely *found* their Android Studio install would be a
# change they did not ask for and would not know about.
if ($installedSdk -and [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'User') -ne $sdk) {
  [Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdk, 'User')
  Info 'ANDROID_HOME set for your account (new terminals will see it)'
}

# ---------------------------------------------------------------------------------------
Step 'The Android project'

# The res folder rather than android/ itself: a half-deleted android/ would take the sync
# branch, and sync cannot rebuild what is missing.
if (-not (Test-Path 'android\app\src\main\res')) {
  Info 'generating android/ from web/ (that folder is gitignored and disposable)...'
  $capExit = Invoke-Native { npm run android:init }
} else {
  Info 'syncing web/ and the launcher icons into android/...'
  $capExit = Invoke-Native { npm run android:sync }
}
if ($capExit -ne 0) { Die 'Capacitor failed. The output above says why.' }

# Gradle reads this instead of the environment, and it is gitignored because it holds a path
# that means nothing on anyone else's disk.
$sdkForGradle = $sdk -replace '\\', '/'     # a properties file, where \ starts an escape
# ...and where anything above ASCII has to be a \uXXXX escape, because Java reads
# .properties as ISO-8859-1. A username with a Persian or accented letter in it would
# otherwise land in the file as question marks and Gradle would report the SDK missing --
# the exact error this script exists to prevent.
$escaped = New-Object System.Text.StringBuilder
foreach ($ch in $sdkForGradle.ToCharArray()) {
  if ([int] $ch -gt 126) { [void] $escaped.Append(('\u{0:x4}' -f [int] $ch)) }
  else { [void] $escaped.Append($ch) }
}
$localProperties = 'android\local.properties'
"sdk.dir=$($escaped.ToString())" | Set-Content -Encoding ASCII $localProperties
Good "wrote $localProperties"

# ---------------------------------------------------------------------------------------
Step 'Building (assembleDebug)'
Info 'The first build downloads Gradle itself, around 150MB, and takes a few minutes.'
Info 'Later builds take tens of seconds.'

Push-Location android
try {
  $gradleExit = Invoke-Native { & .\gradlew.bat assembleDebug --console=plain }
} finally {
  Pop-Location
}
if ($gradleExit -ne 0) {
  Die 'Gradle failed. Look for the first line beginning "> " above; that is the real error.'
}

# ---------------------------------------------------------------------------------------
Step 'Done'

# Only the debug folder. Gradle leaves an up-to-date APK's timestamp alone, so "newest APK
# anywhere under outputs" can hand back a release build from an earlier run.
$apk = Get-ChildItem 'android\app\build\outputs\apk\debug' -Filter '*.apk' -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $apk) { Die 'The build reported success but no APK is there, which should not happen.' }

New-Item -ItemType Directory -Force -Path 'dist' | Out-Null
Copy-Item $apk.FullName 'dist\follow-desk-debug.apk' -Force
$size = [math]::Round($apk.Length / 1MB, 1)

Good "dist\follow-desk-debug.apk  ($size MB)"
Write-Host ''
Info 'Copy it to your phone however you like -- cable, Telegram saved messages, Drive --'
Info 'and open it there. Android will ask whether to allow installing from this source,'
Info 'because the file is signed with a debug key rather than coming from the Play Store.'
Info 'That is fine for your own use. Rerun this script after any change to web/.'
