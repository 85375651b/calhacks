"""Photoreal Cycles render of a scene.json (see docs/scene-format.md).

Usage (from anywhere; relative paths resolve against the repo root):
  blender -b --python-exit-code 1 -P render/render.py -- \
      --scene scene.json --out render/out/ --samples 64 --res 1280x720 \
      [--view interior|top|both] [--cam x,y,z,yaw,pitch] [--lens 24] \
      [--exposure 0] [--save-blend]

Units / axes
  Everything is built in metres (1 ft = 0.3048 m) so Cycles lights, sky and the
  physical camera behave normally. Scene (three.js, y-up) -> Blender (z-up) uses
  the standard glTF mapping  (x, y, z) -> (x, -z, y), i.e. plan (px, py) ->
  Blender (px, -py): plan north (small y, top of the image) is Blender +Y.
  rotation_deg (about three.js +y, CCW from above) == rotation about Blender +Z.

--cam x,y,z,yaw,pitch is in scene feet/degrees: position (x, y=height, z) and
  yaw/pitch like a three.js camera: yaw 0 looks toward scene -z (plan north),
  positive yaw turns CCW seen from above (toward -x); positive pitch looks up.
"""
import argparse
import json
import math
import os
import sys
import time

import bpy
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Vector

FT = 0.3048
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOOR_H_IN, SILL_IN, WIN_H_IN = 81.0, 36.0, 48.0


def rp(p):
    return p if os.path.isabs(p) else os.path.join(ROOT, p)


def plan_to_bl(px, py, h=0.0):
    """plan feet (x, y) + height feet -> Blender metres."""
    return Vector((px * FT, -py * FT, h * FT))


# --------------------------------------------------------------------------- args
def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", default="scene.json")
    ap.add_argument("--out", default="render/out/")
    ap.add_argument("--samples", type=int, default=64)
    ap.add_argument("--res", default="1280x720")
    ap.add_argument("--view", default="both", choices=["interior", "top", "both"])
    ap.add_argument("--cam", default=None, help="x,y,z,yaw,pitch in scene feet/deg")
    ap.add_argument("--lens", type=float, default=24.0)
    ap.add_argument("--exposure", type=float, default=0.4)
    ap.add_argument("--sun", default="330,30", help="sun azimuth,elevation deg "
                    "(azimuth: compass direction the sun is in, 0 = plan north)")
    ap.add_argument("--save-blend", action="store_true")
    ap.add_argument("--path", default=None, help="json list of {x,y,z,yaw,pitch} camera "
                    "frames (scene feet/deg); renders frames/frame_0001.png ... in one session")
    return ap.parse_args(argv)


# ---------------------------------------------------------------------- materials
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h):
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def new_material(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree.nodes, m.node_tree.links, m.node_tree.nodes["Principled BSDF"]


def load_image(path, non_color):
    img = bpy.data.images.load(rp(path), check_existing=True)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def library_material(entry, fallback_rough=0.6):
    """Principled material from a library.json entry. Meshes carry UVs in metres,
    so a Mapping node scales by 1/tile so one tile = tile_ft in reality."""
    m, nodes, links, bsdf = new_material("lib_" + entry["id"])
    bsdf.inputs["Roughness"].default_value = fallback_rough
    if "maps" not in entry:
        bsdf.inputs["Base Color"].default_value = hex_rgba(entry.get("color_hex", "#cccccc"))
        return m
    tile_m = float(entry.get("tile_ft", 3)) * FT
    uv = nodes.new("ShaderNodeUVMap")
    mp = nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / tile_m, 1 / tile_m, 1)
    links.new(uv.outputs["UV"], mp.inputs["Vector"])
    maps = entry["maps"]

    def tex(key, non_color):
        t = nodes.new("ShaderNodeTexImage")
        t.image = load_image(maps[key], non_color)
        links.new(mp.outputs["Vector"], t.inputs["Vector"])
        return t

    links.new(tex("color", False).outputs["Color"], bsdf.inputs["Base Color"])
    if maps.get("roughness"):
        links.new(tex("roughness", True).outputs["Color"], bsdf.inputs["Roughness"])
    if maps.get("normal"):
        nm = nodes.new("ShaderNodeNormalMap")  # tangent space, OpenGL (+Y) = Blender
        links.new(tex("normal", True).outputs["Color"], nm.inputs["Color"])
        links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def plain_material(name, hexcol, rough=0.5, metallic=0.0):
    m, *_ , bsdf = new_material(name)
    bsdf.inputs["Base Color"].default_value = hex_rgba(hexcol)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    return m


