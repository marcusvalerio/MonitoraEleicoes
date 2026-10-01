import type { Metadata } from "next";
import { HomeDashboard } from "./HomeDashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Visão geral" };

export default function Home() {
  return <HomeDashboard />;
}
