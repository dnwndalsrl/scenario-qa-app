import { useApiLoading } from "~/composables/useApiLoading";

export default defineNuxtPlugin(() => {
  const { pendingCount } = useApiLoading();
  const trackedRequests = new WeakSet<object>();

  function start(options: object) {
    if (!import.meta.client || trackedRequests.has(options)) return;
    trackedRequests.add(options);
    pendingCount.value += 1;
  }

  function finish(options: object) {
    if (!import.meta.client || !trackedRequests.delete(options)) return;
    pendingCount.value = Math.max(0, pendingCount.value - 1);
  }

  const api = $fetch.create({
    onRequest({ options }) { start(options); },
    onRequestError({ options }) { finish(options); },
    onResponse({ options }) { finish(options); },
    onResponseError({ options }) { finish(options); }
  });

  return { provide: { api } };
});
