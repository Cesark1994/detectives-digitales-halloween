'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const cases=JSON.parse(fs.readFileSync(path.join(__dirname,'../casos.json'),'utf8'));
const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');

test('contenido infantil: historias y tarjetas breves conservan una opción de lectura completa',()=>{
 assert.equal(cases.length,9);
 for(const c of cases){
  assert.ok(c.relatoCorto.length<=130,`${c.id}: relato de ${c.relatoCorto.length} caracteres`);
  assert.ok(c.relatoCorto.length<c.relato.length,`${c.id}: la historia breve debe reducir la lectura`);
  assert.ok(c.consejoCorto.length<=110,`${c.id}: consejo demasiado largo`);
  assert.ok(c.miniJuego.instruccionCorta.length<=75,`${c.id}: instrucción demasiado larga`);
  assert.ok(c.miniJuego.explicacionCorta.length<=110,`${c.id}: explicación demasiado larga`);
  const cards=[...c.pistas,...c.opciones,...['opciones','pasos','tarjetas','situaciones','acciones'].flatMap(key=>c.miniJuego[key]||[])];
  for(const card of cards){
   assert.ok(card.textoCorto?.trim(),`${c.id}/${card.id}: falta el texto breve`);
   assert.ok(card.textoCorto.length<=45,`${c.id}/${card.id}: ${card.textoCorto.length} caracteres`);
   assert.ok(card.textoCorto.split(/\s+/).length<=6,`${c.id}/${card.id}: más de seis palabras`);
   assert.ok(card.texto,`${c.id}/${card.id}: conservar el texto completo`);
  }
 }
});

test('contenido infantil: cada misión entrega una carta con nombre breve y un minijuego distinto',()=>{
 for(const c of cases){
  assert.ok(c.insignia?.icono?.trim(),`${c.id}: falta el ícono de la carta`);
  assert.ok(c.insignia.nombre.length<=22,`${c.id}: nombre de carta demasiado largo`);
 }
 assert.equal(new Set(cases.map(c=>c.miniJuego.tipo)).size,cases.length,'Cada misión se juega de una forma diferente.');
});

test('contenido infantil: historias compactas mantienen las señales de los nueve casos',()=>{
 const ideas=[
  [/no conoce/i,/foto/i,/no se lo cuentes/i],
  [/monedas gratis/i,/otro sitio/i,/clave/i],
  [/burlan/i,/no le cuentes/i],
  [/1234/,/todos tus juegos/i,/pasame tu clave/i],
  [/para todos/i,/dirección/i,/no dio permiso/i],
  [/reenvían/i,/burlarse/i,/fuera del juego/i],
  [/mensajes/i,/contactos/i,/dónde está/i],
  [/reenviá ya/i,/de dónde salió/i,/fecha/i],
  [/no pidió/i,/código privado/i,/ya/i]
 ];
 cases.forEach((c,i)=>ideas[i].forEach(idea=>assert.match(c.relatoCorto,idea,c.id)));
});

test('API infantil: los textos breves no revelan respuestas ni consejos antes de tiempo',()=>{
 const context=vm.createContext({cases});
 const kinds=source.slice(source.indexOf('const MINI_KIND'),source.indexOf('const ROOM_IDLE_MS'));
 const projection=source.slice(source.indexOf('function miniForClient('),source.indexOf('function state('));
 vm.runInContext(kinds+projection,context);
 for(let i=0;i<cases.length;i++){
  const get=stage=>JSON.parse(vm.runInContext(`JSON.stringify(currentCase({caseIndex:${i},stage:${JSON.stringify(stage)}}))`,context));
  const detect=get('detect');
  assert.equal(detect.relatoCorto,cases[i].relatoCorto);
  assert.ok(detect.pistas.every(p=>p.textoCorto&&!('correcta'in p)));
  assert.ok(detect.opciones.every(p=>p.textoCorto));
  for(const stage of ['detect','detect_reveal','decide'])assert.equal('consejoCorto'in get(stage),false,stage);
  assert.equal(get('decide_reveal').consejoCorto,cases[i].consejoCorto);
  const mini=get('mini').miniJuego;
  assert.equal(mini.instruccionCorta,cases[i].miniJuego.instruccionCorta);
  for(const key of ['respuesta','correctas','soluciones','ordenCorrecto','clasificacion','explicacion','explicacionCorta'])assert.equal(key in mini,false,`${cases[i].id}: ${key}`);
  for(const key of ['opciones','pasos','tarjetas','situaciones','acciones'])if(mini[key])assert.ok(mini[key].every(v=>v.textoCorto));
  assert.equal(get('mini_reveal').miniJuego.explicacionCorta,cases[i].miniJuego.explicacionCorta);
 }
});
