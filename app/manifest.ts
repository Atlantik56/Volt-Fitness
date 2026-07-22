import type { MetadataRoute } from "next";
export default function manifest():MetadataRoute.Manifest{return{name:"VOLT — персональный фитнес-трекер",short_name:"VOLT",description:"Тренировки, активность и прогресс",start_url:"/",display:"standalone",background_color:"#080a0b",theme_color:"#c6ff1a",lang:"ru",icons:[{src:"/favicon.svg",sizes:"any",type:"image/svg+xml",purpose:"maskable"}]}}
