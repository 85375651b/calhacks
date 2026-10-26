"""Tests for place.py and agent.py. Run: .venv/bin/python -m pytest -q test_place.py"""
import json
import os
from pathlib import Path

import pytest
from anthropic.types import Message, TextBlock, ToolUseBlock, Usage

import agent
from place import PlacementError, Scene

REPO = Path(__file__).resolve().parent
HOUSE = str(REPO / "floorplan/cubicasa5k/plan1_clean.json")
LIB = str(REPO / "library.json")
TABLE = str(REPO / "table_sized.json")


@pytest.fixture
def scene():
    return Scene(HOUSE, LIB)


def test_rejects_non_feet(tmp_path):
    h = json.load(open(HOUSE))
    h["units"] = "pixels"
    p = tmp_path / "h.json"
    p.write_text(json.dumps(h))
    with pytest.raises(ValueError, match="feet"):
        Scene(p, LIB)


def test_footprint_sensible(scene):
    minx, miny, maxx, maxy = scene.footprint.bounds
    assert 36 < maxx - minx < 39 and 35 < maxy - miny < 37.5
    assert 1000 < scene.footprint.area < (maxx - minx) * (maxy - miny)


def test_example_placement(scene):
    p = scene.place("table-1", TABLE, "against_wall", wall=25, opening=0)
    x, y, z = p["position"]
    assert abs(x - 17.513) < 0.01           # window centre: 20.474 - 2.961
    assert abs(z - (1.5229 + 0.2256 / 2 + 0.1 + 2.4278 / 2)) < 0.01
    assert p["rotation_deg"] == 0            # front (+z) faces into the room (+y)
    assert scene.footprint.contains(scene._shapes["table-1"])
    assert p["warnings"] == []


def test_rotation_faces_room(scene):
    # wall 26 is the west exterior wall (x = 10.55); room is to +x -> front +x -> 90 deg
    p = scene.place("t", TABLE, "against_wall", wall=26, along_ft=8)
    assert p["rotation_deg"] == 90
    assert p["position"][0] > 10.55
    # wall 27 is the east exterior wall; room is to -x -> -90
    p = scene.place("t2", TABLE, "against_wall", wall=27, along_ft=8)
    assert p["rotation_deg"] == -90


def test_through_wall_rejected(scene):
    with pytest.raises(PlacementError) as e:
        scene.place("table-1", TABLE, "against_wall", wall=25, opening=0, gap_ft=-0.5)
    msg = str(e.value)
    assert "overlaps wall 25 by 0.50 ft" in msg and "gap_ft >= 0.05" in msg
    # free placement straddling interior wall 45 (x = 20.30)
    with pytest.raises(PlacementError, match=r"overlaps wall 45 by \d"):
        scene.place("table-2", TABLE, "at", x=20.3, z=10, rotation_deg=0)


def test_corner_collision_suggests_shift(scene):
    # along_ft=9.8 pushes the table into wall 26 at the west corner
    with pytest.raises(PlacementError, match="along_ft about"):
        scene.place("table-1", TABLE, "against_wall", wall=25, along_ft=9.8)


def test_overlapping_furniture_rejected(scene):
    scene.place("table-1", TABLE, "against_wall", wall=25, opening=0)
    with pytest.raises(PlacementError, match="overlaps table-1"):
        scene.place("table-2", TABLE, "against_wall", wall=25, along_ft=4.0)
    # moving the same id onto itself is fine
    scene.place("table-1", TABLE, "against_wall", wall=25, along_ft=4.0)


def test_outside_rejected(scene):
    with pytest.raises(PlacementError, match="outside the house footprint"):
        scene.place("table-1", TABLE, "at", x=5, z=5, rotation_deg=0)
    with pytest.raises(PlacementError, match="outside"):
        scene.place("table-1", TABLE, "against_wall", wall=25, opening=0, flip=True)


def test_door_gap_is_not_a_wall(scene):
    # wall 40 (y = 28.48) has a door centred at x = 26.40; a small item in the doorway
    item = {"glb": "x.glb", "size_ft": [1.5, 1, 0.3]}
    p = scene.place("box", item, "at", x=26.40, z=28.48, rotation_deg=0)
    assert any("door" in w for w in p["warnings"])


def test_set_material(scene):
    scene.set_material("floor", "wood_oak_planks")
    with pytest.raises(PlacementError, match="wall material"):
        scene.set_material("floor", "paint_white")
    with pytest.raises(PlacementError, match="No material"):
        scene.set_material("walls", "nope")
    assert [m["id"] for m in scene.search_materials("wall", ["minimalist", "white"])] == \
        ["paint_white", "paint_offwhite"]


