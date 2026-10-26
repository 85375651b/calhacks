import json

import numpy as np
import trimesh

# ---------- SETTINGS: edit these ----------
MODEL_IN = "object_0.glb"      # raw SAM 3D file
MODEL_OUT = "table_sized.glb"

# copy these from the product page
LENGTH, WIDTH, HEIGHT = 118, 74, 75
UNIT = "cm"                     # "cm" or "in"

MAX_SPREAD = 0.15               # refuse if proportions are more than 15% off


def to_feet(v, unit):
    return v / 30.48 if unit == "cm" else v / 12


def fmt_ft_in(feet):
    total_in = feet * 12
    return f"{int(total_in // 12)}'{total_in % 12:.1f}\""


def load_scene(path):
    loaded = trimesh.load(path)
    if isinstance(loaded, trimesh.Scene):
        meshes = loaded.dump(concatenate=False)      # separate meshes, each keeps its texture
    else:
        meshes = [loaded]
    print("meshes in file:", len(meshes),
          "| faces:", sum(len(m.faces) for m in meshes))
    return meshes


def bounds_of(meshes):
    lo = np.min([m.bounds[0] for m in meshes], axis=0)
    hi = np.max([m.bounds[1] for m in meshes], axis=0)
    return lo, hi


def resize_to_real_size(path_in, path_out, length, width, height, unit="cm",
                        max_spread=MAX_SPREAD):
    L, W, H = (to_feet(v, unit) for v in (length, width, height))
    real_long, real_short = max(L, W), min(L, W)

    meshes = load_scene(path_in)
    UP = 1
    lo, hi = bounds_of(meshes)
    size = hi - lo
    print("model size (raw units) x,y,z:", np.round(size, 3))

    if size[0] >= size[2]:
        target = [real_long, H, real_short]
    else:
        target = [real_short, H, real_long]

    scales = [target[i] / size[i] for i in range(3)]
    spread = (max(scales) - min(scales)) / float(np.median(scales))
    print("axis scales:", [round(s, 3) for s in scales],
          f"-> proportion spread {spread * 100:.1f}%")
    if spread > max_spread:
        print("Model proportions are too far off -> use a plain box instead.")
        return None

    # scale about the model's own center, then move it to x/z center, bottom at 0
    center = (lo + hi) / 2
    S = np.diag(scales + [1.0])
    new_lo = (lo - center) * scales
    shift = np.array([0.0, -new_lo[UP], 0.0])

    T = np.eye(4)
    T[:3, 3] = -center
    M = np.eye(4)
    M[:3, 3] = shift
    full = M @ S @ T

    for m in meshes:
        m.apply_transform(full)

    trimesh.Scene(meshes).export(path_out)
    lo2, hi2 = bounds_of(meshes)
    print("final size x,y,z:", [fmt_ft_in(v) for v in hi2 - lo2])

    # sidecar for place.py: exact size in feet, x (width), y (height), z (depth)
    sidecar = path_out.rsplit(".", 1)[0] + ".json"
    with open(sidecar, "w") as f:
        json.dump({"glb": path_out, "size_ft": [round(float(v), 4) for v in hi2 - lo2]}, f, indent=2)
    print("wrote", sidecar)
    return hi2 - lo2


if __name__ == "__main__":
    resize_to_real_size(MODEL_IN, MODEL_OUT, LENGTH, WIDTH, HEIGHT, UNIT)
