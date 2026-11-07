export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

/** Generic foreground notification; the service worker receives no customer content or identifiers. */
export async function showForegroundProductNotification(category: string, href: string, dedupeKey: string, isCurrent: () => boolean = () => true) {
  if (typeof window === "undefined" || !("Notification" in window) || !navigator.serviceWorker || Notification.permission !== "granted" || !isCurrent()) return false;
  const target = new URL(href, window.location.origin);
  if (target.origin !== window.location.origin) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    if (!isCurrent() || Notification.permission !== "granted") return false;
    await registration.showNotification("Paperclip update", {
      body: category === "decisions" ? "A decision needs your attention." : category === "reviews" ? "A review is waiting for you." : "An assigned task was updated.",
      tag: `paperclip-${dedupeKey}`,
      data: { url: `${target.pathname}${target.search}` },
    });
    return true;
  } catch {
    return false;
  }
}

export async function clearForegroundProductNotifications() {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications();
    for (const notification of notifications) if (notification.tag.startsWith("paperclip-")) notification.close();
  } catch { /* Notifications are an optional browser capability. */ }
}