def glass_material():
    """Thin window glass: reflective/refractive for camera rays, transparent to
    shadow rays so the sun and sky actually light the room (no caustic blocking)."""
    m, nodes, links, bsdf = new_material("window_glass")
    bsdf.inputs["Roughness"].default_value = 0.0
    bsdf.inputs["IOR"].default_value = 1.5
    bsdf.inputs["Transmission Weight"].default_value = 1.0
    transp = nodes.new("ShaderNodeBsdfTransparent")
    lp = nodes.new("ShaderNodeLightPath")
    mix = nodes.new("ShaderNodeMixShader")
    # Mostly see-through: transparent + a bit of glass reflection for camera rays
    mix2 = nodes.new("ShaderNodeMixShader")
    mix2.inputs["Fac"].default_value = 0.15
    links.new(transp.outputs[0], mix2.inputs[1])
    links.new(bsdf.outputs[0], mix2.inputs[2])
    links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
    links.new(transp.outputs[0], mix.inputs[1])
    links.new(mix2.outputs[0], mix.inputs[2])
    out = nodes["Material Output"]
    links.new(mix.outputs[0], out.inputs["Surface"])
    return m


# --------------------------------------------------------------------- mesh utils
def assign_metric_uvs(bm):
    """UVs = world metres projected on each face's plane (cube projection that
    follows the face orientation): textures never stretch and share one scale."""
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        if abs(n.z) > 0.7:
            for l in f.loops:
                l[uvl].uv = (l.vert.co.x, l.vert.co.y)
        else:
            t = Vector((-n.y, n.x, 0)).normalized()
            for l in f.loops:
                l[uvl].uv = (l.vert.co.dot(t), l.vert.co.z)


def mesh_object(name, boxes, material, coll, jitter=0.0):
    """boxes: list of (center Vector, size (sx, sy, sz), angle_rad about Z), built
    directly in world coordinates (object at origin). jitter grows box k by
    k*jitter metres so overlapping boxes never share coplanar faces."""
    bm = bmesh.new()
    for k, (c, s, ang) in enumerate(boxes):
        s = tuple(v + k * jitter for v in s)
        res = bmesh.ops.create_cube(bm, size=1.0)
        verts = res["verts"]
        mat = Matrix.Translation(c) @ Matrix.Rotation(ang, 4, "Z") @ Matrix.Diagonal((*s, 1))
        bmesh.ops.transform(bm, matrix=mat, verts=verts)
    bm.normal_update()
    assign_metric_uvs(bm)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(material)
    coll.objects.link(ob)
    return ob


# ------------------------------------------------------------------------- house
def wall_sections(length, openings, height_in):
    """Port of src/lib/planner/detectedWalls.js wallSections (inches)."""
    gaps = []
    for o in openings:
        door = o["type"] == "door"
        bottom = 0.0 if door else o.get("sill", SILL_IN / 12) * 12
        h = o.get("height", (DOOR_H_IN if door else WIN_H_IN) / 12) * 12
        g = dict(a=max(0.0, o["position"] * 12 - o["width"] * 6),
                 b=min(length, o["position"] * 12 + o["width"] * 6),
                 bottom=min(height_in, bottom), top=min(height_in, bottom + h), o=o)
        if g["b"] > g["a"] and g["top"] > g["bottom"]:
            gaps.append(g)
    xs = sorted(set([0.0, length] + [v for g in gaps for v in (g["a"], g["b"])]))
    parts = []
    for a, b in zip(xs, xs[1:]):
        mid = (a + b) / 2
        holes = sorted([g for g in gaps if g["a"] < mid < g["b"]], key=lambda g: g["bottom"])
        y = 0.0
        for g in holes:
            if g["bottom"] > y:
                parts.append((a, b, y, g["bottom"]))
            y = max(y, g["top"])
        if y < height_in:
            parts.append((a, b, y, height_in))
    return parts, gaps


