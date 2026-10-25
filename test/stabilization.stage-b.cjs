const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const{randomUUID}=require('node:crypto');
if(process.env.NODE_ENV!=='test'||!process.env.TEST_DATABASE_URL||new URL(process.env.TEST_DATABASE_URL).pathname!=='/cms_test')throw Error('Disposable cms_test required');process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
const{PrismaClient}=require('@prisma/client');const{JourneyEngineService}=require('../dist/journey-engine/journey-engine.service');const{AdminService}=require('../dist/admin/admin.service');
const db=new PrismaClient(),journey=new JourneyEngineService(db);
async function user(week=1,code='W1_REVIEW',codes=[]){return db.user.create({data:{name:'Synthetic report member',email:randomUUID()+'@example.invalid',journeyState:{create:{currentWeek:week,currentNodeCode:code,completedNodeCodes:codes}}}})}
async function app(u,extra={}){return db.application.create({data:{userId:u.id,companyName:'Synthetic',jobTitle:'Role',applicationDate:'2026-10-26',journeyWeek:1,...extra}})}
before(()=>journey.onModuleInit());after(()=>db.$disconnect());
test('report/journey share definitions: no response/withdrawal excluded, closed interview retained, unknown explicit',async()=>{
 const u=await user();await app(u,{stage:'CLOSED',outcome:'NO_RESPONSE'});await app(u,{stage:'CLOSED',outcome:'WITHDRAWN'});await app(u,{stage:'CLOSED',outcome:'REJECTED'});
 await app(u,{stage:'CLOSED',outcome:'REJECTED',transitions:{create:{userId:u.id,fromStage:'INTERVIEW',toStage:'CLOSED',outcome:'REJECTED'}}});await app(u,{stage:'ASSIGNMENT',hasAssignment:true});await app(u,{stage:'DECISION',outcome:'ACCEPTED'});
 const r=await journey.getReports(u.id),s=await journey.getJourneyStateSummary(u.id);assert.equal(r.overall.logged,6);assert.equal(r.overall.positive,3);assert.equal(r.overall.interviews,1);assert.equal(r.overall.unknownInterviews,5);assert.equal(s.weeklyStats.interviewsOrResponses,r.weeks[1].positive);assert.equal(s.weeklyStats.conversionRate,r.weeks[1].positiveRate);
});
test('all 1007 applications aggregate without truncation and late transition dates remain distinct from cohorts',async()=>{
 const u=await user();await db.application.createMany({data:Array.from({length:1007},(_,i)=>({userId:u.id,companyName:'Synthetic '+i,jobTitle:'Role',applicationDate:'2026-10-01',journeyWeek:1,createdAt:new Date('2026-10-01')}))});
 const a=await db.application.findFirst({where:{userId:u.id}});await db.application.update({where:{id:a.id},data:{stage:'INTERVIEW',transitions:{create:{userId:u.id,fromStage:'APPLIED',toStage:'INTERVIEW',changedAt:new Date('2026-10-22')}}}});
 const r=await journey.getReports(u.id);assert.equal(r.overall.logged,1007);assert.equal(r.weeks[1].interviews,1);assert.equal(r.weeks[4].logged,0);assert.equal(r.daily.find(d=>d.date==='2026-10-01').logged,1007);assert.equal(r.daily.find(d=>d.date==='2026-10-22').positiveEvents,1);
});
test('CV history, legacy change logs and true reviews are distinguished and remain after refresh',async()=>{
 const u=await user(3,'W3_REVIEW');await db.userCvHistory.create({data:{userId:u.id,versionNumber:9,originalName:'v9.pdf',mimeType:'application/pdf',size:10,storageKey:randomUUID()}});
 await db.sideTaskSubmission.createMany({data:[{userId:u.id,nodeCode:'W3_REVIEW',journeyWeek:3,type:'WEEKLY_REVIEW',reviewSummary:'A real reflection'},{userId:u.id,nodeCode:'W3_REVIEW',journeyWeek:3,type:'WEEKLY_REVIEW',reviewSummary:'{"isUserChange":true,"cvVersion":99}'}]});
 await journey.submitSideTask(u.id,{type:'USER_CHANGE',nodeCode:'W3_REVIEW',reviewSummary:'Updated portfolio examples'});
 const r=await journey.getReports(u.id);assert.equal(r.overall.reviews,1);assert.equal(r.cvs.length,1);assert.equal(r.cvs[0].versionNumber,9);assert.equal(r.activities.filter(a=>a.legacyChange).length,1);assert.equal(r.activities.filter(a=>a.type==='USER_CHANGE').length,1);assert.deepEqual((await journey.getReports(u.id)).cvs,r.cvs);
 const outsider=await user();assert.equal((await journey.getReports(outsider.id)).overall.logged,0);
});
test('final requires every prior milestone, persists and concurrent retries add exactly one completion',async()=>{
 const nodes=await db.journeyNode.findMany({orderBy:{orderIndex:'asc'}}),codes=nodes.filter(n=>n.code!=='FINAL_REPORT').map(n=>n.code);
 const early=await user();await assert.rejects(journey.completeFinalReport(early.id),e=>e.getStatus()===403);
 const missing=await user(4,'FINAL_REPORT',codes.slice(1));await assert.rejects(journey.completeFinalReport(missing.id),e=>e.getStatus()===403);
 const u=await user(4,'FINAL_REPORT',codes);assert.equal((await journey.getReports(u.id)).completed,false);
 await Promise.all([journey.completeFinalReport(u.id),journey.completeFinalReport(u.id)]);await journey.completeFinalReport(u.id);
 const r=await journey.getReports(u.id);assert.equal(r.completed,true);assert.equal(r.completedNodeCodes.filter(c=>c==='FINAL_REPORT').length,1);assert.equal(r.completedNodeCodes.length,25);
 const funnel=await new AdminService(db).getGranularFunnel();
 assert.ok(funnel.stages.find(s=>s.code==='JOURNEY_COMPLETED').stuckUsers.some(m=>m.id===u.id));
 assert.ok(!funnel.stages.find(s=>s.code==='JOURNEY_COMPLETED').stuckUsers.some(m=>m.id===missing.id));
 const summary=await journey.getJourneyStateSummary(u.id);assert.equal(summary.nodes.find(n=>n.code==='FINAL_REPORT').status,'COMPLETED');
});
