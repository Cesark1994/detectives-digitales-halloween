'use strict';
// Detectives Digitales - servidor HTTP local sin paquetes npm ni conexión a Internet.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const QRCode = require('./vendor/QRCode');
const QRErrorCorrectLevel = require('./vendor/QRCode/QRErrorCorrectLevel');
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'casos.json'), 'utf8'));
const PORT = Number(process.env.PORT) || 3000;
const PACES = {
  calm: {detect:45000,decide:30000,mini:60000},
  classic: {detect:30000,decide:20000,mini:35000}
};
// Keep deployment/test overrides available for both classroom rhythms.
for(const stages of Object.values(PACES)) for(const stage of Object.keys(stages)) {
  const seconds=Number(process.env[stage.toUpperCase()+'_SECONDS']);
  if(Number.isFinite(seconds) && seconds>0) stages[stage]=Math.max(1000,seconds*1000);
}
// Arcade formats reuse the answer shape of a classic one, so scoring and validation stay shared.
const MINI_KIND = {tocar:'tocar',ordenar:'ordenar',pocion:'ordenar',clasificar:'clasificar',seleccionar:'seleccionar',atrapar:'seleccionar',linterna:'seleccionar',conectar:'conectar',defender:'conectar'};
const ROOM_IDLE_MS = 12 * 60 * 60 * 1000;
const rateWindow = new Map();
function allowRate(key, max, windowMs) {
  const now = Date.now();
  const item = rateWindow.get(key);
  if (!item || item.until <= now) { rateWindow.set(key, {count:1,until:now+windowMs}); return; }
  if (++item.count > max) throw error('Demasiados intentos. Probá nuevamente dentro de unos minutos.', 429);
}
function touch(room) { room.lastActivity=Date.now(); }
function closeRoom(room) { for (const c of room.clients) { try { c.res.end(); } catch(_) {} } room.clients.clear(); rooms.delete(room.code); }

