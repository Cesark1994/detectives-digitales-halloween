'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../public/app.js'), 'utf8');
const cases = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../casos.json'), 'utf8'));

function frontend() {
  const now = 1_000_000;
  const timer = { textContent: '', classList: { toggle() {} } };
  const fill = { style: {}, classList: { toggle() {} } };
  const submit = { disabled: false };
  const control = { disabled: false };
  const childNext = { disabled: false };
  const childPrev = { disabled: false };
  const status = { textContent: '' };
  let requests = 0;
  const elements = { app: {}, toast: {}, 'answer-status': status, 'child-next': childNext, 'child-prev': childPrev };
  const context = vm.createContext({
    location: { pathname: '/jugar', hostname: 'localhost', protocol: 'http:', search: '' },
    document: {
      getElementById: id => elements[id] || null,
      querySelectorAll: selector => ({
        '[data-timer]': [timer],
        '[data-timer-fill]': [fill],
        '[data-answer-submit]': [submit],
        '[data-answer-control]': [control],
        '[data-child-next]': [childNext],
        '[data-child-prev]': [childPrev]
      })[selector] || []
    },
    window: { addEventListener() {} },
    URLSearchParams,
    Date: class extends Date { static now() { return now; } },
    setInterval() {},
    fetch() { requests++; throw new Error('Una respuesta bloqueada no debe llegar al servidor.'); },
    console
  });
  // Load the real application functions without connecting or rendering the startup screen.
  const withoutBoot = source.replace(/\bboot\(\);\s*$/, '');
  assert.notEqual(withoutBoot, source, 'El arranque del juego debe poder aislarse.');
  vm.runInContext(withoutBoot, context, { filename: 'public/app.js' });
  return {
    now, timer, fill, submit, control, childNext, childPrev, status,
    requests: () => requests,
    evaluate: expression => vm.runInContext(expression, context),
    set(values) {
      for (const [name, value] of Object.entries(values)) {
        vm.runInContext(`${name} = ${JSON.stringify(value)}`, context);
      }
    },
    read(expression) {
      return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context));
    }
  };
}

test('pantalla del jugador: muestra la pregunta del escenario y el contexto propio del reto',()=>{
 const app=frontend();
 const c={...cases[0],...cases[0].variantes[1]};
 app.set({current:{code:'TEST',stage:'decide',caseIndex:0,totalCases:3,endsAt:app.now+30000,case:c,personal:{score:0,answers:{}}}});
 app.evaluate(`
  var captured='';
  show=html=>{captured=html;return true};
  childTop=()=>'';speechControls=()=>'';bindChoices=()=>{};resetArcade=()=>{};
  document.getElementById=()=>({});
  renderPlayer();
 `);
 assert.ok(app.evaluate('captured').includes(c.pregunta),'La pregunta específica debe aparecer en el celular.');
 app.evaluate(`current.stage='mini'; bindMini=()=>{}; renderPlayer();`);
 const html=app.evaluate('captured');
 assert.ok(html.includes(c.miniJuego.titulo));
 assert.ok(html.includes(c.miniJuego.contexto));
 assert.ok(!html.includes(c.relato),'El minijuego presenta su propia situación.');
});

test('configuración: permite recorridos largos y conserva Todas las misiones al volver a mostrar el formulario',()=>{
 const app=frontend();
 app.set({catalog:{caseCount:18,missions:[],paces:{}},setupValues:{caseCount:'all',pace:'calm',maxPlayers:'6',order:'azar'}});
 app.evaluate(`var setupHtml=''; show=html=>{setupHtml=html};document.getElementById=()=>({});renderHostCreate();`);
 assert.equal(app.evaluate('setupValues.caseCount'),'all');
 assert.ok(app.evaluate('setupHtml').includes('value="all" selected'));
 for(const count of [12,15,18])assert.ok(app.evaluate('setupHtml').includes('value="'+count+'"'));
});

