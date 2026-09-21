$ErrorActionPreference = 'Stop'
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA 'Android\sdk' }
$adb = Join-Path $sdk 'platform-tools\adb.exe'
$emulator = Join-Path $sdk 'emulator\emulator.exe'
$device = 'emulator-5554'
if (-not (Test-Path $adb) -or -not (Test-Path $emulator)) {
    throw "Android SDK platform-tools and emulator are required at $sdk"
}

function Invoke-AdbProbe {
    param([string[]]$ProbeArguments)
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $adb
    $start.Arguments = $ProbeArguments -join ' '
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $probe = New-Object System.Diagnostics.Process
    $probe.StartInfo = $start
    try {
        [void]$probe.Start()
        $output = $probe.StandardOutput.ReadToEndAsync()
        $errors = $probe.StandardError.ReadToEndAsync()
        if (-not $probe.WaitForExit(8000)) {
            $probe.Kill()
            return ''
        }
        if ($probe.ExitCode -eq 0) { return $output.GetAwaiter().GetResult() }
        return ''
    } finally { $probe.Dispose() }
}

$devices = Invoke-AdbProbe -ProbeArguments @('devices')
if (-not ($devices -match "(?m)^$device\s")) {
    # Do not start a second instance while the existing AVD is reconnecting.
    $running = Get-CimInstance Win32_Process -Filter "name='qemu-system-x86_64.exe'" |
        Where-Object { $_.CommandLine -match '-port\s+5554' }
    if (-not $running) {
        # Cold boot avoids restoring the unresponsive Quick Boot state.
        Start-Process -FilePath $emulator -ArgumentList '-avd', 'Medium_Phone', '-port', '5554', '-no-snapshot'
    }
}

$deadline = (Get-Date).AddMinutes(4)
Write-Host "Waiting for Android emulator $device to finish booting..."
while ((Get-Date) -lt $deadline) {
    $devices = Invoke-AdbProbe -ProbeArguments @('devices')
    if ($devices -match "(?m)^$device\s+device\s*$") {
        $booted = Invoke-AdbProbe -ProbeArguments @('-s', $device, 'shell', 'getprop', 'sys.boot_completed')
        if ($booted.Trim() -eq '1') {
            Write-Host "Android emulator $device is ready."
            exit 0
        }
    }
    Start-Sleep -Seconds 2
}
throw "Android emulator $device did not finish booting within 4 minutes."
