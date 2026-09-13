# trustlayer

Python client for TrustLayer. Same one-shot as the JS SDK:

```python
from trustlayer import TrustLayer

with TrustLayer(api_key="tl_secret_xxx", api_url="http://127.0.0.1:8080") as tl:
    result = tl.verify_human(type="interview", consent=True, image_b64=jpeg_b64)
    print(result.recommendation, result.human_probability)
```

See the repository root README for install, webhooks (`timestamp + "." + body`), and the JS package.
