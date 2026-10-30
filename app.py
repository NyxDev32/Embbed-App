import json
import mimetypes
import os
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests
from flask import Flask, jsonify, request, send_from_directory

BASE = Path(__file__).parent
HISTORY_FILE = BASE / "history.json"
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "10"))  # batas upload Discord (default server: 10 MB)
VIDEO_EXT = {".mp4", ".webm", ".mov", ".mkv"}
WEBHOOK_RE = re.compile(r"^https://(?:(?:canary|ptb)\.)?discord(?:app)?\.com/api/webhooks/\d+/[\w-]+$")
API = "https://discord.com/api/v10"

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = (MAX_UPLOAD_MB + 1) * 1024 * 1024
lock = threading.Lock()


# ---------- helpers ----------
def load_history():
    try:
        return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def save_history(items):
    HISTORY_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


GROUPS = [("+", "✅ Added"), ("!", "🛠️ Fixed"), ("*", "♻️ Changed"), ("-", "🗑️ Removed"), ("", "📝 Changes")]
URL_FIELDS = {"author_icon": "Icon author", "thumbnail": "Thumbnail", "image": "Gambar besar", "download_url": "Link download"}


def chunk_fields(lines, name):
    """Pecah daftar ke beberapa field (maks 1024 karakter per field)."""
    chunks, cur = [], ""
    for ln in lines:
        ln = ln[:1000]
        if len(cur) + len(ln) + 1 > 1024:
            chunks.append(cur)
            cur = ""
        cur += ("\n" if cur else "") + ln
    if cur:
        chunks.append(cur)
    return [{"name": name if i == 0 else "\u200b", "value": v, "inline": False} for i, v in enumerate(chunks)]


def parse_changelog(text, grouped):
    """Prefix: + added, ! fixed, * / ~ changed, - removed. Tanpa prefix = umum."""
    buckets = {k: [] for k, _ in GROUPS}
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = re.match(r"^([+!*~-])\s+(.*)$", line)
        key, body = ("*" if m.group(1) == "~" else m.group(1), m.group(2)) if m else ("", re.sub(r"^•\s*", "", line))
        buckets[key if grouped else ""].append(f"• {body}")
    fields = []
    for key, label in GROUPS:
        if buckets[key]:
            fields += chunk_fields(buckets[key], label if grouped else "📝 Changelog")
    return fields


def validate(form, file):
    errors = []
    mode = form.get("mode", "webhook")
    if mode == "webhook":
        if not WEBHOOK_RE.match(form.get("webhook_url", "").strip()):
            errors.append("Webhook URL tidak valid (format: https://discord.com/api/webhooks/ID/TOKEN).")
    elif mode == "bot":
        if len(form.get("bot_token", "").strip()) < 30:
            errors.append("Token bot tidak valid.")
        if not re.fullmatch(r"\d{15,25}", form.get("channel_id", "").strip()):
            errors.append("Channel ID harus berupa angka (15–25 digit).")
    else:
        errors.append("Mode harus 'webhook' atau 'bot'.")

    title = form.get("title", "").strip()
    desc = form.get("description", "").strip()
    log = form.get("changelog", "").strip()
    video = form.get("video_url", "").strip()
    if not title:
        errors.append("Judul wajib diisi.")
    if len(title) > 256:
        errors.append("Judul maksimal 256 karakter.")
    if len(desc) > 4000:
        errors.append("Deskripsi maksimal 4000 karakter.")
    if not (desc or log):
        errors.append("Isi deskripsi atau changelog.")
    if len(log) > 4000:
        errors.append("Changelog maksimal 4000 karakter.")
    if video and not re.match(r"^https?://\S+$", video):
        errors.append("Link video harus diawali http:// atau https://")
    if not re.fullmatch(r"#?[0-9a-fA-F]{6}", form.get("color", "#5865f2").strip() or "#5865f2"):
        errors.append("Warna harus format hex, contoh #5865F2.")
    for key, label in URL_FIELDS.items():
        val = form.get(key, "").strip()
        if val and not re.match(r"^https?://\S+$", val):
            errors.append(f"{label} harus berupa URL http(s).")
    if len(form.get("footer", "")) > 2048 or len(form.get("author", "")) > 256:
        errors.append("Footer maks 2048 karakter dan author maks 256 karakter.")
    if file and file.filename:
        if Path(file.filename).suffix.lower() not in VIDEO_EXT:
            errors.append("Format video harus: " + ", ".join(sorted(VIDEO_EXT)))
    return errors


