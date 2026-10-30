'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const { spawn }=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const fs=require('node:fs');

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
  r=await request(base,'/api/estado?'+q({codigo:code,token:hostToken}));
  assert.deepEqual(r.data.players.map(p=>[p.name,p.answered]),[['Ana',true],['Juan',false]],'La pantalla grande sabe quién respondió, no qué respondió.');
  assert.ok(r.data.players.every(p=>!('selections' in p)));
  assert.equal((await request(base,'/api/responder',{...player2,stage:'detect',selections:['foto','juego']})).status,200);
  assert.equal((await request(base,'/api/accion',{...host,action:'next'})).status,200);
  r=await request(base,'/api/estado?'+q({codigo:code,token:hostToken}));
  assert.equal(r.data.stage,'detect_reveal');assert.equal(r.data.ranking.find(p=>p.name==='Ana').score,200);
  assert.equal(r.data.ranking.find(p=>p.name==='Juan').score,100);
  assert.equal((await request(base,'/api/accion',{...host,action:'next'})).status,200);
  assert.equal((await request(base,'/api/responder',{...player1,stage:'decide',selection:'c'})).status,200);
  assert.equal((await request(base,'/api/responder',{...player2,stage:'decide',selection:'a'})).status,200);
  assert.equal((await request(base,'/api/accion',{...host,action:'next'})).status,200);
  r=await request(base,'/api/estado?'+q({codigo:code,token:hostToken}));
  assert.equal(r.data.stage,'decide_reveal');assert.equal(r.data.ranking[0].score,700);assert.equal(r.data.ranking[1].score,100);
  assert.equal((await request(base,'/api/accion',{...host,action:'next'})).status,200);
  r=await request(base,'/api/estado?'+q({codigo:code,token:player1.token}));
  assert.equal(r.data.stage,'mini');assert.equal(r.data.case.miniJuego.tipo,'tocar');assert.ok(!('respuesta'in r.data.case.miniJuego));
  assert.equal((await request(base,'/api/responder',{...player1,stage:'mini',selection:'escudo'})).status,200);
  assert.equal((await request(base,'/api/responder',{...player2,stage:'mini',selection:'camara'})).status,200);
  assert.equal((await request(base,'/api/accion',{...host,action:'next'})).status,200);
  r=await request(base,'/api/estado?'+q({codigo:code,token:hostToken}));
  assert.equal(r.data.stage,'mini_reveal');assert.equal(r.data.ranking[0].score,1000);assert.equal(r.data.ranking[1].score,100);
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
   assert.equal(r.headers.get('x-frame-options'),'DENY');
   const page=await r.text();assert.match(page,/app.js/);assert.match(page,/infantil.css/);
   assert.match(page,/organizador.css/);
   r=await fetch(base+'/organizador.css');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/css/);assert.match(await r.text(),/\.tv-stage/);
   r=await fetch(base+'/manual');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);
   const manual=await r.text();assert.match(manual,/Manual de usuario/);assert.match(manual,/Guía para los chicos/);assert.match(manual,/PERMITIR_CELULARES\.bat/);
   r=await fetch(base+'/infantil.css');assert.equal(r.status,200);
   assert.match(r.headers.get('content-type'),/text\/css/);assert.match(await r.text(),/\.child-panel/);
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

test('catálogo, ritmo y cantidad de casos son configurables y se conservan al reiniciar',async()=>{
 const server=await startServer();const {base}=server;
 try {
  const catalog=await request(base,'/api/catalogo');
  const content=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../casos.json'),'utf8'));
  assert.equal(catalog.status,200);assert.equal(catalog.data.caseCount,content.length);
  assert.deepEqual(new Set(catalog.data.miniTypes),new Set(['tocar','ordenar','clasificar','seleccionar','conectar','atrapar','linterna','pocion','defender','chat','feed']));
  assert.deepEqual(Object.keys(catalog.data).sort(),['caseCount','miniTypes','missions','paces']);
  assert.equal(catalog.data.missions.length,content.length);
  for(const mission of catalog.data.missions) assert.deepEqual(Object.keys(mission).sort(),['categoria','id','personaje','tipo','titulo']);
  assert.deepEqual(catalog.data.paces.calm,{detect:60000,decide:45000,mini:75000});
  assert.deepEqual(catalog.data.paces.classic,{detect:45000,decide:30000,mini:50000});
  for(const options of [{caseCount:0},{caseCount:4},{caseCount:'3'},{pace:'__proto__'},{pace:{toString:'bad'}}]) {
   assert.equal((await request(base,'/api/crear',options)).status,400);
  }
  const room=(await request(base,'/api/crear',{maxPlayers:1,caseCount:3,pace:'calm'})).data;
  assert.equal(room.totalCases,3);assert.equal(room.pace,'calm');
  const host={code:room.code,token:room.hostToken};
  const getState=async()=>(await request(base,'/api/estado?'+q({codigo:room.code,token:room.hostToken}))).data;
  const next=async()=>assert.equal((await request(base,'/api/accion',{...host,action:'next'})).status,200);
  await request(base,'/api/ingresar',{code:room.code,name:'Explorador'});
  let s=await getState();assert.equal(s.stageDurationMs,0);assert.equal(s.totalCases,3);
  await next();
  for(let i=0;i<3;i++) {
   s=await getState();assert.equal(s.stage,'detect');assert.equal(s.caseIndex,i);
   assert.equal(s.stageDurationMs,60000);assert.ok(s.endsAt-s.serverNow>58000);
   await next();await next();s=await getState();assert.equal(s.stageDurationMs,45000);
   await next();await next();s=await getState();assert.equal(s.stageDurationMs,75000);
   await next();await next();await next();
  }
  s=await getState();assert.equal(s.stage,'final');assert.equal(s.totalCases,3);
  await request(base,'/api/accion',{...host,action:'reset'});
  s=await getState();assert.equal(s.stage,'lobby');assert.equal(s.pace,'calm');assert.equal(s.totalCases,3);
  const classic=(await request(base,'/api/crear',{caseCount:6,pace:'classic'})).data;
  assert.equal(classic.totalCases,Math.min(6,content.length));
  await request(base,'/api/ingresar',{code:classic.code,name:'Velocista'});
  await request(base,'/api/accion',{code:classic.code,token:classic.hostToken,action:'next'});
  s=(await request(base,'/api/estado?'+q({codigo:classic.code,token:classic.hostToken}))).data;
  assert.equal(s.stageDurationMs,45000);assert.equal(s.pace,'classic');
  const defaults=(await request(base,'/api/crear',{})).data;
  assert.equal(defaults.totalCases,content.length);assert.equal(defaults.pace,'calm');
 } finally {await server.stop()}
});

