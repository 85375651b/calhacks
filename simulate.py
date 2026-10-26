"""One command: text prompt -> photoreal tour.

  .venv/bin/python simulate.py "renovate minimalist, put my table under the window" \
      --furniture table_sized.json --house floorplan/cubicasa5k/plan1_clean.json

Steps (each one can be skipped/re-run on its own):
  1. agent.py   Claude reads the prompt, picks materials, places furniture -> scene.json
  2. tour_path  plans a camera walk through the house -> path.json
  3. render.py  Blender renders every frame of the walk (Cycles, CPU)
  4. ffmpeg     stitches the frames into tour.mp4
  5. prints the URL of the walkable browser tour for the same scene

If the prompt doesn't ask for a renovation, the agent is told to keep the
default materials (the "match the listing photos" step isn't built yet).
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PY = sys.executable
RENOVATE_WORDS = ("renovat", "style", "floor", "wall", "paint", "tile", "wood", "brick",
                  "concrete", "modern", "minimal", "rustic", "industrial")


def run(cmd, **kw):
    print("\n$", " ".join(str(c) for c in cmd), flush=True)
    subprocess.run(cmd, check=True, cwd=ROOT, **kw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt")
    ap.add_argument("--furniture", action="append", default=[], help="sidecar json from resize.py")
    ap.add_argument("--house", default="floorplan/cubicasa5k/plan1_clean.json")
    ap.add_argument("--out", default="render/tour", help="output folder")
    ap.add_argument("--frames", type=int, default=36)
    ap.add_argument("--samples", type=int, default=32)
    ap.add_argument("--res", default="960x540")
    ap.add_argument("--fps", type=int, default=6)
    ap.add_argument("--scene", default=None, help="skip the agent and use this scene.json")
    ap.add_argument("--no-render", action="store_true", help="stop after scene.json + path")
    args = ap.parse_args()

    out = ROOT / args.out
    out.mkdir(parents=True, exist_ok=True)
    scene_path = Path(args.scene) if args.scene else out / "scene.json"
    t0 = time.time()

    # 1. prompt -> scene.json
    if not args.scene:
        prompt = args.prompt
        if not any(w in prompt.lower() for w in RENOVATE_WORDS):
            prompt += ("\n\n(The user did not ask for a renovation: keep the house's current look. "
                       "Do not change floor or wall materials.)")
        cmd = [PY, "agent.py", prompt, "--house", args.house, "--out", str(scene_path)]
        for f in args.furniture:
            cmd += ["--furniture", f]
        run(cmd)
    scene = json.load(open(scene_path))
    print(f"[simulate] scene: materials={scene.get('materials')} "
          f"furniture={[(f['id'], f['position'], f['rotation_deg']) for f in scene.get('furniture', [])]}")

    # 2. camera walk
    path_json = out / "path.json"
    run([PY, "tour_path.py", str(scene_path), "--out", str(path_json), "--frames", str(args.frames)])
    if args.no_render:
        return

    # 3. render frames
    frames_dir = out / "frames"
    if frames_dir.exists():
        shutil.rmtree(frames_dir)
    run(["blender", "-b", "--python-exit-code", "1", "-P", "render/render.py", "--",
         "--scene", str(scene_path), "--out", str(out), "--view", "interior",
         "--samples", str(args.samples), "--res", args.res, "--path", str(path_json)])

    # 4. stitch
    mp4 = out / "tour.mp4"
    run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(args.fps),
         "-i", str(frames_dir / "frame_%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p",
         "-vf", "minterpolate=fps=24:mi_mode=mci", str(mp4)])

    # the browser tour only serves root-level scene*.json files
    shutil.copy(scene_path, ROOT / "scene_tour.json")
    rel = "scene_tour.json"
    print(f"\n[simulate] done in {time.time() - t0:.0f}s")
    print(f"[simulate] photoreal tour video: {mp4}")
    print(f"[simulate] first still:          {out / 'interior.png'}")
    print(f"[simulate] walkable browser tour: npm run dev:client, then open "
          f"http://127.0.0.1:5173/tour?scene={rel}")


if __name__ == "__main__":
    main()
