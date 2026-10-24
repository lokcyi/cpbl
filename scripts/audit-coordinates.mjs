import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const summary=values=>{
  if(!values.length)return {count:0,min:null,max:null,median:null,rmse:null,maxAbsolute:null};
  const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
  return {count:values.length,min:sorted[0],max:sorted.at(-1),median:sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2,rmse:Math.sqrt(values.reduce((s,v)=>s+v*v,0)/values.length),maxAbsolute:Math.max(...values.map(Math.abs))};
};
const reports=[];
for(const id of ['2026-A-211','2026-D-166','2026-C-1']){
  const raw=JSON.parse(await readFile(new URL('research/cpbl_raw/'+id+'.json',root),'utf8'));
  const rows=[];
  for(const event of raw.Data.Game.LiveLog){
    const pitch=event.Trackman?.Pitch,loc=pitch?.Location,poly=pitch?.Flight?.PolyFit?.PitchTrajectory;
    if(!loc || !poly || !Number.isFinite(loc.ZoneTime) || !Number.isFinite(loc.PlateLocSide) || !Number.isFinite(loc.PlateLocHeight))continue;
    if(!['X','Y','Z'].every(k=>Array.isArray(poly[k]) && poly[k].length===3 && poly[k].every(Number.isFinite)))continue;
    const t=loc.ZoneTime;
    const position=Object.fromEntries(['X','Y','Z'].map(k=>[k,poly[k][0]+poly[k][1]*t+poly[k][2]*t*t]));
    const velocity=Object.fromEntries(['X','Y','Z'].map(k=>[k,poly[k][1]+2*poly[k][2]*t]));
    const speed=Math.hypot(...Object.values(velocity))*3.6;
    rows.push({event:event.MainEventNo,pitcher:event.PitcherName,batter:event.HitterName,time:t,position,reportedLocation:loc,heightResidual:position.Y-loc.PlateLocHeight,sideResidual:position.Z+loc.PlateLocSide,speedResidual:Number.isFinite(loc.ZoneSpeed)?speed-loc.ZoneSpeed:null});
  }
  if(!rows.length)throw new Error('No trajectory rows for '+id);
  const report={id,count:rows.length,longitudinalAtZoneTime:summary(rows.map(r=>r.position.X)),heightResidual:summary(rows.map(r=>r.heightResidual)),sideResidual:summary(rows.map(r=>r.sideResidual)),speedResidual:summary(rows.map(r=>r.speedResidual).filter(Number.isFinite)),example:rows[0]};
  reports.push(report);
  console.log(id,JSON.stringify({n:report.count,xMedian:report.longitudinalAtZoneTime.median,heightMaxAbs:report.heightResidual.maxAbsolute,sideMaxAbs:report.sideResidual.maxAbsolute,speedRmse:report.speedResidual.rmse}));
}
const out={auditDate:'2026-10-24',basis:'Archived official JSON; not a new live fetch',hypothesis:'P(t) = c0+c1*t+c2*t^2, height ~ Y(t), side ~ -Z(t). Speed assumes positional units metres and time seconds; units and plate-plane origin need authoritative confirmation.',warning:'Residuals compare fields produced by the same upstream tracking pipeline. They do not establish physical sensor accuracy or an official ABS zone.',games:reports};
await mkdir(new URL('research/strike-zone/',root),{recursive:true});
const destination=new URL('research/strike-zone/coordinate-audit.json',root);
await writeFile(destination,JSON.stringify(out,null,2));
console.log('Saved '+fileURLToPath(destination));
