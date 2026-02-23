# Generate queue list from sharded PRD
# Usage: .\generate-queue.ps1 [-PrdFile path] [-TemplateFile path] [-OutputFile path]

param(
    [string]$PrdFile = "docs\prd\6-epic-details.md",
    [string]$TemplateFile = "story-queue-tmpl.txt",
    [string]$OutputFile = ".qlaude-queue"
)

# Check files exist
if (-not (Test-Path $PrdFile)) {
    Write-Error "PRD file not found: $PrdFile"
    exit 1
}
if (-not (Test-Path $TemplateFile)) {
    Write-Error "Template file not found: $TemplateFile"
    exit 1
}

# Read files
$prdContent = Get-Content $PrdFile -Raw -Encoding UTF8
$template = Get-Content $TemplateFile -Raw -Encoding UTF8

# Extract story numbers (### Story X.Y pattern)
$storyPattern = '### Story (\d+\.\d+)'
$matches = [regex]::Matches($prdContent, $storyPattern)

if ($matches.Count -eq 0) {
    Write-Error "No stories found in PRD file"
    exit 1
}

$stories = $matches | ForEach-Object { $_.Groups[1].Value }
Write-Host "Found $($stories.Count) stories: $($stories -join ', ')"

# Group by epic
$epicGroups = @{}
foreach ($story in $stories) {
    $epicNum = $story.Split('.')[0]
    if (-not $epicGroups.ContainsKey($epicNum)) {
        $epicGroups[$epicNum] = @()
    }
    $epicGroups[$epicNum] += $story
}

# Generate output
$output = @()
$epicNumbers = $epicGroups.Keys | Sort-Object { [int]$_ }

for ($i = 0; $i -lt $epicNumbers.Count; $i++) {
    $epicNum = $epicNumbers[$i]

    # Add epic separator (except first)
    if ($i -gt 0) {
        $output += "@pause"
    }

    # Add queue items for each story
    foreach ($storyNum in $epicGroups[$epicNum]) {
        $storyQueue = $template -replace '\{story_num\}', $storyNum
        $output += $storyQueue.TrimEnd()
    }
}

# Write output
$output -join "`n" | Out-File -FilePath $OutputFile -Encoding UTF8 -NoNewline
Add-Content -Path $OutputFile -Value "" -NoNewline

Write-Host "Generated queue with $($stories.Count) stories across $($epicNumbers.Count) epics"
Write-Host "Output written to: $OutputFile"
