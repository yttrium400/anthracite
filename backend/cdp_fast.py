"""Lightweight CDP command layer for fast, direct browser control.

Bypasses browser-use's full pipeline (screenshot → DOM → LLM → action) by sending
CDP protocol commands directly via WebSocket to Electron's debugging endpoint.
Used for simple actions like navigate, click, type, scroll.
"""

import asyncio
import json
import logging
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

CDP_PORT = 9222


async def get_ws_url(target_id: str) -> str:
    """Get the WebSocket debugger URL for a CDP target."""
    async with aiohttp.ClientSession() as session:
        async with session.get(f"http://127.0.0.1:{CDP_PORT}/json") as resp:
            targets = await resp.json()
            for target in targets:
                if target["id"] == target_id:
                    return target["webSocketDebuggerUrl"]
    raise ValueError(f"Target {target_id} not found in CDP targets")


class CDPConnection:
    """Manages a WebSocket connection to a CDP target."""

    def __init__(self, ws_url: str):
        self.ws_url = ws_url
        self._ws: aiohttp.ClientWebSocketResponse | None = None
        self._session: aiohttp.ClientSession | None = None
        self._msg_id = 0
        self._pending: dict[int, asyncio.Future] = {}
        self._reader_task: asyncio.Task | None = None

    async def connect(self):
        self._session = aiohttp.ClientSession()
        self._ws = await self._session.ws_connect(self.ws_url, max_msg_size=50 * 1024 * 1024)
        self._reader_task = asyncio.create_task(self._read_loop())

    async def close(self):
        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass
        if self._ws:
            await self._ws.close()
        if self._session:
            await self._session.close()

    async def _read_loop(self):
        assert self._ws is not None
        try:
            async for msg in self._ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    data = json.loads(msg.data)
                    msg_id = data.get("id")
                    if msg_id is not None and msg_id in self._pending:
                        self._pending[msg_id].set_result(data)
                elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                    break
        except asyncio.CancelledError:
            pass

    async def send(self, method: str, params: dict | None = None, timeout: float = 10.0) -> dict:
        """Send a CDP command and wait for the response."""
        assert self._ws is not None
        self._msg_id += 1
        msg_id = self._msg_id
        message = {"id": msg_id, "method": method}
        if params:
            message["params"] = params

        future: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending[msg_id] = future

        await self._ws.send_json(message)
        try:
            result = await asyncio.wait_for(future, timeout=timeout)
        finally:
            self._pending.pop(msg_id, None)

        if "error" in result:
            raise RuntimeError(f"CDP error: {result['error']}")
        return result.get("result", {})

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, *args):
        await self.close()


async def cdp_navigate(target_id: str, url: str) -> dict:
    """Navigate a tab to a URL. Returns frame info."""
    ws_url = await get_ws_url(target_id)
    async with CDPConnection(ws_url) as cdp:
        result = await cdp.send("Page.navigate", {"url": url})
        # Wait for load
        await cdp.send("Page.enable")
        try:
            # Wait up to 10s for load to complete
            await asyncio.wait_for(_wait_for_load(cdp), timeout=10.0)
        except asyncio.TimeoutError:
            pass  # Page may still be loading, that's OK
        return result


async def _wait_for_load(cdp: CDPConnection):
    """Wait for Page.loadEventFired by polling readyState."""
    for _ in range(20):
        result = await cdp.send("Runtime.evaluate", {
            "expression": "document.readyState"
        })
        state = result.get("result", {}).get("value", "")
        if state in ("complete", "interactive"):
            return
        await asyncio.sleep(0.5)


async def cdp_click(target_id: str, selector: str) -> dict:
    """Click an element by CSS selector."""
    ws_url = await get_ws_url(target_id)
    async with CDPConnection(ws_url) as cdp:
        # Get element position
        result = await cdp.send("Runtime.evaluate", {
            "expression": f"""
                (() => {{
                    const el = document.querySelector({json.dumps(selector)});
                    if (!el) return null;
                    const rect = el.getBoundingClientRect();
                    return {{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }};
                }})()
            """,
            "returnByValue": True,
        })
        pos = result.get("result", {}).get("value")
        if not pos:
            raise ValueError(f"Element not found: {selector}")

        x, y = pos["x"], pos["y"]

        # Dispatch mouse events
        for event_type in ("mousePressed", "mouseReleased"):
            await cdp.send("Input.dispatchMouseEvent", {
                "type": event_type,
                "x": x,
                "y": y,
                "button": "left",
                "clickCount": 1,
            })
        return {"clicked": selector, "x": x, "y": y}


