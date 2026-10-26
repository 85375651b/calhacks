# scene.json format (shared contract)

Written by `place.py` (`Scene.export()`), read by the browser tour (`/tour`) and the Blender
photoreal render (`render/render.py`). All lengths are **feet**.

```json
{
  "version": 1,
  "units": "feet",
  "house": "floorplan/cubicasa5k/plan1_clean.json",
  "materials": { "floor": "wood_oak_planks", "walls": "paint_white" },
  "furniture": [
    {
      "id": "table-1",
      "glb": "table_sized.glb",
      "size_ft": [3.8714, 2.4606, 2.4278],
      "position": [17.54, 0, 2.93],
      "rotation_deg": 0
    }
  ]
}
```

- `house`: path (relative to repo root) to a clean house JSON (`walls`, `openings`,
  `ceiling_height`, `units: "feet"`), or the same object inline.
- Axes: plan `x` -> scene `x`; plan `y` -> scene `z` (same as `src/lib/planner/importFloorPlan.js`).
  Scene `y` is up. 1 scene unit = 1 foot. Floor is at y = 0.
- `materials.floor` / `materials.walls`: ids from `library.json`.
  An entry has either `maps` (`color`, optional `normal`, `roughness`; paths relative to repo root,
  all `.jpg`/`.png`) plus `tile_ft` (real size of one texture tile), or a plain `color_hex`.
- Furniture `glb` has already been scaled by `resize.py`: it is centred on x/z with its bottom at
  y = 0, so `position` is the centre of its footprint on the floor.
- `size_ft` is `[x, y, z]` *before* rotation: x = width, y = height, z = depth.
- `rotation_deg`: rotation about the up axis (scene y), counter-clockwise seen from above,
  applied as three.js `rotation.y = rotation_deg * PI / 180`. Assumption (untested): a SAM 3D model's
  front faces +z at 0 deg.
- Openings: door height 6'9" (81 in), window sill 3 ft, window height 4 ft unless the opening
  gives `height` / `sill` (same defaults as the viewer).
