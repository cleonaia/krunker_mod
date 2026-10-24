# Krunker Mod Tools

**An experimental Tampermonkey userscript for Krunker.io**

Krunker Client Tools is a personal JavaScript project exploring browser userscripts, client-side overlays, input handling, and target-selection safety checks in Krunker.io.

The project is developed and maintained by [@cleonaia](https://github.com/cleonaia).

> **Project status:** Experimental. Compatibility with the current version of Krunker.io has not been verified. The team-verification mechanism requires a trusted source of fresh team metadata and is not fully integrated with the game.

## Features

- **ESP-style overlays:** Experimental screen-space boxes and optional tracers for objects that pass the project's target-selection checks.
- **Manual RMB aim assistance:** Experimental camera and target-selection logic activated while the right mouse button is held.
- **Verified-team safety gate:** Rejects targets when team information is missing, unverified, stale, or inconsistent.
- **Local-player and teammate exclusion:** Attempts to exclude the local player and actors on the same verified team.
- **Configurable settings:** Includes controls for overlay visibility, field of view, target height, aim strength, update frequency, and overlay color.
- **Lightweight browser UI:** Provides an in-game configuration panel.
- **Local settings persistence:** Saves configuration preferences in browser local storage.
- **Safety tests:** Includes standalone unit tests for the team-verification logic.

The project does **not** implement automatic firing. Its current safety checks do not guarantee that every game object is identified correctly.

## Technology

- JavaScript (ES6+)
- Tampermonkey
- Browser DOM APIs
- `requestAnimationFrame`
- Node.js for standalone unit tests

## Requirements

- A desktop browser compatible with Tampermonkey.
- The Tampermonkey browser extension.
- Krunker.io, subject to current game compatibility.
- Node.js, only if you want to run the unit tests.

## Installation with Tampermonkey

You can install the userscript locally without publishing it to Greasy Fork.

1. Install Tampermonkey from its official website: https://www.tampermonkey.net/
2. Open the Tampermonkey dashboard in your browser.
3. Create a new userscript.
4. Replace the editor contents with the contents of `krunker-client-tools.user.js`.
5. Save the script.
6. Open Krunker.io and check the browser console for errors.

**Important:** Installation does not guarantee functionality. The current prototype depends on internal game object structures that may change. In addition, verified team metadata must be supplied by a trusted integration before targets can pass the safety gate.

## Controls

The current prototype defines the following controls:

| Control | Action |
| --- | --- |
| `F8` or backtick (`) | Toggle the configuration menu |
| `F9` | Pause or resume the script |
| `P` | Retry scene discovery |
| `F10` | Shut down the script |
| Hold right mouse button | Activate experimental manual aim assistance |

Controls may conflict with game or browser shortcuts. The menu and scene-discovery controls may not work if the game changes its internal structure.

## Configuration

The settings panel exposes options such as:

- Overlay visibility and color
- Field-of-view radius
- Target height
- Aim strength
- Update frequency
- Maximum number of tracked objects

These options describe the current prototype. They do not imply that every setting is fully compatible with every game version.

## Running the tests

The repository includes a standalone test file for the verified-team safety gate.

With Node.js installed, run:

```bash
node krunker_team_gate_tests.js
```

The expected output is:

```text
7/7 verified-team safety tests passed.
```

These tests validate the isolated team-verification logic only. They do not verify live game integration, overlay accuracy, or compatibility with Krunker.io.

## Security and limitations

- Team information must be explicitly verified and recent before a target is accepted.
- Missing, stale, future-dated, or unverified team metadata must fail closed.
- The game integration has not been independently validated.
- The script may stop working after game updates.
- This project is not an official Krunker product and is not affiliated with or endorsed by the game developers.
- Use browser userscripts only where permitted by the game's rules and applicable terms of service.

## Project structure

```text
krunker-client-tools/
├── README.md
├── krunker-client-tools.user.js
└── krunker_team_gate_tests.js
```

## Author

**GitHub:** [@cleonaia](https://github.com/cleonaia)

This repository is an experimental learning project focused on JavaScript, browser userscripts, client-side rendering concepts and fail-closed validation logic.