def build_payload(form):
    g = lambda k: form.get(k, "").strip()
    title, version, video = g("title") or "Judul update", g("version"), g("video_url")
    try:
        color = int((g("color") or "#2aa3e6").lstrip("#"), 16)
    except ValueError:
        color = 0x2AA3E6

    embed = {"title": (f"🚀 {title}" + (f" — {version}" if version else ""))[:256], "color": color,
             "footer": {"text": (g("footer") or "Update Announcement")[:2048]}, "fields": []}
    if g("description"):
        embed["description"] = g("description")
    if g("author"):
        embed["author"] = {"name": g("author")[:256]}
        if g("author_icon"):
            embed["author"]["icon_url"] = g("author_icon")
    if g("thumbnail"):
        embed["thumbnail"] = {"url": g("thumbnail")}
    if g("image"):
        embed["image"] = {"url": g("image")}
    if g("timestamp") == "1":
        embed["timestamp"] = datetime.now(timezone.utc).isoformat()

    for line in g("info").splitlines()[:6]:  # "Kunci: nilai" -> field sejajar
        m = re.match(r"^([^:]{1,40}):\s*(.+)$", line.strip())
        if m:
            embed["fields"].append({"name": m.group(1).strip(), "value": m.group(2).strip()[:1024], "inline": True})
    embed["fields"] += parse_changelog(g("changelog"), g("group") == "1")
    if g("download_url"):
        embed["fields"].append({"name": "⬇️ Download", "value": f"[Download]({g('download_url')})", "inline": True})
    if video:
        embed["fields"].append({"name": "🎬 Video", "value": f"[Tonton video]({video})", "inline": True})
    embed["fields"] = embed["fields"][:25]

    # Link video juga ditaruh di content supaya Discord menampilkan player (YouTube dll.)
    mention = form.get("mention", "")
    ping = mention if mention in ("@everyone", "@here") else ""
    payload = {"embeds": [embed], "allowed_mentions": {"parse": ["everyone"] if ping else []}}
    content = " ".join(p for p in [ping, video] if p)
    if content:
        payload["content"] = content
    if g("username") and form.get("mode") == "webhook":
        payload["username"] = g("username")[:80]

    total = (len(embed["title"]) + len(embed.get("description", "")) + len(embed["footer"]["text"])
             + len(embed.get("author", {}).get("name", ""))
             + sum(len(f["name"]) + len(f["value"]) for f in embed["fields"]))
    return payload, total


# ---------- routes ----------
@app.get("/")
def index():
    return send_from_directory(BASE, "index.html")


@app.get("/<name>")
def assets(name):
    if name in ("style.css", "script.js", "bg.jpg", "bg.mp4", "logo.png"):
        return send_from_directory(BASE, name)
    return "Not found", 404


@app.post("/api/send")
def send():
    form, file = request.form, request.files.get("video_file")
    errors = validate(form, file)
    if errors:
        return jsonify(ok=False, errors=errors), 400

    payload, total = build_payload(form)
    if total > 5800:
        return jsonify(ok=False, errors=["Total isi embed melebihi batas Discord (6000 karakter). Persingkat teks."]), 400

    mode = form.get("mode")
    if mode == "webhook":
        url, headers = form["webhook_url"].strip() + "?wait=true", {}
        target = "Webhook …" + form["webhook_url"].strip()[-6:]
    else:
        cid = form["channel_id"].strip()
        url, headers = f"{API}/channels/{cid}/messages", {"Authorization": f"Bot {form['bot_token'].strip()}"}
        target = f"Channel {cid}"

    try:
        if file and file.filename:
            mime = mimetypes.guess_type(file.filename)[0] or "application/octet-stream"
            r = requests.post(url, headers=headers, data={"payload_json": json.dumps(payload)},
                              files={"files[0]": (file.filename, file.stream, mime)}, timeout=120)
        else:
            r = requests.post(url, headers=headers, json=payload, timeout=30)
    except requests.RequestException as e:
        return jsonify(ok=False, errors=[f"Gagal terhubung ke Discord: {e}"]), 502

    if r.status_code == 429:
        wait = r.json().get("retry_after", "beberapa")
        return jsonify(ok=False, errors=[f"Kena rate limit Discord. Coba lagi dalam {wait} detik."]), 429
    if r.status_code >= 400:
        try:
            detail = r.json().get("message", r.text)
        except ValueError:
            detail = r.text[:200]
        hint = {401: " (token salah)", 403: " (bot tidak punya izin di channel ini)", 404: " (webhook/channel tidak ditemukan)"}.get(r.status_code, "")
        return jsonify(ok=False, errors=[f"Discord menolak: {detail}{hint}"]), 400

    data = r.json() if r.content else {}
    entry = {
        "id": uuid.uuid4().hex[:8],
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "target": target,
        "message_id": data.get("id"),
        "form": {k: form.get(k, "") for k in ("title", "version", "description", "changelog", "info", "video_url", "download_url", "author", "author_icon", "thumbnail", "image", "footer", "color", "timestamp", "group", "mention", "username")},
        "video_file": file.filename if file and file.filename else "",
    }
    with lock:
        items = load_history()
        items.insert(0, entry)
        save_history(items[:200])
    return jsonify(ok=True, entry=entry)


@app.post("/api/preview")
def preview():
    payload, total = build_payload(request.form)
    return jsonify(payload=payload, total=total)


@app.get("/api/history")
def history():
    return jsonify(load_history())


@app.delete("/api/history")
def clear_history():
    with lock:
        save_history([])
    return jsonify(ok=True)


@app.delete("/api/history/<hid>")
def delete_history(hid):
    with lock:
        save_history([i for i in load_history() if i["id"] != hid])
    return jsonify(ok=True)


@app.errorhandler(413)
def too_large(_):
    return jsonify(ok=False, errors=[f"File terlalu besar (maks {MAX_UPLOAD_MB} MB). Gunakan link YouTube/Drive."]), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=False)