test('explicaciones visibles: tanto un acierto como un error muestran el motivo sin tocar otra tarjeta',()=>{
 const app=frontend();
 for(const correct of [true,false]){
  app.set({lastFeedback:{correct,text:'Tu código es privado y no se envía por chat.'}});
  const html=app.evaluate('feedbackPanel()');
  assert.ok(html.includes('Tu código es privado'));
  assert.ok(html.includes(correct?'¡Bien pensado!':'Aprendemos y seguimos'));
  assert.ok(html.includes('role="status"'));
 }
 const row={item:{id:'x',texto:'Mandar el código',porque:'Compartirlo permite entrar a tu cuenta.'},status:'mistake'};
 app.set({sampleRows:[row]});
 assert.ok(app.evaluate('verdictRows(sampleRows)').includes('<small class="verdict-explanation">Compartirlo permite entrar a tu cuenta.</small>'));
});

for(const type of ['chat','feed'])test(`juego ${type}: presenta mensajes o publicaciones y admite el formato de respuesta correcto`,()=>{
 const app=frontend();
 const m=cases.flatMap(c=>c.variantes).map(v=>v.miniJuego).find(m=>m.tipo===type);
 assert.ok(m);
 app.set({sampleMini:m,current:{code:'TEST',stage:'mini',caseIndex:0,endsAt:app.now+30000,personal:{answers:{}}}});
 const html=app.evaluate('miniGame(sampleMini,null)');
 assert.ok(html.includes(type==='chat'?'chat-simulator':'feed-simulator'));
 assert.ok(!html.includes('undefined'));
 assert.ok(html.includes(type==='chat'?'data-match-item':'data-group'));
 assert.equal(app.evaluate('miniKind(sampleMini)'),type==='chat'?'conectar':'clasificar');
});

const formats = [
  { type: 'tocar', complete: { selection: 'escudo' }, incomplete: {}, wrong: { selection: 'camara' }, payloadKey: 'selection' },
  { type: 'ordenar', complete: { sequence: ['guardar', 'bloquear', 'contar'] }, incomplete: { sequence: ['guardar'] }, wrong: { sequence: ['contar', 'guardar', 'bloquear'] }, payloadKey: 'sequence' },
  { type: 'clasificar', complete: { groups: { clave: 'safe', link: 'danger', adulto: 'safe' } }, incomplete: { groups: { clave: 'safe', link: 'danger' } }, wrong: { groups: { clave: 'safe', link: 'safe', adulto: 'safe' } }, payloadKey: 'groups' },
  { type: 'seleccionar', complete: { selections: ['distinta', 'larga'] }, incomplete: { selections: [] }, wrong: { selections: ['larga', 'chat'] }, payloadKey: 'selections' },
  { type: 'conectar', complete: { matches: { imagen: 'frenar', amigo: 'escuchar', continua: 'adulto' } }, incomplete: { matches: { imagen: 'frenar' } }, wrong: { matches: { imagen: 'adulto', amigo: 'escuchar', continua: 'frenar' } }, payloadKey: 'matches' },
  // The ghost round must finish before sending; catching nothing is still an answer.
  { type: 'atrapar', complete: { selections: ['casa', 'telefono', 'ubicacion', 'amiga'], done: true }, incomplete: { selections: ['casa', 'telefono', 'ubicacion', 'amiga'], done: false }, wrong: { selections: [], done: true }, payloadKey: 'selections' },
  // Every permission must be found with the flashlight before sending.
  { type: 'linterna', complete: { selections: ['contactos', 'mensajes'], found: ['camara', 'microfono', 'contactos', 'mensajes'] }, incomplete: { selections: ['contactos', 'mensajes'], found: ['contactos', 'mensajes'] }, wrong: { selections: ['camara'], found: ['camara', 'microfono', 'contactos', 'mensajes'] }, payloadKey: 'selections' },
  { type: 'pocion', complete: { sequence: ['frenar', 'origen', 'comparar'] }, incomplete: { sequence: ['frenar'] }, wrong: { sequence: ['comparar', 'origen', 'frenar'] }, payloadKey: 'sequence' },
  { type: 'defender', complete: { matches: { codigo: 'privado', pedido: 'confirmar', alerta: 'revisar' } }, incomplete: { matches: { codigo: 'privado' } }, wrong: { matches: { codigo: 'revisar', pedido: 'confirmar', alerta: 'privado' } }, payloadKey: 'matches' }
];

