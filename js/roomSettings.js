// Room menu presets shared between UI and automated tests.
export const TIME_LIMITS=Object.freeze([
  Object.freeze([0,'No Limit']),Object.freeze([300,'5 minutes']),
  Object.freeze([600,'10 minutes']),Object.freeze([900,'15 minutes']),
  Object.freeze([1200,'20 minutes']),Object.freeze([1800,'30 minutes']),
]);
export const KILL_LIMITS=Object.freeze([
  Object.freeze([0,'No Limit']),Object.freeze([15,'15 kills']),
  Object.freeze([30,'30 kills']),Object.freeze([50,'50 kills']),
  Object.freeze([80,'80 kills']),Object.freeze([100,'100 kills']),
]);
export const PVP_ROOM_SIZES=Object.freeze([6,10,14]);
export function validateMatchSettings(mode,duration,scoreLimit,maxPlayers){
  if(mode==='survival')return {valid:true};
  if(!['tdm','ffa','gunGame'].includes(mode))return {valid:false,error:'Unknown match mode'};
  if(!TIME_LIMITS.some(([s])=>s===duration))
    return {valid:false,error:'Choose a listed time limit'};
  if(!KILL_LIMITS.some(([n])=>n===scoreLimit))
    return {valid:false,error:'Choose a listed kill limit'};
  if(duration===0&&scoreLimit===0)
    return {valid:false,error:'Choose a time limit or a kill limit (both cannot be No Limit)'};
  if(!PVP_ROOM_SIZES.includes(maxPlayers))
    return {valid:false,error:'Choose a supported room size'};
  return {valid:true};
}
