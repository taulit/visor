# Marketing

Material for the launch of Visor. Nothing in this folder is part of the extension build (`scripts/build.sh` only reads `src/`, `styles/`, `schemas/`, `data/` and `po/`).

- [posts.md](posts.md): drafts for Reddit and Instagram, with notes on the rules of each subreddit.
- [video/](video/): the launch video, recorded in a sandboxed GNOME Shell and edited with [Remotion](https://www.remotion.dev/).

The website is in [`../site`](../site) (Astro Starlight, deployed by `.github/workflows/pages.yml`).

## The video

### 1. Record

```sh
pnpm build                          # in the repository root: the extension
marketing/video/record/record.sh    # or: record.sh intro search t3
```

`record.sh` starts the headless GNOME Shell of `scripts/nested.sh` (its own home, D-Bus session and keyring, never your session) at 2560×1440 with scale 2 (a 1280×720 desktop in sharp pixels; `RECORD_SIZE` changes it). The animations run 1.6 times slower while recording (`SLOWDOWN`, 1 is real speed) so the opening reads calmly; Visor follows the slow-down setting of GNOME, so these are real frames, not stretched ones. It loads the mock media player, timers, a download and two calendar events, and for the `t3` scene the module [Visor: T3 Code](https://github.com/taulit/visor-t3) with the mock server of its tests (a checkout with `pnpm build` done, in `VISOR_T3_REPO`, default `../visor-t3`; without it the `t3` scene is left out). It starts PipeWire in the sandbox and records each scene with the screencast service of GNOME Shell:

| Scene    | What happens                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------- |
| `intro`  | The clock at rest, the chips peek out, the panel opens and closes.                              |
| `search` | Typed with a virtual keyboard: a calculation, a currency, a time zone, a unit, an app, a timer. |
| `t3`     | An agent asks to run a command, the notch flashes, the row is unfolded and the command allowed. |

The clips land in `video/public/clips/<scene>.mp4` (30 fps) with `<scene>.json`, the time of each step. The edit cuts by those times, so a new recording keeps the cuts in place. Needs `pipewire`, `wireplumber`, `ffmpeg`, `magick` and GNOME Shell 50.

The clock in the clips shows the real time of the recording, and the app search shows the apps installed on the recording machine.

### 2. Edit and render

```sh
cd marketing/video
pnpm install
pnpm studio        # preview and adjust in the browser
pnpm render        # all three videos into out/
pnpm render:og     # the Open Graph image of the website (site/public/og.png)
```

| Composition    | File                        | Size      | Length |
| -------------- | --------------------------- | --------- | ------ |
| `Reddit`       | `out/visor-reddit-16x9.mp4` | 1920×1080 | 57 s   |
| `RedditSquare` | `out/visor-reddit-1x1.mp4`  | 1080×1080 | 57 s   |
| `Reel`         | `out/visor-reel-9x16.mp4`   | 1080×1920 | 28 s   |

The two edits are in `src/edits.ts`: each shot names a clip, the part of it, the camera (rectangles of the recording) and the captions. They are calm on purpose: one framing per shot and at most one slow camera move. `src/Shot.tsx` fits a rectangle into the frame; the square and the reel put the recording in a card with the caption below.

The clips and renders are not committed (`.gitignore`); record and render them again as above. The website keeps its own small copy of the 16:9 video in `site/public/media/`.
