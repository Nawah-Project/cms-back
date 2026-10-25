const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {mkdtemp, rm} = require('node:fs/promises');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
if(process.env.NODE_ENV !== 'test' || !process.env.TEST_DATABASE_URL || new URL(process.env.TEST_DATABASE_URL).pathname !== '/cms_test') throw new Error('A disposable cms_test database is required');
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
const {PrismaClient}=require('@prisma/client');
const {EventEmitter2}=require('@nestjs/event-emitter');
const {JourneyEngineService}=require('../dist/journey-engine/journey-engine.service');
const {ProfileService}=require('../dist/profile/profile.service');
const {TasksService}=require('../dist/tasks/tasks.service');
const {FeedbackService}=require('../dist/feedback/feedback.service');
const {ApplicationsService}=require('../dist/applications/applications.service');
const db=new PrismaClient();const journey=new JourneyEngineService(db);let storage;
async function participant(week=0,code='TASK_0',unlockedInsightCodes=[]){return db.user.create({data:{name:'Synthetic stabilization participant',email:randomUUID()+'@example.invalid',journeyState:{create:{currentWeek:week,currentNodeCode:code,unlockedInsightCodes,currentNodeStartedAt:new Date(Date.now()-1000),weekStartedAt:new Date()}}}})}
before(async()=>{storage=await mkdtemp(join(tmpdir(),'nawah-stage-a-'));await journey.onModuleInit()});
after(async()=>{await db.$disconnect();await rm(storage,{recursive:true,force:true})});
async function status(p,code){await assert.rejects(p,e=>e.getStatus?.()===code)}
test('future review, wrong activity type and empty reflection are rejected',async()=>{
 const a=await participant();await status(journey.submitSideTask(a.id,{nodeCode:'W3_REVIEW',type:'WEEKLY_REVIEW',reviewSummary:'future'}),403);
 const b=await participant(1,'W1_M1');await status(journey.submitSideTask(b.id,{nodeCode:'W1_M1',type:'LINKEDIN_POST',postUrl:'https://example.com/p'}),400);
 const c=await participant(1,'W1_REVIEW');await status(journey.submitSideTask(c.id,{nodeCode:'W1_REVIEW',type:'WEEKLY_REVIEW',reviewSummary:'  '}),400);
});
test('distinct rapid posts persist; identical and concurrent retries return one record',async()=>{
 const a=await participant(3,'W3_M3');const dto={nodeCode:'W3_M3',type:'LINKEDIN_POST',postUrl:'https://linkedin.com/posts/first'};
 const first=await journey.submitSideTask(a.id,dto);await journey.submitSideTask(a.id,{...dto,postUrl:'https://linkedin.com/posts/second'});
 assert.equal((await journey.submitSideTask(a.id,dto)).submission.id,first.submission.id);
 const [r1,r2]=await Promise.all([journey.submitSideTask(a.id,{...dto,postUrl:'https://linkedin.com/posts/concurrent'}),journey.submitSideTask(a.id,{...dto,postUrl:'https://linkedin.com/posts/concurrent'})]);assert.equal(r1.submission.id,r2.submission.id);
 assert.equal(await db.sideTaskSubmission.count({where:{userId:a.id}}),3);assert.equal((await journey.getJourneyStateSummary(a.id)).currentNode.progress.posts.current,3);
});
test('outreach requires fields and an owned application reference',async()=>{
 const a=await participant(4,'W4_M1'),b=await participant();const app=await db.application.create({data:{userId:b.id,companyName:'Synthetic',jobTitle:'Role',applicationDate:'2026-10-26'}});
 await status(journey.submitSideTask(a.id,{type:'OUTREACH_CONTACT',nodeCode:'W4_M1'}),400);
 await status(journey.submitSideTask(a.id,{type:'OUTREACH_CONTACT',nodeCode:'W4_M1',contactName:'A',companyName:'B',contactMethod:'LinkedIn',applicationId:app.id}),403);
 await journey.submitSideTask(a.id,{type:'OUTREACH_CONTACT',nodeCode:'W4_M1',contactName:'A',companyName:'B',contactMethod:'LinkedIn'});
});
test('CV changes and legacy change logs never complete weekly reflection; identical upload is idempotent',async()=>{
 const a=await participant(1,'W1_REVIEW');const profile=new ProfileService(db,storage);
 const upload=(text)=>{const buffer=Buffer.from('%PDF-1.7\n'+text);return{buffer,size:buffer.length,originalname:'synthetic.pdf',mimetype:'application/pdf'}};
 await profile.uploadCv(a.id,upload('first'));await profile.uploadCv(a.id,upload('second'));await profile.uploadCv(a.id,upload('second'));
 assert.equal(await db.userCvHistory.count({where:{userId:a.id}}),2);
 await db.sideTaskSubmission.create({data:{userId:a.id,nodeCode:'W1_REVIEW',journeyWeek:1,type:'WEEKLY_REVIEW',reviewSummary:JSON.stringify({isUserChange:true,category:'CV_UPDATE'})}});
 const before=await journey.getJourneyStateSummary(a.id);assert.equal(before.state.currentNodeCode,'W1_REVIEW');assert.equal(before.state.cvVersionNumber,2);
 await journey.submitSideTask(a.id,{nodeCode:'W1_REVIEW',type:'WEEKLY_REVIEW',reviewSummary:'Reviewed the week and planned improvements',newCvUploaded:true});
 const after=await journey.getJourneyStateSummary(a.id);assert.equal(after.state.currentNodeCode,'W2_M1');assert.equal(after.state.cvVersionNumber,2);
});
test('locked guidance is unreadable; catalog reading persists and unlocks tasks only after time-management reading',async()=>{
 const code='INSIGHT_W3_TIME_MGMT', a=await participant(3,'W3_M2');const author=await db.user.create({data:{name:'Synthetic mentor',email:randomUUID()+'@example.invalid',role:'ADMIN'}});
 const p=await db.feedbackPost.create({data:{authorId:author.id,title:'Time management',content:'<p>Existing guidance</p>',visibility:'ALL',unlockTriggerCode:code}});
 const feedback=new FeedbackService(db,{}), tasks=new TasksService(db);
 await status(feedback.getForMember(a.id,p.id),404);await status(feedback.markRead(a.id,p.id),404);await status(journey.markInsightRead(a.id,code),403);await status(tasks.assertProfDevUnlocked(a.id),403);
 await db.userJourneyState.update({where:{userId:a.id},data:{unlockedInsightCodes:[code]}});
 await feedback.getForMember(a.id,p.id);await journey.markInsightRead(a.id,code);await journey.markInsightRead(a.id,code);
 const state=await journey.getJourneyStateSummary(a.id);assert.deepEqual(state.state.readInsightCodes,[code]);assert.equal(state.features.professionalTasks,true);await tasks.assertProfDevUnlocked(a.id);
 assert.equal(await db.feedbackRead.count({where:{userId:a.id,feedbackId:p.id}}),1);
});
test('application events observe committed data and activation progresses with five real records',async()=>{
 const a=await participant();const emitter=new EventEmitter2();emitter.on('application.created',p=>journey.evaluateProgress(p.userId));let observed;
 emitter.on('application.updated',async p=>{observed=(await db.application.findUnique({where:{id:p.applicationId}})).stage;await journey.evaluateProgress(p.userId)});
 const apps=new ApplicationsService(db,emitter);let last;
 for(let i=0;i<5;i++)last=await apps.create(a.id,{companyName:'Synthetic '+i,jobTitle:'Role'});
 assert.equal((await journey.getJourneyStateSummary(a.id)).state.currentNodeCode,'W1_M1');await apps.update(a.id,last.id,{stage:'INTERVIEW'});assert.equal(observed,'INTERVIEW');
});
test('early completion waits for persisted schedule; returning later advances without reusing applications',async()=>{
 const a=await participant(1,'W1_M1');await db.application.createMany({data:Array.from({length:10},(_,i)=>({userId:a.id,companyName:'Synthetic '+i,jobTitle:'Role',applicationDate:'2026-10-26',journeyWeek:1}))});
 const early=await journey.getJourneyStateSummary(a.id);assert.equal(early.state.currentNodeCode,'W1_M1');assert.ok(early.state.completedNodeCodes.includes('W1_M1'));
 await db.userJourneyState.update({where:{userId:a.id},data:{weekStartedAt:new Date(Date.now()-86400001)}});
 const later=await journey.getJourneyStateSummary(a.id);assert.equal(later.state.currentNodeCode,'W1_M2');assert.equal(later.currentNode.progress.apps.current,0);
});
