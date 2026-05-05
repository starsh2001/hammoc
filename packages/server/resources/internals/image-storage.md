# Image Storage

When the user attaches an image to a chat message, Hammoc saves it under **Claude Code's per-project session data**, not inside the project being worked on. The user does not see this — they just attach and send. This document is for an agent that needs to read or correlate the file directly.

## On-disk location

```
<homeDir>/.claude/projects/<encoded-project-path>/images/<sessionId>/<filename>
```

- `<homeDir>` — User home directory (Read/Edit tools do not expand `~`, so resolve to the absolute path first).
- `<encoded-project-path>` — Claude Code's project slug. Path separators (`/`, `\`) and colons (`:`) in the original project path are replaced with hyphens. Example: `D:\repo\hammoc` → `D--repo-hammoc`.
- `<sessionId>` — UUID of the chat session containing the message.
- `<filename>` — `<sha256-prefix-16chars>.<ext>` for the original. Thumbnails use `<sha256-prefix-16chars>_thumb.<ext>`.
- `<ext>` — One of `.png`, `.jpg`, `.gif`, `.webp`.

## Supported MIME types

| MIME | Extension |
|---|---|
| image/png | .png |
| image/jpeg | .jpg |
| image/gif | .gif |
| image/webp | .webp |

Anything else is rejected at attach time.

## How an agent reaches these files

- The chat message references each image via the API URL `/api/projects/<projectSlug>/sessions/<sessionId>/images/<filename>`. That URL is for the **browser** to render thumbnails — it is not a file-system path and Read tools cannot use it directly.
- To open the file from disk, build the absolute path under `<homeDir>/.claude/projects/...` using the rules above, then call Read with that path.

## Lifecycle

- Images are written the moment the user sends a message with attachments.
- A session's `images/<sessionId>/` directory is removed when the session itself is deleted.
- Filenames are content-addressed (sha256 prefix), so attaching the same image bytes twice within a session reuses the same filename — automatic deduplication.

## Limits

- 5 images per message
- 10 MB per image
- Total per-session storage is bounded only by disk; there is no automatic eviction other than session deletion.
