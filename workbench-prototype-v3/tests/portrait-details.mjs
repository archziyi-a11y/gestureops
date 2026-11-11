import assert from 'node:assert/strict';
import { readBusinessCards } from '../src/domain/business-card-observations.js';

const root='D:/isolated-portrait-test';
const task={state:'Ready',account:'test',last:'2026-11-11T10:00:00+08:00',next:'2026-11-11T11:00:00+08:00',result:0};
async function read(data,stat){return (await readBusinessCards({root,dependencies:{execFile:async command=>{if(command!=='powershell.exe')throw Error();return {stdout:JSON.stringify(data)};},...(stat?{stat}:{})}})).cards[0];}
let paths=[];
let card=await read({task,output:'D:/fixture/output.csv'},async p=>{paths.push(p);return {isFile:()=>true,size:42,mtime:new Date('2026-11-11T02:01:00Z')};});
assert.deepEqual(paths,['D:/fixture/output.csv']);assert.equal(card.portrait.file.size,42);assert.equal(card.portrait.association,'configured-target');assert.equal(card.portrait.task.result,0);
card=await read({task,output:'D:/fixture/output.csv'},async()=>{throw Object.assign(Error(),{code:'ENOENT'});});assert.equal(card.portrait.file.state,'missing');assert.equal(card.portrait.task.state,'Ready');
card=await read({task:null,output:'D:/fixture/output.csv'},async()=>({isFile:()=>true,size:1,mtime:new Date()}));assert.equal(card.portrait.file.state,'present');assert.equal(card.portrait.task,null);
card=await read({task:{...task,state:'Disabled',result:9},output:null});assert.equal(card.portrait.association,'unknown');assert.equal(card.portrait.task.result,9);assert.ok(card.issue);
card=(await readBusinessCards({root})).cards[0];assert.equal(card.status,'unknown');assert.equal(card.portrait.file.state,'unavailable');
card=await read({task,output:'D:/fixture/output.csv'});assert.equal(card.portrait.file.state,'unavailable');assert.equal(card.portrait.task.state,'Ready');
console.log('portrait observations passed');
