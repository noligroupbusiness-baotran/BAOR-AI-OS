export function formatNumber(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n);
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
}

export const TIME_ZONE = "Asia/Ho_Chi_Minh";

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(
    new Date(iso),
  );
}

export function percent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// Khóa ngày theo múi giờ VN (YYYY-MM-DD) để gom bài theo ngày trên lịch.
export function dateKey(d: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof d === "string" ? new Date(d) : d);
}