for (const fixture of formats) {
  test(`interfaz ${fixture.type}: distingue una respuesta completa de una respuesta acertada`, () => {
    const app = frontend();
    const mini = cases.find(item => item.miniJuego.tipo === fixture.type).miniJuego;
    app.set({ draftMini: fixture.incomplete });
    assert.equal(app.evaluate(`miniComplete(${JSON.stringify(mini)})`), false);
    app.set({ draftMini: fixture.complete });
    assert.equal(app.evaluate(`miniComplete(${JSON.stringify(mini)})`), true);
    assert.equal(app.evaluate(`miniSucceeded(${JSON.stringify(mini)}, ${JSON.stringify(fixture.complete)})`), true);
    app.set({ draftMini: fixture.wrong });
    assert.equal(app.evaluate(`miniComplete(${JSON.stringify(mini)})`), true, 'Una respuesta incorrecta también se puede confirmar.');
    assert.equal(app.evaluate(`miniSucceeded(${JSON.stringify(mini)}, ${JSON.stringify(fixture.wrong)})`), false);
    assert.equal(app.evaluate(`miniSucceeded(${JSON.stringify(mini)}, null)`), false);
  });

  test(`interfaz ${fixture.type}: envía únicamente la respuesta del formato actual`, () => {
    const app = frontend();
    const mini = cases.find(item => item.miniJuego.tipo === fixture.type).miniJuego;
    const staleFields = {
      selection: 'respuesta-anterior', sequence: ['paso-anterior'], groups: { anterior: 'danger' },
      selections: ['tarjeta-anterior'], matches: { anterior: 'accion-anterior' }
    };
    app.set({ draftMini: { ...staleFields, ...fixture.complete } });
    assert.deepEqual(app.read(`miniPayload(${JSON.stringify(mini)})`), {
      stage: 'mini', [fixture.payloadKey]: fixture.complete[fixture.payloadKey]
    });
  });
}

test('reconexión: restaura tarjetas múltiples y conexiones sin modificar las respuestas registradas', () => {
  const app = frontend();
  const selections = { selections: ['larga', 'distinta'], scored: true };
  app.set({ current: { caseIndex: 3, stage: 'mini', personal: { answers: { mini: selections } } } });
  app.evaluate('initDraft()');
  assert.deepEqual(app.read('draftMini'), { selections: ['larga', 'distinta'] });
  app.evaluate('draftMini.selections.push("chat")');
  assert.deepEqual(app.read('current.personal.answers.mini'), selections);

  const matches = { matches: { imagen: 'frenar', amigo: 'escuchar', continua: 'adulto' }, scored: true };
  app.set({ current: { caseIndex: 5, stage: 'mini', personal: { answers: { mini: matches } } } });
  app.evaluate('initDraft()');
  assert.deepEqual(app.read('draftMini'), { matches: matches.matches });
  app.evaluate('draftMini.matches.imagen = "adulto"');
  assert.deepEqual(app.read('current.personal.answers.mini'), matches);
});

function wizardFrontend(type) {
  const app = frontend();
  const mini = cases.find(item => item.miniJuego.tipo === type).miniJuego;
  const state = {
    code: 'KIDS', caseIndex: type === 'clasificar' ? 2 : 5, stage: 'mini',
    endsAt: app.now + 60_000, serverNow: app.now, stageDurationMs: 60_000,
    case: { miniJuego: mini }, personal: { answers: {} }
  };
  app.set({ current: state, session: { code: 'KIDS', token: 'token-de-prueba' } });
  app.evaluate('render = () => {}; initDraft(); childReset(current)');
  return { app, mini, state };
}

