import { api } from "~/trpc/react";

export function useNavigationPreferences() {
  const { data: preferences, isLoading } =
    api.navigationPreference.getPreferences.useQuery(undefined, {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    });

  const isSectionVisible = (section: string): boolean => {
    if (!preferences) return true; // Default visible while loading
    return !preferences.hiddenSections.includes(section);
  };

  const isItemVisible = (item: string): boolean => {
    if (!preferences) return true;
    return !preferences.hiddenItems.includes(item);
  };

  return {
    preferences,
    isLoading,
    isSectionVisible,
    isItemVisible,
  };
}
