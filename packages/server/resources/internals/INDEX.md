# Hammoc Internals (Agent-Only Reference)

This folder documents Hammoc's internal mechanisms that an in-IDE agent may need to read or correlate, but that are deliberately omitted from the user-facing manual. The user does not need to know any of this; the agent does.

## How to use

Read individual entries **on demand** when the user's request involves the underlying mechanism (for example: correlating an attached image with a file on disk, understanding how a session ID maps to a JSONL file). Do not pre-load this folder.

## Entries

- [Image Storage](./image-storage.md) — On-disk path and filename scheme for chat-attached images
- [Harness File Layout](./harness-files.md) — Where `.claude/` items (skills, commands, agents, hooks, MCP servers, `CLAUDE.md`) live on disk, when changes take effect, and how the Secret-on-Shared guard relates to direct file writes

## Maintenance

Add a new file here whenever there is internal behavior the agent needs to act on but the user does not need to see. Likely future entries:

- Session ID and project-path slug encoding under `~/.claude/projects/`
- JSONL message tree structure (parent/child UUIDs, branching)
- Permission-mode internal effects on the SDK call
- Snippet resolution order and substitution rules

Each new file should describe the on-disk reality (paths, formats, lifecycle), not the user-facing UI behavior — that belongs in the user manual.