async def cdp_type(target_id: str, selector: str, text: str) -> dict:
    """Type text into an element by CSS selector."""
    ws_url = await get_ws_url(target_id)
    async with CDPConnection(ws_url) as cdp:
        # Focus the element
        await cdp.send("Runtime.evaluate", {
            "expression": f"""
                (() => {{
                    const el = document.querySelector({json.dumps(selector)});
                    if (el) {{ el.focus(); el.value = ''; }}
                    return !!el;
                }})()
            """,
        })
        # Type each character to trigger key handlers
        for char in text:
            await cdp.send("Input.dispatchKeyEvent", {
                "type": "keyDown",
                "text": char,
                "key": char,
            })
            await cdp.send("Input.dispatchKeyEvent", {
                "type": "keyUp",
                "key": char,
            })
        return {"typed": text, "into": selector}


async def cdp_type_and_submit(target_id: str, selector: str, text: str) -> dict:
    """Type text into an element and press Enter."""
    ws_url = await get_ws_url(target_id)
    async with CDPConnection(ws_url) as cdp:
        # Focus and clear
        await cdp.send("Runtime.evaluate", {
            "expression": f"""
                (() => {{
                    const el = document.querySelector({json.dumps(selector)});
                    if (el) {{ el.focus(); el.value = ''; }}
                    return !!el;
                }})()
            """,
        })
        # Type text
        for char in text:
            await cdp.send("Input.dispatchKeyEvent", {
                "type": "keyDown",
                "text": char,
                "key": char,
            })
            await cdp.send("Input.dispatchKeyEvent", {
                "type": "keyUp",
                "key": char,
            })
        # Press Enter
        await cdp.send("Input.dispatchKeyEvent", {
            "type": "keyDown",
            "key": "Enter",
            "code": "Enter",
            "windowsVirtualKeyCode": 13,
        })
        await cdp.send("Input.dispatchKeyEvent", {
            "type": "keyUp",
            "key": "Enter",
            "code": "Enter",
            "windowsVirtualKeyCode": 13,
        })
        return {"typed": text, "into": selector, "submitted": True}


async def cdp_scroll(target_id: str, direction: str = "down", amount: int = 300) -> dict:
    """Scroll the page. Direction: 'up', 'down', 'left', 'right'."""
    ws_url = await get_ws_url(target_id)
    async with CDPConnection(ws_url) as cdp:
        delta_x, delta_y = 0, 0
        if direction == "down":
            delta_y = amount
        elif direction == "up":
            delta_y = -amount
        elif direction == "right":
            delta_x = amount
        elif direction == "left":
            delta_x = -amount

        await cdp.send("Input.dispatchMouseEvent", {
            "type": "mouseWheel",
            "x": 400,
            "y": 300,
            "deltaX": delta_x,
            "deltaY": delta_y,
        })
        return {"scrolled": direction, "amount": amount}


async def cdp_get_url(target_id: str) -> str:
    """Get the current URL of a tab."""
    ws_url = await get_ws_url(target_id)
    async with CDPConnection(ws_url) as cdp:
        result = await cdp.send("Runtime.evaluate", {
            "expression": "window.location.href",
            "returnByValue": True,
        })
        return result.get("result", {}).get("value", "")


async def cdp_wait_for(target_id: str, selector: str, timeout: float = 5.0) -> bool:
    """Wait for an element to appear. Returns True if found."""
    ws_url = await get_ws_url(target_id)
    async with CDPConnection(ws_url) as cdp:
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            result = await cdp.send("Runtime.evaluate", {
                "expression": f"!!document.querySelector({json.dumps(selector)})",
                "returnByValue": True,
            })
            if result.get("result", {}).get("value"):
                return True
            await asyncio.sleep(0.25)
        return False


async def cdp_get_page_info(target_id: str) -> dict:
    """Get basic page info (title, url)."""
    ws_url = await get_ws_url(target_id)
    async with CDPConnection(ws_url) as cdp:
        result = await cdp.send("Runtime.evaluate", {
            "expression": "JSON.stringify({ title: document.title, url: window.location.href })",
            "returnByValue": True,
        })
        return json.loads(result.get("result", {}).get("value", "{}"))
