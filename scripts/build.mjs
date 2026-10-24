import {mkdir,cp,readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function build(){
  const dist=path.join(root,'dist');await mkdir(dist,{recursive:true});
  await cp(path.join(root,'web'),dist,{recursive:true});
  await cp(path.join(root,'lib/analysis.js'),path.join(dist,'assets/analysis.js'));
  await cp(path.join(root,'lib/umpire.js'),path.join(dist,'assets/umpire.js'));
  await mkdir(path.join(dist,'data/games'),{recursive:true});
  await mkdir(path.join(dist,'data/snapshots'),{recursive:true});
  const games=[];
  for(const name of await readdir(path.join(root,'research/cpbl_raw'))){
    if(!/^20\d{2}-[A-Z]-\d+\.json$/.test(name))continue;
    const raw=await readFile(path.join(root,'research/cpbl_raw',name));
    const g=JSON.parse(raw).Data.Game;
    await writeFile(path.join(dist,'data/games',name),raw);
    await writeFile(path.join(dist,'data/snapshots',name),raw);
    const {LiveLog,...summary}=g;games.push(summary);
  }
  await writeFile(path.join(dist,'data/samples.json'),JSON.stringify({snapshotDate:'2026-10-24',games}));
  try{await cp(path.join(root,'data'),path.join(dist,'data'),{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
  console.log('Built dist: website, analysis module, and '+games.length+' verified samples.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))await build();
