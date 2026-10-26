"""Place real-size furniture in a house built from a floor plan and export scene.json.

Contract: docs/scene-format.md. All lengths are feet.

Coordinates
-----------
Plan (x, y) == scene (x, z); scene y is up. Everything in this module works in plan
(x, y); positions are exported as [x, 0, y].

Rotation convention (matches the contract / three.js)
-----------------------------------------------------
rotation_deg is three.js ``rotation.y`` in degrees. With y up, a positive rotation.y turns
+z toward +x. A point (x, z) in the model's local frame ends up at
    x' =  x cos(t) + z sin(t)
    z' = -x sin(t) + z cos(t)
so the model's front (+z at 0 deg, per the contract) points along (sin t, cos t) in
plan (x, y). To make the front face plan direction (nx, ny):  t = atan2(nx, ny).
  front -> +y (plan "down" in the image, scene +z): 0 deg
  front -> +x:  90 deg      front -> -y: 180 deg      front -> -x: -90 deg
"Counter-clockwise seen from above" holds when the plan is drawn like the floor-plan
image (x right, y down). In a math-style plot (y up) the same rotation looks clockwise.

If a model's front is not +z, pass front_offset_deg = the direction its front actually
points at rotation 0, measured the same way (e.g. 90 if its front is +x). The exported
rotation is then atan2(nx, ny) - front_offset_deg.
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path

from shapely import affinity
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box
from shapely.ops import unary_union

REPO = Path(__file__).resolve().parent
MIN_DESCRIBED_WALL_FT = 1.0   # shorter stubs are left out of describe() but still collide
FOOTPRINT_CLOSE_FT = 0.75     # gap-closing tolerance for the house outline
EPS_AREA = 1e-4               # sq ft; touching is fine, overlapping is not
EPS_DEPTH = 0.005             # ft
DOOR_CLEARANCE_FT = 2.5       # warn if furniture sits in front of a door
DOOR_HEIGHT_FT = 81 / 12
WINDOW_SILL_FT = 3.0
WINDOW_HEIGHT_FT = 4.0


class PlacementError(ValueError):
    """Plain-English placement problem; the message is meant to be shown to an LLM."""


def _r(v, n=4):
    return round(float(v), n)


def _rel(path) -> str:
    p = Path(path).resolve()
    try:
        return p.relative_to(REPO).as_posix()
    except ValueError:
        return str(p)


def _depth(geom) -> float:
    """Approximate penetration depth: the short side of the overlap's min rotated rectangle."""
    if geom.is_empty:
        return 0.0
    rect = geom.minimum_rotated_rectangle
    if rect.geom_type != "Polygon":
        return 0.0
    xs, ys = rect.exterior.coords.xy
    sides = [math.dist((xs[i], ys[i]), (xs[i + 1], ys[i + 1])) for i in range(2)]
    return min(sides)


def _escape(rect, obstacle, max_ft=15.0):
    """Shortest straight move (16 directions, ~0.01 ft precision) that clears obstacle.

    Returns (distance, unit direction). Only considers this one obstacle.
    """
    def clear(g):
        i = g.intersection(obstacle)
        return i.area <= EPS_AREA or _depth(i) <= EPS_DEPTH
    best = (max_ft, (0.0, 0.0))
    for k in range(16):
        a = 2 * math.pi * k / 16
        dx, dy = math.cos(a), math.sin(a)
        d, step = 0.0, 0.1
        while d < best[0] and not clear(affinity.translate(rect, dx * d, dy * d)):
            d += step
        if d >= best[0]:
            continue
        lo, hi = max(0.0, d - step), d
        while hi - lo > 0.005:
            mid = (lo + hi) / 2
            if clear(affinity.translate(rect, dx * mid, dy * mid)):
                hi = mid
            else:
                lo = mid
        if hi < best[0]:
            best = (hi, (dx, dy))
    return best


def _polys(geom):
    if geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    return [g for g in getattr(geom, "geoms", []) if isinstance(g, Polygon)]


