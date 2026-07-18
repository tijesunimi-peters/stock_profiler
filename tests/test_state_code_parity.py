"""Guard: the frontend STATE_CODE_TO_NAME map (app.js) must cover exactly the same codes as
the backend US_STATE_CODES (normalize/geography.py).

They are necessarily two sources of truth -- JS can't import the Python set -- but they MUST
agree: the holder-geography endpoint buckets a filer as "state" iff its code is in
US_STATE_CODES, and the choropleth then looks that code up in STATE_CODE_TO_NAME to place it on
the map. A code in one list but not the other means a filer the backend counts as a state
holder gets silently dropped from the map AND its chips (breaching "never dropped", AC-2b).
This test fails loudly if the two ever diverge.
"""

from __future__ import annotations

import re
from pathlib import Path

from secfin.normalize.geography import US_STATE_CODES

_APP_JS = Path(__file__).resolve().parents[1] / "src" / "secfin" / "api" / "static" / "app.js"


def _js_state_codes() -> set[str]:
    text = _APP_JS.read_text()
    m = re.search(r"var STATE_CODE_TO_NAME = \{(.*?)\};", text, re.DOTALL)
    assert m, "STATE_CODE_TO_NAME object not found in app.js"
    # Keys are bare 2-letter codes before a colon, e.g. `AL: "Alabama"`.
    return set(re.findall(r"\b([A-Z]{2}):\s*\"", m.group(1)))


def test_frontend_state_map_matches_backend_state_codes():
    js_codes = _js_state_codes()
    assert js_codes == set(US_STATE_CODES), (
        "STATE_CODE_TO_NAME (app.js) and US_STATE_CODES (geography.py) disagree: "
        f"only in JS={js_codes - set(US_STATE_CODES)}, "
        f"only in Python={set(US_STATE_CODES) - js_codes}"
    )
