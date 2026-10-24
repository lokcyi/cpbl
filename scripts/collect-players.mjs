import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {collectPlayers} from '../lib/players.js';
const inputs=[];
for(const dir of ['research/cpbl_raw','data/games'])for(const name of await readdir(dir))if(/^20\d{2}-[A-Z]-\d+\.json$/.test(name))inputs.push(dir+'/'+name);
const ids=[];
for(const file of inputs){const raw=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));ids.push(...raw.Data.Game.LiveLog.map(r=>r.HitterAcnt));}
const all={players:{},errors:[]};
const unique=[...new Set(ids)];
for(let i=0;i<unique.length;i+=30){const r=await collectPlayers(unique.slice(i,i+30));Object.assign(all.players,r.players);all.errors.push(...r.errors);}
await mkdir('data/players',{recursive:true});
await writeFile('data/players/index.json',JSON.stringify({collectedAt:new Date().toISOString(),...all},null,2));
console.log('Collected '+Object.keys(all.players).length+' profiles; failures '+all.errors.length);
if(all.errors.length)console.log(all.errors.map(e=>e.id).join(','));
