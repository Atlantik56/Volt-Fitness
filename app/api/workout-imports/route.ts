import { requireAuth,sameOrigin } from "@/lib/auth";
import { importFit,linkImport,MAX_FIT_FILE_SIZE,validateFitUpload } from "@/lib/fit-import-service";
export const runtime="nodejs";

export async function POST(req:Request){
 const denied=await requireAuth();if(denied)return denied;
 if(!sameOrigin(req))return new Response(null,{status:403});
 const contentType=req.headers.get("content-type")||"";
 if(contentType.includes("application/json")){
  let body:any;try{body=await req.json()}catch{return Response.json({error:"Некорректный JSON"},{status:400})}
  if(body.action!=="link")return Response.json({error:"Неизвестное действие"},{status:400});
  const linked=linkImport(body.importId,body.draftId);
  return linked.ok?Response.json(linked):Response.json({error:linked.error},{status:linked.status});
 }
 const contentLength=Number(req.headers.get("content-length")||0);
 if(contentLength>MAX_FIT_FILE_SIZE+1_000_000)return Response.json({error:"FIT-файл больше 10 МБ"},{status:413});
 let form:FormData;try{form=await req.formData()}catch{return Response.json({error:"Не удалось прочитать загрузку"},{status:400})}
 const file=form.get("file");
 if(!(file instanceof File))return Response.json({error:"Выберите FIT-файл"},{status:400});
 const invalid=validateFitUpload(file.name,file.size);
 if(invalid)return Response.json({error:invalid.error},{status:invalid.status});
 const bytes=new Uint8Array(await file.arrayBuffer());
 const imported=importFit(bytes);
 if(!imported.ok)return Response.json({error:imported.error},{status:imported.status});
 return Response.json({ok:true,...imported.result},{status:imported.result.duplicate?200:201,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});
}
