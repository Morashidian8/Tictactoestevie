"""
Persistent per-timeframe alternation-threshold store for the candle bot.

Backed by a dedicated branch in the same GitHub repo (like state_store.py) so a
threshold the user picks from Telegram survives the ~5.5h GitHub Actions
restarts. The stored file is a small JSON map of Binance-style interval ->
alternation (تناوب / flip) threshold, e.g. {"5m": 4, "15m": 3}.

When GITHUB_TOKEN / GITHUB_REPOSITORY are absent (e.g. running locally) it
degrades gracefully: get() returns None and set() is a no-op, so the bot falls
back to the env-provided default threshold and in-memory state.
"""

import os
import json
import base64
import logging

import requests

log = logging.getLogger("btc-bot")

API = "https://api.github.com"
TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
REPO = os.environ.get("GITHUB_REPOSITORY", "").strip()  # "owner/repo"
BRANCH = os.environ.get("CANDLE_STATE_BRANCH", "candle-bot-state").strip()
PATH = os.environ.get("CANDLE_THRESHOLD_PATH", "candle_thresholds.json").strip()

TIMEOUT = 15


def enabled() -> bool:
    return bool(TOKEN and REPO)


def _headers():
    return {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "btc-candle-bot/1.0",
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
        log.warning("threshold-store: ensure_branch failed: %s", exc)
        return False


def _load_raw():
    """Return ({interval: threshold}, sha) or ({}, None)."""
    if not enabled():
        return {}, None
    try:
        r = requests.get(
            f"{API}/repos/{REPO}/contents/{PATH}",
            headers=_headers(),
            params={"ref": BRANCH},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return {}, None
        data = r.json()
        content = base64.b64decode(data["content"]).decode("utf-8")
        parsed = json.loads(content)
        if not isinstance(parsed, dict):
            return {}, data.get("sha")
        clean = {}
        for k, v in parsed.items():
            try:
                clean[str(k)] = int(v)
            except (TypeError, ValueError):
                continue
        return clean, data.get("sha")
    except (requests.RequestException, ValueError, KeyError) as exc:
        log.warning("threshold-store: load failed: %s", exc)
        return {}, None


def load() -> dict:
    """All configured thresholds as {interval: threshold} (may be empty)."""
    return _load_raw()[0]


def get(interval: str):
    """Stored threshold for this interval, or None if unset/unavailable."""
    return load().get(str(interval))


def set(interval: str, threshold: int) -> bool:
    """Persist one interval's threshold; returns True on success."""
    if not enabled():
        return False
    if not _ensure_branch():
        return False
    try:
        current, sha = _load_raw()
        current[str(interval)] = int(threshold)
        body = {
            "message": f"chore: set {interval} alternation threshold = {threshold}",
            "content": base64.b64encode(
                json.dumps(current).encode("utf-8")
            ).decode("ascii"),
            "branch": BRANCH,
        }
        if sha:
            body["sha"] = sha
        r = requests.put(
            f"{API}/repos/{REPO}/contents/{PATH}",
            headers=_headers(),
            json=body,
            timeout=TIMEOUT,
        )
        ok = r.status_code in (200, 201)
        if not ok:
            log.warning(
                "threshold-store: save failed (%s): %s", r.status_code, r.text[:200]
            )
        return ok
    except requests.RequestException as exc:
        log.warning("threshold-store: save failed: %s", exc)
        return False
