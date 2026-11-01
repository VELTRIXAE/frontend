import type { MetadataRoute } from "next";
const routes=["","/app","/app/swap","/app/liquidity","/app/pools","/app/markets","/app/portfolio","/app/transactions","/app/analytics","/app/settings"];
export default function sitemap():MetadataRoute.Sitemap{const base=process.env.NEXT_PUBLIC_APP_URL??"http://localhost:3000";return routes.map((route,index)=>({url:`${base}${route}`,lastModified:new Date(),changeFrequency:index===0?"weekly":"daily",priority:index===0?1:.8}))}
