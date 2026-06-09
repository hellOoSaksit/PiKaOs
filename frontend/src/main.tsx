import React from "react";
import ReactDOM from "react-dom/client";
import { SitemapAudit } from "./SitemapAudit";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="app-shell">
      <SitemapAudit lang="th" actor="ผู้ใช้" />
    </div>
  </React.StrictMode>
);
