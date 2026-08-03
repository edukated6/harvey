param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseId,

  [Parameter(Mandatory = $true)]
  [string]$AdminKey,

  [string]$AllowedOrigin = "https://theharveyeffect.com"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "Installing worker dependencies..." -ForegroundColor Cyan
npm install

Write-Host "Applying database schema..." -ForegroundColor Cyan
npx wrangler d1 execute harvey-analytics --file ./schema.sql

Write-Host "Setting admin secret..." -ForegroundColor Cyan
$AdminKey | npx wrangler secret put HARVEY_ANALYTICS_ADMIN_KEY

Write-Host "Updating wrangler.toml database id and origin..." -ForegroundColor Cyan
(Get-Content ./wrangler.toml -Raw) `
  -replace 'database_id\s*=\s*"[^"]+"', "database_id = \"$DatabaseId\"" `
  -replace 'ALLOWED_ORIGIN\s*=\s*"[^"]+"', "ALLOWED_ORIGIN = \"$AllowedOrigin\"" |
  Set-Content ./wrangler.toml

Write-Host "Deploying worker..." -ForegroundColor Cyan
npx wrangler deploy

Write-Host "Done. Update java/analytics-config.js with your deployed workers.dev URL." -ForegroundColor Green
