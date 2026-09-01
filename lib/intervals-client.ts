// HTTP-клиент intervals.icu. Контракт проверен по https://intervals.icu/api/v1/docs
// (см. docs/GARMIN_BRIDGE.md). Аутентификация — HTTP Basic, где логин всегда
// буквальная строка "API_KEY", а пароль — личный ключ владельца из /settings.
export const INTERVALS_API_BASE="https://intervals.icu/api/v1";

export type IntervalsActivity={id:string;startDateLocal:string|null;type:string|null;name:string|null;source:string|null};

/**
 * Активности, пришедшие в intervals.icu из Strava, недоступны через её API:
 * сервис отдаёт объект-заглушку с пометкой «STRAVA activities are not
 * available via the API» и отказывает в файле. Это ограничение политики
 * Strava, а не сбой, поэтому такие записи пропускаются без ошибки.
 */
export const isStravaSourced=(activity:{source:string|null})=>String(activity.source||"").toUpperCase()==="STRAVA";

export class IntervalsApiError extends Error{
 status:number;
 retryAfterSeconds:number|null;
 constructor(message:string,status:number,retryAfterSeconds:number|null=null){super(message);this.name="IntervalsApiError";this.status=status;this.retryAfterSeconds=retryAfterSeconds}
}

// Ключ живёт только на сервере. Basic-заголовок собирается на каждый запрос и
// никогда не логируется: в сообщения об ошибках попадает лишь статус.
const authHeader=(apiKey:string)=>`Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`;

const retryAfter=(response:Response)=>{
 const raw=Number(response.headers.get("retry-after"));
 return Number.isFinite(raw)&&raw>0?Math.min(raw,3600):null;
};

async function request(path:string,apiKey:string,fetcher:typeof fetch):Promise<Response>{
 let response:Response;
 try{response=await fetcher(`${INTERVALS_API_BASE}${path}`,{headers:{authorization:authHeader(apiKey),accept:"*/*"},cache:"no-store"})}
 catch{throw new IntervalsApiError("intervals.icu недоступен",503)}
 if(response.ok)return response;
 if(response.status===401||response.status===403)throw new IntervalsApiError("intervals.icu отклонил API-ключ",response.status);
 if(response.status===429)throw new IntervalsApiError("intervals.icu ограничил частоту запросов",429,retryAfter(response));
 throw new IntervalsApiError(`intervals.icu вернул ${response.status}`,response.status,retryAfter(response));
}

const text=(value:unknown,max:number)=>{
 const raw=typeof value==="string"?value.trim():"";
 return raw?raw.slice(0,max):null;
};

// Идентификаторы активностей intervals.icu не только числовые (у импортов из
// Garmin вид "i12345678"), поэтому ограничиваем безопасным набором символов
// вместо \d+ — иначе строка уедет в путь URL без проверки.
const activityId=(value:unknown)=>{
 const raw=typeof value==="string"?value:typeof value==="number"?String(value):"";
 return /^[A-Za-z0-9_-]{1,64}$/.test(raw)?raw:null;
};

/** Список активностей за диапазон дат (локальные ISO-даты), по убыванию даты. */
export async function listIntervalsActivities(
 apiKey:string,athleteId:string,range:{oldest:string;newest:string;limit?:number},fetcher:typeof fetch=fetch,
):Promise<IntervalsActivity[]>{
 const query=new URLSearchParams({oldest:range.oldest,newest:range.newest});
 if(range.limit)query.set("limit",String(Math.min(Math.max(1,Math.trunc(range.limit)),200)));
 const response=await request(`/athlete/${encodeURIComponent(athleteId)}/activities?${query}`,apiKey,fetcher);
 let payload:unknown;
 try{payload=await response.json()}catch{throw new IntervalsApiError("intervals.icu вернул некорректный JSON",502)}
 if(!Array.isArray(payload))throw new IntervalsApiError("intervals.icu вернул неожиданный формат списка",502);
 const activities:IntervalsActivity[]=[];
 for(const raw of payload as any[]){
  const id=activityId(raw?.id);
  if(!id)continue;
  activities.push({
   id,
   startDateLocal:text(raw?.start_date_local,40),
   type:text(raw?.type,80),
   name:text(raw?.name,240),
   source:text(raw?.source,80),
  });
 }
 return activities;
}

/**
 * Оригинальный файл активности — настоящий FIT с часов. Если оригинала нет
 * (например, активность заведена вручную), intervals.icu отвечает 404, и мы
 * откатываемся на перегенерированный ей же FIT: он беднее, но парсится.
 */
export async function downloadIntervalsActivityFit(
 apiKey:string,id:string,fetcher:typeof fetch=fetch,
):Promise<{bytes:Uint8Array;original:boolean}>{
 const safeId=activityId(id);
 if(!safeId)throw new IntervalsApiError("Некорректный id активности intervals.icu",400);
 let original=true,response:Response;
 try{response=await request(`/activity/${encodeURIComponent(safeId)}/file`,apiKey,fetcher)}
 catch(error){
  // 422 «Activity has no original file to download» — штатный ответ, когда
  // оригинала нет; 404 — когда активности нет вовсе. В обоих случаях пробуем
  // FIT, перегенерированный самой intervals.icu.
  if(!(error instanceof IntervalsApiError)||(error.status!==404&&error.status!==422))throw error;
  original=false;
  response=await request(`/activity/${encodeURIComponent(safeId)}/fit-file`,apiKey,fetcher);
 }
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(!bytes.length)throw new IntervalsApiError("intervals.icu вернул пустой файл активности",502);
 return {bytes,original};
}
