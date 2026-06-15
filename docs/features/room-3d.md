# Room 3D — Three.js room + procedural avatars

Owns the live room renderer and the living-agent simulation. CLAUDE.md §1.7 points
here; read this before touching anything under `room-three.jsx`, `room-tiles.jsx`,
`avatar-style.js`, or `world/build.jsx`.

The live room is a **real-3D Three.js scene** (`OrbitControls`: view mode
left-drag=pan, right-drag=orbit, wheel=zoom; build mode left=paint, right=pan).

## Two renderers, one data model

- **3D scene** = [`lib/room-three.jsx`](../../Frontend/src/lib/room-three.jsx) → built by
  `RoomCanvas` in [`world/build.jsx`](../../Frontend/src/screens/world/build.jsx).
  Furniture **reuses `FURN.draw3d`** from room-tiles via a 3D kit whose `box/cyl/sph`
  calls emit meshes (`k.c=30` so px-tuned heights map to tile units `/30`) — so one
  furniture definition feeds both renderers.
- **2D iso canvas** = [`lib/room-tiles.jsx`](../../Frontend/src/lib/room-tiles.jsx)
  (no assets/lib) still powers room thumbnails (lobby cards) + palette item previews
  (`drawItemPreview`); the cards/map use the SVG avatar in
  [`world/CharacterSprite.jsx`](../../Frontend/src/screens/world/CharacterSprite.jsx).
- **Avatar identity is shared**:
  [`lib/avatar-style.js`](../../Frontend/src/lib/avatar-style.js) `variantOf()` (hash of
  `seed`/`charId` → skin/hair/shirt/headset) feeds BOTH the 3D mesh avatar and the 2D
  SVG, so one agent looks identical everywhere. Legacy sprite-sheet PNGs + pixel-art
  engine are gone; `lib/sprites.jsx` keeps only `CLASS_OPTS`/`COLOR_OPTS`.

## Art direction — bright low-poly

`MeshStandardMaterial` `flatShading:true` + low-segment `GEO` (faceted spheres/cyls/
capsules); `vivid()` saturates the pastel `PAL`/floor colors (greys stay put); **no
tone mapping** (Neutral/ACES wash out). Furniture uses `GEO.rbox`; **walls/floor use
sharp `GEO.box`** to tile seamlessly. Real **PCFSoft shadows** — sun `castShadow` with
the shadow camera **fit to room bounds** in the room-frame effect (default frustum →
big rooms get no shadows); bright key + modest fill (too much fill = pale); subtle fog.

## Avatars + animation loop

Avatars are **low-poly chibis with arms+legs, no headset** (`buildAvatar` exposes
`{inner,legL,legR,armL,armR,ring,book}`); the loop sets limb poses per ACTS (sit, read
w/`book`, cook, fridge, cheer). Loop also: spring **drop-in** (first entry), **zoom-in**
intro (`ctx.zoomEase`), **hover** bounce+ring (`hoveredRef`), and **object sync** —
interior doors (`struct.userData.doors`) swing open when an avatar is near.

## Life sim (`useLivingAgents`)

**No teleport** — BFS walking (mesh lerps); working agents sit at chairs **adjacent to a
desk facing it** (`seat.dir`); after a session they may **break** → visit a kitchen
**station** (counter→cooking, fridge→fridge) facing the appliance; idle agents wander/
lounge. Chip text AND avatar pose share one `ACTS` entry so they never drift apart.

## Hard rules (don't break)

- **Data model unchanged** — `guildos.rooms.v2` = `floor[]`, `struct[]`,
  `objects[{key,x,y,rot}]`. World units = grid tiles (`+x`=gx, `+z`=gy, `y` up).
- **`FURN` keys + footprints + `draw3d` must stay stable** — they feed both renderers.
- **Scene layers rebuild only when their data slice changes** (each owns a `useEffect`);
  shared geos/mats are cached, **never disposed** (only `userData.ownGeo/ownMat` are).
- **Status chips = DOM overlay projected** from the 3D head each frame (`.rc-a3`) — not
  grid percentages.
