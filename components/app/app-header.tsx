import { Bell } from "lucide-react"; import { WalletButton } from "@/components/wallet/wallet-button";
export function AppHeader() { return <header className="app-header"><div><span className="eyebrow">Trading workspace</span><b>Stellar Testnet</b></div><div className="app-header-actions"><button aria-label="Notifications"><Bell size={18}/></button><WalletButton/></div></header>; }
