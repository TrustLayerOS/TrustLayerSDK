"""Headless human check. Python does not open a camera.

Reads a JPEG and a WAV the caller already has, then calls verify_human.
A native iOS or Android UI kit waits until the hosted API in row 2 exists.
Until then, post the same events through @trustlayer/sdk/mobile.
"""

from __future__ import annotations

import argparse
import base64
import wave
from pathlib import Path

from trustlayer import TrustLayer


def pcm_from_wav(path: Path) -> tuple[list[float], int]:
    with wave.open(str(path), "rb") as wf:
        rate = wf.getframerate()
        width = wf.getsampwidth()
        raw = wf.readframes(wf.getnframes())
    if width != 2:
        raise SystemExit("WAV must be 16-bit PCM")
    samples = []
    for i in range(0, len(raw), 2):
        value = int.from_bytes(raw[i : i + 2], "little", signed=True)
        samples.append(value / 32768.0)
    return samples, rate


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jpeg", required=True)
    parser.add_argument("--wav", required=True)
    parser.add_argument("--api-key", default="tl_public_demodemo12DEADBEEF00000001")
    parser.add_argument("--api-url", default="http://127.0.0.1:8080")
    args = parser.parse_args()
    image = base64.b64encode(Path(args.jpeg).read_bytes()).decode("ascii")
    pcm, rate = pcm_from_wav(Path(args.wav))
    client = TrustLayer(api_key=args.api_key, api_url=args.api_url)
    result = client.verify_human(consent=True, image_b64=image, audio_pcm=pcm, sample_rate=rate)
    print(result.recommendation, result.human_probability)


if __name__ == "__main__":
    main()
