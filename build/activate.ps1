param(
  [Parameter(Mandatory=$true)][string]$LicenseKey,
  [Parameter(Mandatory=$true)][string]$OutputFile
)
$ErrorActionPreference = 'Stop'
$SupabaseUrl = 'https://redkjjglxdouxplcljil.supabase.co'
$PublishableKey = 'sb_publishable_3KBgfOWVfFapMfs_chTH-w_W8uWpfYc'
try {
  $machineGuid = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Cryptography').MachineGuid
  $raw = "$machineGuid|$env:COMPUTERNAME"
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($raw)
  $deviceHash = ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()
  $body = @{ p_license_key=$LicenseKey.Trim().ToUpperInvariant(); p_device_hash=$deviceHash; p_app_version='0.1.0' } | ConvertTo-Json -Compress
  $headers = @{ apikey=$PublishableKey; Authorization="Bearer $PublishableKey" }
  $result = Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/rpc/activate_license" -Method Post -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 20
  if (-not $result.success) { Write-Output ($result.message); exit 9 }
  $payload = @{
    license_key=$LicenseKey.Trim().ToUpperInvariant()
    activation_token=$result.activation_token
    device_hash=$deviceHash
    activated_at=$result.activated_at
  } | ConvertTo-Json -Compress
  [System.IO.File]::WriteAllText($OutputFile,$payload,[System.Text.UTF8Encoding]::new($false))
  Write-Output 'OK'
  exit 0
} catch {
  Write-Output $_.Exception.Message
  exit 10
}
