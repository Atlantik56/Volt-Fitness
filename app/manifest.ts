import type { MetadataRoute } from "next";
import { APP_NAME, APP_MOTTO } from "@/lib/brand";
export default function manifest():MetadataRoute.Manifest{return{name:APP_NAME,short_name:APP_NAME,description:APP_MOTTO,id:"/",scope:"/",start_url:"/",prefer_related_applications:false,display:"standalone",background_color:"#080a0b",theme_color:"#081426",lang:"ru",icons:[

{src:"/icon-192.png?v=volt-20261007",sizes:"192x192",type:"image/png",purpose:"any"},
{src:"/icon-512.png?v=volt-20261007",sizes:"512x512",type:"image/png",purpose:"any"},
{src:"/icon-maskable-192.png?v=volt-20261007",sizes:"192x192",type:"image/png",purpose:"maskable"},
{src:"/icon-maskable-512.png?v=volt-20261007",sizes:"512x512",type:"image/png",purpose:"maskable"}
],shortcuts:[{name:"VOLT Сегодня",short_name:"Сегодня",description:"Тренировка, активность и самочувствие на сегодня",url:"/widget",icons:[{src:"/icon-192.png?v=volt-20261007",sizes:"192x192",type:"image/png"}]}]}}
