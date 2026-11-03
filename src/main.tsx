import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { AvisoProvider } from "./components/ui";
import "./styles.css";

registerSW({ immediate: true });
// Android/Chrome: guarda o convite de instalação para o botão "Instalar app" do guia.
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); (window as unknown as { __instalar?: Event }).__instalar = e; });
// Pede ao navegador para não apagar os dados sozinho (Safari/Chrome respeitam em apps instalados).
navigator.storage?.persist?.().catch(() => undefined);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AvisoProvider>
      <App />
    </AvisoProvider>
  </StrictMode>,
);
