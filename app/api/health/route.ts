import { NextResponse } from "next/server"; import { config } from "@/lib/config";
export const dynamic="force-dynamic";
export function GET(){return NextResponse.json({status:"ok",application:"veltrixae-frontend",network:config.network,integrations:{aggregator:Boolean(config.apiUrl),stellarRpc:Boolean(config.rpcUrl),horizon:Boolean(config.horizonUrl)},timestamp:new Date().toISOString()},{headers:{"cache-control":"no-store"}})}
