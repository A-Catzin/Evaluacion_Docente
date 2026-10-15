// Offline Chrome QA: run with Node 22 in a scrubbed environment; bwrap enforces no external network.
// QA_BASELINE=1 runs the pinned old deployment for an expected stale-numeric-hydration RED.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const root = new URL('../../', import.meta.url);
const baseline = process.env.QA_BASELINE === '1';
assert.ok(process.env.QA_BASELINE === undefined || baseline, 'QA_BASELINE must be 1 or absent');
const path = baseline ? '/tmp/sed360-baseline-component-20261013.astro' : new URL('src/components/VersionedInstrumentCapture.astro', root);
const source = readFileSync(path, 'utf8');
assert.equal(createHash('sha256').update(source).digest('hex'), baseline
  ? '97e334bdadb25d2f01b0a020990b7b5c88ec6c56ee76d062d93afa8254d7d44c'
  : 'c2cd8dcf1a52ccea45610dea861f16831da36cf4c711eae4d44770c200cea60e');
const match = source.match(/<script is:inline define:vars=[^\n]*>([\s\S]*?)<\/script>/);
assert.ok(match, 'actual inline component script required');
const escaped = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const literal = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const ids = Array.from({ length: 5 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const sectionId = '10000000-0000-4000-8000-000000000001';
const versionId = '20000000-0000-4000-8000-000000000001';
const definition = { purpose: 'observation', version_id: versionId, sections: [
  { id: sectionId, items: ids.map(id => ({ id, na_eligible: true })) }
] };
const props = { definitionJson: JSON.stringify(definition), cuatrimestreId: 42,
  groupsJson: JSON.stringify([{ docente_id: 7, asignatura_id: 9, clave: 'SYN' }]),
  subjectsJson: JSON.stringify([{ id: 9, nombre: 'Synthetic' }]),
  sourceRecordId: null, allowReevaluation: false, returnUrl: 'about:blank' };
const metadata = { strengths: 'Synthetic strength', priority_area: 'Synthetic priority', recommendation: 'Synthetic recommendation', general_observations: 'Synthetic observations' };
const draft = { asignatura_id: 9, grupo: 'SYN', answers: ids.map((id, index) => ({
  item_id: id, value: index === 1 ? 'na' : 1,
  na_reason: index === 0 ? 'stale hidden reason' : index === 1 ? '  genuine reason  ' : null
})), evidence: [{ section_id: sectionId, evidence: 'Synthetic evidence' }], metadata };
const expectedAnswers = draft.answers.map(answer => ({ ...answer, na_reason: answer.value === 'na' ? 'genuine reason' : null }));
// The fixture, stub, component and verifier execute in that order on an inert data: document.
const html = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'">
<form id="versioned-instrument-form"><select id="instrument-docente"><option value="7" selected>synthetic</option></select>
<select id="instrument-asignatura"><option value="">select</option></select><select id="instrument-grupo"><option value="">select</option></select>
${definition.sections[0].items.map(item => `<div data-item="${item.id}"><input type="radio" name="${item.id}" value="1"><input type="radio" name="${item.id}" value="na"><label data-na-reason="${item.id}" class="hidden"><textarea></textarea></label></div>`).join('')}
<textarea data-evidence="${sectionId}"></textarea><textarea id="metadata-strengths"></textarea><textarea id="metadata-priority"></textarea><textarea id="metadata-recommendation"></textarea><textarea id="metadata-general"></textarea>
<div id="na-summary"></div><p id="instrument-draft-status"></p><p id="instrument-message"></p><button type="submit">submit</button></form>
<div id="qa-result" data-result="pending"></div>
<script>window.__qa={calls:[],errors:[]};window.addEventListener('error',e=>window.__qa.errors.push('script-error'));
window.fetch=async (url,init={})=>{const route=String(url).split('?')[0];const method=init.method||'GET';
if(!['/api/instrumentos/draft','/api/instrumentos/submit'].includes(route)){window.__qa.errors.push('unexpected-route');throw Error('unexpected-route')}
let body=null;try{body=init.body?JSON.parse(init.body):null}catch{window.__qa.errors.push('invalid-body');throw Error('invalid-body')}
window.__qa.calls.push({route,method,body});
if(route==='/api/instrumentos/draft'&&method==='GET')return {ok:true,json:async()=>({draft:{draft:JSON.parse(${escaped(JSON.stringify(draft))})}})};
if(route==='/api/instrumentos/draft'&&method==='PUT')return {ok:true,json:async()=>({})};
if(route==='/api/instrumentos/submit'&&method==='POST')return {ok:false,status:400,json:async()=>({error:'synthetic rejection'})};
window.__qa.errors.push('unexpected-method');throw Error('unexpected-method')};</script>
<script>${Object.entries(props).map(([key, value]) => `const ${key}=${escaped(value)};`).join('\n')}
${match[1]}</script>
<script>
(async()=>{
 const marker=document.getElementById('qa-result');
 const wait=async predicate=>{for(let n=0;n<100;n++){if(predicate())return true;await new Promise(resolve=>setTimeout(resolve,20))}return false};
 const fail=code=>{marker.dataset.result=code;throw Error(code)};
 const same=(actual,expected)=>JSON.stringify(actual)===JSON.stringify(expected);
 const items=[...document.querySelectorAll('[data-item]')];
 if(!await wait(()=>document.getElementById('instrument-draft-status').textContent==='Borrador recuperado.'))fail('hydration-timeout');
 if(items[0].querySelector('textarea').value!==''||!items[0].querySelector('[data-na-reason]').classList.contains('hidden'))fail('stale-numeric-hydration');
 if(!same(items.map(item=>item.querySelector('input:checked')?.value),['1','na','1','1','1']))fail('hydrated-answers');
 if(items[1].querySelector('textarea').value!=='genuine reason'||items[1].querySelector('[data-na-reason]').classList.contains('hidden'))fail('genuine-na-reason');
 if(!document.getElementById('na-summary').textContent.includes('1 de 5'))fail('na-summary');
 const item=items[0],reason=item.querySelector('textarea');
 reason.value=' stale again ';
 const na=item.querySelector('input[value="na"]');na.checked=true;na.dispatchEvent(new Event('change',{bubbles:true}));
 reason.value='  actual  ';
 const numeric=item.querySelector('input[value="1"]');numeric.checked=true;numeric.dispatchEvent(new Event('change',{bubbles:true}));
 if(reason.value!==''||!item.querySelector('[data-na-reason]').classList.contains('hidden'))fail('toggle-clear');
 reason.value=' injected stale ';reason.dispatchEvent(new Event('input',{bubbles:true}));
 if(!await wait(()=>window.__qa.calls.some(call=>call.method==='PUT')))fail('put-timeout');
 const saved=window.__qa.calls.find(call=>call.method==='PUT')?.body;
 if(!same(saved?.draft?.answers,${literal(expectedAnswers)})||
    !same(saved?.draft?.evidence,${literal(draft.evidence)})||
    !same(saved?.draft?.metadata,${literal(metadata)})||
    saved?.version_id!==${escaped(versionId)}||saved?.draft?.grupo!=='SYN'||saved?.draft?.asignatura_id!==9)fail('put-payload');
 document.getElementById('versioned-instrument-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 if(!await wait(()=>window.__qa.calls.some(call=>call.method==='POST')))fail('post-timeout');
 const submitted=window.__qa.calls.find(call=>call.method==='POST')?.body;
 if(!same(submitted?.answers,${literal(expectedAnswers)})||
    !same(submitted?.evidence,${literal(draft.evidence)})||
    !same(submitted?.metadata,${literal(metadata)})||
    submitted?.version_id!==${escaped(versionId)}||submitted?.grupo!=='SYN'||submitted?.asignatura_id!==9)fail('post-payload');
 if(!same(window.__qa.calls.map(({route,method})=>[route,method]),
    [['/api/instrumentos/draft','GET'],['/api/instrumentos/draft','PUT'],['/api/instrumentos/submit','POST']])||
    window.__qa.errors.length||location.protocol!=='data:')fail('unexpected-network-or-script');
 marker.dataset.result='pass';
})().catch(()=>{const marker=document.getElementById('qa-result');if(marker.dataset.result==='pending')marker.dataset.result='qa-exception'});
</script>`;

// The shell guard executes inside bwrap, before Chrome: fail closed on any non-lo
// interface or non-loopback default route. Loopback stays inside the namespace.
const guard = `set -eu
[ "$(id -u)" -eq 1000 ] || exit 80
awk 'NR>2 {sub(/:$/, "", $1); if ($1 != "lo") bad=1; count++} END {if (bad || count != 1) exit 81}' /proc/net/dev || exit 81
awk 'NR>1 && $2=="00000000" && $1!="lo" {found=1} END {if (found) exit 83}' /proc/net/route || exit 83
awk '$1=="00000000000000000000000000000000" && $2=="00" && $10!="lo" {found=1} END {if (found) exit 84}' /proc/net/ipv6_route || exit 84
exec /usr/bin/google-chrome "$@"`;
const args = ['--unshare-net', '--unshare-pid', '--die-with-parent', '--ro-bind', '/', '/',
  '--tmpfs', '/home', '--tmpfs', '/run', '--tmpfs', '/tmp', '--dev-bind', '/dev', '/dev',
  '--tmpfs', '/dev/shm', '--proc', '/proc', '--', 'env', '-i', 'PATH=/usr/bin:/bin', 'HOME=/tmp',
  '/bin/sh', '-c', guard, 'qa-chrome', '--headless=new', '--dump-dom', '--virtual-time-budget=5000',
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--disable-extensions', '--disable-sync', '--disable-component-update', '--disable-quic',
  '--disable-features=MediaRouter', '--proxy-server=http=127.0.0.1:1;https=127.0.0.1:1',
  '--proxy-bypass-list=<-loopback>', '--user-data-dir=/tmp/instrument-qa',
  'data:text/html;charset=utf-8,' + encodeURIComponent(html)];

test('isolated Chrome executes authentic inline draft capture', { timeout: 20000 }, async () => {
  let output = '', stderr = '', overflow = false, timedOut = false;
  let result, closed = false;
  {
    const child = spawn('/usr/bin/bwrap', args,
      { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const killGroup = () => { if (!closed && child.pid && child.exitCode === null && child.signalCode === null) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    } };
    child.stdout.on('data', chunk => {
      if (overflow) return;
      if (output.length + chunk.length > 2_000_000) { overflow = true; killGroup(); return; }
      output += chunk.toString();
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-1024); });
    const close = new Promise(resolve => {
      let error;
      child.once('error', cause => { error = cause; });
      child.once('close', (code, signal) => { closed = true; resolve({ code, signal, error }); });
    });
    const timer = setTimeout(() => { timedOut = true; killGroup(); }, 15000);
    let limit;
    try {
      result = await Promise.race([close, new Promise(resolve => {
        limit = setTimeout(() => { killGroup(); resolve(null); }, 18000);
      })]);
    } finally { clearTimeout(timer); clearTimeout(limit); }
  }
  assert.ok(result, 'isolated Chrome did not close');
  if (result.error) throw result.error;
  assert.equal(timedOut, false, 'isolated Chrome timed out');
  assert.equal(overflow, false, 'Chrome DOM exceeded output cap');
  // Do not include Chrome stderr or document content in test diagnostics.
  assert.equal(result.code, 0, `isolated Chrome failed (signal ${result.signal || 'none'}; stderr captured ${stderr.length} chars)`);
  const markers = [...output.matchAll(/<div id="qa-result" data-result="([a-z-]+)"\s*><\/div>/g)];
  assert.equal(markers.length, 1, 'exactly one QA marker required');
  assert.equal(markers[0][1], 'pass', `browser QA result: ${markers[0][1]}`);
});
