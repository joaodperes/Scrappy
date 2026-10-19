// Persisted, per-profile notification progression. Independent from DOM,
// Firebase and weapon stats so small-count challenges can be tested directly.
export const PROGRESS_NOTICE_VERSION=2;
export function notificationKey(unlock){
  return [unlock.type||'',unlock.weapon||'',unlock.id||''].join(':');
}
export function achievableMilestones(challenge){
  if(!challenge)return [];
  if(challenge.isComposite&&Array.isArray(challenge.subChallenges)){
    const sub=challenge.subChallenges;
    // A two-part achievement with one kill per part has only 50% and
    // 100% states; 25% and 75% can never occur.
    if(sub.length===2 && sub.every(c=>c.target===1))
      return [0.5];
    if(sub.length===1)return achievableMilestones(sub[0]);
    return [0.25,0.5,0.75];
  }
  const target=Number(challenge.target);
  if(!Number.isFinite(target)||target<=1)return [];
  if(Number.isInteger(target)&&target<=3)
    return Array.from({length:target-1},(_,i)=>(i+1)/target);
  return [0.25,0.5,0.75];
}
export function crossedMilestone(challenge,previous,current){
  if(!Number.isFinite(previous)||!Number.isFinite(current))return null;
  const lo=Math.max(0,Math.min(1,previous));
  const hi=Math.max(0,Math.min(1,current));
  // Completion notifications are handled by _checkChallenges, not by
  // the progress toast pipeline.
  if(hi<=lo || hi>=1)return null;
  const crossed=achievableMilestones(challenge)
    .filter(t=>t>lo+1e-9&&t<=hi+1e-9);
  return crossed.length?crossed.at(-1):null;
}
export function upgradeNotificationHistory(profile,entries,getProgress){
  if(profile.progressNoticeVersion===PROGRESS_NOTICE_VERSION &&
    profile.progressNoticeSeen&&typeof profile.progressNoticeSeen==='object'
    && !Array.isArray(profile.progressNoticeSeen))return false;
  const seen={};
  // Existing Firebase/local profiles may already have advanced through
  // challenges: never replay their old 25/50/75% notifications.
  for(const u of entries){
    if(!u.challenge)continue;
    const pct=Number(getProgress(u.challenge).pct);
    seen[notificationKey(u)]=Number.isFinite(pct)?Math.max(0,Math.min(1,pct)):0;
  }
  profile.progressNoticeSeen=seen;
  profile.progressNoticeVersion=PROGRESS_NOTICE_VERSION;
  return true;
}
