# Install pactiac on Windows from GitHub Releases.
#
# Usage (PowerShell):
#   irm https://raw.githubusercontent.com/pactia-lang/pactiac/main/scripts/install-pactiac.ps1 | iex
#   .\scripts\install-pactiac.ps1
#   .\scripts\install-pactiac.ps1 -Version v0.2.0
param(
    [string]$Version = "latest"
)

$ErrorActionPreference = "Stop"

$Repo = "pactia-lang/pactiac"
$Asset = "pactiac-windows-x64.exe"
$InstallDir = if ($env:INSTALL_DIR) { $env:INSTALL_DIR } else { Join-Path $env:USERPROFILE ".local\bin" }
$Dest = Join-Path $InstallDir "pactiac.exe"

function Get-ReleaseTag {
    param([string]$Requested)
    if ($Requested -eq "latest") {
        $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
        return $release.tag_name
    }
    return $Requested
}

$tag = Get-ReleaseTag -Requested $Version
if (-not $tag) {
    Write-Error "install-pactiac: could not resolve release version '$Version'"
}

$url = "https://github.com/$Repo/releases/download/$tag/$Asset"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

Write-Host "install-pactiac: downloading $tag $Asset"
Invoke-WebRequest -Uri $url -OutFile $Dest -UseBasicParsing

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not $userPath) {
    $userPath = ""
}
$pathEntries = $userPath -split ";" | Where-Object { $_ -ne "" }
if ($pathEntries -notcontains $InstallDir) {
    $newPath = if ($userPath) { "$userPath;$InstallDir" } else { $InstallDir }
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    $env:Path = "$env:Path;$InstallDir"
    Write-Host "install-pactiac: added $InstallDir to user PATH (open a new terminal)"
}

Write-Host "install-pactiac: installed $tag -> $Dest"
Write-Host "install-pactiac: run 'pactiac compile --help' in a new PowerShell window"
