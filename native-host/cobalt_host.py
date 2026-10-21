#!/usr/bin/env python3
"""Native host (Firefox native messaging) that manages the local Cobalt instance.

Commands (JSON over stdin, native messaging protocol: 4 bytes LE + payload):
  {"cmd":"ping"}                 -> {ok, running, version}
  {"cmd":"status"}               -> {ok, running, version, services}
  {"cmd":"ensure-up","wait":45}  -> starts the container and waits for the API to answer
  {"cmd":"stop"}                 -> stops the container

It only manages the fixed CONTAINERS. It never runs anything arbitrary.

Since every message spawns a new process (sendNativeMessage), the idle
shutdown is handled by a detached supervisor (--watch, singleton via
pidfile): the extension sends a periodic heartbeat while Firefox is open;
if the container goes without a signal for IDLE_TIMEOUT, the supervisor stops it. So the
instance dies shortly after Firefox is closed (and also on crash/sleep).
"""
import json
import os
import struct
import subprocess
import sys
import time
import urllib.request

CONTAINERS = ["cobalt-yt-session", "cobalt-local"]  # start order
# Container that may not exist: install-host.sh only creates cobalt-local,
# and the YouTube session generator is optional.
OPTIONAL_CONTAINERS = {"cobalt-yt-session"}
API_BASE = "http://127.0.0.1:9000"
COOKIES_FILE = os.path.expanduser("~/cobalt-local/cookies.json")
IDLE_TIMEOUT = 6 * 60  # seconds without a heartbeat before stopping the container
CACHE = os.path.expanduser("~/.cache/cobalt-local")
SEEN_FILE = os.path.join(CACHE, "last_seen")
PID_FILE = os.path.join(CACHE, "supervisor.pid")


def docker(*args, timeout=30):
    try:
        p = subprocess.run(["docker", *args], capture_output=True, text=True, timeout=timeout)
        return p.returncode, (p.stdout or "").strip(), (p.stderr or "").strip()
    except FileNotFoundError:
        return 127, "", "'docker' binary not found in PATH"
    except subprocess.TimeoutExpired:
        return 124, "", "timeout talking to docker"


def touch():
    try:
        os.makedirs(CACHE, exist_ok=True)
        with open(SEEN_FILE, "w") as f:
            f.write(str(int(time.time())))
    except OSError:
        pass


def last_seen():
    try:
        return int(open(SEEN_FILE).read().strip())
    except (OSError, ValueError):
        return 0


def is_running(name="cobalt-local"):
    rc, out, _ = docker("inspect", "-f", "{{.State.Running}}", name)
    return rc == 0 and out == "true"


def any_running():
    return any(is_running(c) for c in CONTAINERS)


def cookies_info():
    """Reports whether ~/cobalt-local/cookies.json exists and which services have values."""
    try:
        data = json.load(open(COOKIES_FILE))
        services = sorted([k for k, v in data.items()
                           if isinstance(v, list) and any(str(x).strip() for x in v)])
        return {"present": True, "services": services}
    except (OSError, ValueError):
        return {"present": False, "services": []}


def api_info(timeout=5):
    try:
        req = urllib.request.Request(API_BASE + "/", headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            if "application/json" not in (r.headers.get("Content-Type") or ""):
                return None
            data = json.loads(r.read().decode("utf-8", "replace"))
            return data.get("cobalt") if isinstance(data, dict) else None
    except Exception:
        return None


def cmd_status():
    running = is_running()
    info = api_info() if running else None
    return {
        "ok": True,
        "running": running,
        "version": info.get("version") if info else None,
        "services": info.get("services") if info else None,
        "stack": {c: is_running(c) for c in CONTAINERS},
        "cookies": cookies_info(),
    }


def cmd_ensure_up(wait=45):
    for name in CONTAINERS:
        if not is_running(name):
            rc, _, err = docker("start", name)
            if rc != 0:
                # Optional container missing (e.g. cobalt-yt-session, which
                # install-host.sh does not create): carry on without it. For the main
                # container the absence is still an error.
                if "No such container" in (err or "") and name in OPTIONAL_CONTAINERS:
                    continue
                return {"ok": False, "error": "docker start %s failed: %s" % (name, err or rc)}
    deadline = time.time() + max(5, min(int(wait or 45), 120))
    info = None
    while time.time() < deadline:
        info = api_info(timeout=4)
        if info:
            break
        time.sleep(1.5)
    if not info:
        return {"ok": False,
                "error": "container started but the API did not answer. See `docker logs cobalt-local`."}
    return {"ok": True, "running": True, "version": info.get("version"),
            "services": info.get("services")}


def cmd_stop():
    if not any_running():
        return {"ok": True, "running": False, "already": True}
    for name in reversed(CONTAINERS):
        rc, _, err = docker("stop", "-t", "10", name, timeout=30)
        if rc != 0 and "No such container" not in err:
            return {"ok": False, "error": "docker stop %s failed: %s" % (name, err or rc)}
    return {"ok": True, "running": False}


def supervisor_alive():
    try:
        pid = int(open(PID_FILE).read().strip())
        with open("/proc/%d/cmdline" % pid, "rb") as f:
            return b"cobalt_host" in f.read()
    except (OSError, ValueError):
        return False


def ensure_supervisor():
    """Ensures the detached supervisor is running (singleton). The current process is ephemeral."""
    try:
        os.makedirs(CACHE, exist_ok=True)
        if supervisor_alive():
            return
        subprocess.Popen([sys.executable, os.path.abspath(__file__), "--watch"],
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, start_new_session=True)
    except OSError:
        pass


def watch_loop():
    try:
        os.makedirs(CACHE, exist_ok=True)
        with open(PID_FILE, "w") as f:
            f.write(str(os.getpid()))
        while True:
            time.sleep(45)
            try:
                if any_running() and (time.time() - last_seen() > IDLE_TIMEOUT):
                    for name in reversed(CONTAINERS):
                        docker("stop", "-t", "10", name, timeout=30)
            except Exception:
                pass
    except Exception:
        pass


def read_msg(stream):
    raw = stream.read(4)
    if len(raw) < 4:
        return None
    (ln,) = struct.unpack("<I", raw)
    if ln > 1024 * 1024:
        return None
    data = stream.read(ln)
    if len(data) < ln:
        return None
    try:
        return json.loads(data.decode("utf-8"))
    except ValueError:
        return None


def write_msg(stream, obj):
    data = json.dumps(obj).encode("utf-8")
    stream.write(struct.pack("<I", len(data)) + data)
    stream.flush()


def main():
    touch()
    ensure_supervisor()
    inp, out = sys.stdin.buffer, sys.stdout.buffer
    while True:
        msg = read_msg(inp)
        if msg is None:
            break
        touch()
        cmd = (msg.get("cmd") if isinstance(msg, dict) else None) or "ping"
        try:
            if cmd == "ensure-up":
                resp = cmd_ensure_up(msg.get("wait", 45))
            elif cmd == "stop":
                resp = cmd_stop()
            elif cmd in ("status", "ping"):
                resp = cmd_status()
            else:
                resp = {"ok": False, "error": "unknown command: %s" % cmd}
        except Exception as e:  # never break the protocol
            resp = {"ok": False, "error": str(e)[:300]}
        try:
            write_msg(out, resp)
        except (BrokenPipeError, OSError):
            break


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--watch":
        watch_loop()
    else:
        main()
