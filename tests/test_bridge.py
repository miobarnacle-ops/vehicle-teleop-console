#!/usr/bin/env python3
"""Isolated mock bridge test: never contacts the real vehicle."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
from aiohttp import web, ClientSession
from aiohttp.test_utils import TestServer

async def main():
    commands = []
    async def ros(request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        async def diagnostics():
            while not ws.closed:
                await ws.send_json({'topic':'/diagnostics','msg':{'status':[{'name':'spore_patrol_base_driver/STM32','level':0,'message':'connected','values':[{'key':'connected','value':'true'},{'key':'feedback_age_s','value':'0.1'},{'key':'flag_stop','value':'0'}]}]}})
                await asyncio.sleep(.2)
        task = asyncio.create_task(diagnostics())
        try:
            async for message in ws:
                data = json.loads(message.data)
                if data.get('op') == 'publish': commands.append(data['msg'])
        finally:
            task.cancel()
        return ws
    fake = web.Application()
    fake.router.add_get('/', ros)
    async with TestServer(fake) as fake_server:
        os.environ['ROSBRIDGE_URL'] = str(fake_server.make_url('/')).replace('http:', 'ws:')
        path = Path(__file__).resolve().parents[1] / 'console' / 'server.py'
        spec = importlib.util.spec_from_file_location('vehicle_console', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        async with TestServer(module.app) as server, ClientSession() as session:
            async with session.ws_connect(server.make_url('/ws'), headers={'Origin':'http://localhost:8765'}) as ws:
                while not (status := await asyncio.wait_for(ws.receive_json(), 5))['ready']: pass
                await ws.send_json({'type':'command','v':.06,'w':.12})
                await asyncio.sleep(.15)
                assert any(c['linear']['x'] == .06 and c['angular']['z'] == .12 for c in commands)
                await asyncio.sleep(.4)
                assert commands[-1]['linear']['x'] == 0 and commands[-1]['angular']['z'] == 0
                count = len(commands)
                await ws.send_json({'type':'command','v':.5,'w':0})
                await asyncio.sleep(.12)
                assert len(commands) == count
                await ws.send_json({'type':'command','v':.05,'w':0})
                await asyncio.sleep(.12)
            await asyncio.sleep(.15)
            assert commands[-1]['linear']['x'] == 0
    print('通过：模拟底盘就绪、指令转发、超时停车、越限拒绝和断线停车。未连接真实小车。')

if __name__ == '__main__': asyncio.run(main())
