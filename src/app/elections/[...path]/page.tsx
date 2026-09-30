import type { Metadata } from "next";
import { ElectionsExplorer } from "../Explorer";
export const metadata: Metadata = { title: "Eleições" };
/** Cobre /elections/[year], /[year]/[state], /[year]/[state]/[municipality]… */
export default async function Page({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return <ElectionsExplorer path={path.slice(0, 7)} />;
}