def footprint_rects(walls, res=0.125, close=0.6):
    """Interior footprint (incl. wall thickness) as axis-aligned rectangles in plan
    feet: rasterise walls (dilated to close detector gaps), flood-fill the outside,
    then erode the dilation back off."""
    xs = [w[k] for w in walls for k in ("x1", "x2")]
    ys = [w[k] for w in walls for k in ("y1", "y2")]
    x0, y0 = min(xs) - 3, min(ys) - 3
    W = int((max(xs) + 3 - x0) / res) + 1
    H = int((max(ys) + 3 - y0) / res) + 1
    grid = np.zeros((H, W), bool)
    gy, gx = np.mgrid[0:H, 0:W]
    px, py = x0 + (gx + 0.5) * res, y0 + (gy + 0.5) * res
    for w in walls:
        ax, ay, bx, by = w["x1"], w["y1"], w["x2"], w["y2"]
        L = math.hypot(bx - ax, by - ay) or 1e-6
        dx, dy = (bx - ax) / L, (by - ay) / L
        rx, ry = px - ax, py - ay
        u = rx * dx + ry * dy
        v = -rx * dy + ry * dx
        r = w["thickness"] / 2 + close
        grid |= (u > -r) & (u < L + r) & (np.abs(v) < r)
    outside = np.zeros_like(grid)
    stack = [(0, 0)]
    outside[0, 0] = True
    while stack:
        i, j = stack.pop()
        for a, b in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
            if 0 <= a < H and 0 <= b < W and not outside[a, b] and not grid[a, b]:
                outside[a, b] = True
                stack.append((a, b))
    inside = ~outside
    k = int(round(close / res))
    for _ in range(k):  # erode
        e = inside.copy()
        e[1:, :] &= inside[:-1, :]; e[:-1, :] &= inside[1:, :]
        e[:, 1:] &= inside[:, :-1]; e[:, :-1] &= inside[:, 1:]
        inside = e
    # greedy rectangles
    used = np.zeros_like(inside)
    rects = []
    for i in range(H):
        j = 0
        while j < W:
            if inside[i, j] and not used[i, j]:
                j2 = j
                while j2 < W and inside[i, j2] and not used[i, j2]:
                    j2 += 1
                i2 = i + 1
                while i2 < H and inside[i2, j:j2].all() and not used[i2, j:j2].any():
                    i2 += 1
                used[i:i2, j:j2] = True
                rects.append((x0 + j * res, y0 + i * res, x0 + j2 * res, y0 + i2 * res))
                j = j2
            else:
                j += 1
    return rects


