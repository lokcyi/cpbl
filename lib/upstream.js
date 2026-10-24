const BASE = 'https://stats.cpbl.com.tw/api/proxy/v1/';
const cache = new Map();
const pending = new Map();
export function validDate(value) {
  return /^20\d{2}-\d{2}-\d{2}$/.test(value ?? '') && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
}
export const validGame = value => /^20\d{2}-[A-Z]-[1-9]\d{0,4}$/.test(value ?? '');
export async function upstream(path, {fetcher=fetch,timeout=20000}={}) {
  if (!(path.startsWith('games/schedule/') ? validDate(path.slice(15)) : path.startsWith('games/') && validGame(path.slice(6)))) throw new Error('Invalid upstream path');
  const old=cache.get(path); if(old && Date.now()-old.time<120000) return {...old.value,cacheHit:true};
  if(pending.has(path)) return pending.get(path);
  const work=(async()=>{
    const response=await fetcher(BASE+path,{headers:{'User-Agent':'CPBL-Game-Dashboard/0.1','Accept':'application/json'},signal:AbortSignal.timeout(timeout)});
    if(!response.ok) throw new Error(`官方資料服務回應 ${response.status}`);
    const raw=await response.json();
    if(raw.success===false || !raw.Data) throw new Error('官方資料格式與預期不同');
    const value={raw,fetchedAt:new Date().toISOString(),cacheHit:false};
    if(cache.size>=40) cache.delete(cache.keys().next().value);
    cache.set(path,{time:Date.now(),value});return value;
  })();
  pending.set(path,work);
  try{return await work;}finally{pending.delete(path);}
}
export async function handleApi(kind, req, res) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET') {res.setHeader('Allow','GET');return res.status(405).json({error:'僅支援 GET'});}
  const url=new URL(req.url,'http://localhost');
  const value=url.searchParams.get(kind==='schedule'?'date':'id');
  if(!(kind==='schedule'?validDate(value):validGame(value))) return res.status(400).json({error:kind==='schedule'?'請提供有效日期 YYYY-MM-DD':'比賽 ID 格式錯誤'});
  try{
    const data=await upstream(kind==='schedule'?'games/schedule/'+value:'games/'+value);
    if(kind==='schedule' && !Array.isArray(data.raw.Data.Games)) throw new Error('官方賽程格式與預期不同');
    if(kind==='game' && !Array.isArray(data.raw.Data.Game?.LiveLog)) throw new Error('本場尚無可用逐球資料');
    const payload=JSON.stringify({...data,source:'official'});
    if(Buffer.byteLength(payload)>4_400_000) return res.status(413).json({error:'本場原始資料超過即時服務大小限制，請使用批次收錄資料。'});
    res.setHeader('Cache-Control','public, s-maxage=120, stale-while-revalidate=300');
    return res.status(200).end(payload);
  }catch(error){
    res.setHeader('Cache-Control','no-store');
    return res.status(502).json({error:error.name==='TimeoutError'?'官方資料服務逾時，請稍後再試。':error.message || '無法取得官方資料'});
  }
}
