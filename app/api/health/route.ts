import { NextResponse } from "next/server"; import { config } from "@/lib/config";
export const dynamic="force-dynamic";
export function GET(){return NextResponse.json({status:"ok",application:"veltrixae-frontend",network:config.network,integrations:{aggregator:Boolean(config.apiUrl),swapContract:Boolean(config.swapContractId),factoryContract:Boolean(config.factoryContractId)},timestamp:new Date().toISOString()},{headers:{"cache-control":"no-store"}})}