def build_house(house, mats, coll):
    walls = house["walls"]
    ceil_ft = float(house.get("ceiling_height", 8))
    H_in = ceil_ft * 12
    by_wall = {}
    for o in house.get("openings", []):
        by_wall.setdefault(o["wall"], []).append(o)

    wall_boxes, base_boxes, glass_boxes, frame_boxes = [], [], [], []
    for wi, w in enumerate(walls):
        ax, ay, bx, by = w["x1"], w["y1"], w["x2"], w["y2"]
        # Overlapping walls would have coplanar faces -> shadow acne (black
        # patches). A tiny per-wall offset (<= ~1 cm) keeps every face distinct.
        jit = (wi + 1) * 0.00015
        L_ft = math.hypot(bx - ax, by - ay)
        if L_ft < 1e-3:
            continue
        dx, dy = (bx - ax) / L_ft, (by - ay) / L_ft
        th = w["thickness"]
        ang = math.atan2(-dy, dx)  # direction in Blender XY (y flipped)
        # extend wall ends slightly to hide detector gaps; openings shift with it
        ext = min(0.5 * th, 0.15)
        parts, gaps = wall_sections((L_ft + 2 * ext) * 12,
                                    [dict(o, position=o["position"] + ext) for o in by_wall.get(w["id"], [])],
                                    H_in)

        def center(along_in, h_in):
            s = along_in / 12 - ext
            return plan_to_bl(ax + dx * s, ay + dy * s, h_in / 12)

        for (a, b, bot, top) in parts:
            # sections reaching the ceiling poke into the ceiling slab by jit
            up = 2 * jit if top >= H_in else 0.0
            wall_boxes.append((center((a + b) / 2, (bot + top) / 2) + Vector((0, 0, up / 2)),
                               ((b - a) / 12 * FT, th * FT + jit, (top - bot) / 12 * FT + up), ang))
            if bot == 0:  # baseboard: 3.5 in tall, proud of the wall by 0.5 in each side
                base_boxes.append((center((a + b) / 2, 1.75) + Vector((0, 0, jit / 2)),
                                   ((b - a) / 12 * FT, (th + 1 / 12) * FT + jit,
                                    3.5 / 12 * FT + jit), ang))
        for g in gaps:
            if g["o"]["type"] != "window":
                continue
            wid, hgt = (g["b"] - g["a"]), (g["top"] - g["bottom"])
            mid_a, mid_h = (g["a"] + g["b"]) / 2, (g["bottom"] + g["top"]) / 2
            glass_boxes.append((center(mid_a, mid_h), (wid / 12 * FT, 0.25 / 12 * FT, hgt / 12 * FT), ang))
            fw, fd = 2.0, min(th * 12, 3.0)  # frame 2 in wide, up to 3 in deep
            for (ca, ch, sa, sh) in ((mid_a, g["bottom"] + fw / 2, wid, fw),
                                     (mid_a, g["top"] - fw / 2, wid, fw),
                                     (g["a"] + fw / 2, mid_h, fw, hgt),
                                     (g["b"] - fw / 2, mid_h, fw, hgt),
                                     (mid_a, mid_h, 1.2, hgt)):  # centre mullion
                frame_boxes.append((center(ca, ch), (sa / 12 * FT, fd / 12 * FT, sh / 12 * FT), ang))
            # interior window sill board
            frame_boxes.append((center(mid_a, g["bottom"] - 0.5),
                                ((wid + 4) / 12 * FT, (th * 12 + 1.5) / 12 * FT, 1.0 / 12 * FT), ang))

    objs = {}
    objs["walls"] = mesh_object("walls", wall_boxes, mats["walls"], coll)
    objs["baseboards"] = mesh_object("baseboards", base_boxes, mats["trim"], coll)
    objs["glass"] = mesh_object("window_glass", glass_boxes, mats["glass"], coll)
    objs["frames"] = mesh_object("window_frames", frame_boxes, mats["trim"], coll, jitter=0.0001)

    rects = footprint_rects(walls)
    fl, ce = [], []
    for (x0, y0, x1, y1) in rects:
        c = plan_to_bl((x0 + x1) / 2, (y0 + y1) / 2)
        sz = ((x1 - x0) * FT, (y1 - y0) * FT)
        fl.append((c + Vector((0, 0, -0.05)), (*sz, 0.1), 0.0))
        ce.append((c + Vector((0, 0, ceil_ft * FT + 0.05)), (*sz, 0.1), 0.0))
    objs["floor"] = mesh_object("floor", fl, mats["floor"], coll)
    objs["ceiling"] = mesh_object("ceiling", ce, mats["ceiling"], coll)
    # Merge the ceiling's rectangles' overlapping internal faces don't matter (flat).

    # exterior ground
    xs = [w[k] for w in walls for k in ("x1", "x2")]
    ys = [w[k] for w in walls for k in ("y1", "y2")]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    objs["ground"] = mesh_object("ground", [(plan_to_bl(cx, cy, -0.3), (400, 400, 0.1), 0.0)],
                                 mats["ground"], coll)
    bbox = (min(xs), min(ys), max(xs), max(ys))
    print(f"[render] walls={len(walls)} sections={len(wall_boxes)} windows={len(glass_boxes)} "
          f"floor rects={len(rects)} bbox_ft={tuple(round(v, 2) for v in bbox)}")
    return objs, bbox, ceil_ft


