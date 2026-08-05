"use client";
import { use } from "react";
import { SwimPlanScreen } from "../../components/swim-plan-screen";

export default function SwimPlanByProgramPage({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = use(params);
  return <SwimPlanScreen programId={programId} />;
}
