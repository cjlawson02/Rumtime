#!/usr/bin/env python3
"""Live load-cell plotter for the Rumtime bench-rig.

Reads `raw` over USB CDC and serves a browser chart.

Usage:
  python3 scripts/scaleplot.py
  python3 scripts/scaleplot.py --port /dev/cu.usbmodem2101
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
import time
import webbrowser
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    import serial
except ImportError:
    print("Install pyserial: pip install pyserial", file=sys.stderr)
    sys.exit(1)

sys.path.insert(0, str(Path(__file__).resolve().parent))
from benchctl import BAUD, find_default_port  # noqa: E402

HOST = "127.0.0.1"
PORT = 8765
HISTORY = 400
POLL_S = 0.08

_lock = threading.Lock()
_ser_lock = threading.Lock()
_samples: deque[dict] = deque(maxlen=HISTORY)
_last_error = ""
_running = True
_ser: serial.Serial | None = None

PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Rumtime scale plotter</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 16px;
           background: #111; color: #eee; }
    h1 { font-size: 18px; font-weight: 600; margin: 0; }
    .bar { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    button { background: #2a4a6a; color: #eee; border: 1px solid #4a7aaa;
             border-radius: 6px; padding: 6px 14px; font: inherit; cursor: pointer; }
    button:hover { background: #35608a; }
    button:disabled { opacity: 0.5; cursor: wait; }
    .readout { font-variant-numeric: tabular-nums; margin-bottom: 12px; color: #9cf; }
    canvas { width: 100%; height: 240px; background: #1a1a1a; border: 1px solid #333;
             border-radius: 8px; display: block; margin-bottom: 16px; }
    .err { color: #f88; min-height: 1.2em; }
  </style>
</head>
<body>
  <div class="bar">
    <h1>Rumtime scale plotter</h1>
    <button id="tare" type="button">Tare</button>
  </div>
  <div class="readout" id="readout">connecting…</div>
  <div class="err" id="err"></div>
  <canvas id="raw" width="1000" height="240"></canvas>
  <canvas id="grams" width="1000" height="240"></canvas>
  <script>
    const rawCv = document.getElementById("raw");
    const gCv = document.getElementById("grams");
    const readout = document.getElementById("readout");
    const errEl = document.getElementById("err");

    function draw(canvas, values, color, label) {
      const ctx = canvas.getContext("2d");
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#888";
      ctx.font = "12px sans-serif";
      ctx.fillText(label, 8, 16);
      if (!values.length) return;
      let min = Math.min(...values), max = Math.max(...values);
      if (min === max) { min -= 1; max += 1; }
      const pad = (max - min) * 0.08;
      min -= pad; max += pad;
      ctx.strokeStyle = "#333";
      ctx.beginPath();
      ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      values.forEach((v, i) => {
        const x = values.length === 1 ? 0 : i * (w - 1) / (values.length - 1);
        const y = h - 1 - (v - min) / (max - min) * (h - 2);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = "#aaa";
      ctx.fillText(max.toFixed(2), 8, 32);
      ctx.fillText(min.toFixed(2), 8, h - 8);
    }

    async function tick() {
      try {
        const r = await fetch("/api");
        const d = await r.json();
        errEl.textContent = d.error || "";
        const last = d.samples[d.samples.length - 1];
        if (last) {
          readout.textContent = `raw=${last.raw}   weight_g=${last.grams.toFixed(3)}   n=${d.samples.length}`;
        }
        draw(rawCv, d.samples.map(s => s.raw), "#6cf", "raw");
        draw(gCv, d.samples.map(s => s.grams), "#8f8", "weight_g");
      } catch (e) {
        errEl.textContent = String(e);
      }
    }

    const tareBtn = document.getElementById("tare");
    tareBtn.addEventListener("click", async () => {
      tareBtn.disabled = true;
      try {
        const r = await fetch("/tare", { method: "POST" });
        const d = await r.json();
        if (!d.ok) errEl.textContent = d.error || "tare failed";
      } catch (e) {
        errEl.textContent = String(e);
      }
      tareBtn.disabled = false;
    });
    setInterval(tick, 100);
    tick();
  </script>
</body>
</html>
"""


