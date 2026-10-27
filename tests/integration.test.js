'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const { spawn }=require('node:child_process');
const net=require('node:net');
const path=require('node:path');

async function freePort(){return await new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});s.on('error',reject);});}
async function startServer(env={}){
 const port=await freePort();const base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,...env,PORT:String(port),NO_BROWSER:'1'},stdio:'pipe'});
 let err='';child.stderr.on('data',d=>{err+=String(d)});
 for(let i=0;i<100;i++){
   if(child.exitCode!==null)throw new Error('Servidor falló: '+err);
   try { const r=await fetch(base+'/healthz');if(r.ok) return {base,stop:()=>new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');})};} catch(_){}
   await new Promise(r=>setTimeout(r,60));
 }
 child.kill();throw new Error('Servidor no inició '+err);
}
async function request(base,route,body){const r=await fetch(base+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const data=route.startsWith('/api/qr')?await r.text():await r.json();return {status:r.status,data};}
const q=(obj)=>new URLSearchParams(obj).toString();

test('partida multijugador: crear, responder, puntuar, reiniciar y cerrar',async()=>{
 const server=await startServer();const {base}=server;
 try{
  let r=await request(base,'/api/crear',{maxPlayers:3});assert.equal(r.status,200);
  const {code,hostToken}=r.data;assert.match(code,/^[A-Z0-9]{4}$/);
  const join1=await request(base,'/api/ingresar',{code,name:'Ana',avatar:'🕵️'});
  const join2=await request(base,'/api/ingresar',{code,name:'Juan',avatar:'🦊'});
  assert.equal(join1.status,200);assert.equal(join2.status,200);
  assert.equal((await request(base,'/api/ingresar',{code,name:'Ana',avatar:'🕵️'})).status,400);
  const player1={code,token:join1.data.token};const player2={code,token:join2.data.token};const host={code,token:hostToken};
  assert.equal((await request(base,'/api/accion',{...player1,action:'next'})).status,403);
  assert.equal((await request(base,'/api/accion',{...host,action:'next'})).status,200);
  r=await request(base,'/api/estado?'+q({codigo:code,token:player1.token}));
  assert.equal(r.data.stage,'detect');assert.ok(r.data.case.pistas.every(p=>!('correcta'in p)));
  assert.equal((await request(base,'/api/responder',{...player1,stage:'detect',selections:['foto','secreto']})).status,200);
  assert.equal((await request(base,'/api/responder',{...player1,stage:'detect',selections:['juego']})).status,409);
  assert.equal((await request(base,'/api/responder',{...player2,stage:'detect',selections:['foto','juego']})).status,200);
  assert.equal((await request(base,'/api/accion',{...host,action:'next'})).status,200);
  r=await request(base,'/api/estado?'+q({codigo:code,token:hostToken}));
  assert.equal(r.data.stage,'detect_reveal');assert.equal(r.data.ranking.find(p=>p.name==='Ana').score,200);
  assert.equal(r.data.ranking.find(p=>p.name==='Juan').score,0);
  assert.equal((await request(base,'/api/accion',{...host,action:'next'})).status,200);
  assert.equal((await request(base,'/api/responder',{...player1,stage:'decide',selection:'c'})).status,200);
  assert.equal((await request(base,'/api/responder',{...player2,stage:'decide',selection:'a'})).status,200);
  assert.equal((await request(base,'/api/accion',{...host,action:'next'})).status,200);
  r=await request(base,'/api/estado?'+q({codigo:code,token:hostToken}));
  assert.equal(r.data.stage,'decide_reveal');assert.equal(r.data.ranking[0].score,700);assert.equal(r.data.ranking[1].score,-500);
  assert.equal((await request(base,'/api/accion',{...host,action:'next'})).status,200);
  r=await request(base,'/api/estado?'+q({codigo:code,token:player1.token}));
  assert.equal(r.data.stage,'mini');assert.equal(r.data.case.miniJuego.tipo,'tocar');assert.ok(!('respuesta'in r.data.case.miniJuego));
  assert.equal((await request(base,'/api/responder',{...player1,stage:'mini',selection:'escudo'})).status,200);
  assert.equal((await request(base,'/api/responder',{...player2,stage:'mini',selection:'camara'})).status,200);
  assert.equal((await request(base,'/api/accion',{...host,action:'next'})).status,200);
  r=await request(base,'/api/estado?'+q({codigo:code,token:hostToken}));
  assert.equal(r.data.stage,'mini_reveal');assert.equal(r.data.ranking[0].score,1000);assert.equal(r.data.ranking[1].score,-500);
  assert.equal((await request(base,'/api/accion',{...host,action:'next'})).status,200);
  r=await request(base,'/api/estado?'+q({codigo:code,token:hostToken}));assert.equal(r.data.stage,'leaderboard');
  assert.equal((await request(base,'/api/accion',{...host,action:'reset'})).status,200);
  r=await request(base,'/api/estado?'+q({codigo:code,token:hostToken}));assert.equal(r.data.stage,'lobby');assert.equal(r.data.ranking[0].score,0);
  assert.equal((await request(base,'/api/accion',{...host,action:'close'})).status,200);
  assert.equal((await request(base,'/api/estado?'+q({codigo:code,token:hostToken}))).status,404);
 } finally {await server.stop()}
});

test('QR SVG local, cabeceras de seguridad, rutas y acciones protegidas',async()=>{
 const server=await startServer();const {base}=server;
 try{
   let r=await fetch(base+'/organizador');assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/frame-ancestors/);
   assert.equal(r.headers.get('x-frame-options'),'DENY');assert.match(await r.text(),/app.js/);
   r=await fetch(base+'/api/qr?texto='+encodeURIComponent(base+'/jugar?codigo=ABCD'));
   assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/svg+xml');assert.match(await r.text(),/<svg/);
   assert.equal((await request(base,'/api/estado?codigo=ZZZZ&token=no')).status,404);
   assert.equal((await request(base,'/api/accion',{code:'XXXX',action:'next',token:'123'})).status,404);
   assert.equal((await request(base,'/api/crear',{maxPlayers:6})).status,200);
   r=await fetch(base+'/api/crear',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:'{}'});
   assert.equal(r.status,403);
 } finally {await server.stop()}
});