const MAX_ROOMS = 30;
const MIN_PLAYERS = 1;
const HOST = '0.0.0.0';
const PUBLIC = path.join(__dirname, 'public');
const rooms = new Map();
const alphanumeric = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newToken = () => crypto.randomBytes(24).toString('hex');
const error = (message, status=400) => Object.assign(new Error(message), {status});
function uniqueCode() { let code; do {code = Array.from({length:4},()=>alphanumeric[crypto.randomInt(alphanumeric.length)]).join('');} while(rooms.has(code)); return code; }
// Phones cannot reach virtual adapters (VirtualBox, VMware, Hyper-V, WSL, Docker, VPNs), so the real Wi-Fi or Ethernet goes first in the QR.
const VIRTUAL_NAME=/virtual|vbox|vmware|vethernet|hyper-v|wsl|docker|loopback|tailscale|zerotier|hamachi|radmin|bluetooth/i;
const VIRTUAL_MAC=/^(0a:00:27|08:00:27|00:50:56|00:0c:29|00:05:69|00:1c:14|00:15:5d|02:42)/i;
function rankAddresses(list) {
  const marked=list.map(item=>({...item,virtual:!!item.virtual||VIRTUAL_NAME.test(item.interfaz)||/^192\.168\.56\./.test(item.ip)}));
  const score=item=>(item.virtual?-10:0)+(/wi-?fi|wlan|wireless|inal[aá]mbric/i.test(item.interfaz)?3:0)+(/^(ethernet|eth|en)/i.test(item.interfaz)?1:0)+(/^192\.168\./.test(item.ip)?1:/^10\./.test(item.ip)?.5:0);
  return marked.sort((a,b)=>score(b)-score(a));
}
function addresses() {
  const data=[];
  for(const [iface, devs] of Object.entries(os.networkInterfaces())) {
    for(const dev of devs||[]) {
      if(dev.family==='IPv4' && !dev.internal && !dev.address.startsWith('169.254.')) data.push({interfaz:iface,ip:dev.address,virtual:VIRTUAL_MAC.test(dev.mac||'')});
    }
  }
  return rankAddresses(data);
}
function stageDuration(room,stage=room.stage) { return PACES[room.pace][stage]||0; }
function advance(room, action='next') {
  if(action==='reset') {
    room.stage='lobby'; room.caseIndex=0; room.endsAt=0;
    room.submissions={}; for(const p of room.players) p.score=0;
    return;
  }
  switch(room.stage) {
    case 'lobby':
      if(room.players.length<MIN_PLAYERS) throw error('Esperá que ingrese al menos un investigador.');
      room.caseIndex=0; room.stage='detect'; room.endsAt=Date.now()+stageDuration(room); room.submissions={}; break;
    case 'detect': room.stage='detect_reveal'; room.endsAt=0; scoreDetect(room); break;
    case 'detect_reveal': room.stage='decide'; room.endsAt=Date.now()+stageDuration(room); break;
    case 'decide': room.stage='decide_reveal'; room.endsAt=0; scoreDecide(room); break;
    case 'decide_reveal': room.stage='mini'; room.endsAt=Date.now()+stageDuration(room); break;
    case 'mini': room.stage='mini_reveal'; room.endsAt=0; scoreMini(room); break;
    case 'mini_reveal': room.stage='leaderboard'; room.endsAt=0; break;
    case 'leaderboard':
      if(room.caseIndex+1>=room.caseCount) { room.stage='final'; room.endsAt=0; }
      else { room.caseIndex++; room.stage='detect'; room.endsAt=Date.now()+stageDuration(room); room.submissions={}; }
      break;
    case 'final': if(action==='reset') return advance(room, 'reset'); else throw error('La partida terminó. Elegí «Volver a comenzar».');
  }
}
function scoreDetect(room) {
  const c=cases[room.caseIndex]; const good=new Set(c.pistas.filter(v=>v.correcta).map(v=>v.id));
  for(const p of room.players) {
    const sub=room.submissions[p.id]?.detect;
    if(sub && !sub.scored) { p.score += sub.selections.reduce((n,id)=> n+(good.has(id)?100:-100),0); sub.scored=true; }
  }
}
function scoreDecide(room) {
  const c=cases[room.caseIndex];
  for(const p of room.players) {
    const sub=room.submissions[p.id]?.decide;
    if(sub && !sub.scored) { p.score+=(sub.selection===c.respuesta?500:-500); sub.scored=true; }
  }
}
function scoreMini(room) {
  const mini=cases[room.caseIndex].miniJuego,kind=MINI_KIND[mini.tipo];
  for(const p of room.players) {
    const sub=room.submissions[p.id]?.mini;
    if(!sub || sub.scored) continue;
    let correct=false;
    if(kind==='tocar') correct=sub.selection===mini.respuesta;
    if(kind==='ordenar') correct=Array.isArray(sub.sequence) && sub.sequence.join('|')===mini.ordenCorrecto.join('|');
    if(kind==='clasificar') correct=Object.keys(mini.clasificacion).every(id=>sub.groups?.[id]===mini.clasificacion[id]);
    if(kind==='seleccionar') correct=Array.isArray(sub.selections) && sub.selections.length===mini.correctas.length && sub.selections.every(id=>mini.correctas.includes(id));
    if(kind==='conectar') correct=Object.keys(mini.soluciones).every(id=>sub.matches?.[id]===mini.soluciones[id]);
    if(correct) p.score+=300;
    sub.scored=true;
  }
}
function miniForClient(mini,reveal) {
  const card=v=>({id:v.id,icono:v.icono,texto:v.texto,...(v.textoCorto?{textoCorto:v.textoCorto}:{})});
  const kind=MINI_KIND[mini.tipo];
  const out={tipo:mini.tipo,titulo:mini.titulo,instruccion:mini.instruccion,...(mini.instruccionCorta?{instruccionCorta:mini.instruccionCorta}:{})};
  if(kind==='tocar') {out.opciones=mini.opciones.map(card); if(reveal) out.respuesta=mini.respuesta;}
  if(kind==='ordenar') {out.pasos=mini.pasos.map(card); if(reveal) out.ordenCorrecto=mini.ordenCorrecto;}
  if(kind==='clasificar') {out.tarjetas=mini.tarjetas.map(card); if(reveal) out.clasificacion=mini.clasificacion;}
  if(kind==='seleccionar') {out.opciones=mini.opciones.map(card); if(reveal) out.correctas=mini.correctas;}
  if(kind==='conectar') {
    out.situaciones=mini.situaciones.map(card);
    out.acciones=mini.acciones.map(card);
    if(reveal) out.soluciones=mini.soluciones;
  }
  if(reveal) {out.explicacion=mini.explicacion;if(mini.explicacionCorta)out.explicacionCorta=mini.explicacionCorta;}
  return out;
}
function currentCase(room) {
  const c=cases[room.caseIndex];
  if(!c) return null;
  const reveal=['detect_reveal','decide','decide_reveal','mini','mini_reveal','leaderboard','final'].includes(room.stage);
  return {
    id:c.id, titulo:c.titulo, categoria:c.categoria, personaje:c.personaje,...(c.insignia?{insignia:c.insignia}:{}), relato:c.relato,...(c.relatoCorto?{relatoCorto:c.relatoCorto}:{}),
    pistas:c.pistas.map(p=>({id:p.id,texto:p.texto,icono:p.icono,...(p.textoCorto?{textoCorto:p.textoCorto}:{}),...(reveal?{correcta:p.correcta}:{})})),
    pregunta:c.pregunta, opciones:c.opciones,
    ...(['decide_reveal','mini','mini_reveal','leaderboard','final'].includes(room.stage)?{respuesta:c.respuesta,explicacion:c.explicacion,...(c.consejoCorto?{consejoCorto:c.consejoCorto}:{})}:{}),
    ...(c.miniJuego?{miniJuego:miniForClient(c.miniJuego,['mini_reveal','leaderboard','final'].includes(room.stage))}:{})
  };
}
function state(room,token) {
  const isHost=room.hostToken===token;
  const me=isHost?null:room.players.find(p=>p.token===token);
  if(!isHost && !me) throw error('Tu acceso a la sala no es válido. Volvé a ingresar.',401);
  const ranking=room.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar,score:p.score})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'es'));
  const now=Date.now();
  const part=['detect','decide','mini'].includes(room.stage)?room.stage:null;
  const submitted=part?room.players.filter(p=>room.submissions[p.id]?.[part]).length:0;
  return {code:room.code,stage:room.stage,caseIndex:room.caseIndex,totalCases:room.caseCount,
    pace:room.pace,stageDurationMs:stageDuration(room),
    case:currentCase(room),endsAt:room.endsAt,serverNow:now,maxPlayers:room.maxPlayers,
    // Who already answered this stage (never what they answered), so the big screen can light up their avatars.
    players:room.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar,score:p.score,answered:!!(part&&room.submissions[p.id]?.[part])})),
    ranking,submitted,part,
    personal:me?{id:me.id,name:me.name,avatar:me.avatar,score:me.score,
      answers:room.submissions[me.id]||{}}:null,
    isHost
  };
}
function push(room) {
  for(const client of room.clients) {
    try {client.res.write('event: update\ndata: '+JSON.stringify(state(room,client.token))+'\n\n');}
    catch(e){room.clients.delete(client);}
  }
}
function json(res,obj,status=200) {
  const body=JSON.stringify(obj);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(body);
}
function respondError(res,e) {json(res,{error:e.message||'Error interno'},e.status||500);}
function bodyJSON(req) {
  return new Promise((resolve,reject)=>{
    let text=''; let size=0;
    req.on('data',chunk=>{ size+=chunk.length; if(size>16000) {reject(error('Solicitud demasiado extensa',413));req.destroy();} else text+=chunk;});
    req.on('end',()=>{try{resolve(text?JSON.parse(text):{});}catch(e){reject(error('Los datos enviados no son válidos.'));}});
    req.on('error',reject);
  });
}
function findRoom(code) {const room=rooms.get(String(code||'').trim().toUpperCase()); if(!room) throw error('No existe esa sala. Revisá el código.',404); return room;}
function requireHost(room,token) {if(room.hostToken!==token) throw error('Solo el organizador puede controlar la partida.',403);}
function join(room,data) {
  if(room.stage!=='lobby') throw error('La partida ya comenzó. Esperá la próxima sala.');
  if(room.players.length>=room.maxPlayers) throw error('La sala está completa.');
  const name=String(data.name||'').trim().replace(/\s+/g,' ');
  if(name.length<2||name.length>22) throw error('Escribí un nombre de 2 a 22 caracteres.');
  if(room.players.some(p=>p.name.toLowerCase()===name.toLowerCase())) throw error('Ese nombre ya está ocupado. Elegí otro.');
  const avatars=['🕵️','🦊','👻','🎃','🦇','🐈','🦉','🧙'];
  touch(room);
  const p={id:crypto.randomUUID(),token:newToken(),name,avatar:avatars.includes(data.avatar)?data.avatar:'🕵️',score:0};
  room.players.push(p); push(room);
  return {token:p.token,code:room.code,id:p.id};
}
function getQR(text) {
  if(text.length>400) throw error('Dirección demasiado extensa.');
  const qr=new QRCode(-1,QRErrorCorrectLevel.M);
  qr.addData(text);qr.make();const n=qr.getModuleCount();let cells='';
  for(let y=0;y<n;y++) for(let x=0;x<n;x++) if(qr.isDark(y,x)) cells+=`<rect x="${x+4}" y="${y+4}" width="1" height="1"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n+8} ${n+8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><g fill="black">${cells}</g></svg>`;
}
function sendStatic(req,res,url) {
  const paths={'/':'index.html','/organizador':'index.html','/jugar':'index.html','/estilos.css':'estilos.css','/infantil.css':'infantil.css','/organizador.css':'organizador.css','/manual':'manual.html','/app.js':'app.js','/favicon.svg':'favicon.svg'};
  const fname=paths[url.pathname];if(!fname) throw error('Página no encontrada.',404);
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml'};
  const full=path.join(PUBLIC,fname);
  res.writeHead(200,{'Content-Type':types[path.extname(full)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'"});
  fs.createReadStream(full).pipe(res);
}
const server=http.createServer(async(req,res)=>{
 try {
   const u=new URL(req.url,'http://localhost');
   if (req.method==='GET' && u.pathname==='/healthz') return json(res,{ok:true,app:'Detectives Digitales',version:'2.0.0'});
   if (req.method==='GET' && u.pathname==='/api/catalogo') return json(res,{
     caseCount:cases.length,miniTypes:[...new Set(cases.map(c=>c.miniJuego.tipo))],paces:PACES,
     missions:cases.map(c=>({id:c.id,titulo:c.titulo,categoria:c.categoria,personaje:c.personaje,tipo:c.miniJuego.tipo}))
   });
   if(req.method==='POST') {
     const origin=req.headers.origin;
     const forwardedHost=req.headers['x-forwarded-host'];
     const host=forwardedHost||req.headers.host;
     if(origin && new URL(origin).host!==host) throw error('Origen no autorizado.',403);
   }
   const clientIP=req.socket.remoteAddress || 'unknown';
   if(req.method==='GET'&&u.pathname==='/api/red') {const h=(req.headers.host||'').split(':')[0];if(!['localhost','127.0.0.1','[::1]'].includes(h)) throw error('Solo disponible desde la computadora organizadora local.',403);return json(res,{ips:addresses(),port:PORT});}
   if(req.method==='GET'&&u.pathname==='/api/qr') {allowRate('qr:'+clientIP,120,60_000);const text=u.searchParams.get('texto')||'';if(!text) throw error('Falta la dirección');const svg=getQR(text);res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(svg);return;}
   if(req.method==='GET'&&u.pathname==='/api/estado') return json(res,state(findRoom(u.searchParams.get('codigo')),u.searchParams.get('token')));
   if(req.method==='GET'&&u.pathname==='/api/eventos') {
     const room=findRoom(u.searchParams.get('codigo'));const token=u.searchParams.get('token');
     state(room,token); // autenticar antes de abrir eventos
     res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
     res.write('retry: 1800\n\n');
     const client={res,token};room.clients.add(client);res.write('event: update\ndata: '+JSON.stringify(state(room,token))+'\n\n');
     req.on('close',()=>room.clients.delete(client));return;
   }
   if(req.method==='POST'&&u.pathname==='/api/crear') {
     const data=await bodyJSON(req);
     const requestedCount=data.caseCount===undefined?'all':data.caseCount;
     if(![3,6,9,'all'].includes(requestedCount)) throw error('Elegí una partida de 3, 6, 9 casos o todos los casos.');
     const pace=data.pace===undefined?'calm':data.pace;
     if(typeof pace!=='string' || !Object.hasOwn(PACES,pace)) throw error('Elegí un ritmo tranquilo o clásico.');
     const caseCount=requestedCount==='all'?cases.length:Math.min(requestedCount,cases.length);
     allowRate('create:'+clientIP,6,60_000);
     if(rooms.size>=MAX_ROOMS) throw error('Se alcanzó el límite de salas activas. Cerrá una sala anterior o intentá más tarde.');
     const maxPlayers=Math.min(30,Math.max(MIN_PLAYERS,Number(data.maxPlayers)||6));
     const room={code:uniqueCode(),hostToken:newToken(),stage:'lobby',caseIndex:0,endsAt:0,maxPlayers,caseCount,pace,players:[],submissions:{},clients:new Set(),lastActivity:Date.now()};
     rooms.set(room.code,room);
     return json(res,{code:room.code,hostToken:room.hostToken,maxPlayers,totalCases:caseCount,pace});
   }
   if(req.method==='POST'&&u.pathname==='/api/ingresar') {allowRate('join:'+clientIP,40,60_000);const data=await bodyJSON(req);return json(res,join(findRoom(data.code),data));}
   if(req.method==='POST'&&u.pathname==='/api/accion') {
     const data=await bodyJSON(req);const room=findRoom(data.code);requireHost(room,data.token);
     if(!['next','reset','close'].includes(data.action)) throw error('Acción desconocida.');
     if(data.action==='close') {closeRoom(room);return json(res,{ok:true});}
     touch(room);advance(room,data.action);push(room);return json(res,{ok:true});
   }
   if(req.method==='POST'&&u.pathname==='/api/responder') {
     const data=await bodyJSON(req);const room=findRoom(data.code);
     const p=room.players.find(p=>p.token===data.token);if(!p) throw error('Debés ingresar como investigador.',401);
     if(!['detect','decide','mini'].includes(room.stage)||room.endsAt<=Date.now()) throw error('El tiempo de esta etapa terminó.');
     if(room.stage!==data.stage) throw error('La etapa cambió. Actualizá la pantalla.');
     const answer=room.submissions[p.id]||{};
     if(answer[room.stage]) throw error('Tu respuesta ya fue confirmada para esta etapa.',409);
     if(room.stage==='detect') {
       if(!Array.isArray(data.selections)) throw error('La selección no es válida.');
       const valid=new Set(cases[room.caseIndex].pistas.map(v=>v.id));
       const selections=[...new Set(data.selections.map(String))];
       if(selections.some(v=>!valid.has(v))) throw error('Señal no válida.');
       answer.detect={selections,scored:false};
     } else if(room.stage==='decide') {
       if(!cases[room.caseIndex].opciones.some(v=>v.id===data.selection)) throw error('Seleccioná una respuesta válida.');
       answer.decide={selection:data.selection,scored:false};
     } else {
       const mini=cases[room.caseIndex].miniJuego,kind=MINI_KIND[mini.tipo];
       if(!kind) throw error('Este mini juego no está disponible.');
       if(kind==='tocar') {
         if(!mini.opciones.some(v=>v.id===data.selection)) throw error('Elegí una tarjeta válida.');
         answer.mini={selection:data.selection,scored:false};
       }
       if(kind==='ordenar') {
         if(!Array.isArray(data.sequence) || data.sequence.length!==mini.pasos.length) throw error('Completá todos los pasos.');
         const sequence=data.sequence.map(String); const valid=new Set(mini.pasos.map(v=>v.id));
         if(new Set(sequence).size!==mini.pasos.length || sequence.some(v=>!valid.has(v))) throw error('El orden no es válido.');
         answer.mini={sequence,scored:false};
       }
       if(kind==='clasificar') {
         if(!data.groups || typeof data.groups!=='object' || Array.isArray(data.groups)) throw error('Clasificá todas las tarjetas.');
         const valid=new Set(mini.tarjetas.map(v=>v.id)); const groups={};
         for(const id of valid) { if(!['safe','danger'].includes(data.groups[id])) throw error('Clasificá todas las tarjetas.'); groups[id]=data.groups[id]; }
         if(Object.keys(data.groups).some(id=>!valid.has(id))) throw error('La tarjeta no es válida.');
         answer.mini={groups,scored:false};
       }
       if(kind==='seleccionar') {
         if(!Array.isArray(data.selections)) throw error('Seleccioná las tarjetas que correspondan.');
         const valid=new Set(mini.opciones.map(v=>v.id)); const selections=data.selections.map(String);
         if(new Set(selections).size!==selections.length || selections.some(id=>!valid.has(id))) throw error('La selección no es válida.');
         answer.mini={selections,scored:false};
       }
       if(kind==='conectar') {
         if(!data.matches || typeof data.matches!=='object' || Array.isArray(data.matches)) throw error('Conectá cada situación con una acción.');
         const validSituations=new Set(mini.situaciones.map(v=>v.id)); const validActions=new Set(mini.acciones.map(v=>v.id));
         const matches={};
         for(const id of validSituations) {
           if(!validActions.has(data.matches[id])) throw error('Conectá todas las situaciones con una acción válida.');
           matches[id]=data.matches[id];
         }
         if(Object.keys(data.matches).some(id=>!validSituations.has(id))) throw error('La situación no es válida.');
         answer.mini={matches,scored:false};
       }
     }
     touch(room);room.submissions[p.id]=answer;push(room);return json(res,{ok:true});
   }
   if(req.method==='GET') return sendStatic(req,res,u);
   throw error('Método no permitido.',405);
 }catch(e){if(!res.headersSent) respondError(res,e);else {try{res.end();}catch(_){}}}
});
setInterval(()=>{
  for(const r of rooms.values()) if(['detect','decide','mini'].includes(r.stage)&&r.endsAt&&Date.now()>=r.endsAt) {advance(r);push(r);}
},200).unref();
setInterval(()=>{for(const r of rooms.values()) for(const c of r.clients) {try{c.res.write(': latido\n\n');}catch(_){r.clients.delete(c);}}},15000).unref();
setInterval(()=>{const now=Date.now();for(const r of rooms.values()) if(now-r.lastActivity>ROOM_IDLE_MS) closeRoom(r); for(const [ip,info] of rateWindow) if(info.until<now) rateWindow.delete(ip);},60000).unref();
server.listen(PORT,HOST,()=>{
  console.log('\n========================================');
  console.log('    🕵️  DETECTIVES DIGITALES');
  console.log('========================================');
  console.log(`Organizador: http://localhost:${PORT}/organizador`);
  addresses().forEach(a=>console.log(`Celulares (${a.interfaz}): http://${a.ip}:${PORT}/jugar${a.virtual?'   <- red virtual: los celulares no la ven':''}`));
  console.log(`Manual de usuario: http://localhost:${PORT}/manual`);
  console.log('Modo local: los celulares deben compartir la red Wi-Fi.');
  console.log('Modo web: accedé por la URL HTTPS proporcionada por el hosting.');
  console.log('Para detener: Ctrl+C\n');
  if(process.platform==='win32'&&process.env.NO_BROWSER!=='1') {
    setTimeout(()=>require('node:child_process').exec(`start "" "http://localhost:${PORT}/organizador"`),600);
  }
});
server.on('error',e=>{console.error('No se pudo iniciar el servidor:',e.message);process.exit(1);});

function terminate(){ for(const r of rooms.values()) closeRoom(r); server.close(()=>process.exit(0)); setTimeout(()=>process.exit(1),5000).unref(); }
process.on('SIGINT',terminate);process.on('SIGTERM',terminate);
