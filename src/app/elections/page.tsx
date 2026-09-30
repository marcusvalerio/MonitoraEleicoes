import type { Metadata } from "next";
import { ElectionsExplorer } from "./Explorer";
export const metadata: Metadata = { title: "Eleições" };
export default function Page() {
  return <ElectionsExplorer path={[]} />;
}
