$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$log = Join-Path $env:TEMP 'Petya-Ollama-install.log'
$download = Join-Path $env:TEMP ('Petya-Ollama-' + [guid]::NewGuid().ToString() + '.exe')
try {
    # Respect existing installations, including custom locations and newer versions.
    $locations = @((Join-Path $env:LOCALAPPDATA 'Programs\Ollama'))
    foreach ($key in @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{44E83376-CE68-45EB-8FC1-393500EB558C}_is1',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{44E83376-CE68-45EB-8FC1-393500EB558C}_is1',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{44E83376-CE68-45EB-8FC1-393500EB558C}_is1')) {
        $entry = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
        if ($entry.InstallLocation) { $locations += $entry.InstallLocation }
    }
    $locations += ($env:PATH -split ';' | ForEach-Object { $_.Trim('"') } | Where-Object { $_ -and [IO.Path]::IsPathRooted($_) })
    foreach ($location in $locations) {
        if (Test-Path -LiteralPath (Join-Path $location 'ollama.exe') -PathType Leaf) {
            Write-Output 'Ollama is already installed.'
            exit 0
        }
    }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Write-Output 'Downloading Ollama 0.40.14 (1.68 GB). Please wait...'
    $client = New-Object Net.WebClient
    try { $client.DownloadFile('https://github.com/ollama/ollama/releases/download/v0.40.14/OllamaSetup.exe', $download) }
    finally { $client.Dispose() }
    $expected = 'e069c7cc7d4808f77684e81efa0b1f853a5190b4b8f070bc8fd63041180e3eba'
    if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash -ne $expected) {
        throw 'Ollama checksum mismatch. Download was not executed.'
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $download
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(^|, )O=Ollama Inc\.(,|$)') {
        throw 'Ollama signature is invalid. Download was not executed.'
    }
    $process = Start-Process -FilePath $download -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', ('/LOG="' + $log + '"')) -PassThru -Wait
    if ($process.ExitCode -notin @(0, 3010)) { throw "Ollama installer failed: $($process.ExitCode)" }
    Write-Output 'Ollama installed.'
} catch {
    $_.Exception.Message | Out-File -LiteralPath $log -Append -Encoding utf8
    Write-Output $_.Exception.Message
    exit 1
} finally {
    Remove-Item -LiteralPath $download -Force -ErrorAction SilentlyContinue
}
