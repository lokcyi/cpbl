import {upstream} from './upstream.js';
export async function recentGames({now=new Date(),request=upstream}={}){
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const found=new Map(),errors=[];
  for(let offset=0;offset<30;offset+=7){
    const days=Array.from({length:Math.min(7,30-offset)},(_,i)=>new Date(Date.parse(date+'T00:00:00Z')-(offset+i)*86400000).toISOString().slice(0,10));
    await Promise.all(days.map(async day=>{try{const response=await request('games/schedule/'+day,{timeout:4000});const games=response.raw.Data.Games;if(!Array.isArray(games))throw Error();for(const g of games){const time=Date.parse(g.PreExeDate+'+08:00');if(Number.isFinite(time)&&time<=now.getTime()&&['FINISHED','PLAYING'].includes(g.GameStatus))found.set(g.GameId,g);}}catch{errors.push(day);}}));
    if(found.size>=6)break;
  }
  return {games:[...found.values()].sort((a,b)=>b.PreExeDate.localeCompare(a.PreExeDate)||a.GameId.localeCompare(b.GameId)).slice(0,6),errors,asOf:now.toISOString(),lookbackDays:30};
}
export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'僅支援 GET'});}
  const data=await recentGames();
  res.setHeader('Cache-Control',data.errors.length?'no-store':'public, s-maxage=120, stale-while-revalidate=300');
  if(!data.games.length&&data.errors.length)return res.status(502).json({error:'近期賽程暫時無法取得'});
  return res.status(200).json(data);
}
