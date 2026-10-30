'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const fs=require('node:fs');
const cases=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../casos.json'),'utf8'));

async function freePort(){return await new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});s.on('error',reject);});}
async function startServer(){
 const port=await freePort();const base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),NO_BROWSER:'1'},stdio:'pipe'});
 for(let i=0;i<100;i++){
  try{const r=await fetch(base+'/healthz');if(r.ok)return {base,stop:()=>new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');})};}catch(_){}
  await new Promise(r=>setTimeout(r,60));
 }
 child.kill();throw new Error('Servidor no inició');
}
async function request(base,route,body){const r=await fetch(base+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
const q=obj=>new URLSearchParams(obj).toString();
// A room with players, plus helpers to move through it.
async function room(base,options,names=['Ana']){
 const created=(await request(base,'/api/crear',{maxPlayers:6,...options})).data;
 const players=[];for(const name of names)players.push((await request(base,'/api/ingresar',{code:created.code,name})).data);
 const next=async()=>assert.equal((await request(base,'/api/accion',{code:created.code,token:created.hostToken,action:'next'})).status,200);
 const view=async(token=players[0].token)=>(await request(base,'/api/estado?'+q({codigo:created.code,token}))).data;
 const check=(player,item,value)=>request(base,'/api/comprobar',{code:created.code,token:player.token,stage:'mini',item,value});
 // Skips to the minigame of the given case (fixed order), without answering the earlier stages.
 async function toMini(caseNumber){await next();for(let k=1;k<caseNumber;k++)for(let step=0;step<7;step++)await next();await next();await next();await next();await next();assert.equal((await view()).stage,'mini')}
 return {...created,players,next,view,check,toMini};
}

test('al azar: cada partida elige otras misiones, y las opciones se mezclan igual para todos',async()=>{
 const server=await startServer();
 try{
  const r=await room(server.base,{random:true,caseCount:3},['Ana','Juan']);
  const seen=[];
  await r.next();
  for(let i=0;i<3;i++){
   const a=await r.view(r.players[0].token),b=await r.view(r.players[1].token);
   seen.push(a.case.id);
   assert.deepEqual(a.case.pistas.map(p=>p.id),b.case.pistas.map(p=>p.id),'Todo el equipo ve las pistas en el mismo orden.');
   assert.deepEqual((await r.view()).case.opciones.map(o=>o.id),a.case.opciones.map(o=>o.id),'El orden no cambia durante la partida.');
   for(let step=0;step<7;step++)await r.next();
  }
  assert.equal(new Set(seen).size,3,'Tres misiones distintas.');
  // A new game draws again: across a few new games the missions or their order change.
  const games=new Set([seen.join()]);
  for(let k=0;k<5;k++){
   await request(server.base,'/api/accion',{code:r.code,token:r.hostToken,action:'reset'});await r.next();
   const ids=[];for(let i=0;i<3;i++){ids.push((await r.view()).case.id);for(let step=0;step<7;step++)await r.next();}
   games.add(ids.join());
  }
  assert.ok(games.size>1,'«Volver a jugar» vuelve a sortear.');
 }finally{await server.stop()}
});

test('al azar: las nueve misiones cambian preguntas y tarjetas al volver a jugar',async()=>{
 const server=await startServer();
 try{
  const r=await room(server.base,{random:true,caseCount:9},['Ana','Juan']);
  const previous=new Map();
  for(let game=0;game<2;game++){
   await r.next();
   for(let i=0;i<9;i++){
    const a=(await r.view(r.players[0].token)).case;
    const b=(await r.view(r.players[1].token)).case;
    assert.deepEqual(a,b,'Los participantes comparten el mismo sorteo.');
    assert.equal('respuesta' in a,false);
    for(const key of ['respuesta','correctas','ordenCorrecto','clasificacion','soluciones'])assert.equal(key in a.miniJuego,false);
    const cards=m=>['opciones','pasos','tarjetas','situaciones'].flatMap(key=>m[key]||[]).map(c=>c.texto).sort().join('|');
    if(game){
     assert.notEqual(a.pregunta,previous.get(a.id).pregunta,a.id);
     assert.notEqual(cards(a.miniJuego),cards(previous.get(a.id).miniJuego),a.id);
    }else previous.set(a.id,a);
    for(let step=0;step<7;step++)await r.next();
   }
   if(!game)assert.equal((await request(server.base,'/api/accion',{code:r.code,token:r.hostToken,action:'reset'})).status,200);
  }
 }finally{await server.stop()}
});

test('27 escenarios: historias nuevas, avance al decidir y retos independientes con puntuación correcta',async()=>{
 const server=await startServer();
 try{
  const r=await room(server.base,{random:true,caseCount:9});
  const seen=new Set(),kinds=new Set();
  const submit=body=>request(server.base,'/api/responder',{code:r.code,token:r.players[0].token,...body});
  for(let game=0;game<3;game++){
   await r.next();let expected=0;
   for(let i=0;i<9;i++){
    const detected=(await r.view()).case;
    const base=cases.find(c=>c.id===detected.id);
    const actual=[base,...base.variantes].find(c=>c.titulo===detected.titulo);
    assert.ok(actual);
    assert.ok(!seen.has(actual.titulo),'No se repiten escenarios hasta agotar el banco.');seen.add(actual.titulo);
    const clues=actual.pistas.filter(p=>p.correcta).map(p=>p.id);
    assert.equal((await submit({stage:'detect',selections:clues})).status,200);
    await r.next();await r.next();
    const deciding=(await r.view()).case;
    assert.notEqual(deciding.relato,detected.relato,'La historia avanza al decidir.');
    assert.equal(deciding.relato,actual.relatoDecidir);
    assert.equal((await submit({stage:'decide',selection:actual.respuesta})).status,200);
    await r.next();await r.next();
    const mini=(await r.view()).case.miniJuego;
    assert.equal(mini.contexto,actual.miniJuego.contexto);
    assert.notEqual(mini.contexto,detected.relato,'El reto plantea una situación independiente.');
    assert.notEqual(mini.contexto,deciding.relato);
    kinds.add(mini.tipo);
    const m=actual.miniJuego;
    const kind={pocion:'ordenar',defender:'conectar',atrapar:'seleccionar',linterna:'seleccionar'}[m.tipo]||m.tipo;
    const answer={tocar:{selection:m.respuesta},ordenar:{sequence:m.ordenCorrecto},conectar:{matches:m.soluciones},clasificar:{groups:m.clasificacion},seleccionar:{selections:m.correctas}}[kind];
    assert.equal((await submit({stage:'mini',...answer})).status,200);
    await r.next();expected+=clues.length*100+500+300;
    assert.equal((await r.view()).personal.score,expected,'La corrección usa el escenario sorteado.');
    await r.next();await r.next();
   }
   if(game<2)assert.equal((await request(server.base,'/api/accion',{code:r.code,token:r.hostToken,action:'reset'})).status,200);
  }
  assert.equal(seen.size,27);assert.equal(kinds.size,9);
 }finally{await server.stop()}
});

test('al azar: los pasos para ordenar nunca llegan ya ordenados',async()=>{
 const server=await startServer();
 try{
  for(let k=0;k<6;k++){
   const r=await room(server.base,{caseCount:3});
   await r.toMini(2);
   const mini=(await r.view()).case.miniJuego;
   assert.notEqual(mini.pasos.map(p=>p.id).join(),cases[1].miniJuego.ordenCorrecto.join());
  }
 }finally{await server.stop()}
});

test('didáctico: los porqués aparecen recién en el resultado de cada etapa',async()=>{
 const server=await startServer();
 try{
  const r=await room(server.base,{caseCount:3});
  await r.next();
  let s=await r.view();assert.ok(s.case.pistas.every(p=>!('porque'in p))&&s.case.opciones.every(o=>!('porque'in o)));
  await r.next();s=await r.view();assert.ok(s.case.pistas.every(p=>p.porque),'Resultado de pistas con su porqué.');
  await r.next();s=await r.view();assert.ok(s.case.opciones.every(o=>!('porque'in o)),'Mientras deciden, las opciones no se explican.');
  await r.next();s=await r.view();assert.ok(s.case.opciones.every(o=>o.porque));
  await r.next();s=await r.view();assert.ok(s.case.miniJuego.opciones.every(o=>!('porque'in o)));
  await r.next();s=await r.view();assert.ok(s.case.miniJuego.opciones.every(o=>o.porque));
 }finally{await server.stop()}
});

test('minijuego tocar: responde enseguida con el porqué y la tarjeta correcta; no se puede volver a elegir',async()=>{
 const server=await startServer();
 try{
  const r=await room(server.base,{caseCount:3},['Ana','Juan']);
  await r.toMini(1);
  let res=await r.check(r.players[0],'camara');
  assert.equal(res.status,200);assert.equal(res.data.correct,false);assert.equal(res.data.answer,'escudo');assert.match(res.data.porque,/foto/);
  assert.equal((await r.check(r.players[0],'escudo')).status,409,'El primer intento queda.');
  res=await r.check(r.players[1],'escudo');assert.equal(res.data.correct,true);
  await r.next();
  const s=await r.view();
  assert.equal(s.ranking.find(p=>p.name==='Ana').score,0);assert.equal(s.ranking.find(p=>p.name==='Juan').score,300);
 }finally{await server.stop()}
});

test('minijuego ordenar: un paso fuera de lugar se explica y se reintenta, pero ya no suma',async()=>{
 const server=await startServer();
 try{
  const r=await room(server.base,{caseCount:3},['Ana','Juan']);
  await r.toMini(2);
  const [first,second,third]=cases[1].miniJuego.ordenCorrecto;
  let res=await r.check(r.players[0],third,0);assert.equal(res.data.correct,false);assert.ok(res.data.porque);
  assert.equal((await r.check(r.players[0],second,1)).status,400,'Se completa en orden.');
  for(const [k,id] of [[0,first],[1,second],[2,third]])assert.equal((await r.check(r.players[0],id,k)).data.correct,true);
  for(const [k,id] of [[0,first],[1,second],[2,third]])res=await r.check(r.players[1],id,k);
  assert.ok(res.data.answers.mini,'Al completar el camino la respuesta queda enviada.');
  await r.next();const s=await r.view();
  assert.equal(s.ranking.find(p=>p.name==='Ana').score,0);assert.equal(s.ranking.find(p=>p.name==='Juan').score,300);
 }finally{await server.stop()}
});

test('minijuego clasificar y conectar: cada tarjeta cuenta la primera vez',async()=>{
 const server=await startServer();
 try{
  const r=await room(server.base,{caseCount:6},['Ana']);
  await r.toMini(3);
  const groups=cases[2].miniJuego.clasificacion,ids=Object.keys(groups);
  let res=await r.check(r.players[0],ids[0],groups[ids[0]]==='safe'?'danger':'safe');
  assert.equal(res.data.correct,false);assert.equal(res.data.answer,groups[ids[0]]);
  res=await r.check(r.players[0],ids[0],groups[ids[0]]);assert.equal(res.data.correct,false,'Clasificar no se corrige: la carta ya se jugó.');
  for(const id of ids.slice(1))res=await r.check(r.players[0],id,groups[id]);
  assert.ok(res.data.answers.mini);
  for(let step=0;step<3;step++)await r.next();
  for(let k=4;k<6;k++)for(let step=0;step<7;step++)await r.next();
  await r.next();await r.next();await r.next();await r.next();
  const s=await r.view();assert.equal(s.case.miniJuego.tipo,'conectar');
  const solutions=cases[5].miniJuego.soluciones,situations=Object.keys(solutions);
  const wrong=cases[5].miniJuego.acciones.find(a=>a.id!==solutions[situations[0]]).id;
  res=await r.check(r.players[0],situations[0],wrong);assert.equal(res.data.correct,false);assert.equal(res.data.porque,'','Un error en conectar no revela la respuesta.');
  for(const id of situations)res=await r.check(r.players[0],id,solutions[id]);
  assert.ok(res.data.answers.mini);
  assert.equal(res.data.answers.mini.matches[situations[0]],wrong,'La respuesta final guarda el primer intento.');
 }finally{await server.stop()}
});

test('minijuego seleccionar: las marcas comprobadas son la respuesta final',async()=>{
 const server=await startServer();
 try{
  const r=await room(server.base,{caseCount:6},['Ana']);
  await r.toMini(4);
  assert.equal((await r.check(r.players[0],'larga')).data.correct,true);
  assert.equal((await r.check(r.players[0],'chat')).data.correct,false);
  assert.equal((await request(server.base,'/api/responder',{code:r.code,token:r.players[0].token,stage:'mini',selections:['larga','distinta']})).status,200);
  const s=await r.view();assert.deepEqual(new Set(s.personal.answers.mini.selections),new Set(['larga','chat']));
 }finally{await server.stop()}
});

test('dinámico: cuando todo el equipo respondió, el resultado aparece solo',async()=>{
 const server=await startServer();
 try{
  const r=await room(server.base,{auto:true,caseCount:3},['Ana','Juan']);
  await r.next();
  await request(server.base,'/api/responder',{code:r.code,token:r.players[0].token,stage:'detect',selections:['foto']});
  await new Promise(done=>setTimeout(done,3000));
  assert.equal((await r.view()).stage,'detect','Con alguien sin responder se espera.');
  await request(server.base,'/api/responder',{code:r.code,token:r.players[1].token,stage:'detect',selections:['secreto']});
  let s=await r.view();assert.ok(s.endsAt-s.serverNow<=2600,'El reloj se acorta a unos segundos.');
  await new Promise(done=>setTimeout(done,3000));
  s=await r.view();assert.equal(s.stage,'detect_reveal');
 }finally{await server.stop()}
});

