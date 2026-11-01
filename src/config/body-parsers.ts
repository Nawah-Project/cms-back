import { json, urlencoded } from 'express';

// Browser clients send uncompressed bodies. Reject encoded bodies before zlib
// creates a decoder; this is defense in depth beyond patched body-parser/Node.
export function requestBodyParsers() {
  return [json({limit:'1mb',inflate:false}),urlencoded({extended:false,limit:'1mb',inflate:false})];
}
