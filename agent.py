"""Claude tool-use loop that renovates a house with place.Scene and exports scene.json.

Usage:
  .venv/bin/python agent.py "renovate minimalist, put my table under a window" \
      --furniture table_sized.json --house floorplan/cubicasa5k/plan1_clean.json \
      --out scene_agent.json

Manual agentic loop on anthropic.Anthropic().messages.create (SDK 2.x): every tool_use in
a response gets a tool_result in one user message; errors go back with is_error=True so
the model can retry. The loop stops on end_turn, refusal, or after MAX_ITERATIONS calls.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from place import PlacementError, Scene

MODEL = "claude-sonnet-5-5"
MAX_ITERATIONS = 20

TOOLS = [
    {"name": "describe_house",
     "description": "Return the house as text: bounding box, every wall (id, endpoints, length, "
                    "thickness, which side faces the house centre) with its openings (index, "
                    "door/window, width, centre), current materials and placed furniture. "
                    "Units are feet; plan (x, y). Rooms are not named.",
     "input_schema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "search_materials",
     "description": "List library materials. surface is 'floor' or 'wall'; tags are ANDed "
                    "(e.g. ['minimalist']). Returns id, tags, surface.",
     "input_schema": {"type": "object", "properties": {
         "surface": {"type": "string", "enum": ["floor", "wall"]},
         "tags": {"type": "array", "items": {"type": "string"}}},
         "additionalProperties": False}},
    {"name": "set_material",
     "description": "Set the material for the floor or the walls (all walls). The material's "
                    "surface must match.",
     "input_schema": {"type": "object", "properties": {
         "surface": {"type": "string", "enum": ["floor", "walls"]},
         "material_id": {"type": "string"}},
         "required": ["surface", "material_id"], "additionalProperties": False}},
    {"name": "place_furniture",
     "description": (
         "Place a furniture item (real size from its sidecar json). Re-using an item_id moves it. "
         "mode 'against_wall': args {wall: id, opening: index on that wall (centres the item on it, "
         "e.g. under a window) OR along_ft: distance from the wall's (x1,y1) to the item centre, "
         "gap_ft (default 0.1), flip (bool; default puts the item on the side facing the house "
         "centre - use flip for the other side of an interior wall)}. The item's back goes against "
         "the wall, front facing into the room. "
         "mode 'at': args {x, z (plan y), rotation_deg (0 = front faces +y, 90 = +x, 180 = -y, "
         "-90 = -x)}. Optional front_offset_deg if the model's front is not its +z. "
         "Fails with a plain-English reason (wall/furniture overlap, outside the house) - adjust "
         "and retry. Returns position, rotation and warnings (blocked doors/windows)."),
     "input_schema": {"type": "object", "properties": {
         "item_id": {"type": "string"},
         "furniture_json": {"type": "string", "description": "Path to the sidecar json"},
         "mode": {"type": "string", "enum": ["against_wall", "at"]},
         "args": {"type": "object"}},
         "required": ["item_id", "furniture_json", "mode", "args"]}},
    {"name": "export_scene",
     "description": "Write scene.json for the 3D viewer. Call once when done.",
     "input_schema": {"type": "object", "properties": {}, "additionalProperties": False}},
]

SYSTEM = """You are an interior designer working in a floor plan measured in feet.
Use the tools: describe the house first, choose floor and wall materials that fit the brief,
place every furniture item you are given, then call export_scene exactly once.
Windows have a 3 ft sill: items under 3 ft tall can go directly below them. Don't block doors.
If a tool returns an error, read the numbers in it and retry with adjusted arguments.
Finish with a short summary of what you did."""


def run_tool(scene: Scene, name: str, args: dict, out_path: str, furniture: list[str]):
    if name == "describe_house":
        return scene.describe()
    if name == "search_materials":
        res = scene.search_materials(args.get("surface"), args.get("tags"))
        return json.dumps([{k: m[k] for k in ("id", "surface", "tags")} for m in res])
    if name == "set_material":
        return json.dumps(scene.set_material(args["surface"], args["material_id"]))
    if name == "place_furniture":
        path = args["furniture_json"]
        if furniture and path not in furniture and \
                Path(path).resolve() not in [Path(f).resolve() for f in furniture]:
            raise PlacementError(f"Unknown furniture file {path!r}; available: {furniture}.")
        p = scene.place(args["item_id"], path, args["mode"], **(args.get("args") or {}))
        return json.dumps({k: p[k] for k in ("id", "position", "rotation_deg", "footprint", "warnings")})
    if name == "export_scene":
        scene.export(out_path)
        return f"Wrote {out_path} with {len(scene.furniture)} furniture item(s)."
    raise PlacementError(f"Unknown tool {name!r}.")


def run_agent(prompt, furniture, house, out, client=None, library="library.json",
              model=MODEL, max_iterations=MAX_ITERATIONS, log=print):
    if client is None:
        client = make_client()
    scene = Scene(house, library)
    items = "\n".join(f"- {f}: size_ft {json.load(open(f))['size_ft']} (width x height x depth)"
                      for f in furniture)
    messages = [{"role": "user", "content": f"{prompt}\n\nFurniture to place:\n{items or '(none)'}"}]
    exported = False
    for i in range(max_iterations):
        resp = client.messages.create(model=model, max_tokens=16000, system=SYSTEM,
                                      tools=TOOLS, messages=messages,
                                      output_config={"effort": "medium"})
        messages.append({"role": "assistant", "content": resp.content})
        for b in resp.content:
            if b.type == "text" and b.text.strip():
                log(f"[assistant] {b.text.strip()}")
        if resp.stop_reason == "refusal":
            log("[agent] model refused; stopping.")
            break
        if resp.stop_reason == "max_tokens":
            log("[agent] hit max_tokens; stopping.")
            break
        uses = [b for b in resp.content if b.type == "tool_use"]
        if not uses:
            break
        results = []
        for u in uses:
            try:
                out_text = run_tool(scene, u.name, dict(u.input or {}), out, furniture)
                results.append({"type": "tool_result", "tool_use_id": u.id, "content": out_text})
                exported |= u.name == "export_scene"
                log(f"[tool] {u.name}({json.dumps(u.input)}) ok")
            except (PlacementError, KeyError, TypeError, ValueError) as e:
                msg = str(e) if isinstance(e, PlacementError) else f"{type(e).__name__}: {e}"
                results.append({"type": "tool_result", "tool_use_id": u.id,
                                "content": msg, "is_error": True})
                log(f"[tool] {u.name}({json.dumps(u.input)}) ERROR {msg}")
        messages.append({"role": "user", "content": results})
    else:
        log(f"[agent] stopped after {max_iterations} iterations.")
    if not exported:
        scene.export(out)
        log(f"[agent] model never called export_scene; exported current state to {out}.")
    return scene, messages


def make_client():
    try:
        import anthropic
    except ImportError:
        sys.exit("The anthropic package is missing: .venv/bin/pip install anthropic")
    has_profile = (Path.home() / ".config" / "anthropic").exists()
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN") or has_profile):
        sys.exit("No Anthropic credentials found. Set ANTHROPIC_API_KEY "
                 "(export ANTHROPIC_API_KEY=sk-ant-...) or run `ant auth login`.")
    return anthropic.Anthropic()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("prompt")
    ap.add_argument("--furniture", action="append", default=[], help="sidecar json (repeatable)")
    ap.add_argument("--house", default="floorplan/cubicasa5k/plan1_clean.json")
    ap.add_argument("--library", default="library.json")
    ap.add_argument("--out", default="scene_agent.json")
    ap.add_argument("--model", default=MODEL)
    a = ap.parse_args(argv)
    run_agent(a.prompt, a.furniture, a.house, a.out, library=a.library, model=a.model)


if __name__ == "__main__":
    main()
