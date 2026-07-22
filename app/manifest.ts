import type { MetadataRoute } from "next";
export default function manifest():MetadataRoute.Manifest{return{name:"VOLT — персональный фитнес-трекер",short_name:"VOLT",description:"Тренировки, активность и прогресс",start_url:"/",display:"standalone",background_color:"#080a0b",theme_color:"#c6ff1a",lang:"ru",icons:[
{src:"/favicon.svg",sizes:"any",type:"image/svg+xml",purpose:"any"},
{src:"/icon-192.png",sizes:"192x192",type:"image/png",purpose:"any"},
{src:"/icon-512.png",sizes:"512x512",type:"image/png",purpose:"any"},
{src:"/icon-maskable-192.png",sizes:"192x192",type:"image/png",purpose:"maskable"},
{src:"/icon-maskable-512.png",sizes:"512x512",type:"image/png",purpose:"maskable"}
],shortcuts:[{name:"VOLT Сегодня",short_name:"Сегодня",description:"Тренировка, активность и самочувствие на сегодня",url:"/widget",icons:[{src:"/icon-192.png",sizes:"192x192",type:"image/png"}]}]}}
