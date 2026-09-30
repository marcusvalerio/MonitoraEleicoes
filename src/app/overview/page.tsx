import type { Metadata } from "next";
import { OverviewPage } from "./OverviewPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Overview" };

export default function Page() {
  return <OverviewPage />;
}
