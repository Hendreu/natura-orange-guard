export function displayQidTitle(title: string | null | undefined): string {
  return title?.trim() || "Sem título";
}
