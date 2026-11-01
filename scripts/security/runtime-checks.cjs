const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const path=require('node:path');
const {gzipSync,deflateSync,brotliCompressSync}=require('node:zlib');
const r=createRequire(path.join(process.cwd(),'package.json'));
const express=r('express'),multer=r('multer');
const {requestBodyParsers}=r('./dist/config/body-parsers.js');
const versions={};
for(const name of ['body-parser','multer','qs','source-map-js','sanitize-html']) versions[name]=r(name+'/package.json').version;
console.log(JSON.stringify({node:process.version,runtimeDependencies:versions}));
test('runtime image contains patched packages and security-patched Node 24',()=>{
 const [major,minor,patch]=process.versions.node.split('.').map(Number);
 assert.equal(major,24);assert(minor>22||minor===22&&patch>=1);
 for(const [name,minimum] of Object.entries({'body-parser':'2.4.0',multer:'2.5.0',qs:'6.16.1','source-map-js':'1.2.2','sanitize-html':'2.18.0'})){
  const a=versions[name].split('.').map(Number),b=minimum.split('.').map(Number);assert(a[0]===b[0]&&(a[1]>b[1]||a[1]===b[1]&&a[2]>=b[2]),name+' must be patched');
 }
});
async function appCheck(run){
 const app=express();app.use(...requestBodyParsers());
 app.post('/echo',(req,res)=>res.json(req.body));
 app.post('/cv',multer({limits:{fileSize:5*1024*1024},fileFilter:(_req,file,cb)=>cb(null,file.mimetype==='application/pdf')}).single('file'),(req,res)=>req.file?res.json({size:req.file.size,type:req.file.mimetype}):res.status(400).json({error:'PDF required'}));
 app.get('/health',(_req,res)=>res.json({status:'ok'}));
 app.use((err,_req,res,_next)=>res.status(err.status||400).json({error:err.type||'rejected'}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{await run('http://127.0.0.1:'+server.address().port);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
test('normal JSON and URL-encoded requests remain compatible',()=>appCheck(async base=>{
 for(const [type,body] of [['application/json',JSON.stringify({name:'synthetic'})],['application/x-www-form-urlencoded','name=synthetic']]){
  const res=await fetch(base+'/echo',{method:'POST',headers:{'Content-Type':type},body});assert.equal(res.status,200);assert.deepEqual(await res.json(),{name:'synthetic'});
 }
}));
test('gzip, deflate and Brotli bodies are rejected before decoding; server stays healthy',()=>appCheck(async base=>{
 const body=Buffer.from('{"name":"synthetic"}');
 for(const type of ['application/json','application/x-www-form-urlencoded'])for(const [encoding,encode] of [['gzip',gzipSync],['deflate',deflateSync],['br',brotliCompressSync]]){
  // Benign input only. No malformed decoder payload is sent to any environment.
  const res=await fetch(base+'/echo',{method:'POST',headers:{'Content-Type':type,'Content-Encoding':encoding},body:encode(body)});assert.equal(res.status,415);assert.equal((await fetch(base+'/health')).status,200);
 }
}));
test('patched multer still accepts valid PDF and rejects wrong MIME',()=>appCheck(async base=>{
 for(const [type,expected] of [['application/pdf',200],['text/plain',400]]){
  const form=new FormData();form.append('file',new Blob(['%PDF-1.4\nSynthetic test only\n%%EOF'],{type}),'synthetic.pdf');
  const res=await fetch(base+'/cv',{method:'POST',body:form});assert.equal(res.status,expected);
 }
}));
