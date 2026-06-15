# Performance Audit - 2026-06-14

## Measured Media Inventory

| Asset | Resolution | Duration (s) | Bitrate (Mbps) | Size (MB) | Notes |
|---|---:|---:|---:|---:|---|
| Opens.mp4 | 1920x1080 | 30.89 | 19.66 | 75.91 | Hero background, most expensive asset |
| For T11.mp4 | 1920x1080 | 301.37 | 1.77 | 66.52 | Long-form card media |
| Writing and editing.mp4 | 1920x1080 | 72.34 | 6.28 | 56.83 | Card media, high bitrate |
| For Studio 3.mp4 | 1280x720 | 278.38 | 1.10 | 38.37 | Long-form card media |
| Backgrounds.mp4 | 1920x1080 | 15.25 | 13.06 | 24.89 | Featured reel in modal |
| Commercials.mp4 | 1920x1080 | 45.07 | 2.02 | 11.40 | Card media |

Total MP4 footprint in repository: ~273.9 MB.

## Estimated Highest-Impact Wins

1. Re-encode Opens.mp4 (hero background) to 720p, 24fps, target 1.5 Mbps.
- Estimated size drop: 75.9 MB -> ~6 to 9 MB.
- Estimated savings: ~67 to 70 MB.

2. Re-encode Backgrounds.mp4 (featured reel) to 1080p target 3.5 Mbps or 720p target 2.2 Mbps.
- Estimated size drop: 24.9 MB -> ~4 to 7 MB.
- Estimated savings: ~18 to 21 MB.

3. Create short preview cuts for media wall (8-20 seconds each) instead of full-length files.
- Estimated transfer reduction for card previews: 50 to 85% depending on cut length.
- Biggest absolute wins: For T11.mp4 and For Studio 3.mp4.

4. Convert Harvey Pic.png to WebP/AVIF and keep PNG fallback.
- Source size: 1.89 MB.
- Typical savings: 35 to 65% with quality-tuned WebP/AVIF.

## Ready-to-Run ffmpeg Commands

Run from repository root.

```powershell
New-Item -ItemType Directory -Force assets/images/optimized | Out-Null

# 1) Hero background optimized loop
ffmpeg -y -i "assets/images/Opens.mp4" -vf "scale=-2:720,fps=24" -an -c:v libx264 -profile:v high -preset slow -crf 24 -maxrate 1500k -bufsize 3000k -movflags +faststart "assets/images/optimized/Opens-hero-720p.mp4"

# 2) Featured reel optimized
ffmpeg -y -i "assets/images/Backgrounds.mp4" -vf "scale=-2:1080,fps=30" -c:v libx264 -profile:v high -preset slow -crf 22 -maxrate 3500k -bufsize 7000k -c:a aac -b:a 128k -movflags +faststart "assets/images/optimized/Backgrounds-reel-1080p.mp4"

# 3) 12-second card preview example (repeat pattern per file)
ffmpeg -y -ss 00:00:05 -t 12 -i "assets/images/For T11.mp4" -vf "scale=-2:720,fps=24" -an -c:v libx264 -preset slow -crf 24 -maxrate 1500k -bufsize 3000k -movflags +faststart "assets/images/optimized/For-T11-preview-720p.mp4"

# 4) Optional WebM companion for better compression
ffmpeg -y -i "assets/images/Opens.mp4" -vf "scale=-2:720,fps=24" -an -c:v libvpx-vp9 -b:v 0 -crf 33 -row-mt 1 -deadline good "assets/images/optimized/Opens-hero-720p.webm"
```

## Integration Checklist

- Replace current MP4 references in HTML with optimized files in assets/images/optimized.
- Keep preload="none" for non-hero videos.
- Keep only one autoplaying background video and pause it for Save-Data users.
- Add poster frames for all video elements (already present).
- Verify output quality on desktop and mobile before final replacement.

## Suggested Verification

- Lighthouse Performance should improve mainly in LCP/TBT due to lower decode and network pressure.
- Compare before/after in DevTools Network:
  - Transferred bytes for media requests.
  - Time to first frame for hero background.
  - Main-thread activity during initial scroll.
