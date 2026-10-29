'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');

function rank(list){
 const context=vm.createContext({});
 vm.runInContext(source.slice(source.indexOf('const VIRTUAL_NAME'),source.indexOf('function addresses(')),context);
 context.list=list;
 return JSON.parse(vm.runInContext('JSON.stringify(rankAddresses(list))',context));
}

test('red local: el QR usa el Wi-Fi o la Ethernet real antes que una red virtual',()=>{
 const ranked=rank([
  {interfaz:'Ethernet 2',ip:'192.168.56.1',virtual:true},
  {interfaz:'vEthernet (WSL)',ip:'172.24.80.1'},
  {interfaz:'VirtualBox Host-Only Network',ip:'192.168.99.1'},
  {interfaz:'Ethernet',ip:'192.168.123.35'},
  {interfaz:'Wi-Fi',ip:'10.0.0.25'}
 ]);
 assert.deepEqual(ranked.slice(0,2).map(item=>item.ip),['10.0.0.25','192.168.123.35'],'Wi-Fi primero, después la Ethernet real.');
 assert.deepEqual(new Set(ranked.slice(2).map(item=>item.interfaz)),new Set(['Ethernet 2','vEthernet (WSL)','VirtualBox Host-Only Network']));
 assert.ok(ranked.slice(2).every(item=>item.virtual),'Las redes virtuales quedan al final y marcadas.');
});

test('red local: la red de VirtualBox se reconoce aunque el adaptador tenga un nombre común',()=>{
 const ranked=rank([{interfaz:'Ethernet 3',ip:'192.168.56.1'},{interfaz:'Conexión de red inalámbrica',ip:'192.168.0.14'}]);
 assert.equal(ranked[0].ip,'192.168.0.14');
 assert.equal(ranked[1].virtual,true);
});
