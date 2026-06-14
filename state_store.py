"""
Tiny persistent state store for the predictor bot, backed by a dedicated branch
in the same GitHub repo (so it survives the ~5.5h GitHub Actions restarts).

It saves a small JSON file ({"active": bool, "chat_id": "..."}) on a branch that
no workflow watches, using the automatic GITHUB_TOKEN (needs `contents: write`).
This lets /start and /stop — and the captured chat id — persist across runs, so
the bot keeps running fully automatically and only the user's Telegram commands
change its on/off state.

When GITHUB_TOKEN / GITHUB_REPOSITORY are not present (e.g. running locally),
everything degrades gracefully: load() returns None and save() is a no-op, so
the bot just falls back to PREDICT_AUTOSTART + in-memory state.
"""

import os
import json
import base64
import logging

import requests

log = logging.getLogger("btc-predict-bot")

API = "https://api.github.com"
TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
REPO = os.environ.get("GITHUB_REPOSITORY", "").strip()  # "owner/repo"
BRANCH = os.environ.get("PREDICT_STATE_BRANCH", "predict-bot-state").strip()
PATH = os.environ.get("PREDICT_STATE_PATH", "predict_state.json").strip()

TIMEOUT = 15


def enabled() -> bool:
    return bool(TOKEN and REPO)


def _headers():
    return {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "btc-predict-bot/1.0",
    }


def _ensure_branch() -> bool:
    """Create the state branch (off the default branch) if it doesn't exist."""
    try:
        r = requests.get(
            f"{API}/repos/{REPO}/git/ref/heads/{BRANCH}",
            headers=_headers(),
            timeout=TIMEOUT,
        )
        if r.status_code == 200:
            return True
        repo = requests.get(
            f"{API}/repos/{REPO}", headers=_headers(), timeout=TIMEOUT
        ).json()
        base = repo.get("default_branch", "main")
        br = requests.get(
            f"{API}/repos/{REPO}/git/ref/heads/{base}",
            headers=_headers(),
            timeout=TIMEOUT,
        )
        if br.status_code != 200:
            return False
        sha = br.json()["object"]["sha"]
        cr = requests.post(
            f"{API}/repos/{REPO}/git/refs",
            headers=_headers(),
            timeout=TIMEOUT,
            json={"ref": f"refs/heads/{BRANCH}", "sha": sha},
        )
        return cr.status_code in (200, 201)
    except requests.RequestException as exc:
        log.warning("state: ensure_branch failed: %s", exc)
        return False


def load():
    """Return {"active": bool, "chat_id": str, "_sha": str} or None."""
    if not enabled():
        return None
    try:
        r = requests.get(
            f"{API}/repos/{REPO}/contents/{PATH}",
            headers=_headers(),
            params={"ref": BRANCH},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        content = base64.b64decode(data["content"]).decode("utf-8")
        state = json.loads(content)
        state["_sha"] = data.get("sha")
        return state
    except (requests.RequestException, ValueError, KeyError) as exc:
        log.warning("state: load failed: %s", exc)
        return None


def save(active: bool, chat_id: str) -> bool:
    """Persist the active flag + chat id. Returns True on success."""
    if not enabled():
        return False
    if not _ensure_branch():
        return False
    try:
        existing = load()
        payload = {"active": bool(active), "chat_id": chat_id or ""}
        body = {
            "message": "chore: update predictor on/off state",
            "content": base64.b64encode(
                json.dumps(payload).encode("utf-8")
            ).decode("ascii"),
            "branch": BRANCH,
        }
        if existing and existing.get("_sha"):
            body["sha"] = existing["_sha"]
        r = requests.put(
            f"{API}/repos/{REPO}/contents/{PATH}",
            headers=_headers(),
            json=body,
            timeout=TIMEOUT,
        )
        ok = r.status_code in (200, 201)
        if not ok:
            log.warning("state: save failed (%s): %s", r.status_code, r.text[:200])
        return ok
    except requests.RequestException as exc:
        log.warning("state: save failed: %s", exc)
        return False
