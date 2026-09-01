export type MatchConfidence="high"|"medium"|"low"|"no_match";
export type MatchActivity={activityType:string;startedAt:string;durationSeconds:number;distanceMeters?:number|null;subtype?:string|null;localDate?:string|null};
export type MatchPlan={id:number;date:string;activityType:string;title:string;startedAt?:string|null;durationSeconds?:number|null;distanceMeters?:number|null;subtype?:string|null};
export type ActivityMatch={planId:number;title:string;score:number;confidence:MatchConfidence;reasons:string[]};

const dayMs=86_400_000;
const validDate=(value:string|null|undefined)=>{const parsed=new Date(String(value||""));return Number.isFinite(parsed.getTime())?parsed:null};
const similarity=(actual:number|null|undefined,planned:number|null|undefined)=>{
 if(!Number.isFinite(Number(actual))||!Number.isFinite(Number(planned))||Number(actual)<=0||Number(planned)<=0)return null;
 return Math.max(0,1-Math.abs(Number(actual)-Number(planned))/Math.max(Number(actual),Number(planned)));
};
const rounded=(value:number)=>Math.round(Math.max(0,Math.min(1,value))*100)/100;

export function scoreActivityMatch(activity:MatchActivity,plan:MatchPlan):ActivityMatch{
 const reasons:string[]=[];
 let score=0;
 const sportMatch=activity.activityType===plan.activityType;
 if(sportMatch){score+=.35;reasons.push("sport matched")}else reasons.push("sport differs");

 const activityDate=activity.localDate&&/^\d{4}-\d{2}-\d{2}$/.test(activity.localDate)?activity.localDate:activity.startedAt.slice(0,10);
 const dayDifference=Math.abs((validDate(`${activityDate}T12:00:00Z`)?.getTime()||0)-(validDate(`${plan.date}T12:00:00Z`)?.getTime()||0))/dayMs;
 if(dayDifference===0){score+=.25;reasons.push("same planned day")}
 else if(dayDifference===1){score+=.1;reasons.push("planned day is adjacent")}
 else reasons.push("planned day is too far");

 const actualStart=validDate(activity.startedAt),plannedStart=validDate(plan.startedAt);
 if(actualStart&&plannedStart){
  const hours=Math.abs(actualStart.getTime()-plannedStart.getTime())/3_600_000;
  if(hours<=2){score+=.15;reasons.push("start time within 2 hours")}
  else if(hours<=6){score+=.08;reasons.push("start time within 6 hours")}
 }

 const duration=similarity(activity.durationSeconds,plan.durationSeconds);
 if(duration!==null){
  score+=.15*duration;
  if(duration>=.9)reasons.push(`duration within ${Math.round((1-duration)*100)}%`);
  else if(duration>=.65)reasons.push("duration is broadly compatible");
  else reasons.push("duration differs materially");
 }

 const distance=similarity(activity.distanceMeters,plan.distanceMeters);
 if(distance!==null){
  score+=.08*distance;
  if(distance>=.9)reasons.push(`distance within ${Math.round((1-distance)*100)}%`);
  else if(distance>=.65)reasons.push("distance is broadly compatible");
  else reasons.push("distance differs materially");
 }

 if(activity.subtype&&plan.subtype&&activity.subtype.toLowerCase()===plan.subtype.toLowerCase()){
  score+=.02;reasons.push("workout subtype matched");
 }

 score=rounded(score);
 // A different sport is never a usable suggestion even when dates coincide.
 const confidence:MatchConfidence=!sportMatch?"no_match":score>=.75?"high":score>=.55?"medium":score>=.32?"low":"no_match";
 return {planId:plan.id,title:plan.title,score,confidence,reasons};
}

export function rankActivityMatches(activity:MatchActivity,plans:MatchPlan[]):ActivityMatch[]{
 return plans.map(plan=>scoreActivityMatch(activity,plan)).sort((a,b)=>b.score-a.score||a.planId-b.planId);
}