for (const type of ['clasificar', 'conectar']) {
  test(`pasos infantiles ${type}: una tarjeta elegida permite avanzar y el último paso nunca se envía solo`, () => {
    const { app, mini } = wizardFrontend(type);
    const items = type === 'clasificar' ? mini.tarjetas : mini.situaciones;
    const key = type === 'clasificar' ? 'groups' : 'matches';
    const answers = type === 'clasificar' ? mini.clasificacion : mini.soluciones;
    assert.equal(app.evaluate(`childStepReady(${JSON.stringify(mini)})`), false);
    app.evaluate(`childMove(${JSON.stringify(mini)}, 1)`);
    assert.equal(app.evaluate('childStep'), 0, 'No se debe saltar una tarjeta sin elegir.');

    const draft = {};
    for (let index = 0; index < items.length; index++) {
      draft[items[index].id] = answers[items[index].id];
      app.set({ draftMini: { [key]: { ...draft } } });
      assert.equal(app.evaluate('childStep'), index);
      assert.equal(app.evaluate(`childStepReady(${JSON.stringify(mini)})`), true);
      if (index + 1 < items.length) {
        assert.equal(app.evaluate('responseComplete()'), false, 'Las respuestas parciales no se pueden enviar.');
        app.evaluate(`childMove(${JSON.stringify(mini)}, 1)`);
      }
    }
    assert.equal(app.evaluate('responseComplete()'), true);
    app.evaluate(`childMove(${JSON.stringify(mini)}, 1)`);
    assert.equal(app.evaluate('childStep'), items.length - 1);
    assert.equal(app.requests(), 0, 'Llegar al final muestra Enviar, pero no envía una respuesta automáticamente.');
  });

  test(`pasos infantiles ${type}: volver, corregir y recibir una actualización conserva el trabajo local`, () => {
    const { app, mini, state } = wizardFrontend(type);
    const items = type === 'clasificar' ? mini.tarjetas : mini.situaciones;
    const key = type === 'clasificar' ? 'groups' : 'matches';
    const correct = type === 'clasificar' ? mini.clasificacion : mini.soluciones;
    const first = items[0].id;
    const original = correct[first];
    app.set({ draftMini: { [key]: { [first]: original } } });
    app.evaluate(`childMove(${JSON.stringify(mini)}, 1); childMove(${JSON.stringify(mini)}, -1)`);
    assert.equal(app.evaluate('childStep'), 0);
    const revised = type === 'clasificar' ? (original === 'safe' ? 'danger' : 'safe') : mini.acciones.find(item => item.id !== original).id;
    app.set({ draftMini: { [key]: { [first]: revised } } });
    app.evaluate(`childMove(${JSON.stringify(mini)}, 1)`);
    app.set({ current: { ...state, serverNow: app.now + 1000, submitted: 1 } });
    app.evaluate('initDraft(); childReset(current)');
    assert.equal(app.evaluate('childStep'), 1, 'La respuesta de otro jugador no debe devolver al chico al primer paso.');
    assert.equal(app.read('draftMini')[key][first], revised, 'El cambio local sigue disponible hasta confirmar.');
    app.set({ current: { ...state, caseIndex: state.caseIndex + 1 } });
    app.evaluate('initDraft(); childReset(current)');
    assert.equal(app.evaluate('childStep'), 0);
    assert.deepEqual(app.read('draftMini'), {});
  });

  test(`pasos infantiles ${type}: al vencer el tiempo se bloquea avanzar y enviar`, async () => {
    const { app, mini, state } = wizardFrontend(type);
    const key = type === 'clasificar' ? 'groups' : 'matches';
    const answers = type === 'clasificar' ? mini.clasificacion : mini.soluciones;
    app.set({ draftMini: { [key]: answers }, current: { ...state, endsAt: app.now } });
    app.evaluate('updateTimers()');
    assert.equal(app.submit.disabled, true);
    assert.equal(app.childNext.disabled, true);
    app.evaluate(`childMove(${JSON.stringify(mini)}, 1)`);
    assert.equal(app.evaluate('childStep'), 0);
    await app.evaluate(`answer(miniPayload(${JSON.stringify(mini)}))`);
    assert.equal(app.requests(), 0);
  });

  test(`pasos infantiles ${type}: un envío pendiente o confirmado no permite cambiar de tarjeta ni reenviar`, async () => {
    const { app, mini, state } = wizardFrontend(type);
    const key = type === 'clasificar' ? 'groups' : 'matches';
    const answers = type === 'clasificar' ? mini.clasificacion : mini.soluciones;
    const submitted = { [key]: answers, scored: false };
    app.set({ draftMini: { [key]: answers }, busy: true });
    app.evaluate(`childMove(${JSON.stringify(mini)}, 1)`);
    assert.equal(app.evaluate('childStep'), 0);
    app.set({ busy: false, current: { ...state, personal: { answers: { mini: submitted } } } });
    app.evaluate(`childMove(${JSON.stringify(mini)}, 1); updateTimers()`);
    assert.equal(app.evaluate('childStep'), 0);
    assert.equal(app.childNext.disabled, true);
    await app.evaluate(`answer(miniPayload(${JSON.stringify(mini)}))`);
    assert.equal(app.requests(), 0, 'Una respuesta ya confirmada no se vuelve a enviar.');
    assert.deepEqual(app.read('current.personal.answers.mini'), submitted);
  });
}

