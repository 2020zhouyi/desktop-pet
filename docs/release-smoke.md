# Release Smoke Checklist

This checklist is for the first publishable Desktop Pet MVP build. It is manual because the key checks are native window behavior: transparency, always-on-top, click-through, drag, and picker layout.

## Before Smoke

Run the release gate from the project root:

```sh
npm run preflight
rm -rf release
npm run dist:all
npm run package:verify
```

`rm -rf release` is only for `desktop-pet-mvp/release`. Do not clean any parent directory, `~/.codex/pets`, `desktop-pet-site`, `petdex`, or generator output.

## Start The App

Use the packaged macOS app when available:

```sh
open release/mac*/Desktop\ Pet\ MVP.app
```

If you are only checking a development build:

```sh
npm run dev
```

## Native Window

- The desktop pet window has a transparent background; no solid rectangle is visible around the sprite.
- The pet stays above ordinary app windows.
- Dragging the visible pet body moves the window.
- Transparent atlas pixels do not capture clicks meant for windows behind the pet.
- Releasing after a fast drag gives a short inertial glide and keeps the pet on screen.

## Interaction

- Clicking the visible pet without dragging plays the wave animation.
- Right-clicking the pet opens the native context menu.
- The control bar appears on hover and does not permanently cover the pet.
- Resizing with the bottom-right handle keeps the sprite visible and usable.

## Picker And Pets

- The default pet loads on first start.
- The picker opens from the context menu or control bar.
- Search, source filter, and faction filter narrow the picker without layout overflow.
- The selected pet shows built-in/imported status plus manifest metadata or a resource hint.
- Pet switching updates the visible sprite and plays the switch feedback animation.
- Import controls are visible but do not auto-sync or modify `~/.codex/pets`.
- Closing the picker returns the window to pet size without a visible offset jump.

## Settings

- Opening settings shows size, opacity, always-on-top, launch-at-login, speech bubble, proactive reminder, and interaction mode controls.
- Size and opacity changes apply to the visible pet.
- Always-on-top and launch-at-login toggles save without crashing on the current platform.
- Changing the interaction mode persists after closing and reopening the app.
- Disabling speech bubbles hides bubbles while direct click/drag animations still play.
- Disabling proactive reminders stops welcome/idle/long-session prompts.
- Sleep mode suppresses proactive behavior; wake restores ordinary interaction.

## Local State API

With the app running, the local state API accepts a minimal state change:

```sh
curl -X POST http://127.0.0.1:7777/state \
  -H 'content-type: application/json' \
  -d '{"state":"waving","durationMs":1200}'
```

Expected result: the command returns a success JSON response and the pet waves, then returns to idle.

## Finish

- Quit the app from the context menu or OS app menu.
- Confirm no extra Electron process remains running.
- Keep `release/` as generated output; it is not intended for git.

## Evidence To Record

- Command result: `npm run preflight`, `npm run dist:all`, and `npm run package:verify`.
- Manual result: whether every checklist section above passed, plus any platform-specific exception.
- Artifact note: generated files stay under `release/` and remain untracked.
