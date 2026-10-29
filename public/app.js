'use strict';

const HOST_MODE=location.pathname==='/organizador';
const LOCAL_HOST=['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname);
const ONLINE=location.protocol==='https:';
const app=document.getElementById('app'),toastNode=document.getElementById('toast');
const avatars=['🕵️','🦊','👻','🎃','🦇','🐈','🦉','🧙'];
const miniNames={tocar:'Encontrá la tarjeta',ordenar:'Ordená los pasos',clasificar:'Clasificá las pistas',seleccionar:'Armá tu equipo',conectar:'Conectá las ideas',atrapar:'Cazá los fantasmas',linterna:'Iluminá las pistas',pocion:'Prepará la poción',defender:'Defendé el castillo'};
const miniIcons={tocar:'🎯',ordenar:'🧩',clasificar:'🛡️',seleccionar:'🎒',conectar:'🔗',atrapar:'👻',linterna:'🔦',pocion:'🧪',defender:'🏰'};
// Arcade formats answer like a classic one, as MINI_KIND does on the server.
const miniKinds={pocion:'ordenar',atrapar:'seleccionar',linterna:'seleccionar',defender:'conectar'};
const childMiniTitles={tocar:'¡Encendé una calabaza!',clasificar:'¿Dulce o truco?',conectar:'Elegí qué hacer',ordenar:'¡Camino embrujado!',seleccionar:'¡Llená tu calabaza!',atrapar:'¡Cazafantasmas!',linterna:'¡Linterna detective!',pocion:'¡Poción mágica!',defender:'¡Defendé tu cuenta!'};
const rarities=[['comun','Común'],['rara','Rara'],['epica','Épica'],['legendaria','Legendaria']];
// Short synthesized effects as [frequency, seconds, glide-to] notes: no audio files to download.
// Minor arpeggios and ghostly glides keep them spooky but friendly.
const sounds={tap:[[523,.05]],pick:[[587,.05],[880,.08]],send:[[440,.07],[659,.13]],win:[[440,.09],[523,.09],[659,.09],[880,.26]],learn:[[392,.1],[466,.2]],pop:[[988,.04],[1319,.07]],zap:[[220,.05],[440,.05],[880,.1]],chest:[[330,.08],[392,.08],[466,.08],[587,.08],[932,.32]],whoosh:[[300,.3,620]],boo:[[540,.5,250]]};
const confettiPieces=['🍬','🎃','🦇','👻','🍭','⭐'];
const monsters=['👻','🦇','🧛'];
const stageNames={lobby:'Sala de espera',detect:'Buscá las pistas',detect_reveal:'Pistas descubiertas',decide:'Elegí qué harías',decide_reveal:'Una decisión segura',mini:'Desafío extra',mini_reveal:'Lo que aprendimos',leaderboard:'Nuestro equipo',final:'¡Aventura completada!'};
const buttonNext={lobby:'Empezar aventura →',detect:'Mostrar las pistas →',detect_reveal:'Vamos a decidir →',decide:'Mostrar respuesta →',decide_reveal:'Abrir minijuego →',mini:'Mostrar resultado →',mini_reveal:'Ver el ranking →',leaderboard:'Siguiente misión →',final:'Volver a jugar ↻'};
let session=null,live=null,current=null,catalog=null,network=[],selectedIP='',busy=false,selectedAvatar='🕵️',connectionState='';
let draftDetect=[],draftDecide='',draftMini={},draftCase=-1,draftStage='',clockOffset=0,screenKey='';
let childStepKey='',childStep=0,speechPlaying=false,scoreMark=null;
let soundOn=true,audio=null,arcade=null,lamp=null,roomFresh='',lastThreat='',castleBusy=false;
let setupValues={caseCount:'3',pace:'calm',maxPlayers:'6'};
let posterOpen=false,posterWifi='';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(message){toastNode.textContent=message;toastNode.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>toastNode.classList.remove('show'),4000)}
async function api(url,payload=null){
 const options=payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{};
 let response;try{response=await fetch(url,options)}catch(_){throw new Error('No pudimos conectar. Revisá Internet o la red Wi-Fi e intentá otra vez.')}
 let data;try{data=await response.json()}catch(_){throw new Error('El servidor no pudo responder. Intentá nuevamente en un momento.')}
 if(!response.ok)throw new Error(data.error||'No pudimos completar la acción.');return data;
}
function sfx(name){
 if(HOST_MODE||!soundOn)return;
 try{
  const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;
  audio=audio||new Context();if(audio.state==='suspended')audio.resume();
  let at=audio.currentTime;
  for(const [frequency,length,glide] of sounds[name]||[]){const osc=audio.createOscillator(),gain=audio.createGain();osc.type=glide?'sine':'triangle';osc.frequency.setValueAtTime(frequency,at);if(glide)osc.frequency.exponentialRampToValueAtTime(glide,at+length);gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.12,at+.01);gain.gain.exponentialRampToValueAtTime(.0001,at+length);osc.connect(gain).connect(audio.destination);osc.start(at);osc.stop(at+length+.02);at+=length*.85}
 }catch(_){}
 try{if(typeof navigator!=='undefined'&&navigator.vibrate&&name!=='tap')navigator.vibrate(['win','chest'].includes(name)?[18,40,18]:12)}catch(_){}
}
function listenLabel(playing){return HOST_MODE?'🔊 Escuchar':playing?'⏹':'🔊'}
function stopSpeech(){if('speechSynthesis' in window)window.speechSynthesis.cancel();speechPlaying=false;const button=document.getElementById('listen');if(button){button.textContent=listenLabel(false);button.setAttribute('aria-pressed','false')}}
function speechControls(text){
 if(!('speechSynthesis' in window)||typeof window.SpeechSynthesisUtterance!=='function')return '';
 if(!HOST_MODE)return `<button type="button" class="button ghost btn-small child-listen" id="listen" aria-label="${speechPlaying?'Detener lectura':'Escuchar consigna'}" aria-pressed="${speechPlaying}" data-speech="${esc(text)}">${listenLabel(speechPlaying)}</button>`;
 return `<div class="speech-controls"><button type="button" class="button ghost btn-small" id="listen" data-speech="${esc(text)}">🔊 Escuchar</button><button type="button" class="button ghost btn-small" id="stop-listening">■ Detener lectura</button></div>`;
}
function bindSpeech(){
 const listen=document.getElementById('listen'),stop=document.getElementById('stop-listening');
 if(listen)listen.onclick=()=>{try{if(!HOST_MODE&&speechPlaying){stopSpeech();return}stopSpeech();const utterance=new SpeechSynthesisUtterance(listen.dataset.speech);utterance.lang='es-AR';utterance.rate=.88;utterance.onend=utterance.onerror=()=>{speechPlaying=false;const button=document.getElementById('listen');if(button&&!HOST_MODE){button.textContent=listenLabel(false);button.setAttribute('aria-pressed','false')}};speechPlaying=true;if(!HOST_MODE){listen.textContent=listenLabel(true);listen.setAttribute('aria-pressed','true')}window.speechSynthesis.speak(utterance)}catch(_){stopSpeech();toast('Podés leer la consigna en pantalla.')}};
 if(stop)stop.onclick=stopSpeech;
}
function brand(){if(!HOST_MODE)return `<header class="top child-header"><span class="child-brand"><span aria-hidden="true">🎃</span><b>Detectives <em>digitales</em></b></span>${session?`<span class="connection ${connectionState==='reconnecting'?'reconnecting':''}" id="connection" role="status">${connectionState==='reconnecting'?'Reconectando…':'● En equipo'}</span>`:''}</header>`;return `<header class="top"><a class="brand" href="/organizador" aria-label="Detectives Digitales"><span class="brand-icon" aria-hidden="true">🎃</span><span><span class="brand-kicker">MISTERIOS EN LA NOCHE</span><h1>Detectives <span>Digitales</span><span class="brand-dot">.</span></h1></span></a><div class="header-right"><a class="manual-link" href="/manual" target="_blank" rel="noopener">📖 Manual</a>${session?`<span class="room-pill">Sala <b>${esc(session.code)}</b></span><span class="connection ${connectionState==='reconnecting'?'reconnecting':''}" id="connection" role="status">${connectionState==='reconnecting'?'Reconectando…':'● En equipo'}</span>`:'<span class="edition-pill">🦇 Especial Halloween</span>'}</div></header>`}
function footer(){return HOST_MODE?`<footer class="footer"><span>Hecho para aprender, investigar y cuidarnos. 🎃</span><span>Detectives Digitales · ${ONLINE?'Conectados desde cualquier lugar':'Aventura en tu red Wi-Fi'}</span></footer>`:''}
function show(content){
 // A confirmed answer counts as a new screen so the player sees the "sent" badge animate in.
 const sent=!HOST_MODE&&current&&stateAnswerFor(current.stage)?':sent':'';
 const nextKey=current?`${current.code}:${current.caseIndex}:${current.stage}${sent}`:(HOST_MODE?'setup':'join');
 const sameScreen=nextKey===screenKey,active=document.activeElement,focusId=sameScreen?active?.id:'';
 const selection=active&&typeof active.selectionStart==='number'?{start:active.selectionStart,end:active.selectionEnd}:null;
 const scroll={x:window.scrollX,y:window.scrollY};
 if(!sameScreen)stopSpeech();
 app.className=`app ${HOST_MODE?`host-app${current?' tv-live':''}`:'player-app'}${!HOST_MODE&&['detect','decide','mini'].includes(current?.stage)?' child-playing':!HOST_MODE&&current?.stage?.endsWith('_reveal')?' child-review':''}${sameScreen?'':' screen-enter'}`;
 app.innerHTML=brand()+content+footer()+(sameScreen?'':stageSplash());screenKey=nextKey;
 bindSpeech();updateTimers();
 if(sameScreen){
  const target=focusId?document.getElementById(focusId):null;
  if(target&&!target.disabled){target.focus({preventScroll:true});if(selection&&typeof target.setSelectionRange==='function')try{target.setSelectionRange(selection.start,selection.end)}catch(_){}}
  window.scrollTo(scroll.x,scroll.y);
 }else{
  window.scrollTo(0,0);
  const heading=app.querySelector('.child-task h2, .child-panel h2, .question-heading h2, .waiting-card h2, .ranking-panel h2, .question-panel h2, .lobby-players h2');
  if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true})}
  if(app.querySelector('.stage-splash'))sfx('boo');
 }
 return !sameScreen;
}
// Battle-style intro card when a mission or its minigame starts.
function stageSplash(){
 const s=current;if(!s?.case||stateAnswerFor(s.stage))return '';
 if(s.stage==='detect')return `<div class="stage-splash" aria-hidden="true"><span class="splash-kicker">Misión ${s.caseIndex+1} de ${s.totalCases}</span><span class="splash-icon">🔎</span><b>${esc(s.case.titulo)}</b><span class="splash-tag">${esc(s.case.categoria)}</span></div>`;
 if(s.stage==='mini'){const m=s.case.miniJuego;return `<div class="stage-splash splash-mini" aria-hidden="true"><span class="splash-kicker">¡Minijuego!</span><span class="splash-icon">${miniIcons[m.tipo]||'🎮'}</span><b>${esc(miniNames[m.tipo]||m.titulo)}</b><span class="splash-tag">+300 🍬</span></div>`}
 return '';
}
function stateSaved(){try{const value=localStorage.getItem(HOST_MODE?'dd_host':'dd_player');return value?JSON.parse(value):null}catch(_){return null}}
function saveSession(value){session=value;try{localStorage.setItem(HOST_MODE?'dd_host':'dd_player',JSON.stringify(value))}catch(_){toast('Mantené esta pestaña abierta para conservar tu acceso.')}}
function clearSession(){if(live){live.close();live=null}stopSpeech();session=null;current=null;connectionState='';try{localStorage.removeItem(HOST_MODE?'dd_host':'dd_player')}catch(_){}}
function updateConnection(){const badge=document.getElementById('connection');if(badge){badge.textContent=connectionState==='reconnecting'?'Reconectando…':'● En equipo';badge.classList.toggle('reconnecting',connectionState==='reconnecting')}}
function connect(){
 if(live)live.close();if(!session)return;
 connectionState='connecting';
 live=new EventSource('/api/eventos?'+new URLSearchParams({codigo:session.code,token:session.token}));
 live.onopen=()=>{connectionState='connected';updateConnection()};
 live.addEventListener('update',event=>{
  try{
   const incoming=JSON.parse(event.data),changed=!current||current.caseIndex!==incoming.caseIndex||current.stage!==incoming.stage;
   if(changed){stopSpeech();if(['detect','decide','mini'].includes(incoming.stage)){draftCase=incoming.caseIndex;draftStage=incoming.stage;draftDetect=[];draftDecide='';draftMini={};resetArcade()}}
   current=incoming;clockOffset=incoming.serverNow-Date.now();connectionState='connected';render();
  }catch(error){console.error('No se pudo leer la actualización de la sala.',error)}
 });
 live.onerror=()=>{connectionState='reconnecting';updateConnection()};
}
function formatDuration(ms){const seconds=Math.round(ms/1000);return seconds<60?`${seconds} s`:`${Math.floor(seconds/60)} min${seconds%60?' '+seconds%60+' s':''}`}
function heroArt(){return `<div class="hero-art" aria-hidden="true"><span class="orbit orbit-one"></span><span class="orbit orbit-two"></span><span class="art-star star-one">✦</span><span class="art-star star-two">🦇</span><div class="art-shield"><span>🕵️</span><b>✓</b></div><div class="floating-bubble bubble-lock">🔐</div><div class="floating-bubble bubble-game">🎃</div><div class="art-ticket">EXPEDIENTE<br><strong>El caso fantasma</strong><span> ✦ 🦇 ✦</span></div><div class="art-ghost">👻</div></div>`}
function setupDetails(){
 if(!catalog)return '<p class="help">Podés empezar con una aventura corta. Las misiones se cargarán al crear la sala.</p>';
 const count=setupValues.caseCount==='all'?catalog.caseCount:Math.min(Number(setupValues.caseCount),catalog.caseCount);
 const missions=(catalog.missions||[]).slice(0,count),types=new Set(missions.map(m=>m.tipo));
 const durations=catalog.paces?.[setupValues.pace];
 return `<p class="setup-summary"><b>${count} misiones</b>${types.size?` · ${types.size} formas de jugar`:''}</p>${durations?`<p class="help pace-summary">Buscar pistas: ${formatDuration(durations.detect)} · Decidir: ${formatDuration(durations.decide)} · Desafío: ${formatDuration(durations.mini)}</p>`:''}`;
}
function missionGallery(){
 if(!catalog?.missions?.length)return `<section class="missions-section"><div class="section-heading"><div><span class="section-kicker">UN MUNDO POR DESCUBRIR</span><h2>Historias para aprender jugando</h2></div></div><p class="help">Creá una sala para descubrir las misiones disponibles.</p></section>`;
 return `<section class="missions-section"><div class="section-heading"><div><span class="section-kicker">EXPLORÁ LAS MISIONES</span><h2>Cada desafío, un nuevo superpoder.</h2></div><span class="mission-total badge">${catalog.caseCount} aventuras para descubrir</span></div><div class="mission-grid">${catalog.missions.map((mission,i)=>`<article class="mission-card"><div class="mission-card-top"><div class="mission-art ${['lilac','mint','yellow','peach','blue'][i%5]}"><span class="emoji" aria-hidden="true">${miniIcons[mission.tipo]||'🔎'}</span></div><span class="mission-index">${String(i+1).padStart(2,'0')}</span></div><span class="eyebrow">${esc(mission.categoria)}</span><h3>${esc(mission.titulo)}</h3><div class="mission-type"><span class="emoji" aria-hidden="true">${miniIcons[mission.tipo]||'🔎'}</span>${esc(miniNames[mission.tipo]||'Desafío digital')}</div></article>`).join('')}</div></section>`;
}
function renderHostCreate(){
 const available=catalog?.caseCount;
 let counts=[3,6,9].filter(n=>available? n<=available:n===3);
 if(!counts.length)counts=[3];
 if(!counts.includes(Number(setupValues.caseCount)))setupValues.caseCount=String(counts[0]);
 const caseOptions=counts.map(n=>`<option value="${n}" ${setupValues.caseCount===String(n)?'selected':''}>${n} misiones${n===3?' · Aventura corta':n===6?' · A explorar':' · Experiencia completa'}</option>`).join('')+(available>9?'<option value="all">Todas las misiones</option>':'');
 show(`<section class="setup-grid"><div class="adventure-hero"><div class="hero-copy"><span class="hero-eyebrow hero-chip">✦ MISTERIOS. PISTAS. SUSTOS AMABLES.</span><h2>Pequeños detectives.<br><em>Grandes misterios.</em></h2><p class="hero-subtitle">Una aventura de Halloween para aprender a cuidarnos en Internet. Buscá pistas, resolvé minijuegos y vencé los sustos digitales.</p><div class="hero-facts"><span class="hero-fact"><b>🎃</b> Casos misteriosos</span><span class="hero-fact"><b>🧩</b> Minijuegos nuevos</span><span class="hero-fact"><b>🦇</b> ¡En equipo o en solitario!</span></div></div>${heroArt()}</div><section class="panel setup-panel"><span class="section-kicker">TU PRÓXIMA AVENTURA</span><h2>Armemos el equipo<span class="brand-dot">.</span></h2><p class="help">Elegí cómo quieren jugar. ¡Con un detective ya podemos empezar!</p><form id="setup-form" class="setup-form"><div class="setup-field"><label class="label" for="case-count">🗂️ ¿Cuántas misiones?</label><select class="field" id="case-count">${caseOptions}</select></div><div class="setup-field"><label class="label" for="pace">⏱️ El ritmo de la aventura</label><select class="field" id="pace"><option value="calm" ${setupValues.pace==='calm'?'selected':''}>🌱 Tranquilo</option><option value="classic" ${setupValues.pace==='classic'?'selected':''}>⚡ Clásico</option></select></div><div class="setup-field"><label class="label" for="max-players">👥 Tamaño del equipo</label><select class="field" id="max-players">${[1,6,10,15,20,30].map(n=>`<option value="${n}" ${setupValues.maxPlayers===String(n)?'selected':''}>${n===1?'1 detective · Individual':`Hasta ${n} detectives`}</option>`).join('')}</select></div><div class="setup-details" id="setup-details">${setupDetails()}</div><button class="button primary full" id="create" type="submit">Crear aventura <span aria-hidden="true">→</span></button></form><p class="setup-footnote"><span class="indicator"></span>${ONLINE?'Todos pueden sumarse desde cualquier lugar con Internet.':'En red local, conecten los celulares al mismo Wi-Fi.'}</p></section></section><div class="how-it-works"><span><b>01</b> Creá una sala</span><span><b>02</b> Compartí el QR</span><span><b>03</b> ¡A investigar!</span></div>${missionGallery()}`);
 for(const [id,key] of [['case-count','caseCount'],['pace','pace'],['max-players','maxPlayers']])document.getElementById(id).onchange=e=>{setupValues[key]=e.target.value;document.getElementById('setup-details').innerHTML=setupDetails()};
 document.getElementById('setup-form').onsubmit=async event=>{
  event.preventDefault();if(busy)return;busy=true;const button=document.getElementById('create');button.disabled=true;button.textContent='Preparando aventura…';
  try{const result=await api('/api/crear',{maxPlayers:Number(setupValues.maxPlayers),caseCount:setupValues.caseCount==='all'?'all':Number(setupValues.caseCount),pace:setupValues.pace});saveSession({code:result.code,token:result.hostToken});connect()}
  catch(error){toast(error.message);button.disabled=false;button.textContent='Crear aventura →'}finally{busy=false}
 };
}
// Team meter for the big screen: every avatar lights up once that detective answers.
function progress(s){const total=s.players.length,width=total?Math.round(100*s.submitted/total):0;return `<div class="tv-team" role="progressbar" aria-label="Respuestas del equipo" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${s.submitted}"><div class="tv-team-head"><span><b>${s.submitted}</b> de ${total} respondieron</span><div class="progress"><div style="width:${width}%"></div></div></div><div class="tv-team-avatars">${s.players.map(player=>`<span class="${player.answered?'done':''}" title="${esc(player.name)}">${esc(player.avatar)}</span>`).join('')}</div></div>`}
function storyCard(c){return `<article class="story-card tv-story"><div class="story-meta"><span>MISIÓN ${String((current?.caseIndex||0)+1).padStart(2,'0')}</span><span>${esc(c.categoria)}</span></div><div class="story-heading"><span class="story-avatar" aria-hidden="true">${esc(c.insignia?.icono||'🕵️')}</span><div><h2>${esc(c.titulo)}</h2><p>${esc(c.personaje)}</p></div></div>${owlBubble(c.relato,'story-text')}${c.insignia?`<div class="tv-prize"><span class="tv-prize-icon" aria-hidden="true">${esc(c.insignia.icono)}</span><div><small>Carta de esta misión</small><b>${esc(c.insignia.nombre)}</b></div><span class="tv-prize-pumpkins" aria-hidden="true">🎃🎃🎃</span></div>`:''}</article>`}
function owlBubble(text,cls=''){return `<div class="tv-owl"><span aria-hidden="true">🦉</span><p class="${cls}">${esc(text)}</p></div>`}
function tvRibbon(icon,title,help='',kicker=''){return `<div class="tv-ribbon"><span class="tv-ribbon-icon" aria-hidden="true">${icon}</span><div>${kicker?`<span class="tv-kicker">${esc(kicker)}</span>`:''}<h2>${esc(title)}</h2>${help?`<p>${esc(help)}</p>`:''}</div></div>`}
function countdown(){return '<div class="timer-box timer-wrap"><span class="timer" data-timer aria-label="Tiempo restante"></span><div class="timer-track"><span class="timer-fill" data-timer-fill></span></div></div>'}
function secondsRemaining(){return !current?.endsAt?0:Math.max(0,Math.ceil((current.endsAt-Date.now()-clockOffset)/1000))}
function miniKind(m){return miniKinds[m?.tipo]||m?.tipo}
function miniComplete(m){
 if(!m)return false;
 // Catching nothing or marking nothing is a valid answer once the round is played.
 if(m.tipo==='atrapar')return !!draftMini.done&&Array.isArray(draftMini.selections);
 if(m.tipo==='linterna')return m.opciones.every(item=>draftMini.found?.includes(item.id));
 const kind=miniKind(m);
 if(kind==='tocar')return !!draftMini.selection;
 if(kind==='seleccionar')return !!draftMini.selections?.length;
 if(kind==='ordenar')return draftMini.sequence?.length===m.pasos.length;
 if(kind==='clasificar')return m.tarjetas.every(card=>['safe','danger'].includes(draftMini.groups?.[card.id]));
 if(kind==='conectar')return m.situaciones.every(item=>m.acciones.some(action=>action.id===draftMini.matches?.[item.id]));
 return false;
}
function responseComplete(){
 if(!current)return false;
 if(current.stage==='detect')return draftDetect.length>0;
 if(current.stage==='decide')return !!draftDecide;
 return current.stage==='mini'&&miniComplete(current.case?.miniJuego);
}
function updateTimers(){
 const seconds=secondsRemaining(),label=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
 for(const element of document.querySelectorAll('[data-timer]')){element.textContent='⏱ '+label;element.classList.toggle('urgent',seconds<=8)}
 const width=current?.stageDurationMs?Math.min(100,seconds*1000/current.stageDurationMs*100):0;
 for(const element of document.querySelectorAll('[data-timer-fill]')){element.style.width=width+'%';element.classList.toggle('urgent',seconds<=8)}
 for(const button of document.querySelectorAll('[data-answer-submit]'))button.disabled=seconds<=0||busy||!responseComplete();
 for(const control of document.querySelectorAll('[data-answer-control]'))control.disabled=busy||seconds<=0||!!stateAnswerFor(current?.stage);
 const undo=document.getElementById('mini-undo');if(undo)undo.disabled=busy||seconds<=0||!(draftMini.sequence||[]).length;
 const next=document.getElementById('child-next');if(next)next.disabled=busy||seconds<=0||!!stateAnswerFor(current?.stage)||!childStepReady(current?.case?.miniJuego);
 const previous=document.getElementById('child-prev');if(previous)previous.disabled=busy||seconds<=0||!!stateAnswerFor(current?.stage)||childStep<=0;
 const status=document.getElementById('answer-status');if(status&&!stateAnswerFor(current?.stage))status.textContent=seconds<=0?'Tiempo terminado. ¡Miremos juntos!':busy?'Enviando…':'';
}
setInterval(updateTimers,250);
function missionProgress(s){
 const step=s.stage.startsWith('detect')?0:s.stage.startsWith('decide')?1:2;
 if(!HOST_MODE)return `<div class="child-mission"><span>Misión <b>${s.caseIndex+1}/${s.totalCases}</b></span><div class="child-step-dots" aria-label="Paso ${step+1} de 3">${['🔎','💡','🎮'].map((label,i)=>`<span class="${i===step?'active':i<step?'done':''}" ${i===step?'aria-current="step"':''}>${i<step?'✓':label}</span>`).join('')}</div></div>`;
 return `<div class="mission-progress"><span>Misión <b>${s.caseIndex+1}</b> de ${s.totalCases}</span><div class="stage-steps" aria-label="Etapas de la misión">${['Buscá','Decidí','Jugá'].map((label,i)=>`<span class="${i===step?'active':i<step?'done':''}" ${i===step?'aria-current="step"':''}><b>${i<step?'✓':i+1}</b>${label}</span>`).join('')}</div></div>`;
}
function childHud(s,timer){
 const me=s.personal;
 return `<div class="child-hud"><span class="hud-me"><span class="hud-avatar" aria-hidden="true">${esc(me.avatar)}</span><span class="hud-score"><span aria-hidden="true">🍬</span>${Number(me.score).toLocaleString('es-AR')}<span class="sr-only"> puntos</span></span></span>${missionProgress(s)}${timer?'<span class="hud-timer timer" data-timer aria-label="Tiempo restante"></span>':''}</div>${timer?'<div class="hud-bar" aria-hidden="true"><span data-timer-fill></span></div>':''}`;
}
function rankRows(s,{from=0,limit=Infinity}={}){const shown=s.ranking.slice(from,from+limit),rest=s.ranking.length-from-shown.length;return `<div class="rank" style="--rows:${Math.max(1,Math.ceil(shown.length/2))}">${shown.map((player,k)=>{const i=from+k;return `<div class="rank-row ${i===0?'toprank':''} ${i<3?'podium-'+(i+1):''} ${player.id===s.personal?.id?'is-me':''}"><span class="rank-num">${['🥇','🥈','🥉'][i]||i+1}</span><strong class="rank-name"><span class="rank-face" aria-hidden="true">${esc(player.avatar)}</span> ${esc(player.name)}${player.id===s.personal?.id?' <small>(vos)</small>':''}</strong><b class="rank-points">${player.score} pts</b></div>`}).join('')}</div>${rest>0?`<p class="help tv-rank-more">Y ${rest} detectives más. Descargá el ranking CSV para verlos a todos.</p>`:''}`}
function podium(s){const order=[s.ranking[1],s.ranking[0],s.ranking[2]];return `<div class="podium">${order.map((player,i)=>player?`<div class="podium-place ${['second','first','third'][i]}"><span class="podium-face">${esc(player.avatar)}</span><b class="podium-name">${esc(player.name)}</b><span class="podium-score">${player.score} pts</span><div class="podium-block">${[2,1,3][i]}</div></div>`:'').join('')}</div>`}
// Clue cards on the big screen: neutral while the team answers, then marked when revealed.
function clueCards(c,reveal){return `<div class="tv-cards">${c.pistas.map((clue,i)=>`<div class="tv-card choice-${i%4} ${reveal?(clue.correcta?'good':'neutral'):''}"><span class="tv-card-icon" aria-hidden="true">${esc(clue.icono)}</span><b>${esc(clue.texto)}</b>${reveal?`<small>${clue.correcta?'✓ Señal de alerta':'Por sí sola no es una alerta'}</small>`:''}</div>`).join('')}</div>`}
function answerList(c,reveal){return `<div class="answers">${c.opciones.map((option,i)=>`<div class="answer ${reveal&&option.id===c.respuesta?'correct':''}"><span class="answer-icon">${esc(option.icono||['💬','🧭','🛡️'][i%3])}</span><span>${esc(option.texto)}</span>${reveal&&option.id===c.respuesta?'<b>✓</b>':''}</div>`).join('')}</div>`}
function miniList(m){const items=m.opciones||m.pasos||m.tarjetas||m.situaciones||[];return `<div class="mini-preview">${items.map(item=>`<div class="mini-preview-card"><span>${esc(item.icono)}</span><b>${esc(item.texto)}</b></div>`).join('')}</div>`}
function miniResult(m){
 let rows=[];const kind=miniKind(m);
 if(kind==='tocar'){const item=m.opciones.find(option=>option.id===m.respuesta);if(item)rows=[`${esc(item.icono)} ${esc(item.texto)}`]}
 if(kind==='ordenar')rows=m.ordenCorrecto.map((id,i)=>{const item=m.pasos.find(option=>option.id===id);return `${i+1}. ${esc(item?.icono)} ${esc(item?.texto)}`});
 if(kind==='clasificar')rows=m.tarjetas.map(item=>`${esc(item.icono)} ${esc(item.texto)} <b>${m.clasificacion[item.id]==='safe'?'🛡️ Me cuida':'⚠️ Atención'}</b>`);
 if(kind==='seleccionar')rows=m.opciones.filter(option=>m.correctas.includes(option.id)).map(item=>`${esc(item.icono)} ${esc(item.texto)}`);
 if(kind==='conectar')rows=m.situaciones.map(item=>{const action=m.acciones.find(option=>option.id===m.soluciones[item.id]);return `${esc(item.icono)} ${esc(item.texto)} <b>→ ${esc(action?.icono)} ${esc(action?.texto)}</b>`});
 return `<div class="mini-result">${rows.map(row=>`<div class="result-row">${row}</div>`).join('')}</div>`;
}
// A4 poster for the room: big QR, room code, four picture steps and the address to type by hand.
function posterSheet(s,address,base){return `<article class="print-poster" aria-label="Vista previa del cartel"><div class="poster-inner"><header class="poster-head"><span aria-hidden="true">🎃</span><div><small>Misterios en la noche</small><b>Detectives Digitales</b></div><span aria-hidden="true">🦇</span></header><h2>¡Sumate a la aventura!</h2><img class="poster-qr" src="/api/qr?texto=${encodeURIComponent(address)}" alt="QR para entrar a la sala ${esc(s.code)}"><div class="poster-code"><small>Código de sala</small><b>${esc(s.code)}</b></div><ol class="poster-steps"><li><span aria-hidden="true">📶</span><p>${LOCAL_HOST?`Conectá el celular al Wi-Fi <strong id="poster-wifi-name">${esc(posterWifi||'del aula')}</strong>.`:'Conectá el celular a Internet.'}</p></li><li><span aria-hidden="true">📷</span><p>Abrí la cámara, apuntá al QR y tocá el enlace.</p></li><li><span aria-hidden="true">🦊</span><p>Escribí un <strong>apodo</strong> (no tu nombre real) y elegí tu personaje.</p></li><li><span aria-hidden="true">🎮</span><p>Tocá <strong>¡A jugar!</strong> y esperá a que empiece la misión.</p></li></ol><p class="poster-url">¿No funciona la cámara? Escribí en el navegador<br><b>${esc(base)}</b><br>y poné el código <b>${esc(s.code)}</b>.</p><footer class="poster-foot">🦉 Cuidá tus datos: nunca compartas tu dirección, tu teléfono ni tus claves.</footer></div></article>`}
function renderHost(){
 const s=current;if(!s){renderHostCreate();return}
 if(s.stage!=='lobby')posterOpen=false;
 if(s.stage==='lobby'){
  const address=LOCAL_HOST?`${location.protocol}//${selectedIP||location.hostname}:${location.port||3000}/jugar?codigo=${encodeURIComponent(s.code)}`:`${location.origin}/jugar?codigo=${encodeURIComponent(s.code)}`;
  const options=network.length?network.map(item=>`<option value="${esc(item.ip)}" ${item.ip===selectedIP?'selected':''}>${esc(item.ip)} · ${esc(item.interfaz)}${item.virtual?' (virtual: los celulares no la ven)':''}</option>`).join(''):`<option value="${esc(location.hostname)}">${esc(location.hostname)}</option>`;
  const networkControl=LOCAL_HOST?`<div class="tv-network"><label class="label" for="lan-ip">Red Wi-Fi del organizador</label><div class="tv-network-row"><select id="lan-ip" class="field">${options}</select><button type="button" class="button ghost btn-small" id="refresh-ips" aria-label="Buscar redes">↻ Buscar</button></div><p class="help">Elegí la IP de la red que comparten los celulares.</p></div>`:'<p class="help">🌎 El equipo puede sumarse desde cualquier conexión a Internet.</p>';
  if(posterOpen){
   const base=address.split('?')[0];
   show(`<section class="poster-screen"><div class="panel poster-toolbar"><span class="tv-kicker">Para imprimir</span><h2>Cartel con QR para los chicos</h2><p class="help">Pegalo en el aula o en cada mesa. Sirve para esta sala (código <b>${esc(s.code)}</b>)${LOCAL_HOST?' y esta red':''}: si creás otra sala, imprimí uno nuevo.</p>${LOCAL_HOST?`<label class="label" for="poster-wifi">Nombre del Wi-Fi (aparece en el cartel)</label><input class="field" id="poster-wifi" maxlength="40" autocomplete="off" placeholder="Ej.: Escuela-Aula3" value="${esc(posterWifi)}">${networkControl}`:''}<div class="tools"><button class="button primary" id="poster-print">🖨️ Imprimir cartel</button><button class="button ghost" id="poster-back">← Volver a la sala</button></div><p class="help">En la ventana de impresión elegí A4. También podés «Guardar como PDF».</p></div>${posterSheet(s,address,base)}</section>`);
   const wifi=document.getElementById('poster-wifi');
   if(wifi)wifi.oninput=()=>{posterWifi=wifi.value.trim();try{localStorage.setItem('dd_wifi',posterWifi)}catch(_){}const name=document.getElementById('poster-wifi-name');if(name)name.textContent=posterWifi||'del aula'};
   const select=document.getElementById('lan-ip');if(select)select.onchange=event=>{selectedIP=event.target.value;render()};
   const refresh=document.getElementById('refresh-ips');if(refresh)refresh.onclick=refreshNetwork;
   document.getElementById('poster-print').onclick=()=>window.print();
   document.getElementById('poster-back').onclick=()=>{posterOpen=false;render()};return;
  }
  show(`<div class="lobby-grid tv-lobby"><section class="panel lobby-main qr-panel tv-join"><span class="tv-kicker">¡Sumate a la aventura!</span><h2>Escaneá el QR o entrá con el código</h2><div class="tv-join-body"><div class="qr-frame"><img src="/api/qr?texto=${encodeURIComponent(address)}" alt="QR para ingresar a la sala ${esc(s.code)}"></div><div class="tv-join-info"><span class="tv-code-label">Código de sala</span><div class="lobby-code">${[...s.code].map(letter=>`<span>${esc(letter)}</span>`).join('')}</div><div class="join-url" id="join-url">${esc(address)}</div>${networkControl}<div class="tools"><button class="button ghost btn-small" id="copy-link">📋 Copiar enlace</button><button class="button ghost btn-small" id="poster">🖨️ Cartel con QR</button><button class="button ghost btn-small" id="fullscreen">⛶ Pantalla completa</button></div></div></div></section><section class="panel lobby-players team-panel tv-team-panel"><span class="tv-kicker">Nuestro equipo</span><h2>${s.players.length} <span class="dim">/ ${s.maxPlayers} detectives</span></h2><p class="help">${s.totalCases} misiones · Ritmo ${s.pace==='calm'?'tranquilo':'clásico'}. Con un participante ya podés empezar.</p><div class="roster">${s.players.map(player=>`<div class="roster-item"><span class="av">${esc(player.avatar)}</span><b>${esc(player.name)}</b><span class="status-good" aria-hidden="true">✓</span></div>`).join('')}${s.players.length===0?'<div class="roster-item wait">🔎 Esperando al primer detective…</div>':''}</div><button id="next" class="button primary full" ${s.players.length<1?'disabled':''}>${buttonNext.lobby}</button><p class="help">Mantené abierto este panel durante la partida. Exportá los resultados antes de cerrar.</p><button class="button ghost btn-small" id="close-room">Cerrar sala</button></section></div>`);
  const select=document.getElementById('lan-ip');if(select)select.onchange=event=>{selectedIP=event.target.value;render()};
  const refresh=document.getElementById('refresh-ips');if(refresh)refresh.onclick=refreshNetwork;
  document.getElementById('copy-link').onclick=()=>copy(address);document.getElementById('fullscreen').onclick=toggleFullscreen;
  document.getElementById('poster').onclick=()=>{posterOpen=true;render()};
  document.getElementById('close-room').onclick=closeCurrentRoom;document.getElementById('next').onclick=()=>hostAction('next');return;
 }
 if(['leaderboard','final'].includes(s.stage)){
  const final=s.stage==='final';
  // The big screen shows the top of the ranking; every phone shows its own position and the CSV has everyone.
  const ribbon=final?tvRibbon('🏆','¡Un equipo de grandes detectives!','Aprendimos a mirar, pensar y cuidarnos. ¡Ese es nuestro mejor premio!','¡Aventura completada!'):tvRibbon('🎃','¡Así va nuestro equipo!','Cada descubrimiento cuenta.',`Misión ${s.caseIndex+1} de ${s.totalCases}`);
  show(`${final?confetti():''}<section class="panel text-center ranking-panel tv-ranking ${final?'tv-final':''}">${ribbon}${final?podium(s):''}${rankRows(s,final?{from:3,limit:8}:{limit:10})}<div class="tv-actions"><div class="tools"><button class="button ghost btn-small" id="export-csv">↓ Descargar ranking CSV</button><button class="button ghost btn-small" id="fullscreen">⛶ Pantalla completa</button><button class="button ghost btn-small" id="close-room">Cerrar sala</button></div><button class="button primary" id="next">${final?buttonNext.final:s.caseIndex+1===s.totalCases?'Ver el podio →':buttonNext.leaderboard}</button></div></section>`);
  document.getElementById('next').onclick=()=>hostAction(final?'reset':'next');document.getElementById('export-csv').onclick=exportRanking;
  document.getElementById('fullscreen').onclick=toggleFullscreen;document.getElementById('close-room').onclick=closeCurrentRoom;return;
 }
 const c=s.case,m=c.miniJuego,active=['detect','decide','mini'].includes(s.stage);let content='';
 if(s.stage==='detect')content=`${tvRibbon('🔎','¿Qué pistas llaman tu atención?','Marcá en tu celular todas las señales de alerta.')}${clueCards(c,false)}${progress(s)}<p class="notice">+100 por señal correcta · −100 por señal incorrecta</p>`;
 if(s.stage==='detect_reveal')content=`${tvRibbon('🔎','¡Miremos las pistas!','Las tarjetas verdes son señales de alerta.')}${clueCards(c,true)}`;
 if(s.stage==='decide')content=`${tvRibbon('💡',c.pregunta,'Elegí una opción en tu celular.')}${answerList(c,false)}${progress(s)}`;
 if(s.stage==='decide_reveal')content=`${tvRibbon('🧭','Una decisión que nos cuida')}${answerList(c,true)}${owlBubble(c.explicacion)}`;
 if(s.stage==='mini')content=`${tvRibbon(miniIcons[m.tipo]||'🎮',m.titulo,m.instruccion,`${miniNames[m.tipo]||'Minijuego'} · +300 puntos`)}${miniList(m)}${progress(s)}`;
 if(s.stage==='mini_reveal')content=`${tvRibbon('🎓',m.titulo,'','Aprendemos juntos')}${miniResult(m)}${owlBubble(m.explicacion)}`;
 show(`<section class="tv-stage tv-${s.stage}"><div class="tv-hud">${missionProgress(s)}<h2 class="tv-stage-name">${esc(stageNames[s.stage])}</h2>${active?countdown():'<span class="tv-talk">💬 Para conversar en equipo</span>'}</div><div class="screen host-play-grid tv-grid">${storyCard(c)}<section class="panel question-panel tv-board">${content}<div class="tv-actions"><span class="tv-team-total">👥 ${s.players.length} ${s.players.length===1?'detective':'detectives'}</span><button class="button ghost btn-small" id="fullscreen" aria-label="Pantalla completa">⛶</button><button class="button primary" id="next">${buttonNext[s.stage]}</button></div></section></div></section>`);
 document.getElementById('next').onclick=()=>hostAction('next');document.getElementById('fullscreen').onclick=toggleFullscreen;
}
async function refreshNetwork(){if(!LOCAL_HOST)return;try{const result=await api('/api/red');network=result.ips||[];if(!network.some(item=>item.ip===selectedIP))selectedIP=network[0]?.ip||location.hostname;if(current?.stage==='lobby')render()}catch(error){toast(error.message)}}
async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch(_){toast('El navegador no permitió pantalla completa.')}}
async function closeCurrentRoom(){if(!session||!confirm('¿Cerrar la sala? Guardá el ranking primero: los resultados se perderán.'))return;try{await api('/api/accion',{code:session.code,token:session.token,action:'close'});clearSession();renderHostCreate()}catch(error){toast(error.message)}}
function exportRanking(){if(!current?.ranking)return;const csv=[['Posición','Investigador','Puntos'],...current.ranking.map((player,i)=>[i+1,player.name,player.score])].map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(';')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`Detectives_Ranking_${current.code}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
async function hostAction(action){if(busy||!session)return;busy=true;const button=document.getElementById('next');if(button)button.disabled=true;try{await api('/api/accion',{code:session.code,token:session.token,action})}catch(error){toast(error.message)}finally{busy=false;const next=document.getElementById('next');if(next)next.disabled=current?.stage==='lobby'&&current.players.length<1}}
function copy(value){if(navigator.clipboard?.writeText)navigator.clipboard.writeText(value).then(()=>toast('Enlace copiado. ¡Invitá a tu equipo!')).catch(()=>window.prompt('Copiá el enlace:',value));else window.prompt('Copiá el enlace:',value)}
function renderPlayerJoin(){
 const code=new URLSearchParams(location.search).get('codigo')||'';
 show(`<section class="panel join-panel child-join"><div class="child-welcome"><span aria-hidden="true">🕵️</span><h2>¡Hola, detective!</h2></div><form id="join-form" class="join-form"><label class="label" for="room-code">Código de sala</label><input class="field code-field" id="room-code" maxlength="4" pattern="[a-zA-Z0-9]{4}" value="${esc(code)}" placeholder="AB12" autocapitalize="characters" autocomplete="off" required><label class="label" for="nickname">Tu apodo</label><input class="field" id="nickname" minlength="2" maxlength="22" placeholder="Ej.: Zorro curioso" autocomplete="nickname" required><fieldset class="avatar-fieldset"><legend class="label">Elegí tu personaje</legend><div class="avatar-picker">${avatars.map((avatar,i)=>`<button class="avatar-choice ${avatar===selectedAvatar?'selected':''}" type="button" id="avatar-${i}" data-avatar="${esc(avatar)}" aria-label="Avatar ${esc(avatar)}" aria-pressed="${avatar===selectedAvatar}">${esc(avatar)}</button>`).join('')}</div></fieldset><button class="button primary full" id="join-submit" type="submit">¡A jugar! →</button></form><p class="child-helper">Usá un apodo, sin datos personales.</p>${!code?'<a href="/organizador" class="organizer-link">Soy organizador →</a>':''}</section>`);
 document.querySelectorAll('[data-avatar]').forEach(button=>button.onclick=()=>{selectedAvatar=button.dataset.avatar;document.querySelectorAll('[data-avatar]').forEach(item=>{const selected=item.dataset.avatar===selectedAvatar;item.classList.toggle('selected',selected);item.setAttribute('aria-pressed',String(selected))});bump(button);sfx('pick')});
 document.getElementById('join-form').onsubmit=async event=>{
  event.preventDefault();if(busy)return;busy=true;sfx('tap');const button=document.getElementById('join-submit');button.disabled=true;
  try{const code=document.getElementById('room-code').value.trim().toUpperCase(),name=document.getElementById('nickname').value.trim();const result=await api('/api/ingresar',{code,name,avatar:selectedAvatar});saveSession({code:result.code,token:result.token});history.replaceState({},'',`/jugar?codigo=${encodeURIComponent(result.code)}`);connect()}
  catch(error){toast(error.message);button.disabled=false}finally{busy=false}
 };
}
function shortText(item){return item?.textoCorto||item?.texto||''}
function stateAnswerFor(stage){return current?.personal?.answers?.[stage]||null}
function initDraft(){
 if(current.caseIndex!==draftCase||current.stage!==draftStage){draftCase=current.caseIndex;draftStage=current.stage;draftDetect=[];draftDecide='';draftMini={};resetArcade()}
 const submitted=stateAnswerFor(current.stage);if(!submitted)return;
 if(current.stage==='detect')draftDetect=[...submitted.selections];
 if(current.stage==='decide')draftDecide=submitted.selection;
 if(current.stage==='mini')draftMini=submitted.selection?{selection:submitted.selection}:submitted.sequence?{sequence:[...submitted.sequence]}:submitted.selections?{selections:[...submitted.selections]}:submitted.matches?{matches:{...submitted.matches}}:{groups:{...submitted.groups}};
}
function childWizard(m){return !!m&&['clasificar','conectar'].includes(m.tipo)}
function childItems(m){return m?.tipo==='clasificar'?m.tarjetas:m?.tipo==='conectar'?m.situaciones:[]}
function childReset(s){
 const key=`${s.code}:${s.caseIndex}:${s.stage}:${s.case?.miniJuego?.tipo||''}`;
 if(key!==childStepKey){childStepKey=key;childStep=0}
 const count=childItems(s.case?.miniJuego).length;
 childStep=Math.max(0,Math.min(childStep,Math.max(0,count-1)));
}
function childStepReady(m){
 const item=childItems(m)[childStep];if(!item)return false;
 return m.tipo==='clasificar'?['safe','danger'].includes(draftMini.groups?.[item.id]):m.acciones.some(action=>action.id===draftMini.matches?.[item.id]);
}
function childMove(m,delta){
 if(!childWizard(m)||busy||stateAnswerFor('mini')||secondsRemaining()<=0)return;
 if(delta>0&&!childStepReady(m))return;
 childStep=Math.max(0,Math.min(childItems(m).length-1,childStep+(delta>0?1:delta<0?-1:0)));
 stopSpeech();render();
 const heading=document.getElementById('child-task-title');if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true})}
 const card=document.getElementById('child-item');if(card)card.classList.add(delta<0?'child-item-back':'child-item-in');
}
function childTop(s){return childHud(s,true)}
function childWaiting(){return '<div class="child-feedback child-sent" role="status"><span class="child-sent-badge" aria-hidden="true">✓<i>👻</i></span><h2>¡Enviado!</h2><p>Ahora descubrimos juntos.</p><div class="waiting-dots" aria-hidden="true"><i></i><i></i><i></i></div></div>'}
function childBubble(text,cls){return `<div class="child-story"><span class="child-story-face" aria-hidden="true">🦉</span><p class="${cls}">${esc(text)}</p></div>`}
function childBurst(icon){return `<div class="child-burst" aria-hidden="true"><span class="child-result-icon">${icon}</span></div>`}
function confetti(){return `<div class="confetti" aria-hidden="true">${Array.from({length:16},(_,i)=>`<i>${confettiPieces[i%confettiPieces.length]}</i>`).join('')}</div>`}
function bump(element){if(!element)return;element.classList.remove('bump');void element.offsetWidth;element.classList.add('bump')}
function submitArea(submitted,label='Enviar'){
 return submitted?childWaiting():`<div class="submit-area child-actions"><button class="button primary full" data-answer-submit id="submit-answer" disabled>${label} <span aria-hidden="true">✓</span></button><p class="answer-status child-helper" id="answer-status" role="status"></p></div>`;
}
function questionHeading(icon,title,help){return `<div class="question-heading"><span class="question-icon lilac" aria-hidden="true">${icon}</span><div><h2>${esc(title)}</h2><p class="help">${esc(help)}</p></div></div>`}
function choiceCard(item,index,{name,type,selected,disabled}){
 return `<label class="choice choice-${index%4} ${selected?'selected':''} ${disabled?'locked':''}" for="${name}-${index}"><input id="${name}-${index}" type="${type}" name="${name}" value="${esc(item.id)}" ${selected?'checked':''} ${disabled?'disabled':'data-answer-control'}><span class="choice-emoji" aria-hidden="true">${esc(item.icono||['💬','🧭','🛡️','🌟'][index%4])}</span><strong class="choice-text">${esc(shortText(item))}</strong><span class="choice-check" aria-hidden="true">${selected?'✓':'+'}</span></label>`;
}
function bindChoices(name,onChange){document.querySelectorAll(`input[name="${name}"]`).forEach(input=>input.onchange=()=>{onChange(input);document.querySelectorAll(`input[name="${name}"]`).forEach(control=>{control.closest('.choice').classList.toggle('selected',control.checked);control.closest('.choice').querySelector('.choice-check').textContent=control.checked?'✓':'+'});if(input.checked)bump(input.closest('.choice'));sfx(input.checked?'pick':'tap');updateTimers()})}
function miniGame(m,submitted){
 if(m.tipo==='tocar'||m.tipo==='seleccionar'){
  const multi=m.tipo==='seleccionar';return `<div class="mini-game-grid choice-grid child-options">${m.opciones.map((option,i)=>choiceCard(option,i,{name:'mini-choice',type:multi?'checkbox':'radio',selected:multi?(draftMini.selections||[]).includes(option.id):draftMini.selection===option.id,disabled:!!submitted})).join('')}</div>${multi?`<div class="candy-bucket" id="candy-bucket" role="status"><span class="bucket-pumpkin" aria-hidden="true">🎃</span><span class="bucket-candies" id="bucket-candies">${candyBucket()}</span></div>`:''}`;
 }
 if(m.tipo==='ordenar'){
  const sequence=draftMini.sequence||[];
  return `<div class="mini-order-slots child-order-slots" aria-label="Tu secuencia">${m.pasos.map((_,i)=>{const item=m.pasos.find(step=>step.id===sequence[i]);return `<div class="order-slot ${item?'filled':''}"><b>${i+1}</b><span>${item?esc(item.icono):'·'}</span><small>${item?esc(shortText(item)):''}</small>${item&&i===sequence.length-1?`<i class="slot-hopper" aria-hidden="true">${esc(current?.personal?.avatar||'🕵️')}</i>`:''}</div>`}).join('')}</div><p class="child-helper child-order-help">${sequence.length<m.pasos.length?`Elegí el paso ${sequence.length+1}`:'¡Tu secuencia está lista!'}</p>${orderCards(m,submitted)}`;
 }
 if(m.tipo==='pocion')return potionGame(m,submitted);
 if(m.tipo==='atrapar')return ghostGame(m);
 if(m.tipo==='linterna')return darkRoom(m);
 if(m.tipo==='defender')return castleGame(m);
 if(childWizard(m)){
  const items=childItems(m),item=items[childStep],disabled=submitted?'disabled':'data-answer-control';
  const counter=`<div class="child-stepper"><span>Tarjeta <b>${childStep+1}/${items.length}</b></span><div aria-hidden="true">${items.map((_,i)=>`<i class="${i===childStep?'active':i<childStep?'done':''}"></i>`).join('')}</div></div>`;
  if(m.tipo==='clasificar'){
   const group=draftMini.groups?.[item.id];
   // A swipe deck: drag the card right when it protects you, left when it needs attention. The buttons do the same.
   const card=`<div class="child-item swipe-card ${group?'is-'+group:''} ${childStep<items.length-1?'has-more':''}" id="child-item" data-card="${esc(item.id)}"><span class="swipe-stamp safe" aria-hidden="true">🍬 ¡Dulce!</span><span class="swipe-stamp danger" aria-hidden="true">👻 ¡Truco!</span><span class="child-item-icon" aria-hidden="true">${esc(item.icono)}</span><h3>${esc(shortText(item))}</h3><span class="swipe-hint" aria-hidden="true"><i>← 👻 Truco</i><i>Dulce 🍬 →</i></span></div>`;
   return `${counter}${card}<div class="classification-actions sort-actions child-options child-classify" role="group" aria-label="Elegí cómo clasificar esta tarjeta">${[['danger','👻','Truco','Atención'],['safe','🍬','Dulce','Me cuida']].map(([value,icon,label,meaning])=>`<button type="button" class="classify-button sort-button ${value} ${group===value?'selected':''}" id="classify-${childStep}-${value}" data-card="${esc(item.id)}" data-group="${value}" aria-pressed="${group===value}" ${disabled}><span aria-hidden="true">${icon}</span><b>${label}</b><small>${meaning}</small></button>`).join('')}</div>`;
  }
  const card=`<div class="child-item" id="child-item"><span class="child-item-icon" aria-hidden="true">${esc(item.icono)}</span><h3>${esc(shortText(item))}</h3></div>`;
  return `${counter}${card}<div class="child-match-options child-options">${m.acciones.map((action,i)=>`<button type="button" class="child-match-button ${draftMini.matches?.[item.id]===action.id?'selected':''}" id="child-match-${childStep}-${i}" data-match-item="${esc(item.id)}" data-match-action="${esc(action.id)}" aria-pressed="${draftMini.matches?.[item.id]===action.id}" ${disabled}><span aria-hidden="true">${esc(action.icono)}</span><b>${esc(shortText(action))}</b><span class="child-match-check" aria-hidden="true">${draftMini.matches?.[item.id]===action.id?'✓':''}</span></button>`).join('')}</div>`;
 }
 return '<p>Esperá el próximo reto.</p>';
}
function candyBucket(){const count=(draftMini.selections||[]).length;return count?`<span aria-hidden="true">${'<i>🍬</i>'.repeat(count)}</span><b>${count} ${count===1?'dulce':'dulces'} en tu calabaza</b>`:'<b>Tu calabaza está vacía</b>'}
function orderCards(m,submitted){
 const sequence=draftMini.sequence||[];
 return `<div class="mini-game-grid order-options child-options">${m.pasos.map((step,i)=>`<button type="button" class="mini-card choice-${i%4} ${sequence.includes(step.id)?'selected':''}" id="mini-step-${i}" data-mini-step="${esc(step.id)}" ${submitted||sequence.includes(step.id)?'disabled':'data-answer-control'}><span class="emoji">${esc(step.icono)}</span><strong>${esc(shortText(step))}</strong>${sequence.includes(step.id)?`<small>✓ ${sequence.indexOf(step.id)+1}</small>`:''}</button>`).join('')}</div>${submitted?'':`<button type="button" class="button ghost btn-small child-undo" id="mini-undo" ${!sequence.length?'disabled':''}>↶ Deshacer</button>`}`;
}
// Potion: the same ordering task, poured into a cauldron that changes color with each ingredient.
function potionGame(m,submitted){
 const sequence=draftMini.sequence||[];
 return `<div class="cauldron-scene"><div class="potion-steps" aria-label="Tu poción">${m.pasos.map((_,i)=>{const item=m.pasos.find(step=>step.id===sequence[i]);return `<span class="potion-step ${item?'filled':''}"><b>${i+1}</b>${item?`<span aria-hidden="true">${esc(item.icono)}</span><span class="sr-only">${esc(shortText(item))}</span>`:''}</span>`}).join('')}</div><div class="cauldron brew-${sequence.length}" id="cauldron" aria-hidden="true"><span class="cauldron-bubbles"><i></i><i></i><i></i></span><span class="cauldron-liquid"></span><span class="cauldron-pot"></span></div></div><p class="child-helper child-order-help">${sequence.length<m.pasos.length?`Echá el ingrediente ${sequence.length+1}`:'¡La poción está lista!'}</p>${orderCards(m,submitted)}`;
}
// Ghost hunt: every card pops out of the windows twice. The timeline lives outside the DOM so live updates can redraw it.
// A replayed mission (after "Volver a jugar") starts its arcade game from scratch.
function resetArcade(){arcade=null;lamp=null;lastThreat='';if(ghostTick.timer){clearInterval(ghostTick.timer);ghostTick.timer=0}}
function arcadeKey(){return `${current?.code}:${current?.caseIndex}:mini`}
function ghostState(){return arcade?.key===arcadeKey()?arcade:null}
function ghostSchedule(items){
 const order=[];
 for(let round=0;round<2;round++){const deck=[...items].sort(()=>Math.random()-.5);if(order.length&&deck[0].id===order[order.length-1].id)deck.push(deck.shift());order.push(...deck)}
 const pops=[];
 order.forEach((item,i)=>{const t0=700+i*1000,taken=pops.filter(pop=>pop.t0<=t0&&pop.t1>t0).map(pop=>pop.hole),free=[0,1,2,3,4,5].filter(hole=>!taken.includes(hole)&&hole!==pops[i-1]?.hole);pops.push({id:item.id,hole:free[Math.floor(Math.random()*free.length)],t0,t1:t0+2100})});
 return pops;
}
function ghostJar(m){const caught=draftMini.selections||[];return caught.length?caught.map(id=>{const item=m.opciones.find(option=>option.id===id);return `<button type="button" class="ghost-chip" data-release="${esc(id)}" aria-label="Soltar: ${esc(shortText(item))}" data-answer-control><span aria-hidden="true">${esc(item?.icono)}</span></button>`}).join(''):'<span class="ghost-jar-empty">Ninguno todavía</span>'}
function ghostGame(m){
 const game=ghostState();
 const overlay=!game?'<div class="arena-overlay"><span aria-hidden="true">👻</span><button type="button" class="button primary" id="ghost-start" data-answer-control>▶ ¡Empezar!</button></div>':draftMini.done?'<div class="arena-overlay arena-done"><b>¡Ronda terminada!</b><button type="button" class="button ghost btn-small" id="ghost-again" data-answer-control>↻ Otra vez</button></div>':'';
 return `<div class="ghost-house" id="ghost-house"><span class="ghost-moon" aria-hidden="true"></span><div class="ghost-windows">${[0,1,2,3,4,5].map(hole=>`<div class="ghost-window" data-hole="${hole}"></div>`).join('')}</div>${overlay}</div><div class="ghost-jar"><span class="ghost-jar-label">🕸️ Atrapados</span><div class="ghost-jar-items" id="ghost-jar" aria-live="polite">${ghostJar(m)}</div></div>`;
}
function ghostTick(){
 const game=ghostState(),house=document.getElementById('ghost-house');
 if(!game||game.done||current?.stage!=='mini'){clearInterval(ghostTick.timer);ghostTick.timer=0;return}
 if(!house)return;
 const t=Date.now()-game.start,m=current.case.miniJuego;
 if(t>=game.end){game.done=true;draftMini={...draftMini,done:true};clearInterval(ghostTick.timer);ghostTick.timer=0;sfx('send');render();return}
 for(const hole of house.querySelectorAll('[data-hole]')){
  let want='';
  game.pops.forEach((pop,i)=>{if(pop.hole!==Number(hole.dataset.hole)||t<pop.t0||t>=pop.t1)return;const at=game.caught[i];if(at===undefined)want='p'+i;else if(t<at+550)want='c'+i});
  if(hole.dataset.show===want)continue;
  hole.dataset.show=want;
  if(!want){hole.innerHTML='';continue}
  const i=Number(want.slice(1)),item=m.opciones.find(option=>option.id===game.pops[i].id);
  hole.innerHTML=want[0]==='c'?'<span class="ghost-caught" aria-hidden="true">✨</span>':`<button type="button" class="ghost-pop" data-pop="${i}" data-item="${esc(item.id)}" aria-label="Atrapar: ${esc(shortText(item))}" data-answer-control><span class="ghost-body" aria-hidden="true">👻</span><span class="ghost-card"><span aria-hidden="true">${esc(item.icono)}</span><b>${esc(shortText(item))}</b></span></button>`;
 }
}
function ghostStart(m){
 if(busy||secondsRemaining()<=0)return;
 const pops=ghostSchedule(m.opciones);
 arcade={key:arcadeKey(),start:Date.now(),pops,caught:{},end:pops[pops.length-1].t1+300,done:false};
 draftMini={selections:[],done:false};sfx('whoosh');render();
 clearInterval(ghostTick.timer);ghostTick.timer=setInterval(ghostTick,100);
}
function bindGhosts(m){
 const start=document.getElementById('ghost-start');if(start)start.onclick=()=>ghostStart(m);
 const again=document.getElementById('ghost-again');if(again)again.onclick=()=>ghostStart(m);
 const house=document.getElementById('ghost-house'),jar=document.getElementById('ghost-jar');
 const refresh=()=>{jar.innerHTML=ghostJar(m);updateTimers()};
 if(house)house.onclick=event=>{
  const pop=event.target.closest('[data-pop]'),game=ghostState();
  if(!pop||pop.disabled||!game||game.done||busy||secondsRemaining()<=0)return;
  const i=Number(pop.dataset.pop);if(game.caught[i]!==undefined)return;
  game.caught[i]=Date.now()-game.start;
  const id=game.pops[i].id,caught=draftMini.selections||[];
  if(!caught.includes(id))draftMini={...draftMini,selections:[...caught,id]};
  sfx('pop');ghostTick();refresh();
 };
 if(jar)jar.onclick=event=>{
  const chip=event.target.closest('[data-release]');if(!chip||chip.disabled||busy||secondsRemaining()<=0)return;
  draftMini={...draftMini,selections:(draftMini.selections||[]).filter(id=>id!==chip.dataset.release)};sfx('tap');refresh();
 };
 ghostTick();
 if(ghostState()&&!ghostState().done&&!ghostTick.timer)ghostTick.timer=setInterval(ghostTick,100);
}
// Detective flashlight: permissions hide in a dark room. Light them up, then mark the suspicious ones.
const roomSpots=[[26,22],[74,36],[27,64],[73,82],[50,50],[50,10]];
function roomCount(m){const found=(draftMini.found||[]).length,total=m.opciones.length;return found<total?`🔦 Encontraste ${found} de ${total}`:`¡Encontraste todo! Marcaste ${(draftMini.selections||[]).length} 🚨`}
function darkRoom(m){
 const found=draftMini.found||[],marked=draftMini.selections||[],light=lamp?.key===arcadeKey()?lamp:null;
 return `<div class="dark-room ${found.length===m.opciones.length?'all-found':''}" id="dark-room" style="--x:${light?light.x+'px':'50%'};--y:${light?light.y+'px':'45%'}"><span class="room-deco" aria-hidden="true"><i>🕸️</i><i>🖼️</i><i>🕯️</i><i>🦇</i><i>🎃</i></span>${m.opciones.map((item,i)=>`<button type="button" class="room-item choice-${i%4} ${found.includes(item.id)?'found':''} ${marked.includes(item.id)?'selected':''}" style="left:${roomSpots[i][0]}%;top:${roomSpots[i][1]}%" data-room-item="${esc(item.id)}" aria-pressed="${marked.includes(item.id)}" data-answer-control><span class="room-item-icon" aria-hidden="true">${esc(item.icono)}</span><b>${esc(shortText(item))}</b><span class="room-stamp" aria-hidden="true">🚨</span></button>`).join('')}<div class="room-dark" aria-hidden="true"></div><span class="room-eyes" aria-hidden="true"><i></i><i></i></span>${found.length?'':'<span class="room-hint" aria-hidden="true">👆 Mové el dedo</span>'}</div><p class="child-helper room-count" id="room-count" role="status">${roomCount(m)}</p>`;
}
function bindRoom(m){
 const room=document.getElementById('dark-room');if(!room)return;
 const size=room.getBoundingClientRect(),radius=Math.round(Math.max(64,Math.min(size.width,size.height)*.3));
 room.style.setProperty('--lamp',radius+'px');
 const light=(x,y)=>{lamp={key:arcadeKey(),x:Math.round(x),y:Math.round(y)};room.style.setProperty('--x',lamp.x+'px');room.style.setProperty('--y',lamp.y+'px')};
 const reveal=item=>{
  const id=item.dataset.roomItem,found=draftMini.found||[];if(found.includes(id))return false;
  draftMini={...draftMini,found:[...found,id]};item.classList.add('found');
  room.classList.toggle('all-found',draftMini.found.length===m.opciones.length);room.querySelector('.room-hint')?.remove();
  document.getElementById('room-count').textContent=roomCount(m);sfx(draftMini.found.length===m.opciones.length?'win':'pick');updateTimers();return true;
 };
 const sweep=(event,down)=>{
  if(busy||secondsRemaining()<=0)return;
  const box=room.getBoundingClientRect();light(event.clientX-box.left,event.clientY-box.top);
  for(const item of room.querySelectorAll('[data-room-item]')){const r=item.getBoundingClientRect();if(Math.hypot(r.left+r.width/2-event.clientX,r.top+r.height/2-event.clientY)<radius*.8&&reveal(item)&&down)roomFresh=item.dataset.roomItem}
 };
 // A tap that discovers a card only lights it; the next tap marks it.
 room.onpointerdown=event=>{roomFresh='';sweep(event,true)};
 room.onpointermove=event=>sweep(event,false);
 room.querySelectorAll('[data-room-item]').forEach(item=>{
  item.onfocus=()=>{const box=room.getBoundingClientRect(),r=item.getBoundingClientRect();light(r.left+r.width/2-box.left,r.top+r.height/2-box.top);reveal(item)};
  item.onclick=()=>{
   if(busy||secondsRemaining()<=0)return;
   const id=item.dataset.roomItem;if(roomFresh===id){roomFresh='';return}
   reveal(item);
   const marked=draftMini.selections||[],on=!marked.includes(id);
   draftMini={...draftMini,selections:on?[...marked,id]:marked.filter(other=>other!==id)};
   item.classList.toggle('selected',on);item.setAttribute('aria-pressed',String(on));if(on)bump(item);sfx(on?'pick':'tap');
   document.getElementById('room-count').textContent=roomCount(m);updateTimers();
  };
 });
}
// Castle defense: threats walk down the lane one at a time; play the card from your hand that stops each one.
function castleGame(m){
 const matches=draftMini.matches||{},index=m.situaciones.findIndex(item=>!matches[item.id]),threat=m.situaciones[index];
 const walk=threat&&lastThreat!==arcadeKey()+threat.id;if(threat)lastThreat=arcadeKey()+threat.id;
 const lane=threat?`<div class="threat ${walk?'walk':''}" id="threat"><span class="threat-monster" aria-hidden="true">${monsters[index%monsters.length]}</span><span class="threat-card"><span aria-hidden="true">${esc(threat.icono)}</span><b>${esc(shortText(threat))}</b></span></div>`:'<div class="castle-safe"><b>¡Castillo a salvo!</b></div>';
 const shields=m.situaciones.map((item,i)=>{const action=m.acciones.find(option=>option.id===matches[item.id]);return `<span class="${action?'done':''}">${action?esc(action.icono):i+1}</span>`}).join('');
 return `<div class="castle-lane" id="castle-lane"><span class="lane-moon" aria-hidden="true"></span>${lane}<div class="castle-base"><span class="castle-icon" aria-hidden="true">🏰</span><div class="castle-shields" aria-hidden="true">${shields}</div></div></div><div class="castle-meta"><span role="status">${threat?`Amenaza <b>${index+1}/${m.situaciones.length}</b>`:'<b>¡Todas frenadas!</b>'}</span>${Object.keys(matches).length?'<button type="button" class="button ghost btn-small child-undo" id="castle-undo" data-answer-control>↶ Deshacer</button>':''}</div><div class="card-hand" role="group" aria-label="Tus cartas">${m.acciones.map((action,i)=>`<button type="button" class="hand-card choice-${(i+1)%4}" data-defend="${esc(action.id)}" ${threat?'data-answer-control':'disabled'}><span class="hand-card-icon" aria-hidden="true">${esc(action.icono)}</span><b>${esc(shortText(action))}</b></button>`).join('')}</div>`;
}
function bindCastle(m){
 document.querySelectorAll('[data-defend]').forEach(card=>card.onclick=()=>{
  if(busy||secondsRemaining()<=0||castleBusy)return;
  const matches=draftMini.matches||{},threat=m.situaciones.find(item=>!matches[item.id]);if(!threat)return;
  castleBusy=true;draftMini={matches:{...matches,[threat.id]:card.dataset.defend}};
  card.classList.add('played');document.getElementById('threat')?.classList.add('hit');sfx('zap');
  setTimeout(()=>{castleBusy=false;if(current?.stage==='mini'&&!stateAnswerFor('mini'))render()},450);
 });
 const undo=document.getElementById('castle-undo');
 if(undo)undo.onclick=()=>{if(busy||secondsRemaining()<=0||castleBusy)return;const matches={...(draftMini.matches||{})},last=[...m.situaciones].reverse().find(item=>matches[item.id]);if(last)delete matches[last.id];draftMini={matches};sfx('tap');render()};
}
function chooseGroup(m,id,group){
 if(secondsRemaining()<=0||busy||stateAnswerFor('mini'))return;
 draftMini={groups:{...(draftMini.groups||{}),[id]:group}};
 for(const other of document.querySelectorAll('[data-group]')){const selected=draftMini.groups?.[other.dataset.card]===other.dataset.group;other.classList.toggle('selected',selected);other.setAttribute('aria-pressed',String(selected));if(selected)bump(other)}
 const card=document.getElementById('child-item');if(card){card.classList.remove('is-safe','is-danger');card.classList.add('is-'+group)}
 sfx('pick');updateTimers();
 // Deal the next card like a swipe deck; the last one waits for "Enviar".
 if(card&&childStep<childItems(m).length-1){card.classList.add(group==='safe'?'fly-right':'fly-left');const step=childStep;setTimeout(()=>{if(current?.stage==='mini'&&childStep===step)childMove(m,1)},300)}
}
function bindSwipe(m){
 const card=document.getElementById('child-item');if(!card||m.tipo!=='clasificar'||stateAnswerFor('mini'))return;
 let start=null;
 const reset=()=>{start=null;card.classList.remove('dragging');card.style.transform='';card.style.removeProperty('--swipe')};
 card.onpointerdown=event=>{if(busy||secondsRemaining()<=0)return;start=event.clientX;try{card.setPointerCapture(event.pointerId)}catch(_){}card.classList.add('dragging')};
 card.onpointermove=event=>{if(start===null)return;const dx=event.clientX-start;card.style.transform=`translateX(${dx}px) rotate(${dx/14}deg)`;card.style.setProperty('--swipe',String(Math.max(-1,Math.min(1,dx/90))))};
 card.onpointerup=event=>{if(start===null)return;const dx=event.clientX-start;reset();if(Math.abs(dx)>70)chooseGroup(m,card.dataset.card,dx>0?'safe':'danger')};
 card.onpointercancel=reset;
}
function miniPayload(m){const payload={stage:'mini'},kind=miniKind(m);if(kind==='tocar')payload.selection=draftMini.selection;if(kind==='seleccionar')payload.selections=draftMini.selections;if(kind==='ordenar')payload.sequence=draftMini.sequence;if(kind==='clasificar')payload.groups=draftMini.groups;if(kind==='conectar')payload.matches=draftMini.matches;return payload}
function bindMini(m){
 if(m.tipo==='tocar')bindChoices('mini-choice',input=>{draftMini={selection:input.value}});
 if(m.tipo==='seleccionar')bindChoices('mini-choice',()=>{draftMini={selections:[...document.querySelectorAll('input[name="mini-choice"]:checked')].map(input=>input.value)};const candies=document.getElementById('bucket-candies');if(candies){candies.innerHTML=candyBucket();bump(document.getElementById('candy-bucket'))}});
 if(m.tipo==='atrapar')bindGhosts(m);
 if(m.tipo==='linterna')bindRoom(m);
 if(m.tipo==='defender')bindCastle(m);
 bindSwipe(m);
 document.querySelectorAll('[data-mini-step]').forEach(button=>button.onclick=()=>{if(secondsRemaining()<=0||busy)return;const id=button.dataset.miniStep,sequence=[...(draftMini.sequence||[])];if(sequence.includes(id))return;sequence.push(id);draftMini={sequence};sfx('pick');render();document.getElementById('cauldron')?.classList.add('splash')});
 const undo=document.getElementById('mini-undo');if(undo)undo.onclick=()=>{if(secondsRemaining()<=0||busy)return;draftMini={sequence:(draftMini.sequence||[]).slice(0,-1)};sfx('tap');render()};
 document.querySelectorAll('[data-group]').forEach(button=>button.onclick=()=>chooseGroup(m,button.dataset.card,button.dataset.group));
 document.querySelectorAll('[data-match-item]').forEach(button=>button.onclick=()=>{if(secondsRemaining()<=0||busy)return;draftMini={matches:{...(draftMini.matches||{}),[button.dataset.matchItem]:button.dataset.matchAction}};for(const other of document.querySelectorAll('[data-match-item]')){const selected=draftMini.matches?.[other.dataset.matchItem]===other.dataset.matchAction;other.classList.toggle('selected',selected);other.setAttribute('aria-pressed',String(selected));other.querySelector('.child-match-check').textContent=selected?'✓':''}bump(button);sfx('pick');updateTimers()});
 const prev=document.getElementById('child-prev');if(prev)prev.onclick=()=>childMove(m,-1);
 const next=document.getElementById('child-next');if(next)next.onclick=()=>childMove(m,1);
}
function miniSucceeded(m,sub){if(!sub)return false;const kind=miniKind(m);if(kind==='tocar')return sub.selection===m.respuesta;if(kind==='ordenar')return sub.sequence?.join('|')===m.ordenCorrecto.join('|');if(kind==='clasificar')return Object.entries(m.clasificacion).every(([id,value])=>sub.groups?.[id]===value);if(kind==='seleccionar')return sub.selections?.length===m.correctas.length&&sub.selections.every(id=>m.correctas.includes(id));if(kind==='conectar')return Object.entries(m.soluciones).every(([id,value])=>sub.matches?.[id]===value);return false}
function childMiniActions(m,submitted){
 if(submitted)return childWaiting();
 if(!childWizard(m))return submitArea(null,'Enviar');
 const last=childStep===childItems(m).length-1;
 return `<div class="child-nav child-actions"><button class="button ghost" id="child-prev" data-child-prev type="button" ${childStep===0?'disabled':''}>← Atrás</button>${last?'<button class="button primary" id="submit-answer" data-answer-submit type="button" disabled>Enviar ✓</button>':'<button class="button primary" id="child-next" data-child-next type="button" disabled>Siguiente →</button>'}<p class="answer-status child-helper" id="answer-status" role="status"></p></div>`;
}
function childRank(s){
 const top=s.ranking.slice(0,3),me=s.ranking.find(item=>item.id===s.personal?.id),shown=me&&!top.some(item=>item.id===me.id)?[...top,me]:top;
 const rows=`<div class="rank">${shown.map(player=>{const position=s.ranking.findIndex(item=>item.id===player.id)+1;return `<div class="rank-row ${position===1?'toprank':''} ${player.id===s.personal?.id?'is-me':''}"><span class="rank-num">${['🥇','🥈','🥉'][position-1]||position}</span><strong class="rank-name">${esc(player.avatar)} ${esc(player.name)}${player.id===s.personal?.id?' <small>(vos)</small>':''}</strong><b class="rank-points">${player.score} pts</b></div>`}).join('')}</div>`;
 return `${rows}${s.ranking.length>shown.length?`<details class="child-details"><summary>Ver todo el equipo</summary>${rankRows(s)}</details>`:''}`;
}
function detectSucceeded(c,sub){const correct=c.pistas.filter(item=>item.correcta);return !!sub&&sub.selections.length===correct.length&&sub.selections.every(id=>correct.some(item=>item.id===id))}
// Per-room progress kept on this phone: the win streak and the badge cards earned in each mission.
function runKey(){return 'dd_run_'+(session?.code||'')}
function loadRun(){try{const run=JSON.parse(localStorage.getItem(runKey()));if(run?.seen&&run.cards)return run}catch(_){}return {seen:{},streak:0,cards:{}}}
function saveRun(run){try{localStorage.setItem(runKey(),JSON.stringify(run))}catch(_){}}
function clearRun(){try{localStorage.removeItem(runKey())}catch(_){}}
// Counted once per stage, even when the reveal screen is drawn again by a live update.
function streakAfter(key,success){const run=loadRun();if(!(key in run.seen)){run.seen[key]=success;run.streak=success?run.streak+1:0;saveRun(run)}return run.streak}
function missionReward(s){
 const c=s.case,answers=s.personal.answers||{},crowns=[detectSucceeded(c,answers.detect),answers.decide?.selection===c.respuesta,miniSucceeded(c.miniJuego,answers.mini)];
 const run=loadRun(),key=String(s.caseIndex),count=crowns.filter(Boolean).length,saved=run.cards[key];
 if(!saved||saved.crowns!==count){run.cards[key]={icono:c.insignia?.icono||'⭐',nombre:c.insignia?.nombre||c.categoria,crowns:count,opened:!!saved?.opened};saveRun(run)}
 return {crowns,card:run.cards[key]};
}
function badgeCard(card){const [rarity,label]=rarities[card.crowns]||rarities[0];return `<div class="badge-card rarity-${rarity}" id="badge-card"><span class="badge-rarity">${label}</span><span class="badge-icon" aria-hidden="true">${esc(card.icono)}</span><b>${esc(card.nombre)}</b><span class="badge-crowns" aria-label="${card.crowns} de 3 calabazas">${'<i class="won">🎃</i>'.repeat(card.crowns)}${'<i>🎃</i>'.repeat(3-card.crowns)}</span></div>`}
function badgeCollection(s){
 const run=loadRun(),cards=Object.keys(run.cards).sort((a,b)=>a-b).map(key=>run.cards[key]);if(!cards.length)return '';
 const crowns=cards.reduce((total,card)=>total+card.crowns,0);
 return `<div class="badge-collection"><span class="badge-collection-title">Tu colección <b>🎃 ${crowns}/${s.totalCases*3}</b></span><div class="badge-row">${cards.map(card=>{const [rarity,label]=rarities[card.crowns]||rarities[0];return `<span class="badge-mini rarity-${rarity}"><span aria-hidden="true">${esc(card.icono)}</span><span class="sr-only">${esc(card.nombre)}, ${label}</span></span>`}).join('')}</div></div>`;
}
function childReveal(s){
 const c=s.case,stage=s.stage.replace('_reveal',''),sub=stateAnswerFor(stage),m=c.miniJuego;
 let title='',message='',result='',success=false,mascot='💡';
 if(stage==='detect'){
  const correct=c.pistas.filter(item=>item.correcta);success=detectSucceeded(c,sub);
  title=success?'¡Buenas pistas!':'Mirá las pistas';
  message='Estas señales nos invitan a pedir ayuda.';
  result=`<div class="child-reveal-pistas">${correct.map(item=>`<span>${esc(item.icono)} ${esc(shortText(item))}</span>`).join('')}</div>`;
 }
 if(stage==='decide'){
  success=sub?.selection===c.respuesta;title=success?'¡Buena decisión!':'Aprendemos juntos';
  message=c.consejoCorto||c.explicacion;
  const item=c.opciones.find(option=>option.id===c.respuesta);
  result=item?`<div class="child-safe-answer"><span>${esc(item.icono||'🛡️')}</span><b>${esc(shortText(item))}</b></div>`:'';
 }
 if(stage==='mini'){
  success=miniSucceeded(m,sub);title=success?'¡Reto superado!':'¡Ahora lo sabés!';
  message=m.explicacionCorta||m.explicacion;
  result=`<details class="child-details"><summary>Ver la solución</summary>${miniResult(m)}</details>`;
 }
 if(success)mascot='🌟';
 const speech=`${title}. ${message}`;
 // Points are scored when the room moves to the reveal, so compare with the score seen while answering.
 const gained=scoreMark?.key===`${s.caseIndex}:${stage}`?s.personal.score-scoreMark.score:0;
 const streak=streakAfter(`${s.caseIndex}:${stage}`,success);
 const chips=`${gained>0?`<span class="child-gain">+${gained} <span aria-hidden="true">🍬</span><span class="sr-only">puntos</span></span>`:''}${success&&streak>=2?`<span class="child-gain child-streak"><span aria-hidden="true">🔥</span> Racha x${streak}</span>`:''}`;
 return {success,html:`${success?confetti():''}<section class="panel child-panel child-result ${success?'child-win':''}">${childBurst(mascot)}<div class="child-task"><h2 id="child-task-title">${title}</h2>${speechControls(speech)}</div>${chips?`<div class="child-chips">${chips}</div>`:''}${result}${childBubble(message,'child-lesson')}<p class="child-helper">Esperá al equipo.</p></section>`};
}
function renderPlayer(){
 const s=current;if(!s){renderPlayerJoin();return}const c=s.case,me=s.personal;
 childReset(s);
 if(s.stage==='lobby'){
  clearRun();
  show(`<section class="panel waiting-card child-panel child-lobby"><span class="child-room">Sala <b>${esc(s.code)}</b></span><span class="child-lobby-avatar" aria-hidden="true">${esc(me.avatar)}</span><h2>¡Hola, ${esc(me.name)}!</h2><p>Esperá al equipo.</p><div class="waiting-dots" aria-hidden="true"><i></i><i></i><i></i></div><div class="child-lobby-steps"><span>🔎 Buscá</span><span>💡 Elegí</span><span>🎮 Jugá</span></div><button type="button" class="button ghost btn-small child-sound" id="sound-toggle" aria-pressed="${soundOn}">${soundOn?'🔊 Sonido: sí':'🔇 Sonido: no'}</button><span class="child-helper">Encendé calabazas 🎃 y ganá cartas en cada misión.</span></section>`);
  document.getElementById('sound-toggle').onclick=()=>{soundOn=!soundOn;try{localStorage.setItem('dd_sound',soundOn?'on':'off')}catch(_){}render();sfx('pick')};return;
 }
 if(['detect','decide','mini'].includes(s.stage))scoreMark={key:`${s.caseIndex}:${s.stage}`,score:me.score};
 if(s.stage==='detect'||s.stage==='decide'){
  initDraft();const detect=s.stage==='detect',sub=stateAnswerFor(s.stage),items=detect?c.pistas:c.opciones;
  const title=detect?'Buscá las pistas':'¿Qué harías?',context=c.relatoCorto||c.relato,hint=detect?'Elegí varias':'Elegí una';
  const speech=`${context}. ${title}. ${hint}. ${items.map(shortText).join('. ')}`;
  const choices=items.map((item,i)=>choiceCard(item,i,{name:detect?'pista':'decision',type:detect?'checkbox':'radio',selected:detect?draftDetect.includes(item.id):draftDecide===item.id,disabled:!!sub})).join('');
  show(`<section class="child-screen">${childTop(s)}<section class="panel child-panel child-question ${detect?'child-detect':'child-decide'}">${sub?childWaiting():`<div class="child-task"><div><h2 id="child-task-title">${esc(title)}</h2><p class="child-prompt">${hint}</p></div>${speechControls(speech)}</div>${childBubble(context,'child-context')}<div class="child-options choice-grid">${choices}</div>${submitArea(null,'Enviar')}`}</section></section>`);
  if(!sub){bindChoices(detect?'pista':'decision',input=>{if(detect)draftDetect=[...document.querySelectorAll('input[name="pista"]:checked')].map(item=>item.value);else draftDecide=input.value});document.getElementById('submit-answer').onclick=()=>sendAnswer(detect?{stage:'detect',selections:[...draftDetect]}:{stage:'decide',selection:draftDecide})}return;
 }
 if(s.stage==='mini'){
  initDraft();const m=c.miniJuego,sub=stateAnswerFor('mini'),wizard=childWizard(m),item=childItems(m)[childStep];
  const title=childMiniTitles[m.tipo]||m.titulo;
  const instruction=m.instruccionCorta||m.instruccion;
  const cards=m.tipo==='defender'?[...m.situaciones,...m.acciones]:(m.opciones||m.pasos||[]);
  const speech=`${title}. ${instruction}. ${wizard?shortText(item)+'. '+(m.tipo==='conectar'?m.acciones.map(shortText).join('. '):'Dulce: me cuida. Truco: atención.'):cards.map(shortText).join('. ')}`;
  show(`<section class="child-screen">${childTop(s)}<section class="panel child-panel child-mini child-mini-${m.tipo}">${sub?childWaiting():`<div class="child-task"><h2 id="child-task-title">${esc(title)}</h2>${speechControls(speech)}</div><p class="child-prompt">${esc(instruction)}</p>${miniGame(m,null)}${childMiniActions(m,null)}`}</section></section>`);
  if(!sub){bindMini(m);const submit=document.getElementById('submit-answer');if(submit)submit.onclick=()=>sendAnswer(miniPayload(m))}return;
 }
 if(s.stage.endsWith('_reveal')){const reveal=childReveal(s);if(show(`${childHud(s,false)}${reveal.html}`))sfx(reveal.success?'win':'learn');return}
 if(s.stage==='leaderboard'){
  // End of a mission: crowns for each stage won and a chest with this mission's badge card.
  const {crowns,card}=missionReward(s);
  show(`<section class="panel child-panel child-ranking child-win child-reward"><h2>¡Misión ${s.caseIndex+1} completa!</h2><div class="crown-row" role="img" aria-label="Encendiste ${crowns.filter(Boolean).length} de 3 calabazas">${crowns.map((won,i)=>`<span class="crown ${won?'won':''}"><b>🎃</b><small>${['🔎','💡','🎮'][i]}</small></span>`).join('')}</div>${card.opened?badgeCard(card):'<button type="button" class="chest" id="open-chest" aria-label="Abrir la calabaza sorpresa"><span class="chest-pumpkin" aria-hidden="true">🎃</span><span class="chest-tap">¡Tocá la calabaza!</span></button>'}${childRank(s)}<p class="child-helper">Esperá la próxima misión.</p></section>`);
  const chest=document.getElementById('open-chest');
  if(chest)chest.onclick=()=>{const run=loadRun();if(run.cards[s.caseIndex])run.cards[s.caseIndex].opened=true;saveRun(run);sfx('chest');render();document.getElementById('badge-card')?.classList.add('badge-reveal')};
  return;
 }
 if(s.stage==='final'){
  const position=s.ranking.findIndex(item=>item.id===me.id)+1;
  show(`${confetti()}<section class="panel child-panel child-ranking child-win child-final">${childBurst('🏆')}<h2>¡Misión cumplida!</h2>${position&&s.ranking.length>1?`<span class="child-gain">Puesto ${position} de ${s.ranking.length}</span>`:''}${badgeCollection(s)}${childRank(s)}<p class="child-helper">Lo aprendido es tu superpoder.</p></section>`);
 }
}

async function answer(payload){
 if(busy||!session||stateAnswerFor(payload.stage)||!responseComplete()||secondsRemaining()<=0)return;
 busy=true;updateTimers();
 try{await api('/api/responder',{code:session.code,token:session.token,...payload});sfx('send');
  // The response may arrive before its SSE update. Fetch authoritative state to avoid a second submission.
  const beforeSnapshot=current;
  const snapshot=await api('/api/estado?'+new URLSearchParams({codigo:session.code,token:session.token}));
  if(current===beforeSnapshot||!current||snapshot.serverNow>current.serverNow){current=snapshot;clockOffset=snapshot.serverNow-Date.now();render()}
 }finally{busy=false;updateTimers()}
}
async function sendAnswer(payload){try{await answer(payload)}catch(error){toast(error.message)}}
function render(){HOST_MODE?renderHost():renderPlayer()}
async function boot(){
 document.body.classList.add(HOST_MODE?'host-mode':'player-mode');
 try{soundOn=localStorage.getItem('dd_sound')!=='off';posterWifi=localStorage.getItem('dd_wifi')||''}catch(_){}
 session=stateSaved();
 if(HOST_MODE){try{catalog=await api('/api/catalogo')}catch(_){toast('No pudimos cargar el catálogo. Podés intentar crear una aventura corta.')}await refreshNetwork()}
 if(session){try{current=await api('/api/estado?'+new URLSearchParams({codigo:session.code,token:session.token}));clockOffset=current.serverNow-Date.now();render();connect()}catch(_){clearSession();render();toast('La sala anterior terminó. Creá una nueva aventura o ingresá a otro equipo.')}}else render();
}
window.addEventListener('pagehide',stopSpeech);
boot();
