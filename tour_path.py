"""Plan a camera walk through a scene.json house for the photoreal tour.

Picks a few spots inside the house that are clear of walls, walks from one to
the next in straight lines (only along lines that don't cross a wall), and
keeps the camera looking ahead, then turns to look at each piece of furniture
when it is nearby. Output: a json list of {x, y, z, yaw, pitch} frames in scene
feet/degrees, the format render/render.py --path takes.

  .venv/bin/python tour_path.py scene.json --out render/out/path.json --frames 48
"""
import argparse
import json
import math
import sys
from pathlib import Path

from shapely.geometry import LineString, Point
from shapely.ops import unary_union

from place import Scene

EYE_FT = 5.5
CLEAR_FT = 1.5          # keep the camera this far from any wall


def yaw_toward(x0, z0, x1, z1):
    # three.js style: yaw 0 looks toward -z (plan north), positive = counter-clockwise from above
    return math.degrees(math.atan2(-(x1 - x0), -(z1 - z0)))


def lerp_angle(a, b, t):
    d = (b - a + 180) % 360 - 180
    return a + d * t


def free_space(scene, items):
    walls = unary_union(list(scene.wall_solids.values()))
    furn = [Point(it["position"][0], it["position"][2]).buffer(max(it["size_ft"][0], it["size_ft"][2]) / 2 + 1.0)
            for it in items]
    blocked = unary_union([walls.buffer(CLEAR_FT)] + furn)
    return scene.footprint.buffer(-CLEAR_FT).difference(blocked)


def waypoints(scene, items, n_spots):
    """Room-ish spots: grid points inside free space, farthest-apart greedy pick,
    starting near the first piece of furniture so the walk ends looking at it."""
    free = free_space(scene, items)
    minx, miny, maxx, maxy = free.bounds
    cands = [(x, y) for x in frange(minx, maxx, 1.0) for y in frange(miny, maxy, 1.0)
             if free.contains(Point(x, y))]
    if not cands:
        c = scene.footprint.centroid
        return [(c.x, c.y)]
    walls = unary_union(list(scene.wall_solids.values()))

    def reachable(a, b):
        return not LineString([a, b]).intersects(walls)

    if items:
        fx, fz = items[0]["position"][0], items[0]["position"][2]
        far = [c for c in cands if math.hypot(c[0] - fx, c[1] - fz) >= 6.0] or cands
        first = min(far, key=lambda c: (c[0] - fx) ** 2 + (c[1] - fz) ** 2)   # ~6 ft back from it
    else:
        first = min(cands, key=lambda c: Point(c).distance(free.centroid))
    picked = [first]
    while len(picked) < n_spots:
        best = max(cands, key=lambda c: min((c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 for p in picked)
                   if reachable(c, picked[-1]) else -1)
        if best in picked or not reachable(best, picked[-1]):
            break
        picked.append(best)
    picked.reverse()          # walk ends at the furniture
    return picked


def frange(a, b, step):
    v = a
    while v <= b:
        yield round(v, 3)
        v += step


def build_frames(scene, items, spots, n_frames):
    """Frames along the legs, split by length. Each leg looks where it is walking;
    the turn into a leg is finished within its first 30%. The last leg looks at
    the first piece of furniture (at table height, so it stays in frame)."""
    legs = list(zip(spots, spots[1:])) or [(spots[0], spots[0])]
    lengths = [math.hypot(b[0] - a[0], b[1] - a[1]) or 1.0 for a, b in legs]
    total = sum(lengths)
    target = items[0] if items else None
    frames, prev_yaw = [], None
    for li, ((a, b), L) in enumerate(zip(legs, lengths)):
        k = max(2, round(n_frames * L / total))
        leg_yaw = yaw_toward(a[0], a[1], b[0], b[1]) if b != a else (prev_yaw or 0.0)
        for i in range(k):
            t = i / (k - 1)
            x, z = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            if target and li == len(legs) - 1:
                tx, tz = target["position"][0], target["position"][2]
                yaw = yaw_toward(x, z, tx, tz)
                dist = max(1.0, math.hypot(tx - x, tz - z))
                pitch = math.degrees(math.atan2(target["size_ft"][1] * 0.7 - EYE_FT, dist))
            else:
                yaw, pitch = leg_yaw, -3.0
            if prev_yaw is not None and t < 0.3:
                yaw = lerp_angle(prev_yaw if i == 0 else start_yaw, yaw, t / 0.3)
            if i == 0:
                start_yaw = prev_yaw if prev_yaw is not None else yaw
            prev_yaw = yaw
            frames.append({"x": round(x, 3), "y": EYE_FT, "z": round(z, 3),
                           "yaw": round((yaw + 180) % 360 - 180, 2), "pitch": round(pitch, 2)})
    return frames


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("scene")
    ap.add_argument("--out", default="render/out/path.json")
    ap.add_argument("--frames", type=int, default=48)
    ap.add_argument("--spots", type=int, default=4)
    args = ap.parse_args()
    sc = json.load(open(args.scene))
    if not isinstance(sc["house"], str):
        sys.exit("tour_path.py needs scene.json's house to be a file path")
    scene = Scene(sc["house"])
    items = sc.get("furniture", [])
    spots = waypoints(scene, items, args.spots)
    frames = build_frames(scene, items, spots, args.frames)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    json.dump(frames, open(args.out, "w"), indent=1)
    print(f"[path] {len(spots)} spots -> {len(frames)} frames: {spots}")


if __name__ == "__main__":
    main()