def test_export_matches_contract(scene, tmp_path):
    scene.set_material("floor", "wood_oak_planks")
    scene.set_material("walls", "paint_white")
    scene.place("table-1", TABLE, "against_wall", wall=25, opening=0)
    out = tmp_path / "s.json"
    scene.export(out)
    d = json.load(open(out))
    ref = json.load(open(REPO / "scene.json")) if (REPO / "scene.json").exists() else None
    assert d["house"] == "floorplan/cubicasa5k/plan1_clean.json"
    assert set(d) == {"version", "units", "house", "materials", "furniture"}
    f = d["furniture"][0]
    assert set(f) == {"id", "glb", "size_ft", "position", "rotation_deg"}
    assert f["glb"] == "table_sized.glb"
    if ref:
        assert d["materials"] == ref["materials"]
        assert all(abs(a - b) < 0.05 for a, b in zip(f["position"], ref["furniture"][0]["position"]))


def test_describe_compact(scene):
    t = scene.describe()
    assert "25:" in t and "window" in t and len(t) < 6000
    assert 37 in scene.describe(as_text=False)["omitted_short_walls"]   # 0.68 ft stub


# ---------------------------------------------------------------- agent loop (stubbed)
def _msg(content, stop):
    return Message(id="msg", type="message", role="assistant", model=agent.MODEL,
                   content=content, stop_reason=stop, stop_sequence=None,
                   usage=Usage(input_tokens=1, output_tokens=1))


class StubClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []
        self.messages = self

    def create(self, **kw):
        self.calls.append(kw)
        return self.responses.pop(0)


def test_agent_loop(tmp_path):
    out = tmp_path / "scene_agent.json"
    tu = lambda i, name, inp: ToolUseBlock(type="tool_use", id=f"tu{i}", name=name, input=inp)
    responses = [
        _msg([TextBlock(type="text", text="Looking."), tu(1, "describe_house", {})], "tool_use"),
        _msg([tu(2, "set_material", {"surface": "floor", "material_id": "paint_white"}),
              tu(3, "search_materials", {"surface": "floor", "tags": ["light"]})], "tool_use"),
        _msg([tu(4, "set_material", {"surface": "floor", "material_id": "wood_oak_planks"}),
              tu(5, "set_material", {"surface": "walls", "material_id": "paint_white"}),
              tu(6, "place_furniture", {"item_id": "table-1", "furniture_json": TABLE,
                                        "mode": "against_wall",
                                        "args": {"wall": 25, "opening": 0, "gap_ft": -1}})],
             "tool_use"),
        _msg([tu(7, "place_furniture", {"item_id": "table-1", "furniture_json": TABLE,
                                        "mode": "against_wall", "args": {"wall": 25, "opening": 0}}),
              tu(8, "export_scene", {})], "tool_use"),
        _msg([TextBlock(type="text", text="Done.")], "end_turn"),
    ]
    client = StubClient(responses)
    logs = []
    scene, messages = agent.run_agent("minimalist, table under a window", [TABLE], HOUSE,
                                      str(out), client=client, library=LIB, log=logs.append)
    assert len(client.calls) == 5 and not client.responses
    assert client.calls[0]["model"] == "claude-sonnet-5-5"
    assert {t["name"] for t in client.calls[0]["tools"]} == \
        {"describe_house", "search_materials", "set_material", "place_furniture", "export_scene"}
    # wrong-surface material and the through-wall placement came back as errors
    r2 = messages[4]["content"]
    assert r2[0]["is_error"] and "wall material" in r2[0]["content"]
    assert "is_error" not in r2[1]
    r3 = messages[6]["content"]
    assert r3[2]["is_error"] and "overlaps wall 25" in r3[2]["content"]
    assert all(r["tool_use_id"] == f"tu{i}" for r, i in zip(r3, (4, 5, 6)))
    d = json.load(open(out))
    assert d["materials"] == {"floor": "wood_oak_planks", "walls": "paint_white"}
    assert d["furniture"][0]["position"][0] == pytest.approx(17.513, abs=0.01)


def test_agent_iteration_cap(tmp_path):
    out = tmp_path / "s.json"
    loop = [_msg([ToolUseBlock(type="tool_use", id=f"t{i}", name="describe_house", input={})],
                 "tool_use") for i in range(5)]
    client = StubClient(loop)
    agent.run_agent("x", [], HOUSE, str(out), client=client, library=LIB,
                    max_iterations=3, log=lambda *_: None)
    assert len(client.calls) == 3 and out.exists()   # exported current state anyway


def test_agent_missing_key(monkeypatch, tmp_path):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    monkeypatch.setenv("HOME", str(tmp_path))
    with pytest.raises(SystemExit, match="ANTHROPIC_API_KEY"):
        agent.make_client()
