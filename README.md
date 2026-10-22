# FIGHTLIVES ⚔️

A quick, punchy 1v1 online sword duel that runs entirely in the browser and hosts on GitHub Pages. Best of 5 rounds; between rounds both fighters draft one of three random upgrades (swords, armor, effects) that stack into a build.

## Play

- **Host a match** → share the 4-letter room code (or the invite link) with a friend.
- **Join** → type their code.
- **Practice vs Bot** → offline training mode.

| Action | Keys |
|---|---|
| Move | `A` / `D` or `←` / `→` |
| Light attack | `J` or `Z` |
| Heavy attack (breaks blocks) | `K` or `X` |
| Block (tap right as a swing lands = **parry**) | `L`, `C`, or `Shift` |
| Dash | `Space` or `↑` |
| Pick draft card | `1` / `2` / `3` or click |

Parrying staggers the attacker for a big punish window. Heavies chip through blocks and knock you back. Round ends on KO or when the 45 s timer runs out (higher HP wins).

## How it works

- **Rendering:** Three.js, procedural low-poly fighters, side-on 2.5D camera.
- **Simulation:** deterministic 60 Hz fixed-step sim in `src/sim.js` (no trig in the sim, so host and client stay identical).
- **Netcode:** peer-to-peer WebRTC via [PeerJS](https://peerjs.com). The host runs the simulation and streams state; the client streams inputs. Signaling uses PeerJS's free public server (`0.peerjs.com`); after the handshake, traffic goes directly between the two browsers. No game server is needed, which is why it works on GitHub Pages.
- **Draft:** `src/cards.js` holds the card pool. Swords and armor replace; effects stack.

Run your own signaling server with `npx peerjs --port 9000 --path /` and open the game with `?peer=localhost:9000`.

## Develop locally

The game uses ES modules, so serve it rather than opening `index.html` directly:

```bash
python3 -m http.server 8080   # or: npx serve
# open http://localhost:8080
```

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The game is live at `https://<user>.github.io/<repo>/` within a minute.

Everything is static; there is no build step. Three.js and PeerJS are vendored in `lib/`.
