"""CPU CubiCasa worker. stdout is one JSON result; diagnostics go to stderr."""
import argparse
import contextlib
import json
import os
import re
import sys
import csv
import io
from pathlib import Path


class ScaleError(Exception):
    pass


def polygon_parts(g, np):
    if getattr(g, "is_empty", False):
        return []
    if hasattr(g, "geoms"):
        return [p for child in g.geoms for p in polygon_parts(child, np)]
    if hasattr(g, "exterior"):
        return [np.asarray(g.exterior.coords, dtype=float)]
    if hasattr(g, "coords"):
        return []
    p = np.asarray(g, dtype=float)
    return [p] if p.ndim == 2 and p.shape[1] == 2 and len(p) >= 3 else []


def install_compatibility(np):
    # Local compatibility shims: never change the user's CubiCasa checkout.
    import matplotlib
    import matplotlib.cm as cm
    from scipy import stats
    for name, value in (("int", int), ("float", float), ("bool", bool)):
        if name not in np.__dict__:
            setattr(np, name, value)
    def register_cmap(name=None, cmap=None, **kwargs):
        matplotlib.colormaps.register(cmap, name=name, force=True)
    cm.register_cmap = register_cmap
    original_mode = stats.mode
    def old_mode(a, *args, **kwargs):
        if len(args) < 3:
            kwargs.setdefault("keepdims", True)
        return original_mode(a, *args, **kwargs)
    stats.mode = old_mode


def automatic_scale(rgb, barriers, resize, cv2, np):
    import pytesseract
    from pytesseract import TesseractNotFoundError
    if os.environ.get("TESSERACT_CMD"):
        pytesseract.pytesseract.tesseract_cmd = os.environ["TESSERACT_CMD"]
    try:
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        big = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
        tessdata = os.environ.get("TESSDATA_PREFIX") or str(Path(__file__).resolve().parents[2] / "data/cubicasa/tessdata")
        try:
            import tesserocr
            from PIL import Image
            with tesserocr.PyTessBaseAPI(path=tessdata, lang="eng", psm=tesserocr.PSM.SPARSE_TEXT) as api:
                api.SetImage(Image.fromarray(big))
                api.Recognize()
                rows = list(csv.DictReader(io.StringIO(api.GetTSVText(0)), delimiter="\t",
                    fieldnames=["level","page_num","block_num","par_num","line_num","word_num","left","top","width","height","conf","text"]))
            d = {k: [] for k in ["text","left","top","width","height","conf"]}
            for row in rows:
                for k in d:
                    d[k].append(row[k] if k == "text" else float(row[k]))
        except (ImportError, RuntimeError):
            d = pytesseract.image_to_data(big, config="--psm 11", output_type=pytesseract.Output.DICT)
    except TesseractNotFoundError as exc:
        raise ScaleError("Tesseract executable unavailable") from exc
    words = [dict(text=t, x=d["left"][i]/2, y=d["top"][i]/2,
                  w=d["width"][i]/2, h=d["height"][i]/2)
             for i, t in enumerate(d["text"]) if t.strip() and float(d["conf"][i]) > 0]
    lines = []
    for word in sorted(words, key=lambda w: w["x"]):
        cy = word["y"] + word["h"]/2
        for line in lines:
            gap = word["x"] - line["x"] - line["w"]
            if abs(cy-line["y"]-line["h"]/2) < .6*max(word["h"],line["h"]) and -3 < gap < 1.3*max(word["h"],line["h"]):
                bottom = max(line["y"]+line["h"],word["y"]+word["h"])
                line["text"] += " " + word["text"]
                line["w"] = word["x"]+word["w"]-line["x"]
                line["y"] = min(line["y"],word["y"])
                line["h"] = bottom-line["y"]
                break
        else:
            lines.append(dict(word))
    length = r"(\d+)\s*'\s*-?\s*(?:(\d{1,2}(?:\.\d+)?)\s*[\"']?)?"
    pattern = re.compile(length + r"\s*[xX×]\s*" + length)
    measurements = []
    for line in lines:
        text = line["text"].translate(str.maketrans({c: "'" for c in "’‘′`´"}))
        text = text.translate(str.maketrans({c: '"' for c in "”“″"})).replace("''", '"')
        match = pattern.search(text)
        if not match:
            continue
        ft1, inch1, ft2, inch2 = match.groups()
        a = int(ft1)*12+float(inch1 or 0)
        b = int(ft2)*12+float(inch2 or 0)
        if not (12 <= a <= 2400 and 12 <= b <= 2400):
            continue
        measurements.append((a,b,(line["x"]+line["w"]/2)*resize,(line["y"]+line["h"]/2)*resize))
    # Wall polygons and sealed opening polygons bound regions. Ignore semantic
    # room polygons, whose fragmentation caused the earlier scale failure.
    barriers = cv2.morphologyEx(barriers, cv2.MORPH_CLOSE, np.ones((3,3),np.uint8))
    _, labels, stats, _ = cv2.connectedComponentsWithStats((barriers == 0).astype(np.uint8), 8)
    groups = {}
    for a,b,x,y in measurements:
        x,y = int(x),int(y)
        if 0 <= y < labels.shape[0] and 0 <= x < labels.shape[1] and labels[y,x]:
            groups.setdefault(int(labels[y,x]),[]).append((a,b))
    estimates = []
    for region, sizes in groups.items():
        if len(sizes) != 1:
            continue  # Open-plan areas with multiple labels cannot set scale.
        x,y,w,h,area = stats[region]
        if x == 0 or y == 0 or x+w >= labels.shape[1] or y+h >= labels.shape[0] or area < 100:
            continue
        yy,xx = np.where(labels == region)
        (_, _), (rw,rh), _ = cv2.minAreaRect(np.column_stack([xx,yy]).astype(np.float32))
        if rw*rh == 0 or area/(rw*rh) < .8:
            continue
        short,long = sorted([rw,rh])
        a,b = sorted(sizes[0])
        pair = [short/a/resize,long/b/resize]
        if min(pair) <= 0 or max(pair)/min(pair) > 1.10:
            continue
        estimates.extend(pair)
    if len(estimates) < 4:
        raise ScaleError("Need at least two consistent enclosed rooms")
    median = float(np.median(estimates))
    good = np.array([v for v in estimates if abs(v-median)/median < .10])
    if len(good) < 4 or good.std()/good.mean() > .05:
        raise ScaleError("Room scale estimates disagree")
    return float(np.median(good))


