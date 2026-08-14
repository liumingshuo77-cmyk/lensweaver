import base64
import io
import json
import sys
import os

try:
    from PIL import Image, ImageGrab
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

OCR_AVAILABLE = False
_ocr_engine = None
_MODEL_LOADED = False


def _load_ocr():
    global _ocr_engine, OCR_AVAILABLE, _MODEL_LOADED
    if _MODEL_LOADED:
        return
    _MODEL_LOADED = True
    try:
        from rapidocr_onnxruntime import RapidOCR
        _ocr_engine = RapidOCR()
        OCR_AVAILABLE = True
    except Exception:
        OCR_AVAILABLE = False


def _decode_base64(payload):
    if payload.startswith("data:"):
        payload = payload.split(",", 1)[1]
    return base64.b64decode(payload)


def _load_image(image_path=None, image_base64=None):
    if not PIL_AVAILABLE:
        raise RuntimeError("Pillow is not installed")
    if image_path:
        with open(image_path, "rb") as f:
            data = f.read()
    else:
        data = _decode_base64(image_base64)
    return Image.open(io.BytesIO(data))


def _to_jpeg_base64(image, quality):
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def handle_preprocess(req):
    image = _load_image(req.get("image_path"), req.get("image_base64"))
    max_dim = int(req.get("max_dim") or 1568)
    quality = int(req.get("quality") or 85)
    w, h = image.size
    if max(w, h) > max_dim:
        scale = max_dim / max(w, h)
        image = image.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    return {"image_base64": _to_jpeg_base64(image, quality), "width": image.size[0], "height": image.size[1]}


def _bbox_from_box(box):
    xs = [p[0] for p in box]
    ys = [p[1] for p in box]
    return [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)]


def handle_ocr(req):
    _load_ocr()
    if not OCR_AVAILABLE:
        raise RuntimeError("RapidOCR is not installed or failed to load")
    image = _load_image(req.get("image_path"), req.get("image_base64"))
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    result, _ = _ocr_engine(buf.getvalue())
    blocks = []
    if result:
        for box, text, confidence in result:
            blocks.append({
                "text": str(text),
                "confidence": round(float(confidence), 4),
                "bbox": _bbox_from_box(box),
            })
    full_text = "\n".join(b["text"] for b in blocks)
    avg_conf = sum(b["confidence"] for b in blocks) / len(blocks) if blocks else 0.0
    return {"text": full_text, "blocks": blocks, "engine": "rapidocr", "confidence": round(float(avg_conf), 4)}


def handle_clipboard(req):
    if not PIL_AVAILABLE:
        raise RuntimeError("Pillow is not installed")
    grab = ImageGrab.grabclipboard()
    if grab is None:
        return None
    if isinstance(grab, list):
        image = None
        for item in grab:
            try:
                image = Image.open(item)
                break
            except Exception:
                continue
        if image is None:
            return None
    else:
        image = grab
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return {"image_base64": base64.b64encode(buf.getvalue()).decode("ascii")}


HANDLERS = {
    "ping": lambda req: "pong",
    "ocr": handle_ocr,
    "preprocess": handle_preprocess,
    "clipboard": handle_clipboard,
}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as exc:
            sys.stdout.write(json.dumps({"ok": False, "error": "bad request: " + str(exc)}) + "\n")
            sys.stdout.flush()
            continue
        req_id = req.get("id")
        try:
            handler = HANDLERS.get(req.get("type"))
            if handler is None:
                raise RuntimeError("unknown request type: " + str(req.get("type")))
            result = handler(req)
            sys.stdout.write(json.dumps({"id": req_id, "ok": True, "result": result}) + "\n")
        except Exception as exc:
            sys.stdout.write(json.dumps({"id": req_id, "ok": False, "error": str(exc)}) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    if os.name == "nt":
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    main()
