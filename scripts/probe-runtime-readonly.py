"""Synthetic pipe peer using real producer dispatch/identity/store fixture.
Never deployed, never executes a command, never uses a real user's home.
Run only through probe-runtime-readonly.mjs with an explicitly selected checkout.
"""
import contextlib
import importlib.util
import io
import json
import os
import pathlib
import sys
import tempfile

root = pathlib.Path(sys.argv[1]).resolve()
sys.path.insert(0, str(root))
protocol = sys.stdout
with tempfile.TemporaryDirectory(prefix="dots-be00-synthetic-") as temporary:
    os.environ["HERMES_HOME"] = temporary
    with contextlib.redirect_stdout(io.StringIO()):
        import pytest
        spec = importlib.util.spec_from_file_location("producer_fixture", root / "tests/tui_gateway/test_runtime_rpc.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        patch = pytest.MonkeyPatch()
        fixture = module.runtime.__wrapped__(pathlib.Path(temporary), patch)
        runtime = next(fixture)
    try:
        for line in sys.stdin:
            request = json.loads(line)
            if request.get("method") not in {"runtime.capabilities", "runtime.snapshot", "runtime.events.since"}:
                raise ValueError("Synthetic peer is read-only")
            with contextlib.redirect_stdout(io.StringIO()):
                response = runtime.server.dispatch(request, transport=runtime.peers["a"])
            protocol.write(json.dumps(response) + "\n")
            protocol.flush()
            assert runtime.dispatched == []
    finally:
        with contextlib.redirect_stdout(io.StringIO()):
            try:
                next(fixture)
            except StopIteration:
                pass
            patch.undo()
