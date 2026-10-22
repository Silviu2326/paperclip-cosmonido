---
name: burned-subtitles-style
description: Create readable, accurate burned-in captions for short video, using transcript timings and the supplied brand style without obscuring the subject or inventing emphasis.
key: paperclipai/optional/content/burned-subtitles-style
recommendedForRoles:
  - video-editor
  - content-producer
tags:
  - video
  - captions
  - accessibility
---

# Burned Subtitles Style

Use the transcript to create accurate, readable captions that remain legible on the requested aspect ratio.

## Rules

- Correct obvious transcription errors only when the audio supports the correction; preserve names and technical terms from approved context.
- Break captions at natural phrase boundaries. Keep each card short enough to read at speaking speed.
- Follow supplied brand colors, typeface, and position. When no style is supplied, use a high-contrast, unobtrusive treatment.
- Keep text away from faces, interface controls, and platform-safe-area edges.
- Use emphasis sparingly and only where it matches spoken stress. Do not change meaning to make a caption punchier.
- Render a short preview and inspect timing, spelling, contrast, and clipping before exporting the full video.

Submit the rendered version with a note describing any transcription uncertainty that could affect meaning.
