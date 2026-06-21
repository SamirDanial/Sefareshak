import { useLocalSearchParams } from "expo-router";

import { PosSellingExperience } from "@/components/pos/PosSellingExperience";

export default function PosDineInScreen() {
  const params = useLocalSearchParams<{ tableId?: string | string[] }>();
  const raw = params.tableId;
  const initialTableId = Array.isArray(raw) ? raw[0] : raw;

  return <PosSellingExperience variant="dine_in" initialTableId={initialTableId} />;
}
