# Converter («Конвертер»)

Category: computer. Local only, no settings (`settings: false`). Declares one optional download: `ffmpeg`.

## What it does
One phrase converts files:
- images: png/jpg/webp/heic/tiff/gif/svg/bmp → png/jpg/webp/tiff/gif, resize by the longer side, quality/compression, strip metadata;
- video: mp4/mov/webm/mkv/avi → mp4/mov/webm/gif, trim, scale (1080p/720p/480p), fps, compress to a target size
  (bitrate = 95% of the budget over the length, 96 kbit/s for sound, at least 100 kbit/s for the picture; the card says
  when the target was too small for the length);
- audio: wav/mp3/ogg/m4a/flac → mp3/wav/ogg/m4a, loudness normalization (EBU R128 `loudnorm`), stronger compression;
- documents: docx/pptx/xlsx/odt/… → pdf through LibreOffice (`soffice --headless --convert-to pdf`) when installed;
- batches: a folder, optionally with a mask (`~/Pictures/*.png`, «png в папке …» → `*.png`), recursively on request
  («рекурсивно», «во вложенных»), up to 500 files; hidden files are skipped.

Files come from chat attachments (their original paths), paths in the phrase (absolute, `~/…`, «quoted with spaces»),
or a clarification through the shared question panel («Какие файлы конвертировать?»); a missing format is asked with
choices.

The chat turn only plans. The card shows the input files with thumbnails (Electron `nativeImage.createThumbnailFromPath`,
Quick Look / shell thumbnails on macOS/Windows), the operation as editable chips (format, size, quality, target weight,
height, fps, trim, metadata, loudness, output folder), the estimated result size as bars, and «Конвертировать». Files are
written only after that press. While running: per-file progress bars (ffmpeg `-progress` against the probed length),
«Отменить» (kills the tool, removes the partial file), notification center card `converter:<job>` with «Отменить».
Results: before → after bars per file with the change in percent and «Показать в Finder / в Проводнике». The result is
kept in the chat message (`extensionData.converterCard.result`).

## Never overwriting
Outputs go next to the sources with a suffix that says what was done (`photo-1024px.webp`, `clip-10mb.mp4`,
`talk-normalized.mp3`, `a-compressed.jpg`), or into a folder chosen in the card. A taken name gets ` (2)`, ` (3)`…;
the source path is never an output. LibreOffice and Quick Look write into a private temporary folder and the file is
moved into place. A failed or cancelled file leaves nothing behind.

## Tools
Detected on PATH and in the usual folders (Homebrew, `/Applications/LibreOffice.app`, Program Files) and in Petya's own
ffmpeg folder: `ffmpeg`/`ffprobe`, macOS `sips`, `afconvert`, `qlmanage`, `cwebp`, `soffice`, ImageMagick `magick`,
`exiftool`, `rsvg-convert`. Choice per file: cwebp for webp; sips on macOS for png/jpg/tiff/gif/heic; exiftool for
lossless metadata stripping; rsvg-convert / ImageMagick / Quick Look for svg; afconvert for wav/m4a on a Mac without
ffmpeg; ffmpeg for everything else (it is the main dependency: all video, most audio).

## ffmpeg download
When a plan needs ffmpeg and none is installed, the card offers «Скачать ffmpeg». It asks for approval like the Artist
(the shared «Спрашивать перед загрузкой больше N МиБ» limit, then a dialog with the size and source), shows progress in
the notification center (`converter-ffmpeg`, «Отменить»), checks free space, verifies SHA-256, unpacks
(`ditto` / `tar.exe`), runs `ffmpeg -version`, then moves it to `<userData>/converter/ffmpeg-<version>/`.
Pinned sources (`ffmpeg-install.cjs`):
- Windows x64: gyan.dev essentials release build 8.1.2 (the Windows build linked from ffmpeg.org),
  `https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-8.1.2-essentials_build.zip`,
  SHA-256 `db580001caa24ac104c8cb856cd113a87b0a443f7bdf47d8c12b1d740584a2ec` (from its published `.sha256`).
- macOS arm64 / x64: Martin Riedl's FFmpeg build server, static release 9.0.2
  (`https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2/ffmpeg.zip`, `…/macos/amd64/1789931006_9.0.2/ffmpeg.zip`,
  plus `ffprobe.zip`). evermeet.cx (named in the brief) builds only Intel binaries and publishes GPG signatures, not
  SHA-256, so the per-architecture Riedl builds were chosen.

**Not pinned yet:** the build environment could not download from these hosts (egress policy; the Riedl `.sha256` files
are robots-protected for the fetch tool), so the macOS SHA-256 values are empty and exact byte sizes are unknown.
Until filled, the Mac download is refused with «установите ffmpeg: brew install ffmpeg» (a system ffmpeg is used as is),
and the catalog shows approximate sizes (`"approx": true`: ~70 MB on macOS for ffmpeg + ffprobe, ~109 MB on Windows).
Run `node src/extensions/converter/pin-ffmpeg.cjs` on a machine with access and paste the printed `bytes`/`sha256` into
`SOURCES` (setting `bytes` makes the size check exact) and into `extension.json` "downloads".
`downloads.cjs` reports ffmpeg as present when Petya's copy or a system ffmpeg exists.

## Phrases
Own: «сожми видео до 10 МБ», «конвертни png в webp», «сделай гифку из видео», «переведи docx в pdf», «уменьши картинки в
папке до 1024», «сконвертируй mov в mp4», «убери метаданные из фото», «нормализуй громкость в аудио».
Near-misses (no turn, no offer): «конвертер валют», «переведи текст на английский», «сожми ответ», «переведи 100 долларов
в рубли», «переведи это письмо», «переведи задачу в другой статус», «конвертируй километры в мили», «сделай скриншот».

## Verified
- Unit (`node tests/converter.cjs`): fake `ffmpeg`, `ffprobe`, `cwebp`, `soffice`, `sips` Node scripts on PATH; plans,
  tool choice, names, progress, cancel, errors, originals' hashes unchanged, the turn with clarifications, card edits,
  start/status/reveal, pinned download with stubbed fetch/unpack (integrity mismatch, size cap, declined approval).
- UI (`tests/converter-ui.cjs`): four cards (images plan with thumbnails, video needing ffmpeg, a running batch, finished
  audio with an error), screenshots `petya-converter.png`, `petya-converter-progress.png` in the temp folder.
- Live on Linux with real ffmpeg 6.1 and LibreOffice: png → 1024 px png, png → webp, mov → 50 KB target (reported as not
  reachable), mov → gif 1–3 s at 10 fps (480×270, 2.0 s), wav → normalized mp3, docx → pdf.
- Not verified: macOS `sips`/`afconvert`/`qlmanage`, Windows paths, thumbnails from Quick Look/Explorer, the real ffmpeg
  download (see «Not pinned yet»).
