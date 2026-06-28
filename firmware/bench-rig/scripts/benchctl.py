#!/usr/bin/env python3
"""Reliable host CLI for the Rumtime bench-rig (ESP32-S3 USB serial).

Usage:
  ./scripts/benchctl.py                    # interactive shell
  ./scripts/benchctl.py status             # one-shot command
  ./scripts/benchctl.py dispense 2 50 --repeat 3   # one USB session, 3 pours

Requires: pip install pyserial
"""

from __future__ import annotations

import argparse
import glob
import re
import sys
import time

try:
    import serial
    from serial.tools import list_ports
except ImportError:
    print("Install pyserial: pip install pyserial", file=sys.stderr)
    sys.exit(1)

BAUD = 115200
DONE_MARKERS = frozenset({"done", "stopped", "tared", "flow config updated",
                          "calibration saved", "anti-drip updated",
                          "scale calibration updated, tared", "stream stopped"})
ERR_PREFIX = "err="
PROMPT_HINT = "bench> "


def find_default_port() -> str | None:
    for pattern in ("/dev/cu.usbmodem*", "/dev/tty.usbmodem*"):
        matches = sorted(glob.glob(pattern))
        if matches:
            return matches[-1]
    for port in list_ports.comports():
        if "usbmodem" in (port.device or "").lower():
            return port.device
    return None


def normalize_command(text: str) -> str:
    text = text.strip()
    if not text:
        return ""
    # ASCII only — avoids smart quotes / unicode from copy-paste.
    text = text.encode("ascii", errors="ignore").decode("ascii")
    text = re.sub(r"\s+", " ", text)
    return text


class BenchRigClient:
    def __init__(self, port: str, baud: int = BAUD) -> None:
        self.port = port
        self.ser = serial.Serial(port, baud, timeout=0.05, write_timeout=2.0)
        time.sleep(0.3)
        self.ser.reset_input_buffer()

    def close(self) -> None:
        if self.ser.is_open:
            self.ser.close()

    def send(self, command: str, idle_timeout: float = 120.0) -> list[str]:
        command = normalize_command(command)
        if not command:
            return []

        line = command + "\n"
        self.ser.write(line.encode("ascii"))
        self.ser.flush()

        lines: list[str] = []
        deadline = time.monotonic() + idle_timeout
        saw_activity = False

        while time.monotonic() < deadline:
            raw = self.ser.readline()
            if not raw:
                if saw_activity:
                    # End of response burst.
                    break
                continue

            saw_activity = True
            text = raw.decode("ascii", errors="replace").rstrip("\r\n")
            if text:
                print(text)
                lines.append(text)

            if text.startswith(ERR_PREFIX):
                break
            if text in DONE_MARKERS:
                break
            if text.startswith("ok="):
                break
            if text.startswith("--- status ---"):
                # status prints multiple lines; keep reading briefly
                deadline = min(deadline, time.monotonic() + 2.0)
            if text.startswith("Rumtime bench-rig commands:"):
                break

        return lines

    def wait_ready(self) -> None:
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            raw = self.ser.readline()
            if not raw:
                continue
            text = raw.decode("ascii", errors="replace").rstrip("\r\n")
            if text:
                print(text)
            if "bench-rig ready" in text:
                return


def run_interactive(client: BenchRigClient) -> None:
    print(f"Connected to {client.port}. Type help, or quit.")
    while True:
        try:
            text = input(PROMPT_HINT)
        except (EOFError, KeyboardInterrupt):
            print()
            break
        text = normalize_command(text)
        if not text:
            continue
        if text in {"quit", "exit", "q"}:
            break
        client.send(text)


def main() -> int:
    parser = argparse.ArgumentParser(description="Rumtime bench-rig serial control")
    parser.add_argument("--port", "-p", help="Serial port (default: auto usbmodem)")
    parser.add_argument("--baud", type=int, default=BAUD)
    parser.add_argument("--repeat", "-n", type=int, default=1,
                        help="Run command N times on one serial connection")
    parser.add_argument("--pause", type=float, default=0.5,
                        help="Seconds between repeated commands")
    parser.add_argument("command", nargs="*", help="Command to send (default: interactive)")
    args = parser.parse_args()

    if args.repeat < 1:
        print("--repeat must be >= 1", file=sys.stderr)
        return 1

    port = args.port or find_default_port()
    if not port:
        print("No USB serial port found. Pass --port /dev/cu.usbmodem...", file=sys.stderr)
        return 1

    client = BenchRigClient(port, args.baud)
    try:
        if args.command:
            cmd = " ".join(args.command)
            for i in range(args.repeat):
                if args.repeat > 1:
                    print(f"=== run {i + 1}/{args.repeat}: {cmd} ===")
                client.send(cmd)
                if i + 1 < args.repeat and args.pause > 0:
                    time.sleep(args.pause)
        else:
            if args.repeat > 1:
                print("--repeat ignored in interactive mode", file=sys.stderr)
            run_interactive(client)
    finally:
        client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
