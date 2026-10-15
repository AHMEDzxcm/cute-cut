# Cute Cut

A lightweight desktop-browser video editor. Media stays on your device; there are no footage uploads or backend encoding costs.

## Editing

- Multiple video layers. Video 1 is a connected magnetic sequence; upper tracks allow free placement.
- Drag clips before/after each other, onto another layer, or above the tracks to create a layer.
- Trim, split, copy/cut/paste, duplicate, custom speed from 0.1x to 16x, mute and volume.
- Click the ruler or blank timeline space to seek. Clip clicks select without moving the preview. Drag the playhead near either edge to scroll.
- Ctrl+wheel zooms the timeline only. Space plays/pauses unless typing. Open Shortcuts for the supported key bindings.
- Right-click a video to extract audio. Right-click its audio strip to choose an embedded audio stream. OBS multi-stream recordings are supported; mixed sources cannot be separated.
- Original, 16:9, 9:16, square, 4:5, 4:3, 3:4 and 21:9 canvases.
- Drag/resize/rotate in the preview, or use exact scale, position, rotation and alignment controls. Uniform scaling can be disabled.
- Scale, position and rotation keyframes with visible timeline diamonds and previous/next navigation.
- Color-based background removal (chroma key), plus rectangle, ellipse and split masks with rotation, feather and inversion. There is no AI retouch or automatic subject segmentation.

Tools → Freeze frame splits the selected video at the playhead and inserts a silent, three-second still between the two pieces. Drag the still edges or use Freeze duration to change its length. It preserves the selected frame’s transform/mask and works with undo, upper layers and export.

## Export

Export video renders the actual layered canvas frame by frame, in bounded batches, and mixes the selected audio streams from the original files. The export panel supports Original, 480P, 720P, 1080P, 2K and 4K resolutions; Lower, Recommended, Higher or custom video bit rates (0.1–200 Mbps); H.264 or H.265/HEVC; MP4 or MOV; and 24, 25, 30, 50 or 60 fps. The selected canvas aspect ratio is preserved. H.265 uses the isolated threaded browser engine; H.264 remains available on the single-thread fallback. Export includes transforms, keyframes, masks, chroma key, speed and volume changes. Keep the tab visible during rendering. Cancel stops after the current batch and releases its temporary files.

Projects and imported files live only in the current tab. Export before closing or refreshing. Browser memory and codec support limit large recordings. Files of 2 GB or more are rejected. Unsupported browser video codecs may import for audio extraction but cannot be previewed or exported through the canvas renderer; convert them to H.264 MP4 first.

Load / reset demo imports the included generated scenic sample only when requested. Your own recordings are never bundled with the application.

## Hosting and updates

This repository is a static site. Cloudflare Pages uses main, framework None, no build command, output directory /, no environment variables. Commits to main automatically deploy. Keep all files at the root. The _headers file configures response headers. Both compressed FFmpeg cores are loaded from this same site. Cross-origin isolation headers enable the threaded core and HEVC; browsers without isolation use the original H.264 core.

## Development and licenses

Serve the directory over HTTP on localhost. No package installation or backend is needed. The interface is split into timeline, composition, media decoding, effects and export modules. FFmpeg.wasm runs in a worker; inputs use WORKERFS and generated render batches are removed after encoding.

Application source is GPL-3.0-or-later. See LICENSE and THIRD-PARTY-NOTICES.txt for the bundled FFmpeg engine and wrapper licenses.
