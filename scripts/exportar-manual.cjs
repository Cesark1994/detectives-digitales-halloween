'use strict';
// Exports public/manual.html to MANUAL_DE_USUARIO.pdf with a local headless Chrome or Edge. Usage: npm run manual
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),output=path.join(root,'MANUAL_DE_USUARIO.pdf');
const port=3190,base=`http://localhost:${port}`,children=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browsers=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
async function waitFor(fn,message,timeout=15000){const until=Date.now()+timeout;while(Date.now()<until){try{const r=await fn();if(r)return r}catch(_){}await sleep(100)}throw new Error('Timeout: '+message)}
function run(cmd,args,options={}){const child=spawn(cmd,args,{cwd:root,windowsHide:true,stdio:'ignore',...options});children.push(child);return child}
async function main(){
 const browser=browsers.find(file=>fs.existsSync(file));
 if(!browser)throw new Error('No se encontró Chrome ni Edge. Abrí /manual en el navegador y usá Ctrl+P → Guardar como PDF.');
 run(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),NO_BROWSER:'1'}});
 await waitFor(async()=>(await fetch(base+'/healthz')).ok,'servidor local');
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'detectives-manual-'));
 run(browser,['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','about:blank']);
 const debugPort=await waitFor(()=>{const file=path.join(profile,'DevToolsActivePort');return fs.existsSync(file)&&fs.readFileSync(file,'utf8').split('\n')[0]},'navegador');
 const info=await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:'PUT'})).json();
 const ws=new WebSocket(info.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
 let id=0;const pending=new Map();
 ws.onmessage=event=>{const data=JSON.parse(event.data);if(data.id&&pending.has(data.id)){pending.get(data.id)(data);pending.delete(data.id)}};
 const send=(method,params={})=>new Promise(resolve=>{pending.set(++id,resolve);ws.send(JSON.stringify({id,method,params}))});
 await send('Page.enable');await send('Page.navigate',{url:base+'/manual'});
 await waitFor(async()=>(await send('Runtime.evaluate',{expression:'document.readyState==="complete"',returnByValue:true})).result?.result?.value,'manual');
 const pdf=await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});
 if(!pdf.result?.data)throw new Error('No se pudo generar el PDF: '+JSON.stringify(pdf.error));
 fs.writeFileSync(output,Buffer.from(pdf.result.data,'base64'));
 ws.close();
 console.log('Manual guardado en '+output);
}
main().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>{for(const child of children)child.kill()});
