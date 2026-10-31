import { classifyJourney, median, metricRate } from './journey-observatory.model';
import { JOURNEY_V4_NODES } from '../journey-engine/journey-v4.seed';
import type { JourneyNode, UserJourneyState } from '@prisma/client';
const now=new Date('2026-10-27T12:00:00Z'),days=(n:number)=>new Date(now.getTime()-n*86400000);
function base(code='W1_M1'){
 const nodes=JOURNEY_V4_NODES as unknown as JourneyNode[],node=nodes.find(n=>n.code===code)!;
 return {now,idleDays:3,registeredAt:days(20),profileReady:true,state:{currentNodeCode:code,currentWeek:node.weekNumber,currentNodeStartedAt:days(5),weekStartedAt:days(8),completedNodeCodes:['TASK_0'],readInsightCodes:['INSIGHT_TASK_0_CV_BASE'],cvVersionNumber:2,cvFoundationBaselineVersion:1,cvFoundationCompletedAt:days(6),week1StartedAt:days(8)} as UserJourneyState,node,nodes,counts:{apps:0,tailored:0,posts:0,outreach:0,reviews:0},guide:{status:'COMPLETED',currentStep:7,startedAt:days(10)},cvs:[{versionNumber:2,uploadedAt:days(7)}],lastWorkAt:days(4)};
}
describe('Journey observatory classification',()=>{
 test('distinguishes a scheduled wait from inactivity requiring research',()=>{const b=base('W1_M3');b.state.weekStartedAt=days(0);b.state.completedNodeCodes.push('W1_M3');b.lastWorkAt=days(5);const result=classifyJourney(b);expect(result.gate).toBe('TIME');expect(result.needsReview).toBe(false);expect(result.waitHours).toBe(72)});
 test('blocks on actual CV foundation, even if application work is finished',()=>{const b=base();b.state.readInsightCodes=[];b.state.cvFoundationCompletedAt=null;b.counts.apps=10;expect(classifyJourney(b).gate).toBe('CV')});
 test('a newer CV uploaded before week unlock does not satisfy the prerequisite',()=>{const b=base();b.state.cvFoundationCompletedAt=null;b.cvs=[{versionNumber:2,uploadedAt:days(12)}];expect(classifyJourney(b).gate).toBe('CV')});
 test('a read foundation and a qualifying later CV preserve legacy completion',()=>{const b=base();b.state.cvFoundationCompletedAt=null;expect(classifyJourney(b).gate).toBe('APPLICATIONS')});
 test('keeps required guide blocking Task 0',()=>{const b=base('TASK_0');b.guide.status='IN_PROGRESS';b.guide.currentStep=3;b.counts.apps=12;expect(classifyJourney(b).gate).toBe('GUIDE')});
 test('separates tailored, publishing and outreach requirements',()=>{const tailored=base('W2_M3');tailored.counts.apps=25;tailored.counts.tailored=1;expect(classifyJourney(tailored).gate).toBe('TAILORED');const posts=base('W3_M2');posts.counts.apps=22;posts.counts.tailored=4;expect(classifyJourney(posts).gate).toBe('POSTS');const outreach=base('W4_M4');outreach.counts.apps=32;outreach.counts.tailored=6;outreach.counts.posts=2;expect(classifyJourney(outreach).gate).toBe('OUTREACH')});
 test('work still being done is not automatically an inactivity alert',()=>{const b=base();b.lastWorkAt=days(1);expect(classifyJourney(b).needsReview).toBe(false)});
 test('marks ready cases separately from missing work',()=>{const b=base();b.counts.apps=10;expect(classifyJourney(b).gate).toBe('READY')});
 test('review stations require a reflection',()=>{expect(classifyJourney(base('W2_REVIEW')).gate).toBe('REVIEW')});
 test('completed final reports never appear as stalled',()=>{const b=base('FINAL_REPORT');b.state.completedNodeCodes.push('FINAL_REPORT');b.lastWorkAt=days(20);expect(classifyJourney(b)).toMatchObject({gate:'FINISHED',needsReview:false})});
 test('absent and unknown state remain explicit instead of becoming Task 0',()=>{const b=base();expect(classifyJourney({...b,state:null}).gate).toBe('NOT_STARTED');expect(classifyJourney({...b,node:undefined}).gate).toBe('UNKNOWN');expect(classifyJourney({...b,profileReady:false}).gate).toBe('PROFILE')});
 test('zero samples are missing evidence, while median resists a long outlier',()=>{expect(median([])).toBe(null);expect(metricRate(0,0)).toBe(null);expect(metricRate(0,4)).toBe(0);expect(median([1,2,100])).toBe(2)});
});
