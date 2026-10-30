'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const css=fs.readFileSync(path.resolve(__dirname,'../public/infantil.css'),'utf8');

test('interfaz móvil: protege zonas seguras, acciones y pantallas angostas o en horizontal',()=>{
  assert.match(css,/safe-area-inset-left/,'Respeta el borde de iPhone y otros equipos con recorte.');
  assert.match(css,/\.child-actions\{position:sticky/,'El botón de enviar permanece al alcance.');
  assert.match(css,/touch-action:manipulation/,'Los controles responden como objetivos táctiles.');
  assert.match(css,/@media\(max-width:380px\)/,'Hay ajustes para teléfonos angostos.');
  assert.match(css,/@media\(max-height:520px\) and \(orientation:landscape\)/,'Hay ajustes para teléfonos en horizontal.');
});
