# Polňačka

**▶ Play it: https://YOUR-GITHUB-NAME.github.io/polnacka/**

A first-person offroad driving sandbox in the browser, set in Czech farmland: gravel roads, fields, forests,
rivers with fords and bridges, traffic, races, and a living weather system (rain, hail, storm cells and tornadoes).
Four cars, you can get out and walk, and fly a camera drone. Built with [three.js](https://threejs.org)
(loaded from a CDN, no install needed). The game's text is Czech.

## Play

Open the page. Settings and your progress stay in your browser (localStorage); nothing is sent anywhere.

**Computer:** `W A S D` drive · `Space` handbrake · `Shift` nitro · `C` camera · `R` repair · `F` get out/in ·
`U` drone station · `P` weather · `T` time · `Esc` menu.

**Phone / tablet (landscape):** ◀ ▶ steer, PLYN gas, BRZDA brake, RUČNÍ handbrake, NITRO. Drag anywhere to look round.
On foot and with the drone, a floating stick on the left walks/flies. 🚪 gets in or out (stop the car first), 🛸 the drone, ⋯ more.
Phones start on **low** quality; change it in the menu. Try the touch controls on a computer with `?touch=1`.

## Run locally

```
node server.js     # http://localhost:8176
```

Any static file server works (the game is ES modules, so don't open `index.html` by double-clicking).

## Host on GitHub Pages

Settings → Pages → Deploy from a branch → `main` / root. The `.nojekyll` file is already here.

## Phones

Phones and tablets are detected automatically and get lighter graphics (lower resolution, smaller shadows, less grass/traffic).
Add `?fps=1` to the address to see the frame rate, `?pc=1` to force the full computer settings, `?mobile=1` to try the phone settings on a computer.

## License

MIT, see [LICENSE](LICENSE). Uses [three.js](https://threejs.org) (MIT, loaded from a CDN) and the Barlow fonts from Google Fonts (SIL Open Font License).
