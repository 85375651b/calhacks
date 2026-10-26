# Convert Poly Haven .exr maps (normal/roughness) to 8-bit .png and point library.json at them.
# three.js TextureLoader cannot read .exr. Values are already 0..1 (checked), so we only clip.
import os, json, sys
os.environ["OPENCV_IO_ENABLE_OPENEXR"] = "1"
import cv2
import numpy as np

lib_path = sys.argv[1] if len(sys.argv) > 1 else "library.json"
lib = json.load(open(lib_path))
for entry in lib:
    for kind, path in (entry.get("maps") or {}).items():
        if not path.endswith(".exr"):
            continue
        img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
        if img is None:
            sys.exit(f"could not read {path}")
        if img.ndim == 3 and img.shape[2] == 4:
            img = img[..., :3]  # drop alpha
        png = path[:-4] + ".png"
        cv2.imwrite(png, np.round(np.clip(img, 0, 1) * 255).astype(np.uint8))
        entry["maps"][kind] = png
        print(f"{entry['id']:24} {kind:9} -> {png}")
json.dump(lib, open(lib_path, "w"), indent=2)
