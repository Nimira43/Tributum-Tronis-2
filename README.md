# Tribūtum Trōnis — *The Dubsar Systema*

A neon fan tribute to the Tron films. You fly forward over an endless glowing grid as light cycles race, crash and derez around you. Throw the identity disc at the grid, or drop into the arena and ride your own light cycle against AI rivals.

Built with plain **HTML, CSS and JavaScript**: no frameworks, no build step, no libraries.

---

## Features

### Title screen

- **3D perspective grid** drawn on a canvas. The camera moves forward while the mouse shifts it, tilts it and banks it slightly.
- **360° backdrop** with twinkling stars, mountain ridges and two wireframe cities with lit windows and blinking spires.
- **AI light cycles** that turn on the grid lines and leave light walls behind them. When they hit a wall they **derez** into falling particles with a flash of light.
- **3D identity disc** built from layered SVG rings so it has visible thickness. It tilts with the mouse and glows on hover.
- **Disc throw:** click the disc to send it spinning into the distance. It hits the grid, sends out a shockwave that derezzes any cycle it reaches, then flies back.
- **Boot sequence**, CRT scanlines, a glitching title and a full HUD (nav panel, grid status, energy meter and a live system log).

### Playable arena mode

- **Chase camera** behind your own light cycle that swings round on every turn.
- **Rounds:** last rider standing in a walled arena. Round 1 has 3 rivals, with one more each round up to 7, and they get faster each round.
- **AI rivals** that steer away from walls, avoid head-on crashes and try to cut you off. They get sharper and more aggressive in later rounds.
- **Boost:** hold to speed up. It drains an energy bar, the camera pulls back and the view widens.
- **Scoring**, with your best score saved in the browser.
- **Touch controls** on phones and tablets.

### Everywhere

- **Allegiance switch:** cyan (hero) or orange (villain). It recolours the whole scene, including the rivals.
- **Synthesised sound**, off by default. Everything is generated with the Web Audio API: an ambient drone, disc throw and impact, crashes, an engine whose pitch follows your speed, countdown beeps and a short tune when you clear a round.
- **Responsive** layout for narrow screens.
- **Reduced motion:** if the system's reduced-motion setting is on, the motion is toned down.

---

## Controls

### Title screen

| Input | Action |
| --- | --- |
| Mouse | Move and tilt the camera and the disc |
| Click the disc | Throw the identity disc (uses disc energy) |
| `P` | Enter the arena |
| `C` | Switch allegiance (cyan ↔ orange) |
| `M` | Sound on / off |
| Any key / click | Skip the boot sequence |

### Arena

| Input | Action |
| --- | --- |
| `←` / `→` or `A` / `D` | Turn left / right 90° |
| Hold `Space`, `↑` or `W` | Boost |
| `Space` / `Enter` | Ride again after being derezzed |
| `Esc` | Back to the title screen |
| `C` / `M` | Allegiance / sound, as above |
| Touch: ◄ BOOST ► | On-screen controls on phones and tablets |

---

## Scoring

| Event | Points |
| --- | --- |
| Staying alive | 10 per second |
| A rival rides into **your** light wall | +250 |
| Clearing a round | +500 × round number |

Hitting any wall derezzes you: a rival's wall, the arena edge or **your own**. Two cycles meeting head-on both derez.

---

## Project structure

```
.
├── index.html     # Page structure: canvas, title, disc, HUD, overlay, touch controls
├── styles.css     # Theme colours, layout, HUD, disc 3D transforms, animations
├── script.js      # Rendering, light-cycle AI, collisions, game logic, audio
└── images/
    └── TheFavicon.png
```

---

## Running it

It's a static site, so open `index.html` in a browser.

For best results, serve it locally so fonts and paths behave the same as when it's hosted:

```bash
# Python
python -m http.server 8000

# or Node
npx serve .
```

Then visit `http://localhost:8000`.

Fonts (**Audiowide**, **Oxanium**, **Share Tech Mono**) load from Google Fonts. Without a connection the page still works, using system fallback fonts.

---

## How it works

- **Rendering:** one full-screen `<canvas>` with a small hand-written 3D projection. World points are converted into the camera's view using its position, height and turn angle, and anything behind the camera is clipped off.
- **Glow:** a cheap bloom effect. Each frame is copied to a quarter-size canvas, blurred with `ctx.filter`, then added back over the scene with additive blending. Browsers without canvas filters skip it.
- **Light walls** are drawn in short pieces so each one can fade with its own distance, and walls very close to the camera fade out so they never fill the screen.
- **Collisions:** every wall runs straight along one axis, so the code only has to check walls that cross a cycle's path. One function returns how far a cycle can travel before hitting something and who owns the wall it would hit. The AI uses the same function to look ahead, and the score uses the wall's owner to know who to credit.
- **The disc** is pure CSS 3D. Each wrapper element handles one transform (float, throw, tilt, spin and idle spin) so they never override each other. The throw uses the Web Animations API.
- **The sky** wraps a full 360° so stars, mountains and cities turn correctly with the chase camera.
- **Audio** is generated live with Web Audio oscillators and filtered noise. There are no audio files.

---

## Credits

A fan tribute made out of love for *TRON* (1982) and *TRON: Legacy* (2010). All visuals and sounds here are original, and the project isn't affiliated with or endorsed by Disney. TRON and related names are trademarks of their respective owners.

Built by **Nick Rabone**.
