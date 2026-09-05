export type CoachChatRequest={id:string;text:string};
export type CoachChatErrorPayload={error?:unknown;code?:unknown;provider?:unknown};

export function canSubmitCoachQuestion(question:string,sending:boolean):boolean{
  return !sending&&question.trim().length>0;
}

export function coachRequestForQuestion(current:CoachChatRequest|null,text:string,createId:()=>string):CoachChatRequest{
  const normalized=text.trim();
  return current?.text===normalized?current:{id:createId(),text:normalized};
}

export function coachErrorMessage(payload:CoachChatErrorPayload,status?:number):string{
  if(typeof payload.error==="string"&&payload.error.trim())return payload.error.trim();
  if(status===401)return "Сессия истекла — войдите в RITMOVIS снова.";
  if(status===403)return "Запрос отклонён проверкой безопасности. Обновите страницу и повторите.";
  if(status===429)return "Дневной лимит сообщений исчерпан. Продолжите завтра.";
  return status?`Не удалось получить ответ тренера (HTTP ${status}).`:"Тренер не ответил — проверьте соединение.";
}
