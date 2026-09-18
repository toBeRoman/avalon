#!/usr/bin/env python3
"""Pre-render the narration clips with OpenAI text to speech.

    python3 tools/tts.py [script.json] [outdir]

Defaults to tools/narration.json -> public/art/narration.

The key is read from an env file outside this repository and is never printed,
logged or written anywhere. Point OPENAI_ENV_FILE at a different file to
override. Clips are cached by a hash of model, voice, instructions and text, so
rerunning only regenerates lines that actually changed.

This runs on a laptop, not in production. The deployed app serves the resulting
mp3 files as ordinary static assets, so there is no API key anywhere near it and
narration still works with no signal at all.
"""
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_ENV = pathlib.Path.home() / "Desktop" / "RavenSanz" / "env.local"
ENDPOINT = "https://api.openai.com/v1/audio/speech"


def api_key() -> str:
    env_path = pathlib.Path(os.environ.get("OPENAI_ENV_FILE", DEFAULT_ENV))
    if not env_path.exists():
        raise SystemExit(
            f"No env file at {env_path}. Set OPENAI_ENV_FILE to one holding OPENAI_API_KEY."
        )
    for line in env_path.read_text().splitlines():
        if line.startswith("OPENAI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(f"OPENAI_API_KEY not found in {env_path}")


def compress(path: pathlib.Path) -> None:
    """Speech does not need stereo or 128kbps. Mono at 48k is a third of the size."""
    tmp = path.with_suffix(".tmp.mp3")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(path),
         "-ac", "1", "-ar", "24000", "-b:a", "48k", str(tmp)],
        check=True,
    )
    tmp.replace(path)


def duration(path: pathlib.Path) -> float:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)]
    )
    return float(out.strip())


def main() -> None:
    script_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "tools/narration.json"
    outdir = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "public/art/narration"
    outdir.mkdir(parents=True, exist_ok=True)

    script = json.loads(script_path.read_text())
    model = script.get("model", "gpt-4o-mini-tts")
    voice = script.get("voice", "marin")
    instructions = script.get("instructions", "")
    key = api_key()

    manifest = {}
    for chapter in script["chapters"]:
        text = chapter["text"].strip()
        stamp = hashlib.sha256(
            f"{model}|{voice}|{instructions}|{text}".encode()
        ).hexdigest()[:16]

        mp3 = outdir / f"{chapter['id']}.mp3"
        meta = outdir / f"{chapter['id']}.json"

        if mp3.exists() and meta.exists() and json.loads(meta.read_text()).get("hash") == stamp:
            seconds = json.loads(meta.read_text())["duration"]
            print(f"cached   {chapter['id']:<20} {seconds:5.1f}s")
            manifest[chapter["id"]] = round(seconds, 2)
            continue

        body = json.dumps(
            {
                "model": model,
                "voice": voice,
                "input": text,
                "instructions": instructions,
                "response_format": "mp3",
            }
        ).encode()
        request = urllib.request.Request(
            ENDPOINT,
            data=body,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        )

        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=120) as response:
                    mp3.write_bytes(response.read())
                break
            except urllib.error.HTTPError as error:
                detail = error.read().decode(errors="replace")[:300]
                if error.code in (429, 500, 502, 503) and attempt < 2:
                    time.sleep(3 * (attempt + 1))
                    continue
                raise SystemExit(f"TTS failed for {chapter['id']}: HTTP {error.code} {detail}")

        compress(mp3)
        seconds = duration(mp3)
        meta.write_text(
            json.dumps(
                {
                    "id": chapter["id"],
                    "hash": stamp,
                    "model": model,
                    "voice": voice,
                    "instructions": instructions,
                    "text": text,
                    "duration": seconds,
                },
                indent=2,
            )
        )
        print(f"rendered {chapter['id']:<20} {seconds:5.1f}s")
        manifest[chapter["id"]] = round(seconds, 2)

    (outdir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True))
    total = sum(manifest.values())
    print(f"\n{len(manifest)} clips, {total:.1f}s of narration, voice {voice}")


if __name__ == "__main__":
    main()
