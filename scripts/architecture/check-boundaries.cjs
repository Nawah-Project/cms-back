const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../src'),names=['founder-workspace','strategic-relationships','learning-library'];
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
for(const n of names)assert(!fs.existsSync(path.join(root,n)),n+' must live in the personal API');
for(const file of walk(root).filter(f=>f.endsWith('.ts')&&!f.endsWith('.spec.ts'))){const source=fs.readFileSync(file,'utf8');assert(!/from\s+['"][^'"]*(?:founder-workspace|strategic-relationships|learning-library)\//.test(source),file);assert(!/\.(?:founderWorkspace(?:Mutation)?|strategicRelationships(?:Workspace|Mutation)|learning(?:Library|Book|Edition|Note|Map|Goal|Reading|Position|Asset|Mutation))\./.test(source),'Product runtime must not access extracted personal tables: '+file);}
console.log('Nawah runtime excludes personal domains and their data access.');
