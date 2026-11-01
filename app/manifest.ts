import type { MetadataRoute } from "next";
export default function manifest():MetadataRoute.Manifest{return {name:"VELTRIXAE",short_name:"VELTRIXAE",description:"Decentralized trading on Stellar.",start_url:"/app",display:"standalone",background_color:"#080713",theme_color:"#845AE8",icons:[{src:"/icon.svg",sizes:"any",type:"image/svg+xml"}]}}