test('cambio de misión: descarta el borrador anterior y restaura respuestas simples sin compartir arrays', () => {
  const app = frontend();
  app.set({ draftDetect: ['vieja'], draftDecide: 'vieja', draftMini: { selection: 'vieja' }, current: { caseIndex: 1, stage: 'detect', personal: { answers: {} } } });
  app.evaluate('initDraft()');
  assert.deepEqual(app.read('({draftDetect,draftDecide,draftMini})'), { draftDetect: [], draftDecide: '', draftMini: {} });

  app.set({ current: { caseIndex: 1, stage: 'detect', personal: { answers: { detect: { selections: ['foto'] } } } } });
  app.evaluate('initDraft(); draftDetect.push("secreto")');
  assert.deepEqual(app.read('current.personal.answers.detect.selections'), ['foto']);

  app.set({ current: { caseIndex: 1, stage: 'decide', personal: { answers: { decide: { selection: 'b' } } } } });
  app.evaluate('initDraft()');
  assert.equal(app.evaluate('draftDecide'), 'b');

  app.set({ current: { caseIndex: 1, stage: 'mini', personal: { answers: { mini: { sequence: ['guardar', 'bloquear', 'contar'] } } } } });
  app.evaluate('initDraft(); draftMini.sequence.reverse()');
  assert.deepEqual(app.read('current.personal.answers.mini.sequence'), ['guardar', 'bloquear', 'contar']);
});

test('juegos arcade: al volver a jugar, la ronda, la linterna y el castillo empiezan de cero', () => {
  const app = frontend();
  app.set({ current: { code: 'ABCD', caseIndex: 4, stage: 'mini', personal: { answers: {} } } });
  app.evaluate('initDraft(); arcade = { key: arcadeKey(), done: true }; lamp = { key: arcadeKey(), x: 10, y: 10 }; lastThreat = "ABCD:4:minicodigo"');
  assert.equal(app.evaluate('ghostState() !== null'), true);
  // "Volver a jugar" returns to the lobby and then to the first mission.
  app.set({ current: { code: 'ABCD', caseIndex: 0, stage: 'detect', personal: { answers: {} } } });
  app.evaluate('initDraft()');
  assert.deepEqual(app.read('[arcade, lamp, lastThreat]'), [null, null, '']);
});

test('duraciones: muestra segundos y minutos completos o combinados', () => {
  const app = frontend();
  for (const [milliseconds, expected] of [[0, '0 s'], [30_000, '30 s'], [60_000, '1 min'], [90_000, '1 min 30 s'], [120_000, '2 min']]) {
    assert.equal(app.evaluate(`formatDuration(${milliseconds})`), expected);
  }
});

test('cronómetro: usa el reloj del servidor, bloquea al vencer e impide enviar una respuesta completa', async () => {
  const app = frontend();
  app.set({
    session: { code: 'ABCD', token: 'token-de-prueba' }, draftDecide: 'b', clockOffset: 5000,
    current: { stage: 'decide', endsAt: app.now + 5500, stageDurationMs: 30_000, personal: { answers: {} } }
  });
  app.evaluate('updateTimers()');
  assert.equal(app.timer.textContent, '⏱ 00:01');
  assert.equal(app.submit.disabled, false);
  assert.equal(app.control.disabled, false);

  app.set({ clockOffset: 5500 });
  app.evaluate('updateTimers()');
  assert.equal(app.timer.textContent, '⏱ 00:00');
  assert.equal(app.fill.style.width, '0%');
  assert.equal(app.submit.disabled, true);
  assert.equal(app.control.disabled, true);
  assert.match(app.status.textContent, /tiempo terminado|terminó el tiempo/i);
  await app.evaluate('answer({stage:"decide",selection:"b"})');
  assert.equal(app.requests(), 0, 'La respuesta vencida no debe enviarse aunque se invoque el controlador.');
});

