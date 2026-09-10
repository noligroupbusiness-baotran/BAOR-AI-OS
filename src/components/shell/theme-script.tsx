// Đặt data-theme trước khi vẽ để không nháy màu khi tải trang.
export function ThemeScript() {
  const code = `(function(){try{var t=localStorage.getItem("baor.theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
