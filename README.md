# Cute Cut

A small video editor that runs entirely in your browser. No account, footage upload, or server-side encoding is required. The engine downloads from this same site the first time you import a video.

## Features

- Video preview above a single-track timeline
- Trim by dragging clip edges or entering exact seconds
- Split, delete, reorder, undo and redo
- Per-clip volume, mute, and embedded audio-track selection
- Extract one embedded audio track or all tracks as separate WAV/M4A files
- Extract the entire recording or the selected trimmed range
- MP4 export with H.264 video and AAC audio

Multi-track OBS recordings are supported when their audio sources were recorded as separate streams. This cannot separate sources that were mixed into a single audio track. Video export uses one chosen audio track per clip. Stereo channels remain together when extracting audio.

## Use

Import a video or drag it into the preview. Use the + button on a media card to add footage to the timeline. Click the ruler to scrub, select a clip to edit it, and use Export video when finished. Audio extraction is available on media cards and in Clip settings.

Space: play/pause. S: split. Delete: remove. Ctrl+Z: undo. Ctrl+Shift+Z: redo.

This is an early browser edition. Projects exist only in the current tab; export before closing or refreshing. Browser memory and codec support limit large recordings. Inputs of 2 GB or more are rejected, and smaller files can still exceed available memory. Native desktop FFmpeg is faster for long OBS recordings. Chrome or Edge on desktop is recommended. Importing, export and audio-preview preparation may take time. No footage is uploaded.

## Hosting and updates

This repository is a ready-to-serve static site: there is no Node backend or build step.

For Cloudflare Pages Git integration:

- Production branch: `main`
- Framework preset: None
- Build command: leave blank
- Build output directory: `/`
- Root directory: leave blank
- Environment variables: none

Pushes to main automatically deploy after Git integration is connected. Files must remain together at the site root. The `_headers` file supplies HTTP response headers on Cloudflare Pages. The compressed WASM engine is under Cloudflare's per-file size limit; engine.js decompresses it in the browser.

## Development

Serve this folder over HTTP on localhost with any static server; opening index.html directly with file:// does not support workers. No dependencies need to be installed. app.js handles the interface; engine.js runs operations in a Web Worker through FFmpeg.wasm. Input Files are mounted using WORKERFS so the entire original is not copied into the WASM filesystem at import time. Generated output and previews remain browser-local.

## Third-party software

See THIRD-PARTY-NOTICES.txt. The bundled FFmpeg.wasm engine is GPL-2.0-or-later. The application source is distributed under GPL-3.0-or-later (see LICENSE). No credentials, user media, or test recordings are part of this repository.