# --------------------------------------------------------------------- furniture
def world_bbox(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == "MESH" for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def place_furniture(items, coll):
    for it in items:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=rp(it["glb"]))
        new = [o for o in bpy.data.objects if o not in before]
        root = bpy.data.objects.new("furn_" + it.get("id", "item"), None)
        coll.objects.link(root)
        for o in new:
            for c in o.users_collection:
                c.objects.unlink(o)
            coll.objects.link(o)
            if o.parent is None:
                o.parent = root
            # glTF default metallicFactor is 1.0; generated meshes rarely mean it.
            for slot in getattr(o, "material_slots", []):
                m = slot.material
                if m and m.use_nodes:
                    for n in m.node_tree.nodes:
                        if n.type == "BSDF_PRINCIPLED":
                            if not n.inputs["Metallic"].is_linked:
                                n.inputs["Metallic"].default_value = 0.0
                            r = n.inputs["Roughness"]
                            if not r.is_linked and r.default_value > 0.95:
                                r.default_value = 0.55
        x, y, z = it.get("position", [0, 0, 0])
        root.location = plan_to_bl(x, z, y)
        root.rotation_euler = (0, 0, math.radians(it.get("rotation_deg", 0)))
        root.scale = (FT, FT, FT)  # glb authored in feet
        bpy.context.view_layer.update()
        lo, hi = world_bbox(new)
        size = (hi - lo) / FT
        print(f"[render] furniture {it.get('id')}: bbox size ft (X,Y,Z)=({size.x:.3f},{size.y:.3f},{size.z:.3f}) "
              f"size_ft[w,h,d]={it.get('size_ft')} bottom_z_ft={lo.z / FT:.3f} "
              f"centre plan=({(lo.x + hi.x) / 2 / FT:.2f},{-(lo.y + hi.y) / 2 / FT:.2f})")


# ---------------------------------------------------------------- lights, camera
def sun_vector(az_deg, el_deg):
    """Unit vector toward the sun; azimuth = compass bearing (0 = plan north =
    Blender +Y, 90 = east = +X)."""
    az, el = math.radians(az_deg), math.radians(el_deg)
    return Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))


def setup_world_and_sun(az_deg, el_deg, bbox, ceil_ft, coll):
    scn = bpy.context.scene
    world = bpy.data.worlds.new("sky")
    scn.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes["Background"]
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING" if "MULTIPLE_SCATTERING" in \
        [e.identifier for e in sky.bl_rna.properties["sky_type"].enum_items] else "NISHITA"
    sky.sun_disc = False
    sky.sun_elevation = math.radians(el_deg)
    # compass azimuth (0 = plan north = Blender +Y, 90 = east = +X)
    az = math.radians(az_deg)
    sky.sun_rotation = math.radians((90 - az_deg))  # Blender sky: 0 = +X, CCW
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.35
    # sun lamp matched to the sky
    sun_dir = sun_vector(az_deg, el_deg)
    ld = bpy.data.lights.new("sun", "SUN")
    ld.energy = 4.0
    ld.angle = math.radians(0.6)
    ld.color = (1.0, 0.95, 0.88)
    sun = bpy.data.objects.new("sun", ld)
    sun.rotation_euler = sun_dir.to_track_quat("Z", "Y").to_euler()
    coll.objects.link(sun)
    # subtle warm interior fill: one large ceiling area light per ~room-sized cell
    x0, y0, x1, y1 = bbox
    fd = bpy.data.lights.new("fill", "AREA")
    fd.shape = "RECTANGLE"
    fd.size, fd.size_y = (x1 - x0) * FT * 0.8, (y1 - y0) * FT * 0.8
    fd.energy = 60.0
    fd.color = (1.0, 0.9, 0.8)
    fill = bpy.data.objects.new("interior_fill", fd)
    fill.location = plan_to_bl((x0 + x1) / 2, (y0 + y1) / 2, ceil_ft - 0.05)
    coll.objects.link(fill)
    try:
        fill.visible_glossy = False
        fill.visible_camera = False
    except AttributeError:
        pass
    return sun, fill, sky


