const fs=require('fs'), path=require('path'), vm=require('vm'), assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'../console/static/app.js'),'utf8');
const fn=source.slice(source.indexOf('function compute()'),source.indexOf('\nfunction connect()'));
const controls={speed:{value:'0.06'},turn:{value:'0.15'},radius:{value:'0.5'}};
const context={keys:new Set(),mode:'pivot',$:key=>controls[key]};vm.createContext(context);vm.runInContext(fn,context);
function check(keys,mode,v,w){context.keys=new Set(keys);context.mode=mode;const x=context.compute();assert(Math.abs(x.v-v)<1e-8&&Math.abs(x.w-w)<1e-8,JSON.stringify(x));}
check(['a'],'pivot',0,.15);check(['w','a'],'arc',.06,.12);check(['s','a'],'arc',-.06,-.12);controls.radius.value='.1';check(['w','a'],'arc',.03,.3);
console.log('通过：原地转向、前进和后退圆弧、角速度限幅。');
