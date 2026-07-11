export function getDriverDeviceId() {
  if (typeof window === "undefined") return "";
  const key = "zoomeats_driver_device_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `dev_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    localStorage.setItem(key, id);
  }
  return id;
}
