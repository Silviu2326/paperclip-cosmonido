# Motor Video rendering in Paperclip

Paperclip can queue a `motor_video_render` job for a `motor_video` media project. The job accepts a Motor Video JSON specification and publishes the rendered MP4 into the project's issue as a media work product, or as a company asset when the project is not linked to an issue.

## Server runtime configuration

Motor Video is an optional external runtime dependency. Install and provision the Motor Video CLI, its Remotion packages, a compatible browser, and FFmpeg in the Paperclip server/worker runtime. Then set:

- `PAPERCLIP_MOTOR_VIDEO_ENTRY`: absolute path to the installed Motor Video CLI `.mjs` entry point. Paperclip invokes it with its own Node executable; the CLI and its workspace dependencies must be present in the deployed runtime.
- `PAPERCLIP_MOTOR_VIDEO_BROWSER`: optional absolute path to the provisioned Chromium/Chrome executable. When set, Paperclip passes it to the CLI. Provision the browser ahead of time; do not depend on the worker downloading one during a render.
- `PAPERCLIP_MOTOR_VIDEO_TIMEOUT_MS`: optional render timeout from 60,000 to 3,600,000 milliseconds. Invalid or missing values use 1,800,000 milliseconds.

The Paperclip server stages inputs in a fresh temporary directory, invokes the configured entry point without a shell, waits for the child process to exit, and removes the temporary directory afterward. The executable, Node runtime, browser, FFmpeg, available memory, and disk capacity must be provisioned by the deployment. A sibling source checkout is not a production dependency and is never located by a hard-coded path.

Queued media jobs can be cancelled through `POST /api/media-jobs/{id}/cancel`. A running Motor Video render receives an abort signal and moves through `cancel_requested` to `cancelled`; once output publication starts, its `finalizing` state is no longer cancellable. Other active media processors do not support cancellation.

## Supported action boundary

- Video specifications must use explicit scene durations. Paperclip uses their timeline to reserve any configured video-minute quota before rendering; automatic scene durations are rejected.
- Asset references must be Paperclip asset UUIDs in `{ "asset": "<uuid>" }` objects. Paperclip checks company ownership, copies the authorized asset bytes to the job directory, and rewrites each reference to a controlled relative path before invoking the CLI. Arbitrary local paths are never accepted from an agent.
- A render can reference up to 200 assets and 512 MiB of combined input data. The output is limited to 2 GiB.
- Pending AI image-generation nodes are rejected. Add a separate image provider and permission before enabling them.
- Speech lines, cast-driven dialogue, and text-to-speech voiceovers are rejected until a Paperclip TTS provider and voice-generation permission are connected. A supplied audio asset can be referenced as an asset.
- `audio.music.generate` is allowed because Motor Video creates that music locally and deterministically; it does not call an external music provider.
- Renders run with Motor Video's `--qa` option. Successful outputs are stored through Paperclip storage and associated with the project and issue.

The CLI is not bundled in Paperclip today. A deployment must supply the CLI package and its runtime dependencies before this action is available; a missing configuration produces a failed media job with a clear server-side error.