def add_portals(house, coll):
    """Area-light portals in every window: big noise reduction for sky light."""
    by_id = {w["id"]: w for w in house["walls"]}
    n = 0
    for o in house.get("openings", []):
        if o["type"] != "window":
            continue
        w = by_id[o["wall"]]
        L = math.hypot(w["x2"] - w["x1"], w["y2"] - w["y1"])
        dx, dy = (w["x2"] - w["x1"]) / L, (w["y2"] - w["y1"]) / L
        sill = o.get("sill", SILL_IN / 12)
        h = o.get("height", WIN_H_IN / 12)
        c = plan_to_bl(w["x1"] + dx * o["position"], w["y1"] + dy * o["position"], sill + h / 2)
        ld = bpy.data.lights.new(f"portal{n}", "AREA")
        ld.shape = "RECTANGLE"
        ld.size, ld.size_y = o["width"] * FT, h * FT
        ld.cycles.is_portal = True
        ob = bpy.data.objects.new(f"portal{n}", ld)
        # area light faces local -Z; orient it horizontal-normal, in the wall plane
        tangent = Vector((dx, -dy, 0))
        normal = Vector((-tangent.y, tangent.x, 0))
        # pick the normal that points into the house (toward plan centroid)
        xs = [v[k] for v in house["walls"] for k in ("x1", "x2")]
        ys = [v[k] for v in house["walls"] for k in ("y1", "y2")]
        centre = plan_to_bl(sum(xs) / len(xs), sum(ys) / len(ys), sill + h / 2)
        if normal.dot(centre - c) < 0:
            normal = -normal
        zaxis = -normal  # light shines along -Z => into the house
        xaxis = tangent
        yaxis = zaxis.cross(xaxis)
        ob.matrix_world = Matrix.Translation(c + normal * w["thickness"] * FT) @ \
            Matrix((xaxis, yaxis, zaxis)).transposed().to_4x4()
        coll.objects.link(ob)
        n += 1
    return n


def make_camera(name, coll):
    cd = bpy.data.cameras.new(name)
    ob = bpy.data.objects.new(name, cd)
    coll.objects.link(ob)
    return ob


def aim_scene_cam(cam, x, y, z, yaw, pitch, lens):
    cam.data.type = "PERSP"
    cam.data.lens = lens
    cam.data.sensor_width = 36
    cam.data.clip_start = 0.05
    cam.location = plan_to_bl(x, z, y)
    cam.rotation_euler = Euler((math.radians(90 + pitch), 0, math.radians(yaw)), "XYZ")


def look_at_yaw_pitch(eye, target):
    """eye/target in scene feet (x, y, z) -> (yaw, pitch) per the --cam convention."""
    dx, dy, dz = (t - e for t, e in zip(target, eye))
    yaw = math.degrees(math.atan2(-dx, -dz))
    pitch = math.degrees(math.atan2(dy, math.hypot(dx, dz)))
    return yaw, pitch


# -------------------------------------------------------------------------- main
def setup_render(args):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.samples = args.samples
    scn.cycles.use_adaptive_sampling = True
    scn.cycles.adaptive_threshold = 0.02
    scn.cycles.use_denoising = True
    try:
        scn.cycles.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    scn.cycles.max_bounces = 8
    scn.cycles.diffuse_bounces = 4
    scn.cycles.glossy_bounces = 3
    scn.cycles.transmission_bounces = 6
    scn.cycles.transparent_max_bounces = 8
    scn.cycles.caustics_reflective = False
    scn.cycles.caustics_refractive = False
    scn.cycles.sample_clamp_indirect = 8.0
    w, h = (int(v) for v in args.res.lower().split("x"))
    scn.render.resolution_x, scn.render.resolution_y = w, h
    scn.render.resolution_percentage = 100
    scn.render.image_settings.file_format = "PNG"
    scn.render.threads_mode = "AUTO"
    vs = scn.view_settings
    try:
        vs.view_transform = "AgX"
    except TypeError:
        print("[render] WARNING: AgX view transform unavailable, using Standard")
        vs.view_transform = "Standard"
    try:
        vs.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    vs.exposure = args.exposure
    scn.unit_settings.system = "METRIC"
    scn.unit_settings.scale_length = 1.0


def render_to(path, cam):
    scn = bpy.context.scene
    scn.camera = cam
    scn.render.filepath = path
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    dt = time.time() - t0
    print(f"[render] wrote {path} in {dt:.1f}s")
    return dt


def ensure_agx():
    """Fedora's Blender 5.2 ships an OCIO 2.5 config but links OpenColorIO 2.4 and
    falls back to 'Standard' only. If AgX is missing, re-exec Blender with our
    minimal OCIO config (render/ocio/config.ocio) so the same command still works."""
    try:
        bpy.context.scene.view_settings.view_transform = "AgX"
        return
    except TypeError:
        pass
    cfg = os.path.join(ROOT, "render", "ocio", "config.ocio")
    if os.environ.get("OCIO") or not os.path.exists(cfg):
        return
    print(f"[render] AgX unavailable; re-launching Blender with OCIO={cfg}")
    sys.stdout.flush()
    os.execve(bpy.app.binary_path, sys.argv, dict(os.environ, OCIO=cfg))


