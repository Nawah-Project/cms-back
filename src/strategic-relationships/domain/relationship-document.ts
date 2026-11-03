export type RelationshipDocument=Record<string,any> & {kind:string;formatVersion:number;id:string;mode:string;revision:number;people:any[];organizations:any[];goals:any[];facts:any[];interactions:any[];commitments:any[];events:any[];collaborations:any[];reviews:any[];analyses:any[];learningEvidence:any[];settings:Record<string,any>;history:any[]};
// Domain-owned data and decisions. No DOM, storage, HTTP or other Nawah feature imports.
export const VERSION=1;
export const clone=value=>structuredClone(value);
export class DomainError extends Error{constructor(public readonly code:string){super(code);}}
export const fail=code=>{throw new DomainError(code);};
export const id=(prefix='row')=>`${prefix}-${globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)}`;
export const clean=s=>String(s??'').trim();
export const normalize=s=>clean(s).toLowerCase().normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/\s+/g,' ');
export function safeUrl(value){if(!value)return '';try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function dateValue(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail('DATE');const n=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)fail('DATE');return n;}
export const addDays=(date,days)=>new Date(dateValue(date)+days*86400000).toISOString().slice(0,10);
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const RELATIONS={knows:{ar:'معرفة مباشرة',en:'Knows',directed:false},collaborates:{ar:'تعاون فعلي',en:'Collaborates',directed:false},advice:{ar:'يطلب مشورة من',en:'Seeks advice from',directed:true},introduced:{ar:'عرّف شخصًا إلى',en:'Introduced to',directed:true},affiliated:{ar:'انتماء إلى جهة',en:'Affiliated with',directed:true},attended:{ar:'حضور حدث',en:'Attended event',directed:true}};
export const collections=['people','organizations','goals','facts','interactions','commitments','events','collaborations','reviews','analyses','learningEvidence'];
const assertText=(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail('TEXT');};
const idsOf=rows=>new Set(rows.map(r=>r.id));
const ref=(value,ids,optional=true)=>{if(!value&&optional)return;if(!ids.has(value))fail('REFERENCE');};
const strings=(v,max=30)=>{if(!Array.isArray(v)||v.length>max)fail('FORMAT');v.forEach(x=>assertText(x,500));};
const url=v=>{if(v&&!safeUrl(v))fail('URL');};
export function blank(mode='personal'):RelationshipDocument{
 if(!['personal','training'].includes(mode))fail('MODE');
 return {kind:'nawah-strategic-relationships',formatVersion:VERSION,id:'relationships-'+mode,mode,revision:0,people:[],organizations:[],goals:[],facts:[],interactions:[],commitments:[],events:[],collaborations:[],reviews:[],analyses:[],learningEvidence:[],settings:{startDate:'2026-11-03',weeklyHours:4.5,timeZone:'Africa/Cairo',activePhase:'ux'},history:[]} as RelationshipDocument;
}
export function validateDocument(input:unknown):RelationshipDocument{
 if(!input||typeof input!=='object'||Array.isArray(input))fail('FORMAT');
 const d:any=clone(input);if(new TextEncoder().encode(JSON.stringify(d)).length>750000)fail('TOO_LARGE');
 const allowed=['kind','formatVersion','id','mode','revision',...collections,'settings','history'];if(Object.keys(d).some(k=>!allowed.includes(k)))fail('UNKNOWN_FIELD');
 if(d.kind!=='nawah-strategic-relationships'||d.formatVersion!==VERSION||!['personal','training'].includes(d.mode)||!Number.isSafeInteger(d.revision)||d.revision<0)fail('FORMAT');
 assertText(d.id,150,true);
 const all=new Set(['self']);
 for(const key of collections){if(!Array.isArray(d[key])||d[key].length>1500)fail('FORMAT');for(const r of d[key]){if(!r||typeof r!=='object'||Array.isArray(r))fail('FORMAT');assertText(r.id,150,true);if(!/^[a-zA-Z0-9_-]+$/.test(r.id)||all.has(r.id))fail('IDENTIFIER');all.add(r.id);}}
 if(!d.settings||d.settings.timeZone!=='Africa/Cairo'||typeof d.settings.weeklyHours!=='number'||d.settings.weeklyHours<1||d.settings.weeklyHours>12)fail('SETTINGS');dateValue(d.settings.startDate);
 const people=idsOf(d.people),orgs=idsOf(d.organizations),goals=idsOf(d.goals),events=idsOf(d.events),collabs=idsOf(d.collaborations),entities=new Set(['self',...people,...orgs,...events,...collabs]);
 for(const p of d.people){
  assertText(p.name,200,true);strings(p.aliases);strings(p.resources);strings(p.purposes);assertText(p.role,200);assertText(p.market,150);assertText(p.domain,150);assertText(p.context,8000);assertText(p.offer,3000);assertText(p.notes,8000);url(p.sourceUrl);dateValue(p.recordedAt);
  if(!['research','known','met','active','paused'].includes(p.stage))fail('STAGE');ref(p.organizationId,orgs);if(p.reviewDate)dateValue(p.reviewDate);
  if(!Array.isArray(p.channels)||p.channels.length>20||!Array.isArray(p.goalLinks)||p.goalLinks.length>50)fail('FORMAT');
  if(p.triggerPhase!=null)assertText(p.triggerPhase,100);if(p.triggerReason!=null)assertText(p.triggerReason,1000);
  for(const c of p.channels){assertText(c.value,1000,true);if(!['phone','email','url','other'].includes(c.type))fail('CHANNEL');if(c.type==='url')url(c.value);}
  for(const g of p.goalLinks){ref(g.goalId,goals,false);assertText(g.resource,300,true);if(!['potential','verified'].includes(g.status))fail('STATUS');assertText(g.evidence,3000,g.status==='verified');}
 }
 for(const o of d.organizations){assertText(o.name,200,true);assertText(o.description,5000);strings(o.resources);url(o.url);}
 for(const g of d.goals){assertText(g.title,200,true);assertText(g.description,5000);assertText(g.beneficiaries,3000);assertText(g.questions,5000);strings(g.needs,20);if(!['personal','nawah','collaboration'].includes(g.level))fail('LEVEL');if(g.reviewDate)dateValue(g.reviewDate);}
 for(const f of d.facts){
  ref(f.from,entities,false);ref(f.to,entities,false);if(f.from===f.to||!RELATIONS[f.kind])fail('RELATION');if(!['present','absent','unknown','proposed'].includes(f.state)||!['observed','reported','interpretation','unverified'].includes(f.sourceKind))fail('FACT');assertText(f.evidence,5000,['present','absent'].includes(f.state));dateValue(f.date);url(f.sourceUrl);
  if(['knows','collaborates','advice','introduced'].includes(f.kind)&&(!new Set(['self',...people]).has(f.from)||!new Set(['self',...people]).has(f.to)))fail('RELATION_TYPE');
  if(f.kind==='attended'&&(!people.has(f.from)||!events.has(f.to)))fail('RELATION_TYPE');
  if(f.kind==='affiliated'&&(!people.has(f.from)||!orgs.has(f.to)))fail('RELATION_TYPE');
 }
 for(const i of d.interactions){assertText(i.title,200,true);assertText(i.summary,8000);assertText(i.questions,5000);assertText(i.nextStep,3000);dateValue(i.date);strings(i.personIds,30);i.personIds.forEach(x=>ref(x,people,false));ref(i.eventId,events);ref(i.collaborationId,collabs);if(!['message','call','meeting','help','introduction'].includes(i.type))fail('FORMAT');url(i.sourceUrl);if(i.type==='introduction'&&new Set(i.personIds).size!==2)fail('INTRO_PARTICIPANTS');if(i.type==='introduction'&&(!['not-requested','requested','agreed','declined'].includes(i.consentA)||!['not-requested','requested','agreed','declined'].includes(i.consentB)))fail('CONSENT');if(i.type==='introduction'&&i.introductionMade&&(i.consentA!=='agreed'||i.consentB!=='agreed'))fail('INTRO_CONSENT');}
 for(const c of d.commitments){assertText(c.title,200,true);assertText(c.notes,5000);ref(c.personId,people);ref(c.goalId,goals);ref(c.collaborationId,collabs);dateValue(c.due);if(!['mine','theirs'].includes(c.direction)||!['open','done','renegotiated','cancelled'].includes(c.status)||!Number.isFinite(c.hours)||c.hours<0||c.hours>100)fail('COMMITMENT');if(c.completedAt)dateValue(c.completedAt);}
 for(const e of d.events){assertText(e.title,200,true);dateValue(e.date);assertText(e.purpose,5000);assertText(e.questions,5000);assertText(e.takeaways,8000);strings(e.personIds,100);e.personIds.forEach(x=>ref(x,people,false));url(e.url);if(!['research','planned','attended','cancelled'].includes(e.status))fail('STATUS');}
 for(const c of d.collaborations){assertText(c.title,200,true);strings(c.personIds,30);c.personIds.forEach(x=>ref(x,people,false));if(!['simulation','real'].includes(c.context)||!['exploring','draft','active','review','closed'].includes(c.status))fail('FORMAT');for(const k of ['goal','alternatives','fit','contributions','roles','decisions','boundaries','evaluation','exit','coordination'])assertText(c[k],8000);if(c.reviewDate)dateValue(c.reviewDate);if(c.status==='active'&&(!c.goal.trim()||!c.roles.trim()||!c.contributions.trim()))fail('CHARTER_REQUIRED');}
 for(const r of d.reviews){assertText(r.title,200,true);ref(r.subjectId,entities);dateValue(r.date);if(!['self','reported'].includes(r.perspective))fail('PERSPECTIVE');for(const k of ['observations','interpretation','alternatives','decision','limits'])assertText(r[k],8000);if(r.perspective==='reported'&&!r.observations.trim())fail('EVIDENCE_REQUIRED');if(r.nextDate)dateValue(r.nextDate);}
 for(const a of d.analyses){assertText(a.question,200,true);assertText(a.decision,6000);assertText(a.limitations,6000);dateValue(a.date);if(!a.snapshot||typeof a.snapshot!=='object')fail('FORMAT');for(const k of ['people','pairs','known','unknown'])if(!Number.isSafeInteger(a.snapshot[k])||a.snapshot[k]<0||a.snapshot[k]>3540)fail('SNAPSHOT');for(const k of ['coverage','density'])if(a.snapshot[k]!==null&&(typeof a.snapshot[k]!=='number'||!Number.isFinite(a.snapshot[k])||a.snapshot[k]<0||a.snapshot[k]>1))fail('SNAPSHOT');if(a.snapshot.coverage!==1&&a.snapshot.density!==null)fail('INCOMPLETE_METRICS');}
 for(const e of d.learningEvidence){if(!/^lesson-[1-8]-[12]$/.test(e.lessonId))fail('LESSON');dateValue(e.date);if(!['simulation','real'].includes(e.context)||!['draft','applied','reviewed','transferred','taught'].includes(e.level))fail('FORMAT');for(const k of ['answer','outcome','limitations','next'])assertText(e[k],12000);url(e.url);if(e.level!=='draft'&&(e.answer.trim().length<30||!e.limitations.trim()))fail('EVIDENCE_REQUIRED');if(['transferred','taught'].includes(e.level)&&!e.outcome.trim())fail('TRANSFER_EVIDENCE');}
 if(!Array.isArray(d.history)||d.history.length>500)fail('FORMAT');for(const h of d.history){assertText(h.kind,100,true);if(!Number.isFinite(Date.parse(h.at)))fail('DATE');}
 return d;
}
