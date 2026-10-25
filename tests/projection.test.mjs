import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fitScale,curtainUv,formatTime} from '../src/projection-math.ts';
import validator from 'gltf-validator';

const bytes=fs.readFileSync(new URL('../public/assets/crystal-hall.glb',import.meta.url));
const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
test('portrait and panoramic fitting preserves aspect and centers letterbox/crop',()=>{
  assert.deepEqual(fitScale(1,8,'contain'),[8,1]);
  assert.deepEqual(fitScale(1,8,'cover'),[1,.125]);
  assert.deepEqual(fitScale(16,8,'contain'),[1,2]);
  assert.deepEqual(fitScale(16,8,'cover'),[.5,1]);
  assert.deepEqual(fitScale(8,8,'contain'),[1,1]);
});
test('curtain reveal keeps top fixed and reveals original image without compression',()=>{
  for(const deploy of [0,.25,.5,1])assert.equal(curtainUv(1,deploy),1);
  assert.equal(curtainUv(0,.5),.5);assert.equal(curtainUv(.5,.5),.75);
});
test('time display handles unloaded metadata and hours',()=>{
  assert.equal(formatTime(NaN),'00:00');assert.equal(formatTime(84.2),'01:24');assert.equal(formatTime(3600),'60:00');
});
test('Rhino source remains byte-identical to conversion input',{skip:!fs.existsSync(new URL('../Crytral Hall.3dm',import.meta.url))&&'Original Rhino stays local; public CI validates the exported GLB'},()=>{
  const config=JSON.parse(fs.readFileSync(new URL('../public/assets/scene-config.json',import.meta.url)));
  const source=fs.readFileSync(new URL('../Crytral Hall.3dm',import.meta.url));
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'),config.sourceSha256);
  assert.equal(config.sourceStats.expanded_instances,3100);assert.equal(config.sourceStats.surface_objects,36726);
});
test('GLB is portable with semantic groups, embedded images and a deployed morph target',()=>{
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  for(const name of ['Hall','Roof','Glazing','Context','ProjectionScreen','CurtainAssembly'])assert.ok(json.nodes.find(n=>n.name===name),name);
  assert.ok(json.images.every(i=>i.bufferView!==undefined&&!i.uri));
  const screenNode=json.nodes.find(n=>n.name==='ProjectionScreen');const mesh=json.meshes[screenNode.mesh];
  assert.deepEqual(mesh.weights,[0]);assert.ok(mesh.primitives[0].targets[0].POSITION!==undefined);
  assert.ok(bytes.length<40*1024*1024);
});
test('Khronos glTF validator reports zero errors and warnings',async()=>{
  const report=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:100});
  assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues));assert.equal(report.issues.numWarnings,0);
});
