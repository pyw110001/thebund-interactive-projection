import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'artifacts/previews');await fs.mkdir(out,{recursive:true});
const url=process.env.HALL_URL||'http://127.0.0.1:4185/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1672,height:941},deviceScaleFactor:1});
const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>requests.push(r.url()));
const results=[];
async function step(name,fn){await fn();results.push({name,status:'passed'});console.log('PASS',name);}
async function ready(){await page.waitForFunction(()=>window.__HALL_STATS__?.loaded,{timeout:30000});}
async function shot(name){await page.screenshot({path:path.join(out,name+'.png')});}
async function state(){return page.evaluate(()=>window.__HALL_STATS__);}
async function range(label,value){const input=page.getByLabel(label,{exact:true});await input.focus();await input.press('Home');const min=Number(await input.getAttribute('min')||0),step=Number(await input.getAttribute('step')||1);for(let i=0;i<Math.round((value-min)/step);i++)await input.press('ArrowRight');}
try{
  await page.goto(url);await ready();await page.waitForTimeout(1200);
  await step('default night scene loads at concept native viewport',async()=>{
    assert.equal((await state()).state.deployment,1);assert.equal((await state()).media,'default');await shot('web-exterior');
  });
  await step('day preset retracts curtain; night restores it',async()=>{
    await page.getByRole('button',{name:'白天',exact:true}).click();await page.waitForTimeout(1000);
    assert.equal((await state()).state.night,false);assert.equal((await state()).state.deployment,0);await shot('web-day');
    await page.getByRole('button',{name:'夜间',exact:true}).click();await page.waitForTimeout(1000);
  });
  await step('JPEG and WebP decode and replace the current artwork',async()=>{
    for(const extension of ['jpg','webp']){
      await page.locator('input[type=file]').setInputFiles(path.join(root,`artifacts/qa-media/orientation.${extension}`));
      await page.getByTitle(`orientation.${extension}`,{exact:true}).waitFor();
    }
  });
  await step('orientation image uses readable front-facing UV',async()=>{
    await page.locator('input[type=file]').setInputFiles(path.join(root,'artifacts/qa-media/orientation.png'));
    await page.getByTitle('orientation.png',{exact:true}).waitFor();await page.waitForTimeout(500);await shot('web-orientation');
  });
  await step('half curtain reveals upper half rather than squeezing the image',async()=>{
    await range('幕布展开',50);await page.waitForTimeout(1100);assert.equal((await state()).state.deployment,.5);await shot('web-half-curtain');
    await range('幕布展开',100);await page.waitForTimeout(800);
  });
  await step('portrait media supports contain and cover',async()=>{
    await page.locator('input[type=file]').setInputFiles(path.join(root,'artifacts/qa-media/portrait.png'));
    await page.getByTitle('portrait.png',{exact:true}).waitFor();await page.waitForTimeout(400);await shot('web-portrait-contain');
    await page.getByRole('button',{name:'铺满裁切',exact:true}).click();await page.waitForTimeout(300);await shot('web-portrait-cover');
    assert.equal((await state()).state.fit,'cover');
    await page.getByRole('button',{name:'完整显示',exact:true}).click();
  });
  await step('failed image and unsupported file preserve previous valid media',async()=>{
    await page.locator('input[type=file]').setInputFiles(path.join(root,'artifacts/qa-media/broken.png'));
    await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/无法解码/);assert.equal((await state()).media,'portrait.png');
    await page.locator('input[type=file]').setInputFiles(path.join(root,'artifacts/qa-media/unsupported.txt'));
    await page.waitForTimeout(300);assert.match(await page.getByRole('alert').innerText(),/请选择/);assert.equal((await state()).media,'portrait.png');
  });
  await step('video decodes, plays, pauses, seeks, loops and toggles sound',async()=>{
    await page.locator('input[type=file]').setInputFiles(path.join(root,'artifacts/qa-media/orientation.mp4'));
    await page.getByTitle('orientation.mp4',{exact:true}).waitFor();await page.getByRole('button',{name:'暂停视频',exact:true}).waitFor();
    await page.waitForTimeout(1100);assert.ok((await state()).video.time>.5);await shot('web-video');
    await page.getByRole('button',{name:'暂停视频',exact:true}).click();await page.waitForTimeout(300);const paused=(await state()).video.time;
    await page.waitForTimeout(450);assert.ok(Math.abs((await state()).video.time-paused)<.2);
    const seek=page.getByLabel('视频进度',{exact:true});await seek.focus();await seek.press('End');await seek.press('ArrowLeft');
    await page.waitForTimeout(300);assert.ok((await state()).video.time>5);
    await page.getByRole('button',{name:'开启声音',exact:true}).click();await page.getByRole('button',{name:'静音',exact:true}).waitFor();
    await page.getByRole('button',{name:'静音',exact:true}).click();
    await page.getByRole('button',{name:'播放视频',exact:true}).click();await page.waitForTimeout(1800);assert.ok((await state()).video.time<3);
  });
  await step('WebM decodes and plays after replacing an MP4',async()=>{
    await page.locator('input[type=file]').setInputFiles(path.join(root,'artifacts/qa-media/orientation.webm'));
    await page.getByTitle('orientation.webm',{exact:true}).waitFor();
    await page.getByRole('button',{name:'暂停视频',exact:true}).waitFor();await page.waitForTimeout(700);
    assert.ok((await state()).video.time>.1);
  });
  await step('reset, presets and roof cutaway work',async()=>{
    await page.getByRole('button',{name:'恢复花海示例',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[aria-label="视频进度"]'));
    await page.getByRole('button',{name:'室内',exact:true}).click();await page.waitForTimeout(1100);await shot('web-interior');
    await page.getByRole('button',{name:'俯视',exact:true}).click();await page.getByLabel('隐藏屋顶',{exact:true}).check();await page.waitForTimeout(1100);await shot('web-top-cutaway');
    assert.equal((await state()).state.roofHidden,true);
    await page.getByLabel('隐藏屋顶',{exact:true}).uncheck();await page.getByRole('button',{name:'外观',exact:true}).click();await page.waitForTimeout(1100);
  });
  await step('panel collapse, free orbit and full screen',async()=>{
    await page.getByRole('button',{name:'收起面板',exact:true}).click();await page.waitForFunction(()=>getComputedStyle(document.querySelector('aside')).visibility==='hidden');
    const canvas=page.locator('canvas');const rect=await canvas.boundingBox();await page.mouse.move(rect.width*.45,rect.height*.5);await page.mouse.down();await page.mouse.move(rect.width*.5,rect.height*.55,{steps:8});await page.mouse.up();await page.waitForTimeout(300);
    await page.getByRole('button',{name:'展开控制面板',exact:true}).click();
    await page.getByRole('button',{name:'全屏',exact:true}).click();await page.waitForFunction(()=>!!document.fullscreenElement);await page.getByRole('button',{name:'退出全屏',exact:true}).click();
    await page.getByRole('button',{name:'外观',exact:true}).click();await page.waitForTimeout(1100);
  });
  await step('1920x1080 performance sample',async()=>{
    await page.setViewportSize({width:1920,height:1080});await page.waitForTimeout(1500);
    const sample=await page.evaluate(async()=>{const samples=[];const gl=document.querySelector('canvas').getContext('webgl2');const info=gl?.getExtension('WEBGL_debug_renderer_info');for(let i=0;i<5;i++){await new Promise(r=>setTimeout(r,1050));samples.push(window.__HALL_STATS__);}return {samples,gpu:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):'unavailable',dpr:devicePixelRatio};});
    const fps=sample.samples.map(s=>s.fps);sample.minFps=Math.min(...fps);sample.averageFps=fps.reduce((a,b)=>a+b,0)/fps.length;
    await fs.writeFile(path.join(root,'artifacts/performance.json'),JSON.stringify(sample,null,2));assert.ok(sample.minFps>=30,JSON.stringify(sample));await shot('web-1080p');
  });
  await step('mobile bottom sheet is usable without horizontal overflow',async()=>{
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.ok(await page.getByRole('button',{name:'选择文件',exact:true}).isVisible());await shot('web-mobile');
    await page.getByRole('button',{name:'收起面板',exact:true}).click();await page.waitForTimeout(300);await shot('web-mobile-clean');
    await page.getByRole('button',{name:'展开控制面板',exact:true}).click();
    // Drag/drop exercises the same File API without a network upload.
    const buffer=await fs.readFile(path.join(root,'artifacts/qa-media/orientation.png'));
    const transfer=await page.evaluateHandle(data=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(data)],'dropped.png',{type:'image/png'}));return dt;},Array.from(buffer));
    await page.locator('main').dispatchEvent('drop',{dataTransfer:transfer});await page.getByTitle('dropped.png',{exact:true}).waitFor();
  });
  await step('refresh returns to bundled artwork with no external requests',async()=>{
    await page.reload();await ready();assert.equal((await state()).media,'default');
    assert.deepEqual(requests.filter(r=>!r.startsWith(url)&&!r.startsWith('blob:')&&!r.startsWith('data:')),[]);
  });
  assert.deepEqual(errors,[],'Browser errors');
  await fs.writeFile(path.join(root,'artifacts/browser-qa.json'),JSON.stringify({url,results,errors,externalRequests:[],testedAt:new Date().toISOString()},null,2));
}catch(error){await shot('qa-failure');await fs.writeFile(path.join(root,'artifacts/browser-qa.json'),JSON.stringify({url,results,errors,failure:String(error)},null,2));throw error;}
finally{await browser.close();}
