import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {upstream,validDate} from '../lib/upstream.js';
import {analyze} from '../lib/analysis.js';
const root=fileURLToPath(new URL('../data/',import.meta.url));
const date=process.argv[2]??new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
if(!validDate(date))throw new Error('Date must be YYYY-MM-DD');
await mkdir(path.join(root,'schedule'),{recursive:true});await mkdir(path.join(root,'games'),{recursive:true});await mkdir(path.join(root,'analysis'),{recursive:true});
const schedule=await upstream('games/schedule/'+date);
if(!Array.isArray(schedule.raw.Data.Games))throw new Error('Invalid schedule');
await writeFile(path.join(root,'schedule',date+'.json'),JSON.stringify(schedule.raw));
let manifest={};try{manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
for(const game of schedule.raw.Data.Games){
  if(game.GameStatus!=='FINISHED')continue;
  const result=await upstream('games/'+game.GameId);
  const analysis=analyze(result.raw);
  await writeFile(path.join(root,'games',analysis.id+'.json'),JSON.stringify(result.raw));
  await writeFile(path.join(root,'analysis',analysis.id+'.json'),JSON.stringify({fetchedAt:result.fetchedAt,source:'official-batch',...analysis}));
  manifest[analysis.id]={fetchedAt:result.fetchedAt,version:analysis.version,date:analysis.date};
  console.log(analysis.id+': '+analysis.quality.pitches+' pitches, '+analysis.quality.issues.length+' issues');
  await new Promise(resolve=>setTimeout(resolve,500));
}
await writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
console.log('Saved schedule and finished games for '+date);
