#!/usr/bin/env python3
"""Reliable host CLI for Rumtime controller firmware (ESP32-S3 USB serial).

Usage:
  ./scripts/controllerctl.py                    # interactive shell
  ./scripts/controllerctl.py status             # one-shot command
  ./scripts/controllerctl.py dispense open 1 30   # timed pour
  ./scripts/controllerctl.py pour bourbon 30 simple 15

Requires: pip install -r requirements.txt  (pyserial)

Serial protocol: Marlin-style lines documented in firmware/controller/README.md.
Job commands (dispense, pour, prime, cancel) wait for // job:* async lines by default.
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
    print("Install pyserial: pip install -r requirements.txt", file=sys.stderr)
    sys.exit(1)

BAUD = 115200
PROMPT_HINT = "rumtime> "
JOB_TIMEOUT_S = 120.0
CONFIG_TAIL_S = 0.4

HELP_TEXT = """\
Rumtime controller serial commands (see firmware/controller/README.md):

  status                         snapshot (scale, job, config flags)
  config                         per-pump calibration + bindings

  dispense <pump> <ml>           flow-gated pour (scale required)
  dispense open <pump> <ml>      timed pour (no scale)
  pour <ingredient> <ml> [...]   multi-step recipe pour
  prime <pump>                   continuous prime (prime stop to finish)
  prime stop                     operator stop during prime
  cancel | stop                  abort current job

  cal <pump> <ml_per_s> [anti_drip_ms]
  bind <pump> <ingredient>
  unbind <pump>

  wifi status | ssid <s> | pass <p> | save | clear

Async lines: // job:ok | // job:error | // job:cancelled | // config:error persist failed
Local: help, quit
"""


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
    text = text.encode("ascii", errors="ignore").decode("ascii")
    text = re.sub(r"\s+", " ", text)
    return text


def waits_for_job_async(command: str) -> bool:
    cmd = normalize_command(command).lower()
    if not cmd:
        return False
    if cmd in {"cancel", "stop", "prime stop"}:
        return True
    if cmd.startswith("dispense ") or cmd.startswith("pour "):
        return True
    if cmd.startswith("prime "):
        return True
    return False


def is_config_dump(command: str) -> bool:
    return normalize_command(command).lower() == "config"


class ControllerClient:
    def __init__(self, port: str, baud: int = BAUD) -> None:
        self.port = port
        self.ser = serial.Serial()
        self.ser.port = port
        self.ser.baudrate = baud
        self.ser.timeout = 0.05
        self.ser.write_timeout = 2.0
        # ESP32-S3 USB-JTAG: avoid DTR/RTS toggling into bootloader on open.
        self.ser.rts = False
        self.ser.dtr = False
        self.ser.open()
        time.sleep(0.3)
        self.ser.reset_input_buffer()

    def close(self) -> None:
        if self.ser.is_open:
            self.ser.close()

    def _read_line(self) -> str | None:
        raw = self.ser.readline()
        if not raw:
            return None
        text = raw.decode("ascii", errors="replace").rstrip("\r\n")
        return text if text else None

    def send(
        self,
        command: str,
        *,
        wait_job: bool = True,
        job_timeout: float = JOB_TIMEOUT_S,
        idle_timeout: float = 2.0,
    ) -> list[str]:
        command = normalize_command(command)
        if not command:
            return []

        self.ser.write((command + "\n").encode("ascii"))
        self.ser.flush()

        lines: list[str] = []
        deadline = time.monotonic() + idle_timeout
        saw_activity = False
        job_wait = wait_job and waits_for_job_async(command)
        config_dump = is_config_dump(command)
        job_enqueued = False

        while time.monotonic() < deadline:
            text = self._read_line()
            if text is None:
                if saw_activity and not job_wait:
                    break
                continue

            saw_activity = True
            print(text)
            lines.append(text)

            if text.startswith("Error:") or text == "busy":
                break

            if config_dump and text.startswith("config pump="):
                deadline = time.monotonic() + CONFIG_TAIL_S
                continue

            if text == "ok":
                if job_wait:
                    job_enqueued = True
                    deadline = time.monotonic() + job_timeout
                else:
                    break
                continue

            if text.startswith("// job:"):
                break

            if text.startswith("status ") or text.startswith("wifi "):
                break

            if text.startswith("// config:"):
                if not job_wait:
                    break
                continue

        return lines


def run_interactive(client: ControllerClient, *, wait_job: bool) -> None:
    print(f"Connected to {client.port}. Type help or quit.")
    while True:
        try:
            text = input(PROMPT_HINT)
        except (EOFError, KeyboardInterrupt):
            print()
            break
        text = normalize_command(text)
        if not text:
            continue
        if text.lower() in {"quit", "exit", "q"}:
            break
        if text.lower() == "help":
            print(HELP_TEXT, end="")
            continue
        client.send(text, wait_job=wait_job)


def main() -> int:
    parser = argparse.ArgumentParser(description="Rumtime controller serial control")
    parser.add_argument("--port", "-p", help="Serial port (default: auto usbmodem)")
    parser.add_argument("--baud", type=int, default=BAUD)
    parser.add_argument(
        "--no-wait-job",
        action="store_true",
        help="Return after immediate ok/busy/Error (do not wait for // job:*)",
    )
    parser.add_argument(
        "--repeat",
        "-n",
        type=int,
        default=1,
        help="Run command N times on one serial connection",
    )
    parser.add_argument(
        "--pause",
        type=float,
        default=0.5,
        help="Seconds between repeated commands",
    )
    parser.add_argument(
        "--job-timeout",
        type=float,
        default=JOB_TIMEOUT_S,
        help="Seconds to wait for // job:* after pour/prime/cancel",
    )
    parser.add_argument("command", nargs="*", help="Command to send (default: interactive)")
    args = parser.parse_args()

    if args.repeat < 1:
        print("--repeat must be >= 1", file=sys.stderr)
        return 1

    port = args.port or find_default_port()
    if not port:
        print("No USB serial port found. Pass --port /dev/cu.usbmodem...", file=sys.stderr)
        return 1

    wait_job = not args.no_wait_job
    client = ControllerClient(port, args.baud)
    try:
        if args.command:
            cmd = " ".join(args.command)
            for i in range(args.repeat):
                if args.repeat > 1:
                    print(f"=== run {i + 1}/{args.repeat}: {cmd} ===")
                client.send(cmd, wait_job=wait_job, job_timeout=args.job_timeout)
                if i + 1 < args.repeat and args.pause > 0:
                    time.sleep(args.pause)
        else:
            if args.repeat > 1:
                print("--repeat ignored in interactive mode", file=sys.stderr)
            run_interactive(client, wait_job=wait_job)
    finally:
        client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
