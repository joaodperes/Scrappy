// node --test scripts/milestone-notifications.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
async function helpers(){
  const s=fs.readFileSync(path.join(__dirname,'../js/milestoneNotifications.js'),'utf8');
  return import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
}
test('two-kill challenge offers 50% only; 100% belongs to completion event',async()=>{
  const {achievableMilestones,crossedMilestone}=await helpers();
  const challenge={event:'KILL',target:2};
  assert.deepEqual(achievableMilestones(challenge),[.5]);
  assert.equal(crossedMilestone(challenge,0,.5),.5);
  assert.equal(crossedMilestone(challenge,.5,1),null);
  assert.equal(crossedMilestone(challenge,.5,.5),null);
  assert.equal(crossedMilestone(challenge,0,1),null);
});
test('two one-kill subchallenges never announce impossible 25/75 milestones',async()=>{
  const {achievableMilestones,crossedMilestone}=await helpers();
  const challenge={isComposite:true,subChallenges:[{target:1},{target:1}]};
  assert.deepEqual(achievableMilestones(challenge),[.5]);
  assert.equal(crossedMilestone(challenge,0,.5),.5);
  assert.equal(crossedMilestone(challenge,.5,1),null);
});
test('single and three-count achievements have only reachable partial states',async()=>{
  const {achievableMilestones}=await helpers();
  assert.deepEqual(achievableMilestones({target:1}),[]);
  const three=achievableMilestones({target:3});
  assert.equal(three.length,2);
  assert.equal(Math.round(three[0]*100),33);
  assert.equal(Math.round(three[1]*100),67);
});
test('skipped old 25/50/75 milestones do not replay after cloud profile migration',async()=>{
  const {upgradeNotificationHistory,notificationKey,crossedMilestone}=await helpers();
  const unlock={id:'boss_attachment',weapon:'PISTOL',type:'attachment',
    challenge:{target:20}};
  const profile={stats:{},progressNoticeVersion:0,progressNoticeSeen:{}};
  let pct=.8;
  const progress=()=>({pct});
  assert.equal(upgradeNotificationHistory(profile,[unlock],progress),true);
  const key=notificationKey(unlock);
  assert.equal(profile.progressNoticeSeen[key],.8);
  assert.equal(crossedMilestone(unlock.challenge,profile.progressNoticeSeen[key],.8),null);
  assert.equal(upgradeNotificationHistory(profile,[unlock],progress),false);
  pct=.9;
  assert.equal(crossedMilestone(unlock.challenge,profile.progressNoticeSeen[key],.9),null);
});
test('milestone toast shows only the highest crossed threshold per update',async()=>{
  const {crossedMilestone}=await helpers();
  const challenge={target:100};
  assert.equal(crossedMilestone(challenge,0,.61),.5);
  assert.equal(crossedMilestone(challenge,.61,.8),.75);
  assert.equal(crossedMilestone(challenge,.8,1),null);
});
