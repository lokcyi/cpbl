import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from './build.mjs';
import {handleApi} from '../lib/upstream.js';
import {handlePlayers} from '../lib/players.js';
import handleRecent from '../lib/recent.js';
await build();
const root=path.resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  res.status=code=>{res.statusCode=code;return res;};res.json=obj=>res.end(JSON.stringify(obj));
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/recent')return handleRecent(req,res);
  if(url.pathname==='/api/players')return handlePlayers(req,res);
  if(url.pathname==='/api/game'||url.pathname==='/api/schedule')return handleApi(url.pathname.slice(5),req,res);
  try{
    const name=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    const target=path.resolve(root,'.'+name);
    if(!target.startsWith(root+path.sep)){res.statusCode=403;return res.end('Forbidden');}
    const body=await readFile(target);res.setHeader('Content-Type',types[path.extname(target)]??'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.end(body);
  }catch{res.statusCode=404;res.end('Not found');}
});
server.listen(Number(process.env.PORT??3000),'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+server.address().port));
