import cyclingBackground from "@/docs/volt-cycling/assets/cycling-background-v1.png";
import { CyclingClient } from "./cycling-client";

export default async function CyclingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const rawDate = Array.isArray(query.date) ? query.date[0] : query.date;
  const initialDate = typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  return <CyclingClient initialDate={initialDate} backgroundSrc={cyclingBackground.src} />;
}
