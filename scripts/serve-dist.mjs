// Dependency-free production preview; bundled with the portable viewer ZIP.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const port=Number(process.argv[2]||4186);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((request,response)=>{
  let name;
  try{name=decodeURIComponent(new URL(request.url,'http://localhost').pathname);}catch{response.writeHead(400);response.end();return;}
  const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
  if(file!==path.resolve(root)&&!file.startsWith(path.resolve(root)+path.sep)){response.writeHead(403);response.end();return;}
  fs.stat(file,(error,stat)=>{
    if(error||!stat.isFile()){response.writeHead(404);response.end('Not found');return;}
    response.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    if(request.method==='HEAD'){response.end();return;}
    const stream=fs.createReadStream(file);stream.on('error',()=>response.destroy());stream.pipe(response);
  });
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is in use. Choose another: node scripts/serve-dist.mjs ${port+1}`:error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Crystal Hall: http://127.0.0.1:${port}/`));
