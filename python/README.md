# trustlayer

Official Python client for TrustLayer — the API you call before you trust the other side.

```python
from trustlayer import TrustLayer

with TrustLayer(api_key="tl_secret_xxx", api_url="http://127.0.0.1:8080") as tl:
    result = tl.verify_human(
        type="interview",
        consent=True,
        image_b64=jpeg_b64,
    )
    print(result.recommendation)      # allow | verify | review | block
    print(result.human_probability)
```

Python cannot open a webcam. Capture JPEG / PCM in your app, pass them in, and evaluate. The TypeScript SDK does capture in the browser.

## Install

```bash
pip install trustlayer
```

Requires Python 3.9+ · `httpx` · `pydantic` v2.

## Webhooks

TrustLayerOS signs `HMAC-SHA256(secret, timestamp + "." + raw_body)`.

```python
from trustlayer.webhooks import verify_webhook_signature

ok = verify_webhook_signature(
    request.data,
    request.headers["X-TrustLayer-Signature"],
    WEBHOOK_SECRET,
    request.headers["X-TrustLayer-Timestamp"],
)
```

## License

MIT. See the repository root README for the TypeScript SDK, React hook, and route middleware.