test('temporizador servidor: cierra al agotar tiempo y rechaza respuesta tardía',async()=>{
 const server=await startServer({DETECT_SECONDS:'1',DECIDE_SECONDS:'1'});const {base}=server;
 try {
   const room=(await request(base,'/api/crear',{maxPlayers:3})).data;
   const player=(await request(base,'/api/ingresar',{code:room.code,name:'Participante'})).data;
   assert.equal((await request(base,'/api/accion',{code:room.code,token:room.hostToken,action:'next'})).status,200);
   await new Promise(r=>setTimeout(r,1400));
   const r=await request(base,'/api/estado?'+q({codigo:room.code,token:room.hostToken}));
   assert.equal(r.data.stage,'detect_reveal');
   assert.equal((await request(base,'/api/responder',{code:room.code,token:player.token,stage:'detect',selections:['foto']})).status,400);
 } finally {await server.stop()}
});

test('mini juegos: tocar, ordenar y clasificar mantienen sus respuestas ocultas',async()=>{
 const server=await startServer();const {base}=server;
 try {
  const room=(await request(base,'/api/crear',{maxPlayers:1})).data;
  const player=(await request(base,'/api/ingresar',{code:room.code,name:'Peque'})).data;
  const host={code:room.code,token:room.hostToken};const investigator={code:room.code,token:player.token};
  const next=()=>request(base,'/api/accion',{...host,action:'next'});
  async function playCase(decision,mini,type,hiddenKey){
   let state=await request(base,'/api/estado?'+q({codigo:room.code,token:player.token}));assert.equal(state.data.stage,'detect');
   assert.equal((await request(base,'/api/responder',{...investigator,stage:'detect',selections:[]})).status,200);
   await next();await next();
   assert.equal((await request(base,'/api/responder',{...investigator,stage:'decide',selection:decision})).status,200);
   await next();await next();
   state=await request(base,'/api/estado?'+q({codigo:room.code,token:player.token}));
   assert.equal(state.data.stage,'mini');assert.equal(state.data.case.miniJuego.tipo,type);assert.ok(!(hiddenKey in state.data.case.miniJuego));
   assert.equal((await request(base,'/api/responder',{...investigator,stage:'mini',...mini})).status,200);
   await next();state=await request(base,'/api/estado?'+q({codigo:room.code,token:player.token}));assert.equal(state.data.stage,'mini_reveal');
   await next();
  }
  await next();
  await playCase('c',{selection:'escudo'},'tocar','respuesta');
  await next();
  await playCase('b',{sequence:['guardar','bloquear','contar']},'ordenar','ordenCorrecto');
  await next();
  await playCase('b',{groups:{clave:'safe',link:'danger',adulto:'safe'}},'clasificar','clasificacion');
 } finally {await server.stop()}
});