def convert(args):
    import cv2
    import numpy as np
    import torch
    import torch.nn.functional as F
    install_compatibility(np)
    sys.path.insert(0, os.path.abspath(args.cubicasa_dir))
    from floortrans.models.hg_furukawa_original import hg_furukawa_original
    from floortrans.loaders import RotateNTurns
    from floortrans.post_prosessing import split_prediction, get_polygons

    image = cv2.imread(args.input, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Unreadable normalized PNG")
    rgb_original = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    original_h, original_w = image.shape[:2]
    ratio = min(1.0, 1024/max(original_w,original_h))
    w,h = round(original_w*ratio),round(original_h*ratio)
    rgb = cv2.resize(rgb_original,(w,h),interpolation=cv2.INTER_AREA)
    # Keep separate actual ratios: integer resize rounding must not shift points.
    sx,sy = w/original_w,h/original_h
    # get_model() initializes obsolete pose-estimation weights via a relative
    # path. We load the full floor-plan checkpoint, so that step is unnecessary.
    model = hg_furukawa_original(n_classes=51)
    model.conv4_ = torch.nn.Conv2d(256,44,bias=True,kernel_size=1)
    model.upsample = torch.nn.ConvTranspose2d(44,44,kernel_size=4,stride=4)
    # Only load the server administrator's trusted official checkpoint.
    checkpoint = torch.load(args.weights,map_location="cpu",weights_only=False)
    model.load_state_dict(checkpoint["model_state"])
    model.eval().cpu()
    torch.set_num_threads(min(4,os.cpu_count() or 1))
    tensor = torch.from_numpy(np.moveaxis(rgb.astype(np.float32)/127.5-1,-1,0)).unsqueeze(0)
    rot = RotateNTurns()
    prediction = torch.zeros((1,44,h,w))
    with torch.inference_mode():
        for forward,back in [(0,0),(1,-1),(2,2),(-1,1)]:
            pred = model(rot(tensor,"tensor",forward))
            pred = rot(rot(pred,"tensor",back),"points",back)
            prediction += F.interpolate(pred,size=(h,w),mode="bilinear",align_corners=True)/4
    heatmaps,rooms,icons = split_prediction(prediction,(h,w),[21,12,11])
    polygons,types,_,_ = get_polygons((heatmaps,rooms,icons),.2,[1,2])
    walls,openings = [],[]
    barrier = np.zeros((h,w),np.uint8)
    for poly,kind in zip(polygons,types):
        is_wall = kind["type"] == "wall"
        is_opening = kind["type"] == "icon" and kind["class"] in (1,2)
        if not is_wall and not is_opening:
            continue
        for pts in polygon_parts(poly,np):
            cv2.fillPoly(barrier,[pts.astype(np.int32)],255)
            # Return endpoints in the normalized upload's original pixel space.
            pts = pts / np.array([sx,sy])
            box = cv2.boxPoints(cv2.minAreaRect(pts.astype(np.float32)))
            sides = [(box[i],box[(i+1)%4]) for i in range(4)]
            lengths = [np.linalg.norm(a-b) for a,b in sides]
            order = np.argsort(lengths)
            p1 = (sides[order[0]][0]+sides[order[0]][1])/2
            # Opposite edge, rather than another equally short adjacent edge.
            opposite = (int(order[0])+2)%4
            p2 = (sides[opposite][0]+sides[opposite][1])/2
            length_px = float(np.linalg.norm(p2-p1))
            if is_wall and length_px*ratio >= 5:
                walls.append(dict(id=len(walls),x1=float(p1[0]),y1=float(p1[1]),x2=float(p2[0]),y2=float(p2[1]),thickness=float(min(lengths))))
            elif is_opening:
                openings.append(dict(center=(p1+p2)/2,width=length_px,type="window" if kind["class"] == 1 else "door"))
    if not walls:
        raise ValueError("No walls")
    attached = []
    for o in openings:
        candidates = []
        for wall in walls:
            a = np.array([wall["x1"],wall["y1"]])
            ab = np.array([wall["x2"],wall["y2"]])-a
            t = float(np.clip(np.dot(o["center"]-a,ab)/np.dot(ab,ab),0,1))
            distance = float(np.linalg.norm(o["center"]-a-t*ab))
            candidates.append((distance,wall,t*float(np.linalg.norm(ab))))
        distance,wall,position = min(candidates,key=lambda row: row[0])
        if distance <= max(wall["thickness"]*2,12/ratio):
            attached.append(dict(wall=wall["id"],type=o["type"],position=position,width=o["width"]))
    ppi = args.pixels_per_inch
    if ppi is None:
        ppi = automatic_scale(rgb_original,barrier,ratio,cv2,np)
    return dict(units="pixels",width_px=original_w,height_px=original_h,
                pixels_per_inch=ppi,scale_method="manual" if args.pixels_per_inch else "ocr",walls=walls,openings=attached)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input",required=True)
    parser.add_argument("--cubicasa-dir",required=True)
    parser.add_argument("--weights",required=True)
    parser.add_argument("--pixels-per-inch",type=float)
    args = parser.parse_args()
    try:
        with contextlib.redirect_stdout(sys.stderr):
            result = convert(args)
        print(json.dumps(result,allow_nan=False))
    except Exception as exc:
        import traceback
        traceback.print_exc(file=sys.stderr)
        code = "scale" if isinstance(exc,ScaleError) else "dependencies" if isinstance(exc,ImportError) else "geometry" if str(exc) == "No walls" else "conversion"
        print(json.dumps({"error":code}))
        sys.exit(1)
