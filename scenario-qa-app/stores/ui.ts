import { defineStore } from "pinia";

export const useUiStore = defineStore("ui", () => {
  const sidebarOpen = ref(false);
  const currentProject = shallowRef<ProjectSummary | null>(null);
  const currentRunId = ref<string | null>(null);

  function toggleSidebar(): void {
    sidebarOpen.value = !sidebarOpen.value;
  }

  function closeSidebar(): void {
    sidebarOpen.value = false;
  }

  return {
    sidebarOpen,
    currentProject,
    currentRunId,
    toggleSidebar,
    closeSidebar
  };
});
