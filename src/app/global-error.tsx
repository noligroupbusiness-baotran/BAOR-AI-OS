"use client";

// Lỗi ở tầng root layout (hiếm): phải tự render html/body vì layout không còn. Không dùng token CSS.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#121713", color: "#e8ebe8", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 420, padding: 24, borderRadius: 12, border: "1px solid #283029", background: "#1a1f1b", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Hệ thống gặp lỗi</div>
          <p style={{ fontSize: 13, color: "#aab2ab", margin: "8px 0 16px" }}>
            {error.message || "Đã xảy ra lỗi không mong muốn."}
            {error.digest ? ` Mã lỗi: ${error.digest}.` : ""} Thử tải lại; nếu vẫn lỗi hãy xem log máy chủ.
          </p>
          <button onClick={reset} style={{ height: 34, padding: "0 18px", borderRadius: 999, border: 0, background: "#1e7a4b", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
            Thử lại
          </button>
        </div>
      </body>
    </html>
  );
}
