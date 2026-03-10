import { Redirect, useLocalSearchParams } from "expo-router";

export default function VoteFlowRedirect() {
  const params = useLocalSearchParams<{ cardId?: string }>();

  if (params.cardId) {
    return <Redirect href={{ pathname: "/(tabs)", params: { cardId: params.cardId } }} />;
  }

  return <Redirect href="/(tabs)" />;
}
