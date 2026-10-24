# Changelog

All notable changes to Vibe Plugin are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-24

First open-source release.

### Added
- Premiere Pro panel with YouTube search and link paste for YouTube, Instagram, TikTok, Facebook, X, Vimeo and Reddit
- Format picker with automatic VP9/AV1 to H.264 + AAC conversion for Premiere compatibility
- M4A, MP3 and WAV audio downloads
- "Cut a section" filmstrip trimmer with frame-accurate cuts
- Import into a "Vibe Downloads" bin, with optional placement on the timeline at the playhead
- **InnerTube fast path** - single YouTube videos resolve in a fraction of a second, with automatic fallback to `yt-dlp`
- **Subtitles tab** - every caption language as SRT or VTT, with retry on YouTube rate limiting
- **Audio-language picker** for dubbed videos
- Self-installing and daily self-updating `yt-dlp`, QuickJS and FFmpeg helpers
- PC-aware performance profiles (Gentle, Balanced, Fast, Maximum) and low-priority FFmpeg
- Download queue with real progress, retry and cancel
- Optional browser login cookies
- **One-click installers** built by GitHub Actions on every `v*` tag: a Windows `.exe` (per-user, no admin), a macOS `.pkg` and a portable `.zip`, published with `SHA256SUMS.txt`
