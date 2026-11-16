'use strict';
const $ = id => document.getElementById(id);
const keys = new Set();
let socket, connected = false, ready = false, mode = 'pivot', last = {v:0,w:0}, recording = null, replay = null;
let records = [];
try { const value = JSON.parse(localStorage.getItem('vehicle-recordings-v1') || '[]'); if (Array.isArray(value)) records = value; } catch (_) {}
function save() { try { localStorage.setItem('vehicle-recordings-v1', JSON.stringify(records)); } catch (_) { alert('记录保存失败：浏览器存储空间不足'); } }
function renderRecords(id) {
  const select = $('records'), current = id || select.value;
  select.replaceChildren();
  if (!records.length) select.add(new Option('暂无记录', ''));
  records.forEach(r => select.add(new Option(`${r.name} · ${r.duration.toFixed(1)} 秒`, r.id)));
  if (records.some(r => r.id === current)) select.value = current;
  select.dispatchEvent(new Event('change'));
}
function selectedRecord() { return records.find(r => r.id === $('records').value); }
function updateSegment() {
  const r = selectedRecord();
  const valid = r && Number.isFinite(+$('start').value) && Number.isFinite(+$('end').value) && +$('start').value >= 0 && +$('end').value <= r.duration && +$('start').value < +$('end').value;
  $('segmentLabel').textContent = `${(+$('start').value || 0).toFixed(1)} — ${(+$('end').value || 0).toFixed(1)} 秒`;
  $('play').disabled = !valid || !ready || !!recording || !!replay;
}
$('records').onchange = () => { const r=selectedRecord(); $('start').value=0; $('end').value=r ? r.duration.toFixed(1) : 0; updateSegment(); };
['start','end'].forEach(id => $(id).oninput=updateSegment);
$('delete').onclick = () => { const r=selectedRecord(); if (!r || recording || replay) return; records=records.filter(x=>x!==r); save(); renderRecords(); };
function send(data) { if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); }
function logCommand(v,w) {
  if (!recording) return;
  const events=recording.events, t=(performance.now()-recording.started)/1000;
  if (!events.length || events.at(-1).v!==v || events.at(-1).w!==w) events.push({t,v,w});
}
function stop() {
  keys.clear(); document.querySelectorAll('.drive').forEach(b=>b.classList.remove('pressed'));
  if (replay) { replay=null; $('cancel').disabled=true; $('playProgress').textContent=''; }
  if (last.v || last.w) logCommand(0,0);
  last={v:0,w:0}; send({type:'stop'}); drawCommand(); updateSegment();
}
function drawCommand() {
  $('vValue').textContent=last.v.toFixed(2); $('wValue').textContent=last.w.toFixed(2);
  $('direction').textContent=replay ? '正在回放' : last.v || last.w ? '遥控中' : '等待操作';
  $('controlStatus').textContent=replay?'回放中':last.v||last.w?'遥控中':'待机';
}
function compute() {
  let v=(Number(keys.has('w'))-Number(keys.has('s'))) * +$('speed').value;
  const steer=Number(keys.has('a'))-Number(keys.has('d'));
  let w=0;
  if (mode==='pivot' && steer) { v=0; w=steer * +$('turn').value; }
  if (mode==='arc' && steer) {
    if (!v) v=+$('speed').value;
    const radius=+$('radius').value;
    v=Math.sign(v)*Math.min(Math.abs(v),.30*radius);
    w=steer * v / radius;
  }
  return {v:Math.round(v*10000)/10000,w:Math.round(w*10000)/10000};
}
function connect() {
  socket=new WebSocket(`ws://${location.host}/ws`);
  socket.onopen=()=>{connected=true;};
  socket.onmessage=e=>{
    const s=JSON.parse(e.data); if(s.type!=='status') return;
    const wasReady=ready; ready=!!s.ready;
    $('bridgeStatus').textContent=s.bridge?'已连接':'未连接';
    const diag=s.diagnostic, vals=Object.fromEntries((diag?.values||[]).map(x=>[x.key,x.value]));
    const labels={'connected':'已连接','serial disconnected':'串口未连接','feedback stale':'反馈过期','battery voltage critical':'电量过低','battery voltage low':'电量偏低','motor control disabled':'电机未使能'};
    $('baseStatus').textContent=diag?(labels[diag.message]||diag.message):'等待反馈';
    $('battery').textContent=vals.battery_v?`${(+vals.battery_v).toFixed(1)} V`:'—';
    $('stateText').textContent=ready?'车辆就绪':s.bridge?'底盘未就绪':'树莓派未连接';
    $('stateDot').classList.toggle('online',ready); $('stateDot').classList.toggle('warn',!ready);
    if(wasReady && !ready) stop();
    updateSegment();
  };
  socket.onclose=()=>{connected=false;ready=false;stop();$('bridgeStatus').textContent='未连接';$('baseStatus').textContent='等待反馈';$('stateText').textContent='控制台断开';$('stateDot').className='dot warn';setTimeout(connect,2000);};
}
function keyDown(k) { if (!ready || recording && replay || replay) return; keys.add(k); document.querySelector(`.drive[data-key="${k}"]`)?.classList.add('pressed'); }
function keyUp(k) { keys.delete(k); document.querySelector(`.drive[data-key="${k}"]`)?.classList.remove('pressed'); }
document.querySelectorAll('.drive').forEach(button=>{
  button.addEventListener('pointerdown', e=>{e.preventDefault(); button.setPointerCapture(e.pointerId); keyDown(button.dataset.key);});
  button.addEventListener('pointerup',()=>keyUp(button.dataset.key));
  button.addEventListener('pointercancel',stop); button.addEventListener('lostpointercapture',()=>keyUp(button.dataset.key));
});
document.addEventListener('keydown',e=>{
  if(e.target.matches('input,select,textarea,button') && e.target.tagName !== 'BUTTON') return;
  const k=e.key.toLowerCase(); if(['w','a','s','d'].includes(k)) {e.preventDefault();keyDown(k);} else if(k===' ' || k==='x') {e.preventDefault();stop();}
});
document.addEventListener('keyup',e=>{const k=e.key.toLowerCase();if(['w','a','s','d'].includes(k)) keyUp(k);});
window.addEventListener('blur',stop); document.addEventListener('visibilitychange',()=>{if(document.hidden) stop();});
$('stop').onclick=stop;
document.querySelectorAll('#modes button').forEach(b=>b.onclick=()=>{stop();mode=b.dataset.mode;document.querySelectorAll('#modes button').forEach(x=>x.classList.toggle('selected',x===b));$('modeLabel').textContent=mode==='pivot'?'原地转向':'圆弧转向';$('radiusField').classList.toggle('active',mode==='arc');});
['speed','turn','radius'].forEach(id=>$(id).oninput=()=>{$(id+'Value').textContent=(+$(id).value).toFixed(2);});
$('record').onclick=()=>{if(replay) return;stop(); recording={id:crypto.randomUUID(),name:new Date().toLocaleString('zh-CN',{hour12:false}),started:performance.now(),events:[{t:0,v:0,w:0}]};$('record').disabled=true;$('finish').disabled=false;$('recordState').textContent='● 正在录制';$('recordState').classList.add('active');updateSegment();};
$('finish').onclick=()=>{if(!recording)return;stop();const duration=Math.round((performance.now()-recording.started)/100)/10; recording.duration=Math.max(.1,duration);recording.events=recording.events.filter(x=>x.t<=recording.duration);delete recording.started;records.unshift(recording);const id=recording.id;recording=null;save();renderRecords(id);$('record').disabled=false;$('finish').disabled=true;$('recordState').textContent='● 未录制';$('recordState').classList.remove('active');};
$('play').onclick=()=>{const r=selectedRecord(),start=+$('start').value,end=+$('end').value;if(!ready||!r||start<0||end>r.duration||end<=start)return;stop();replay={r,start,end,started:performance.now()};$('cancel').disabled=false;updateSegment();};
$('cancel').onclick=stop;
setInterval(()=>{
  if(recording){const t=(performance.now()-recording.started)/1000; $('duration').textContent=`${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(1).padStart(4,'0')}`;}
  if(!ready || !connected) return;
  let next;
  if(replay){const t=replay.start+(performance.now()-replay.started)/1000; if(t>=replay.end){stop();return;} const event=replay.r.events.filter(x=>x.t<=t).at(-1);next=event?{v:event.v,w:event.w}:{v:0,w:0};$('playProgress').textContent=`${t.toFixed(1)} 秒`;}
  else next=compute();
  if(next.v!==last.v || next.w!==last.w){last=next;if(!replay)logCommand(last.v,last.w);drawCommand();}
  if(last.v || last.w) send({type:'command',...last}); else send({type:'stop'});
},100);
renderRecords();connect();
