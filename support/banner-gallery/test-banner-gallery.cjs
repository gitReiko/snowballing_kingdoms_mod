// Integration checks using an installed Chromium browser; no npm dependencies.
// node support/banner-gallery/test-banner-gallery.cjs [path-to-msedge-or-chrome]
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '../..');
const browserPath = process.argv[2] || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, socket, temp;
const pending = new Map();
const errors = [];
let nextId = 0;
function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {pending.delete(id);reject(new Error('CDP timeout: ' + method));}, 30000);
    pending.set(id, {resolve:value=>{clearTimeout(timeout);resolve(value);},reject:error=>{clearTimeout(timeout);reject(error);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {expression,returnByValue:true,awaitPromise:true,userGesture:true});
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(`(()=>{try{return !!(${expression});}catch{return false;}})()`)) return;
    await delay(150);
  }
  throw new Error('Wait timed out: ' + expression + (errors.length ? '\n'+errors.join('\n') : ''));
}
async function importFile(file) {
  const doc = await send('DOM.getDocument');
  const input = await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#xmlFile'});
  await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[file]});
}
async function run() {
  const html = await fs.readFile(path.join(__dirname,'banner-gallery.html'),'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  new (require('node:vm').Script)(script);
  const native = JSON.parse(html.match(/<script id="native-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(Object.keys(native.colors).length,158);
  assert.equal(Object.keys(native.assets).length,272);
  temp = await fs.mkdtemp(path.join(os.tmpdir(),'snowballs-gallery-test-'));
  browser = spawn(browserPath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--no-sandbox','--disable-crash-reporter','--remote-debugging-port=0','--user-data-dir='+temp],{windowsHide:true,stdio:'ignore'});
  browser.on('error',error=>errors.push(error.message));
  let port;
  for(let i=0;i<100;i++) {try {port=(await fs.readFile(path.join(temp,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch {await delay(150);}}
  if(!port)throw new Error('Browser did not start. '+errors.join('; '));
  const url=pathToFileURL(path.join(__dirname,'banner-gallery.html')).href;
  const target=await (await fetch('http://127.0.0.1:'+port+'/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
    const response=JSON.parse(event.data);
    if(response.id) {const job=pending.get(response.id);if(job){pending.delete(response.id);response.error?job.reject(new Error(response.error.message)):job.resolve(response.result);}}
    if(response.method==='Runtime.exceptionThrown')errors.push(response.params.exceptionDetails.exception?.description||response.params.exceptionDetails.text);
  });
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await until("typeof state !== 'undefined' && state.records.length === 1402");
  assert.deepEqual(await evaluate('({total:state.records.length,categories:state.categories.size,hd:state.records.filter(r=>r.hd).length,cards:document.querySelectorAll(".banner-card").length})'),{total:1402,categories:77,hd:502,cards:48});
  assert.deepEqual(await evaluate('({lang:document.documentElement.lang,title:document.title,load:$("importXml").textContent,toggle:$("languageToggle").textContent})'),{lang:'en',title:'Bannerlord · Banner gallery',load:'Load XML',toggle:'Беларуская'});
  assert.equal(await evaluate('Object.values(translations).every(pair=>pair.length===2&&pair.every(text=>typeof text==="string"&&text.length>0))'),true);
  assert.equal(await evaluate('[...document.querySelectorAll("[data-i18n], [data-i18n-aria], [data-i18n-placeholder]")].every(node=>[node.dataset.i18n,node.dataset.i18nAria,node.dataset.i18nPlaceholder].filter(Boolean).every(key=>Object.hasOwn(translations,key)))'),true);
  assert.equal(await evaluate('state.records.filter(r=>{try{parseBanner(r.code);return false;}catch{return true;}}).length'),0);
  await until('document.querySelectorAll(".preview canvas").length >= 6');
  const screenshot=await send('Page.captureScreenshot',{format:'png'});
  const screenshotPath=path.join(temp,'gallery-desktop.png');
  await fs.writeFile(screenshotPath,Buffer.from(screenshot.data,'base64'));
  console.log('Screenshot: '+screenshotPath);
  assert.equal(await evaluate('(()=>{const c=document.querySelector(".preview canvas");return c.getContext("2d").getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0);})()'),true);
  console.log('PASS: offline startup, 1,402 banners, 77 categories, valid codes, rendered native previews.');
  await evaluate('$("next").click();window.originalRecord=JSON.stringify(state.records[0]);$("languageToggle").click()');
  assert.deepEqual(await evaluate('({lang:document.documentElement.lang,title:document.title,load:$("importXml").textContent,copy:document.querySelector(".copy-button").textContent,page:state.page,stored:localStorage.getItem(LANGUAGE_KEY),unchanged:JSON.stringify(state.records[0])===window.originalRecord})'),{lang:'be',title:'Bannerlord · Галерэя сцягоў',load:'Загрузіць XML',copy:'Скапіяваць код',page:2,stored:'be',unchanged:true});
  await send('Page.reload');
  await until('typeof state!=="undefined" && state.records.length===1402 && document.documentElement.lang==="be"');
  await evaluate('$("languageToggle").click()');
  await send('Page.reload');
  await until('typeof state!=="undefined" && state.records.length===1402 && document.documentElement.lang==="en"');
  assert.equal(await evaluate('(()=>{const original=Storage.prototype.getItem;Storage.prototype.getItem=()=>{throw new Error("Blocked");};try{return savedLanguage();}finally{Storage.prototype.getItem=original;}})()'),'en');
  console.log('PASS: English default, Belarusian toggle, preserved page and source data, saved language after reload, blocked-storage fallback.');
  await evaluate('document.querySelector("[data-category=belarusianBlackRuthenia]").click()');
  assert.deepEqual(await evaluate('({quality:document.querySelector("#categoryQuality .tag").textContent,count:filteredRecords().length,hd:filteredRecords().every(r=>r.hd===true)})'),{quality:'HD',count:19,hd:true});
  await evaluate('$("search").value="daniejki";$("search").dispatchEvent(new Event("input"))');
  assert.equal(await evaluate('document.querySelectorAll(".banner-card").length'),1);
  await evaluate('$("sort").value="hd";$("includeCommented").checked=false;$("languageToggle").click()');
  assert.deepEqual(await evaluate('({category:state.category,search:$("search").value,sort:$("sort").value,comments:$("includeCommented").checked,placeholder:$("search").placeholder})'),{category:'belarusianBlackRuthenia',search:'daniejki',sort:'hd',comments:false,placeholder:'Назва, ID або катэгорыя…'});
  await evaluate('document.querySelector(".preview-button").click()');
  await until('$("bannerDialog").open && $("dialogNote").textContent==="Код гатовы для ўстаўкі ў Bannerlord."');
  assert.equal(await evaluate('$("dialogCode").value===state.records.find(r=>r.id==="bel_bla_daniejki").code'),true);
  await evaluate('setLanguage("en")');
  assert.equal(await evaluate('$("dialogNote").textContent'),'The code is ready to paste into Bannerlord.');
  assert.equal(await evaluate('$("dialogCopy").textContent'),'Copy code');
  // Replace clipboard with a spy to verify exact values in both copy actions.
  await evaluate('window.copied=[];Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>window.copied.push(text)}});$("dialogCopy").click()');
  await until('window.copied.length===1');
  await evaluate('$("dialogCopyAttribute").click()');await until('window.copied.length===2');
  assert.equal(await evaluate('copied[0]===$("dialogCode").value && copied[1]===\'banner_key="\'+$("dialogCode").value+\'"\''),true);
  await evaluate('$("bannerDialog").close();resetFilters();$("quality").value="standard";$("quality").dispatchEvent(new Event("change"))');
  assert.equal(await evaluate('filteredRecords().length'),900);
  await evaluate('resetFilters();$("next").click()');assert.equal(await evaluate('state.page'),2);
  console.log('PASS: category and quality filters, search, pagination, enlarged preview, exact clipboard contents.');
  for(const [file,total,active] of [
    ['templates/eoe 1100/ModuleData/snowballs_in_use.xml',1402,1402],
    ['templates/eastern europe 1259/ModuleData/snowballs_in_use.xml',1402,666],
    ['templates/anno domini 1259/ModuleData/snowballs_in_use.xml',1418,1288]
  ]) {
    await evaluate('window.oldGeneration=state.generation');await importFile(path.join(root,file));
    await until('state.generation>window.oldGeneration && !$("importXml").disabled');
    assert.equal(await evaluate('state.records.length'),total);
    assert.equal(await evaluate('state.records.filter(r=>!r.commented).length'),active);
    await evaluate('$("includeCommented").checked=false;$("includeCommented").dispatchEvent(new Event("change"))');
    assert.equal(await evaluate('filteredRecords().length'),active);
    console.log('PASS: actual file picker import '+file+' ('+total+' total, '+active+' active).');
  }
  const fixture=path.join(temp,'mixed.xml');
  const code='11.27.19.1836.1836.764.764.1.0.0.505.155.116.200.200.764.764.0.0.45';
  await fs.writeFile(fixture,`<Snowballs><Snowball id="hd" name="{=key}&lt;img onerror=&quot;alert(1)&quot;&gt;" web-category-id="mixedTest" web-hd="true" banner="${code}"/><!-- <Snowball id="standard" name="Hidden" web-category-id="mixedTest" web-hd="false" banner="${code}"/> --><Snowball id="unknown" name="Unknown" banner="${code}"/></Snowballs>`);
  await evaluate('window.oldGeneration=state.generation');await importFile(fixture);await until('state.generation>window.oldGeneration');
  assert.deepEqual(await evaluate('({count:state.records.length,quality:state.categories.get("mixedTest").quality,unknown:state.categories.get("__uncategorized__").quality,name:state.records[0].name})'),{count:3,quality:'mixed',unknown:'unknown',name:'<img onerror="alert(1)">'});
  assert.equal(await evaluate('document.querySelectorAll("#gallery img").length'),0);
  await evaluate('$("quality").value="hd";$("quality").dispatchEvent(new Event("change"));document.querySelector("[data-category=mixedTest]").click()');
  assert.equal(await evaluate('$("categoryQuality").textContent'),'Mixed');
  assert.equal(await evaluate('filteredRecords().length'),1);
  await evaluate('resetFilters();$("search").value="no-such-banner";$("search").dispatchEvent(new Event("input"))');
  assert.equal(await evaluate('!$("empty").hidden'),true);
  const invalid=path.join(temp,'invalid.xml');await fs.writeFile(invalid,'<Snowballs><Snowball></Snowballs>');
  await importFile(invalid);await until('!$("message").hidden');assert.equal(await evaluate('state.records.length'),3);
  assert.equal(await evaluate('$("message").textContent'),'Invalid XML: check tag and comment endings.');
  await evaluate('$("languageToggle").click()');
  assert.equal(await evaluate('$("message").textContent'),'Памылка XML: правер закрыццё тэгаў і каментароў.');
  assert.equal(await evaluate('categoryLabel("__uncategorized__")'),'Без катэгорыі');
  assert.equal(await evaluate('document.querySelector("#empty h2").textContent'),'Сцягоў не знойдзена');
  await evaluate('$("languageToggle").click()');
  console.log('PASS: mixed categories stay mixed under filters, unknown metadata, safe XML names, empty results, malformed-file recovery.');
  await evaluate('resetFilters()');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true);
  await evaluate('$("languageToggle").click()');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true);
  await evaluate('$("languageToggle").click()');
  await until('document.querySelector(".preview canvas")');
  await send('Emulation.clearDeviceMetricsOverride');
  // Signed widths, rotation, mirror flags and unavailable mod masks are all supported.
  assert.equal(await evaluate(`(async()=>{const c=document.createElement('canvas');c.width=300;c.height=360;return await drawBanner(c,'11.27.19.1836.1836.764.764.1.0.0.505.155.116.-200.200.764.764.0.1.45');})()`),'');
  assert.match(await evaluate(`(async()=>{const c=document.createElement('canvas');c.width=300;c.height=360;return await drawBanner(c,'11.27.19.1836.1836.764.764.1.0.0.999999.155.116.200.200.764.764.0.0.0');})()`),/999999/);
  // Real local-file fallback: no Clipboard API, exercise document.execCommand('copy').
  await evaluate('Object.defineProperty(navigator,"clipboard",{configurable:true,value:undefined});document.querySelector(".copy-button").click()');
  await until('!$("toast").hidden || $("bannerDialog").open');
  assert.equal(await evaluate('$("bannerDialog").open ? $("dialogCode").value===state.records[0].code : $("toast").textContent==="Banner code copied."'),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile layout, signed dimensions, missing-mask notice, local clipboard fallback, no browser exceptions.');
}
run().then(()=>console.log('All gallery checks passed.')).catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(socket?.readyState===WebSocket.OPEN) {try {await send('Browser.close');} catch {}socket.close();}
  if(browser&&!browser.killed)browser.kill();
  // The temporary browser profile is retained outside the repository for troubleshooting.
});
