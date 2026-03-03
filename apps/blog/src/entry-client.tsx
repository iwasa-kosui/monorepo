import { hydrateRoot, createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./index.css";

const root = document.getElementById("root")!;
const app = (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

if (root.childElementCount > 0) {
  hydrateRoot(root, app);
} else {
  createRoot(root).render(app);
}
