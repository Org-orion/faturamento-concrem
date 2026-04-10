import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { logEvolutionConfig } from "@/lib/evolutionApi";

logEvolutionConfig();

createRoot(document.getElementById("root")!).render(<App />);
