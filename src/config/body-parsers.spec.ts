import express from 'express';
import request from 'supertest';
import {gzipSync,deflateSync,brotliCompressSync} from 'node:zlib';
import {requestBodyParsers} from './body-parsers';
describe('Request parsing security boundary',()=>{
 const app=express();app.use(...requestBodyParsers());app.post('/echo',(req,res)=>res.json(req.body));app.get('/health',(_req,res)=>res.json({ok:true}));
 it('preserves browser JSON and URL-encoded requests',async()=>{
  await request(app).post('/echo').send({name:'synthetic'}).expect(200,{name:'synthetic'});
  await request(app).post('/echo').type('form').send('name=synthetic').expect(200,{name:'synthetic'});
 });
 it('rejects every supported compressed encoding before decoding and stays available',async()=>{
  for(const [encoding,encode] of [['gzip',gzipSync],['deflate',deflateSync],['br',brotliCompressSync]] as const){
   await request(app).post('/echo').set('Content-Type','application/json').set('Content-Encoding',encoding).send(encode(Buffer.from('{"name":"synthetic"}'))).expect(415);
   await request(app).get('/health').expect(200,{ok:true});
  }
 });
});
