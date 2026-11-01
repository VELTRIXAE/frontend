import { describe,expect,it } from "vitest"; import { shortenAddress } from "@/lib/stellar/wallet";
describe("wallet helpers",()=>{it("shortens public addresses without changing endpoints",()=>{expect(shortenAddress("GABCDEFGHIJKLMNOPQRSTUVWXYZ123456789",5)).toBe("GABCD…56789")})});