def parse_raw_line(text: str) -> tuple[int, float] | None:
    if not text.startswith("raw="):
        return None
    parts = text.split()
    raw_s = parts[0].split("=", 1)[1]
    grams_s = "0"
    for part in parts[1:]:
        if part.startswith("weight_g="):
            grams_s = part.split("=", 1)[1]
    try:
        return int(raw_s), float(grams_s)
    except ValueError:
        return None


def send_cmd(ser: serial.Serial, command: bytes, done: str, timeout_s: float) -> str | None:
    ser.reset_input_buffer()
    ser.write(command)
    ser.flush()
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        raw = ser.readline()
        if not raw:
            continue
        text = raw.decode("ascii", errors="replace").strip()
        if done and text == done:
            return text
        if text.startswith("err="):
            return text
        if not done and parse_raw_line(text) is not None:
            return text
    return None


def reader_loop(ser: serial.Serial) -> None:
    global _last_error
    t0 = time.monotonic()
    while _running:
        try:
            with _ser_lock:
                line = send_cmd(ser, b"raw\n", "", 0.4)
            got = parse_raw_line(line) if line else None
            if got is None:
                if line and line.startswith("err="):
                    _last_error = line
                time.sleep(POLL_S)
                continue
            raw_v, grams = got
            with _lock:
                _samples.append({
                    "t": round(time.monotonic() - t0, 3),
                    "raw": raw_v,
                    "grams": grams,
                })
                _last_error = ""
        except (serial.SerialException, OSError) as exc:
            _last_error = str(exc)
            time.sleep(0.5)
        time.sleep(POLL_S)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        return

    def do_GET(self) -> None:
        if self.path == "/" or self.path.startswith("/index"):
            body = PAGE.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/api":
            with _lock:
                payload = {"samples": list(_samples), "error": _last_error}
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404)

    def do_POST(self) -> None:
        if self.path != "/tare":
            self.send_error(404)
            return
        global _last_error
        ok = False
        err = "serial not open"
        if _ser is not None:
            try:
                with _ser_lock:
                    line = send_cmd(_ser, b"tare\n", "tared", 5.0)
                ok = line == "tared"
                err = "" if ok else (line or "tare timeout")
                if ok:
                    with _lock:
                        _last_error = ""
            except (serial.SerialException, OSError) as exc:
                err = str(exc)
        if not ok:
            _last_error = err
        body = json.dumps({"ok": ok, "error": err}).encode("utf-8")
        self.send_response(200 if ok else 500)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> int:
    global _running, _ser
    parser = argparse.ArgumentParser(description="Live HX711 plotter")
    parser.add_argument("--port", "-p", help="Serial port (default: auto usbmodem)")
    parser.add_argument("--bind", default=HOST)
    parser.add_argument("--http-port", type=int, default=PORT)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    port = args.port or find_default_port()
    if not port:
        print("No USB serial port found. Pass --port /dev/cu.usbmodem...", file=sys.stderr)
        return 1

    print(f"Opening {port}...", flush=True)
    _ser = serial.Serial(port, BAUD, timeout=0.05, write_timeout=2.0)
    time.sleep(0.4)
    _ser.reset_input_buffer()

    thread = threading.Thread(target=reader_loop, args=(_ser,), daemon=True)
    thread.start()

    httpd = ThreadingHTTPServer((args.bind, args.http_port), Handler)
    url = f"http://{args.bind}:{args.http_port}/"
    print(f"Scale plotter on {url}  serial={port}", flush=True)
    print("Press the load pad. Ctrl+C to stop.", flush=True)
    if not args.no_browser:
        webbrowser.open(url)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print()
    _running = False
    httpd.shutdown()
    _ser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
