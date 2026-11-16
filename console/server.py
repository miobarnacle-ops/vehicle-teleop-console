#!/usr/bin/env python3
"""Local-only ROS bridge proxy for the vehicle console."""
import asyncio
import json
import math
import os
import time
from pathlib import Path
from aiohttp import ClientError, ClientSession, ClientTimeout, WSMsgType, web

ROOT = Path(__file__).parent
ROSBRIDGE = os.environ.get('ROSBRIDGE_URL', '')
MAX_V, MAX_W = 0.15, 0.30

class Bridge:
    def __init__(self):
        self.ros = None
        self.client = None
        self.diagnostic = None
        self.diag_at = 0.0
        self.last_command = 0.0
        self.moving = False
        self.lock = asyncio.Lock()

    def ready(self):
        d = self.diagnostic
        if self.ros is None or self.ros.closed or not d or time.monotonic() - self.diag_at > 3:
            return False
        values = {x['key']: x['value'] for x in d.get('values', [])}
        try:
            return d.get('level', 2) < 2 and values.get('connected') == 'true' and float(values.get('feedback_age_s', 'inf')) < 1 and values.get('flag_stop', '0').lower() in ('0', 'false')
        except (ValueError, TypeError):
            return False

    async def send(self, v, w):
        if self.ros is not None and not self.ros.closed:
            await self.ros.send_json({'op':'publish','topic':'/cmd_vel','msg':{'linear':{'x':v,'y':0.0,'z':0.0},'angular':{'x':0.0,'y':0.0,'z':w}}})
            self.moving = bool(v or w)

    async def stop(self):
        if self.moving:
            try: await self.send(0.0, 0.0)
            except (ConnectionError, RuntimeError): pass
        self.moving = False

    async def connect(self, app):
        async with ClientSession(timeout=ClientTimeout(total=None, sock_connect=4)) as session:
            while True:
                try:
                    async with session.ws_connect(ROSBRIDGE, heartbeat=10) as ws:
                        self.ros = ws
                        self.diagnostic = None
                        await ws.send_json({'op':'advertise','topic':'/cmd_vel','type':'geometry_msgs/msg/Twist'})
                        await ws.send_json({'op':'subscribe','topic':'/diagnostics','type':'diagnostic_msgs/msg/DiagnosticArray','throttle_rate':200})
                        async for msg in ws:
                            if msg.type != WSMsgType.TEXT: continue
                            try: data = json.loads(msg.data)
                            except ValueError: continue
                            if data.get('topic') == '/diagnostics':
                                for d in data.get('msg', {}).get('status', []):
                                    if d.get('name') == 'spore_patrol_base_driver/STM32':
                                        self.diagnostic, self.diag_at = d, time.monotonic()
                except (ClientError, OSError, asyncio.TimeoutError, ValueError): pass
                finally:
                    self.ros = None
                    self.diagnostic = None
                    self.moving = False
                await asyncio.sleep(2)

    async def watchdog(self, app):
        while True:
            await asyncio.sleep(.05)
            if self.moving and (time.monotonic() - self.last_command > .3 or not self.ready()):
                await self.stop()
            if self.client is not None and not self.client.closed:
                d = self.diagnostic
                fresh = d is not None and time.monotonic() - self.diag_at < 3
                try:
                    await self.client.send_json({'type':'status','bridge': bool(self.ros is not None and not self.ros.closed), 'ready':self.ready(), 'diagnostic':d if fresh else None})
                except (ConnectionError, RuntimeError):
                    await self.stop()

bridge = Bridge()

async def index(request): return web.FileResponse(ROOT / 'static' / 'index.html')

async def socket(request):
    origin = request.headers.get('Origin', '')
    if origin not in ('http://localhost:8765', 'http://127.0.0.1:8765'):
        raise web.HTTPForbidden()
    if bridge.client is not None and not bridge.client.closed:
        raise web.HTTPConflict(text='控制台已在其他页面打开')
    ws = web.WebSocketResponse(heartbeat=10, max_msg_size=4096)
    await ws.prepare(request)
    bridge.client = ws
    try:
        async for msg in ws:
            if msg.type != WSMsgType.TEXT: continue
            try:
                data = json.loads(msg.data)
                if data.get('type') == 'stop':
                    await bridge.stop()
                elif data.get('type') == 'command':
                    v, w = float(data['v']), float(data['w'])
                    if not math.isfinite(v) or not math.isfinite(w) or abs(v)>MAX_V+1e-9 or abs(w)>MAX_W+1e-9:
                        await bridge.stop(); continue
                    if bridge.ready():
                        bridge.last_command = time.monotonic()
                        await bridge.send(v, w)
                    else: await bridge.stop()
            except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                await bridge.stop()
    finally:
        await bridge.stop()
        if bridge.client is ws: bridge.client = None
    return ws

async def startup(app):
    app['tasks'] = [asyncio.create_task(bridge.connect(app)), asyncio.create_task(bridge.watchdog(app))]

async def cleanup(app):
    await bridge.stop()
    for task in app['tasks']: task.cancel()
    await asyncio.gather(*app['tasks'], return_exceptions=True)

app = web.Application(client_max_size=4096)
app.router.add_get('/', index)
app.router.add_get('/ws', socket)
app.router.add_static('/static/', ROOT / 'static')
app.on_startup.append(startup)
app.on_cleanup.append(cleanup)
if __name__ == '__main__':
    if not ROSBRIDGE:
        raise SystemExit('请先设置 ROSBRIDGE_URL，例如 ws://<树莓派地址>:9091')
    web.run_app(app, host='127.0.0.1', port=8765, print=lambda *x: print('小车控制台：http://localhost:8765', flush=True))