test('todos los minijuegos validan respuestas, ocultan soluciones y puntúan exactamente una vez',async()=>{
 const server=await startServer();const {base}=server;
 try {
  const content=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../casos.json'),'utf8'));
  const room=(await request(base,'/api/crear',{maxPlayers:2,caseCount:'all'})).data;
  const host={code:room.code,token:room.hostToken};
  const right=(await request(base,'/api/ingresar',{code:room.code,name:'Detective Luz'})).data;
  const wrong=(await request(base,'/api/ingresar',{code:room.code,name:'Detective Luna'})).data;
  const getState=async(token=right.token)=>(await request(base,'/api/estado?'+q({codigo:room.code,token}))).data;
  const next=async()=>assert.equal((await request(base,'/api/accion',{...host,action:'next'})).status,200);
  const answer=(player,body)=>request(base,'/api/responder',{code:room.code,token:player.token,stage:'mini',...body});
  const hiddenKeys=['respuesta','ordenCorrecto','clasificacion','correctas','soluciones','explicacion'];
  // Arcade formats answer with the same shape as a classic one.
  const kinds={pocion:'ordenar',atrapar:'seleccionar',linterna:'seleccionar',defender:'conectar',feed:'clasificar',chat:'conectar'};
  const seen=new Set();
  await next();
  for(let i=0;i<content.length;i++) {
   const mini=content[i].miniJuego;seen.add(mini.tipo);
   let s=await getState();assert.equal(s.stage,'detect');
   for(const key of hiddenKeys) assert.ok(!(key in s.case.miniJuego));
   assert.ok(s.case.pistas.every(p=>!Object.hasOwn(p,'correcta')));
   assert.ok(!Object.hasOwn(s.case,'respuesta'));
   await next();await next();await next();await next();
   s=await getState();assert.equal(s.stage,'mini');
   for(const key of hiddenKeys) assert.ok(!(key in s.case.miniJuego));
   assert.equal((await answer(right,{selection:'unknown',sequence:['unknown'],groups:{},selections:['unknown'],matches:{}})).status,400);
   let correct,incorrect,invalid;
   switch(kinds[mini.tipo]||mini.tipo) {
    case 'tocar':
     correct={selection:mini.respuesta};incorrect={selection:mini.opciones.find(v=>v.id!==mini.respuesta).id};
     break;
    case 'ordenar':
     correct={sequence:mini.ordenCorrecto};incorrect={sequence:[...mini.ordenCorrecto].reverse()};
     invalid={sequence:mini.pasos.map(()=>mini.pasos[0].id)};
     break;
    case 'clasificar':
     correct={groups:mini.clasificacion};incorrect={groups:Object.fromEntries(Object.entries(mini.clasificacion).map(([id,value])=>[id,value==='safe'?'danger':'safe']))};
     invalid={groups:{...mini.clasificacion,inventada:'safe'}};
     break;
    case 'seleccionar':
     correct={selections:mini.correctas};incorrect={selections:[]};
     invalid={selections:[mini.opciones[0].id,mini.opciones[0].id]};
     break;
    case 'conectar':
     correct={matches:mini.soluciones};incorrect={matches:Object.fromEntries(Object.entries(mini.soluciones).map(([id,value])=>[id,mini.acciones.find(v=>v.id!==value).id]))};
     invalid={matches:{...mini.soluciones,inventada:mini.acciones[0].id}};
     break;
    default: assert.fail('Tipo sin prueba: '+mini.tipo);
   }
   if(invalid) assert.equal((await answer(right,invalid)).status,400);
   assert.equal((await answer(right,correct)).status,200);
   assert.equal((await answer(right,incorrect)).status,409);
   assert.equal((await answer(wrong,incorrect)).status,200);
   await next();s=await getState();assert.equal(s.stage,'mini_reveal');
   assert.equal(s.personal.score,(i+1)*300);assert.equal(s.ranking.find(p=>p.id===wrong.id).score,0);
   assert.equal(typeof s.case.miniJuego.explicacion,'string');
   assert.equal((await answer(wrong,correct)).status,400);
   await next();s=await getState();assert.equal(s.personal.score,(i+1)*300);
   await next();
  }
  assert.deepEqual(seen,new Set(content.map(c=>c.miniJuego.tipo)));
  assert.equal((await getState()).stage,'final');
 } finally {await server.stop()}
});

