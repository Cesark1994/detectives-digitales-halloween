'use strict';
const HOST_MODE=location.pathname==='/organizador';
const LOCAL_HOST=['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname);
const ONLINE=location.protocol==='https:';

const app=document.getElementById('app');
const toastNode=document.getElementById('toast');
const query=new URLSearchParams(location.search);
const avatars=['🕵️','🦊','👻','🎃','🦇','🐈','🦉','🧙'];
let session=null,live=null,current=null,network=[],selectedIP='',busy=false,selectedAvatar='🕵️';
let draftDetect=[],draftDecide='',draftMini={},draftCase=-1,draftStage='';
let clockOffset=0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stageNames={lobby:'Sala de espera',detect:'ETAPA 1 · DETECTAR',detect_reveal:'REVELACIÓN · SEÑALES',decide:'ETAPA 2 · DECIDIR',decide_reveal:'REVELACIÓN · DECISIÓN',leaderboard:'TABLERO DE INVESTIGADORES',final:'MEJORES INVESTIGADORES'};
const buttonNext={lobby:'▶ Iniciar investigación',detect:'⏭ Cerrar detección',detect_reveal:'🧠 Pasar a decidir',decide:'⏭ Cerrar decisión',decide_reveal:'🏆 Mostrar ranking',leaderboard:'➡ Siguiente caso',final:'↻ Volver a comenzar'};
Object.assign(stageNames,{mini:'MINI JUEGO',mini_reveal:'RESULTADO DEL MINI JUEGO'});
Object.assign(buttonNext,{decide_reveal:'✨ Abrir mini juego',mini:'⏭ Ver resultado',mini_reveal:'🏆 Mostrar ranking'});
function toast(message){toastNode.textContent=message;toastNode.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>toastNode.classList.remove('show'),3700)}
async function api(url,payload=null){
  const options=payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{};
  let r;try{r=await fetch(url,options)}catch(e){throw new Error('Sin conexión con el servidor. Verificá la red e intentá nuevamente.');}
  let data;try{data=await r.json()}catch(e){throw new Error('Respuesta inesperada del servidor.');}
  if(!r.ok)throw new Error(data.error||'Ocurrió un error.');return data;
}
function brand(){return `<header class="top"><div class="brand"><div class="brand-icon">🎃</div><div><div class="brand-kicker">Noche de Halloween · Pensar · Analizar · Proteger</div><h1>DETECTIVES <span>DIGITALES</span></h1></div></div><div class="pills"><span class="pill">🦇 Especial Halloween</span>${session?`<span class="pill highlight">SALA ${esc(session.code)}</span>`:''}</div></header>`}
function footer(){return `<footer class="footer">🎃 Detectives Digitales · Noches seguras en Internet · ${ONLINE?'Juego web seguro por HTTPS':'Juego local por Wi-Fi o red interna'}</footer>`}
function show(content){app.className='app'+(HOST_MODE?'':' mobile');app.innerHTML=brand()+content+footer();updateTimers()}
function stateSaved(){try{const data=localStorage.getItem(HOST_MODE?'dd_host':'dd_player');return data?JSON.parse(data):null}catch(_){return null}}
function saveSession(s){session=s;localStorage.setItem(HOST_MODE?'dd_host':'dd_player',JSON.stringify(s))}
function clearSession(){if(live){live.close();live=null}session=null;current=null;localStorage.removeItem(HOST_MODE?'dd_host':'dd_player')}
function connect(){
  if(live)live.close();if(!session)return;
  const params=new URLSearchParams({codigo:session.code,token:session.token});
  live=new EventSource('/api/eventos?'+params.toString());
  live.addEventListener('update',event=>{
    try{
      const state=JSON.parse(event.data);
      const changed=!current||current.caseIndex!==state.caseIndex||current.stage!==state.stage;
      if(changed && ['detect','decide','mini'].includes(state.stage)){draftCase=state.caseIndex;draftStage=state.stage;draftDetect=[];draftDecide='';draftMini={};}
      current=state;clockOffset=state.serverNow-Date.now();render();
    }catch(e){console.error('Estado inválido',e)}
  });
  live.onerror=()=>{const badge=document.getElementById('connection');if(badge)badge.textContent='⚠ Reconectando…'};
}
function progress(s){return `<div class="progress"><div style="width:${s.players.length?Math.round(100*s.submitted/s.players.length):0}%"></div></div><div class="dim">${s.submitted} de ${s.players.length} investigadores respondieron</div>`}
function caseView(c,compact=false){return `<article class="case-card ${compact?'compact':''}"><span class="case-tag">EXPEDIENTE ${String((current?.caseIndex||0)+1).padStart(2,'0')} · NOCHE DE HALLOWEEN</span><h2>${esc(c.titulo)}</h2><div class="evidence">${esc(c.personaje)} · ${esc(c.categoria)}</div><p>${esc(c.relato)}</p>${compact?'':'<div class="case-sticker">🎃 🦇 🔎</div>'}</article>`}
function countdown(){return `<div class="timer" data-timer>⏱ 00:30</div>`}
function secondsRemaining(){return !current?.endsAt?0:Math.max(0,Math.ceil((current.endsAt-(Date.now()+clockOffset))/1000))}
function updateTimers(){
  const sec=secondsRemaining();let label=`00:${String(sec).padStart(2,'0')}`;
  for(const el of document.querySelectorAll('[data-timer]')){el.textContent='⏱ '+label;el.classList.toggle('urgent',sec<=8)}
  for(const b of document.querySelectorAll('[data-answer-submit]'))b.disabled=sec<=0||busy;
}
setInterval(updateTimers,250);
function rankRows(s){return `<div class="rank">${s.ranking.map((p,i)=>`<div class="rank-row ${i===0?'toprank':''}"><div class="rank-num">${['🥇','🥈','🥉'][i]||('#'+(i+1))}</div><div class="rank-name">${esc(p.avatar)} ${esc(p.name)}</div><div class="rank-points">${p.score} pts</div></div>`).join('')}</div>`}
function podium(s){const arr=[s.ranking[1],s.ranking[0],s.ranking[2]];return `<div class="podium">${arr.map((p,i)=>p?`<div class="podium-place ${['second','first','third'][i]}"><div class="podium-face">${esc(p.avatar)}</div><div class="podium-name">${esc(p.name)}</div><div class="podium-score">${p.score} pts</div><div class="podium-block">${[2,1,3][i]}</div></div>`:'').join('')}</div>`}
function signalList(c,reveal){return `<div class="signal-list">${c.pistas.map(p=>`<div class="signal ${reveal?(p.correcta?'good':'bad'):''}"><span class="signal-icon">${esc(p.icono)}</span><span>${esc(p.texto)}</span>${reveal?`<b class="mark">${p.correcta?'✓':'×'}</b>`:''}</div>`).join('')}</div>`}
function answerList(c,reveal){return `<div class="answers">${c.opciones.map(o=>`<div class="answer ${reveal&&o.id===c.respuesta?'correct':''}"><b>${esc(o.id.toUpperCase())}.</b> ${esc(o.texto)} ${reveal&&o.id===c.respuesta?' ✅':''}</div>`).join('')}</div>`}
function miniList(m){const cards=m.opciones||m.pasos||m.tarjetas||[];return `<div class="mini-preview">${cards.map(v=>`<div class="mini-preview-card"><span>${esc(v.icono)}</span><b>${esc(v.texto)}</b></div>`).join('')}</div>`}
function miniResult(m){
 if(m.tipo==='tocar'){const item=m.opciones.find(v=>v.id===m.respuesta);return item?`<div class="mini-result">${esc(item.icono)} ${esc(item.texto)}</div>`:''}
 if(m.tipo==='ordenar')return `<div class="mini-result">${m.ordenCorrecto.map((id,i)=>{const item=m.pasos.find(v=>v.id===id);return `<span>${i+1}. ${esc(item?.icono)} ${esc(item?.texto)}</span>`}).join('')}</div>`;
 return `<div class="mini-result">${m.tarjetas.map(v=>`<span>${esc(v.icono)} ${esc(v.texto)} ${m.clasificacion[v.id]==='safe'?'🛡️':'👻'}</span>`).join('')}</div>`;
}
function renderHost(){
  const s=current;
  if(!s){renderHostCreate();return}
  if(s.stage==='lobby'){
    const address=LOCAL_HOST?`${location.protocol}//${selectedIP||location.hostname}:${location.port||3000}/jugar?codigo=${encodeURIComponent(s.code)}`:`${location.origin}/jugar?codigo=${encodeURIComponent(s.code)}`;
    const opts=network.length?network.map(n=>`<option value="${esc(n.ip)}" ${n.ip===selectedIP?'selected':''}>${esc(n.ip)} · ${esc(n.interfaz)}</option>`).join(''):`<option value="${esc(location.hostname)}">${esc(location.hostname)}</option>`;
    const networkControl=LOCAL_HOST?`<div class="label">Red Wi-Fi del organizador</div><select id="lan-ip" class="field" aria-label="Elegir dirección de la red">${opts}</select><p class="help">Elegí la IP de la red Wi-Fi compartida. Si no abre, verificá el firewall.</p><button class="button ghost btn-small" id="refresh-ips">↻ Buscar redes</button>`:`<p class="help">🌐 Acceso web: los jugadores pueden entrar desde cualquier conexión a Internet.</p>`;
    const missingPlayers=Math.max(0,1-s.players.length);
    show(`<div class="grid"><section class="panel span-7 text-center halloween-lobby"><div class="eyebrow">La noche de investigación está por comenzar</div><h2>Ingresá a la mansión digital</h2><p class="table-intro">Compartí este código o proyectá el QR. Los jugadores ingresan desde sus celulares.</p><div class="lobby-code">${esc(s.code)}</div><div><div class="qr-frame"><img src="/api/qr?texto=${encodeURIComponent(address)}" alt="Código QR de ingreso a la sala ${esc(s.code)}"></div></div>${networkControl}<div class="join-url" id="join-url">${esc(address)}</div><div class="tools gap-top" style="justify-content:center"><button class="button ghost btn-small" id="copy-link">📋 Copiar enlace</button><button class="button ghost btn-small" id="fullscreen">⛶ Pantalla completa</button></div></section><section class="panel span-5"><div class="eyebrow">Investigadores conectados</div><h2>${s.players.length} <span class="dim">/ ${s.maxPlayers}</span></h2><p class="help">La investigación puede comenzar con <b>1 jugador o más</b>. ${missingPlayers?'Falta 1 detective para abrir las puertas del misterio.':''}</p><div class="roster">${[...s.players,...Array.from({length:Math.max(0,s.maxPlayers-s.players.length)},()=>null)].map(p=>p?`<div class="roster-item"><span class="av">${esc(p.avatar)}</span><b>${esc(p.name)}</b></div>`:`<div class="roster-item wait">🎃 Lugar embrujado libre</div>`).join('')}</div><div class="muted-rule"></div><button id="next" class="button orange full" ${s.players.length<1?'disabled':''}>${buttonNext.lobby}</button><p class="help">⚠ Mantené abierto el panel del organizador. Si el servidor se reinicia, las salas se pierden.</p><button class="button ghost btn-small" id="close-room">✕ Cerrar esta sala</button></section></div>`);
    const lanSelect=document.getElementById('lan-ip');if(lanSelect)lanSelect.onchange=e=>{selectedIP=e.target.value;render()};
    const refreshBtn=document.getElementById('refresh-ips');if(refreshBtn)refreshBtn.onclick=refreshNetwork;
    document.getElementById('fullscreen').onclick=toggleFullscreen;
    document.getElementById('close-room').onclick=closeCurrentRoom;
    document.getElementById('copy-link').onclick=()=>copy(address);
    document.getElementById('next').onclick=()=>hostAction('next');return;
  }
  const c=s.case,active=['detect','decide','mini'].includes(s.stage),revealDetect=['detect_reveal'].includes(s.stage),revealDecide=['decide_reveal'].includes(s.stage);
  let left='',right='';
  if(s.stage==='detect') {left=caseView(c);right=`<div class="eyebrow">Los investigadores están analizando</div><h3>🔎 Buscá las señales de alerta</h3><p class="dim">En cada celular aparecen las posibles señales. Al terminar el tiempo se revelan las respuestas.</p>${progress(s)}<div class="notice">Detectar: +100 por cada señal acertada, −100 por cada falsa señal elegida.</div>`;}
  if(s.stage==='detect_reveal'){left=caseView(c,true);right=`<h3>🔎 Señales correctas</h3>${signalList(c,true)}`;}
  if(s.stage==='decide'){left=caseView(c,true);right=`<div class="eyebrow">Tomar una decisión segura</div><h3>${esc(c.pregunta)}</h3>${answerList(c,false)}${progress(s)}`;}
  if(s.stage==='decide_reveal'){left=caseView(c,true);right=`<h3>🧠 Decisión correcta</h3>${answerList(c,true)}<p class="subtle-note">${esc(c.explicacion)}</p>`;}
  if(s.stage==='mini'){left=caseView(c,true);right=`<div class="eyebrow">Mini juego · +300 puntos</div><h3>${esc(c.miniJuego.titulo)}</h3><p class="dim">${esc(c.miniJuego.instruccion)}</p>${miniList(c.miniJuego)}${progress(s)}`;}
  if(s.stage==='mini_reveal'){left=caseView(c,true);right=`<div class="eyebrow">Mini juego · resultado</div><h3>${esc(c.miniJuego.titulo)}</h3>${miniResult(c.miniJuego)}<p class="subtle-note">${esc(c.miniJuego.explicacion)}</p>`;}
  if(s.stage==='leaderboard'||s.stage==='final'){
    const isFinal=s.stage==='final';
    show(`<section class="panel text-center"><div class="eyebrow">${isFinal?'Misión completada':'Clasificación actualizada'}</div><h2>${isFinal?'🏆 MEJORES INVESTIGADORES':'🏅 Tablero de investigadores'}</h2><p class="dim">${isFinal?'Así termina la investigación. ¡Cada respuesta segura suma aprendizaje!':`Resultados tras el caso ${s.caseIndex+1} de ${s.totalCases}`}</p>${isFinal?podium(s):''}<div style="max-width:700px;margin:23px auto">${rankRows(s)}</div><div class="tools" style="justify-content:center;margin-bottom:15px"><button class="button ghost btn-small" id="export-csv">↓ Descargar ranking CSV</button><button class="button ghost btn-small" id="fullscreen">⛶ Pantalla completa</button><button class="button ghost btn-small" id="close-room">✕ Cerrar sala</button></div><button class="button orange" id="next">${isFinal?buttonNext.final:(s.caseIndex+1===s.totalCases?'🏆 Mostrar ganadores':buttonNext.leaderboard)}</button></section>`);
    document.getElementById('next').onclick=()=>hostAction(isFinal?'reset':'next');
    document.getElementById('export-csv').onclick=exportRanking;
    document.getElementById('fullscreen').onclick=toggleFullscreen;
    document.getElementById('close-room').onclick=closeCurrentRoom;return;
  }
  const stage=stageNames[s.stage];
  show(`<div class="stagebar"><span class="stage-label">${esc(stage)} · <em>CASO ${s.caseIndex+1}/${s.totalCases}</em></span>${active?countdown():`<span class="pill highlight">🔍 Evidencias reveladas</span>`}</div><div class="screen"><div>${left}</div><section class="panel">${right}<div class="muted-rule"></div><div class="row between"><span class="pill">👥 ${s.players.length} jugadores</span><div class="tools"><button class="button ghost btn-small" id="fullscreen">⛶</button><button class="button orange" id="next">${buttonNext[s.stage]}</button></div></div></section></div>`);
  document.getElementById('next').onclick=()=>hostAction('next');
  document.getElementById('fullscreen').onclick=toggleFullscreen;
}
function renderHostCreate(){
  show(`<section class="panel central halloween-lobby"><span class="intro-icon">🎃</span><div class="eyebrow">Panel del organizador · Especial Halloween</div><h2>¿Listos para resolver el misterio?</h2><p class="intro">Creá una sala, compartí el QR y proyectá esta pantalla. La investigación puede comenzar con <b>1 detective o más</b>.</p><label class="label" for="max-players">Máximo de jugadores</label><select id="max-players" class="field" style="max-width:240px;margin:auto"><option value="6" selected>6 participantes</option><option value="10">10 participantes</option><option value="15">15 participantes</option><option value="20">20 participantes</option><option value="30">30 participantes</option></select><div class="gap-top"><button class="button orange" id="create">🎃 Crear sala embrujada</button></div><p class="help">3 casos de prueba · 30 segundos para detectar · 20 segundos para decidir · Ranking en vivo</p><div class="instruction-box"><span class="offline">● ${ONLINE?'Acceso web multijugador':'Funciona sin Internet en Wi-Fi local'}</span><br><span class="help">${ONLINE?'Este servidor web conecta a todos los jugadores. Se necesita Internet para jugar.':'El servidor funciona en esta computadora; compartí el mismo Wi-Fi con los jugadores.'}</span></div></section>`);
  document.getElementById('create').onclick=async()=>{
    if(busy)return;busy=true;
    try{const maxPlayers=Number(document.getElementById('max-players').value);const r=await api('/api/crear',{maxPlayers});saveSession({code:r.code,token:r.hostToken});connect();}
    catch(e){toast(e.message)}finally{busy=false}
  };
}
async function refreshNetwork(){if(!LOCAL_HOST)return;try{const r=await api('/api/red');network=r.ips||[];if(!network.some(n=>n.ip===selectedIP))selectedIP=network[0]?.ip||location.hostname;render()}catch(e){toast(e.message)}}
async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch(e){toast('El navegador no permitió pantalla completa.')}}
async function closeCurrentRoom(){if(!session||!confirm('¿Cerrar esta sala? Se perderán los resultados y los jugadores tendrán que ingresar de nuevo.'))return;try{await api('/api/accion',{code:session.code,token:session.token,action:'close'});clearSession();renderHostCreate()}catch(e){toast(e.message)}}
function exportRanking(){if(!current?.ranking)return;const csv=[['Posición','Investigador','Puntos'],...current.ranking.map((p,i)=>[i+1,p.name,p.score])].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\r\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`Detectives_Ranking_${current.code}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
async function hostAction(action){if(busy||!session)return;busy=true;try{await api('/api/accion',{code:session.code,token:session.token,action})}catch(e){toast(e.message)}finally{busy=false}}
function copy(value){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(value).then(()=>toast('Enlace copiado')).catch(()=>window.prompt('Copiá el enlace:',value))}else window.prompt('Copiá el enlace:',value)}
function renderPlayerJoin(){
 const code=query.get('codigo')||'';
 show(`<section class="panel central"><span class="intro-icon">🔍</span><div class="eyebrow">Conviertete en investigador</div><h2>Tu misión comienza aquí</h2><p class="intro">Descubrí las señales de alerta y elegí la decisión más segura. ¡Cada respuesta cuenta!</p><form id="join-form" style="max-width:370px;margin:20px auto;text-align:left"><label class="label" for="room-code">Código de sala</label><input class="field" id="room-code" maxlength="4" pattern="[a-zA-Z0-9]{4}" value="${esc(code)}" placeholder="Ej.: 7K3M" autocapitalize="characters" required><label class="label" for="nickname">Nombre del investigador</label><input class="field" id="nickname" maxlength="22" minlength="2" placeholder="Tu apodo o nombre" autocomplete="nickname" required><label class="label">Elegí tu avatar</label><div class="avatar-picker">${avatars.map(a=>`<button class="avatar-choice ${a===selectedAvatar?'selected':''}" type="button" data-avatar="${esc(a)}" aria-label="Avatar ${esc(a)}">${esc(a)}</button>`).join('')}</div><div class="gap-top"><button type="submit" class="button orange full" id="join-submit">🚀 Ingresar a la sala</button></div></form><p class="help">${ONLINE?'🌐 Necesitás conexión a Internet para participar.':'📶 Si jugás en modo local, conectate al mismo Wi-Fi que el organizador.'}</p>${!code?'<p class="help">¿Organizás la actividad? <a href="/organizador" class="organizer-link">Abrir panel del organizador</a></p>':''}</section>`);
 document.querySelectorAll('[data-avatar]').forEach(b=>b.onclick=()=>{selectedAvatar=b.dataset.avatar;document.querySelectorAll('[data-avatar]').forEach(x=>x.classList.toggle('selected',x===b))});
 document.getElementById('join-form').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;let b=document.getElementById('join-submit');b.disabled=true;
   try{const code=document.getElementById('room-code').value.trim().toUpperCase();const name=document.getElementById('nickname').value.trim();const r=await api('/api/ingresar',{code,name,avatar:selectedAvatar});saveSession({code:r.code,token:r.token});history.replaceState({},'',`/jugar?codigo=${encodeURIComponent(r.code)}`);connect()}
   catch(e){toast(e.message);b.disabled=false}finally{busy=false}
 };
}
function stateAnswerFor(stage){return current.personal?.answers?.[stage]||null}
function initDraft(){
 if(current.caseIndex!==draftCase||current.stage!==draftStage){draftCase=current.caseIndex;draftStage=current.stage;draftDetect=[];draftDecide='';draftMini={}}
 const sub=stateAnswerFor(current.stage);
 if(sub){
   if(current.stage==='detect')draftDetect=[...sub.selections];
   if(current.stage==='decide')draftDecide=sub.selection;
   if(current.stage==='mini')draftMini=sub.selection?{selection:sub.selection}:sub.sequence?{sequence:[...sub.sequence]}:{groups:{...sub.groups}};
 }
}
function renderPlayer(){
 const s=current;if(!s){renderPlayerJoin();return}
 const me=s.personal,c=s.case;
 const status=`<div class="row between"><span class="pill">${esc(me.avatar)} ${esc(me.name)}</span><span class="pill highlight">⭐ ${me.score} pts</span></div>`;
 if(s.stage==='mini_reveal'){
  const sub=stateAnswerFor('mini'),m=c.miniJuego;
  show(`${status}<section class="panel gap-top mini-panel"><div class="eyebrow">Mini juego · resultado</div><h2>${esc(m.titulo)}</h2>${miniResult(m)}<div class="feedback ${sub?'':'warning'}">${sub?'✨ ¡Reto registrado!':'⏱ Esta vez no llegaste a jugar.'}</div><p>${esc(m.explicacion)}</p></section>`);return;
 }
 if(s.stage==='lobby'){
   show(`<section class="panel text-center"><div class="eyebrow">Sala ${esc(s.code)}</div><span class="intro-icon">${esc(me.avatar)}</span><h2>¡Bienvenido, ${esc(me.name)}!</h2><p>Tu investigación está a punto de comenzar.</p><div class="row" style="justify-content:center"><span class="pill">👥 ${s.players.length} / ${s.maxPlayers}</span><span class="pill">📚 ${s.totalCases} casos</span></div><div class="muted-rule"></div><div class="spinner"></div><h3>Esperando al organizador...</h3><p class="dim">No cierres esta pestaña. La partida comenzará automáticamente.</p><p class="subtle-note">🧠 Primero detectarás señales de alerta. Después elegirás qué harías en cada situación.</p></section>`);return;
 }
 if(s.stage==='detect'){
   initDraft();const sub=stateAnswerFor('detect');
   show(`${status}<div class="gap-top row between"><span class="stage-label">🔎 DETECTAR · ${s.caseIndex+1}/${s.totalCases}</span>${countdown()}</div><div class="gap-top">${caseView(c,true)}</div><section class="panel gap-top"><div class="eyebrow">Seleccioná todas las señales presentes</div><h3>¿Qué cosas te parecen sospechosas?</h3><div id="detect-choices">${c.pistas.map(p=>`<label class="choice ${draftDetect.includes(p.id)?'selected':''}"><input type="checkbox" name="pista" value="${esc(p.id)}" ${draftDetect.includes(p.id)?'checked':''} ${sub?'disabled':''}><span class="glyph">${esc(p.icono)}</span><span>${esc(p.texto)}</span></label>`).join('')}</div>${sub?'<div class="feedback">✅ Respuesta registrada. Esperá que termine el tiempo.</div>':`<button class="button orange full gap-top" data-answer-submit id="submit-detect">✓ Confirmar selección</button>`}<p class="help">✔ +100 por acierto · −100 por señal incorrecta. Podés elegir varias respuestas.</p></section>`);
   document.querySelectorAll('input[name=pista]').forEach(e=>e.onchange=()=>{draftDetect=[...document.querySelectorAll('input[name=pista]:checked')].map(v=>v.value);document.querySelectorAll('.choice').forEach(l=>l.classList.toggle('selected',!!l.querySelector('input:checked')))});
   const b=document.getElementById('submit-detect');if(b)b.onclick=async()=>{try{await answer({stage:'detect',selections:draftDetect})}catch(e){toast(e.message)}};
   return;
 }
 if(s.stage==='decide'){
   initDraft();const sub=stateAnswerFor('decide');
   show(`${status}<div class="gap-top row between"><span class="stage-label">🧠 DECIDIR · ${s.caseIndex+1}/${s.totalCases}</span>${countdown()}</div><div class="gap-top">${caseView(c,true)}</div><section class="panel gap-top"><h3>${esc(c.pregunta)}</h3><div id="decide-choices">${c.opciones.map(o=>`<label class="choice ${draftDecide===o.id?'selected':''}"><input type="radio" name="decision" value="${esc(o.id)}" ${draftDecide===o.id?'checked':''} ${sub?'disabled':''}><span class="letter">${esc(o.id.toUpperCase())}</span><span>${esc(o.texto)}</span></label>`).join('')}</div>${sub?'<div class="feedback">✅ Decisión registrada. Esperá el resultado.</div>':`<button class="button orange full gap-top" data-answer-submit id="submit-decide">✓ Confirmar decisión</button>`}<p class="help">✔ Decisión correcta: +500 puntos · Incorrecta: −500 puntos.</p></section>`);
   document.querySelectorAll('input[name=decision]').forEach(e=>e.onchange=()=>{draftDecide=e.value;document.querySelectorAll('.choice').forEach(l=>l.classList.toggle('selected',!!l.querySelector('input:checked')))});
   const b=document.getElementById('submit-decide');if(b)b.onclick=async()=>{if(!draftDecide)return toast('Tocá una de las dos tarjetas.');try{await answer({stage:'decide',selection:draftDecide})}catch(e){toast(e.message)}};
   return;
 }
  if(s.stage==='mini'){
   initDraft();const sub=stateAnswerFor('mini'),m=c.miniJuego;
   let game='';
   if(m.tipo==='tocar'){
    const selected=draftMini.selection||'';
    game=`<div class="mini-game-grid">${m.opciones.map(o=>`<button class="mini-card ${selected===o.id?'selected':''}" type="button" data-mini-tap="${esc(o.id)}" ${sub?'disabled':''}><span>${esc(o.icono)}</span><b>${esc(o.texto)}</b></button>`).join('')}</div>`;
   }
   if(m.tipo==='ordenar'){
    const sequence=draftMini.sequence||[];
    game=`<div class="mini-order-slots">${sequence.length?sequence.map((id,i)=>{const p=m.pasos.find(v=>v.id===id);return `<span>${i+1}. ${esc(p?.icono)} ${esc(p?.texto)}</span>`}).join(''):'<span class="empty-slot">Tocá las tarjetas</span>'}</div><div class="mini-game-grid">${m.pasos.map(p=>`<button class="mini-card ${sequence.includes(p.id)?'selected':''}" type="button" data-mini-step="${esc(p.id)}" ${sub||sequence.includes(p.id)?'disabled':''}><span>${esc(p.icono)}</span><b>${esc(p.texto)}</b></button>`).join('')}</div>${sub?'':`<button class="button ghost btn-small gap-top" type="button" id="mini-undo" ${!sequence.length?'disabled':''}>↩ Deshacer</button>`}`;
   }
   if(m.tipo==='clasificar'){
    const groups=draftMini.groups||{};
    game=`<div class="mini-sort-help"><span>🛡️ Seguro</span><span>👻 Susto</span></div><div class="mini-game-grid">${m.tarjetas.map(card=>{const group=groups[card.id]||'';return `<button class="mini-card sort-card ${group}" type="button" data-mini-sort="${esc(card.id)}" ${sub?'disabled':''}><span>${esc(card.icono)}</span><b>${esc(card.texto)}</b><em>${group==='safe'?'🛡️':group==='danger'?'👻':'❔'}</em></button>`}).join('')}</div>`;
   }
   const submitted=sub?'<div class="feedback">✅ Mini juego listo. Esperá el resultado.</div>':`<button class="button orange full gap-top" data-answer-submit id="submit-mini">✨ ¡Listo!</button>`;
   show(`${status}<div class="gap-top row between"><span class="stage-label">🎃 MINI JUEGO · ${s.caseIndex+1}/${s.totalCases}</span>${countdown()}</div><section class="panel gap-top mini-panel"><div class="eyebrow">+300 puntos</div><h2>${esc(m.titulo)}</h2><p class="mini-instruction">${esc(m.instruccion)}</p>${game}${submitted}</section>`);
   if(!sub){
    document.querySelectorAll('[data-mini-tap]').forEach(b=>b.onclick=()=>{draftMini={selection:b.dataset.miniTap};render()});
    document.querySelectorAll('[data-mini-step]').forEach(b=>b.onclick=()=>{const sequence=[...(draftMini.sequence||[])];if(!sequence.includes(b.dataset.miniStep))sequence.push(b.dataset.miniStep);draftMini={sequence};render()});
    const undo=document.getElementById('mini-undo');if(undo)undo.onclick=()=>{draftMini={sequence:(draftMini.sequence||[]).slice(0,-1)};render()};
    document.querySelectorAll('[data-mini-sort]').forEach(b=>b.onclick=()=>{const groups={...(draftMini.groups||{})};const id=b.dataset.miniSort;const next={undefined:'safe',safe:'danger',danger:undefined}[String(groups[id])];if(next)groups[id]=next;else delete groups[id];draftMini={groups};render()});
    const submit=document.getElementById('submit-mini');if(submit)submit.onclick=async()=>{
      let payload={stage:'mini'};
      if(m.tipo==='tocar'){if(!draftMini.selection)return toast('Tocá una tarjeta.');payload.selection=draftMini.selection;}
      if(m.tipo==='ordenar'){if((draftMini.sequence||[]).length!==m.pasos.length)return toast('Tocá los tres pasos.');payload.sequence=draftMini.sequence;}
      if(m.tipo==='clasificar'){if(m.tarjetas.some(card=>!draftMini.groups?.[card.id]))return toast('Tocá todas las tarjetas.');payload.groups=draftMini.groups;}
      try{await answer(payload)}catch(e){toast(e.message)}
    };
   }
   return;
  }
  if(s.stage==='detect_reveal'){
   show(`${status}<section class="panel gap-top"><div class="eyebrow">Caso ${s.caseIndex+1} · Resultado</div><h2>🔍 Señales descubiertas</h2>${signalList(c,true)}<p class="help">En verde aparecen las señales que efectivamente estaban en el caso.</p><p class="subtle-note">El organizador iniciará la etapa de decisión.</p></section>`);return;
 }
 if(s.stage==='decide_reveal'){
   const sub=stateAnswerFor('decide');
   show(`${status}<section class="panel gap-top"><div class="eyebrow">Caso ${s.caseIndex+1} · La decisión correcta</div><h2>🧠 ¡Pensar antes de actuar!</h2>${answerList(c,true)}<div class="feedback ${sub&&sub.selection!==c.respuesta?'warning':''}">${sub?(sub.selection===c.respuesta?'✅ ¡Elegiste la respuesta más segura!':'💡 Revisá la respuesta segura y aprendé para el próximo caso.'):'⏱ No llegaste a responder esta etapa.'}</div><p>${esc(c.explicacion)}</p></section>`);return;
 }
 if(s.stage==='leaderboard'||s.stage==='final'){
  show(`<section class="panel text-center"><div class="eyebrow">${s.stage==='final'?'Misión completada':`Caso ${s.caseIndex+1} de ${s.totalCases}`}</div><h2>${s.stage==='final'?'🏆 Investigadores destacados':'🏅 Clasificación de la sala'}</h2>${s.stage==='final'?podium(s):''}${rankRows(s)}<p class="help gap-top">${s.stage==='final'?'Esperá al organizador para volver a jugar.':'El próximo caso comenzará desde la computadora del organizador.'}</p></section>`);return;
 }
}
async function answer(payload){if(busy||!session)return;busy=true;try{await api('/api/responder',{code:session.code,token:session.token,...payload})}finally{busy=false}}
function render(){HOST_MODE?renderHost():renderPlayer()}
async function boot(){
 session=stateSaved();
 if(HOST_MODE) await refreshNetwork();
 if(session){
   try{current=await api('/api/estado?'+new URLSearchParams({codigo:session.code,token:session.token}));clockOffset=current.serverNow-Date.now();render();connect()}
   catch(e){clearSession();render();toast('La sala anterior ya no está disponible. Creá o ingresá a una nueva.')}
 }else render();
}
boot();