test('cronómetro: un minuto se lee 01:00 y solo habilita una selección completa cuando no está enviándose', () => {
  const app = frontend();
  app.set({ current: { stage: 'detect', endsAt: app.now + 60_000, stageDurationMs: 60_000, personal: { answers: {} } } });
  app.evaluate('updateTimers()');
  assert.equal(app.timer.textContent, '⏱ 01:00');
  assert.equal(app.fill.style.width, '100%');
  assert.equal(app.submit.disabled, true);
  app.set({ draftDetect: ['foto'] });
  app.evaluate('updateTimers()');
  assert.equal(app.submit.disabled, false);
  app.set({ busy: true });
  app.evaluate('updateTimers()');
  assert.equal(app.submit.disabled, true);
  assert.equal(app.control.disabled, true);
});

async function startAnswerWithPendingSnapshot(app) {
  app.set({
    session: { code: 'ABCD', token: 'token-de-prueba' },
    draftDetect: ['foto'],
    current: {
      stage: 'detect', serverNow: app.now, endsAt: app.now + 45_000,
      stageDurationMs: 45_000, personal: { answers: {} }
    }
  });
  app.evaluate(`
    globalThis.snapshotRequested = new Promise(resolve => { globalThis.markSnapshotRequested = resolve; });
    globalThis.pendingSnapshot = new Promise(resolve => { globalThis.resolveSnapshot = resolve; });
    globalThis.testApiCalls = [];
    api = async route => {
      testApiCalls.push(route);
      if (route === '/api/responder') return {ok:true};
      markSnapshotRequested();
      return pendingSnapshot;
    };
    render = () => {};
  `);
  const completion = app.evaluate('answer({stage:"detect",selections:["foto"]})');
  await app.evaluate('snapshotRequested');
  assert.equal(app.read('testApiCalls').length, 2, 'La respuesta ya fue enviada y la consulta de estado sigue pendiente.');
  return { completion };
}

for (const snapshotOffset of [1000, 2000]) {
test(`respuesta y eventos: una consulta ${snapshotOffset === 1000 ? 'antigua' : 'del mismo milisegundo'} no hace retroceder la etapa ni el reloj del SSE que llegó después`, async () => {
  const app = frontend();
  const { completion } = await startAnswerWithPendingSnapshot(app);
  const newerEvent = {
    stage: 'decide', serverNow: app.now + 2000, endsAt: app.now + 32_000,
    stageDurationMs: 30_000, personal: { answers: { detect: { selections: ['foto'] } } }
  };
  // An SSE message advances the room while the earlier GET response is still in flight.
  app.set({ current: newerEvent, clockOffset: 2000 });
  app.evaluate(`resolveSnapshot(${JSON.stringify({
    stage: 'detect', serverNow: app.now + snapshotOffset, endsAt: app.now + 45_000,
    stageDurationMs: 45_000, personal: { answers: { detect: { selections: ['foto'] } } }
  })})`);
  await completion;
  assert.deepEqual(app.read('current'), newerEvent);
  assert.equal(app.evaluate('clockOffset'), 2000, 'Debe conservarse la sincronización de la actualización más reciente.');
  assert.equal(app.evaluate('busy'), false, 'El envío termina aunque se descarte la consulta antigua.');
});
}

test('respuesta y eventos: una consulta posterior al último SSE sí actualiza la etapa y sincroniza el reloj', async () => {
  const app = frontend();
  const { completion } = await startAnswerWithPendingSnapshot(app);
  app.set({
    current: {
      stage: 'detect_reveal', serverNow: app.now + 1000, endsAt: 0,
      stageDurationMs: 0, personal: { answers: { detect: { selections: ['foto'] } } }
    },
    clockOffset: 1000
  });
  const newerSnapshot = {
    stage: 'decide', serverNow: app.now + 2000, endsAt: app.now + 32_000,
    stageDurationMs: 30_000, personal: { answers: { detect: { selections: ['foto'] } } }
  };
  app.evaluate(`resolveSnapshot(${JSON.stringify(newerSnapshot)})`);
  await completion;
  assert.deepEqual(app.read('current'), newerSnapshot);
  assert.equal(app.evaluate('clockOffset'), 2000);
  assert.equal(app.timer.textContent, '⏱ 00:30');
  assert.equal(app.evaluate('busy'), false);
});