class Scene:
    def __init__(self, house_path, library_path="library.json"):
        self.house_path = Path(house_path)
        with open(house_path) as f:
            self.house = json.load(f)
        if self.house.get("units") != "feet":
            raise ValueError(f"House {house_path} uses units={self.house.get('units')!r}; "
                             "place.py only accepts houses in feet.")
        with open(library_path) as f:
            self.library = json.load(f)
        self.materials = {"floor": None, "walls": None}
        self.furniture: dict[str, dict] = {}   # id -> placement dict (export form + extras)
        self._shapes: dict[str, Polygon] = {}
        self.ceiling_height = float(self.house.get("ceiling_height", 8))
        self._build_geometry()

    # ------------------------------------------------------------------ geometry
    def _build_geometry(self):
        self.walls = {}
        for w in self.house["walls"]:
            dx, dy = w["x2"] - w["x1"], w["y2"] - w["y1"]
            L = math.hypot(dx, dy)
            self.walls[w["id"]] = {**w, "length": L, "u": (dx / L, dy / L) if L else (1.0, 0.0),
                                   "openings": []}
        for o in self.house["openings"]:
            w = self.walls.get(o["wall"])
            if w is None:
                raise ValueError(f"Opening refers to unknown wall {o['wall']}")
            w["openings"].append(o)   # index on the wall = order in the file

        pts = [(w["x1"], w["y1"]) for w in self.walls.values()] + \
              [(w["x2"], w["y2"]) for w in self.walls.values()]
        self.centroid = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))

        # Collision solids at floor level: wall rectangles (flat ends, like the viewer's
        # boxes) minus door gaps. Windows still block (their sill is above the floor).
        self.wall_solids = {}
        full = []
        for wid, w in self.walls.items():
            if w["length"] < 1e-6:
                continue
            t = w["thickness"]
            line = LineString([(w["x1"], w["y1"]), (w["x2"], w["y2"])])
            rect = line.buffer(t / 2, cap_style="flat")
            full.append(line.buffer(t / 2 + FOOTPRINT_CLOSE_FT, cap_style="flat",
                                    join_style="mitre"))
            for o in w["openings"]:
                if o["type"] != "door":
                    continue
                a = max(0.0, o["position"] - o["width"] / 2)
                b = min(w["length"], o["position"] + o["width"] / 2)
                if b <= a:
                    continue
                ux, uy = w["u"]
                gap = LineString([(w["x1"] + ux * a, w["y1"] + uy * a),
                                  (w["x1"] + ux * b, w["y1"] + uy * b)]).buffer(t, cap_style="flat")
                rect = rect.difference(gap)
            self.wall_solids[wid] = rect

        # Footprint: morphological closing of all walls (door gaps included so exterior
        # doors don't leak), take the outer ring of the biggest piece, fill it, shrink back.
        union = unary_union(full)
        biggest = max(_polys(union), key=lambda p: p.area)
        outline = Polygon(biggest.exterior).buffer(-FOOTPRINT_CLOSE_FT, join_style="mitre")
        # Shrinking back can nick corners where walls don't quite meet; re-add the
        # actual wall solids (with door gaps filled) and fill holes again.
        solids = [LineString([(w["x1"], w["y1"]), (w["x2"], w["y2"])]).buffer(
            w["thickness"] / 2, cap_style="flat") for w in self.walls.values() if w["length"] > 1e-6]
        merged = unary_union([outline] + [s for s in solids if s.intersects(outline)])
        outline = max(_polys(merged), key=lambda p: p.area)
        self.footprint = Polygon(outline.exterior)
        hull = unary_union(list(self.wall_solids.values())).convex_hull
        if self.footprint.area < 0.5 * hull.area:   # closing failed: fall back to the hull
            self.footprint = hull
            self.footprint_method = "convex hull (fallback)"
        else:
            self.footprint_method = "closed wall outline"

    def _inside_normal(self, w, flip=False):
        ux, uy = w["u"]
        n = (-uy, ux)
        mx, my = (w["x1"] + w["x2"]) / 2, (w["y1"] + w["y2"]) / 2
        if (self.centroid[0] - mx) * n[0] + (self.centroid[1] - my) * n[1] < 0:
            n = (uy, -ux)
        if flip:
            n = (-n[0], -n[1])
        return n

    @staticmethod
    def _dir_name(n):
        names = {(0, 1): "+y", (0, -1): "-y", (1, 0): "+x", (-1, 0): "-x"}
        k = (round(n[0]), round(n[1]))
        if abs(abs(n[0]) - 1) < 0.02 or abs(abs(n[1]) - 1) < 0.02:
            return names.get(k, f"({n[0]:.2f},{n[1]:.2f})")
        return f"({n[0]:.2f},{n[1]:.2f})"

    # ------------------------------------------------------------------ describe
    def describe(self, as_text=True):
        minx, miny, maxx, maxy = unary_union(list(self.wall_solids.values())).bounds
        walls = []
        for wid, w in self.walls.items():
            if w["length"] < MIN_DESCRIBED_WALL_FT and not w["openings"]:
                continue
            ops = []
            for i, o in enumerate(w["openings"]):
                ux, uy = w["u"]
                ops.append({"index": i, "type": o["type"], "width": _r(o["width"], 2),
                            "along_ft": _r(o["position"], 2),
                            "center": [_r(w["x1"] + ux * o["position"], 2),
                                       _r(w["y1"] + uy * o["position"], 2)]})
            walls.append({"id": wid, "from": [_r(w["x1"], 2), _r(w["y1"], 2)],
                          "to": [_r(w["x2"], 2), _r(w["y2"], 2)],
                          "length": _r(w["length"], 2), "thickness": _r(w["thickness"], 2),
                          "inside": self._dir_name(self._inside_normal(w)),
                          "openings": ops})
        d = {"units": "feet", "bbox": {"min": [_r(minx, 2), _r(miny, 2)],
                                       "max": [_r(maxx, 2), _r(maxy, 2)],
                                       "size": [_r(maxx - minx, 2), _r(maxy - miny, 2)]},
             "house_center": [_r(self.centroid[0], 2), _r(self.centroid[1], 2)],
             "footprint_area_sqft": _r(self.footprint.area, 1),
             "ceiling_height": self.ceiling_height,
             "walls": walls,
             "omitted_short_walls": [wid for wid, w in self.walls.items()
                                     if w["length"] < MIN_DESCRIBED_WALL_FT and not w["openings"]],
             "materials": dict(self.materials),
             "furniture": [{k: f[k] for k in ("id", "size_ft", "position", "rotation_deg")}
                           for f in self.furniture.values()]}
        if not as_text:
            return d
        lines = [
            "Units: feet. Plan (x, y); y grows downward in the plan image. Rooms are not named.",
            f"House bbox x {d['bbox']['min'][0]}..{d['bbox']['max'][0]}, "
            f"y {d['bbox']['min'][1]}..{d['bbox']['max'][1]} "
            f"({d['bbox']['size'][0]} x {d['bbox']['size'][1]} ft); centre {d['house_center']}; "
            f"floor area ~{d['footprint_area_sqft']} sq ft; ceiling {self.ceiling_height} ft.",
            "Walls: id (x1,y1)->(x2,y2) length thickness inside=<side facing house centre>; "
            "openings as [index] type width @along_ft from (x1,y1) centre (x,y). "
            "Windows: sill 3 ft, so items under 3 ft tall fit below them.",
        ]
        for w in walls:
            s = (f"  {w['id']}: ({w['from'][0]},{w['from'][1]})->({w['to'][0]},{w['to'][1]}) "
                 f"L={w['length']} t={w['thickness']} inside={w['inside']}")
            for o in w["openings"]:
                s += (f" [{o['index']}] {o['type']} w={o['width']} @{o['along_ft']} "
                      f"c=({o['center'][0]},{o['center'][1]})")
            lines.append(s)
        if d["omitted_short_walls"]:
            lines.append(f"Short stubs (<{MIN_DESCRIBED_WALL_FT} ft, omitted, still solid): "
                         f"{d['omitted_short_walls']}")
        lines.append(f"Materials: floor={self.materials['floor']} walls={self.materials['walls']}")
        if d["furniture"]:
            lines.append("Furniture:")
            for f in d["furniture"]:
                lines.append(f"  {f['id']}: size {f['size_ft']} at x={f['position'][0]} "
                             f"y={f['position'][2]} rot={f['rotation_deg']}")
        else:
            lines.append("Furniture: none")
        return "\n".join(lines)

    # ------------------------------------------------------------------ materials
    def search_materials(self, surface=None, tags=None):
        if surface == "walls":
            surface = "wall"
        tags = [tags] if isinstance(tags, str) else (tags or [])
        out = []
        for m in self.library:
            if surface and m.get("surface") != surface:
                continue
            if tags and not all(t.lower() in [x.lower() for x in m.get("tags", [])] for t in tags):
                continue
            out.append(m)
        return out

    def set_material(self, surface, material_id):
        key = {"floor": "floor", "wall": "walls", "walls": "walls"}.get(surface)
        if key is None:
            raise PlacementError(f"Unknown surface {surface!r}; use 'floor' or 'walls'.")
        m = next((m for m in self.library if m["id"] == material_id), None)
        if m is None:
            ids = [x["id"] for x in self.library if x["surface"] == ("floor" if key == "floor" else "wall")]
            raise PlacementError(f"No material with id {material_id!r}. "
                                 f"Valid {surface} materials: {', '.join(ids)}.")
        want = "floor" if key == "floor" else "wall"
        if m["surface"] != want:
            raise PlacementError(f"Material {material_id!r} is a {m['surface']} material and "
                                 f"cannot be used on the {key}. Pick one with surface={want!r}.")
        self.materials[key] = material_id
        return {"surface": key, "material": material_id}

    # ------------------------------------------------------------------ furniture
    @staticmethod
    def _load_item(furniture_json):
        if isinstance(furniture_json, dict):
            return dict(furniture_json), REPO
        p = Path(furniture_json)
        with open(p) as f:
            d = json.load(f)
        return d, p.resolve().parent

    @staticmethod
    def _rect(cx, cy, w, d, rot_deg):
        """Footprint rectangle of an item of local width w (x) and depth d (z)."""
        t = math.radians(rot_deg)
        ex = (math.cos(t), -math.sin(t))   # local +x in plan
        ez = (math.sin(t), math.cos(t))    # local +z (front) in plan
        pts = []
        for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            pts.append((cx + sx * w / 2 * ex[0] + sz * d / 2 * ez[0],
                        cy + sx * w / 2 * ex[1] + sz * d / 2 * ez[1]))
        return Polygon(pts)

    def place(self, item_id, furniture_json, mode, **kw):
        item, base = self._load_item(furniture_json)
        size = [float(v) for v in item["size_ft"]]
        w, h, d = size
        glb = item.get("glb", "")
        glb_rel = _rel(base / glb) if glb and not os.path.isabs(glb) else glb
        front_off = float(kw.pop("front_offset_deg", 0.0) or 0.0)
        ctx = {}

        if mode == "against_wall":
            wid = kw.pop("wall", None)
            wall = self.walls.get(wid)
            if wall is None and wid is not None:
                wall = self.walls.get(int(wid)) if str(wid).lstrip("-").isdigit() else None
            if wall is None:
                raise PlacementError(f"Unknown wall {wid!r}. Use a wall id from describe_house.")
            wid = wall["id"]
            gap = float(kw.pop("gap_ft", 0.1))
            flip = bool(kw.pop("flip", False))
            opening = kw.pop("opening", None)
            along = kw.pop("along_ft", None)
            if opening is not None:
                ops = wall["openings"]
                if not (0 <= int(opening) < len(ops)):
                    raise PlacementError(f"Wall {wid} has {len(ops)} opening(s); opening index "
                                         f"{opening} does not exist (valid: 0..{len(ops) - 1}).")
                along = ops[int(opening)]["position"]
                ctx["opening"] = ops[int(opening)]
            if along is None:
                raise PlacementError("against_wall needs either 'opening' (index) or 'along_ft'.")
            along = float(along)
            if not (0 <= along <= wall["length"]):
                raise PlacementError(f"along_ft={along:.2f} is off wall {wid}, which is "
                                     f"{wall['length']:.2f} ft long (use 0..{wall['length']:.2f}).")
            n = self._inside_normal(wall, flip)
            rot = math.degrees(math.atan2(n[0], n[1])) - front_off
            # half extent of the rotated item along the wall normal
            t = math.radians(rot)
            ex, ez = (math.cos(t), -math.sin(t)), (math.sin(t), math.cos(t))
            half_n = abs(w / 2 * (ex[0] * n[0] + ex[1] * n[1])) + abs(d / 2 * (ez[0] * n[0] + ez[1] * n[1]))
            half_u = abs(w / 2 * (ex[0] * wall["u"][0] + ex[1] * wall["u"][1])) + \
                abs(d / 2 * (ez[0] * wall["u"][0] + ez[1] * wall["u"][1]))
            off = wall["thickness"] / 2 + gap + half_n
            ux, uy = wall["u"]
            cx = wall["x1"] + ux * along + n[0] * off
            cy = wall["y1"] + uy * along + n[1] * off
            ctx.update(wall=wall, along=along, gap=gap, n=n, half_u=half_u)
        elif mode == "at":
            try:
                cx, cy = float(kw.pop("x")), float(kw.pop("z"))
            except KeyError as e:
                raise PlacementError(f"mode 'at' needs x, z (plan y) and rotation_deg; missing {e}.")
            rot = float(kw.pop("rotation_deg", 0.0))
        else:
            raise PlacementError(f"Unknown mode {mode!r}; use 'against_wall' or 'at'.")
        if kw:
            raise PlacementError(f"Unexpected argument(s) for mode {mode!r}: {sorted(kw)}.")

        rot = (rot + 180) % 360 - 180
        if abs(rot) < 1e-9:
            rot = 0.0
        rect = self._rect(cx, cy, w, d, rot)
        self._check(item_id, rect, mode, ctx)

        placement = {"id": item_id, "glb": glb_rel, "size_ft": [_r(v) for v in size],
                     "position": [_r(cx), 0, _r(cy)], "rotation_deg": _r(rot),
                     "footprint": [[_r(x, 3), _r(y, 3)] for x, y in list(rect.exterior.coords)[:4]],
                     "warnings": self._warnings(item_id, rect, h, ctx)}
        self.furniture[item_id] = placement
        self._shapes[item_id] = rect
        return placement

    def remove(self, item_id):
        if item_id not in self.furniture:
            raise PlacementError(f"No furniture with id {item_id!r}.")
        del self.furniture[item_id]
        del self._shapes[item_id]

    def _shift_hint(self, rect, inter, ctx):
        """Suggest how far to slide along the target wall to clear an obstacle."""
        wall = ctx.get("wall")
        if not wall:
            return ""
        ux, uy = wall["u"]
        c = rect.centroid
        proj = [(x - c.x) * ux + (y - c.y) * uy for x, y in inter.exterior.coords] if \
            isinstance(inter, Polygon) else [0]
        lo, hi = min(proj), max(proj)
        half = ctx["half_u"]
        if (lo + hi) / 2 > 0:      # obstacle on the +along side: slide toward (x1, y1)
            delta = lo - half - 0.05
        else:                      # obstacle on the -along side: slide toward (x2, y2)
            delta = hi + half + 0.05
        new = ctx["along"] + delta
        return f" or along_ft about {new:.2f} (shift {delta:+.2f} ft along wall {wall['id']})"

    def _check(self, item_id, rect, mode, ctx):
        # (a) walls
        hits = []
        for wid, solid in self.wall_solids.items():
            if not rect.intersects(solid):
                continue
            inter = rect.intersection(solid)
            if inter.area > EPS_AREA and _depth(inter) > EPS_DEPTH:
                hits.append((inter.area, wid, inter))
        if hits:
            hits.sort(key=lambda h: (-h[0], str(h[1])))
            _, wid, inter = hits[0]
            dist, (mx, my) = _escape(rect, self.wall_solids[wid])
            msg = f"{item_id} overlaps wall {wid} by {dist:.2f} ft"
            if len(hits) > 1:
                msg += f" (also walls {', '.join(str(h[1]) for h in hits[1:])})"
            if mode == "against_wall" and wid == ctx["wall"]["id"]:
                msg += f"; try gap_ft >= {max(0.0, ctx['gap'] + dist) + 0.05:.2f}"
            elif mode == "against_wall":
                poly = inter if isinstance(inter, Polygon) else max(_polys(inter), key=lambda p: p.area)
                msg += f"; try a different wall/opening{self._shift_hint(rect, poly, ctx)}"
            else:
                c = rect.centroid
                msg += (f"; the nearest clear spot is about {dist + 0.05:.2f} ft away, around "
                        f"x={c.x + mx * (dist + 0.05):.2f}, z={c.y + my * (dist + 0.05):.2f}, "
                        f"or rotate it")
            raise PlacementError(msg + ".")
        # (b) other furniture
        for oid, other in self._shapes.items():
            if oid == item_id:
                continue
            inter = rect.intersection(other)
            if inter.area > EPS_AREA and _depth(inter) > EPS_DEPTH:
                dist, (mx, my) = _escape(rect, other)
                msg = (f"{item_id} overlaps {oid} by {dist:.2f} ft "
                       f"({inter.area:.2f} sq ft)")
                if mode == "against_wall" and isinstance(inter, Polygon):
                    msg += f"; try{self._shift_hint(rect, inter, ctx).replace(' or', '', 1)}"
                else:
                    c = rect.centroid
                    msg += (f"; move it about {dist + 0.05:.2f} ft (e.g. to x={c.x + mx * (dist + 0.05):.2f}, "
                            f"z={c.y + my * (dist + 0.05):.2f}) or remove {oid} first")
                raise PlacementError(msg + ".")
        # (c) footprint
        if not self.footprint.buffer(1e-6).contains(rect):
            outside = rect.difference(self.footprint)
            far = max((self.footprint.exterior.distance(Point(p))
                       for p in rect.exterior.coords if not self.footprint.contains(Point(p))),
                      default=_depth(outside))
            minx, miny, maxx, maxy = self.footprint.bounds
            raise PlacementError(
                f"{item_id} is {far:.2f} ft outside the house footprint "
                f"({outside.area:.2f} sq ft outside; house spans x {minx:.1f}..{maxx:.1f}, "
                f"y {miny:.1f}..{maxy:.1f}); if against an exterior wall try flip=false, "
                f"otherwise move it inward.")

    def _warnings(self, item_id, rect, height, ctx):
        out = []
        for wid, w in self.walls.items():
            ux, uy = w["u"]
            for o in w["openings"]:
                cx, cy = w["x1"] + ux * o["position"], w["y1"] + uy * o["position"]
                if o["type"] == "door":
                    zone = LineString([(cx - ux * o["width"] / 2, cy - uy * o["width"] / 2),
                                       (cx + ux * o["width"] / 2, cy + uy * o["width"] / 2)]
                                      ).buffer(DOOR_CLEARANCE_FT, cap_style="flat")
                    if rect.intersection(zone).area > 0.05:
                        out.append(f"within {DOOR_CLEARANCE_FT} ft of the door on wall {wid}; "
                                   "it may block the doorway or door swing")
                elif height > o.get("sill", WINDOW_SILL_FT):
                    win = LineString([(cx - ux * o["width"] / 2, cy - uy * o["width"] / 2),
                                      (cx + ux * o["width"] / 2, cy + uy * o["width"] / 2)]
                                     ).buffer(w["thickness"] / 2 + 0.5, cap_style="flat")
                    if rect.intersects(win):
                        out.append(f"{height:.2f} ft tall, taller than the {WINDOW_SILL_FT:g} ft "
                                   f"sill of the window on wall {wid}; it will cover the window")
        wall = ctx.get("wall")
        if wall:
            a, b = ctx["along"] - ctx["half_u"], ctx["along"] + ctx["half_u"]
            if a < -0.05 or b > wall["length"] + 0.05:
                out.append(f"extends past the end of wall {wall['id']} "
                           f"(item spans {a:.2f}..{b:.2f} along a {wall['length']:.2f} ft wall)")
        return out

    # ------------------------------------------------------------------ export
    def export(self, path):
        mats = dict(self.materials)
        for key, surf in (("floor", "floor"), ("walls", "wall")):
            if not mats[key]:   # contract needs an id; fall back to the first library match
                mats[key] = next(m["id"] for m in self.library if m["surface"] == surf)
        scene = {"version": 1, "units": "feet", "house": _rel(self.house_path),
                 "materials": mats,
                 "furniture": [{"id": f["id"], "glb": f["glb"], "size_ft": f["size_ft"],
                                "position": f["position"], "rotation_deg": f["rotation_deg"]}
                               for f in self.furniture.values()]}
        with open(path, "w") as fh:
            json.dump(scene, fh, indent=2)
            fh.write("\n")
        return scene


if __name__ == "__main__":
    os.chdir(REPO)
    s = Scene("floorplan/cubicasa5k/plan1_clean.json")
    print(f"footprint ({s.footprint_method}): {s.footprint.area:.1f} sq ft, "
          f"bounds {tuple(round(v, 2) for v in s.footprint.bounds)}")
    s.set_material("floor", "wood_oak_planks")
    s.set_material("walls", "paint_white")
    p = s.place("table-1", "table_sized.json", "against_wall", wall=25, opening=0)
    print("placed:", json.dumps({k: p[k] for k in ("position", "rotation_deg", "warnings")}))
    s.export("scene_placed.json")
    print("wrote scene_placed.json")
