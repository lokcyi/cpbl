import {upstream,validGame,validPlayer} from './upstream.js';
export function profileFromResponse(raw,fetchedAt){
  const b=raw?.Data?.Player?.Basic;
  if(!b||!validPlayer(b.Acnt))throw new Error('Invalid player profile');
  const height=typeof b.Height==='number'&&Number.isFinite(b.Height)&&b.Height>=100&&b.Height<=250?b.Height:null;
  return {id:b.Acnt,name:b.CHName??'',heightCm:height,fetchedAt,source:'https://stats.cpbl.com.tw/api/proxy/v1/players/'+b.Acnt};
}
export async function collectPlayers(ids,{request=upstream}={}){
  const unique=[...new Set(ids)].filter(validPlayer);if(unique.length>40)throw new Error('Too many players');
  const players={},errors=[];let cursor=0;
  await Promise.all(Array.from({length:Math.min(6,unique.length)},async()=>{
    while(cursor<unique.length){const id=unique[cursor++];try{const result=await request('players/'+id,{timeout:6000});const p=profileFromResponse(result.raw,result.fetchedAt);if(p.id!==id)throw new Error('Player ID mismatch');players[id]=p;}catch{errors.push({id,error:'球員資料暫時無法取得'});}}
  }));return {players,errors};
}
export async function handlePlayers(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'僅支援 GET'});}
  const id=new URL(req.url,'http://localhost').searchParams.get('id');
  if(!validGame(id))return res.status(400).json({error:'比賽 ID 格式錯誤'});
  try{
    const result=await upstream('games/'+id,{timeout:8000});
    const logs=result.raw.Data.Game?.LiveLog;if(!Array.isArray(logs))throw new Error('本場尚無逐球資料');
    const data=await collectPlayers(logs.map(r=>r.HitterAcnt));
    res.setHeader('Cache-Control',data.errors.length?'no-store':'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({gameId:id,...data});
  }catch{return res.status(502).json({error:'無法取得本場打者身高資料'});}
}
