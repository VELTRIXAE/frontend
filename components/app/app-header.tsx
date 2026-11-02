import { WalletButton } from "@/components/wallet/wallet-button"; import { CommandPalette } from "./command-palette";
export function AppHeader() { return <header className="app-header"><div><span className="eyebrow">Trading workspace</span><b>Stellar Testnet</b></div><CommandPalette/><div className="app-header-actions"><WalletButton/></div></header>; }
