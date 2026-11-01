import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { FAQ, Features, HowItWorks, NetworkSection, Security } from "@/components/landing/sections";
import { Footer } from "@/components/landing/footer";
import "./landing.css";
export default function Home() { return <><Header/><Hero/><Features/><NetworkSection/><Security/><HowItWorks/><FAQ/><Footer/></>; }