def main():
    ensure_agx()
    args = parse_args()
    scene = json.load(open(rp(args.scene)))
    house = scene["house"]
    if isinstance(house, str):
        house = json.load(open(rp(house)))
    lib = {e["id"]: e for e in json.load(open(rp("library.json")))}

    bpy.ops.wm.read_factory_settings(use_empty=True)
    coll = bpy.context.scene.collection
    setup_render(args)

    mset = scene.get("materials", {})
    mats = {
        "floor": library_material(lib[mset.get("floor", "wood_oak_planks")], 0.5),
        "walls": library_material(lib[mset.get("walls", "paint_white")], 0.75),
        "ceiling": plain_material("ceiling", "#f4f4f1", 0.85),
        "trim": plain_material("trim_white", "#f2f2ee", 0.35),
        "glass": glass_material(),
        "ground": plain_material("ground", "#6b7351", 0.9),
    }
    objs, bbox, ceil_ft = build_house(house, mats, coll)
    place_furniture(scene.get("furniture", []), coll)
    az, el = (float(v) for v in args.sun.split(","))
    sun, fill, sky = setup_world_and_sun(az, el, bbox, ceil_ft, coll)
    nport = add_portals(house, coll)
    print(f"[render] {nport} window portals")

    os.makedirs(rp(args.out), exist_ok=True)
    out = rp(args.out)
    times = {}

    cam = make_camera("cam_interior", coll)
    if args.cam:
        x, y, z, yaw, pitch = (float(v) for v in args.cam.split(","))
    else:
        # eye level 5.5 ft in the primary bedroom, looking at the table under the
        # north windows (wall 25)
        x, y, z = 13.2, 5.5, 15.5
        yaw, pitch = look_at_yaw_pitch((x, y, z), (16.6, 3.4, 2.4))
    aim_scene_cam(cam, x, y, z, yaw, pitch, args.lens)
    print(f"[render] interior cam (scene ft) x={x:.2f} y={y:.2f} z={z:.2f} yaw={yaw:.1f} pitch={pitch:.1f}")

    top = make_camera("cam_top", coll)
    x0, y0, x1, y1 = bbox
    top.data.type = "ORTHO"
    rw, rh = bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y
    span_x, span_y = (x1 - x0) * FT * 1.12, (y1 - y0) * FT * 1.12
    top.data.ortho_scale = max(span_x, span_y * rw / rh)
    top.data.clip_end = 200
    top.location = plan_to_bl((x0 + x1) / 2, (y0 + y1) / 2, 60)
    top.rotation_euler = (0, 0, 0)  # looks down -Z, image up = +Y = plan north

    if args.view in ("interior", "both"):
        objs["ceiling"].hide_render = False
        times["interior"] = render_to(os.path.join(out, "interior.png"), cam)
    if args.view in ("top", "both"):
        # cutaway: no ceiling, no fill; higher sun so wall shadows stay short
        objs["ceiling"].hide_render = True
        fill.hide_render = True
        rot0 = sun.rotation_euler.copy()
        sun.rotation_euler = sun_vector(az, 62).to_track_quat("Z", "Y").to_euler()
        times["top"] = render_to(os.path.join(out, "top.png"), top)
        sun.rotation_euler = rot0
        objs["ceiling"].hide_render = False
        fill.hide_render = False
    if args.path:
        frames = json.load(open(rp(args.path)))
        fdir = os.path.join(out, "frames")
        os.makedirs(fdir, exist_ok=True)
        t0 = time.time()
        for i, f in enumerate(frames, 1):
            aim_scene_cam(cam, f["x"], f["y"], f["z"], f["yaw"], f["pitch"], args.lens)
            render_to(os.path.join(fdir, f"frame_{i:04d}.png"), cam)
            print(f"[render] frame {i}/{len(frames)} done, {time.time() - t0:.0f}s elapsed")
        times["path"] = time.time() - t0
    if args.save_blend:
        p = os.path.join(out, "scene.blend")
        bpy.ops.wm.save_as_mainfile(filepath=p)
        print(f"[render] saved {p}")
    print("[render] times:", {k: round(v, 1) for k, v in times.items()})


if __name__ == "__main__":
    main()
